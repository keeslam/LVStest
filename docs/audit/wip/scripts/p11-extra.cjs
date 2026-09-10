// Phase 11 (cont.): clean-transport checks (change original vehicle, same-vehicle guard, status machine,
// completedDate, cancel leaves spare), TBD transport completed, PDF/document paths with TBD/placeholder data,
// history inventory.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.11.1.11');
  const T = L.today();
  const auditStart = await L.maxId('audit_logs');
  const trState = async (id, label) => {
    const t = await L.trRow(id);
    const sp = t?.spare_reservation_id ? await L.resRow(t.spare_reservation_id) : null;
    console.log(`  [${label}] transport`, t ? { id: t.id, v: t.vehicle_id, rel: t.related_vehicle_id, spareReq: t.spare_required, spareRes: t.spare_reservation_id, status: t.status, bd: t.is_breakdown_or_maintenance, date: t.scheduled_date, completed: t.completed_date } : null);
    if (sp) console.log('  spare reservation', { id: sp.id, v: sp.vehicle_id, cust: sp.customer_id, status: sp.status, ph: sp.placeholder_spare, start: sp.start_date, end: sp.end_date, forRes: sp.replacement_for_reservation_id, forTr: sp.replacement_for_transport_id, notes: sp.notes, del: sp.deleted_at });
    return { t, sp };
  };
  const veh = async (id) => { const v = await L.vehRow(id); return `${v.license_plate} avail=${v.availability_status} maint=${v.maintenance_status} note=${v.maintenance_note}`; };
  const D7 = L.addDays(T, 7), D9 = L.addDays(T, 9);

  // ---- X1 clean transport: change original vehicle ----
  let tx1;
  await L.step('X1 clean planned swap transport vE + spare vC (' + D7 + '), then change ORIGINAL vehicle vE -> vK', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vE, transportType: 'swap', scheduledDate: D7, spareRequired: true, relatedVehicleId: ids.vC, isBreakdownOrMaintenance: true, reason: 'AUDIT-P11 X1' });
    console.log('create ->', r.status, r.json?.id || r.text.slice(0, 200));
    tx1 = r.json.id; ids.trX1 = tx1; L.saveIds(ids);
    await trState(tx1, 'created');
    console.log('  vE', await veh(ids.vE)); console.log('  vC', await veh(ids.vC)); console.log('  vK', await veh(ids.vK));
    const mv = await st.patch(`/api/transports/${tx1}`, { scheduledDate: D9 });
    console.log('PATCH scheduledDate ->', mv.status);
    await trState(tx1, 'after date move');
    const ch = await st.patch(`/api/transports/${tx1}`, { vehicleId: ids.vK });
    console.log('PATCH vehicleId vE->vK ->', ch.status, ch.text.slice(0, 120));
    await trState(tx1, 'after original change');
    console.log('  vE', await veh(ids.vE)); console.log('  vK', await veh(ids.vK));
    const api = await st.get(`/api/transports/${tx1}`);
    console.log('  GET api vehicle/related/spareRes.notes:', api.json?.vehicle?.licensePlate, api.json?.relatedVehicle?.licensePlate, api.json?.spareReservation?.notes);
  });

  // ---- X2 same-vehicle guard on PATCH vehicleId ----
  await L.step('X2 PATCH vehicleId = relatedVehicleId (vC) on the clean transport; then try to repair', async () => {
    const r = await st.patch(`/api/transports/${tx1}`, { vehicleId: ids.vC });
    console.log('PATCH vehicleId=vC (== related) ->', r.status, r.text.slice(0, 100));
    await trState(tx1, 'after');
    const fix1 = await st.patch(`/api/transports/${tx1}`, { vehicleId: ids.vE });
    console.log('repair via vehicleId=vE ->', fix1.status, (fix1.json?.message || '').slice(0, 80));
    const fix2 = await st.patch(`/api/transports/${tx1}`, { vehicleId: ids.vE, relatedVehicleId: ids.vB });
    console.log('repair via vehicleId=vE + relatedVehicleId=vB in one call ->', fix2.status, (fix2.json?.message || '').slice(0, 80));
    await trState(tx1, 'after repair attempts');
    const fix3 = await st.patch(`/api/transports/${tx1}`, { relatedVehicleId: ids.vB });
    console.log('repair via relatedVehicleId=vB only ->', fix3.status, (fix3.json?.message || '').slice(0, 80));
    const fix4 = await st.patch(`/api/transports/${tx1}`, { vehicleId: ids.vE });
    console.log('then vehicleId=vE ->', fix4.status);
    await trState(tx1, 'final');
    console.log('  vB', await veh(ids.vB)); console.log('  vC', await veh(ids.vC));
  });

  // ---- X3 status machine / completedDate / cancel leaves spare ----
  await L.step('X3 status transitions on the clean transport (no completedDate in body), cancel -> spare state', async () => {
    for (const s of ['completed', 'bogus', 'scheduled']) {
      const p = await st.patch(`/api/transports/${tx1}`, { status: s });
      console.log(`  status=${s} ->`, p.status, p.json?.status, 'completedDate', p.json?.completedDate);
    }
    const c = await st.patch(`/api/transports/${tx1}`, { status: 'cancelled' });
    console.log('  status=cancelled ->', c.status);
    const { sp } = await trState(tx1, 'after cancel');
    console.log('  spare vehicle', sp ? await veh(sp.vehicle_id) : null);
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    const range = await st.get(`/api/reservations/range?startDate=${D9}&endDate=${D9}`);
    console.log('  calendar range lists spare of cancelled transport:', (range.json || []).filter(x => x.id === sp?.id).map(x => x.status));
    const other = await st.post('/api/transports', { vehicleId: ids.vK, transportType: 'swap', scheduledDate: D9, spareRequired: true, relatedVehicleId: sp.vehicle_id, reason: 'AUDIT-P11 X3 wants same spare' });
    console.log('  another transport wants that spare on that day ->', other.status, (other.json?.message || '').slice(0, 80));
    if (other.json?.id) await st.del(`/api/transports/${other.json.id}`);
    const del = await st.del(`/api/transports/${tx1}`);
    console.log('  DELETE cancelled transport ->', del.status);
    const after = await L.resRow(sp.id);
    console.log('  spare reservation after delete', { id: after.id, status: after.status, del: after.deleted_at, forTr: after.replacement_for_transport_id });
    console.log('  spare vehicle', await veh(sp.vehicle_id));
    console.log('  vE', await veh(ids.vE));
  });

  // ---- X4 TBD transport completed ----
  await L.step('X4 TBD transport (spareRequired, no vehicle) completed via client-like PATCH -> placeholder fate', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vF, transportType: 'swap', scheduledDate: T, spareRequired: true, relatedVehicleId: null, isBreakdownOrMaintenance: true, reason: 'AUDIT-P11 X4 TBD' });
    const id = r.json?.id; ids.trX4 = id; L.saveIds(ids);
    console.log('create ->', r.status, id);
    const { sp } = await trState(id, 'created');
    console.log('  custom notif', await L.customNotifs(`%[placeholder:${sp.id}]%`));
    const rep = await st.post('/api/delivery/transports/generate-report', { transportIds: [id] });
    console.log('  generate-report TBD ->', rep.status);
    const c = await st.patch(`/api/transports/${id}`, { status: 'completed', completedDate: T });
    console.log('  complete ->', c.status, 'completedDate', c.json?.completedDate);
    await trState(id, 'after complete');
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=1');
    console.log('  needing-assignment still lists placeholder of COMPLETED transport:', (need.json || []).filter(x => x.id === sp.id).map(x => ({ id: x.id, tr: x.replacementForTransportId })));
    console.log('  custom notif still there', (await L.customNotifs(`%[placeholder:${sp.id}]%`)).map(n => n.id));
    console.log('  vF', await veh(ids.vF));
    const asg = await st.post(`/api/placeholder-reservations/${sp.id}/assign-vehicle`, { vehicleId: ids.vB });
    console.log('  assign vehicle to placeholder of completed transport ->', asg.status, asg.text.slice(0, 80));
    await trState(id, 'after assign on completed');
    console.log('  vB', await veh(ids.vB));
  });

  // ---- X5 PDF / document paths ----
  await L.step('X5 PDF/document endpoints with TBD placeholder / maintenance block / picked-up spare', async () => {
    const targets = [
      ['TBD placeholder (rental cancelled) 3357', 3357],
      ['TBD placeholder (transport, no customer) 3382', 3382],
      ['maintenance block 3343', ids.blockId],
      ['picked-up spare 3379 (transport deleted)', 3379],
      ['booked spare 3380 (transport 46)', 3380],
    ];
    for (const [label, rid] of targets) {
      for (const path of [`/api/contracts/generate/${rid}`, `/api/contracts/generate-default/${rid}`, `/api/contracts/data/${rid}`]) {
        const r = await st.get(path);
        const ct = r.headers.get('content-type');
        const isPdf = r.text.startsWith('%PDF');
        console.log(`  ${label} GET ${path} ->`, r.status, ct, isPdf ? `PDF ${r.text.length}B` : r.text.slice(0, 140).replace(/\s+/g, ' '));
      }
      const v = await st.post(`/api/contracts/generate-versioned/${rid}`, {});
      console.log(`  ${label} POST generate-versioned ->`, v.status, (v.text || '').slice(0, 140).replace(/\s+/g, ' '));
    }
    // transport report paths
    for (const [label, body] of [
      ['transport 46 (in_progress, booked spare)', { transportIds: [46] }],
      ['transport 48 (TBD after vehicle delete/restore)', { transportIds: [48] }],
      ['transport 46 + 48 mixed', { transportIds: [46, 48] }],
      ['transport 46 bogus template', { transportIds: [46], templateId: 999999 }],
      ['transport 43 (completed, no spare)', { transportIds: [43] }],
    ]) {
      const r = await st.post('/api/delivery/transports/generate-report', body);
      console.log(`  generate-report ${label} ->`, r.status, (r.json?.fileName || r.json?.message || r.text.slice(0, 100)));
      if (r.json?.id) {
        const d = await st.get(`/api/documents/${r.json.id}/download`);
        console.log(`    download doc ${r.json.id} ->`, d.status, d.headers.get('content-type'), d.text.startsWith('%PDF') ? `PDF ${d.text.length}B` : d.text.slice(0, 80));
      }
    }
  });

  // ---- X6 history inventory ----
  await L.step('X6 history: audit_logs written by this script + which actions exist for spare pickup/status', async () => {
    const rows = await L.auditLogs(auditStart);
    const counts = {};
    for (const a of rows) { const k = `${a.action}`; counts[k] = (counts[k] || 0) + 1; }
    console.log(counts);
    const p = await st.post(`/api/reservations/3380/pickup`, { contractNumber: '911400', pickupMileage: 100, fuelLevelPickup: 'full', pickupDate: T });
    console.log('pickup spare 3380 ->', p.status, p.text.slice(0, 80));
    const s = await st.patch(`/api/reservations/3380/spare-status`, { spareVehicleStatus: 'picked_up' });
    console.log('spare-status 3380 ->', s.status, s.text.slice(0, 80));
    const st2 = await st.patch(`/api/reservations/3380/status`, { status: 'returned' });
    console.log('status 3380 -> returned', st2.status, st2.text.slice(0, 80));
    console.log('audit rows for 3380 since:', (await L.auditLogs(auditStart)).filter(a => String(a.resource_id) === '3380').map(a => a.action));
    console.log('transport 46 api after spare returned:', (await st.get('/api/transports/46')).json?.spareReservation?.status);
  });
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

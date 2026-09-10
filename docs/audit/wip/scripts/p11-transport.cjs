// Phase 11 gaps 2-6: transports (normal/planned), status transitions, change/remove/cancel spare,
// change original vehicle, pickup status, missing vehicle (recycle bin), history.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.11.1.7');
  const T = L.today();
  const auditStart = await L.maxId('audit_logs');
  const trState = async (id, label) => {
    const t = await L.trRow(id);
    const sp = t?.spare_reservation_id ? await L.resRow(t.spare_reservation_id) : null;
    console.log(`  [${label}] transport`, t ? { id: t.id, v: t.vehicle_id, rel: t.related_vehicle_id, spareReq: t.spare_required, spareRes: t.spare_reservation_id, status: t.status, bd: t.is_breakdown_or_maintenance, date: t.scheduled_date } : null);
    if (sp) console.log('  spare reservation', { id: sp.id, v: sp.vehicle_id, status: sp.status, ph: sp.placeholder_spare, start: sp.start_date, end: sp.end_date, forRes: sp.replacement_for_reservation_id, forTr: sp.replacement_for_transport_id, del: sp.deleted_at });
    return { t, sp };
  };
  const api = async (id) => { const r = await st.get(`/api/transports/${id}`); return r.json ? { status: r.status, spareStatus: r.json.spareReservation?.status, rel: r.json.relatedVehicle?.licensePlate, veh: r.json.vehicle?.licensePlate } : { status: r.status, text: r.text.slice(0, 100) }; };

  // ---- T1 normal transport + status transitions ----
  await L.step('T1 normal transport (tow, vE, no spare) + status transitions', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vE, transportType: 'tow', scheduledDate: T, originCity: 'AUDIT-P11 A', destinationCity: 'AUDIT-P11 B', reason: 'AUDIT-P11 normal' });
    console.log('create ->', r.status, r.json?.id, r.json?.status);
    const id = r.json.id; ids.trNormal = id;
    for (const s of ['in_progress', 'completed', 'scheduled', 'garbage_status', 'cancelled', 'completed']) {
      const p = await st.patch(`/api/transports/${id}`, { status: s });
      console.log(`  -> ${s}:`, p.status, (p.json?.status ?? p.text.slice(0, 80)), 'completedDate', p.json?.completedDate);
    }
    console.log('vE', await L.vehRow(ids.vE));
  });

  // ---- T2 planned transport with spare + breakdown ----
  let trP;
  const D = L.addDays(T, 10);
  await L.step('T2 planned swap transport (' + D + ') vG (rentalG picked up) spare vF, isBreakdownOrMaintenance', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vG, transportType: 'swap', scheduledDate: D, spareRequired: true, relatedVehicleId: ids.vF, isBreakdownOrMaintenance: true, reason: 'AUDIT-P11 planned' });
    console.log('create ->', r.status, r.json?.id || r.text.slice(0, 200));
    trP = r.json.id; ids.trPlanned = trP;
    await trState(trP, 'after create');
    console.log('  vG', await L.vehRow(ids.vG), '\n  vF', await L.vehRow(ids.vF));
    console.log('  GET api', await api(trP));
    const rep = await st.post('/api/delivery/transports/generate-report', { transportIds: [trP] });
    console.log('  generate-report (assigned) ->', rep.status, rep.json?.id, rep.json?.fileName);
    ids.docPlanned = rep.json?.id;
    // same transport in list
    const list = await st.get('/api/transports');
    console.log('  list contains', list.status, (list.json || []).some(t => t.id === trP));
    // spare reservation dates vs. scheduledDate change
    const mv = await st.patch(`/api/transports/${trP}`, { scheduledDate: L.addDays(D, 3) });
    console.log('  move scheduledDate +3 ->', mv.status);
    await trState(trP, 'after date move');
  });

  // ---- T3 change spare ----
  await L.step('T3 change spare vF -> vH', async () => {
    const r = await st.patch(`/api/transports/${trP}`, { relatedVehicleId: ids.vH });
    console.log('->', r.status, r.text.slice(0, 120));
    await trState(trP, 'after change');
    console.log('  vF', await L.vehRow(ids.vF), '\n  vH', await L.vehRow(ids.vH));
    console.log('  replacement rows for rentalG', (await L.replacementsFor(ids.rentalG)).map(x => ({ id: x.id, v: x.vehicle_id, s: x.status, ph: x.placeholder_spare, del: x.deleted_at })));
  });

  // ---- T4 remove spare (back to TBD) ----
  await L.step('T4 remove spare (relatedVehicleId=null -> TBD)', async () => {
    const r = await st.patch(`/api/transports/${trP}`, { relatedVehicleId: null });
    console.log('->', r.status);
    const { sp } = await trState(trP, 'after TBD');
    console.log('  vH', await L.vehRow(ids.vH));
    const rep = await st.post('/api/delivery/transports/generate-report', { transportIds: [trP] });
    console.log('  generate-report (TBD) ->', rep.status, (rep.json?.message || '').slice(0, 80));
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    console.log('  needing-assignment has spare res:', (need.json || []).some(x => x.id === sp?.id));
    // assign from the placeholder widget side
    const asg = await st.post(`/api/placeholder-reservations/${sp.id}/assign-vehicle`, { vehicleId: ids.vH });
    console.log('  assign-vehicle from placeholder widget ->', asg.status, asg.text.slice(0, 100));
    await trState(trP, 'after widget assign');
    console.log('  GET api', await api(trP));
  });

  // ---- T5 cancel spare (spareRequired=false) ----
  await L.step('T5 cancel spare (spareRequired=false) then re-enable', async () => {
    const before = (await L.trRow(trP)).spare_reservation_id;
    const r = await st.patch(`/api/transports/${trP}`, { spareRequired: false });
    console.log('->', r.status);
    await trState(trP, 'after spare off');
    const old = await L.resRow(before);
    console.log('  old spare reservation', { id: old.id, v: old.vehicle_id, status: old.status, ph: old.placeholder_spare, del: old.deleted_at, forTr: old.replacement_for_transport_id });
    console.log('  vH', await L.vehRow(ids.vH));
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    console.log('  needing-assignment lists cancelled spare:', (need.json || []).some(x => x.id === before));
    const range = await st.get(`/api/reservations/range?startDate=${L.addDays(D, 3)}&endDate=${L.addDays(D, 3)}`);
    console.log('  /api/reservations/range lists cancelled spare:', (range.json || []).filter(x => x.id === before).map(x => x.status));
    // remove-with-TBD variant: set TBD then spareRequired=false
    const r2 = await st.patch(`/api/transports/${trP}`, { spareRequired: true, relatedVehicleId: null });
    console.log('  re-enable as TBD ->', r2.status);
    const { sp } = await trState(trP, 'after re-enable TBD');
    const r3 = await st.patch(`/api/transports/${trP}`, { spareRequired: false });
    console.log('  spare off while TBD ->', r3.status);
    const cancelledTbd = await L.resRow(sp.id);
    console.log('  cancelled TBD row', { id: cancelledTbd.id, status: cancelledTbd.status, ph: cancelledTbd.placeholder_spare, v: cancelledTbd.vehicle_id, del: cancelledTbd.deleted_at });
    const need2 = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    console.log('  needing-assignment lists cancelled TBD:', (need2.json || []).filter(x => x.id === sp.id).map(x => x.status));
    const asg = await st.post(`/api/placeholder-reservations/${sp.id}/assign-vehicle`, { vehicleId: ids.vJ });
    console.log('  assign-vehicle on cancelled TBD ->', asg.status, asg.text.slice(0, 120));
    await trState(trP, 'after assigning cancelled TBD');
    console.log('  vJ', await L.vehRow(ids.vJ));
    console.log('  all replacement rows for transport', await L.q('select id, vehicle_id, status, placeholder_spare, deleted_at from reservations where replacement_for_transport_id=$1 order by id', [trP]));
    // re-enable with vehicle
    const r4 = await st.patch(`/api/transports/${trP}`, { spareRequired: true, relatedVehicleId: ids.vH });
    console.log('  re-enable with vH ->', r4.status, r4.text.slice(0, 100));
    await trState(trP, 'after re-enable vH');
    console.log('  all replacement rows for transport', await L.q('select id, vehicle_id, status, placeholder_spare, deleted_at from reservations where replacement_for_transport_id=$1 order by id', [trP]));
  });

  // ---- T6 same-vehicle guard via vehicleId change ----
  await L.step('T6 same-vehicle guard: PATCH vehicleId = current relatedVehicleId (vH)', async () => {
    const r = await st.patch(`/api/transports/${trP}`, { vehicleId: ids.vH });
    console.log('->', r.status, r.text.slice(0, 120));
    await trState(trP, 'after');
    if (r.status === 200) { const b = await st.patch(`/api/transports/${trP}`, { vehicleId: ids.vG }); console.log('  revert ->', b.status); }
    const r2 = await st.post('/api/transports', { vehicleId: ids.vE, transportType: 'swap', scheduledDate: L.addDays(T, 20), spareRequired: true, relatedVehicleId: ids.vE, reason: 'AUDIT-P11 same' });
    console.log('  create with related==vehicle ->', r2.status, r2.text.slice(0, 100));
    if (r2.json?.id) { await st.del(`/api/transports/${r2.json.id}`); }
  });

  // ---- T7 change original vehicle ----
  await L.step('T7 change original vehicle vG -> vK on breakdown transport with assigned spare', async () => {
    console.log('  before vG', await L.vehRow(ids.vG), '\n  vK', await L.vehRow(ids.vK));
    const r = await st.patch(`/api/transports/${trP}`, { vehicleId: ids.vK });
    console.log('->', r.status, r.text.slice(0, 120));
    await trState(trP, 'after');
    console.log('  after vG', await L.vehRow(ids.vG), '\n  vK', await L.vehRow(ids.vK));
    console.log('  GET api', await api(trP));
    const b = await st.patch(`/api/transports/${trP}`, { vehicleId: ids.vG });
    console.log('  revert ->', b.status);
    console.log('  vG', await L.vehRow(ids.vG), '\n  vK', await L.vehRow(ids.vK));
  });

  // ---- T8 pickup status ----
  await L.step('T8 pickup the spare reservation, try to change/remove, complete, return', async () => {
    const { sp } = await trState(trP, 'before pickup');
    const p = await st.post(`/api/reservations/${sp.id}/pickup`, { contractNumber: '911200', pickupMileage: 500, fuelLevelPickup: 'full', pickupDate: T });
    console.log('pickup ->', p.status, p.text.slice(0, 120));
    console.log('  GET api', await api(trP));
    console.log('  vH', await L.vehRow(ids.vH));
    for (const body of [{ relatedVehicleId: ids.vF }, { spareRequired: false }, { relatedVehicleId: null }]) {
      const r = await st.patch(`/api/transports/${trP}`, body);
      console.log('  PATCH', JSON.stringify(body), '->', r.status, (r.json?.message || '').slice(0, 90));
    }
    const del = await st.del(`/api/transports/${trP}`);
    console.log('  DELETE transport with picked_up spare ->', del.status);
    const spAfter = await L.resRow(sp.id);
    console.log('  spare reservation after transport delete', { id: spAfter.id, status: spAfter.status, forTr: spAfter.replacement_for_transport_id, forRes: spAfter.replacement_for_reservation_id, del: spAfter.deleted_at });
    console.log('  vG after delete', await L.vehRow(ids.vG));
    console.log('  transport row', await L.trRow(trP));
    ids.spPlanned = sp.id; L.saveIds(ids);
  });

  // ---- T9 cancel transport with booked spare; complete → reopen ----
  await L.step('T9 cancel a transport with an assigned (booked) spare; complete -> reopen', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vE, transportType: 'swap', scheduledDate: L.addDays(T, 5), spareRequired: true, relatedVehicleId: ids.vJ, isBreakdownOrMaintenance: true, reason: 'AUDIT-P11 cancel' });
    const id = r.json?.id; ids.trCancel = id;
    console.log('create ->', r.status, id);
    await trState(id, 'created');
    console.log('  vE', await L.vehRow(ids.vE));
    const c = await st.patch(`/api/transports/${id}`, { status: 'cancelled' });
    console.log('cancel ->', c.status);
    const { sp } = await trState(id, 'after cancel');
    console.log('  vE', await L.vehRow(ids.vE), '\n  vJ', await L.vehRow(ids.vJ));
    const range = await st.get(`/api/reservations/range?startDate=${L.addDays(T, 5)}&endDate=${L.addDays(T, 5)}`);
    console.log('  calendar range still lists spare:', (range.json || []).filter(x => x.id === sp?.id).map(x => x.status));
    // another transport wants vJ the same day
    const r2 = await st.post('/api/transports', { vehicleId: ids.vK, transportType: 'swap', scheduledDate: L.addDays(T, 5), spareRequired: true, relatedVehicleId: ids.vJ, reason: 'AUDIT-P11 vJ again' });
    console.log('  second transport wants vJ same day ->', r2.status, r2.text.slice(0, 100));
    if (r2.json?.id) await st.del(`/api/transports/${r2.json.id}`);
    // reopen cancelled -> scheduled
    const ro = await st.patch(`/api/transports/${id}`, { status: 'scheduled' });
    console.log('reopen cancelled -> scheduled:', ro.status);
    await trState(id, 'after reopen');
    console.log('  vE', await L.vehRow(ids.vE));
    const done = await st.patch(`/api/transports/${id}`, { status: 'completed' });
    console.log('complete ->', done.status, 'completedDate', done.json?.completedDate);
    await trState(id, 'after complete');
    console.log('  vE', await L.vehRow(ids.vE), '\n  vJ', await L.vehRow(ids.vJ));
    const ro2 = await st.patch(`/api/transports/${id}`, { status: 'in_progress' });
    console.log('reopen completed -> in_progress:', ro2.status, 'completedDate', ro2.json?.completedDate);
    await trState(id, 'after reopen 2');
    console.log('  vE', await L.vehRow(ids.vE));
    L.saveIds(ids);
  });

  // ---- T11 missing vehicle ----
  await L.step('T11 missing vehicle: delete spare vehicle vD (recycle bin) while its spare reservation is picked_up; restore', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vI, transportType: 'swap', scheduledDate: T, spareRequired: true, relatedVehicleId: ids.vD, isBreakdownOrMaintenance: true, reason: 'AUDIT-P11 missing vehicle' });
    const id = r.json?.id; ids.trMissing = id;
    console.log('create ->', r.status, id, r.text.slice(0, 100));
    const { sp } = await trState(id, 'created');
    const p = await st.post(`/api/reservations/${sp.id}/pickup`, { contractNumber: '911300', pickupMileage: 700, fuelLevelPickup: 'half', pickupDate: T });
    console.log('pickup spare ->', p.status);
    console.log('  GET api', await api(id));
    const imp = await st.get(`/api/vehicles/${ids.vD}/delete-impact`);
    console.log('  delete-impact vD ->', imp.status, JSON.stringify(imp.json).slice(0, 200));
    const del = await st.del(`/api/vehicles/${ids.vD}`, { confirmLicensePlate: 'AU-11D-X' });
    console.log('  DELETE vehicle vD ->', del.status, del.text.slice(0, 120));
    await trState(id, 'after vD deleted');
    console.log('  spare reservation row exists?', await L.resRow(sp.id));
    console.log('  GET api', await api(id));
    const list = await st.get('/api/transports');
    console.log('  GET /api/transports ->', list.status, (list.json || []).find(t => t.id === id) ? 'row present' : 'missing');
    const rep = await st.post('/api/delivery/transports/generate-report', { transportIds: [id] });
    console.log('  generate-report ->', rep.status, (rep.json?.message || rep.json?.fileName || '').slice(0, 100));
    const comp = await st.patch(`/api/transports/${id}`, { status: 'completed' });
    console.log('  complete ->', comp.status);
    await trState(id, 'after complete');
    console.log('  vI', await L.vehRow(ids.vI));
    const recs = await st.get('/api/deleted-records');
    const rec = (recs.json || []).find(x => x.entityType === 'vehicle' && x.entityId === ids.vD);
    console.log('  recycle bin entry', rec && { id: rec.id, label: rec.label, counts: rec.relatedCounts });
    const rs = await st.post(`/api/deleted-records/${rec.id}/restore`);
    console.log('  restore vD ->', rs.status, rs.text.slice(0, 120));
    await trState(id, 'after restore');
    console.log('  spare reservation row after restore', await L.resRow(sp.id));
    console.log('  vD after restore', await L.vehRow(ids.vD));
    console.log('  GET api', await api(id));
    ids.spMissing = sp.id; L.saveIds(ids);
  });

  await L.step('T12 missing ORIGINAL vehicle: delete vI (transport original) then restore', async () => {
    const id = ids.trMissing;
    const r0 = await st.patch(`/api/transports/${id}`, { status: 'scheduled' });
    console.log('reopen ->', r0.status);
    const del = await st.del(`/api/vehicles/${ids.vI}`, { confirmLicensePlate: 'AU-11I-X' });
    console.log('DELETE vehicle vI ->', del.status, del.text.slice(0, 120));
    console.log('  transport row', await L.trRow(id));
    console.log('  spare reservation', await L.resRow(ids.spMissing));
    console.log('  GET api', await api(id));
    const recs = await st.get('/api/deleted-records');
    const rec = (recs.json || []).find(x => x.entityType === 'vehicle' && x.entityId === ids.vI);
    const rs = await st.post(`/api/deleted-records/${rec.id}/restore`);
    console.log('  restore vI ->', rs.status, rs.text.slice(0, 120));
    await trState(id, 'after restore');
    console.log('  spare reservation', await L.resRow(ids.spMissing));
    console.log('  GET api', await api(id));
    console.log('  rentalI (was soft-deleted before vehicle delete)', await L.resRow(ids.rentalI));
  });

  await L.step('T13 history: audit_logs entries written for the transport/spare actions above', async () => {
    const rows = await L.auditLogs(auditStart);
    const counts = {};
    for (const a of rows) { const k = `${a.action}:${a.entity_type || a.resource_type}`; counts[k] = (counts[k] || 0) + 1; }
    console.log(counts);
    console.log('transport-related:', rows.filter(a => /transport/i.test(JSON.stringify(a))).map(a => ({ id: a.id, action: a.action, eid: a.entity_id || a.resource_id })));
    console.log('portal_activity_log rows mentioning maintenance for cust 179:', await L.q("select action, entity, entity_id from portal_activity_log where customer_id=179 order by id desc limit 8"));
  });
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

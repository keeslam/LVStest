// Phase 11 gap 1 (cont. 2): 48h boundary with explicit block ids, vehicle maintenance-status route.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.11.1.9');
  const pt = await L.portal('10.11.1.10');
  const CUST = 179;
  const T = L.today();
  const notifStart = await L.maxId('portal_notifications');
  const newNotifs = async () => (await L.portalNotifs(CUST, notifStart)).map(n => `${n.id}:${n.type}:${n.dedupe_tag}`);
  Object.assign(ids, { blockG1: 3349, blockG2: 3350, blockG3: 3351 }); L.saveIds(ids);

  await L.step('Q1 48h boundary on staff-created blocks (vG)', async () => {
    console.log('now', new Date().toISOString());
    for (const bid of [ids.blockG1, ids.blockG2, ids.blockG3]) {
      const b = await L.resRow(bid);
      const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: bid, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 10)), reason: 'AUDIT-P11 boundary', needsReplacement: false } });
      console.log(`block ${bid} start ${b.start_date} status=${b.status} -> change request`, L.short(c));
      if (c.json?.id) { const rj = await st.post(`/api/portal-requests/${c.json.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 boundary test' }); console.log('  rejected', rj.status); }
    }
    // block at exactly +2 days but with startTime later in the day (>48h) — PATCH startTime on 3350 to 23:00
    const p = await st.patch(`/api/reservations/${ids.blockG2}`, { startTime: '23:00' });
    console.log('set startTime 23:00 on +2d block ->', p.status);
    const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: ids.blockG2, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 10)), reason: 'AUDIT-P11 boundary 23:00', needsReplacement: false } });
    console.log('+2d 23:00 -> change request', L.short(c));
    if (c.json?.id) await st.post(`/api/portal-requests/${c.json.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 boundary test' });
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('vehicles/mine vG maintenance:', JSON.stringify((mine.json || []).find(x => x.vehicle?.id === ids.vG)?.maintenance));
  });

  await L.step('Q3b PATCH /api/vehicles/:id/maintenance-status {status} on vA (has scheduled block 3343)', async () => {
    let r = await st.patch(`/api/vehicles/${ids.vA}/maintenance-status`, { status: 'in_service', note: 'AUDIT-P11 in service' });
    console.log('in_service ->', r.status, r.text.slice(0, 150));
    console.log('vA', await L.vehRow(ids.vA));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, del: b.deleted_at })));
    console.log('notifs', await newNotifs());
    r = await st.patch(`/api/vehicles/${ids.vA}/maintenance-status`, { status: 'ok' });
    console.log('ok ->', r.status);
    console.log('vA', await L.vehRow(ids.vA));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, del: b.deleted_at })));
    console.log('notifs', await newNotifs());
  });

  await L.step('Q7 change original vehicle of rental179 (has block 3343 on vA) to vC via PATCH /api/reservations/:id', async () => {
    const r = await st.patch(`/api/reservations/${ids.rental179}`, { vehicleId: ids.vC });
    console.log('PATCH vehicleId ->', r.status, r.text.slice(0, 300));
    console.log('rental179', (({ vehicle_id, status }) => ({ vehicle_id, status }))(await L.resRow(ids.rental179)));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, affected: b.affected_rental_id, del: b.deleted_at })));
    console.log('blocks vC', await L.blocksFor(ids.vC));
    console.log('vA', await L.vehRow(ids.vA), 'vC', await L.vehRow(ids.vC));
    console.log('notifs', await newNotifs());
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('vehicles/mine entries for vA/vC:', JSON.stringify((mine.json || []).filter(x => [ids.vA, ids.vC].includes(x.vehicle?.id)).map(x => ({ v: x.vehicle.licensePlate, m: x.maintenance }))));
    // customer tries maintenance_change on the block that is now on a vehicle they no longer have
    const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: ids.blockId, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 12)), reason: 'x', needsReplacement: false } });
    console.log('change request on block of old vehicle ->', L.short(c));
    if (c.json?.id) await st.post(`/api/portal-requests/${c.json.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 test' });
    // revert
    const back = await st.patch(`/api/reservations/${ids.rental179}`, { vehicleId: ids.vA });
    console.log('revert ->', back.status, 'rental179 vehicle', (await L.resRow(ids.rental179)).vehicle_id);
  });
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

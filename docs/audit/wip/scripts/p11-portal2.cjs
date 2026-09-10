// Phase 11 gap 1 (cont.): 48h boundary on staff-created blocks, block status transitions,
// original-vehicle maintenance status, block delete cascade, placeholder delete.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.11.1.5');
  const pt = await L.portal('10.11.1.6');
  const CUST = 179;
  const T = L.today();
  const notifStart = await L.maxId('portal_notifications');
  const newNotifs = async () => (await L.portalNotifs(CUST, notifStart)).map(n => `${n.id}:${n.type}:${n.dedupe_tag}`);

  await L.step('Q1 48h boundary on staff-created blocks 3349 (+1d) / 3350 (+2d) / 3351 (+3d) on vG', async () => {
    console.log('now', new Date().toISOString());
    for (const bid of [ids.blockG1, ids.blockG2, ids.blockG3]) {
      const b = await L.resRow(bid);
      const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: bid, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 10)), reason: 'AUDIT-P11 boundary', needsReplacement: false } });
      console.log(`block ${bid} start ${b.start_date} (${b.status}) -> change request`, L.short(c));
      if (c.json?.id) await st.post(`/api/portal-requests/${c.json.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 boundary test' });
    }
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('vehicles/mine vG maintenance:', JSON.stringify((mine.json || []).find(x => x.vehicle?.id === ids.vG)?.maintenance));
  });

  await L.step('Q2 block status transitions on block 3343 (vA): scheduled -> in -> out via PATCH /api/reservations/:id, customer notifications', async () => {
    const bid = ids.blockId;
    let r = await st.patch(`/api/reservations/${bid}`, { maintenanceStatus: 'in' });
    console.log('PATCH in ->', r.status, (r.json?.maintenanceStatus));
    console.log('vA after in', await L.vehRow(ids.vA), 'block', (({ status, maintenance_status }) => ({ status, maintenance_status }))(await L.resRow(bid)));
    console.log('notifs', await newNotifs());
    const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: bid, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 15)), reason: 'x', needsReplacement: false } });
    console.log('change request while in ->', L.short(c));
    r = await st.patch(`/api/reservations/${bid}`, { maintenanceStatus: 'in' });
    console.log('PATCH in again (idempotent) ->', r.status, 'notifs', await newNotifs());
    r = await st.patch(`/api/reservations/${bid}`, { maintenanceStatus: 'out' });
    console.log('PATCH out ->', r.status, (r.json?.maintenanceStatus));
    console.log('vA after out', await L.vehRow(ids.vA));
    console.log('replacements rental179 after out', (await L.replacementsFor(ids.rental179)).map(x => ({ id: x.id, v: x.vehicle_id, s: x.status, ph: x.placeholder_spare, del: x.deleted_at })));
    console.log('vB after out', await L.vehRow(ids.vB));
    console.log('notifs', await newNotifs());
    r = await st.patch(`/api/reservations/${bid}`, { maintenanceStatus: 'scheduled' });
    console.log('PATCH back to scheduled ->', r.status, 'notifs', await newNotifs());
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('vehicles/mine vA maintenance:', JSON.stringify((mine.json || []).find(x => x.vehicle?.id === ids.vA)?.maintenance));
  });

  await L.step('Q3 original vehicle maintenance status via PATCH /api/vehicles/:id/maintenance-status (vA)', async () => {
    let r = await st.patch(`/api/vehicles/${ids.vA}/maintenance-status`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT-P11 in service' });
    console.log('in_service ->', r.status, r.text.slice(0, 200));
    console.log('vA', await L.vehRow(ids.vA));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, del: b.deleted_at })));
    console.log('notifs', await newNotifs());
    r = await st.patch(`/api/vehicles/${ids.vA}/maintenance-status`, { maintenanceStatus: 'ok' });
    console.log('ok ->', r.status, r.text.slice(0, 200));
    console.log('vA', await L.vehRow(ids.vA));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, del: b.deleted_at })));
    console.log('notifs', await newNotifs());
  });

  await L.step('Q4 delete the duplicate block 3358 (vA) -> what happens to the spares 3344 (assigned vB) and 3348 (TBD)', async () => {
    console.log('before', (await L.replacementsFor(ids.rental179)).map(x => ({ id: x.id, v: x.vehicle_id, s: x.status, ph: x.placeholder_spare, del: x.deleted_at })));
    const r = await st.del(`/api/reservations/${ids.block2}`);
    console.log('DELETE block2 ->', r.status, r.text.slice(0, 200));
    console.log('after', (await L.replacementsFor(ids.rental179)).map(x => ({ id: x.id, v: x.vehicle_id, s: x.status, ph: x.placeholder_spare, del: x.deleted_at })));
    console.log('blocks vA', (await L.blocksFor(ids.vA)).map(b => ({ id: b.id, s: b.maintenance_status, start: b.start_date, del: b.deleted_at })));
    console.log('vB', await L.vehRow(ids.vB));
    console.log('rental179 decision', (await L.resRow(ids.rental179)).spare_assignment_decision);
    console.log('custom notifs placeholder 3348', await L.customNotifs(`%[placeholder:${ids.block2 ? 3348 : 0}]%`));
    console.log('notifs', await newNotifs());
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    console.log('needing-assignment for rental179:', (need.json || []).filter(x => x.replacementForReservationId === ids.rental179).map(x => x.id));
  });

  await L.step('Q5 delete the past block 3353 (vG) and placeholder 3354 directly', async () => {
    const r = await st.del(`/api/reservations/${ids.blockPast}`);
    console.log('DELETE past block ->', r.status);
    console.log('replacements rentalG', (await L.replacementsFor(ids.rentalG)).map(x => ({ id: x.id, s: x.status, del: x.deleted_at })));
    console.log('rentalG decision', (await L.resRow(ids.rentalG)).spare_assignment_decision);
    console.log('notifs', await newNotifs());
  });

  await L.step('Q6 vehicles/mine for the customer after all this + open-block list', async () => {
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log(JSON.stringify((mine.json || []).filter(x => [ids.vA, ids.vG, ids.vK].includes(x.vehicle?.id)).map(x => ({ v: x.vehicle.licensePlate, m: x.maintenance }))));
  });
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

// Phase 11 gap 1: portal-driven maintenance/spare flow end to end.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.11.1.3');
  const pt = await L.portal('10.11.1.4');
  const CUST = 179;
  const T = L.today();
  const notifStart = await L.maxId('portal_notifications');
  const mailStart = await L.maxId('email_logs');
  const auditStart = await L.maxId('audit_logs');
  const dump = async (label) => {
    console.log(`--- state (${label})`);
    console.log('blocks vA', await L.blocksFor(ids.vA));
    console.log('replacements for rental179', await L.replacementsFor(ids.rental179));
    console.log('rental179', (({ status, spare_assignment_decision, vehicle_id }) => ({ status, spare_assignment_decision, vehicle_id }))(await L.resRow(ids.rental179)));
    console.log('vA', await L.vehRow(ids.vA));
    console.log('vB', await L.vehRow(ids.vB));
    console.log('portal notifs since start', await L.portalNotifs(CUST, notifStart));
  };

  // ---- P1 customer files a maintenance request with needsReplacement ----
  let reqId;
  await L.step('P1 portal POST maintenance request (needsReplacement=true)', async () => {
    const pref = L.nextWeekday(L.addDays(T, 5));
    const r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rental179, message: 'AUDIT-P11 rattling noise', payload: { issue: 'AUDIT-P11 rattling noise front left', mileage: 1500, urgent: false, needsReplacement: true, preferredDate: pref } });
    console.log('create', L.short(r));
    reqId = r.json?.id;
    console.log('staff custom_notifications', await L.customNotifs('%Onderhoudsmelding%AU-11A-X%'));
    const dup = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rental179, message: 'dup', payload: { issue: 'dup', needsReplacement: true } });
    console.log('duplicate open request ->', L.short(dup));
    // Another customer's reservation (rental 1 belongs to somebody else presumably)
    const other = await L.q("select id from reservations where customer_id<>179 and status='picked_up' and deleted_at is null order by id desc limit 1");
    const foreign = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: other[0].id, message: 'x', payload: { issue: 'x' } });
    console.log(`foreign reservation ${other[0].id} ->`, L.short(foreign));
    const past = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rentalG, message: 'x', payload: { issue: 'x', preferredDate: L.addDays(T, -3) } });
    console.log('preferredDate in past ->', L.short(past));
  });

  // ---- P2 staff approves ----
  let blockId, placeholderId;
  const D1 = L.nextWeekday(L.addDays(T, 6));
  await L.step('P2 staff approve maintenance (startDate ' + D1 + ', 3 days, repair)', async () => {
    const g = await st.get(`/api/portal-requests/${reqId}`);
    console.log('request before', g.status, JSON.stringify(g.json).slice(0, 400));
    const r = await st.post(`/api/portal-requests/${reqId}/approve`, { startDate: D1, durationDays: 3, category: 'repair', note: 'AUDIT-P11 staff note' });
    console.log('approve', L.short(r));
    blockId = r.json?.block?.id;
    const block = await L.resRow(blockId);
    console.log('block row', block);
    const reps = await L.replacementsFor(ids.rental179);
    placeholderId = reps[0]?.id;
    await dump('after approve');
    console.log('email_logs since start', await L.emailLogs(mailStart));
    console.log('custom_notifications placeholder', await L.customNotifs(`%[placeholder:${placeholderId}]%`));
    console.log('audit_logs since start', (await L.auditLogs(auditStart)).map(a => ({ id: a.id, action: a.action, entity: a.entity_type || a.resource_type, eid: a.entity_id || a.resource_id })));
    // calendar / list endpoints
    const range = await st.get(`/api/reservations/range?startDate=${D1}&endDate=${L.addDays(D1, 2)}`);
    const inRange = Array.isArray(range.json) ? range.json.filter(x => x.id === blockId || x.id === placeholderId).map(x => ({ id: x.id, type: x.type, vehicleId: x.vehicleId, status: x.status })) : range.text.slice(0, 200);
    console.log('GET /api/reservations/range block+placeholder present:', range.status, inRange);
    const up = await st.get('/api/reservations/upcoming-maintenance');
    console.log('upcoming-maintenance contains block:', up.status, Array.isArray(up.json) ? up.json.some(x => x.id === blockId) : up.text.slice(0, 200));
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=30');
    console.log('needing-assignment contains placeholder:', need.status, Array.isArray(need.json) ? need.json.filter(x => x.id === placeholderId) : need.text.slice(0, 200));
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('portal vehicles/mine (vA entry):', mine.status, JSON.stringify((mine.json || []).find(x => x.vehicle?.id === ids.vA))?.slice(0, 600));
    const pn = await pt.get('/api/portal/notifications');
    console.log('portal GET notifications', pn.status, JSON.stringify(pn.json).slice(0, 300));
  });

  await L.step('P3 approve the same request twice', async () => {
    const r = await st.post(`/api/portal-requests/${reqId}/approve`, { startDate: D1, durationDays: 3 });
    console.log('second approve ->', L.short(r));
    console.log('blocks vA count', (await L.blocksFor(ids.vA)).length, 'replacements', (await L.replacementsFor(ids.rental179)).length);
  });

  // ---- P4 staff assigns real spare to placeholder ----
  await L.step('P4 assign spare vB to placeholder ' + placeholderId, async () => {
    const r = await st.post(`/api/placeholder-reservations/${placeholderId}/assign-vehicle`, { vehicleId: ids.vB });
    console.log('assign ->', L.short(r));
    await dump('after assign');
    console.log('custom_notifications placeholder after assign', await L.customNotifs(`%[placeholder:${placeholderId}]%`));
    console.log('email_logs since start', (await L.emailLogs(mailStart)).map(m => ({ id: m.id, subject: m.subject, status: m.status })));
    const mine = await pt.get('/api/portal/vehicles/mine');
    console.log('portal vehicles/mine replacement:', JSON.stringify((mine.json || []).find(x => x.vehicle?.id === ids.vA)?.maintenance));
    console.log('audit_logs for assign', (await L.auditLogs(auditStart, 'placeholder')).map(a => ({ action: a.action, eid: a.entity_id || a.resource_id })));
  });

  // ---- P5 customer asks to move (needsReplacement=true) ; staff approves ----
  let chgId;
  const D2 = L.nextWeekday(L.addDays(D1, 7));
  await L.step('P5 maintenance_change to ' + D2 + ' with needsReplacement=true, approve', async () => {
    const r = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: blockId, message: 'AUDIT-P11 move please', payload: { newDate: D2, reason: 'AUDIT-P11 on holiday', needsReplacement: true } });
    console.log('change request ->', L.short(r));
    chgId = r.json?.id;
    const dup = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: blockId, message: 'dup', payload: { newDate: D2, reason: 'dup', needsReplacement: true } });
    console.log('duplicate change ->', L.short(dup));
    const a = await st.post(`/api/portal-requests/${chgId}/approve`, { startDate: D2, durationDays: 2, note: 'AUDIT-P11 moved' });
    console.log('approve change ->', L.short(a));
    await dump('after change approve');
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=60');
    console.log('needing-assignment entries for rental179:', Array.isArray(need.json) ? need.json.filter(x => x.replacementForReservationId === ids.rental179).map(x => ({ id: x.id, start: x.startDate, end: x.endDate })) : need.text.slice(0, 100));
    const a2 = await st.post(`/api/portal-requests/${chgId}/approve`, { startDate: D2, durationDays: 2 });
    console.log('approve change twice ->', L.short(a2));
  });

  // ---- P6 change again with needsReplacement=false ----
  const D3 = L.nextWeekday(L.addDays(D2, 3));
  await L.step('P6 second maintenance_change to ' + D3 + ' needsReplacement=false, approve', async () => {
    const r = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: blockId, message: 'AUDIT-P11 move again', payload: { newDate: D3, reason: 'AUDIT-P11 again', needsReplacement: false } });
    console.log('change request ->', L.short(r));
    const a = await st.post(`/api/portal-requests/${r.json?.id}/approve`, { startDate: D3 });
    console.log('approve ->', L.short(a));
    await dump('after 2nd change');
  });

  // ---- P7 48h boundary on a staff-created block (vehicle vG, rentalG picked up) ----
  await L.step('P7 48h boundary: blocks on vG starting tomorrow / +2 / +3', async () => {
    for (const off of [1, 2, 3]) {
      const d = L.addDays(T, off);
      const r = await st.post('/api/reservations', { vehicleId: ids.vG, startDate: d, endDate: d, type: 'maintenance_block', maintenanceStatus: 'scheduled', notes: 'AUDIT-P11 48h boundary +' + off });
      const bid = r.json?.id;
      console.log(`block +${off} (${d}, weekend=${L.isWeekend(d)}) create ->`, r.status, bid, 'needsSpare?', r.json?.needsSpareVehicle);
      if (!bid) continue;
      const mine = await pt.get('/api/portal/vehicles/mine');
      const entry = (mine.json || []).find(x => x.vehicle?.id === ids.vG);
      console.log('  vehicles/mine maintenance:', JSON.stringify(entry?.maintenance));
      const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: bid, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 10)), reason: 'AUDIT-P11 boundary', needsReplacement: false } });
      console.log('  change request ->', L.short(c));
      if (c.json?.id) { const a = await st.post(`/api/portal-requests/${c.json.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 boundary test, rejected' }); console.log('  rejected ->', a.status); }
      console.log('  portal notifs for planned:', (await L.portalNotifs(CUST, notifStart)).filter(n => n.dedupe_tag && n.dedupe_tag.startsWith(`maint:${bid}:`)).map(n => n.type));
      ids['blockG' + off] = bid;
    }
    // change request on a block whose vehicle this customer does not have (vE has no rental)
    const rE = await st.post('/api/reservations', { vehicleId: ids.vE, startDate: L.nextWeekday(L.addDays(T, 10)), endDate: L.nextWeekday(L.addDays(T, 10)), type: 'maintenance_block', maintenanceStatus: 'scheduled', notes: 'AUDIT-P11 block on vE (no rental)' });
    ids.blockE = rE.json?.id;
    const c = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: ids.blockE, message: 'x', payload: { newDate: L.nextWeekday(L.addDays(T, 20)), reason: 'x', needsReplacement: false } });
    console.log('change on block of vehicle not on the road for this customer ->', L.short(c));
    L.saveIds(ids);
  });

  // ---- P8 approve with weekend / past date (fresh requests on rentalG, rentalI) ----
  await L.step('P8 approve with weekend date and with past date', async () => {
    const r1 = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rentalG, message: 'AUDIT-P11 weekend', payload: { issue: 'AUDIT-P11 weekend approve', needsReplacement: true } });
    console.log('request G ->', r1.status, r1.json?.id);
    const wk = L.nextWeekendDay(L.addDays(T, 3));
    const a1 = await st.post(`/api/portal-requests/${r1.json?.id}/approve`, { startDate: wk, durationDays: 1 });
    console.log(`approve weekend ${wk} ->`, L.short(a1));
    let past = L.addDays(T, -7); while (L.isWeekend(past)) past = L.addDays(past, -1);
    const a2 = await st.post(`/api/portal-requests/${r1.json?.id}/approve`, { startDate: past, durationDays: 2 });
    console.log(`approve past ${past} ->`, L.short(a2));
    console.log('blocks vG', await L.blocksFor(ids.vG));
    console.log('replacements rentalG', await L.replacementsFor(ids.rentalG));
    console.log('portal notifs for past block', (await L.portalNotifs(CUST, notifStart)).filter(n => n.dedupe_tag && n.dedupe_tag.includes(`:${a2.json?.block?.id}:`)));
    const need = await st.get('/api/placeholder-reservations/needing-assignment?daysAhead=7');
    console.log('needing-assignment for rentalG:', (need.json || []).filter(x => x.replacementForReservationId === ids.rentalG).map(x => ({ id: x.id, start: x.startDate, end: x.endDate })));
    ids.blockPast = a2.json?.block?.id; L.saveIds(ids);
    // durationDays boundaries
    const r2 = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rentalG, message: 'AUDIT-P11 dur', payload: { issue: 'AUDIT-P11 duration', needsReplacement: false } });
    for (const dd of [0, 61, 1.5, -1]) {
      const a = await st.post(`/api/portal-requests/${r2.json?.id}/approve`, { startDate: L.nextWeekday(L.addDays(T, 30)), durationDays: dd });
      console.log(`durationDays=${dd} ->`, a.status, (a.json?.message || '').slice(0, 80));
    }
    await st.post(`/api/portal-requests/${r2.json?.id}/reply`, { status: 'rejected', reply: 'AUDIT-P11 test' });
  });

  // ---- P9 approve after rental deleted / cancelled ----
  await L.step('P9 approve after the rental was deleted (rentalI) and cancelled (new booked rental on vK)', async () => {
    const r1 = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rentalI, message: 'AUDIT-P11 del', payload: { issue: 'AUDIT-P11 rental deleted', needsReplacement: true } });
    console.log('request I ->', r1.status, r1.json?.id);
    const del = await st.del(`/api/reservations/${ids.rentalI}`);
    console.log('DELETE rentalI ->', del.status);
    const a1 = await st.post(`/api/portal-requests/${r1.json?.id}/approve`, { startDate: L.nextWeekday(L.addDays(T, 8)), durationDays: 1 });
    console.log('approve after delete ->', L.short(a1));
    console.log('request I status now', (await st.get(`/api/portal-requests/${r1.json?.id}`)).json?.status);
    console.log('vI', await L.vehRow(ids.vI));
    // cancelled booked rental on vK
    const rk = await st.post('/api/reservations', { vehicleId: ids.vK, customerId: CUST, startDate: L.addDays(T, 3), endDate: L.addDays(T, 40), notes: 'AUDIT-P11 rental K', type: 'standard' });
    ids.rentalK = rk.json?.id; L.saveIds(ids);
    console.log('rental K ->', rk.status, ids.rentalK);
    const r2 = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rentalK, message: 'AUDIT-P11 cancel', payload: { issue: 'AUDIT-P11 rental cancelled', needsReplacement: true } });
    console.log('request K (booked rental) ->', r2.status, r2.json?.id, (r2.json?.message || r2.json?.error || '').slice(0, 100));
    if (r2.json?.id) {
      const c = await st.patch(`/api/reservations/${ids.rentalK}/status`, { status: 'cancelled' });
      console.log('cancel rental K ->', c.status);
      const a2 = await st.post(`/api/portal-requests/${r2.json.id}/approve`, { startDate: L.nextWeekday(L.addDays(T, 9)), durationDays: 1 });
      console.log('approve after cancel ->', L.short(a2));
      console.log('blocks vK', await L.blocksFor(ids.vK));
      console.log('replacements rentalK', await L.replacementsFor(ids.rentalK));
      console.log('rentalK', (({ status, spare_assignment_decision }) => ({ status, spare_assignment_decision }))(await L.resRow(ids.rentalK)));
    }
  });

  // ---- P10 overlapping approved blocks on one vehicle ----
  await L.step('P10 second maintenance request on rental179 approved overlapping the existing block', async () => {
    const b = await L.resRow(blockId);
    const r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: ids.rental179, message: 'AUDIT-P11 overlap', payload: { issue: 'AUDIT-P11 overlapping', needsReplacement: true } });
    console.log('request ->', r.status, r.json?.id);
    const a = await st.post(`/api/portal-requests/${r.json?.id}/approve`, { startDate: b.start_date, durationDays: 2 });
    console.log('approve overlapping ->', L.short(a));
    await dump('after overlapping approve');
    console.log('all custom spare_assignment notifs for rental179 placeholders', await L.q("select id, description from custom_notifications where type='spare_assignment' and description like '%placeholder:%' and id > (select coalesce(max(id),0)-40 from custom_notifications) order by id"));
    ids.block2 = a.json?.block?.id; ids.blockId = blockId; ids.placeholderId = placeholderId; ids.reqId = reqId; L.saveIds(ids);
  });

  console.log('\nALL portal notifs since start', await L.portalNotifs(CUST, notifStart));
  console.log('email_logs since start', (await L.emailLogs(mailStart)).map(m => ({ id: m.id, subject: m.subject, status: m.status, err: m.error || m.error_message })));
  console.log('audit actions since start', (await L.auditLogs(auditStart)).map(a => `${a.action}:${a.entity_type || a.resource_type}:${a.entity_id || a.resource_id}`));
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

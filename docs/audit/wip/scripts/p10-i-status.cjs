// P10-I: 'returned' vs 'completed' (and legacy status values) - consistency between routes and
// the queries that key off status; the overdue-vehicle guard on returned rows; /status accepting
// 'returned' as a value but not as a transition; calendar "reschedule" (drag/drop) shape.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-i-status');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const cn = (s) => `AUDIT-P10-I-${s}-${Date.now().toString().slice(-6)}`;

  // I1 legacy 'returned' rows older than 3 days block the vehicle for any future booking
  const legacy = await q(`select r.id, r.vehicle_id, r.end_date, v.license_plate from reservations r join vehicles v on v.id=r.vehicle_id where r.status='returned' and r.deleted_at is null and r.end_date <> '' and r.end_date < to_char(current_date-3,'YYYY-MM-DD') order by r.id`);
  const probes = [];
  for (const row of legacy.slice(0, 3)) {
    const guard = await admin.get(`/api/reservations/overdue/${row.vehicle_id}`);
    const create = await admin.post('/api/reservations', { vehicleId: row.vehicle_id, customerId: CA, startDate: '2028-03-01', endDate: '2028-03-03', totalPrice: 1, notes: `AUDIT-P10-I1 probe on vehicle ${row.license_plate}` });
    probes.push({ legacyReservation: row.id, vehicle: row.license_plate, legacyEnd: row.end_date, guardReturns: (guard.json || []).map(g => `${g.id}:${g.status}`), createFuture: brief(create, 110) });
    if (create.json && create.json.id) await admin.del(`/api/reservations/${create.json.id}`);
  }
  rep.step('I1 pre-existing "returned" reservations (>3 days old) block any future booking on their vehicle', { legacyCount: legacy.length, probes });

  // I2 the overdue-vehicle guard by status, across the whole clone
  const guardByStatus = await q(`select status, count(*)::int rows, count(distinct vehicle_id)::int vehicles from reservations where deleted_at is null and end_date is not null and end_date <> '' and end_date < to_char(current_date-3,'YYYY-MM-DD') and status not in ('completed','cancelled') group by status order by 2 desc`);
  const statusDist = await q(`select status, count(*)::int from reservations where deleted_at is null group by 1 order by 2 desc`);
  rep.step('I2 rows the POST /api/reservations overdue guard treats as blocking, by status value', { guardByStatus, statusDistribution: statusDist });

  // I3 legacy 'active'/'confirmed' rows: can /status move them at all?
  const [act] = await q(`select id, status, vehicle_id from reservations where status='active' and deleted_at is null order by id desc limit 1`);
  let i3 = null;
  if (act) {
    const s1 = await admin.patch(`/api/reservations/${act.id}/status`, { status: 'picked_up' });
    const s2 = await admin.patch(`/api/reservations/${act.id}/status`, { status: 'completed' });
    const s3 = await admin.patch(`/api/reservations/${act.id}/status`, { status: 'cancelled' });
    const now = (await q('select status from reservations where id=$1', [act.id]))[0].status;
    if (now !== 'active') await q("update reservations set status='active' where id=$1", [act.id]);
    i3 = { reservation: act.id, toPickedUp: brief(s1, 140), toCompleted: brief(s2, 140), toCancelled: brief(s3, 140), statusAfter: now, restoredToActive: now !== 'active' };
  }
  rep.step('I3 a legacy status="active" reservation vs PATCH /:id/status', i3);

  // I4 /status accepts 'returned' as a value but is it a legal transition from picked_up?
  const V = ids.vehicles['AU-116-X'];
  let r = await admin.post('/api/reservations', { vehicleId: V, customerId: CA, startDate: addDays(T, -2), endDate: addDays(T, 1), totalPrice: 100, notes: 'AUDIT-P10-I4 returned via /status' });
  const I4 = r.json.id;
  await admin.post(`/api/reservations/${I4}/pickup`, { contractNumber: cn('I4'), pickupMileage: 16000, fuelLevelPickup: 'full' });
  const toReturned = await admin.patch(`/api/reservations/${I4}/status`, { status: 'returned' });
  const viaPatch = await admin.patch(`/api/reservations/${I4}`, { status: 'returned' });
  let snap = await everywhereSnapshot(admin, I4);
  rep.step('I4 picked_up -> "returned": /status vs PATCH /:id (the form status select offers "returned")', { viaStatus: brief(toReturned, 160), viaPatch: brief(viaPatch, 60), row: snap.row && { status: snap.row.status, end: snap.row.end_date, actualReturn: snap.row.actual_return_date, contract: snap.row.contract_number }, everywhere: summarize(snap), vehicle: (await q('select availability_status from vehicles where id=$1', [V]))[0] });
  // returned -> completed via /status: end_date overwritten again? (C2b showed yes) + returned -> picked_up reversion
  const back = await admin.patch(`/api/reservations/${I4}/status`, { status: 'picked_up' });
  const row2 = (await q('select status, end_date, actual_return_date, return_mileage, contract_number from reservations where id=$1', [I4]))[0];
  rep.step('I4b returned -> picked_up reversion via /status clears return data AND endDate', { response: brief(back, 60), row: row2, vehicle: (await q('select availability_status from vehicles where id=$1', [V]))[0] });

  // I5 upcoming list semantics for 'returned' rows that start today or later
  const upcomingReturned = await q(`select id, status, start_date, end_date from reservations where start_date >= $1 and status not in ('cancelled','completed') and (type <> 'maintenance_block' or type is null) and deleted_at is null and vehicle_id is not null and status = 'returned' order by start_date limit 5`, [T]);
  const upcomingApi = await admin.get('/api/reservations/upcoming');
  rep.step('I5 "returned" rows with startDate >= today satisfy the upcoming-reservations query', { upcomingReturnedRows: upcomingReturned, upcomingApiTop5: Array.isArray(upcomingApi.json) ? upcomingApi.json.map(x => `${x.id}:${x.status}:${x.startDate}`) : upcomingApi.status });

  // I6 calendar drag/drop reschedule = PATCH /:id {startDate,endDate} only -> onto a busy period
  const VB = ids.vehicles['AU-117-X'];
  const a = await admin.post('/api/reservations', { vehicleId: VB, customerId: CA, startDate: addDays(T, 60), endDate: addDays(T, 63), totalPrice: 1, notes: 'AUDIT-P10-I6 existing' });
  const b = await admin.post('/api/reservations', { vehicleId: VB, customerId: CB, startDate: addDays(T, 70), endDate: addDays(T, 73), totalPrice: 1, notes: 'AUDIT-P10-I6 to be dragged' });
  const drag = await admin.patch(`/api/reservations/${b.json.id}`, { startDate: addDays(T, 61), endDate: addDays(T, 64) });
  const conflicts = await admin.get(`/api/reservations/check-conflicts?vehicleId=${VB}&startDate=${addDays(T, 60)}&endDate=${addDays(T, 64)}`);
  const preCheck = await admin.get(`/api/reservations/check-conflicts?vehicleId=${VB}&startDate=${addDays(T, 61)}&endDate=${addDays(T, 64)}&excludeReservationId=${b.json.id}`);
  rep.step('I6 calendar drag/drop reschedule shape (PATCH /:id {startDate,endDate}) onto a period already booked on the same vehicle', { existing: a.json.id, dragged: b.json.id, checkConflictsWouldHaveSaid: (preCheck.json || []).map(c => c.id), dragResponse: brief(drag, 60), overlappingNow: (conflicts.json || []).map(c => `${c.id}:${c.startDate}..${c.endDate}`) });

  // I7 PATCH /:id garbage endDate: does the calendar/range and the conflict check still see the row?
  const c = await admin.post('/api/reservations', { vehicleId: VB, customerId: CA, startDate: addDays(T, 80), endDate: addDays(T, 83), totalPrice: 1, notes: 'AUDIT-P10-I7 garbage end' });
  const g = await admin.patch(`/api/reservations/${c.json.id}`, { endDate: 'not-a-date' });
  const rangeSee = await admin.get(`/api/reservations/range?startDate=${addDays(T, 80)}&endDate=${addDays(T, 83)}`);
  const confSee = await admin.get(`/api/reservations/check-conflicts?vehicleId=${VB}&startDate=${addDays(T, 80)}&endDate=${addDays(T, 83)}`);
  const overlapCreate = await admin.post('/api/reservations', { vehicleId: VB, customerId: CB, startDate: addDays(T, 81), endDate: addDays(T, 82), totalPrice: 1, notes: 'AUDIT-P10-I7 overlapping the garbage-end row' });
  rep.step('I7 after PATCH /:id {endDate:"not-a-date"}: visibility in range/conflicts and a new overlapping booking', { patch: brief(g, 60), rowInRange: Array.isArray(rangeSee.json) && rangeSee.json.some(x => x.id === c.json.id), rowInConflicts: (confSee.json || []).map(x => x.id), overlappingCreate: brief(overlapCreate, 60), row: (await q('select start_date, end_date, status from reservations where id=$1', [c.json.id]))[0] });

  rep.step('ids', { I4, I6: [a.json.id, b.json.id], I7: c.json.id, legacyActive: act && act.id });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

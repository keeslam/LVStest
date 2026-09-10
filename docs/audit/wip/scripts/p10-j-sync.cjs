// P10-J: vehicle availability after a rental ends via /status {completed} vs POST /return when the
// vehicle already has another booking within 30 days (syncVehicleAvailabilityWithReservations only
// resets rented->available for vehicles with NO active/upcoming reservation at all).
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-j-sync');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const cn = (s) => `AUDIT-P10-J-${s}-${Date.now().toString().slice(-6)}`;
  const vstat = async (id) => (await q('select availability_status from vehicles where id=$1', [id]))[0].availability_status;
  const mk = async (plate) => { const [ex] = await q('select id from vehicles where license_plate=$1', [plate]); if (ex) return ex.id; const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P10', model: 'SYNC', vehicleType: 'car', currentMileage: 100 }); return r.json.id; };
  const V1 = await mk('AU-151-X'), V2 = await mk('AU-152-X');

  for (const [label, V, end] of [['via /status {completed}', V1, 'status'], ['via POST /return', V2, 'return']]) {
    const r1 = await admin.post('/api/reservations', { vehicleId: V, customerId: CA, startDate: addDays(T, -2), endDate: addDays(T, 1), totalPrice: 1, notes: `AUDIT-P10-J current ${label}` });
    const cur = r1.json.id;
    await admin.post(`/api/reservations/${cur}/pickup`, { contractNumber: cn(label.slice(-6)), pickupMileage: 100, fuelLevelPickup: 'full' });
    const r2 = await admin.post('/api/reservations', { vehicleId: V, customerId: CB, startDate: addDays(T, 10), endDate: addDays(T, 12), totalPrice: 1, notes: `AUDIT-P10-J upcoming ${label}` });
    const statusBefore = await vstat(V);
    const done = end === 'status'
      ? await admin.patch(`/api/reservations/${cur}/status`, { status: 'completed', departureMileage: 150 })
      : await admin.post(`/api/reservations/${cur}/return`, { returnMileage: 150, fuelLevelReturn: 'full' });
    const statusAfter = await vstat(V);
    // a second sync pass (any reservation write triggers it) - does it fix itself?
    await admin.patch(`/api/reservations/${r2.json.id}`, { notes: 'AUDIT-P10-J touch' });
    const statusAfterResync = await vstat(V);
    const availList = await admin.get(`/api/vehicles/available?startDate=${addDays(T, 3)}&endDate=${addDays(T, 5)}`);
    rep.step(`J rental ended ${label} while an upcoming booking (+10..+12) exists on the vehicle`, { current: cur, upcoming: r2.json.id, end: brief(done, 40), vehicle: { before: statusBefore, after: statusAfter, afterResync: statusAfterResync }, row: (await q('select status, end_date from reservations where id=$1', [cur]))[0], vehicleInAvailableListForDays3to5: Array.isArray(availList.json) && availList.json.some(v => v.id === V) });
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

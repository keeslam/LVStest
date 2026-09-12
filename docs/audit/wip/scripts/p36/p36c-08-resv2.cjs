'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-S' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c08');
  const ids = loadIds();
  const CA = ids.customers.A;
  const base = { customerId: CA, notes: 'AUDIT-P36C resv2', type: 'standard', totalPrice: 100 };
  const mk = async (tag) => {
    const plate = 'P36C' + RUN + tag;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'R', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };
  let r;

  // --- BUG-133 driver history via /basic ---
  const drivers = await q('select id from drivers order by id limit 2');
  if (drivers.length === 2) {
    const V4 = await mk('D1');
    r = await s.post('/api/reservations', { ...base, vehicleId: V4, startDate: d(20), endDate: d(23), driverId: drivers[0].id });
    const R4 = r.json.id;
    log('133 create with driver', [r.status, R4, drivers.map(x => x.id)]);
    log('133 assignments after create', await q('select id,driver_id,assigned_from,assigned_until from reservation_driver_assignments where reservation_id=$1 order by id', [R4]));
    r = await s.patch('/api/reservations/' + R4 + '/basic', { startDate: d(20), endDate: d(23), driverId: drivers[1].id });
    log('133 PATCH /basic driverId', [r.status, r.json && r.json.driverId]);
    log('133 assignments after /basic', await q('select id,driver_id,assigned_from,assigned_until from reservation_driver_assignments where reservation_id=$1 order by id', [R4]));
  } else log('133 drivers', drivers);

  // --- BUG-152 audit action names ---
  const V8 = await mk('A1');
  r = await s.post('/api/reservations', { ...base, vehicleId: V8, startDate: d(-1), endDate: d(2) });
  const R8 = r.json.id;
  r = await s.post('/api/reservations/' + R8 + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('152 pickup', r.status);
  r = await s.post('/api/reservations/' + R8 + '/return', { returnDate: d(0), returnMileage: 1100, fuelLevelReturn: 'full' });
  log('152 return', r.status);
  log('152 audit actions', await q("select action, details->>'operation' as op from audit_logs where resource_type='reservation' and resource_id=$1 order by id", [String(R8)]));

  // --- BUG-153 rental days ---
  const V5 = await mk('F1');
  r = await s.post('/api/reservations', { ...base, vehicleId: V5, startDate: d(100), endDate: d(104), totalPrice: 500 });
  const R5 = r.json.id;
  r = await s.get('/api/contracts/data/' + R5);
  log('153 contracts/data', [r.status, (r.text.match(/[^,{}]*[Dd]ays[^,{}]*/g) || []).slice(0, 6)]);
  r = await s.get(`/api/reports/vehicle-financials?from=${d(100)}&to=${d(104)}&vehicleId=${V5}`);
  log('153 report rentalDays', [r.status, (r.text.match(/"rentalDays":\s*\d+/g) || []).slice(0, 4), r.text.slice(0, 200)]);

  // --- BUG-157 contract numbers with leading zeros ---
  const V6 = await mk('C1');
  r = await s.post('/api/reservations', { ...base, vehicleId: V6, startDate: d(-1), endDate: d(2) });
  const R6 = r.json.id;
  r = await s.post('/api/reservations/' + R6 + '/pickup', { contractNumber: '9' + RUN, pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('157 pickup with 9' + RUN, [r.status, r.text.slice(0, 120)]);
  const V7 = await mk('C2');
  r = await s.post('/api/reservations', { ...base, vehicleId: V7, startDate: d(-1), endDate: d(2) });
  const R7 = r.json.id;
  r = await s.post('/api/reservations/' + R7 + '/pickup', { contractNumber: '09' + RUN, pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('157 pickup with 09' + RUN + ' (expect 409)', [r.status, r.text.slice(0, 220)]);
  log('157 rows', await q('select id,contract_number from reservations where contract_number in ($1,$2)', ['9' + RUN, '09' + RUN]));

  // --- BUG-143 new rows: maintenance block / reservation on a non-existent vehicle ---
  r = await s.post('/api/reservations', { ...base, vehicleId: 98765432, startDate: d(40), endDate: d(42) });
  log('143 reservation on non-existent vehicle (expect 400/404)', [r.status, r.text.slice(0, 160)]);
  r = await s.post('/api/reservations', { customerId: CA, vehicleId: 98765432, startDate: d(40), endDate: d(42), type: 'maintenance_block', notes: 'AUDIT-P36C block' });
  log('143 maintenance_block on non-existent vehicle (expect 400/404)', [r.status, r.text.slice(0, 160)]);
  log('143 surviving orphan rows', await q('select count(*)::int n, count(*) filter (where type=$1)::int blocks from reservations r where deleted_at is null and vehicle_id is not null and not exists (select 1 from vehicles v where v.id=r.vehicle_id)', ['maintenance_block']));

  // --- BUG-144 new rows: PATCH status picked_up without pickup data ---
  const V9 = await mk('P1');
  r = await s.post('/api/reservations', { ...base, vehicleId: V9, startDate: d(60), endDate: d(63) });
  const R9 = r.json.id;
  r = await s.patch('/api/reservations/' + R9, { status: 'picked_up' });
  log('144 PATCH /:id {status:picked_up} (expect 400)', [r.status, r.text.slice(0, 220)]);
  r = await s.patch('/api/reservations/' + R9 + '/status', { status: 'picked_up' });
  log('144 PATCH /:id/status {picked_up} (expect 400: no pickup data / before start)', [r.status, r.text.slice(0, 260)]);
  log('144 row', await q('select status,actual_pickup_date,pickup_mileage from reservations where id=$1', [R9]));
  log('144 survivors', await q("select (select count(*) from reservations where deleted_at is null and status='picked_up' and end_date < current_date::text)::int as picked_up_past_end, (select count(*) from reservations where deleted_at is null and status='picked_up' and start_date > current_date::text)::int as picked_up_future_start, (select count(*) from reservations where deleted_at is null and status='booked' and type='standard' and start_date < (current_date-30)::text)::int as stale_booked"));

  // --- BUG-129 legacy status values ---
  const legacy = await q("select id from reservations where status='active' and deleted_at is null order by id limit 1");
  log('129 legacy active row', legacy);
  if (legacy[0]) {
    r = await s.patch('/api/reservations/' + legacy[0].id + '/status', { status: 'completed' });
    log('129 /status {completed} on legacy active row (expect 200)', [r.status, r.text.slice(0, 250)]);
    await q("update reservations set status='active' where id=$1", [legacy[0].id]);
  }
  log('129 distinct statuses', await q('select status, count(*)::int from reservations where deleted_at is null group by 1 order by 2 desc'));
  await pool.end();
})();

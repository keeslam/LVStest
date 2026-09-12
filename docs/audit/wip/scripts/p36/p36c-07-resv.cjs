'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
let cn = 0;
const CN = () => 'AUDIT-P36C-R' + Date.now().toString().slice(-6) + '-' + (++cn);
(async () => {
  const s = await admin('c07');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C resv', type: 'standard', totalPrice: 100 };
  const mk = async (plate) => {
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'R', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };

  // --- BUG-132: delete / cancel a picked_up rental ---
  const V1 = await mk('P36C-R1');
  let r = await s.post('/api/reservations', { ...base, vehicleId: V1, startDate: d(-1), endDate: d(2) });
  const R1 = r.json.id;
  const cnum = CN();
  r = await s.post('/api/reservations/' + R1 + '/pickup', { contractNumber: cnum, pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('132 pickup', [r.status, r.text.slice(0, 100)]);
  r = await s.patch('/api/reservations/' + R1 + '/status', { status: 'cancelled' });
  log('132 cancel picked_up (expect 409)', [r.status, r.text.slice(0, 220)]);
  r = await s.del('/api/reservations/' + R1);
  log('132 DELETE picked_up (expect 409)', [r.status, r.text.slice(0, 220)]);
  log('132 row', await q('select status,contract_number,deleted_at from reservations where id=$1', [R1]));

  // --- BUG-112 (B-04): cancel with transport + spare + placeholder ---
  const V2 = await mk('P36C-R2');
  const V3 = await mk('P36C-R3');
  r = await s.post('/api/reservations', { ...base, vehicleId: V2, startDate: d(5), endDate: d(9), deliveryRequired: true });
  const R2 = r.json.id;
  log('112 res with deliveryRequired', [r.status, R2]);
  log('112 transports after create', await q('select id,status from vehicle_transports where reservation_id=$1', [R2]));
  r = await s.post('/api/reservations/' + R2 + '/mark-needs-service', { maintenanceType: 'service', notes: 'AUDIT-P36C' });
  log('112 mark-needs-service', [r.status, r.text.slice(0, 160)]);
  r = await s.post('/api/reservations/' + R2 + '/assign-spare', { spareVehicleId: V3, startDate: d(5), endDate: d(9) });
  log('112 assign-spare', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/reservations/' + R2 + '/status', { status: 'cancelled' });
  log('112 cancel (B-04: asks / cascades)', [r.status, r.text.slice(0, 400)]);
  r = await s.patch('/api/reservations/' + R2 + '/status', { status: 'cancelled', cascade: { transports: 'cancel', replacements: 'cancel', placeholders: 'cancel', driverAssignments: 'close' } });
  log('112 cancel with cascade choices', [r.status, r.text.slice(0, 300)]);
  log('112 transports after cancel', await q('select id,status from vehicle_transports where reservation_id=$1', [R2]));
  log('112 children after cancel', await q('select id,type,status,placeholder_spare,deleted_at from reservations where replacement_for_reservation_id=$1 or affected_rental_id=$1', [R2]));
  log('112 res row', await q('select status from reservations where id=$1', [R2]));

  // --- BUG-133 driver history via /basic ---
  const drivers = await q("select id from drivers order by id limit 2");
  if (drivers.length === 2) {
    const V4 = await mk('P36C-R4');
    r = await s.post('/api/reservations', { ...base, vehicleId: V4, startDate: d(20), endDate: d(23), driverId: drivers[0].id });
    const R4 = r.json.id;
    log('133 create with driver', [r.status, R4]);
    r = await s.patch('/api/reservations/' + R4 + '/basic', { startDate: d(20), endDate: d(23), driverId: drivers[1].id });
    log('133 PATCH /basic driverId', [r.status, r.text.slice(0, 160)]);
    log('133 assignments', await q('select id,driver_id,assigned_at,unassigned_at from reservation_driver_assignments where reservation_id=$1 order by id', [R4]));
  } else log('133 no drivers', drivers);

  // --- BUG-152 audit action names ---
  log('152 audit actions for R1', await q("select action, details->>'operation' as op from audit_logs where resource_type='reservation' and resource_id=$1 order by id", [String(R1)]));

  // --- BUG-153 rental days contract vs report ---
  const V5 = await mk('P36C-R5');
  r = await s.post('/api/reservations', { ...base, vehicleId: V5, startDate: d(100), endDate: d(104), totalPrice: 500 });
  const R5 = r.json.id;
  r = await s.get('/api/contracts/data/' + R5);
  const m = r.text.match(/"[^"]*[Dd]ays?[^"]*"\s*:\s*"?([^",}]+)/g);
  log('153 contracts/data days fields', [r.status, m, (r.text.match(/\d+ days/) || [])[0]]);
  r = await s.get(`/api/reports/vehicle-financials?from=${d(100)}&to=${d(104)}&vehicleId=${V5}`);
  log('153 report rentalDays', [r.status, (r.text.match(/"rentalDays":\s*\d+/g) || []).slice(0, 4)]);

  // --- BUG-157 contract numbers with leading zeros ---
  const V6 = await mk('P36C-R6');
  r = await s.post('/api/reservations', { ...base, vehicleId: V6, startDate: d(-1), endDate: d(2) });
  const R6 = r.json.id;
  r = await s.post('/api/reservations/' + R6 + '/pickup', { contractNumber: '900100', pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('157 pickup with 900100', [r.status, r.text.slice(0, 100)]);
  const V7 = await mk('P36C-R7');
  r = await s.post('/api/reservations', { ...base, vehicleId: V7, startDate: d(-1), endDate: d(2) });
  const R7 = r.json.id;
  r = await s.post('/api/reservations/' + R7 + '/pickup', { contractNumber: '0900100', pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('157 pickup with 0900100 (expect 409)', [r.status, r.text.slice(0, 220)]);
  log('157 rows', await q("select id,contract_number from reservations where contract_number in ('900100','0900100')"));
  await pool.end();
})();

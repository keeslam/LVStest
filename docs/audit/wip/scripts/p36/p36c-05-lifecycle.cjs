'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
(async () => {
  const s = await admin('c05');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C life', type: 'standard', totalPrice: 100 };
  const mk = async (plate) => {
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'L', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };

  // --- BUG-109 (B-03) pickup with needs_fixing / in_service ---
  const V1 = await mk('P36C-L1');
  let r = await s.post('/api/reservations', { ...base, vehicleId: V1, startDate: d(0), endDate: d(3) });
  const R1 = r.json.id; log('109 res', [r.status, R1]);
  r = await s.patch('/api/vehicles/' + V1, { availabilityStatus: 'needs_fixing' });
  log('109 needs_fixing', r.status);
  r = await s.patch('/api/vehicles/' + V1 + '/maintenance-status', { status: 'in_service', note: 'AUDIT-P36C workshop' });
  log('109 maintenance in_service', [r.status, r.text.slice(0, 150)]);
  r = await s.post('/api/reservations/' + R1 + '/pickup', { pickupMileage: 1100, fuelLevelPickup: 'full' });
  log('109 POST /pickup (expect 4xx per B-03)', [r.status, r.text.slice(0, 300)]);
  r = await s.patch('/api/reservations/' + R1 + '/status', { status: 'picked_up' });
  log('109 PATCH /status picked_up (expect 4xx)', [r.status, r.text.slice(0, 300)]);
  log('109 db', await q('select status from reservations where id=$1', [R1]));
  for (const body of [
    { pickupMileage: 1100, fuelLevelPickup: 'full', forceWorkshopOverride: true, overrideReason: 'AUDIT-P36C override' },
    { pickupMileage: 1100, fuelLevelPickup: 'full', overrideWorkshop: true, overrideReason: 'AUDIT-P36C override' },
    { pickupMileage: 1100, fuelLevelPickup: 'full', force: true, forceReason: 'AUDIT-P36C override' },
  ]) {
    r = await s.post('/api/reservations/' + R1 + '/pickup', body);
    log('109 pickup override ' + Object.keys(body).join(','), [r.status, r.text.slice(0, 200)]);
    if (r.status === 200) break;
  }
  log('109 vehicle after', await q('select availability_status,maintenance_status from vehicles where id=$1', [V1]));

  // --- BUG-120 atomic pickup on not_for_rental ---
  const V2 = await mk('P36C-L2');
  r = await s.post('/api/reservations', { ...base, vehicleId: V2, startDate: d(0), endDate: d(3) });
  const R2 = r.json.id;
  await s.patch('/api/vehicles/' + V2, { availabilityStatus: 'not_for_rental' });
  r = await s.post('/api/reservations/' + R2 + '/pickup', { contractNumber: 'AUDIT-P36C-120', pickupMileage: 5000, fuelLevelPickup: 'full' });
  log('120 pickup on not_for_rental (expect 400)', [r.status, r.text.slice(0, 200)]);
  log('120 reservation row (expect booked, no contract_number)', await q('select status,contract_number,pickup_mileage,actual_pickup_date from reservations where id=$1', [R2]));

  // --- BUG-113 (B-02) return -> completed, no overdue block ---
  const V3 = await mk('P36C-L3');
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, startDate: d(-7), endDate: d(-1) });
  const R3 = r.json.id;
  r = await s.post('/api/reservations/' + R3 + '/pickup', { pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('113 pickup', [r.status, r.text.slice(0, 150)]);
  r = await s.post('/api/reservations/' + R3 + '/return', { returnDate: d(-5), returnMileage: 1200, fuelLevelReturn: 'full' });
  log('113 return', [r.status, r.text.slice(0, 150)]);
  log('113 status after return (B-02 expects completed)', await q('select status,end_date from reservations where id=$1', [R3]));
  log('113 vehicle after return', await q('select availability_status from vehicles where id=$1', [V3]));
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, customerId: CB, startDate: d(30), endDate: d(32) });
  log('113 future booking after return (expect 201)', [r.status, r.text.slice(0, 200)]);

  // --- BUG-130 completed via /status with a future booking ---
  const V4 = await mk('P36C-L4');
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, startDate: d(-2), endDate: d(1) });
  const R4 = r.json.id;
  await s.post('/api/reservations/' + R4 + '/pickup', { pickupMileage: 1000, fuelLevelPickup: 'full' });
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, customerId: CB, startDate: d(10), endDate: d(12) });
  log('130 second booking', [r.status, r.json && r.json.id]);
  log('130 vehicle after pickup', await q('select availability_status from vehicles where id=$1', [V4]));
  r = await s.patch('/api/reservations/' + R4 + '/status', { status: 'completed', departureMileage: 1500 });
  log('130 PATCH status completed', [r.status, r.text.slice(0, 150)]);
  log('130 vehicle after completed (expect available/scheduled)', await q('select availability_status from vehicles where id=$1', [V4]));

  // --- BUG-127 mileage via PATCH ---
  const V5 = await mk('P36C-L5');
  r = await s.post('/api/reservations', { ...base, vehicleId: V5, startDate: d(-4), endDate: d(-1) });
  const R5 = r.json.id;
  await s.post('/api/reservations/' + R5 + '/pickup', { pickupMileage: 39100, fuelLevelPickup: 'full' });
  await s.post('/api/reservations/' + R5 + '/return', { returnDate: d(-1), returnMileage: 39300, fuelLevelReturn: 'full' });
  r = await s.patch('/api/reservations/' + R5, { returnMileage: 30000 });
  log('127 PATCH returnMileage below pickup (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/reservations/' + R5, { pickupMileage: 45000 });
  log('127 PATCH pickupMileage above return (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/reservations/' + R5, { returnMileage: 39500 });
  log('127 PATCH returnMileage higher', [r.status, r.text.slice(0, 120)]);
  log('127 db', await q('select r.pickup_mileage,r.return_mileage,v.current_mileage from reservations r join vehicles v on v.id=r.vehicle_id where r.id=$1', [R5]));

  // --- BUG-131 date validation on pickup/return ---
  const V6 = await mk('P36C-L6');
  r = await s.post('/api/reservations', { ...base, vehicleId: V6, startDate: d(-3), endDate: d(1) });
  const R6 = r.json.id;
  r = await s.post('/api/reservations/' + R6 + '/pickup', { pickupDate: 'x', pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('131 pickup pickupDate=x (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.post('/api/reservations/' + R6 + '/pickup', { pickupDate: d(-2), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('131 pickup ok', [r.status, r.text.slice(0, 120)]);
  r = await s.post('/api/reservations/' + R6 + '/return', { returnDate: 'x', returnMileage: 1100, fuelLevelReturn: 'full' });
  log('131 return returnDate=x (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.post('/api/reservations/' + R6 + '/return', { returnDate: d(-9), returnMileage: 1100, fuelLevelReturn: 'full' });
  log('131 return before pickup (expect 400)', [r.status, r.text.slice(0, 200)]);
  await pool.end();
})();

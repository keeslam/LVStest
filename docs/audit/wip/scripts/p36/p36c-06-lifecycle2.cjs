'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
let cn = 0;
const CN = () => 'AUDIT-P36C-' + Date.now().toString().slice(-6) + '-' + (++cn);
(async () => {
  const s = await admin('c06');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C life2', type: 'standard', totalPrice: 100 };
  const mk = async (plate) => {
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'L', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };

  // --- BUG-109 pickup with needs_fixing + in_service, with contract number ---
  const V1 = await mk('P36C-M1');
  let r = await s.post('/api/reservations', { ...base, vehicleId: V1, startDate: d(0), endDate: d(3) });
  const R1 = r.json.id;
  await s.patch('/api/vehicles/' + V1, { availabilityStatus: 'needs_fixing' });
  await s.patch('/api/vehicles/' + V1 + '/maintenance-status', { status: 'in_service', note: 'AUDIT-P36C workshop' });
  r = await s.post('/api/reservations/' + R1 + '/pickup', { contractNumber: CN(), pickupMileage: 1100, fuelLevelPickup: 'full' });
  log('109 /pickup in workshop (expect 4xx)', [r.status, r.text.slice(0, 260)]);
  log('109 res status', await q('select status from reservations where id=$1', [R1]));
  r = await s.post('/api/reservations/' + R1 + '/pickup', { contractNumber: CN(), pickupMileage: 1100, fuelLevelPickup: 'full', forceWorkshopOverride: true, forceWorkshopReason: 'AUDIT-P36C reden' });
  log('109 /pickup with admin override (expect 200)', [r.status, r.text.slice(0, 200)]);
  log('109 vehicle after override pickup', await q('select availability_status,maintenance_status from vehicles where id=$1', [V1]));
  r = await s.post('/api/reservations/' + R1 + '/return', { returnDate: d(0), returnMileage: 1200, fuelLevelReturn: 'full' });
  log('109 return', [r.status, r.text.slice(0, 150)]);
  log('109 vehicle after return (expect needs_fixing kept, B-03)', await q('select availability_status,maintenance_status from vehicles where id=$1', [V1]));
  log('109/113 res status after return (B-02 expects completed)', await q('select status,end_date from reservations where id=$1', [R1]));

  // --- BUG-120 not_for_rental atomicity, with contract number ---
  const V2 = await mk('P36C-M2');
  r = await s.post('/api/reservations', { ...base, vehicleId: V2, startDate: d(0), endDate: d(3) });
  const R2 = r.json.id;
  await s.patch('/api/vehicles/' + V2, { availabilityStatus: 'not_for_rental' });
  const usedCn = CN();
  r = await s.post('/api/reservations/' + R2 + '/pickup', { contractNumber: usedCn, pickupMileage: 5000, fuelLevelPickup: 'full' });
  log('120 pickup not_for_rental (expect 4xx)', [r.status, r.text.slice(0, 180)]);
  log('120 row unchanged?', await q('select status,contract_number,pickup_mileage,actual_pickup_date from reservations where id=$1', [R2]));
  await s.patch('/api/vehicles/' + V2, { availabilityStatus: 'available' });
  r = await s.post('/api/reservations/' + R2 + '/pickup', { contractNumber: usedCn, pickupMileage: 5000, fuelLevelPickup: 'full' });
  log('120 pickup after fixing vehicle (expect 200 + document)', [r.status, r.text.slice(0, 160)]);
  log('120 documents', await q("select count(*) from documents where reservation_id=$1", [R2]));

  // --- BUG-113 full cycle ---
  const V3 = await mk('P36C-M3');
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, startDate: d(-7), endDate: d(-1) });
  const R3 = r.json.id;
  r = await s.post('/api/reservations/' + R3 + '/pickup', { contractNumber: CN(), pickupDate: d(-7), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('113 pickup', [r.status, r.text.slice(0, 140)]);
  r = await s.post('/api/reservations/' + R3 + '/return', { returnDate: d(-5), returnMileage: 1200, fuelLevelReturn: 'full' });
  log('113 return', [r.status, r.text.slice(0, 140)]);
  log('113 status after return (B-02: completed)', await q('select status,end_date from reservations where id=$1', [R3]));
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, customerId: CB, startDate: d(30), endDate: d(32) });
  log('113 future booking (expect 201)', [r.status, r.text.slice(0, 160)]);

  // --- BUG-130 ---
  const V4 = await mk('P36C-M4');
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, startDate: d(-2), endDate: d(1) });
  const R4 = r.json.id;
  r = await s.post('/api/reservations/' + R4 + '/pickup', { contractNumber: CN(), pickupDate: d(-2), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('130 pickup', [r.status, r.text.slice(0, 140)]);
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, customerId: CB, startDate: d(10), endDate: d(12) });
  log('130 second booking', [r.status, r.json && r.json.id]);
  log('130 vehicle after pickup', await q('select availability_status from vehicles where id=$1', [V4]));
  r = await s.patch('/api/reservations/' + R4 + '/status', { status: 'completed', departureMileage: 1500 });
  log('130 PATCH status completed', [r.status, r.text.slice(0, 160)]);
  log('130 vehicle after completed (expect available/scheduled)', await q('select availability_status from vehicles where id=$1', [V4]));

  // --- BUG-127 mileage ---
  const V5 = await mk('P36C-M5');
  r = await s.post('/api/reservations', { ...base, vehicleId: V5, startDate: d(-4), endDate: d(-1) });
  const R5 = r.json.id;
  r = await s.post('/api/reservations/' + R5 + '/pickup', { contractNumber: CN(), pickupDate: d(-4), pickupMileage: 39100, fuelLevelPickup: 'full' });
  log('127 pickup', [r.status, r.text.slice(0, 140)]);
  r = await s.post('/api/reservations/' + R5 + '/return', { returnDate: d(-1), returnMileage: 39300, fuelLevelReturn: 'full' });
  log('127 return', [r.status, r.text.slice(0, 140)]);
  r = await s.patch('/api/reservations/' + R5, { returnMileage: 30000 });
  log('127 PATCH returnMileage 30000 < pickup 39100 (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/reservations/' + R5, { pickupMileage: 45000 });
  log('127 PATCH pickupMileage 45000 > return (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/reservations/' + R5, { returnMileage: 39500 });
  log('127 PATCH returnMileage 39500', [r.status, r.text.slice(0, 120)]);
  log('127 db (vehicle mileage should follow)', await q('select r.pickup_mileage,r.return_mileage,v.current_mileage from reservations r join vehicles v on v.id=r.vehicle_id where r.id=$1', [R5]));

  // --- BUG-131 ---
  const V6 = await mk('P36C-M6');
  r = await s.post('/api/reservations', { ...base, vehicleId: V6, startDate: d(-3), endDate: d(1) });
  const R6 = r.json.id;
  r = await s.post('/api/reservations/' + R6 + '/pickup', { contractNumber: CN(), pickupDate: 'x', pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('131 pickup pickupDate=x (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.post('/api/reservations/' + R6 + '/pickup', { contractNumber: CN(), pickupDate: d(-2), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('131 pickup ok', [r.status, r.text.slice(0, 140)]);
  r = await s.post('/api/reservations/' + R6 + '/return', { returnDate: 'x', returnMileage: 1100, fuelLevelReturn: 'full' });
  log('131 return returnDate=x (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.post('/api/reservations/' + R6 + '/return', { returnDate: d(-9), returnMileage: 1100, fuelLevelReturn: 'full' });
  log('131 return before pickup (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.post('/api/reservations/' + R6 + '/return', { returnDate: d(30), returnMileage: 1100, fuelLevelReturn: 'full' });
  log('131 return in the future (expect 400)', [r.status, r.text.slice(0, 200)]);
  await pool.end();
})();

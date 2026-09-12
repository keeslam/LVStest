'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-V' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c19');
  const mk = async (tag) => {
    const plate = 'P36V' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'V', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return { id: rr.json.id, plate };
  };
  let r;
  // 127 warning on mileage correction
  const V = await mk('A');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V.id, startDate: d(-4), endDate: d(-1), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C v' });
  const R = r.json.id;
  await s.post('/api/reservations/' + R + '/pickup', { contractNumber: CN(), pickupDate: d(-4), pickupMileage: 39100, fuelLevelPickup: 'full' });
  await s.post('/api/reservations/' + R + '/return', { returnDate: d(-1), returnMileage: 39300, fuelLevelReturn: 'full' });
  r = await s.patch('/api/reservations/' + R, { returnMileage: 39500 });
  log('127 PATCH returnMileage 39500 -> response warning?', [r.status, (r.text.match(/"warning[^,}]*/g) || ['(none)']), (r.text.match(/"mileage[^,}]*/g) || [])]);
  log('127 vehicle mileage', await q('select current_mileage from vehicles where id=$1', [V.id]));

  // 132 override path for cancelling/deleting a picked-up rental
  const V2 = await mk('B');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V2.id, startDate: d(-1), endDate: d(3), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C v132' });
  const R2 = r.json.id;
  const c = CN();
  await s.post('/api/reservations/' + R2 + '/pickup', { contractNumber: c, pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  r = await s.patch('/api/reservations/' + R2 + '/status', { status: 'cancelled' });
  log('132 cancel picked_up', [r.status, await q('select status,contract_number from reservations where id=$1', [R2])]);
  // contract number reuse
  const V3 = await mk('C');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V3.id, startDate: d(-1), endDate: d(3), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C v132b' });
  const R3 = r.json.id;
  r = await s.post('/api/reservations/' + R3 + '/pickup', { contractNumber: c, pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('132 reuse the contract number of the cancelled picked_up rental', [r.status, r.text.slice(0, 180)]);

  // 148 blocked delete: no constraint/schema keys in the body
  const V4 = await mk('D');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V4.id, startDate: d(90), endDate: d(95), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C v148' });
  r = await s.del('/api/vehicles/' + V4.id, { confirmLicensePlate: V4.plate });
  log('148 blocked delete body', [r.status, /constraint|schema|detail|stack|\.ts:/i.test(r.text) ? 'LEAKS' : 'clean', r.text.slice(0, 200)]);
  await pool.end();
})();

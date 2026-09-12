// P36 agent D — BUG-159 second endpoint: PATCH /api/reservations/:id/basic under concurrency
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.63');
  const s2 = await L.staff('10.36.4.64');
  const T = L.today(); const D = (n) => L.addDays(T, n);
  const mkVehicle = async (plate, brand) => {
    const ex = await L.q('select id from vehicles where license_plate=$1', [plate]);
    if (ex[0]) return ex[0].id;
    const r = await st.post('/api/vehicles', { licensePlate: plate, brand, model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36D' + plate.replace(/-/g, ''), fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', notes: 'AUDIT-P36D basic fixture' });
    if (r.status >= 300) throw new Error('vehicle ' + plate + ' -> ' + L.short(r));
    return r.json.id;
  };
  const mkRes = async (body) => { const r = await st.post('/api/reservations', body); if (r.status >= 300) throw new Error('res -> ' + L.short(r)); return r.json.id; };

  const vA = await mkVehicle('AU-3E1-X', 'AUDIT-P36D BA');
  const vB = await mkVehicle('AU-3E2-X', 'AUDIT-P36D BB');
  const vT = await mkVehicle('AU-3E3-X', 'AUDIT-P36D BT');
  const start = D(280), end = D(285);
  const r1 = await mkRes({ vehicleId: vA, customerId: ids.cNormal, startDate: start, endDate: end, totalPrice: 100, notes: 'AUDIT-P36D basic A ' + Date.now() });
  const r2 = await mkRes({ vehicleId: vB, customerId: ids.cNormal, startDate: start, endDate: end, totalPrice: 100, notes: 'AUDIT-P36D basic B ' + Date.now() });
  const body = { vehicleId: vT, startDate: start, endDate: end, customerId: ids.cNormal, status: 'booked' };
  const [a, b] = await Promise.all([st.patch('/api/reservations/' + r1 + '/basic', body), s2.patch('/api/reservations/' + r2 + '/basic', body)]);
  const rows = await L.q("select id, vehicle_id, start_date, end_date, status from reservations where vehicle_id=$1 and deleted_at is null and status in ('booked','picked_up')", [vT]);
  const out = { vT, r1, r2, statuses: [a.status, b.status], bodies: [a.text.slice(0, 200), b.text.slice(0, 200)], rowsOnTarget: rows };
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-20-basic.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

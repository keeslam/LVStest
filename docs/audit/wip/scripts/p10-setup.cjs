// P10 setup: fleet AU-101-X .. AU-116-X and customers AUDIT-P10 A/B/C (+ portal customer 179 reuse).
'use strict';
const { getAdmin, q, pool, saveIds, loadIds, brief } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  ids.vehicles = ids.vehicles || {};
  ids.customers = ids.customers || {};
  for (let i = 101; i <= 118; i++) {
    const plate = `AU-${i}-X`;
    const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
    if (ex) { ids.vehicles[plate] = ex.id; continue; }
    const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P10', model: `P10-${i}`, vehicleType: 'car', currentMileage: 1000 * (i - 100), dailyPrice: '50' });
    console.log(plate, r.status, (r.text || '').slice(0, 120));
    if (r.status === 201 || r.status === 200) ids.vehicles[plate] = r.json.id;
  }
  for (const n of ['A', 'B', 'C']) {
    const name = `AUDIT-P10 Customer ${n}`;
    const [ex] = await q('select id from customers where name=$1', [name]);
    if (ex) { ids.customers[n] = ex.id; continue; }
    const r = await admin.post('/api/customers', { name, email: `audit-p10-${n.toLowerCase()}@example.com`, phone: '0600000000' });
    console.log(name, r.status, (r.text || '').slice(0, 120));
    if (r.status === 201 || r.status === 200) ids.customers[n] = r.json.id;
  }
  ids.portalCustomer = 179;
  ids.portalDrivers = [161, 23];
  saveIds(ids);
  console.log(JSON.stringify(ids, null, 1));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

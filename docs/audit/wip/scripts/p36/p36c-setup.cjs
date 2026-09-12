'use strict';
const { admin, q, pool, loadIds, saveIds } = require('./p36c-lib.cjs');
const TAG = 'AUDIT-P36C';
(async () => {
  const s = await admin('setup');
  const ids = loadIds();
  ids.vehicles = ids.vehicles || {};
  ids.customers = ids.customers || {};
  const plates = ['P36C-A', 'P36C-B', 'P36C-C', 'P36C-D', 'P36C-E', 'P36C-F', 'P36C-G', 'P36C-H'];
  for (const p of plates) {
    if (ids.vehicles[p]) continue;
    const r = await s.post('/api/vehicles', { licensePlate: p, brand: TAG, model: 'Probe', vehicleType: 'Personenauto', chassisNumber: 'CH' + p, currentMileage: 1000 });
    if (r.status !== 201) { console.log('veh fail', p, r.status, r.text.slice(0, 200)); continue; }
    ids.vehicles[p] = r.json.id;
  }
  for (const c of ['A', 'B']) {
    if (ids.customers[c]) continue;
    const r = await s.post('/api/customers', { name: TAG + ' Klant ' + c, email: `p36c-${c.toLowerCase()}@example.com`, phone: '0600000000', address: 'Straat 1', city: 'Amsterdam', postalCode: '1000AA', country: 'Nederland' });
    if (r.status !== 201) { console.log('cust fail', c, r.status, r.text.slice(0, 300)); continue; }
    ids.customers[c] = r.json.id;
  }
  saveIds(ids);
  console.log(JSON.stringify(ids, null, 1));
  await pool.end();
})();

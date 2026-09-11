// Phase 17: mutate lvs_audit_bk through the API after a backup was taken, so a
// restore can be proven to roll the mutations back. Creates AUDIT-P17 vehicle,
// customer, reservation; deletes one existing AUDIT- vehicle; changes a setting.
// usage: node p17-mutate.cjs <tag>
'use strict';
const { Session } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const tag = process.argv[2] || 'x';
  const s = new Session('p17m', { fakeIp: '10.17.1.' + (100 + Math.floor(Math.random() * 100)) });
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);
  const out = { tag };

  const v = await s.post('/api/vehicles', { licensePlate: `AU-17${tag}-X`, brand: `AUDIT-P17-${tag}`, model: 'Restore', vehicleType: 'Personenauto' });
  console.log('vehicle', v.status, (v.text || '').slice(0, 200));
  out.vehicle = v.json;
  const cu = await s.post('/api/customers', { name: `AUDIT-P17-${tag} klant`, email: `audit-p17-${tag}@example.com`, phone: '0600000000' });
  console.log('customer', cu.status, (cu.text || '').slice(0, 200));
  out.customer = cu.json;
  if (v.json?.id && cu.json?.id) {
    const today = new Date(); const d1 = new Date(today.getTime() + 40 * 86400000); const d2 = new Date(today.getTime() + 42 * 86400000);
    const iso = d => d.toISOString().slice(0, 10);
    const r = await s.post('/api/reservations', { vehicleId: v.json.id, customerId: cu.json.id, startDate: iso(d1), endDate: iso(d2), status: 'pending', type: 'standard', notes: `AUDIT-P17-${tag}` });
    console.log('reservation', r.status, (r.text || '').slice(0, 200));
    out.reservation = r.json;
  }
  // delete one existing AUDIT- vehicle that has no reservations
  const list = await s.get('/api/vehicles?limit=500');
  const arr = Array.isArray(list.json) ? list.json : (list.json?.data || list.json?.vehicles || []);
  const cand = arr.filter(x => /^AU-1[0-9]{2}-X$/.test(x.licensePlate || ''));
  console.log('AU-1xx-X candidates', cand.length);
  for (const cv of cand.slice(0, 5)) {
    const d = await s.del(`/api/vehicles/${cv.id}`, { confirmLicensePlate: cv.licensePlate });
    console.log('delete vehicle', cv.id, cv.licensePlate, d.status, (d.text || '').slice(0, 120));
    if (d.status < 300) { out.deletedVehicle = { id: cv.id, plate: cv.licensePlate }; break; }
  }
  // change a setting
  const st = await s.get('/api/app-settings');
  console.log('app-settings', st.status, (st.text || '').slice(0, 150));
  const put = await s.post('/api/app-settings', { key: 'audit_p17_marker', value: { tag }, category: 'general', description: 'AUDIT-P17 marker' });
  console.log('put setting', put.status, (put.text || '').slice(0, 200));
  out.setting = { status: put.status, body: put.json };
  fs.writeFileSync(path.join(__dirname, `files/p17/mutate-${tag}.json`), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

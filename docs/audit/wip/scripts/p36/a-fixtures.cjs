const { Session } = require('./lib.cjs');
const TS = Date.now().toString().slice(-7);
(async () => {
  const s = new Session('admin', { fakeIp: '10.36.1.1' });
  const lr = await s.loginStaff('admin', 'admin123');
  console.log('login', lr.status);
  // vehicle
  const v1 = await s.post('/api/vehicles', { licensePlate: 'P36A-V1-'+TS, brand: 'AUDIT-P36A', model: 'M1' });
  const v2 = await s.post('/api/vehicles', { licensePlate: 'P36A-V2-'+TS, brand: 'AUDIT-P36A', model: 'M2' });
  const v3 = await s.post('/api/vehicles', { licensePlate: 'P36A-V3-'+TS, brand: 'AUDIT-P36A', model: 'M3' });
  console.log('v', v1.status, v1.json && v1.json.id, v2.status, v2.json&&v2.json.id, v3.status, v3.json&&v3.json.id);
  const c1 = await s.post('/api/customers', { name: 'AUDIT-P36A-K1-'+TS, email: 'p36a-k1-'+TS+'@example.com' });
  const c2 = await s.post('/api/customers', { name: 'AUDIT-P36A-K2-'+TS, email: 'p36a-k2-'+TS+'@example.com' });
  console.log('c', c1.status, c1.json&&c1.json.id, c2.status, c2.json&&c2.json.id);
  require('fs').writeFileSync('a-fixtures.json', JSON.stringify({
    ts: TS,
    v1: v1.json&&v1.json.id, v2: v2.json&&v2.json.id, v3: v3.json&&v3.json.id,
    p1: 'P36A-V1-'+TS, p2: 'P36A-V2-'+TS, p3: 'P36A-V3-'+TS,
    c1: c1.json&&c1.json.id, c2: c2.json&&c2.json.id
  }, null, 1));
  console.log(require('fs').readFileSync('a-fixtures.json','utf8'));
})();

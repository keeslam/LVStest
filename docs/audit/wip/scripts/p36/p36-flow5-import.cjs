// Flow 5: bulkimport (incl. B-12 onleesbare datums)
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
(async () => {
  const s = new Session('sweep'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const tag = 'P36IMP' + Math.floor(Math.random() * 900 + 100);
  const rows = [
    { licensePlate: tag + 'A', brand: 'AUDIT-P36W', model: 'Goed', vehicleType: 'personenauto', apkDate: '31-12-2027', fuelType: 'benzine' },   // NL dd-mm-yyyy
    { licensePlate: tag + 'B', brand: 'AUDIT-P36W', model: 'ISO', vehicleType: 'personenauto', apkDate: '2027-12-31', fuelType: 'benzine' },   // ISO
    { licensePlate: tag + 'C', brand: 'AUDIT-P36W', model: 'Onleesbaar', vehicleType: 'personenauto', apkDate: 'geen idee', fuelType: 'benzine' }, // unreadable -> B-12: reject the row
    { licensePlate: tag + 'D', brand: 'AUDIT-P36W', model: 'Leeg', vehicleType: 'personenauto', apkDate: '', fuelType: 'benzine' },
    { licensePlate: '', brand: 'AUDIT-P36W', model: 'Geen kenteken', vehicleType: 'personenauto', fuelType: 'benzine' },                       // no plate
  ];
  const r = await s.post('/api/vehicles/bulk-import-csv', { vehicles: rows });
  step('1. bulkimport van 5 rijen', r.status === 200 || r.status === 201, 'HTTP ' + r.status);
  const body = r.json || {};
  step('2. resultaat per rij', Array.isArray(body.failed) || Array.isArray(body.imported),
    'geimporteerd=' + ((body.imported || []).length) + ' afgekeurd=' + ((body.failed || []).length));
  console.log('   afgekeurd:', JSON.stringify(body.failed || []).slice(0, 500));
  console.log('   geimporteerd:', (body.imported || []).map(v => v.licensePlate).join(', '));

  const bad = (body.failed || []).find(f => String(f.licensePlate).endsWith('C'));
  step('3. onleesbare datum wordt afgekeurd met een melding (B-12)', !!bad,
    bad ? 'rij ' + bad.licensePlate + ': ' + bad.error : 'rij C werd NIET afgekeurd — stil weggelaten of stil geimporteerd');

  // what actually landed in the database
  const q = await s.get('/api/vehicles?search=' + tag);
  const list = Array.isArray(q.json) ? q.json : (q.json && q.json.data) || [];
  const mine = list.filter(v => String(v.licensePlate).startsWith(tag));
  step('4. in de database', true, mine.map(v => v.licensePlate + ' apk=' + (v.apkDate || 'null')).join(' | ') || '(niets gevonden via zoeken)');
  fs.writeFileSync(__dirname + '/flow5.json', JSON.stringify({ tag, body, steps: T }, null, 1));
  console.log('\nTAG=' + tag);
})();

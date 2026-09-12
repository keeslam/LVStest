const { Session } = require('./lib.cjs');
const PW = 'P36brgss!23';
function log(tag, r, extra) { console.log(tag.padEnd(58), r.status, (extra===undefined?r.text:extra).toString().slice(0,180).replace(/\s+/g,' ')); }
(async () => {
  const admin = new Session('admin', { fakeIp: '198.51.100.11' });
  console.log('admin', (await admin.loginStaff('admin','admin123')).status);
  const nobody = new Session('nobody', { fakeIp: '198.51.100.21' });
  console.log('nobody', (await nobody.loginStaff('AUDIT-P36B-nobody', PW)).status);
  const viewer = new Session('viewer', { fakeIp: '198.51.100.22' });
  console.log('viewer', (await viewer.loginStaff('AUDIT-P36B-viewer', PW)).status);
  const manager = new Session('manager', { fakeIp: '198.51.100.23' });
  console.log('manager', (await manager.loginStaff('AUDIT-P36B-manager', PW)).status);

  console.log('\n--- BUG-064 DELETE /api/reservations/:id as nobody ---');
  // make our own reservation to delete
  const cust = await admin.get('/api/customers?limit=1');
  const custId = (cust.json && (cust.json.data?cust.json.data[0]:cust.json[0]) || {}).id;
  const resNew = await admin.post('/api/reservations', { vehicleId: 2, customerId: custId, startDate: '2027-03-01', endDate: '2027-03-05', status: 'pending', type: 'standard' });
  log('admin create reservation (fixture)', resNew);
  const rid = resNew.json && resNew.json.id;
  if (rid) log('nobody DELETE /api/reservations/'+rid, await nobody.del('/api/reservations/'+rid));

  console.log('\n--- BUG-065 interactive-damage-checks as nobody ---');
  log('nobody GET  /api/interactive-damage-checks', await nobody.get('/api/interactive-damage-checks'), '');
  log('nobody GET  /api/interactive-damage-checks/1', await nobody.get('/api/interactive-damage-checks/1'), '');
  log('nobody POST /api/interactive-damage-checks', await nobody.post('/api/interactive-damage-checks', {vehicleId:2}));
  log('nobody PUT  /api/interactive-damage-checks/1', await nobody.put('/api/interactive-damage-checks/1', {notes:'AUDIT-P36B'}));
  log('nobody GET  /api/interactive-damage-checks/1/pdf', await nobody.get('/api/interactive-damage-checks/1/pdf'), '');
  log('nobody GET  /api/vehicles/2/damage-check-pdf', await nobody.get('/api/vehicles/2/damage-check-pdf'), '');
  log('nobody DEL  /api/interactive-damage-checks/14', await nobody.del('/api/interactive-damage-checks/14'));

  console.log('\n--- BUG-066 vehicle-diagram-templates ---');
  log('nobody PATCH /api/vehicle-diagram-templates/1', await nobody.patch('/api/vehicle-diagram-templates/1', {name:'AUDIT-P36B'}));
  log('viewer PATCH /api/vehicle-diagram-templates/1', await viewer.patch('/api/vehicle-diagram-templates/1', {name:'AUDIT-P36B'}));
  log('nobody DEL   /api/vehicle-diagram-templates/1', await nobody.del('/api/vehicle-diagram-templates/1'));
  log('nobody POST  /api/vehicle-diagram-templates', await nobody.post('/api/vehicle-diagram-templates', {name:'AUDIT-P36B'}));

  console.log('\n--- BUG-067 contract-number-override ---');
  log('nobody DEL  /api/settings/contract-number-override', await nobody.del('/api/settings/contract-number-override'));
  log('viewer DEL  /api/settings/contract-number-override', await viewer.del('/api/settings/contract-number-override'));
  log('nobody POST /api/settings/contract-number-override', await nobody.post('/api/settings/contract-number-override', {overrideNumber: 999123}));

  console.log('\n--- BUG-068 placeholder/spare ---');
  log('nobody GET /api/placeholder-reservations', await nobody.get('/api/placeholder-reservations'), '');
  log('nobody GET /api/placeholder-reservations/needing-assignment', await nobody.get('/api/placeholder-reservations/needing-assignment'), '');
  log('nobody GET /api/vehicles/2/customers-with-reservations', await nobody.get('/api/vehicles/2/customers-with-reservations'), '');
  log('nobody GET /api/spare-vehicles/available', await nobody.get('/api/spare-vehicles/available'), '');
  log('nobody POST /api/placeholder-reservations', await nobody.post('/api/placeholder-reservations', {customerId: custId, startDate:'2027-04-01', endDate:'2027-04-02'}));

  console.log('\n--- BUG-103 :id fuzz as admin ---');
  for (const p of ['/api/settings/abc','/api/settings/%00','/api/settings/'+('9'.repeat(5000)),'/api/app-settings/abc','/api/expenses/abc','/api/custom-notifications/abc','/api/damage-check-templates/abc','/api/vehicle-diagram-templates/abc','/api/interactive-damage-checks/abc','/api/barcodes/abc']) {
    log('admin GET '+p.slice(0,60), await admin.get(p));
  }

  console.log('\n--- BUG-088 / BUG-089 ---');
  log('admin GET /api/damage-check-templates/by-vehicle?vehicleId=2', await admin.get('/api/damage-check-templates/by-vehicle?vehicleId=2'), '');
  log('viewer GET /api/damage-check-templates/by-vehicle?vehicleId=2', await viewer.get('/api/damage-check-templates/by-vehicle?vehicleId=2'), '');
  log('admin GET /api/reports/maintenance-costs', await admin.get('/api/reports/maintenance-costs'), '');
  log('admin GET /api/reports/maintenance-costs?startDate=2026-01-01&endDate=2026-12-31', await admin.get('/api/reports/maintenance-costs?startDate=2026-01-01&endDate=2026-12-31'), '');

  console.log('\n--- BUG-104 ---');
  log('admin POST /api/interactive-damage-checks {}', await admin.post('/api/interactive-damage-checks', {}));
})().catch(e=>{console.error('FATAL', e);});

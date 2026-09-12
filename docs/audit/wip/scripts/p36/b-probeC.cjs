const { Session } = require('./lib.cjs');
const fs = require('fs');
const PW = 'P36brgss!23';
const CANARY = 'C:/Users/kees lam/Desktop/LVStest-main/LVStest-main/docs/audit/wip/scripts/p36/b-canary.txt';
function log(t, r, x) { console.log(t.padEnd(60), r.status, (x===undefined?r.text:x).toString().slice(0,220).replace(/\s+/g,' ')); }
(async () => {
  const m = new Session('manager', { fakeIp: '198.51.100.43' });
  console.log('manager login', (await m.loginStaff('AUDIT-P36B-manager', PW)).status);
  console.log('canary exists before:', fs.existsSync(CANARY));
  log('PATCH pdf-templates/2 backgroundPath=<canary, cwd-relative>', await m.patch('/api/pdf-templates/2', {backgroundPath:'docs/audit/wip/scripts/p36/b-canary.txt'}));
  log('DELETE /api/pdf-templates/2/background', await m.del('/api/pdf-templates/2/background'));
  console.log('CANARY EXISTS AFTER DELETE:', fs.existsSync(CANARY));
  log('PATCH pdf-templates/2 restore default background', await m.patch('/api/pdf-templates/2', {backgroundPath:'uploads/templates/rental_contract_template.pdf'}));

  console.log('\n--- BUG-071 with a schema-valid body ---');
  for (const h of [['127.0.0.1',5432],['169.254.169.254',80],['nonexistent.invalid',21],['ftp.cjib.nl',21],['example.com',21]]) {
    log('POST cjib-config/test '+h[0]+':'+h[1], await m.post('/api/fines/cjib-config/test', {enabled:true, host:h[0], port:h[1], username:'a', password:'b', secure:'explicit', filePattern:'.*'}));
  }

  console.log('\n--- BUG-066/070 damage-check-templates verb check ---');
  log('PUT /api/damage-check-templates/1 {backgroundPath}', await m.put('/api/damage-check-templates/1', {backgroundPath:'../../AUDIT-P36B-canary.txt'}));
  log('GET /api/damage-check-templates/1', await m.get('/api/damage-check-templates/1'), '');
  log('PATCH /api/report-and-label-templates/1 {backgroundPath}', await m.patch('/api/report-and-label-templates/1', {backgroundPath:'../../AUDIT-P36B-canary.txt'}));
})().catch(e=>console.error('FATAL',e));

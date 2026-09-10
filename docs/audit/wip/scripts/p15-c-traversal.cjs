'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Session } = require('./lib.cjs');
const FILES = path.join(__dirname, 'files', 'p15');
const BASE = 'http://localhost:5001';
function upload(pathUrl, fields, fileField, filename, contentType, buffer, ch, csrf) {
  return new Promise((resolve) => {
    const boundary = '----P15C' + Date.now() + Math.random().toString(36).slice(2);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
    parts.push(buffer); parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const u = new URL(BASE + pathUrl);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, 'Cookie': ch, 'X-CSRF-Token': csrf } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 500), headers: res.headers })); });
    req.on('error', e => resolve({ status: 0, body: 'ERR ' + e.message })); req.write(body); req.end();
  });
}
const buf = f => fs.readFileSync(path.join(FILES, f));
(async () => {
  const s = new Session('p15c', { fakeIp: '10.15.1.12' });
  console.log('login', (await s.loginStaff('admin', 'admin123')).status);
  const ch = s.cookieHeader(), csrf = s.csrf; const R = {};

  // BACKUP UPLOAD backslash traversal (Windows). Net two-up from repoRoot/backups -> parent dir 'LVStest-main' -> audit-uploads.
  const back = '..\\\\..\\\\..\\\\audit-uploads\\\\AUDIT-p15-esc.sql';
  let r = await upload('/api/backups/upload', { type: 'database' }, 'backup', back, 'application/sql', Buffer.from('-- AUDIT p15 backslash escape marker\n'), ch, csrf);
  const realAudit = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-uploads\\AUDIT-p15-esc.sql';
  R.backslash = { status: r.status, escaped: fs.existsSync(realAudit), body: r.body.slice(0,260) };
  console.log('backslash upload', r.status, 'escaped=', R.backslash.escaped);
  console.log('   manifest:', r.body.slice(0,240));

  // Also try single-level backslash to see where it lands inside repo
  r = await upload('/api/backups/upload', { type: 'database' }, 'backup', 'sub\\\\AUDIT-p15-sub.sql', 'application/sql', Buffer.from('x\n'), ch, csrf);
  R.backslashSub = { status: r.status, body: r.body.slice(0,200) };
  console.log('backslashSub', r.status, r.body.slice(0,160));

  // DRIVER LICENSE valid (displayName) + serve headers (route uses res.sendFile w/o Content-Type)
  const cust = await s.get('/api/customers?limit=1');
  const custId = (cust.json && (cust.json[0]?.id)) || 2;
  r = await upload(`/api/customers/${custId}/drivers`, { displayName: 'AUDIT-P15-Driver' }, 'licenseFile', 'lic.jpg', 'image/jpeg', buf('valid.jpg'), ch, csrf);
  let drvId = null; try { drvId = JSON.parse(r.body).id; } catch {}
  R.driverValid = { status: r.status, drvId, body: r.body.slice(0,120) };
  console.log('driverValid', r.status, 'drvId', drvId);
  if (drvId) {
    const v = await s.get(`/api/drivers/${drvId}/license`);
    R.driverServe = { status: v.status, ct: v.headers.get('content-type'), cd: v.headers.get('content-disposition'), xcto: v.headers.get('x-content-type-options'), len: v.text.length };
    console.log('driverServe', v.status, 'ct=', v.headers.get('content-type'), 'cd=', v.headers.get('content-disposition'), 'nosniff=', v.headers.get('x-content-type-options'));
  }
  fs.writeFileSync(path.join(__dirname, 'p15-c-traversal.out.json'), JSON.stringify(R, null, 2));
  console.log('DONE');
})();

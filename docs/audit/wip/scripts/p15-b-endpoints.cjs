'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Session } = require('./lib.cjs');
const FILES = path.join(__dirname, 'files', 'p15');
const BASE = 'http://localhost:5001';

function upload(pathUrl, fields, fileField, filename, contentType, buffer, cookieHeader, csrf) {
  return new Promise((resolve) => {
    const boundary = '----P15B' + Date.now() + Math.random().toString(36).slice(2);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    if (fileField) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
      parts.push(buffer); parts.push(Buffer.from(`\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const u = new URL(BASE + pathUrl);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, 'Cookie': cookieHeader, 'X-CSRF-Token': csrf } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 500), headers: res.headers })); });
    req.on('error', e => resolve({ status: 0, body: 'ERR ' + e.message }));
    req.write(body); req.end();
  });
}
const buf = f => fs.readFileSync(path.join(FILES, f));

(async () => {
  const s = new Session('p15b', { fakeIp: '10.15.1.11' });
  console.log('login', (await s.loginStaff('admin', 'admin123')).status);
  const ch = s.cookieHeader(), csrf = s.csrf;
  const R = {};

  // Get a customer for driver license
  const cust = await s.get('/api/customers?limit=1');
  const custId = (cust.json && (cust.json[0]?.id || cust.json.customers?.[0]?.id)) || 1;
  console.log('customerId', custId);

  // DRIVER LICENSE: valid, empty, wrong ext
  let r = await upload(`/api/customers/${custId}/drivers`, { name: 'AUDIT-P15-Driver' }, 'licenseFile', 'lic.pdf', 'application/pdf', buf('valid.pdf'), ch, csrf);
  R.driverValid = { status: r.status, body: r.body.slice(0,150) };
  let drvId = null; try { drvId = JSON.parse(r.body).id; } catch {}
  console.log('driverValid', r.status, 'drvId', drvId);
  r = await upload(`/api/customers/${custId}/drivers`, { name: 'AUDIT-P15-Driver2' }, 'licenseFile', 'empty.pdf', 'application/pdf', buf('empty.pdf'), ch, csrf);
  R.driverEmpty = { status: r.status, body: r.body.slice(0,150) }; console.log('driverEmpty', r.status, r.body.slice(0,120));
  // serve license, check headers/content-type (route uses res.sendFile w/o explicit content-type)
  if (drvId) { const v = await s.get(`/api/drivers/${drvId}/license`); R.driverServe = { status: v.status, ct: v.headers.get('content-type'), cd: v.headers.get('content-disposition'), xcto: v.headers.get('x-content-type-options') }; console.log('driverServe', v.status, v.headers.get('content-type'), '| cd', v.headers.get('content-disposition')); }

  // PDF TEMPLATE background: oversize (huge.pdf > 10MB) -> expect 500 stack (BUG-030 class)
  const tpls = await s.get('/api/pdf-templates');
  const tplId = (tpls.json && tpls.json[0] && tpls.json[0].id);
  console.log('tplId', tplId);
  if (tplId) {
    r = await upload(`/api/pdf-templates/${tplId}/background`, {}, 'background', 'big.pdf', 'application/pdf', buf('huge.pdf'), ch, csrf);
    R.tplBgHuge = { status: r.status, body: r.body.slice(0,200) }; console.log('tplBgHuge', r.status, r.body.slice(0,150));
  }

  // BACKUP UPLOAD traversal via originalname (BUG-076 re-confirm, write into audit-uploads only)
  const trav = '../../audit-uploads/AUDIT-p15-traversal.sql';
  r = await upload('/api/backups/upload', { type: 'database' }, 'backup', trav, 'application/sql', Buffer.from('-- AUDIT p15 traversal marker\nSELECT 1;\n'), ch, csrf);
  R.backupTraversal = { status: r.status, body: r.body.slice(0,300) };
  const travTarget = path.resolve(process.cwd(), '..', 'audit-uploads', 'AUDIT-p15-traversal.sql');
  R.backupTraversal.landedOutside = fs.existsSync(travTarget);
  R.backupTraversal.target = travTarget;
  console.log('backupTraversal', r.status, 'landedOutside=', R.backupTraversal.landedOutside, r.body.slice(0,150));

  // BACKUP DOWNLOAD traversal attempts (BUG-097 area - expect blocked)
  for (const fn of ['..%2f..%2fpackage.json', '..\\..\\package.json', '....//package.json']) {
    const v = await s.get('/api/backups/download/' + encodeURIComponent(fn));
    R['backupDl_' + fn] = { status: v.status, body: v.text.slice(0,80) };
    console.log('backupDl', JSON.stringify(fn), v.status, v.text.slice(0,60));
  }

  // CJIB import: valid CSV, malformed XML (expect graceful)
  const csv = 'beschikkingsnummer;kenteken;pleegdatum;sanctiebedrag\nAUDIT-P15-001;AU-15A-X;01-02-2026;95,00\n';
  r = await upload('/api/fines/imports/upload', {}, 'file', 'audit-p15.csv', 'text/csv', Buffer.from(csv), ch, csrf);
  R.cjibCsv = { status: r.status, body: r.body.slice(0,250) }; console.log('cjibCsv', r.status, r.body.slice(0,150));
  r = await upload('/api/fines/imports/upload', {}, 'file', 'audit-p15-bad.xml', 'application/xml', Buffer.from('<broken><unclosed>'), ch, csrf);
  R.cjibBadXml = { status: r.status, body: r.body.slice(0,250) }; console.log('cjibBadXml', r.status, r.body.slice(0,150));
  // wrong extension for cjib (no fileFilter, ext-check after)
  r = await upload('/api/fines/imports/upload', {}, 'file', 'audit-p15.exe', 'application/octet-stream', Buffer.from('MZ'), ch, csrf);
  R.cjibExe = { status: r.status, body: r.body.slice(0,150) }; console.log('cjibExe', r.status, r.body.slice(0,120));

  fs.writeFileSync(path.join(__dirname, 'p15-b-endpoints.out.json'), JSON.stringify(R, null, 2));
  console.log('DONE');
})();

// BUG-092 / BUG-105 portal auth limiters, BUG-086 multipart sanitizer,
// BUG-072 receiptUrl scheme, BUG-073 licenseFilePath.
const { Session, BASE } = require('./lib.cjs');
const PW = 'P36brgss!23';
function log(t, r, x) { console.log(t.padEnd(56), r.status, (x === undefined ? r.text : x).toString().slice(0, 240).replace(/\s+/g, ' ')); }
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

function multipart(fields, file) {
  const b = '----AUDITP36B' + Date.now() + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
  if (file) {
    parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + file.field + '"; filename="' + file.name + '"\r\nContent-Type: ' + file.type + '\r\n\r\n'));
    parts.push(file.data); parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from('--' + b + '--\r\n'));
  return { body: Buffer.concat(parts), ct: 'multipart/form-data; boundary=' + b };
}

(async () => {
  console.log('=== BUG-105 / BUG-092 : portal forgot vs staff login, one IP ===');
  const IP = '203.0.113.200';
  const p = new Session('portal', { fakeIp: IP });
  let firstForgot429 = null;
  for (let i = 1; i <= 14; i++) {
    const r = await p.post('/api/portal/forgot', { email: 'portaal-test@example.com' });
    if (i <= 3 || r.status === 429 || i === 14) console.log('  forgot #' + i, r.status, r.text.slice(0, 90));
    if (r.status === 429 && firstForgot429 === null) firstForgot429 = i;
  }
  console.log('first 429 on /api/portal/forgot at request #', firstForgot429);
  const s = new Session('staff', { fakeIp: IP });
  const sl = await s.loginStaff('AUDIT-P36B-manager', PW);
  console.log('staff POST /api/login from the SAME ip after the forgot flood ->', sl.status, sl.text.slice(0, 100));
  const pl = new Session('portallogin', { fakeIp: IP });
  const plr = await pl.loginPortal('portaal-test@example.com', 'P36portal!23');
  console.log('portal login from the same IP ->', plr.status, plr.text.slice(0, 100));

  console.log('\n=== BUG-086 : sanitizer on JSON vs multipart ===');
  const pu = new Session('pu', { fakeIp: '203.0.113.201' });
  const lp = await pu.loginPortal('portaal-test@example.com', 'P36portal!23');
  console.log('portal login', lp.status, lp.text.slice(0, 120));
  if (lp.status === 200) {
    const payloadA = 'AUDIT-P36B-JSON-<a href="javascript:alert(3)">click</a>';
    const a = await pu.post('/api/portal/requests', { type: 'other', message: payloadA });
    log('JSON      POST /api/portal/requests', a);
    const payloadB = 'AUDIT-P36B-MULTIPART-<a href="javascript:alert(3)">click</a>';
    const mp = multipart({ type: 'other', message: payloadB }, { field: 'attachments', name: 'AUDIT-P36B.pdf', type: 'application/pdf', data: PDF });
    const bres = await pu.request('POST', '/api/portal/requests', mp.body, { raw: true, headers: { 'Content-Type': mp.ct } });
    log('MULTIPART POST /api/portal/requests', bres);
  }

  console.log('\n=== BUG-072 : receiptUrl scheme validation ===');
  const m = new Session('mgr', { fakeIp: '203.0.113.202' });
  console.log('manager login', (await m.loginStaff('AUDIT-P36B-manager', PW)).status);
  log('POST /api/expenses receiptUrl=javascript:alert(1)', await m.post('/api/expenses', { vehicleId: 2, category: 'AUDIT-P36B-xss', amount: '1.00', date: '2026-01-01', receiptUrl: 'javascript:alert(1)' }));
  log('POST /api/expenses receiptUrl=C:\\\\local\\\\path.pdf', await m.post('/api/expenses', { vehicleId: 2, category: 'AUDIT-P36B-xss2', amount: '1.00', date: '2026-01-01', receiptUrl: 'C:' + String.fromCharCode(92) + 'local' + String.fromCharCode(92) + 'bon.pdf' }));
  log('POST /api/expenses receiptUrl=https://ok.example/x.pdf', await m.post('/api/expenses', { vehicleId: 2, category: 'AUDIT-P36B-xss3', amount: '1.00', date: '2026-01-01', receiptUrl: 'https://ok.example/x.pdf' }));

  console.log('\n=== BUG-073 : licenseFilePath from a portal driver create ===');
  if (lp.status === 200) {
    const d = await pu.post('/api/portal/drivers', { firstName: 'AUDIT', lastName: 'P36B', licenseNumber: 'AP36B1', licenseFilePath: 'x" onmouseover="AUDITP36B' });
    log('portal POST /api/portal/drivers w/ licenseFilePath', d);
  }
})().catch((e) => console.error('FATAL', e));

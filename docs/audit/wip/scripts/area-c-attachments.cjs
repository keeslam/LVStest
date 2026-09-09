// Area C10: attachment fuzz for POST /api/portal/requests (multipart)
'use strict';
const { Session, BASE } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2).slice(0, 1000)); }

async function postMultipart(session, fields, files) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append('attachments', new Blob([f.data], { type: f.type }), f.name);
  const headers = {};
  if (session.cookieHeader()) headers['Cookie'] = session.cookieHeader();
  if (session.csrf) headers['X-CSRF-Token'] = session.csrf;
  const res = await fetch(BASE + '/api/portal/requests', { method: 'POST', headers, body: form });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

async function main() {
  const s = new Session('c-attach', { fakeIp: '10.96.1.1' });
  await s.get('/api/portal/csrf-token');
  await s.loginPortal('portaal-test@example.com', 'portaal-test-1234');

  // 6 attachments (limit is 5)
  {
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `audit-${i}.pdf`, type: 'application/pdf', data: Buffer.from('%PDF-1.4\n%AUDIT fixture ' + i) }));
    const r = await postMultipart(s, { type: 'other', message: 'AUDIT 6 attachments', payload: '{}' }, files);
    log('C10 6 attachments (limit 5)', { status: r.status, body: r.json });
  }

  // 15MB single attachment (limit 10MB)
  {
    const big = Buffer.alloc(15 * 1024 * 1024, 'A');
    // give it a plausible PDF header so it isn't rejected purely on magic-byte before size check
    Buffer.from('%PDF-1.4\n').copy(big, 0);
    const r = await postMultipart(s, { type: 'other', message: 'AUDIT 15MB attachment', payload: '{}' }, [{ name: 'audit-big.pdf', type: 'application/pdf', data: big }]);
    log('C10 15MB attachment (limit 10MB)', { status: r.status, body: r.json });
  }

  // .exe renamed .pdf
  {
    // minimal MZ header (real PE executable signature) so magic-byte sniffing sees "exe", named .pdf
    const exeBytes = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), Buffer.alloc(100, 0)]);
    const r = await postMultipart(s, { type: 'other', message: 'AUDIT exe renamed pdf', payload: '{}' }, [{ name: 'audit-payload.pdf', type: 'application/pdf', data: exeBytes }]);
    log('C10 .exe renamed .pdf (magic-byte check)', { status: r.status, body: r.json });
  }

  fs.writeFileSync(path.join(__dirname, 'area-c-attachments-results.json'), JSON.stringify(results, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });

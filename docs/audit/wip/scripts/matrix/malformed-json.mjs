// Step 5: malformed JSON / wrong content-type on 10 representative mutating
// endpoints, as admin. Expect 400; record 5xx.
import fs from 'fs';
import path from 'path';
import { Session, sessionFile, BASE } from './lib.mjs';

const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';
const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'ids.json'), 'utf8'));

// AM-xxx workaround: apiLimiter's skip-for-authenticated-users check never fires (see
// run-matrix.mjs comment / server/index.ts:174 vs server/auth.ts:187); use a dedicated IP so this
// script's requests don't collide with the shared 1000/15min-per-real-IP bucket.
const FORWARDED_FOR = '10.20.30.12';
const admin = new Session('admin');
admin.loadFrom(sessionFile('admin'));

const targets = [
  { method: 'POST', path: '/api/vehicles' },
  { method: 'POST', path: '/api/customers' },
  { method: 'POST', path: '/api/reservations' },
  { method: 'PATCH', path: `/api/vehicles/${ids.vehicle}` },
  { method: 'PATCH', path: `/api/reservations/${ids.reservation}` },
  { method: 'POST', path: '/api/users' },
  { method: 'POST', path: '/api/fines' },
  { method: 'PUT', path: '/api/system-settings' },
  { method: 'POST', path: '/api/pdf-templates' },
  { method: 'PATCH', path: `/api/customers/${ids.customer}` },
];

const goodBody = JSON.stringify({ __audit_probe: true });

async function rawFetch(method, p, body, headers) {
  const h = Object.assign({}, headers);
  if (admin.cookieHeader()) h['Cookie'] = admin.cookieHeader();
  if (!['GET','HEAD'].includes(method) && admin.csrf) h['X-CSRF-Token'] = admin.csrf;
  h['X-Forwarded-For'] = FORWARDED_FOR;
  const res = await fetch(BASE + p, { method, headers: h, body, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes: buf.length, text: buf.toString('utf8').slice(0, 400) };
}

async function main() {
  const rows = [];
  for (const t of targets) {
    // 1) wrong content-type: text/plain with JSON body
    let r = await rawFetch(t.method, t.path, goodBody, { 'Content-Type': 'text/plain' });
    rows.push({ endpoint: `${t.method} ${t.path}`, scenario: 'text/plain content-type, JSON body', status: r.status, bytes: r.bytes, flag: r.status >= 500 ? '5xx' : (r.status === 400 ? '' : 'unexpected'), snippet: r.status >= 500 ? r.text : '' });

    // 2) truncated JSON
    const truncated = '{"a": 1, "b": [1,2,3'; // deliberately unclosed
    r = await rawFetch(t.method, t.path, truncated, { 'Content-Type': 'application/json' });
    rows.push({ endpoint: `${t.method} ${t.path}`, scenario: 'truncated JSON', status: r.status, bytes: r.bytes, flag: r.status >= 500 ? '5xx' : (r.status === 400 ? '' : 'unexpected'), snippet: r.status >= 500 ? r.text : '' });

    // 3) 2MB body
    const big = JSON.stringify({ __audit_probe: true, filler: 'A'.repeat(2 * 1024 * 1024) });
    r = await rawFetch(t.method, t.path, big, { 'Content-Type': 'application/json' });
    rows.push({ endpoint: `${t.method} ${t.path}`, scenario: '2MB JSON body', status: r.status, bytes: r.bytes, flag: r.status >= 500 ? '5xx' : '', snippet: r.status >= 500 ? r.text : '' });
  }
  fs.writeFileSync(path.join(DIR, 'malformed-json-results.json'), JSON.stringify(rows, null, 2));
  console.log('DONE', rows.length, '5xx:', rows.filter(r => r.flag === '5xx').length);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

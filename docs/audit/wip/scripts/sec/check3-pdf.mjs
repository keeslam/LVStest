// Creates a reservation for the XSS-tainted customer/vehicle (check3-ids.json),
// generates the contract PDF, and extracts its text (pdfjs-dist) to verify the
// stored XSS payload renders as literal PDF text (pdf-lib drawText, no markup).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5001';

function parseSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}
class Jar {
  constructor() { this.map = new Map(); }
  ingest(cookies) {
    for (const sc of cookies) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      this.map.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }
  header() { return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  get(n) { return this.map.get(n); }
}
const AUDIT_XFF = process.env.AUDIT_XFF || null;
async function req(jar, method, p, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (AUDIT_XFF && !headers['X-Forwarded-For']) headers['X-Forwarded-For'] = AUDIT_XFF;
  if (jar) { const c = jar.header(); if (c) headers['Cookie'] = c; }
  let body = opts.body;
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
  const res = await fetch(p.startsWith('http') ? p : BASE + p, { method, headers, body, redirect: 'manual' });
  if (jar) jar.ingest(parseSetCookies(res.headers));
  return res;
}

function jarFile() { return path.join(__dirname, '.jar-staff.json'); }

(async () => {
  const jar = new Jar();
  // Reuse the shared saved admin session if there is one (the loginLimiter is a
  // single shared IP-keyed bucket across /api/login + 3 portal auth routes, max
  // 5/15min - see sr-lib.cjs getOrLoginStaff and security-runtime.md SR-003).
  let reused = false;
  try {
    const saved = JSON.parse(fs.readFileSync(jarFile(), 'utf8'));
    for (const [k, v] of saved) jar.map.set(k, v);
    const check = await req(jar, 'GET', '/api/user');
    reused = check.status === 200;
  } catch {}
  if (!reused) {
    await req(jar, 'GET', '/api/user');
    const csrf0 = jar.get('XSRF-TOKEN');
    const loginRes = await req(jar, 'POST', '/api/login', { headers: { 'X-CSRF-Token': csrf0 }, json: { username: 'admin', password: 'admin123' } });
    if (loginRes.status === 200) fs.writeFileSync(jarFile(), JSON.stringify([...jar.map.entries()]));
    else { console.log('LOGIN FAILED', loginRes.status, await loginRes.text()); return; }
  }
  console.log('session reused from saved jar:', reused);

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'check3-ids.json'), 'utf8'));
  console.log('Using ids:', ids);

  // BUG-047 (already known/documented): the XSRF-TOKEN cookie issued on the
  // /api/login response itself is generated against the pre-regenerate() session
  // secret and will not validate. Do one intervening GET first, like every other
  // authenticated route does, to get a token tied to the post-login session.
  await req(jar, 'GET', '/api/user');
  const csrf = jar.get('XSRF-TOKEN');
  const resvRes = await req(jar, 'POST', '/api/reservations', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      vehicleId: ids.vehicleId,
      customerId: ids.customerId,
      startDate: '2026-11-15',
      endDate: '2026-11-17',
      notes: 'AUDIT-security-runtime-check3-pdf',
    },
  });
  const resvText = await resvRes.text();
  console.log('reservation create status:', resvRes.status, resvText.slice(0, 400));
  let reservationId = null;
  try { reservationId = JSON.parse(resvText).id; } catch {}
  if (!reservationId) { console.log('NO RESERVATION ID, aborting'); return; }

  // NOTE: the audit DB's default pdf_templates row (id 2, "gffg") has an empty
  // fields=[] array. generateRentalContractFromTemplate() (server/utils/pdf-generator.ts:227-503)
  // only draws text for entries in template.fields - with fields=[] it draws
  // *nothing* but the static background, logging "No template fields found"
  // (:503) - confirmed by inspecting the raw PDF content streams (zero Tj/TJ
  // operators). That is a pre-existing data/config quirk of this template, not
  // a security finding, but it means the default endpoint can't be used to test
  // whether stored payloads render as literal PDF text. Force the *other*
  // generator (generateRentalContract, pdf-generator.ts:541-693, which
  // unconditionally page.drawText()'s brand/model/customerName/etc.) by asking
  // for a templateId that does not exist - routes.ts:5507-5509 falls back to it
  // when storage.getPdfTemplate(templateId) returns undefined.
  const pdfRes = await req(jar, 'GET', `/api/contracts/generate/${reservationId}?templateId=999999`);
  console.log('contract generate status:', pdfRes.status, 'content-type:', pdfRes.headers.get('content-type'));
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const pdfPath = path.join(__dirname, 'pdfs', `check3-contract-${reservationId}.pdf`);
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, buf);
  console.log('saved PDF to', pdfPath, 'size', buf.length);

  if (pdfRes.headers.get('content-type')?.includes('pdf')) {
    // Extract text with pdfjs-dist
    const repoRoot = path.join(__dirname, '..', '..', '..', '..', '..');
    const pdfjsPath = path.join(repoRoot, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const pdfjs = await import('file://' + pdfjsPath.replace(/\\/g, '/'));
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true });
    const doc = await loadingTask.promise;
    let allText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      allText += content.items.map(it => it.str).join(' ') + '\n';
    }
    fs.writeFileSync(path.join(__dirname, `check3-contract-${reservationId}.txt`), allText);
    console.log('--- extracted PDF text (first 2000 chars) ---');
    console.log(allText.slice(0, 2000));
    console.log('--- contains raw payload substrings? ---');
    console.log('contains "<img src=x":', allText.includes('<img src=x'));
    console.log('contains "AUDIT-":', allText.includes('AUDIT-'));
  } else {
    console.log('Response was not a PDF, body preview:', buf.toString('utf8').slice(0, 800));
  }

  // Record document id if the generator also created a `documents` row, for check3c-email.cjs
  const docsRes = await req(jar, 'GET', `/api/documents/reservation/${reservationId}`);
  try {
    const docs = JSON.parse(await docsRes.text());
    if (docs[0]?.id) {
      fs.writeFileSync(path.join(__dirname, 'check3-pdf-doc.json'), JSON.stringify({ documentId: docs[0].id, reservationId }, null, 2));
      console.log('linked document id:', docs[0].id);
    }
  } catch (e) { console.log('no linked document row found', e.message); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });

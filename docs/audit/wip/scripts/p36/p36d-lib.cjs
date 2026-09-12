// Phase 36 agent-D helpers. HTTP via p36/lib.cjs (127.0.0.1:5003), SQL via p36d-db.cjs (lvs_regress).
'use strict';
const fs = require('fs');
const path = require('path');
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./p36d-db.cjs');
const pdfinfo = require('./p36d-pdfinfo.cjs');

const OUT_DIR = path.join(__dirname, 'files-D');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Agent D uses its own admin account so the per-user apiLimiter budget (1000/15min)
// is not shared with the other P36 agents, which all run as 'admin'.
async function staff(fakeIp, username = 'AUDIT-P36D-adm', password = 'AuditP36D!adm1') {
  const s = new Session('staff', { fakeIp });
  const r = await s.loginStaff(username, password);
  if (r.status !== 200) throw new Error(`staff login failed for ${username}: ${r.status} ${r.text.slice(0, 200)}`);
  return s;
}

async function getBuffer(session, urlPath, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (session.cookieHeader()) headers['Cookie'] = session.cookieHeader();
  if (session.fakeIp) headers['X-Forwarded-For'] = session.fakeIp;
  const method = opts.method || 'GET';
  let body = opts.body;
  if (body !== undefined && !(body instanceof Buffer)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  if (method !== 'GET' && session.csrf) headers['X-CSRF-Token'] = session.csrf;
  const res = await fetch(BASE + urlPath, { method, headers, body, redirect: 'manual' });
  session._applySetCookies(res.headers);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, contentType: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '' };
}

async function upload(session, urlPath, fieldName, filename, contentType, fileBuf, extra = {}) {
  const boundary = '----AuditP36D' + Date.now().toString(16);
  const parts = [];
  for (const [k, v] of Object.entries(extra)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  if (session.cookieHeader()) headers['Cookie'] = session.cookieHeader();
  if (session.fakeIp) headers['X-Forwarded-For'] = session.fakeIp;
  if (session.csrf) headers['X-CSRF-Token'] = session.csrf;
  const res = await fetch(BASE + urlPath, { method: 'POST', headers, body, redirect: 'manual' });
  session._applySetCookies(res.headers);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

async function savePdf(name, buf) { const p = path.join(OUT_DIR, name); fs.writeFileSync(p, buf); return p; }

async function fetchPdf(session, urlPath, name, opts = {}) {
  const r = await getBuffer(session, urlPath, opts);
  const rec = { url: urlPath, status: r.status, contentType: r.contentType, bytes: r.buf.length, disposition: r.disposition };
  rec.isPdf = pdfinfo.isPdf(r.buf);
  if (r.status >= 300 || !rec.isPdf) {
    rec.body = r.buf.toString('utf8').slice(0, 500);
    if (r.buf.length) await savePdf(name.replace(/\.pdf$/, '') + '.resp.txt', r.buf);
    return rec;
  }
  await savePdf(name, r.buf);
  const info = await pdfinfo.inspect(r.buf);
  rec.info = pdfinfo.summary(info, opts);
  rec.file = name;
  rec.allText = info.text.map(t => t.replace(/\s+/g, ' ').trim()).join(' ‖ ');
  if (opts.items) rec.items = info.items[0];
  return rec;
}

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function today() { return iso(new Date()); }
function log(...a) { console.log(...a.map(x => (typeof x === 'string' ? x : JSON.stringify(x)))); }
async function step(title, fn) { console.log('\n=== ' + title + ' ==='); try { return await fn(); } catch (e) { console.log('STEP ERROR', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); return undefined; } }
const short = (r, n = 300) => `${r.status} ${(r.text || '').slice(0, n)}`;

module.exports = { Session, BASE, q, pool, staff, getBuffer, upload, savePdf, fetchPdf, pdfinfo, OUT_DIR, addDays, today, log, step, short };

// ---- fixture id persistence (agent D) ----
const IDS_FILE = path.join(__dirname, 'p36d-ids.json');
module.exports.loadIds = () => (fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {});
module.exports.saveIds = (ids) => fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));

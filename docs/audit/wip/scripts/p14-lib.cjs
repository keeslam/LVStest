// Phase 14 helpers (PDF & template system). Reuses lib.cjs (HTTP), db.cjs (SQL), p14-pdfinfo.cjs (pdfjs).
'use strict';
const fs = require('fs');
const path = require('path');
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const pdfinfo = require('./p14-pdfinfo.cjs');

const IDS_FILE = path.join(__dirname, 'p14-ids.json');
const OUT_DIR = path.join(__dirname, 'files', 'p14');
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadIds() { return fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {}; }
function saveIds(ids) { fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2)); }

async function staff(fakeIp, username = 'admin', password = 'admin123') {
  const s = new Session('staff', { fakeIp });
  const r = await s.loginStaff(username, password);
  if (r.status !== 200) throw new Error(`staff login failed for ${username}: ${r.status} ${r.text.slice(0, 200)}`);
  return s;
}

// Raw fetch returning a Buffer (lib.cjs' request() turns bodies into text).
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

// Multipart upload helper (single file + extra fields), returns lib-style {status, json, text}.
async function upload(session, urlPath, fieldName, filename, contentType, fileBuf, extra = {}) {
  const boundary = '----AuditP14' + Date.now().toString(16);
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

async function savePdf(name, buf) {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, buf);
  return p;
}

// Fetch a PDF endpoint, store it, inspect it, return a compact record for the report.
async function fetchPdf(session, urlPath, name, opts = {}) {
  const r = await getBuffer(session, urlPath, opts);
  const rec = { url: urlPath, status: r.status, contentType: r.contentType, bytes: r.buf.length, disposition: r.disposition };
  if (r.status >= 300 || !r.contentType.includes('pdf')) {
    rec.body = r.buf.toString('utf8').slice(0, 400);
    if (r.buf.length) await savePdf(name.replace(/\.pdf$/, '') + '.resp.txt', r.buf);
    rec.isPdf = pdfinfo.isPdf(r.buf);
    if (rec.isPdf || opts.forceInspect) {
      await savePdf(name, r.buf);
      rec.info = pdfinfo.summary(await pdfinfo.inspect(r.buf), opts);
    }
    return rec;
  }
  await savePdf(name, r.buf);
  const info = await pdfinfo.inspect(r.buf);
  rec.info = pdfinfo.summary(info, opts);
  rec.file = name;
  if (opts.fullText) rec.fullText = info.text.map(t => t.replace(/\s+/g, ' ').trim());
  if (opts.items) rec.items = info.items[0];
  if (opts.png) {
    try { rec.png = path.basename(await pdfinfo.renderPng(r.buf, path.join(OUT_DIR, name.replace(/\.pdf$/, '') + (opts.pngPage && opts.pngPage > 1 ? `_p${opts.pngPage}` : '') + '.png'), opts.pngPage || 1, opts.pngScale || 1.2)); }
    catch (e) { rec.pngError = e.message; }
  }
  return rec;
}

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function today() { return iso(new Date()); }

function log(...a) { console.log(...a.map(x => (typeof x === 'string' ? x : JSON.stringify(x)))); }
async function step(title, fn) { console.log('\n=== ' + title + ' ==='); try { return await fn(); } catch (e) { console.log('STEP ERROR', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); return undefined; } }
const short = (r, n = 300) => `${r.status} ${(r.text || '').slice(0, n)}`;
async function health() { try { const r = await fetch(BASE + '/health'); return r.status; } catch (e) { return 'DOWN ' + e.message; } }
async function waitHealthy(maxMs = 30000) { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const h = await health(); if (h === 200) return true; await new Promise(r => setTimeout(r, 1000)); } return false; }

module.exports = { Session, BASE, q, pool, staff, getBuffer, upload, savePdf, fetchPdf, pdfinfo, OUT_DIR, loadIds, saveIds, addDays, today, log, step, short, health, waitHealthy };

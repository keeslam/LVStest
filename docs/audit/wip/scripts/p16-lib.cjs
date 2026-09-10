// Shared helpers for phase 16 (e-mail) scripts.
'use strict';
const fs = require('fs');
const path = require('path');
const { Session, BASE } = require('./lib.cjs');
const { q } = require('./db.cjs');

const SESSION_FILE = path.join(__dirname, 'p16-session.json');
const ORIG_FILE = path.join(__dirname, 'p16-original-settings.json');

async function getAdmin(fakeIp = '10.16.1.1') {
  const s = new Session('admin', { fakeIp });
  if (fs.existsSync(SESSION_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    for (const [k, v] of Object.entries(saved.cookies)) s.cookies.set(k, v);
    s.csrf = saved.csrf;
    const r = await s.get('/api/user');
    if (r.status === 200) { saveSession(s); return s; }
  }
  const r = await s.loginStaff('admin', 'admin123');
  if (r.status !== 200) throw new Error('admin login failed: ' + r.status + ' ' + r.text.slice(0, 200));
  saveSession(s);
  return s;
}
function saveSession(s) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies: Object.fromEntries(s.cookies), csrf: s.csrf }));
}

async function getPortal(email = 'portaal-test@example.com', password = 'portaal-test-1234', fakeIp = '10.16.2.1', extraCookies = {}) {
  const s = new Session('portal', { fakeIp });
  for (const [k, v] of Object.entries(extraCookies)) s.cookies.set(k, v);
  const r = await s.loginPortal(email, password);
  if (r.status !== 200) throw new Error('portal login failed: ' + r.status + ' ' + r.text.slice(0, 200));
  return s;
}

// Snapshot the original e-mail rows once (never overwritten once it exists).
async function snapshotOriginal() {
  if (fs.existsSync(ORIG_FILE)) return JSON.parse(fs.readFileSync(ORIG_FILE, 'utf8'));
  const rows = await q("select id, category, key, value, description, created_by, updated_by, created_at, updated_at from app_settings where category='email' or key='portal_config' order by id");
  fs.writeFileSync(ORIG_FILE, JSON.stringify(rows, null, 2));
  return rows;
}

// Configure SMTP through the app's own API (upsert by key).
async function setEmailConfig(admin, value, key = 'email_config') {
  const r = await admin.post('/api/app-settings', { key, category: 'email', value, description: 'AUDIT-p16 temporary SMTP config' });
  if (r.status !== 200) throw new Error('setEmailConfig failed: ' + r.status + ' ' + r.text.slice(0, 300));
  return r.json;
}
function stubConfig(port = 2525, extra = {}) {
  return Object.assign({
    fromEmail: 'audit-p16@example.invalid', fromName: 'AUDIT P16', purpose: 'default',
    smtpHost: '127.0.0.1', smtpPort: String(port), smtpUser: 'audit-user@example.invalid', smtpPassword: 'AUDIT-p16-smtp-secret', smtpSecure: false,
  }, extra);
}

async function health() {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(BASE + '/health', { signal: ctrl.signal }); clearTimeout(to);
    return { status: r.status, ms: Date.now() - t0 };
  } catch (e) { return { status: 'ERR ' + e.message, ms: Date.now() - t0 }; }
}

async function timed(fn) { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
function record(name, data) { results.push({ name, ...data }); console.log('[' + name + ']', JSON.stringify(data).slice(0, 700)); }
function flush(file) { fs.writeFileSync(path.join(__dirname, file), JSON.stringify(results, null, 2)); }

// decode quoted-printable body for content checks
function qp(raw) { return raw ? raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw; }
function summarize(m) {
  if (!m) return null;
  return { mailFrom: m.mailFrom, rcptTo: m.rcptTo, headerFrom: m.headerFrom, headerTo: m.headerTo, subject: m.subject, hasHtml: m.hasHtml, hasText: m.hasText, hasAttachment: m.hasAttachment, attachmentFilenames: m.attachmentFilenames, dataSize: m.dataSize };
}

module.exports = { getAdmin, getPortal, snapshotOriginal, setEmailConfig, stubConfig, health, timed, sleep, record, flush, qp, summarize, q, BASE, Session };

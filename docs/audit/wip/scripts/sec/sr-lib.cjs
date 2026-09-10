// Shared helpers for the phase-8 security runtime tests.
const BASE = 'http://localhost:5001';

// The shared loginLimiter (5/15min per IP, BUG-009/SR-003) is keyed on req.ip,
// which honours X-Forwarded-For because server/auth.ts:135 sets `trust proxy: 1`.
// Multiple audit agents share this machine's real IP, so its bucket is often
// already exhausted before this script runs. Set AUDIT_XFF to get a private,
// unexhausted bucket (this IS the BUG-009 bypass, used here deliberately per
// the task's operational instructions, not to defeat the control maliciously).
const AUDIT_XFF = process.env.AUDIT_XFF || null;

function parseSetCookies(headers) {
  // Node fetch Headers doesn't expose multiple Set-Cookie via get(); use getSetCookie() (Node 18.14+/20+).
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

class Jar {
  constructor() { this.map = new Map(); } // name -> value
  ingest(setCookieStrings) {
    for (const sc of setCookieStrings) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      this.map.set(name, value);
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) { return this.map.get(name); }
}

async function req(jar, method, path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (AUDIT_XFF && !headers['X-Forwarded-For']) headers['X-Forwarded-For'] = AUDIT_XFF;
  if (jar) {
    const c = jar.header();
    if (c) headers['Cookie'] = c;
  }
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, { method, headers, body, redirect: 'manual' });
  const setCookies = parseSetCookies(res.headers);
  if (jar) jar.ingest(setCookies);
  let text = null;
  try { text = await res.text(); } catch (e) { text = '<unreadable>'; }
  return { status: res.status, headers: res.headers, setCookies, text, url };
}

async function loginStaff(jar, username = 'admin', password = 'admin123') {
  // prime csrf/session cookies + attach csrf
  await req(jar, 'GET', '/api/user');
  const r = await req(jar, 'POST', '/api/login', { json: { username, password } });
  const csrf = jar.get('XSRF-TOKEN');
  return { r, csrf };
}

async function csrfHeader(jar) {
  // refresh csrf token cookie via a GET (attachCsrfToken runs on every response)
  await req(jar, 'GET', '/api/user');
  return jar.get('XSRF-TOKEN');
}

function dump(obj) {
  return JSON.stringify(obj, (k, v) => {
    if (v instanceof Headers) return Object.fromEntries(v.entries());
    return v;
  }, 2);
}

const fs = require('fs');

// Persist/reuse a cookie jar across separate script invocations. The shared
// loginLimiter (server/middleware/security/rateLimiter.ts) is a single IP-keyed
// bucket over /api/login, /api/portal/login, /api/portal/forgot and
// /api/portal/activate (max 5/15min) - re-logging in from scratch in every
// script quickly trips it for the whole session (observed firsthand this run).
// getOrLoginStaff reuses a saved admin session/CSRF pair whenever it is still
// valid, and only calls /api/login when there is truly no usable session yet.
function jarFilePath(name) {
  const path = require('path');
  return path.join(__dirname, `.jar-${name}.json`);
}
function saveJar(jar, name) {
  fs.writeFileSync(jarFilePath(name), JSON.stringify([...jar.map.entries()]));
}
function loadJarInto(jar, name) {
  try {
    const data = JSON.parse(fs.readFileSync(jarFilePath(name), 'utf8'));
    for (const [k, v] of data) jar.map.set(k, v);
    return true;
  } catch { return false; }
}
async function getOrLoginStaff(jar, username = 'admin', password = 'admin123', name = 'staff') {
  if (loadJarInto(jar, name)) {
    const check = await req(jar, 'GET', '/api/user');
    if (check.status === 200) return { reused: true };
  }
  const { r } = await loginStaff(jar, username, password);
  if (r.status === 200) saveJar(jar, name);
  return { reused: false, loginStatus: r.status };
}
async function getOrLoginPortal(jar, email = 'portaal-test@example.com', password = 'portaal-test-1234', name = 'portal') {
  if (loadJarInto(jar, name)) {
    const check = await req(jar, 'GET', '/api/portal/me');
    if (check.status === 200) return { reused: true };
  }
  await req(jar, 'GET', '/api/portal/csrf-token');
  const csrf = jar.get('PORTAL-XSRF-TOKEN');
  const r = await req(jar, 'POST', '/api/portal/login', { headers: { 'X-CSRF-Token': csrf }, json: { email, password } });
  if (r.status === 200) saveJar(jar, name);
  return { reused: false, loginStatus: r.status };
}

module.exports = { BASE, Jar, req, loginStaff, csrfHeader, dump, parseSetCookies, saveJar, loadJarInto, getOrLoginStaff, getOrLoginPortal, AUDIT_XFF };

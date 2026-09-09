// Shared HTTP client for the VEHICLES/CUSTOMERS audit scripts (VC-* bugs).
// Private copy (suffix -vc) so concurrent audit agents editing scripts/lib.cjs
// in this shared directory cannot clobber this area's test harness mid-run.
// Node 18+ (built-in fetch).
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5001';
// Login is rate-limited to 5/15min PER IP and shared with every other audit
// agent hitting localhost concurrently from this machine - we already burned
// through it once. Persist the admin session to disk and reuse it across
// every script invocation instead of calling loginStaff() again.
const ADMIN_SESSION_FILE = path.join(__dirname, 'session-vc-admin.json');
const LIMITED_SESSION_FILE = path.join(__dirname, 'session-vc-limited.json');

async function fetchWithRetry(url, init, attempts = 6, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function parseSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

class Session {
  constructor(name) {
    this.name = name || 'session';
    this.cookies = new Map(); // name -> value
    this.csrf = null;
  }

  _applySetCookies(headers) {
    const setCookies = parseSetCookies(headers);
    for (const sc of setCookies) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      this.cookies.set(k, v);
      if (k === 'XSRF-TOKEN' || k === 'PORTAL-XSRF-TOKEN') this.csrf = v;
    }
  }

  cookieHeader() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, body, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    let payload = body;
    if (body instanceof FormData) {
      // Let fetch set Content-Type with the multipart boundary itself.
    } else if (body !== undefined && !(body instanceof Buffer) && !(opts.raw)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (this.cookieHeader()) headers['Cookie'] = this.cookieHeader();
    const isMutating = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (isMutating && this.csrf && !opts.omitCsrf) {
      headers['X-CSRF-Token'] = this.csrf;
    }
    if (opts.csrfOverride !== undefined) {
      headers['X-CSRF-Token'] = opts.csrfOverride;
    }
    // The dev server under test is flapping (multiple concurrent audit agents
    // hammering it - observed ECONNREFUSED + process restarts during this
    // session). Retry transient connection failures with backoff rather than
    // let one blip kill an entire multi-step test script.
    const res = await fetchWithRetry(BASE + path, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
    });
    this._applySetCookies(res.headers);
    let text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, headers: res.headers, text, json };
  }

  get(path, opts) { return this.request('GET', path, undefined, opts); }
  post(path, body, opts) { return this.request('POST', path, body, opts); }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts); }
  put(path, body, opts) { return this.request('PUT', path, body, opts); }
  del(path, body, opts) { return this.request('DELETE', path, body, opts); }

  async primeCsrf() {
    await this.get('/api/vehicles?limit=1');
  }

  async loginStaff(username, password, opts = {}) {
    const r = await this.post('/api/login', { username, password });
    // The XSRF-TOKEN cookie issued in the /api/login response itself is
    // invalid on the very next request (see VC bug report: root cause is
    // req.session.regenerate() in server/auth.ts running after
    // attachCsrfToken computed the token against the pre-regeneration
    // session secret in server/middleware/security/csrf.ts). Prime with a
    // harmless GET so the rest of this test session doesn't trip on it.
    if (r.status === 200 && !opts.skipPrime) await this.primeCsrf();
    return r;
  }

  async loginPortal(email, password, opts = {}) {
    const r = await this.post('/api/portal/login', { email, password });
    if (r.status === 200 && !opts.skipPrime) {
      await this.get('/api/portal/csrf-token');
    }
    return r;
  }

  saveTo(file) {
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this.cookies), null, 2));
  }

  loadFrom(file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(data)) {
      this.cookies.set(k, v);
      if (k === 'XSRF-TOKEN' || k === 'PORTAL-XSRF-TOKEN') this.csrf = v;
    }
  }
}

/**
 * Reuse the persisted admin session saved earlier in this audit (see
 * ADMIN_SESSION_FILE) instead of calling /api/login again, which is
 * rate-limited 5/15min per IP and shared with every concurrent audit agent
 * on this machine. Refreshes the CSRF token (cheap, GET-only) and verifies
 * the session is still live. Falls back to a real login only if the saved
 * session is gone or expired, and persists whatever session ends up valid.
 */
async function getAdminSession() {
  const s = new Session('admin');
  if (fs.existsSync(ADMIN_SESSION_FILE)) {
    s.loadFrom(ADMIN_SESSION_FILE);
    const check = await s.get('/api/vehicles?limit=1');
    if (check.status === 200) {
      s.saveTo(ADMIN_SESSION_FILE); // rolling session: keep the refreshed csrf/sid
      return s;
    }
  }
  const login = await s.loginStaff('admin', 'admin123');
  if (login.status !== 200) {
    throw new Error(`admin login failed: ${login.status} ${login.text}`);
  }
  s.saveTo(ADMIN_SESSION_FILE);
  return s;
}

async function getLimitedSession() {
  const s = new Session('limited');
  if (fs.existsSync(LIMITED_SESSION_FILE)) {
    s.loadFrom(LIMITED_SESSION_FILE);
    const check = await s.get('/api/vehicles?limit=1');
    // 200 or 403 (lacks permission but IS authenticated) both mean the session is alive.
    if (check.status === 200 || check.status === 403) {
      s.saveTo(LIMITED_SESSION_FILE);
      return s;
    }
  }
  const login = await s.loginStaff('AUDIT-limiteduser', 'AuditPass123!');
  if (login.status !== 200) {
    throw new Error(`limited user login failed: ${login.status} ${login.text}`);
  }
  s.saveTo(LIMITED_SESSION_FILE);
  return s;
}

module.exports = { Session, BASE, getAdminSession, getLimitedSession };

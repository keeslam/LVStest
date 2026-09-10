// Session helper for the matrix audit (phase 6-7). ESM, Node 18+ fetch.
import fs from 'fs';
import path from 'path';

export const BASE = 'http://localhost:5001';
const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';

function parseSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export async function fetchWithRetry(url, init, attempts = 6, delayMs = 3000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export class Session {
  constructor(name, opts = {}) {
    this.name = name;
    this.cookies = new Map();
    this.csrf = null;
    this.forwardedFor = opts.forwardedFor; // BUG-009 workaround for login limiter (static IP)
    // Rotating-IP workaround for AM-001 (apiLimiter's authenticated-skip never fires, so every
    // identity shares a 1000-req/15min bucket keyed by X-Forwarded-For, per BUG-009's trust-proxy
    // behavior). opts.forwardedForBase = { a, b }: address is 10.<a>.<b>.<c>, where <c> increments
    // once every `rotateEvery` requests, giving each identity its own distinct /24-ish range (via
    // its own `a`) that itself rotates through several source IPs as the run progresses.
    this.forwardedForBase = opts.forwardedForBase;
    this.rotateEvery = opts.rotateEvery || 200;
    this.reqCount = 0;
  }
  currentForwardedFor() {
    if (this.forwardedForBase) {
      const { a, b } = this.forwardedForBase;
      const rotIdx = Math.floor(this.reqCount / this.rotateEvery);
      // roll rotIdx into c (2..251), overflowing into b if a single identity ever needs >250 rotations
      const c = 2 + (rotIdx % 250);
      const bb = b + Math.floor(rotIdx / 250);
      return `10.${a}.${bb}.${c}`;
    }
    return this.forwardedFor;
  }
  _applySetCookies(headers) {
    for (const sc of parseSetCookies(headers)) {
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
  async request(method, urlPath, body, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    let payload = body;
    if (body instanceof FormData) {
      // let fetch set boundary
    } else if (body !== undefined && !(body instanceof Buffer) && !opts.raw) {
      headers['Content-Type'] = opts.contentType || 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    } else if (body instanceof Buffer) {
      headers['Content-Type'] = opts.contentType || 'application/octet-stream';
      payload = body;
    }
    if (this.cookieHeader()) headers['Cookie'] = this.cookieHeader();
    const isMutating = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (isMutating && this.csrf && !opts.omitCsrf) headers['X-CSRF-Token'] = this.csrf;
    if (opts.csrfOverride !== undefined) headers['X-CSRF-Token'] = opts.csrfOverride;
    const ff = this.currentForwardedFor();
    if (ff) headers['X-Forwarded-For'] = ff;
    if (opts.accept) headers['Accept'] = opts.accept;
    this.reqCount++;
    const res = await fetchWithRetry(BASE + urlPath, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
    });
    this._applySetCookies(res.headers);
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    let text = '';
    try { text = buf.toString('utf8'); json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, headers: res.headers, bytes: buf.length, text, json };
  }
  get(p, opts) { return this.request('GET', p, undefined, opts); }
  post(p, b, opts) { return this.request('POST', p, b, opts); }
  patch(p, b, opts) { return this.request('PATCH', p, b, opts); }
  put(p, b, opts) { return this.request('PUT', p, b, opts); }
  del(p, b, opts) { return this.request('DELETE', p, b, opts); }
  async primeCsrf() { await this.get('/api/vehicles?limit=1'); }
  async loginStaff(username, password) {
    const r = await this.post('/api/login', { username, password });
    if (r.status === 200) await this.primeCsrf();
    return r;
  }
  async loginPortal(email, password) {
    const r = await this.post('/api/portal/login', { email, password });
    if (r.status === 200) await this.get('/api/portal/csrf-token');
    return r;
  }
  saveTo(file) {
    fs.writeFileSync(file, JSON.stringify({ cookies: Object.fromEntries(this.cookies), csrf: this.csrf }, null, 2));
  }
  loadFrom(file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(data.cookies || data)) {
      this.cookies.set(k, v);
      if (k === 'XSRF-TOKEN' || k === 'PORTAL-XSRF-TOKEN') this.csrf = v;
    }
    if (data.csrf) this.csrf = data.csrf;
  }
}

export function sessionFile(name) {
  return path.join(DIR, `session-${name}.json`);
}

export async function loadOrLoginStaff(name, username, password, opts = {}) {
  const s = new Session(name, opts);
  const file = sessionFile(name);
  if (fs.existsSync(file)) {
    s.loadFrom(file);
    const check = await s.get('/api/vehicles?limit=1');
    if (check.status === 200 || check.status === 403) {
      s.saveTo(file);
      return s;
    }
  }
  const login = await s.loginStaff(username, password);
  if (login.status !== 200) throw new Error(`${name} login failed: ${login.status} ${login.text}`);
  s.saveTo(file);
  return s;
}

export async function loadOrLoginPortal(name, email, password, opts = {}) {
  const s = new Session(name, opts);
  const file = sessionFile(name);
  if (fs.existsSync(file)) {
    s.loadFrom(file);
    const check = await s.get('/api/portal/me');
    if (check.status === 200 || check.status === 403) {
      s.saveTo(file);
      return s;
    }
  }
  const login = await s.loginPortal(email, password);
  if (login.status !== 200) throw new Error(`${name} portal login failed: ${login.status} ${login.text}`);
  s.saveTo(file);
  return s;
}

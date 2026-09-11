// Shared HTTP client for audit scripts. Node 18+ (built-in fetch).
// Maintains its own in-memory cookie jar + rotating CSRF token per "session".
'use strict';

const BASE = 'http://localhost:5002';

function parseSetCookies(headers) {
  // Node fetch Headers doesn't give multiple set-cookie easily via get(); use getSetCookie() if available.
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

class Session {
  constructor(name, opts = {}) {
    this.name = name || 'session';
    this.cookies = new Map(); // name -> value
    this.csrf = null;
    // Optional X-Forwarded-For spoof, used deliberately to test the trust-proxy /
    // per-IP rate-limit boundary (see README-agents.md Area A item 4). Each test
    // session gets its own fake IP by default so unrelated fuzz cases don't share
    // the 5-per-15-min login limiter bucket with each other.
    this.fakeIp = opts.fakeIp;
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
    if (body !== undefined && !(body instanceof Buffer) && !(opts.raw)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (this.cookieHeader()) headers['Cookie'] = this.cookieHeader();
    if (this.fakeIp && !headers['X-Forwarded-For']) headers['X-Forwarded-For'] = this.fakeIp;
    const isMutating = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (isMutating && this.csrf && !opts.omitCsrf) {
      headers['X-CSRF-Token'] = this.csrf;
    }
    if (opts.csrfOverride !== undefined) {
      headers['X-CSRF-Token'] = opts.csrfOverride;
    }
    const res = await fetch(BASE + path, {
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
    // Any GET response also carries a rotated XSRF-TOKEN cookie in this app (double-submit rotates every response).
    await this.get('/api/vehicles?limit=1');
  }

  async loginStaff(username, password, opts = {}) {
    const r = await this.post('/api/login', { username, password });
    // BUG (see vehicles-customers.md): the XSRF-TOKEN cookie issued in the
    // /api/login response itself is invalid on the very next request because
    // req.session.regenerate() runs after attachCsrfToken computed it against
    // the pre-regeneration session secret. Prime with a harmless GET so the
    // rest of this test session doesn't trip over that on every script.
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
}

module.exports = { Session, BASE };

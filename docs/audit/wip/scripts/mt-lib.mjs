// ESM session helper (mirrors lib.js but ESM, for maintenance/transport audit).
const BASE = 'http://localhost:5001';

function parseSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export class Session {
  constructor(name) {
    this.name = name || 'session';
    this.cookies = new Map();
    this.csrf = null;
  }
  _applySetCookies(headers) {
    for (const sc of parseSetCookies(headers)) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      this.cookies.set(k, v);
      if (k === 'XSRF-TOKEN') this.csrf = v;
    }
  }
  cookieHeader() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async request(method, path, body, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    let payload = body;
    if (body !== undefined && !(opts.raw)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (this.cookieHeader()) headers['Cookie'] = this.cookieHeader();
    const isMutating = !['GET', 'HEAD'].includes(method.toUpperCase());
    if (isMutating && this.csrf && !opts.omitCsrf) headers['X-CSRF-Token'] = this.csrf;
    if (opts.csrfOverride !== undefined) headers['X-CSRF-Token'] = opts.csrfOverride;
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    this._applySetCookies(res.headers);
    let text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, headers: res.headers, text, json };
  }
  get(path, opts) { return this.request('GET', path, undefined, opts); }
  post(path, body, opts) { return this.request('POST', path, body, opts); }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts); }
  put(path, body, opts) { return this.request('PUT', path, body, opts); }
  del(path, body, opts) { return this.request('DELETE', path, body, opts); }
  async primeCsrf() { await this.get('/api/vehicles?limit=1'); }
  async loginStaff(username, password) { return this.post('/api/login', { username, password }); }
  async loginPortal(email, password) { return this.post('/api/portal/login', { email, password }); }
}
export { BASE };

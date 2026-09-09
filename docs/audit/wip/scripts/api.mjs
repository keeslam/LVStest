// Shared HTTP helper for audit scripts. Reuses the cookie jar / CSRF token
// already established by curl (docs/audit/wip/scripts/jar.txt, csrf.txt).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JAR = path.join(__dirname, 'jar.txt');
const BASE = 'http://localhost:5001';

function readCookies() {
  const txt = fs.readFileSync(JAR, 'utf8');
  const cookies = {};
  for (let line of txt.split('\n')) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      // Netscape jar marks httpOnly cookies as "#HttpOnly_<domain>\t..." — not a real comment.
      if (!line.startsWith('#HttpOnly_')) continue;
      line = line.slice('#HttpOnly_'.length);
    }
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [, , , , , name, value] = parts;
    cookies[name] = value;
  }
  return cookies;
}

export function cookieHeader() {
  const c = readCookies();
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ');
}

export function csrfToken() {
  const c = readCookies();
  return decodeURIComponent(c['XSRF-TOKEN'] || '');
}

export async function api(method, urlPath, body, opts = {}) {
  const headers = {
    'Cookie': cookieHeader(),
    ...(opts.headers || {}),
  };
  let payload = body;
  if (body !== undefined && opts.raw !== true) {
    headers['Content-Type'] = opts.contentType || 'application/json';
    payload = JSON.stringify(body);
  }
  if (!opts.noCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken();
  }
  const res = await fetch(BASE + urlPath, { method, headers, body: payload });
  let json = null;
  let text = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { json = await res.json(); } catch (e) { text = '<json parse failed>'; }
  } else {
    text = await res.text();
  }
  return { status: res.status, json, text, headers: res.headers };
}

export function trim(obj, max = 800) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s && s.length > max ? s.slice(0, max) + `...<truncated ${s.length - max} chars>` : s;
}

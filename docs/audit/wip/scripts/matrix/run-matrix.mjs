// Phase 6-7 endpoint x identity matrix runner (safe mode).
import fs from 'fs';
import path from 'path';
import { Session, sessionFile } from './lib.mjs';
import { q, pool } from '../db.mjs';

const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';
const endpoints = JSON.parse(fs.readFileSync(path.join(DIR, 'endpoints.json'), 'utf8'));
const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'ids.json'), 'utf8'));
const idsSummary = JSON.parse(fs.readFileSync(path.join(DIR, 'identities-summary.json'), 'utf8'));

const STAFF_IDENTITIES = ['anon', 'nobody', 'viewer', 'manager', 'admin'];
const PORTAL_IDENTITIES = ['portal-admin', 'portal-other', 'portal-driver'];
const ALL_IDENTITIES = [...STAFF_IDENTITIES, ...PORTAL_IDENTITIES];
const MUTATION_IDENTITIES = ['anon', 'nobody', 'viewer', 'portal-admin', 'portal-other', 'portal-driver'];

// AM-xxx workaround: apiLimiter (1000 req/15min per IP, server/middleware/security/rateLimiter.ts)
// is mounted at server/index.ts:174, BEFORE setupAuth() (line 187) wires up passport.session().
// Its skip() checks req.isAuthenticated, which does not exist yet at that point in the middleware
// chain, so "skip rate limiting for authenticated users" never fires and ALL traffic (8 identities x
// 360 endpoints from one real IP) shares one 1000-request bucket. Same trust-proxy/X-Forwarded-For
// situation as the documented BUG-009 login-limiter workaround, so give each identity its own IP.
const FORWARDED_FOR = {
  anon: '10.20.30.8', nobody: '10.20.30.2', viewer: '10.20.30.3', manager: '10.20.30.4', admin: '10.20.30.1',
  'portal-admin': '10.20.30.5', 'portal-other': '10.20.30.6', 'portal-driver': '10.20.30.7',
};

function loadSession(name) {
  const s = new Session(name, { forwardedFor: FORWARDED_FOR[name] });
  const f = sessionFile(name);
  if (fs.existsSync(f)) s.loadFrom(f);
  return s;
}

const sessions = {};
for (const id of ALL_IDENTITIES) sessions[id] = loadSession(id);

// ---- param substitution ----
function realIdFor(pathStr, paramName) {
  const p = pathStr.toLowerCase();
  if (paramName === 'customerId') {
    if (p.includes('portal')) return idsSummary.portalAdminCustomerId;
    return ids.customer;
  }
  if (paramName === 'vehicleId') return ids.vehicle;
  if (paramName === 'reservationId') return ids.reservation;
  if (paramName === 'backgroundId') return 1;
  if (paramName === 'attachmentId') return 1;
  if (paramName === 'proposedNumber') return 1;
  if (paramName === 'id') {
    if (p.includes('/vehicles')) return ids.vehicle;
    if (p.includes('/customers')) return ids.customer;
    if (p.includes('/drivers')) return ids.driver;
    if (p.includes('/reservations')) return ids.reservation;
    if (p.includes('/documents')) return ids.document;
    if (p.includes('/pdf-templates')) return ids.pdfTemplate;
    if (p.includes('/users')) return ids.user;
    if (p.includes('/fines')) return ids.fine;
    if (p.includes('/expenses')) return ids.expense;
    if (p.includes('transport')) return ids.transport;
    if (p.includes('portal-requests') || p.includes('portal/requests')) return ids.portalRequest;
    if (p.includes('damage-check-template')) return ids.damageCheckTemplate;
    if (p.includes('vehicle-diagram-template')) return ids.vehicleDiagramTemplate;
    if (p.includes('interactive-damage-check')) return ids.interactiveDamageCheck;
    if (p.includes('report-and-label-template') || p.includes('barcode')) return ids.reportAndLabelTemplate;
    if (p.includes('custom-notification')) return ids.customNotification;
    if (p.includes('email-template')) return ids.emailTemplate;
    if (p.includes('deleted-records')) return 1;
    if (p.includes('portal-admin')) return 1;
    return ids.vehicle; // fallback
  }
  return 1;
}

function substitute(pathStr, mode) {
  // mode: 'real' | 'notfound' | 'zero' | 'neg' | 'abc' | 'exp' | 'nul' | 'traversal' | 'long'
  return pathStr.replace(/:([A-Za-z0-9_]+)/g, (m, name) => {
    if (name === 'startDate' || name === 'endDate') return '2026-01-01';
    if (name === 'licensePlate') return ids.licensePlate || 'AU-001-X';
    if (name === 'key') return 'general';
    if (name === 'token') return 'audit-fake-token';
    if (name === 'type') return 'other';
    if (name === 'category') return 'general';
    if (name === 'code') return 'AUDIT';
    if (name === 'filename') return 'audit-test.txt';
    if (name === 'contractNumber') return 'AUDIT-0001';
    switch (mode) {
      case 'notfound': return '999999999';
      case 'zero': return '0';
      case 'neg': return '-1';
      case 'abc': return 'abc';
      case 'exp': return '1e3';
      case 'nul': return '%00';
      case 'traversal': return '../';
      case 'long': return 'A'.repeat(5000);
      default: return String(realIdFor(pathStr, name));
    }
  });
}

function hasIdParam(pathStr) {
  return /:[A-Za-z0-9_]+/.test(pathStr);
}

// ---- flag detection ----
const SENSITIVE_RE = /"(password|passwordHash|password_hash|hash|secret|token|smtpPassword|smtp_password|apiKey|api_key)"\s*:\s*"(?!"|\s*")[^"]+/i;
function detectFlags(identity, method, path, status, bytes, text) {
  const flags = [];
  if (status >= 500) flags.push('5xx');
  if (bytes > 1024 * 1024) flags.push('>1MB');
  if (SENSITIVE_RE.test(text || '')) flags.push('sensitive-field-leak');
  const isPublic = /^\/api\/(login|logout|health|csrf|portal\/login|portal\/csrf-token|portal\/forgot|portal\/activate|register)/.test(path) || path === '/api' || path.startsWith('/api/portal/email/confirm');
  if (identity === 'anon' && status >= 200 && status < 300 && path.startsWith('/api/') && !isPublic) {
    flags.push('anon-2xx');
  }
  if (MUTATION_IDENTITIES.includes(identity) && identity !== 'portal-admin' && ['POST','PUT','PATCH','DELETE'].includes(method)) {
    if (status >= 200 && status < 300) flags.push('non-privileged-2xx');
  }
  return flags;
}

const rows = [];
function record(identity, method, endpointPath, actualPath, status, bytes, flags, note) {
  rows.push({ endpoint: `${method} ${endpointPath}`, actualPath, identity, status, bytes, flags: flags.join('|'), note: note || '' });
}

let reqCount = 0;

async function callSafe(session, method, p, body, opts) {
  reqCount++;
  try {
    return await session.request(method, p, body, opts);
  } catch (e) {
    return { status: -1, bytes: 0, text: String(e), json: null };
  }
}

async function main() {
  console.log(`Matrix run starting: ${endpoints.length} endpoints x up to ${ALL_IDENTITIES.length} identities`);
  let done = 0;
  for (const ep of endpoints) {
    const { method, path: p } = ep;
    if (method === 'GET') {
      for (const identity of ALL_IDENTITIES) {
        const session = sessions[identity];
        const realPath = substitute(p, 'real');
        const r = await callSafe(session, 'GET', realPath, undefined);
        const flags = detectFlags(identity, method, p, r.status, r.bytes, r.text);
        record(identity, method, p, realPath, r.status, r.bytes, flags);
        if (hasIdParam(p)) {
          const nfPath = substitute(p, 'notfound');
          const r2 = await callSafe(session, 'GET', nfPath, undefined);
          const flags2 = detectFlags(identity, method, p, r2.status, r2.bytes, r2.text);
          record(identity, method + ' [999999999]', p, nfPath, r2.status, r2.bytes, flags2);
        }
      }
    } else {
      // mutating: anon, nobody, viewer, portal-* ONLY, empty JSON body
      for (const identity of MUTATION_IDENTITIES) {
        const session = sessions[identity];
        const realPath = substitute(p, 'real');
        const r = await callSafe(session, method, realPath, {});
        const flags = detectFlags(identity, method, p, r.status, r.bytes, r.text);
        record(identity, method, p, realPath, r.status, r.bytes, flags);
      }
    }
    done++;
    if (done % 25 === 0) console.log(`  ...${done}/${endpoints.length} endpoints done, ${reqCount} requests`);
  }

  const header = 'endpoint,identity,status,bytes,flag\n';
  const csvRows = rows.map(r => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [esc(r.endpoint), esc(r.identity), r.status, r.bytes, esc(r.flags)].join(',');
  });
  fs.writeFileSync(path.join(DIR, 'matrix.csv'), header + csvRows.join('\n') + '\n');
  fs.writeFileSync(path.join(DIR, 'matrix-raw.json'), JSON.stringify(rows));
  console.log(`DONE. requests=${reqCount} rows=${rows.length}`);
  await pool.end();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

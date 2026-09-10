// Phase 13 (concurrency & race conditions) shared helpers.
// - persisted staff sessions (one login per named session, reused across
//   scripts; every session has its own fakeIp 10.13.1.<n> so the general
//   apiLimiter / loginLimiter buckets never collide)
// - burst(): true parallel requests using raw http.request with agent:false
//   (no keep-alive pooling, every request its own TCP connection), optional
//   per-request stagger, per-request latency
// - fixture helpers (vehicle AU-13x-X, customer "AUDIT-P13 ...", reservation)
// - Report: step logger that writes p13-<name>.out.json as it goes
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Session } = require('./lib.cjs');
const { q, pool, url } = require('./db.cjs');

if (!/lvs_audit$/.test(url)) throw new Error('refusing: DATABASE_URL does not point at lvs_audit');

const DIR = __dirname;
const IDS_FILE = path.join(DIR, 'p13-ids.json');
function loadIds() { return fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {}; }
function saveIds(ids) { fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 1)); }

// name -> { username, password, fakeIp }
const STAFF = {
  admin: { username: 'admin', password: 'admin123', fakeIp: '10.13.1.1' },
  admin2: { username: 'admin', password: 'admin123', fakeIp: '10.13.1.2' }, // same user, "second browser tab"
  mgr: { username: 'AUDIT-manager-1788982804001', password: 'AuditManager123', fakeIp: '10.13.1.3' },
};

function sessionFile(name) { return path.join(DIR, `p13-session-${name}.json`); }

async function getSession(name) {
  const def = STAFF[name];
  if (!def) throw new Error('unknown session ' + name);
  const s = new Session(name, { fakeIp: def.fakeIp });
  const file = sessionFile(name);
  if (fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(saved.cookies || {})) s.cookies.set(k, v);
      s.csrf = saved.csrf || null;
      const probe = await s.get('/api/user');
      if (probe.status === 200 && probe.json && probe.json.username === def.username) {
        persist(s);
        return s;
      }
    } catch (e) { /* fall through to login */ }
  }
  s.cookies.clear(); s.csrf = null;
  const r = await s.loginStaff(def.username, def.password);
  if (r.status !== 200) throw new Error(`login ${name} (${def.username}) failed: ${r.status} ${r.text.slice(0, 200)}`);
  persist(s);
  console.log(`[session ${name}] logged in as ${def.username} (fakeIp ${def.fakeIp})`);
  return s;
}
function persist(s) {
  fs.writeFileSync(sessionFile(s.name), JSON.stringify({ cookies: Object.fromEntries(s.cookies), csrf: s.csrf }));
}

// ---- raw parallel HTTP -------------------------------------------------
function rawRequest(sess, method, p, body, opts = {}) {
  return new Promise((resolve) => {
    const payload = body === undefined ? null : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    const headers = {};
    if (sess) {
      if (sess.cookieHeader()) headers['Cookie'] = sess.cookieHeader();
      if (sess.fakeIp) headers['X-Forwarded-For'] = sess.fakeIp;
      if (!['GET', 'HEAD'].includes(method) && sess.csrf) headers['X-CSRF-Token'] = sess.csrf;
    }
    if (payload !== null) {
      headers['Content-Type'] = opts.contentType || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    Object.assign(headers, opts.headers || {});
    const t0 = process.hrtime.bigint();
    const req = http.request({ host: '127.0.0.1', port: 5001, method, path: p, headers, agent: false, timeout: opts.timeoutMs || 120000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        const text = ct.includes('pdf') || ct.includes('octet') ? '' : buf.toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
        resolve({ status: res.statusCode, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100, text: text.slice(0, opts.textLen || 400), json, bytes: buf.length, ct });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ status: 'ERR', error: e.message, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100 }));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

// items: [{ sess, method, path, body, delayMs?, label? }]
async function burst(items, opts = {}) {
  const stagger = opts.staggerMs || 0;
  const t0 = Date.now();
  const results = await Promise.all(items.map((it, i) => new Promise((resolve) => {
    const delay = it.delayMs !== undefined ? it.delayMs : i * stagger;
    setTimeout(async () => {
      const r = await rawRequest(it.sess, it.method, it.path, it.body, it.opts);
      r.startedAt = Date.now() - t0 - r.ms; r.label = it.label; r.i = i;
      resolve(r);
    }, delay);
  })));
  return results;
}

function dist(results) {
  const d = {};
  for (const r of results) d[r.status] = (d[r.status] || 0) + 1;
  return d;
}
function brief(results, n = 160) {
  return results.map((r) => ({ i: r.i, label: r.label, status: r.status, ms: r.ms, body: (r.text || r.error || '').slice(0, n) }));
}

// ---- fixtures ----------------------------------------------------------
const today = () => new Date().toISOString().split('T')[0];
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]; }
function nextWeekday(d) { let x = d; while ([0, 6].includes(new Date(x + 'T00:00:00Z').getUTCDay())) x = addDays(x, 1); return x; }

async function ensureVehicle(admin, ids, key, plate, model, extra = {}) {
  if (ids[key]) {
    const [row] = await q('select id from vehicles where id=$1', [ids[key]]);
    if (row) return ids[key];
  }
  const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
  if (ex) { ids[key] = ex.id; saveIds(ids); return ex.id; }
  const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P13', model, vehicleType: 'car', currentMileage: 1000, dailyPrice: '10', ...extra });
  if (![200, 201].includes(r.status)) throw new Error(`create vehicle ${plate}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(ids); return ids[key];
}
async function ensureCustomer(admin, ids, key, name, extra = {}) {
  if (ids[key]) {
    const [row] = await q('select id from customers where id=$1', [ids[key]]);
    if (row) return ids[key];
  }
  const [ex] = await q('select id from customers where name=$1 order by id limit 1', [name]);
  if (ex) { ids[key] = ex.id; saveIds(ids); return ex.id; }
  const r = await admin.post('/api/customers', { name, email: `${key.toLowerCase()}@audit-p13.example`, phone: '0600000000', ...extra });
  if (![200, 201].includes(r.status)) throw new Error(`create customer ${name}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(ids); return ids[key];
}
async function createReservation(admin, body) {
  const r = await admin.post('/api/reservations', body);
  if (![200, 201].includes(r.status)) throw new Error(`create reservation: ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}

async function resRow(id) {
  const [r] = await q('select id, vehicle_id, customer_id, driver_id, start_date, end_date, start_time, end_time, status, type, contract_number, notes, total_price, pickup_mileage, return_mileage, fuel_level_pickup, fuel_level_return, actual_pickup_date, actual_return_date, completion_date, deleted_at, deleted_by, updated_by, updated_at, replacement_for_reservation_id, placeholder_spare, spare_vehicle_status from reservations where id=$1', [id]);
  return r || null;
}
async function vehRow(id) {
  const [r] = await q('select id, license_plate, availability_status, maintenance_status, current_mileage, current_fuel_level, remarks, tire_size, updated_at, updated_by from vehicles where id=$1', [id]);
  return r || null;
}
async function docsFor(resId) {
  return q('select id, document_type, file_name, file_path, file_size, created_by, upload_date from documents where reservation_id=$1 order by id', [resId]);
}

async function health() {
  try { const r = await fetch('http://localhost:5001/health'); const j = await r.json(); return { status: r.status, pool: j.database && j.database.pool, uptime: j.uptime }; } catch (e) { return { status: 'DOWN', error: e.message }; }
}
async function waitForHealth(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { const h = await health(); if (h.status === 200) return h; await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Report {
  constructor(name) { this.name = name; this.file = path.join(DIR, `${name}.out.json`); this.data = []; }
  step(title, obj) {
    const rec = { title, at: new Date().toISOString(), ...obj };
    this.data.push(rec);
    console.log('\n## ' + title);
    console.log(JSON.stringify(obj, null, 1).slice(0, 6000));
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1));
  }
}

module.exports = { getSession, STAFF, rawRequest, burst, dist, brief, q, pool, today, addDays, nextWeekday, ensureVehicle, ensureCustomer, createReservation, resRow, vehRow, docsFor, health, waitForHealth, sleep, Report, loadIds, saveIds, Session };

// Phase 12 (database integrity) shared helpers: one persisted admin session
// (fakeIp 10.12.1.<n>, re-login only when expired), portal session, fixture ids.
'use strict';
const fs = require('fs');
const path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool, url } = require('./db.cjs');

if (!/lvs_audit$/.test(url)) throw new Error('refusing: DATABASE_URL does not point at lvs_audit');

const SESSION_FILE = path.join(__dirname, 'p12-session.json');
const IDS_FILE = path.join(__dirname, 'p12-ids.json');
const AUDIT_START = '2026-09-09';

function loadIds() { return fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {}; }
function saveIds(ids) { fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 1)); }

async function getAdmin() {
  let state = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : { n: 0 };
  const s = new Session('admin', { fakeIp: state.fakeIp || '10.12.1.1' });
  if (state.cookies) {
    for (const [k, v] of Object.entries(state.cookies)) s.cookies.set(k, v);
    s.csrf = state.csrf;
    const probe = await s.get('/api/user');
    if (probe.status === 200) { persist(s, state); return s; }
  }
  state.n = (state.n || 0) + 1;
  state.fakeIp = `10.12.1.${state.n}`;
  s.fakeIp = state.fakeIp;
  s.cookies.clear();
  const r = await s.loginStaff('admin', 'admin123');
  if (r.status !== 200) throw new Error('admin login failed ' + r.status + ' ' + r.text.slice(0, 200));
  persist(s, state);
  return s;
}
function persist(s, state) {
  state.cookies = Object.fromEntries(s.cookies.entries());
  state.csrf = s.csrf;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(state));
}

async function getPortal() {
  const p = new Session('portal', { fakeIp: '10.12.2.' + (1 + Math.floor(Math.random() * 200)) });
  const r = await p.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  if (r.status !== 200) throw new Error('portal login failed ' + r.status + ' ' + r.text.slice(0, 200));
  return p;
}

const today = () => new Date().toISOString().split('T')[0];
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]; }
function nextWeekday(d) { let x = d; while ([0, 6].includes(new Date(x + 'T00:00:00Z').getUTCDay())) x = addDays(x, 1); return x; }

async function ensureVehicle(admin, ids, key, plate, model) {
  if (ids[key]) return ids[key];
  const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
  if (ex) { ids[key] = ex.id; return ex.id; }
  const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P12', model, vehicleType: 'car', currentMileage: 1000, dailyPrice: '10' });
  if (![200, 201].includes(r.status)) throw new Error(`create vehicle ${plate}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(ids); return ids[key];
}
async function ensureCustomer(admin, ids, key, name, email) {
  if (ids[key]) return ids[key];
  const [ex] = await q('select id from customers where name=$1', [name]);
  if (ex) { ids[key] = ex.id; return ex.id; }
  const r = await admin.post('/api/customers', { name, email, phone: '0600000000' });
  if (![200, 201].includes(r.status)) throw new Error(`create customer ${name}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(ids); return ids[key];
}
async function createReservation(admin, body) {
  const r = await admin.post('/api/reservations', { type: 'standard', notes: 'AUDIT-P12', ...body });
  if (![200, 201].includes(r.status)) throw new Error(`create reservation: ${r.status} ${r.text.slice(0, 300)}`);
  return r.json.id;
}
const resRow = (id) => q('select id, vehicle_id, customer_id, status, type, start_date, end_date, contract_number, pickup_mileage, actual_pickup_date, placeholder_spare, replacement_for_reservation_id, replacement_for_transport_id, portal_request_id, affected_rental_id, deleted_at, spare_vehicle_status, maintenance_status from reservations where id=$1', [id]).then(r => r[0] || null);
const vehRow = (id) => q('select id, license_plate, availability_status, maintenance_status, current_mileage, current_fuel_level, maintenance_note from vehicles where id=$1', [id]).then(r => r[0] || null);
const brief = (r) => ({ status: r.status, body: (r.text || '').slice(0, 300) });

module.exports = { getAdmin, getPortal, q, pool, loadIds, saveIds, today, addDays, nextWeekday, ensureVehicle, ensureCustomer, createReservation, resRow, vehRow, brief, AUDIT_START };

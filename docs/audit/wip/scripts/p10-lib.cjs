// Phase 10 (reservations deep-dive) shared helpers.
// - one persisted admin session (cookie jar on disk, re-login only when the
//   session has expired; every re-login uses a fresh fakeIp 10.10.1.<n> so the
//   5-per-15-min login limiter never trips)
// - everywhereSnapshot(): every place the app shows a reservation, so a test
//   can assert consistency after each step of a sequence.
'use strict';
const fs = require('fs');
const path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');

const DIR = __dirname;
const SESSION_FILE = path.join(DIR, 'p10-session.json');
const IDS_FILE = path.join(DIR, 'p10-ids.json');

function loadIds() {
  return fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {};
}
function saveIds(ids) {
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 1));
}

async function getAdmin() {
  let state = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : { n: 0 };
  const s = new Session('admin', { fakeIp: state.fakeIp || '10.10.1.1' });
  if (state.cookies) {
    for (const [k, v] of Object.entries(state.cookies)) s.cookies.set(k, v);
    s.csrf = state.csrf;
    const probe = await s.get('/api/user');
    if (probe.status === 200) {
      persist(s, state);
      return s;
    }
  }
  state.n = (state.n || 0) + 1;
  state.fakeIp = `10.10.1.${state.n}`;
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
  const p = new Session('portal', { fakeIp: '10.10.2.' + (1 + Math.floor(Math.random() * 200)) });
  const r = await p.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  if (r.status !== 200) throw new Error('portal login failed ' + r.status + ' ' + r.text.slice(0, 200));
  return p;
}

const today = () => new Date().toISOString().split('T')[0];
function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().split('T')[0];
}

// Everywhere the app can show a reservation (API + DB), in one object.
async function everywhereSnapshot(admin, resId, opts = {}) {
  const out = { resId };
  const [row] = await q('select id, vehicle_id, customer_id, driver_id, start_date, end_date, start_time, end_time, actual_pickup_date, actual_return_date, completion_date, status, total_price, notes, contract_number, type, spare_vehicle_status, delivery_required, deleted_at, deleted_by, updated_by, updated_at, replacement_for_reservation_id from reservations where id=$1', [resId]);
  out.row = row || null;
  const get = await admin.get(`/api/reservations/${resId}`);
  out.getById = { status: get.status, res: get.json && get.json.id ? { id: get.json.id, status: get.json.status, vehicleId: get.json.vehicleId, customerId: get.json.customerId, startDate: get.json.startDate, endDate: get.json.endDate, hasVehicle: !!get.json.vehicle, hasCustomer: !!get.json.customer } : get.json };
  const list = await admin.get('/api/reservations');
  const inList = Array.isArray(list.json) ? list.json.find(r => r.id === resId) : null;
  out.list = { status: list.status, present: !!inList, entry: inList ? { status: inList.status, vehicleId: inList.vehicleId, customerId: inList.customerId, hasVehicle: !!inList.vehicle, hasCustomer: !!inList.customer } : null };
  if (row) {
    const s = row.start_date, e = row.end_date || row.start_date;
    const range = await admin.get(`/api/reservations/range?startDate=${s}&endDate=${e}`);
    const inRange = Array.isArray(range.json) ? range.json.find(r => r.id === resId) : null;
    out.range = { status: range.status, present: !!inRange, entry: inRange ? { status: inRange.status, hasVehicle: !!inRange.vehicle, hasCustomer: !!inRange.customer } : null };
    if (row.vehicle_id) {
      const byV = await admin.get(`/api/reservations/vehicle/${row.vehicle_id}`);
      out.byVehicle = { status: byV.status, present: Array.isArray(byV.json) && byV.json.some(r => r.id === resId) };
      const veh = await admin.get(`/api/vehicles/${row.vehicle_id}`);
      const [vrow] = await q('select id, license_plate, availability_status, current_mileage, current_fuel_level from vehicles where id=$1', [row.vehicle_id]);
      out.vehicle = { api: veh.status === 200 ? { availabilityStatus: veh.json.availabilityStatus, currentMileage: veh.json.currentMileage } : { status: veh.status }, db: vrow || null };
      const over = await admin.get(`/api/reservations/overdue/${row.vehicle_id}`);
      out.overdueForVehicle = { status: over.status, present: Array.isArray(over.json) && over.json.some(r => r.id === resId) };
    }
    if (row.customer_id) {
      const byC = await admin.get(`/api/reservations/customer/${row.customer_id}`);
      out.byCustomer = { status: byC.status, present: Array.isArray(byC.json) && byC.json.some(r => r.id === resId) };
      const cust = await admin.get(`/api/customers/${row.customer_id}`);
      out.customer = { status: cust.status };
    }
  }
  const up = await admin.get('/api/reservations/upcoming');
  out.upcoming = { status: up.status, present: Array.isArray(up.json) && up.json.some(r => r.id === resId) };
  const od = await admin.get('/api/reservations/overdue');
  out.overdueAll = { status: od.status, present: Array.isArray(od.json) && od.json.some(r => r.id === resId) };
  out.documents = await q('select id, document_type, file_name, vehicle_id from documents where reservation_id=$1 order by id', [resId]);
  out.driverAssignments = await q('select id, driver_id, assigned_until is null as open, note from reservation_driver_assignments where reservation_id=$1 order by id', [resId]);
  out.transports = await q('select id, status, transport_type, vehicle_id, scheduled_date from vehicle_transports where reservation_id=$1 order by id', [resId]);
  out.replacements = await q('select id, status, vehicle_id, placeholder_spare, deleted_at from reservations where replacement_for_reservation_id=$1 order by id', [resId]);
  out.auditLog = await q("select id, action, details->'changes' as changes, details->'operation' as op, status from audit_logs where resource_type='reservation' and resource_id=$1 order by id", [String(resId)]);
  if (opts.customerId || (row && row.customer_id)) {
    out.portalNotifications = await q('select id, type, title, dedupe_tag from portal_notifications where customer_id=$1 and created_at > now() - interval \'1 hour\' order by id', [opts.customerId || row.customer_id]);
  }
  const docs = await admin.get(`/api/documents/reservation/${resId}`);
  out.documentsApi = { status: docs.status, count: Array.isArray(docs.json) ? docs.json.length : null };
  return out;
}

function summarize(snap) {
  const r = snap.row;
  return {
    row: r ? `${r.status}${r.deleted_at ? '/DELETED' : ''} v=${r.vehicle_id} c=${r.customer_id} ${r.start_date}..${r.end_date} cn=${r.contract_number}` : 'NO ROW',
    getById: snap.getById.status,
    list: snap.list.present,
    range: snap.range ? snap.range.present : null,
    byVehicle: snap.byVehicle ? snap.byVehicle.present : null,
    byCustomer: snap.byCustomer ? snap.byCustomer.present : null,
    upcoming: snap.upcoming.present,
    overdueAll: snap.overdueAll.present,
    overdueVeh: snap.overdueForVehicle ? snap.overdueForVehicle.present : null,
    vehStatus: snap.vehicle ? `${snap.vehicle.db && snap.vehicle.db.availability_status}` : null,
    docs: snap.documents.length,
    docsApi: snap.documentsApi.count,
    drv: snap.driverAssignments.map(d => `${d.driver_id}${d.open ? '*' : ''}`).join(','),
    transports: snap.transports.map(t => `${t.id}:${t.status}`).join(','),
    audit: snap.auditLog.map(a => a.action + (a.op ? '/' + a.op : '')).join(','),
    portalNotif: snap.portalNotifications ? snap.portalNotifications.length : null,
  };
}

class Report {
  constructor(name) { this.name = name; this.lines = []; this.file = path.join(DIR, `${name}.out.json`); this.data = []; }
  step(title, obj) {
    const rec = { title, ...obj };
    this.data.push(rec);
    console.log('\n## ' + title);
    console.log(JSON.stringify(obj, null, 1).slice(0, 4000));
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1));
  }
}

const brief = (r, n = 300) => ({ status: r.status, body: (r.text || '').slice(0, n) });

async function health() {
  try { const r = await fetch('http://localhost:5001/health'); return r.status; } catch (e) { return 'DOWN'; }
}

module.exports = { getAdmin, getPortal, q, pool, today, addDays, everywhereSnapshot, summarize, Report, brief, loadIds, saveIds, health };

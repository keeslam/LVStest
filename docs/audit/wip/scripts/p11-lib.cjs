// Phase 11 helpers (transport & spare workflow). Reuses lib.cjs (HTTP) and db.cjs (SQL).
'use strict';
const fs = require('fs');
const path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');

const IDS_FILE = path.join(__dirname, 'p11-ids.json');
function loadIds() { return fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {}; }
function saveIds(ids) { fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2)); }

async function staff(fakeIp) {
  const s = new Session('staff', { fakeIp });
  const r = await s.loginStaff('admin', 'admin123');
  if (r.status !== 200) throw new Error('staff login failed ' + r.status + ' ' + r.text.slice(0, 200));
  return s;
}
async function portal(fakeIp) {
  const s = new Session('portal', { fakeIp });
  const r = await s.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  if (r.status !== 200) throw new Error('portal login failed ' + r.status + ' ' + r.text.slice(0, 200));
  return s;
}

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function today() { return iso(new Date()); }
function isWeekend(isoDate) { const d = new Date(isoDate + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6; }
function nextWeekday(isoDate) { let d = isoDate; while (isWeekend(d)) d = addDays(d, 1); return d; }
function nextWeekendDay(isoDate) { let d = isoDate; while (!isWeekend(d)) d = addDays(d, 1); return d; }

async function resRow(id) {
  const r = await q('select id, vehicle_id, customer_id, start_date, end_date, start_time, end_time, status, type, replacement_for_reservation_id, replacement_for_transport_id, placeholder_spare, spare_vehicle_status, maintenance_status, maintenance_category, maintenance_duration, spare_assignment_decision, affected_rental_id, portal_request_id, notes, deleted_at, created_by, updated_by from reservations where id=$1', [id]);
  return r[0] || null;
}
async function vehRow(id) {
  const r = await q('select id, license_plate, availability_status, maintenance_status, maintenance_note, current_mileage from vehicles where id=$1', [id]);
  return r[0] || null;
}
async function trRow(id) {
  const r = await q('select id, vehicle_id, related_vehicle_id, reservation_id, customer_id, spare_required, spare_reservation_id, transport_type, status, is_breakdown_or_maintenance, scheduled_date, completed_date, is_external_vehicle from vehicle_transports where id=$1', [id]);
  return r[0] || null;
}
async function replacementsFor(rentalId) {
  return q('select id, vehicle_id, start_date, end_date, status, placeholder_spare, replacement_for_transport_id, deleted_at, notes from reservations where replacement_for_reservation_id=$1 order by id', [rentalId]);
}
async function blocksFor(vehicleId) {
  return q("select id, start_date, end_date, status, maintenance_status, maintenance_duration, affected_rental_id, portal_request_id, deleted_at from reservations where vehicle_id=$1 and type='maintenance_block' order by id", [vehicleId]);
}
async function portalNotifs(customerId, sinceId = 0) {
  return q('select id, type, title, dedupe_tag, link, created_at from portal_notifications where customer_id=$1 and id>$2 order by id', [customerId, sinceId]);
}
async function emailLogs(sinceId = 0) {
  const cols = (await q("select column_name from information_schema.columns where table_name='email_logs'")).map(r => r.column_name);
  return q(`select id, ${cols.filter(c => ['recipient','recipient_email','to_email','subject','status','template_key','template','type','error','error_message','created_at','sent_at'].includes(c)).join(', ')} from email_logs where id>$1 order by id`, [sinceId]);
}
async function customNotifs(pattern) {
  return q("select id, type, title, description, is_read from custom_notifications where description like $1 or title like $1 order by id", [pattern]);
}
async function auditLogs(sinceId = 0, filter = '') {
  const cols = (await q("select column_name from information_schema.columns where table_name='audit_logs'")).map(r => r.column_name);
  const rows = await q(`select * from audit_logs where id>$1 order by id`, [sinceId]);
  return rows.map(r => { const o = {}; for (const c of ['id','action','entity_type','entity_id','resource_type','resource_id','username','user_id','status','outcome','details','metadata','created_at','timestamp']) if (c in r) o[c] = r[c]; return o; }).filter(r => !filter || JSON.stringify(r).includes(filter));
}
async function maxId(table) { const r = await q(`select coalesce(max(id),0) as m from ${table}`); return Number(r[0].m); }

function log(...a) { console.log(...a.map(x => (typeof x === 'string' ? x : JSON.stringify(x)))); }
async function step(title, fn) { console.log('\n=== ' + title + ' ==='); try { return await fn(); } catch (e) { console.log('STEP ERROR', e && e.message ? e.message : e); return undefined; } }
const short = (r) => `${r.status} ${(r.text || '').slice(0, 300)}`;

module.exports = { Session, q, pool, staff, portal, loadIds, saveIds, addDays, today, isWeekend, nextWeekday, nextWeekendDay, resRow, vehRow, trRow, replacementsFor, blocksFor, portalNotifs, emailLogs, customNotifs, auditLogs, maxId, log, step, short };

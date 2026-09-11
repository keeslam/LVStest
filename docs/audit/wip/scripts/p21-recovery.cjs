// Phase 21/29 — error-recovery probes against the audit server (:5001, lvs_audit).
// Prefix AUDIT-P21. Exercises: wrong customer / vehicle / dates (edit paths),
// accidental pickup (revert), accidental cancel (un-cancel?), accidental delete
// (recycle bin?), wrong spare assignment (un-assign?), vehicle delete/restore,
// and checks audit_logs after each action.
'use strict';
const fs = require('fs');
const path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');

const OUT = path.join(__dirname, 'p21-recovery.out.json');
const today = () => new Date().toISOString().split('T')[0];
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]; }
const brief = (r, n = 160) => ({ status: r.status, body: (r.text || '').slice(0, n) });
const steps = [];
function step(name, data) { steps.push({ name, ...data }); console.log('==', name, JSON.stringify(data).slice(0, 400)); }

async function auditRows(resId) {
  return q("select id, action, details->>'operation' as op, details->'changes' as changes, details->'request' as request, username from audit_logs where resource_type='reservation' and resource_id=$1 order by id", [String(resId)]);
}
async function resRow(id) {
  const [r] = await q('select id, status, vehicle_id, customer_id, start_date, end_date, contract_number, actual_pickup_date, pickup_mileage, fuel_level_pickup, deleted_at, deleted_by, placeholder_spare, type, replacement_for_reservation_id from reservations where id=$1', [id]);
  return r || null;
}

(async () => {
  const admin = new Session('p21-admin', { fakeIp: '10.21.1.1' });
  const login = await admin.loginStaff('admin', 'admin123');
  if (login.status !== 200) throw new Error('login failed ' + login.status + ' ' + login.text.slice(0, 200));

  // ---- fixtures -------------------------------------------------------------
  const ids = { vehicles: {}, customers: {} };
  for (const i of [211, 212, 213]) {
    const plate = `AU-${i}-X`;
    const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
    if (ex) { ids.vehicles[plate] = ex.id; continue; }
    const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P21', model: `P21-${i}`, vehicleType: 'car', currentMileage: 1000 * (i - 200), dailyPrice: '40' });
    if (r.status === 201 || r.status === 200) ids.vehicles[plate] = r.json.id; else throw new Error('vehicle create ' + r.status + r.text.slice(0, 200));
  }
  for (const n of ['A', 'B']) {
    const name = `AUDIT-P21 Customer ${n}`;
    const [ex] = await q('select id from customers where name=$1', [name]);
    if (ex) { ids.customers[n] = ex.id; continue; }
    const r = await admin.post('/api/customers', { name, email: `audit-p21-${n.toLowerCase()}@example.com`, phone: '0600000021' });
    if (r.status === 201 || r.status === 200) ids.customers[n] = r.json.id; else throw new Error('customer create ' + r.status + r.text.slice(0, 200));
  }
  const V1 = ids.vehicles['AU-211-X'], V2 = ids.vehicles['AU-212-X'], V3 = ids.vehicles['AU-213-X'];
  const CA = ids.customers.A, CB = ids.customers.B;
  const T = today();
  step('fixtures', { ids, today: T });

  // ---- 1. wrong customer / vehicle / dates on a booked reservation ----------
  let r = await admin.post('/api/reservations', { vehicleId: V1, customerId: CA, startDate: addDays(T, 10), endDate: addDays(T, 12), totalPrice: 120, notes: 'AUDIT-P21 R1 wrong-customer' });
  const R1 = r.json && r.json.id;
  step('1a create R1 (customer A on V1)', { create: brief(r), row: await resRow(R1) });

  // the "form" path: PATCH /:id as JSON (the UI sends multipart -> BUG-202; JSON works)
  r = await admin.patch(`/api/reservations/${R1}`, { customerId: CB });
  step('1b fix wrong customer via PATCH /:id {customerId}', { patch: brief(r), row: await resRow(R1), audit: await auditRows(R1) });

  // the /basic path (used by other dialogs) needs a full body
  const full = (await admin.get(`/api/reservations/${R1}`)).json;
  r = await admin.patch(`/api/reservations/${R1}/basic`, { vehicleId: V2, customerId: full.customerId, startDate: full.startDate, endDate: full.endDate, status: full.status, totalPrice: full.totalPrice, notes: full.notes });
  step('1c fix wrong vehicle via PATCH /:id/basic {vehicleId V2}', { patch: brief(r), row: await resRow(R1) });

  r = await admin.patch(`/api/reservations/${R1}`, { startDate: addDays(T, 11), endDate: addDays(T, 13) });
  step('1d fix wrong dates via PATCH /:id {dates}', { patch: brief(r), row: await resRow(R1), audit: await auditRows(R1) });

  // can the activity log be read through the API with a search on the reservation id?
  r = await admin.get(`/api/audit-logs?resourceType=reservation&search=${R1}&limit=20`);
  step('1e GET /api/audit-logs for R1', { status: r.status, total: r.json && r.json.total, rows: r.json && (r.json.logs || r.json.items || r.json.rows || r.json).length, sample: r.json && JSON.stringify(r.json).slice(0, 500) });

  // ---- 2. accidental pickup -> revert -------------------------------------------
  r = await admin.post('/api/reservations', { vehicleId: V2, customerId: CA, startDate: addDays(T, 20), endDate: addDays(T, 22), totalPrice: 80, notes: 'AUDIT-P21 R2 accidental-pickup' });
  const R2 = r.json && r.json.id;
  const next = await admin.get('/api/settings/next-contract-number');
  const cn = next.json && next.json.contractNumber;
  r = await admin.post(`/api/reservations/${R2}/pickup`, { contractNumber: String(cn), pickupMileage: 12000, fuelLevelPickup: 'Full', pickupDate: T });
  const vAfterPickup = (await admin.get(`/api/vehicles/${V2}`)).json;
  const docsAfterPickup = await q('select id, document_type, file_name from documents where reservation_id=$1 order by id', [R2]);
  step('2a pickup R2 (start in 20 days, no warning expected)', { nextContract: cn, pickup: brief(r), row: await resRow(R2), vehicleStatus: vAfterPickup && vAfterPickup.availabilityStatus, vehicleMileage: vAfterPickup && vAfterPickup.currentMileage, docs: docsAfterPickup });

  r = await admin.patch(`/api/reservations/${R2}/status`, { status: 'booked' });
  const vAfterRevert = (await admin.get(`/api/vehicles/${V2}`)).json;
  const docsAfterRevert = await q('select id, document_type, file_name from documents where reservation_id=$1 order by id', [R2]);
  step('2b revert R2 picked_up -> booked ("Terugzetten naar geboekt")', { revert: brief(r), row: await resRow(R2), vehicleStatus: vAfterRevert && vAfterRevert.availabilityStatus, vehicleMileage: vAfterRevert && vAfterRevert.currentMileage, docsStillThere: docsAfterRevert, audit: await auditRows(R2) });

  // ---- 3. accidental cancellation -> un-cancel? ---------------------------------
  r = await admin.post('/api/reservations', { vehicleId: V1, customerId: CB, startDate: addDays(T, 30), endDate: addDays(T, 32), totalPrice: 80, notes: 'AUDIT-P21 R3 accidental-cancel' });
  const R3 = r.json && r.json.id;
  r = await admin.patch(`/api/reservations/${R3}/status`, { status: 'cancelled' });
  step('3a cancel R3 via /status', { cancel: brief(r), row: await resRow(R3) });
  r = await admin.patch(`/api/reservations/${R3}/status`, { status: 'booked' });
  step('3b un-cancel via /status {booked}', { uncancel: brief(r), row: await resRow(R3) });
  r = await admin.patch(`/api/reservations/${R3}`, { status: 'booked' });
  step('3c un-cancel via generic PATCH /:id {status booked} (what the edit form would send)', { uncancel: brief(r), row: await resRow(R3), audit: await auditRows(R3) });

  // ---- 4. accidental delete -> recycle bin? ---------------------------------------
  r = await admin.post('/api/reservations', { vehicleId: V1, customerId: CA, startDate: addDays(T, 40), endDate: addDays(T, 42), totalPrice: 80, notes: 'AUDIT-P21 R4 accidental-delete' });
  const R4 = r.json && r.json.id;
  r = await admin.del(`/api/reservations/${R4}`);
  const getDeleted = await admin.get(`/api/reservations/${R4}`);
  const list = await admin.get('/api/reservations');
  const inList = Array.isArray(list.json) && list.json.some(x => x.id === R4);
  const bin = await admin.get('/api/deleted-records');
  const binTypes = Array.isArray(bin.json) ? [...new Set(bin.json.map(x => x.entityType))] : bin.status;
  const binHasR4 = Array.isArray(bin.json) && bin.json.some(x => x.entityType === 'reservation' && String(x.entityId) === String(R4));
  step('4a delete R4 (soft) — visibility', { del: brief(r), row: await resRow(R4), getById: getDeleted.status, inList, binStatus: bin.status, binEntityTypes: binTypes, binHasR4, audit: await auditRows(R4) });
  // try to undelete through the generic PATCH (no UI for this)
  r = await admin.patch(`/api/reservations/${R4}`, { deletedAt: null, deletedBy: null });
  step('4b undelete attempt via PATCH /:id {deletedAt:null}', { patch: brief(r), row: await resRow(R4), getById: (await admin.get(`/api/reservations/${R4}`)).status });

  // ---- 5. wrong spare assignment -> un-assign? ------------------------------------
  r = await admin.post('/api/placeholder-reservations', { originalReservationId: R1, customerId: CB, startDate: addDays(T, 11), endDate: addDays(T, 13) });
  const P = r.json && r.json.id;
  step('5a create TBD placeholder for R1', { create: brief(r), row: await resRow(P) });
  r = await admin.post(`/api/placeholder-reservations/${P}/assign-vehicle`, { vehicleId: V3 });
  step('5b assign V3 to placeholder (the "wrong" spare)', { assign: brief(r), row: await resRow(P) });
  r = await admin.patch(`/api/reservations/${P}`, { vehicleId: null, placeholderSpare: true });
  step('5c un-assign attempt: PATCH /:id {vehicleId:null, placeholderSpare:true}', { patch: brief(r), row: await resRow(P) });
  r = await admin.patch(`/api/reservations/${P}`, { vehicleId: V1 });
  step('5d re-assign to a different vehicle via PATCH /:id {vehicleId} (conflict check?)', { patch: brief(r), row: await resRow(P), audit: await auditRows(P) });
  const conflicts = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V1}&startDate=${addDays(T, 11)}&endDate=${addDays(T, 13)}`);
  step('5e check-conflicts V1 on the spare period', { status: conflicts.status, ids: Array.isArray(conflicts.json) ? conflicts.json.map(x => x.id) : conflicts.text.slice(0, 100) });

  // ---- 6. vehicle accidental delete -> restore ------------------------------------
  r = await admin.post('/api/reservations', { vehicleId: V3, customerId: CA, startDate: addDays(T, 50), endDate: addDays(T, 52), totalPrice: 80, notes: 'AUDIT-P21 R6 on V3' });
  const R6 = r.json && r.json.id;
  r = await admin.del(`/api/vehicles/${V3}`, { confirmLicensePlate: 'AU-213-X' });
  const binAfterVehicle = await admin.get('/api/deleted-records');
  const rec = Array.isArray(binAfterVehicle.json) ? binAfterVehicle.json.find(x => x.entityType === 'vehicle' && String(x.entityId) === String(V3)) : null;
  step('6a delete vehicle V3 (with confirmation) — has R6 and the spare P', { del: brief(r), r6: await resRow(R6), spareP: await resRow(P), binRecord: rec && { id: rec.id, label: rec.label, relatedCounts: rec.relatedCounts } });
  if (rec) {
    r = await admin.post(`/api/deleted-records/${rec.id}/restore`);
    step('6b restore V3 from the recycle bin', { restore: brief(r), vehicle: (await admin.get(`/api/vehicles/${V3}`)).status, r6: await resRow(R6), spareP: await resRow(P), vehicleAudit: await q("select id, action, details->>'operation' as op from audit_logs where resource_type='vehicle' and resource_id=$1 order by id", [String(V3)]) });
  }

  // ---- 7. accidental pickup on a car that is in the workshop ---------------------
  r = await admin.patch(`/api/vehicles/${V1}/maintenance-status`, { status: 'in_service', note: 'AUDIT-P21 workshop' });
  const r7c = await admin.post('/api/reservations', { vehicleId: V1, customerId: CA, startDate: T, endDate: addDays(T, 2), totalPrice: 80, notes: 'AUDIT-P21 R7 pickup while in_service' });
  const R7 = r7c.json && r7c.json.id;
  const next2 = await admin.get('/api/settings/next-contract-number');
  const p7 = await admin.post(`/api/reservations/${R7}/pickup`, { contractNumber: String(next2.json.contractNumber), pickupMileage: 11000, fuelLevelPickup: 'Full', pickupDate: T });
  step('7 pickup while vehicle in_service (BUG-109 context, for the human-error catalogue)', { setInService: brief(r), create: brief(r7c, 80), pickup: brief(p7), row: await resRow(R7), vehicle: (await admin.get(`/api/vehicles/${V1}`)).json && { availabilityStatus: (await admin.get(`/api/vehicles/${V1}`)).json.availabilityStatus, maintenanceStatus: (await admin.get(`/api/vehicles/${V1}`)).json.maintenanceStatus } });
  // put it back
  await admin.patch(`/api/reservations/${R7}/status`, { status: 'booked' });
  await admin.patch(`/api/vehicles/${V1}/maintenance-status`, { status: 'ok' });

  // ---- 8. duplicate reservation (same customer, same vehicle, same dates) ----------
  const d1 = await admin.post('/api/reservations', { vehicleId: V2, customerId: CB, startDate: addDays(T, 60), endDate: addDays(T, 62), totalPrice: 80, notes: 'AUDIT-P21 R8 dup 1' });
  const d2 = await admin.post('/api/reservations', { vehicleId: V2, customerId: CB, startDate: addDays(T, 60), endDate: addDays(T, 62), totalPrice: 80, notes: 'AUDIT-P21 R8 dup 2' });
  step('8 exact duplicate booking (double submit)', { first: brief(d1, 80), second: brief(d2, 200) });

  fs.writeFileSync(OUT, JSON.stringify({ ids, R1, R2, R3, R4, P, R6, R7, steps }, null, 1));
  console.log('written', OUT);
  await pool.end();
})().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });

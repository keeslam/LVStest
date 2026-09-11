// Phase 22 — end-to-end business chains (customer→reservation, transport,
// maintenance, documents) against the audit server :5001 / lvs_audit.
// Each step: request → response brief → SQL state after. Output p22-chains.out.json
'use strict';
const fs = require('fs');
const path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool, url } = require('./db.cjs');
if (!/lvs_audit$/.test(url)) throw new Error('refusing: DATABASE_URL does not point at lvs_audit');

const OUT = path.join(__dirname, 'p22-chains.out.json');
const IDS_FILE = path.join(__dirname, 'p22-ids.json');
const ids = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {};
const saveIds = () => fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 1));
const steps = [];
function log(chain, step, data) {
  const rec = { chain, step, ...data };
  steps.push(rec);
  console.log(`[${chain}] ${step}:`, JSON.stringify(data).slice(0, 900));
  fs.writeFileSync(OUT, JSON.stringify(steps, null, 2));
}
const today = new Date().toISOString().slice(0, 10);
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function weekday(d) { let x = d; while ([0, 6].includes(new Date(x + 'T00:00:00Z').getUTCDay())) x = addDays(x, 1); return x; }
const brief = (r) => ({ status: r.status, body: r.json ? JSON.stringify(r.json).slice(0, 300) : (r.text || '').slice(0, 200) });

async function resRow(id) {
  const [r] = await q('select id, vehicle_id, customer_id, start_date, end_date, status, type, contract_number, total_price, pickup_mileage, return_mileage, actual_pickup_date, actual_return_date, deleted_at, replacement_for_reservation_id, replacement_for_transport_id, placeholder_spare, spare_vehicle_status, maintenance_status, spare_assignment_decision, delivery_required, delivery_status from reservations where id=$1', [id]);
  return r || null;
}
async function vehRow(id) {
  const [r] = await q('select id, license_plate, availability_status, maintenance_status, maintenance_note, current_mileage, current_fuel_level from vehicles where id=$1', [id]);
  return r || null;
}
async function docsFor(resId) { return q('select id, document_type, file_name, file_size, upload_date from documents where reservation_id=$1 order by id', [resId]); }
async function trRow(id) { const [r] = await q('select id, vehicle_id, related_vehicle_id, reservation_id, customer_id, spare_required, spare_reservation_id, transport_type, status, scheduled_date, completed_date, origin_city, destination_city, is_breakdown_or_maintenance from vehicle_transports where id=$1', [id]); return r || null; }
async function notifSince(t0) { return q('select id, type, title, left(description,80) d from custom_notifications where created_at >= $1 order by id', [t0]); }
async function portalNotifSince(t0) { return q('select id, customer_id, type, title from portal_notifications where created_at >= $1 order by id', [t0]); }
async function auditSince(t0) { return q('select id, action, resource_type, resource_id from audit_logs where created_at >= $1 order by id', [t0]); }

async function ensureVehicle(admin, key, plate, extra = {}) {
  if (ids[key]) { const [row] = await q('select id from vehicles where id=$1', [ids[key]]); if (row) return ids[key]; }
  const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
  if (ex) { ids[key] = ex.id; saveIds(); return ex.id; }
  const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P22', model: key, vehicleType: 'car', currentMileage: 10000, dailyPrice: '45', currentFuelLevel: 'full', ...extra });
  if (![200, 201].includes(r.status)) throw new Error(`create vehicle ${plate}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(); return ids[key];
}
async function ensureCustomer(admin, key, name, extra = {}) {
  if (ids[key]) { const [row] = await q('select id from customers where id=$1', [ids[key]]); if (row) return ids[key]; }
  const [ex] = await q('select id from customers where name=$1 order by id limit 1', [name]);
  if (ex) { ids[key] = ex.id; saveIds(); return ex.id; }
  const r = await admin.post('/api/customers', { name, email: `${key.toLowerCase()}@audit-p22.example`, emailGeneral: `${key.toLowerCase()}@audit-p22.example`, phone: '0612345678', address: 'AUDIT-P22 straat 1', postalCode: '1234AB', city: 'Zuidland', ...extra });
  if (![200, 201].includes(r.status)) throw new Error(`create customer ${name}: ${r.status} ${r.text.slice(0, 200)}`);
  ids[key] = r.json.id; saveIds(); return ids[key];
}

(async () => {
  const admin = new Session('admin', { fakeIp: '10.22.1.1' });
  const lr = await admin.loginStaff('admin', 'admin123');
  if (lr.status !== 200) throw new Error('login failed ' + lr.status + ' ' + lr.text.slice(0, 200));
  const T0 = new Date();

  // ---------- fixtures ----------
  const cA = await ensureCustomer(admin, 'cA', 'AUDIT-P22 Klant A');
  const cB = await ensureCustomer(admin, 'cB', 'AUDIT-P22 Klant B');
  const vA = await ensureVehicle(admin, 'vA', 'AU-22A-X');   // chain 1 rental
  const vB = await ensureVehicle(admin, 'vB', 'AU-22B-X');   // chain 1 second rental (BUG-113 probe)
  const vC = await ensureVehicle(admin, 'vC', 'AU-22C-X');   // chain 3 maintenance original
  const vD = await ensureVehicle(admin, 'vD', 'AU-22D-X');   // chain 3 spare
  const vE = await ensureVehicle(admin, 'vE', 'AU-22E-X');   // chain 2 transport original
  const vF = await ensureVehicle(admin, 'vF', 'AU-22F-X');   // chain 2 transport spare
  const vG = await ensureVehicle(admin, 'vG', 'AU-22G-X');   // chain 4 documents
  log('setup', 'fixtures', { cA, cB, vA, vB, vC, vD, vE, vF, vG, today });

  // =====================================================================
  // CHAIN 1 — CUSTOMER → RESERVATION → PICKUP → RETURN → CLOSE
  // =====================================================================
  {
    const C = 'chain1';
    // 1. find customer (list is the only lookup: no server search endpoint)
    let r = await admin.get('/api/customers');
    const found = Array.isArray(r.json) ? r.json.filter(c => /AUDIT-P22 Klant A/.test(c.name)) : [];
    log(C, '1 find customer GET /api/customers (client-side filter)', { status: r.status, rows: Array.isArray(r.json) ? r.json.length : null, bytes: r.text.length, found: found.map(c => c.id) });
    // 2. select vehicle: available list for the dates
    const s = today, e = addDays(today, 3);
    r = await admin.get(`/api/vehicles/available?startDate=${s}&endDate=${e}`);
    const avail = Array.isArray(r.json) ? r.json : [];
    log(C, '2 select vehicle GET /api/vehicles/available?startDate&endDate', { status: r.status, count: avail.length, containsVA: avail.some(v => v.id === vA), vAstatus: (await vehRow(vA)).availability_status });
    // 3. check availability
    r = await admin.get(`/api/reservations/check-conflicts?vehicleId=${vA}&startDate=${s}&endDate=${e}`);
    const r2 = await admin.get(`/api/reservations/check-availability/${vA}/${s}/${e}`);
    log(C, '3 check availability', { conflicts: brief(r), checkAvailability: brief(r2) });
    // 4. create reservation
    r = await admin.post('/api/reservations', { vehicleId: vA, customerId: cA, startDate: s, endDate: e, totalPrice: 135, notes: 'AUDIT-P22 chain1' });
    const R1 = r.json?.id;
    ids.R1 = R1; saveIds();
    log(C, '4 create reservation POST /api/reservations', { ...brief(r), reservation: await resRow(R1), vehicle: await vehRow(vA), audit: await auditSince(T0) });
    // 5. assign vehicle — vehicle change via the edit path (what the UI's "Bewerken" sends is multipart with every column → BUG-202; JSON PATCH with vehicleId works)
    r = await admin.patch(`/api/reservations/${R1}`, { vehicleId: vA });
    log(C, '5 assign/confirm vehicle PATCH /api/reservations/:id {vehicleId}', { ...brief(r), reservation: await resRow(R1) });
    // 6. generate documents (contract before pickup: generate-versioned = the "Contract" button path)
    r = await admin.post(`/api/contracts/generate-versioned/${R1}`, { vehicleId: vA, customerId: cA, startDate: s, endDate: e, notes: 'AUDIT-P22 chain1' });
    const docs6 = await docsFor(R1);
    log(C, '6 generate documents POST /api/contracts/generate-versioned/:id', { status: r.status, contentType: r.headers.get('content-type'), bytes: r.text.length, docs: docs6 });
    // 7. send information (SMTP config points at 127.0.0.1:1 → what does "send" do?)
    const docId = docs6[0]?.id;
    const t7 = Date.now();
    r = await admin.post(`/api/documents/${docId}/email`, { recipients: 'ca@audit-p22.example', subject: 'AUDIT-P22 contract', message: 'AUDIT-P22 test' });
    const ms7 = Date.now() - t7;
    const t7b = Date.now();
    const r7b = await admin.post('/api/email/send-documents', { documentIds: [docId], recipientEmail: 'ca@audit-p22.example', subject: 'AUDIT-P22 contract 2', message: 'AUDIT-P22 test' });
    const ms7b = Date.now() - t7b;
    const logs = await q('select count(*)::int n from email_logs');
    log(C, '7 send information POST /api/documents/:id/email + /api/email/send-documents', { docEmail: { ...brief(r), ms: ms7 }, sendDocuments: { ...brief(r7b), ms: ms7b }, emailLogsTotal: logs[0].n, notifications: await notifSince(T0), audit: (await auditSince(T0)).slice(-3) });
    // 8. pickup
    r = await admin.get('/api/settings/next-contract-number');
    const cn = r.json?.nextContractNumber ?? r.json?.contractNumber ?? r.json;
    log(C, '8a next contract number GET /api/settings/next-contract-number', brief(r));
    r = await admin.post(`/api/reservations/${R1}/pickup`, { contractNumber: String(cn), pickupMileage: 10000, fuelLevelPickup: 'full' });
    log(C, '8b pickup POST /api/reservations/:id/pickup', { status: r.status, body: JSON.stringify(r.json).slice(0, 200), reservation: await resRow(R1), vehicle: await vehRow(vA), docs: await docsFor(R1), overdueList: (await admin.get('/api/reservations/overdue')).json?.length });
    // 9. return
    r = await admin.post(`/api/reservations/${R1}/return`, { returnMileage: 10250, fuelLevelReturn: 'half' });
    log(C, '9 return POST /api/reservations/:id/return', { status: r.status, body: JSON.stringify(r.json).slice(0, 200), reservation: await resRow(R1), vehicle: await vehRow(vA), docs: await docsFor(R1) });
    // 10. close
    r = await admin.patch(`/api/reservations/${R1}/status`, { status: 'completed' });
    log(C, '10 close PATCH /api/reservations/:id/status {completed}', { ...brief(r), reservation: await resRow(R1), vehicle: await vehRow(vA), portalNotifs: await portalNotifSince(T0), audit: await auditSince(T0) });
    // 10b. BUG-113 probe: second rental on vB returned 5 days ago without "close" → future booking blocked?
    r = await admin.post('/api/reservations', { vehicleId: vB, customerId: cB, startDate: addDays(today, -7), endDate: addDays(today, -5), totalPrice: 90, notes: 'AUDIT-P22 chain1 bug113' });
    const R1b = r.json?.id; ids.R1b = R1b; saveIds();
    const pr = await admin.post(`/api/reservations/${R1b}/pickup`, { contractNumber: 'AUDIT-P22-B113', pickupMileage: 10000, fuelLevelPickup: 'full' });
    const rr = await admin.post(`/api/reservations/${R1b}/return`, { returnMileage: 10100, fuelLevelReturn: 'full', returnDate: addDays(today, -5) });
    const fut = await admin.post('/api/reservations', { vehicleId: vB, customerId: cA, startDate: addDays(today, 30), endDate: addDays(today, 32), totalPrice: 90, notes: 'AUDIT-P22 chain1 bug113 future' });
    log(C, '10b returned-but-not-closed rental blocks next booking (BUG-113 probe)', { create: pr.status, pickup: pr.status, return: rr.status, returned: await resRow(R1b), futureBooking: brief(fut), vehicle: await vehRow(vB) });
  }

  // =====================================================================
  // CHAIN 2 — TRANSPORT (request → … → completion → documents)
  // =====================================================================
  {
    const C = 'chain2';
    const T1 = new Date();
    // 0. the customer is currently driving vE (picked-up rental) — the realistic case for a swap
    let r = await admin.post('/api/reservations', { vehicleId: vE, customerId: cB, startDate: addDays(today, -10), endDate: addDays(today, 20), totalPrice: 900, notes: 'AUDIT-P22 chain2 rental on vE' });
    const R2 = r.json?.id; ids.R2 = R2; saveIds();
    const pk = await admin.post(`/api/reservations/${R2}/pickup`, { contractNumber: 'AUDIT-P22-C2', pickupMileage: 10000, fuelLevelPickup: 'full' });
    log(C, '0 customer drives vE (rental picked up)', { create: r.status, pickup: pk.status, reservation: await resRow(R2), vehicle: await vehRow(vE) });
    // 1. request → 2. customer → 3. vehicle → 4. planning: create swap transport, spare required, TBD
    const day = weekday(addDays(today, 2));
    r = await admin.post('/api/transports', { vehicleId: vE, customerId: cB, reservationId: R2, transportType: 'swap', scheduledDate: day, spareRequired: true, isBreakdownOrMaintenance: true, reason: 'AUDIT-P22 chain2 breakdown', originCity: 'Zuidland', destinationCity: 'Rotterdam' });
    const TR = r.json?.id; ids.TR = TR; saveIds();
    const tr1 = await trRow(TR);
    const ph = tr1 && tr1.spare_reservation_id ? await resRow(tr1.spare_reservation_id) : null;
    log(C, '1-4 request/customer/vehicle/planning POST /api/transports (swap, spare TBD, breakdown)', { ...brief(r), transport: tr1, placeholder: ph, originalVehicle: await vehRow(vE), notifications: await notifSince(T1), needingAssignment: (await admin.get('/api/placeholder-reservations/needing-assignment?daysAhead=30')).json?.map(p => p.id) });
    // 5. transport info
    r = await admin.patch(`/api/transports/${TR}`, { originAddress: 'AUDIT-P22 Kerkweg 1', destinationAddress: 'AUDIT-P22 Garage 2', driverName: 'AUDIT-P22 Chauffeur', notes: 'AUDIT-P22 info' });
    log(C, '5 transport info PATCH /api/transports/:id', { ...brief(r), transport: await trRow(TR) });
    // 6. possible replacement → 7. maintenance flag → 8. spare reservation: assign spare via the placeholder widget path
    const tr2 = await trRow(TR);
    r = await admin.post(`/api/placeholder-reservations/${tr2.spare_reservation_id}/assign-vehicle`, { vehicleId: vF });
    const tr3 = await trRow(TR);
    log(C, '6-8 replacement/maintenance/spare: assign-vehicle on placeholder', { ...brief(r), transport: tr3, spareReservation: await resRow(tr3.spare_reservation_id), spareVehicle: await vehRow(vF), originalVehicle: await vehRow(vE), needingAssignment: (await admin.get('/api/placeholder-reservations/needing-assignment?daysAhead=30')).json?.map(p => p.id) });
    // 9. final vehicle assignment: change spare vF → vD? (keep vF; verify GET shows assigned)
    r = await admin.get(`/api/transports/${TR}`);
    log(C, '9 final vehicle assignment GET /api/transports/:id', { status: r.status, relatedVehicle: r.json?.relatedVehicle?.licensePlate, spareReservation: r.json?.spareReservation ? { id: r.json.spareReservation.id, status: r.json.spareReservation.status, start: r.json.spareReservation.startDate, end: r.json.spareReservation.endDate } : null });
    // 10. transport day: what does the scan flow show for vE / vF?
    const bE = (await vehRow(vE)); const bF = (await vehRow(vF));
    const [bcE] = await q('select barcode from vehicles where id=$1', [vE]);
    const [bcF] = await q('select barcode from vehicles where id=$1', [vF]);
    const scE = await admin.get(`/api/barcodes/${encodeURIComponent(bcE.barcode || bE.license_plate)}`);
    const scF = await admin.get(`/api/barcodes/${encodeURIComponent(bcF.barcode || bF.license_plate)}`);
    log(C, '10 transport day: scan vE and vF GET /api/barcodes/:code', { vE: { status: scE.status, activeReservation: scE.json?.activeReservation?.id, activeTransport: scE.json?.activeTransport, activeMaintenance: scE.json?.activeMaintenance }, vF: { status: scF.status, activeReservation: scF.json?.activeReservation, upcomingReservation: scF.json?.upcomingReservation, activeTransport: scF.json?.activeTransport } });
    // 11. pickup of the spare (customer gets vF) — spare reservation is dated on the transport day (+2), pickup today
    const spareId = tr3.spare_reservation_id;
    r = await admin.post(`/api/reservations/${spareId}/pickup`, { contractNumber: 'AUDIT-P22-C2-SPARE', pickupMileage: 10000, fuelLevelPickup: 'full' });
    log(C, '11 pickup spare POST /api/reservations/:spare/pickup', { ...brief(r), spareReservation: await resRow(spareId), spareVehicle: await vehRow(vF), docs: await docsFor(spareId), transport: await trRow(TR) });
    // 12. transport: start
    r = await admin.patch(`/api/transports/${TR}`, { status: 'in_progress' });
    log(C, '12 transport start PATCH {status:in_progress}', { ...brief(r), transport: await trRow(TR) });
    // 13. completion (dashboard sends completedDate)
    r = await admin.patch(`/api/transports/${TR}`, { status: 'completed', completedDate: today });
    log(C, '13 completion PATCH {status:completed}', { ...brief(r), transport: await trRow(TR), originalVehicle: await vehRow(vE), spareVehicle: await vehRow(vF), spareReservation: await resRow(spareId), originalRental: await resRow(R2) });
    // 14. documents
    r = await admin.post('/api/delivery/transports/generate-report', { transportIds: [TR] });
    const trDocs = await q("select id, document_type, file_name, reservation_id, vehicle_id from documents where document_type='transport_report' order by id desc limit 2");
    log(C, '14 documents POST /api/delivery/transports/generate-report', { ...brief(r), transportDocs: trDocs, audit: (await auditSince(T1)).map(a => a.action) });
    // 15. what remains open: the spare is out with the customer, original rental still picked_up on vE (in workshop)
    log(C, '15 end state', { originalRental: await resRow(R2), spareReservation: await resRow(spareId), vE: await vehRow(vE), vF: await vehRow(vF), spareWidgetAssigned: (await admin.get('/api/reservations')).json?.filter(x => x.type === 'replacement' && x.deletedAt == null && (x.replacementForTransportId === TR)).map(x => ({ id: x.id, status: x.status, spareVehicleStatus: x.spareVehicleStatus })) });
  }

  // =====================================================================
  // CHAIN 3 — MAINTENANCE (problem → unavailable → spare → repair → available)
  // =====================================================================
  {
    const C = 'chain3';
    const T2 = new Date();
    let r = await admin.post('/api/reservations', { vehicleId: vC, customerId: cA, startDate: addDays(today, -5), endDate: addDays(today, 25), totalPrice: 1000, notes: 'AUDIT-P22 chain3 rental on vC' });
    const R3 = r.json?.id; ids.R3 = R3; saveIds();
    const pk = await admin.post(`/api/reservations/${R3}/pickup`, { contractNumber: 'AUDIT-P22-C3', pickupMileage: 10000, fuelLevelPickup: 'full' });
    log(C, '0 customer drives vC (rental picked up)', { create: r.status, pickup: pk.status, reservation: await resRow(R3), vehicle: await vehRow(vC) });
    // 1. vehicle problem → 2. maintenance → 3. unavailable: mark-needs-service (the "Markeren voor service" button)
    const ms = weekday(addDays(today, 1)), me = weekday(addDays(ms, 2));
    r = await admin.post(`/api/reservations/${R3}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT-P22 chain3 brakes', serviceStartDate: ms, serviceEndDate: me });
    const blocks = await q("select id, start_date, end_date, status, maintenance_status, type from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null order by id desc limit 2", [vC]);
    const availNow = (await admin.get('/api/vehicles/available')).json?.some(v => v.id === vC);
    const availRange = (await admin.get(`/api/vehicles/available?startDate=${ms}&endDate=${me}`)).json?.some(v => v.id === vC);
    const bookInBlock = await admin.post('/api/reservations', { vehicleId: vC, customerId: cB, startDate: addDays(me, 40), endDate: addDays(me, 42), totalPrice: 90, notes: 'AUDIT-P22 chain3 book during needs_fixing' });
    log(C, '1-3 problem/maintenance/unavailable POST mark-needs-service', { ...brief(r), vehicle: await vehRow(vC), blocks, availableListShowsVC: availNow, availableRangeShowsVC: availRange, bookingWhileNeedsFixing: brief(bookInBlock), notifications: await notifSince(T2), portalNotifs: await portalNotifSince(T2) });
    if (bookInBlock.json?.id) { ids.R3x = bookInBlock.json.id; saveIds(); }
    // 4. replacement/spare: assign-spare on the rental
    r = await admin.post(`/api/reservations/${R3}/assign-spare`, { spareVehicleId: vD, startDate: ms, endDate: me });
    const rep = r.json?.id ?? r.json?.replacementReservation?.id ?? r.json?.replacement?.id;
    const repRows = await q("select id, vehicle_id, status, spare_vehicle_status, start_date, end_date, type from reservations where replacement_for_reservation_id=$1 and deleted_at is null", [R3]);
    log(C, '4 replacement/spare POST assign-spare', { ...brief(r), replacementRows: repRows, spareVehicle: await vehRow(vD), original: await resRow(R3), activeReplacement: brief(await admin.get(`/api/reservations/${R3}/active-replacement`)) });
    const REP = repRows[0]?.id; ids.REP = REP; saveIds();
    // 5. reservation changes: spare status assigned → ready → picked_up (widget buttons)
    const s1 = await admin.patch(`/api/reservations/${REP}/spare-status`, { spareVehicleStatus: 'ready' });
    const s2 = await admin.patch(`/api/reservations/${REP}/spare-status`, { spareVehicleStatus: 'picked_up' });
    log(C, '5 reservation changes: spare-status ready → picked_up', { ready: brief(s1), pickedUp: brief(s2), replacement: await resRow(REP), spareVehicle: await vehRow(vD), original: await resRow(R3) });
    // 6. repair: block goes in → out, vehicle maintenance-status ok (scan panel "Onderhoud beëindigen")
    const blk = blocks[0]?.id;
    const b1 = blk ? await admin.patch(`/api/reservations/${blk}`, { maintenanceStatus: 'in' }) : null;
    const b2 = blk ? await admin.patch(`/api/reservations/${blk}`, { maintenanceStatus: 'out' }) : null;
    const vAfterBlock = await vehRow(vC);
    const m1 = await admin.patch(`/api/vehicles/${vC}/maintenance-status`, { status: 'ok' });
    log(C, '6 repair: block in → out, then vehicle maintenance-status ok', { blockIn: b1 && brief(b1), blockOut: b2 && brief(b2), vehicleAfterBlockOut: vAfterBlock, vehicleMaintStatusOk: brief(m1), vehicleAfter: await vehRow(vC), block: blk ? await resRow(blk) : null });
    // 7. available again: return-from-service on the replacement
    r = await admin.post(`/api/reservations/${REP}/return-from-service`, { returnDate: today, mileage: 10300 });
    log(C, '7 available again POST return-from-service', { ...brief(r), replacement: await resRow(REP), original: await resRow(R3), vC: await vehRow(vC), vD: await vehRow(vD), availableListShowsVC: (await admin.get('/api/vehicles/available')).json?.some(v => v.id === vC), availableListShowsVD: (await admin.get('/api/vehicles/available')).json?.some(v => v.id === vD), notifications: await notifSince(T2), audit: (await auditSince(T2)).map(a => a.action) });
  }

  // =====================================================================
  // CHAIN 4 — DOCUMENTS (create → generate → preview → correct → regenerate → download → send)
  // =====================================================================
  {
    const C = 'chain4';
    const s = weekday(addDays(today, 7)), e = addDays(s, 4);
    let r = await admin.post('/api/reservations', { vehicleId: vG, customerId: cA, startDate: s, endDate: e, totalPrice: 225, notes: 'AUDIT-P22 chain4' });
    const R4 = r.json?.id; ids.R4 = R4; saveIds();
    log(C, '1 create record POST /api/reservations', { ...brief(r), reservation: await resRow(R4) });
    // 2. generate
    r = await admin.post(`/api/contracts/generate-versioned/${R4}`, { vehicleId: vG, customerId: cA, startDate: s, endDate: e, notes: 'AUDIT-P22 chain4' });
    let docs = await docsFor(R4);
    log(C, '2 generate POST contracts/generate-versioned', { status: r.status, contentType: r.headers.get('content-type'), bytes: r.text.length, isPdf: r.text.startsWith('%PDF'), docs });
    // 3. preview: (a) documents/view of the stored row, (b) contracts/preview token (draft)
    const d1 = docs[docs.length - 1];
    const v = await admin.get(`/api/documents/view/${d1.id}`);
    const pv = await admin.post('/api/contracts/preview', { vehicleId: vG, customerId: cA, startDate: s, endDate: e, notes: 'AUDIT-P22 draft' });
    let pvGet = null;
    if (pv.json?.token || pv.json?.previewToken) { pvGet = await admin.get(`/api/contracts/preview/${pv.json.token || pv.json.previewToken}`); }
    log(C, '3 preview GET documents/view/:id + POST contracts/preview', { view: { status: v.status, ct: v.headers.get('content-type'), bytes: v.text.length }, preview: brief(pv), previewGet: pvGet && { status: pvGet.status, ct: pvGet.headers.get('content-type'), bytes: pvGet.text.length } });
    // 4. correct the record: price + end date (JSON PATCH — the UI form path is BUG-202)
    const e2 = addDays(e, 1);
    r = await admin.patch(`/api/reservations/${R4}`, { totalPrice: 270, endDate: e2 });
    const data = await admin.get(`/api/contracts/data/${R4}`);
    docs = await docsFor(R4);
    log(C, '4 correct PATCH /api/reservations/:id {totalPrice,endDate}', { ...brief(r), reservation: await resRow(R4), contractDataReflects: { totalPrice: data.json?.totalPrice ?? data.json?.reservation?.totalPrice, endDate: data.json?.endDate ?? data.json?.reservation?.endDate, keys: data.json ? Object.keys(data.json).slice(0, 25) : null }, docsAfterCorrection: docs.map(d => d.document_type), autoRegenerated: docs.length > 1 });
    // 5. regenerate
    r = await admin.post(`/api/contracts/generate-versioned/${R4}`, { vehicleId: vG, customerId: cA, startDate: s, endDate: e2, notes: 'AUDIT-P22 chain4 v2' });
    docs = await docsFor(R4);
    log(C, '5 regenerate POST contracts/generate-versioned', { status: r.status, docs });
    // 6. print/download
    const d2 = docs[docs.length - 1];
    const dl = await admin.get(`/api/documents/download/${d2.id}`);
    log(C, '6 print/download GET /api/documents/download/:id', { status: dl.status, ct: dl.headers.get('content-type'), cd: dl.headers.get('content-disposition'), bytes: dl.text.length, isPdf: dl.text.startsWith('%PDF') });
    // 7. send
    const t7 = Date.now();
    r = await admin.post(`/api/documents/${d2.id}/email`, { recipients: 'ca@audit-p22.example', subject: 'AUDIT-P22 contract v2', message: 'AUDIT-P22' });
    log(C, '7 send POST /api/documents/:id/email', { ...brief(r), ms: Date.now() - t7, emailLogsTotal: (await q('select count(*)::int n from email_logs'))[0].n, docsMarkedSent: (await q('select id, document_type from documents where reservation_id=$1', [R4])).length });
  }

  // health + summary
  const h = await fetch('http://localhost:5001/health').then(x => x.json()).catch(e => ({ err: e.message }));
  log('end', 'health', { status: h.status, uptime: h.uptime });
  saveIds();
  await pool.end();
})().catch(async (e) => { console.error('FATAL', e); fs.writeFileSync(OUT, JSON.stringify(steps, null, 2)); try { await pool.end(); } catch {} process.exit(1); });

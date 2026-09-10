// Phase 12 Part B: workflows that fail halfway. Each test runs via the API,
// injects a failure at the second step (SQL only on our own AUDIT- rows), and
// reads back with SQL what was left behind. Usage: node p12-txn.cjs [testName ...]
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p12-lib.cjs');
const { q } = L;

const OUT = path.join(__dirname, 'p12-txn.out.json');
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
const log = (...a) => console.log(...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)));

const T = {};

// (a1) vehicle delete: force a FK failure at the "delete reservations" step and prove rollback of the snapshot insert.
T.a1_vehicle_delete_rollback = async (admin, ids) => {
  const vA = await L.ensureVehicle(admin, ids, 'vA1', 'AU-12A-X', 'P12 delete-rollback');
  const vB = await L.ensureVehicle(admin, ids, 'vB1', 'AU-12B-X', 'P12 other vehicle');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 400);
  const rA = ids.rA1 || await L.createReservation(admin, { vehicleId: vA, customerId: cA, startDate: s, endDate: L.addDays(s, 3) });
  ids.rA1 = rA; L.saveIds(ids);
  // interactive_damage_checks.reservation_id -> reservations ON DELETE NO ACTION, on a *different* vehicle,
  // so deleteVehicle's own cleanup (by vehicleId) does not remove it and the reservation delete must fail.
  await q(`insert into interactive_damage_checks (vehicle_id, reservation_id, check_type, check_date, created_by) values ($1,$2,'pickup',$3,'AUDIT-P12')`, [vB, rA, L.today()]);
  const before = { deletedRecords: (await q('select count(*)::int n from deleted_records where entity_type=$1 and entity_id=$2', ['vehicle', vA]))[0].n, seq: (await q('select last_value from deleted_records_id_seq'))[0].last_value };
  const r = await admin.del(`/api/vehicles/${vA}`, { confirmLicensePlate: 'AU-12A-X' });
  const after = {
    http: L.brief(r),
    vehicle: await L.vehRow(vA),
    reservation: await L.resRow(rA),
    deletedRecords: (await q('select count(*)::int n from deleted_records where entity_type=$1 and entity_id=$2', ['vehicle', vA]))[0].n,
    seq: (await q('select last_value from deleted_records_id_seq'))[0].last_value,
    auditRows: await q(`select action, status, details->>'reason' reason from audit_logs where resource_type='vehicle' and resource_id=$1 and created_at > now() - interval '2 minutes' order by id`, [String(vA)]),
  };
  await q('delete from interactive_damage_checks where created_by=$1 and reservation_id=$2', ['AUDIT-P12', rA]);
  results.a1 = { before, after };
  log('a1', results.a1);
};

// (a2) vehicle delete + restore: which links does the cascade destroy that the snapshot never captures?
T.a2_vehicle_delete_restore_links = async (admin, ids) => {
  const vA = await L.ensureVehicle(admin, ids, 'vA2', 'AU-12C-X', 'P12 delete-restore');
  const vC = await L.ensureVehicle(admin, ids, 'vC2', 'AU-12D-X', 'P12 transport vehicle');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 410);
  const rA = await L.createReservation(admin, { vehicleId: vA, customerId: cA, startDate: s, endDate: L.addDays(s, 3) });
  // links that point at the reservation / vehicle from other tables
  const tr = await admin.post('/api/transports', { vehicleId: vC, transportType: 'delivery', scheduledDate: s, reservationId: rA, reason: 'AUDIT-P12 link test' });
  if (tr.status !== 201) throw new Error('transport create ' + tr.status + tr.text.slice(0, 200));
  const tId = tr.json.id;
  const [doc] = await q(`insert into documents (vehicle_id, reservation_id, document_type, file_name, file_path, file_size, content_type, created_by) values (null,$1,'AUDIT-P12 reservation-only','AUDIT-P12.pdf','AUDIT-P12/none.pdf',1,'application/pdf','AUDIT-P12') returning id`, [rA]);
  const [apk] = await q(`insert into apk_date_changes (vehicle_id, previous_apk_date, new_apk_date, status) values ($1,'2026-01-01','2027-01-01','pending') returning id`, [vA]);
  const [scan] = await q(`insert into scan_events (code, match_type, vehicle_id, license_plate, scanned_by) values ('AUDIT-P12-SCAN','vehicle',$1,'AU-12C-X','AUDIT-P12') returning id`, [vA]);
  const [fine] = await q(`insert into fines (license_plate, vehicle_id, offence_at, description, amount, total_amount, status, customer_id, reservation_id, created_by) values ('AU-12C-X',$1,now(),'AUDIT-P12 fine',10,10,'linked',$2,$3,'AUDIT-P12') returning id`, [vA, cA, rA]);
  const [rda] = await q(`insert into reservation_driver_assignments (reservation_id, driver_id, assigned_from, note) values ($1,null,$2,'AUDIT-P12') returning id`, [rA, s]);
  const snap = async () => ({
    vehicle: !!(await L.vehRow(vA)), reservation: await L.resRow(rA),
    transport: (await q('select id, reservation_id, status from vehicle_transports where id=$1', [tId]))[0] || null,
    document: (await q('select id, vehicle_id, reservation_id from documents where id=$1', [doc.id]))[0] || null,
    apk: (await q('select id from apk_date_changes where id=$1', [apk.id]))[0] || null,
    scan: (await q('select id, vehicle_id from scan_events where id=$1', [scan.id]))[0] || null,
    fine: (await q('select id, vehicle_id, reservation_id, customer_id from fines where id=$1', [fine.id]))[0] || null,
    driverAssignment: (await q('select id from reservation_driver_assignments where id=$1', [rda.id]))[0] || null,
  });
  const before = await snap();
  const del = await admin.del(`/api/vehicles/${vA}`, { confirmLicensePlate: 'AU-12C-X' });
  const rec = (await q('select id, related_counts, jsonb_object_keys(payload) k from deleted_records where entity_type=$1 and entity_id=$2 and restored_at is null order by id desc', ['vehicle', vA]));
  const afterDelete = { http: L.brief(del), snapshotKeys: rec.map(r => r.k), relatedCounts: rec[0]?.related_counts, ...(await snap()) };
  const recId = rec[0]?.id;
  const res = await admin.post(`/api/deleted-records/${recId}/restore`, {});
  const afterRestore = { http: L.brief(res), ...(await snap()) };
  results.a2 = { ids: { vA, vC, rA, tId, doc: doc.id, apk: apk.id, scan: scan.id, fine: fine.id, rda: rda.id, recId }, before, afterDelete, afterRestore };
  log('a2', results.a2);
};

// (b1) pickup: reservation update succeeds, vehicle update throws (not_for_rental) -> what is left?
T.b1_pickup_partial = async (admin, ids) => {
  const v = await L.ensureVehicle(admin, ids, 'vB', 'AU-12E-X', 'P12 pickup partial');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.today();
  const r = await L.createReservation(admin, { vehicleId: v, customerId: cA, startDate: s, endDate: L.addDays(s, 5) });
  await q(`update vehicles set availability_status='not_for_rental' where id=$1 and brand='AUDIT-P12'`, [v]);
  const before = { reservation: await L.resRow(r), vehicle: await L.vehRow(v) };
  const p = await admin.post(`/api/reservations/${r}/pickup`, { contractNumber: `AUDIT-P12-${r}`, pickupMileage: 5000, fuelLevelPickup: 'full', pickupDate: s });
  const after = { http: L.brief(p), reservation: await L.resRow(r), vehicle: await L.vehRow(v), documents: await q('select id, document_type from documents where reservation_id=$1', [r]) };
  const retry = await admin.post(`/api/reservations/${r}/pickup`, { contractNumber: `AUDIT-P12-${r}`, pickupMileage: 5000, fuelLevelPickup: 'full', pickupDate: s });
  const statusPatch = await admin.patch(`/api/reservations/${r}/status`, { status: 'booked' });
  results.b1 = { ids: { v, r }, before, after, retry: L.brief(retry), revertViaStatus: L.brief(statusPatch), reservationFinal: await L.resRow(r) };
  log('b1', results.b1);
};

// (b2) pickup with a PDF template whose background file is missing (template 8 from the docs-mail phase): contract step fails after the status change.
T.b2_pickup_pdf_failure = async (admin, ids) => {
  const v = await L.ensureVehicle(admin, ids, 'vB2', 'AU-12F-X', 'P12 pickup pdf');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.today();
  const r = await L.createReservation(admin, { vehicleId: v, customerId: cA, startDate: s, endDate: L.addDays(s, 5) });
  const [tpl] = await q(`select id, background_path from pdf_templates where id=8`);
  const p = await admin.post(`/api/reservations/${r}/pickup`, { contractNumber: `AUDIT-P12-${r}`, pickupMileage: 6000, fuelLevelPickup: 'full', pickupDate: s, templateId: 8 });
  results.b2 = { ids: { v, r }, template: tpl, http: { status: p.status, contractDocument: p.json?.contractDocument ?? null, reservationStatus: p.json?.status }, reservation: await L.resRow(r), vehicle: await L.vehRow(v), documents: await q('select id, document_type, file_path, file_size from documents where reservation_id=$1', [r]) };
  log('b2', results.b2);
};

// (c) maintenance-with-spare: pre-validation vs partial writes.
T.c_maintenance_with_spare = async (admin, ids) => {
  const vO = await L.ensureVehicle(admin, ids, 'vC1', 'AU-12G-X', 'P12 maint original');
  const vS = await L.ensureVehicle(admin, ids, 'vCS', 'AU-12H-X', 'P12 maint spare');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const cB = await L.ensureCustomer(admin, ids, 'cB', 'AUDIT-P12 Customer B', 'audit-p12-b@example.com');
  const s = L.addDays(L.today(), 420);
  const r1 = await L.createReservation(admin, { vehicleId: vO, customerId: cA, startDate: s, endDate: L.addDays(s, 4) });
  const r2 = await L.createReservation(admin, { vehicleId: vO, customerId: cB, startDate: L.addDays(s, 5), endDate: L.addDays(s, 9) });
  const maint = { vehicleId: vO, startDate: s, endDate: L.addDays(s, 9), type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: 'AUDIT-P12 maintenance-with-spare' };
  const countBlocks = () => q(`select count(*)::int n from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null`, [vO]).then(r => r[0].n);
  const spareRows = () => q(`select id, vehicle_id, customer_id, start_date, end_date, status, replacement_for_reservation_id, deleted_at from reservations where type='replacement' and replacement_for_reservation_id in ($1,$2) order by id`, [r1, r2]);
  // c1: second assignment references a reservation that does not exist -> pre-validation throws before any write
  const c1 = await admin.post('/api/reservations/maintenance-with-spare', { maintenanceData: maint, conflictingReservations: [r1, r2], spareVehicleAssignments: [
    { reservationId: r1, spareVehicleId: vS, startDate: s, endDate: L.addDays(s, 4) },
    { reservationId: 99999999, spareVehicleId: vS, startDate: L.addDays(s, 5), endDate: L.addDays(s, 9) },
  ] });
  const afterC1 = { http: L.brief(c1), blocks: await countBlocks(), spares: await spareRows() };
  // c2: both assignments claim the same spare vehicle for overlapping dates -> each validated against the DB only
  const c2 = await admin.post('/api/reservations/maintenance-with-spare', { maintenanceData: maint, conflictingReservations: [r1, r2], spareVehicleAssignments: [
    { reservationId: r1, spareVehicleId: vS, startDate: s, endDate: L.addDays(s, 9) },
    { reservationId: r2, spareVehicleId: vS, startDate: s, endDate: L.addDays(s, 9) },
  ] });
  const afterC2 = { http: { status: c2.status, message: c2.json?.message, created: (c2.json?.updatedReservations || []).map(x => x.id), block: c2.json?.maintenanceReservation?.id }, blocks: await countBlocks(), spares: await spareRows(), overlapCheck: await q(`select a.id, b.id from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id where a.vehicle_id=$1 and a.deleted_at is null and b.deleted_at is null and a.type<>'maintenance_block' and b.type<>'maintenance_block'`, [vS]) };
  // c3: assignment with a spare vehicle id that does not exist
  const vO2 = await L.ensureVehicle(admin, ids, 'vC3', 'AU-12I-X', 'P12 maint original 2');
  const s3 = L.addDays(L.today(), 440);
  const r3 = await L.createReservation(admin, { vehicleId: vO2, customerId: cA, startDate: s3, endDate: L.addDays(s3, 4) });
  const c3 = await admin.post('/api/reservations/maintenance-with-spare', { maintenanceData: { ...maint, vehicleId: vO2, startDate: s3, endDate: L.addDays(s3, 4) }, conflictingReservations: [r3], spareVehicleAssignments: [
    { reservationId: r3, spareVehicleId: 98765432, startDate: s3, endDate: L.addDays(s3, 4) },
  ] });
  const afterC3 = { http: { status: c3.status, message: c3.json?.message, created: (c3.json?.updatedReservations || []).map(x => ({ id: x.id, vehicleId: x.vehicleId })) }, spares: await q(`select id, vehicle_id, status from reservations where replacement_for_reservation_id=$1`, [r3]) };
  results.c = { ids: { vO, vS, r1, r2, vO2, r3 }, c1: afterC1, c2: afterC2, c3: afterC3 };
  log('c', results.c);
};

// (d) transport create with a spare that conflicts: insert (no tx) then applyTransportUpdate (tx) throws.
T.d_transport_create_conflict = async (admin, ids) => {
  const vD = await L.ensureVehicle(admin, ids, 'vD', 'AU-12J-X', 'P12 transport original');
  const vS = await L.ensureVehicle(admin, ids, 'vDS', 'AU-12K-X', 'P12 transport spare');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 450);
  const busy = await L.createReservation(admin, { vehicleId: vS, customerId: cA, startDate: s, endDate: L.addDays(s, 2) });
  const before = { transports: (await q('select count(*)::int n from vehicle_transports where vehicle_id=$1', [vD]))[0].n, vehicle: await L.vehRow(vD) };
  const r = await admin.post('/api/transports', { vehicleId: vD, transportType: 'swap', scheduledDate: s, spareRequired: true, relatedVehicleId: vS, isBreakdownOrMaintenance: true, reason: 'AUDIT-P12 conflict' });
  const after = { http: L.brief(r), transports: await q('select id, status, spare_required, related_vehicle_id, spare_reservation_id, is_breakdown_or_maintenance, reason from vehicle_transports where vehicle_id=$1 order by id', [vD]), vehicle: await L.vehRow(vD), spareReservations: await q(`select id, vehicle_id, placeholder_spare, replacement_for_transport_id from reservations where replacement_for_transport_id in (select id from vehicle_transports where vehicle_id=$1)`, [vD]) };
  const listed = await admin.get('/api/transports');
  const visible = Array.isArray(listed.json) ? listed.json.filter(t => t.vehicleId === vD).map(t => ({ id: t.id, status: t.status, spareRequired: t.spareRequired })) : listed.status;
  results.d = { ids: { vD, vS, busy }, before, after, visibleInList: visible };
  log('d', results.d);
};

// (d2) same as (d) but the spare's rental strictly contains the transport date, so checkReservationConflicts must reject it.
T.d2_transport_create_real_conflict = async (admin, ids) => {
  const vD = await L.ensureVehicle(admin, ids, 'vD2', 'AU-12T-X', 'P12 transport original 2');
  const vS = await L.ensureVehicle(admin, ids, 'vDS2', 'AU-12U-X', 'P12 transport spare 2');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 490);
  const busy = await L.createReservation(admin, { vehicleId: vS, customerId: cA, startDate: L.addDays(s, -1), endDate: L.addDays(s, 2) });
  const before = { transports: (await q('select count(*)::int n from vehicle_transports where vehicle_id=$1', [vD]))[0].n, vehicle: await L.vehRow(vD), seq: (await q('select last_value from vehicle_transports_id_seq'))[0].last_value };
  const r = await admin.post('/api/transports', { vehicleId: vD, transportType: 'swap', scheduledDate: s, spareRequired: true, relatedVehicleId: vS, isBreakdownOrMaintenance: true, reason: 'AUDIT-P12 real conflict' });
  const after = { http: L.brief(r), transports: await q('select id, status, spare_required, related_vehicle_id, spare_reservation_id, is_breakdown_or_maintenance, reason, scheduled_date from vehicle_transports where vehicle_id=$1 order by id', [vD]), vehicle: await L.vehRow(vD), seq: (await q('select last_value from vehicle_transports_id_seq'))[0].last_value, spareReservations: await q(`select id from reservations where replacement_for_transport_id in (select id from vehicle_transports where vehicle_id=$1)`, [vD]) };
  const listed = await admin.get('/api/transports');
  const visible = Array.isArray(listed.json) ? listed.json.filter(t => t.vehicleId === vD).map(t => ({ id: t.id, status: t.status, spareRequired: t.spareRequired, relatedVehicleId: t.relatedVehicleId })) : listed.status;
  results.d2 = { ids: { vD, vS, busy }, before, after, visibleInList: visible };
  log('d2', results.d2);
};

// (e) placeholder assign-vehicle: three separate writes, no transaction -> race two assignments.
T.e_placeholder_assign_race = async (admin, ids) => {
  const vE = await L.ensureVehicle(admin, ids, 'vE', 'AU-12L-X', 'P12 placeholder original');
  const vS1 = await L.ensureVehicle(admin, ids, 'vES1', 'AU-12M-X', 'P12 placeholder spare 1');
  const vS2 = await L.ensureVehicle(admin, ids, 'vES2', 'AU-12N-X', 'P12 placeholder spare 2');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 460);
  const rE = await L.createReservation(admin, { vehicleId: vE, customerId: cA, startDate: s, endDate: L.addDays(s, 5) });
  const ph = await admin.post('/api/placeholder-reservations', { originalReservationId: rE, customerId: cA, startDate: s, endDate: L.addDays(s, 5) });
  if (ph.status !== 201 && ph.status !== 200) throw new Error('placeholder ' + ph.status + ph.text.slice(0, 200));
  const pId = ph.json.id;
  const notifBefore = await q(`select id, is_read from custom_notifications where type='spare_assignment' and description like $1`, [`%[placeholder:${pId}]%`]);
  const [x, y] = await Promise.all([
    admin.post(`/api/placeholder-reservations/${pId}/assign-vehicle`, { vehicleId: vS1, endDate: L.addDays(s, 5) }),
    admin.post(`/api/placeholder-reservations/${pId}/assign-vehicle`, { vehicleId: vS2, endDate: L.addDays(s, 5) }),
  ]);
  results.e = { ids: { vE, vS1, vS2, rE, pId }, notifBefore, race: [L.brief(x), L.brief(y)], placeholder: await L.resRow(pId), notifAfter: await q(`select id from custom_notifications where type='spare_assignment' and description like $1`, [`%[placeholder:${pId}]%`]), replacementsForRental: await q(`select id, vehicle_id, placeholder_spare, status from reservations where replacement_for_reservation_id=$1 and deleted_at is null`, [rE]) };
  log('e', results.e);
};

// (f) portal maintenance approval: block + notes update + rental decision + placeholder + notification + mail (SMTP 127.0.0.1:1 unreachable).
T.f_portal_approval = async (admin, ids) => {
  const vF = await L.ensureVehicle(admin, ids, 'vF', 'AU-12O-X', 'P12 portal rental');
  const s = L.today();
  const rental = ids.rentalF || await L.createReservation(admin, { vehicleId: vF, customerId: 179, startDate: s, endDate: L.addDays(s, 40), notes: 'AUDIT-P12 portal rental' });
  ids.rentalF = rental; L.saveIds(ids);
  const row = await L.resRow(rental);
  if (row.status === 'booked') {
    const p = await admin.post(`/api/reservations/${rental}/pickup`, { contractNumber: `AUDIT-P12-${rental}`, pickupMileage: 1200, fuelLevelPickup: 'full', pickupDate: s });
    log('pickup rental F', L.brief(p));
  }
  const start = L.nextWeekday(L.addDays(s, 8));
  const emailCfg = await q(`select value->>'smtpHost' host, value->>'smtpPort' port from app_settings where key='email_config'`);
  let reqId = ids.reqF, approvals = results.f?.approvals, ms = results.f?.approveMs;
  if (!reqId) {
    const [existing] = await q(`select id from portal_requests where type='maintenance' and reservation_id=$1 order by id desc limit 1`, [rental]);
    if (existing) { reqId = existing.id; approvals = approvals || 'approved in an earlier run (readback error); see server log'; }
  }
  if (!reqId) {
    const portal = await L.getPortal();
    const req = await portal.post('/api/portal/requests', { type: 'maintenance', reservationId: rental, message: 'AUDIT-P12 approval test', payload: { issue: 'AUDIT-P12 brakes squeal', mileage: 1500, urgent: false, needsReplacement: true } });
    if (req.status !== 201 && req.status !== 200) throw new Error('portal request ' + req.status + req.text.slice(0, 300));
    reqId = req.json.id;
    const t0 = Date.now();
    const [ap1, ap2] = await Promise.all([
      admin.post(`/api/portal-requests/${reqId}/approve`, { startDate: start, durationDays: 2, category: 'repair', note: 'AUDIT-P12 approve A' }),
      admin.post(`/api/portal-requests/${reqId}/approve`, { startDate: start, durationDays: 2, category: 'repair', note: 'AUDIT-P12 approve B' }),
    ]);
    ms = Date.now() - t0;
    approvals = [L.brief(ap1), L.brief(ap2)];
  }
  ids.reqF = reqId; L.saveIds(ids);
  results.f = {
    ids: { vF, rental, reqId }, emailCfg: emailCfg[0], start, approveMs: ms,
    approvals,
    request: (await q('select id, status, reservation_id, handled_by, replied_at from portal_requests where id=$1', [reqId]))[0],
    blocks: await q(`select id, status, maintenance_status, start_date, end_date, portal_request_id, affected_rental_id, left(notes,80) notes, created_by from reservations where portal_request_id=$1 order by id`, [reqId]),
    rental: await L.resRow(rental),
    rentalDecision: (await q('select spare_assignment_decision from reservations where id=$1', [rental]))[0],
    placeholders: await q(`select id, vehicle_id, placeholder_spare, start_date, end_date, status from reservations where replacement_for_reservation_id=$1 and deleted_at is null order by id`, [rental]),
    portalNotifications: await q(`select id, type, title, dedupe_tag from portal_notifications where customer_id=179 and created_at > now() - interval '2 minutes' order by id`),
    staffNotifications: await q(`select id, type, left(description,90) d from custom_notifications where created_at > now() - interval '2 minutes' order by id`),
    emailLogs: await q(`select id, template, subject, emails_sent, emails_failed, failure_reason, sent_at from email_logs order by id desc limit 5`),
    messages: await q(`select * from portal_request_messages where request_id=$1 order by id`, [reqId]).then(r => r.map(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 80) : v])))).catch(e => e.message),
    vehicle: await L.vehRow(vF),
  };
  log('f', results.f);
};

// (f2) single approval, timed, with SMTP unreachable; readback keyed on the block ids.
T.f2_portal_approval_single = async (admin, ids) => {
  const rental = ids.rentalF;
  const portal = await L.getPortal();
  const req = await portal.post('/api/portal/requests', { type: 'maintenance', reservationId: rental, message: 'AUDIT-P12 approval timing', payload: { issue: 'AUDIT-P12 timing test', urgent: false, needsReplacement: false } });
  if (req.status !== 201 && req.status !== 200) throw new Error('portal request ' + req.status + req.text.slice(0, 300));
  const reqId = req.json.id;
  const start = L.nextWeekday(L.addDays(L.today(), 15));
  const t0 = Date.now();
  const ap = await admin.post(`/api/portal-requests/${reqId}/approve`, { startDate: start, durationDays: 1, category: 'repair', note: 'AUDIT-P12 single approve' });
  const ms = Date.now() - t0;
  const blocks = await q(`select id, status, start_date, end_date from reservations where portal_request_id=$1 order by id`, [reqId]);
  const blockIds = blocks.map(b => b.id);
  results.f2 = { ids: { rental, reqId }, approveMs: ms, approve: L.brief(ap), request: (await q('select id, status from portal_requests where id=$1', [reqId]))[0], blocks,
    portalNotifications: await q(`select id, type, title, dedupe_tag, portal_user_id from portal_notifications where customer_id=179 and dedupe_tag like any($1) order by id`, [blockIds.map(b => `maint:${b}:%`)]),
    portalNotificationsForRun1: await q(`select id, type, dedupe_tag from portal_notifications where customer_id=179 and (dedupe_tag like 'maint:3424:%' or dedupe_tag like 'maint:3425:%') order by id`),
    emailLogsTotal: (await q('select count(*)::int n from email_logs'))[0].n,
    emailTemplates: await q(`select id, name from email_templates order by id`) };
  log('f2', results.f2);
};

// (h) bulk CSV import with an invalid row in the middle.
T.h_bulk_import = async (admin, ids) => {
  const r = await admin.post('/api/vehicles/bulk-import-csv', { vehicles: [
    { licensePlate: 'AU-12P-X', brand: 'AUDIT-P12', model: 'bulk 1' },
    { licensePlate: 12345, brand: 'AUDIT-P12', model: 'bulk 2 (invalid)' },
    { licensePlate: 'AU-12Q-X', brand: 'AUDIT-P12', model: 'bulk 3' },
    { licensePlate: 'au12px', brand: 'AUDIT-P12', model: 'bulk 4 (dup of 1, normalised)' },
    { licensePlate: 'AU-12Q-X', brand: 'AUDIT-P12', model: 'bulk 5 (exact dup of 3)' },
  ] });
  results.h = { http: { status: r.status, imported: (r.json?.imported || []).map(x => x.licensePlate), failed: r.json?.failed }, rows: await q(`select id, license_plate, model, barcode from vehicles where license_plate in ('AU-12P-X','AU-12Q-X','AU12PX','au12px','12345') order by id`) };
  log('h', results.h);
};

// (i) customer delete with driver, portal account, reservation, waitlist row.
T.i_customer_delete = async (admin, ids) => {
  const vI = await L.ensureVehicle(admin, ids, 'vI', 'AU-12R-X', 'P12 customer delete');
  const cr = await admin.post('/api/customers', { name: 'AUDIT-P12 Customer Del ' + Date.now(), email: `audit-p12-del-${Date.now()}@example.com`, phone: '0600000000' });
  if (cr.status !== 201 && cr.status !== 200) throw new Error('customer ' + cr.status + cr.text.slice(0, 200));
  const c = cr.json.id;
  const dr = await admin.post(`/api/customers/${c}/drivers`, { displayName: 'AUDIT-P12 Driver', email: `audit-p12-driver-${c}@example.com` });
  const d = dr.json?.id;
  const pu = await admin.post(`/api/portal-admin/customers/${c}/accounts`, { email: `audit-p12-portal-${c}@example.invalid`, role: 'admin', displayName: 'AUDIT-P12 Portal' });
  const p = pu.json?.account?.id;
  const s = L.addDays(L.today(), 470);
  const r = await L.createReservation(admin, { vehicleId: vI, customerId: c, startDate: s, endDate: L.addDays(s, 2), driverId: d });
  const [wl] = await q(`insert into vehicle_waitlist (customer_id, vehicle_id, preferred_start_date, notes, created_by) values ($1,$2,$3,'AUDIT-P12','AUDIT-P12') returning id`, [c, vI, s]);
  const snap = async () => ({
    customer: (await q('select id from customers where id=$1', [c]))[0] || null,
    driver: (await q('select id from drivers where id=$1', [d]))[0] || null,
    portalUser: (await q('select id from portal_users where id=$1', [p]))[0] || null,
    portalSettings: (await q('select id from portal_customer_settings where customer_id=$1', [c]))[0] || null,
    reservation: await L.resRow(r),
    driverAssignments: await q('select id, driver_id from reservation_driver_assignments where reservation_id=$1', [r]),
    waitlist: (await q('select id from vehicle_waitlist where id=$1', [wl.id]))[0] || null,
    deletedRecords: (await q(`select count(*)::int n from deleted_records where entity_type='customer' and entity_id=$1`, [c]))[0].n,
  });
  const before = await snap();
  const del1 = await admin.del(`/api/customers/${c}`);
  const afterBlocked = { http: L.brief(del1), ...(await snap()) };
  await q('delete from vehicle_waitlist where id=$1 and created_by=$2', [wl.id, 'AUDIT-P12']);
  const del2 = await admin.del(`/api/customers/${c}`);
  const afterDeleted = { http: L.brief(del2), ...(await snap()), reservationViaApi: L.brief(await admin.get(`/api/reservations/${r}`)) };
  results.i = { ids: { vI, c, d, p, r, wl: wl.id }, created: { driver: dr.status, portal: pu.status }, before, afterBlocked, afterDeleted };
  log('i', results.i);
};

// (j) recycle-bin restore raced against itself and against a new vehicle taking the plate.
T.j_restore_race = async (admin, ids) => {
  const plate = 'AU-12S-X';
  const vJ = await L.ensureVehicle(admin, ids, 'vJ', plate, 'P12 restore race');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 480);
  const rJ = await L.createReservation(admin, { vehicleId: vJ, customerId: cA, startDate: s, endDate: L.addDays(s, 2) });
  const del = await admin.del(`/api/vehicles/${vJ}`, { confirmLicensePlate: plate });
  const [rec] = await q(`select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc`, [vJ]);
  const [x, y, z] = await Promise.all([
    admin.post(`/api/deleted-records/${rec.id}/restore`, {}),
    admin.post(`/api/deleted-records/${rec.id}/restore`, {}),
    admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P12', model: 'P12 plate thief', vehicleType: 'car', dailyPrice: '10' }),
  ]);
  results.j = { ids: { vJ, rJ, recId: rec.id }, delete: L.brief(del), race: { restore1: L.brief(x), restore2: L.brief(y), createSamePlate: L.brief(z) },
    vehiclesWithPlate: await q(`select id, license_plate, model, created_at from vehicles where upper(regexp_replace(license_plate,'[^A-Za-z0-9]','','g')) = $1 order by id`, [plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()]),
    record: (await q('select id, restored_at, restored_by from deleted_records where id=$1', [rec.id]))[0],
    reservation: await L.resRow(rJ),
    seq: (await q(`select last_value from vehicles_id_seq`))[0].last_value, maxId: (await q('select max(id) from vehicles'))[0].max };
  delete ids.vJ; L.saveIds(ids);
  log('j', results.j);
};

// (j2) two parallel restores of the same record, nothing else racing (BUG-043 DB outcome).
T.j2_parallel_restore = async (admin, ids) => {
  const plate = 'AU-12V-X';
  const vJ = await L.ensureVehicle(admin, ids, 'vJ2', plate, 'P12 restore race 2');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const s = L.addDays(L.today(), 500);
  const rJ = await L.createReservation(admin, { vehicleId: vJ, customerId: cA, startDate: s, endDate: L.addDays(s, 2) });
  const [doc] = await q(`insert into documents (vehicle_id, reservation_id, document_type, file_name, file_path, file_size, content_type, created_by) values ($1,$2,'AUDIT-P12 doc','AUDIT-P12.pdf','AUDIT-P12/none2.pdf',1,'application/pdf','AUDIT-P12') returning id`, [vJ, rJ]);
  const del = await admin.del(`/api/vehicles/${vJ}`, { confirmLicensePlate: plate });
  const [rec] = await q(`select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc`, [vJ]);
  const [x, y, w] = await Promise.all([
    admin.post(`/api/deleted-records/${rec.id}/restore`, {}),
    admin.post(`/api/deleted-records/${rec.id}/restore`, {}),
    admin.post(`/api/deleted-records/${rec.id}/restore`, {}),
  ]);
  results.j2 = { ids: { vJ, rJ, doc: doc.id, recId: rec.id }, delete: L.brief(del), race: [L.brief(x), L.brief(y), L.brief(w)],
    vehicles: await q('select id, license_plate from vehicles where id=$1', [vJ]), record: (await q('select id, restored_at, restored_by from deleted_records where id=$1', [rec.id]))[0],
    reservations: await q('select id, vehicle_id, deleted_at from reservations where id=$1', [rJ]), documents: await q('select id from documents where id=$1', [doc.id]),
    auditRows: await q(`select action, status, resource_id from audit_logs where resource_type='vehicle' and resource_id=$1 and created_at > now() - interval '2 minutes' order by id`, [String(vJ)]) };
  log('j2', results.j2);
};

// (k) generalisation of (d): a one-day rental whose single day touches an existing rental's boundary passes checkReservationConflicts.
T.k_one_day_conflict_hole = async (admin, ids) => {
  const v = await L.ensureVehicle(admin, ids, 'vK', 'AU-12W-X', 'P12 one-day hole');
  const cA = await L.ensureCustomer(admin, ids, 'cA', 'AUDIT-P12 Customer A', 'audit-p12-a@example.com');
  const cB = await L.ensureCustomer(admin, ids, 'cB', 'AUDIT-P12 Customer B', 'audit-p12-b@example.com');
  const s = L.addDays(L.today(), 510);
  const existing = await L.createReservation(admin, { vehicleId: v, customerId: cA, startDate: s, endDate: L.addDays(s, 3) });
  const tries = {};
  tries.oneDayOnFirstDay = L.brief(await admin.post('/api/reservations', { type: 'standard', vehicleId: v, customerId: cB, startDate: s, endDate: s, notes: 'AUDIT-P12 one-day on first day' }));
  tries.oneDayOnLastDay = L.brief(await admin.post('/api/reservations', { type: 'standard', vehicleId: v, customerId: cB, startDate: L.addDays(s, 3), endDate: L.addDays(s, 3), notes: 'AUDIT-P12 one-day on last day' }));
  tries.oneDayInMiddle = L.brief(await admin.post('/api/reservations', { type: 'standard', vehicleId: v, customerId: cB, startDate: L.addDays(s, 1), endDate: L.addDays(s, 1), notes: 'AUDIT-P12 one-day in middle' }));
  tries.twoDayOnFirstDay = L.brief(await admin.post('/api/reservations', { type: 'standard', vehicleId: v, customerId: cB, startDate: L.addDays(s, -1), endDate: s, notes: 'AUDIT-P12 two-day ending on first day' }));
  const s2 = L.addDays(s, 30);
  const one = await L.createReservation(admin, { vehicleId: v, customerId: cA, startDate: s2, endDate: s2 });
  tries.identicalOneDay = L.brief(await admin.post('/api/reservations', { type: 'standard', vehicleId: v, customerId: cB, startDate: s2, endDate: s2, notes: 'AUDIT-P12 identical one-day' }));
  tries.checkConflictsApi = L.brief(await admin.get(`/api/reservations/check-conflicts?vehicleId=${v}&startDate=${s2}&endDate=${s2}`));
  results.k = { ids: { v, existing, one }, tries: Object.fromEntries(Object.entries(tries).map(([k, r]) => [k, { status: r.status, id: (r.body.match(/"id":(\d+)/) || [])[1], msg: r.body.slice(0, 90) }])), rows: await q(`select id, customer_id, start_date, end_date, status from reservations where vehicle_id=$1 and deleted_at is null order by id`, [v]) };
  log('k', results.k);
};

(async () => {
  const admin = await L.getAdmin();
  const ids = L.loadIds();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(T);
  for (const n of names) {
    const fn = T[n] || T[Object.keys(T).find(k => k.startsWith(n))];
    if (!fn) { console.error('unknown test', n); continue; }
    console.log(`\n===== ${n} =====`);
    try { await fn(admin, ids); } catch (e) { console.error('TEST ERROR', n, e.message); results[n + '_error'] = e.message; }
    L.saveIds(ids); save();
  }
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });

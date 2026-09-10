// Phase 9 - vehicle lifecycle chain, part 1: create -> edit -> concurrent edit
// -> barcode -> mileage flows (pickup/return/manual) -> maintenance vs booked /
// picked-up reservations -> documents. SQL evidence after every step.
// Leaves fixtures for p9-02 (delete/restore) in p9-ids.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { getSession, log, excerpt, step, sql, q, pool, writeOut, health } = require('./p9-lib.cjs');

const ids = { ts: Date.now() };
const today = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(today);

async function createVehicle(s, extra, tag) {
  for (let n = 901; n < 999; n++) {
    const plate = `AU-${n}-X`;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P9', model: tag, ...extra });
    if (r.status === 201) { log(`POST /api/vehicles ${plate} -> ${excerpt(r, 160)}`); return r.json; }
    if (r.status !== 409) { log(`POST /api/vehicles ${plate} -> ${excerpt(r)}`); return null; }
  }
  return null;
}

function multipart(fields, file) {
  const boundary = '----AuditP9' + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');

async function main() {
  log(`health: ${await health()}  today=${TODAY}`);
  const A = await getSession('admin', 'admin', 'admin123');
  let B;
  try { B = await getSession('mgr', 'AUDIT-manager-1788982804001', 'AuditManager123'); }
  catch (e) { log('second user login failed, falling back to second admin session: ' + e.message); B = await getSession('admin2', 'admin', 'admin123'); }

  // ---------- fixtures ----------
  await step('Fixtures: two customers + driver', async () => {
    let r = await A.post('/api/customers', { name: `AUDIT-P9-CustA-${ids.ts}`, email: `audit-p9-a-${ids.ts}@example.com` });
    log('POST /api/customers A ->', excerpt(r, 120)); ids.custA = r.json?.id;
    r = await A.post('/api/customers', { name: `AUDIT-P9-CustB-${ids.ts}`, email: `audit-p9-b-${ids.ts}@example.com` });
    log('POST /api/customers B ->', excerpt(r, 120)); ids.custB = r.json?.id;
    r = await A.post(`/api/customers/${ids.custA}/drivers`, { firstName: 'AUDIT', lastName: 'P9Driver', licenseNumber: `AUDIT-P9-${ids.ts}`, status: 'active' });
    log('POST driver ->', excerpt(r, 200)); ids.driver = r.json?.id;
  });

  // ---------- A. create ----------
  await step('A. Create vehicle with APK/warranty/service fields', async () => {
    const v = await createVehicle(A, {
      apkDate: addDays(10), warrantyEndDate: addDays(5),
      lastServiceDate: ymd(new Date(today.getFullYear() - 1, today.getMonth() - 1, today.getDate())),
      lastServiceMileage: 10000, currentMileage: 39500, serviceIntervalKm: 30000, serviceIntervalMonths: 12,
    }, 'Lifecycle');
    if (!v) throw new Error('could not create vehicle');
    ids.V = v.id; ids.Vplate = v.licensePlate;
    await sql('vehicles row', 'select id, license_plate, barcode, availability_status, maintenance_status, current_mileage, apk_date, warranty_end_date, last_service_date, last_service_mileage, created_by, updated_by from vehicles where id=$1', [v.id]);
    await sql('audit_logs create', "select action, resource_id, details->>'label' as label, status from audit_logs where resource_type='vehicle' and resource_id=$1 order by id", [String(v.id)]);
    for (const p of ['apk-expiring', 'warranty-expiring', 'service-due']) {
      const r = await A.get(`/api/vehicles/${p}`);
      const hit = Array.isArray(r.json) ? r.json.find(x => x.id === v.id) : null;
      log(`GET /api/vehicles/${p} -> ${r.status}, contains V: ${!!hit}${hit?.serviceDue ? ' serviceDue=' + JSON.stringify(hit.serviceDue) : ''}`);
    }
  });

  // ---------- B. edit ----------
  await step('B. Edit: PATCH remarks, negative service interval, future last service date', async () => {
    let r = await A.patch(`/api/vehicles/${ids.V}`, { remarks: 'AUDIT-P9 edited' });
    log('PATCH remarks ->', excerpt(r, 100));
    await sql('after edit', 'select remarks, updated_by, updated_at from vehicles where id=$1', [ids.V]);
    await sql('audit_logs update', "select action, details->'changes' as changes from audit_logs where resource_type='vehicle' and resource_id=$1 and action='vehicle.update' order by id desc limit 1", [String(ids.V)]);
    r = await A.patch(`/api/vehicles/${ids.V}`, { serviceIntervalKm: -5, serviceIntervalMonths: 0 });
    log('PATCH serviceIntervalKm=-5, months=0 ->', excerpt(r, 100));
    await sql('interval', 'select service_interval_km, service_interval_months from vehicles where id=$1', [ids.V]);
    r = await A.get('/api/vehicles/service-due');
    const hit = r.json.find(x => x.id === ids.V);
    log('service-due with -5 interval: contains V:', !!hit, hit ? JSON.stringify(hit.serviceDue) : '');
    r = await A.patch(`/api/vehicles/${ids.V}`, { lastServiceDate: addDays(400), lastServiceMileage: 50000 });
    log('PATCH lastServiceDate future / lastServiceMileage > current ->', excerpt(r, 100));
    r = await A.get('/api/vehicles/service-due');
    log('service-due with future last service: contains V:', !!r.json.find(x => x.id === ids.V));
    // restore sane values
    r = await A.patch(`/api/vehicles/${ids.V}`, { lastServiceDate: addDays(-400), lastServiceMileage: 10000, serviceIntervalKm: 30000, serviceIntervalMonths: 12 });
    log('PATCH restore service fields ->', r.status);
    // scan endpoint lifecycle
    r = await A.post('/api/vehicles/service-due/scan', {});
    log('POST service-due/scan ->', excerpt(r, 200));
    await sql('notification for V', "select id, title, priority, type from custom_notifications where type='service_due' and description like $1", [`%[service:${ids.V}]%`]);
    r = await A.patch(`/api/vehicles/${ids.V}`, { lastServiceDate: TODAY, lastServiceMileage: 39500 });
    r = await A.post('/api/vehicles/service-due/scan', {});
    log('POST service-due/scan after service logged ->', excerpt(r, 200));
    await sql('notification for V after service', "select id, title from custom_notifications where type='service_due' and description like $1", [`%[service:${ids.V}]%`]);
    // APK window edges
    r = await A.patch(`/api/vehicles/${ids.V}`, { apkDate: addDays(-70) });
    let e = await A.get('/api/vehicles/apk-expiring');
    log(`apkDate ${addDays(-70)} (70 days overdue) -> apk-expiring contains V: ${!!e.json.find(x => x.id === ids.V)}`);
    r = await A.patch(`/api/vehicles/${ids.V}`, { apkDate: addDays(-40) });
    e = await A.get('/api/vehicles/apk-expiring');
    log(`apkDate ${addDays(-40)} (40 days overdue) -> apk-expiring contains V: ${!!e.json.find(x => x.id === ids.V)}`);
    r = await A.patch(`/api/vehicles/${ids.V}`, { apkDate: addDays(31) });
    e = await A.get('/api/vehicles/apk-expiring');
    log(`apkDate ${addDays(31)} (reminder window 30d) -> apk-expiring contains V: ${!!e.json.find(x => x.id === ids.V)}`);
    r = await A.patch(`/api/vehicles/${ids.V}`, { apkDate: '10-10-2026' });
    e = await A.get('/api/vehicles/apk-expiring');
    log(`apkDate '10-10-2026' (dd-mm-yyyy, 30 days ahead) -> PATCH ${r.status}, apk-expiring contains V: ${!!e.json.find(x => x.id === ids.V)}`);
    r = await A.patch(`/api/vehicles/${ids.V}`, { apkDate: addDays(10), availabilityStatus: 'not_for_rental' });
    e = await A.get('/api/vehicles/apk-expiring');
    log(`apkDate ${addDays(10)} + not_for_rental -> apk-expiring contains V: ${!!e.json.find(x => x.id === ids.V)} (excluded status by settings)`);
    r = await A.patch(`/api/vehicles/${ids.V}`, { availabilityStatus: 'available' });
    log('PATCH back to available ->', r.status);
  });

  // ---------- C. concurrent edit ----------
  await step('C. Concurrent PATCH from two sessions (different fields, then same field)', async () => {
    let lost = 0;
    for (let i = 0; i < 5; i++) {
      const [r1, r2] = await Promise.all([
        A.patch(`/api/vehicles/${ids.V}`, { remarks: `AUDIT-S1-${i}` }),
        B.patch(`/api/vehicles/${ids.V}`, { tireSize: `AUDIT-S2-${i}` }),
      ]);
      const [row] = await q('select remarks, tire_size, updated_by from vehicles where id=$1', [ids.V]);
      const ok = row.remarks === `AUDIT-S1-${i}` && row.tire_size === `AUDIT-S2-${i}`;
      if (!ok) lost++;
      log(`round ${i}: S1 ${r1.status} S2 ${r2.status} -> DB remarks=${row.remarks} tire_size=${row.tire_size} updated_by=${row.updated_by} ${ok ? 'OK' : 'LOST UPDATE'}`);
    }
    log(`different-field concurrent PATCH: ${lost}/5 rounds lost an update`);
    const [r1, r2] = await Promise.all([
      A.patch(`/api/vehicles/${ids.V}`, { remarks: 'AUDIT-SAME-A' }),
      B.patch(`/api/vehicles/${ids.V}`, { remarks: 'AUDIT-SAME-B' }),
    ]);
    const [row] = await q('select remarks, updated_by from vehicles where id=$1', [ids.V]);
    log(`same-field: A ${r1.status} (echo ${r1.json?.remarks}) B ${r2.status} (echo ${r2.json?.remarks}) -> DB ${row.remarks} by ${row.updated_by}`);
  });

  // ---------- D. barcode ----------
  await step('D. Barcode regenerate, lookup, collision', async () => {
    const [v0] = await q('select barcode from vehicles where id=$1', [ids.V]);
    log('initial barcode', v0.barcode);
    let r = await A.get(`/api/barcodes/${v0.barcode}`);
    log(`GET /api/barcodes/${v0.barcode} -> ${r.status} type=${r.json?.type} vehicleId=${r.json?.vehicle?.id}`);
    r = await A.post(`/api/vehicles/${ids.V}/barcode/regenerate`, {});
    log('regenerate ->', r.status, r.json?.vehicle?.barcode);
    const newBc = r.json?.vehicle?.barcode;
    r = await A.get(`/api/barcodes/${v0.barcode}`);
    log(`old barcode lookup -> ${r.status} ${r.json?.type || ''} vehicleId=${r.json?.vehicle?.id} (via id-based parse?)`);
    r = await A.get(`/api/barcodes/${newBc}`);
    log(`new barcode lookup -> ${r.status} vehicleId=${r.json?.vehicle?.id}`);
    // collision: another vehicle claims the NEXT revision of V's barcode
    const nextRev = newBc.replace(/-R(\d+)$/, (m, n) => `-R${parseInt(n) + 1}`);
    const W = await createVehicle(A, { barcode: nextRev }, 'BarcodeCollision');
    ids.W = W?.id;
    log(`created W ${W?.id} with client-supplied barcode ${W?.barcode}`);
    r = await A.post(`/api/vehicles/${ids.V}/barcode/regenerate`, {});
    log(`regenerate V again (expects ${nextRev}) ->`, excerpt(r, 200));
    await sql('barcodes', 'select id, license_plate, barcode from vehicles where id = any($1)', [[ids.V, ids.W]]);
    // duplicate barcode on create
    const [vNow] = await q('select barcode from vehicles where id=$1', [ids.V]);
    r = await A.post('/api/vehicles', { licensePlate: `AU-9DUP-${ids.ts}`, brand: 'AUDIT-P9', model: 'DupBarcode', barcode: vNow.barcode });
    log('POST vehicle with duplicate barcode ->', excerpt(r, 250));
    // hijack: W's barcode = V's license plate -> plate scan resolves to W
    r = await A.patch(`/api/vehicles/${ids.W}`, { barcode: ids.Vplate });
    log(`PATCH W.barcode = "${ids.Vplate}" (V's plate) ->`, r.status, r.json?.barcode);
    r = await A.get(`/api/barcodes/${encodeURIComponent(ids.Vplate)}`);
    log(`GET /api/barcodes/${ids.Vplate} -> ${r.status} resolves vehicle id=${r.json?.vehicle?.id} plate=${r.json?.vehicle?.licensePlate} (V is ${ids.V}, W is ${ids.W})`);
    r = await A.patch(`/api/vehicles/${ids.W}`, { barcode: null });
    log('PATCH W.barcode = null ->', r.status, 'barcode now', r.json?.barcode);
    r = await A.get(`/api/barcodes/${encodeURIComponent(ids.Vplate)}`);
    log(`plate scan after reset -> vehicle id=${r.json?.vehicle?.id}`);
  });

  // ---------- E. mileage ----------
  await step('E. Mileage flows: manual decrease, pickup, return, edit after return', async () => {
    let r = await A.patch(`/api/vehicles/${ids.V}`, { currentMileage: 39500 });
    log('set currentMileage 39500 ->', r.status);
    r = await A.patch(`/api/vehicles/${ids.V}/mileage`, { currentMileage: 39000 });
    log('PATCH /mileage decrease w/o password ->', excerpt(r, 160));
    r = await A.patch(`/api/vehicles/${ids.V}/mileage`, { returnMileage: 38000 });
    log('PATCH /mileage returnMileage=38000 (implicit current decrease) ->', excerpt(r, 160));
    r = await A.patch(`/api/vehicles/${ids.V}/mileage`, { departureMileage: 1 });
    log('PATCH /mileage departureMileage=1 ->', r.status, 'departure', r.json?.departureMileage, 'current', r.json?.currentMileage);
    r = await A.patch(`/api/vehicles/${ids.V}/mileage`, { currentMileage: 39000, mileageOverridePassword: 'admin123' });
    log('PATCH /mileage decrease with password ->', r.status, 'current', r.json?.currentMileage);
    await sql('decrease trail', 'select current_mileage, previous_mileage, mileage_decreased_by, mileage_decreased_at from vehicles where id=$1', [ids.V]);
    r = await A.patch(`/api/vehicles/${ids.V}`, { currentMileage: 'abc' });
    log('PATCH currentMileage "abc" ->', excerpt(r, 120));
    r = await A.patch(`/api/vehicles/${ids.V}`, { currentMileage: 39500.7 });
    log('PATCH currentMileage 39500.7 ->', excerpt(r, 120));

    // reservation R1 -> pickup -> return
    r = await A.post('/api/reservations', { vehicleId: ids.V, customerId: ids.custA, driverId: ids.driver, startDate: TODAY, endDate: addDays(2), status: 'booked' });
    log('POST reservation R1 ->', excerpt(r, 120)); ids.R1 = r.json?.id;
    await sql('driver assignment', 'select id, driver_id, assigned_until from reservation_driver_assignments where reservation_id=$1', [ids.R1]);
    await sql('vehicle status after booking', 'select availability_status from vehicles where id=$1', [ids.V]);
    r = await A.post(`/api/reservations/${ids.R1}/pickup`, { contractNumber: `AUDIT-P9-${ids.ts}`, pickupMileage: 38990, fuelLevelPickup: 'full' });
    log('pickup with mileage 38990 < current 39000 ->', excerpt(r, 160));
    r = await A.post(`/api/reservations/${ids.R1}/pickup`, { contractNumber: `AUDIT-P9-${ids.ts}`, pickupMileage: 39100, fuelLevelPickup: 'full' });
    log('pickup 39100 ->', r.status, 'status', r.json?.status || r.json?.reservation?.status);
    await sql('after pickup', 'select v.current_mileage, v.availability_status, r.status, r.pickup_mileage, r.contract_number from vehicles v join reservations r on r.vehicle_id=v.id where r.id=$1', [ids.R1]);
    await sql('contract document', 'select id, document_type, file_name, file_path from documents where reservation_id=$1', [ids.R1]);
    r = await A.post(`/api/reservations/${ids.R1}/return`, { returnMileage: 39050, fuelLevelReturn: 'full' });
    log('return 39050 < pickup 39100 ->', excerpt(r, 160));
    r = await A.post(`/api/reservations/${ids.R1}/return`, { returnMileage: 39300, fuelLevelReturn: '1/2' });
    log('return 39300 ->', r.status, 'status', r.json?.status || r.json?.reservation?.status);
    await sql('after return', 'select v.current_mileage, v.availability_status, r.status, r.pickup_mileage, r.return_mileage, r.start_date, r.end_date from vehicles v join reservations r on r.vehicle_id=v.id where r.id=$1', [ids.R1]);
    // manual edits after return
    r = await A.patch(`/api/reservations/${ids.R1}`, { returnMileage: 30000 });
    log('PATCH reservation returnMileage=30000 (< pickup) after return ->', r.status, 'returnMileage', r.json?.returnMileage);
    r = await A.patch(`/api/reservations/${ids.R1}`, { pickupMileage: 45000 });
    log('PATCH reservation pickupMileage=45000 (> return) ->', r.status, 'pickupMileage', r.json?.pickupMileage);
    await sql('reservation vs vehicle mileage', 'select r.pickup_mileage, r.return_mileage, v.current_mileage from reservations r join vehicles v on v.id=r.vehicle_id where r.id=$1', [ids.R1]);
    r = await A.patch(`/api/vehicles/${ids.V}`, { currentMileage: 5, mileageOverridePassword: 'admin123' });
    log('PATCH vehicle currentMileage=5 with override ->', r.status, r.json?.currentMileage, 'prev', r.json?.previousMileage);
    r = await A.patch(`/api/vehicles/${ids.V}`, { currentMileage: 39300 });
    log('PATCH vehicle currentMileage back to 39300 ->', r.status);
  });

  // ---------- F. maintenance vs reservations ----------
  await step('F. Maintenance vs booked / picked-up reservations', async () => {
    let r = await A.post('/api/reservations', { vehicleId: ids.V, customerId: ids.custB, startDate: addDays(3), endDate: addDays(6), status: 'booked' });
    log('POST reservation R2 (custB, +3..+6) ->', excerpt(r, 100)); ids.R2 = r.json?.id;
    r = await A.patch(`/api/vehicles/${ids.V}`, { availabilityStatus: 'needs_fixing' });
    log('PATCH availabilityStatus=needs_fixing with booked R2 ->', r.status, 'response has warning key:', r.json && 'warning' in r.json, 'keys sample:', Object.keys(r.json || {}).filter(k => /warn|message/i.test(k)));
    await sql('R2 after needs_fixing', 'select status, vehicle_id from reservations where id=$1', [ids.R2]);
    r = await A.patch(`/api/vehicles/${ids.V}/maintenance-status`, { status: 'in_service', note: 'AUDIT-P9 in workshop' });
    log('PATCH maintenance-status in_service ->', r.status, 'availability', r.json?.availabilityStatus, 'maintenance', r.json?.maintenanceStatus);
    r = await A.post(`/api/reservations/${ids.R2}/pickup`, { contractNumber: `AUDIT-P9-R2-${ids.ts}`, pickupMileage: 39400, fuelLevelPickup: 'full' });
    log('pickup R2 while vehicle needs_fixing + in_service ->', excerpt(r, 160));
    await sql('vehicle after pickup during service', 'select availability_status, maintenance_status, maintenance_note from vehicles where id=$1', [ids.V]);
    r = await A.post(`/api/reservations/${ids.R2}/return`, { returnMileage: 39450, fuelLevelReturn: 'full' });
    log('return R2 ->', r.status);
    await sql('vehicle after return while in_service', 'select availability_status, maintenance_status from vehicles where id=$1', [ids.V]);
    r = await A.patch(`/api/vehicles/${ids.V}/maintenance-status`, { status: 'ok' });
    log('maintenance-status ok ->', r.status, r.json?.availabilityStatus, r.json?.maintenanceStatus);
    // picked-up vehicle put into maintenance
    r = await A.post('/api/reservations', { vehicleId: ids.V, customerId: ids.custB, startDate: TODAY, endDate: addDays(1), status: 'booked' });
    ids.R3 = r.json?.id; log('POST R3 today..+1 ->', excerpt(r, 80));
    r = await A.post(`/api/reservations/${ids.R3}/pickup`, { contractNumber: `AUDIT-P9-R3-${ids.ts}`, pickupMileage: 39450, fuelLevelPickup: 'full' });
    log('pickup R3 ->', r.status);
    r = await A.patch(`/api/vehicles/${ids.V}/maintenance-status`, { status: 'in_service' });
    log('maintenance-status in_service on rented vehicle ->', r.status, r.json?.availabilityStatus, r.json?.maintenanceStatus);
    r = await A.patch(`/api/vehicles/${ids.V}`, { availabilityStatus: 'needs_fixing' });
    log('PATCH availabilityStatus=needs_fixing on rented vehicle ->', r.status, r.json?.availabilityStatus);
    r = await A.post('/api/reservations', { vehicleId: ids.V, type: 'maintenance_block', startDate: TODAY, endDate: addDays(1), maintenanceStatus: 'in' });
    log('POST maintenance_block over picked-up R3 ->', excerpt(r, 200)); ids.MB = r.json?.id ?? r.json?.reservation?.id;
    await sql('R3 + vehicle', 'select r.status, v.availability_status, v.maintenance_status from reservations r join vehicles v on v.id=r.vehicle_id where r.id=$1', [ids.R3]);
    r = await A.post(`/api/reservations/${ids.R3}/return`, { returnMileage: 39500, fuelLevelReturn: 'full' });
    log('return R3 ->', r.status);
    await sql('vehicle after return (in_service + block)', 'select availability_status, maintenance_status from vehicles where id=$1', [ids.V]);
    r = await A.get(`/api/vehicles/available?startDate=${TODAY}&endDate=${addDays(1)}`);
    log('GET /api/vehicles/available today..+1 contains V:', !!(r.json || []).find(x => x.id === ids.V));
    r = await A.post('/api/reservations', { vehicleId: ids.V, customerId: ids.custA, startDate: TODAY, endDate: addDays(1), status: 'booked' });
    log('POST booking on vehicle in maintenance block + in_service (BUG-018 / MT-002 re-check) ->', excerpt(r, 120)); ids.R4 = r.json?.id;
    // not_for_rental + pickup via /status
    if (ids.MB) { r = await A.del(`/api/reservations/${ids.MB}`); log('DELETE maintenance block ->', r.status); }
    r = await A.patch(`/api/vehicles/${ids.V}/maintenance-status`, { status: 'ok' });
    r = await A.patch(`/api/vehicles/${ids.V}`, { availabilityStatus: 'not_for_rental' });
    log('PATCH not_for_rental with booked R4 ->', r.status);
    r = await A.post(`/api/reservations/${ids.R4}/pickup`, { contractNumber: `AUDIT-P9-R4-${ids.ts}`, pickupMileage: 39500, fuelLevelPickup: 'full' });
    log('pickup R4 on not_for_rental ->', excerpt(r, 140));
    r = await A.patch(`/api/reservations/${ids.R4}/status`, { status: 'picked_up' });
    log('PATCH /status picked_up on not_for_rental ->', excerpt(r, 140));
    await sql('R4 + vehicle', 'select r.status, v.availability_status from reservations r join vehicles v on v.id=r.vehicle_id where r.id=$1', [ids.R4]);
    r = await A.patch(`/api/reservations/${ids.R4}/status`, { status: 'booked' });
    r = await A.patch(`/api/reservations/${ids.R4}/status`, { status: 'cancelled' });
    log('cancel R4 ->', r.status);
    r = await A.patch(`/api/vehicles/${ids.V}`, { availabilityStatus: 'available' });
    log('PATCH available ->', r.status);
  });

  // ---------- G. documents ----------
  await step('G. Documents upload/list/delete', async () => {
    const m = multipart({ vehicleId: ids.V, documentType: 'Other', notes: 'AUDIT-P9 doc' }, { field: 'file', name: 'audit-p9.pdf', type: 'application/pdf', data: TINY_PDF });
    let r = await A.post('/api/documents', m.body, { raw: true, headers: { 'Content-Type': m.type } });
    log('POST /api/documents (Other) ->', excerpt(r, 250)); ids.D1 = r.json?.id;
    const m2 = multipart({ vehicleId: ids.V, documentType: 'APK Inspection', apkDate: addDays(365) }, { field: 'file', name: 'audit-p9-apk.pdf', type: 'application/pdf', data: TINY_PDF });
    r = await A.post('/api/documents', m2.body, { raw: true, headers: { 'Content-Type': m2.type } });
    log('POST /api/documents (APK Inspection + apkDate) ->', excerpt(r, 200)); ids.D2 = r.json?.id;
    await sql('vehicle apk after doc', 'select apk_date from vehicles where id=$1', [ids.V]);
    r = await A.get(`/api/documents/vehicle/${ids.V}`);
    log(`GET /api/documents/vehicle/${ids.V} -> ${r.status} count=${r.json?.length}`);
    const docs = await sql('documents rows', 'select id, document_type, file_path, reservation_id from documents where vehicle_id=$1 order by id', [ids.V]);
    for (const d of docs) {
      const abs = path.resolve(process.cwd(), d.file_path);
      log(`  doc ${d.id} file exists on disk: ${fs.existsSync(abs)} (${abs})`);
    }
    r = await A.del(`/api/documents/${ids.D2}`);
    log(`DELETE /api/documents/${ids.D2} ->`, excerpt(r, 100));
    const d2 = docs.find(d => d.id === ids.D2);
    if (d2) log(`  file after delete exists: ${fs.existsSync(path.resolve(process.cwd(), d2.file_path))}`);
    await sql('documents after delete', 'select id from documents where id=$1', [ids.D2]);
  });

  fs.writeFileSync(path.join(__dirname, 'p9-ids.json'), JSON.stringify(ids, null, 2));
  log('\nids: ' + JSON.stringify(ids));
  log(`health end: ${await health()}`);
  writeOut('p9-out-01.txt');
  await pool.end();
}

main().catch(async (e) => { log('FATAL ' + (e.stack || e)); writeOut('p9-out-01.txt'); await pool.end(); process.exit(1); });

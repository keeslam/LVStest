// Phase 9 part 4: remaining gaps. Empty-plate vehicle from bulk import,
// orphaned files after vehicle delete, plate rename with documents, warranty
// window edges, overlaps endpoint, barcode duplicate via PATCH, and a
// PATCH-vs-pickup lost-update race on the generic vehicle PATCH.
'use strict';
const fs = require('fs');
const path = require('path');
const { getSession, log, excerpt, step, sql, q, pool, writeOut, health } = require('./p9-lib.cjs');

const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'p9-ids.json'), 'utf8'));
const UPLOADS = 'C:/Users/kees lam/Desktop/LVStest-main/audit-uploads';
const today = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(today);
const V = ids.V;

function docFile(fp) {
  const a = path.resolve(UPLOADS, fp); if (fs.existsSync(a)) return a;
  const b = path.resolve(process.cwd(), fp); if (fs.existsSync(b)) return b;
  return null;
}
function multipart(fields, file) {
  const boundary = '----AuditP9' + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');

async function createVehicle(s, extra, tag) {
  for (let n = 903; n < 999; n++) {
    const plate = `AU-${n}-X`;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P9', model: tag, ...extra });
    if (r.status === 201) { log(`POST /api/vehicles ${plate} -> 201 id ${r.json.id}`); return r.json; }
    if (r.status !== 409) { log(`POST /api/vehicles ${plate} -> ${excerpt(r)}`); return null; }
  }
  return null;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  log(`health: ${await health()} today=${TODAY}`);
  const A = await getSession('admin', 'admin', 'admin123');
  let B;
  try { B = await getSession('mgr', 'AUDIT-manager-1788982804001', 'AuditManager123'); }
  catch (e) { log('mgr login failed: ' + e.message); B = A; }

  await step('A. Empty license plate created by bulk-import-plates (id 1767 from p9-03)', async () => {
    await sql('vehicle 1767', "select id, license_plate, length(license_plate) as len, brand, model, barcode, created_by from vehicles where id=1767");
    await sql('all empty-plate vehicles', "select id, license_plate, created_at from vehicles where trim(license_plate)='' order by id");
    let r = await A.get('/api/vehicles/1767'); log('GET /api/vehicles/1767 ->', excerpt(r, 140));
    r = await A.get('/api/barcodes/VEH-001767'); log('GET /api/barcodes/VEH-001767 ->', r.status, 'plate=' + JSON.stringify(r.json?.vehicle?.licensePlate));
    r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: ['   '] }); log('bulk-import whitespace-only plate ->', excerpt(r, 200));
    r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: [null] }); log('bulk-import [null] ->', excerpt(r, 200));
    r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: [{ licensePlate: 'AU-9OBJ-X' }] }); log('bulk-import [object] ->', excerpt(r, 200));
    r = await A.get('/api/vehicles/1767/delete-impact'); log('delete-impact 1767 ->', excerpt(r, 160));
    r = await A.del('/api/vehicles/1767', { confirmLicensePlate: '' }); log('DELETE 1767 with confirmLicensePlate "" ->', excerpt(r, 160));
    await sql('1767 after delete attempt', 'select id from vehicles where id=1767');
  });

  await step('B. Documents: upload -> delete vehicle -> orphaned file? -> restore -> row/file back', async () => {
    const X = await createVehicle(A, {}, 'DocOrphan'); ids.Xdoc = X.id;
    const m = multipart({ vehicleId: X.id, documentType: 'Other', notes: 'AUDIT-P9 orphan test' }, { field: 'file', name: 'audit-p9-orphan.pdf', type: 'application/pdf', data: TINY_PDF });
    let r = await A.post('/api/documents', m.body, { raw: true, headers: { 'Content-Type': m.type } });
    log('POST /api/documents ->', r.status, 'id', r.json?.id, 'filePath', r.json?.filePath); const docId = r.json?.id; const fp = r.json?.filePath;
    const abs = docFile(fp); log('file on disk before delete:', !!abs, abs);
    r = await A.get(`/api/documents/download/${docId}`); log('download before delete ->', r.status, r.headers.get('content-type'));
    r = await A.del(`/api/vehicles/${X.id}`, { confirmLicensePlate: X.licensePlate }); log('DELETE vehicle ->', excerpt(r, 100));
    await sql('documents row after vehicle delete', 'select id from documents where id=$1', [docId]);
    log('file on disk after vehicle delete:', fs.existsSync(abs), abs);
    r = await A.get(`/api/documents/${docId}`); log('GET /api/documents/:id after vehicle delete ->', r.status);
    const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 order by id desc limit 1", [X.id]);
    r = await A.post(`/api/deleted-records/${dr[0].id}/restore`, {}); log('restore ->', r.status);
    await sql('documents row after restore', 'select id, file_path from documents where id=$1', [docId]);
    r = await A.get(`/api/documents/download/${docId}`); log('download after restore ->', r.status);
    // now delete for good, leaving the file
    r = await A.del(`/api/vehicles/${X.id}`, { confirmLicensePlate: X.licensePlate }); log('DELETE vehicle again (left deleted) ->', r.status);
    log('file on disk after 2nd delete (orphan):', fs.existsSync(abs));
    const dirs = fs.readdirSync(UPLOADS).filter(d => d.startsWith('AU9')); log('audit-uploads plate folders for AU-9xx vehicles:', dirs.join(', '));
  });

  await step('C. License plate rename on a vehicle with documents (file paths keyed by plate)', async () => {
    const Y = await createVehicle(A, {}, 'PlateRename'); ids.Y = Y.id;
    const m = multipart({ vehicleId: Y.id, documentType: 'Other', notes: 'AUDIT-P9 rename test' }, { field: 'file', name: 'audit-p9-rename.pdf', type: 'application/pdf', data: TINY_PDF });
    let r = await A.post('/api/documents', m.body, { raw: true, headers: { 'Content-Type': m.type } });
    const docId = r.json?.id; log('POST /api/documents ->', r.status, 'filePath', r.json?.filePath);
    const newPlate = `AU-9RN-${ids.ts % 1000}`;
    r = await A.patch(`/api/vehicles/${Y.id}`, { licensePlate: newPlate }); log(`PATCH licensePlate -> ${newPlate} ->`, r.status, r.json?.licensePlate);
    await sql('doc path after rename', 'select id, file_path, file_name from documents where id=$1', [docId]);
    r = await A.get(`/api/documents/download/${docId}`); log('download after rename ->', r.status);
    r = await A.get(`/api/documents/vehicle/${Y.id}`); log('GET documents/vehicle after rename -> count', r.json?.length);
    // second vehicle re-using the OLD plate now shares the old folder
    r = await A.post('/api/vehicles', { licensePlate: Y.licensePlate, brand: 'AUDIT-P9', model: 'PlateReuse' }); log('POST vehicle re-using old plate ->', r.status, 'id', r.json?.id); ids.Yreuse = r.json?.id;
    const m2 = multipart({ vehicleId: ids.Yreuse, documentType: 'Other', notes: 'AUDIT-P9 reuse' }, { field: 'file', name: 'audit-p9-reuse.pdf', type: 'application/pdf', data: TINY_PDF });
    r = await A.post('/api/documents', m2.body, { raw: true, headers: { 'Content-Type': m2.type } }); log('POST doc on plate-reusing vehicle -> filePath', r.json?.filePath);
    await sql('two vehicles, same folder', 'select id, vehicle_id, file_path from documents where vehicle_id = any($1) order by id', [[Y.id, ids.Yreuse]]);
  });

  await step('D. Warranty / APK window edges (default reminder days) + empty date', async () => {
    const st = await A.get('/api/settings'); log('settings apkReminderDays/warrantyReminderDays/maintenanceExcludedStatuses:', st.json?.apkReminderDays, st.json?.warrantyReminderDays, JSON.stringify(st.json?.maintenanceExcludedStatuses));
    const Z = await createVehicle(A, {}, 'WarrantyEdge'); ids.Z = Z.id;
    for (const [label, d] of [['-70d', addDays(-70)], ['-40d', addDays(-40)], ['today', TODAY], ['+30d', addDays(30)], ['+31d', addDays(31)]]) {
      let r = await A.patch(`/api/vehicles/${Z.id}`, { warrantyEndDate: d, apkDate: d });
      const w = await A.get('/api/vehicles/warranty-expiring'); const a = await A.get('/api/vehicles/apk-expiring');
      log(`warrantyEndDate=apkDate=${d} (${label}) -> PATCH ${r.status}; warranty-expiring: ${!!(w.json || []).find(x => x.id === Z.id)}, apk-expiring: ${!!(a.json || []).find(x => x.id === Z.id)}`);
    }
    let r = await A.patch(`/api/vehicles/${Z.id}`, { warrantyEndDate: '', apkDate: '' }); log('PATCH empty strings ->', r.status);
    await sql('dates after empty', 'select apk_date, warranty_end_date from vehicles where id=$1', [Z.id]);
    r = await A.patch(`/api/vehicles/${Z.id}`, { apkDate: `${TODAY}T00:00:00.000Z` }); log('PATCH apkDate ISO datetime ->', r.status);
    const a = await A.get('/api/vehicles/apk-expiring');
    await sql('apk after ISO datetime', 'select apk_date from vehicles where id=$1', [Z.id]); log('apk-expiring contains Z with ISO datetime value:', !!(a.json || []).find(x => x.id === Z.id));
    r = await A.patch(`/api/vehicles/${Z.id}`, { apkDate: null });
  });

  await step('E. GET /api/vehicles/:id/overlaps on V (R5 3367 overlaps ghost 3370)', async () => {
    let r = await A.get(`/api/vehicles/${V}/overlaps`); log('overlaps ->', r.status, excerpt(r, 300));
    await sql('V reservations overlapping', "select id, start_date, end_date, status, type from reservations where vehicle_id=$1 and deleted_at is null and status='booked' order by start_date", [V]);
  });

  await step('F. Barcode: PATCH another vehicle barcode to an existing one; PATCH to RES-form; lookup precedence', async () => {
    const [v] = await q('select barcode from vehicles where id=$1', [V]);
    let r = await B.patch(`/api/vehicles/${ids.Z}`, { barcode: v.barcode }); log(`PATCH Z.barcode = V's ${v.barcode} ->`, excerpt(r, 200));
    r = await B.patch(`/api/vehicles/${ids.Z}`, { barcode: 'RES-003367' }); log('PATCH Z.barcode = RES-003367 (reservation barcode form) ->', r.status, r.json?.barcode);
    r = await A.get('/api/barcodes/RES-003367'); log('GET /api/barcodes/RES-003367 -> type', r.json?.type, 'reservation', r.json?.reservation?.id, 'vehicle', r.json?.vehicle?.id);
    r = await B.patch(`/api/vehicles/${ids.Z}`, { barcode: 'VEH-001762-S' }); log('PATCH Z.barcode = VEH-001762-S (V spare-key form) ->', r.status, r.json?.barcode);
    r = await A.get('/api/barcodes/VEH-001762-S'); log('GET /api/barcodes/VEH-001762-S -> vehicle', r.json?.vehicle?.id, 'spare', r.json?.scannedSpareKey, '(V is', V + ', Z is', ids.Z + ')');
    r = await B.patch(`/api/vehicles/${ids.Z}`, { barcode: null }); log('reset Z barcode ->', r.status);
    await sql('Z barcode', 'select barcode from vehicles where id=$1', [ids.Z]);
  });

  await step('G. Race: generic PATCH /api/vehicles/:id (remarks only) concurrent with POST pickup -> does the stale full-row write undo the pickup?', async () => {
    const P = await createVehicle(A, { currentMileage: 1000 }, 'PickupRace'); ids.P = P.id;
    const delays = [0, 150, 300, 500, 800, 1200];
    let corrupted = 0;
    for (let i = 0; i < delays.length; i++) {
      let r = await A.post('/api/reservations', { vehicleId: P.id, customerId: ids.custA, startDate: TODAY, endDate: addDays(1), status: 'booked' });
      const rid = r.json?.id; if (!rid) { log('booking failed', excerpt(r, 120)); continue; }
      const pickup = A.post(`/api/reservations/${rid}/pickup`, { contractNumber: `AUDIT-P9-RACE-${ids.ts}-${i}`, pickupMileage: 1000 + (i + 1) * 100, fuelLevelPickup: 'full' });
      await sleep(delays[i]);
      const patch = B.patch(`/api/vehicles/${P.id}`, { remarks: `AUDIT-P9 race ${i}` });
      const [rp, rq] = await Promise.all([pickup, patch]);
      const [row] = await q('select v.availability_status, v.current_mileage, v.current_fuel_level, v.remarks, r.status as res_status, r.pickup_mileage from vehicles v join reservations r on r.vehicle_id=v.id where r.id=$1', [rid]);
      const bad = row.res_status === 'picked_up' && (row.availability_status !== 'rented' || row.current_mileage !== row.pickup_mileage);
      if (bad) corrupted++;
      log(`round ${i} delay ${delays[i]}ms: pickup ${rp.status} patch ${rq.status} -> vehicle ${JSON.stringify(row)} ${bad ? 'PICKUP SIDE-EFFECTS LOST' : 'ok'}`);
      r = await A.post(`/api/reservations/${rid}/return`, { returnMileage: 1000 + (i + 1) * 100 + 10, fuelLevelReturn: 'full' });
      if (r.status !== 200) log('  return ->', excerpt(r, 120));
      await A.patch(`/api/vehicles/${P.id}`, { currentMileage: 1000 + (i + 1) * 100 + 10 }).catch(() => {});
    }
    log(`PATCH-vs-pickup race: ${corrupted}/${delays.length} rounds lost the pickup's vehicle update`);
    await sql('final P', 'select availability_status, current_mileage from vehicles where id=$1', [P.id]);
  });

  await step('H. Transport on a deleted vehicle: error mapping (repeat of p9-02 step 3 with SQL error capture)', async () => {
    const D = await createVehicle(A, {}, 'DeletedTransport'); ids.D = D.id;
    let r = await A.del(`/api/vehicles/${D.id}`, { confirmLicensePlate: D.licensePlate }); log('DELETE ->', r.status);
    r = await A.post('/api/transports', { vehicleId: D.id, transportType: 'tow', scheduledDate: addDays(5), reason: 'AUDIT-P9 tow on deleted vehicle' }); log('POST /api/transports vehicleId deleted ->', excerpt(r, 200));
    r = await A.post('/api/transports', { vehicleId: ids.Z, transportType: 'swap', scheduledDate: addDays(5), spareRequired: true, relatedVehicleId: D.id, reason: 'AUDIT-P9 spare = deleted vehicle' }); log('POST /api/transports relatedVehicleId deleted ->', excerpt(r, 200));
    if (r.status === 201) { await sql('transport with deleted spare', 'select id, related_vehicle_id, spare_reservation_id from vehicle_transports where id=$1', [r.json.id]); await sql('spare reservation on deleted vehicle', 'select id, vehicle_id, type, status from reservations where id=$1', [r.json.spareReservationId]); ids.Tdead = r.json.id; }
    r = await A.post('/api/reservations', { vehicleId: D.id, customerId: ids.custA, startDate: addDays(60), endDate: addDays(61), status: 'booked' }); log('POST reservation on deleted vehicle (again) ->', r.status, r.json?.id);
    r = await A.get('/api/vehicles/available?startDate=' + addDays(60) + '&endDate=' + addDays(61)); log('GET /api/vehicles/available lists deleted D:', !!(r.json || []).find(x => x.id === D.id));
    r = await A.get('/api/reservations?vehicleId=' + D.id); log('GET /api/reservations?vehicleId=D -> count', Array.isArray(r.json) ? r.json.length : r.status);
  });

  fs.writeFileSync(path.join(__dirname, 'p9-ids.json'), JSON.stringify(ids, null, 2));
  log(`health end: ${await health()}`);
  writeOut('p9-out-04.txt');
  await pool.end();
}

main().catch(async (e) => { log('FATAL ' + (e.stack || e)); writeOut('p9-out-04.txt'); await pool.end(); process.exit(1); });

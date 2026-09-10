// Phase 9 - lifecycle chain part 2: transport assignment -> delete vehicle
// (with reservations of two customers, documents, driver assignment, blacklist,
// expense, transport, APK date change, fine) -> reserve the DELETED vehicle
// (POST + check-conflicts) -> restore -> row-by-row + file consistency check
// -> restore twice -> restore blocked by barcode collision.
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
const V = ids.V, W = ids.W;

function docFile(fp) {
  // documents.file_path is stored in two formats (see DM-003): uploads-relative or cwd-relative
  const a = path.resolve(UPLOADS, fp); if (fs.existsSync(a)) return a;
  const b = path.resolve(process.cwd(), fp); if (fs.existsSync(b)) return b;
  return null;
}

async function snapshot(label) {
  const out = {};
  out.vehicle = await q('select id, license_plate, barcode, availability_status, maintenance_status, current_mileage from vehicles where id=$1', [V]);
  out.reservations = await q('select id, customer_id, status, type, start_date, end_date, driver_id, contract_number, deleted_at is not null as soft_deleted from reservations where vehicle_id=$1 order by id', [V]);
  out.documents = await q('select id, document_type, reservation_id, file_path from documents where vehicle_id=$1 order by id', [V]);
  out.driverAssignments = await q('select a.id, a.reservation_id, a.driver_id from reservation_driver_assignments a where a.reservation_id = any($1)', [ids.allRes || []]);
  out.expenses = await q('select id, category, amount from expenses where vehicle_id=$1', [V]);
  out.blacklist = await q('select id, customer_id from vehicle_customer_blacklist where vehicle_id=$1', [V]);
  out.transports = await q('select id, vehicle_id, related_vehicle_id, reservation_id, spare_reservation_id, spare_required, status from vehicle_transports where id = any($1)', [[ids.T1, ids.T2].filter(Boolean)]);
  out.apkChanges = await q('select id, status, new_apk_date from apk_date_changes where vehicle_id=$1', [V]);
  out.fines = await q('select id, vehicle_id, reservation_id from fines where id=$1', [ids.fine]);
  out.scanEvents = await q('select count(*)::int as n from scan_events where vehicle_id=$1', [V]);
  out.notifications = await q("select id from custom_notifications where type='service_due' and description like $1", [`%[service:${V}]%`]);
  log(`SNAPSHOT ${label}: ${JSON.stringify(out)}`);
  const files = out.documents.map(d => ({ id: d.id, onDisk: !!docFile(d.file_path) }));
  log(`  document files on disk: ${JSON.stringify(files)}`);
  return out;
}

async function main() {
  log(`health: ${await health()} today=${TODAY} V=${V} W=${W}`);
  const A = await getSession('admin', 'admin', 'admin123');

  await step('0. Clean up state left by p9-01 (maintenance block, not_for_rental)', async () => {
    const blocks = await q("select id from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null", [V]);
    for (const b of blocks) { const r = await A.del(`/api/reservations/${b.id}`); log(`DELETE maintenance block ${b.id} ->`, r.status); }
    let r = await A.patch(`/api/vehicles/${V}/maintenance-status`, { status: 'ok' });
    r = await A.patch(`/api/vehicles/${V}`, { availabilityStatus: 'available' });
    log('PATCH available ->', excerpt(r, 120));
  });

  await step('1. Fixtures on V: driver-assigned future booking (custA), booking custB, blacklist, expense, transports, APK change, fine', async () => {
    let r = await A.post(`/api/customers/${ids.custA}/drivers`, { displayName: 'AUDIT-P9 Driver', firstName: 'AUDIT', lastName: 'P9Driver', licenseNumber: `AUDIT-P9-${ids.ts}`, status: 'active' });
    log('POST driver ->', excerpt(r, 120)); ids.driver = r.json?.id;
    r = await A.post('/api/reservations', { vehicleId: V, customerId: ids.custA, driverId: ids.driver, startDate: addDays(20), endDate: addDays(25), status: 'booked' });
    log('POST R5 (custA +20..+25, driver) ->', excerpt(r, 100)); ids.R5 = r.json?.id;
    r = await A.post('/api/reservations', { vehicleId: V, customerId: ids.custB, startDate: addDays(30), endDate: addDays(33), status: 'booked' });
    log('POST R6 (custB +30..+33) ->', excerpt(r, 100)); ids.R6 = r.json?.id;
    r = await A.post(`/api/vehicles/${V}/blacklist`, { customerId: ids.custB, reason: 'AUDIT-P9 blacklist' });
    log('POST blacklist custB ->', excerpt(r, 100)); ids.bl = r.json?.id;
    r = await A.post('/api/expenses', { vehicleId: V, category: 'AUDIT-P9', amount: 12.5, date: TODAY, description: 'AUDIT-P9 expense' });
    log('POST expense ->', excerpt(r, 100)); ids.exp = r.json?.id;
    r = await A.post('/api/transports', { vehicleId: V, transportType: 'tow', scheduledDate: addDays(21), reservationId: ids.R5, reason: 'AUDIT-P9 tow' });
    log('POST transport T1 (V, tow, linked R5) ->', excerpt(r, 160)); ids.T1 = r.json?.id;
    r = await A.post('/api/transports', { vehicleId: W, transportType: 'swap', scheduledDate: addDays(40), spareRequired: true, relatedVehicleId: V, reason: 'AUDIT-P9 swap, V is spare' });
    log('POST transport T2 (W, spare = V) ->', excerpt(r, 200)); ids.T2 = r.json?.id;
    const t2 = await sql('T2 row', 'select id, vehicle_id, related_vehicle_id, spare_reservation_id, spare_required from vehicle_transports where id=$1', [ids.T2]);
    ids.spareRes = t2[0]?.spare_reservation_id;
    // scheduler-produced rows, inserted directly as fixtures (no API creates them on demand)
    const apk = await q("insert into apk_date_changes (vehicle_id, previous_apk_date, new_apk_date, status) values ($1,'2027-09-10','2027-10-01','pending') returning id", [V]);
    ids.apk = apk[0].id; log('SQL fixture apk_date_changes id', ids.apk);
    const fine = await q("insert into fines (license_plate, vehicle_id, reservation_id, customer_id, offence_at, description, amount, total_amount) values ($1,$2,$3,$4,now(),'AUDIT-P9 fine',10,10) returning id", [ids.Vplate, V, ids.R1, ids.custA]);
    ids.fine = fine[0].id; log('SQL fixture fines id', ids.fine);
    ids.allRes = (await q('select id from reservations where vehicle_id=$1', [V])).map(r => r.id);
    r = await A.post('/api/vehicles/service-due/scan', {});
    log('service-due scan ->', excerpt(r, 120));
  });

  const before = await snapshot('BEFORE DELETE');

  await step('2. delete-impact + DELETE vehicle', async () => {
    let r = await A.get(`/api/vehicles/${V}/delete-impact`);
    log('GET delete-impact ->', excerpt(r, 400));
    r = await A.del(`/api/vehicles/${V}`, { confirmLicensePlate: ids.Vplate });
    log('DELETE vehicle ->', excerpt(r, 200));
    const dr = await sql('deleted_records', "select id, entity_id, label, related_counts, restored_at from deleted_records where entity_type='vehicle' and entity_id=$1 order by id desc limit 1", [V]);
    ids.DR1 = dr[0]?.id;
    await sql('audit_logs delete', "select action, status, details->'cascaded' as cascaded from audit_logs where resource_type='vehicle' and resource_id=$1 and action='vehicle.delete' order by id desc limit 1", [String(V)]);
    const pl = await q('select payload from deleted_records where id=$1', [ids.DR1]);
    const p = pl[0].payload;
    log('snapshot payload keys/counts:', JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]))));
  });

  const after = await snapshot('AFTER DELETE');

  await step('3. Reserve the DELETED vehicle: check-conflicts, POST reservation, transport', async () => {
    let r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(21)}&endDate=${addDays(23)}`);
    log(`GET check-conflicts V(deleted) ${addDays(21)}..${addDays(23)} ->`, excerpt(r, 120));
    r = await A.get(`/api/vehicles/${V}`);
    log('GET /api/vehicles/V ->', r.status);
    r = await A.post('/api/reservations', { vehicleId: V, customerId: ids.custB, startDate: addDays(21), endDate: addDays(23), status: 'booked' });
    log('POST reservation on deleted vehicle (overlaps snapshotted R5) ->', excerpt(r, 160)); ids.Rghost = r.json?.id;
    await sql('ghost reservation', 'select id, vehicle_id, status from reservations where id=$1', [ids.Rghost]);
    r = await A.get(`/api/reservations/${ids.Rghost}`);
    log('GET ghost reservation ->', r.status, 'vehicle in response:', JSON.stringify(r.json?.vehicle ?? null).slice(0, 80));
    r = await A.get('/api/reservations');
    const g = (r.json || []).find(x => x.id === ids.Rghost);
    log('GET /api/reservations lists ghost:', !!g, g ? 'vehicle=' + JSON.stringify(g.vehicle ?? null).slice(0, 60) : '');
    r = await A.post('/api/transports', { vehicleId: V, transportType: 'tow', scheduledDate: addDays(22), reason: 'AUDIT-P9 tow on deleted vehicle' });
    log('POST transport on deleted vehicle ->', excerpt(r, 200));
    r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(21)}&endDate=${addDays(23)}`);
    log('check-conflicts after ghost ->', r.status, 'count', r.json?.length);
  });

  await step('4. Restore', async () => {
    let r = await A.post(`/api/deleted-records/${ids.DR1}/restore`, {});
    log('POST restore ->', excerpt(r, 200));
    await sql('audit_logs restore', "select action, resource_type, resource_id, details from audit_logs where details->>'restoredFromDeletedRecord' = $1", [String(ids.DR1)]);
    r = await A.post(`/api/deleted-records/${ids.DR1}/restore`, {});
    log('POST restore again ->', excerpt(r, 120));
  });

  const restored = await snapshot('AFTER RESTORE');

  await step('5. Consistency diff before vs after restore', async () => {
    const cmp = (name, a, b) => log(`  ${name}: before=${a.length} after=${b.length} ${a.length === b.length ? 'OK' : 'MISMATCH'}`);
    cmp('reservations', before.reservations, restored.reservations.filter(x => x.id !== ids.Rghost));
    cmp('documents', before.documents, restored.documents);
    cmp('driverAssignments', before.driverAssignments, restored.driverAssignments);
    cmp('expenses', before.expenses, restored.expenses);
    cmp('blacklist', before.blacklist, restored.blacklist);
    cmp('apkChanges', before.apkChanges, restored.apkChanges);
    log('  transports before:', JSON.stringify(before.transports));
    log('  transports after :', JSON.stringify(restored.transports));
    log('  fine before:', JSON.stringify(before.fines), 'after:', JSON.stringify(restored.fines));
    log('  ghost reservation now on restored vehicle:', JSON.stringify(restored.reservations.find(x => x.id === ids.Rghost)));
    let r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(21)}&endDate=${addDays(23)}`);
    log('check-conflicts after restore (R5 + ghost both booked) -> count', r.json?.length, (r.json || []).map(x => x.id));
    r = await A.get(`/api/vehicles/${V}`);
    log('GET vehicle after restore ->', r.status, 'plate', r.json?.licensePlate, 'barcode', r.json?.barcode, 'status', r.json?.availabilityStatus);
    await sql('sequence check', "select last_value from vehicles_id_seq");
  });

  await step('6. Restore blocked by barcode collision (delete again, new vehicle claims the barcode)', async () => {
    const [vrow] = await q('select barcode from vehicles where id=$1', [V]);
    let r = await A.del(`/api/vehicles/${V}`, { confirmLicensePlate: ids.Vplate });
    log('DELETE vehicle again ->', r.status);
    const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 order by id desc limit 1", [V]);
    ids.DR2 = dr[0].id;
    r = await A.post('/api/vehicles', { licensePlate: `AU-9BC-${ids.ts}`, brand: 'AUDIT-P9', model: 'BarcodeTaker', barcode: vrow.barcode });
    log(`POST new vehicle with barcode ${vrow.barcode} ->`, excerpt(r, 100)); ids.X = r.json?.id;
    r = await A.post(`/api/deleted-records/${ids.DR2}/restore`, {});
    log('POST restore with barcode taken ->', excerpt(r, 300));
    await sql('deleted_records DR2', 'select restored_at from deleted_records where id=$1', [ids.DR2]);
    await sql('vehicle exists?', 'select id from vehicles where id=$1', [V]);
    r = await A.patch(`/api/vehicles/${ids.X}`, { barcode: null });
    log('release barcode ->', r.status);
    r = await A.post(`/api/deleted-records/${ids.DR2}/restore`, {});
    log('POST restore after release ->', excerpt(r, 120));
    await sql('vehicle back', 'select id, license_plate, barcode from vehicles where id=$1', [V]);
    await sql('reservations back', 'select count(*)::int as n from reservations where vehicle_id=$1', [V]);
  });

  fs.writeFileSync(path.join(__dirname, 'p9-ids.json'), JSON.stringify(ids, null, 2));
  log(`health end: ${await health()}`);
  writeOut('p9-out-02.txt');
  await pool.end();
}

main().catch(async (e) => { log('FATAL ' + (e.stack || e)); writeOut('p9-out-02.txt'); await pool.end(); process.exit(1); });

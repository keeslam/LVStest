// Phase 9 part 3: bulk import success paths (plates + CSV, duplicates, re-import,
// date parsing), blacklist duplicate-add race, reservation date edits that
// bypass the conflict check, rapid concurrent booking, APK date-change confirm
// flow, deleting a vehicle that is currently picked up, audit-log duplicates.
'use strict';
const fs = require('fs');
const path = require('path');
const { getSession, log, excerpt, step, sql, q, pool, writeOut, health } = require('./p9-lib.cjs');

const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'p9-ids.json'), 'utf8'));
const today = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(today);
const V = ids.V, W = ids.W;
const T = ids.ts % 100000;

async function main() {
  log(`health: ${await health()} today=${TODAY}`);
  const A = await getSession('admin', 'admin', 'admin123');

  await step('A. bulk-import-plates: success, duplicates inside one batch, re-import, bad entries', async () => {
    const plates = [`AU-9P${T}-A`, `au-9p${T}-a`, `AU 9P${T} A`, 'AU-901-X', 12345, '', `AU-9P${T}-B`];
    let r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: plates });
    log('POST bulk-import-plates ->', r.status, 'imported:', (r.json?.imported || []).map(x => x.licensePlate + '#' + x.vehicle?.id), 'failed:', JSON.stringify(r.json?.failed));
    ids.bulkA = r.json?.imported?.[0]?.vehicle?.id;
    await sql('imported rows', "select id, license_plate, brand, model, barcode, created_by from vehicles where license_plate ilike $1 order by id", [`AU-9P${T}%`]);
    r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: [`AU-9P${T}-A`, `AU-9P${T}-B`] });
    log('re-import same plates ->', r.status, 'imported:', r.json?.imported?.length, 'failed:', JSON.stringify(r.json?.failed));
    r = await A.post('/api/vehicles', { licensePlate: `au9p${T}a`, brand: 'AUDIT-P9', model: 'PlateVariant' });
    log('POST /api/vehicles with unformatted variant of an imported plate (VC-001 re-check) ->', excerpt(r, 80));
    if (r.status === 201) ids.variant = r.json.id;
  });

  await step('B. bulk-import-csv: success + date handling + bad rows', async () => {
    const vehicles = [
      { licensePlate: `AU-9C${T}-A`, brand: 'AUDIT-P9', model: 'CsvA', apkDate: '05-03-2027', companyDate: '46000', productionDate: '2020', gps: 'ja', registeredTo: 'opnaam', company: 'ja' },
      { licensePlate: `AU-9C${T}-B`, brand: 'AUDIT-P9', model: 'CsvB', apkDate: '2026-02-30' },
      { licensePlate: `AU-9C${T}-C`, brand: 'AUDIT-P9', model: 'CsvC', apkDate: '31-12-2026' },
      { licensePlate: `AU-9C${T}-D`, brand: 'AUDIT-P9', model: 'CsvD', company: 123 },
      { licensePlate: `AU-9C${T}-A`, brand: 'AUDIT-P9', model: 'CsvDup' },
      { licensePlate: `AU-9C${T}-E`, brand: 'AUDIT-P9', model: 'CsvE', apkDate: '2027-03-05T00:00:00.000Z', productionDate: 'garbage' },
      { brand: 'NoPlate' },
    ];
    let r = await A.post('/api/vehicles/bulk-import-csv', { vehicles });
    log('POST bulk-import-csv ->', r.status, 'imported:', (r.json?.imported || []).map(x => x.licensePlate), 'failed:', JSON.stringify(r.json?.failed));
    await sql('csv rows', "select license_plate, model, apk_date, company_date, production_date, gps, registered_to, company from vehicles where license_plate like $1 order by id", [`AU-9C${T}%`]);
    r = await A.get('/api/vehicles/apk-expiring');
    log('apk-expiring contains CsvC (apk "31-12-2026" -> ?):', !!(r.json || []).find(x => x.licensePlate === `AU-9C${T}-C`));
  });

  await step('C. Blacklist duplicate-add race (10 parallel)', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => A.post(`/api/vehicles/${V}/blacklist`, { customerId: ids.custA, reason: 'AUDIT-P9 race' })));
    log('statuses:', results.map(r => r.status), 'bodies:', results.map(r => (r.text || '').slice(0, 60)).filter((v, i, a) => a.indexOf(v) === i));
    await sql('blacklist rows', 'select id, customer_id, reason from vehicle_customer_blacklist where vehicle_id=$1 and customer_id=$2', [V, ids.custA]);
    const r = await A.get(`/api/vehicles/${V}/blacklist`);
    log('GET blacklist ->', r.status, 'count', r.json?.length);
  });

  await step('D. Reservation date edits that create conflicts (all edit routes) vs check-conflicts', async () => {
    // fixtures: R5 (+20..+25) and R6 (+30..+33) on V, both booked. Extend R5 over R6 via a partial PATCH.
    const R5 = ids.R5, R6 = ids.R6;
    await sql('R5/R6 before', 'select id, start_date, end_date, status from reservations where id = any($1) order by id', [[R5, R6]]);
    let r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(20)}&endDate=${addDays(31)}&excludeReservationId=${R5}`);
    log(`check-conflicts R5 extended to ${addDays(31)} -> ${r.status} conflicts: ${(r.json || []).map(x => x.id)}`);
    r = await A.patch(`/api/reservations/${R5}`, { endDate: addDays(31) });
    log('PATCH /:id {endDate} only ->', r.status, 'endDate', r.json?.endDate, r.status >= 400 ? r.text.slice(0, 120) : '');
    await sql('R5 after endDate-only PATCH', 'select id, start_date, end_date from reservations where id=$1', [R5]);
    r = await A.patch(`/api/reservations/${R5}`, { endDate: addDays(25) });
    log('reset R5 endDate ->', r.status);
    r = await A.patch(`/api/reservations/${R6}`, { startDate: addDays(24) });
    log('PATCH /:id {startDate} only on R6 (into R5) ->', r.status, 'startDate', r.json?.startDate);
    await sql('R5/R6 overlap now', 'select id, start_date, end_date from reservations where id = any($1) order by id', [[R5, R6]]);
    r = await A.patch(`/api/reservations/${R6}`, { startDate: addDays(30) });
    log('reset R6 ->', r.status);
    r = await A.patch(`/api/reservations/${R5}`, { vehicleId: V, startDate: addDays(20), endDate: addDays(31) });
    log('PATCH /:id with vehicleId+startDate+endDate (conflict check active) ->', excerpt(r, 100));
    r = await A.patch(`/api/reservations/${R5}/basic`, { vehicleId: V, customerId: ids.custA, startDate: addDays(20), endDate: addDays(31), status: 'booked', type: 'standard' });
    log('PATCH /basic extended ->', excerpt(r, 100));
    r = await A.patch(`/api/reservations/${R5}`, { startDate: addDays(20), endDate: addDays(31) });
    log('PATCH /:id startDate+endDate WITHOUT vehicleId ->', r.status, 'endDate', r.json?.endDate);
    r = await A.patch(`/api/reservations/${R5}`, { endDate: addDays(25) });
    log('reset ->', r.status);
    // time-based same-day turnover: R6 starts 09:00; R5 ends same day, check with endTime 18:00 vs PATCH without times
    r = await A.patch(`/api/reservations/${R6}`, { startTime: '09:00' });
    log('R6 startTime 09:00 ->', r.status);
    r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(20)}&endDate=${addDays(30)}&endTime=18:00&excludeReservationId=${R5}`);
    log('check-conflicts R5 end=+30 18:00 vs R6 start 09:00 ->', (r.json || []).map(x => x.id));
    r = await A.patch(`/api/reservations/${R5}`, { vehicleId: V, startDate: addDays(20), endDate: addDays(30), endTime: '18:00' });
    log('PATCH /:id same-day with endTime 18:00 ->', excerpt(r, 80));
    r = await A.patch(`/api/reservations/${R5}`, { vehicleId: V, startDate: addDays(20), endDate: addDays(30) });
    log('PATCH /:id same-day WITHOUT endTime (stored endTime?) ->', r.status, 'endTime', r.json?.endTime);
    await sql('R5 final', 'select id, start_date, end_date, end_time from reservations where id=$1', [R5]);
    r = await A.patch(`/api/reservations/${R5}`, { endDate: addDays(25), endTime: null });
    r = await A.patch(`/api/reservations/${R6}`, { startTime: null });
    // status route: mark completed sets endDate=today on a future reservation (RS-005), then reversal
    r = await A.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(20)}&endDate=${addDays(25)}`);
    log('check-conflicts +20..+25 (R5 + ghost 3370) ->', (r.json || []).map(x => x.id));
  });

  await step('E. Rapid concurrent booking of W (5 parallel, same period)', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => A.post('/api/reservations', { vehicleId: W, customerId: ids.custA, startDate: addDays(50), endDate: addDays(52), status: 'booked' })));
    log('statuses:', results.map(r => r.status));
    await sql('W bookings', 'select count(*)::int as n from reservations where vehicle_id=$1 and start_date=$2 and deleted_at is null', [W, addDays(50)]);
  });

  await step('F. APK date-change confirm/dismiss flow', async () => {
    const [c] = await q("insert into apk_date_changes (vehicle_id, previous_apk_date, new_apk_date, status) values ($1,null,'2027-11-11','pending') returning id", [W]);
    let r = await A.get('/api/apk-date-changes');
    log('GET pending ->', r.status, 'contains fixture:', !!(r.json || []).find(x => x.id === c.id));
    r = await A.post(`/api/apk-date-changes/${c.id}/confirm`, {});
    log('confirm ->', excerpt(r, 120));
    await sql('W apk after confirm', 'select apk_date from vehicles where id=$1', [W]);
    r = await A.post(`/api/apk-date-changes/${c.id}/confirm`, {});
    log('confirm again ->', excerpt(r, 100));
    r = await A.post(`/api/apk-date-changes/${c.id}/dismiss`, {});
    log('dismiss after confirm ->', excerpt(r, 100));
    r = await A.get('/api/apk-date-changes/scan-status');
    log('scan-status ->', excerpt(r, 120));
  });

  await step('G. Delete a vehicle whose reservation is picked_up (customer has the car)', async () => {
    let r = await A.post('/api/reservations', { vehicleId: W, customerId: ids.custB, startDate: TODAY, endDate: addDays(2), status: 'booked' });
    const RW = r.json?.id; log('POST booking on W ->', r.status, RW);
    r = await A.post(`/api/reservations/${RW}/pickup`, { contractNumber: `AUDIT-P9-W-${ids.ts}`, pickupMileage: 100, fuelLevelPickup: 'full' });
    log('pickup ->', r.status);
    r = await A.get(`/api/vehicles/${W}/delete-impact`);
    log('delete-impact W ->', excerpt(r, 200));
    const [wrow] = await q('select license_plate from vehicles where id=$1', [W]);
    r = await A.del(`/api/vehicles/${W}`, { confirmLicensePlate: wrow.license_plate });
    log('DELETE W while picked_up ->', excerpt(r, 120));
    await sql('picked-up reservation after vehicle delete', 'select id from reservations where id=$1', [RW]);
    const logs = await sql('audit_logs for W delete (all rows)', "select id, action, details from audit_logs where resource_type='vehicle' and resource_id=$1 and action='vehicle.delete' order by id", [String(W)]);
    log('vehicle.delete audit rows for one DELETE:', logs.length);
    const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 order by id desc limit 1", [W]);
    r = await A.post(`/api/deleted-records/${dr[0].id}/restore`, {});
    log('restore W ->', r.status);
    await sql('W + reservation back', 'select v.id, v.availability_status, r.status from vehicles v join reservations r on r.vehicle_id=v.id where r.id=$1', [RW]);
    r = await A.post(`/api/reservations/${RW}/return`, { returnMileage: 120, fuelLevelReturn: 'full' });
    log('return after restore ->', r.status);
  });

  fs.writeFileSync(path.join(__dirname, 'p9-ids.json'), JSON.stringify(ids, null, 2));
  log(`health end: ${await health()}`);
  writeOut('p9-out-03.txt');
  await pool.end();
}

main().catch(async (e) => { log('FATAL ' + (e.stack || e)); writeOut('p9-out-03.txt'); await pool.end(); process.exit(1); });

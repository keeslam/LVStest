'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
(async () => {
  const s = await admin('c17');
  const mk = async (tag) => {
    const plate = 'P36Z' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'Z', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000, apkDate: '2027-01-01' });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return { id: rr.json.id, plate };
  };
  let r;
  const vMain = await mk('M'), vOther = await mk('O');
  // a past (completed) rental so the vehicle has a reservation + driver assignment but no live booking
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: vMain.id, startDate: d(-40), endDate: d(-35), type: 'standard', status: 'completed', totalPrice: 100, notes: 'AUDIT-P36C z110' });
  const RES = r.json.id;
  log('110 past rental', [r.status, RES, await q('select status from reservations where id=$1', [RES])]);
  const drivers = await q('select id from drivers order by id limit 1');
  r = await s.patch('/api/reservations/' + RES, { driverId: drivers[0].id });
  log('110 driver', [r.status, await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES])]);
  await q("insert into apk_date_changes (vehicle_id, previous_apk_date, new_apk_date, status, detected_at) values ($1,'2026-01-01','2027-01-01','pending', now())", [vMain.id]);
  log('110 apk before', await q('select id,vehicle_id,previous_apk_date,new_apk_date,status from apk_date_changes where vehicle_id=$1', [vMain.id]));
  const fine = await q("insert into fines (license_plate, vehicle_id, reservation_id, customer_id, offence_at, reference, description, amount, total_amount, status) values ($1,$2,$3,179, now(), $4, 'AUDIT-P36C boete', 50, 50, 'new') returning id,vehicle_id,reservation_id", [vMain.plate, vMain.id, RES, 'AUDIT-P36C-Z' + RUN]);
  log('110 fine before', fine);
  // a transport on ANOTHER vehicle that uses vMain as its spare, on a past day, then completed
  r = await s.post('/api/transports', { vehicleId: vOther.id, transportType: 'swap', scheduledDate: d(-10), spareRequired: true, relatedVehicleId: vMain.id, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C z110tr' });
  const T = r.json && r.json.id;
  log('110 transport', [r.status, T, r.text.slice(0, 160)]);
  const tBefore = (await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]))[0];
  log('110 transport before', tBefore);
  const spareRes = tBefore && tBefore.spare_reservation_id;
  if (spareRes) await q("update reservations set status='completed' where id=$1", [spareRes]);
  r = await s.get('/api/vehicles/' + vMain.id + '/delete-impact');
  log('110 delete-impact', [r.status, r.text.slice(0, 700)]);
  r = await s.del('/api/vehicles/' + vMain.id, { confirmLicensePlate: vMain.plate });
  log('110 DELETE', [r.status, r.text.slice(0, 250)]);
  log('110 after delete: apk', await q('select id from apk_date_changes where vehicle_id=$1', [vMain.id]));
  log('110 after delete: driver assignments', await q('select id from reservation_driver_assignments where reservation_id=$1', [RES]));
  log('110 after delete: fine', await q('select id,vehicle_id,reservation_id from fines where id=$1', [fine[0].id]));
  log('110 after delete: transport', await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]));
  const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc limit 1", [vMain.id]);
  if (dr[0]) {
    r = await s.post('/api/deleted-records/' + dr[0].id + '/restore', {});
    log('110 restore', [r.status, r.text.slice(0, 200)]);
    log('110 after restore: apk', await q('select id,vehicle_id,previous_apk_date,new_apk_date,status from apk_date_changes where vehicle_id=$1', [vMain.id]));
    log('110 after restore: driver assignments', await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES]));
    log('110 after restore: fine', await q('select id,vehicle_id,reservation_id from fines where id=$1', [fine[0].id]));
    log('110 after restore: transport (expect identical to before)', await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]));
    log('110 extra placeholders?', await q("select id,placeholder_spare,status,deleted_at from reservations where replacement_for_transport_id=$1 order by id", [T]));
  } else log('110 no deleted_records row');
  await pool.end();
})();

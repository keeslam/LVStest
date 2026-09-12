'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-Q' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c16');
  const mk = async (tag) => {
    const plate = 'P36Q' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'Q', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000, apkDate: '2027-01-01' });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return { id: rr.json.id, plate };
  };
  let r;

  // --- BUG-118 second half: block before the rental start on a picked-up rental ---
  const vP = await mk('P');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: vP.id, startDate: d(-2), endDate: d(30), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C q118' });
  const RENT = r.json.id;
  await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-2), pickupMileage: 1000, fuelLevelPickup: 'full' });
  r = await s.post('/api/reservations/maintenance-with-spare', { maintenanceData: { vehicleId: vP.id, startDate: d(-6), endDate: d(-5), type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: 'AUDIT-P36C past block' }, conflictingReservations: [], spareVehicleAssignments: [] });
  const PB = r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id;
  log('118b past block', [r.status, PB, r.text.slice(0, 160)]);
  if (PB) {
    // give it a placeholder via the portal-style helper: create a TBD replacement bound to the rental
    const ph = await q("insert into reservations (vehicle_id, customer_id, start_date, end_date, type, status, placeholder_spare, replacement_for_reservation_id, affected_rental_id, notes) values (null, 179, $1, $2, 'replacement', 'booked', true, $3, $3, 'AUDIT-P36C ph118b') returning id", [d(-6), d(-5), RENT]);
    log('118b placeholder seeded', ph);
    r = await s.del('/api/reservations/' + PB);
    log('118b delete past block', [r.status, r.text.slice(0, 140)]);
    log('118b placeholder after (expect deleted/cancelled)', await q('select id,status,deleted_at from reservations where id=$1', [ph[0].id]));
  }

  // --- BUG-110 full round trip ---
  const vMain = await mk('M'), vOther = await mk('O'), vSpare = await mk('S');
  const base = { customerId: 179, type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C q110' };
  r = await s.post('/api/reservations', { ...base, vehicleId: vMain.id, startDate: d(350), endDate: d(355) });
  const RES = r.json.id;
  const drivers = await q('select id from drivers order by id limit 1');
  r = await s.patch('/api/reservations/' + RES, { driverId: drivers[0].id });
  log('110 driver', [r.status, await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES])]);
  await q("insert into apk_date_changes (vehicle_id, previous_apk_date, new_apk_date, status, detected_at) values ($1,'2026-01-01','2027-01-01','pending', now())", [vMain.id]);
  const apkBefore = await q('select id,vehicle_id,new_apk_date from apk_date_changes where vehicle_id=$1', [vMain.id]);
  log('110 apk rows before', apkBefore);
  const fine = await q("insert into fines (license_plate, vehicle_id, reservation_id, customer_id, offence_at, reference, description, amount, total_amount, status) values ($1,$2,$3,179, now(), $4, 'AUDIT-P36C boete', 50, 50, 'new') returning id,vehicle_id,reservation_id", [vMain.plate, vMain.id, RES, 'AUDIT-P36C-' + RUN]);
  log('110 fine before', fine);
  // a transport of ANOTHER vehicle that uses vMain as the spare, on a free day
  r = await s.post('/api/transports', { vehicleId: vOther.id, transportType: 'swap', scheduledDate: d(360), spareRequired: true, relatedVehicleId: vMain.id, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C q110tr' });
  log('110 other transport', [r.status, r.json && r.json.id, r.text.slice(0, 180)]);
  const T = r.json && r.json.id;
  const tBefore = T ? (await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]))[0] : null;
  log('110 transport before', tBefore);
  r = await s.get('/api/vehicles/' + vMain.id + '/delete-impact');
  log('110 delete-impact', [r.status, r.text.slice(0, 600)]);
  await s.patch('/api/reservations/' + RES + '/status', { status: 'cancelled' });
  r = await s.del('/api/vehicles/' + vMain.id, { confirmLicensePlate: vMain.plate });
  log('110 DELETE', [r.status, r.text.slice(0, 250)]);
  log('110 after delete: apk', await q('select id from apk_date_changes where vehicle_id=$1', [vMain.id]));
  log('110 after delete: driver assignments', await q('select id from reservation_driver_assignments where reservation_id=$1', [RES]));
  log('110 after delete: fine', await q('select id,vehicle_id,reservation_id from fines where id=$1', [fine[0].id]));
  log('110 after delete: other transport', T ? await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]) : null);
  const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc limit 1", [vMain.id]);
  if (dr[0]) {
    r = await s.post('/api/deleted-records/' + dr[0].id + '/restore', {});
    log('110 restore', [r.status, r.text.slice(0, 200)]);
    log('110 after restore: apk', await q('select id,vehicle_id,new_apk_date from apk_date_changes where vehicle_id=$1', [vMain.id]));
    log('110 after restore: driver assignments', await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES]));
    log('110 after restore: fine', await q('select id,vehicle_id,reservation_id from fines where id=$1', [fine[0].id]));
    log('110 after restore: other transport', T ? await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T]) : null);
  } else log('110 no deleted_records row');
  await pool.end();
})();

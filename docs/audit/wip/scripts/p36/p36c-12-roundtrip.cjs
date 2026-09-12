'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
(async () => {
  const s = await admin('c12');
  const ids = loadIds();
  const CA = ids.customers.A;
  const base = { customerId: CA, notes: 'AUDIT-P36C rt', type: 'standard', totalPrice: 100 };
  const mk = async (tag) => {
    const plate = 'P36R' + RUN + tag;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'RT', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return { id: r.json.id, plate };
  };
  let r;

  // --- BUG-158: concurrent assign-vehicle on a placeholder ---
  const vT = await mk('T'), vA = await mk('A1'), vB = await mk('B1');
  r = await s.post('/api/transports', { vehicleId: vT.id, transportType: 'swap', scheduledDate: d(330), spareRequired: true, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t158' });
  const T = r.json && r.json.id;
  const ph = await q('select id from reservations where replacement_for_transport_id=$1 and placeholder_spare=true', [T]);
  log('158 placeholder', [r.status, T, ph]);
  if (ph[0]) {
    const s2 = await admin('c12b');
    const [x, y] = await Promise.all([
      s.post('/api/placeholder-reservations/' + ph[0].id + '/assign-vehicle', { vehicleId: vA.id }),
      s2.post('/api/placeholder-reservations/' + ph[0].id + '/assign-vehicle', { vehicleId: vB.id }),
    ]);
    log('158 concurrent assign (expect exactly one 200)', [[x.status, x.text.slice(0, 110)], [y.status, y.text.slice(0, 110)]]);
    log('158 final row', await q('select id,vehicle_id,placeholder_spare,status from reservations where id=$1', [ph[0].id]));
  }

  // --- BUG-110: delete/restore round trip ---
  const vMain = await mk('M'), vSpare = await mk('SP'), vOther = await mk('OT');
  r = await s.post('/api/reservations', { ...base, vehicleId: vMain.id, startDate: d(350), endDate: d(355) });
  const RES = r.json.id;
  const drivers = await q('select id from drivers order by id limit 1');
  if (drivers[0]) {
    r = await s.patch('/api/reservations/' + RES, { driverId: drivers[0].id });
    log('110 driver assigned', [r.status, await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES])]);
  }
  // apk change row
  await q("insert into apk_date_changes (vehicle_id, old_date, new_date, detected_at, status) values ($1,'2026-01-01','2027-01-01', now(), 'pending')", [vMain.id]).catch(async (e) => {
    const cols = await q("select column_name,is_nullable from information_schema.columns where table_name='apk_date_changes'");
    log('110 apk_date_changes cols', cols);
  });
  const apk = await q('select id from apk_date_changes where vehicle_id=$1', [vMain.id]);
  log('110 apk rows', apk);
  // fine referencing the vehicle + reservation
  const fineCols = await q("select column_name, is_nullable, data_type from information_schema.columns where table_name='fines' order by ordinal_position");
  log('110 fines cols', fineCols.map(c => c.column_name).join(','));
  // transport of ANOTHER vehicle whose spare is our vehicle
  r = await s.post('/api/transports', { vehicleId: vOther.id, transportType: 'swap', scheduledDate: d(352), spareRequired: true, relatedVehicleId: vMain.id, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t110' });
  log('110 other-vehicle transport with our vehicle as spare', [r.status, r.text.slice(0, 200)]);
  const T110 = r.json && r.json.id;
  const t110before = T110 ? (await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T110]))[0] : null;
  log('110 transport before', t110before);
  r = await s.get('/api/vehicles/' + vMain.id + '/delete-impact');
  log('110 delete-impact', [r.status, r.text.slice(0, 500)]);
  // cancel our own booking so the delete is allowed (B-14)
  await s.patch('/api/reservations/' + RES + '/status', { status: 'cancelled' });
  r = await s.del('/api/vehicles/' + vMain.id, { confirmLicensePlate: vMain.plate });
  log('110 DELETE', [r.status, r.text.slice(0, 250)]);
  log('110 after delete: apk rows', await q('select id from apk_date_changes where vehicle_id=$1', [vMain.id]));
  log('110 after delete: driver assignments', await q('select id from reservation_driver_assignments where reservation_id=$1', [RES]));
  log('110 after delete: other transport', T110 ? await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T110]) : null);
  const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc limit 1", [vMain.id]);
  if (dr[0]) {
    r = await s.post('/api/deleted-records/' + dr[0].id + '/restore', {});
    log('110 restore', [r.status, r.text.slice(0, 200)]);
    log('110 after restore: apk rows', await q('select id,vehicle_id from apk_date_changes where vehicle_id=$1', [vMain.id]));
    log('110 after restore: driver assignments', await q('select id,driver_id from reservation_driver_assignments where reservation_id=$1', [RES]));
    log('110 after restore: other transport', T110 ? await q('select id,vehicle_id,related_vehicle_id,spare_reservation_id,status from vehicle_transports where id=$1', [T110]) : null);
  } else log('110 no deleted_records row', dr);

  // --- BUG-150: purge route + document folder on plate rename ---
  r = await s.get('/api/deleted-records');
  log('150 deleted-records keys', [r.status, r.json && r.json[0] ? Object.keys(r.json[0]) : null]);
  for (const path of ['/api/deleted-records/purge', '/api/deleted-records/1/purge']) {
    const rr = await s.del(path, {});
    log('150 DELETE ' + path, [rr.status, rr.text.slice(0, 140)]);
  }
  await pool.end();
})();

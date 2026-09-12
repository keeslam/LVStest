'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
(async () => {
  const s = await admin('c02');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C veh', type: 'standard', totalPrice: 100 };

  // fresh vehicle for delete/restore
  let r = await s.post('/api/vehicles', { licensePlate: 'P36C-DEL1', brand: 'AUDIT-P36C', model: 'Del', vehicleType: 'Personenauto', chassisNumber: 'CHP36CDEL1', currentMileage: 1000 });
  log('108 create vehicle', [r.status, r.json && r.json.id]);
  const VD = r.json.id;
  r = await s.post('/api/reservations', { ...base, vehicleId: VD, startDate: d(700), endDate: d(705) });
  log('108 booked reservation', [r.status, r.json && r.json.id]);
  const RD = r.json && r.json.id;
  r = await s.get('/api/vehicles/' + VD + '/delete-impact');
  log('108 delete-impact', [r.status, r.text.slice(0, 500)]);
  r = await s.del('/api/vehicles/' + VD, { confirmLicensePlate: 'P36C-DEL1' });
  log('108 DELETE vehicle with booked res (B-14 expects refusal)', [r.status, r.text.slice(0, 300)]);
  const deleted = r.status === 200;
  if (deleted) {
    r = await s.get(`/api/reservations/check-conflicts?vehicleId=${VD}&startDate=${d(701)}&endDate=${d(703)}`);
    log('108 check-conflicts on deleted vehicle', [r.status, r.text.slice(0, 200)]);
    r = await s.post('/api/reservations', { ...base, vehicleId: VD, customerId: CB, startDate: d(701), endDate: d(703) });
    log('108 POST reservation on deleted vehicle (expect 404/409)', [r.status, r.text.slice(0, 200)]);
    const dr = await q("select id from deleted_records where entity_type='vehicle' and (entity_id=$1 or (data->'vehicle'->>'id')::int=$1) order by id desc limit 1", [VD]);
    log('108 deleted_records row', dr);
    if (dr[0]) {
      r = await s.post('/api/deleted-records/' + dr[0].id + '/restore', {});
      log('108 restore', [r.status, r.text.slice(0, 250)]);
    }
    log('108 overlapping booked pairs after', await q("select id,status,start_date,end_date,deleted_at from reservations where vehicle_id=$1 order by id", [VD]));
  } else {
    // cancel then delete to see restore path
    await s.patch('/api/reservations/' + RD + '/status', { status: 'cancelled' });
    r = await s.del('/api/vehicles/' + VD, { confirmLicensePlate: 'P36C-DEL1' });
    log('108 DELETE after cancelling reservation', [r.status, r.text.slice(0, 200)]);
    if (r.status === 200) {
      r = await s.post('/api/reservations', { ...base, vehicleId: VD, customerId: CB, startDate: d(701), endDate: d(703) });
      log('108 POST reservation on trashed vehicle (expect 404/409)', [r.status, r.text.slice(0, 200)]);
      r = await s.get(`/api/reservations/check-conflicts?vehicleId=${VD}&startDate=${d(701)}&endDate=${d(703)}`);
      log('108 check-conflicts on trashed vehicle', [r.status, r.text.slice(0, 160)]);
    }
  }

  // --- BUG-123 bulk-import-plates ---
  r = await s.post('/api/vehicles/bulk-import-plates', { licensePlates: ['P36C-BP1', '', '   ', null, 12345, { licensePlate: 'x' }] });
  log('123 bulk-import-plates junk', [r.status, r.text.slice(0, 700)]);
  log('123 empty-plate vehicles in db', await q("select id,license_plate from vehicles where trim(license_plate)=''"));

  // --- BUG-125 barcode client field ---
  r = await s.post('/api/vehicles', { licensePlate: 'P36C-BC1', brand: 'AUDIT-P36C', model: 'Bc', vehicleType: 'Personenauto', chassisNumber: 'CHP36CBC1', barcode: 'VEH-000001-R9' });
  log('125 POST vehicle with barcode', [r.status, r.json && { id: r.json.id, barcode: r.json.barcode }, r.text.slice(0, 200)]);
  const VB = r.json && r.json.id;
  if (VB) {
    r = await s.patch('/api/vehicles/' + VB, { barcode: 'P36C-A' });
    log('125 PATCH barcode to another plate (expect 400/ignored)', [r.status, r.json && r.json.barcode, r.text.slice(0, 200)]);
    log('125 db barcode', await q('select id,license_plate,barcode from vehicles where id=$1', [VB]));
  }

  // --- BUG-149 service interval ---
  const VA = ids.vehicles['P36C-A'];
  r = await s.patch('/api/vehicles/' + VA, { serviceIntervalKm: -5, serviceIntervalMonths: 0 });
  log('149 PATCH negative intervals (expect 400)', [r.status, r.text.slice(0, 250)]);
  r = await s.patch('/api/vehicles/' + VA, { lastServiceDate: d(365), lastServiceMileage: 900000 });
  log('149 PATCH future lastServiceDate (expect 400)', [r.status, r.text.slice(0, 250)]);
  log('149 db', await q('select id,service_interval_km,service_interval_months,last_service_date,last_service_mileage from vehicles where id=$1', [VA]));

  // --- BUG-146 warning in response ---
  const VW = ids.vehicles['P36C-F'];
  r = await s.post('/api/reservations', { ...base, vehicleId: VW, startDate: d(3), endDate: d(6) });
  log('146 booked res', [r.status, r.json && r.json.id]);
  r = await s.patch('/api/vehicles/' + VW, { availabilityStatus: 'needs_fixing' });
  log('146 PATCH needs_fixing -> warning key?', [r.status, r.json ? Object.keys(r.json).filter(k => /warn|message/i.test(k)) : null, r.text.slice(0, 300)]);
  await pool.end();
})();

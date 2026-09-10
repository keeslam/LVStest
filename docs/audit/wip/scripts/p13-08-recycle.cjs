// Phase 13 test 12: recycle bin races - parallel delete of one vehicle from two sessions,
// delete || restore, delete || pickup, restore || re-create same plate.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-08-recycle');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const t = L.today();
  const recs = (vid) => L.q('select id, entity_id, label, related_counts, deleted_by, restored_at from deleted_records where entity_type=$1 and entity_id=$2 order by id', ['vehicle', vid]);
  const del = (s, vid, plate) => ({ sess: s, method: 'DELETE', path: `/api/vehicles/${vid}`, body: { confirmLicensePlate: plate }, label: 'delete ' + s.name });

  // 12a parallel DELETE of the same vehicle from two sessions
  {
    const plate = 'AU-13R1-X';
    const v = await L.ensureVehicle(admin, ids, 'r1', plate, 'P13-r1');
    await L.createReservation(admin, { vehicleId: v, customerId: ids.c1, startDate: '2030-06-01', endDate: '2030-06-03', notes: 'AUDIT-P13 r1' });
    const res = await L.burst([del(admin, v, plate), del(mgr, v, plate)]);
    rep.step('12a parallel DELETE /api/vehicles/:id from two sessions', { res: L.brief(res, 160), dist: L.dist(res), vehicleRow: await L.vehRow(v), deletedRecords: await recs(v), reservationsLeft: (await L.q('select count(*)::int n from reservations where vehicle_id=$1', [v]))[0].n, auditRows: await L.q("select id, action, status, details->>'reason' as reason from audit_logs where resource_type='vehicle' and resource_id=$1 order by id", [String(v)]) });
    delete ids.r1;
  }
  // 12b vehicle deleted -> record R; then restore(R) || DELETE(vehicle) 5 ms later; then the reverse order
  {
    const plate = 'AU-13R2-X';
    const v = await L.ensureVehicle(admin, ids, 'r2', plate, 'P13-r2');
    await L.createReservation(admin, { vehicleId: v, customerId: ids.c2, startDate: '2030-06-10', endDate: '2030-06-12', notes: 'AUDIT-P13 r2' });
    const d0 = await admin.del(`/api/vehicles/${v}`, { confirmLicensePlate: plate });
    const [rec] = await recs(v);
    const res1 = await L.burst([
      { sess: admin, method: 'POST', path: `/api/deleted-records/${rec.id}/restore`, label: 'restore', delayMs: 0 },
      { ...del(mgr, v, plate), delayMs: 5 },
    ]);
    const s1 = { vehicle: await L.vehRow(v), records: await recs(v), reservations: (await L.q('select count(*)::int n from reservations where vehicle_id=$1', [v]))[0].n };
    // reverse: whatever state we are in, try delete first then restore of the newest record 5 ms later
    const all = await recs(v);
    const newest = all[all.length - 1];
    const res2 = await L.burst([
      { ...del(admin, v, plate), delayMs: 0 },
      { sess: mgr, method: 'POST', path: `/api/deleted-records/${newest.id}/restore`, label: 'restore ' + newest.id, delayMs: 5 },
    ]);
    const s2 = { vehicle: await L.vehRow(v), records: await recs(v), reservations: (await L.q('select count(*)::int n from reservations where vehicle_id=$1', [v]))[0].n };
    rep.step('12b restore || delete, then delete || restore', { initialDelete: d0.status, round1: { res: L.brief(res1, 160), dist: L.dist(res1), state: s1 }, round2: { res: L.brief(res2, 160), dist: L.dist(res2), state: s2 } });
  }
  // 12c DELETE vehicle || pickup of its reservation (fresh vehicle per round)
  {
    const attempts = [];
    for (const [k, delay] of [0, 15, 30].entries()) {
      const plate = `AU-13C${k}-X`;
      const v = await L.ensureVehicle(admin, ids, 'r3c' + k, plate, 'P13-r3c' + k);
      const R = await L.createReservation(admin, { vehicleId: v, customerId: ids.c1, startDate: t, endDate: L.addDays(t, 2), notes: 'AUDIT-P13 r3c' + k });
      const res = await L.burst([
        { sess: mgr, method: 'POST', path: `/api/reservations/${R.id}/pickup`, body: { contractNumber: `AUDIT-P13-r3c${k}-${Date.now()}`, pickupMileage: 1500, fuelLevelPickup: 'full' }, label: 'pickup', delayMs: 0 },
        { ...del(admin, v, plate), delayMs: delay },
      ]);
      attempts.push({ deleteDelayMs: delay, res: L.brief(res, 200), dist: L.dist(res), vehicleExists: !!(await L.vehRow(v)), reservation: await L.resRow(R.id), records: (await recs(v)).length, health: (await L.health()).status });
      delete ids['r3c' + k];
    }
    rep.step('12c DELETE vehicle || pickup of its reservation', { attempts });
  }
  // 12d restore(R) || POST /api/vehicles with the same plate (license_plate_taken pre-check vs insert)
  {
    const plate = 'AU-13R4-X';
    const v = await L.ensureVehicle(admin, ids, 'r4', plate, 'P13-r4');
    await admin.del(`/api/vehicles/${v}`, { confirmLicensePlate: plate });
    const [rec] = await recs(v);
    const res = await L.burst([
      { sess: admin, method: 'POST', path: `/api/deleted-records/${rec.id}/restore`, label: 'restore' },
      { sess: mgr, method: 'POST', path: '/api/vehicles', body: { licensePlate: plate, brand: 'AUDIT-P13', model: 'recreated', vehicleType: 'car', currentMileage: 1, dailyPrice: '1' }, label: 'recreate same plate' },
    ]);
    rep.step('12d restore || re-create same plate', { res: L.brief(res, 200), dist: L.dist(res), vehiclesWithPlate: await L.q('select id, model from vehicles where license_plate=$1', [plate]), records: await recs(v) });
    delete ids.r4;
  }

  L.saveIds(ids);
  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

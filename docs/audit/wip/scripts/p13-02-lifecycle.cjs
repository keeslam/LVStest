// Phase 13 tests 4 and 5: cancel/pickup/return/edit races on one reservation,
// vehicle status/mileage races (PATCH /api/vehicles/:id vs pickup, vs mark-needs-service).
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-02-lifecycle');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const t = L.today();

  // fresh vehicle in a known state + a booked reservation starting today
  async function freshBooked(key, plate, opts = {}) {
    const v = await L.ensureVehicle(admin, ids, key, plate, 'P13-' + key);
    await L.q("update reservations set status='cancelled', updated_at=now() where vehicle_id=$1 and status in ('booked','picked_up','active','pending') and deleted_at is null", [v]);
    await L.q("update vehicles set availability_status='available', maintenance_status='ok', maintenance_note=null, current_mileage=1000, current_fuel_level='full', remarks=null where id=$1", [v]);
    const r = await L.createReservation(admin, { vehicleId: v, customerId: ids.c1, startDate: t, endDate: L.addDays(t, 3), notes: `AUDIT-P13 ${key}` });
    if (opts.pickedUp) {
      const p = await admin.post(`/api/reservations/${r.id}/pickup`, { contractNumber: `AUDIT-P13-${key}-${Date.now()}`, pickupMileage: 1500, fuelLevelPickup: 'full' });
      if (p.status !== 200) throw new Error('setup pickup failed ' + p.status + ' ' + p.text.slice(0, 200));
    }
    return { v, r: r.id };
  }
  const snap = async (rid, vid) => {
    const r = await L.resRow(rid); const v = await L.vehRow(vid); const d = await L.docsFor(rid);
    return { reservation: { status: r.status, contract_number: r.contract_number, actual_pickup_date: r.actual_pickup_date, pickup_mileage: r.pickup_mileage, return_mileage: r.return_mileage, actual_return_date: r.actual_return_date, end_date: r.end_date, notes: r.notes, updated_by: r.updated_by }, vehicle: { availability_status: v.availability_status, maintenance_status: v.maintenance_status, current_mileage: v.current_mileage, remarks: v.remarks }, docs: d.map((x) => `${x.id}:${x.document_type}:${x.file_name}`) };
  };
  const cancel = (s, rid) => ({ sess: s, method: 'PATCH', path: `/api/reservations/${rid}/status`, body: { status: 'cancelled' }, label: 'cancel' });
  const pickup = (s, rid, cn, km = 1500) => ({ sess: s, method: 'POST', path: `/api/reservations/${rid}/pickup`, body: { contractNumber: cn, pickupMileage: km, fuelLevelPickup: 'full' }, label: 'pickup ' + cn });
  const ret = (s, rid, km) => ({ sess: s, method: 'POST', path: `/api/reservations/${rid}/return`, body: { returnMileage: km, fuelLevelReturn: 'half' }, label: 'return ' + km });

  // ---- 4a cancel || pickup (three timings) ----
  const a = [];
  for (const [k, cfg] of [['a1', { cancelDelay: 0, pickupDelay: 0 }], ['a2', { cancelDelay: 15, pickupDelay: 0 }], ['a3', { cancelDelay: 0, pickupDelay: 15 }]].entries()) {
    const f = await freshBooked(`l4a${k}`, `AU-134${k}-X`);
    const res = await L.burst([{ ...cancel(mgr, f.r), delayMs: cfg[1].cancelDelay }, { ...pickup(admin, f.r, `AUDIT-P13-4a${k}`), delayMs: cfg[1].pickupDelay }]);
    a.push({ cfg: cfg[1], res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v) });
  }
  rep.step('4a cancel (status endpoint) || pickup, 3 timings', { attempts: a });

  // ---- 4b cancel || edit ----
  {
    const f = await freshBooked('l4b', 'AU-134B-X');
    const res = await L.burst([cancel(mgr, f.r), { sess: admin, method: 'PATCH', path: `/api/reservations/${f.r}`, body: { notes: 'AUDIT-P13 4b edited during cancel', totalPrice: 77 }, label: 'edit' }]);
    rep.step('4b cancel || edit', { res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v) });
  }

  // ---- 4c return || cancel on a picked_up reservation ----
  {
    const f = await freshBooked('l4c', 'AU-134C-X', { pickedUp: true });
    const before = await snap(f.r, f.v);
    const res = await L.burst([ret(admin, f.r, 1800), cancel(mgr, f.r)]);
    rep.step('4c return || cancel (picked_up)', { before, res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v) });
  }

  // ---- 4d two returns in parallel (different mileage) ----
  {
    const f = await freshBooked('l4d', 'AU-134D-X', { pickedUp: true });
    const res = await L.burst([ret(admin, f.r, 2000), ret(mgr, f.r, 2100)]);
    rep.step('4d two returns in parallel (2000 vs 2100 km)', { res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v), control: 'sequentially the second return is rejected 400 "Cannot return reservation with status: returned" (phase 3 RS tests)' });
  }

  // ---- 4e two pickups with DIFFERENT contract numbers ----
  {
    const f = await freshBooked('l4e', 'AU-134E-X');
    const res = await L.burst([pickup(admin, f.r, 'AUDIT-P13-4e-A', 1500), pickup(mgr, f.r, 'AUDIT-P13-4e-B', 1600)]);
    const fin = await snap(f.r, f.v);
    const respNumbers = res.map((r) => r.json && r.json.contractNumber);
    rep.step('4e two pickups, different contract numbers, parallel', { res: L.brief(res, 140), dist: L.dist(res), responseContractNumbers: respNumbers, final: fin, verdict: res.filter((r) => r.status === 200).length === 2 ? 'BOTH ACCEPTED: two contract PDFs/document rows, one contract number silently overwritten' : 'one rejected' });
  }

  // ---- 4f double-click pickup (same body twice, 10 ms apart) ----
  {
    const f = await freshBooked('l4f', 'AU-134F-X');
    const res = await L.burst([pickup(admin, f.r, 'AUDIT-P13-4f', 1500), { ...pickup(admin, f.r, 'AUDIT-P13-4f', 1500), delayMs: 10 }]);
    rep.step('4f double-click pickup (identical body, 10 ms apart, same session)', { res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v) });
  }
  // ---- 4g double-click return ----
  {
    const f = await freshBooked('l4g', 'AU-134G-X', { pickedUp: true });
    const res = await L.burst([ret(admin, f.r, 1900), { ...ret(admin, f.r, 1900), delayMs: 10 }]);
    rep.step('4g double-click return (identical body, 10 ms apart)', { res: L.brief(res, 140), dist: L.dist(res), final: await snap(f.r, f.v) });
  }

  // ---- 5a PATCH /api/vehicles/:id {remarks} || pickup: read-merge-write of the vehicle row vs pickup's mileage/status write ----
  {
    const attempts = [];
    for (const delay of [0, 10, 20, 30, 40, 50, 60, 80]) {
      const f = await freshBooked('l5a', 'AU-135A-X');
      const res = await L.burst([
        { ...pickup(admin, f.r, `AUDIT-P13-5a-${delay}`, 1500), delayMs: 0 },
        { sess: mgr, method: 'PATCH', path: `/api/vehicles/${f.v}`, body: { remarks: `AUDIT-P13 5a remark d${delay}` }, label: 'vehicle PATCH remarks', delayMs: delay },
      ]);
      const fin = await snap(f.r, f.v);
      const lost = fin.reservation.status === 'picked_up' && (fin.vehicle.current_mileage !== 1500 || fin.vehicle.availability_status !== 'rented');
      attempts.push({ patchDelayMs: delay, dist: L.dist(res), ms: res.map((r) => r.ms), final: fin, LOST_PICKUP_WRITE: lost });
    }
    rep.step('5a vehicle PATCH {remarks} || pickup (PATCH fired 0..80 ms after pickup)', { attempts, lostCount: attempts.filter((x) => x.LOST_PICKUP_WRITE).length });
  }
  // 5a' PATCH {availabilityStatus: needs_fixing} || pickup
  {
    const attempts = [];
    for (const delay of [0, 20, 40]) {
      const f = await freshBooked('l5b', 'AU-135B-X');
      const res = await L.burst([
        { ...pickup(admin, f.r, `AUDIT-P13-5b-${delay}`, 1500), delayMs: 0 },
        { sess: mgr, method: 'PATCH', path: `/api/vehicles/${f.v}`, body: { availabilityStatus: 'needs_fixing' }, label: 'vehicle PATCH needs_fixing', delayMs: delay },
      ]);
      attempts.push({ patchDelayMs: delay, res: L.brief(res, 100), final: await snap(f.r, f.v) });
    }
    rep.step('5a2 vehicle PATCH {availabilityStatus:needs_fixing} || pickup', { attempts });
  }

  // ---- 5b PATCH vehicle {remarks} || mark-needs-service (sets maintenance_status/availability) ----
  {
    const attempts = [];
    for (const delay of [0, 10, 20, 30, 40, 60]) {
      const f = await freshBooked('l5c', 'AU-135C-X');
      const res = await L.burst([
        { sess: admin, method: 'POST', path: `/api/reservations/${f.r}/mark-needs-service`, body: { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT-P13 5b' }, label: 'mark-needs-service', delayMs: 0 },
        { sess: mgr, method: 'PATCH', path: `/api/vehicles/${f.v}`, body: { remarks: `AUDIT-P13 5b remark d${delay}` }, label: 'vehicle PATCH remarks', delayMs: delay },
      ]);
      const fin = await snap(f.r, f.v);
      const lost = fin.vehicle.maintenance_status !== 'in_service';
      attempts.push({ patchDelayMs: delay, dist: L.dist(res), ms: res.map((r) => r.ms), final: fin.vehicle, LOST_SERVICE_FLAG: lost });
    }
    rep.step('5b vehicle PATCH {remarks} || mark-needs-service', { attempts, lostCount: attempts.filter((x) => x.LOST_SERVICE_FLAG).length, note: 'maintenance block creation itself never touches vehicles (BUG-034), so PATCH-vs-block has nothing to race on; mark-needs-service is the write path that does set the vehicle flags' });
  }

  // ---- 5c two users change vehicle status in opposite directions ----
  {
    const v = await L.ensureVehicle(admin, ids, 'l5d', 'AU-135D-X', 'P13-l5d');
    await L.q("update vehicles set availability_status='available' where id=$1", [v]);
    const res = await L.burst([
      { sess: admin, method: 'PATCH', path: `/api/vehicles/${v}`, body: { availabilityStatus: 'needs_fixing', remarks: 'AUDIT-P13 5c admin: broken' }, label: 'admin needs_fixing' },
      { sess: mgr, method: 'PATCH', path: `/api/vehicles/${v}`, body: { availabilityStatus: 'not_for_rental', tireSize: 'AUDIT-P13 5c mgr' }, label: 'mgr not_for_rental' },
    ]);
    rep.step('5c two users set different availabilityStatus + different extra fields, parallel', { res: L.brief(res, 100), dist: L.dist(res), final: await L.vehRow(v), note: 'BUG-122 shape (read-merge-write); recorded here only as final state' });
  }

  L.saveIds(ids);
  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

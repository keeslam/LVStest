// Phase 13 test 3: spare vehicle races (assign-spare x2 sessions, assign-spare vs
// maintenance-with-spare, two transports claiming the same spare on the same day).
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-03-spare');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const V = async (k, plate) => L.ensureVehicle(admin, ids, k, plate, 'P13-' + k);
  const s0 = await V('s0', 'AU-1350-X'), s1 = await V('s1', 'AU-1351-X'), s3 = await V('s3', 'AU-1353-X'), s4 = await V('s4', 'AU-1354-X'), s5 = await V('s5', 'AU-1355-X'), s6 = await V('s6', 'AU-1356-X'), s7 = await V('s7', 'AU-1357-X'), s8 = await V('s8', 'AU-1358-X'), s9 = await V('s9', 'AU-1359-X'), s10 = await V('s10', 'AU-135X-X'), s11 = await V('s11', 'AU-135Y-X');
  const activeOn = (vid) => L.q("select id, type, status, start_date, end_date, start_time, end_time, replacement_for_reservation_id, customer_id from reservations where vehicle_id=$1 and deleted_at is null and status not in ('cancelled','completed','returned') order by id", [vid]);
  const replacementsFor = (rid) => L.q("select id, vehicle_id, status, start_date, end_date, spare_vehicle_status, deleted_at from reservations where replacement_for_reservation_id=$1 order by id", [rid]);

  // ---- 3a same spare assigned to the same rental from two sessions ----
  const RR = await L.createReservation(admin, { vehicleId: s0, customerId: ids.c1, startDate: '2029-05-01', endDate: '2029-05-10', notes: 'AUDIT-P13 3a rental' });
  let res = await L.burst([
    { sess: admin, method: 'POST', path: `/api/reservations/${RR.id}/assign-spare`, body: { spareVehicleId: s1, startDate: '2029-05-02', endDate: '2029-05-04' }, label: 'admin assign s1' },
    { sess: mgr, method: 'POST', path: `/api/reservations/${RR.id}/assign-spare`, body: { spareVehicleId: s1, startDate: '2029-05-02', endDate: '2029-05-04' }, label: 'mgr assign s1' },
  ]);
  rep.step('3a assign-spare same spare, same rental, two sessions, parallel', { res: L.brief(res, 160), dist: L.dist(res), replacements: await replacementsFor(RR.id), onSpare: await activeOn(s1) });
  const ctl = await admin.post(`/api/reservations/${RR.id}/assign-spare`, { spareVehicleId: s1, startDate: '2029-05-02', endDate: '2029-05-04' });
  rep.step('3a-control third call sequential', { status: ctl.status, body: ctl.text.slice(0, 160) });

  // ---- 3b two different rentals grab the same spare for the same days ----
  const RA = await L.createReservation(admin, { vehicleId: s3, customerId: ids.c1, startDate: '2029-06-01', endDate: '2029-06-10', notes: 'AUDIT-P13 3b rental A' });
  const RB = await L.createReservation(admin, { vehicleId: s4, customerId: ids.c2, startDate: '2029-06-01', endDate: '2029-06-10', notes: 'AUDIT-P13 3b rental B' });
  res = await L.burst([
    { sess: admin, method: 'POST', path: `/api/reservations/${RA.id}/assign-spare`, body: { spareVehicleId: s5, startDate: '2029-06-02', endDate: '2029-06-05' }, label: 'A gets s5' },
    { sess: mgr, method: 'POST', path: `/api/reservations/${RB.id}/assign-spare`, body: { spareVehicleId: s5, startDate: '2029-06-02', endDate: '2029-06-05' }, label: 'B gets s5' },
  ]);
  rep.step('3b two rentals, same spare, same days, parallel', { res: L.brief(res, 160), dist: L.dist(res), onSpare: await activeOn(s5), verdict: (await activeOn(s5)).length > 1 ? 'SPARE DOUBLE-BOOKED to two customers' : 'ok' });

  // ---- 3c maintenance-with-spare || assign-spare for the same rental + same spare ----
  const RC = await L.createReservation(admin, { vehicleId: s7, customerId: ids.c1, startDate: '2029-07-01', endDate: '2029-07-10', notes: 'AUDIT-P13 3c rental' });
  const maint = { vehicleId: s7, startDate: '2029-07-02', endDate: '2029-07-04', type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: 'AUDIT-P13 3c block' };
  res = await L.burst([
    { sess: admin, method: 'POST', path: '/api/reservations/maintenance-with-spare', body: { maintenanceData: maint, conflictingReservations: [RC.id], spareVehicleAssignments: [{ reservationId: RC.id, spareVehicleId: s6, startDate: '2029-07-02', endDate: '2029-07-04' }] }, label: 'maintenance-with-spare s6' },
    { sess: mgr, method: 'POST', path: `/api/reservations/${RC.id}/assign-spare`, body: { spareVehicleId: s6, startDate: '2029-07-02', endDate: '2029-07-04' }, label: 'assign-spare s6' },
  ]);
  rep.step('3c maintenance-with-spare || assign-spare (same rental, same spare, same days)', { res: L.brief(res, 200), dist: L.dist(res), replacements: await replacementsFor(RC.id), onSpare: await activeOn(s6), blocks: await L.q("select id, status, start_date, end_date from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null", [s7]) });

  // ---- 3c2 two maintenance-with-spare calls (double click on "schedule maintenance") ----
  const RD = await L.createReservation(admin, { vehicleId: s10, customerId: ids.c2, startDate: '2029-08-01', endDate: '2029-08-10', notes: 'AUDIT-P13 3c2 rental' });
  const maint2 = { ...maint, vehicleId: s10, startDate: '2029-08-02', endDate: '2029-08-04', notes: 'AUDIT-P13 3c2 block' };
  const body2 = { maintenanceData: maint2, conflictingReservations: [RD.id], spareVehicleAssignments: [{ reservationId: RD.id, spareVehicleId: s11, startDate: '2029-08-02', endDate: '2029-08-04' }] };
  res = await L.burst([
    { sess: admin, method: 'POST', path: '/api/reservations/maintenance-with-spare', body: body2, label: 'click 1' },
    { sess: admin, method: 'POST', path: '/api/reservations/maintenance-with-spare', body: body2, label: 'click 2', delayMs: 10 },
  ]);
  rep.step('3c2 maintenance-with-spare double click (10 ms)', { res: L.brief(res, 200), dist: L.dist(res), replacements: await replacementsFor(RD.id), onSpare: await activeOn(s11), blocks: await L.q("select id, status, start_date, end_date from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null", [s10]) });

  // ---- 3d two transports created in parallel claiming the same spare on the same day ----
  const tBody = (vid) => ({ vehicleId: vid, transportType: 'swap', scheduledDate: '2029-09-03', spareRequired: true, relatedVehicleId: s8, isBreakdownOrMaintenance: false, originCity: 'AUDIT-P13', destinationCity: 'AUDIT-P13', notes: 'AUDIT-P13 3d' });
  res = await L.burst([
    { sess: admin, method: 'POST', path: '/api/transports', body: tBody(s7), label: 'transport for s7 wants s8' },
    { sess: mgr, method: 'POST', path: '/api/transports', body: tBody(s9), label: 'transport for s9 wants s8' },
  ]);
  const tr = await L.q("select id, vehicle_id, related_vehicle_id, spare_required, spare_reservation_id, status, scheduled_date from vehicle_transports where notes='AUDIT-P13 3d' order by id");
  rep.step('3d two transports, same spare, same day, parallel', { res: L.brief(res, 200), dist: L.dist(res), transports: tr, onSpare: await activeOn(s8), verdict: (await activeOn(s8)).length > 1 ? 'SPARE DOUBLE-BOOKED across two transports (explicit 00:00-23:59 window meant to prevent exactly this)' : 'ok' });
  const ctl2 = await admin.post('/api/transports', tBody(s7));
  rep.step('3d-control third transport sequential', { status: ctl2.status, body: ctl2.text.slice(0, 160), transportsNow: (await L.q("select id, related_vehicle_id, spare_required from vehicle_transports where notes='AUDIT-P13 3d' order by id")).length, note: 'a 409 here that still leaves a transport row is BUG-142' });

  // ---- 3e placeholder double-click (check-then-insert) ----
  const RE = await L.createReservation(admin, { vehicleId: s3, customerId: ids.c1, startDate: '2029-10-01', endDate: '2029-10-10', notes: 'AUDIT-P13 3e rental' });
  res = await L.burst(Array.from({ length: 3 }, (_, i) => ({ sess: i ? mgr : admin, method: 'POST', path: '/api/placeholder-reservations', body: { originalReservationId: RE.id, customerId: ids.c1, startDate: '2029-10-02', endDate: '2029-10-04' }, label: 'placeholder ' + i })));
  rep.step('3e 3x parallel POST placeholder-reservations for the same rental', { res: L.brief(res, 160), dist: L.dist(res), placeholders: await L.q('select id, placeholder_spare, status from reservations where replacement_for_reservation_id=$1 and placeholder_spare order by id', [RE.id]), notifications: await L.q("select id, title from custom_notifications where description like $1", ['%for 2029-10-02%']) });

  L.saveIds(ids);
  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

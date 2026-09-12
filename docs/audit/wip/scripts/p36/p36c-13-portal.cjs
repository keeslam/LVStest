'use strict';
const { admin, q, pool, loadIds, d, Session } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-P' + RUN + '-' + (++cn);
function nextWeekday(iso) {
  let t = new Date(iso);
  while (t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() + 1);
  return t.toISOString().slice(0, 10);
}
(async () => {
  const s = await admin('c13');
  const pt = new Session('portal', { fakeIp: '10.36.99.' + (Math.floor(Math.random() * 200) + 5) });
  let r = await pt.loginPortal('portaal-test@example.com', 'P36portal!23');
  log('portal login', [r.status, r.text.slice(0, 160)]);
  const ids = loadIds();
  const mk = async (tag) => {
    const plate = 'P36P' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'P', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return rr.json.id;
  };
  const notifCount = async () => (await q('select count(*)::int n from portal_notifications where customer_id=179'))[0].n;
  const mailCount = async () => (await q('select count(*)::int n from email_logs'))[0].n;

  // a rental for portal customer 179, picked up so /vehicles/mine sees it
  const V = await mk('A');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V, startDate: d(-1), endDate: d(20), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C portal' });
  const RENT = r.json && r.json.id;
  log('portal rental', [r.status, RENT, r.text.slice(0, 150)]);
  r = await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('pickup', [r.status, r.text.slice(0, 120)]);

  // --- BUG-134 portal notifications on office changes ---
  let n0 = await notifCount(), m0 = await mailCount();
  r = await s.patch('/api/reservations/' + RENT, { endDate: d(21) });
  log('134 date change', [r.status, 'newNotifs=' + (await notifCount() - n0)]);
  n0 = await notifCount();
  const V2 = await mk('B');
  r = await s.patch('/api/reservations/' + RENT, { vehicleId: V2 });
  log('134 vehicle change', [r.status, r.text.slice(0, 160), 'newNotifs=' + (await notifCount() - n0)]);
  n0 = await notifCount();
  log('134 notif types', await q("select type,title from portal_notifications where customer_id=179 order by id desc limit 5"));

  // --- BUG-141 concurrent approve ---
  const pref = nextWeekday(d(10));
  r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: RENT, message: 'AUDIT-P36C noise', payload: { issue: 'AUDIT-P36C noise', mileage: 1500, urgent: false, needsReplacement: true, preferredDate: pref } });
  log('141 portal request', [r.status, r.json && r.json.id, r.text.slice(0, 200)]);
  const REQ = r.json && r.json.id;
  if (REQ) {
    const s2 = await admin('c13b');
    const blocksBefore = (await q("select count(*)::int n from reservations where type='maintenance_block' and portal_request_id=$1", [REQ]))[0].n;
    const mBefore = await mailCount();
    const [a, b] = await Promise.all([
      s.post('/api/portal-requests/' + REQ + '/approve', { startDate: pref, durationDays: 2 }),
      s2.post('/api/portal-requests/' + REQ + '/approve', { startDate: pref, durationDays: 2 }),
    ]);
    log('141 concurrent approve (expect one 200 + one 4xx)', [[a.status, a.text.slice(0, 130)], [b.status, b.text.slice(0, 130)]]);
    log('141 blocks created (expect 1)', (await q("select id,start_date,end_date,status from reservations where type='maintenance_block' and portal_request_id=$1", [REQ])));
    log('141 notifications for that request', await q("select id,type from portal_notifications where customer_id=179 order by id desc limit 4"));
    log('155 email_logs added by the approve (expect >=1)', await mailCount() - mBefore);
    log('155 approve response mailSent flag', [a.status, (a.text.match(/mailSent[^,}]*/)||['(none)'])[0], (b.text.match(/mailSent[^,}]*/)||['(none)'])[0]]);
    log('155 recent email_logs', await q('select id,template,result,failure_reason from email_logs order by id desc limit 4'));

    // --- BUG-117: assign a spare, then approve a maintenance_change ---
    const blocks = await q("select id from reservations where type='maintenance_block' and portal_request_id=$1 order by id", [REQ]);
    const BLOCK = blocks[0] && blocks[0].id;
    log('117 block', BLOCK);
    const phs = await q("select id,placeholder_spare,status,start_date,end_date from reservations where affected_rental_id=$1 and type='replacement' and deleted_at is null", [RENT]);
    log('117 placeholders', phs);
    const VS = await mk('S');
    if (phs[0]) {
      r = await s.post('/api/placeholder-reservations/' + phs[0].id + '/assign-vehicle', { vehicleId: VS });
      log('117 assign spare', [r.status, r.text.slice(0, 160)]);
    }
    const D2 = nextWeekday(d(25));
    r = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: BLOCK, message: 'AUDIT-P36C move', payload: { newDate: D2, reason: 'AUDIT-P36C holiday', needsReplacement: true } });
    log('117 change request', [r.status, r.json && r.json.id, r.text.slice(0, 200)]);
    const CHG = r.json && r.json.id;
    if (CHG) {
      r = await s.post('/api/portal-requests/' + CHG + '/approve', { startDate: D2, durationDays: 2, note: 'AUDIT-P36C moved' });
      log('117 approve change', [r.status, r.text.slice(0, 200)]);
      log('117 live replacements for the rental (expect exactly 1, on the new dates)', await q("select id,vehicle_id,placeholder_spare,status,start_date,end_date from reservations where affected_rental_id=$1 and type='replacement' and deleted_at is null and status<>'cancelled' order by id", [RENT]));
      log('117 block dates', await q('select id,start_date,end_date,status from reservations where id=$1', [BLOCK]));
    }

    // --- BUG-139 (B-13): swap the rental's vehicle while a block hangs on it ---
    const V3 = await mk('C');
    const before139 = await notifCount();
    r = await s.patch('/api/reservations/' + RENT, { vehicleId: V3 });
    log('139 PATCH rental vehicleId (B-13: block stays with the car, spare + notice dropped)', [r.status, r.text.slice(0, 300)]);
    log('139 block after', await q('select id,vehicle_id,status,deleted_at from reservations where id=$1', [BLOCK]));
    log('139 replacements after', await q("select id,vehicle_id,status,deleted_at from reservations where affected_rental_id=$1 and type='replacement' order by id", [RENT]));
    log('139 new portal notifications', [await notifCount() - before139, await q('select id,type,title from portal_notifications where customer_id=179 order by id desc limit 3')]);
  }

  // --- BUG-138: approve in the past / on a cancelled rental ---
  const V4 = await mk('D');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V4, startDate: d(-1), endDate: d(30), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C portal2' });
  const RENT2 = r.json && r.json.id;
  r = await s.post('/api/reservations/' + RENT2 + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('138 rental2 pickup', [r.status, RENT2]);
  r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: RENT2, message: 'AUDIT-P36C past', payload: { issue: 'AUDIT-P36C past', needsReplacement: true } });
  const REQ2 = r.json && r.json.id;
  log('138 request2', [r.status, REQ2, r.text.slice(0, 180)]);
  if (REQ2) {
    r = await s.post('/api/portal-requests/' + REQ2 + '/approve', { startDate: nextWeekday(d(-7)), durationDays: 2 });
    log('138 approve with a date in the past (expect 400)', [r.status, r.text.slice(0, 220)]);
  }
  const V5 = await mk('E');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V5, startDate: d(40), endDate: d(50), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C portal3' });
  const RENT3 = r.json && r.json.id;
  r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: RENT3, message: 'AUDIT-P36C cancel', payload: { issue: 'AUDIT-P36C cancel', needsReplacement: true } });
  const REQ3 = r.json && r.json.id;
  log('138 request3 on a booked rental', [r.status, REQ3, r.text.slice(0, 180)]);
  if (REQ3) {
    r = await s.patch('/api/reservations/' + RENT3 + '/status', { status: 'cancelled' });
    log('138 cancel rental3', [r.status, r.text.slice(0, 120)]);
    r = await s.post('/api/portal-requests/' + REQ3 + '/approve', { startDate: nextWeekday(d(42)), durationDays: 2 });
    log('138 approve on a cancelled rental (expect 400)', [r.status, r.text.slice(0, 220)]);
  }

  // --- BUG-118: two blocks on one rental, delete one ---
  const V6 = await mk('F');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V6, startDate: d(-1), endDate: d(60), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C portal4' });
  const RENT4 = r.json && r.json.id;
  await s.post('/api/reservations/' + RENT4 + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  const b1 = await s.post('/api/reservations', { customerId: null, vehicleId: V6, startDate: d(10), endDate: d(12), type: 'maintenance_block', notes: 'AUDIT-P36C block1', affectedRentalId: RENT4 });
  const b2 = await s.post('/api/reservations', { customerId: null, vehicleId: V6, startDate: d(14), endDate: d(16), type: 'maintenance_block', notes: 'AUDIT-P36C block2', affectedRentalId: RENT4 });
  log('118 blocks', [b1.status, b1.json && b1.json.id, b2.status, b2.json && b2.json.id]);
  const VS1 = await mk('G');
  if (b1.json && b1.json.id) {
    const sp = await s.post('/api/reservations/' + RENT4 + '/assign-spare', { spareVehicleId: VS1, startDate: d(10), endDate: d(12), maintenanceBlockId: b1.json.id });
    log('118 spare for block1', [sp.status, sp.text.slice(0, 200)]);
  }
  const before118 = await q("select id,vehicle_id,status,deleted_at,start_date,end_date from reservations where type='replacement' and affected_rental_id=$1 order by id", [RENT4]);
  log('118 replacements before', before118);
  if (b2.json && b2.json.id) {
    r = await s.del('/api/reservations/' + b2.json.id);
    log('118 delete block2', [r.status, r.text.slice(0, 140)]);
  }
  log('118 replacements after (block1 spare must survive)', await q("select id,vehicle_id,status,deleted_at,start_date,end_date from reservations where type='replacement' and affected_rental_id=$1 order by id", [RENT4]));
  await pool.end();
})();

'use strict';
const { admin, q, pool, d, Session } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-Y' + RUN + '-' + (++cn);
function nextWeekday(iso) { let t = new Date(iso); while (t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); }
(async () => {
  const s = await admin('c18');
  const pt = new Session('portal', { fakeIp: '10.36.97.' + (Math.floor(Math.random() * 200) + 5) });
  let r = await pt.loginPortal('portaal-test@example.com', 'P36portal!23');
  log('portal login', r.status);
  const mk = async (tag) => {
    const plate = 'P36Y' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'Y', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return rr.json.id;
  };
  const notifs = () => q('select id,type,title from portal_notifications where customer_id=179 order by id desc limit 6');
  const n = async () => (await q('select coalesce(max(id),0)::int m from portal_notifications where customer_id=179'))[0].m;

  const V = await mk('A');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V, startDate: d(-1), endDate: d(40), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C y' });
  const RENT = r.json.id;
  await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  const P1 = nextWeekday(d(8));
  r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: RENT, message: 'AUDIT-P36C 154', payload: { issue: 'AUDIT-P36C 154', needsReplacement: false, preferredDate: P1 } });
  const REQ = r.json && r.json.id;
  r = await s.post('/api/portal-requests/' + REQ + '/approve', { startDate: P1, durationDays: 2 });
  log('154 approve', [r.status, r.text.slice(0, 120)]);
  const BLOCK = (await q("select id,status,maintenance_status from reservations where type='maintenance_block' and portal_request_id=$1", [REQ]))[0];
  log('154 block', BLOCK);
  let m0 = await n();
  r = await s.patch('/api/vehicles/' + V + '/maintenance-status', { status: 'in_service', note: 'AUDIT-P36C 154' });
  log('154 maintenance-status in_service', [r.status, r.text.slice(0, 110)]);
  log('154 block after', await q('select id,status,maintenance_status from reservations where id=$1', [BLOCK.id]));
  log('154 new notifications (expect maintenance_in)', await q('select id,type,title from portal_notifications where customer_id=179 and id>$1 order by id', [m0]));
  m0 = await n();
  r = await s.patch('/api/vehicles/' + V + '/maintenance-status', { status: 'ok', note: '' });
  log('154 back to ok', [r.status, await q('select id,status,maintenance_status from reservations where id=$1', [BLOCK.id])]);
  log('154 new notifications (expect maintenance_out)', await q('select id,type,title from portal_notifications where customer_id=179 and id>$1 order by id', [m0]));

  // --- BUG-134: cancel + delete a portal customer's rental ---
  const V2 = await mk('B');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V2, startDate: d(70), endDate: d(75), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C y134' });
  const R2 = r.json.id;
  m0 = await n();
  r = await s.patch('/api/reservations/' + R2 + '/status', { status: 'cancelled' });
  log('134 cancel a portal rental', [r.status, 'new notifs:', await q('select id,type,title from portal_notifications where customer_id=179 and id>$1 order by id', [m0])]);
  const V3 = await mk('C');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V3, startDate: d(80), endDate: d(85), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C y134b' });
  const R3 = r.json.id;
  m0 = await n();
  r = await s.del('/api/reservations/' + R3);
  log('134 delete a portal rental', [r.status, 'new notifs:', await q('select id,type,title from portal_notifications where customer_id=179 and id>$1 order by id', [m0])]);
  log('134 recent notifications', await notifs());
  await pool.end();
})();

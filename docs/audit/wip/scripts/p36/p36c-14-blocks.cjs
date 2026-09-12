'use strict';
const { admin, q, pool, d, Session } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-K' + RUN + '-' + (++cn);
function nextWeekday(iso) { let t = new Date(iso); while (t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); }
(async () => {
  const s = await admin('c14');
  const pt = new Session('portal', { fakeIp: '10.36.98.' + (Math.floor(Math.random() * 200) + 5) });
  let r = await pt.loginPortal('portaal-test@example.com', 'P36portal!23');
  log('portal login', r.status);
  const mk = async (tag) => {
    const plate = 'P36K' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'K', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return rr.json.id;
  };
  const repl = (rent) => q("select id,vehicle_id,type,status,placeholder_spare,start_date,end_date,deleted_at,affected_rental_id,replacement_for_reservation_id from reservations where affected_rental_id=$1 or replacement_for_reservation_id=$1 order by id", [rent]);

  // rental for portal customer 179
  const V = await mk('A');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V, startDate: d(-1), endDate: d(60), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C k' });
  const RENT = r.json.id;
  await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('rental', RENT);

  // --- BUG-117: portal maintenance with replacement, assign the spare, then move the block ---
  const P1 = nextWeekday(d(10));
  r = await pt.post('/api/portal/requests', { type: 'maintenance', reservationId: RENT, message: 'AUDIT-P36C 117', payload: { issue: 'AUDIT-P36C 117', needsReplacement: true, preferredDate: P1 } });
  const REQ = r.json && r.json.id;
  log('117 request', [r.status, REQ]);
  r = await s.post('/api/portal-requests/' + REQ + '/approve', { startDate: P1, durationDays: 3, needsReplacement: true });
  log('117 approve', [r.status, r.text.slice(0, 200)]);
  const blocks = await q("select id,vehicle_id,start_date,end_date,affected_rental_id,portal_request_id from reservations where type='maintenance_block' and portal_request_id=$1", [REQ]);
  log('117 block', blocks);
  log('117 all related rows', await repl(RENT));
  let ph = (await repl(RENT)).filter(x => x.type === 'replacement' && x.placeholder_spare && !x.deleted_at);
  log('117 placeholder rows', ph);
  if (!ph.length) {
    r = await s.get('/api/placeholder-reservations/needing-assignment');
    log('117 needing-assignment list', [r.status, (r.json || []).map(x => x.id).slice(0, 10)]);
  }
  const VS = await mk('S');
  if (ph[0]) {
    r = await s.post('/api/placeholder-reservations/' + ph[0].id + '/assign-vehicle', { vehicleId: VS });
    log('117 assign spare', [r.status, r.text.slice(0, 160)]);
  } else if (blocks[0]) {
    r = await s.post('/api/reservations/' + RENT + '/assign-spare', { spareVehicleId: VS, startDate: P1, endDate: nextWeekday(d(13)) });
    log('117 assign-spare fallback', [r.status, r.text.slice(0, 200)]);
  }
  log('117 replacements after assign', await repl(RENT));
  const D2 = nextWeekday(d(30));
  if (blocks[0]) {
    r = await pt.post('/api/portal/requests', { type: 'maintenance_change', reservationId: blocks[0].id, message: 'AUDIT-P36C move', payload: { newDate: D2, reason: 'AUDIT-P36C', needsReplacement: true } });
    const CHG = r.json && r.json.id;
    log('117 change request', [r.status, CHG]);
    if (CHG) {
      r = await s.post('/api/portal-requests/' + CHG + '/approve', { startDate: D2, durationDays: 2 });
      log('117 approve change', [r.status, r.text.slice(0, 160)]);
      log('117 block after', await q('select id,start_date,end_date from reservations where id=$1', [blocks[0].id]));
      const live = (await repl(RENT)).filter(x => x.type === 'replacement' && !x.deleted_at && x.status !== 'cancelled');
      log('117 live replacements (expect exactly 1, on ' + D2 + ')', live);
    }
  }

  // --- BUG-118: two blocks, delete one ---
  const V6 = await mk('F');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V6, startDate: d(-1), endDate: d(60), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C k2' });
  const RENT4 = r.json.id;
  await s.post('/api/reservations/' + RENT4 + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  const mkBlock = async (start, end, note) => {
    const rr = await s.post('/api/reservations', { customerId: null, vehicleId: V6, startDate: start, endDate: end, type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', notes: note });
    return [rr.status, rr.json && rr.json.id, rr.text.slice(0, 200)];
  };
  const B1 = await mkBlock(d(10), d(12), 'AUDIT-P36C b1');
  const B2 = await mkBlock(d(10), d(12), 'AUDIT-P36C b2');
  log('118 block1', B1); log('118 block2', B2);
  const VS1 = await mk('G');
  r = await s.post('/api/reservations/' + RENT4 + '/mark-needs-service', { maintenanceStatus: 'scheduled', maintenanceType: 'repair', notes: 'AUDIT-P36C 118' });
  log('118 mark-needs-service', [r.status, r.text.slice(0, 160)]);
  r = await s.post('/api/reservations/' + RENT4 + '/assign-spare', { spareVehicleId: VS1, startDate: d(10), endDate: d(12) });
  log('118 assign-spare', [r.status, r.text.slice(0, 200)]);
  log('118 replacements before', await repl(RENT4));
  if (B2[1]) {
    r = await s.del('/api/reservations/' + B2[1]);
    log('118 delete block2', [r.status, r.text.slice(0, 140)]);
  }
  log('118 replacements after (must survive)', await repl(RENT4));
  log('118 block1 still there', B1[1] ? await q('select id,deleted_at from reservations where id=$1', [B1[1]]) : null);
  await pool.end();
})();

const { Session } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const TS = F.ts;
const R = (l, v) => console.log('[' + l + '] ' + v);
const out = {};
(async () => {
  const a = new Session('admin', { fakeIp: '10.36.3.1' });
  await a.loginStaff('admin', 'admin123');
  const mkVeh = async (tag) => {
    const r = await a.post('/api/vehicles', { licensePlate: ('P36A' + tag + TS).slice(0, 18), brand: 'AUDIT-P36A', model: tag });
    return r.json && r.json.id;
  };

  // --- BUG-039: non-existent vehicleId / customerId
  const b39a = await a.post('/api/reservations', { vehicleId: 999999999, customerId: F.c1, startDate: '2027-12-10', endDate: '2027-12-12', type: 'standard' });
  R('039 standard bad vehicleId', b39a.status + ' ' + b39a.text.slice(0, 130));
  const b39b = await a.post('/api/reservations', { vehicleId: F.v1, customerId: 999999999, startDate: '2027-12-10', endDate: '2027-12-12', type: 'standard' });
  R('039 standard bad customerId', b39b.status + ' ' + b39b.text.slice(0, 130));
  const b39c = await a.post('/api/reservations', { vehicleId: 999999999, type: 'maintenance_block', startDate: '2027-12-10', endDate: '2027-12-12' });
  R('039 maintenance_block bad vehicleId', b39c.status + ' ' + b39c.text.slice(0, 130));

  // --- BUG-013 (B-09) + BUG-037 (B-09): maintenance block then booking / second block
  const vM = await mkVeh('M');
  const blk1 = await a.post('/api/reservations', { vehicleId: vM, type: 'maintenance_block', startDate: '2027-10-01', endDate: '2027-10-10' });
  R('013 create block1', blk1.status + ' id=' + (blk1.json && blk1.json.id) + ' ' + blk1.text.slice(0, 120));
  const bookInBlock = await a.post('/api/reservations', { vehicleId: vM, customerId: F.c1, type: 'standard', startDate: '2027-10-03', endDate: '2027-10-05' });
  R('013 book inside block', bookInBlock.status + ' ' + bookInBlock.text.slice(0, 300));
  const blk2 = await a.post('/api/reservations', { vehicleId: vM, type: 'maintenance_block', startDate: '2027-10-05', endDate: '2027-10-08' });
  R('037 second overlapping block', blk2.status + ' ' + blk2.text.slice(0, 300));

  // --- BUG-018 (B-01): not_for_rental / needs_fixing bookable
  const vNF = await mkVeh('NF');
  R('018 set not_for_rental', (await a.patch('/api/vehicles/' + vNF, { availabilityStatus: 'not_for_rental' })).status);
  const bkNF = await a.post('/api/reservations', { vehicleId: vNF, customerId: F.c1, startDate: '2029-04-01', endDate: '2029-04-05', type: 'standard' });
  R('018 book not_for_rental', bkNF.status + ' ' + bkNF.text.slice(0, 250));
  const vNX = await mkVeh('NX');
  R('018 set needs_fixing', (await a.patch('/api/vehicles/' + vNX, { availabilityStatus: 'needs_fixing' })).status);
  const bkNX = await a.post('/api/reservations', { vehicleId: vNX, customerId: F.c1, startDate: '2029-04-01', endDate: '2029-04-05', type: 'standard' });
  R('018 book needs_fixing', bkNX.status + ' ' + bkNX.text.slice(0, 250));

  // --- BUG-016 / BUG-052: state machine bypass
  const vS = await mkVeh('S');
  const mkRes = async (veh, s, e) => {
    const r = await a.post('/api/reservations', { vehicleId: veh, customerId: F.c1, startDate: s, endDate: e, type: 'standard' });
    return r.json && r.json.id;
  };
  const r16a = await mkRes(vS, '2028-01-01', '2028-01-05');
  const p1 = await a.patch('/api/reservations/' + r16a + '/basic', { vehicleId: vS, customerId: F.c1, startDate: '2028-01-01', endDate: '2028-01-05', status: 'completed', type: 'standard' });
  R('016 PATCH /basic booked->completed (' + r16a + ')', p1.status + ' ' + p1.text.slice(0, 140));
  const r16b = await mkRes(vS, '2028-02-01', '2028-02-05');
  const p2 = await a.patch('/api/reservations/' + r16b, { status: 'completed' });
  R('016 PATCH /:id booked->completed (' + r16b + ')', p2.status + ' ' + p2.text.slice(0, 140));
  const r16c = await mkRes(vS, '2028-03-01', '2028-03-05');
  const p3 = await a.patch('/api/reservations/' + r16c, { status: 'garbage' });
  R('016 PATCH /:id status=garbage (' + r16c + ')', p3.status + ' ' + p3.text.slice(0, 140));
  out.r16 = [r16a, r16b, r16c];
  // BUG-052 maintenanceStatus garbage on a maintenance block
  const vMB = await mkVeh('MB');
  const mb = await a.post('/api/reservations', { vehicleId: vMB, type: 'maintenance_block', startDate: '2028-04-01', endDate: '2028-04-05' });
  const mbId = mb.json && mb.json.id;
  const p52 = await a.patch('/api/reservations/' + mbId, { maintenanceStatus: 'garbage' });
  R('052 PATCH maintenanceStatus=garbage (' + mbId + ')', p52.status + ' ' + p52.text.slice(0, 140));
  out.mbId = mbId;

  // --- BUG-017: blacklist bypass via edit
  const vBL = await mkVeh('BL');
  const bl = await a.post('/api/vehicles/' + vBL + '/blacklist', { customerId: F.c2, reason: 'AUDIT-P36A-blacklist' });
  R('017 blacklist c2 on vehicle', bl.status + ' ' + bl.text.slice(0, 120));
  const blDirect = await a.post('/api/reservations', { vehicleId: vBL, customerId: F.c2, startDate: '2028-05-01', endDate: '2028-05-05', type: 'standard' });
  R('017 direct booking blacklisted', blDirect.status + ' ' + blDirect.text.slice(0, 140));
  const rOK = await mkRes(vBL, '2028-06-01', '2028-06-05');
  const swap = await a.patch('/api/reservations/' + rOK, { customerId: F.c2 });
  R('017 PATCH swap to blacklisted customer (' + rOK + ')', swap.status + ' ' + swap.text.slice(0, 200));
  out.r17 = rOK;

  // --- BUG-019: endDate overwritten on complete/return
  const vE = await mkVeh('E');
  const r19 = await mkRes(vE, '2027-10-01', '2027-10-05');
  R('019 pickup', (await a.patch('/api/reservations/' + r19 + '/status', { status: 'picked_up' })).status);
  const done = await a.patch('/api/reservations/' + r19 + '/status', { status: 'completed' });
  R('019 complete -> endDate', done.status + ' endDate=' + (done.json && done.json.endDate) + ' ' + done.text.slice(0, 120));
  out.r19 = r19;
  const vE2 = await mkVeh('E2');
  const r19b = await mkRes(vE2, '2028-05-01', '2028-05-05');
  const pu = await a.post('/api/reservations/' + r19b + '/pickup', { contractNumber: 'P36A-C-' + TS + '-1', departureMileage: 1000 });
  R('019b pickup route', pu.status + ' ' + pu.text.slice(0, 120));
  const rt = await a.post('/api/reservations/' + r19b + '/return', { returnMileage: 1200 });
  R('019b return route', rt.status + ' ' + rt.text.slice(0, 120));
  out.r19b = r19b;

  // --- BUG-040: past start date + overdue guard
  const vP = await mkVeh('P');
  const past = await a.post('/api/reservations', { vehicleId: vP, customerId: F.c1, startDate: '2020-01-01', endDate: '2020-01-05', type: 'standard' });
  R('040 create past reservation', past.status + ' ' + past.text.slice(0, 200));
  const future = await a.post('/api/reservations', { vehicleId: vP, customerId: F.c1, startDate: '2028-12-01', endDate: '2028-12-05', type: 'standard' });
  R('040 future booking after past row', future.status + ' ' + future.text.slice(0, 200));

  // --- BUG-054: totalPrice bounds
  const vT = await mkVeh('T');
  const t1 = await a.post('/api/reservations', { vehicleId: vT, customerId: F.c1, startDate: '2028-07-01', endDate: '2028-07-05', type: 'standard', totalPrice: -1 });
  R('054 totalPrice=-1', t1.status + ' ' + t1.text.slice(0, 140));
  const t2 = await a.post('/api/reservations', { vehicleId: vT, customerId: F.c1, startDate: '2028-08-01', endDate: '2028-08-05', type: 'standard', totalPrice: 1e308 });
  R('054 totalPrice=1e308', t2.status + ' ' + t2.text.slice(0, 140));
  const t3 = await a.post('/api/reservations', { vehicleId: vT, customerId: F.c1, startDate: '2028-09-01', endDate: '2028-09-05', type: 'standard', totalPrice: 'abc' });
  R('054 totalPrice="abc"', t3.status + ' ' + t3.text.slice(0, 140));
  out.t3 = t3.json && t3.json.id;

  // --- BUG-056: isRecurring inert
  const vR = await mkVeh('R');
  const rec = await a.post('/api/reservations', { vehicleId: vR, customerId: F.c1, startDate: '2028-10-01', endDate: '2028-10-05', type: 'standard', isRecurring: true, recurringFrequency: 'weekly' });
  R('056 isRecurring=true', rec.status + ' ' + rec.text.slice(0, 200));
  out.rec = rec.json && rec.json.id;

  // --- BUG-038: duplicate contract number on pickup
  const vC = await mkVeh('C');
  const c38a = await mkRes(vC, '2027-01-01', '2027-01-05');
  const vC2 = await mkVeh('C2');
  const c38b = await mkRes(vC2, '2027-01-01', '2027-01-05');
  const cn = 'P36A-DUP-' + TS;
  const pu1 = await a.post('/api/reservations/' + c38a + '/pickup', { contractNumber: cn, departureMileage: 10 });
  R('038 first pickup w/ contract', pu1.status + ' ' + pu1.text.slice(0, 120));
  const pu2 = await a.post('/api/reservations/' + c38b + '/pickup', { contractNumber: cn, departureMileage: 10 });
  R('038 second pickup same contract', pu2.status + ' ' + pu2.text.slice(0, 220));

  require('fs').writeFileSync('a-g3-ids.json', JSON.stringify(Object.assign(out, { vM, vNF, vNX, vS, vBL, vE, vP, vT, vR }), null, 1));
})();

const { Session } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const TS = F.ts;
const R = (l, v) => console.log('[' + l + '] ' + v);
const out = {};
(async () => {
  const a = new Session('admin', { fakeIp: '10.36.3.3' });
  await a.loginStaff('admin', 'admin123');
  let n = 0;
  const mkVeh = async (tag) => (await a.post('/api/vehicles', { licensePlate: ('P36C' + tag + (++n) + TS.slice(-4)) })).json ? null : null;
  const veh = async (tag) => {
    const r = await a.post('/api/vehicles', { licensePlate: 'P36C-' + tag + '-' + (++n) + '-' + TS.slice(-4), brand: 'AUDIT-P36A', model: tag });
    if (r.status !== 201) { console.log('veh fail', r.status, r.text.slice(0, 200)); }
    return r.json.id;
  };
  const mkRes = async (v, s, e) => {
    const r = await a.post('/api/reservations', { vehicleId: v, customerId: F.c1, startDate: s, endDate: e, type: 'standard' });
    if (r.status !== 201) console.log('res fail', r.status, r.text.slice(0, 200));
    return r.json.id;
  };
  const PU = (cn, extra) => Object.assign({ contractNumber: cn, pickupMileage: 100, fuelLevelPickup: 'full', shiftStartDate: true }, extra || {});

  // --- BUG-019 via pickup/return route
  const vE = await veh('E');
  const r19 = await mkRes(vE, '2028-05-01', '2028-05-05');
  const pu = await a.post('/api/reservations/' + r19 + '/pickup', PU('P36C-E-' + TS));
  R('019b pickup (future start, shiftStartDate)', pu.status + ' start=' + (pu.json && (pu.json.startDate || (pu.json.reservation && pu.json.reservation.startDate))) + ' ' + pu.text.slice(0, 160));
  const rt = await a.post('/api/reservations/' + r19 + '/return', { returnMileage: 200, fuelLevelReturn: 'full' });
  R('019b return', rt.status + ' ' + rt.text.slice(0, 200));
  out.r19b = r19;

  // --- BUG-038: duplicate contract number on pickup
  const vC = await veh('C'), vC2 = await veh('D');
  const c1 = await mkRes(vC, '2026-09-01', '2027-01-05');
  const c2 = await mkRes(vC2, '2026-09-01', '2027-01-05');
  const cn = 'P36C-DUP-' + TS;
  const p1 = await a.post('/api/reservations/' + c1 + '/pickup', PU(cn));
  R('038 pickup1', p1.status + ' ' + p1.text.slice(0, 120));
  const p2 = await a.post('/api/reservations/' + c2 + '/pickup', PU(cn));
  R('038 pickup2 dup contract', p2.status + ' ' + p2.text.slice(0, 240));

  // --- BUG-018/B-03: pickup of a needs_fixing vehicle
  const vNX = await veh('X');
  const rNX = await mkRes(vNX, '2026-09-01', '2026-12-20');
  R('018b set needs_fixing', (await a.patch('/api/vehicles/' + vNX, { availabilityStatus: 'needs_fixing' })).status);
  const puNX = await a.post('/api/reservations/' + rNX + '/pickup', PU('P36C-NX-' + TS));
  R('018b pickup needs_fixing vehicle', puNX.status + ' ' + puNX.text.slice(0, 280));

  // --- BUG-004: maintenance-with-spare hard-delete of a picked-up spare
  const vOrig = await veh('O'), vSp = await veh('S1'), vSp2 = await veh('S2');
  const rOrig = await mkRes(vOrig, '2027-03-01', '2027-03-20');
  const mws1 = await a.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: vOrig, startDate: '2027-03-05', endDate: '2027-03-10', type: 'maintenance_block' },
    conflictingReservations: [{ id: rOrig }],
    spareVehicleAssignments: [{ reservationId: rOrig, spareVehicleId: vSp, startDate: '2027-03-05', endDate: '2027-03-10' }],
  });
  R('004 maintenance-with-spare #1', mws1.status + ' ' + mws1.text.slice(0, 300));
  const mJson = mws1.json || {};
  const maintId = mJson.maintenanceReservation && mJson.maintenanceReservation.id || mJson.id || (mJson.maintenance && mJson.maintenance.id);
  const repl = (mJson.spareReservations || mJson.replacementReservations || [])[0];
  const replId = repl && repl.id;
  R('004 maintId/replId', maintId + ' / ' + replId);
  if (replId) {
    const puR = await a.post('/api/reservations/' + replId + '/pickup', PU('P36C-SPARE-' + TS));
    R('004 pickup spare', puR.status + ' ' + puR.text.slice(0, 200));
    const mws2 = await a.post('/api/reservations/maintenance-with-spare', {
      maintenanceId: maintId,
      maintenanceData: { vehicleId: vOrig, startDate: '2027-03-05', endDate: '2027-03-10', type: 'maintenance_block' },
      conflictingReservations: [{ id: rOrig }],
      spareVehicleAssignments: [{ reservationId: rOrig, spareVehicleId: vSp2, startDate: '2027-03-05', endDate: '2027-03-10' }],
    });
    R('004 maintenance-with-spare #2 (reassign)', mws2.status + ' ' + mws2.text.slice(0, 300));
  }
  out.b004 = { rOrig, maintId, replId };

  // --- BUG-055: contract generation needs pickup first? try again
  const vD = await veh('H');
  const rD = await mkRes(vD, '2026-09-01', '2027-04-05');
  const gen = await a.get('/api/contracts/generate/' + rD);
  R('055 generate contract (booked)', gen.status + ' ' + (gen.status !== 200 ? gen.text.slice(0, 200) : 'len=' + gen.text.length));
  const puD = await a.post('/api/reservations/' + rD + '/pickup', PU('P36C-H-' + TS));
  R('055 pickup', puD.status);
  const gen2 = await a.get('/api/contracts/generate/' + rD);
  R('055 generate contract (picked_up)', gen2.status + ' ' + (gen2.status !== 200 ? gen2.text.slice(0, 200) : 'len=' + gen2.text.length));
  const delD = await a.del('/api/reservations/' + rD);
  R('055 DELETE reservation', delD.status + ' ' + delD.text.slice(0, 200));
  out.b055 = rD;

  require('fs').writeFileSync('a-g3c-ids.json', JSON.stringify(out, null, 1));
})();

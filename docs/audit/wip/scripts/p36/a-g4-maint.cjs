const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const out = {};
(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-004: maintenance-with-spare hard-delete of an already picked-up spare
  const vOrig = await veh(a, 'O'), vSp = await veh(a, 'S'), vSp2 = await veh(a, 'T');
  const rOrig = await res(a, vOrig, '2026-09-01', '2027-03-20');
  const mws1 = await a.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: vOrig, startDate: '2027-03-05', endDate: '2027-03-10', type: 'maintenance_block' },
    conflictingReservations: [{ id: rOrig }],
    spareVehicleAssignments: [{ reservationId: rOrig, spareVehicleId: vSp, startDate: '2027-03-05', endDate: '2027-03-10' }],
  });
  R('004 mws#1', mws1.status + ' keys=' + Object.keys(mws1.json || {}).join(','));
  const j = mws1.json || {};
  const maintId = (j.maintenanceReservation && j.maintenanceReservation.id) || j.id;
  let replId = null;
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (Array.isArray(v) && v.length && v[0] && v[0].id) {
      R('004 array ' + k, JSON.stringify(v.map(x => ({ id: x.id, type: x.type, vid: x.vehicleId, rfor: x.replacementForReservationId }))));
      const cand = v.find(x => x.replacementForReservationId === rOrig || x.type === 'replacement');
      if (cand) replId = cand.id;
    }
  }
  R('004 maintId=' + maintId, 'replId=' + replId);
  if (replId) {
    const pu = await a.post('/api/reservations/' + replId + '/pickup', PU('P36A-SP-' + TS));
    R('004 pickup spare ' + replId, pu.status + ' ' + pu.text.slice(0, 200));
    const mws2 = await a.post('/api/reservations/maintenance-with-spare', {
      maintenanceId: maintId,
      maintenanceData: { vehicleId: vOrig, startDate: '2027-03-05', endDate: '2027-03-10', type: 'maintenance_block' },
      conflictingReservations: [{ id: rOrig }],
      spareVehicleAssignments: [{ reservationId: rOrig, spareVehicleId: vSp2, startDate: '2027-03-05', endDate: '2027-03-10' }],
    });
    R('004 mws#2 reassign', mws2.status + ' ' + mws2.text.slice(0, 400));
  }
  out.b004 = { rOrig, maintId, replId };

  // --- BUG-034: does a maintenance block change vehicles.availabilityStatus?
  const v34 = await veh(a, 'W');
  const before = await a.get('/api/vehicles/' + v34);
  R('034 before', (before.json && before.json.availabilityStatus) + '/' + (before.json && before.json.maintenanceStatus));
  const blk34 = await a.post('/api/reservations', { vehicleId: v34, type: 'maintenance_block', startDate: '2026-09-01', endDate: '2026-12-31' });
  R('034 block created', blk34.status + ' id=' + (blk34.json && blk34.json.id));
  const after = await a.get('/api/vehicles/' + v34);
  R('034 after', (after.json && after.json.availabilityStatus) + '/' + (after.json && after.json.maintenanceStatus));
  out.b034 = { v34, blk: blk34.json && blk34.json.id };

  // --- BUG-055: reservation delete orphans documents + driver assignment
  const v55 = await veh(a, 'H');
  const r55 = await res(a, v55, '2026-09-01', '2027-04-05');
  const pu55 = await a.post('/api/reservations/' + r55 + '/pickup', PU('P36A-H-' + TS));
  R('055 pickup', pu55.status + ' ' + pu55.text.slice(0, 120));
  const gen = await a.get('/api/contracts/generate/' + r55);
  R('055 generate contract', gen.status + ' ' + (gen.status === 200 ? 'len=' + gen.text.length : gen.text.slice(0, 200)));
  const drv = await a.post('/api/customers/' + F.c1 + '/drivers', { name: 'AUDIT-P36A Driver', driverLicenseNumber: 'P36A-' + TS });
  R('055 driver', drv.status + ' id=' + (drv.json && drv.json.id));
  if (drv.json && drv.json.id) {
    const asg = await a.post('/api/reservations/' + r55 + '/driver-assignments', { driverId: drv.json.id, assignedFrom: '2026-09-01' });
    R('055 driver-assign', asg.status + ' ' + asg.text.slice(0, 160));
  }
  const del55 = await a.del('/api/reservations/' + r55);
  R('055 DELETE reservation', del55.status + ' ' + del55.text.slice(0, 160));
  out.b055 = { r55, drv: drv.json && drv.json.id };

  // --- BUG-022 (B-14): vehicle delete with reservations of two customers
  const v22 = await veh(a, 'V');
  const rA = await res(a, v22, '2026-12-01', '2026-12-05');
  const rB = await a.post('/api/reservations', { vehicleId: v22, customerId: F.c2, startDate: '2026-12-10', endDate: '2026-12-15', type: 'standard' });
  R('022 two reservations', rA + ' / ' + rB.status + ' ' + (rB.json && rB.json.id));
  const imp = await a.get('/api/vehicles/' + v22 + '/delete-impact');
  R('022 delete-impact', imp.status + ' ' + imp.text.slice(0, 500));
  const plate = (await a.get('/api/vehicles/' + v22)).json.licensePlate;
  const del22 = await a.del('/api/vehicles/' + v22, { confirmLicensePlate: plate });
  R('022 DELETE vehicle (live res)', del22.status + ' ' + del22.text.slice(0, 300));
  out.b022 = { v22, rA, rB: rB.json && rB.json.id, plate };

  require('fs').writeFileSync('a-g4-ids.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

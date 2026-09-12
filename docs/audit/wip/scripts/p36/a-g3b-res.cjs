const { Session } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const G = require('./a-g3-ids.json');
const TS = F.ts;
const R = (l, v) => console.log('[' + l + '] ' + v);
(async () => {
  const a = new Session('admin', { fakeIp: '10.36.3.2' });
  await a.loginStaff('admin', 'admin123');
  const mkVeh = async (tag) => (await a.post('/api/vehicles', { licensePlate: ('P36B' + tag + TS).slice(0, 18), brand: 'AUDIT-P36A', model: tag })).json.id;
  const mkRes = async (veh, s, e) => (await a.post('/api/reservations', { vehicleId: veh, customerId: F.c1, startDate: s, endDate: e, type: 'standard' })).json.id;

  // --- BUG-013 full response of booking inside a maintenance block (B-09 warning?)
  const vM = await mkVeh('M');
  const blk = await a.post('/api/reservations', { vehicleId: vM, type: 'maintenance_block', startDate: '2027-10-01', endDate: '2027-10-10' });
  R('013 block', blk.status + ' id=' + blk.json.id);
  const bk = await a.post('/api/reservations', { vehicleId: vM, customerId: F.c1, type: 'standard', startDate: '2027-10-03', endDate: '2027-10-05' });
  R('013 FULL booking response', bk.status + ' :: ' + bk.text);

  // --- BUG-037 second overlapping block, no customer reservation in the way
  const vM2 = await mkVeh('N');
  const b1 = await a.post('/api/reservations', { vehicleId: vM2, type: 'maintenance_block', startDate: '2027-11-01', endDate: '2027-11-10' });
  R('037 block1', b1.status + ' id=' + b1.json.id);
  const b2 = await a.post('/api/reservations', { vehicleId: vM2, type: 'maintenance_block', startDate: '2027-11-05', endDate: '2027-11-08' });
  R('037 FULL second block response', b2.status + ' :: ' + b2.text.slice(0, 700));

  // --- BUG-018/B-03: pickup of a needs_fixing vehicle
  const vNX = await mkVeh('X');
  R('018b set needs_fixing', (await a.patch('/api/vehicles/' + vNX, { availabilityStatus: 'needs_fixing' })).status);
  const rNX = await a.post('/api/reservations', { vehicleId: vNX, customerId: F.c1, startDate: '2026-09-12', endDate: '2026-09-20', type: 'standard' });
  R('018b book needs_fixing (today)', rNX.status + ' id=' + (rNX.json && rNX.json.id));
  if (rNX.json && rNX.json.id) {
    const pu = await a.post('/api/reservations/' + rNX.json.id + '/pickup', { contractNumber: 'P36A-NX-' + TS, departureMileage: 100, departureFuel: 'full', fuelLevel: 'full', pickupMileage: 100, pickupFuelLevel: 'full' });
    R('018b pickup needs_fixing vehicle', pu.status + ' ' + pu.text.slice(0, 260));
  }

  // --- BUG-019b: pickup/return route with fuel
  const vE = await mkVeh('E');
  const r19 = await mkRes(vE, '2026-09-12', '2028-05-05');
  const pu = await a.post('/api/reservations/' + r19 + '/pickup', { contractNumber: 'P36A-E-' + TS, departureMileage: 100, departureFuel: 'full', fuelLevel: 'full', pickupMileage: 100, pickupFuelLevel: 'full' });
  R('019b pickup', pu.status + ' ' + pu.text.slice(0, 200));
  const rt = await a.post('/api/reservations/' + r19 + '/return', { returnMileage: 200, returnFuel: 'full', fuelLevel: 'full', returnFuelLevel: 'full' });
  R('019b return', rt.status + ' ' + rt.text.slice(0, 250));
  console.log('019b resId=' + r19);

  // --- BUG-038: duplicate contract number
  const vC = await mkVeh('C'), vC2 = await mkVeh('D');
  const c1 = await mkRes(vC, '2026-09-12', '2027-01-05');
  const c2 = await mkRes(vC2, '2026-09-12', '2027-01-05');
  const cn = 'P36A-DUP2-' + TS;
  const p1 = await a.post('/api/reservations/' + c1 + '/pickup', { contractNumber: cn, departureMileage: 10, departureFuel: 'full', fuelLevel: 'full', pickupMileage: 10, pickupFuelLevel: 'full' });
  R('038 pickup1', p1.status + ' ' + p1.text.slice(0, 150));
  const p2 = await a.post('/api/reservations/' + c2 + '/pickup', { contractNumber: cn, departureMileage: 10, departureFuel: 'full', fuelLevel: 'full', pickupMileage: 10, pickupFuelLevel: 'full' });
  R('038 pickup2 duplicate contract', p2.status + ' ' + p2.text.slice(0, 300));

  // --- BUG-031: mark-needs-service reversed range
  const vSv = await mkVeh('S');
  const rSv = await mkRes(vSv, '2027-02-01', '2027-02-05');
  const mns = await a.post('/api/reservations/' + rSv + '/mark-needs-service', { maintenanceStatus: 'in_service', serviceStartDate: '2099-01-01', serviceEndDate: '2020-01-01' });
  R('031 mark-needs-service reversed', mns.status + ' ' + mns.text.slice(0, 250));

  // --- BUG-033: maintenance-with-spare without vehicleId
  const mws = await a.post('/api/reservations/maintenance-with-spare', { maintenanceData: { startDate: '2027-07-01', endDate: '2027-07-05', type: 'maintenance_block' }, conflictingReservations: [], spareVehicleAssignments: [] });
  R('033 maintenance-with-spare no vehicleId', mws.status + ' ' + mws.text.slice(0, 250));

  // --- BUG-035: placeholder with foreign customerId
  const vPh = await mkVeh('P');
  const rPh = await mkRes(vPh, '2027-05-01', '2027-05-10');
  const ph = await a.post('/api/placeholder-reservations', { originalReservationId: rPh, customerId: F.c2, startDate: '2027-05-05', endDate: '2027-05-07' });
  R('035 placeholder foreign customerId (orig cust=' + F.c1 + ')', ph.status + ' ' + ph.text.slice(0, 250));

  // --- BUG-036: spare-status on a standard reservation
  const vSs = await mkVeh('Q');
  const rSs = await mkRes(vSs, '2027-06-01', '2027-06-05');
  const ss = await a.patch('/api/reservations/' + rSs + '/spare-status', { spareVehicleStatus: 'ready' });
  R('036 spare-status on standard res', ss.status + ' ' + ss.text.slice(0, 250));

  // --- BUG-032: assign-spare twice
  const vB = await mkVeh('B'), vSp1 = await mkVeh('1'), vSp2 = await mkVeh('2');
  const blkB = await a.post('/api/reservations', { vehicleId: vB, type: 'maintenance_block', startDate: '2027-08-01', endDate: '2027-08-10' });
  const blkBid = blkB.json && blkB.json.id;
  const as1 = await a.post('/api/reservations/' + blkBid + '/assign-spare', { spareVehicleId: vSp1, startDate: '2027-08-01', endDate: '2027-08-10' });
  R('032 assign-spare #1', as1.status + ' ' + as1.text.slice(0, 150));
  const as2 = await a.post('/api/reservations/' + blkBid + '/assign-spare', { spareVehicleId: vSp2, startDate: '2027-08-01', endDate: '2027-08-10' });
  R('032 assign-spare #2', as2.status + ' ' + as2.text.slice(0, 250));
  console.log('032 blockId=' + blkBid);

  // --- BUG-014: delete block leaves replacement + spare scheduled
  const vB14 = await mkVeh('F'), vSp14 = await mkVeh('G');
  const blk14 = await a.post('/api/reservations', { vehicleId: vB14, type: 'maintenance_block', startDate: '2027-09-01', endDate: '2027-09-10' });
  const blk14id = blk14.json && blk14.json.id;
  const as14 = await a.post('/api/reservations/' + blk14id + '/assign-spare', { spareVehicleId: vSp14, startDate: '2027-09-01', endDate: '2027-09-10' });
  R('014 assign-spare', as14.status + ' ' + as14.text.slice(0, 150));
  const del14 = await a.del('/api/reservations/' + blk14id);
  R('014 DELETE block', del14.status + ' ' + del14.text.slice(0, 250));
  console.log('014 blockId=' + blk14id + ' spareVehicle=' + vSp14);

  // --- BUG-055: delete reservation orphans documents + driver assignment
  const vD = await mkVeh('H');
  const rD = await mkRes(vD, '2027-04-01', '2027-04-05');
  const contract = await a.get('/api/contracts/generate/' + rD);
  R('055 generate contract', contract.status + ' len=' + contract.text.length);
  const delD = await a.del('/api/reservations/' + rD);
  R('055 DELETE reservation', delD.status + ' ' + delD.text.slice(0, 200));
  console.log('055 resId=' + rD);

  require('fs').writeFileSync('a-g3b-ids.json', JSON.stringify({ b013block: blk.json.id, b013res: bk.json && bk.json.id, b037v: vM2, b032block: blkBid, b014block: blk14id, b014spare: vSp14, b055res: rD, b019b: r19, b031res: rSv, b035res: rPh, b036res: rSs }, null, 1));
})();

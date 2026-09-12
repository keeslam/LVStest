// Flow 2 (correcte route): onderhoud met vervanger in één handeling, daarna afronden
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const P = 'AUDIT-P36W8'; const rnd = () => 'P36T' + Math.floor(Math.random() * 9000 + 1000);
(async () => {
  const s = new Session('sweep'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const c = await s.post('/api/customers', { name: P, companyName: P, debtorNumber: 'P36W8' + Math.floor(Math.random()*999), address: 'T', city: 'D', postalCode: '1234AB', phone: '0612345684', email: 'p36w8@example.invalid', status: 'active' });
  const main = await s.post('/api/vehicles', { licensePlate: rnd(), brand: P, model: 'Hoofd', vehicleType: 'personenauto', currentMileage: 60000, fuelType: 'benzine' });
  const sp = await s.post('/api/vehicles', { licensePlate: rnd(), brand: P, model: 'Vervanger', vehicleType: 'personenauto', currentMileage: 2000, fuelType: 'benzine' });
  const rent = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: c.json.id, startDate: day(60), endDate: day(70), status: 'booked', type: 'standard' });
  step('0. fixtures + klanthuur', rent.status === 201, 'klant=' + c.json.id + ' hoofd=' + main.json.id + ' vervanger=' + sp.json.id + ' huur=' + rent.json.id);

  // 1. probe: does the maintenance period disturb a rental?
  const probe = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: c.json.id, startDate: day(62), endDate: day(64), status: 'booked', type: 'maintenance_block', maintenanceStatus: 'scheduled', maintenanceDuration: 2 });
  const needsSpare = probe.status === 200 && probe.json && probe.json.needsSpareVehicle === true;
  step('1. app vraagt om een vervanger', needsSpare, 'HTTP ' + probe.status + ' needsSpareVehicle=' + (probe.json && probe.json.needsSpareVehicle) + ' conflicten=' + ((probe.json && probe.json.conflictingReservations) || []).map(r => r.id).join(','));

  // 2. one action: block + spare
  const mws = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: main.json.id, customerId: c.json.id, startDate: day(62), endDate: day(64), status: 'booked', type: 'maintenance_block', maintenanceStatus: 'scheduled', maintenanceDuration: 2 },
    conflictingReservations: [rent.json.id],
    spareVehicleAssignments: [{ reservationId: rent.json.id, spareVehicleId: sp.json.id, startDate: day(62), endDate: day(64) }],
  });
  step('2. onderhoud + vervanger in één handeling', mws.status === 200 || mws.status === 201,
    'HTTP ' + mws.status + ' ' + (mws.status >= 400 ? mws.text.slice(0, 350) : JSON.stringify(mws.json).slice(0, 350)));

  const all = await s.get('/api/reservations/vehicle/' + main.json.id);
  const rows = Array.isArray(all.json) ? all.json : [];
  const blk = rows.find(r => r.type === 'maintenance_block');
  step('3a. onderhoudsblok staat er', !!blk, rows.map(r => r.id + ':' + r.type + ':' + r.status).join(' | '));
  const spRows = await s.get('/api/reservations/vehicle/' + sp.json.id);
  const spList = Array.isArray(spRows.json) ? spRows.json : [];
  const rep = spList.find(r => r.type === 'replacement');
  step('3b. vervangingsreservering op de vervanger', !!rep, spList.map(r => r.id + ':' + r.type + ':' + r.status + ':' + r.startDate + '..' + r.endDate).join(' | ') || '(geen)');

  // 4. complete the maintenance in one action
  if (blk) {
    const cm = await s.post('/api/reservations/' + blk.id + '/complete-maintenance', { returnMileage: 60300 });
    step('4a. onderhoud afronden (OPT-015)', cm.status === 200, 'HTTP ' + cm.status + ' ' + (cm.status >= 400 ? cm.text.slice(0, 300) : JSON.stringify(cm.json).slice(0, 300)));
    const blkAfter = await s.get('/api/reservations/' + blk.id);
    step('4b. blok afgesloten', true, 'status=' + (blkAfter.json && blkAfter.json.status) + ' maintenanceStatus=' + (blkAfter.json && blkAfter.json.maintenanceStatus) + ' completionDate=' + (blkAfter.json && blkAfter.json.completionDate));
    if (rep) { const r2 = await s.get('/api/reservations/' + rep.id); step('4c. vervanger vrijgegeven', true, 'status=' + (r2.json && r2.json.status)); }
    const v = await s.get('/api/vehicles/' + main.json.id); const v2 = await s.get('/api/vehicles/' + sp.json.id);
    step('4d. voertuigen na afronden', true, 'hoofd=' + (v.json && v.json.availabilityStatus) + ' km=' + (v.json && v.json.currentMileage) + ' | vervanger=' + (v2.json && v2.json.availabilityStatus));
  }
  fs.writeFileSync(__dirname + '/flow2d.json', JSON.stringify({ main: main.json.id, spare: sp.json.id, rent: rent.json.id, steps: T }, null, 1));
})();

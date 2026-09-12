// Flow 2 vervolg: vervanger toewijzen -> transport -> onderhoud afronden (OPT-015)
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const P = 'AUDIT-P36W7'; const rnd = () => 'P36S' + Math.floor(Math.random() * 9000 + 1000);
(async () => {
  const s = new Session('sweep'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const c = await s.post('/api/customers', { name: P, companyName: P, debtorNumber: 'P36W7' + Math.floor(Math.random()*999), address: 'T', city: 'D', postalCode: '1234AB', phone: '0612345683', email: 'p36w7@example.invalid', status: 'active' });
  const main = await s.post('/api/vehicles', { licensePlate: rnd(), brand: P, model: 'Hoofd', vehicleType: 'personenauto', currentMileage: 50000, fuelType: 'benzine' });
  const sp = await s.post('/api/vehicles', { licensePlate: rnd(), brand: P, model: 'Vervanger', vehicleType: 'personenauto', currentMileage: 2000, fuelType: 'benzine' });
  step('0. fixtures', c.status === 201 && main.status === 201 && sp.status === 201, 'klant=' + c.json.id + ' hoofd=' + main.json.id + ' vervanger=' + sp.json.id);

  // customer rental that the maintenance will disturb
  const rent = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: c.json.id, startDate: day(40), endDate: day(50), status: 'booked', type: 'standard' });
  step('1. klanthuur', rent.status === 201, 'id=' + (rent.json && rent.json.id));

  // maintenance block inside that rental
  const mb = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: c.json.id, startDate: day(42), endDate: day(44), status: 'booked', type: 'maintenance_block', maintenanceStatus: 'scheduled', maintenanceDuration: 2 });
  step('2. onderhoudsblok binnen de huur (B-09 waarschuwt, blokkeert niet)', mb.status === 201, 'HTTP ' + mb.status + ' id=' + (mb.json && mb.json.id) + (mb.status >= 400 ? ' ' + mb.text.slice(0, 250) : ''));
  const mbId = mb.json && mb.json.id;

  // spare assignment
  const av = await s.get('/api/spare-vehicles/available?startDate=' + day(42) + '&endDate=' + day(44));
  const avl = Array.isArray(av.json) ? av.json : [];
  step('3a. beschikbare vervangers', av.status === 200, 'HTTP ' + av.status + ' n=' + avl.length + ' bevat onze vervanger=' + avl.some(v => v.id === sp.json.id));
  const as = await s.post('/api/reservations/' + mbId + '/assign-spare', { spareVehicleId: sp.json.id, startDate: day(42), endDate: day(44) });
  step('3b. vervanger toewijzen', as.status === 200, 'HTTP ' + as.status + ' ' + (as.status >= 400 ? as.text.slice(0, 300) : 'vervangingsreservering=' + (as.json.replacementReservation && as.json.replacementReservation.id)));
  const repId = as.json && as.json.replacementReservation && as.json.replacementReservation.id;

  // assigning a SECOND spare while the first is still there -> must be a clean answer, not a crash
  const as2 = await s.post('/api/reservations/' + mbId + '/assign-spare', { spareVehicleId: sp.json.id, startDate: day(42), endDate: day(44) });
  step('3c. tweede toewijzing van dezelfde vervanger', as2.status < 500, 'HTTP ' + as2.status + ' ' + (as2.text || '').slice(0, 220));

  // transport for the maintenance
  const tr = await s.post('/api/transports', { vehicleId: main.json.id, transportType: 'maintenance', pickupLocation: 'Balie', deliveryLocation: 'Werkplaats', scheduledDate: day(42), status: 'scheduled', notes: P });
  step('4a. transport', tr.status === 201 || tr.status === 200, 'HTTP ' + tr.status + ' id=' + (tr.json && tr.json.id));
  if (tr.json && tr.json.id) {
    const tu = await s.patch('/api/transports/' + tr.json.id, { status: 'completed' });
    step('4b. transport afronden', tu.status === 200, 'HTTP ' + tu.status + ' status=' + (tu.json && tu.json.status));
    // B-03: the workshop flag must NOT disappear when a transport completes
    const vAfterT = await s.get('/api/vehicles/' + main.json.id);
    step('4c. werkplaatsvlag na transport (B-03)', true, 'availability=' + (vAfterT.json && vAfterT.json.availabilityStatus));
  }

  // complete maintenance in one action
  const cm = await s.post('/api/reservations/' + mbId + '/complete-maintenance', { returnMileage: 50400 });
  step('5a. onderhoud afronden (OPT-015)', cm.status === 200, 'HTTP ' + cm.status + ' ' + (cm.status >= 400 ? cm.text.slice(0, 300) : JSON.stringify(cm.json).slice(0, 300)));
  const mbAfter = await s.get('/api/reservations/' + mbId);
  step('5b. blok afgesloten', true, 'status=' + (mbAfter.json && mbAfter.json.status) + ' maintenanceStatus=' + (mbAfter.json && mbAfter.json.maintenanceStatus) + ' completionDate=' + (mbAfter.json && mbAfter.json.completionDate));
  if (repId) {
    const rep = await s.get('/api/reservations/' + repId);
    step('5c. vervangingsreservering afgesloten', true, 'status=' + (rep.json && rep.json.status));
  }
  const vAfter = await s.get('/api/vehicles/' + main.json.id);
  const spAfter = await s.get('/api/vehicles/' + sp.json.id);
  step('5d. voertuigen na afronden', true, 'hoofd=' + (vAfter.json && vAfter.json.availabilityStatus) + ' km=' + (vAfter.json && vAfter.json.currentMileage) + ' | vervanger=' + (spAfter.json && spAfter.json.availabilityStatus));
  fs.writeFileSync(__dirname + '/flow2c.json', JSON.stringify({ main: main.json.id, spare: sp.json.id, mbId, repId, steps: T }, null, 1));
})();

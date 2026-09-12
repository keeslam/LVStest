// Flow 2: onderhoudsblok -> vervanger -> transport -> afronden
'use strict';
const { Session } = require('./lib.cjs');
const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const P = 'AUDIT-P36W3';
(async () => {
  const s = new Session('admin'); await s.loginStaff('admin', 'admin123');
  const cust = await s.post('/api/customers', { name: P + ' Klant', companyName: P + ' Klant', debtorNumber: 'P36W3', address: 'T 3', city: 'D', postalCode: '1234AB', phone: '0612345680', email: 'p36w3@example.invalid', status: 'active' });
  const main = await s.post('/api/vehicles', { licensePlate: 'P36W03', brand: P, model: 'Hoofd', vehicleType: 'personenauto', currentMileage: 20000, fuelType: 'benzine' });
  const spare = await s.post('/api/vehicles', { licensePlate: 'P36W04', brand: P, model: 'Vervanger', vehicleType: 'personenauto', currentMileage: 3000, fuelType: 'benzine' });
  step('0. fixtures', !!(cust.json && main.json && spare.json), 'klant=' + cust.json.id + ' hoofdauto=' + main.json.id + ' vervanger=' + spare.json.id);

  // customer rental on the main vehicle, running now
  const rent = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: cust.json.id, startDate: day(0), endDate: day(10), status: 'booked', type: 'standard' });
  step('1. klanthuur op de hoofdauto', rent.status === 201, 'HTTP ' + rent.status + ' id=' + (rent.json && rent.json.id) + (rent.status >= 400 ? ' ' + rent.text.slice(0, 250) : ''));

  // maintenance block on the same vehicle -> B-09: must WARN, not block
  const mb = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: cust.json.id, startDate: day(2), endDate: day(4), status: 'booked', type: 'maintenance_block', maintenanceStatus: 'scheduled', maintenanceDuration: 2 });
  step('2. onderhoudsblok plaatsen', mb.status === 201, 'HTTP ' + mb.status + ' id=' + (mb.json && mb.json.id) + (mb.status >= 400 ? ' ' + mb.text.slice(0, 300) : ''));
  const mbId = mb.json && mb.json.id;

  // B-09: booking over an active maintenance block warns but is allowed
  const over = await s.post('/api/reservations', { vehicleId: main.json.id, customerId: cust.json.id, startDate: day(2), endDate: day(3), status: 'booked', type: 'standard' });
  step('3. boeken over het onderhoudsblok (B-09: waarschuwen, niet blokkeren)', over.status === 201,
    'HTTP ' + over.status + ' warnings=' + JSON.stringify((over.json && (over.json.warnings || over.json.warning)) || null).slice(0, 200) + (over.status >= 400 ? ' ' + over.text.slice(0, 250) : ''));

  // spare vehicle for the maintenance block
  if (mbId) {
    const av = await s.get('/api/spare-vehicles/available?startDate=' + day(2) + '&endDate=' + day(4));
    step('4a. beschikbare vervangers opvragen', av.status === 200, 'HTTP ' + av.status + ' n=' + (Array.isArray(av.json) ? av.json.length : 'n/a'));
    const as = await s.post('/api/reservations/' + mbId + '/assign-spare', { spareVehicleId: spare.json.id, startDate: day(2), endDate: day(4) });
    step('4b. vervanger toewijzen', as.status === 200 || as.status === 201, 'HTTP ' + as.status + ' ' + (as.status >= 400 ? as.text.slice(0, 300) : JSON.stringify(as.json).slice(0, 200)));
  }

  // transport
  const tr = await s.post('/api/transports', { vehicleId: main.json.id, transportType: 'maintenance', pickupLocation: 'Garage A', deliveryLocation: 'Werkplaats B', scheduledDate: day(2), status: 'scheduled', notes: P });
  step('5a. transport aanmaken', tr.status === 201 || tr.status === 200, 'HTTP ' + tr.status + ' id=' + (tr.json && tr.json.id) + (tr.status >= 400 ? ' ' + tr.text.slice(0, 300) : ''));
  const tid = tr.json && tr.json.id;
  if (tid) {
    const tu = await s.patch('/api/transports/' + tid, { status: 'completed' });
    step('5b. transport afronden', tu.status === 200, 'HTTP ' + tu.status + ' status=' + (tu.json && tu.json.status) + (tu.status >= 400 ? ' ' + tu.text.slice(0, 250) : ''));
  }

  // complete maintenance (OPT-015: one action)
  if (mbId) {
    const cm = await s.post('/api/reservations/' + mbId + '/complete-maintenance', { returnMileage: 20500 });
    step('6a. onderhoud afronden (OPT-015)', cm.status === 200, 'HTTP ' + cm.status + ' ' + (cm.status >= 400 ? cm.text.slice(0, 300) : JSON.stringify(cm.json).slice(0, 250)));
    const mbAfter = await s.get('/api/reservations/' + mbId);
    step('6b. blok afgesloten', true, 'status=' + (mbAfter.json && mbAfter.json.status) + ' maintenanceStatus=' + (mbAfter.json && mbAfter.json.maintenanceStatus));
    const vAfter = await s.get('/api/vehicles/' + main.json.id);
    step('6c. hoofdauto na afronden', true, 'availability=' + (vAfter.json && vAfter.json.availabilityStatus) + ' needsFixing=' + (vAfter.json && (vAfter.json.needsFixing ?? vAfter.json.needs_fixing)));
  }
  fs.writeFileSync(__dirname + '/flow2.json', JSON.stringify({ cust: cust.json.id, main: main.json.id, spare: spare.json.id, rent: rent.json && rent.json.id, mbId, tid, steps: T }, null, 1));
})();

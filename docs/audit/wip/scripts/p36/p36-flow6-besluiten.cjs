// Besloten gedragsveranderingen die een medewerker merkt: B-14, B-08, B-15, B-04
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'LET OP') + ' | ' + n + ' | ' + ev); };
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const rnd = p => p + Math.floor(Math.random() * 9000 + 1000);
(async () => {
  const s = new Session('sweep'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const P = 'AUDIT-P36WB';
  const c = await s.post('/api/customers', { name: P, companyName: P + ' BV', debtorNumber: rnd('P36WB'), address: 'T', city: 'D', postalCode: '1234AB', phone: '0612349999', email: 'p36wb@example.invalid', status: 'active' });
  const v = await s.post('/api/vehicles', { licensePlate: rnd('P36B'), brand: P, model: 'Del', vehicleType: 'personenauto', currentMileage: 100, fuelType: 'benzine' });
  const r = await s.post('/api/reservations', { vehicleId: v.json.id, customerId: c.json.id, startDate: day(5), endDate: day(9), status: 'booked', type: 'standard' });
  step('0. fixtures', r.status === 201, 'klant=' + c.json.id + ' auto=' + v.json.id + ' huur=' + r.json.id);

  // B-14 — vehicle with a planned rental may not be deleted; impact list first
  const imp = await s.get('/api/vehicles/' + v.json.id + '/delete-impact');
  step('B-14a. impactlijst vóór verwijderen', imp.status === 200, 'HTTP ' + imp.status + ' ' + JSON.stringify(imp.json).slice(0, 250));
  const del = await s.del('/api/vehicles/' + v.json.id);
  step('B-14b. voertuig met geplande huur wordt geweigerd', del.status === 409 || del.status === 400,
    'HTTP ' + del.status + ' ' + (del.text || '').slice(0, 250));

  // B-08 — customer with a live/future rental may not be deleted
  const cimp = await s.get('/api/customers/' + c.json.id + '/delete-impact');
  step('B-08a. impactlijst klant', cimp.status === 200, 'HTTP ' + cimp.status + ' ' + JSON.stringify(cimp.json).slice(0, 250));
  const cdel = await s.del('/api/customers/' + c.json.id);
  step('B-08b. klant met lopende huur wordt geweigerd', cdel.status === 409 || cdel.status === 400, 'HTTP ' + cdel.status + ' ' + (cdel.text || '').slice(0, 250));

  // B-15 — recycle bin for reservations
  const rdel = await s.del('/api/reservations/' + r.json.id);
  step('B-15a. reservering verwijderen', rdel.status === 200 || rdel.status === 204, 'HTTP ' + rdel.status + ' ' + (rdel.text || '').slice(0, 200));
  const bin = await s.get('/api/reservations/deleted');
  const bl = Array.isArray(bin.json) ? bin.json : (bin.json && bin.json.data) || [];
  step('B-15b. staat in de prullenbak', bin.status === 200 && bl.some(x => x.id === r.json.id), 'HTTP ' + bin.status + ' n=' + bl.length + ' bevat=' + bl.some(x => x.id === r.json.id));
  const restore = await s.post('/api/reservations/' + r.json.id + '/restore', {});
  step('B-15c. terugzetten uit de prullenbak', restore.status === 200, 'HTTP ' + restore.status + ' ' + (restore.text || '').slice(0, 200));
  const back = await s.get('/api/reservations/' + r.json.id);
  step('B-15d. reservering weer actief', back.status === 200, 'HTTP ' + back.status + ' status=' + (back.json && back.json.status));

  // now the vehicle can go (no live rental left) - delete the reservation again first
  await s.del('/api/reservations/' + r.json.id);
  const del2 = await s.del('/api/vehicles/' + v.json.id);
  step('B-14c. voertuig zonder huur gaat naar de prullenbak', del2.status === 200 || del2.status === 204, 'HTTP ' + del2.status + ' ' + (del2.text || '').slice(0, 200));
  const vbin = await s.get('/api/vehicles/deleted');
  const vbl = Array.isArray(vbin.json) ? vbin.json : (vbin.json && vbin.json.data) || [];
  step('B-14d. voertuig in de prullenbak', vbl.some(x => x.id === v.json.id), 'n=' + vbl.length + ' bevat=' + vbl.some(x => x.id === v.json.id));

  // B-04 — cancel impact
  const r2 = await s.post('/api/reservations', { vehicleId: null, customerId: c.json.id, startDate: day(12), endDate: day(14), status: 'booked', type: 'standard' });
  if (r2.status === 201) {
    const ci = await s.get('/api/reservations/' + r2.json.id + '/cancel-impact');
    step('B-04. wat hangt er aan een annulering', ci.status === 200, 'HTTP ' + ci.status + ' ' + JSON.stringify(ci.json).slice(0, 300));
  } else { step('B-04. annuleringsimpact', false, 'kon geen tweede reservering maken: HTTP ' + r2.status + ' ' + r2.text.slice(0, 200)); }
  fs.writeFileSync(__dirname + '/flow6.json', JSON.stringify(T, null, 1));
})();

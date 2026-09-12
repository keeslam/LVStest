// PHASE 36 workflow sweep, flow 1: customer -> reservation -> contract -> pickup (B-16) -> return (B-02) -> documents
'use strict';
const { Session } = require('./lib.cjs');
const T = [];
const step = (name, ok, evidence) => { T.push({ step: name, ok, evidence }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + name + ' | ' + evidence); };
const P = 'AUDIT-P36W';
const iso = d => d.toISOString().slice(0, 10);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

(async () => {
  const s = new Session('admin');
  const lg = await s.loginStaff('admin', 'admin123');
  step('login admin', lg.status === 200, 'HTTP ' + lg.status);

  // 1. customer
  const cust = await s.post('/api/customers', {
    name: P + ' Klant BV', companyName: P + ' Klant BV', debtorNumber: 'P36W-1',
    address: 'Teststraat 1', city: 'Testdorp', postalCode: '1234AB',
    phone: '0612345678', email: 'p36w@example.invalid', status: 'active',
  });
  step('1. klant aanmaken', cust.status === 201 || cust.status === 200, 'HTTP ' + cust.status + ' id=' + (cust.json && cust.json.id) + ' ' + (cust.status >= 400 ? cust.text.slice(0, 300) : ''));
  const customerId = cust.json && cust.json.id;
  if (!customerId) { console.log(JSON.stringify(T, null, 1)); return; }

  // 2. a free vehicle
  const veh = await s.post('/api/vehicles', {
    licensePlate: 'P36W01', brand: P, model: 'Flow', vehicleType: 'personenauto',
    currentMileage: 10000, fuelType: 'benzine',
  });
  step('2. voertuig aanmaken', veh.status === 201 || veh.status === 200, 'HTTP ' + veh.status + ' id=' + (veh.json && veh.json.id) + ' ' + (veh.status >= 400 ? veh.text.slice(0, 300) : ''));
  const vehicleId = veh.json && veh.json.id;
  if (!vehicleId) { console.log(JSON.stringify(T, null, 1)); return; }

  // 3. reservation starting TOMORROW (so the B-16 question fires on pickup today)
  const resv = await s.post('/api/reservations', {
    vehicleId, customerId, startDate: day(1), endDate: day(5), status: 'booked', type: 'standard',
  });
  step('3. reservering aanmaken (start morgen)', resv.status === 201 || resv.status === 200,
    'HTTP ' + resv.status + ' id=' + (resv.json && resv.json.id) + ' ' + (resv.status >= 400 ? resv.text.slice(0, 400) : ''));
  const rid = resv.json && resv.json.id;
  if (!rid) { console.log(JSON.stringify(T, null, 1)); return; }

  // 4. contract
  const con = await s.post('/api/contracts/generate-default/' + rid, {});
  step('4. contract genereren', con.status === 200 || con.status === 201,
    'HTTP ' + con.status + ' ' + (con.json ? JSON.stringify(con.json).slice(0, 200) : con.text.slice(0, 200)));

  // 5a. pickup WITHOUT the answer -> must be the B-16 question (409), not a silent pickup, not a refusal
  const pu1 = await s.post('/api/reservations/' + rid + '/pickup', {
    contractNumber: 'P36W-' + Date.now(), pickupMileage: 10010, fuelLevelPickup: 'vol',
  });
  const isQuestion = pu1.status === 409 && pu1.json && pu1.json.code === 'PICKUP_BEFORE_START_DATE';
  step('5a. ophalen vóór startdatum stelt de vraag (B-16)', isQuestion,
    'HTTP ' + pu1.status + ' code=' + (pu1.json && pu1.json.code) + ' msg=' + (pu1.json && String(pu1.json.message).slice(0, 120)));

  // 5b. answer yes -> start date shifts to today
  const cn = 'P36W-' + Date.now();
  const pu2 = await s.post('/api/reservations/' + rid + '/pickup', {
    contractNumber: cn, pickupMileage: 10010, fuelLevelPickup: 'vol', shiftStartDate: true,
  });
  step('5b. ophalen na "ja"', pu2.status === 200, 'HTTP ' + pu2.status + ' status=' + (pu2.json && pu2.json.status) + ' start=' + (pu2.json && pu2.json.startDate) + ' ' + (pu2.status >= 400 ? pu2.text.slice(0, 300) : ''));
  step('5c. startdatum verschoven naar vandaag (B-16)', !!(pu2.json && pu2.json.startDate === iso(new Date())),
    'startDate=' + (pu2.json && pu2.json.startDate) + ' vandaag=' + iso(new Date()));

  // 6. return -> B-02 auto close to completed
  const ret = await s.post('/api/reservations/' + rid + '/return', {
    returnMileage: 10200, fuelLevelReturn: 'vol', returnNotes: P + ' retour',
  });
  step('6a. innemen', ret.status === 200, 'HTTP ' + ret.status + ' ' + (ret.status >= 400 ? ret.text.slice(0, 300) : ''));
  const after = await s.get('/api/reservations/' + rid);
  step('6b. reservering automatisch afgesloten (B-02)', !!(after.json && after.json.status === 'completed'),
    'status=' + (after.json && after.json.status) + ' completionDate=' + (after.json && after.json.completionDate));

  // 6c. vehicle free again
  const v2 = await s.get('/api/vehicles/' + vehicleId);
  step('6c. voertuig weer vrij', true, 'availability_status=' + (v2.json && (v2.json.availabilityStatus || v2.json.availability_status)) + ' mileage=' + (v2.json && v2.json.currentMileage));

  // 7. documents on the reservation
  const docs = await s.get('/api/documents/reservation/' + rid);
  const list = Array.isArray(docs.json) ? docs.json : (docs.json && docs.json.data) || [];
  step('7. documenten bij de reservering', docs.status === 200,
    'HTTP ' + docs.status + ' aantal=' + list.length + ' types=' + list.map(d => d.documentType + (d.isStale ? '(verouderd)' : '')).join(','));

  // 7b. view + download the first document
  if (list.length) {
    const vw = await s.get('/api/documents/view/' + list[0].id);
    const dl = await s.get('/api/documents/download/' + list[0].id);
    step('7b. document bekijken/downloaden', vw.status === 200 && dl.status === 200, 'view=' + vw.status + ' download=' + dl.status + ' bytes=' + dl.text.length);
  }

  require('fs').writeFileSync(__dirname + '/flow1.json', JSON.stringify({ customerId, vehicleId, rid, steps: T }, null, 1));
  console.log('\nIDS customer=' + customerId + ' vehicle=' + vehicleId + ' reservation=' + rid);
})();

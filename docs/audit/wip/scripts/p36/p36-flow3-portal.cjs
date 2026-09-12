// Flow 3: portaalaanvraag -> beoordeling door de balie
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
(async () => {
  const st = new Session('admin'); await st.loginStaff('audit-p36w', 'P36sweep!23');
  const p = new Session('portal'); const pl = await p.loginPortal('portaal-test@example.com', 'P36portal!23');
  step('0. portaal inloggen', pl.status === 200, 'HTTP ' + pl.status + ' klant=' + (pl.json && pl.json.customerId));

  // a vehicle the customer may book (online for the portal)
  const v = await st.post('/api/vehicles', { licensePlate: 'P36W' + Math.floor(Math.random()*9000+1000), brand: 'AUDIT-P36W6', model: 'Portaal', vehicleType: 'personenauto', currentMileage: 1, fuelType: 'benzine' });
  step('1. voertuig voor het portaal', v.status === 201, 'id=' + (v.json && v.json.id));
  const vid = v.json.id;
  const on = await st.patch('/api/portal-admin/vehicles-online/' + vid, { offeredOnline: true });
  step('1b. voertuig online zetten', on.status < 400, 'HTTP ' + on.status + ' ' + on.text.slice(0, 150));

  // 2. customer files a booking request
  const req = await p.post('/api/portal/requests', {
    type: 'booking', message: 'AUDIT-P36W6 graag deze auto',
    payload: JSON.stringify({ vehicleId: vid, startDate: day(30), endDate: day(33) }),
  });
  step('2. klant dient aanvraag in', req.status === 201 || req.status === 200,
    'HTTP ' + req.status + ' id=' + (req.json && req.json.id) + ' ' + (req.status >= 400 ? req.text.slice(0, 300) : ''));
  const reqId = req.json && req.json.id;
  if (!reqId) { fs.writeFileSync(__dirname + '/flow3.json', JSON.stringify(T, null, 1)); return; }

  // 3. staff sees it
  const inbox = await st.get('/api/portal-requests?status=new');
  const found = (Array.isArray(inbox.json) ? inbox.json : (inbox.json && inbox.json.data) || []).some(r => r.id === reqId);
  step('3a. aanvraag staat in de balie-inbox', inbox.status === 200 && found, 'HTTP ' + inbox.status + ' gevonden=' + found);
  const cnt = await st.get('/api/portal-requests/count-new');
  step('3b. teller nieuwe aanvragen', cnt.status === 200, 'HTTP ' + cnt.status + ' ' + JSON.stringify(cnt.json).slice(0, 120));

  // 4. take + approve
  const take = await st.post('/api/portal-requests/' + reqId + '/take', {});
  step('4a. aanvraag oppakken', take.status === 200, 'HTTP ' + take.status + ' ' + (take.status >= 400 ? take.text.slice(0, 200) : 'status=' + (take.json && take.json.status)));
  const ap = await st.post('/api/portal-requests/' + reqId + '/approve', { reply: 'AUDIT-P36W6 akkoord' });
  step('4b. aanvraag goedkeuren', ap.status === 200, 'HTTP ' + ap.status + ' ' + (ap.status >= 400 ? ap.text.slice(0, 300) : JSON.stringify(ap.json).slice(0, 250)));

  // 5. reservation now exists and the customer sees it
  const mine = await p.get('/api/portal/reservations');
  const list = Array.isArray(mine.json) ? mine.json : (mine.json && mine.json.data) || [];
  const made = list.filter(r => r.vehicleId === vid);
  step('5a. klant ziet de reservering', made.length > 0, 'HTTP ' + mine.status + ' n=' + made.length + ' ' + made.map(r => r.id + ':' + r.status + ':' + r.startDate).join(','));

  // 5b. B-06: portal notification for the customer
  const nots = await p.get('/api/portal/notifications');
  const nl = Array.isArray(nots.json) ? nots.json : (nots.json && nots.json.data) || [];
  step('5b. portaalmelding voor de klant (B-06)', nots.status === 200, 'HTTP ' + nots.status + ' n=' + nl.length + ' laatste=' + (nl[0] ? String(nl[0].title || nl[0].type).slice(0, 90) : '-'));

  // 6. request is closed
  const after = await st.get('/api/portal-requests/' + reqId);
  step('6. aanvraag afgehandeld', after.status === 200, 'status=' + (after.json && after.json.status));
  fs.writeFileSync(__dirname + '/flow3.json', JSON.stringify({ reqId, vid, steps: T }, null, 1));
})();

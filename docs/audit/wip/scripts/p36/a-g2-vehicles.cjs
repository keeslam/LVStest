const { Session } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const TS = F.ts;
const R = (l, v) => console.log('[' + l + '] ' + v);
(async () => {
  const a = new Session('admin', { fakeIp: '10.36.2.1' });
  await a.loginStaff('admin', 'admin123');

  // --- BUG-020 / BUG-058: license plate normalisation + format
  const base = 'P36A-020-' + TS.slice(-4);
  const r1 = await a.post('/api/vehicles', { licensePlate: base, brand: 'AUDIT-P36A', model: 'N' });
  R('020 create base "' + base + '"', r1.status + ' id=' + (r1.json && r1.json.id));
  const lower = base.replace(/-/g, '').toLowerCase();
  const r2 = await a.post('/api/vehicles', { licensePlate: lower, brand: 'AUDIT-P36A', model: 'N' });
  R('020 create lowercase-nodash "' + lower + '"', r2.status + ' ' + r2.text.slice(0, 140));
  const spaced = base.replace(/-/g, ' ');
  const r3 = await a.post('/api/vehicles', { licensePlate: spaced, brand: 'AUDIT-P36A', model: 'N' });
  R('020 create spaced "' + spaced + '"', r3.status + ' ' + r3.text.slice(0, 140));
  const rExact = await a.post('/api/vehicles', { licensePlate: base, brand: 'AUDIT-P36A', model: 'N' });
  R('020 create exact-dup', rExact.status + ' ' + rExact.text.slice(0, 100));

  const emoji = await a.post('/api/vehicles', { licensePlate: 'P36A-\u{1F697}-EMOJI-' + TS, brand: 'AUDIT-P36A', model: 'E' });
  R('058 emoji plate', emoji.status + ' ' + emoji.text.slice(0, 140));
  const longp = await a.post('/api/vehicles', { licensePlate: 'P36A-' + 'X'.repeat(500), brand: 'AUDIT-P36A', model: 'L' });
  R('058 500-char plate', longp.status + ' ' + longp.text.slice(0, 140));

  // --- BUG-021: availabilityStatus enum
  const st = await a.patch('/api/vehicles/' + F.v3, { availabilityStatus: 'banana_not_real' });
  R('021 PATCH availabilityStatus=banana_not_real', st.status + ' ' + st.text.slice(0, 160));

  // --- BUG-041: negative mileage
  const neg = await a.post('/api/vehicles', { licensePlate: 'P36A-NEG-' + TS, brand: 'AUDIT-P36A', model: 'N', departureMileage: -500, returnMileage: -20 });
  R('041 POST departureMileage=-500', neg.status + ' ' + neg.text.slice(0, 160));
  const negP = await a.patch('/api/vehicles/' + F.v2, { departureMileage: -999 });
  R('041 PATCH departureMileage=-999', negP.status + ' ' + negP.text.slice(0, 160));

  // --- BUG-042: impossible dates
  const d1 = await a.post('/api/vehicles', { licensePlate: 'P36A-D1-' + TS, brand: 'AUDIT-P36A', model: 'D', apkDate: '2026-02-30' });
  R('042 apkDate 2026-02-30', d1.status + ' ' + d1.text.slice(0, 160));
  const d2 = await a.post('/api/vehicles', { licensePlate: 'P36A-D2-' + TS, brand: 'AUDIT-P36A', model: 'D', apkDate: '99999-01-01' });
  R('042 apkDate 99999-01-01', d2.status + ' ' + d2.text.slice(0, 160));

  // --- BUG-044: whitespace customer name
  const ws = await a.post('/api/customers', { name: '   ', email: 'p36a-ws-' + TS + '@example.com' });
  R('044 customer name="   "', ws.status + ' ' + ws.text.slice(0, 160));

  // --- BUG-059: long customer name
  const ln = await a.post('/api/customers', { name: 'AUDIT-P36A-' + 'A'.repeat(5000), email: 'p36a-long-' + TS + '@example.com' });
  R('059 customer name 5000 chars', ln.status + ' ' + ln.text.slice(0, 160));

  // --- BUG-045: duplicate debtorNumber
  const deb = 'AUDIT-P36A-DEB-' + TS;
  const db1 = await a.post('/api/customers', { name: 'AUDIT-P36A-Deb1-' + TS, debtorNumber: deb, email: 'p36a-d1-' + TS + '@example.com' });
  const db2 = await a.post('/api/customers', { name: 'AUDIT-P36A-Deb2-' + TS, debtorNumber: deb, email: 'p36a-d2-' + TS + '@example.com' });
  R('045 dup debtorNumber first', db1.status + ' id=' + (db1.json && db1.json.id));
  R('045 dup debtorNumber second', db2.status + ' ' + db2.text.slice(0, 160));

  // --- BUG-007: customer delete with booked reservation (B-08)
  const cc = await a.post('/api/customers', { name: 'AUDIT-P36A-DelCust-' + TS, email: 'p36a-dc-' + TS + '@example.com' });
  const ccId = cc.json && cc.json.id;
  R('007 make customer', cc.status + ' id=' + ccId);
  const cr = await a.post('/api/reservations', { vehicleId: F.v2, customerId: ccId, startDate: '2027-11-01', endDate: '2027-11-05', status: 'booked', type: 'standard' });
  R('007 make booked reservation', cr.status + ' id=' + (cr.json && cr.json.id));
  const imp = await a.get('/api/customers/' + ccId + '/delete-impact');
  R('007 GET delete-impact', imp.status + ' ' + imp.text.slice(0, 220));
  const del = await a.del('/api/customers/' + ccId);
  R('007 DELETE customer w/ booked res', del.status + ' ' + del.text.slice(0, 220));
  require('fs').writeFileSync('a-g2-ids.json', JSON.stringify({ ccId, ccRes: cr.json && cr.json.id, v020: r1.json && r1.json.id }, null, 1));
})();

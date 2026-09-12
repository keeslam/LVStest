const http = require('http');
const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const out = {};

function raw(method, path, body, cookie, csrf) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port: 5003, path, method,
      agent: new http.Agent({ keepAlive: false }),
      headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
        payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, text: d })); });
    req.on('error', (e) => resolve({ status: 'ERR', text: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-006: 20 concurrent identical POST /api/reservations
  const v6 = await veh(a, 'K');
  const cookie = a.cookieHeader();
  const csrf = a.csrf;
  const body = { vehicleId: v6, customerId: F.c1, startDate: '2027-10-01', endDate: '2027-10-05', type: 'standard' };
  const results = await Promise.all(Array.from({ length: 20 }, () => raw('POST', '/api/reservations', body, cookie, csrf)));
  const tally = {};
  results.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1; });
  R('006 20 concurrent POST statuses', JSON.stringify(tally));
  R('006 sample non-201', JSON.stringify(results.filter(r => r.status !== 201).slice(0, 2).map(r => r.text.slice(0, 120))));
  out.b006 = { v6 };

  // --- BUG-043: 10 concurrent restores of the same deleted_records row
  const v43 = await veh(a, 'L');
  const plate = (await a.get('/api/vehicles/' + v43)).json.licensePlate;
  const del = await a.del('/api/vehicles/' + v43, { confirmLicensePlate: plate });
  R('043 delete vehicle', del.status + ' ' + del.text.slice(0, 140));
  const drs = await a.get('/api/deleted-records');
  const arr = drs.json && (Array.isArray(drs.json) ? drs.json : drs.json.data || []);
  const rec = (arr || []).find(x => String(x.recordData && (x.recordData.licensePlate || x.recordData.license_plate)) === plate
    || String(x.data && x.data.licensePlate) === plate || String(x.licensePlate) === plate);
  R('043 deleted-records lookup', drs.status + ' found=' + (rec && rec.id) + ' total=' + (arr ? arr.length : '?'));
  if (rec) {
    const rr = await Promise.all(Array.from({ length: 10 }, () => raw('POST', '/api/deleted-records/' + rec.id + '/restore', {}, cookie, csrf)));
    const t2 = {};
    rr.forEach(r => { t2[r.status] = (t2[r.status] || 0) + 1; });
    R('043 10 concurrent restores', JSON.stringify(t2));
    R('043 sample bodies', JSON.stringify(rr.map(r => r.status + ':' + r.text.slice(0, 60)).slice(0, 4)));
    out.b043 = { recId: rec.id, v43 };
  }

  require('fs').writeFileSync('a-g8-ids.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });

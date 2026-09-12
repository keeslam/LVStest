const http = require('http');
const { admin, veh, R, F, TS } = require('./a-lib.cjs');
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
  const recId = Number(process.argv[2]);
  R('043 restore record', recId);
  const rr = await Promise.all(Array.from({ length: 10 }, () => raw('POST', '/api/deleted-records/' + recId + '/restore', {}, a.cookieHeader(), a.csrf)));
  const t = {};
  rr.forEach(r => { t[r.status] = (t[r.status] || 0) + 1; });
  R('043 10 concurrent restores', JSON.stringify(t));
  R('043 bodies', JSON.stringify(rr.map(r => r.status + ':' + r.text.slice(0, 80))));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

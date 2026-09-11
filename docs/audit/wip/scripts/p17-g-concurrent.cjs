// Phase 17 (g): restore while another session keeps writing (POST /api/vehicles loop).
// usage: node p17-g-concurrent.cjs <backup filename>
'use strict';
const { Session } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const filename = process.argv[2];
  const writer = new Session('w', { fakeIp: '10.17.1.201' });
  const restorer = new Session('r', { fakeIp: '10.17.1.202' });
  console.log('login writer', (await writer.loginStaff('admin', 'admin123')).status, 'restorer', (await restorer.loginStaff('admin', 'admin123')).status);

  const results = [];
  let stop = false; let i = 0;
  const loop = (async () => {
    while (!stop) {
      const n = i++;
      const t = Date.now();
      try {
        const r = await writer.post('/api/vehicles', { licensePlate: `AU-17G${String(n).padStart(3, '0')}-X`, brand: 'AUDIT-P17-conc', model: 'W' + n, vehicleType: 'Personenauto' });
        results.push({ n, t: t - t0, ms: Date.now() - t, status: r.status, body: (r.text || '').slice(0, 120) });
      } catch (e) {
        results.push({ n, t: t - t0, ms: Date.now() - t, status: 'EXC', body: String(e.message) });
      }
      await new Promise(res => setTimeout(res, 100));
    }
  });
  const t0 = Date.now();
  const writerP = loop();
  await new Promise(res => setTimeout(res, 1500));
  const tr = Date.now();
  const rest = await restorer.post('/api/backups/restore/database', { filename, confirmFilename: filename });
  const restoreMs = Date.now() - tr;
  console.log('restore', rest.status, restoreMs + 'ms', (rest.text || '').slice(0, 300));
  await new Promise(res => setTimeout(res, 3000));
  stop = true; await writerP;
  const summary = {};
  for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
  console.log('writer results by status', JSON.stringify(summary), 'total', results.length);
  const interesting = results.filter(r => r.status !== 201);
  console.log('non-201 samples:', JSON.stringify(interesting.slice(0, 8), null, 0));
  const slow = results.filter(r => r.ms > 1000).map(r => ({ n: r.n, t: r.t, ms: r.ms, status: r.status }));
  console.log('slow (>1s):', JSON.stringify(slow.slice(0, 10)));
  fs.writeFileSync(path.join(__dirname, 'files/p17/g-concurrent.json'), JSON.stringify({ restore: { status: rest.status, restoreMs, body: rest.json }, results }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });

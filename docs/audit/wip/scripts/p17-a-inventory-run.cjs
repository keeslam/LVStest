// Phase 17 (a): route/settings inventory + first manual backup run on :5002.
'use strict';
const { Session } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const s = new Session('p17a', { fakeIp: '10.17.1.1' });
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);

  const out = {};
  for (const p of ['/api/backup-settings', '/api/backups/status', '/api/backups/health', '/api/backups/list', '/api/backups', '/api/backups/list?type=database&limit=3']) {
    const r = await s.get(p);
    out[p] = { status: r.status, body: r.json ?? r.text.slice(0, 300) };
    console.log(p, r.status, JSON.stringify(r.json ?? r.text.slice(0, 300)).slice(0, 600));
  }

  // manual run (timed)
  const t0 = Date.now();
  const run = await s.post('/api/backups/run', {});
  const ms = Date.now() - t0;
  console.log('POST /api/backups/run', run.status, ms + 'ms');
  console.log(JSON.stringify(run.json, null, 1).slice(0, 2000));
  out.run = { status: run.status, ms, body: run.json };

  const status2 = await s.get('/api/backups/status');
  const health2 = await s.get('/api/backups/health');
  const list2 = await s.get('/api/backups/list');
  console.log('status after', JSON.stringify(status2.json));
  console.log('health after', JSON.stringify(health2.json));
  console.log('list after', JSON.stringify(list2.json, null, 1).slice(0, 1500));
  out.after = { status: status2.json, health: health2.json, list: list2.json };
  fs.writeFileSync(path.join(__dirname, 'files/p17/a-results.json'), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

// Phase 17 (9): two POST /api/backups/run fired at the same instant (two sessions).
'use strict';
const { Session } = require('./p17-lib.cjs');
const fs = require('fs');
(async () => {
  const a = new Session('a', { fakeIp: '10.17.1.50' }); const b = new Session('b', { fakeIp: '10.17.1.51' });
  console.log('login', (await a.loginStaff('admin', 'admin123')).status, (await b.loginStaff('admin', 'admin123')).status);
  const before = fs.readdirSync('C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-backups\\database\\2026\\09\\10').length;
  const t0 = Date.now();
  const [ra, rb] = await Promise.all([a.post('/api/backups/run', {}), b.post('/api/backups/run', {})]);
  console.log('A', ra.status, (ra.text || '').slice(0, 140));
  console.log('B', rb.status, (rb.text || '').slice(0, 140));
  console.log('elapsed', Date.now() - t0, 'ms');
  const st = await a.get('/api/backups/status'); console.log('status', st.text.slice(0, 200));
  const after = fs.readdirSync('C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-backups\\database\\2026\\09\\10').length;
  console.log('new entries in database/2026/09/10:', after - before, '(1 archive + 1 manifest per run)');
  // status while running: fire run and poll status immediately
  const p = a.post('/api/backups/run', {});
  await new Promise(r => setTimeout(r, 300));
  const s2 = await b.get('/api/backups/status'); console.log('status during run', s2.text.slice(0, 120));
  const r3 = await b.post('/api/backups/run', {}); console.log('third run during first', r3.status, (r3.text || '').slice(0, 100));
  const pr = await p; console.log('first run finished', pr.status);
})().catch(e => { console.error(e); process.exit(1); });

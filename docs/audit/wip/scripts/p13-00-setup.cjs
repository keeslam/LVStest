// Phase 13 setup: sessions + shared fixtures.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-00-setup');
  rep.step('health before', await L.health());
  const admin = await L.getSession('admin');
  const admin2 = await L.getSession('admin2');
  let mgr = null;
  try { mgr = await L.getSession('mgr'); } catch (e) { rep.step('mgr login failed', { error: e.message }); }
  rep.step('sessions', { admin: (await admin.get('/api/user')).json.username, admin2: (await admin2.get('/api/user')).json.username, mgr: mgr ? (await mgr.get('/api/user')).json.username : null });

  const ids = L.loadIds();
  for (let i = 1; i <= 12; i++) {
    await L.ensureVehicle(admin, ids, `v${i}`, `AU-13${String(i).padStart(2, '0')}-X`, `P13-V${i}`);
  }
  for (let i = 1; i <= 3; i++) {
    await L.ensureCustomer(admin, ids, `c${i}`, `AUDIT-P13 customer ${i}`);
  }
  L.saveIds(ids);
  rep.step('fixtures', ids);
  rep.step('health after', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

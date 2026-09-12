// BUG-002 / BUG-061 / BUG-101 — process-kill regression check against :5003
'use strict';
const { Session } = require('./lib.cjs');
const out = [];
async function uptime() {
  try { const r = await fetch('http://127.0.0.1:5003/health'); const j = await r.json(); return j.uptime; }
  catch (e) { return null; }
}
(async () => {
  const u0 = await uptime(); out.push(['uptime.before', u0]);

  // ---- BUG-061: GET /api/portal-admin/customers/999999999/settings as admin
  const s = new Session('admin'); const lg = await s.loginStaff('admin', 'admin123');
  out.push(['login', lg.status]);
  let r61;
  try { r61 = await s.get('/api/portal-admin/customers/999999999/settings'); out.push(['BUG-061.status', r61.status, r61.text.slice(0,200)]); }
  catch (e) { out.push(['BUG-061.ERROR', String(e)]); }
  const u1 = await uptime(); out.push(['uptime.after061', u1, u1 !== null && u0 !== null && u1 > u0 ? 'NO-RESTART' : 'RESTARTED-OR-DOWN']);
  const probe1 = await s.get('/api/vehicles?limit=1'); out.push(['normal.after061', probe1.status]);

  // ---- BUG-002: portal request with non-JSON payload
  // find a portal user
  const pu = new Session('portal');
  let portalLogin = await pu.loginPortal('portaal-test@example.com', 'P36portal!23');
  out.push(['portal.login', portalLogin.status, portalLogin.text.slice(0,160)]);
  if (portalLogin.status === 200) {
    let r2;
    try { r2 = await pu.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P36 kill test', payload: 'not-json-at-all' }); out.push(['BUG-002.status', r2.status, r2.text.slice(0,250)]); }
    catch (e) { out.push(['BUG-002.ERROR', String(e)]); }
    const me = await pu.get('/api/portal/me'); out.push(['portal.me.after002', me.status]);
  } else { out.push(['BUG-002', 'SKIPPED - no portal login']); }
  const u2 = await uptime(); out.push(['uptime.after002', u2, u2 !== null && u1 !== null && u2 > u1 ? 'NO-RESTART' : 'RESTARTED-OR-DOWN']);
  const probe2 = await s.get('/api/vehicles?limit=1'); out.push(['normal.after002', probe2.status]);
  const h = await s.get('/health'); out.push(['health.final', h.status]);
  console.log(JSON.stringify(out, null, 1));
})();

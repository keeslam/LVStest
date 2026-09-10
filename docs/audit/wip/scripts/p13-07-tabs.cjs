// Phase 13 test 9: multiple browser tabs sharing ONE session cookie: logout while another
// tab is mid-request, parallel password change from two tabs, admin deactivation vs live session.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-07-tabs');
  const admin = await L.getSession('admin');
  const ids = L.loadIds();
  const ts = Date.now();
  const PW = 'TabsPass123!';
  const uname = `AUDIT-P13-tabs-${ts}`;
  const cu = await admin.post('/api/users', { username: uname, password: PW, role: 'user', permissions: ['manage_reservations', 'view_reservations', 'manage_vehicles', 'view_vehicles', 'manage_documents', 'view_customers'], active: true });
  if (cu.status !== 201) throw new Error('user create ' + cu.status + ' ' + cu.text);
  const uid = cu.json.id;
  const R = await L.createReservation(admin, { vehicleId: ids.v12, customerId: ids.c1, startDate: '2030-05-01', endDate: '2030-05-03', notes: 'AUDIT-P13 tabs' });

  let ipN = 10;
  async function loginTabs() {
    const t1 = new L.Session('tab1', { fakeIp: `10.13.9.${ipN++}` });
    const r = await t1.loginStaff(uname, PW);
    if (r.status !== 200) throw new Error('tab login ' + r.status + ' ' + r.text);
    const t2 = new L.Session('tab2', { fakeIp: t1.fakeIp });
    for (const [k, v] of t1.cookies) t2.cookies.set(k, v);
    t2.csrf = t1.csrf;
    return { t1, t2 };
  }

  // 9a tab2 fires a slow request (contract PDF, ~200-300 ms); tab1 logs out 20 ms later
  {
    const { t1, t2 } = await loginTabs();
    const docsBefore = (await L.docsFor(R.id)).length;
    const res = await L.burst([
      { sess: t2, method: 'GET', path: `/api/contracts/generate/${R.id}`, label: 'tab2 slow GET contract', delayMs: 0 },
      { sess: t1, method: 'POST', path: '/api/logout', label: 'tab1 logout', delayMs: 20 },
    ]);
    const after = await t2.get('/api/user');
    rep.step('9a logout in tab1 while tab2 is mid-request', { res: L.brief(res, 120), docsBefore, docsAfter: (await L.docsFor(R.id)).length, tab2AfterLogout: after.status, note: 'in-flight request already passed auth; it completes and writes its document row - expected for a session model, recorded for completeness' });
  }
  // 9b tab2 PATCH and tab1 logout in the same tick, 5 rounds
  {
    const rounds = [];
    for (let i = 0; i < 4; i++) {
      const { t1, t2 } = await loginTabs();
      const res = await L.burst([
        { sess: t1, method: 'POST', path: '/api/logout', label: 'logout', delayMs: 0 },
        { sess: t2, method: 'PATCH', path: `/api/reservations/${R.id}`, body: { notes: `AUDIT-P13 tabs 9b round ${i}` }, label: 'patch', delayMs: 0 },
      ]);
      rounds.push({ round: i, res: res.map((r) => `${r.label}:${r.status}`), notes: (await L.resRow(R.id)).notes });
    }
    rep.step('9b logout || PATCH from the same session, same tick', { rounds });
  }
  // 9c password change from two tabs in parallel with different new passwords
  {
    const { t1, t2 } = await loginTabs();
    const res = await L.burst([
      { sess: t1, method: 'POST', path: '/api/users/change-password', body: { currentPassword: PW, newPassword: 'TabsNewA123!' }, label: 'tab1 -> A' },
      { sess: t2, method: 'POST', path: '/api/users/change-password', body: { currentPassword: PW, newPassword: 'TabsNewB123!' }, label: 'tab2 -> B' },
    ]);
    const tryA = await L.rawRequest(null, 'POST', '/api/login', { username: uname, password: 'TabsNewA123!' }, { headers: { 'X-Forwarded-For': '10.13.9.101' } });
    const tryB = await L.rawRequest(null, 'POST', '/api/login', { username: uname, password: 'TabsNewB123!' }, { headers: { 'X-Forwarded-For': '10.13.9.102' } });
    rep.step('9c parallel change-password from two tabs (same current password, different new)', { res: L.brief(res, 140), dist: L.dist(res), loginWithA: tryA.status, loginWithB: tryB.status, verdict: res.filter((r) => r.status === 200).length === 2 ? 'both accepted: current-password check is check-then-write; the user was told both succeeded, only one works' : 'second rejected' });
    // reset password for the following tests
    await admin.patch(`/api/users/${uid}/admin`, { password: PW });
  }
  // 9d admin deactivates the user while a tab has a session
  {
    const { t1 } = await loginTabs();
    const before = await t1.get('/api/user');
    const de = await admin.patch(`/api/users/${uid}/admin`, { active: false });
    const after = await t1.get('/api/user');
    const write = await t1.patch(`/api/reservations/${R.id}`, { notes: 'AUDIT-P13 tabs 9d written after deactivation' });
    const relogin = await L.rawRequest(null, 'POST', '/api/login', { username: uname, password: PW }, { headers: { 'X-Forwarded-For': '10.13.9.103' } });
    rep.step('9d admin sets active=false while the user has a live session', { before: before.status, deactivate: de.status, getUserAfter: after.status, writeAfter: write.status, notesNow: (await L.resRow(R.id)).notes, freshLogin: { status: relogin.status, body: relogin.text.slice(0, 100) } });
    await admin.patch(`/api/users/${uid}/admin`, { active: true });
  }
  // 9e admin changes the user's permissions while the session is live (does the live session pick it up?)
  {
    const { t1 } = await loginTabs();
    const a = await t1.get('/api/reservations/' + R.id);
    const pe = await admin.patch(`/api/users/${uid}/admin`, { permissions: ['view_vehicles'] });
    const b = await t1.get('/api/reservations/' + R.id);
    const c = await t1.patch(`/api/reservations/${R.id}`, { notes: 'AUDIT-P13 tabs 9e after permission removal' });
    rep.step('9e admin removes manage_reservations while session live', { before: a.status, permChange: pe.status, getAfter: b.status, patchAfter: c.status, note: 'deserializeUser reloads the user row per request, so permission changes should apply immediately' });
    await admin.patch(`/api/users/${uid}/admin`, { permissions: ['manage_reservations', 'view_reservations'] });
  }

  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

// P36 agent D — BUG-161: concurrent password burst vs account lockout
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const st = await L.staff('10.36.4.38');
  const uname = 'AUDIT-P36D-lock1';
  const pw = 'AuditP36D!lock1';
  let uid;
  const ex = await L.q('select id from users where username=$1', [uname]);
  if (ex[0]) { uid = ex[0].id; await st.patch('/api/users/' + uid, { password: pw, active: true }); }
  else {
    const r = await st.post('/api/users', { username: uname, password: pw, fullName: 'AUDIT P36D lock', email: 'audit-p36d-lock@example.invalid', role: 'user', permissions: ['view_vehicles'], active: true });
    if (r.status >= 300) { console.log('create user failed', L.short(r, 300)); process.exit(1); }
    uid = r.json.id;
  }
  // clear previous attempts so the window starts clean
  await L.q('delete from login_attempts where username=$1', [uname]);

  const N = 20;
  const sessions = [];
  for (let i = 0; i < N; i++) sessions.push(new L.Session('burst' + i, { fakeIp: '10.36.61.' + (i + 1) }));
  const t0 = Date.now();
  const results = await Promise.all(sessions.map((s) => s.post('/api/login', { username: uname, password: 'wrong-password-' + Math.random() })));
  const ms = Date.now() - t0;
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const bodies = {};
  for (const r of results) { const k = r.status + ': ' + r.text.slice(0, 60); bodies[k] = (bodies[k] || 0) + 1; }

  const attempts = await L.q('select count(*)::int c, sum(case when success then 1 else 0 end)::int ok from login_attempts where username=$1', [uname]);
  // now try the CORRECT password from a fresh IP inside the same window
  const good = new L.Session('good', { fakeIp: '10.36.61.200' });
  const gr = await good.post('/api/login', { username: uname, password: pw });

  const out = { user: uname, parallel: N, ms, statusCounts: counts, bodyCounts: bodies,
                loginAttemptRows: attempts[0], correctLoginAfterBurst: { status: gr.status, body: gr.text.slice(0, 160) } };
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-15-lockout.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

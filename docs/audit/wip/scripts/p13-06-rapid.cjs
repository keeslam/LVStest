// Phase 13 test 8: rapid repeated requests (30x same PATCH, 30x login incl. lockout interplay, 30x heavy GETs) + pool watch.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-06-rapid');
  const admin = await L.getSession('admin');
  const ids = L.loadIds();
  const ts = Date.now();
  const stats = (res) => { const ms = res.map((r) => r.ms).sort((a, b) => a - b); return { min: ms[0], p50: ms[Math.floor(ms.length / 2)], max: ms[ms.length - 1] }; };

  // 8a 30x same PATCH on one reservation
  const R = await L.createReservation(admin, { vehicleId: ids.v12, customerId: ids.c1, startDate: '2030-04-01', endDate: '2030-04-03', notes: 'AUDIT-P13 rapid' });
  let res = await L.burst(Array.from({ length: 30 }, (_, i) => ({ sess: admin, method: 'PATCH', path: `/api/reservations/${R.id}`, body: { notes: `AUDIT-P13 rapid ${i}` }, label: 'p' + i })));
  rep.step('8a 30x parallel PATCH same reservation', { dist: L.dist(res), timing: stats(res), final: (await L.resRow(R.id)).notes, health: await L.health() });

  // 8b throwaway users for login bursts
  async function mkUser(tag) {
    const u = { username: `AUDIT-P13-${tag}-${ts}`, password: 'RapidPass123!' };
    const r = await admin.post('/api/users', { ...u, role: 'user', permissions: ['view_vehicles'], active: true });
    if (r.status !== 201) throw new Error('user create failed ' + r.status + ' ' + r.text.slice(0, 200));
    u.id = r.json.id; return u;
  }
  const loginReq = (username, password, ip, i) => ({ sess: null, method: 'POST', path: '/api/login', body: { username, password }, label: 'login' + i, opts: { headers: { 'X-Forwarded-For': ip } } });
  const attempts = (u) => L.q('select success, failure_reason, count(*)::int n from login_attempts where username=$1 group by 1,2 order by 1,2', [u]);

  // 8b1: 30 parallel WRONG passwords, 30 distinct source IPs (per-IP limiter out of the way, BUG-009) -> is the per-account lockout (5) enforced during the burst?
  const u1 = await mkUser('lock1');
  res = await L.burst(Array.from({ length: 30 }, (_, i) => loginReq(u1.username, 'wrong-' + i, `10.13.6.${i + 1}`, i)));
  const after1 = await attempts(u1.username);
  const probe1 = await L.rawRequest(null, 'POST', '/api/login', { username: u1.username, password: u1.password }, { headers: { 'X-Forwarded-For': '10.13.6.99' } });
  rep.step('8b1 30x parallel wrong password, 30 distinct IPs, one account', { dist: L.dist(res), timing: stats(res), sample401: res.find((r) => r.status === 401) && res.find((r) => r.status === 401).text, sample429: res.find((r) => r.status === 429) && res.find((r) => r.status === 429).text, login_attempts: after1, correctPasswordAfterwards: { status: probe1.status, body: probe1.text.slice(0, 120) }, verdict: res.filter((r) => r.status === 401).length > 5 ? `LOCKOUT RACE: ${res.filter((r) => r.status === 401).length} password guesses were evaluated before the 5-attempt lock took effect` : 'lockout held at 5' });

  // 8b2: 30 parallel wrong passwords from ONE IP (loginLimiter memory store)
  const u2 = await mkUser('lock2');
  res = await L.burst(Array.from({ length: 30 }, (_, i) => loginReq(u2.username, 'wrong-' + i, '10.13.7.1', i)));
  rep.step('8b2 30x parallel wrong password, same IP', { dist: L.dist(res), timing: stats(res), login_attempts: await attempts(u2.username) });

  // 8b3: 30 parallel CORRECT logins, same IP (skipSuccessfulRequests) -> 30 sessions?
  const u3 = await mkUser('multi');
  res = await L.burst(Array.from({ length: 30 }, (_, i) => loginReq(u3.username, u3.password, '10.13.7.2', i)));
  const sessRows = await L.q(`select count(*)::int n from session where sess::text like $1`, [`%"passport":{"user":${u3.id}}%`]);
  const activeRows = await L.q('select count(*)::int n from active_sessions where user_id=$1', [u3.id]).catch(() => [{ n: 'n/a' }]);
  rep.step('8b3 30x parallel correct login, same IP', { dist: L.dist(res), timing: stats(res), sessionRowsForUser: sessRows[0].n, activeSessionsRows: activeRows[0].n, health: await L.health() });

  // 8c 30x heavy GETs with /health polled during the burst
  const healthLog = [];
  const poll = (async () => { for (const d of [0, 50, 100, 200, 400, 800, 1500]) { await L.sleep(d); healthLog.push({ t: Date.now() - ts, h: await L.health() }); } })();
  for (const p of ['/api/reservations', '/api/vehicles', '/api/portal-admin/dashboard', '/api/reservations/upcoming', '/api/customers']) {
    const r = await L.burst(Array.from({ length: 30 }, (_, i) => ({ sess: admin, method: 'GET', path: p, label: 'g' + i, opts: { timeoutMs: 120000 } })));
    rep.step(`8c 30x parallel GET ${p}`, { dist: L.dist(r), timing: stats(r), bytes: r[0].bytes, errors: r.filter((x) => x.status !== 200).map((x) => ({ status: x.status, body: (x.text || x.error || '').slice(0, 160) })) });
  }
  await poll;
  // sequential baseline
  const base = {};
  for (const p of ['/api/reservations', '/api/vehicles', '/api/portal-admin/dashboard']) { const r = await L.rawRequest(admin, 'GET', p); base[p] = r.ms; }
  rep.step('8c health during bursts + single-request baseline', { healthLog: healthLog.map((h) => ({ t: h.t, status: h.h.status, pool: h.h.pool })), baselineMs: base });

  // 8d 30x parallel POST /api/session/heartbeat + 30x GET /api/user (cheap, session store contention)
  res = await L.burst(Array.from({ length: 30 }, (_, i) => ({ sess: admin, method: i % 2 ? 'POST' : 'GET', path: i % 2 ? '/api/session/heartbeat' : '/api/user', label: 'h' + i })));
  rep.step('8d 30x session store hits', { dist: L.dist(res), timing: stats(res) });

  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

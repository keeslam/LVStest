const { Session } = require('./lib.cjs');
const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const out = {};
(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-002: malformed payload string in POST /api/portal/requests
  const p = new Session('portal', { fakeIp: '10.36.6.11' });
  const pl = await p.loginPortal('portaal-test@example.com', 'P36portal!23');
  R('002 portal login', pl.status + ' ' + pl.text.slice(0, 120));
  const crash = await p.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P36A crash probe', payload: 'not-json-at-all' })
    .catch(e => ({ status: 'ECONNRESET/' + e.message, text: '' }));
  R('002 POST /api/portal/requests payload="not-json-at-all"', crash.status + ' ' + String(crash.text).slice(0, 200));
  const alive = await p.get('/api/portal/me').catch(e => ({ status: 'DEAD:' + e.message, text: '' }));
  R('002 server alive after?', alive.status);

  // --- BUG-009: login rate limiter vs X-Forwarded-For
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const s = new Session('xff' + i, { fakeIp: '203.0.113.' + (10 + i) });
    const r = await s.post('/api/login', { username: 'p36a_nonexistent_user', password: 'wrong-' + i }, { });
    codes.push(r.status);
  }
  R('009 8 logins w/ 8 different XFF', JSON.stringify(codes));
  const codes2 = [];
  for (let i = 0; i < 8; i++) {
    const s = new Session('xff2', { fakeIp: '198.51.100.77' });
    const r = await s.post('/api/login', { username: 'p36a_nonexistent2', password: 'wrong-' + i });
    codes2.push(r.status);
  }
  R('009 8 logins same XFF (baseline)', JSON.stringify(codes2));

  // --- BUG-008: lockout duration
  const lockUser = 'p36a_lock_' + TS.slice(-4);
  const mk = await a.post('/api/users', { username: lockUser, password: 'P36apw!23', role: 'user', permissions: [] });
  R('008 create lock target', mk.status);
  let lastBody = '';
  for (let i = 0; i < 7; i++) {
    const s = new Session('lock', { fakeIp: '192.0.2.' + (100 + i) });
    const r = await s.post('/api/login', { username: lockUser, password: 'definitely-wrong' });
    lastBody = r.status + ' ' + r.text.slice(0, 220);
  }
  R('008 after 7 failures', lastBody);

  // --- BUG-047: CSRF token from login usable on the next request
  const cs = new Session('csrf', { fakeIp: '10.36.6.47' });
  const lr = await cs.loginStaff('p36a_adm6', 'admin123', { skipPrime: true });
  R('047 login', lr.status + ' tokenSet=' + !!cs.csrf);
  const firstMutating = await cs.post('/api/customers', { name: 'AUDIT-P36A-CSRF-' + TS, email: 'p36a-csrf-' + TS + '@example.com' });
  R('047 first mutating call with login token', firstMutating.status + ' ' + firstMutating.text.slice(0, 160));

  // --- BUG-024: password reuse / new == current
  const pwUser = 'p36a_pw_' + TS.slice(-4);
  await a.post('/api/users', { username: pwUser, password: 'P36apw!23', role: 'user', permissions: [] });
  const pu = new Session('pw', { fakeIp: '10.36.6.24' });
  R('024 login', (await pu.loginStaff(pwUser, 'P36apw!23')).status);
  const same = await pu.post('/api/users/change-password', { currentPassword: 'P36apw!23', newPassword: 'P36apw!23' });
  R('024 change-password new==current', same.status + ' ' + same.text.slice(0, 200));
  const ch1 = await pu.post('/api/users/change-password', { currentPassword: 'P36apw!23', newPassword: 'P36apw!24' });
  R('024 change A->B', ch1.status + ' ' + ch1.text.slice(0, 140));
  const ch2 = await pu.post('/api/users/change-password', { currentPassword: 'P36apw!24', newPassword: 'P36apw!23' });
  R('024 change B->A (reuse)', ch2.status + ' ' + ch2.text.slice(0, 200));
  out.pwUser = pwUser;

  // --- BUG-026: /uploads static mount vs UPLOADS_DIR
  const v26 = await veh(a, 'U');
  const r26 = await res(a, v26, '2026-09-01', '2027-01-05');
  await a.post('/api/reservations/' + r26 + '/pickup', PU('P36A-U-' + TS));
  const gen = await a.get('/api/contracts/generate/' + r26);
  R('026 generate contract', gen.status);
  const docs = await a.get('/api/documents/reservation/' + r26);
  const dl = docs.json && docs.json[0];
  R('026 document filePath', dl && dl.filePath);
  if (dl) {
    const rel = String(dl.filePath).replace(/\\/g, '/');
    const u = await a.get('/uploads/' + rel.replace(/^(\.\.\/)*/, '').replace(/^documents\//, 'documents/'));
    R('026 GET /uploads/<relpath>', u.status + ' len=' + u.text.length + ' isHtml=' + /<!DOCTYPE html|<html/i.test(u.text));
    const d2 = await a.get('/api/documents/download/' + dl.id);
    R('026 GET /api/documents/download/:id', d2.status + ' len=' + d2.text.length);
  }
  out.b026 = { v26, r26, docId: dl && dl.id, filePath: dl && dl.filePath };

  // --- BUG-027: verify distinct physical files per generation
  const all = docs.json || [];
  R('027 doc rows for res ' + r26, JSON.stringify(all.map(d => ({ id: d.id, fp: d.filePath, stale: d.isStale, v: d.version }))).slice(0, 600));

  require('fs').writeFileSync('a-g6-ids.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });

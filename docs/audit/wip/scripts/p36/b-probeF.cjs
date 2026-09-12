// BUG-078 CSP, BUG-087 CSP injection, BUG-093 /health, BUG-096 anon session/CSRF,
// BUG-091 password change revokes sessions, BUG-095 logout clears active_sessions,
// BUG-082 X-Forwarded-For in audit/active_sessions.
const { Session, BASE } = require('./lib.cjs');
const PW = 'P36brgss!23';
function log(t, r, x) { console.log(t.padEnd(56), r.status, (x === undefined ? r.text : x).toString().slice(0, 300).replace(/\s+/g, ' ')); }

(async () => {
  console.log('=== BUG-078 CSP header ===');
  const r = await fetch(BASE + '/');
  console.log('GET / status', r.status);
  console.log('CSP:', (r.headers.get('content-security-policy') || '(none)').slice(0, 900));
  console.log('X-Frame-Options:', r.headers.get('x-frame-options'));
  const rp = await fetch(BASE + '/portaal');
  console.log('\nGET /portaal CSP:', (rp.headers.get('content-security-policy') || '(none)').slice(0, 900));
  console.log('GET /portaal X-Frame-Options:', rp.headers.get('x-frame-options'));

  console.log('\n=== BUG-093 /health anonymous ===');
  const h = await fetch(BASE + '/health');
  const ht = await h.text();
  console.log('status', h.status, 'body:', ht.slice(0, 500));
  console.log('contains envVars:', /envVars/.test(ht), ' contains userCount:', /userCount/.test(ht));

  console.log('\n=== BUG-096 anonymous session + CSRF token ===');
  const anon = new Session('anon096', { fakeIp: '198.51.100.81' });
  const a = await anon.get('/');
  console.log('cookies after anon GET /:', [...anon.cookies.keys()].join(',') || '(none)');
  console.log('csrf token handed to anon:', anon.csrf ? anon.csrf.slice(0, 24) + '...' : '(none)');

  console.log('\n=== BUG-087 CSP injection via allowedFrameOrigins ===');
  const m = new Session('mgr', { fakeIp: '198.51.100.83' });
  console.log('manager login', (await m.loginStaff('AUDIT-P36B-manager', PW)).status, '(manage_portal)');
  const cfg = await m.get('/api/portal-admin/config');
  console.log('current portal config:', cfg.status, cfg.text.slice(0, 300));
  for (const bad of ["https://a.example; script-src * 'unsafe-inline'", 'https://b.example/path', 'https://c.example x', '*']) {
    const res = await m.put('/api/portal-admin/config', { allowedFrameOrigins: [bad] });
    log('PUT allowedFrameOrigins ' + JSON.stringify(bad).slice(0, 44), res);
  }
  const rp2 = await fetch(BASE + '/portaal');
  console.log('portal CSP after attempts:', (rp2.headers.get('content-security-policy') || '(none)').slice(0, 500));

  console.log('\n=== BUG-091 password change revokes other sessions ===');
  // throwaway user
  const admin = new Session('admin', { fakeIp: '198.51.100.84' });
  await admin.loginStaff('admin', 'admin123');
  const uname = 'AUDIT-P36B-pw' + Date.now();
  const cu = await admin.post('/api/users', { username: uname, password: PW, role: 'user', permissions: [], fullName: uname });
  console.log('create throwaway', cu.status, cu.json && cu.json.id);
  const A = new Session('A', { fakeIp: '198.51.100.85' });
  const B = new Session('B', { fakeIp: '198.51.100.86' });
  console.log('A login', (await A.loginStaff(uname, PW)).status, ' B login', (await B.loginStaff(uname, PW)).status);
  console.log('B /api/user before:', (await B.get('/api/user')).status);
  const ch = await A.post('/api/users/change-password', { currentPassword: PW, newPassword: 'P36brgssNEW!23' });
  log('A POST /api/users/change-password', ch);
  const bAfter = await B.get('/api/user');
  console.log('B /api/user AFTER password change:', bAfter.status, bAfter.text.slice(0, 120));
  const aAfter = await A.get('/api/user');
  console.log('A (own session) /api/user after:', aAfter.status);

  console.log('\n=== BUG-095 logout removes active_sessions row ===');
  const C = new Session('C', { fakeIp: '198.51.100.87' });
  console.log('C login', (await C.loginStaff(uname, 'P36brgssNEW!23')).status);
  const sid = (C.cookies.get('connect.sid') || '').slice(0, 60);
  console.log('C connect.sid prefix:', sid.slice(0, 40));
  const lo = await C.post('/api/logout', {});
  log('C POST /api/logout', lo);
  console.log('C /api/user after logout:', (await C.get('/api/user')).status);
  console.log('THROWAWAY_USER=' + uname);
})().catch((e) => console.error('FATAL', e));

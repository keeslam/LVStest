// BUG-074 apiLimiter keying, BUG-091 session revoke on password change,
// BUG-095 logout clears active_sessions, BUG-092/BUG-105 auth limiter buckets.
const { Session, BASE } = require('./lib.cjs');
const PW = 'P36brgss!23';
function log(t, r, x) { console.log(t.padEnd(56), r.status, (x === undefined ? r.text : x).toString().slice(0, 220).replace(/\s+/g, ' ')); }

(async () => {
  const admin = new Session('admin', { fakeIp: '198.51.100.90' });
  const al = await admin.loginStaff('admin', 'admin123');
  console.log('admin login', al.status);
  const probe = await admin.get('/api/vehicles?limit=1');
  console.log('admin GET /api/vehicles ->', probe.status, 'RateLimit-Remaining:', probe.headers.get('ratelimit-remaining'), 'limit:', probe.headers.get('ratelimit-limit'));

  const uname = 'AUDIT-P36B-s' + Date.now();
  const cu = await admin.post('/api/users', { username: uname, password: PW, role: 'user', permissions: ['view_vehicles'], fullName: uname });
  console.log('create throwaway', cu.status, cu.text.slice(0, 140));
  if (cu.status !== 201) { console.log('cannot continue without throwaway user'); return; }

  console.log('\n=== BUG-091 password change revokes OTHER sessions ===');
  const A = new Session('A', { fakeIp: '198.51.100.91' });
  const B = new Session('B', { fakeIp: '198.51.100.92' });
  console.log('A login', (await A.loginStaff(uname, PW)).status, '| B login', (await B.loginStaff(uname, PW)).status);
  console.log('B /api/user BEFORE:', (await B.get('/api/user')).status);
  const ch = await A.post('/api/users/change-password', { currentPassword: PW, newPassword: 'P36brgssNEW!23' });
  log('A POST /api/users/change-password', ch);
  const bAfter = await B.get('/api/user');
  console.log('B /api/user AFTER  :', bAfter.status, bAfter.text.slice(0, 120));
  console.log('A /api/user AFTER  :', (await A.get('/api/user')).status, '(own session should survive)');

  console.log('\n=== BUG-095 logout removes the active_sessions row ===');
  const C = new Session('C', { fakeIp: '198.51.100.93' });
  console.log('C login', (await C.loginStaff(uname, 'P36brgssNEW!23')).status);
  await C.get('/api/user');
  const lo = await C.post('/api/logout', {});
  log('C POST /api/logout', lo);
  console.log('C /api/user after logout:', (await C.get('/api/user')).status);
  console.log('THROWAWAY=' + uname);

  console.log('\n=== BUG-074 apiLimiter: 1010 requests as one user over 6 different X-Forwarded-For ===');
  const D = new Session('D', { fakeIp: '198.51.100.94' });
  console.log('D login', (await D.loginStaff(uname, 'P36brgssNEW!23')).status);
  let first429 = null, last200 = 0, statuses = {};
  for (let i = 0; i < 1010; i++) {
    D.fakeIp = '203.0.113.' + (10 + (i % 6)); // rotate the header every request
    const r = await D.get('/api/user');
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    if (r.status === 429 && first429 === null) first429 = i + 1;
    if (r.status === 200) last200 = i + 1;
    if (first429 !== null && i > first429 + 5) break;
  }
  console.log('status counts:', JSON.stringify(statuses), 'first 429 at request #', first429, 'last 200 at #', last200);
})().catch((e) => console.error('FATAL', e));

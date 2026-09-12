// BUG-074 — apiLimiter is keyed per user and survives X-Forwarded-For rotation.
const { Session } = require('./lib.cjs');
const uname = process.argv[2];
const pw = process.argv[3];
(async () => {
  const D = new Session('D', { fakeIp: '203.0.113.10' });
  console.log('login', (await D.loginStaff(uname, pw)).status);
  const h0 = await D.get('/api/vehicles?limit=1');
  console.log('first /api/vehicles ->', h0.status, 'limit', h0.headers.get('ratelimit-limit'), 'remaining', h0.headers.get('ratelimit-remaining'));
  let first429 = null; const counts = {};
  for (let i = 0; i < 1200; i++) {
    D.fakeIp = '203.0.113.' + (10 + (i % 6));
    const r = await D.get('/api/vehicles?limit=1');
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.status === 429 && first429 === null) { first429 = i + 2; console.log('first 429 at request #', first429, 'body:', r.text.slice(0, 120)); }
    if (first429 !== null && i > first429 + 3) break;
  }
  console.log('counts', JSON.stringify(counts), 'first429', first429);
  // a different user on the SAME rotating IPs must be unaffected
  const E = new Session('E', { fakeIp: '203.0.113.11' });
  console.log('other user (admin) login', (await E.loginStaff('admin', 'admin123')).status);
  const e1 = await E.get('/api/vehicles?limit=1');
  console.log('admin /api/vehicles on the same IP ->', e1.status, 'remaining', e1.headers.get('ratelimit-remaining'));
})().catch((e) => console.error('FATAL', e));

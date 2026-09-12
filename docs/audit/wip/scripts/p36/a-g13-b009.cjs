// BUG-009 — the login limiter must throttle regardless of a self-reported
// X-Forwarded-For. Every attempt uses a DIFFERENT username so the per-account
// lockout (BUG-008) cannot be mistaken for the per-IP limiter.
const { Session } = require('./lib.cjs');
const R = (l, v) => console.log('[' + l + '] ' + v);
const TS = Date.now().toString().slice(-6);
(async () => {
  // A) baseline: one fixed fake IP, 8 distinct unknown usernames
  const base = [];
  for (let i = 0; i < 8; i++) {
    const s = new Session('b', { fakeIp: '198.51.100.200' });
    const r = await s.post('/api/login', { username: 'p36a_nouser_A' + TS + '_' + i, password: 'x' });
    base.push(r.status + (r.status === 429 ? '(' + r.text.slice(0, 40) + ')' : ''));
  }
  R('009 baseline same XFF, 8 distinct usernames', JSON.stringify(base));

  // B) the bypass: a different spoofed XFF every time, still distinct usernames
  const forms = ['203.0.113.21', '203.0.113.22', '::ffff:127.0.0.1', '203.0.113.24',
    '127.0.0.1, 203.0.113.5', '203.0.113.26', '198.18.0.7', '203.0.113.28', '203.0.113.29', '203.0.113.30'];
  const spoof = [];
  for (let i = 0; i < forms.length; i++) {
    const s = new Session('s', { fakeIp: forms[i] });
    const r = await s.post('/api/login', { username: 'p36a_nouser_B' + TS + '_' + i, password: 'x' });
    spoof.push(r.status + (r.status === 429 ? '(' + r.text.slice(0, 40) + ')' : ''));
  }
  R('009 rotating spoofed XFF, 8+ distinct usernames', JSON.stringify(spoof));

  // C) no XFF header at all
  const plain = [];
  for (let i = 0; i < 8; i++) {
    const s = new Session('p');
    const r = await s.post('/api/login', { username: 'p36a_nouser_C' + TS + '_' + i, password: 'x' });
    plain.push(r.status);
  }
  R('009 no XFF header, 8 distinct usernames', JSON.stringify(plain));
})();

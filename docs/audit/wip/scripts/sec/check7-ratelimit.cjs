const { Jar, req, loginStaff, dump, getOrLoginStaff } = require('./sr-lib.cjs');

async function burst(n, fn) {
  const statuses = {};
  for (let i = 0; i < n; i++) {
    try {
      const s = await fn();
      statuses[s] = (statuses[s] || 0) + 1;
    } catch (e) {
      statuses['ERR:' + e.message] = (statuses['ERR:' + e.message] || 0) + 1;
    }
  }
  return statuses;
}

(async () => {
  const out = {};
  const jar = new Jar();
  await getOrLoginStaff(jar);

  // 1. 200 rapid GET /api/vehicles as a logged-in user - limiter should be skipped per code (apiLimiter skip for authenticated).
  out['200x GET /api/vehicles (authenticated) status distribution'] = await burst(200, async () => {
    const r = await req(jar, 'GET', '/api/vehicles?limit=1');
    return r.status;
  });

  // 2. 50 rapid POST /api/portal/forgot for one e-mail - mail bombing?
  const pjar = new Jar();
  await req(pjar, 'GET', '/api/portal/csrf-token');
  out['50x POST /api/portal/forgot (one email) status distribution'] = await burst(50, async () => {
    const csrf = pjar.get('PORTAL-XSRF-TOKEN');
    const r = await req(pjar, 'POST', '/api/portal/forgot', {
      headers: { 'X-CSRF-Token': csrf },
      json: { email: 'portaal-test@example.com' },
    });
    return r.status;
  });

  // 3. POST /api/portal/login limiter (using a WRONG password on a throwaway-safe target -
  //    per README we must never send wrong passwords for a real account we need again, but
  //    portal login rate limiting is IP-based and independent of which account is targeted, so
  //    use a non-existent email to avoid touching real portal accounts / lockouts).
  //    NOTE: loginLimiter is a single shared express-rate-limit instance reused across
  //    /api/login, /api/portal/login and /api/portal/forgot (keyed by IP only), so tripping
  //    it here will also rate-limit staff/portal logins from this IP for up to 15 min.
  //    Keep this burst just past the 5-request threshold, not excessive.
  const ljar = new Jar();
  await req(ljar, 'GET', '/api/portal/csrf-token');
  out['7x POST /api/portal/login (bogus email, IP-based limiter) status distribution'] = await burst(7, async () => {
    const csrf = ljar.get('PORTAL-XSRF-TOKEN');
    const r = await req(ljar, 'POST', '/api/portal/login', {
      headers: { 'X-CSRF-Token': csrf },
      json: { email: 'audit-nonexistent-ratelimit@example.com', password: 'wrong-password-x' },
    });
    return r.status;
  });

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

const { Jar, req, csrfHeader, dump } = require('./sr-lib.cjs');

(async () => {
  const out = {};
  const jar = new Jar();

  // 1. Session fixation: get connect.sid BEFORE login, log in, see if it changes (regenerate?).
  await req(jar, 'GET', '/api/user'); // 401 but sets connect.sid + XSRF-TOKEN
  const sidBefore = jar.get('connect.sid');
  out['connect.sid before login'] = sidBefore;

  const csrfBefore = jar.get('XSRF-TOKEN');
  const loginRes = await req(jar, 'POST', '/api/login', {
    headers: { 'X-CSRF-Token': csrfBefore },
    json: { username: 'admin', password: 'admin123' },
  });
  out['login status'] = loginRes.status;
  const sidAfter = jar.get('connect.sid');
  out['connect.sid after login'] = sidAfter;
  out['session regenerated on login?'] = sidBefore !== sidAfter;

  // 2. Confirm authenticated
  const meRes = await req(jar, 'GET', '/api/user');
  out['GET /api/user after login'] = { status: meRes.status, body: meRes.text.slice(0, 200) };

  // 3. Logout: does it clear the cookie / destroy session? Try reusing the pre-logout
  //    cookie value against an authenticated endpoint afterwards.
  const preLogoutCookieHeader = jar.header(); // full cookie header as sent while authenticated
  const csrf2 = await csrfHeader(jar);
  const logoutRaw = await fetch('http://localhost:5001/api/logout', {
    method: 'POST',
    headers: { 'Cookie': preLogoutCookieHeader, 'X-CSRF-Token': jar.get('XSRF-TOKEN') },
  });
  const logoutSetCookies = typeof logoutRaw.headers.getSetCookie === 'function' ? logoutRaw.headers.getSetCookie() : [logoutRaw.headers.get('set-cookie')].filter(Boolean);
  out['logout status'] = logoutRaw.status;
  out['logout Set-Cookie headers'] = logoutSetCookies;

  // Reuse the OLD (pre-logout) cookie header directly against /api/user - does the
  // session still "exist" server-side (just unauthenticated) or is it fully gone?
  const reuseRes = await fetch('http://localhost:5001/api/user', { headers: { 'Cookie': preLogoutCookieHeader } });
  out['GET /api/user reusing pre-logout cookie'] = { status: reuseRes.status, body: (await reuseRes.text()).slice(0, 200) };

  // 4. Portal equivalent
  const pjar = new Jar();
  await req(pjar, 'GET', '/api/portal/csrf-token');
  const psidBefore = pjar.get('portal.sid');
  const pcsrfBefore = pjar.get('PORTAL-XSRF-TOKEN');
  const plogin = await req(pjar, 'POST', '/api/portal/login', {
    headers: { 'X-CSRF-Token': pcsrfBefore },
    json: { email: 'portaal-test@example.com', password: 'portaal-test-1234' },
  });
  out['portal login status'] = plogin.status;
  const psidAfter = pjar.get('portal.sid');
  out['portal.sid before/after login, regenerated?'] = { before: psidBefore, after: psidAfter, changed: psidBefore !== psidAfter };

  // NOTE (SR-005): the CSRF token cookie returned in the LOGIN response itself
  // fails verification on the very next mutating request, because attachCsrfToken
  // runs (against the pre-regenerate session) before req.session.regenerate() in
  // the login handler. Do one intervening GET to refresh the token first, exactly
  // like the staff-realm block above does via csrfHeader(jar), or this logout call
  // spuriously 403s with CSRF_INVALID and the test below becomes meaningless.
  await req(pjar, 'GET', '/api/portal/me');
  const preLogoutPortalCookie = pjar.header();
  const pcsrf2 = pjar.get('PORTAL-XSRF-TOKEN');
  const plogoutRaw = await fetch('http://localhost:5001/api/portal/logout', {
    method: 'POST',
    headers: { 'Cookie': preLogoutPortalCookie, 'X-CSRF-Token': pcsrf2 },
  });
  const plogoutSetCookies = typeof plogoutRaw.headers.getSetCookie === 'function' ? plogoutRaw.headers.getSetCookie() : [plogoutRaw.headers.get('set-cookie')].filter(Boolean);
  out['portal logout status'] = plogoutRaw.status;
  out['portal logout Set-Cookie headers'] = plogoutSetCookies;

  const preuseRes = await fetch('http://localhost:5001/api/portal/me', { headers: { 'Cookie': preLogoutPortalCookie } });
  out['GET /api/portal/me reusing pre-logout portal cookie'] = { status: preuseRes.status, body: (await preuseRes.text()).slice(0, 200) };

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

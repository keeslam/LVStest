const { Jar, req, dump } = require('./sr-lib.cjs');

// Diagnostic for an observation made while running check6b-pwchange-session.cjs:
// the XSRF-TOKEN cookie returned in the /api/login response itself fails CSRF
// verification on the very next mutating request. Isolates whether that is a
// script bug or a real server-side token/session-regeneration ordering issue.
(async () => {
  const out = {};
  const jar = new Jar();

  await req(jar, 'GET', '/api/user'); // anonymous session + XSRF-TOKEN #1
  const preLoginToken = jar.get('XSRF-TOKEN');
  out['XSRF-TOKEN before login'] = preLoginToken;

  const loginRes = await req(jar, 'POST', '/api/login', {
    headers: { 'X-CSRF-Token': preLoginToken },
    json: { username: 'admin', password: 'admin123' },
  });
  out['login status'] = loginRes.status;
  const postLoginToken = jar.get('XSRF-TOKEN'); // token from the LOGIN response's own Set-Cookie
  out['XSRF-TOKEN from login response'] = postLoginToken;
  out['token changed after login'] = preLoginToken !== postLoginToken;

  // Immediately use the token the login response itself just handed us, against
  // a harmless, disposable AUDIT- record (never touches the admin user).
  const immediateProbe = await req(jar, 'POST', `/api/customers`, {
    headers: { 'X-CSRF-Token': postLoginToken },
    json: { name: 'AUDIT-csrf-probe-1', email: 'audit-csrf-probe-1@example.invalid' },
  });
  out['POST /api/customers using the login response CSRF token immediately'] = { status: immediateProbe.status, body: immediateProbe.text.slice(0, 300) };

  // Now do an intervening GET (as the real SPA would when it loads the dashboard),
  // which re-runs attachCsrfToken against the NEW (regenerated) session.
  await req(jar, 'GET', '/api/user');
  const refreshedToken = jar.get('XSRF-TOKEN');
  out['XSRF-TOKEN after one intervening GET'] = refreshedToken;
  out['refreshed token differs from login-response token'] = refreshedToken !== postLoginToken;

  const secondProbe = await req(jar, 'POST', `/api/customers`, {
    headers: { 'X-CSRF-Token': refreshedToken },
    json: { name: 'AUDIT-csrf-probe-2', email: 'audit-csrf-probe-2@example.invalid' },
  });
  out['POST /api/customers using the refreshed token'] = { status: secondProbe.status, body: secondProbe.text.slice(0, 300) };

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

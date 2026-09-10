const { Jar, req, dump } = require('./sr-lib.cjs');

(async () => {
  const out = {};
  const jar = new Jar();
  await req(jar, 'GET', '/api/portal/csrf-token');
  const preLoginToken = jar.get('PORTAL-XSRF-TOKEN');
  out['PORTAL-XSRF-TOKEN before login'] = preLoginToken;

  const loginRes = await req(jar, 'POST', '/api/portal/login', {
    headers: { 'X-CSRF-Token': preLoginToken },
    json: { email: 'portaal-test@example.com', password: 'portaal-test-1234' },
  });
  out['portal login status'] = loginRes.status;
  const postLoginToken = jar.get('PORTAL-XSRF-TOKEN');
  out['PORTAL-XSRF-TOKEN from login response'] = postLoginToken;
  out['token changed after login'] = preLoginToken !== postLoginToken;

  // Immediate mutating request using the token from the login response itself.
  const immediateProbe = await req(jar, 'POST', '/api/portal/requests', {
    headers: { 'X-CSRF-Token': postLoginToken },
    json: { requestType: 'question', message: 'AUDIT-csrf-portal-probe-immediate' },
  });
  out['POST /api/portal/requests using login-response token immediately'] = { status: immediateProbe.status, body: immediateProbe.text.slice(0, 300) };

  await req(jar, 'GET', '/api/portal/me');
  const refreshedToken = jar.get('PORTAL-XSRF-TOKEN');
  out['PORTAL-XSRF-TOKEN after intervening GET'] = refreshedToken;
  const secondProbe = await req(jar, 'POST', '/api/portal/requests', {
    headers: { 'X-CSRF-Token': refreshedToken },
    json: { requestType: 'question', message: 'AUDIT-csrf-portal-probe-refreshed' },
  });
  out['POST /api/portal/requests using refreshed token'] = { status: secondProbe.status, body: secondProbe.text.slice(0, 300) };

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

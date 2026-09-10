const { Jar, req, dump, AUDIT_XFF } = require('./sr-lib.cjs');

// Raw fetch of Set-Cookie strings (not the jar's simplified view) for exact flags.
async function rawLogin(opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, AUDIT_XFF ? { 'X-Forwarded-For': AUDIT_XFF } : {}, opts.headers || {});
  const res = await fetch('http://localhost:5001/api/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    redirect: 'manual',
  });
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return { status: res.status, setCookies, cookieFromLoginBody: await res.text() };
}

(async () => {
  const out = {};

  // 1. Plain HTTP login (no X-Forwarded-Proto) - what flags does connect.sid / XSRF-TOKEN get?
  const plain = await rawLogin();
  out['plain http login Set-Cookie'] = plain;

  // 2. With X-Forwarded-Proto: https - does Secure get set now?
  const httpsHeader = await rawLogin({ headers: { 'X-Forwarded-Proto': 'https' } });
  out['X-Forwarded-Proto: https login Set-Cookie'] = httpsHeader;

  // 3. Login bounce: take the cookies issued when X-Forwarded-Proto:https was set (likely Secure),
  //    then try to use them on a plain http request (simulating a browser that would refuse to send
  //    a Secure cookie over http - here we just check what the server SAYS the flags are; whether the
  //    cookie jar would actually resend it is a browser policy we reason about from the flags string).
  const secureCookies = (httpsHeader.setCookies || []).map(c => c.split(';')[0]);
  out['note'] = 'If any Set-Cookie above includes "Secure", a real browser would silently drop it on a plain http:// origin, and the next request (plain http, no X-Forwarded-Proto) would look unauthenticated -> the login bounce class.';

  // Portal login cookies
  async function rawPortalLogin(opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, AUDIT_XFF ? { 'X-Forwarded-For': AUDIT_XFF } : {}, opts.headers || {});
    const res = await fetch('http://localhost:5001/api/portal/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'portaal-test@example.com', password: 'portaal-test-1234' }),
      redirect: 'manual',
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    return { status: res.status, setCookies };
  }
  out['plain http portal login Set-Cookie'] = await rawPortalLogin();
  out['X-Forwarded-Proto:https portal login Set-Cookie'] = await rawPortalLogin({ headers: { 'X-Forwarded-Proto': 'https' } });

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

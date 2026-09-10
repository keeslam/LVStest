const { Jar, req, loginStaff, dump, getOrLoginStaff } = require('./sr-lib.cjs');

(async () => {
  const jar = new Jar();
  await getOrLoginStaff(jar);
  const out = {};

  const r1 = await req(jar, 'GET', '/api/vehicles/abc');
  out['GET /api/vehicles/abc'] = { status: r1.status, body: r1.text.slice(0, 600) };

  // Malformed JSON body straight to /api/login (no cookie needed, exempt from csrf)
  const r2 = await fetch('http://localhost:5001/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"username": "admin", "password": ', // truncated/invalid JSON
  });
  out['POST /api/login malformed JSON'] = { status: r2.status, body: (await r2.text()).slice(0, 1500) };

  // Malformed JSON to an authenticated route too
  const csrf = jar.get('XSRF-TOKEN');
  const r3 = await fetch('http://localhost:5001/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': jar.header(), 'X-CSRF-Token': csrf },
    body: '{"brand": "AUDIT", "model": ', // truncated
  });
  out['POST /api/vehicles malformed JSON (authenticated)'] = { status: r3.status, body: (await r3.text()).slice(0, 1500) };

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

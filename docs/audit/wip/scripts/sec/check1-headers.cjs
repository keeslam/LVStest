const { Jar, req, loginStaff, dump } = require('./sr-lib.cjs');

function hdrs(h) {
  const wanted = ['content-security-policy', 'strict-transport-security', 'x-frame-options',
    'x-content-type-options', 'referrer-policy', 'access-control-allow-origin',
    'access-control-allow-credentials', 'access-control-allow-methods', 'permissions-policy', 'set-cookie'];
  const out = {};
  for (const w of wanted) {
    const v = h.get(w);
    if (v) out[w] = v;
  }
  return out;
}

(async () => {
  const jar = new Jar();
  await loginStaff(jar);

  const results = {};

  const r1 = await req(jar, 'GET', '/');
  results['GET /'] = { status: r1.status, headers: hdrs(r1.headers) };

  const r2 = await req(jar, 'GET', '/api/user');
  results['GET /api/user'] = { status: r2.status, headers: hdrs(r2.headers) };

  const r3 = await req(jar, 'GET', '/uploads/x');
  results['GET /uploads/x'] = { status: r3.status, headers: hdrs(r3.headers), body: r3.text.slice(0, 300) };

  const r4 = await req(jar, 'GET', '/portaal');
  results['GET /portaal'] = { status: r4.status, headers: hdrs(r4.headers) };

  // CORS preflight
  const r5 = await req(jar, 'OPTIONS', '/api/vehicles', {
    headers: {
      'Origin': 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  results['OPTIONS /api/vehicles (Origin evil.example)'] = { status: r5.status, headers: hdrs(r5.headers), body: r5.text.slice(0, 300) };

  // Socket.IO handshake with evil origin
  const r6 = await req(jar, 'GET', '/socket.io/?EIO=4&transport=polling', {
    headers: { 'Origin': 'https://evil.example' },
  });
  results['GET /socket.io/?EIO=4&transport=polling (Origin evil.example)'] = { status: r6.status, headers: hdrs(r6.headers), body: r6.text.slice(0, 500) };

  console.log(dump(results));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

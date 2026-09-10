const { Jar, req, loginStaff, csrfHeader, dump, getOrLoginStaff } = require('./sr-lib.cjs');

(async () => {
  const jar = new Jar();
  await getOrLoginStaff(jar); // admin
  const out = {};

  const r1 = await req(jar, 'GET', '/api/app-settings/email');
  out['GET /api/app-settings/email (as admin)'] = { status: r1.status, body: r1.text.slice(0, 800) };

  const r2 = await req(jar, 'GET', '/api/settings');
  out['GET /api/settings (as admin) [BUG-010 territory]'] = { status: r2.status, body: r2.text.slice(0, 800) };

  const r3 = await req(jar, 'GET', '/api/fines/cjib-config');
  out['GET /api/fines/cjib-config (as admin)'] = { status: r3.status, body: r3.text.slice(0, 800) };

  const r3b = await req(jar, 'GET', '/api/app-settings');
  out['GET /api/app-settings (as admin, general list, should be redacted)'] = { status: r3b.status, body: r3b.text.slice(0, 1500) };

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

const { Jar, req, csrfHeader, dump, getOrLoginStaff } = require('./sr-lib.cjs');

(async () => {
  const out = {};
  const adminJar = new Jar();
  await getOrLoginStaff(adminJar);

  const username = `AUDIT-secrets-test-${Date.now()}`;
  const password = 'AuditSecrets123';
  let csrf = await csrfHeader(adminJar);
  const createRes = await req(adminJar, 'POST', '/api/users', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      username, password,
      fullName: 'AUDIT Secrets Test (no manage_settings)',
      email: `${username}@example.com`,
      role: 'user',
      permissions: ['view_vehicles', 'view_customers'], // deliberately NO manage_settings, NO manage_fines
      active: true,
    },
  });
  out['create low-priv user'] = { status: createRes.status };
  let newUserId = null;
  try { newUserId = JSON.parse(createRes.text).id; } catch {}

  const lowJar = new Jar();
  const loginRes = await req(lowJar, 'POST', '/api/login', {
    headers: { 'X-CSRF-Token': (await req(lowJar, 'GET', '/api/user'), lowJar.get('XSRF-TOKEN')) },
    json: { username, password },
  });
  out['low-priv login'] = loginRes.status;

  const r1 = await req(lowJar, 'GET', '/api/app-settings/email');
  out['GET /api/app-settings/email (low-priv, no manage_settings)'] = { status: r1.status, body: r1.text.slice(0, 400) };

  const r2 = await req(lowJar, 'GET', '/api/app-settings');
  out['GET /api/app-settings (low-priv, general list)'] = { status: r2.status, body: r2.text.slice(0, 2000) };

  const r3 = await req(lowJar, 'GET', '/api/fines/cjib-config');
  out['GET /api/fines/cjib-config (low-priv, no manage_fines)'] = { status: r3.status, body: r3.text.slice(0, 300) };

  // cleanup
  if (newUserId) {
    csrf = await csrfHeader(adminJar);
    const del = await req(adminJar, 'DELETE', `/api/users/${newUserId}`, { headers: { 'X-CSRF-Token': csrf } });
    out['cleanup delete low-priv user'] = del.status;
  }

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

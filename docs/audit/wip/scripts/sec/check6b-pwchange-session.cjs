const { Jar, req, loginStaff, csrfHeader, dump } = require('./sr-lib.cjs');

// Uses a throwaway staff user (never touches admin) to check whether changing
// a password invalidates other already-logged-in sessions for that same user.
(async () => {
  const out = {};
  const adminJar = new Jar();
  await loginStaff(adminJar);

  const username = `AUDIT-pwtest-${Date.now()}`;
  const initialPassword = 'AuditInit123';
  let csrf = await csrfHeader(adminJar);
  const createRes = await req(adminJar, 'POST', '/api/users', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      username,
      password: initialPassword,
      fullName: 'AUDIT PW Test User',
      email: `${username}@example.com`,
      role: 'user',
      permissions: [],
      active: true,
    },
  });
  out['create throwaway user'] = { status: createRes.status, body: createRes.text.slice(0, 500) };
  let newUserId = null;
  try { newUserId = JSON.parse(createRes.text).id; } catch {}
  out['newUserId'] = newUserId;
  if (!newUserId) { console.log(dump(out)); return; }

  // "Session A" and "Session B" both log in as the throwaway user (simulating
  // two browsers / an attacker with a stolen cookie + the legitimate owner).
  const jarA = new Jar();
  const jarB = new Jar();
  const loginA = await loginStaff(jarA, username, initialPassword);
  const loginB = await loginStaff(jarB, username, initialPassword);
  out['session A login'] = loginA.r.status;
  out['session B login'] = loginB.r.status;

  // Session A changes its own password.
  const csrfA = jarA.get('XSRF-TOKEN');
  const changeRes = await req(jarA, 'POST', '/api/users/change-password', {
    headers: { 'X-CSRF-Token': csrfA },
    json: { currentPassword: initialPassword, newPassword: 'AuditChanged456' },
  });
  out['session A change-password'] = { status: changeRes.status, body: changeRes.text.slice(0, 300) };

  // Is session B (old password, old cookie) still valid?
  const bStill = await req(jarB, 'GET', '/api/user');
  out['session B GET /api/user AFTER session A changed the password'] = { status: bStill.status, body: bStill.text.slice(0, 300) };
  out['verdict'] = bStill.status === 200
    ? 'VULNERABLE: session B still authenticated after password change -> other sessions are not invalidated'
    : 'OK: session B was invalidated';

  // Cleanup: deactivate/delete the throwaway user via admin
  csrf = await csrfHeader(adminJar);
  const delRes = await req(adminJar, 'DELETE', `/api/users/${newUserId}`, { headers: { 'X-CSRF-Token': csrf } });
  out['cleanup delete throwaway user'] = delRes.status;

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

// Area B: users, settings, backups - admin vs limited ([]) vs manager (all perms, non-admin role)
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const setup = require('./setup-out.json');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2).slice(0, 3000)); }
let ipCounter = 200;
function nextIp() { return `10.90.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`; }

async function main() {
  const admin = new Session('b-admin', { fakeIp: nextIp() }); await admin.primeCsrf();
  await admin.loginStaff('admin', 'admin123');

  const limited = new Session('b-limited', { fakeIp: nextIp() }); await limited.primeCsrf();
  await limited.loginStaff(setup.staff.limited.username, setup.staff.limited.password);

  const manager = new Session('b-manager', { fakeIp: nextIp() }); await manager.primeCsrf();
  await manager.loginStaff(setup.staff.manager.username, setup.staff.manager.password);

  const probes = [
    ['GET /api/system-settings', 'get', '/api/system-settings'],
    ['GET /api/settings', 'get', '/api/settings'],
    ['GET /api/backup-settings', 'get', '/api/backup-settings'],
    ['GET /api/backups/status', 'get', '/api/backups/status'],
    ['GET /api/app-settings', 'get', '/api/app-settings'],
  ];
  for (const [label, method, url] of probes) {
    for (const [who, sess] of [['admin', admin], ['limited', limited], ['manager', manager]]) {
      const r = await sess[method](url);
      log(`B5 ${label} as ${who}`, { status: r.status, bodyPreview: JSON.stringify(r.json ?? r.text).slice(0, 300) });
    }
  }

  // PUT /api/system-settings as limited user (no permission gate at all on this route)
  {
    const r = await limited.put('/api/system-settings', { contractNumberStart: 999999, tollRatePerKm: '9.99' });
    log('B5 PUT /api/system-settings as limited (permissions=[])', { status: r.status, body: r.json });
  }

  // POST /api/backups/run as admin (expect pg_dump missing -> clean error)
  {
    const r = await admin.post('/api/backups/run', {});
    log('B5 POST /api/backups/run as admin (pg_dump expected missing)', { status: r.status, body: r.json });
  }
  // as limited (expect 403)
  {
    const r = await limited.post('/api/backups/run', {});
    log('B5 POST /api/backups/run as limited', { status: r.status, body: r.json });
  }

  // backups/download/../ path traversal
  {
    const r1 = await admin.get('/api/backups/download/' + encodeURIComponent('../../../../etc/passwd'));
    log('B5 backups download path traversal (encoded ../)', { status: r1.status, body: r1.json });
    const r2 = await fetch(BASE + '/api/backups/download/..%2f..%2f..%2fpackage.json', { headers: { Cookie: admin.cookieHeader() } });
    log('B5 backups download path traversal (double-encoded)', { status: r2.status, bodyPreview: (await r2.text()).slice(0, 200) });
  }

  // ---- Privilege escalation tests ----
  // PATCH /api/users/:id/admin as manager (role-gated requireAdmin -> expect 403)
  {
    const r = await manager.patch(`/api/users/${setup.staff.limited.id}/admin`, { active: true });
    log('B5 PATCH /api/users/:id/admin as manager (role check)', { status: r.status, body: r.json });
  }
  // POST /api/users with role=admin as manager (permission-gated MANAGE_USERS, no role restriction)
  {
    const newAdminUsername = 'AUDIT-escalated-admin-' + Date.now();
    const r = await manager.post('/api/users', { username: newAdminUsername, password: 'EscalatedAdm1n', fullName: 'AUDIT escalated', email: newAdminUsername + '@example.invalid', role: 'admin', permissions: [], active: true });
    log('B5 POST /api/users role=admin as manager (privilege escalation attempt)', { status: r.status, body: r.json });
    if (r.status === 201) {
      const check = await q('select id, username, role from users where username=$1', [newAdminUsername]);
      log('B5 DB check - escalated admin user actually created', { check });
    }
  }
  // PATCH /api/users/:id (self) as manager -> can manager give itself admin role via the general self-update route?
  {
    const before = await q('select id, username, role from users where id=$1', [setup.staff.manager.id]);
    const r = await manager.patch(`/api/users/${setup.staff.manager.id}`, { role: 'admin' });
    log('B5 manager self-PATCH role=admin via /api/users/:id (self-update whitelist bypass?)', { status: r.status, body: r.json });
    const after = await q('select id, username, role from users where id=$1', [setup.staff.manager.id]);
    log('B5 DB before/after manager self role escalation attempt', { before, after });
  }
  // PATCH /api/users/:id (self) as limited user -> try adding permissions to itself (expect stripped by strict whitelist)
  {
    const before = await q('select id, username, permissions, role from users where id=$1', [setup.staff.limited.id]);
    const r = await limited.patch(`/api/users/${setup.staff.limited.id}`, { permissions: ['manage_users'], role: 'admin', active: true, fullName: 'AUDIT limited self-update' });
    log('B5 limited-user self-PATCH adding permissions/role (should be stripped)', { status: r.status, body: r.json });
    const after = await q('select id, username, permissions, role from users where id=$1', [setup.staff.limited.id]);
    log('B5 DB before/after limited self-update attempt', { before, after });
  }

  // ---- Settings fuzz ----
  {
    const r = await admin.post('/api/settings/contract-number-override', { overrideNumber: -5 });
    log('B6 contract-number-override negative', { status: r.status, body: r.json });
  }
  {
    const r = await admin.post('/api/settings/contract-number-override', { overrideNumber: 99999999999 });
    log('B6 contract-number-override huge', { status: r.status, body: r.json });
  }
  {
    const r = await admin.post('/api/settings/contract-number-override', { overrideNumber: 'abc' });
    log('B6 contract-number-override string', { status: r.status, body: r.json });
  }
  {
    const r = await admin.put('/api/system-settings', { maintenanceExcludedStatuses: 'not_an_array' });
    log('B6 maintenance_excluded_statuses as string', { status: r.status, body: r.json });
    const check = await admin.get('/api/system-settings');
    log('B6 system-settings readback after string maintenanceExcludedStatuses', { status: check.status, body: check.json });
  }
  // calendar settings invalid JSON body (malformed at HTTP layer)
  {
    const csrf = admin.csrf;
    const r = await fetch(BASE + '/api/app-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookieHeader(), 'X-CSRF-Token': csrf },
      body: '{"category":"calendar","key":"calendar_settings","value":{not valid json'
    });
    log('B6 calendar settings malformed JSON body', { status: r.status, body: (await r.text()).slice(0, 300) });
  }
  // valid calendar_settings create, then email config with weak host, then read back for password leakage
  {
    const r = await admin.post('/api/app-settings', { category: 'email', key: 'email_config', value: { smtpHost: '127.0.0.1', smtpPort: 1, smtpUser: 'audit@example.invalid', smtpPassword: 'AUDIT-super-secret-smtp-pw', smtpSecure: false, fromEmail: 'audit@example.invalid', fromName: 'AUDIT' } });
    log('B6 create email_config with host 127.0.0.1:1', { status: r.status, body: r.json });

    const viaAppSettingsList = await admin.get('/api/app-settings'); // requireAuth only, redacted
    const emailRowList = (viaAppSettingsList.json || []).find(s => s.key === 'email_config');
    log('B6 GET /api/app-settings (list, requireAuth only) - email_config entry', { smtpPasswordInResponse: emailRowList?.value?.smtpPassword });

    const viaKey = await admin.get('/api/app-settings/key/email_config'); // requireAuth only, redacted
    log('B6 GET /api/app-settings/key/email_config (requireAuth only) - redacted?', { smtpPasswordInResponse: viaKey.json?.value?.smtpPassword });

    const viaCategory = await admin.get('/api/app-settings/email'); // MANAGE_SETTINGS gated, NOT redacted by design
    log('B6 GET /api/app-settings/email (MANAGE_SETTINGS gated) - as admin', { smtpPasswordInResponse: viaCategory.json?.[0]?.value?.smtpPassword });

    const viaCategoryLimited = await limited.get('/api/app-settings/email');
    log('B6 GET /api/app-settings/email as limited user (no MANAGE_SETTINGS)', { status: viaCategoryLimited.status, body: viaCategoryLimited.json });

    const viaOldSettingsList = await limited.get('/api/settings'); // gated on MANAGE_BACKUPS, NOT MANAGE_SETTINGS - limited has neither
    log('B6 GET /api/settings (MANAGE_BACKUPS-gated) as limited (no perms at all)', { status: viaOldSettingsList.status });

    // give limited user ONLY manage_backups (not manage_settings) and re-check /api/settings for password leakage
    await admin.patch(`/api/users/${setup.staff.limited.id}`, { permissions: ['manage_backups'] });
    const limited2 = new Session('b-limited-backups', { fakeIp: nextIp() }); await limited2.primeCsrf();
    await limited2.loginStaff(setup.staff.limited.username, setup.staff.limited.password);
    const viaOldSettingsListBackupsOnly = await limited2.get('/api/settings');
    const emailRowOld = (viaOldSettingsListBackupsOnly.json || []).find(s => s.key === 'email_config');
    log('B6 GET /api/settings as user with ONLY manage_backups (no manage_settings) - password leak?', {
      status: viaOldSettingsListBackupsOnly.status,
      smtpPasswordInResponse: emailRowOld?.value?.smtpPassword,
      fullEmailRow: emailRowOld,
    });
    // restore limited user to empty permissions
    await admin.patch(`/api/users/${setup.staff.limited.id}`, { permissions: [] });
  }

  fs.writeFileSync(path.join(__dirname, 'area-b-results.json'), JSON.stringify(results, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

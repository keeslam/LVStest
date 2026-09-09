// One-time setup: create throwaway staff + portal accounts for phase 3-5 auth/portal audit.
// Writes account credentials + ids to setup-out.json for later test scripts to reuse.
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const { scrypt, randomBytes } = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(scrypt);
const fs = require('fs');
const path = require('path');

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

async function main() {
  const out = {};

  // ---- admin session ----
  const admin = new Session('admin');
  await admin.primeCsrf();
  const loginRes = await admin.loginStaff('admin', 'admin123');
  if (loginRes.status !== 200) throw new Error('admin login failed: ' + loginRes.status + ' ' + loginRes.text);
  console.log('admin login OK', loginRes.status);

  // ---- throwaway staff users ----
  const staffUsers = [
    { key: 'lockout', username: 'AUDIT-lockout-' + Date.now(), password: 'AuditLockout123', role: 'user', permissions: [] },
    { key: 'inactive', username: 'AUDIT-inactive-' + Date.now(), password: 'AuditInactive123', role: 'user', permissions: [] },
    { key: 'pwchange', username: 'AUDIT-pwchange-' + Date.now(), password: 'AuditPwChange123', role: 'user', permissions: [] },
    { key: 'limited', username: 'AUDIT-limited-' + Date.now(), password: 'AuditLimited123', role: 'user', permissions: [] },
    { key: 'manager', username: 'AUDIT-manager-' + Date.now(), password: 'AuditManager123', role: 'manager', permissions: [
      'manage_users','manage_vehicles','view_vehicles','manage_customers','view_customers','manage_reservations','view_reservations',
      'authorize_mileage_decrease','manage_maintenance','manage_expenses','manage_documents','manage_pdf_templates','manage_damage_checks',
      'view_damage_checks','manage_reports','view_reports','manage_backups','manage_settings','manage_email_templates','manage_notifications',
      'manage_portal','view_portal','manage_fines','view_fines','view_dashboard'
    ] },
    { key: 'rate', username: 'AUDIT-rate-' + Date.now(), password: 'AuditRate123', role: 'user', permissions: [] },
  ];

  out.staff = {};
  for (const u of staffUsers) {
    const r = await admin.post('/api/users', { username: u.username, password: u.password, fullName: 'AUDIT ' + u.key, email: `${u.username}@example.invalid`, role: u.role, permissions: u.permissions, active: true });
    if (r.status !== 201) { console.error('FAILED create user', u.key, r.status, r.text); continue; }
    console.log('created staff user', u.key, u.username, 'id=' + r.json.id);
    out.staff[u.key] = { id: r.json.id, username: u.username, password: u.password, role: u.role, permissions: u.permissions };
  }

  // set inactive user to active=false
  if (out.staff.inactive) {
    const r = await admin.patch(`/api/users/${out.staff.inactive.id}`, { active: false });
    console.log('set inactive user active=false ->', r.status);
  }

  // ---- portal accounts (customer 1 = "second customer", customer 179 = existing test account) ----
  const portalAccounts = [
    { key: 'other_admin', customerId: 1, email: 'audit-portal-admin-' + Date.now() + '@example.invalid', fullName: 'AUDIT Portal Admin (cust1)', role: 'admin', driverId: null, password: 'AuditPortalAdmin123' },
    { key: 'driver179', customerId: 179, email: 'audit-portal-driver-' + Date.now() + '@example.invalid', fullName: 'AUDIT Portal Driver (cust179)', role: 'driver', driverId: 23, password: 'AuditPortalDriver123' },
    { key: 'lockout', customerId: 1, email: 'audit-portal-lockout-' + Date.now() + '@example.invalid', fullName: 'AUDIT Portal Lockout', role: 'admin', driverId: null, password: 'AuditPortalLockout123' },
  ];
  out.portal = {};
  for (const p of portalAccounts) {
    const r = await admin.post(`/api/portal-admin/customers/${p.customerId}/accounts`, { email: p.email, fullName: p.fullName, role: p.role, driverId: p.driverId });
    if (r.status !== 201) { console.error('FAILED create portal account', p.key, r.status, r.text); continue; }
    const id = r.json.account.id;
    console.log('created portal account', p.key, p.email, 'id=' + id);
    out.portal[p.key] = { id, customerId: p.customerId, email: p.email, role: p.role, driverId: p.driverId, password: p.password };
  }

  // activate portal accounts directly via DB (bypass invite email; we control the password hash algorithm)
  for (const key of Object.keys(out.portal)) {
    const acct = out.portal[key];
    const hash = await hashPassword(acct.password);
    await q('update portal_users set password_hash=$1 where id=$2', [hash, acct.id]);
    console.log('activated portal account', key, 'id=' + acct.id);
  }

  fs.writeFileSync(path.join(__dirname, 'setup-out.json'), JSON.stringify(out, null, 2));
  console.log('\nWrote setup-out.json');
  console.log(JSON.stringify(out, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

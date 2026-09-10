// Create/reuse the identities needed for the phase 6-7 API matrix.
// Uses distinct X-Forwarded-For values per BUG-009 to avoid tripping the
// shared per-IP login limiter (5/15min) while logging in several accounts.
import { Session, loadOrLoginStaff, loadOrLoginPortal, sessionFile } from './lib.mjs';
import { q, pool } from '../db.mjs';
import fs from 'fs';

const PW = 'AuditMatrix123!';

async function ensureStaffUser(admin, username, role, permissions) {
  const existing = await q('select id from users where username = $1', [username]);
  if (existing.length) return existing[0].id;
  const r = await admin.post('/api/users', {
    username, password: PW, role, permissions, fullName: 'AUDIT-' + username, active: true,
  });
  if (r.status !== 201) throw new Error(`create ${username} failed: ${r.status} ${r.text}`);
  return r.json.id;
}

async function main() {
  const admin = await loadOrLoginStaff('admin', 'admin', 'admin123', { forwardedFor: '10.10.10.1' });
  console.log('admin session ok');

  const allPerms = [
    'manage_vehicles','view_vehicles','manage_customers','view_customers',
    'manage_reservations','view_reservations','authorize_mileage_decrease',
    'manage_maintenance','manage_expenses','manage_documents','manage_pdf_templates',
    'manage_damage_checks','view_damage_checks','manage_reports','view_reports',
    'manage_backups','manage_settings','manage_email_templates','manage_notifications',
    'manage_portal','view_portal','manage_fines','view_fines','view_dashboard',
  ]; // all except manage_users

  const viewPerms = ['view_vehicles','view_customers','view_reservations','view_damage_checks','view_reports','view_portal','view_fines','view_dashboard'];

  await ensureStaffUser(admin, 'AUDIT-matrix-nobody', 'user', []);
  await ensureStaffUser(admin, 'AUDIT-matrix-viewer', 'user', viewPerms);
  await ensureStaffUser(admin, 'AUDIT-matrix-manager', 'manager', allPerms);

  const nobody = await loadOrLoginStaff('nobody', 'AUDIT-matrix-nobody', PW, { forwardedFor: '10.10.10.2' });
  console.log('nobody session ok');
  const viewer = await loadOrLoginStaff('viewer', 'AUDIT-matrix-viewer', PW, { forwardedFor: '10.10.10.3' });
  console.log('viewer session ok');
  const manager = await loadOrLoginStaff('manager', 'AUDIT-matrix-manager', PW, { forwardedFor: '10.10.10.4' });
  console.log('manager session ok');

  // anon: no session at all, just a placeholder file marker.
  fs.writeFileSync(sessionFile('anon'), JSON.stringify({ cookies: {} }));

  // Portal admin (customer 179)
  const portalAdmin = await loadOrLoginPortal('portal-admin', 'portaal-test@example.com', 'portaal-test-1234', { forwardedFor: '10.10.10.5' });
  console.log('portal-admin session ok');

  // Find the customer-179 portal user's password_hash to clone.
  const [srcUser] = await q(`select id, password_hash, driver_id from portal_users where customer_id = 179 and email = 'portaal-test@example.com'`);
  if (!srcUser || !srcUser.password_hash) throw new Error('could not find source portal user password_hash for customer 179');

  // portal-other: another customer, admin-role portal account.
  const [otherCustomer] = await q(`select id from customers where id <> 179 order by id limit 1`);
  const otherCustomerId = otherCustomer.id;
  let [existingOther] = await q(`select id from portal_users where email = 'audit-matrix-other@example.com'`);
  let otherPortalUserId;
  if (existingOther) {
    otherPortalUserId = existingOther.id;
  } else {
    const r = await admin.post(`/api/portal-admin/customers/${otherCustomerId}/accounts`, {
      email: 'audit-matrix-other@example.com', fullName: 'AUDIT-matrix-other', role: 'admin',
    });
    if (r.status !== 201) throw new Error(`create portal-other account failed: ${r.status} ${r.text}`);
    otherPortalUserId = r.json.account.id;
  }
  await q(`update portal_users set password_hash = $1, active = true where id = $2`, [srcUser.password_hash, otherPortalUserId]);
  const portalOther = await loadOrLoginPortal('portal-other', 'audit-matrix-other@example.com', 'portaal-test-1234', { forwardedFor: '10.10.10.6' });
  console.log('portal-other session ok, customerId=', otherCustomerId);

  // portal-driver: role driver, needs a driverId. Use a driver belonging to customer 179 if possible, else any driver.
  let [drv] = await q(`select id from drivers where customer_id = 179 limit 1`);
  if (!drv) [drv] = await q(`select id from drivers limit 1`);
  const driverId = drv.id;
  let [existingDriver] = await q(`select id from portal_users where email = 'audit-matrix-driver@example.com'`);
  let driverPortalUserId;
  if (existingDriver) {
    driverPortalUserId = existingDriver.id;
  } else {
    const r = await admin.post(`/api/portal-admin/customers/179/accounts`, {
      email: 'audit-matrix-driver@example.com', fullName: 'AUDIT-matrix-driver', role: 'driver', driverId,
    });
    if (r.status !== 201) throw new Error(`create portal-driver account failed: ${r.status} ${r.text}`);
    driverPortalUserId = r.json.account.id;
  }
  await q(`update portal_users set password_hash = $1, active = true where id = $2`, [srcUser.password_hash, driverPortalUserId]);
  const portalDriver = await loadOrLoginPortal('portal-driver', 'audit-matrix-driver@example.com', 'portaal-test-1234', { forwardedFor: '10.10.10.7' });
  console.log('portal-driver session ok, driverId=', driverId);

  const summary = {
    otherCustomerId, driverId,
    portalAdminCustomerId: 179,
  };
  fs.writeFileSync('C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix\\identities-summary.json', JSON.stringify(summary, null, 2));
  console.log('DONE', summary);
  await pool.end();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

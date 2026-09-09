// Area A3: password change
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const setup = require('./setup-out.json');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2)); }
let ipCounter = 100;
function nextIp() { return `10.88.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`; }

async function main() {
  const u = setup.staff.pwchange;
  const s = new Session('a3', { fakeIp: nextIp() });
  await s.primeCsrf();
  const login = await s.loginStaff(u.username, u.password);
  log('A3 setup login', { status: login.status });

  // wrong current password
  {
    const r = await s.post('/api/users/change-password', { currentPassword: 'TotallyWrong1', newPassword: 'NewPassw0rd1' });
    log('A3 wrong current password', { status: r.status, body: r.json });
  }
  // new = old
  {
    const r = await s.post('/api/users/change-password', { currentPassword: u.password, newPassword: u.password });
    log('A3 new password same as current', { status: r.status, body: r.json });
  }
  // 1-char new password
  {
    const r = await s.post('/api/users/change-password', { currentPassword: u.password, newPassword: 'A' });
    log('A3 1-char new password', { status: r.status, body: r.json });
  }
  // 500-char new password
  {
    const longPw = 'Aa1' + 'x'.repeat(497);
    const r = await s.post('/api/users/change-password', { currentPassword: u.password, newPassword: longPw });
    log('A3 500-char new password', { status: r.status, body: r.json, len: longPw.length });
  }
  // actually change password to NewPassw0rd1, then try to change back to the ORIGINAL (reuse test)
  {
    const r1 = await s.post('/api/users/change-password', { currentPassword: u.password, newPassword: 'NewPassw0rd1' });
    log('A3 real password change (for reuse test)', { status: r1.status, body: r1.json });
    // now current password is NewPassw0rd1; try to change back to the OLD one (u.password) - should password_history block this?
    const r2 = await s.post('/api/users/change-password', { currentPassword: 'NewPassw0rd1', newPassword: u.password });
    log('A3 reuse of previous password (change back to original)', { status: r2.status, body: r2.json });
    // check password_history table content for this user
    const hist = await q('select * from password_history where user_id=$1', [u.id]).catch(e => e.message);
    log('A3 password_history DB rows for this user', { hist });
    // restore known password for any later use: currentPassword is now u.password again if r2 succeeded, else still NewPassw0rd1
    setup.staff.pwchange._currentPassword = r2.status === 200 ? u.password : 'NewPassw0rd1';
  }

  // PATCH /api/users/:id as non-admin/non-manage_users, targeting ANOTHER user's id, trying to set password + role + permissions + active
  {
    const limited = setup.staff.limited;
    const sLimited = new Session('a3-limited', { fakeIp: nextIp() });
    await sLimited.primeCsrf();
    await sLimited.loginStaff(limited.username, limited.password);
    const targetId = setup.staff.inactive.id; // some other throwaway user's id
    const r = await sLimited.patch(`/api/users/${targetId}`, {
      password: 'HackedPassw0rd1', role: 'admin', permissions: ['manage_users'], active: true, fullName: 'AUDIT hacked-by-limited'
    });
    log('A3 non-admin PATCH /api/users/:otherId with password+role+permissions', { status: r.status, body: r.json });
    // verify DB: did role/permissions/password change on target?
    const check = await q('select id, username, role, permissions, active, full_name from users where id=$1', [targetId]);
    log('A3 DB check after limited-user PATCH attempt on another user', { check });
  }

  fs.writeFileSync(path.join(__dirname, 'area-a3-results.json'), JSON.stringify(results, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

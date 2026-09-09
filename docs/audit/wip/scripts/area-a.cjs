// Area A: staff authentication & sessions
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const setup = require('./setup-out.json');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2)); }

async function main() {
  // ===== A1: login fuzz =====
  {
    const s = new Session('a1-empty'); await s.primeCsrf();
    const r = await s.post('/api/login', {});
    log('A1 empty body', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-nopass'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: 'admin' });
    log('A1 missing password', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-arrayuser'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: ['admin','x'], password: 'x' });
    log('A1 username array', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-objuser'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: { $ne: null }, password: 'x' });
    log('A1 username object', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-huge'); await s.primeCsrf();
    const bigUser = 'A'.repeat(10 * 1024);
    const r = await s.post('/api/login', { username: bigUser, password: 'x' });
    log('A1 10kB username', { status: r.status, bodyLen: r.text.length, bodySnippet: r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-sqli'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: "' OR 1=1--", password: "' OR 1=1--" });
    log('A1 sql-ish username', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    const s = new Session('a1-unicode'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: 'ádmïn🎉', password: 'x' });
    log('A1 unicode username', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    // inactive user login
    const s = new Session('a1-inactive'); await s.primeCsrf();
    const r = await s.post('/api/login', { username: setup.staff.inactive.username, password: setup.staff.inactive.password });
    log('A1 inactive user login', { status: r.status, body: r.json || r.text.slice(0,200) });
  }
  {
    // wrong password 5x on throwaway lockout user
    const s = new Session('a1-lockout');
    await s.primeCsrf();
    const attempts = [];
    for (let i = 1; i <= 6; i++) {
      const r = await s.post('/api/login', { username: setup.staff.lockout.username, password: 'WrongPassword' + i });
      attempts.push({ attempt: i, status: r.status, body: r.json });
    }
    log('A1 lockout - 6x wrong password', { attempts });

    // now try correct password - should be locked
    const rCorrect = await s.post('/api/login', { username: setup.staff.lockout.username, password: setup.staff.lockout.password });
    log('A1 lockout - correct password while locked', { status: rCorrect.status, body: rCorrect.json });

    // check login_attempts table
    const dbAttempts = await q('select username, success, failure_reason, attempted_at from login_attempts where username=$1 order by attempted_at', [setup.staff.lockout.username]);
    log('A1 lockout - login_attempts DB rows', { rows: dbAttempts });
  }

  // ===== A2: session handling =====
  {
    const s = new Session('a2-nocookie');
    const r = await fetch(BASE + '/api/user', { headers: {} });
    const text = await r.text();
    log('A2 protected endpoint no cookie', { status: r.status, body: text.slice(0,200) });
  }
  {
    const r = await fetch(BASE + '/api/user', { headers: { Cookie: 'connect.sid=s%3Agarbagegarbagegarbagegarbagegarbagegarbage.garbagegarbagegarbagegarbage' } });
    const text = await r.text();
    log('A2 protected endpoint garbage connect.sid', { status: r.status, body: text.slice(0,200) });
  }
  {
    // fresh admin-like session (use lockout-free rate user) then logout then retry
    const s = new Session('a2-logout'); await s.primeCsrf();
    const loginR = await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const beforeLogout = await s.get('/api/user');
    const logoutR = await s.post('/api/logout', {});
    const afterLogout = await s.get('/api/user');
    log('A2 after logout', { loginStatus: loginR.status, beforeLogoutStatus: beforeLogout.status, logoutStatus: logoutR.status, afterLogoutStatus: afterLogout.status, afterLogoutBody: afterLogout.json });
  }
  {
    // delete session row from DB then retry
    const s = new Session('a2-dbdelete'); await s.primeCsrf();
    const loginR = await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const beforeDelete = await s.get('/api/user');
    const sid = s.cookies.get('connect.sid');
    // sid cookie is URL-encoded signed value like s%3A<id>.<sig> -> decode to get raw sid for DB lookup (connect-pg-simple stores by sid, which is the part before the dot, after "s:")
    const decoded = decodeURIComponent(sid || '');
    const rawSid = decoded.startsWith('s:') ? decoded.slice(2).split('.')[0] : null;
    let delCount = 0;
    if (rawSid) {
      const delRes = await q('delete from session where sid=$1', [rawSid]);
      delCount = delRes.length; // pg delete via our q() returns rows array (rowCount not exposed); use direct pool query instead
    }
    const afterDelete = await s.get('/api/user');
    log('A2 after deleting session row from DB', { loginStatus: loginR.status, beforeDeleteStatus: beforeDelete.status, rawSid, afterDeleteStatus: afterDelete.status, afterDeleteBody: afterDelete.json });
  }

  // ===== A2 CSRF =====
  {
    const s = new Session('a2-csrf-missing'); await s.primeCsrf();
    await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const r = await s.post('/api/users/change-password', { currentPassword: 'x', newPassword: 'Yy123456' }, { omitCsrf: true });
    log('A2 CSRF missing header', { status: r.status, body: r.json });
  }
  {
    const sA = new Session('a2-csrf-a'); await sA.primeCsrf();
    await sA.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const sB = new Session('a2-csrf-b'); await sB.primeCsrf();
    await sB.loginStaff(setup.staff.limited.username, setup.staff.limited.password);
    // use sB's csrf token on sA's cookies
    const r = await sA.post('/api/users/change-password', { currentPassword: 'x', newPassword: 'Yy123456' }, { csrfOverride: sB.csrf });
    log('A2 CSRF token from another session', { status: r.status, body: r.json, sAcsrf: sA.csrf, sBcsrf: sB.csrf });
  }
  {
    // header present but no cookie at all (raw fetch, only csrf header, no session cookie)
    const s = new Session('a2-csrf-nocookie'); await s.primeCsrf();
    await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const csrf = s.csrf;
    const r = await fetch(BASE + '/api/users/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'Yy123456' })
    });
    const text = await r.text();
    log('A2 CSRF header but no cookie', { status: r.status, body: text.slice(0,200) });
  }
  {
    // GET-based mutation attempt: try a state-changing action via query string on a GET endpoint (probe: does app expose any GET mutation?)
    const s = new Session('a2-getmut'); await s.primeCsrf();
    await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const r = await s.get('/api/logout'); // logout is POST-only; confirm GET doesn't work (expect 404/405)
    log('A2 GET on logout (should not be a valid mutation route)', { status: r.status, body: r.text.slice(0,150) });
  }

  fs.writeFileSync(path.join(__dirname, 'area-a-results.json'), JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

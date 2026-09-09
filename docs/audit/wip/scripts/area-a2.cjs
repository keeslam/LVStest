// Area A, run 2: uses per-session X-Forwarded-For spoofing (trust proxy=1 honours it - see
// the "ip trick" finding below) so unrelated fuzz cases don't share the IP-based login
// rate-limit bucket with each other or with other concurrent audit agents on this box.
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const setup = require('./setup-out.json');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2)); }

let ipCounter = 1;
function nextIp() { return `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`; }

async function main() {
  // ===== A4a: trust-proxy / X-Forwarded-For rate-limit bypass evidence =====
  {
    const fixedIp = nextIp();
    // 6 wrong-password attempts on a nonexistent user, all claiming the SAME fake IP -> should 429 on #6
    const sameIpAttempts = [];
    for (let i = 1; i <= 6; i++) {
      const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fixedIp }, body: JSON.stringify({ username: 'AUDIT-nonexistent-rl-probe', password: 'x' + i }) });
      sameIpAttempts.push({ attempt: i, status: r.status, body: await r.text() });
    }
    log('A4 baseline - 6 requests same spoofed IP -> 429 on 6th', { sameIpAttempts });

    // now 6 more wrong-password attempts, each with a DIFFERENT spoofed IP -> limiter should never trip
    const diffIpAttempts = [];
    for (let i = 1; i <= 6; i++) {
      const ip = nextIp();
      const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: 'AUDIT-nonexistent-rl-probe2', password: 'x' + i }) });
      diffIpAttempts.push({ attempt: i, ip, status: r.status, body: await r.text() });
    }
    log('A4 bypass - 6 requests, distinct spoofed IP each -> limiter never trips (trust proxy=1 honours X-Forwarded-For)', { diffIpAttempts });
  }

  // ===== A4b: 20 rapid correct-password logins for a throwaway user (skipSuccessfulRequests) =====
  {
    const ip = nextIp();
    const rapid = [];
    for (let i = 1; i <= 20; i++) {
      const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: setup.staff.rate.username, password: setup.staff.rate.password }) });
      rapid.push({ attempt: i, status: r.status });
    }
    log('A4 20x correct-password logins, single IP', { statuses: rapid.map(r => r.status) });
  }

  // ===== A1: account lockout, each wrong attempt from a DIFFERENT spoofed IP (isolates account lockout from IP limiter) =====
  {
    const attempts = [];
    let lastSetCookie = null;
    for (let i = 1; i <= 6; i++) {
      const ip = nextIp();
      const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: setup.staff.lockout.username, password: 'WrongPassword' + i }) });
      const body = await r.text();
      attempts.push({ attempt: i, ip, status: r.status, body });
    }
    log('A1 account lockout - 6x wrong password, distinct IP each time', { attempts });

    // correct password, yet another fresh IP - should still be locked (account-scoped, not IP-scoped)
    const ip7 = nextIp();
    const rCorrect = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip7 }, body: JSON.stringify({ username: setup.staff.lockout.username, password: setup.staff.lockout.password }) });
    log('A1 lockout - correct password, fresh IP, while locked', { status: rCorrect.status, body: await rCorrect.text() });

    const dbAttempts = await q('select username, success, failure_reason, attempted_at, ip_address from login_attempts where username=$1 order by attempted_at', [setup.staff.lockout.username]);
    log('A1 lockout - login_attempts DB rows', { rows: dbAttempts });
  }

  // ===== A1 fuzz (each on its own fresh IP so they don't consume each other's budget) =====
  const fuzzCases = [
    ['empty body', {}],
    ['missing password', { username: 'admin' }],
    ['username array', { username: ['admin', 'x'], password: 'x' }],
    ['username object', { username: { $ne: null }, password: 'x' }],
    ['sql-ish username', { username: "' OR 1=1--", password: "' OR 1=1--" }],
    ['unicode username', { username: 'ádmïn🎉', password: 'x' }],
  ];
  for (const [label, body] of fuzzCases) {
    const ip = nextIp();
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
    log('A1 fuzz: ' + label, { status: r.status, body: await r.text() });
  }
  {
    const ip = nextIp();
    const bigUser = 'A'.repeat(10 * 1024);
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: bigUser, password: 'x' }) });
    const text = await r.text();
    log('A1 fuzz: 10kB username', { status: r.status, bodyLen: text.length, bodySnippet: text.slice(0, 200) });
  }
  {
    const ip = nextIp();
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: setup.staff.inactive.username, password: setup.staff.inactive.password }) });
    log('A1 fuzz: inactive user login', { status: r.status, body: await r.text() });
  }

  // ===== A2: session handling (fresh spoofed IP so login succeeds cleanly) =====
  {
    const r = await fetch(BASE + '/api/user');
    log('A2 protected endpoint no cookie', { status: r.status, body: await r.text() });
  }
  {
    const r = await fetch(BASE + '/api/user', { headers: { Cookie: 'connect.sid=s%3Agarbagegarbagegarbagegarbagegarbagegarbage.garbagegarbagegarbagegarbage' } });
    log('A2 protected endpoint garbage connect.sid', { status: r.status, body: await r.text() });
  }
  {
    const s = new Session('a2-logout', { fakeIp: nextIp() }); await s.primeCsrf();
    const loginR = await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const beforeLogout = await s.get('/api/user');
    const logoutR = await s.post('/api/logout', {});
    const afterLogout = await s.get('/api/user');
    log('A2 after logout', { loginStatus: loginR.status, beforeLogoutStatus: beforeLogout.status, logoutStatus: logoutR.status, afterLogoutStatus: afterLogout.status, afterLogoutBody: afterLogout.json });
  }
  {
    const s = new Session('a2-dbdelete', { fakeIp: nextIp() }); await s.primeCsrf();
    const loginR = await s.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const beforeDelete = await s.get('/api/user');
    const sid = s.cookies.get('connect.sid');
    const decoded = decodeURIComponent(sid || '');
    const rawSid = decoded.startsWith('s:') ? decoded.slice(2).split('.')[0] : null;
    let rowCountBefore = -1, rowCountAfter = -1;
    if (rawSid) {
      const before = await pool.query('select 1 from session where sid=$1', [rawSid]);
      rowCountBefore = before.rowCount;
      await pool.query('delete from session where sid=$1', [rawSid]);
      const after = await pool.query('select 1 from session where sid=$1', [rawSid]);
      rowCountAfter = after.rowCount;
    }
    const afterDelete = await s.get('/api/user');
    log('A2 after deleting session row from DB', { loginStatus: loginR.status, beforeDeleteStatus: beforeDelete.status, rawSid, rowCountBefore, rowCountAfter, afterDeleteStatus: afterDelete.status, afterDeleteBody: afterDelete.json });
  }

  // ===== A2 CSRF =====
  {
    const s = new Session('a2-csrf-missing', { fakeIp: nextIp() }); await s.primeCsrf();
    await s.loginStaff(setup.staff.limited.username, setup.staff.limited.password);
    const r = await s.post('/api/users/change-password', { currentPassword: 'x', newPassword: 'Yy1234567' }, { omitCsrf: true });
    log('A2 CSRF missing header', { status: r.status, body: r.json });
  }
  {
    const sA = new Session('a2-csrf-a', { fakeIp: nextIp() }); await sA.primeCsrf();
    await sA.loginStaff(setup.staff.limited.username, setup.staff.limited.password);
    const sB = new Session('a2-csrf-b', { fakeIp: nextIp() }); await sB.primeCsrf();
    await sB.loginStaff(setup.staff.pwchange.username, setup.staff.pwchange.password);
    const r = await sA.post('/api/users/change-password', { currentPassword: 'x', newPassword: 'Yy1234567' }, { csrfOverride: sB.csrf });
    log('A2 CSRF token from another session', { status: r.status, body: r.json, sAcsrf: sA.csrf, sBcsrf: sB.csrf });
  }
  {
    const s = new Session('a2-csrf-nocookie', { fakeIp: nextIp() }); await s.primeCsrf();
    await s.loginStaff(setup.staff.limited.username, setup.staff.limited.password);
    const csrf = s.csrf;
    const r = await fetch(BASE + '/api/users/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'Yy1234567' })
    });
    log('A2 CSRF header but no cookie', { status: r.status, body: await r.text() });
  }

  fs.writeFileSync(path.join(__dirname, 'area-a2-results.json'), JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

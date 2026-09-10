// Step 6: session tests as a limited user.
import fs from 'fs';
import path from 'path';
import { Session, sessionFile, BASE } from './lib.mjs';
import { q, pool } from '../db.mjs';

const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';
const rows = [];

// AM-xxx workaround: apiLimiter's skip-for-authenticated-users check never fires (see
// run-matrix.mjs comment / server/index.ts:174 vs server/auth.ts:187); use a dedicated IP so this
// script's requests don't collide with the shared 1000/15min-per-real-IP bucket.
const FORWARDED_FOR = '10.20.30.13';

async function main() {
  const nobody = new Session('nobody', { forwardedFor: FORWARDED_FOR }); nobody.loadFrom(sessionFile('nobody'));
  const viewer = new Session('viewer', { forwardedFor: FORWARDED_FOR }); viewer.loadFrom(sessionFile('viewer'));

  // 1) CSRF cross-session: use nobody's session cookie but viewer's XSRF token.
  {
    const r = await fetch(BASE + '/api/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': nobody.cookieHeader(),
        'X-CSRF-Token': viewer.csrf,
        'X-Forwarded-For': FORWARDED_FOR,
      },
      body: JSON.stringify({ licensePlate: 'AUDIT-CSRF-X', brand: 'AUDIT', model: 'test' }),
      redirect: 'manual',
    });
    const text = await r.text();
    rows.push({ test: 'CSRF token from another session (viewer csrf + nobody cookie) on POST /api/vehicles', status: r.status, note: text.slice(0, 200) });
  }

  // 2) Request after logout.
  {
    const s = new Session('logout-test', { forwardedFor: FORWARDED_FOR });
    s.loadFrom(sessionFile('viewer'));
    // clone viewer's session into a fresh session object so we don't clobber the saved file
    const logoutRes = await s.post('/api/logout', {});
    rows.push({ test: 'POST /api/logout with viewer session', status: logoutRes.status, note: '' });
    const after = await s.get('/api/vehicles?limit=1');
    rows.push({ test: 'GET /api/vehicles after logout, same cookie jar', status: after.status, note: (after.text || '').slice(0, 150) });
  }

  // 3) connect.sid copied from another user's session table row (document only).
  {
    const sessRows = await q(`select sid, sess from session order by expire desc limit 20`);
    // find a session row belonging to a different staff user than 'viewer' identity if possible
    let candidate = null;
    for (const row of sessRows) {
      try {
        const sess = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
        if (sess.passport && sess.passport.user) { candidate = row; break; }
      } catch (e) { /* ignore */ }
    }
    if (candidate) {
      const stolen = new Session('stolen', { forwardedFor: FORWARDED_FOR });
      stolen.cookies.set('connect.sid', candidate.sid);
      const r = await stolen.get('/api/user');
      rows.push({ test: `Cookie connect.sid copied from session table row (sid prefix ${String(candidate.sid).slice(0, 12)}...)`, status: r.status, note: (r.text || '').slice(0, 200) });
    } else {
      rows.push({ test: 'connect.sid theft test', status: 'SKIPPED', note: 'no session-table row with passport.user found' });
    }
  }

  fs.writeFileSync(path.join(DIR, 'session-tests-results.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

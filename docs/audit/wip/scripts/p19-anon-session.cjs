// P19: does an anonymous /api hit create a persisted session row? (saveUninitialized:false vs the CSRF token touching req.session)
// Counts rows in "session" before/after 50 cookie-less requests from fresh clients.
'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const L = require('./p19-lib.cjs');
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const pool = new Pool({ connectionString: url, ssl: false, application_name: 'psql' }); // 'psql' so the log filter ignores it

(async () => {
  const before = +(await pool.query('select count(*) from session')).rows[0].count;
  const paths = ['/api', '/health', '/api/user', '/api/vehicles'];
  const statuses = {};
  let cookies = 0;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(L.BASE + paths[i % paths.length], { headers: { 'X-Forwarded-For': `10.19.8.${(i % 40) + 1}` } });
    await res.text();
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (sc.some(c => c.startsWith('connect.sid='))) cookies++;
  }
  await L.sleep(500);
  const after = +(await pool.query('select count(*) from session')).rows[0].count;
  const sample = (await pool.query("select sid, expire, sess::text from session order by expire desc limit 2")).rows.map(r => ({ expire: r.expire, sess: r.sess.slice(0, 200) }));
  const out = { before, after, created: after - before, requests: 50, setCookieCount: cookies, statuses, sample };
  console.log(JSON.stringify(out, null, 2));
  require('fs').writeFileSync(require('path').join(__dirname, 'p19-anon-session.out.json'), JSON.stringify(out, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

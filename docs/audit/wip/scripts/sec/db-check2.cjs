require('dotenv').config();
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url, ssl: false });
(async () => {
  const as = await pool.query("SELECT count(*) FROM active_sessions");
  console.log('active_sessions row count:', as.rows[0].count);
  const sample = await pool.query("SELECT session_id, user_id, username, ip_address, last_activity, expires_at FROM active_sessions ORDER BY last_activity DESC LIMIT 5");
  console.log('sample:', JSON.stringify(sample.rows, null, 2));
  const sess = await pool.query("SELECT count(*) FROM session");
  console.log('express session table row count:', sess.rows[0].count);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

require('dotenv').config();
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url, ssl: false });
(async () => {
  const users = await pool.query('SELECT id, username, role, permissions, active FROM users');
  console.log('USERS:', JSON.stringify(users.rows, null, 2));
  const as = await pool.query("SELECT id, key, category FROM app_settings");
  console.log('APP_SETTINGS keys:', JSON.stringify(as.rows, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

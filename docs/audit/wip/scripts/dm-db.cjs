// Ad-hoc DB query helper for documents/mail audit (phase 3-5,14-16).
// Usage: node dm-db.js "SELECT ..."
require('dotenv').config();
const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const pool = new Pool({ connectionString: url, ssl: false });

(async () => {
  const sql = process.argv[2];
  if (!sql) {
    console.error('Usage: node dm-db.js "<SQL>"');
    process.exit(1);
  }
  try {
    const res = await pool.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('DB ERROR:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();

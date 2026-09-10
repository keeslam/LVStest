require('dotenv').config();
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url, ssl: false });
(async () => {
  const d = await pool.query("SELECT id, file_path, content_type, document_type FROM documents ORDER BY id DESC LIMIT 8");
  console.log('recent documents:', JSON.stringify(d.rows, null, 2));
  const emailCfg = await pool.query("SELECT key, value FROM app_settings WHERE key='email_config'");
  console.log('email_config value keys:', emailCfg.rows[0] ? Object.keys(emailCfg.rows[0].value) : 'none');
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

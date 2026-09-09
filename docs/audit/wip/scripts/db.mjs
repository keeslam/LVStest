import 'dotenv/config';
import pg from 'pg';
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
export const pool = new pg.Pool({ connectionString: url, ssl: false });
export async function q(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

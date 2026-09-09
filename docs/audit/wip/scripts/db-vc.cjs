// DB helper for the VEHICLES/CUSTOMERS audit scripts (VC-* bugs). Private
// copy (suffix -vc), per README-agents.md recipe.
'use strict';
require('dotenv').config();
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set - run this script from the repo root (' + process.cwd() + ')');
}
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url, ssl: false });

async function q(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

module.exports = { q, pool, url };

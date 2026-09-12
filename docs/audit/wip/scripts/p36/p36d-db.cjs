// DB helper for P36 agent D — targets lvs_regress.
'use strict';
require('dotenv').config();
const base = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lvstest';
const url = base.replace(/\/[a-zA-Z_]+(\?.*)?$/, '/lvs_regress');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url, ssl: false });
async function q(sql, params) { const r = await pool.query(sql, params); return r.rows; }
module.exports = { q, pool, url };

// Phase 36 agent C helpers: admin session + lvs_regress db access.
'use strict';
const path = require('path');
const fs = require('fs');
const { Session } = require('./lib.cjs');
// backoff429: wait out the shared 1000-req/15min limiter instead of failing the probe.
const _req = Session.prototype.request;
Session.prototype.request = async function (m, p, b, o) {
  for (let i = 0; i < 30; i++) {
    const r = await _req.call(this, m, p, b, o);
    if (r.status !== 429) return r;
    const wait = Number(r.headers.get('retry-after') || 10) + 2;
    process.stderr.write('[429 wait ' + wait + 's]\n');
    await new Promise(res => setTimeout(res, wait * 1000));
  }
  throw new Error('rate limited too long');
};
const { Pool } = require(path.join('C:/Users/kees lam/Desktop/LVStest-main/LVStest-main', 'node_modules', 'pg'));

const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/lvs_regress', ssl: false });
async function q(sql, params) { const r = await pool.query(sql, params); return r.rows; }

let ipn = Math.floor(Math.random()*200)+10;
async function admin(name) {
  const s = new Session(name || 'p36c', { fakeIp: '10.36.' + ((++ipn)%250+1) + '.' + (Math.floor(Math.random()*250)+1) });
  const r = await s.loginStaff('admin', 'admin123');
  if (r.status !== 200) throw new Error('login failed ' + r.status + ' ' + r.text.slice(0, 200));
  return s;
}

const IDS = path.join(__dirname, 'p36c-ids.json');
function loadIds() { return fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, 'utf8')) : {}; }
function saveIds(o) { fs.writeFileSync(IDS, JSON.stringify(o, null, 1)); }

function d(offsetDays, base) {
  const t = base ? new Date(base) : new Date();
  t.setDate(t.getDate() + offsetDays);
  return t.toISOString().slice(0, 10);
}

module.exports = { q, pool, admin, loadIds, saveIds, d, Session };

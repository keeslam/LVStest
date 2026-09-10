// Phase 9 (vehicle management) helper: persisted staff sessions (one login per
// named session, reused across scripts), per-session fake IP so the general
// apiLimiter / login limiter buckets don't collide, DB helper, and a tiny
// step logger that records request/status/response excerpt + SQL evidence.
'use strict';
const fs = require('fs');
const path = require('path');
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');

const SESSION_DIR = __dirname;
let ipCounter = 40;

function sessionFile(name) {
  return path.join(SESSION_DIR, `p9-session-${name}.json`);
}

async function getSession(name, username, password, opts = {}) {
  const fakeIp = opts.fakeIp || `10.9.1.${ipCounter++}`;
  const s = new Session(name, { fakeIp });
  const file = sessionFile(name);
  if (fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(saved.cookies || {})) s.cookies.set(k, v);
      s.csrf = saved.csrf || null;
      const probe = await s.get('/api/vehicles?limit=1');
      if (probe.status === 200) {
        log(`[session ${name}] reused persisted session (fakeIp ${fakeIp})`);
        return s;
      }
      log(`[session ${name}] persisted session invalid (${probe.status}), logging in again`);
    } catch (e) {
      log(`[session ${name}] could not reuse persisted session: ${e.message}`);
    }
  }
  const r = await s.loginStaff(username, password);
  if (r.status !== 200) throw new Error(`login ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  fs.writeFileSync(file, JSON.stringify({ cookies: Object.fromEntries(s.cookies), csrf: s.csrf }));
  log(`[session ${name}] logged in as ${username} (fakeIp ${fakeIp})`);
  return s;
}

function persist(s) {
  fs.writeFileSync(sessionFile(s.name), JSON.stringify({ cookies: Object.fromEntries(s.cookies), csrf: s.csrf }));
}

const outLines = [];
function log(...args) {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  outLines.push(line);
}

function excerpt(r, n = 300) {
  const t = r.text || '';
  return `${r.status} ${t.length > n ? t.slice(0, n) + '…' : t}`;
}

async function step(title, fn) {
  log(`\n### ${title}`);
  try {
    return await fn();
  } catch (e) {
    log(`!! step threw: ${e.stack || e.message}`);
    return undefined;
  }
}

async function sql(label, text, params) {
  const rows = await q(text, params);
  log(`SQL ${label}: ${JSON.stringify(rows)}`);
  return rows;
}

async function health() {
  try {
    const r = await fetch(BASE + '/health');
    return r.status;
  } catch (e) {
    return 'DOWN ' + e.message;
  }
}

async function waitForHealth(maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const h = await health();
    if (h === 200) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

function writeOut(name) {
  fs.writeFileSync(path.join(SESSION_DIR, name), outLines.join('\n'));
}

module.exports = { getSession, persist, log, excerpt, step, sql, q, pool, health, waitForHealth, writeOut, BASE };

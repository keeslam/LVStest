// Phase 19 performance helpers. Node 18+. Run from repo root.
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const { Session, BASE } = require('./lib.cjs');

const LOGDIR = 'C:/Program Files/PostgreSQL/17/data/log';
const PGLOG = LOGDIR + '/postgresql-2026-09-10_000000.log';
const SERVER_PID = 11872; // tsx server/index.ts on :5001 (netstat -ano | findstr :5001)

// Postgres rotates the log by size (10 MB) — under full statement logging that happens every few seconds,
// so a position is (file, offset) and a read spans every file created since.
const path_ = require('path');
function logFiles() { return fs.readdirSync(LOGDIR).filter(f => /^postgresql-2026-09-1\d_\d{6}\.log$/.test(f)).sort(); }
function logSize() { const files = logFiles(); const file = files[files.length - 1]; return { file, size: fs.statSync(path_.join(LOGDIR, file)).size }; }
function readRange(p, offset) {
  const fd = fs.openSync(p, 'r');
  const size = fs.fstatSync(fd).size;
  if (size <= offset) { fs.closeSync(fd); return ''; }
  const buf = Buffer.alloc(size - offset);
  fs.readSync(fd, buf, 0, size - offset, offset);
  fs.closeSync(fd);
  return buf.toString('utf8');
}
function readLogFrom(pos) {
  if (typeof pos === 'number') pos = { file: 'postgresql-2026-09-10_000000.log', size: pos };
  let out = '';
  for (const f of logFiles()) {
    if (f < pos.file) continue;
    out += readRange(path_.join(LOGDIR, f), f === pos.file ? pos.size : 0);
  }
  return out;
}
// Prefix: '%m [%p] %d %a ' -> "2026-09-10 22:49:47.510 CEST [25192] lvs_audit psql LOG:  duration: 8.680 ms  statement: ..."
// With log_min_duration_statement=0 the extended protocol logs parse/bind/execute separately;
// only "statement:" (simple protocol) and "execute" (extended) count as one SQL statement.
const STMT_RE = /^(\S+ \S+ \S+) \[(\d+)\] (\S+) (\S*)\s*LOG:\s+duration: ([\d.]+) ms\s+(statement|execute [^:]*):\s*(.*)$/;
function parseStatements(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = STMT_RE.exec(line);
    if (!m) continue;
    const [, ts, pid, db, app, ms, kind, sqlText] = m;
    if (db !== 'lvs_audit' || app === 'psql') continue; // ignore my own psql markers / other DBs
    out.push({ ts, pid: +pid, ms: +ms, kind: kind.startsWith('execute') ? 'execute' : 'statement', sql: sqlText.slice(0, 300) });
  }
  return out;
}
function summarizeStatements(stmts) {
  const byShape = new Map();
  for (const s of stmts) {
    const shape = s.sql.replace(/\$\d+/g, '?').replace(/\s+/g, ' ').slice(0, 120);
    byShape.set(shape, (byShape.get(shape) || 0) + 1);
  }
  const slowest = stmts.slice().sort((a, b) => b.ms - a.ms)[0] || null;
  const totalMs = stmts.reduce((a, s) => a + s.ms, 0);
  const shapes = Array.from(byShape.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([sql, n]) => ({ n, sql }));
  return { count: stmts.length, totalMs: +totalMs.toFixed(2), slowest: slowest ? { ms: slowest.ms, sql: slowest.sql.slice(0, 200) } : null, shapes };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pct(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, idx)];
}
function stats(arr) {
  return { n: arr.length, min: Math.min(...arr), p50: pct(arr, 50), p95: pct(arr, 95), max: Math.max(...arr), mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) };
}

// One timed request. Returns ms (wall time until body fully read), bytes (decoded body), headers of interest, row count.
async function timed(session, method, path, body, opts = {}) {
  const t0 = process.hrtime.bigint();
  const r = await session.request(method, path, body, Object.assign({ headers: { 'Accept-Encoding': 'gzip, deflate, br' } }, opts));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const bytes = Buffer.byteLength(r.text || '', 'utf8');
  return {
    ms: +ms.toFixed(1), status: r.status, bytes,
    contentLength: r.headers.get('content-length'), contentEncoding: r.headers.get('content-encoding'),
    contentType: r.headers.get('content-type'),
    rows: Array.isArray(r.json) ? r.json.length : (r.json && typeof r.json === 'object' ? Object.keys(r.json).length : null),
    json: r.json, text: r.text,
  };
}

async function staffSessions(n, base = '10.19.1.') {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const s = new Session(`staff${i}`, { fakeIp: base + i });
    const r = await s.loginStaff('admin', 'admin123');
    if (r.status !== 200) throw new Error(`staff login ${i} failed: ${r.status} ${r.text.slice(0, 200)}`);
    out.push(s);
  }
  return out;
}
async function portalSession(ip = '10.19.2.1') {
  const s = new Session('portal', { fakeIp: ip });
  const r = await s.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  if (r.status !== 200) throw new Error(`portal login failed: ${r.status} ${r.text.slice(0, 200)}`);
  return s;
}

function processMemory(pid = SERVER_PID) {
  const out = execSync(`powershell -NoProfile -Command "$p=Get-Process -Id ${pid}; Write-Output ($p.WorkingSet64.ToString()+' '+$p.PrivateMemorySize64.ToString()+' '+$p.VirtualMemorySize64.ToString())"`, { encoding: 'utf8' }).trim();
  const [ws, priv, virt] = out.split(/\s+/).map(Number);
  return { pid, rssMB: +(ws / 1048576).toFixed(1), privateMB: +(priv / 1048576).toFixed(1), virtualMB: +(virt / 1048576).toFixed(1), at: new Date().toISOString() };
}

async function health(session) {
  const r = await (session || new Session('h')).get('/health');
  return r.json;
}

module.exports = { Session, BASE, PGLOG, SERVER_PID, logSize, readLogFrom, parseStatements, summarizeStatements, sleep, pct, stats, timed, staffSessions, portalSession, processMemory, health };

// P36-E round 3 — round 2's "sqlerror" and "\connect" fixtures were silently no-ops: pg_dump on this
// host writes CRLF, so a '\n'-anchored replace never matched and the fixture was a byte-identical copy
// of a healthy dump (which is why it restored with 200). These are built against the real CRLF text,
// and the \connect / CREATE DATABASE fixtures are full-size dumps so they cannot be refused merely
// for being too small.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const L = require('./e-lib.cjs');

const BACKUP_PATH = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-backups';
const OUT = {};
const log = (k, v) => { OUT[k] = v; console.log('### ' + k + ': ' + JSON.stringify(v)); };
function walk(dir) { const out = []; (function rec(d) { let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) rec(p); else out.push(p); } })(dir); return out; }
function tmpLeftovers() { let e; try { e = fs.readdirSync(os.tmpdir()); } catch { return []; } return e.filter(n => /^(db-backup-|files-backup-|restore-|lvs-restore-)/.test(n)); }
const rows = () => L.sql("select (select count(*) from vehicles)||'/'||(select count(*) from customers)||'/'||(select count(*) from reservations)||'/'||(select count(*) from users)");

(async () => {
  const [s] = await L.staff(1, '10.36.22.');
  const run = await L.rreq(s, 'POST', '/api/backups/run', {});
  await L.sleep(1500);
  const list = await L.rget(s, '/api/backups/list');
  const good = (list.json || []).filter(b => b.type === 'database' && b.checksum !== 'uploaded').sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  log('goodDb', { runStatus: run.status, filename: good.filename });
  const goodPath = walk(BACKUP_PATH).find(p => p.endsWith(good.filename));
  const plain = zlib.gunzipSync(fs.readFileSync(goodPath));
  const text = plain.toString('latin1');
  const MARK = '--\r\n-- PostgreSQL database dump complete\r\n--';
  log('markerFoundInDump', text.indexOf(MARK) > 0);

  const mk = (name, buf) => { fs.writeFileSync(path.join(BACKUP_PATH, name), buf); return name; };

  // (1) a complete, full-size dump carrying one statement psql must reject
  const sqlerr = text.replace(MARK, 'SELECT 1/0; -- AUDIT-P36E deliberate SQL error\r\n' + MARK);
  log('sqlerrorInjected', sqlerr.length !== text.length);
  const fSqlErr = mk('AUDIT-P36E-sqlerror2.sql.gz', zlib.gzipSync(Buffer.from(sqlerr, 'latin1')));

  // (2) a complete, full-size dump that switches database part-way (BUG-199)
  const anchor = "SET client_encoding = 'UTF8';\r\n";
  const connectText = text.replace(anchor, anchor + '\\connect lvs_regress_other\r\n');
  log('connectInjected', connectText.length !== text.length);
  const fConnect = mk('AUDIT-P36E-connect2.sql.gz', zlib.gzipSync(Buffer.from(connectText, 'latin1')));

  // (3) a complete, full-size dump with DROP/CREATE DATABASE (a --create dump)
  const createText = text.replace(anchor, anchor +
    'DROP DATABASE IF EXISTS lvs_regress_other;\r\n' +
    "CREATE DATABASE lvs_regress_other WITH TEMPLATE = template0 ENCODING = 'UTF8';\r\n");
  log('createDbInjected', createText.length !== text.length);
  const fCreate = mk('AUDIT-P36E-createdb.sql.gz', zlib.gzipSync(Buffer.from(createText, 'latin1')));

  // (4) a dump truncated just before the completion marker but otherwise full-size
  const fHalf = mk('AUDIT-P36E-nomarker.sql.gz', zlib.gzipSync(Buffer.from(text.slice(0, text.indexOf(MARK)), 'latin1')));

  const vis = await L.rget(s, '/api/backups/list');
  log('fixturesVisible', (vis.json || []).filter(b => /AUDIT-P36E-(sqlerror2|connect2|createdb|nomarker)/.test(b.filename)).map(b => b.filename));

  for (const [tag, f] of [['sqlerror', fSqlErr], ['connect', fConnect], ['createdb', fCreate], ['nomarker', fHalf]]) {
    const before = rows();
    const t0 = Date.now();
    const r = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: f, confirmFilename: f });
    await L.sleep(1500);
    log('restore.' + tag, {
      status: r.status, ms: Date.now() - t0, body: (r.text || '').slice(0, 400),
      rowsBefore: before, rowsAfter: rows(),
      otherDbExists: L.sql("select count(*) from pg_database where datname='lvs_regress_other'", 'postgres'),
    });
  }
  log('BUG207.straySql', walk(BACKUP_PATH).filter(p => /\.sql$/i.test(p)));
  log('BUG207.tmpLeftovers', tmpLeftovers());
  log('BUG220.runningRows', L.sql("select count(*) from backup_runs where status='running'"));

  // BUG-209 re-check: download-files on this Windows host
  const dlf = await L.rreq(s, 'GET', '/api/backups/download-files');
  log('BUG209.downloadFiles', { status: dlf.status, body: (dlf.text || '').slice(0, 500) });

  // housekeeping: remove the fixtures from the backup root so no later run can restore one
  for (const f of [fSqlErr, fConnect, fCreate, fHalf,
    'AUDIT-P36E-trunc.sql.gz', 'AUDIT-P36E-sqlerror.sql.gz', 'AUDIT-P36E-connect.sql.gz',
    'AUDIT-P36E-corrupt.sql.gz', 'AUDIT-P36E-badfiles.tar.gz']) {
    try { fs.unlinkSync(path.join(BACKUP_PATH, f)); } catch { }
  }
  log('fixturesRemoved', walk(BACKUP_PATH).filter(p => /AUDIT-P36E/.test(p)));

  fs.writeFileSync(__dirname + '/e-backups3.out.json', JSON.stringify(OUT, null, 1));
  console.log('written e-backups3.out.json');
})().catch(e => {
  console.error('FATAL', e.stack);
  fs.writeFileSync(__dirname + '/e-backups3.out.json', JSON.stringify(Object.assign(OUT, { FATAL: String(e && e.stack) }), null, 1));
  process.exit(1);
});

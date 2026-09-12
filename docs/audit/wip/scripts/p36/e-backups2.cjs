// P36-E round 2 — fixtures in the BACKUP_PATH root (that is where listBackups sees loose files,
// and where phase 17 put them), a sentinel row so "the database was not changed" is an assertion
// that other agents sharing lvs_regress cannot spoil, and the remaining restore paths.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const L = require('./e-lib.cjs');

const BACKUP_PATH = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-backups';
const UPLOADS_DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-uploads';
const CWD = process.cwd();
const OUT = {};
const log = (k, v) => { OUT[k] = v; console.log('### ' + k + ': ' + JSON.stringify(v)); };
function walk(dir) { const out = []; (function rec(d) { let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) rec(p); else out.push(p); } })(dir); return out; }
function tmpLeftovers() { let e; try { e = fs.readdirSync(os.tmpdir()); } catch { return []; } return e.filter(n => /^(db-backup-|files-backup-|restore-|lvs-restore-)/.test(n)); }
const SENT = 'AUDIT-P36E-SENTINEL';
function sentinelCount() { return Number(L.sql(`select count(*) from vehicles where license_plate like '${SENT}%'`)); }

(async () => {
  const [s] = await L.staff(1, '10.36.21.');

  // ---------- fresh archive, then a sentinel that is NOT in it ----------
  const run = await L.rreq(s, 'POST', '/api/backups/run', {});
  log('run.status', run.status);
  await L.sleep(1500);
  const list = await L.rget(s, '/api/backups/list');
  const dbs = (list.json || []).filter(b => b.type === 'database' && b.checksum !== 'uploaded').sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const fls = (list.json || []).filter(b => b.type === 'files' && b.checksum !== 'uploaded').sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const good = dbs[0], goodFiles = fls[0];
  log('goodDb', good && good.filename);
  log('goodFiles', goodFiles && { f: goodFiles.filename, meta: goodFiles.metadata });

  const plate = SENT + '-' + Date.now().toString().slice(-6);
  const mkv = await L.rreq(s, 'POST', '/api/vehicles', { licensePlate: plate, brand: 'AUDIT', model: 'P36E', vehicleType: 'Personenauto' });
  log('sentinel.create', { status: mkv.status, plate, body: (mkv.text || '').slice(0, 200) });
  log('sentinel.countAfterCreate', sentinelCount());

  // ---------- fixtures in the ROOT of BACKUP_PATH ----------
  const goodPath = walk(BACKUP_PATH).find(p => p.endsWith(good.filename));
  const plain = zlib.gunzipSync(fs.readFileSync(goodPath));
  const mk = (name, buf) => { fs.writeFileSync(path.join(BACKUP_PATH, name), buf); return name; };
  const fTrunc = mk('AUDIT-P36E-trunc.sql.gz', zlib.gzipSync(plain.slice(0, Math.floor(plain.length / 2))));
  const badText = plain.toString('latin1').replace(
    '--\n-- PostgreSQL database dump complete\n--',
    "SELECT 1/0; -- AUDIT-P36E deliberate SQL error\n--\n-- PostgreSQL database dump complete\n--");
  const fSqlErr = mk('AUDIT-P36E-sqlerror.sql.gz', zlib.gzipSync(Buffer.from(badText, 'latin1')));
  const connectDump = ['--', '-- PostgreSQL database dump', '--',
    'DROP DATABASE IF EXISTS lvs_regress_other;',
    "CREATE DATABASE lvs_regress_other WITH TEMPLATE = template0 ENCODING = 'UTF8';",
    '\\connect lvs_regress_other',
    'CREATE TABLE public.audit_p36e (id integer);',
    '--', '-- PostgreSQL database dump complete', '--', ''].join('\n');
  const fConnect = mk('AUDIT-P36E-connect.sql.gz', zlib.gzipSync(Buffer.from(connectDump)));
  const fCorrupt = mk('AUDIT-P36E-corrupt.sql.gz', Buffer.from('this is not gzip at all, not even close'));
  log('fixtures', [fTrunc, fSqlErr, fConnect, fCorrupt]);
  const l2 = await L.rget(s, '/api/backups/list');
  log('fixturesVisible', (l2.json || []).filter(b => /AUDIT-P36E/.test(b.filename)).map(b => b.filename));

  // ---------- BUG-197 / 199: every broken archive must be refused, DB untouched ----------
  for (const [tag, f] of [['truncated', fTrunc], ['sqlerror', fSqlErr], ['connect', fConnect], ['notgzip', fCorrupt]]) {
    const before = sentinelCount();
    const r = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: f, confirmFilename: f });
    await L.sleep(1200);
    log('restore.' + tag, { status: r.status, body: (r.text || '').slice(0, 400), sentinelBefore: before, sentinelAfter: sentinelCount() });
  }
  // BUG-221(f)-adjacent: the typed confirmation is still required
  const noConfirm = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: fTrunc });
  log('restore.withoutConfirmation', { status: noConfirm.status, body: (noConfirm.text || '').slice(0, 200) });

  log('BUG207.straySqlUnderBackupPath', walk(BACKUP_PATH).filter(p => /\.sql$/i.test(p)));
  log('BUG207.tmpLeftovers', tmpLeftovers());
  log('BUG199.otherDbExists', L.sql("select count(*) from pg_database where datname='lvs_regress_other'", 'postgres'));

  // ---------- BUG-200: upload with the required type ----------
  async function upload(route, filename, content, extra) {
    const boundary = '----p36e' + Date.now();
    const parts = [];
    const push = (name, val, fname, ctype) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"` + (fname ? `; filename="${fname}"` : '') + `\r\n` + (ctype ? `Content-Type: ${ctype}\r\n` : '') + `\r\n`));
      parts.push(Buffer.isBuffer(val) ? val : Buffer.from(String(val)));
      parts.push(Buffer.from('\r\n'));
    };
    push('backup', content, filename, 'application/octet-stream');
    for (const [k, v] of Object.entries(extra || {})) push(k, v);
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return L.rreq(s, 'POST', route, Buffer.concat(parts), { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  }
  const smallGz = zlib.gzipSync(fs.readFileSync(goodPath).length ? zlib.gunzipSync(fs.readFileSync(goodPath)).slice(0, 5000) : Buffer.from('x'));
  const cwdBefore = walk(path.join(CWD, 'backups'));
  const up = await upload('/api/backups/upload', 'AUDIT-P36E-up.sql.gz', smallGz, { type: 'database' });
  await L.sleep(800);
  log('BUG200.upload', { status: up.status, body: (up.text || '').slice(0, 400) });
  log('BUG200.newUnderCwdBackups', walk(path.join(CWD, 'backups')).filter(p => !cwdBefore.includes(p)));
  log('BUG200.underBackupPath', walk(BACKUP_PATH).filter(p => /AUDIT-P36E-up/.test(p)));
  const l3 = await L.rget(s, '/api/backups/list');
  const upEntry = (l3.json || []).filter(b => /AUDIT-P36E-up/.test(b.filename));
  log('BUG200.inList', upEntry.map(b => ({ f: b.filename, t: b.type })));
  if (upEntry.length) {
    const f = upEntry[0].filename;
    const dl = await L.rreq(s, 'GET', '/api/backups/download/database/' + encodeURIComponent(f));
    log('BUG200.downloadStatus', dl.status);
    const before = sentinelCount();
    const r = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: f, confirmFilename: f });
    log('BUG200.restoreReachesService', { status: r.status, body: (r.text || '').slice(0, 300), sentinelBefore: before, sentinelAfter: sentinelCount() });
  }

  // ---------- BUG-198: restore/files lands in UPLOADS_DIR, not cwd/uploads ----------
  const victim = walk(UPLOADS_DIR).filter(p => /\.pdf$/i.test(p))[0];
  let victimBak = null;
  if (victim && goodFiles) {
    victimBak = fs.readFileSync(victim);
    fs.unlinkSync(victim);
    const cwdUploadsBefore = walk(path.join(CWD, 'uploads'));
    const r = await L.rreq(s, 'POST', '/api/backups/restore/files', { filename: goodFiles.filename, confirmFilename: goodFiles.filename });
    await L.sleep(2500);
    log('BUG198.restoreFiles', {
      status: r.status, body: (r.text || '').slice(0, 400),
      victim, victimBackAfterRestore: fs.existsSync(victim),
      newUnderCwdUploads: walk(path.join(CWD, 'uploads')).filter(p => !cwdUploadsBefore.includes(p)).slice(0, 10),
    });
    if (!fs.existsSync(victim)) { fs.mkdirSync(path.dirname(victim), { recursive: true }); fs.writeFileSync(victim, victimBak); log('BUG198.victimRestoredByHand', true); }
  } else {
    log('BUG198.restoreFiles', 'no pdf victim or no files backup available');
  }

  // ---------- BUG-208: complete restore with a broken files archive ----------
  const fBadTar = 'AUDIT-P36E-badfiles.tar.gz';
  fs.writeFileSync(path.join(BACKUP_PATH, fBadTar), Buffer.from('definitely not a tar.gz'));
  const before208 = sentinelCount();
  const r208 = await L.rreq(s, 'POST', '/api/backups/restore/complete', {
    databaseBackup: good.filename, filesBackup: fBadTar,
    confirmDatabaseBackup: good.filename, confirmFilesBackup: fBadTar,
  });
  await L.sleep(1500);
  log('BUG208.completeWithBrokenTar', { status: r208.status, body: (r208.text || '').slice(0, 500), sentinelBefore: before208, sentinelAfter: sentinelCount() });

  // ---------- BUG-221(d): retention leaves empty date directories ----------
  const oldDir = path.join(BACKUP_PATH, 'database', '2025', '01', '02');
  fs.mkdirSync(oldDir, { recursive: true });
  const oldName = 'db-backup-2025-01-02T00-00-00-000Z.sql.gz';
  const oldBuf = zlib.gzipSync(Buffer.from('--\n-- PostgreSQL database dump\n--\nSELECT 1;\n--\n-- PostgreSQL database dump complete\n--\n'));
  fs.writeFileSync(path.join(oldDir, oldName), oldBuf);
  fs.writeFileSync(path.join(oldDir, oldName + '.manifest.json'), JSON.stringify({
    timestamp: '2025-01-02T00:00:00.000Z', type: 'database', filename: oldName, size: oldBuf.length,
    checksum: require('crypto').createHash('sha256').update(oldBuf).digest('hex'), metadata: {},
  }));
  const cl = await L.rreq(s, 'POST', '/api/backups/cleanup', {});
  await L.sleep(1200);
  log('BUG221d.cleanup', {
    status: cl.status, body: (cl.text || '').slice(0, 200),
    oldFileDeleted: !fs.existsSync(path.join(oldDir, oldName)),
    emptyDirLeftBehind: fs.existsSync(oldDir),
    yearDirLeft: fs.existsSync(path.join(BACKUP_PATH, 'database', '2025')),
  });
  try { fs.rmSync(path.join(BACKUP_PATH, 'database', '2025'), { recursive: true, force: true }); } catch { }

  // ---------- BUG-220 + BUG-207: one successful restore ----------
  // A brand-new archive is taken immediately before it is restored, so this is as close to a no-op
  // as a full restore gets — other agents share lvs_regress and must not lose their fixtures.
  const run2 = await L.rreq(s, 'POST', '/api/backups/run', {});
  await L.sleep(1500);
  const l4 = await L.rget(s, '/api/backups/list');
  const fresh = (l4.json || []).filter(b => b.type === 'database' && b.checksum !== 'uploaded').sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  log('BUG197.freshArchiveForGoodRestore', { runStatus: run2.status, filename: fresh && fresh.filename });
  const rowsBeforeGood = L.sql("select (select count(*) from vehicles)||'|'||(select count(*) from customers)||'|'||(select count(*) from reservations)");
  log('BUG197.rowsBeforeGoodRestore', rowsBeforeGood);
  const runsBefore = L.sql("select status||':'||coalesce(type,'?') from backup_runs order by id desc limit 8").split('\n');
  const before = sentinelCount();
  const ok = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: fresh.filename, confirmFilename: fresh.filename });
  await L.sleep(3000);
  log('BUG197.goodRestore', { status: ok.status, body: (ok.text || '').slice(0, 400) });
  log('BUG197.sentinelBeforeAfter', [before, sentinelCount()]);
  log('BUG207.straySqlAfterGoodRestore', walk(BACKUP_PATH).filter(p => /\.sql$/i.test(p)));
  log('BUG207.tmpAfterGoodRestore', tmpLeftovers());
  log('BUG220.runningRowsAfterRestore', L.sql("select count(*) from backup_runs where status='running'"));
  log('BUG220.preRestoreRowExists', L.sql("select count(*) from backup_runs where type like '%pre-restore%' or error like '%restore%' or filename like 'db-backup-%'"));
  log('BUG220.lastRuns', L.sql("select id||' '||type||' '||status||' '||coalesce(filename,'-')||' '||coalesce(error,'-') from backup_runs order by id desc limit 8").split('\n'));
  log('BUG220.runsBefore', runsBefore);
  const h = await L.rget(s, '/api/backups/health');
  log('BUG220.healthAfterRestore', h.json);
  log('afterRestore.rowCounts', L.sql("select (select count(*) from vehicles)||'|'||(select count(*) from reservations)"));

  fs.writeFileSync(__dirname + '/e-backups2.out.json', JSON.stringify(OUT, null, 1));
  console.log('written e-backups2.out.json');
})().catch(e => {
  console.error('FATAL', e.stack);
  fs.writeFileSync(__dirname + '/e-backups2.out.json', JSON.stringify(Object.assign(OUT, { FATAL: String(e && e.stack) }), null, 1));
  process.exit(1);
});

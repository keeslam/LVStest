// P36-E — backup/restore regression (BUG-197..200, 206..209, 219..221).
// Derived from docs/audit/wip/scripts/p17-*.{sh,cjs}; retargeted at http://127.0.0.1:5003 / lvs_regress.
// Non-destructive by design: the FAILING restores must leave the DB untouched (that is the assertion),
// and the one successful restore uses an archive taken seconds earlier, so it is effectively a no-op
// for the other agents sharing lvs_regress.
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

function walk(dir) {
  const out = [];
  (function rec(d) {
    let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) rec(p); else out.push(p); }
  })(dir);
  return out;
}
function tmpLeftovers() {
  const t = os.tmpdir();
  let e; try { e = fs.readdirSync(t); } catch { return []; }
  return e.filter(n => /^(db-backup-|files-backup-|restore-|lvs-restore-)/.test(n));
}
function counts() {
  return L.sql("select (select count(*) from vehicles)||'|'||(select count(*) from customers)||'|'||(select count(*) from reservations)||'|'||(select count(*) from users)");
}

(async () => {
  const [s] = await L.staff(1, '10.36.20.');

  // ---------- 0. baseline ----------
  log('baseline.rowCounts_v_c_r_u', counts());
  log('baseline.tmpLeftovers', tmpLeftovers());
  log('baseline.backupPathFiles', walk(BACKUP_PATH).length);
  log('baseline.cwdBackupsFiles', walk(path.join(CWD, 'backups')).length);
  log('baseline.uploadsFiles', walk(UPLOADS_DIR).length);
  const health0 = await L.rget(s, '/api/backups/health');
  log('health', health0.json);

  // ---------- 1. BUG-206: temp files after a backup run ----------
  const tmpBefore = tmpLeftovers();
  const runR = await L.rreq(s, 'POST', '/api/backups/run', {});
  log('BUG206.runStatus', runR.status);
  log('BUG206.runBody', (runR.text || '').slice(0, 400));
  await L.sleep(3000);
  const tmpAfter = tmpLeftovers();
  log('BUG206.tmpBefore', tmpBefore);
  log('BUG206.tmpAfter', tmpAfter);
  log('BUG206.newTempFiles', tmpAfter.filter(x => !tmpBefore.includes(x)));

  // ---------- 1b. BUG-221(a): two concurrent runs ----------
  const [c1, c2] = await Promise.all([
    L.rreq(s, 'POST', '/api/backups/run', {}),
    L.rreq(s, 'POST', '/api/backups/run', {}),
  ]);
  log('BUG221a.concurrentStatuses', [c1.status, c2.status]);
  log('BUG221a.bodies', [(c1.text || '').slice(0, 200), (c2.text || '').slice(0, 200)]);
  log('BUG221a.retryAfter', [c1.headers.get('retry-after'), c2.headers.get('retry-after')]);

  await L.sleep(2000);
  const list = await L.rget(s, '/api/backups/list');
  const dbBackups = (list.json || []).filter(b => b.type === 'database').sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const fileBackups = (list.json || []).filter(b => b.type === 'files').sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const good = dbBackups[0];
  const goodFiles = fileBackups[0];
  log('freshDbBackup', good && { filename: good.filename, size: good.size });
  log('freshFilesBackup', goodFiles && { filename: goodFiles.filename, size: goodFiles.size, meta: goodFiles.metadata });

  // ---------- 1c. BUG-221(b): nextScheduled ----------
  const st = await L.rget(s, '/api/backups/status');
  log('BUG221b.status', st.json);
  log('BUG221b.now', new Date().toISOString());

  // ---------- 2. fixtures from the good archive ----------
  const goodPath = walk(BACKUP_PATH).find(p => p.endsWith(good.filename));
  log('goodArchivePath', goodPath);
  const plain = zlib.gunzipSync(fs.readFileSync(goodPath));
  log('goodArchive.plainBytes', plain.length);
  log('goodArchive.endsWithMarker', plain.slice(-200).toString().includes('PostgreSQL database dump complete'));
  log('goodArchive.hasBackupRunsCopy', /COPY public\.backup_runs/.test(plain.toString('latin1')));

  const dbDir = path.join(BACKUP_PATH, 'database');
  const mk = (name, buf) => { const p = path.join(dbDir, name); fs.writeFileSync(p, buf); return { name, p }; };

  // (a) truncated: first half, no completion marker
  const half = mk('db-backup-2026-09-12T01-00-00-001Z.sql.gz', zlib.gzipSync(plain.slice(0, Math.floor(plain.length / 2))));
  // (b) a valid-looking dump with one statement psql must reject
  const bad = Buffer.concat([
    plain.slice(0, plain.length),
  ]).toString('latin1').replace('--\n-- PostgreSQL database dump complete\n--',
    "SELECT 1/0; -- AUDIT-P36E deliberate SQL error\n--\n-- PostgreSQL database dump complete\n--");
  const sqlerr = mk('db-backup-2026-09-12T01-00-00-002Z.sql.gz', zlib.gzipSync(Buffer.from(bad, 'latin1')));
  // (c) a dump that switches database (BUG-199) - synthesised, never runs
  const connectDump = [
    '--', '-- PostgreSQL database dump', '--',
    'DROP DATABASE IF EXISTS lvs_regress_other;',
    "CREATE DATABASE lvs_regress_other WITH TEMPLATE = template0 ENCODING = 'UTF8';",
    '\\connect lvs_regress_other',
    'CREATE TABLE public.audit_p36e (id integer);',
    '--', '-- PostgreSQL database dump complete', '--', '',
  ].join('\n');
  const conn = mk('db-backup-2026-09-12T01-00-00-003Z.sql.gz', zlib.gzipSync(Buffer.from(connectDump)));
  log('fixtures', [half.name, sqlerr.name, conn.name]);

  const listAfterFixtures = await L.rget(s, '/api/backups/list');
  log('fixturesVisibleInList', (listAfterFixtures.json || []).filter(b => /01-00-00-00[123]Z/.test(b.filename)).map(b => b.filename));

  // ---------- 3. BUG-197 / BUG-199: restore the broken fixtures ----------
  for (const [tag, f] of [['truncated', half.name], ['sqlerror', sqlerr.name], ['connect', conn.name]]) {
    const before = counts();
    const r = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: f, confirmFilename: f });
    await L.sleep(1500);
    const after = counts();
    log('restore.' + tag, { status: r.status, body: (r.text || '').slice(0, 400), rowsBefore: before, rowsAfter: after, unchanged: before === after });
  }

  // ---------- 3b. BUG-207: no stray .sql anywhere after the failures ----------
  log('BUG207.straySqlUnderBackupPath', walk(BACKUP_PATH).filter(p => /\.sql$/i.test(p)));
  log('BUG207.tmpLeftoversNow', tmpLeftovers());

  // ---------- 4. BUG-221(e)/BUG-200: upload ----------
  const boundary = '----p36e' + Date.now();
  async function upload(route, filename, content, extra) {
    const parts = [];
    const push = (name, val, fname, ctype) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"` +
        (fname ? `; filename="${fname}"` : '') + `\r\n` + (ctype ? `Content-Type: ${ctype}\r\n` : '') + `\r\n`));
      parts.push(Buffer.isBuffer(val) ? val : Buffer.from(String(val)));
      parts.push(Buffer.from('\r\n'));
    };
    push('backup', content, filename, 'application/octet-stream');
    for (const [k, v] of Object.entries(extra || {})) push(k, v);
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    return L.rreq(s, 'POST', route, body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  }
  const emptyUp = await upload('/api/backups/upload', 'AUDIT-P36E-empty.sql', Buffer.alloc(0));
  log('BUG221e.emptyUpload', { status: emptyUp.status, body: (emptyUp.text || '').slice(0, 300) });

  const smallName = 'AUDIT-P36E-small.sql.gz';
  const smallGz = zlib.gzipSync(Buffer.from('--\n-- PostgreSQL database dump\n--\nSELECT 1;\n--\n-- PostgreSQL database dump complete\n--\n'));
  const cwdBefore = walk(path.join(CWD, 'backups'));
  const up = await upload('/api/backups/upload', smallName, smallGz);
  await L.sleep(800);
  const cwdAfter = walk(path.join(CWD, 'backups'));
  const bpFiles = walk(BACKUP_PATH);
  log('BUG200.uploadStatus', up.status);
  log('BUG200.uploadBody', (up.text || '').slice(0, 400));
  log('BUG200.newUnderCwdBackups', cwdAfter.filter(p => !cwdBefore.includes(p)));
  log('BUG200.matchingUnderBackupPath', bpFiles.filter(p => p.includes('AUDIT-P36E-small')));
  const list2 = await L.rget(s, '/api/backups/list');
  const uploaded = (list2.json || []).filter(b => /AUDIT-P36E-small/.test(b.filename));
  log('BUG200.inList', uploaded.map(b => ({ filename: b.filename, type: b.type })));
  if (uploaded.length) {
    const f = uploaded[0].filename;
    const before = counts();
    const r = await L.rreq(s, 'POST', '/api/backups/restore/database', { filename: f, confirmFilename: f });
    await L.sleep(1200);
    log('BUG200.restoreUploaded', { status: r.status, body: (r.text || '').slice(0, 300), rowsUnchanged: before === counts() });
  }

  // ---------- 5. BUG-209: download-files / download-data ----------
  const dlf = await L.rreq(s, 'GET', '/api/backups/download-files');
  log('BUG209.downloadFiles', { status: dlf.status, bytes: Buffer.byteLength(dlf.text || '', 'latin1'), body: dlf.status !== 200 ? (dlf.text || '').slice(0, 400) : '(binary)' });
  const dld = await L.rreq(s, 'GET', '/api/backups/download-data');
  const dldText = dld.text || '';
  log('BUG209.downloadData', {
    status: dld.status, bytes: Buffer.byteLength(dldText, 'latin1'),
    hasDropTableIfExists: /DROP TABLE IF EXISTS/.test(dldText),
    hasOwnerTo: /OWNER TO/.test(dldText),
    tempUnderCwd: walk(path.join(CWD, 'temp')).filter(p => /car-rental-data/.test(p)),
  });

  // ---------- 6. BUG-221(d): cleanup leaves empty date dirs ----------
  const emptyDirProbe = path.join(BACKUP_PATH, 'database', '2020', '01', '01');
  fs.mkdirSync(emptyDirProbe, { recursive: true });
  fs.writeFileSync(path.join(emptyDirProbe, 'db-backup-2020-01-01T00-00-00-000Z.sql.gz'), zlib.gzipSync(Buffer.from('-- old\n')));
  const cl = await L.rreq(s, 'POST', '/api/backups/cleanup', {});
  await L.sleep(800);
  log('BUG221d.cleanup', {
    status: cl.status, body: (cl.text || '').slice(0, 300),
    probeFileStillThere: fs.existsSync(path.join(emptyDirProbe, 'db-backup-2020-01-01T00-00-00-000Z.sql.gz')),
    probeDirStillThere: fs.existsSync(emptyDirProbe),
    emptyDirs: walk(BACKUP_PATH).length,
  });

  fs.writeFileSync(__dirname + '/e-backups.out.json', JSON.stringify(OUT, null, 1));
  console.log('written e-backups.out.json');
})().catch(e => {
  console.error('FATAL', e.stack);
  fs.writeFileSync(__dirname + '/e-backups.out.json', JSON.stringify(Object.assign(OUT, { FATAL: String(e && e.stack) }), null, 1));
  process.exit(1);
});

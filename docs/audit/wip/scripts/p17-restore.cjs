// Phase 17: call one of the restore endpoints on :5002 and time it.
// usage: node p17-restore.cjs database <filename> [confirm]
//        node p17-restore.cjs files <filename>
//        node p17-restore.cjs complete <dbfile> <filesfile>
//        node p17-restore.cjs restore-data <localpath> [originalname] [mimetype]
//        node p17-restore.cjs restore-files <localpath> [originalname]
//        node p17-restore.cjs upload <localpath> <type> [originalname] [mimetype]
'use strict';
const { Session } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const [mode, a, b, c] = process.argv.slice(2);
  const s = new Session('p17r', { fakeIp: '10.17.1.' + (10 + Math.floor(Math.random() * 200)) });
  const login = await s.loginStaff('admin', 'admin123');
  if (login.status !== 200) { console.log('login failed', login.status, login.text); process.exit(2); }
  const me0 = await s.get('/api/user');
  console.log('session before: /api/user', me0.status);

  let r; const t0 = Date.now();
  if (mode === 'database') {
    r = await s.post('/api/backups/restore/database', { filename: a, confirmFilename: b === undefined ? a : b });
  } else if (mode === 'files') {
    r = await s.post('/api/backups/restore/files', { filename: a });
  } else if (mode === 'complete') {
    r = await s.post('/api/backups/restore/complete', { databaseBackup: a, filesBackup: b, confirmDatabaseBackup: a, confirmFilesBackup: b });
  } else if (mode === 'restore-data' || mode === 'restore-files' || mode === 'upload') {
    const fd = new FormData();
    const buf = fs.readFileSync(a);
    const name = (mode === 'upload' ? c : b) || path.basename(a);
    const mime = (mode === 'upload' ? process.argv[6] : c) || (name.endsWith('.gz') || name.endsWith('.tgz') ? 'application/gzip' : 'application/sql');
    fd.append('backup', new Blob([buf], { type: mime }), name);
    if (mode === 'upload') fd.append('type', b);
    const headers = { Cookie: s.cookieHeader(), 'X-CSRF-Token': s.csrf, 'X-Forwarded-For': s.fakeIp };
    const res = await fetch('http://localhost:5002/api/backups/' + mode, { method: 'POST', headers, body: fd });
    const text = await res.text();
    r = { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
    console.log('sent', buf.length, 'bytes as', name, mime);
  } else { console.log('unknown mode'); process.exit(2); }
  const ms = Date.now() - t0;
  console.log(mode, 'status', r.status, ms + 'ms');
  console.log((r.text || '').slice(0, 1500));
  const me1 = await s.get('/api/user');
  console.log('session after: /api/user', me1.status, (me1.text || '').slice(0, 120));
  fs.appendFileSync(path.join(__dirname, 'files/p17/restore-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, a, b, status: r.status, ms, body: r.json ?? r.text.slice(0, 500), sessionAfter: me1.status }) + '\n');
})().catch(e => { console.error(e); process.exit(1); });

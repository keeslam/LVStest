// Phase 17 (11): POST /api/backups/upload with invalid/odd files; where do they land, are they listed?
'use strict';
const { Session, BASE } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_BACKUPS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\backups';
const ENV_BACKUPS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-backups';

async function upload(s, buf, name, mime, type) {
  const fd = new FormData();
  fd.append('backup', new Blob([buf], { type: mime }), name);
  fd.append('type', type);
  const t = Date.now();
  const res = await fetch(BASE + '/api/backups/upload', { method: 'POST', headers: { Cookie: s.cookieHeader(), 'X-CSRF-Token': s.csrf, 'X-Forwarded-For': s.fakeIp }, body: fd });
  const text = await res.text();
  return { status: res.status, ms: Date.now() - t, text: text.slice(0, 300) };
}

(async () => {
  const s = new Session('u', { fakeIp: '10.17.1.40' });
  console.log('login', (await s.loginStaff('admin', 'admin123')).status);
  const before = new Set(fs.readdirSync(REPO_BACKUPS));
  const F = path.join(__dirname, 'files/p17');
  const cases = [
    ['text-as-gz', Buffer.from('this is not gzip at all\n'.repeat(100)), 'notgzip.sql.gz', 'application/gzip', 'database'],
    ['zip-as-sqlgz', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2000, 1)]), 'archive.sql.gz', 'application/gzip', 'database'],
    ['zero-byte', Buffer.alloc(0), 'empty.sql.gz', 'application/gzip', 'database'],
    ['zero-byte-sql', Buffer.alloc(0), 'empty.sql', 'application/sql', 'database'],
    ['plain-sql-ok', Buffer.from('-- PostgreSQL database dump\nSELECT 1;\n'), 'small.sql', 'application/sql', 'database'],
    ['valid-name-gz', fs.readFileSync(path.join(F, 'dl-db-backup-2026-09-10T20-50-42-649Z.sql.gz')), 'db-backup-2026-09-10T20-50-42-649Z.sql.gz', 'application/gzip', 'database'],
    ['files-type-sql', Buffer.from('-- PostgreSQL database dump\n'), 'x.sql', 'application/sql', 'files'],
    ['exe-name', Buffer.from('MZ\x90\x00'), 'evil.exe', 'application/octet-stream', 'database'],
    ['no-type', Buffer.from('-- PostgreSQL database dump\n'), 'notype.sql', 'application/sql', ''],
    ['tar-ok', fs.readFileSync(path.join(F, 'p17-marker-upload.tar.gz')), 'marker.tar.gz', 'application/gzip', 'files'],
  ];
  const results = [];
  for (const [label, buf, name, mime, type] of cases) {
    const r = await upload(s, buf, name, mime, type);
    console.log(label.padEnd(16), name.padEnd(45), r.status, r.ms + 'ms', r.text.replace(/\s+/g, ' ').slice(0, 220));
    results.push({ label, name, ...r });
  }
  // 200 MB of gzip-looking bytes (header + zeros): what does the 1 GB limit / validation do, how long?
  const big = Buffer.alloc(200 * 1024 * 1024, 0); big[0] = 0x1f; big[1] = 0x8b; big[2] = 8;
  const rb = await upload(s, big, 'big.sql.gz', 'application/gzip', 'database');
  console.log('200MB'.padEnd(16), 'big.sql.gz'.padEnd(45), rb.status, rb.ms + 'ms', rb.text.replace(/\s+/g, ' ').slice(0, 220));
  results.push({ label: '200MB', name: 'big.sql.gz', ...rb });

  const after = fs.readdirSync(REPO_BACKUPS).filter(f => !before.has(f));
  console.log('NEW files in process.cwd()/backups:', after);
  for (const f of after) console.log('  ', f, fs.statSync(path.join(REPO_BACKUPS, f)).size, 'bytes');
  const envRoot = fs.readdirSync(ENV_BACKUPS).filter(f => f.startsWith('uploaded-'));
  console.log('uploaded-* files in BACKUP_PATH root:', envRoot);
  const list = await s.get('/api/backups/list');
  const listed = list.json.filter(b => b.filename.startsWith('uploaded-')).map(b => b.filename);
  console.log('uploaded-* entries returned by /api/backups/list:', listed);
  // try to restore one of the uploaded names via the app
  const target = after.find(f => f.endsWith('.sql.gz') && f.includes('db-backup'));
  if (target) {
    const r = await s.post('/api/backups/restore/database', { filename: target, confirmFilename: target });
    console.log('restore/database of uploaded file', target, r.status, (r.text || '').slice(0, 160));
    const d = await s.get('/api/backups/download/database/' + target);
    console.log('download of uploaded file', d.status, (d.text || '').slice(0, 80));
  }
  fs.writeFileSync(path.join(F, 'uploads-results.json'), JSON.stringify({ results, after, listed }, null, 1));
  // cleanup: remove ONLY the files this script created in the repo backups dir
  for (const f of after) { fs.unlinkSync(path.join(REPO_BACKUPS, f)); }
  console.log('cleanup: removed', after.length, 'files from process.cwd()/backups');
})().catch(e => { console.error(e); process.exit(1); });

// Phase 17 (b): download backups via both download endpoints, record headers + sha256.
// usage: node p17-b-download.cjs <filename> [<filename>...]
'use strict';
const { Session, BASE } = require('./p17-lib.cjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

(async () => {
  const s = new Session('p17b', { fakeIp: '10.17.1.2' });
  console.log('login', (await s.loginStaff('admin', 'admin123')).status);
  const outDir = path.join(__dirname, 'files/p17');
  for (const filename of process.argv.slice(2)) {
    const type = filename.startsWith('files-backup-') ? 'files' : 'database';
    for (const p of [`/api/backups/download/${filename}`, `/api/backups/download/${type}/${filename}`, `/api/backups/download/${type === 'files' ? 'database' : 'files'}/${filename}`]) {
      const res = await fetch(BASE + p, { headers: { Cookie: s.cookieHeader(), 'X-Forwarded-For': s.fakeIp } });
      const buf = Buffer.from(await res.arrayBuffer());
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      console.log(p, res.status, 'bytes', buf.length, 'sha256', sha, 'CD:', res.headers.get('content-disposition'), 'CT:', res.headers.get('content-type'), 'CL:', res.headers.get('content-length'));
      if (res.status === 200 && p.includes(`/${type}/`)) fs.writeFileSync(path.join(outDir, 'dl-' + filename), buf);
    }
  }
  // traversal-ish / bad names (existing bugs, just re-confirm status codes)
  for (const p of ['/api/backups/download/database/..%5c..%5cpackage.json', '/api/backups/download/database/nonexistent.sql.gz', '/api/backups/download/code/x.sql.gz']) {
    const r = await s.get(p);
    console.log(p, r.status, (r.text || '').slice(0, 100));
  }
})().catch(e => { console.error(e); process.exit(1); });

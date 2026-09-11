// Phase 17: the three "simple" download endpoints (download-data / download-files / download-code).
'use strict';
const { Session, BASE } = require('./p17-lib.cjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO_TEMP = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\temp';
(async () => {
  const s = new Session('d', { fakeIp: '10.17.1.70' });
  console.log('login', (await s.loginStaff('admin', 'admin123')).status);
  const F = path.join(__dirname, 'files/p17');
  for (const ep of ['download-data', 'download-files', 'download-code']) {
    const t = Date.now();
    const res = await fetch(BASE + '/api/backups/' + ep, { headers: { Cookie: s.cookieHeader(), 'X-Forwarded-For': s.fakeIp } });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(ep, res.status, Date.now() - t, 'ms', 'bytes', buf.length, 'CD:', res.headers.get('content-disposition'), 'CT:', res.headers.get('content-type'));
    if (res.status !== 200) { console.log('  body:', buf.toString().slice(0, 300)); continue; }
    const out = path.join(F, 'dl-' + ep + (ep === 'download-data' ? '.sql' : '.tar.gz'));
    fs.writeFileSync(out, buf);
    if (ep === 'download-data') {
      const txt = buf.toString('utf8');
      console.log('  head:', JSON.stringify(txt.slice(0, 120)));
      console.log('  --clean present?', /DROP TABLE IF EXISTS/.test(txt), 'OWNER TO?', /OWNER TO/.test(txt), 'COPY blocks', (txt.match(/^COPY /gm) || []).length, 'contains smtp pw?', txt.includes('AUDIT-super-secret-smtp-pw'));
    } else {
      const listing = execSync(`"C:\\Program Files\\Git\\usr\\bin\\tar.exe" -tzf "${out}"`, { maxBuffer: 64e6 }).toString().split('\n').filter(Boolean);
      console.log('  entries:', listing.length, 'first:', listing.slice(0, 3));
      if (ep === 'download-files') {
        const audit = listing.filter(l => /AU9|AU13D1X|AU905X|AUDIT/.test(l)).length;
        console.log('  entries that look like audit-uploads-bk content (AU9xx/AUDIT):', audit, ' -> archive is of process.cwd()/uploads, not UPLOADS_DIR');
      } else {
        const secrets = listing.filter(l => /\.env|jar|cookie|secret|\.pem|id_rsa/i.test(l));
        console.log('  suspicious entries:', secrets.length, secrets.slice(0, 8));
        const top = {}; for (const l of listing) { const k = l.split('/')[1] || l; top[k] = (top[k] || 0) + 1; }
        console.log('  top-level:', JSON.stringify(Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12)));
      }
      fs.unlinkSync(out);
    }
  }
  await new Promise(r => setTimeout(r, 1500));
  console.log('repo temp/ after downloads:', fs.readdirSync(REPO_TEMP).map(f => f + ':' + fs.statSync(path.join(REPO_TEMP, f)).size));
})().catch(e => { console.error(e); process.exit(1); });

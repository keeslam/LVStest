// BUG-069 - backup restore archive containment.
// Part 1: sandbox replication of the EXACT restore-code extraction (no HTTP, no process.exit).
// Part 2: real HTTP probes against /api/backups/restore-files (safe: rejected before any write).
const { Session } = require('./lib.cjs');
const fs = require('fs'); const path = require('path'); const os = require('os');
const tar = require('C:/Users/kees lam/Desktop/LVStest-main/LVStest-main/node_modules/tar');
const PW = 'P36brgss!23';
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'AUDIT-P36B-'));
function log(t, r, x) { console.log(t.padEnd(58), r.status, (x === undefined ? r.text : x).toString().slice(0, 260).replace(/\s+/g, ' ')); }

const SEP = String.fromCharCode(92); // backslash

function unsafeEntry(entryPath) {
  const p = String(entryPath).split(SEP).join('/');
  return p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').some((seg) => seg === '..');
}

function makeArchive(file, members) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'AUDIT-P36B-stage-'));
  const names = [];
  for (const m of members) {
    const p = path.join(stage, ...m.name.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, m.data);
    names.push(m.name);
  }
  tar.c({ sync: true, gzip: true, file, cwd: stage }, names);
  return file;
}

(async () => {
  console.log('=== PART 1: sandbox replication of restore-code extraction (cwd = sandbox, NOT the repo) ===');
  console.log('sandbox:', SB);
  const evil = path.join(SB, 'evil.tar.gz');
  makeArchive(evil, [
    { name: 'dist/server/index.js', data: '// AUDIT-P36B marker - this would be the running server bundle\n' },
    { name: 'node_modules/AUDIT-P36B-pkg/index.js', data: '// AUDIT-P36B marker\n' },
  ]);
  let rejected = 0;
  const target = path.join(SB, 'extract'); fs.mkdirSync(target);
  await tar.x({
    file: evil, cwd: target, preservePaths: false,
    filter: (entryPath) => { const u = unsafeEntry(entryPath); if (u) rejected += 1; return !u; },
  });
  console.log('rejectedEntries =', rejected);
  console.log('dist/server/index.js WRITTEN into cwd:', fs.existsSync(path.join(target, 'dist', 'server', 'index.js')));
  console.log('node_modules/AUDIT-P36B-pkg/index.js WRITTEN:', fs.existsSync(path.join(target, 'node_modules', 'AUDIT-P36B-pkg', 'index.js')));

  console.log('\n=== PART 2: real HTTP against /api/backups/restore-files ===');
  const m = new Session('mgr', { fakeIp: '198.51.100.73' });
  console.log('manager login', (await m.loginStaff('AUDIT-P36B-manager', PW)).status, '(manage_backups)');
  async function upload(file, name) {
    const b = '----AUDITP36B' + Date.now();
    const body = Buffer.concat([
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="confirm"\r\n\r\n' + name + '\r\n'),
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="backup"; filename="' + name + '"\r\nContent-Type: application/gzip\r\n\r\n'),
      fs.readFileSync(file), Buffer.from('\r\n--' + b + '--\r\n')]);
    return m.request('POST', '/api/backups/restore-files', body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + b } });
  }
  const a1 = path.join(SB, 'AUDIT-P36B-outside.tar.gz');
  makeArchive(a1, [{ name: 'dist/server/index.js', data: '// AUDIT-P36B\n' }]);
  log('restore-files: member dist/server/index.js', await upload(a1, 'AUDIT-P36B-outside.tar.gz'));

  // absolute / traversal member, written straight into the tar stream
  const a2 = path.join(SB, 'AUDIT-P36B-trav.tar.gz');
  const pack = new tar.Pack({ gzip: true });
  const out = fs.createWriteStream(a2);
  pack.pipe(out);
  const stage2 = fs.mkdtempSync(path.join(os.tmpdir(), 'AUDIT-P36B-s2-'));
  fs.writeFileSync(path.join(stage2, 'x.txt'), 'x');
  pack.add(path.join(stage2, 'x.txt'));
  pack.end();
  await new Promise((r) => out.on('close', r));
  log('restore-files: absolute-path member', await upload(a2, 'AUDIT-P36B-trav.tar.gz'));

  console.log('sandbox left at', SB);
})().catch((e) => console.error('FATAL', e));

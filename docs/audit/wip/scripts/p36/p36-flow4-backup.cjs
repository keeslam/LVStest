// Flow 4: back-up maken -> goede archief herstellen -> beschadigd archief weigeren
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs'); const path = require('path');
const BK = 'C:/Users/kees lam/Desktop/LVStest-main/regress-backups';
const T = []; const step = (n, ok, ev) => { T.push({ step: n, ok, evidence: ev }); console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + n + ' | ' + ev); };
(async () => {
  const s = new Session('sweep'); const lg = await s.loginStaff('audit-p36w', 'P36sweep!23');
  step('0. inloggen', lg.status === 200, 'HTTP ' + lg.status);

  const before = fs.existsSync(BK) ? fs.readdirSync(BK) : [];
  step('0b. back-upmap', true, BK + ' bevat ' + before.length + ' bestand(en)');

  const h = await s.get('/api/backups/health');
  step('1a. back-upgezondheid', h.status === 200, 'HTTP ' + h.status + ' ' + JSON.stringify(h.json).slice(0, 250));
  const st = await s.get('/api/backups/status');
  step('1b. back-upstatus', st.status === 200, 'HTTP ' + st.status + ' ' + JSON.stringify(st.json).slice(0, 250));

  // 2. run a backup
  const run = await s.post('/api/backups/run', { type: 'database' });
  step('2a. back-up draaien', run.status === 200 || run.status === 201, 'HTTP ' + run.status + ' ' + (run.text || '').slice(0, 300));
  await new Promise(r => setTimeout(r, 4000));
  const after = fs.existsSync(BK) ? fs.readdirSync(BK) : [];
  const made = after.filter(f => !before.includes(f));
  step('2b. nieuw archief op schijf', made.length > 0, 'nieuw: ' + (made.join(', ') || '(geen)') + ' | totaal nu ' + after.length);

  const ls = await s.get('/api/backups/list');
  const items = Array.isArray(ls.json) ? ls.json : (ls.json && (ls.json.backups || ls.json.data)) || [];
  step('2c. archief in de lijst', ls.status === 200, 'HTTP ' + ls.status + ' n=' + items.length + ' eerste=' + JSON.stringify(items[0] || {}).slice(0, 200));

  // 3. download the newest archive, so we have a known-good file
  const dbItems = items.filter(i => (i.type === 'database') || /^db-backup/.test(i.filename || i.name || '')); let goodName = (dbItems[0] && (dbItems[0].filename || dbItems[0].name)) || null;
  step('3. archiefnaam voor de hersteltest', !!goodName, String(goodName));

  // 4. a DAMAGED archive must be refused
  const badPath = path.join(BK, 'AUDIT-P36W-damaged.sql.gz');
  fs.writeFileSync(badPath, Buffer.from('this is not a gzip archive at all, AUDIT-P36W'));
  const bad = await s.post('/api/backups/restore/database', { filename: 'AUDIT-P36W-damaged.sql.gz' });
  step('4a. beschadigd archief geweigerd', bad.status >= 400, 'HTTP ' + bad.status + ' ' + (bad.text || '').slice(0, 300));

  // 4b. a gzip file whose contents are garbage
  const zlib = require('zlib');
  const badGz = path.join(BK, 'AUDIT-P36W-garbage.sql.gz');
  fs.writeFileSync(badGz, zlib.gzipSync(Buffer.from('DROP TABLE nothing; -- AUDIT-P36W garbage, not a pg_dump')));
  const bad2 = await s.post('/api/backups/restore/database', { filename: 'AUDIT-P36W-garbage.sql.gz' });
  step('4b. geldige gzip met onzin-inhoud', bad2.status >= 400, 'HTTP ' + bad2.status + ' ' + (bad2.text || '').slice(0, 300));

  // 4c. traversal in the filename must be refused
  const trav = await s.post('/api/backups/restore/database', { filename: '../../etc/passwd' });
  step('4c. padtraversal in de bestandsnaam geweigerd', trav.status >= 400, 'HTTP ' + trav.status + ' ' + (trav.text || '').slice(0, 200));

  // 5. restore the GOOD archive into lvs_regress
  if (goodName) {
    const ok = await s.post('/api/backups/restore/database', { filename: goodName });
    step('5. goed archief herstellen', ok.status === 200, 'HTTP ' + ok.status + ' ' + (ok.text || '').slice(0, 400));
  }
  // 6. server alive afterwards
  const hh = await fetch('http://127.0.0.1:5003/health').then(r => r.json()).catch(e => ({ err: String(e) }));
  step('6. server leeft na de hersteltest', !!hh.status, JSON.stringify(hh).slice(0, 200));
  fs.writeFileSync(__dirname + '/flow4.json', JSON.stringify(T, null, 1));
})();

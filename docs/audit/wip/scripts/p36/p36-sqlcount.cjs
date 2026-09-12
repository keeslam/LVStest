// Statement-telling zonder pg_stat_statements: delta van xact_commit op lvs_regress.
// Elke autocommit-statement is één transactie, dus het delta benadert het aantal statements.
'use strict';
const { execFileSync } = require('child_process');
const { Session } = require('./lib.cjs');
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
function xact() {
  const out = execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'lvs_regress', '-t', '-A', '-c',
    "select xact_commit+xact_rollback from pg_stat_database where datname='lvs_regress'"],
    { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim();
  return parseInt(out, 10);
}
const iso = d => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return iso(d); };
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
(async () => {
  const s = new Session('cnt'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const cookie = s.cookieHeader();
  // noise floor: how many transactions happen while we do nothing
  const n0 = xact(); await new Promise(r => setTimeout(r, 3000)); const n1 = xact();
  console.log('ruisvloer over 3 s zonder verzoek van ons: ' + (n1 - n0) + ' transacties');
  const cases = [
    ['GET /api/reservations/range (maand)', '/api/reservations/range?startDate=' + monthStart() + '&endDate=' + monthEnd()],
    ['GET /api/reservations', '/api/reservations'],
    ['GET /api/vehicles', '/api/vehicles'],
    ['GET /api/today', '/api/today?date=' + iso(new Date())],
    ['GET /api/interactive-damage-checks', '/api/interactive-damage-checks'],
  ];
  for (const [label, url] of cases) {
    const a = xact();
    const r = await fetch('http://127.0.0.1:5003' + url, { headers: { Cookie: cookie } });
    const buf = Buffer.from(await r.arrayBuffer());
    const b = xact();
    let rows = null; try { const j = JSON.parse(buf.toString()); rows = Array.isArray(j) ? j.length : null; } catch (e) {}
    console.log('['+r.status+'] '+label.padEnd(38) + ' statements≈' + String(b - a).padStart(5) + '  rijen=' + rows + '  bytes=' + buf.length);
  }
})();

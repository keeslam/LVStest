'use strict';
const { execFileSync } = require('child_process');
const { getSession } = require('./session-cache.cjs');
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
function xact() {
  return parseInt(execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'lvs_regress', '-t', '-A', '-c',
    "select xact_commit+xact_rollback from pg_stat_database where datname='lvs_regress'"],
    { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim(), 10);
}
const iso = d => d.toISOString().slice(0, 10);
const ms = () => { const d = new Date(); d.setDate(1); return iso(d); };
const me2 = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
(async () => {
  const s = await getSession();
  const cookie = s.cookieHeader();
  const n0 = xact(); await new Promise(r => setTimeout(r, 3000)); const n1 = xact();
  console.log('ruisvloer 3 s: ' + (n1 - n0) + ' transacties');
  const cases = [
    ['GET /api/reservations/range (maandweergave)', '/api/reservations/range?startDate=' + ms() + '&endDate=' + me2()],
    ['GET /api/reservations', '/api/reservations'],
    ['GET /api/vehicles', '/api/vehicles'],
    ['GET /api/today', '/api/today?date=' + iso(new Date())],
    ['GET /api/interactive-damage-checks', '/api/interactive-damage-checks'],
    ['GET /api/user (basislijn)', '/api/user'],
  ];
  const res = [];
  for (const [label, url] of cases) {
    // three repetitions, take the minimum (contamination can only add)
    let best = Infinity, bytes = 0, rows = null, status = 0;
    for (let i = 0; i < 3; i++) {
      const a = xact();
      const r = await fetch('http://127.0.0.1:5003' + url, { headers: { Cookie: cookie } });
      const buf = Buffer.from(await r.arrayBuffer());
      const b = xact();
      best = Math.min(best, b - a); bytes = buf.length; status = r.status;
      if (rows === null) { try { const j = JSON.parse(buf.toString()); rows = Array.isArray(j) ? j.length : null; } catch (e) {} }
    }
    res.push({ label, status, statements: best, rows, bytes });
    console.log('[' + status + '] ' + label.padEnd(42) + ' statements=' + String(best).padStart(4) + '  rijen=' + rows + '  bytes=' + bytes);
  }
  require('fs').writeFileSync(__dirname + '/sqlcount.json', JSON.stringify(res, null, 1));
})();

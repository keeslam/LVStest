'use strict';
const { execFileSync } = require('child_process'); const fs = require('fs');
const { getSession } = require('./session-cache.cjs');
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const LOG = 'C:/Program Files/PostgreSQL/17/data/log/postgresql-2026-09-12_000000.log';
function mark(tag) {
  execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'lvs_regress', '-t', '-A', '-c', "select 'P36MARK_" + tag + "'"],
    { env: { ...process.env, PGPASSWORD: 'postgres' } });
}
function logSize() { return fs.statSync(LOG).size; }
function readFrom(off) { const fd = fs.openSync(LOG, 'r'); const len = fs.statSync(LOG).size - off; const b = Buffer.alloc(Math.max(0, len)); if (len > 0) fs.readSync(fd, b, 0, len, off); fs.closeSync(fd); return b.toString('latin1'); }
const iso = d => d.toISOString().slice(0, 10);
const ms = () => { const d = new Date(); d.setDate(1); return iso(d); };
const me2 = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
(async () => {
  const s = await getSession(); const cookie = s.cookieHeader();
  const cases = [
    ['GET /api/user (basislijn)', '/api/user'],
    ['GET /api/reservations/range (maandweergave)', '/api/reservations/range?startDate=' + ms() + '&endDate=' + me2()],
    ['GET /api/reservations', '/api/reservations'],
    ['GET /api/vehicles', '/api/vehicles'],
    ['GET /api/today', '/api/today?date=' + iso(new Date())],
    ['GET /api/interactive-damage-checks', '/api/interactive-damage-checks'],
  ];
  const res = [];
  for (const [label, url] of cases) {
    let best = Infinity, bytes = 0, rows = null, status = 0;
    for (let i = 0; i < 3; i++) {
      mark('A'); const off = logSize();
      const r = await fetch('http://127.0.0.1:5003' + url, { headers: { Cookie: cookie } });
      const buf = Buffer.from(await r.arrayBuffer());
      await new Promise(x => setTimeout(x, 400));
      mark('B');
      const chunk = readFrom(off);
      // count statement/execute lines belonging to lvs_regress, excluding our own markers and psql
      const lines = chunk.split(/\r?\n/).filter(l => / lvs_regress /.test(l) && /(statement:|execute )/.test(l) && !/P36MARK_/.test(l) && !/ psql /.test(l));
      best = Math.min(best, lines.length); bytes = buf.length; status = r.status;
      if (rows === null) { try { const j = JSON.parse(buf.toString()); rows = Array.isArray(j) ? j.length : null; } catch (e) {} }
    }
    res.push({ label, status, statements: best, rows, bytes });
    console.log('[' + status + '] ' + label.padEnd(44) + ' statements=' + String(best).padStart(5) + '  rijen=' + rows + '  bytes=' + bytes);
  }
  fs.writeFileSync(__dirname + '/sqlcount.json', JSON.stringify(res, null, 1));
})();

// P19 step 2: SQL statements per request (from the Postgres statement log), N+1 detection.
// Each endpoint is requested 3x; the rep with the FEWEST statements is reported (other agents/the lead
// share the database, so contamination can only add statements, never remove them).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const REPS = 3;
const SETTLE_MS = 500;

const ENDPOINTS = [
  ['staff', 'GET', '/api/user'],
  ['staff', 'GET', '/api/reservations'],
  ['staff', 'GET', '/api/reservations?search=A'],
  ['staff', 'GET', '/api/reservations?search=AU'],
  ['staff', 'GET', '/api/reservations/range?startDate=2026-09-07&endDate=2026-09-13'],   // 1 week
  ['staff', 'GET', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04'],   // 5-week calendar grid
  ['staff', 'GET', '/api/reservations/range?startDate=2026-01-01&endDate=2026-12-31'],   // 1 year
  ['staff', 'GET', '/api/reservations/upcoming'],
  ['staff', 'GET', '/api/reservations/overdue'],
  ['staff', 'GET', '/api/reservations/3535'],
  ['staff', 'GET', '/api/reservations/check-conflicts?vehicleId=1870&startDate=2026-09-10&endDate=2026-09-12'],
  ['staff', 'GET', '/api/placeholder-reservations/needing-assignment?daysAhead=30'],
  ['staff', 'GET', '/api/vehicles'],
  ['staff', 'GET', '/api/vehicles?search=A'],
  ['staff', 'GET', '/api/vehicles/available'],
  ['staff', 'GET', '/api/vehicles/available?startDate=2026-09-15&endDate=2026-09-20'],
  ['staff', 'GET', '/api/vehicles/apk-expiring'],
  ['staff', 'GET', '/api/vehicles/service-due'],
  ['staff', 'GET', '/api/vehicles/status/breakdown'],
  ['staff', 'GET', '/api/customers'],
  ['staff', 'GET', '/api/customers?search=A'],
  ['staff', 'GET', '/api/customers/with-reservations'],
  ['staff', 'GET', '/api/documents'],
  ['staff', 'GET', '/api/transports'],
  ['staff', 'GET', '/api/expenses'],
  ['staff', 'GET', '/api/fines'],
  ['staff', 'GET', '/api/custom-notifications'],
  ['staff', 'GET', '/api/interactive-damage-checks'],
  ['staff', 'GET', '/api/reports/maintenance-costs'],
  ['staff', 'GET', '/api/reports/vehicle-financials?from=2026-01-01&to=2026-09-10'],
  ['staff', 'GET', '/api/reports/mileage-per-month?from=2026-01-01&to=2026-09-10'],
  ['staff', 'GET', '/api/portal-admin/unread-count'],
  ['staff', 'GET', '/api/portal-admin/dashboard'],
  ['staff', 'GET', '/api/portal-admin/customers-overview'],
  ['staff', 'GET', '/api/portal-requests'],
  ['staff', 'GET', '/api/audit-logs'],
  ['staff', 'GET', '/api/vehicles/with-reservations'],
  ['staff', 'GET', '/api/vehicles/filtered?filterType=maintenance'],
  ['portal', 'GET', '/api/portal/reservations'],
  ['portal', 'GET', '/api/portal/documents'],
  ['portal', 'GET', '/api/portal/vehicles/mine'],
  ['portal', 'GET', '/api/portal/vehicles'],
  ['portal', 'GET', '/api/portal/fines'],
  ['portal', 'GET', '/api/portal/requests'],
  ['portal', 'GET', '/api/portal/notifications'],
  ['portal', 'GET', '/api/portal/notifications/unread-count'],
  ['none', 'GET', '/health'],
  ['none', 'GET', '/api'],
];

(async () => {
  const [staff] = await L.staffSessions(1, '10.19.4.');
  const portal = await L.portalSession('10.19.4.9');
  const anon = new L.Session('anon', { fakeIp: '10.19.4.8' });
  const pick = (realm) => realm === 'portal' ? portal : realm === 'none' ? anon : staff;

  // warm-up so the pool has clients that already log (settings apply per connection)
  await staff.get('/api/user'); await L.sleep(300);

  const filter = process.argv[2] || '';
  const results = [];
  for (const [realm, method, p] of ENDPOINTS) {
    if (filter && !p.includes(filter)) continue;
    const reps = [];
    for (let i = 0; i < REPS; i++) {
      await L.sleep(SETTLE_MS);
      const offset = L.logSize();
      const r = await L.timed(pick(realm), method, p);
      await L.sleep(SETTLE_MS);
      const stmts = L.parseStatements(L.readLogFrom(offset));
      reps.push({ ms: r.ms, status: r.status, rows: r.rows, bytes: r.bytes, ...L.summarizeStatements(stmts) });
    }
    const best = reps.slice().sort((a, b) => a.count - b.count)[0];
    const row = { realm, method, path: p, status: best.status, rows: best.rows, bytes: best.bytes, ms: best.ms, statements: best.count, sqlMs: best.totalMs, slowest: best.slowest, shapes: best.shapes, allCounts: reps.map(x => x.count) };
    results.push(row);
    console.log(`${p.padEnd(80)} rows=${String(row.rows).padEnd(5)} stmts=${String(row.statements).padEnd(5)} (${row.allCounts.join('/')}) sqlMs=${row.sqlMs} ms=${row.ms} slowest=${row.slowest ? row.slowest.ms + 'ms' : '-'}`);
  }
  const outName = filter ? `p19-sqlcount-${filter.replace(/[^a-z0-9]+/gi, '_')}.out.json` : 'p19-sqlcount.out.json';
  fs.writeFileSync(path.join(__dirname, outName), JSON.stringify({ at: new Date().toISOString(), reps: REPS, results }, null, 2));
  console.log('written p19-sqlcount.out.json');
})().catch(e => { console.error(e); process.exit(1); });

// P19 step 1: endpoint timing table. 12 sequential runs + one 10-parallel burst per endpoint.
// Usage: node docs/audit/wip/scripts/p19-timing.cjs [filterSubstring]
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const RUNS = 12;
const BURST = 10;
const filter = process.argv[2] || '';

// realm: 'staff' | 'portal' | 'none'
const ENDPOINTS = [
  ['none', 'GET', '/health'],
  ['none', 'GET', '/api'],
  ['staff', 'GET', '/api/user'],
  ['staff', 'GET', '/api/reservations'],
  ['staff', 'GET', '/api/reservations?search=A'],
  ['staff', 'GET', '/api/reservations?search=AU'],
  ['staff', 'GET', '/api/reservations?search=ZZZZNOMATCH'],
  ['staff', 'GET', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04'],
  ['staff', 'GET', '/api/reservations/range?startDate=2026-01-01&endDate=2026-12-31'],
  ['staff', 'GET', '/api/reservations/upcoming'],
  ['staff', 'GET', '/api/reservations/upcoming-maintenance'],
  ['staff', 'GET', '/api/reservations/overdue'],
  ['staff', 'GET', '/api/reservations/3535'],
  ['staff', 'GET', '/api/reservations/vehicle/1870'],
  ['staff', 'GET', '/api/reservations/check-conflicts?vehicleId=1870&startDate=2026-09-10&endDate=2026-09-12'],
  ['staff', 'GET', '/api/placeholder-reservations/needing-assignment?daysAhead=30'],
  ['staff', 'GET', '/api/vehicles'],
  ['staff', 'GET', '/api/vehicles?search=A'],
  ['staff', 'GET', '/api/vehicles?search=AU-13'],
  ['staff', 'GET', '/api/vehicles?search=ZZZZNOMATCH'],
  ['staff', 'GET', '/api/vehicles/available'],
  ['staff', 'GET', '/api/vehicles/available?startDate=2026-09-15&endDate=2026-09-20'],
  ['staff', 'GET', '/api/vehicles/apk-expiring'],
  ['staff', 'GET', '/api/vehicles/warranty-expiring'],
  ['staff', 'GET', '/api/vehicles/service-due'],
  ['staff', 'GET', '/api/vehicles/status/breakdown'],
  ['staff', 'GET', '/api/vehicles/with-reservations'],
  ['staff', 'GET', '/api/vehicles/filtered?filterType=apk'],
  ['staff', 'GET', '/api/vehicles/1870'],
  ['staff', 'GET', '/api/customers'],
  ['staff', 'GET', '/api/customers?search=A'],
  ['staff', 'GET', '/api/customers?search=AUDIT'],
  ['staff', 'GET', '/api/customers?search=ZZZZNOMATCH'],
  ['staff', 'GET', '/api/customers/with-reservations'],
  ['staff', 'GET', '/api/customers/1282'],
  ['staff', 'GET', '/api/drivers'],
  ['staff', 'GET', '/api/documents'],
  ['staff', 'GET', '/api/documents/reservation/3535'],
  ['staff', 'GET', '/api/custom-notifications'],
  ['staff', 'GET', '/api/custom-notifications/unread'],
  ['staff', 'GET', '/api/transports'],
  ['staff', 'GET', '/api/fines'],
  ['staff', 'GET', '/api/fines/count?customerId=1282'],
  ['staff', 'GET', '/api/expenses'],
  ['staff', 'GET', '/api/expenses/recent?limit=10'],
  ['staff', 'GET', '/api/interactive-damage-checks'],
  ['staff', 'GET', '/api/reports/maintenance-costs'],
  ['staff', 'GET', '/api/reports/vehicle-financials?from=2026-01-01&to=2026-09-10'],
  ['staff', 'GET', '/api/reports/mileage-per-month?from=2026-01-01&to=2026-09-10'],
  ['staff', 'GET', '/api/reports/saved'],
  ['staff', 'GET', '/api/portal-admin/unread-count'],
  ['staff', 'GET', '/api/portal-admin/dashboard'],
  ['staff', 'GET', '/api/portal-admin/customers-overview'],
  ['staff', 'GET', '/api/portal-admin/vehicles-online'],
  ['staff', 'GET', '/api/portal-requests'],
  ['staff', 'GET', '/api/app-settings/key/calendar_settings'],
  ['staff', 'GET', '/api/system-settings'],
  ['staff', 'GET', '/api/audit-logs'],
  ['staff', 'GET', '/api/pdf-templates'],
  ['staff', 'GET', '/api/damage-check-templates'],
  ['portal', 'GET', '/api/portal/reservations'],
  ['portal', 'GET', '/api/portal/documents'],
  ['portal', 'GET', '/api/portal/notifications'],
  ['portal', 'GET', '/api/portal/notifications/unread-count'],
  ['portal', 'GET', '/api/portal/fines'],
  ['portal', 'GET', '/api/portal/requests'],
  ['portal', 'GET', '/api/portal/vehicles/mine'],
  ['portal', 'GET', '/api/portal/vehicles'],
  ['portal', 'GET', '/api/portal/drivers'],
];

(async () => {
  const staff = await L.staffSessions(4);
  const portal = await L.portalSession();
  const anon = new L.Session('anon', { fakeIp: '10.19.3.1' });
  let rr = 0;
  const pick = (realm) => realm === 'portal' ? portal : realm === 'none' ? anon : staff[(rr++) % staff.length];

  const results = [];
  for (const [realm, method, p] of ENDPOINTS) {
    if (filter && !p.includes(filter)) continue;
    const seq = [];
    let last = null;
    for (let i = 0; i < RUNS; i++) {
      const r = await L.timed(pick(realm), method, p);
      seq.push(r.ms);
      last = r;
    }
    // 10-parallel burst
    const t0 = process.hrtime.bigint();
    const burst = await Promise.all(Array.from({ length: BURST }, () => L.timed(pick(realm), method, p)));
    const burstWall = Number(process.hrtime.bigint() - t0) / 1e6;
    const burstMs = burst.map(b => b.ms);
    const row = {
      realm, method, path: p, status: last.status, rows: last.rows, bytes: last.bytes,
      contentLength: last.contentLength, contentEncoding: last.contentEncoding, contentType: (last.contentType || '').split(';')[0],
      seq: L.stats(seq), burst: Object.assign(L.stats(burstMs), { wallMs: +burstWall.toFixed(1), statuses: burst.map(b => b.status) }),
      sample: typeof last.text === 'string' ? last.text.slice(0, 160) : null,
    };
    results.push(row);
    console.log(`${p.padEnd(80)} ${String(row.status).padEnd(4)} rows=${String(row.rows).padEnd(5)} bytes=${String(row.bytes).padEnd(9)} p50=${row.seq.p50} p95=${row.seq.p95} burst p95=${row.burst.p95} wall=${row.burst.wallMs}`);
    await L.sleep(150);
  }
  const health = await L.health(anon);
  const out = { at: new Date().toISOString(), runs: RUNS, burst: BURST, note: 'dev mode (tsx), Vite dev server, shared host with other audit agents; ms = wall time incl. body read', health, results };
  fs.writeFileSync(path.join(__dirname, 'p19-timing.out.json'), JSON.stringify(out, null, 2));
  console.log('written p19-timing.out.json');
})().catch(e => { console.error(e); process.exit(1); });

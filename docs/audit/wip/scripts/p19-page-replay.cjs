// P19 step 3/4: replay the request set each page fires on first paint (from client/src useQuery keys), in parallel
// like the browser does, and total the bytes / wall time. This is a reproduction of the client's request pattern
// (React Query dedupes identical keys; distinct keys with the same URL are separate requests).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const SHELL = ['/api/user', '/api/portal-admin/unread-count']; // AuthProvider + sidebar badge, always mounted
const PAGES = {
  // client/src/pages/reservations/calendar.tsx (:583-711) — 5-week grid for September 2026
  reservations: [
    '/api/vehicles', '/api/transports',
    '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04',
    '/api/reservations',                      // key ['/api/reservations'] (:632)
    '/api/reservations',                      // key ['/api/reservations', vehicles.length] (:658) -> same URL, separate cache entry
    '/api/reservations/overdue', '/api/app-settings/key/calendar_settings',
  ],
  // client/src/pages/dashboard.tsx widgets
  dashboard: [
    '/api/backups/health', '/api/apk-date-changes/scan-status', '/api/vehicles', '/api/reservations/upcoming',
    '/api/vehicles/available', '/api/vehicles/apk-expiring', '/api/reservations/overdue', '/api/vehicles/warranty-expiring',
    '/api/placeholder-reservations/needing-assignment?daysAhead=30', '/api/reservations', '/api/customers', '/api/transports',
    '/api/expenses/recent?limit=10', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/app-settings/key/calendar_settings',
  ],
  // client/src/pages/vehicles/index.tsx (:97-104)
  vehicles: ['/api/vehicles', '/api/reservations'],
  // client/src/pages/customers/index.tsx (:47-57)
  customers: ['/api/customers', '/api/reservations', '/api/drivers'],
  // client/src/pages/maintenance/calendar.tsx (:357-441)
  maintenance: [
    '/api/vehicles', '/api/vehicles/apk-expiring', '/api/vehicles/warranty-expiring', '/api/vehicles/service-due',
    '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/reservations', '/api/app-settings/key/calendar_settings', '/api/system-settings',
  ],
  // client/src/pages/documents/index.tsx (:68-89)
  documents: ['/api/documents', '/api/vehicles', '/api/pdf-templates', '/api/transport-report-templates', '/api/barcode-label-templates'],
};

(async () => {
  const sessions = await L.staffSessions(3, '10.19.9.');
  const out = { at: new Date().toISOString(), pages: {} };
  for (const [page, reqs] of Object.entries(PAGES)) {
    const all = [...SHELL, ...reqs];
    const t0 = process.hrtime.bigint();
    const res = await Promise.all(all.map((p, i) => L.timed(sessions[i % sessions.length], 'GET', p)));
    const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const totalBytes = res.reduce((a, r) => a + r.bytes, 0);
    out.pages[page] = { requests: all.length, wallMs: +wallMs.toFixed(0), totalBytes, totalMB: +(totalBytes / 1048576).toFixed(2), detail: res.map((r, i) => ({ path: all[i], status: r.status, ms: r.ms, bytes: r.bytes, rows: r.rows })) };
    console.log(page.padEnd(14), `${all.length} requests, ${out.pages[page].totalMB} MB, wall ${out.pages[page].wallMs} ms, slowest ${Math.max(...res.map(r => r.ms))} ms`);
    await L.sleep(1500);
  }
  fs.writeFileSync(path.join(__dirname, 'p19-page-replay.out.json'), JSON.stringify(out, null, 2));
  console.log('written p19-page-replay.out.json');
})().catch(e => { console.error(e); process.exit(1); });

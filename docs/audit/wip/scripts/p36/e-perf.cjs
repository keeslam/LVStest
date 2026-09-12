// P36-E — the phase-19 performance metrics re-measured on :5003 / lvs_regress, same method as
// docs/audit/wip/p19-performance.md (12 sequential runs then one 10-parallel burst; decoded body
// bytes; Content-Encoding recorded), plus the first-paint page replay of p19-page-replay.cjs and
// the write-on-read check for BUG-217.
'use strict';
const fs = require('fs');
const L = require('./e-lib.cjs');
const OUT = { at: new Date().toISOString(), note: 'lvs_regress is smaller than the phase-19 dataset lvs_audit; per-row figures are given so the comparison is fair.' };
const log = (k, v) => { OUT[k] = v; console.log('### ' + k + ': ' + JSON.stringify(v).slice(0, 700)); };

const SEQ = 12, BURST = 10;
const ENDPOINTS = [
  ['GET', '/api'],
  ['GET', '/api/reservations'],
  ['GET', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04'],
  ['GET', '/api/reservations/range?startDate=2026-01-01&endDate=2026-12-31'],
  ['GET', '/api/reservations/overdue'],
  ['GET', '/api/vehicles'],
  ['GET', '/api/customers'],
  ['GET', '/api/expenses'],
  ['GET', '/api/interactive-damage-checks'],
  ['GET', '/api/today'],
  ['GET', '/api/customers/with-reservations'],
];
const SHELL = ['/api/user', '/api/portal-admin/unread-count'];
const PAGES = {
  // one key for /api/reservations now (FIX-T); the phase-19 replay fetched it twice on this page
  reservations: ['/api/vehicles', '/api/transports', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04',
    '/api/reservations', '/api/reservations/overdue', '/api/app-settings/key/calendar_settings'],
  dashboard: ['/api/backups/health', '/api/apk-date-changes/scan-status', '/api/vehicles', '/api/reservations/upcoming',
    '/api/vehicles/available', '/api/vehicles/apk-expiring', '/api/reservations/overdue', '/api/vehicles/warranty-expiring',
    '/api/placeholder-reservations/needing-assignment?daysAhead=30', '/api/reservations', '/api/customers', '/api/transports',
    '/api/expenses/recent?limit=10', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/app-settings/key/calendar_settings'],
  vehicles: ['/api/vehicles', '/api/reservations'],
  customers: ['/api/customers', '/api/reservations', '/api/drivers'],
  maintenance: ['/api/vehicles', '/api/vehicles/apk-expiring', '/api/vehicles/warranty-expiring', '/api/vehicles/service-due',
    '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/reservations', '/api/app-settings/key/calendar_settings', '/api/system-settings'],
};

(async () => {
  const ss = await L.staff(3, '10.36.40.');
  const s = ss[0];

  // ---------------- timings ----------------
  const timing = [];
  for (const [m, p] of ENDPOINTS) {
    const seq = [];
    let last = null;
    for (let i = 0; i < SEQ; i++) { last = await L.rtimed(s, m, p); seq.push(last.ms); await L.sleep(120); }
    const t0 = Date.now();
    const burst = await Promise.all(Array.from({ length: BURST }, (_, i) => L.rtimed(ss[i % ss.length], m, p)));
    const wall = Date.now() - t0;
    const row = {
      path: p, status: last.status, rows: last.rows, bytes: last.bytes,
      bytesPerRow: last.rows ? Math.round(last.bytes / last.rows) : null,
      contentEncoding: last.contentEncoding,
      seqP50: L.pct(seq, 50), seqP95: L.pct(seq, 95), seqMin: Math.min(...seq),
      burstP95: L.pct(burst.map(b => b.ms), 95), burstWallMs: wall,
    };
    timing.push(row);
    console.log(p.padEnd(62), 'rows=' + String(row.rows).padEnd(5), 'bytes=' + String(row.bytes).padEnd(9), 'p50=' + row.seqP50, 'p95=' + row.seqP95, 'burstP95=' + row.burstP95, 'enc=' + row.contentEncoding);
    await L.sleep(600);
  }
  OUT.timing = timing;

  // ---------------- first-paint page replay ----------------
  const pages = {};
  for (const [page, reqs] of Object.entries(PAGES)) {
    const all = [...SHELL, ...reqs];
    const t0 = Date.now();
    const res = await Promise.all(all.map((p, i) => L.rtimed(ss[i % ss.length], 'GET', p)));
    const wall = Date.now() - t0;
    const bytes = res.reduce((a, r) => a + r.bytes, 0);
    pages[page] = { requests: all.length, wallMs: wall, totalBytes: bytes, totalMB: +(bytes / 1048576).toFixed(2) };
    console.log(page.padEnd(14), `${all.length} requests, ${pages[page].totalMB} MB, wall ${wall} ms`);
    await L.sleep(1200);
  }
  OUT.pageReplay = pages;

  // ---------------- BUG-217: does a read write? ----------------
  const upd = () => { const o = L.sql("select relname||':'||n_tup_upd from pg_stat_user_tables where relname='vehicles'"); return Number(o.split(':')[1]); };
  const res217 = {};
  for (const p of ['/api/vehicles', '/api/vehicles/status/breakdown']) {
    const reps = [];
    for (let i = 0; i < 3; i++) {
      const a = upd(); await L.sleep(300);
      const r = await L.rtimed(s, 'GET', p);
      await L.sleep(900);
      reps.push({ status: r.status, updDelta: upd() - a, ms: r.ms });
    }
    res217[p] = { reps, minUpdDelta: Math.min(...reps.map(x => x.updDelta)) };
    console.log('BUG-217', p, JSON.stringify(res217[p]));
  }
  OUT.bug217 = res217;

  fs.writeFileSync(__dirname + '/e-perf.out.json', JSON.stringify(OUT, null, 1));
  console.log('written e-perf.out.json');
})().catch(e => {
  console.error('FATAL', e.stack);
  fs.writeFileSync(__dirname + '/e-perf.out.json', JSON.stringify(Object.assign(OUT, { FATAL: String(e.stack) }), null, 1));
  process.exit(1);
});

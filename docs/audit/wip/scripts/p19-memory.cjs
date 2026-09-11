// P19 step 6: server process memory before/after load. Samples RSS/private bytes of the tsx server (PID from p19-lib).
// Phases: baseline -> 500 mixed requests -> 20 large-list requests -> 50 contract PDFs -> 20 s idle.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const MIXED = [
  '/api/user', '/api/vehicles', '/api/customers', '/api/reservations/upcoming', '/api/reservations/overdue',
  '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/vehicles/available', '/api/vehicles/apk-expiring',
  '/api/documents', '/api/transports', '/api/custom-notifications', '/api/portal-admin/unread-count', '/api/app-settings/key/calendar_settings',
  '/api/reservations/3535', '/api/vehicles/1870', '/api/customers/1282', '/api/expenses/recent?limit=10', '/api/fines', '/api/system-settings', '/api/reservations?search=AU',
];
const LARGE = ['/api/reservations', '/api/interactive-damage-checks', '/api/reservations/range?startDate=2026-01-01&endDate=2026-12-31', '/api/reports/vehicle-financials?from=2026-01-01&to=2026-09-10'];

(async () => {
  const sessions = await L.staffSessions(5, '10.19.5.');
  const anon = new L.Session('anon', { fakeIp: '10.19.5.9' });
  const samples = [];
  const sample = async (label, extra = {}) => {
    const m = L.processMemory();
    const h = await L.health(anon);
    const s = Object.assign({ label }, m, { pool: h && h.database && h.database.pool, uptime: h && h.uptime }, extra);
    samples.push(s);
    console.log(label.padEnd(28), `rss=${s.rssMB}MB private=${s.privateMB}MB pool=${JSON.stringify(s.pool)}`);
    return s;
  };

  await sample('baseline');
  await L.sleep(2000);
  await sample('baseline+2s');

  // 500 mixed requests, 10 in flight, rotated over 5 sessions/IPs
  let i = 0, errors = 0, statuses = {};
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < 500) {
      const k = i++;
      const p = MIXED[k % MIXED.length];
      const r = await L.timed(sessions[k % sessions.length], 'GET', p);
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      if (r.status >= 400) errors++;
    }
  }));
  await sample('after 500 mixed', { wallMs: Date.now() - t0, statuses, errors });
  await L.sleep(3000);
  await sample('after 500 mixed +3s');

  // 20 large-list requests (sequential)
  let bytes = 0; const t1 = Date.now();
  for (let k = 0; k < 20; k++) { const r = await L.timed(sessions[k % sessions.length], 'GET', LARGE[k % LARGE.length]); bytes += r.bytes; }
  await sample('after 20 large lists', { wallMs: Date.now() - t1, totalBytes: bytes });
  await L.sleep(3000);
  await sample('after 20 large lists +3s');

  // 50 contract PDF generations (default template) — NOTE: each call also writes a file + documents row (side effect of the endpoint)
  const t2 = Date.now(); let pdfBytes = 0; const pdfMs = [];
  for (let k = 0; k < 50; k++) {
    const r = await L.timed(sessions[k % sessions.length], 'GET', '/api/contracts/generate/3535');
    pdfBytes += r.bytes; pdfMs.push(r.ms);
    if (r.status !== 200) console.log('pdf status', r.status, r.text.slice(0, 120));
  }
  await sample('after 50 contract PDFs', { wallMs: Date.now() - t2, totalBytes: pdfBytes, pdf: L.stats(pdfMs) });
  await L.sleep(20000);
  await sample('after 20 s idle');

  fs.writeFileSync(path.join(__dirname, 'p19-memory.out.json'), JSON.stringify({ at: new Date().toISOString(), pid: L.SERVER_PID, samples }, null, 2));
  console.log('written p19-memory.out.json');
})().catch(e => { console.error(e); process.exit(1); });

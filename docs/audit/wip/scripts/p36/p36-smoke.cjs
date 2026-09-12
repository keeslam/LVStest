// Rooktest: de GET-endpoints achter de hoofdschermen. Zoekt 5xx en lege/kapotte antwoorden.
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const iso = d => d.toISOString().slice(0, 10); const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const ms = () => { const d = new Date(); d.setDate(1); return iso(d); }; const me = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
const URLS = [
  '/api/user', '/api/today?date=' + iso(new Date()),
  '/api/vehicles', '/api/vehicles/available?startDate=' + iso(new Date()) + '&endDate=' + day(2),
  '/api/customers', '/api/customers/with-reservations', '/api/customers/duplicates',
  '/api/reservations', '/api/reservations/range?startDate=' + ms() + '&endDate=' + me(),
  '/api/reservations/upcoming', '/api/reservations/overdue',
  '/api/transports', '/api/documents', '/api/documents/damage-checks',
  '/api/interactive-damage-checks', '/api/expenses', '/api/expenses/recent',
  '/api/deleted-records', '/api/pdf-templates', '/api/damage-check-templates',
  '/api/transport-report-templates', '/api/settings', '/api/users',
  '/api/backups/list', '/api/backups/health', '/api/backups/status',
  '/api/portal-admin/dashboard', '/api/portal-admin/accounts', '/api/portal-admin/config',
  '/api/portal-admin/vehicles-online', '/api/portal-admin/blacklist', '/api/portal-admin/activity',
  '/api/portal-requests', '/api/portal-requests/count-new',
  '/api/spare-vehicles/available?startDate=' + iso(new Date()) + '&endDate=' + day(2),
  '/api/fines', '/api/drivers', '/api/notifications', '/api/audit-logs',
  '/api/reports/maintenance-costs', '/api/reports/mileage-per-month',
  '/api/apk-date-changes/scan-status', '/api/placeholder-reservations',
];
(async () => {
  const s = new Session('smoke'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const bad = [], out = [];
  for (const u of URLS) {
    const t0 = Date.now();
    let r; try { r = await s.get(u); } catch (e) { bad.push([u, 'ERR', String(e)]); continue; }
    const ct = r.headers.get('content-type') || '';
    const html = ct.includes('text/html');
    const row = { url: u, status: r.status, bytes: r.text.length, ms: Date.now() - t0, ct: ct.split(';')[0], html };
    out.push(row);
    if (r.status >= 500 || html || r.status === 429) bad.push([u, r.status, (html ? 'SPA-HTML (route bestaat niet)' : r.text.slice(0, 160))]);
    console.log(String(r.status).padEnd(4) + String(row.bytes).padStart(9) + 'B ' + String(row.ms).padStart(5) + 'ms ' + (html ? '[HTML] ' : '       ') + u);
  }
  console.log('\n=== PROBLEMEN (' + bad.length + ') ===');
  for (const b of bad) console.log(b.join(' | '));
  fs.writeFileSync(__dirname + '/smoke.json', JSON.stringify({ out, bad }, null, 1));
})();

// Fase 36 — metingen op :5003, dezelfde endpoints als fase 19
'use strict';
const { Session } = require('./lib.cjs'); const fs = require('fs');
const iso = d => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return iso(d); };
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
(async () => {
  const s = new Session('meas'); await s.loginStaff('audit-p36w', 'P36sweep!23');
  const cookie = s.cookieHeader();
  const targets = [
    ['GET /api/reservations', '/api/reservations'],
    ['GET /api/vehicles', '/api/vehicles'],
    ['GET /api/customers', '/api/customers'],
    ['GET /api/reservations/range (maandweergave)', '/api/reservations/range?startDate=' + monthStart() + '&endDate=' + monthEnd()],
    ['GET /api/interactive-damage-checks', '/api/interactive-damage-checks'],
    ['GET /api/today', '/api/today?date=' + iso(new Date())],
    ['GET /api/expenses', '/api/expenses'],
  ];
  const out = [];
  for (const [label, url] of targets) {
    const times = []; let bytes = 0, status = 0, enc = null, rows = null;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await fetch('http://127.0.0.1:5003' + url, { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip, deflate, br' } });
      const buf = Buffer.from(await r.arrayBuffer());
      times.push(Date.now() - t0); bytes = buf.length; status = r.status; enc = r.headers.get('content-encoding');
      if (i === 0) { try { const j = JSON.parse(buf.toString()); rows = Array.isArray(j) ? j.length : (j && Array.isArray(j.data) ? j.data.length : (j && typeof j === 'object' ? Object.keys(j).length + ' velden' : null)); } catch (e) { rows = null; } }
    }
    times.sort((a, b) => a - b);
    out.push({ label, url, status, bytes, rows, contentEncoding: enc || '(geen)', ms_median: times[2], ms_min: times[0], ms_max: times[4] });
    console.log(label.padEnd(44), 'HTTP ' + status, String(bytes).padStart(9) + ' B', 'rijen=' + rows, 'enc=' + (enc || '-'), 'mediaan=' + times[2] + 'ms');
  }
  fs.writeFileSync(__dirname + '/measurements.json', JSON.stringify(out, null, 1));
})();

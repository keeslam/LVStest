// P19: how compressible are the big JSON payloads (server sends none compressed), and does an authenticated
// response still carry RateLimit-* headers (BUG-074: apiLimiter skip never fires).
'use strict';
const zlib = require('zlib');
const L = require('./p19-lib.cjs');
(async () => {
  const [s] = await L.staffSessions(1, '10.19.10.');
  const out = {};
  for (const p of ['/api/reservations', '/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04', '/api/vehicles', '/api/interactive-damage-checks', '/api/expenses']) {
    const r = await s.get(p, { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
    const raw = Buffer.from(r.text, 'utf8');
    const gz = zlib.gzipSync(raw, { level: 6 });
    out[p] = { bytes: raw.length, gzipBytes: gz.length, ratio: +(raw.length / gz.length).toFixed(1), contentEncoding: r.headers.get('content-encoding'), rateLimitRemaining: r.headers.get('ratelimit-remaining'), rateLimitLimit: r.headers.get('ratelimit-limit') };
    console.log(p.padEnd(70), JSON.stringify(out[p]));
  }
  require('fs').writeFileSync(require('path').join(__dirname, 'p19-compress.out.json'), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

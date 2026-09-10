// Phase 14 F: does a huge damage-check template (page=N) block the server event loop? Poll /health while a preview renders.
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const st = await L.staff('10.14.1.11');
  const N = Number(process.argv[2] || 40000);
  const probes = [];
  let stop = false;
  const poller = (async () => {
    while (!stop) {
      const t0 = Date.now();
      let status;
      try { const r = await fetch(L.BASE + '/health', { signal: AbortSignal.timeout(20000) }); status = r.status; } catch (e) { status = 'ERR ' + e.name; }
      probes.push({ at: new Date(t0).toISOString().slice(11, 23), ms: Date.now() - t0, status });
      await new Promise(r => setTimeout(r, 500));
    }
  })();
  const t0 = Date.now();
  const r = await L.getBuffer(st, '/api/damage-check-templates/preview-pdf', { method: 'POST', body: { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'on page ' + N, fontSize: 11, page: N }] } });
  const total = Date.now() - t0;
  stop = true; await poller;
  const maxProbe = probes.reduce((m, p) => Math.max(m, p.ms), 0);
  const slow = probes.filter(p => p.ms > 1500);
  const out = { N, status: r.status, ct: r.contentType, bytes: r.buf.length, totalMs: total, healthProbes: probes.length, maxHealthLatencyMs: maxProbe, probesOver1500ms: slow.length, slowProbes: slow.slice(0, 10), healthAfter: await L.health() };
  if (r.status === 200 && r.buf.length < 200 * 1024 * 1024) { try { const { PDFDocument } = require('pdf-lib'); const d = await PDFDocument.load(r.buf); out.pages = d.getPageCount(); } catch (e) { out.pageCountError = e.message; } }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, `p14-f-eventloop-${N}.out.json`), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

// P19 step 7: PDF generation timing + event-loop blocking probe.
// contract (default template), contract templateId=2, generate-default, damage check, transport report.
// Blocking probe: GET /api (no DB, no auth) polled every 50 ms while 5 PDFs generate in parallel.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const RUNS = 12;
const RES = 3535;

async function series(sessions, method, p, body) {
  const ms = []; let last = null;
  for (let i = 0; i < RUNS; i++) { last = await L.timed(sessions[i % sessions.length], method, p, body); ms.push(last.ms); if (last.status >= 300) console.log(' ->', p, last.status, (last.text || '').slice(0, 150)); }
  return { path: p, status: last.status, bytes: last.bytes, contentType: (last.contentType || '').split(';')[0], seq: L.stats(ms) };
}

async function probe(durationMs, ip) {
  const s = new L.Session('probe', { fakeIp: ip });
  const lat = []; const end = Date.now() + durationMs;
  while (Date.now() < end) {
    const t0 = process.hrtime.bigint();
    await s.get('/api');
    lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
    await L.sleep(50);
  }
  return L.stats(lat);
}

(async () => {
  const sessions = await L.staffSessions(3, '10.19.6.');
  const out = { at: new Date().toISOString(), runs: RUNS, series: [], blocking: {}, sqlPerContract: null };

  // SQL statements for one contract generation
  await L.sleep(500); let off = L.logSize();
  await L.timed(sessions[0], 'GET', `/api/contracts/generate/${RES}`);
  await L.sleep(600);
  out.sqlPerContract = L.summarizeStatements(L.parseStatements(L.readLogFrom(off)));
  off = L.logSize();
  await L.timed(sessions[0], 'GET', `/api/damage-checks/generate/${RES}`);
  await L.sleep(600);
  out.sqlPerDamageCheck = L.summarizeStatements(L.parseStatements(L.readLogFrom(off)));

  out.series.push(await series(sessions, 'GET', `/api/contracts/generate/${RES}`));
  out.series.push(await series(sessions, 'GET', `/api/contracts/generate/${RES}?templateId=2`));
  out.series.push(await series(sessions, 'GET', `/api/contracts/generate-default/${RES}`));
  out.series.push(await series(sessions, 'GET', `/api/damage-checks/generate/${RES}`));
  out.series.push(await series(sessions, 'POST', '/api/delivery/transports/generate-report', { transportIds: [71] }));
  out.series.push(await series(sessions, 'POST', '/api/delivery/transports/generate-report', { transportIds: [67, 68, 69, 71] }));
  for (const s of out.series) console.log(s.path.padEnd(60), s.status, `bytes=${s.bytes}`, `p50=${s.seq.p50} p95=${s.seq.p95} max=${s.seq.max}`);

  // Blocking probe: idle baseline
  out.blocking.idle = await probe(3000, '10.19.6.8');
  console.log('probe idle', out.blocking.idle);
  // 5 contract PDFs in parallel
  let p = probe(6000, '10.19.6.8');
  const t0 = Date.now();
  const c = await Promise.all(Array.from({ length: 5 }, (_, i) => L.timed(sessions[i % 3], 'GET', `/api/contracts/generate/${RES}`)));
  out.blocking.contracts5 = { wallMs: Date.now() - t0, each: c.map(x => x.ms), statuses: c.map(x => x.status), probe: await p };
  console.log('probe during 5 contracts', out.blocking.contracts5);
  await L.sleep(1500);
  // 5 damage-check PDFs in parallel
  p = probe(6000, '10.19.6.8');
  const t1 = Date.now();
  const d = await Promise.all(Array.from({ length: 5 }, (_, i) => L.timed(sessions[i % 3], 'GET', `/api/damage-checks/generate/${RES}`)));
  out.blocking.damageChecks5 = { wallMs: Date.now() - t1, each: d.map(x => x.ms), statuses: d.map(x => x.status), probe: await p };
  console.log('probe during 5 damage checks', out.blocking.damageChecks5);
  await L.sleep(1500);
  // 5 large list requests in parallel (JSON serialisation of /api/reservations) for comparison
  p = probe(6000, '10.19.6.8');
  const t2 = Date.now();
  const l = await Promise.all(Array.from({ length: 5 }, (_, i) => L.timed(sessions[i % 3], 'GET', '/api/reservations')));
  out.blocking.lists5 = { wallMs: Date.now() - t2, each: l.map(x => x.ms), statuses: l.map(x => x.status), probe: await p };
  console.log('probe during 5 reservation lists', out.blocking.lists5);

  fs.writeFileSync(path.join(__dirname, 'p19-pdf.out.json'), JSON.stringify(out, null, 2));
  console.log('written p19-pdf.out.json');
})().catch(e => { console.error(e); process.exit(1); });

// P19 step 8: large file upload/download (20 MB, 50 MB PDF-shaped files) + a 20 MB JSON body.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p19-lib.cjs');

const SCRATCH = process.env.P19_SCRATCH || path.join(process.env.TEMP || '.', 'p19');
fs.mkdirSync(SCRATCH, { recursive: true });

function makePdf(sizeMB) {
  const p = path.join(SCRATCH, `AUDIT-P19-${sizeMB}MB.pdf`);
  if (!fs.existsSync(p) || fs.statSync(p).size !== sizeMB * 1048576) {
    const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
    const fd = fs.openSync(p, 'w');
    fs.writeSync(fd, header);
    const chunk = Buffer.alloc(1048576, 0x20);
    let written = header.length;
    while (written < sizeMB * 1048576) { const n = Math.min(chunk.length, sizeMB * 1048576 - written); fs.writeSync(fd, chunk, 0, n); written += n; }
    fs.closeSync(fd);
  }
  return p;
}

async function upload(session, filePath, name) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('vehicleId', '1870');
  fd.append('documentType', 'AUDIT-P19-large');
  fd.append('notes', 'AUDIT-P19 large file test');
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), name);
  const memBefore = L.processMemory();
  const t0 = process.hrtime.bigint();
  const r = await session.request('POST', '/api/documents', fd, { raw: true });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const memAfter = L.processMemory();
  return { ms: +ms.toFixed(0), status: r.status, body: (r.text || '').slice(0, 300), json: r.json, memBefore, memAfter, rssDeltaMB: +(memAfter.rssMB - memBefore.rssMB).toFixed(1) };
}

async function download(session, id) {
  const memBefore = L.processMemory();
  const t0 = process.hrtime.bigint();
  const res = await fetch(L.BASE + `/api/documents/download/${id}`, { headers: { Cookie: session.cookieHeader(), 'X-Forwarded-For': session.fakeIp } });
  const ttfb = Number(process.hrtime.bigint() - t0) / 1e6;
  let bytes = 0;
  for await (const chunk of res.body) bytes += chunk.length;
  const total = Number(process.hrtime.bigint() - t0) / 1e6;
  const memAfter = L.processMemory();
  return { status: res.status, ttfbMs: +ttfb.toFixed(0), totalMs: +total.toFixed(0), bytes, contentLength: res.headers.get('content-length'), transferEncoding: res.headers.get('transfer-encoding'), acceptRanges: res.headers.get('accept-ranges'), memBefore, memAfter, rssDeltaMB: +(memAfter.rssMB - memBefore.rssMB).toFixed(1) };
}

(async () => {
  const [s] = await L.staffSessions(1, '10.19.7.');
  const out = { at: new Date().toISOString(), uploads: {}, downloads: {}, jsonBody: null };

  for (const mb of [20, 50]) {
    const f = makePdf(mb);
    console.log(`upload ${mb} MB ...`);
    const u = await upload(s, f, `AUDIT-P19-${mb}MB.pdf`);
    out.uploads[mb] = u;
    console.log(` -> ${u.status} in ${u.ms} ms, rss ${u.memBefore.rssMB} -> ${u.memAfter.rssMB} MB; body: ${u.body.slice(0, 120)}`);
    if (u.status === 201 && u.json && u.json.id) {
      await L.sleep(1000);
      const d = await download(s, u.json.id);
      out.downloads[mb] = d;
      console.log(` download -> ${d.status} ttfb=${d.ttfbMs} ms total=${d.totalMs} ms bytes=${d.bytes} rss ${d.memBefore.rssMB} -> ${d.memAfter.rssMB} MB`);
    }
    await L.sleep(1500);
  }

  // 20 MB JSON body: express.json limit is 50mb; the body is fully buffered + parsed + sanitised before validation rejects it
  const big = JSON.stringify({ licensePlate: 'AUDIT-P19-BIG', brand: 'x'.repeat(20 * 1048576) });
  const memBefore = L.processMemory();
  const t0 = process.hrtime.bigint();
  const r = await s.request('POST', '/api/vehicles', Buffer.from(big), { headers: { 'Content-Type': 'application/json' } });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const memAfter = L.processMemory();
  out.jsonBody = { bytes: big.length, ms: +ms.toFixed(0), status: r.status, body: (r.text || '').slice(0, 200), memBefore, memAfter, rssDeltaMB: +(memAfter.rssMB - memBefore.rssMB).toFixed(1) };
  console.log(`20 MB JSON POST -> ${r.status} in ${out.jsonBody.ms} ms, rss ${memBefore.rssMB} -> ${memAfter.rssMB} MB`);
  await L.sleep(5000);
  out.afterIdle = L.processMemory();
  console.log('after 5 s idle rss', out.afterIdle.rssMB);

  fs.writeFileSync(path.join(__dirname, 'p19-largefile.out.json'), JSON.stringify(out, null, 2));
  console.log('written p19-largefile.out.json');
})().catch(e => { console.error(e); process.exit(1); });

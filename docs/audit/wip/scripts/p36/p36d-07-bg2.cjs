// P36 agent D — BUG-179 (background degradation) + BUG-180 (clean multipage PDF) + BUG-193 (preview PNG)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const { PDFDocument, PDFName } = require(path.join(process.cwd(), 'node_modules', 'pdf-lib'));
const BS = String.fromCharCode(92);
function makePng(w, h, color) {
  const { createCanvas } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color || '#3366aa'; ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  return c.toBuffer('image/png');
}
function makeJpeg(w, h) {
  const { createCanvas } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#22aa55'; ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/jpeg');
}
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.18');
  const out = {};

  out.G0_state = await L.step('G0 state of tplBg after deleted background file (BUG-179 reset)', async () => {
    const row = await L.q('select id, name, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplBg]);
    const lib = await st.get(`/api/pdf-templates/${ids.tplBg}/backgrounds`);
    return { row: row[0], backgrounds: lib.status + ' ' + lib.text.slice(0, 400) };
  });

  out.G1_clean_pdf_bg = await L.step('G1 clean 3-page PDF background -> contract page count (BUG-180)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) { const p = doc.addPage([595, 842]); p.drawText('AUDIT-P36D bg page ' + (i + 1), { x: 50, y: 700, size: 14 }); }
    const bytes = Buffer.from(await doc.save());
    const up = await L.upload(st, `/api/pdf-templates/${ids.tplFull}/background`, 'background', 'audit-p36d-clean.pdf', 'application/pdf', bytes);
    const row = await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplFull]);
    const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`, 'g1_contract_3pagebg.pdf', { textChars: 300 });
    let pages = null;
    if (gen.isPdf) { const loaded = await PDFDocument.load(fs.readFileSync(path.join(L.OUT_DIR, 'g1_contract_3pagebg.pdf'))); pages = loaded.getPageCount(); }
    return { upload: up.status, uploadBody: (up.text || '').slice(0, 250), row: row[0], gen: gen.status, contractPages: pages, text: (gen.allText || '').slice(0, 200) };
  });

  out.G2_preview = await L.step('G2 background preview PNG for a PDF background (BUG-193)', async () => {
    const row = await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplFull]);
    const prev = row[0].background_preview_path;
    let served = null, onDisk = null;
    if (prev) {
      const rel = String(prev).split(BS).join('/');
      const r = await L.getBuffer(st, '/' + rel.replace(/^\/+/, ''));
      served = { url: '/' + rel.replace(/^\/+/, ''), status: r.status, ct: r.contentType, bytes: r.buf.length, head: r.buf.slice(0, 8).toString('latin1') };
      const up = ['C:', 'Users', 'kees lam', 'Desktop', 'LVStest-main', 'regress-uploads'].join(BS);
      const p = path.join(up, rel.replace(/^.*?uploads\//i, ''));
      onDisk = { path: p, exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
    }
    const missing = await L.getBuffer(st, '/uploads/templates/audit-p36d-does-not-exist.png');
    return { row: row[0], served, onDisk, missingPreview: { status: missing.status, ct: missing.contentType, head: missing.buf.toString('utf8').slice(0, 80) } };
  });

  out.G3_jpeg_as_png = await L.step('G3 JPEG bytes named .png (BUG-179 extension)', async () => {
    const jpg = makeJpeg(595, 842);
    const up = await L.upload(st, `/api/pdf-templates/${ids.tplBg}/background`, 'background', 'audit-p36d-x.png', 'image/jpeg', jpg);
    const row = await L.q('select id, background_path from pdf_templates where id=$1', [ids.tplBg]);
    const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplBg}`, 'g3_jpegpng.pdf', { textChars: 200 });
    return { upload: up.status, uploadBody: (up.text || '').slice(0, 250), row: row[0], gen: { status: gen.status, isPdf: gen.isPdf, bytes: gen.bytes, body: (gen.body || '').slice(0, 200) } };
  });

  out.G4_cross_select = await L.step('G4 select another template background + delete active (BUG-179)', async () => {
    const libA = await st.get(`/api/pdf-templates/${ids.tplFull}/backgrounds`);
    const libB = await st.get(`/api/pdf-templates/${ids.tplBg}/backgrounds`);
    const listA = libA.json || [], listB = libB.json || [];
    const res = { listA: listA.map(b => ({ id: b.id, templateId: b.templateId, path: b.filePath || b.path })), listB: listB.map(b => ({ id: b.id, templateId: b.templateId, path: b.filePath || b.path })) };
    if (listA[0]) {
      const sel = await st.post(`/api/pdf-templates/${ids.tplBg}/backgrounds/${listA[0].id}/select`, {});
      res.crossSelect = { status: sel.status, body: sel.text.slice(0, 250) };
      res.rowAfterSelect = (await L.q('select id, background_path from pdf_templates where id=$1', [ids.tplBg]))[0];
    }
    if (listB[0]) {
      const selOwn = await st.post(`/api/pdf-templates/${ids.tplBg}/backgrounds/${listB[0].id}/select`, {});
      res.ownSelect = { status: selOwn.status };
      const del = await st.del(`/api/pdf-templates/${ids.tplBg}/backgrounds/${listB[0].id}`);
      res.deleteActive = { status: del.status, body: del.text.slice(0, 250) };
      res.rowAfterDelete = (await L.q('select id, background_path from pdf_templates where id=$1', [ids.tplBg]))[0];
      const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplBg}`, 'g4_after_delete.pdf', { textChars: 200 });
      res.generateAfterDelete = { status: gen.status, isPdf: gen.isPdf, bytes: gen.bytes, body: (gen.body || '').slice(0, 200) };
    }
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-07-bg2.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

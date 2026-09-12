// P36 agent D — BUG-177 header band, BUG-179/180 contract backgrounds, BUG-193 background preview
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const { PDFDocument, PDFName, PDFDict, PDFString } = require(path.join(process.cwd(), 'node_modules', 'pdf-lib'));

function makePng(w, h, color = '#3366aa') {
  const { createCanvas } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color; ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  return c.toBuffer('image/png');
}

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.17');
  const out = {};

  out.F1_header_square = await L.step('F1 upload 1:1 header, generate damage check (BUG-177)', async () => {
    const png = makePng(600, 600);
    const up = await L.upload(st, '/api/damage-check-fields/header', 'header', 'audit-p36d-header.png', 'image/png', png);
    const r = await L.fetchPdf(st, `/api/damage-checks/generate/${ids.rDamage}`, 'f1_dc_square_header.pdf', { items: true, textChars: 400 });
    const items = (r.items || []).filter(i => i.str && i.str.trim());
    const maxY = items.length ? Math.max(...items.map(i => i.y)) : null;
    const overlayFonts = items.filter(i => i.y > 842 - 70).map(i => ({ str: i.str.slice(0, 20), y: i.y, h: i.h }));
    const setting = await L.q("select value::text from app_settings where key='damage_check_fields'");
    const hp = (JSON.parse(setting[0].value) || {}).headerImagePath;
    return { upload: up.status, uploadBody: (up.text || '').slice(0, 200), headerImagePath: hp, gen: r.status, isPdf: r.isPdf,
             topTextItemY: maxY, itemsInBand: overlayFonts, text: (r.allText || '').slice(0, 300) };
  });

  out.F2_pdf_background = await L.step('F2 PDF background with OpenAction JS + 3 pages (BUG-180)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) { const p = doc.addPage([595, 842]); p.drawText('AUDIT-P36D background page ' + (i + 1), { x: 50, y: 700, size: 14 }); }
    const js = doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of("app.alert('AUDIT-P36D background JavaScript')") });
    doc.catalog.set(PDFName.of('OpenAction'), js);
    const bytes = Buffer.from(await doc.save());
    fs.writeFileSync(path.join(L.OUT_DIR, 'f2_background_src.pdf'), bytes);
    const up = await L.upload(st, `/api/pdf-templates/${ids.tplFull}/background`, 'background', 'audit-p36d-bg.pdf', 'application/pdf', bytes);
    const row = await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplFull]);
    const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`, 'f2_contract_pdfbg.pdf', { textChars: 400 });
    let analysis = null;
    if (gen.isPdf) {
      const buf = fs.readFileSync(path.join(L.OUT_DIR, 'f2_contract_pdfbg.pdf'));
      const loaded = await PDFDocument.load(buf, { ignoreEncryption: true });
      analysis = { pages: loaded.getPageCount(), hasOpenAction: !!loaded.catalog.get(PDFName.of('OpenAction')),
                   rawHasJsString: buf.toString('latin1').includes('AUDIT-P36D background JavaScript'),
                   rawHasJavaScript: buf.toString('latin1').includes('/JavaScript') };
    }
    return { upload: up.status, uploadBody: (up.text || '').slice(0, 300), row: row[0], gen: gen.status, isPdf: gen.isPdf, analysis, text: (gen.allText || '').slice(0, 200) };
  });

  out.F3_pdf_preview = await L.step('F3 background preview PNG on Windows (BUG-193)', async () => {
    const row = await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplFull]);
    const prev = row[0].background_preview_path;
    let served = null;
    const BS = String.fromCharCode(92);
    if (prev) { const r = await L.getBuffer(st, '/' + String(prev).split(BS).join('/').replace(/^\/+/, '')); served = { status: r.status, ct: r.contentType, bytes: r.buf.length }; }
    return { row: row[0], served };
  });

  out.F4_corrupt_background = await L.step('F4 corrupt the configured background then generate (BUG-179)', async () => {
    const png = makePng(400, 560, '#aa3333');
    const up = await L.upload(st, `/api/pdf-templates/${ids.tplBg}/background`, 'background', 'audit-p36d-bg.png', 'image/png', png);
    const row = await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplBg]);
    const result = { upload: up.status, uploadBody: (up.text || '').slice(0, 250), row: row[0] };
    const rel = row[0] && row[0].background_path;
    if (rel) {
      const BS2 = String.fromCharCode(92);
      const uploadsDir = process.env.P36_UPLOADS || ['C:', 'Users', 'kees lam', 'Desktop', 'LVStest-main', 'regress-uploads'].join(BS2);
      const tail = String(rel).split(BS2).join('/').replace(new RegExp('^.*?uploads/', 'i'), '');
      const candidates = [path.resolve(process.cwd(), rel), path.join(uploadsDir, tail), path.join(uploadsDir, String(rel).split(BS2).join('/'))];
      const found = candidates.find(p => fs.existsSync(p));
      result.candidates = candidates; result.found = found || null;
      if (found) {
        const backup = fs.readFileSync(found);
        fs.writeFileSync(found, Buffer.from('AUDIT-P36D not an image at all'));
        // give the template some fields again so generation is not blocked by the empty-fields guard
        const F = (name, source, x, y) => ({ id: 'f-' + name, name, x, y, fontSize: 10, isBold: false, source, textAlign: 'left', locked: false });
        const patch = await st.patch(`/api/pdf-templates/${ids.tplBg}`, { name: 'AUDIT-P36D background tests', fields: JSON.stringify([F('Klant', 'customer.name', 55, 254), F('Kenteken', 'vehicle.licensePlate', 55, 179)]) });
        const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplBg}`, 'f4_corrupt_bg.pdf', { textChars: 300 });
        result.patch = patch.status;
        result.corruptGen = { status: gen.status, isPdf: gen.isPdf, bytes: gen.bytes, body: (gen.body || '').slice(0, 300), headers: { warn: gen.headers && gen.headers.get ? gen.headers.get('x-pdf-warning') : null } };
        fs.writeFileSync(found, backup);
        // now delete the file entirely
        fs.unlinkSync(found);
        const gen2 = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplBg}`, 'f4_missing_bg.pdf', { textChars: 300 });
        result.missingGen = { status: gen2.status, isPdf: gen2.isPdf, bytes: gen2.bytes, body: (gen2.body || '').slice(0, 300) };
      }
    }
    return result;
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-06-header-bg.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

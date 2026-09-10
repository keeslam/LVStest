// Phase 14 D: transport report generator + template preview.
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.14.1.6');
  const out = {};
  const AUDIT_UPLOADS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-uploads';

  // generate-report returns the documents row (201), not the PDF; fetch the file from disk to inspect it.
  const report = async (key, body, name, opts = {}) => {
    const t0 = Date.now();
    const r = await st.post('/api/delivery/transports/generate-report', body);
    const rec = { status: r.status, ms: Date.now() - t0, body: r.status !== 201 ? r.text.slice(0, 300) : undefined, doc: r.json && r.status === 201 ? { id: r.json.id, filePath: r.json.filePath, fileSize: r.json.fileSize, vehicleId: r.json.vehicleId, notes: r.json.notes } : undefined };
    if (rec.doc) {
      const abs = path.join(AUDIT_UPLOADS, r.json.filePath);
      rec.fileExists = fs.existsSync(abs);
      if (rec.fileExists) {
        const buf = fs.readFileSync(abs);
        fs.writeFileSync(path.join(L.OUT_DIR, name), buf);
        const info = await L.pdfinfo.inspect(buf);
        rec.info = L.pdfinfo.summary(info, Object.assign({ textChars: 400 }, opts));
        if (opts.fullText) rec.fullText = info.text.map(t => t.replace(/\s+/g, ' ').trim().slice(0, opts.fullTextChars || 600));
        if (opts.png) { try { rec.png = path.basename(await L.pdfinfo.renderPng(buf, path.join(L.OUT_DIR, name.replace(/\.pdf$/, '.png')), 1, 1.2)); } catch (e) { rec.pngError = e.message; } }
      }
      // BUG-029: retrieval via documents API
      const dl = await L.getBuffer(st, `/api/documents/download/${r.json.id}`);
      rec.download = { status: dl.status, ct: dl.contentType, bytes: dl.buf.length };
    }
    out[key] = rec;
    L.log(key, { status: rec.status, ms: rec.ms, doc: rec.doc && `${rec.doc.id}:${rec.doc.filePath}:${rec.doc.fileSize}`, fileExists: rec.fileExists, pages: rec.info && rec.info.pages, oob: rec.info && rec.info.outOfBoundsCount, text: rec.info && rec.info.p1Text && rec.info.p1Text.slice(0, 250), download: rec.download, body: rec.body });
    return rec;
  };

  await L.step('D1 single transports with the seeded default template (id 1): normal, long, special chars, empty, external vehicle', async () => {
    await report('d1_normal', { transportIds: [ids.trNormal] }, 'd1_transport_normal.pdf', { png: true, fullText: true });
    await report('d1_long', { transportIds: [ids.trLong] }, 'd1_transport_long.pdf', { fullText: true, png: true, oob: 12 });
    await report('d1_special', { transportIds: [ids.trSpecial] }, 'd1_transport_special.pdf', { fullText: true });
    await report('d1_empty', { transportIds: [ids.trEmpty] }, 'd1_transport_empty.pdf', { fullText: true });
    await report('d1_external', { transportIds: [ids.trExternal] }, 'd1_transport_external.pdf', { fullText: true });
  });

  await L.step('D2 multi-transport: all 5, 50x the same id, 51 ids, unknown ids only, mixed unknown', async () => {
    await report('d2_all5', { transportIds: [ids.trNormal, ids.trLong, ids.trSpecial, ids.trEmpty, ids.trExternal] }, 'd2_transport_all5.pdf');
    await report('d2_50same', { transportIds: Array(50).fill(ids.trNormal) }, 'd2_transport_50_same.pdf');
    await report('d2_51', { transportIds: Array(51).fill(ids.trNormal) }, 'd2_transport_51.pdf');
    await report('d2_unknown', { transportIds: [999999, 999998] }, 'd2_transport_unknown.pdf');
    await report('d2_mixed', { transportIds: [ids.trNormal, 999999] }, 'd2_transport_mixed.pdf');
    await report('d2_strings', { transportIds: ['abc', ids.trNormal] }, 'd2_transport_strings.pdf');
    await report('d2_object', { transportIds: [{ id: ids.trNormal }] }, 'd2_transport_object.pdf');
    await report('d2_not_array', { transportIds: ids.trNormal }, 'd2_transport_not_array.pdf');
  });

  await L.step('D3 templateId: my template (unknown source, neg coords, font 200, raw notes), unknown templateId, templateId garbage', async () => {
    await report('d3_mytpl_normal', { transportIds: [ids.trNormal], templateId: ids.trTpl }, 'd3_transport_mytemplate_normal.pdf', { fullText: true, png: true, oob: 12 });
    await report('d3_mytpl_long', { transportIds: [ids.trLong], templateId: ids.trTpl }, 'd3_transport_mytemplate_long.pdf', { fullText: true, oob: 12 });
    await report('d3_mytpl_special', { transportIds: [ids.trSpecial], templateId: ids.trTpl }, 'd3_transport_mytemplate_special.pdf', { fullText: true });
    await report('d3_unknown_tpl', { transportIds: [ids.trNormal], templateId: 999999 }, 'd3_transport_unknown_template.pdf', { fullText: true });
    await report('d3_tpl_garbage', { transportIds: [ids.trNormal], templateId: 'abc' }, 'd3_transport_template_abc.pdf');
    await report('d3_tpl_obj', { transportIds: [ids.trNormal], templateId: { a: 1 } }, 'd3_transport_template_obj.pdf');
  });

  await L.step('D4 template preview endpoint + default template row with string-typed fields (id 1) + delete default template', async () => {
    const prev = await L.fetchPdf(st, `/api/transport-report-templates/1/preview`, 'd4_preview_default_tpl1.pdf', { png: true, textChars: 300 });
    out.d4_preview_1 = { status: prev.status, pages: prev.info && prev.info.pages, text: prev.info && prev.info.p1Text, png: prev.png, pngError: prev.pngError };
    L.log('preview tpl 1', out.d4_preview_1);
    const prevMine = await L.fetchPdf(st, `/api/transport-report-templates/${ids.trTpl}/preview`, 'd4_preview_mytpl.pdf', { textChars: 300 });
    out.d4_preview_mine = { status: prevMine.status, pages: prevMine.info && prevMine.info.pages, text: prevMine.info && prevMine.info.p1Text };
    L.log('preview my tpl', out.d4_preview_mine);
    const p404 = await st.get('/api/transport-report-templates/999999/preview');
    out.d4_preview_404 = { status: p404.status, body: p404.text.slice(0, 100) };
    const defs = await st.get('/api/transport-report-templates/default');
    out.d4_default = { status: defs.status, id: defs.json && defs.json.id };
    L.log('default template', out.d4_default);
    // Make my template default, delete it, and see what the generator uses next
    const setDef = await st.patch(`/api/transport-report-templates/${ids.trTpl}`, { isDefault: true });
    const defs2 = await L.q('select id, is_default from transport_report_templates order by id');
    out.d4_set_default = { status: setDef.status, rows: defs2 };
    L.log('after set default on mine', out.d4_set_default);
    await report('d4_gen_default_mine', { transportIds: [ids.trNormal] }, 'd4_transport_default_is_mine.pdf');
    const del = await st.del(`/api/transport-report-templates/${ids.trTpl}`);
    const defs3 = await L.q('select id, is_default from transport_report_templates order by id');
    out.d4_delete = { status: del.status, rows: defs3 };
    L.log('after deleting the default', out.d4_delete);
    await report('d4_gen_after_delete', { transportIds: [ids.trNormal] }, 'd4_transport_after_default_deleted.pdf', { fullText: true });
    const restore = await st.patch('/api/transport-report-templates/1', { isDefault: true });
    out.d4_restore = { status: restore.status, rows: await L.q('select id, is_default from transport_report_templates order by id') };
    L.log('restored default to 1', out.d4_restore);
    delete ids.trTpl;
    // no template at all: temporarily flip is_default off and rename? Not possible via API without deleting tpl 1 - skip (seeded row).
  });

  await L.step('D5 TBD spare transport (placeholder) is refused (BUG-119 sibling check)', async () => {
    const r = await st.post('/api/transports', { vehicleId: ids.vTransport2, transportType: 'swap', scheduledDate: L.addDays(L.today(), 9), spareRequired: true, reason: 'AUDIT-P14 TBD spare' });
    out.d5_create = { status: r.status, id: r.json && r.json.id, body: r.status >= 400 ? r.text.slice(0, 200) : undefined };
    L.log('create TBD transport', out.d5_create);
    if (r.json && r.json.id) { ids.trTbd = r.json.id; await report('d5_tbd', { transportIds: [r.json.id] }, 'd5_transport_tbd.pdf'); }
  });

  L.saveIds(ids);
  fs.writeFileSync(path.join(__dirname, 'p14-d-transport.out.json'), JSON.stringify(out, null, 1));
  console.log('\nhealth', await L.health());
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

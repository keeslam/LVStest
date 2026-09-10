// Phase 14 B: contract template editor API end-to-end (create/update/background/preview/use/delete/library/corrupt files).
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFString, PDFDict } = require('pdf-lib');

const FILES = path.join(__dirname, 'files');
const AUDIT_UPLOADS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-uploads';

async function pageInfo(buf) {
  // how the page-1 background was built: image XObject (custom image background) vs vector default template vs blank
  try {
    const d = await PDFDocument.load(buf, { ignoreEncryption: true });
    const p = d.getPage(0);
    const res = p.node.Resources();
    const xo = res && res.lookup(PDFName.of('XObject'));
    let images = 0; if (xo) for (const [k, v] of xo.entries()) { const s = d.context.lookup(v); if (String(s.dict.get(PDFName.of('Subtype'))) === '/Image') images++; }
    const contents = p.node.Contents(); const nStreams = contents && contents.asArray ? contents.asArray().length : (contents ? 1 : 0);
    const openAction = d.catalog.get(PDFName.of('OpenAction'));
    const names = d.catalog.get(PDFName.of('Names'));
    return { pages: d.getPageCount(), imagesOnPage1: images, contentStreams: nStreams, openAction: openAction ? String(d.context.lookup(openAction) && d.context.lookup(openAction).toString()).slice(0, 80) : null, hasNamesTree: !!names, background: images >= 2 ? 'image (+barcode)' : nStreams >= 9 ? 'vector default template' : (images === 1 && nStreams <= 2 ? 'blank page (+barcode only)' : 'unknown') };
  } catch (e) { return { error: e.message }; }
}

async function makeMultiPagePdfWithJs() {
  const d = await PDFDocument.create();
  for (let i = 1; i <= 3; i++) { const p = d.addPage([595, 842]); p.drawText(`AUDIT-P14 background page ${i}`, { x: 50, y: 800, size: 14 }); }
  const js = d.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of("app.alert('AUDIT-P14 background JavaScript');") });
  const ref = d.context.register(js);
  d.catalog.set(PDFName.of('OpenAction'), ref);
  return Buffer.from(await d.save());
}

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.14.1.4');
  const out = {};
  const T = ids.tplBg;
  const gen = async (key, url, name, opts = {}) => {
    const rec = await L.fetchPdf(st, url, name, Object.assign({ textChars: 200 }, opts));
    if (rec.status === 200 && rec.info && rec.info.valid) rec.pageInfo = await pageInfo(fs.readFileSync(path.join(L.OUT_DIR, name)));
    out[key] = rec;
    L.log(key, { status: rec.status, bytes: rec.bytes, pages: rec.info && rec.info.pages, text: rec.info && rec.info.p1Text && rec.info.p1Text.slice(0, 120), pageInfo: rec.pageInfo, body: rec.body });
    return rec;
  };
  const bgFile = (id) => path.join(AUDIT_UPLOADS, 'templates', `template_${id}_background`);

  await L.step('B1 create with the exact client editor payload (fields as JSON string, id in body) and read back', async () => {
    const fields = [{ id: 'field-1', name: 'Klant', x: 55, y: 254, fontSize: 12, isBold: false, source: 'customer.name', textAlign: 'left', locked: false }];
    const r = await st.post('/api/pdf-templates', { id: 999999, name: 'AUDIT-P14 editor-shaped', isDefault: false, backgroundPath: null, fields: JSON.stringify(fields) });
    out.b1_create = { status: r.status, id: r.json && r.json.id, fieldsType: r.json && typeof r.json.fields, fieldsIsArray: r.json && Array.isArray(r.json.fields) };
    L.log('create', out.b1_create, L.short(r, 200));
    ids.tplEditor = r.json && r.json.id;
    const g = await st.get(`/api/pdf-templates/${ids.tplEditor}`);
    out.b1_get = { status: g.status, fieldsType: typeof g.json.fields, isArray: Array.isArray(g.json.fields), n: Array.isArray(g.json.fields) ? g.json.fields.length : null };
    L.log('get', out.b1_get);
    const list = await st.get('/api/pdf-templates');
    out.b1_list_types = list.json.map(t => `${t.id}:${typeof t.fields}:${Array.isArray(t.fields) ? 'array' : 'other'}`);
    L.log('list fields types', out.b1_list_types);
  });

  await L.step('B2 PATCH: fields update, id in body (other template id), isDefault toggling, unknown keys, empty name, invalid JSON string, null fields', async () => {
    const p1 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { id: 2, name: 'AUDIT-P14 editor-shaped v2', fields: JSON.stringify([{ id: 'f1', name: 'Kenteken', x: 100, y: 100, fontSize: 14, isBold: true, source: 'vehicle.licensePlate', textAlign: 'left' }]) });
    const t2 = await L.q('select id, name from pdf_templates where id=2');
    out.b2_patch_id_in_body = { status: p1.status, updatedId: p1.json && p1.json.id, updatedName: p1.json && p1.json.name, template2NameAfter: t2[0] && t2[0].name };
    L.log('patch with id:2 in body', out.b2_patch_id_in_body);
    const p2 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { createdAt: 'garbage', updatedAt: 'garbage', templatePreviewPath: '../../etc/passwd', foo: 'bar' });
    out.b2_patch_unknown_keys = { status: p2.status, body: p2.text.slice(0, 200) };
    L.log('patch unknown keys', out.b2_patch_unknown_keys);
    const p3 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { name: '' });
    out.b2_patch_empty_name = { status: p3.status, name: p3.json && JSON.stringify(p3.json.name) };
    L.log('patch empty name', out.b2_patch_empty_name);
    const p4 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { fields: '{oops not json' });
    const f4 = await L.q('select jsonb_typeof(fields) t, left(fields::text,60) f from pdf_templates where id=$1', [ids.tplEditor]);
    out.b2_patch_invalid_json = { status: p4.status, body: p4.text.slice(0, 200), stored: f4[0] };
    L.log('patch invalid json fields', out.b2_patch_invalid_json);
    const p5 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { fields: null });
    const f5 = await L.q('select jsonb_typeof(fields) t, fields::text f from pdf_templates where id=$1', [ids.tplEditor]);
    out.b2_patch_null_fields = { status: p5.status, body: p5.text.slice(0, 200), stored: f5[0] };
    L.log('patch null fields', out.b2_patch_null_fields);
    const p6 = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { fields: 'x'.repeat(2 * 1024 * 1024) });
    out.b2_patch_2mb = { status: p6.status, body: p6.text.slice(0, 120) };
    L.log('patch 2MB fields string', out.b2_patch_2mb);
    // restore sane fields
    await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { name: 'AUDIT-P14 editor-shaped', fields: JSON.stringify([{ id: 'f1', name: 'Kenteken', x: 100, y: 100, fontSize: 14, isBold: true, source: 'vehicle.licensePlate', textAlign: 'left' }]) });
    await gen('b2_gen_after_patch', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplEditor}`, 'b2_after_patch.pdf');
  });

  await L.step('B3 background upload: valid PNG -> generation uses image background', async () => {
    const png = fs.readFileSync(path.join(FILES, 'tiny.png'));
    const up = await L.upload(st, `/api/pdf-templates/${T}/background`, 'background', 'AUDIT-P14-bg.png', 'image/png', png);
    out.b3_upload_png = { status: up.status, backgroundPath: up.json && up.json.backgroundPath, preview: up.json && up.json.backgroundPreviewPath, body: up.status !== 200 ? up.text.slice(0, 200) : undefined };
    L.log('upload png', out.b3_upload_png);
    await gen('b3_gen_png_bg', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b3_png_background.pdf', { png: true });
    await gen('b3_preview_png_bg', `/api/pdf-templates/${T}/preview`, 'b3_png_background_preview.pdf');
    out.b3_file = fs.existsSync(bgFile(T) + '.png') ? fs.statSync(bgFile(T) + '.png').size : null;
    L.log('file on disk', bgFile(T) + '.png', out.b3_file);
  });

  await L.step('B4 corrupt background on disk: garbage bytes, zero bytes, PDF bytes in .png, file removed -> what does generation do?', async () => {
    const file = bgFile(T) + '.png';
    fs.writeFileSync(file, Buffer.from('this is not a png at all, just garbage bytes '.repeat(50)));
    await gen('b4_garbage', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b4_garbage_bg.pdf');
    fs.writeFileSync(file, Buffer.alloc(0));
    await gen('b4_zero', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b4_zero_bg.pdf');
    fs.writeFileSync(file, fs.readFileSync(path.join(FILES, 'empty.pdf')));
    await gen('b4_pdf_in_png', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b4_pdf_in_png_bg.pdf');
    fs.writeFileSync(file, fs.readFileSync(path.join(FILES, 'valid.jpg')));
    await gen('b4_jpg_in_png', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b4_jpg_in_png_bg.pdf');
    fs.unlinkSync(file);
    await gen('b4_missing', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b4_missing_bg.pdf');
    const tpl = await st.get(`/api/pdf-templates/${T}`);
    out.b4_template_after = { backgroundPath: tpl.json.backgroundPath, backgroundPreviewPath: tpl.json.backgroundPreviewPath };
    L.log('template row still points at', out.b4_template_after);
    const prev = await L.getBuffer(st, `/${tpl.json.backgroundPreviewPath.replace(/\\/g, '/')}`);
    out.b4_preview_fetch = { status: prev.status, ct: prev.contentType, bytes: prev.buf.length };
    L.log('editor preview image fetch (missing file)', out.b4_preview_fetch);
  });

  await L.step('B5 JPEG bytes uploaded as .png (mimetype image/png) and multi-page PDF background carrying OpenAction JavaScript', async () => {
    const jpg = fs.readFileSync(path.join(FILES, 'valid.jpg'));
    const up1 = await L.upload(st, `/api/pdf-templates/${T}/background`, 'background', 'AUDIT-P14-jpeg-named.png', 'image/png', jpg);
    out.b5_jpeg_as_png_upload = { status: up1.status, body: up1.text.slice(0, 200) };
    L.log('jpeg as png upload', out.b5_jpeg_as_png_upload);
    const up1b = await L.upload(st, `/api/pdf-templates/${T}/background`, 'background', 'AUDIT-P14-jpeg-named.png', 'image/jpeg', jpg);
    out.b5_jpeg_as_png_upload_jpegmime = { status: up1b.status, backgroundPath: up1b.json && up1b.json.backgroundPath, body: up1b.status !== 200 ? up1b.text.slice(0, 200) : undefined };
    L.log('jpeg bytes, .png name, image/jpeg mime', out.b5_jpeg_as_png_upload_jpegmime);
    if (up1b.status === 200) await gen('b5_gen_jpeg_as_png', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b5_jpeg_as_png_bg.pdf');
    const pdfBg = await makeMultiPagePdfWithJs();
    fs.writeFileSync(path.join(L.OUT_DIR, 'b5_background_3pages_js.pdf'), pdfBg);
    const up2 = await L.upload(st, `/api/pdf-templates/${T}/background`, 'background', 'AUDIT-P14-3pages.pdf', 'application/pdf', pdfBg);
    out.b5_pdf_upload = { status: up2.status, backgroundPath: up2.json && up2.json.backgroundPath, preview: up2.json && up2.json.backgroundPreviewPath, body: up2.status !== 200 ? up2.text.slice(0, 300) : undefined };
    L.log('3-page pdf upload', out.b5_pdf_upload);
    await gen('b5_gen_pdf_bg', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b5_pdf_background_3pages.pdf', { fullText: true });
    const docRow = await L.q("select id, file_size from documents where reservation_id=$1 order by id desc limit 1", [ids.rNormal]);
    out.b5_doc = docRow[0];
    L.log('latest documents row', out.b5_doc);
  });

  await L.step('B6 background library: add, select, delete; then delete the template (files left behind = BUG-050)', async () => {
    const png = fs.readFileSync(path.join(FILES, 'valid.jpg'));
    const add = await L.upload(st, `/api/pdf-templates/${T}/backgrounds`, 'background', 'AUDIT-P14-lib.jpg', 'image/jpeg', png, { name: 'AUDIT-P14 library bg ../../x' });
    out.b6_add = { status: add.status, id: add.json && add.json.id, backgroundPath: add.json && add.json.backgroundPath, body: add.status !== 201 ? add.text.slice(0, 200) : undefined };
    L.log('library add', out.b6_add);
    const addNoName = await L.upload(st, `/api/pdf-templates/${T}/backgrounds`, 'background', 'AUDIT-P14-lib2.jpg', 'image/jpeg', png, {});
    out.b6_add_noname = { status: addNoName.status, body: addNoName.text.slice(0, 120) };
    L.log('library add without name', out.b6_add_noname);
    if (add.json && add.json.id) {
      const sel = await st.post(`/api/pdf-templates/${T}/backgrounds/${add.json.id}/select`);
      out.b6_select = { status: sel.status, backgroundPath: sel.json && sel.json.backgroundPath };
      L.log('select', out.b6_select);
      await gen('b6_gen_lib_bg', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b6_library_bg.pdf');
      // select a background that belongs to ANOTHER template
      const other = await st.post(`/api/pdf-templates/${ids.tplFull}/backgrounds/${add.json.id}/select`);
      const full = await st.get(`/api/pdf-templates/${ids.tplFull}`);
      out.b6_cross_select = { status: other.status, tplFullBackgroundPath: full.json.backgroundPath };
      L.log('select library bg of template T on tplFull (cross-template)', out.b6_cross_select);
      await st.patch(`/api/pdf-templates/${ids.tplFull}`, { backgroundPath: null, backgroundPreviewPath: null });
      const libFile = path.join(process.cwd(), add.json.backgroundPath);
      const del = await st.del(`/api/pdf-templates/${T}/backgrounds/${add.json.id}`);
      out.b6_delete_bg = { status: del.status, fileStillExists: fs.existsSync(libFile), templateBgAfter: (await st.get(`/api/pdf-templates/${T}`)).json.backgroundPath };
      L.log('delete library bg (was the active one)', out.b6_delete_bg);
      await gen('b6_gen_after_lib_delete', `/api/contracts/generate/${ids.rNormal}?templateId=${T}`, 'b6_after_library_delete.pdf');
    }
  });

  await L.step('B7 delete a template that is the DEFAULT and in use; what does the next default-generation use?', async () => {
    const before = await L.q('select id, name, is_default from pdf_templates order by id');
    out.b7_before = before;
    const setDef = await st.patch(`/api/pdf-templates/${ids.tplEditor}`, { isDefault: true });
    const defs1 = await L.q('select id from pdf_templates where is_default order by id');
    out.b7_set_default = { status: setDef.status, defaultsNow: defs1.map(r => r.id) };
    L.log('set editor template default', out.b7_set_default);
    await gen('b7_gen_default_is_editor', `/api/contracts/generate/${ids.rNormal}`, 'b7_default_editor_template.pdf');
    const del = await st.del(`/api/pdf-templates/${ids.tplEditor}`);
    const defs2 = await L.q('select id from pdf_templates where is_default order by id');
    out.b7_delete_default = { status: del.status, defaultsNow: defs2.map(r => r.id) };
    L.log('delete the default template', out.b7_delete_default);
    const gd = await st.get('/api/pdf-templates/default');
    out.b7_get_default_after = { status: gd.status, id: gd.json && gd.json.id, name: gd.json && gd.json.name };
    L.log('GET /api/pdf-templates/default after deleting the default', out.b7_get_default_after);
    await gen('b7_gen_after_delete', `/api/contracts/generate/${ids.rNormal}`, 'b7_after_default_deleted.pdf');
    await gen('b7_gen_deleted_id', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplEditor}`, 'b7_deleted_template_id.pdf');
    // restore original default (id 2)
    const restore = await st.patch(`/api/pdf-templates/2`, { isDefault: true });
    out.b7_restore = { status: restore.status, defaultsNow: (await L.q('select id from pdf_templates where is_default order by id')).map(r => r.id) };
    L.log('restored default to id 2', out.b7_restore);
  });

  await L.step('B8 delete tplBg (has background + library) -> files left behind?', async () => {
    const tpl = await st.get(`/api/pdf-templates/${T}`);
    const libs = await st.get(`/api/pdf-templates/${T}/backgrounds`);
    const paths = [tpl.json.backgroundPath, tpl.json.backgroundPreviewPath, ...(libs.json || []).flatMap(b => [b.backgroundPath, b.previewPath])].filter(Boolean);
    const del = await st.del(`/api/pdf-templates/${T}`);
    out.b8 = { status: del.status, filesAfter: paths.map(p => ({ p, exists: fs.existsSync(path.join(process.cwd(), p)) })), libRowsAfter: (await L.q('select count(*) c from template_backgrounds where template_id=$1', [T]))[0].c };
    L.log('delete template with background', out.b8);
    delete ids.tplBg;
  });

  await L.step('B9 transport-report template editor API: create/patch/preview/background/delete', async () => {
    const png = fs.readFileSync(path.join(FILES, 'tiny.png'));
    const up = await L.upload(st, `/api/transport-report-templates/${ids.trTpl}/background`, 'background', 'AUDIT-P14-tr.png', 'image/png', png);
    out.b9_upload = { status: up.status, backgroundPath: up.json && up.json.backgroundPath, body: up.status !== 200 ? up.text.slice(0, 200) : undefined };
    L.log('transport bg upload', out.b9_upload);
    const upPdf = await L.upload(st, `/api/transport-report-templates/${ids.trTpl}/background`, 'background', 'AUDIT-P14-tr.pdf', 'application/pdf', fs.readFileSync(path.join(FILES, 'empty.pdf')));
    out.b9_upload_pdf = { status: upPdf.status, body: upPdf.text.slice(0, 120) };
    L.log('transport bg upload pdf (should be rejected)', out.b9_upload_pdf);
    const jpgAsPng = await L.upload(st, `/api/transport-report-templates/${ids.trTpl}/background`, 'background', 'AUDIT-P14-tr-jpeg.png', 'image/jpeg', fs.readFileSync(path.join(FILES, 'valid.jpg')));
    out.b9_upload_jpg_as_png = { status: jpgAsPng.status, backgroundPath: jpgAsPng.json && jpgAsPng.json.backgroundPath, body: jpgAsPng.status !== 200 ? jpgAsPng.text.slice(0, 200) : undefined };
    L.log('transport bg jpeg bytes as .png', out.b9_upload_jpg_as_png);
    await gen('b9_preview_jpg_as_png', `/api/transport-report-templates/${ids.trTpl}/preview`, 'b9_transport_preview_jpeg_as_png.pdf');
    const up2 = await L.upload(st, `/api/transport-report-templates/${ids.trTpl}/background`, 'background', 'AUDIT-P14-tr.png', 'image/png', png);
    await gen('b9_preview_png', `/api/transport-report-templates/${ids.trTpl}/preview`, 'b9_transport_preview_png.pdf', { png: true });
    const p1 = await st.patch(`/api/transport-report-templates/${ids.trTpl}`, { fields: 'not json', name: 'AUDIT-P14 transport template' });
    out.b9_patch_string_fields = { status: p1.status, body: p1.text.slice(0, 160) };
    L.log('patch fields string', out.b9_patch_string_fields);
    const p2 = await st.patch(`/api/transport-report-templates/${ids.trTpl}`, { id: 1, backgroundPath: '../../.env', createdAt: 'x' });
    out.b9_patch_bad = { status: p2.status, body: p2.text.slice(0, 200) };
    L.log('patch id/backgroundPath traversal', out.b9_patch_bad);
    const g = await st.get(`/api/transport-report-templates/${ids.trTpl}`);
    out.b9_after = { fieldsType: typeof g.json.fields, backgroundPath: g.json.backgroundPath };
    L.log('template after', out.b9_after);
    // restore fields to array
    const restore = await st.patch(`/api/transport-report-templates/${ids.trTpl}`, { fields: JSON.parse(fs.readFileSync(path.join(__dirname, 'p14-ids.json'), 'utf8')).trFields || undefined });
  });

  await L.step('B10 barcode label templates CRUD (client-side print only)', async () => {
    const c = await st.post('/api/barcode-label-templates', { name: 'AUDIT-P14 label', isDefault: false, labelWidthMm: 62, labelHeightMm: 29, fields: [{ id: 'x', type: 'barcode', x: 2, y: 2, width: 50, height: 15 }] });
    out.b10_create = { status: c.status, id: c.json && c.json.id, body: c.status !== 201 ? c.text.slice(0, 200) : undefined };
    L.log('label create', out.b10_create);
    if (c.json && c.json.id) {
      const p = await st.patch(`/api/barcode-label-templates/${c.json.id}`, { labelWidthMm: -5, labelHeightMm: 0, fields: 'garbage' });
      out.b10_patch = { status: p.status, body: p.text.slice(0, 200) };
      L.log('label patch negative size / garbage fields', out.b10_patch);
      const d = await st.del(`/api/barcode-label-templates/${c.json.id}`);
      out.b10_delete = { status: d.status };
      L.log('label delete', out.b10_delete);
    }
  });

  L.saveIds(ids);
  fs.writeFileSync(path.join(__dirname, 'p14-b-templates.out.json'), JSON.stringify(out, null, 1));
  console.log('\nhealth', await L.health());
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

// Phase 14 C: damage check PDF generator (canvas templates), interactive checks, vehicle diagrams, overflow.
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');

const FILES = path.join(__dirname, 'files');
const TINY_PNG_B64 = fs.readFileSync(path.join(FILES, 'tiny.png')).toString('base64');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.14.1.5');
  const out = {};
  const gen = async (key, url, name, opts = {}) => {
    const t0 = Date.now();
    const rec = await L.fetchPdf(st, url, name, Object.assign({ textChars: 400 }, opts));
    rec.ms = Date.now() - t0;
    out[key] = rec;
    L.log(key, { status: rec.status, ms: rec.ms, bytes: rec.bytes, pages: rec.info && rec.info.pages, oob: rec.info && rec.info.outOfBoundsCount, text: rec.info && rec.info.p1Text && rec.info.p1Text.slice(0, 300), body: rec.body, png: rec.png, pngError: rec.pngError });
    return rec;
  };
  const dcTpl = (await st.get(`/api/damage-check-templates/${ids.dcTpl}`)).json;
  const baseFields = dcTpl.canvasFields;

  await L.step('C1 /api/damage-checks/generate/:reservationId - customer with only `name` (no first/last) vs customer with first/last', async () => {
    await gen('c1_name_only', `/api/damage-checks/generate/${ids.rDamage}`, 'c1_dc_generate_name_only.pdf', { png: true, fullText: true });
    await gen('c1_first_last', `/api/damage-checks/generate/${ids.rDamageFL}`, 'c1_dc_generate_first_last.pdf', { fullText: true });
    await gen('c1_open_ended', `/api/damage-checks/generate/${ids.rEmpty}`, 'c1_dc_generate_open_ended.pdf', { fullText: true });
    await gen('c1_special', `/api/damage-checks/generate/${ids.rSpecial}`, 'c1_dc_generate_special.pdf', { fullText: true });
    const docs = await L.q("select id, reservation_id, document_type, file_path, file_size from documents where reservation_id in ($1,$2) and document_type like 'Damage Check%' order by id", [ids.rDamage, ids.rDamageFL]);
    out.c1_docs = docs; L.log('damage check documents', docs.map(d => `${d.id}:${d.reservation_id}:${d.document_type}:${d.file_size}`));
  });

  await L.step('C2 /api/vehicles/:id/damage-check-pdf - vehicle without reservations, vehicle with only a 2020 reservation', async () => {
    await gen('c2_no_res', `/api/vehicles/${ids.vNoRes}/damage-check-pdf`, 'c2_vehicle_dc_no_reservation.pdf', { fullText: true });
    await gen('c2_old_res', `/api/vehicles/${ids.vOldRes}/damage-check-pdf`, 'c2_vehicle_dc_old_reservation_2020.pdf', { fullText: true, png: true });
    await gen('c2_damage_vehicle', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c2_vehicle_dc_damage_vehicle.pdf', { fullText: true });
    await gen('c2_404', `/api/vehicles/999999/damage-check-pdf`, 'c2_vehicle_404.pdf');
    await gen('c2_nan', `/api/vehicles/abc/damage-check-pdf`, 'c2_vehicle_nan.pdf');
  });

  await L.step('C3 interactive damage check: 20kB notes, emoji/CJK, 300 damage markers, signatures, annotated diagram -> auto PDF + :id/pdf', async () => {
    const markers = Array.from({ length: 300 }, (_, i) => ({ id: 'm' + i, x: (i * 7) % 500, y: (i * 11) % 300, type: ['scratch', 'dent', 'crack'][i % 3], note: 'AUDIT-P14 marker ' + i }));
    const checklist = { interior: { carInterior: 'vuil', windowDamage: 'ja', upholstery: 'schoon', floorMats: 'aanwezig' }, exterior: { carExterior: 'LV,RV', hubcaps: 'ja' }, delivery: { lighting: true, licensePlatePapers: true, oilWater: true } };
    const body = {
      vehicleId: ids.vDamage, reservationId: ids.rDamage, checkType: 'pickup', checkDate: new Date().toISOString(),
      damageMarkers: JSON.stringify(markers), drawingPaths: JSON.stringify([{ points: Array.from({ length: 2000 }, (_, i) => [i % 500, (i * 3) % 300]) }]),
      diagramWithAnnotations: 'data:image/png;base64,' + TINY_PNG_B64, renterSignature: 'data:image/png;base64,' + TINY_PNG_B64, customerSignature: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(FILES, 'valid.jpg')).toString('base64'),
      checklistData: JSON.stringify(checklist), notes: 'AUDIT-P14 notes 😀 日本語 مرحبا → “quotes” <script>alert(1)</script> %s ' + 'lorem ipsum dolor sit amet '.repeat(740), mileage: 99999, fuelLevel: '1/2 😀',
    };
    let r = await st.post('/api/interactive-damage-checks', body);
    if (r.status === 409 && r.json && r.json.existingCheckId) { ids.idc = r.json.existingCheckId; r = await st.put(`/api/interactive-damage-checks/${ids.idc}`, body); }
    else ids.idc = r.json && r.json.id;
    out.c3_create = { status: r.status, id: ids.idc, body: r.status >= 400 ? r.text.slice(0, 300) : undefined };
    L.log('interactive check create/update', out.c3_create);
    if (ids.idc) {
      await gen('c3_pdf', `/api/interactive-damage-checks/${ids.idc}/pdf`, 'c3_interactive_check.pdf', { fullText: true, png: true, oob: 12 });
      const docs = await L.q("select id, document_type, file_path, file_size, notes from documents where reservation_id=$1 order by id desc limit 4", [ids.rDamage]);
      out.c3_docs = docs; L.log('documents after interactive create', docs.map(d => `${d.id}:${d.document_type}:${d.file_size}`));
    }
    await gen('c3_404', `/api/interactive-damage-checks/999999/pdf`, 'c3_interactive_404.pdf');
    await gen('c3_nan', `/api/interactive-damage-checks/abc/pdf`, 'c3_interactive_nan.pdf');
  });

  await L.step('C4 draft template preview (POST preview-pdf): empty body, non-array canvasFields, invalid field values (fontSize -5, emoji damageTypes, numeric damageTypes, x "abc", type unknown, huge width)', async () => {
    const post = async (key, name, draft, opts = {}) => gen(key, '/api/damage-check-templates/preview-pdf', name, Object.assign({ method: 'POST', body: draft }, opts));
    await post('c4_empty', 'c4_preview_empty_body.pdf', {});
    await post('c4_nonarray', 'c4_preview_nonarray.pdf', { name: 'x', canvasFields: { a: 1 } });
    await post('c4_font_neg', 'c4_preview_font_neg.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'negative font', fontSize: -5 }] });
    await post('c4_font_huge', 'c4_preview_font_huge.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'HUGE', fontSize: 900 }] });
    await post('c4_emoji_damagetype', 'c4_preview_emoji_damagetype.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'inspection', x: 40, y: 200, name: 'Ruitschade', fontSize: 11, damageTypes: ['ja', '😀', 'nee'] }] });
    await post('c4_numeric_damagetype', 'c4_preview_numeric_damagetype.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'inspection', x: 40, y: 200, name: 'Ruitschade', fontSize: 11, damageTypes: [42, null, { a: 1 }] }] });
    await post('c4_x_abc', 'c4_preview_x_abc.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'dynamic', x: 'abc', y: 'def', name: 'n', source: 'licensePlate', fontSize: 'big' }] });
    await post('c4_type_unknown', 'c4_preview_type_unknown.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'unknownType', x: 40, y: 200, name: 'unknown type field', fontSize: 11 }, { id: 'b', x: 40, y: 220, name: 'no type', fontSize: 11 }, 'string-field', null, 42] });
    await post('c4_huge_box', 'c4_preview_huge_box.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'box', x: -100, y: -100, width: 1e6, height: 1e6 }, { id: 'l', type: 'line', x: 0, y: 300, width: 5000, height: 50 }] });
    await post('c4_page_neg', 'c4_preview_page_neg.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'page -3', fontSize: 11, page: -3 }, { id: 'b', type: 'text', x: 40, y: 200, name: 'page 0', fontSize: 11, page: 0 }, { id: 'c', type: 'text', x: 40, y: 200, name: 'page 2.7', fontSize: 11, page: 2.7 }, { id: 'd', type: 'text', x: 40, y: 200, name: 'page "5"', fontSize: 11, page: '5' }] });
    await post('c4_long_header', 'c4_preview_long_header.pdf', { name: 'x', headerText: 'H'.repeat(1000), footerText: 'F 😀 '.repeat(200), canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'hdr', fontSize: 11 }] });
    await post('c4_dynamic_all', 'c4_preview_dynamic_all.pdf', { name: 'x', canvasFields: ['licensePlate', 'brand', 'model', 'buildYear', 'fuel', 'currentMileage', 'customerName', 'contractNumber', 'startDate', 'endDate', 'rentalDays', 'currentDate', 'notes', 'inspectorName', 'nope', '__proto__'].map((s, i) => ({ id: 'd' + i, type: 'dynamic', x: 40, y: 150 + i * 16, name: s, source: s, fontSize: 10 })) }, { fullText: true });
  });

  await L.step('C5 page overflow: canvasFields page=200 then page=5000 via preview-pdf (no persistence) - time, size, page count', async () => {
    const post = async (key, name, draft) => gen(key, '/api/damage-check-templates/preview-pdf', name, { method: 'POST', body: draft });
    await post('c5_page200', 'c5_preview_page200.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'on page 200', fontSize: 11, page: 200 }] });
    console.log('health', await L.health());
    await post('c5_page5000', 'c5_preview_page5000.pdf', { name: 'x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'on page 5000', fontSize: 11, page: 5000 }] });
    console.log('health', await L.health());
  });

  await L.step('C6 vehicle diagram template upload -> embedded in damage check; then remove the file on disk', async () => {
    const up = await L.upload(st, '/api/vehicle-diagram-templates', 'diagram', 'AUDIT-P14-diagram.png', 'image/png', fs.readFileSync(path.join(FILES, 'tiny.png')), { make: 'AUDIT-P14 DC Brand', model: 'AUDIT-P14 DC Model', description: 'AUDIT-P14 diagram' });
    out.c6_upload = { status: up.status, id: up.json && up.json.id, diagramPath: up.json && up.json.diagramPath, body: up.status !== 201 ? up.text.slice(0, 200) : undefined };
    L.log('diagram upload', out.c6_upload);
    ids.diagram = up.json && up.json.id;
    await gen('c6_with_diagram', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c6_dc_with_diagram.pdf', { fullText: true });
    if (up.json && up.json.diagramPath) {
      const abs = path.join(process.cwd(), up.json.diagramPath);
      out.c6_file_exists = fs.existsSync(abs);
      if (out.c6_file_exists) { fs.renameSync(abs, abs + '.moved'); }
      await gen('c6_diagram_missing', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c6_dc_diagram_missing.pdf', { fullText: true });
      if (out.c6_file_exists) { fs.writeFileSync(abs, Buffer.from('garbage')); }
      await gen('c6_diagram_garbage', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c6_dc_diagram_garbage.pdf', { fullText: true });
      if (out.c6_file_exists) { fs.unlinkSync(abs); fs.renameSync(abs + '.moved', abs); }
      const img = await L.getBuffer(st, `/api/vehicle-diagram-templates/${ids.diagram}/image`);
      out.c6_image_fetch = { status: img.status, ct: img.contentType, bytes: img.buf.length };
      L.log('diagram image fetch', out.c6_image_fetch);
    }
  });

  await L.step('C7 persisted template edits via PUT (no validation) and generation; language=en ignored?', async () => {
    const put = await st.put(`/api/damage-check-templates/${ids.dcTpl}`, { canvasFields: 'not an array', language: 'xx', isDefault: 'yes', name: '' });
    out.c7_put_garbage = { status: put.status, body: put.text.slice(0, 200) };
    L.log('PUT garbage', out.c7_put_garbage);
    const row = await L.q('select name, language, is_default, jsonb_typeof(canvas_fields) t from damage_check_templates where id=$1', [ids.dcTpl]);
    out.c7_row_after = row[0]; L.log('row after', row[0]);
    await gen('c7_gen_after_garbage', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c7_dc_after_garbage_template.pdf');
    const restore = await st.put(`/api/damage-check-templates/${ids.dcTpl}`, { canvasFields: baseFields, language: 'en', isDefault: false, name: 'AUDIT-P14 damage check template' });
    out.c7_restore = { status: restore.status };
    await gen('c7_gen_lang_en', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c7_dc_language_en.pdf', { fullText: true });
    const putIdOther = await st.put(`/api/damage-check-templates/${ids.dcTpl}`, { id: 1, name: 'AUDIT-P14 damage check template' });
    const row1 = await L.q('select id, name from damage_check_templates where id in (1,$1) order by id', [ids.dcTpl]);
    out.c7_put_id_other = { status: putIdOther.status, rows: row1 }; L.log('PUT with id:1 in body', out.c7_put_id_other);
  });

  await L.step('C8 export/import round trip and clone', async () => {
    const exp = await st.get(`/api/damage-check-templates/${ids.dcTpl}/export`);
    out.c8_export = { status: exp.status, keys: exp.json && Object.keys(exp.json).slice(0, 12), ct: exp.headers.get('content-type') };
    L.log('export', out.c8_export);
    if (exp.json) {
      const imp = await st.post('/api/damage-check-templates/import', Object.assign({}, exp.json, { name: 'AUDIT-P14 imported' }));
      out.c8_import = { status: imp.status, id: imp.json && imp.json.id, body: imp.status >= 400 ? imp.text.slice(0, 200) : undefined };
      L.log('import', out.c8_import);
      const impBad = await st.post('/api/damage-check-templates/import', { name: 'AUDIT-P14 imported bad', canvasFields: 'garbage', isDefault: true });
      out.c8_import_bad = { status: impBad.status, body: impBad.text.slice(0, 200) };
      L.log('import bad (isDefault true, garbage fields)', out.c8_import_bad);
      const defs = await L.q('select id, name from damage_check_templates where is_default');
      out.c8_defaults_after = defs; L.log('defaults after import', defs);
      if (impBad.json && impBad.json.id && impBad.json.isDefault) { await st.post(`/api/damage-check-templates/1/set-default`); }
      if (imp.json && imp.json.id) await st.del(`/api/damage-check-templates/${imp.json.id}`);
      if (impBad.json && impBad.json.id) await st.del(`/api/damage-check-templates/${impBad.json.id}`);
    }
    const clone = await st.post(`/api/damage-check-templates/${ids.dcTpl}/clone`);
    out.c8_clone = { status: clone.status, id: clone.json && clone.json.id };
    if (clone.json && clone.json.id) await st.del(`/api/damage-check-templates/${clone.json.id}`);
    L.log('clone', out.c8_clone);
  });

  L.saveIds(ids);
  fs.writeFileSync(path.join(__dirname, 'p14-c-damage.out.json'), JSON.stringify(out, null, 1));
  console.log('\nhealth', await L.health());
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

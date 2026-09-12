// P36 agent D — damage-check/pdf template validation & backgrounds (BUG-168,176,177,179,180,193,194)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.16');
  const out = {};

  out.E1_page_preview = await L.step('E1 preview-pdf with page 40000 (BUG-168)', async () => {
    const t0 = Date.now();
    const r = await st.post('/api/damage-check-templates/preview-pdf', { name: 'AUDIT-P36D x', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'on page 40000', fontSize: 11, page: 40000 }] });
    return { status: r.status, ms: Date.now() - t0, body: r.text.slice(0, 300) };
  });

  out.E2_page_put = await L.step('E2 PUT template page 99999 (BUG-168)', async () => {
    const r = await st.put(`/api/damage-check-templates/${ids.dc_normal}`, { name: 'AUDIT-P36D DC normal', canvasFields: [{ id: 'a', type: 'text', x: 40, y: 200, name: 'p99999', fontSize: 11, page: 99999 }], isDefault: false });
    return { status: r.status, body: r.text.slice(0, 300) };
  });

  out.E3_bad_canvasfields = await L.step('E3 preview-pdf with garbage canvasFields (BUG-176)', async () => {
    const payloads = [
      { label: 'damageTypes unicode', body: { name: 'x', canvasFields: [{ id: 'i', type: 'inspection', x: 40, y: 100, name: 'i', damageTypes: ['ja', '\u{1F600}', 'nee'] }] } },
      { label: 'damageTypes non-string', body: { name: 'x', canvasFields: [{ id: 'i', type: 'inspection', x: 40, y: 100, name: 'i', damageTypes: [42, null, { a: 1 }] }] } },
      { label: 'mixed junk', body: { name: 'x', canvasFields: [{ id: 'u', type: 'unknownType', x: 1, y: 1 }, { id: 'n', name: 'no type', x: 1, y: 1 }, 'string-field', null, 42] } },
      { label: 'proto source', body: { name: 'x', canvasFields: [{ id: 'p', type: 'dynamic', x: 40, y: 100, name: 'p', source: '__proto__' }] } },
      { label: 'canvasFields string', body: { name: 'x', canvasFields: 'not an array' } },
    ];
    const res = [];
    for (const p of payloads) { const r = await st.post('/api/damage-check-templates/preview-pdf', p.body); res.push({ label: p.label, status: r.status, body: r.text.slice(0, 160) }); }
    return res;
  });

  out.E4_import = await L.step('E4 import with garbage + isDefault (BUG-176)', async () => {
    const before = await L.q('select id, is_default from damage_check_templates order by id');
    const r = await st.post('/api/damage-check-templates/import', { name: 'AUDIT-P36D imported junk', canvasFields: 'garbage', isDefault: true });
    const after = await L.q('select id, name, is_default from damage_check_templates order by id');
    return { status: r.status, body: r.text.slice(0, 300), before, after };
  });

  out.E5_pdftpl_validation = await L.step('E5 PATCH pdf-templates validation (BUG-194)', async () => {
    const cases = [
      { label: 'fields broken json', body: { fields: '{oops' } },
      { label: 'fields 2MB string', body: { fields: 'x'.repeat(2 * 1024 * 1024) } },
      { label: 'name empty', body: { name: '' } },
      { label: 'fields null', body: { fields: null } },
    ];
    const res = [];
    for (const c of cases) { const r = await st.patch(`/api/pdf-templates/${ids.tplBg}`, c.body); res.push({ label: c.label, status: r.status, body: r.text.slice(0, 200) }); }
    const row = await L.q('select id, name, fields::text from pdf_templates where id=$1', [ids.tplBg]);
    return { res, row: { id: row[0].id, name: row[0].name, fieldsLen: (row[0].fields || '').length } };
  });

  out.E6_other_validation = await L.step('E6 other endpoints validation (BUG-194)', async () => {
    const res = {};
    let r = await st.post('/api/contracts/preview', { vehicleId: 'abc', customerId: ids.cNormal, startDate: 'not-a-date' });
    res.preview_bad_vehicle = { status: r.status, body: r.text.slice(0, 200) };
    r = await st.post('/api/contracts/preview', { vehicleId: ids.vNormal, customerId: ids.cNormal });
    res.preview_no_dates = { status: r.status, body: r.text.slice(0, 200) };
    r = await L.getBuffer(st, `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, { method: 'POST', body: { vehicleId: { $gt: 0 }, customerId: ids.cNormal, startDate: L.today(), endDate: L.today() } });
    res.versioned_operator = { status: r.status, body: r.buf.toString('utf8').slice(0, 200) };
    r = await st.post('/api/delivery/transports/generate-report', { transportIds: ['abc', ids.trNormal] });
    res.report_bad_ids = { status: r.status, body: r.text.slice(0, 200) };
    r = await st.post('/api/delivery/transports/generate-report', { transportIds: [ids.trNormal], templateId: 'abc' });
    res.report_bad_tpl = { status: r.status, body: r.text.slice(0, 200) };
    r = await L.getBuffer(st, '/api/interactive-damage-checks/abc/pdf');
    res.interactive_abc = { status: r.status, body: r.buf.toString('utf8').slice(0, 200) };
    const trTpl = await L.q('select id from transport_report_templates order by id limit 1');
    if (trTpl[0]) { r = await st.patch(`/api/transport-report-templates/${trTpl[0].id}`, { fields: 'not json' }); res.transport_tpl_fields = { status: r.status, body: r.text.slice(0, 200) }; }
    const blTpl = await L.q("select table_name from information_schema.tables where table_name='barcode_label_templates'");
    if (blTpl[0]) {
      const bl = await L.q('select id from barcode_label_templates order by id limit 1');
      if (bl[0]) { r = await st.patch(`/api/barcode-label-templates/${bl[0].id}`, { labelWidthMm: -5, labelHeightMm: 0, fields: 'garbage' }); res.barcode_tpl = { status: r.status, body: r.text.slice(0, 200) }; }
    }
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-05-templates.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

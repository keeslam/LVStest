// P36 agent D — PDF cluster probe 2 (BUG-162 transport, 163/164 fallback, 165 generate-default,
// 181 template resolution, 182 mismatch, 183 damage-check reservation choice, 190 versioning, 191 renderer)
'use strict';
const L = require('./p36d-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.11');
  const out = {};

  out.B1_transport_special = await L.step('B1 transport report with unicode (BUG-162)', async () => {
    const r = await L.fetchPdf(st, '/api/delivery/transports/generate-report', 'b1_transport_special.pdf', {
      method: 'POST', body: { transportIds: [ids.trSpecial] }, textChars: 1500 });
    return { status: r.status, isPdf: r.isPdf, body: (r.body||'').slice(0,300), text: (r.allText||'').slice(0,1500) };
  });

  out.B2_transport_long = await L.step('B2 transport report long values (BUG-178)', async () => {
    const r = await L.fetchPdf(st, '/api/delivery/transports/generate-report', 'b2_transport_long.pdf', {
      method: 'POST', body: { transportIds: [ids.trLong] }, oob: 12 });
    return { status: r.status, isPdf: r.isPdf, oob: r.info && r.info.outOfBounds, oobCount: r.info && r.info.outOfBoundsCount };
  });

  out.B3_transport_bogus_tpl = await L.step('B3 generate-report templateId 999999 (BUG-181b)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, '/api/delivery/transports/generate-report', 'b3_transport_bogus.pdf', {
      method: 'POST', body: { transportIds: [ids.trNormal], templateId: 999999 } });
    const after = await L.q('select id, document_type, file_size from documents where id > $1', [before[0].m||0]);
    return { status: r.status, isPdf: r.isPdf, bytes: r.bytes, body:(r.body||'').slice(0,200), newDocs: after, text:(r.allText||'').slice(0,200) };
  });

  out.B4_make_default = await L.step('B4 make tplFull the default', async () => {
    const r = await st.patch(`/api/pdf-templates/${ids.tplFull}`, { isDefault: true });
    const rows = await L.q('select id,name,is_default from pdf_templates order by id');
    return { status: r.status, rows };
  });

  out.B5_generate_default = await L.step('B5 generate-default again (BUG-165)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/contracts/generate-default/${ids.rNormal}`, 'b5_default.pdf', { textChars: 500 });
    const after = await L.q('select id, reservation_id, document_type, content_type, file_path, version from documents where id > $1 order by id', [before[0].m||0]);
    return { status: r.status, isPdf: r.isPdf, body:(r.body||'').slice(0,300), newDocs: after, text:(r.allText||'').slice(0,400) };
  });

  out.B6_versioned_mismatch = await L.step('B6 generate-versioned with foreign vehicle/customer (BUG-182)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'b6_versioned_mismatch.pdf', {
      method: 'POST', body: { vehicleId: ids.vSpecial, customerId: ids.cSpecial, startDate: L.today(), endDate: L.addDays(L.today(),3) }, textChars: 600 });
    const after = await L.q('select id, reservation_id, vehicle_id, document_type, version from documents where id > $1 order by id', [before[0].m||0]);
    return { status: r.status, isPdf: r.isPdf, body:(r.body||'').slice(0,300), newDocs: after, text:(r.allText||'').slice(0,400) };
  });

  out.B7_no_default = await L.step('B7 remove every default then generate (BUG-181a)', async () => {
    const r1 = await st.patch(`/api/pdf-templates/${ids.tplFull}`, { isDefault: false });
    const r2 = await st.patch('/api/pdf-templates/2', { isDefault: false });
    const rows = await L.q('select id,name,is_default from pdf_templates order by id');
    const def = await st.get('/api/pdf-templates/default');
    const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}`, 'b7_nodefault.pdf', { textChars: 300 });
    return { patch1: r1.status, patch2: r2.status, rows, defaultRoute: { status: def.status, body: def.text.slice(0,200) },
             generate: { status: gen.status, isPdf: gen.isPdf, body: (gen.body||'').slice(0,300) } };
  });

  out.B8_restore_default = await L.step('B8 restore tplFull default', async () => {
    const r = await st.patch(`/api/pdf-templates/${ids.tplFull}`, { isDefault: true });
    return { status: r.status, rows: await L.q('select id,name,is_default from pdf_templates order by id') };
  });

  out.B9_versioning_race = await L.step('B9 five concurrent generations (BUG-190)', async () => {
    const before = await L.q('select max(id) m from documents');
    const sessions = [];
    for (let i = 0; i < 5; i++) sessions.push(await L.staff('10.36.4.2' + i));
    const rs = await Promise.all(sessions.map(s => L.getBuffer(s, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`)));
    const after = await L.q('select id, reservation_id, document_type, file_path, version from documents where id > $1 order by id', [before[0].m||0]);
    return { statuses: rs.map(r=>r.status), newDocs: after,
             distinctPaths: new Set(after.map(d=>d.file_path)).size, distinctVersions: new Set(after.map(d=>String(d.version)+'|'+d.document_type)).size };
  });

  out.B10_bad_fields_tpl = await L.step('B10 template with unresolvable sources (BUG-191)', async () => {
    const F = (name, source, x, y, extra={}) => Object.assign({ id:'f-'+name.replace(/\W+/g,'-'), name, x, y, fontSize: 10, isBold:false, source, textAlign:'left', locked:false }, extra);
    const fields = [ F('SHOULD-NOT-PRINT-unknown-plain','nonexistentSource',55,555), F('Proto','__proto__',55,570),
                     F('VehicleId','vehicleId',55,585), F('NoSource',undefined,55,615), F('DottedUnknown','foo.bar',55,600) ];
    const r = await st.post('/api/pdf-templates', { name: 'AUDIT-P36D unresolved sources', isDefault:false, backgroundPath:null, fields: JSON.stringify(fields) });
    if (r.status !== 201) return { create: L.short(r, 600) };
    const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${r.json.id}`, 'b10_unresolved.pdf', { textChars: 600 });
    return { create: r.status, tplId: r.json.id, status: gen.status, isPdf: gen.isPdf, text: (gen.allText||'').slice(0,600), body:(gen.body||'').slice(0,300) };
  });

  console.log('\n===== RESULT =====');
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname,'p36d-02-pdf2.out.json'), JSON.stringify(out,null,1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

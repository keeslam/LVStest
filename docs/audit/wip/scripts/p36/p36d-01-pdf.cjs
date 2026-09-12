// P36 agent D — PDF cluster probe (BUG-162..166, 178, 181..183, 190..192, 194)
'use strict';
const L = require('./p36d-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.10');
  const out = {};

  out.A1_special = await L.step('A1 contract for unicode customer (BUG-162)', async () => {
    const r = await L.fetchPdf(st, `/api/contracts/generate/${ids.rSpecial}?templateId=${ids.tplFull}`, 'a1_special.pdf', { textChars: 1200 });
    return { status: r.status, ct: r.contentType, bytes: r.bytes, isPdf: r.isPdf, text: (r.allText || r.body || '').slice(0, 1200), oob: r.info && r.info.outOfBoundsCount };
  });

  out.A2_normal = await L.step('A2 contract for normal customer (BUG-192 dates)', async () => {
    const r = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`, 'a2_normal.pdf', { textChars: 1200 });
    return { status: r.status, isPdf: r.isPdf, text: (r.allText || r.body || '').slice(0, 1200), oob: r.info && r.info.outOfBoundsCount };
  });

  out.A3_long = await L.step('A3 contract for long customer (BUG-178 overflow)', async () => {
    const r = await L.fetchPdf(st, `/api/contracts/generate/${ids.rLong}?templateId=${ids.tplFull}`, 'a3_long.pdf', { textChars: 600, oob: 12 });
    return { status: r.status, isPdf: r.isPdf, oob: r.info && r.info.outOfBounds, oobCount: r.info && r.info.outOfBoundsCount, text: (r.allText||'').slice(0,400) };
  });

  out.A4_unknown_tpl = await L.step('A4 unknown templateId (BUG-163/164/181)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/contracts/generate/${ids.rSpecial}?templateId=999999`, 'a4_unknown.pdf', { textChars: 800 });
    const after = await L.q('select id, document_type, file_path, file_size, content_type from documents where id > $1 order by id', [before[0].m || 0]);
    return { status: r.status, ct: r.contentType, bytes: r.bytes, isPdf: r.isPdf, head: (r.body || '').slice(0, 120), newDocs: after, text: (r.allText||'').slice(0,500) };
  });

  out.A5_generate_default = await L.step('A5 generate-default documents row (BUG-165)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/contracts/generate-default/${ids.rNormal}`, 'a5_default.pdf', { textChars: 400 });
    const after = await L.q('select id, reservation_id, document_type, content_type, file_path, version from documents where id > $1 order by id', [before[0].m || 0]);
    return { status: r.status, isPdf: r.isPdf, body: (r.body||'').slice(0,200), newDocs: after };
  });

  out.A6_damage_generate = await L.step('A6 damage-checks/generate (BUG-165/166)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/damage-checks/generate/${ids.rDamage}`, 'a6_dc.pdf', { textChars: 1500 });
    const after = await L.q('select id, reservation_id, document_type, content_type, version from documents where id > $1 order by id', [before[0].m || 0]);
    return { status: r.status, isPdf: r.isPdf, body: (r.body||'').slice(0,300), newDocs: after, text: (r.allText||'').slice(0,1200) };
  });

  out.A7_vehicle_dc_old = await L.step('A7 vehicle damage-check-pdf with only past reservation (BUG-183/166)', async () => {
    const r = await L.fetchPdf(st, `/api/vehicles/${ids.vOldRes}/damage-check-pdf`, 'a7_vdc_old.pdf', { textChars: 1500 });
    return { status: r.status, isPdf: r.isPdf, body: (r.body||'').slice(0,300), text: (r.allText||'').slice(0,1200) };
  });

  out.A8_openended_dc = await L.step('A8 damage check for open-ended reservation (BUG-183)', async () => {
    const r = await L.fetchPdf(st, `/api/damage-checks/generate/${ids.rEmpty}`, 'a8_dc_open.pdf', { textChars: 1500 });
    return { status: r.status, isPdf: r.isPdf, body:(r.body||'').slice(0,300), text: (r.allText||'').slice(0,1200) };
  });

  out.A9_versioned_bogus = await L.step('A9 generate-versioned for nonexistent reservation (BUG-182)', async () => {
    const before = await L.q('select max(id) m from documents');
    const r = await L.fetchPdf(st, `/api/contracts/generate-versioned/999999?templateId=${ids.tplFull}`, 'a9_versioned.pdf', {
      method: 'POST', body: { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 3) } });
    const after = await L.q('select id, reservation_id, document_type from documents where id > $1 order by id', [before[0].m || 0]);
    return { status: r.status, isPdf: r.isPdf, body: (r.body||'').slice(0,200), newDocs: after };
  });

  out.A10_no_default = await L.step('A10 contract without templateId (BUG-181a)', async () => {
    const defs = await L.q('select id, name, is_default from pdf_templates order by id');
    const r = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}`, 'a10_nodefault.pdf', { textChars: 400 });
    return { templates: defs, status: r.status, isPdf: r.isPdf, body:(r.body||'').slice(0,200), text:(r.allText||'').slice(0,300) };
  });

  console.log('\n===== RESULT =====');
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, 'p36d-01-pdf.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

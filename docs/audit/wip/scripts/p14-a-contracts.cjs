// Phase 14 A: contract PDF generators (from-template, legacy, preview, versioned, generate-default, template preview).
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.14.1.2');
  const out = {};
  const docsBefore = await L.q('select coalesce(max(id),0) m from documents');
  const docMax0 = Number(docsBefore[0].m);

  const gen = async (key, url, name, opts = {}) => {
    const rec = await L.fetchPdf(st, url, name, Object.assign({ png: true, textChars: 500 }, opts));
    out[key] = rec;
    L.log(key, { status: rec.status, bytes: rec.bytes, ct: rec.contentType, pages: rec.info && rec.info.pages, oob: rec.info && rec.info.outOfBoundsCount, err: rec.info && rec.info.error, text: rec.info && rec.info.p1Text && rec.info.p1Text.slice(0, 260), body: rec.body });
    return rec;
  };

  await L.step('A1 default template (id 2 "gffg", 0 fields) for normal reservation - BUG-028 baseline', async () => {
    await gen('a1_default', `/api/contracts/generate/${ids.rNormal}`, 'a1_default_normal.pdf');
  });

  await L.step('A2 full-field template for normal / long / special / empty-customer reservations', async () => {
    await gen('a2_normal', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`, 'a2_full_normal.pdf', { fullText: true, items: true });
    await gen('a2_long', `/api/contracts/generate/${ids.rLong}?templateId=${ids.tplFull}`, 'a2_full_long.pdf', { fullText: true });
    await gen('a2_special', `/api/contracts/generate/${ids.rSpecial}?templateId=${ids.tplFull}`, 'a2_full_special.pdf', { fullText: true });
    await gen('a2_empty', `/api/contracts/generate/${ids.rEmpty}?templateId=${ids.tplFull}`, 'a2_full_empty.pdf', { fullText: true });
  });

  await L.step('A3 invalid-field template (neg coords, off-page, font 0/500/-12, unknown sources, page 3, non-object fields)', async () => {
    await gen('a3_invalid', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplInvalid}`, 'a3_invalid_fields.pdf', { fullText: true, items: true, oob: 20 });
  });

  await L.step('A4 empty-fields template, unknown templateId (BUG-156 -> legacy), legacy with special chars', async () => {
    await gen('a4_emptyfields', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplEmpty}`, 'a4_empty_fields.pdf');
    await gen('a4_unknown_tpl_normal', `/api/contracts/generate/${ids.rNormal}?templateId=999999`, 'a4_unknown_template_legacy_normal.pdf', { fullText: true });
    await gen('a4_unknown_tpl_special', `/api/contracts/generate/${ids.rSpecial}?templateId=999999`, 'a4_unknown_template_legacy_special.pdf', { fullText: true, forceInspect: true });
    await gen('a4_unknown_tpl_long', `/api/contracts/generate/${ids.rLong}?templateId=999999`, 'a4_unknown_template_legacy_long.pdf', { fullText: true });
    await gen('a4_tplid_garbage', `/api/contracts/generate/${ids.rNormal}?templateId=abc`, 'a4_templateid_abc.pdf');
    await gen('a4_tplid_neg', `/api/contracts/generate/${ids.rNormal}?templateId=-1`, 'a4_templateid_neg.pdf');
  });

  await L.step('A5 generate-default + document rows created by A1-A4', async () => {
    await gen('a5_gen_default', `/api/contracts/generate-default/${ids.rNormal}`, 'a5_generate_default.pdf');
    await gen('a5_gen_default_special', `/api/contracts/generate-default/${ids.rSpecial}`, 'a5_generate_default_special.pdf');
    const docs = await L.q('select id, reservation_id, vehicle_id, document_type, file_name, file_path, file_size, content_type from documents where id > $1 order by id', [docMax0]);
    out.docsCreated = docs;
    L.log('documents rows created so far', docs.length, docs.map(d => `${d.id}:${d.reservation_id}:${d.document_type}:${d.file_path}:${d.file_size}`));
    // verify the files on disk actually are PDFs
    const uploadsDir = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-uploads';
    out.diskCheck = [];
    for (const d of docs) {
      const cands = [path.join(uploadsDir, d.file_path.replace(/^uploads[\\/]/, '')), path.join(process.cwd(), d.file_path), path.join(uploadsDir, d.file_path)];
      const found = cands.find(c => fs.existsSync(c));
      let head = null;
      if (found) head = fs.readFileSync(found).slice(0, 8).toString('latin1');
      out.diskCheck.push({ id: d.id, file_path: d.file_path, found: found ? path.relative(process.cwd(), found) : null, head });
    }
    L.log('disk check', out.diskCheck);
  });

  await L.step('A6 POST /api/contracts/preview (token flow) - valid, garbage dates, string ids, missing fields, unknown template', async () => {
    const valid = await st.post(`/api/contracts/preview?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 3), notes: 'AUDIT-P14 preview' });
    out.a6_valid = { status: valid.status, body: valid.text.slice(0, 200) };
    L.log('preview valid', out.a6_valid);
    if (valid.json && valid.json.token) {
      await gen('a6_valid_pdf', valid.json.downloadUrl, 'a6_preview_valid.pdf', { fullText: true });
      // token reuse by another user (limited) must 404
      const lim = await L.staff('10.14.1.3', ids.limitedUserName, ids.limitedUserPass);
      const other = await L.getBuffer(lim, valid.json.downloadUrl);
      out.a6_token_other_user = { status: other.status, body: other.buf.toString().slice(0, 120) };
      L.log('preview token fetched by other user', out.a6_token_other_user);
    }
    const garbage = await st.post(`/api/contracts/preview?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: 'not-a-date', endDate: 'also-garbage' });
    out.a6_garbage_dates = { status: garbage.status, body: garbage.text.slice(0, 300) };
    L.log('preview garbage dates', out.a6_garbage_dates);
    const strId = await st.post(`/api/contracts/preview`, { vehicleId: 'abc', customerId: 'def', startDate: L.today() });
    out.a6_string_ids = { status: strId.status, body: strId.text.slice(0, 300) };
    L.log('preview string ids', out.a6_string_ids);
    const objId = await st.post(`/api/contracts/preview`, { vehicleId: { $gt: 0 }, customerId: [1], startDate: L.today() });
    out.a6_object_ids = { status: objId.status, body: objId.text.slice(0, 300) };
    L.log('preview object ids', out.a6_object_ids);
    const missing = await st.post(`/api/contracts/preview`, {});
    out.a6_missing = { status: missing.status, body: missing.text.slice(0, 200) };
    L.log('preview missing', out.a6_missing);
    const noDates = await st.post(`/api/contracts/preview?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal });
    out.a6_no_dates = { status: noDates.status, body: noDates.text.slice(0, 300) };
    L.log('preview no dates', out.a6_no_dates);
    const unkTpl = await st.post(`/api/contracts/preview?templateId=999999`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today() });
    out.a6_unknown_tpl = { status: unkTpl.status, body: unkTpl.text.slice(0, 200) };
    L.log('preview unknown template', out.a6_unknown_tpl);
    const badToken = await L.getBuffer(st, '/api/contracts/preview/../../etc/passwd');
    out.a6_bad_token = { status: badToken.status, body: badToken.buf.toString().slice(0, 100) };
    L.log('preview bad token', out.a6_bad_token);
  });

  await L.step('A7 POST /api/contracts/generate-versioned (form data) - valid, garbage dates, foreign vehicle/customer, driver', async () => {
    const body = { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 5), notes: 'AUDIT-P14 versioned' };
    await gen('a7_valid', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'a7_versioned_valid.pdf', { method: 'POST', body, fullText: true });
    await gen('a7_valid_again', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'a7_versioned_valid_2.pdf', { method: 'POST', body });
    await gen('a7_garbage_dates', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'a7_versioned_garbage_dates.pdf', { method: 'POST', body: Object.assign({}, body, { startDate: 'garbage', endDate: 'garbage' }) });
    await gen('a7_other_vehicle', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'a7_versioned_other_vehicle_customer.pdf', { method: 'POST', body: Object.assign({}, body, { vehicleId: ids.vSpecial, customerId: ids.cSpecial }), fullText: true });
    await gen('a7_nonexistent_res', `/api/contracts/generate-versioned/999999?templateId=${ids.tplFull}`, 'a7_versioned_nonexistent_reservation.pdf', { method: 'POST', body, fullText: true });
    await gen('a7_string_ids', `/api/contracts/generate-versioned/${ids.rNormal}`, 'a7_versioned_string_ids.pdf', { method: 'POST', body: Object.assign({}, body, { vehicleId: 'abc', customerId: 'def' }) });
    await gen('a7_driver', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, 'a7_versioned_driver.pdf', { method: 'POST', body: Object.assign({}, body, { driverId: 999999 }) });
    const docs = await L.q("select id, reservation_id, vehicle_id, document_type, file_name, file_path from documents where reservation_id in ($1) and id > $2 order by id", [ids.rNormal, docMax0]);
    out.a7_docs = docs;
    L.log('documents for rNormal after versioned calls', docs.map(d => `${d.id}:${d.document_type}:${d.file_name}`));
    const nonexist = await L.q('select id, reservation_id, vehicle_id, document_type, file_path from documents where reservation_id = 999999');
    out.a7_docs_nonexistent = nonexist;
    L.log('documents rows for reservation 999999 (should be none)', nonexist);
  });

  await L.step('A8 template preview endpoint GET /api/pdf-templates/:id/preview', async () => {
    await gen('a8_preview_full', `/api/pdf-templates/${ids.tplFull}/preview`, 'a8_template_preview_full.pdf', { fullText: true });
    await gen('a8_preview_invalid', `/api/pdf-templates/${ids.tplInvalid}/preview`, 'a8_template_preview_invalid.pdf', { fullText: true });
    await gen('a8_preview_404', `/api/pdf-templates/999999/preview`, 'a8_template_preview_404.pdf');
    await gen('a8_preview_nan', `/api/pdf-templates/abc/preview`, 'a8_template_preview_nan.pdf');
  });

  await L.step('A9 contracts/data JSON (same prepareContractData) for the four reservations', async () => {
    for (const k of ['rNormal', 'rLong', 'rSpecial', 'rEmpty']) {
      const r = await st.get(`/api/contracts/data/${ids[k]}`);
      out['a9_' + k] = r.json;
      L.log('contracts/data ' + k, r.status, r.json && { startDate: r.json.startDate, endDate: r.json.endDate, duration: r.json.duration, contractDate: r.json.contractDate, totalPrice: r.json.totalPrice, licensePlate: r.json.licensePlate, name: (r.json.customerName || '').slice(0, 60) });
    }
  });

  await L.step('A10 concurrency: 5 parallel generations of the same reservation', async () => {
    const before = await L.q('select count(*) c from documents where reservation_id=$1', [ids.rNormal]);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(i => L.getBuffer(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`)));
    const after = await L.q("select id, document_type, file_name from documents where reservation_id=$1 and document_type like 'Contract (Unsigned)%' order by id", [ids.rNormal]);
    out.a10 = { statuses: rs.map(r => r.status), sizes: rs.map(r => r.buf.length), docsBefore: Number(before[0].c), docsAfter: after.length, types: after.map(d => d.document_type), files: [...new Set(after.map(d => d.file_name))] };
    L.log('parallel', out.a10);
  });

  fs.writeFileSync(path.join(__dirname, 'p14-a-contracts.out.json'), JSON.stringify(out, null, 1));
  console.log('\nhealth', await L.health());
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });

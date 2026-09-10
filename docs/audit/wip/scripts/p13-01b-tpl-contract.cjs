// Phase 13 test 10c/11 (continuation of p13-01-edit.cjs after its pdf_templates column error).
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-01b-tpl-contract');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const { c1, c2 } = ids;
  let res;
  // pdf template PATCH parallel: two designers edit different parts of the same template
  const tpl = (await admin.get('/api/pdf-templates/8')).json;
  const fieldsA = Array.isArray(tpl.fields) ? tpl.fields : (typeof tpl.fields === 'string' ? JSON.parse(tpl.fields || '[]') : []);
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: '/api/pdf-templates/8', body: { name: 'AUDIT-missing-bg-test', fields: [...fieldsA, { name: 'AUDIT-P13-fieldA', x: 1, y: 1 }] }, label: 'admin adds field A' },
    { sess: mgr, method: 'PATCH', path: '/api/pdf-templates/8', body: { name: 'AUDIT-missing-bg-test', fields: [...fieldsA, { name: 'AUDIT-P13-fieldB', x: 2, y: 2 }] }, label: 'mgr adds field B' },
  ]);
  const tplAfter = (await L.q('select id, name, fields, updated_at from pdf_templates where id=8'))[0];
  const fstr = JSON.stringify(tplAfter.fields);
  rep.step('10c PATCH /api/pdf-templates/8 two users add a field each, parallel', { results: L.brief(res, 100), dist: L.dist(res), hasA: fstr.includes('AUDIT-P13-fieldA'), hasB: fstr.includes('AUDIT-P13-fieldB'), updated_at: tplAfter.updated_at, verdict: fstr.includes('AUDIT-P13-fieldA') && fstr.includes('AUDIT-P13-fieldB') ? 'both kept' : 'LOST UPDATE: fields blob is replaced whole, one designer\'s field silently gone' });
  await admin.patch('/api/pdf-templates/8', { fields: fieldsA });

  // ---------- Test 11: next-contract-number suggestion race ----------
  res = await L.burst(Array.from({ length: 10 }, (_, i) => ({ sess: i % 2 ? mgr : admin, method: 'GET', path: '/api/settings/next-contract-number', label: 'next#' + i })));
  const numbers = res.map((r) => r.json && r.json.contractNumber);
  rep.step('11a 10x parallel GET next-contract-number', { dist: L.dist(res), numbers, distinct: [...new Set(numbers)] });
  const suggested = numbers[0];
  // three booked reservations starting today, three staff pick up with the same suggested number in parallel
  const t = L.today();
  const P = [];
  for (const [i, v] of [ids.v8, ids.v9, ids.v10].entries()) {
    P.push(await L.createReservation(admin, { vehicleId: v, customerId: [c1, c2, ids.c3][i], startDate: t, endDate: L.addDays(t, 3), notes: `AUDIT-P13 pickup-race ${i}` }));
  }
  res = await L.burst(P.map((r, i) => ({ sess: i % 2 ? mgr : admin, method: 'POST', path: `/api/reservations/${r.id}/pickup`, body: { contractNumber: String(suggested), pickupMileage: 1200, fuelLevelPickup: 'full' }, label: 'pickup ' + r.id })));
  const rows = await Promise.all(P.map((r) => L.resRow(r.id)));
  rep.step('11b 3 parallel pickups with the same suggested number', { results: L.brief(res, 200), dist: L.dist(res), final: rows.map((r) => ({ id: r.id, status: r.status, contract_number: r.contract_number })), docs: (await Promise.all(P.map((r) => L.docsFor(r.id)))).map((d) => d.length), note: 'BUG-038 class: no pre-check, raw unique-violation message; no number reservation, so the suggestion is identical for everyone until someone commits' });
  // realistic: the losers now ask for a new suggestion -> is it incremented?
  const again = await admin.get('/api/settings/next-contract-number');
  rep.step('11c next number after one pickup committed', { suggested, next: again.json });

  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

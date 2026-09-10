// Phase 13 test 1/2/10/11: simultaneous edits of one reservation, vehicle
// (re)assignment races, settings/pdf-template simultaneous saves,
// next-contract-number suggestion race.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-01-edit');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const { v1, v2, v3, v4, v5, v6, v7, c1, c2 } = ids;

  // ---------- Test 1: same reservation edited by two users ----------
  const R1 = await L.createReservation(admin, { vehicleId: v1, customerId: c1, startDate: '2029-01-10', endDate: '2029-01-15', notes: 'AUDIT-P13 R1 initial', totalPrice: 100 });
  rep.step('1.setup R1', { id: R1.id, row: await L.resRow(R1.id) });

  // 1a different fields via PATCH /:id (partial bodies)
  let res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { notes: 'AUDIT-P13 1a notes by admin' }, label: 'admin notes' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { totalPrice: 222 }, label: 'mgr totalPrice' },
  ]);
  let row = await L.resRow(R1.id);
  rep.step('1a PATCH /:id different fields, partial bodies, parallel', { results: L.brief(res, 120), dist: L.dist(res), final: { notes: row.notes, total_price: row.total_price, updated_by: row.updated_by }, verdict: row.notes === 'AUDIT-P13 1a notes by admin' && Number(row.total_price) === 222 ? 'both kept (column-level update)' : 'LOST UPDATE' });

  // 1b same field via PATCH /:id
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { notes: 'AUDIT-P13 1b admin' }, label: 'admin' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { notes: 'AUDIT-P13 1b mgr' }, label: 'mgr' },
  ]);
  row = await L.resRow(R1.id);
  rep.step('1b PATCH /:id same field parallel', { results: L.brief(res, 120), dist: L.dist(res), final: { notes: row.notes, updated_by: row.updated_by }, note: 'no version/updatedAt check exists in the handler; whichever UPDATE commits last wins, both callers get 200 with their own value echoed' });

  // 1c realistic "two tabs": both load the full row, each changes one field and saves the full row (what reservation-form.tsx does)
  const formBody = (r, patch) => ({ vehicleId: r.vehicleId, customerId: r.customerId, startDate: r.startDate, endDate: r.endDate, status: r.status, type: r.type, totalPrice: r.totalPrice, notes: r.notes, ...patch });
  const loadedA = (await admin.get(`/api/reservations/${R1.id}`)).json;
  const loadedB = (await mgr.get(`/api/reservations/${R1.id}`)).json;
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: formBody(loadedA, { notes: 'AUDIT-P13 1c notes by admin (tab A)' }), label: 'tab A full row, notes' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: formBody(loadedB, { totalPrice: 333 }), label: 'tab B full row, totalPrice' },
  ]);
  row = await L.resRow(R1.id);
  rep.step('1c PATCH /:id full-row bodies (form shape), parallel', { results: L.brief(res, 120), dist: L.dist(res), final: { notes: row.notes, total_price: row.total_price, updated_by: row.updated_by }, verdict: (row.notes === 'AUDIT-P13 1c notes by admin (tab A)' && Number(row.total_price) === 333) ? 'both kept' : 'LOST UPDATE (last full-row writer wins)' });

  // 1c-seq: same thing sequentially (no race needed)
  const la = (await admin.get(`/api/reservations/${R1.id}`)).json;
  const lb = (await mgr.get(`/api/reservations/${R1.id}`)).json;
  const s1 = await admin.patch(`/api/reservations/${R1.id}`, formBody(la, { notes: 'AUDIT-P13 1c-seq notes by admin' }));
  const s2 = await mgr.patch(`/api/reservations/${R1.id}`, formBody(lb, { totalPrice: 444 }));
  row = await L.resRow(R1.id);
  rep.step('1c-seq two tabs loaded the same version, saved one after the other', { s1: s1.status, s2: s2.status, final: { notes: row.notes, total_price: row.total_price }, verdict: row.notes === 'AUDIT-P13 1c-seq notes by admin' ? 'both kept' : 'LOST UPDATE without any race: tab B (stale copy) silently reverted tab A\'s notes; no optimistic locking (updatedAt/version) anywhere' });

  // 1d /basic (requires full row) parallel
  const basicBody = (r, patch) => ({ vehicleId: r.vehicleId, customerId: r.customerId, startDate: r.startDate, endDate: r.endDate, status: r.status, type: r.type, totalPrice: r.totalPrice, notes: r.notes, ...patch });
  const ba = (await admin.get(`/api/reservations/${R1.id}`)).json;
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}/basic`, body: basicBody(ba, { notes: 'AUDIT-P13 1d basic admin' }), label: 'admin basic notes' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}/basic`, body: basicBody(ba, { totalPrice: 555 }), label: 'mgr basic price' },
  ]);
  row = await L.resRow(R1.id);
  rep.step('1d PATCH /:id/basic parallel (full row required)', { results: L.brief(res, 120), dist: L.dist(res), final: { notes: row.notes, total_price: row.total_price, updated_by: row.updated_by }, verdict: (row.notes === 'AUDIT-P13 1d basic admin' && Number(row.total_price) === 555) ? 'both kept' : 'LOST UPDATE (last writer wins)' });

  // 1e PATCH /:id vs /basic mixed (form vs calendar) - dates vs price
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { startDate: '2029-01-11', endDate: '2029-01-16' }, label: 'calendar drag (dates only)' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}/basic`, body: basicBody(ba, { totalPrice: 666 }), label: 'form save via /basic with old dates' },
  ]);
  row = await L.resRow(R1.id);
  rep.step('1e calendar drag (dates) vs form save (/basic, stale dates) parallel', { results: L.brief(res, 120), dist: L.dist(res), final: { start_date: row.start_date, end_date: row.end_date, total_price: row.total_price, updated_by: row.updated_by } });

  // ---------- Test 2: vehicle assignment races ----------
  // 2a two users assign different vehicles to the same reservation
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { vehicleId: v2, startDate: row.start_date, endDate: row.end_date }, label: 'admin -> v2' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R1.id}`, body: { vehicleId: v3, startDate: row.start_date, endDate: row.end_date }, label: 'mgr -> v3' },
  ]);
  row = await L.resRow(R1.id);
  rep.step('2a two users assign different vehicles to same reservation, parallel', { results: L.brief(res, 120), dist: L.dist(res), responsesVehicle: res.map((r) => r.json && r.json.vehicleId), final_vehicle_id: row.vehicle_id, v2, v3, verdict: 'both 200, each response echoes its own vehicle; DB holds the last writer' });

  // 2b two different reservations moved onto the same free vehicle for the same period via PATCH /:id (vehicleId+startDate present => conflict check runs)
  const R2 = await L.createReservation(admin, { vehicleId: v4, customerId: c1, startDate: '2029-02-01', endDate: '2029-02-05', notes: 'AUDIT-P13 R2' });
  const R3 = await L.createReservation(admin, { vehicleId: v5, customerId: c2, startDate: '2029-02-01', endDate: '2029-02-05', notes: 'AUDIT-P13 R3' });
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R2.id}`, body: { vehicleId: v6, startDate: '2029-02-01', endDate: '2029-02-05' }, label: 'R2 -> v6' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R3.id}`, body: { vehicleId: v6, startDate: '2029-02-01', endDate: '2029-02-05' }, label: 'R3 -> v6' },
  ]);
  let onV6 = await L.q("select id, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null and status not in ('cancelled','completed','returned') order by id", [v6]);
  rep.step('2b two reservations moved onto same vehicle/period via PATCH /:id, parallel', { results: L.brief(res, 160), dist: L.dist(res), onV6, verdict: onV6.length > 1 ? 'DOUBLE BOOKING via edit path (conflict check raced)' : 'ok' });
  // control: sequential
  const R2b = await L.createReservation(admin, { vehicleId: v4, customerId: c1, startDate: '2029-03-01', endDate: '2029-03-05', notes: 'AUDIT-P13 R2b' });
  const R3b = await L.createReservation(admin, { vehicleId: v5, customerId: c2, startDate: '2029-03-01', endDate: '2029-03-05', notes: 'AUDIT-P13 R3b' });
  const q1 = await admin.patch(`/api/reservations/${R2b.id}`, { vehicleId: v6, startDate: '2029-03-01', endDate: '2029-03-05' });
  const q2 = await mgr.patch(`/api/reservations/${R3b.id}`, { vehicleId: v6, startDate: '2029-03-01', endDate: '2029-03-05' });
  rep.step('2b-control sequential', { q1: q1.status, q2: q2.status, q2body: q2.text.slice(0, 120) });

  // 2c same via /basic
  const R4 = await L.createReservation(admin, { vehicleId: v4, customerId: c1, startDate: '2029-04-01', endDate: '2029-04-05', notes: 'AUDIT-P13 R4' });
  const R5 = await L.createReservation(admin, { vehicleId: v5, customerId: c2, startDate: '2029-04-01', endDate: '2029-04-05', notes: 'AUDIT-P13 R5' });
  res = await L.burst([
    { sess: admin, method: 'PATCH', path: `/api/reservations/${R4.id}/basic`, body: { vehicleId: v7, customerId: c1, startDate: '2029-04-01', endDate: '2029-04-05', status: 'booked', type: 'standard', notes: 'AUDIT-P13 R4 basic' }, label: 'R4 -> v7' },
    { sess: mgr, method: 'PATCH', path: `/api/reservations/${R5.id}/basic`, body: { vehicleId: v7, customerId: c2, startDate: '2029-04-01', endDate: '2029-04-05', status: 'booked', type: 'standard', notes: 'AUDIT-P13 R5 basic' }, label: 'R5 -> v7' },
  ]);
  let onV7 = await L.q("select id, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null and status not in ('cancelled','completed','returned') order by id", [v7]);
  rep.step('2c two reservations moved onto same vehicle/period via /basic, parallel', { results: L.brief(res, 160), dist: L.dist(res), onV7, verdict: onV7.length > 1 ? 'DOUBLE BOOKING via /basic (conflict check raced)' : 'ok' });

  // 2d: create + move race: POST new reservation on v7 while moving R4? (covered by BUG-006); instead: check-conflicts says busy, then both PATCH anyway is BUG-106 (not repeated)

  // ---------- Test 10: settings simultaneous saves ----------
  const before = (await admin.get('/api/system-settings')).json;
  rep.step('10.setup system-settings before', before);
  res = await L.burst([
    { sess: admin, method: 'PUT', path: '/api/system-settings', body: { serviceReminderKm: 1313 }, label: 'admin partial serviceReminderKm' },
    { sess: mgr, method: 'PUT', path: '/api/system-settings', body: { apkReminderDays: 13 }, label: 'mgr partial apkReminderDays' },
  ]);
  let st = (await L.q('select service_reminder_km, apk_reminder_days, updated_by from settings'))[0];
  rep.step('10a PUT /api/system-settings partial bodies parallel', { results: L.brief(res, 100), dist: L.dist(res), final: st, verdict: st.service_reminder_km === 1313 && st.apk_reminder_days === 13 ? 'both kept (undefined keys skipped)' : 'LOST UPDATE' });
  // full-row (settings page sends the whole form)
  const full = (k, v) => ({ ...before, [k]: v });
  res = await L.burst([
    { sess: admin, method: 'PUT', path: '/api/system-settings', body: full('serviceReminderKm', 1414), label: 'admin full form serviceReminderKm' },
    { sess: mgr, method: 'PUT', path: '/api/system-settings', body: full('apkReminderDays', 14), label: 'mgr full form apkReminderDays' },
  ]);
  st = (await L.q('select service_reminder_km, apk_reminder_days, updated_by from settings'))[0];
  rep.step('10b PUT /api/system-settings full-form bodies parallel', { results: L.brief(res, 100), dist: L.dist(res), final: st, verdict: st.service_reminder_km === 1414 && st.apk_reminder_days === 14 ? 'both kept' : 'LOST UPDATE (last full-form writer wins)' });
  // restore
  const restore = await admin.put('/api/system-settings', before);
  rep.step('10.restore', { status: restore.status, after: (await L.q('select service_reminder_km, apk_reminder_days from settings'))[0] });

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

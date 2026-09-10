// Phase 13 test 6: parallel document generation (contract, damage check, transport report).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p13-lib.cjs');

const UPLOADS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\audit-uploads';

(async () => {
  const rep = new L.Report('p13-04-docs');
  const admin = await L.getSession('admin');
  const mgr = await L.getSession('mgr');
  const ids = L.loadIds();
  const v = await L.ensureVehicle(admin, ids, 'd1', 'AU-13D1-X', 'P13-d1');
  const R = await L.createReservation(admin, { vehicleId: v, customerId: ids.c1, startDate: '2029-11-01', endDate: '2029-11-05', notes: 'AUDIT-P13 docs' });
  const docsQ = (rid) => L.q('select id, document_type, file_name, file_path, file_size, created_by from documents where reservation_id=$1 order by id', [rid]);
  const fileInfo = (rel) => { try { const p = path.isAbsolute(rel) ? rel : path.join(UPLOADS, rel.replace(/^uploads[\\/]/, '')); const st = fs.statSync(p); return st.size; } catch (e) { return 'MISSING'; } };

  // ---- 6a 10x parallel GET /api/contracts/generate/:id ----
  let before = (await docsQ(R.id)).length;
  let res = await L.burst(Array.from({ length: 10 }, (_, i) => ({ sess: i % 2 ? mgr : admin, method: 'GET', path: `/api/contracts/generate/${R.id}`, label: 'contract ' + i, opts: { timeoutMs: 120000 } })));
  let docs = await docsQ(R.id);
  rep.step('6a 10x parallel GET /api/contracts/generate/:id', { dist: L.dist(res), ms: res.map((r) => r.ms), bytes: res.map((r) => r.bytes), errors: res.filter((r) => r.status !== 200).map((r) => ({ status: r.status, body: r.text || r.error })), docRowsBefore: before, docRowsAfter: docs.length, docTypes: docs.map((d) => d.document_type), distinctFiles: [...new Set(docs.map((d) => d.file_path))].length, fileSizes: [...new Set(docs.map((d) => d.file_path))].map((f) => ({ f, size: fileInfo(f) })), verdict: 'versions computed from a concurrent read => duplicate version labels; one physical file for all rows (known, documents-mail.md)' });

  // ---- 6b 10x parallel damage-check PDF ----
  before = (await docsQ(R.id)).length;
  res = await L.burst(Array.from({ length: 10 }, (_, i) => ({ sess: i % 2 ? mgr : admin, method: 'GET', path: `/api/damage-checks/generate/${R.id}`, label: 'damage ' + i, opts: { timeoutMs: 120000 } })));
  docs = (await docsQ(R.id)).filter((d) => /Damage/.test(d.document_type));
  rep.step('6b 10x parallel GET /api/damage-checks/generate/:id', { dist: L.dist(res), ms: res.map((r) => r.ms), bytes: res.map((r) => r.bytes), errors: res.filter((r) => r.status !== 200).map((r) => ({ status: r.status, body: r.text || r.error })), damageRows: docs.length, docTypes: docs.map((d) => d.document_type), distinctFiles: [...new Set(docs.map((d) => d.file_path))].length, missingFiles: docs.filter((d) => fileInfo(d.file_path) === 'MISSING').length });

  // ---- 6c 10x parallel transport generate-report for the same transport ----
  const [tr] = await L.q("select id from vehicle_transports where spare_required=false and vehicle_id is not null and status='scheduled' order by id desc limit 1");
  const beforeTr = await L.q("select count(*)::int n from documents where document_type ilike '%transport%'");
  res = await L.burst(Array.from({ length: 10 }, (_, i) => ({ sess: i % 2 ? mgr : admin, method: 'POST', path: '/api/delivery/transports/generate-report', body: { transportIds: [tr.id] }, label: 'report ' + i, opts: { timeoutMs: 120000 } })));
  const trDocs = await L.q("select id, document_type, file_name, file_path, file_size from documents where document_type ilike '%transport%' order by id desc limit 12");
  const newTr = trDocs.slice(0, 10).reverse();
  rep.step('6c 10x parallel POST /api/delivery/transports/generate-report (same transport)', { transportId: tr.id, dist: L.dist(res), ms: res.map((r) => r.ms), errors: res.filter((r) => ![200, 201].includes(r.status)).map((r) => ({ status: r.status, body: r.text || r.error })), transportDocRowsBefore: beforeTr[0].n, transportDocRowsAfter: (await L.q("select count(*)::int n from documents where document_type ilike '%transport%'"))[0].n, newRows: newTr.map((d) => ({ id: d.id, file_name: d.file_name, size: d.file_size, onDisk: fileInfo(d.file_path) })), distinctFileNames: [...new Set(newTr.map((d) => d.file_name))].length, verdict: 'uniqueSuffix = Date.now() last 5 digits; same-millisecond requests share a file name' });

  // ---- 6d 10x parallel POST contracts/generate-versioned ----
  before = (await docsQ(R.id)).length;
  res = await L.burst(Array.from({ length: 10 }, (_, i) => ({ sess: i % 2 ? mgr : admin, method: 'POST', path: `/api/contracts/generate-versioned/${R.id}`, body: { vehicleId: v, customerId: ids.c1, startDate: '2029-11-01', endDate: '2029-11-05', notes: 'AUDIT-P13 versioned' }, label: 'versioned ' + i, opts: { timeoutMs: 120000 } })));
  docs = (await docsQ(R.id)).filter((d) => /Contract/.test(d.document_type));
  const typeCounts = {}; for (const d of docs) typeCounts[d.document_type] = (typeCounts[d.document_type] || 0) + 1;
  rep.step('6d 10x parallel POST /api/contracts/generate-versioned/:id', { dist: L.dist(res), ms: res.map((r) => r.ms), errors: res.filter((r) => r.status !== 200).map((r) => ({ status: r.status, body: r.text || r.error })), contractRows: docs.length, versionLabelCounts: typeCounts, distinctFiles: [...new Set(docs.map((d) => d.file_path))].length });

  // ---- 6e double-click "generate contract" from the same tab (2 requests 5 ms apart) ----
  const R2 = await L.createReservation(admin, { vehicleId: v, customerId: ids.c2, startDate: '2029-12-01', endDate: '2029-12-05', notes: 'AUDIT-P13 docs dblclick' });
  res = await L.burst([{ sess: admin, method: 'GET', path: `/api/contracts/generate/${R2.id}`, label: 'click1' }, { sess: admin, method: 'GET', path: `/api/contracts/generate/${R2.id}`, label: 'click2', delayMs: 5 }]);
  docs = await docsQ(R2.id);
  rep.step('6e double-click generate contract', { dist: L.dist(res), docTypes: docs.map((d) => d.document_type), files: [...new Set(docs.map((d) => d.file_path))] });

  L.saveIds(ids);
  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

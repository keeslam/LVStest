const { execFileSync } = require('child_process');
const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const sql = (q) => execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', 'lvs_regress', '-tAc', q],
  { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) }).toString().trim();
(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-029: transport report generated then downloaded
  const rep = await a.post('/api/delivery/transports/generate-report', { transportIds: [43, 41, 42] });
  R('029 generate-report', rep.status + ' ' + rep.text.slice(0, 300));
  const j = rep.json || {};
  const docId = j.documentId || (j.document && j.document.id) || j.id;
  R('029 docId', docId);
  if (docId) {
    const row = sql("select file_path from documents where id=" + docId);
    R('029 documents.file_path', row);
    const dl = await a.get('/api/documents/download/' + docId);
    R('029 download', dl.status + ' len=' + dl.text.length + ' ' + (dl.status !== 200 ? dl.text.slice(0, 160) : ''));
  }

  // --- BUG-053 server half: one valid + one invalid transport PATCH in parallel
  const b53 = await Promise.all([
    a.patch('/api/transports/42', { status: 'completed', completedDate: '2026-09-12' }),
    a.patch('/api/transports/999999999', { status: 'completed', completedDate: '2026-09-12' }),
  ]);
  R('053 parallel PATCH valid/invalid', b53.map(r => r.status).join(' / ') + ' :: ' + b53[1].text.slice(0, 120));
  R('053 transport 42 status in DB', sql('select status from vehicle_transports where id=42'));

  // --- BUG-055: driver assignment left open after reservation delete
  const v55 = await veh(a, 'DA');
  const r55 = await res(a, v55, '2026-09-01', '2027-05-05');
  sql("insert into reservation_driver_assignments (reservation_id, driver_id, assigned_from) values (" + r55 + ", null, now())");
  R('055 assignment before delete', sql("select id||' until='||coalesce(assigned_until::text,'NULL') from reservation_driver_assignments where reservation_id=" + r55));
  await a.post('/api/reservations/' + r55 + '/pickup', PU('P36A-DA-' + TS));
  const gen = await a.get('/api/contracts/generate/' + r55);
  R('055 contract generated', gen.status);
  const del = await a.del('/api/reservations/' + r55);
  R('055 DELETE reservation', del.status + ' ' + del.text.slice(0, 140));
  R('055 assignment after delete', sql("select id||' until='||coalesce(assigned_until::text,'NULL') from reservation_driver_assignments where reservation_id=" + r55));
  R('055 documents after delete', sql("select id||' stale='||is_stale from documents where reservation_id=" + r55));
  const docsApi = await a.get('/api/documents/reservation/' + r55);
  R('055 GET /api/documents/reservation/:id after delete', docsApi.status + ' n=' + (Array.isArray(docsApi.json) ? docsApi.json.length : docsApi.text.slice(0, 120)));

  // --- BUG-034 confirmation: vehicle with a block is excluded only for the blocked window
  const g4 = require('./a-g4-ids.json');
  const v34 = g4.b034.v34;
  const inBlock = await a.get('/api/vehicles/available?startDate=2026-10-01&endDate=2026-10-05');
  const outBlock = await a.get('/api/vehicles/available?startDate=2027-06-01&endDate=2027-06-05');
  const has = (r) => { const l = r.json && (Array.isArray(r.json) ? r.json : r.json.data || []); return l ? l.some(x => x.id === v34) : '?'; };
  R('034 vehicle ' + v34 + ' available during block window', has(inBlock));
  R('034 vehicle ' + v34 + ' available outside block window', has(outBlock));
  R('034 vehicles row', sql('select availability_status||\'/\'||maintenance_status from vehicles where id=' + v34));

  // --- BUG-045 double-check the debtor number decision surface
  R('045 duplicate debtorNumbers in DB', sql("select count(*) from (select debtor_number from customers where debtor_number is not null group by debtor_number having count(*)>1) x"));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

const { execFileSync } = require('child_process');
const { admin, veh, R } = require('./a-lib.cjs');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const sql = (q) => execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', 'lvs_regress', '-tAc', q],
  { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) }).toString().trim();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const a = await admin();
  const v = await veh(a, 'B34');
  R('034 initial', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  const blk = await a.post('/api/reservations', { vehicleId: v, type: 'maintenance_block', startDate: '2026-09-10', endDate: '2026-12-31' });
  R('034 block created (covers today)', blk.status + ' id=' + (blk.json && blk.json.id));
  R('034 t+0s', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  await wait(3000);
  R('034 t+3s', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  const av = await a.get('/api/vehicles/available?startDate=2026-09-15&endDate=2026-09-20');
  const l = av.json && (Array.isArray(av.json) ? av.json : av.json.data || []);
  R('034 in /api/vehicles/available during block', l ? l.some(x => x.id === v) : '?');
  await wait(20000);
  R('034 t+23s', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  // now delete the block and see whether the status is given back
  const del = await a.del('/api/reservations/' + blk.json.id);
  R('034 block deleted', del.status);
  R('034 after delete t+0s', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  await wait(3000);
  R('034 after delete t+3s', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

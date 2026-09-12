const { execFileSync } = require('child_process');
const { admin, veh, R } = require('./a-lib.cjs');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const sql = (q) => execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', 'lvs_regress', '-tAc', q],
  { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) }).toString().trim();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const a = await admin();
  // A) does a FUTURE maintenance block hide the vehicle from /api/vehicles/available? (B-01)
  const v = await veh(a, 'B34F');
  const blk = await a.post('/api/reservations', { vehicleId: v, type: 'maintenance_block', startDate: '2028-03-01', endDate: '2028-03-20' });
  R('034A future block', blk.status + ' id=' + (blk.json && blk.json.id));
  R('034A vehicle status', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v));
  const inWin = await a.get('/api/vehicles/available?startDate=2028-03-05&endDate=2028-03-10');
  const outWin = await a.get('/api/vehicles/available?startDate=2028-06-05&endDate=2028-06-10');
  const has = (r) => { const l = r.json && (Array.isArray(r.json) ? r.json : r.json.data || []); return l ? l.some(x => x.id === v) : '?'; };
  R('034A listed as available INSIDE the block window', has(inWin));
  R('034A listed as available OUTSIDE the block window', has(outWin));

  // B) does needs_fixing revert after the covering block is removed?
  const prev = require('fs').existsSync('a-g12-prev.json') ? require('./a-g12-prev.json') : null;
  const v2 = await veh(a, 'B34R');
  const blk2 = await a.post('/api/reservations', { vehicleId: v2, type: 'maintenance_block', startDate: '2026-09-10', endDate: '2026-12-31' });
  R('034B block covering today', blk2.status + ' id=' + blk2.json.id);
  await wait(35000);
  R('034B status after sync', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v2));
  await a.del('/api/reservations/' + blk2.json.id);
  R('034B block deleted', 'ok');
  await wait(35000);
  R('034B status 35s after delete', sql("select availability_status||'/'||maintenance_status from vehicles where id=" + v2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
(async () => {
  const s = await admin('c03');
  const ids = loadIds();
  // 123 detail
  let r = await s.post('/api/vehicles/bulk-import-plates', { licensePlates: ['', '   ', null, 12345, { licensePlate: 'x' }] });
  log('123 junk only', [r.status, JSON.stringify({ imported: (r.json.imported || []).map(x => x.licensePlate), failed: r.json.failed })]);
  // 124 csv date parsing
  r = await s.post('/api/vehicles/bulk-import-csv', { vehicles: [
    { licensePlate: 'P36C-CSV1', apkDate: '05-03-2027', companyDate: '31-12-2026', productionDate: '2020' },
    { licensePlate: 'P36C-CSV2', apkDate: '2026-02-30' },
  ] });
  log('124 csv import', [r.status, r.text.slice(0, 600)]);
  log('124 db', await q("select license_plate,apk_date,company_date,production_date from vehicles where license_plate like 'P36C-CSV%'"));
  // 125 regenerate collision
  const V = ids.vehicles['P36C-G'];
  r = await s.post('/api/vehicles/' + V + '/barcode/regenerate', {});
  log('125 regenerate #1', [r.status, r.text.slice(0, 200)]);
  const cur = (await q('select barcode from vehicles where id=$1', [V]))[0].barcode;
  log('125 barcode now', cur);
  const next = cur.match(/-R(\d+)$/) ? cur.replace(/-R(\d+)$/, (m, n) => '-R' + (Number(n) + 1)) : cur + '-R2';
  r = await s.patch('/api/vehicles/' + ids.vehicles['P36C-H'], { barcode: next });
  log('125 park next revision on other vehicle', [r.status, (await q('select barcode from vehicles where id=$1', [ids.vehicles['P36C-H']]))[0]]);
  r = await s.post('/api/vehicles/' + V + '/barcode/regenerate', {});
  log('125 regenerate #2 (expect 200 other free code, not 500)', [r.status, r.text.slice(0, 200)]);
  // 126 restore barcode collision
  r = await s.post('/api/vehicles', { licensePlate: 'P36C-DEL2', brand: 'AUDIT-P36C', model: 'Del2', vehicleType: 'Personenauto', chassisNumber: 'CHP36CDEL2' });
  const V2 = r.json.id; const bc = r.json.barcode;
  log('126 vehicle', [V2, bc]);
  r = await s.del('/api/vehicles/' + V2, { confirmLicensePlate: 'P36C-DEL2' });
  log('126 delete', [r.status, r.text.slice(0, 120)]);
  r = await s.post('/api/vehicles', { licensePlate: 'P36C-DEL2B', brand: 'AUDIT-P36C', model: 'Taker', vehicleType: 'Personenauto', chassisNumber: 'CHP36CDEL2B', barcode: bc });
  log('126 barcode taker create', [r.status, r.json && r.json.barcode]);
  const dr = await q("select id,label,entity_id from deleted_records where entity_type='vehicle' and restored_at is null order by id desc limit 5");
  log('126 deleted_records', dr);
  for (const row of dr) {
    if (row.entity_id === V2) {
      r = await s.post('/api/deleted-records/' + row.id + '/restore', {});
      log('126 restore with barcode taken (expect 409 BARCODE_TAKEN)', [r.status, r.text.slice(0, 300)]);
    }
  }
  // 147 audit rows
  log('147 vehicle.delete rows for V2', await q("select id,action,details->>'path' as path, (details ? 'cascaded') as cascaded from audit_logs where resource_type='vehicle' and resource_id=$1 order by id", [String(V2)]));
  await pool.end();
})();

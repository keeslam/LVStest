'use strict';
const { admin, q, pool, loadIds } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
(async () => {
  const s = await admin('c04');
  const ids = loadIds();
  // 125: create with barcode equal to another vehicle's LICENSE PLATE (the hijack)
  let r = await s.post('/api/vehicles', { licensePlate: 'P36C-BC2', brand: 'AUDIT-P36C', model: 'Bc2', vehicleType: 'Personenauto', chassisNumber: 'CHP36CBC2', barcode: 'P36C-A' });
  log('125 create barcode=other plate', [r.status, r.json && { id: r.json.id, barcode: r.json.barcode }, r.text.slice(0, 160)]);
  if (r.status === 201) {
    const look = await s.get('/api/barcodes/P36C-A');
    log('125 scan P36C-A resolves to', [look.status, look.json && (look.json.vehicle ? look.json.vehicle.id : look.json.id), look.text.slice(0, 150)]);
  }
  // 126: force a barcode collision at SQL level, then restore
  r = await s.post('/api/vehicles', { licensePlate: 'P36C-DEL3', brand: 'AUDIT-P36C', model: 'Del3', vehicleType: 'Personenauto', chassisNumber: 'CHP36CDEL3' });
  const V3 = r.json.id, bc = r.json.barcode;
  r = await s.del('/api/vehicles/' + V3, { confirmLicensePlate: 'P36C-DEL3' });
  log('126 delete V3', [V3, bc, r.status]);
  const other = ids.vehicles['P36C-H'];
  await q('update vehicles set barcode=$1 where id=$2', [bc, other]);
  log('126 parked barcode on vehicle', await q('select id,barcode from vehicles where id=$1', [other]));
  const dr = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 and restored_at is null order by id desc limit 1", [V3]);
  r = await s.post('/api/deleted-records/' + dr[0].id + '/restore', {});
  log('126 restore (expect 409 BARCODE_TAKEN, not 500)', [r.status, r.text.slice(0, 400)]);
  await q('update vehicles set barcode=$1 where id=$2', ['VEH-' + String(other).padStart(6, '0'), other]);
  await pool.end();
})();

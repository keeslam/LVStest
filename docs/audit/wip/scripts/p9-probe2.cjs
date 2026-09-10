'use strict';
const { getSession, log, excerpt, sql, pool } = require('./p9-lib.cjs');
(async () => {
  const A = await getSession('admin', 'admin', 'admin123');
  await sql('vehicle 1767', "select id, license_plate, length(license_plate) as len, brand, barcode from vehicles where id=1767");
  let r = await A.get('/api/vehicles/1767'); log('GET /api/vehicles/1767 ->', excerpt(r, 120));
  r = await A.get('/api/barcodes/VEH-001767'); log('GET /api/barcodes/VEH-001767 ->', r.status, r.json?.vehicle?.licensePlate === '' ? 'plate empty' : r.json?.vehicle?.licensePlate);
  r = await A.post('/api/vehicles/bulk-import-plates', { licensePlates: ['   '] }); log('bulk-import whitespace plate ->', excerpt(r, 200));
  r = await A.get('/api/vehicles/1762/delete-impact'); log('delete-impact V ->', excerpt(r, 200));
  await sql('V status now', 'select availability_status, maintenance_status from vehicles where id=1762');
  await sql('empty plates in db', "select count(*)::int as n from vehicles where trim(license_plate)=''");
  await sql('vehicles with client-settable barcode not matching VEH- pattern', "select id, license_plate, barcode from vehicles where barcode is not null and barcode !~ '^VEH-[0-9]{6,}(-R[0-9]+)?$' limit 5");
  await pool.end();
})();

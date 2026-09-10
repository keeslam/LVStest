'use strict';
const { getSession, log, excerpt, sql, pool } = require('./p9-lib.cjs');
const fs = require('fs'); const path = require('path');
(async () => {
  const A = await getSession('admin', 'admin', 'admin123');
  let r = await A.patch('/api/vehicles/1762', { availabilityStatus: 'available' });
  log('PATCH available ->', excerpt(r, 300));
  await sql('V', 'select availability_status, maintenance_status from vehicles where id=1762');
  await sql('reservations V', "select id, type, status, maintenance_status, start_date, end_date, deleted_at is not null as deleted from reservations where vehicle_id=1762 order by id");
  const docs = await sql('docs', 'select id, file_path from documents where vehicle_id=1762 order by id');
  for (const d of docs) { const abs = path.resolve('C:/Users/kees lam/Desktop/LVStest-main/audit-uploads', d.file_path); log(d.id, fs.existsSync(abs), abs); }
  await sql('fines cols', "select column_name, is_nullable, column_default from information_schema.columns where table_name='fines' and is_nullable='NO' and column_default is null");
  await sql('drivers required', "select column_name from information_schema.columns where table_name='drivers' and is_nullable='NO' and column_default is null");
  await sql('transports required', "select column_name from information_schema.columns where table_name='vehicle_transports' and is_nullable='NO' and column_default is null");
  await pool.end();
})();

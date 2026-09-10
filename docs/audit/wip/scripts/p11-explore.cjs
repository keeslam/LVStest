const { q, pool } = require('./db.cjs');
(async () => {
  console.log('cust179 rentals', await q("select id, vehicle_id, status, type, start_date, end_date, deleted_at from reservations where customer_id=179 and deleted_at is null order by id desc limit 15"));
  console.log('portal users 179', await q("select id, email, role, active, driver_id from portal_users where customer_id=179"));
  console.log('audit fixtures', await q("select id, license_plate, availability_status, maintenance_status from vehicles where license_plate like 'AU-%' order by id"));
  console.log('transports', await q("select count(*) from vehicle_transports"));
  console.log('tables', (await q("select table_name from information_schema.tables where table_schema='public' order by 1")).map(r=>r.table_name).join(','));
  console.log('vehicles cols', (await q("select column_name from information_schema.columns where table_name='vehicles' order by ordinal_position")).map(r=>r.column_name).join(','));
  console.log('res cols', (await q("select column_name from information_schema.columns where table_name='reservations' order by ordinal_position")).map(r=>r.column_name).join(','));
  console.log('sweep baseline');
  console.log('A dangling replacements', await q("select count(*) from reservations r left join reservations orig on orig.id=r.replacement_for_reservation_id where r.type='replacement' and r.deleted_at is null and (orig.id is null or orig.deleted_at is not null)"));
  console.log('B stale TBD placeholders', await q("select count(*) from reservations where type='replacement' and placeholder_spare=true and vehicle_id is null and deleted_at is null and end_date < current_date"));
  console.log('C in_service vehicles without active block', await q("select count(*) from vehicles v where v.maintenance_status in ('in_service','needs_fixing') and not exists (select 1 from reservations r where r.vehicle_id=v.id and r.type='maintenance_block' and r.deleted_at is null and coalesce(r.maintenance_status,'scheduled')<>'out')"));
  console.log('D out blocks with vehicle still in service', await q("select count(*) from reservations r join vehicles v on v.id=r.vehicle_id where r.type='maintenance_block' and r.maintenance_status='out' and r.deleted_at is null and v.maintenance_status in ('needs_fixing','in_service')"));
  console.log('E status outside machine', await q("select status, count(*) from reservations where deleted_at is null and status not in ('booked','picked_up','completed','cancelled','returned') group by 1"));
  console.log('F transports w/ spareReservation deleted', await q("select count(*) from vehicle_transports t join reservations r on r.id=t.spare_reservation_id where r.deleted_at is not null and t.status not in ('completed','cancelled')"));
  console.log('G transports whose vehicle is deleted', await q("select count(*) from vehicle_transports t left join vehicles v on v.id=t.vehicle_id where t.is_external_vehicle=false and v.id is null"));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

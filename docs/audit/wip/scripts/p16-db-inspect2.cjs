const { q, pool } = require('./db.cjs');
(async () => {
  console.log('docs contract/damage', JSON.stringify(await q("select id,document_type,file_name,file_path,reservation_id,vehicle_id from documents where (document_type ilike '%contract%' or document_type ilike '%damage%') and file_path is not null order by id desc limit 6")));
  console.log('picked_up 179', JSON.stringify(await q("select id,vehicle_id,customer_id,status,type,start_date,end_date from reservations where customer_id=179 and status='picked_up' and deleted_at is null and type='standard' order by id desc limit 5")));
  console.log('portal_requests 179', JSON.stringify(await q("select id,type,status,customer_id,portal_user_id,reservation_id,payload,submitted_by,submitter_email from portal_requests where customer_id=179 order by id desc limit 8"), null, 0));
  console.log('cols portal_requests', JSON.stringify((await q("select column_name from information_schema.columns where table_name='portal_requests' order by ordinal_position")).map(r=>r.column_name)));
  console.log('custom_notifications last', JSON.stringify(await q("select id,type,title,date from custom_notifications order by id desc limit 3")));
  console.log('portal_notifications last', JSON.stringify(await q("select id,customer_id,type,title,dedupe_tag,created_at from portal_notifications order by id desc limit 3")));
  console.log('customers with gps/other', JSON.stringify(await q("select id,name,email,preferred_language from customers where id in (1,3,179,1247)")));
  console.log('vehicle apk sample', JSON.stringify(await q("select v.id,v.license_plate,v.apk_date,r.customer_id from vehicles v join reservations r on r.vehicle_id=v.id and r.status='picked_up' and r.deleted_at is null where r.customer_id=179 limit 3")));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

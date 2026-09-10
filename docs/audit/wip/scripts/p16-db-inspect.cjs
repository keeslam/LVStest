const { q, pool } = require('./db.cjs');
(async () => {
  console.log('cols portal_users', JSON.stringify((await q("select column_name from information_schema.columns where table_name='portal_users' order by ordinal_position")).map(r=>r.column_name)));
  console.log('portal_users', JSON.stringify(await q('select * from portal_users order by id'), null, 1));
  console.log('customer 179', JSON.stringify(await q('select id,name,company_name,email,email_for_mot,email_for_invoices,email_general,contact_person,preferred_language from customers where id=179')));
  console.log('portal_customer_settings 179', JSON.stringify(await q('select * from portal_customer_settings where customer_id=179')));
  console.log('cols email_logs', JSON.stringify((await q("select column_name from information_schema.columns where table_name='email_logs' order by ordinal_position")).map(r=>r.column_name)));
  console.log('tables', JSON.stringify((await q("select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%portal%' or table_name ilike '%notif%' or table_name ilike '%mail%') order by 1")).map(r=>r.table_name)));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

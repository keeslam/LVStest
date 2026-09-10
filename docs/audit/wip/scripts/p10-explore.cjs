// P10 exploration: DB facts needed before designing the reservation tests.
'use strict';
const { q, pool } = require('./db.cjs');
(async () => {
  const out = {};
  out.now = await q(`select now() as now, current_date as today`);
  out.vehiclesAU = await q(`select id, license_plate, availability_status, current_mileage, company from vehicles where license_plate like 'AU-%' order by id desc limit 40`);
  out.customersAudit = await q(`select id, name from customers where name like 'AUDIT-%' order by id desc limit 20`);
  out.portalUser = await q(`select pu.id, pu.email, pu.customer_id, pu.role, pu.active, c.name from portal_users pu join customers c on c.id=pu.customer_id where pu.email='portaal-test@example.com'`);
  out.portalSettings = await q(`select * from portal_customer_settings where customer_id = 179`).catch(e => [String(e.message)]);
  out.resStatuses = await q(`select status, type, count(*) from reservations where deleted_at is null group by 1,2 order by 3 desc`);
  out.auditActions = await q(`select action, count(*) from audit_logs group by 1 order by 2 desc limit 30`);
  out.auditCols = await q(`select column_name from information_schema.columns where table_name='audit_logs' order by ordinal_position`);
  out.pnCols = await q(`select column_name from information_schema.columns where table_name='portal_notifications' order by ordinal_position`);
  out.notifCols = await q(`select column_name from information_schema.columns where table_name='notifications' order by ordinal_position`);
  out.docCols = await q(`select column_name from information_schema.columns where table_name='documents' order by ordinal_position`);
  out.transportCols = await q(`select column_name from information_schema.columns where table_name='vehicle_transports' order by ordinal_position`);
  out.drivers = await q(`select id, display_name, customer_id from drivers where customer_id = 179 limit 5`).catch(e => [String(e.message)]);
  out.pdfTemplates = await q(`select id, name, is_default from pdf_templates limit 5`).catch(e => [String(e.message)]);
  out.maxRes = await q(`select max(id) from reservations`);
  console.log(JSON.stringify(out, null, 1));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

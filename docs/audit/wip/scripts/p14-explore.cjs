// P14 exploration: DB state of templates, customers columns, users/permissions.
'use strict';
const { q, pool } = require('./db.cjs');
(async () => {
  const out = {};
  out.pdf_templates = await q(`select id, name, is_default, background_path, background_preview_path, left(fields::text, 300) as fields_head, length(fields::text) as fields_len, pg_typeof(fields)::text as fields_type from pdf_templates order by id`);
  out.transport_report_templates = await q(`select id, name, is_default, background_path, left(fields::text, 200) as fields_head, pg_typeof(fields)::text as ftype from transport_report_templates order by id`);
  out.damage_check_templates = await q(`select id, name, is_default, vehicle_make, vehicle_model, vehicle_type, background_path, jsonb_array_length(case when jsonb_typeof(canvas_fields)='array' then canvas_fields else '[]'::jsonb end) as n_canvas, pg_typeof(canvas_fields)::text as ctype from damage_check_templates order by id`);
  out.vehicle_diagram_templates = await q(`select id, make, model, diagram_path, object_storage_key from vehicle_diagram_templates order by id`);
  out.barcode_label_templates = await q(`select id, name, is_default from barcode_label_templates order by id`);
  out.customer_cols = await q(`select column_name, data_type from information_schema.columns where table_name='customers' order by ordinal_position`);
  out.customer_name_sample = await q(`select id, name, first_name, last_name from customers order by id desc limit 5`);
  out.customers_with_firstname = await q(`select count(*) filter (where first_name is not null) as with_first, count(*) as total from customers`);
  out.users = await q(`select id, username, role, permissions from users order by id`);
  out.app_settings = await q(`select id, category, key, left(value::text, 200) as v from app_settings order by id`);
  out.audit_reservations = await q(`select r.id, r.customer_id, r.vehicle_id, r.start_date, r.end_date, r.status, r.type, c.name from reservations r left join customers c on c.id=r.customer_id where c.name like 'AUDIT%' order by r.id desc limit 15`);
  out.transports = await q(`select id, vehicle_id, transport_type, status, spare_required, related_vehicle_id, left(notes,40) as notes from vehicle_transports order by id desc limit 8`);
  out.interactive_checks = await q(`select id, vehicle_id, reservation_id, check_type, check_date from interactive_damage_checks order by id desc limit 5`);
  out.docs_types = await q(`select document_type, count(*) from documents group by 1 order by 2 desc limit 15`);
  console.log(JSON.stringify(out, null, 1));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

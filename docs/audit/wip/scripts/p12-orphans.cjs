// Phase 12 - orphan scan for every reference-like column (read-only) against lvs_audit.
// Splits counts into pre-existing (created before 2026-09-09) vs audit-created rows where the table has a timestamp.
'use strict';
const { q, pool, url } = require('./db.cjs');
const AUDIT_START = '2026-09-09';

// table.column -> target table (heuristic map, see schema.ts). Multi-target columns handled separately.
const TARGETS = {
  vehicle_id: 'vehicles', related_vehicle_id: 'vehicles',
  customer_id: 'customers',
  reservation_id: 'reservations', spare_reservation_id: 'reservations', replacement_for_reservation_id: 'reservations',
  affected_rental_id: 'reservations', recurring_parent_id: 'reservations',
  driver_id: 'drivers',
  user_id: 'users', created_by_user_id: 'users', updated_by_user_id: 'users', deleted_by_user_id: 'users',
  assigned_staff_id: 'users', delivery_staff_id: 'users', assigned_by_user_id: 'users', created_by: 'users',
  portal_user_id: 'portal_users', assigned_by_portal_user_id: 'portal_users',
  request_id: 'portal_requests', portal_request_id: 'portal_requests',
  document_id: 'documents', license_document_id: 'documents',
  diagram_template_id: 'vehicle_diagram_templates',
  fine_id: 'fines', import_file_id: 'fine_import_files',
  replacement_for_transport_id: 'vehicle_transports',
};
const TEMPLATE_TARGETS = {
  template_backgrounds: 'pdf_templates',
  transport_report_template_backgrounds: 'transport_report_templates',
  damage_check_template_backgrounds: 'damage_check_templates',
};

async function tsColumn(table) {
  const c = await q(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('created_at','upload_date','deleted_at','scanned_at','sent_at','started_at','check_date','last_activity') `, [table]);
  const pref = ['created_at', 'upload_date', 'check_date', 'started_at', 'last_activity', 'deleted_at'];
  for (const p of pref) if (c.find(x => x.column_name === p)) return p;
  return null;
}

(async () => {
  if (!/lvs_audit$/.test(url)) throw new Error('refusing: not lvs_audit');
  const inv = require('./p12-fk-inventory.json');
  const results = [];
  for (const r of inv.refLike) {
    let target = TARGETS[r.column];
    if (r.column === 'template_id') target = TEMPLATE_TARGETS[r.table];
    if (r.column === 'entity_id') continue; // polymorphic, handled below
    if (r.column === 'created_by' && r.table !== 'vehicle_customer_blacklist') continue;
    if (!target) { results.push({ ...r, target: null, note: 'no target mapping' }); continue; }
    const ts = await tsColumn(r.table);
    const base = `from "${r.table}" s left join "${target}" t on t.id = s."${r.column}" where s."${r.column}" is not null and t.id is null`;
    const total = (await q(`select count(*)::int n ${base}`))[0].n;
    let pre = null, audit = null;
    if (ts) {
      pre = (await q(`select count(*)::int n ${base} and s."${ts}" < $1`, [AUDIT_START]))[0].n;
      audit = total - pre;
    }
    const sample = total ? await q(`select s.id, s."${r.column}" as ref ${base} order by s.id limit 8`) : [];
    // soft-deleted targets
    let softDeleted = null, softSample = [];
    if (target === 'reservations') {
      const sd = `from "${r.table}" s join reservations t on t.id = s."${r.column}" where t.deleted_at is not null`;
      softDeleted = (await q(`select count(*)::int n ${sd}`))[0].n;
      softSample = softDeleted ? await q(`select s.id, s."${r.column}" as ref ${sd} order by s.id limit 5`) : [];
    }
    if (target === 'vehicles' || target === 'fines') {
      const et = target === 'vehicles' ? 'vehicle' : 'fine';
      const sd = `from "${r.table}" s join deleted_records d on d.entity_type='${et}' and d.entity_id = s."${r.column}" and d.restored_at is null left join "${target}" t on t.id = s."${r.column}" where t.id is null`;
      softDeleted = (await q(`select count(*)::int n ${sd}`))[0].n;
      softSample = softDeleted ? await q(`select s.id, s."${r.column}" as ref ${sd} order by s.id limit 5`) : [];
    }
    results.push({ table: r.table, column: r.column, target, hasFk: r.hasFk, nullable: r.nullable, orphans: total, orphansPre: pre, orphansAudit: audit, sample, inRecycleBinOrSoftDeleted: softDeleted, softSample });
  }

  // text actor columns (created_by/updated_by/deleted_by store usernames)
  const textActors = await q(`select table_name, column_name from information_schema.columns where table_schema='public' and data_type='text' and column_name in ('created_by','updated_by','deleted_by','restored_by','handled_by','replied_by','linked_by','scanned_by','assigned_staff_name') order by 1,2`);
  const actorResults = [];
  for (const c of textActors) {
    const r = await q(`select count(*)::int n, count(distinct s."${c.column_name}")::int d from "${c.table_name}" s left join users u on u.username = s."${c.column_name}" where s."${c.column_name}" is not null and s."${c.column_name}" <> '' and u.id is null`);
    const sample = r[0].n ? await q(`select distinct s."${c.column_name}" v from "${c.table_name}" s left join users u on u.username = s."${c.column_name}" where s."${c.column_name}" is not null and u.id is null limit 6`) : [];
    actorResults.push({ table: c.table_name, column: c.column_name, rowsWithUnknownUser: r[0].n, distinctValues: r[0].d, sample: sample.map(x => x.v) });
  }

  // polymorphic
  const poly = {};
  poly.deleted_records_types = await q(`select entity_type, count(*)::int n, count(restored_at)::int restored from deleted_records group by 1`);
  poly.deleted_records_id_reused = await q(`
    select d.id as deleted_record_id, d.entity_type, d.entity_id, d.deleted_at, d.restored_at, v.license_plate as current_plate, d.label
    from deleted_records d join vehicles v on v.id = d.entity_id where d.entity_type='vehicle' order by d.id`);
  poly.deleted_records_reservation_ids_reused = await q(`
    select d.id as deleted_record_id, d.entity_id as vehicle_id, d.restored_at, jsonb_array_length(d.payload->'reservations') as snap_res,
      (select count(*) from reservations r where r.id in (select (x->>'id')::int from jsonb_array_elements(d.payload->'reservations') x)) as ids_now_existing,
      (select count(*) from reservations r where r.id in (select (x->>'id')::int from jsonb_array_elements(d.payload->'reservations') x) and r.vehicle_id <> d.entity_id) as ids_now_other_vehicle
    from deleted_records d where d.entity_type='vehicle' and jsonb_typeof(d.payload->'reservations')='array' order by d.id`);
  poly.deleted_records_document_ids_reused = await q(`
    select d.id as deleted_record_id, d.entity_id as vehicle_id, d.restored_at, jsonb_array_length(d.payload->'documents') as snap_docs,
      (select count(*) from documents x where x.id in (select (y->>'id')::int from jsonb_array_elements(d.payload->'documents') y)) as ids_now_existing
    from deleted_records d where d.entity_type='vehicle' and jsonb_typeof(d.payload->'documents')='array' and jsonb_array_length(d.payload->'documents')>0 order by d.id`);
  poly.deleted_records_snapshot_refs = await q(`
    select d.id as deleted_record_id, d.entity_id as vehicle_id, d.restored_at,
      (select count(*) from jsonb_array_elements(d.payload->'reservations') x left join customers c on c.id = (x->>'customerId')::int where (x->>'customerId') is not null and c.id is null) as res_customer_missing,
      (select count(*) from jsonb_array_elements(d.payload->'reservations') x left join reservations rr on rr.id = (x->>'replacementForReservationId')::int where (x->>'replacementForReservationId') is not null and rr.id is null) as res_replacement_missing
    from deleted_records d where d.entity_type='vehicle' and jsonb_typeof(d.payload->'reservations')='array' order by d.id`);
  poly.portal_activity_entity = await q(`select entity, count(*)::int n from portal_activity_log where entity_id is not null group by 1`);
  poly.portal_activity_orphans = await q(`
    select l.entity, count(*)::int n, min(l.entity_id) sample_id from portal_activity_log l
    where l.entity_id is not null and (
      (l.entity='reservation' and not exists (select 1 from reservations r where r.id=l.entity_id)) or
      (l.entity='request' and not exists (select 1 from portal_requests r where r.id=l.entity_id)) or
      (l.entity='portal_request' and not exists (select 1 from portal_requests r where r.id=l.entity_id)) or
      (l.entity='vehicle' and not exists (select 1 from vehicles r where r.id=l.entity_id)) or
      (l.entity='document' and not exists (select 1 from documents r where r.id=l.entity_id)) or
      (l.entity='fine' and not exists (select 1 from fines r where r.id=l.entity_id)) or
      (l.entity='driver' and not exists (select 1 from drivers r where r.id=l.entity_id)) or
      (l.entity='portal_user' and not exists (select 1 from portal_users r where r.id=l.entity_id)) or
      (l.entity='user' and not exists (select 1 from portal_users r where r.id=l.entity_id))
    ) group by 1`);
  poly.audit_logs_entity = await q(`select resource_type, count(*)::int n from audit_logs group by 1 order by 2 desc`);
  poly.audit_logs_resource_orphans = await q(`
    select a.resource_type, count(*)::int n, min(a.resource_id) sample from audit_logs a
    where a.resource_id ~ '^[0-9]+$' and (
      (a.resource_type='reservation' and not exists (select 1 from reservations r where r.id=a.resource_id::int)) or
      (a.resource_type='vehicle' and not exists (select 1 from vehicles r where r.id=a.resource_id::int)) or
      (a.resource_type='customer' and not exists (select 1 from customers r where r.id=a.resource_id::int)) or
      (a.resource_type='document' and not exists (select 1 from documents r where r.id=a.resource_id::int)) or
      (a.resource_type='user' and not exists (select 1 from users r where r.id=a.resource_id::int)) or
      (a.resource_type='expense' and not exists (select 1 from expenses r where r.id=a.resource_id::int)) or
      (a.resource_type='fine' and not exists (select 1 from fines r where r.id=a.resource_id::int))
    ) group by 1 order by 2 desc`);
  poly.audit_log_cols = await q(`select column_name, data_type from information_schema.columns where table_name='audit_logs' order by ordinal_position`);
  poly.email_logs_vehicle_ids_missing = await q(`select count(*)::int n from email_logs e, jsonb_array_elements_text(e.vehicle_ids) v left join vehicles ve on ve.id = v::int where ve.id is null`);
  poly.custom_notifications_cols = await q(`select column_name from information_schema.columns where table_name='custom_notifications' order by ordinal_position`);
  poly.session_table = await q(`select count(*)::int n, count(*) filter (where expire < now())::int expired from session`);
  poly.session_user_ids = await q(`
    select count(*)::int n from session s where (s.sess->'passport'->>'user') is not null and not exists (select 1 from users u where u.id = (s.sess->'passport'->>'user')::int)`);
  poly.session_shape = await q(`select sid, expire, (sess->'passport'->>'user') as passport_user, (sess->>'portalUserId') as portal_user from session limit 12`);
  poly.session_portal_user_ids = await q(`select count(*)::int n from session s where (s.sess->>'portalUserId') is not null and not exists (select 1 from portal_users u where u.id = (s.sess->>'portalUserId')::int)`);
  poly.active_sessions_vs_session = await q(`
    select count(*)::int total, count(*) filter (where not exists (select 1 from session x where x.sid = a.session_id))::int without_session_row,
      count(*) filter (where a.expires_at > now())::int unexpired,
      count(*) filter (where a.expires_at > now() and not exists (select 1 from session x where x.sid = a.session_id))::int unexpired_without_session_row
    from active_sessions a`);
  poly.active_sessions_cols = await q(`select column_name from information_schema.columns where table_name='active_sessions' order by ordinal_position`);

  const out = { auditStart: AUDIT_START, refColumns: results, textActors: actorResults, polymorphic: poly };
  require('fs').writeFileSync(__dirname + '/p12-orphans.json', JSON.stringify(out, null, 2));
  for (const r of results) if (r.orphans || r.inRecycleBinOrSoftDeleted) console.log(`${r.table}.${r.column} -> ${r.target} fk=${r.hasFk} orphans=${r.orphans} (pre=${r.orphansPre}, audit=${r.orphansAudit}) softDeletedTarget=${r.inRecycleBinOrSoftDeleted} sample=${JSON.stringify(r.sample.slice(0, 5))}`);
  console.log('--- text actor columns with unknown usernames ---');
  for (const a of actorResults) if (a.rowsWithUnknownUser) console.log(`${a.table}.${a.column}: ${a.rowsWithUnknownUser} rows, ${a.distinctValues} distinct ${JSON.stringify(a.sample)}`);
  console.log('--- polymorphic ---');
  console.log(JSON.stringify(poly, null, 1));
  await pool.end();
})().catch(e => { console.error('ERR', e); process.exit(1); });

// Phase 12: merge the three read-only scans into p12-scan.json and derive the
// pre-existing (clone) vs audit-created splits used in the report.
'use strict';
const fs = require('fs');
const path = require('path');
const { q, pool } = require('./db.cjs');
const AUDIT_START = '2026-09-09';
const inv = require('./p12-fk-inventory.json');
const orph = require('./p12-orphans.json');
const scan2 = require('./p12-scan2.json');

(async () => {
  const S = {};
  // double bookings: pre-existing pairs vs audit pairs
  S.doubleBookings = await q(`
    select count(*)::int pairs, count(*) filter (where a.created_at < '${AUDIT_START}' and b.created_at < '${AUDIT_START}')::int pre_pairs,
      count(distinct a.vehicle_id)::int vehicles, count(distinct a.vehicle_id) filter (where a.created_at < '${AUDIT_START}' and b.created_at < '${AUDIT_START}')::int pre_vehicles,
      array_agg(a.id||'/'||b.id) filter (where a.created_at < '${AUDIT_START}' and b.created_at < '${AUDIT_START}') pre_pairs_list
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id
    where a.deleted_at is null and b.deleted_at is null and a.vehicle_id is not null
      and a.type<>'maintenance_block' and b.type<>'maintenance_block'
      and a.status in ('booked','picked_up','active','pending') and b.status in ('booked','picked_up','active','pending')
      and a.start_date < coalesce(b.end_date,'9999-12-31') and b.start_date < coalesce(a.end_date,'9999-12-31')`);
  S.doubleBookingsPreDetail = await q(`
    select a.vehicle_id, a.id a_id, a.start_date a_start, a.end_date a_end, a.status a_status, b.id b_id, b.start_date b_start, b.end_date b_end, b.status b_status
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id
    where a.deleted_at is null and b.deleted_at is null and a.vehicle_id is not null
      and a.type<>'maintenance_block' and b.type<>'maintenance_block'
      and a.status in ('booked','picked_up','active','pending') and b.status in ('booked','picked_up','active','pending')
      and a.start_date < coalesce(b.end_date,'9999-12-31') and b.start_date < coalesce(a.end_date,'9999-12-31')
      and a.created_at < '${AUDIT_START}' and b.created_at < '${AUDIT_START}' order by a.vehicle_id, a.id`);
  S.maintenanceOverlaps = await q(`
    select count(*)::int pairs, count(*) filter (where a.created_at < '${AUDIT_START}' and b.created_at < '${AUDIT_START}')::int pre_pairs, count(distinct a.vehicle_id)::int vehicles,
      count(*) filter (where exists (select 1 from vehicles v where v.id=a.vehicle_id))::int pairs_on_existing_vehicle
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id
    where a.deleted_at is null and b.deleted_at is null and a.type='maintenance_block' and b.type='maintenance_block'
      and a.status not in ('cancelled','completed') and b.status not in ('cancelled','completed')
      and a.start_date <= coalesce(b.end_date,'9999-12-31') and b.start_date <= coalesce(a.end_date,'9999-12-31')`);
  S.orphanBlocksOnMissingVehicles = await q(`
    select count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre, count(distinct vehicle_id)::int vehicles, min(created_at) first_created, max(created_at) last_created,
      count(*) filter (where status='active')::int active, array_agg(distinct status) statuses, array_agg(distinct coalesce(created_by,'<null>')) created_by
    from reservations r where deleted_at is null and vehicle_id is not null and not exists (select 1 from vehicles v where v.id=r.vehicle_id)`);
  S.orphanBlocksVisibleInCalendar = await q(`
    select count(*)::int n from reservations r where deleted_at is null and vehicle_id is not null and type='maintenance_block' and status='active' and start_date >= current_date::text and not exists (select 1 from vehicles v where v.id=r.vehicle_id)`);
  S.statusOutsideEnum = await q(`
    select status, type, count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre from reservations where deleted_at is null and status not in ('booked','picked_up','returned','completed','cancelled') group by 1,2 order by 3 desc`);
  S.statusOutsideEnumTotals = await q(`
    select count(*)::int live, count(*) filter (where created_at < '${AUDIT_START}')::int pre from reservations where deleted_at is null and status not in ('booked','picked_up','returned','completed','cancelled')`);
  S.vehicleStatusOutsideEnum = await q(`select availability_status, count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre from vehicles where availability_status not in ('available','needs_fixing','not_for_rental','rented') group by 1`);
  S.pickedUpStale = await q(`
    select count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre, count(*) filter (where actual_pickup_date is null)::int no_actual_pickup, count(*) filter (where start_date > current_date::text)::int start_in_future
    from reservations where deleted_at is null and status='picked_up' and end_date is not null and end_date <> 'undefined' and end_date < current_date::text`);
  S.pickedUpFuture = await q(`select count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre from reservations where deleted_at is null and status='picked_up' and start_date > current_date::text`);
  S.contractCollisions = await q(`select ltrim(trim(contract_number),'0') k, array_agg(id order by id) ids, array_agg(contract_number order by id) raw, bool_and(created_at < '${AUDIT_START}') all_pre from reservations where contract_number is not null and deleted_at is null group by 1 having count(*)>1`);
  S.contractNumberShapes = await q(`select count(*) filter (where contract_number ~ '^0')::int leading_zero, count(*) filter (where contract_number !~ '^[0-9]+$')::int non_numeric, count(*)::int total from reservations where contract_number is not null`);
  S.plateDuplicates = await q(`select upper(regexp_replace(license_plate,'[^A-Za-z0-9]','','g')) k, array_agg(id order by id) ids, array_agg(license_plate order by id) plates, bool_and(created_at < '${AUDIT_START}') all_pre from vehicles group by 1 having count(*)>1`);
  S.customerDuplicates = await q(`select lower(trim(email)) k, array_agg(id) ids, bool_and(created_at < '${AUDIT_START}') all_pre from customers where email is not null and trim(email)<>'' group by 1 having count(*)>1`);
  S.debtorDuplicates = await q(`select trim(debtor_number) k, array_agg(id) ids, bool_and(created_at < '${AUDIT_START}') all_pre from customers where debtor_number is not null and trim(debtor_number)<>'' group by 1 having count(*)>1`);
  S.docsSameFile = await q(`select count(*)::int groups, sum(n-1)::int extra_rows, count(*) filter (where all_pre)::int pre_groups from (select file_path, count(*) n, bool_and(upload_date < '${AUDIT_START}') all_pre from documents group by 1 having count(*)>1) x`);
  S.docsOrphanReservation = await q(`select count(*)::int n, count(*) filter (where upload_date < '${AUDIT_START}')::int pre from documents d where reservation_id is not null and not exists (select 1 from reservations r where r.id=d.reservation_id)`);
  S.docsSoftDeletedReservation = await q(`select count(*)::int n, count(*) filter (where d.upload_date < '${AUDIT_START}')::int pre from documents d join reservations r on r.id=d.reservation_id where r.deleted_at is not null`);
  S.activeSessions = await q(`select count(*)::int total, count(*) filter (where created_at < '${AUDIT_START}')::int pre, count(distinct user_id)::int users, min(created_at) oldest, count(*) filter (where expires_at > now())::int unexpired, count(*) filter (where not exists (select 1 from session s where s.sid=a.session_id))::int no_store_row from active_sessions a`);
  S.sessionStore = await q(`select count(*)::int rows, count(*) filter (where expire < now())::int expired from session`);
  S.notificationsStale = await q(`
    select count(*)::int n, count(*) filter (where n.created_at < '${AUDIT_START}')::int pre, count(*) filter (where p.id is null)::int placeholder_missing, count(*) filter (where p.deleted_at is not null)::int placeholder_deleted, count(*) filter (where p.vehicle_id is not null)::int placeholder_assigned
    from custom_notifications n left join reservations p on p.id = nullif(substring(n.description from '\\[placeholder:(\\d+)\\]'),'')::int
    where n.type='spare_assignment' and (p.id is null or p.deleted_at is not null or p.vehicle_id is not null or not p.placeholder_spare)`);
  S.notificationsTotal = await q(`select count(*)::int n, count(*) filter (where not is_read)::int unread from custom_notifications where type='spare_assignment'`);
  S.auditLogOrphans = await q(`select resource_type, count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre from audit_logs a where a.resource_id ~ '^[0-9]+$' and (
      (a.resource_type='reservation' and not exists (select 1 from reservations r where r.id=a.resource_id::int)) or
      (a.resource_type='vehicle' and not exists (select 1 from vehicles r where r.id=a.resource_id::int)) or
      (a.resource_type='customer' and not exists (select 1 from customers r where r.id=a.resource_id::int)) or
      (a.resource_type='fine' and not exists (select 1 from fines r where r.id=a.resource_id::int))) group by 1 order by 2 desc`);
  S.expensesOrphan = await q(`select count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre from expenses e where not exists (select 1 from vehicles v where v.id=e.vehicle_id)`);
  S.placeholdersStale = await q(`select id, replacement_for_reservation_id, replacement_for_transport_id, end_date, (created_at < '${AUDIT_START}') pre from reservations where placeholder_spare and vehicle_id is null and deleted_at is null and end_date is not null and end_date < current_date::text order by id`);
  S.endBeforeStart = await q(`select id, type, status, start_date, end_date, (created_at < '${AUDIT_START}') pre from reservations where end_date is not null and end_date <> 'undefined' and end_date < start_date order by id`);
  S.nonIsoDates = await q(`select id, start_date, end_date, status, (created_at < '${AUDIT_START}') pre from reservations where end_date = 'undefined' or start_date !~ '^\\d{4}-\\d{2}-\\d{2}$' or (end_date is not null and end_date !~ '^\\d{4}-\\d{2}-\\d{2}$') order by id`);
  S.transportsSameDayHole = await q(`
    select s.id spare_res, s.vehicle_id, s.start_date, o.id other_res, o.start_date o_start, o.end_date o_end, o.status o_status, o.type o_type
    from reservations s join reservations o on o.vehicle_id=s.vehicle_id and o.id<>s.id and o.deleted_at is null and o.type<>'maintenance_block' and o.status in ('booked','picked_up','active','pending')
    where s.replacement_for_transport_id is not null and s.deleted_at is null and s.status in ('booked','picked_up') and s.vehicle_id is not null
      and o.start_date <= s.start_date and coalesce(o.end_date,'9999-12-31') >= s.start_date order by s.id`);
  S.rowCounts = inv.counts;
  S.tables = inv.tables.length;
  S.fkCount = inv.fks.length;
  S.refLikeNoFk = inv.refLike.filter(r => !r.hasFk).map(r => r.table + '.' + r.column);
  const out = { generatedAt: new Date().toISOString(), auditStart: AUDIT_START, database: 'lvs_audit', inventory: inv, orphans: orph, scan2, summary: S };
  fs.writeFileSync(path.join(__dirname, 'p12-scan.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(S, null, 1));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

// Phase 12 - duplicates, status/enum, stale-state, files-vs-documents, app-only uniqueness (read-only) against lvs_audit.
'use strict';
const fs = require('fs');
const path = require('path');
const { q, pool, url } = require('./db.cjs');
const AUDIT_START = '2026-09-09';
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const AUDIT_UPLOADS = path.resolve(REPO, '..', 'audit-uploads');
const REPO_UPLOADS = path.join(REPO, 'uploads');

async function dup(label, sql) {
  const rows = await q(sql);
  return { label, groups: rows.length, extraRows: rows.reduce((a, r) => a + (Number(r.n) - 1), 0), sample: rows.slice(0, 8) };
}

(async () => {
  if (!/lvs_audit$/.test(url)) throw new Error('refusing: not lvs_audit');
  const out = { auditStart: AUDIT_START };

  // ---------- duplicates ----------
  out.duplicates = [];
  const D = out.duplicates;
  D.push(await dup('vehicles by normalised plate', `select upper(regexp_replace(license_plate,'[^A-Za-z0-9]','','g')) k, count(*)::int n, array_agg(id order by id) ids, array_agg(license_plate order by id) plates, bool_or(created_at >= '${AUDIT_START}') has_audit_row from vehicles group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('vehicles by chassis_number', `select chassis_number k, count(*)::int n, array_agg(id order by id) ids from vehicles where chassis_number is not null and trim(chassis_number)<>'' group by 1 having count(*)>1`));
  D.push(await dup('customers by lower(trim(name))', `select lower(trim(name)) k, count(*)::int n, array_agg(id order by id) ids, bool_or(created_at >= '${AUDIT_START}') has_audit_row from customers group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('customers by lower(email)', `select lower(trim(email)) k, count(*)::int n, array_agg(id order by id) ids, bool_or(created_at >= '${AUDIT_START}') has_audit_row from customers where email is not null and trim(email)<>'' group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('customers by debtor_number', `select trim(debtor_number) k, count(*)::int n, array_agg(id order by id) ids, bool_or(created_at >= '${AUDIT_START}') has_audit_row from customers where debtor_number is not null and trim(debtor_number)<>'' group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('reservations real double bookings (same vehicle, live rental rows, multi-day overlap, excl. maintenance blocks and same-day turnover)', `
    select a.vehicle_id k, count(*)::int n, array_agg(a.id||'/'||b.id) pairs, array_agg(a.start_date||'..'||coalesce(a.end_date,'open')||' vs '||b.start_date||'..'||coalesce(b.end_date,'open')) periods,
      bool_or(a.created_at >= '${AUDIT_START}' or b.created_at >= '${AUDIT_START}') has_audit_row
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id
    where a.deleted_at is null and b.deleted_at is null and a.vehicle_id is not null
      and a.type<>'maintenance_block' and b.type<>'maintenance_block'
      and a.status in ('booked','picked_up','active','pending') and b.status in ('booked','picked_up','active','pending')
      and a.start_date < coalesce(b.end_date,'9999-12-31') and b.start_date < coalesce(a.end_date,'9999-12-31')
    group by 1 order by n desc`));
  D.push(await dup('reservations same-day-turnover overlaps only (end = other start)', `
    select a.vehicle_id k, count(*)::int n, array_agg(a.id||'/'||b.id) pairs
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id<>a.id
    where a.deleted_at is null and b.deleted_at is null and a.vehicle_id is not null
      and a.type<>'maintenance_block' and b.type<>'maintenance_block'
      and a.status in ('booked','picked_up','active','pending') and b.status in ('booked','picked_up','active','pending')
      and a.end_date = b.start_date
    group by 1 order by n desc`));
  D.push(await dup('maintenance blocks duplicated (same vehicle, same start+end, both live)', `
    select vehicle_id||'|'||start_date||'|'||coalesce(end_date,'open') k, count(*)::int n, array_agg(id order by id) ids, bool_or(created_at >= '${AUDIT_START}') has_audit_row, bool_and(exists(select 1 from vehicles v where v.id=reservations.vehicle_id)) vehicle_exists
    from reservations where type='maintenance_block' and deleted_at is null and status not in ('cancelled','completed') group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('maintenance blocks overlapping on same vehicle (live)', `
    select a.vehicle_id k, count(*)::int n, array_agg(a.id||'/'||b.id) pairs
    from reservations a join reservations b on b.vehicle_id=a.vehicle_id and b.id>a.id
    where a.deleted_at is null and b.deleted_at is null and a.type='maintenance_block' and b.type='maintenance_block'
      and a.status not in ('cancelled','completed') and b.status not in ('cancelled','completed')
      and a.start_date <= coalesce(b.end_date,'9999-12-31') and b.start_date <= coalesce(a.end_date,'9999-12-31')
    group by 1 order by n desc`));
  D.push(await dup('contract numbers colliding after trim/leading-zero strip (live rows)', `select ltrim(trim(contract_number),'0') k, count(*)::int n, array_agg(id) ids, array_agg(contract_number) raw from reservations where contract_number is not null and deleted_at is null group by 1 having count(*)>1`));
  D.push(await dup('contract numbers still set on soft-deleted reservations', `select contract_number k, 1::int n, array_agg(id) ids from reservations where deleted_at is not null and contract_number is not null group by 1`));
  D.push(await dup('documents same file_path (BUG-027)', `select file_path k, count(*)::int n, array_agg(id order by id) ids, array_agg(document_type) types, bool_or(upload_date >= '${AUDIT_START}') has_audit_row from documents group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('documents same (vehicle, reservation, type)', `select coalesce(vehicle_id::text,'-')||'|'||coalesce(reservation_id::text,'-')||'|'||document_type k, count(*)::int n, array_agg(id order by id) ids, bool_or(upload_date >= '${AUDIT_START}') has_audit_row from documents where reservation_id is not null group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('placeholder spares per original reservation (live)', `select replacement_for_reservation_id k, count(*)::int n, array_agg(id order by id) ids, bool_or(created_at >= '${AUDIT_START}') has_audit_row from reservations where type='replacement' and placeholder_spare and deleted_at is null group by 1 having count(*)>1`));
  D.push(await dup('live replacement reservations per original reservation (BUG-032)', `select replacement_for_reservation_id k, count(*)::int n, array_agg(id order by id) ids, array_agg(coalesce(vehicle_id::text,'TBD')) vehicles, array_agg(status) statuses, bool_or(created_at >= '${AUDIT_START}') has_audit_row from reservations where type='replacement' and deleted_at is null and status in ('booked','picked_up','active','pending') and replacement_for_reservation_id is not null group by 1 having count(*)>1 order by n desc`));
  D.push(await dup('users by lower(username)', `select lower(username) k, count(*)::int n, array_agg(id) ids from users group by 1 having count(*)>1`));
  D.push(await dup('users by lower(email)', `select lower(email) k, count(*)::int n, array_agg(id) ids from users where email is not null and email<>'' group by 1 having count(*)>1`));
  D.push(await dup('portal_users by lower(email)', `select lower(email) k, count(*)::int n, array_agg(id) ids from portal_users group by 1 having count(*)>1`));
  D.push(await dup('drivers by customer+lower(email)', `select customer_id||'|'||lower(email) k, count(*)::int n, array_agg(id) ids from drivers where email is not null and email<>'' group by 1 having count(*)>1`));
  D.push(await dup('drivers by license number', `select driver_license_number k, count(*)::int n, array_agg(id) ids from drivers where driver_license_number is not null and driver_license_number<>'' group by 1 having count(*)>1`));
  D.push(await dup('app_settings keys', `select key k, count(*)::int n, array_agg(id) ids from app_settings group by 1 having count(*)>1`));
  D.push(await dup('pdf_templates is_default=true count', `select 'default' k, count(*)::int n, array_agg(id) ids from pdf_templates where is_default group by 1 having count(*)>1`));
  D.push(await dup('transports per reservation_id (syncDeliveryTransport assumes one)', `select reservation_id k, count(*)::int n, array_agg(id) ids, array_agg(status) statuses from vehicle_transports where reservation_id is not null group by 1 having count(*)>1`));
  D.push(await dup('fines by plate+offence_at', `select license_plate||'|'||offence_at k, count(*)::int n, array_agg(id) ids from fines group by 1 having count(*)>1`));
  D.push(await dup('interactive_damage_checks per reservation+type (unique idx present)', `select reservation_id||'|'||check_type k, count(*)::int n, array_agg(id) ids from interactive_damage_checks where reservation_id is not null group by 1 having count(*)>1`));
  D.push(await dup('custom_notifications spare_assignment per placeholder', `select substring(description from '\\[placeholder:(\\d+)\\]') k, count(*)::int n, array_agg(id) ids from custom_notifications where type='spare_assignment' group by 1 having count(*)>1`));
  D.push(await dup('audit_logs duplicate rows same action/resource within 2s (double audit rows)', `select a.action||'|'||coalesce(a.resource_id,'') k, count(*)::int n, array_agg(a.id) ids from audit_logs a join audit_logs b on b.action=a.action and b.resource_id is not distinct from a.resource_id and b.id>a.id and b.created_at - a.created_at < interval '2 seconds' where a.action in ('vehicle.delete','reservation.delete','fine.create','fine.update','fine.delete') group by 1 order by n desc limit 30`));

  // ---------- status / enum ----------
  const statusCols = [
    ['reservations', 'status', ['booked', 'picked_up', 'returned', 'completed', 'cancelled'], 'shared/schema.ts:26-31,42-48 (ReservationStatus + VALID_RESERVATION_TRANSITIONS)'],
    ['reservations', 'type', ['standard', 'replacement', 'maintenance_block'], 'shared/schema.ts:828'],
    ['reservations', 'spare_vehicle_status', ['assigned', 'ready', 'picked_up', 'returned', 'cancelled'], 'shared/schema.ts:34-39,51-57'],
    ['reservations', 'maintenance_status', ['scheduled', 'in', 'out'], 'shared/schema.ts:744 comment'],
    ['reservations', 'maintenance_category', ['scheduled_maintenance', 'repair'], 'shared/schema.ts:745 comment'],
    ['reservations', 'spare_assignment_decision', ['spare_assigned', 'customer_arranging', 'not_handled'], 'shared/schema.ts:746 comment'],
    ['reservations', 'delivery_status', ['pending', 'scheduled', 'en_route', 'delivered', 'completed'], 'shared/schema.ts:775 comment'],
    ['reservations', 'fuel_level_pickup', ['empty', '1/4', '1/2', '3/4', 'full'], 'shared/schema.ts:752 comment'],
    ['reservations', 'fuel_level_return', ['empty', '1/4', '1/2', '3/4', 'full'], 'shared/schema.ts:753 comment'],
    ['vehicles', 'availability_status', ['available', 'needs_fixing', 'not_for_rental', 'rented'], 'shared/schema.ts:18-23 (helper adds scheduled)'],
    ['vehicles', 'maintenance_status', ['ok', 'needs_service', 'in_service'], 'shared/schema.ts:229 comment'],
    ['vehicles', 'current_fuel_level', ['empty', '1/4', '1/2', '3/4', 'full'], 'schema comment'],
    ['vehicle_transports', 'status', ['scheduled', 'in_progress', 'completed', 'cancelled'], 'shared/schema.ts:1603'],
    ['vehicle_transports', 'transport_type', ['swap', 'tow', 'repossession', 'delivery', 'other'], 'shared/schema.ts:1602'],
    ['portal_requests', 'status', ['new', 'in_progress', 'done', 'rejected'], 'shared/portal-types.ts'],
    ['portal_requests', 'type', ['booking', 'extension', 'early_return', 'maintenance', 'maintenance_change', 'question', 'fine', 'damage', 'other'], 'shared/portal-types.ts (see report)'],
    ['fines', 'status', ['new', 'linked', 'charged', 'paid', 'disputed', 'cancelled'], 'shared/fines.ts:1-3'],
    ['delivery_tasks', 'status', ['scheduled', 'en_route_delivery', 'delivered', 'en_route_pickup', 'completed', 'cancelled'], 'shared/schema.ts:1516'],
    ['drivers', 'status', ['active', 'inactive', 'blocked'], 'schema'],
    ['customers', 'status', null, 'free text?'],
    ['apk_date_changes', 'status', ['pending', 'confirmed', 'dismissed'], 'schema comment'],
    ['portal_users', 'role', ['admin', 'driver'], 'PortalUserRole'],
    ['users', 'role', null, 'free text'],
    ['audit_logs', 'status', ['success', 'failure'], 'auditLogger'],
    ['scan_events', 'match_type', ['vehicle', 'reservation', 'spare_key', 'none'], 'shared/schema.ts:1194'],
    ['backup_runs', 'status', null, ''],
    ['fine_import_files', 'status', null, ''],
  ];
  out.statuses = [];
  for (const [t, c, allowed, src] of statusCols) {
    const rows = await q(`select "${c}" v, count(*)::int n from "${t}" group by 1 order by 2 desc`);
    const outside = allowed ? rows.filter(r => r.v !== null && !allowed.includes(r.v)) : [];
    let outsideLive = null;
    if (t === 'reservations' && allowed && outside.length) {
      outsideLive = await q(`select "${c}" v, type, count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre, min(id) min_id, max(id) max_id from reservations where deleted_at is null and "${c}" is not null and "${c}" not in (${allowed.map(a => `'${a}'`).join(',')}) group by 1,2 order by 3 desc`);
    }
    out.statuses.push({ table: t, column: c, allowed, source: src, values: rows, outsideEnum: outside, outsideEnumLive: outsideLive });
  }

  // ---------- stale states ----------
  const today = new Date().toISOString().slice(0, 10);
  const S = {};
  const stale = async (label, sql) => { const rows = await q(sql); S[label] = { count: rows.length, sample: rows.slice(0, 10) }; };
  await stale('vehicles in_service without a live maintenance block covering today or open-ended', `
    select v.id, v.license_plate, v.availability_status, v.maintenance_status, v.updated_at, (v.created_at >= '${AUDIT_START}') audit_row from vehicles v where v.maintenance_status='in_service' and not exists (
      select 1 from reservations r where r.vehicle_id=v.id and r.type='maintenance_block' and r.deleted_at is null and r.status not in ('cancelled','completed') and coalesce(r.maintenance_status,'scheduled')<>'out' and r.start_date <= '${today}' and (r.end_date is null or r.end_date >= '${today}')) order by v.id`);
  await stale('vehicles needs_service/in_service with no live maintenance block at all', `
    select v.id, v.license_plate, v.maintenance_status, v.availability_status, (v.created_at >= '${AUDIT_START}') audit_row from vehicles v where v.maintenance_status in ('in_service') and not exists (select 1 from reservations r where r.vehicle_id=v.id and r.type='maintenance_block' and r.deleted_at is null and r.status not in ('cancelled','completed')) order by v.id`);
  await stale('maintenance blocks with maintenance_status=in whose vehicle is not in_service', `
    select r.id, r.vehicle_id, v.maintenance_status vehicle_maint, v.availability_status, r.start_date, r.end_date, (r.created_at >= '${AUDIT_START}') audit_row from reservations r join vehicles v on v.id=r.vehicle_id where r.type='maintenance_block' and r.deleted_at is null and r.maintenance_status='in' and v.maintenance_status<>'in_service' order by r.id`);
  await stale('maintenance blocks with maintenance_status=out whose vehicle still needs_fixing / in_service', `
    select r.id, r.vehicle_id, v.maintenance_status vehicle_maint, v.availability_status, r.start_date, r.end_date, (r.created_at >= '${AUDIT_START}') audit_row from reservations r join vehicles v on v.id=r.vehicle_id where r.type='maintenance_block' and r.deleted_at is null and r.maintenance_status='out' and (v.availability_status='needs_fixing' or v.maintenance_status='in_service') order by r.id`);
  await stale('vehicles availability rented without a live picked_up reservation', `
    select v.id, v.license_plate, v.availability_status, (v.created_at >= '${AUDIT_START}') audit_row from vehicles v where v.availability_status='rented' and not exists (select 1 from reservations r where r.vehicle_id=v.id and r.deleted_at is null and r.status='picked_up') order by v.id`);
  await stale('vehicles with a live picked_up reservation but availability not rented', `
    select v.id, v.license_plate, v.availability_status, v.maintenance_status, r.id res_id, r.start_date, r.end_date, (r.created_at >= '${AUDIT_START}') audit_row from vehicles v join reservations r on r.vehicle_id=v.id and r.deleted_at is null and r.status='picked_up' and r.type<>'maintenance_block' where v.availability_status<>'rented' order by v.id`);
  await stale('picked_up reservations whose end_date is >30 days past (never returned)', `
    select id, vehicle_id, customer_id, start_date, end_date, actual_pickup_date, type, (created_at >= '${AUDIT_START}') audit_row from reservations where deleted_at is null and status='picked_up' and end_date is not null and end_date <> 'undefined' and end_date < to_char(now() - interval '30 days','YYYY-MM-DD') order by end_date`);
  await stale('picked_up reservations whose end_date is past (any)', `
    select id, vehicle_id, end_date, (created_at >= '${AUDIT_START}') audit_row from reservations where deleted_at is null and status='picked_up' and end_date is not null and end_date <> 'undefined' and end_date < '${today}' order by end_date`);
  await stale('booked reservations whose start_date is >30 days past and never picked up', `
    select id, vehicle_id, customer_id, type, start_date, end_date, (created_at >= '${AUDIT_START}') audit_row from reservations where deleted_at is null and status='booked' and type='standard' and start_date < to_char(now() - interval '30 days','YYYY-MM-DD') order by start_date`);
  await stale('placeholder spares past end_date, still unassigned (live)', `
    select id, replacement_for_reservation_id, replacement_for_transport_id, customer_id, start_date, end_date, status, (created_at >= '${AUDIT_START}') audit_row from reservations where placeholder_spare and vehicle_id is null and deleted_at is null and end_date is not null and end_date < '${today}' order by end_date`);
  await stale('placeholder spares live (all, any date)', `
    select id, replacement_for_reservation_id, replacement_for_transport_id, start_date, end_date, status, (created_at >= '${AUDIT_START}') audit_row from reservations where placeholder_spare and vehicle_id is null and deleted_at is null order by id`);
  await stale('reservations with end_date < start_date', `
    select id, vehicle_id, type, status, start_date, end_date, (created_at >= '${AUDIT_START}') audit_row from reservations where end_date is not null and end_date <> 'undefined' and end_date < start_date order by id`);
  await stale('reservations with literal end_date = undefined or non-ISO dates', `
    select id, start_date, end_date, status, (created_at >= '${AUDIT_START}') audit_row from reservations where end_date = 'undefined' or start_date !~ '^\\d{4}-\\d{2}-\\d{2}$' or (end_date is not null and end_date !~ '^\\d{4}-\\d{2}-\\d{2}$') order by id`);
  await stale('live replacement reservations whose original reservation is deleted/cancelled/completed/returned (BUG-014 dangling)', `
    select r.id, r.vehicle_id, r.placeholder_spare, r.status, r.start_date, r.end_date, r.replacement_for_reservation_id orig, o.status orig_status, o.deleted_at orig_deleted, (r.created_at >= '${AUDIT_START}') audit_row
    from reservations r left join reservations o on o.id=r.replacement_for_reservation_id
    where r.type='replacement' and r.deleted_at is null and r.status in ('booked','picked_up','active','pending') and r.replacement_for_reservation_id is not null
      and (o.id is null or o.deleted_at is not null or o.status in ('cancelled','completed','returned')) order by r.id`);
  await stale('live replacement reservations whose original vehicle has no live maintenance block overlapping the spare period', `
    select r.id, r.replacement_for_reservation_id orig, o.vehicle_id orig_vehicle, r.start_date, r.end_date, r.status, (r.created_at >= '${AUDIT_START}') audit_row
    from reservations r join reservations o on o.id=r.replacement_for_reservation_id
    where r.type='replacement' and r.deleted_at is null and r.status in ('booked','picked_up','active','pending') and r.replacement_for_transport_id is null
      and not exists (select 1 from reservations m where m.vehicle_id=o.vehicle_id and m.type='maintenance_block' and m.deleted_at is null and m.status not in ('cancelled','completed') and m.start_date <= coalesce(r.end_date,'9999-12-31') and coalesce(m.end_date,'9999-12-31') >= r.start_date)
      and not exists (select 1 from vehicle_transports t where t.spare_reservation_id=r.id) order by r.id`);
  await stale('transports whose spare_reservation is soft-deleted or cancelled while transport still open', `
    select t.id, t.status, t.scheduled_date, t.spare_reservation_id, s.status spare_status, s.deleted_at spare_deleted, (t.created_at >= '${AUDIT_START}') audit_row from vehicle_transports t join reservations s on s.id=t.spare_reservation_id where t.status in ('scheduled','in_progress') and (s.deleted_at is not null or s.status='cancelled') order by t.id`);
  await stale('transports still scheduled with scheduled_date >7 days past', `
    select t.id, t.status, t.transport_type, t.scheduled_date, t.vehicle_id, t.reservation_id, (t.created_at >= '${AUDIT_START}') audit_row from vehicle_transports t where t.status='scheduled' and t.scheduled_date < to_char(now() - interval '7 days','YYYY-MM-DD') order by t.scheduled_date`);
  await stale('delivery transports whose reservation is soft-deleted but transport not cancelled', `
    select t.id, t.status, t.reservation_id, r.deleted_at, (t.created_at >= '${AUDIT_START}') audit_row from vehicle_transports t join reservations r on r.id=t.reservation_id where r.deleted_at is not null and t.status not in ('cancelled','completed') order by t.id`);
  await stale('transports with spare_required but no spare_reservation_id (open)', `
    select t.id, t.status, t.related_vehicle_id, t.spare_required, (t.created_at >= '${AUDIT_START}') audit_row from vehicle_transports t where t.spare_required and t.spare_reservation_id is null and t.status in ('scheduled','in_progress') order by t.id`);
  await stale('reservations whose vehicle no longer exists (live only)', `
    select r.type, r.status, count(*)::int n, count(*) filter (where r.created_at < '${AUDIT_START}')::int pre_existing, count(distinct r.vehicle_id)::int distinct_vehicles, min(r.id) min_id, max(r.id) max_id from reservations r where r.deleted_at is null and r.vehicle_id is not null and not exists (select 1 from vehicles v where v.id=r.vehicle_id) group by 1,2`);
  await stale('reservations whose vehicle is in the recycle bin (unrestored)', `
    select r.id, r.vehicle_id, d.id deleted_record_id from reservations r join deleted_records d on d.entity_type='vehicle' and d.entity_id=r.vehicle_id and d.restored_at is null where not exists (select 1 from vehicles v where v.id=r.vehicle_id) order by r.id`);
  await stale('reservations whose customer no longer exists (live)', `
    select r.id, r.customer_id, r.status, r.type, r.start_date, (r.created_at >= '${AUDIT_START}') audit_row from reservations r where r.deleted_at is null and r.customer_id is not null and not exists (select 1 from customers c where c.id=r.customer_id) order by r.id`);
  await stale('standard rentals with null customer (live)', `
    select r.id, r.vehicle_id, r.status, r.start_date, r.end_date, (r.created_at >= '${AUDIT_START}') audit_row from reservations r where r.deleted_at is null and r.type='standard' and r.customer_id is null order by r.id`);
  await stale('spare_assignment notifications whose placeholder is deleted/assigned/missing (stale notifications)', `
    select n.id, n.description, n.is_read, p.id placeholder_id, p.deleted_at, p.vehicle_id, p.placeholder_spare, (n.created_at >= '${AUDIT_START}') audit_row
    from custom_notifications n left join reservations p on p.id = nullif(substring(n.description from '\\[placeholder:(\\d+)\\]'),'')::int
    where n.type='spare_assignment' and (p.id is null or p.deleted_at is not null or p.vehicle_id is not null or not p.placeholder_spare) order by n.id`);
  await stale('spare_assignment notifications total', `select count(*)::int n, count(*) filter (where not is_read)::int unread from custom_notifications where type='spare_assignment'`);
  await stale('deleted_records unrestored whose original entity id is now occupied (id reused / double delete)', `
    select d.id, d.entity_type, d.entity_id, d.deleted_at, d.label, (exists(select 1 from vehicles v where v.id=d.entity_id)) vehicle_exists_now from deleted_records d where d.restored_at is null and d.entity_type='vehicle' and exists (select 1 from vehicles v where v.id=d.entity_id)`);
  await stale('deleted_records: more than one snapshot for the same entity', `
    select entity_type, entity_id, count(*)::int n, array_agg(id order by id) ids, array_agg(restored_at order by id) restored from deleted_records group by 1,2 having count(*)>1`);
  await stale('deleted_records unrestored total', `select entity_type, count(*)::int n, array_agg(id) ids from deleted_records where restored_at is null group by 1`);
  await stale('soft-deleted reservations still holding a contract_number', `select id, contract_number, deleted_at from reservations where deleted_at is not null and contract_number is not null order by id`);
  await stale('picked_up/completed reservations without contract number (standard)', `select status, count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre_existing from reservations where deleted_at is null and type='standard' and status in ('picked_up','completed','returned') and contract_number is null group by 1`);
  await stale('reservations picked_up without actual_pickup_date / pickup_mileage', `select count(*)::int n, count(*) filter (where created_at < '${AUDIT_START}')::int pre_existing from reservations where deleted_at is null and status='picked_up' and (actual_pickup_date is null or pickup_mileage is null)`);
  await stale('documents whose reservation is soft-deleted (BUG-055)', `select d.id, d.reservation_id, d.document_type, d.file_path, (d.upload_date >= '${AUDIT_START}') audit_row from documents d join reservations r on r.id=d.reservation_id where r.deleted_at is not null order by d.id`);
  await stale('documents whose vehicle no longer exists', `select d.id, d.vehicle_id, d.reservation_id, d.document_type, (d.upload_date >= '${AUDIT_START}') audit_row from documents d where d.vehicle_id is not null and not exists (select 1 from vehicles v where v.id=d.vehicle_id)`);
  await stale('documents whose reservation belongs to a different vehicle than documents.vehicle_id', `select d.id, d.vehicle_id doc_vehicle, r.vehicle_id res_vehicle, d.reservation_id, d.document_type, (d.upload_date >= '${AUDIT_START}') audit_row from documents d join reservations r on r.id=d.reservation_id where d.vehicle_id is not null and r.vehicle_id is not null and r.vehicle_id<>d.vehicle_id order by d.id`);
  await stale('active_sessions unexpired rows without a session-store row (stale)', `select count(*)::int n, min(created_at) oldest, max(expires_at) latest_expiry, count(distinct user_id)::int users from active_sessions a where a.expires_at > now() and not exists (select 1 from session s where s.sid=a.session_id)`);
  await stale('active_sessions per user', `select user_id, username, count(*)::int n from active_sessions group by 1,2 order by 3 desc`);
  await stale('users inactive but with unexpired active_sessions', `select a.user_id, u.username, count(*)::int n from active_sessions a join users u on u.id=a.user_id where not u.active and a.expires_at > now() group by 1,2`);
  await stale('portal_users inactive/blocked with live session rows', `select count(*)::int n from session s join portal_users p on p.id=(s.sess->>'portalUserId')::int where not p.active`);
  await stale('portal_requests with reservation_id null for reservation-bound types', `select id, type, status, created_at from portal_requests where type in ('extension','early_return','maintenance','maintenance_change') and reservation_id is null`);
  await stale('portal_requests done but linked reservation missing (booking)', `select id, type, status, reservation_id from portal_requests where type='booking' and status='done' and (reservation_id is null or not exists (select 1 from reservations r where r.id=portal_requests.reservation_id and r.deleted_at is null))`);
  await stale('maintenance blocks with portal_request_id whose request no longer exists', `select r.id, r.portal_request_id from reservations r where r.portal_request_id is not null and not exists (select 1 from portal_requests p where p.id=r.portal_request_id)`);
  await stale('maintenance blocks with affected_rental_id pointing at missing/deleted rental', `select r.id, r.affected_rental_id, o.deleted_at, o.status from reservations r left join reservations o on o.id=r.affected_rental_id where r.affected_rental_id is not null and (o.id is null or o.deleted_at is not null)`);
  await stale('expenses whose vehicle no longer exists', `select e.id, e.vehicle_id, e.amount, e.date, (e.created_at >= '${AUDIT_START}') audit_row from expenses e where not exists (select 1 from vehicles v where v.id=e.vehicle_id)`);
  await stale('scan_events whose vehicle/reservation no longer exists', `select count(*) filter (where vehicle_id is not null and not exists (select 1 from vehicles v where v.id=s.vehicle_id))::int vehicle_missing, count(*) filter (where reservation_id is not null and not exists (select 1 from reservations r where r.id=s.reservation_id))::int reservation_missing from scan_events s`);
  await stale('drivers whose license_document_id is null but license_file_path set (or vice versa)', `select id, license_document_id, license_file_path from drivers where (license_document_id is null) <> (license_file_path is null)`);
  await stale('vehicles.contract_number (vehicle-level) vs reservations', `select count(*)::int n from vehicles where contract_number is not null and trim(contract_number)<>''`);
  await stale('reservations soft-deleted whose replacement/placeholder is still live', `select p.id placeholder, p.replacement_for_reservation_id orig, p.status, p.placeholder_spare from reservations p join reservations o on o.id=p.replacement_for_reservation_id where o.deleted_at is not null and p.deleted_at is null and p.type='replacement'`);
  await stale('sequences vs max(id) (restore setval hygiene)', `
    select 'vehicles' t, (select last_value from vehicles_id_seq) seq, (select max(id) from vehicles) max_id
    union all select 'reservations', (select last_value from reservations_id_seq), (select max(id) from reservations)
    union all select 'documents', (select last_value from documents_id_seq), (select max(id) from documents)
    union all select 'customers', (select last_value from customers_id_seq), (select max(id) from customers)
    union all select 'expenses', (select last_value from expenses_id_seq), (select max(id) from expenses)`);
  out.stale = S;

  // ---------- files vs documents ----------
  const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  const resolveBases = (fp) => {
    const rel = norm(fp);
    const relNoUploads = rel.replace(/^uploads\//, '');
    const bases = [
      ['cwd+filePath (routes.ts:5129 download)', path.join(REPO, rel)],
      ['cwd/uploads+filePath (routes.ts:5133 fallback)', path.join(REPO_UPLOADS, rel)],
      ['UPLOADS_DIR(audit-uploads)+filePath', path.join(AUDIT_UPLOADS, rel)],
      ['UPLOADS_DIR(audit-uploads)+filePath minus uploads/ prefix', path.join(AUDIT_UPLOADS, relNoUploads)],
      ['cwd/uploads+filePath minus uploads/ prefix', path.join(REPO_UPLOADS, relNoUploads)],
    ];
    return bases.filter(([, p]) => exists(p)).map(([b]) => b);
  };
  const fileCols = [
    ['documents', 'file_path', 'upload_date'], ['expenses', 'receipt_file_path', 'created_at'], ['fines', 'letter_file_path', 'created_at'],
    ['drivers', 'license_file_path', 'created_at'], ['reservations', 'damage_check_path', 'created_at'], ['pdf_templates', 'background_path', 'created_at'],
    ['vehicles', 'damage_check_attachment', 'created_at'], ['vehicles', 'fuel_refill_receipt', 'created_at'], ['fine_import_files', 'raw_path', 'received_at'],
    ['damage_check_templates', 'background_path', 'created_at'], ['delivery_tasks', 'delivery_photo_path', 'created_at'],
  ];
  const attCols = await q(`select column_name from information_schema.columns where table_name='portal_request_attachments'`);
  const attPathCol = attCols.map(c => c.column_name).find(c => /path|file/.test(c) && c !== 'file_name' && c !== 'file_size');
  if (attPathCol) fileCols.push(['portal_request_attachments', attPathCol, 'created_at']);
  out.files = { REPO, REPO_UPLOADS, AUDIT_UPLOADS, columns: [] };
  const knownFiles = new Set();
  for (const [t, c, ts] of fileCols) {
    let rows;
    try { rows = await q(`select id, "${c}" fp, ("${ts}" >= '${AUDIT_START}') audit_row from "${t}" where "${c}" is not null and trim("${c}")<>''`); } catch (e) { out.files.columns.push({ table: t, column: c, error: e.message }); continue; }
    const perBase = {}; const missing = []; const pathShapes = {};
    for (const r of rows) {
      const shape = /^uploads[\\/]/i.test(r.fp) ? 'uploads/-prefixed' : /^[A-Za-z]:\\|^\//.test(r.fp) ? 'absolute' : 'relative-to-uploads';
      pathShapes[shape] = (pathShapes[shape] || 0) + 1;
      const found = resolveBases(r.fp);
      for (const b of found) perBase[b] = (perBase[b] || 0) + 1;
      if (found.length === 0) missing.push({ id: r.id, fp: r.fp, audit_row: r.audit_row });
      const base = path.basename(norm(r.fp)).toLowerCase();
      knownFiles.add(base);
    }
    out.files.columns.push({ table: t, column: c, rows: rows.length, pathShapes, foundPerBase: perBase, missingOnDisk: missing.length, missingPre: missing.filter(m => !m.audit_row).length, missingAudit: missing.filter(m => m.audit_row).length, missingSample: missing.slice(0, 12) });
  }
  // files on disk with no row
  const walk = (dir, acc = []) => { let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; } for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
  const IGNORE = /\.gitkeep$|\.DS_Store$|\/temp\/|\/tmp\//i;
  for (const [label, root] of [['audit-uploads', AUDIT_UPLOADS], ['repo uploads', REPO_UPLOADS]]) {
    const all = walk(root).filter(p => !IGNORE.test(p.replace(/\\/g, '/')));
    const orphanFiles = all.filter(p => !knownFiles.has(path.basename(p).toLowerCase()));
    const byTop = {};
    for (const p of orphanFiles) { const rel = path.relative(root, p).replace(/\\/g, '/'); const top = rel.split('/')[0]; byTop[top] = (byTop[top] || 0) + 1; }
    const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
    out.files[label] = { root, totalFiles: all.length, filesWithoutRow: orphanFiles.length, bytesWithoutRow: orphanFiles.reduce((a, p) => a + sizeOf(p), 0), byTopDir: byTop, sample: orphanFiles.slice(0, 15).map(p => path.relative(root, p)) };
  }

  fs.writeFileSync(path.join(__dirname, 'p12-scan2.json'), JSON.stringify(out, null, 2));
  console.log('=== DUPLICATES ===');
  for (const d of D) console.log(`${d.label}: groups=${d.groups} extraRows=${d.extraRows}` + (d.groups ? ' sample=' + JSON.stringify(d.sample.slice(0, 3)) : ''));
  console.log('=== STATUSES ===');
  for (const s of out.statuses) console.log(`${s.table}.${s.column}: ${JSON.stringify(s.values.map(v => `${v.v}:${v.n}`))}` + (s.outsideEnum.length ? ` OUTSIDE=${JSON.stringify(s.outsideEnum)} live=${JSON.stringify(s.outsideEnumLive)}` : ''));
  console.log('=== STALE ===');
  for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v.count}` + (v.count ? ' ' + JSON.stringify(v.sample.slice(0, 4)) : ''));
  console.log('=== FILES ===');
  console.log(JSON.stringify(out.files, null, 1));
  await pool.end();
})().catch(e => { console.error('ERR', e); process.exit(1); });

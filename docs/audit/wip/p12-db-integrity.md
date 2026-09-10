# Phase 12 — Database & data integrity (lvs_audit, audit server :5001)

Date 2026-09-10. Database `lvs_audit` only (47 tables, 68 real FKs). Scripts: `docs/audit/wip/scripts/p12-fk-inventory.cjs`, `p12-orphans.cjs`, `p12-scan2.cjs` (read-only scans), `p12-summary.cjs` (merges the three into `p12-scan.json` and computes the pre-existing/audit splits), `p12-lib.cjs` + `p12-txn.cjs` (Part B, results in `p12-txn.out.json`, fixture ids in `p12-ids.json`). "Pre-existing" = `created_at < 2026-09-09` (rows that were in the clone before any audit agent touched it); "audit" = rows created by the phase 9-12 agents (all prefixed `AUDIT-`/`AU-…-X`). All counts were taken on 2026-09-10 while phases 9-11 were still writing, so audit-side numbers drift; pre-existing numbers do not.

```
DATABASE REPORT
Integrity problems: 14 reference-like columns without an FK (of 82 integer reference columns); 6 status/enum columns hold values outside their enum (reservations.status 278 live rows / 248 pre-existing; vehicles.availability_status 44 / 33 pre-existing); 3 contract numbers collide after leading-zero strip (pre-existing); 4 reservations with non-ISO dates (3 pre-existing), 5 with end_date < start_date (audit)
Orphaned records: 262 live reservations (258 maintenance blocks, status 'active') on vehicles that do not exist (243 pre-existing, 163 vehicle ids); 55 unread spare_assignment notifications pointing at reservations that no longer exist (51 pre-existing); 15 documents on soft-deleted reservations (5 pre-existing); 2 reservations + 1 expense + 1 document on non-existent customer/vehicle/reservation ids (all audit); 176 active_sessions rows (55 pre-existing) of which 171 have no session-store row; 597 audit_logs rows on resources that no longer exist (540 pre-existing, expected for deletes)
Duplicates: 50 pre-existing genuine double-booking pairs on 46 vehicles (+187 audit pairs on 8 vehicles); 160 overlapping live maintenance-block pairs (146 pre-existing, 157 on vehicles that no longer exist) incl. 28 exact-duplicate groups; 9 documents file_path groups sharing one physical file (20 extra rows, 3 groups pre-existing); 2 normalised-plate groups, 3 customer email/name groups, 1 debtor number (all audit); 2 originals with 2 live replacements (audit); 1 fine pair on plate+offence_at (ids 17/73)
Transaction problems: 9 multi-write workflows without db.transaction (pickup, return, maintenance-with-spare, portal approval, transport create (insert outside the tx), placeholder assign, reservation delete cascade loop, customer delete (no snapshot), bulk import (per row, by design)); 4 workflows transactional (vehicle delete, restore, applyTransportUpdate, driver assignment)
Rollback problems: 3 proven partial writes — pickup leaves the reservation 'picked_up' with a burned contract number while returning 400 (D12-001); POST /api/transports leaves an orphan transport row after a 409 (D12-005); two concurrent portal approvals create two maintenance blocks + two replies + two notifications (D12-004). Vehicle delete/restore is atomic but its snapshot misses 5 link types, so restore silently loses them (D12-006). Rollback works where a transaction exists (a1, j2).
State inconsistencies: 358 'picked_up' rentals past end_date (357 pre-existing; 344 without actual_pickup_date); 130 'picked_up' rentals whose start_date is in the future (126 pre-existing); 336 'booked' rentals > 30 days past start (335 pre-existing); 62 vehicles with a live picked_up rental but availability != 'rented'; 8 vehicles 'rented' without a picked_up rental (6 pre-existing); 3 stale unassigned placeholders (2 pre-existing); 3 dangling replacements (1 pre-existing); 2 in_service vehicles without a live block (audit); 3 transports 'scheduled' > 7 days past (pre-existing); 139 orphan 'active' blocks still inside the future calendar window
```

## 1. FK / reference inventory

Source: `information_schema.table_constraints` + `referential_constraints` (`p12-fk-inventory.cjs`, output `p12-fk-inventory.json`). 82 integer columns look like references (name ends in `_id`, or `created_by`/`entity_id`/`user_id`); 68 have a constraint, 14 do not. Only real FKs list an ON DELETE rule.

| Column | Target | FK | ON DELETE |
|---|---|---|---|
| active_sessions.user_id | users | yes | CASCADE |
| apk_date_changes.vehicle_id | vehicles | yes | CASCADE |
| audit_logs.user_id | users | yes | NO ACTION |
| custom_notifications.user_id | users | yes | NO ACTION |
| customers.created_by_user_id / updated_by_user_id | users | yes | NO ACTION |
| damage_check_template_backgrounds.template_id | damage_check_templates | yes | CASCADE |
| delivery_tasks.assigned_staff_id | users | yes | NO ACTION |
| delivery_tasks.reservation_id | reservations | yes | CASCADE |
| **deleted_records.deleted_by_user_id** | users | **no** | – |
| **deleted_records.entity_id** | vehicles / fines (polymorphic on entity_type) | **no** | – |
| documents.created_by_user_id / updated_by_user_id | users | yes | NO ACTION |
| **documents.reservation_id** | reservations | **no** | – |
| **documents.vehicle_id** | vehicles | **no** | – |
| drivers.customer_id | customers | yes | CASCADE |
| drivers.license_document_id | documents | yes | SET NULL |
| drivers.created_by_user_id / updated_by_user_id | users | yes | NO ACTION |
| expenses.created_by_user_id / updated_by_user_id | users | yes | NO ACTION |
| **expenses.vehicle_id (NOT NULL)** | vehicles | **no** | – |
| fines.customer_id | customers | yes | SET NULL |
| fines.driver_id | drivers | yes | SET NULL |
| fines.import_file_id | fine_import_files | yes | SET NULL |
| fines.reservation_id | reservations | yes | SET NULL |
| fines.vehicle_id | vehicles | yes | SET NULL |
| interactive_damage_checks.diagram_template_id | vehicle_diagram_templates | yes | NO ACTION |
| interactive_damage_checks.reservation_id | reservations | yes | NO ACTION |
| interactive_damage_checks.vehicle_id | vehicles | yes | NO ACTION |
| password_history.user_id | users | yes | CASCADE |
| portal_activity_log.customer_id | customers | yes | CASCADE |
| portal_activity_log.portal_user_id | portal_users | yes | SET NULL |
| **portal_activity_log.entity_id** | polymorphic on `entity` | **no** | – |
| portal_customer_settings.customer_id | customers | yes (unique) | CASCADE |
| portal_document_acks.customer_id | customers | yes | CASCADE |
| portal_document_acks.document_id | documents | yes | CASCADE |
| portal_document_acks.portal_user_id | portal_users | yes | SET NULL |
| portal_notifications.customer_id | customers | yes | CASCADE |
| portal_notifications.portal_user_id | portal_users | yes | CASCADE |
| portal_request_attachments.request_id | portal_requests | yes | CASCADE |
| portal_request_messages.request_id | portal_requests | yes | CASCADE |
| portal_requests.customer_id | customers | yes | CASCADE |
| portal_requests.fine_id | fines | yes | SET NULL |
| portal_requests.portal_user_id | portal_users | yes | SET NULL |
| portal_requests.reservation_id | reservations | yes | SET NULL |
| portal_users.customer_id | customers | yes | CASCADE |
| portal_users.driver_id | drivers | yes | SET NULL |
| reservation_driver_assignments.reservation_id | reservations | yes | CASCADE |
| reservation_driver_assignments.driver_id | drivers | yes | SET NULL |
| reservation_driver_assignments.assigned_by_portal_user_id | portal_users | yes | SET NULL |
| reservation_driver_assignments.assigned_by_user_id | users | yes | SET NULL |
| **reservations.vehicle_id** | vehicles | **no** | – |
| **reservations.customer_id** | customers | **no** | – |
| reservations.driver_id | drivers | yes | SET NULL |
| **reservations.replacement_for_reservation_id** | reservations | **no** | – |
| reservations.replacement_for_transport_id | vehicle_transports | yes | SET NULL |
| **reservations.affected_rental_id** | reservations | **no** | – |
| **reservations.portal_request_id** | portal_requests | **no** | – |
| **reservations.recurring_parent_id** | reservations | **no** | – |
| reservations.delivery_staff_id | users | yes | NO ACTION |
| reservations.created_by_user_id / updated_by_user_id / deleted_by_user_id | users | yes | NO ACTION |
| saved_reports.created_by_user_id | users | yes | NO ACTION |
| **scan_events.vehicle_id** | vehicles | **no** | – |
| **scan_events.reservation_id** | reservations | **no** | – |
| settings.updated_by_user_id | users | yes | NO ACTION |
| template_backgrounds.template_id | pdf_templates | yes | CASCADE |
| transport_report_template_backgrounds.template_id | transport_report_templates | yes | CASCADE |
| vehicle_customer_blacklist.vehicle_id | vehicles | yes | CASCADE |
| vehicle_customer_blacklist.customer_id | customers | yes | CASCADE |
| vehicle_customer_blacklist.created_by | users | yes | NO ACTION |
| vehicle_transports.vehicle_id | vehicles | yes | CASCADE |
| vehicle_transports.related_vehicle_id | vehicles | yes | SET NULL |
| vehicle_transports.reservation_id | reservations | yes | SET NULL |
| vehicle_transports.spare_reservation_id | reservations | yes | SET NULL |
| vehicle_transports.customer_id | customers | yes | SET NULL |
| vehicle_transports.created_by_user_id / updated_by_user_id | users | yes | NO ACTION |
| vehicle_waitlist.customer_id | customers | yes | NO ACTION |
| vehicle_waitlist.vehicle_id | vehicles | yes | NO ACTION |

Text actor columns (`created_by`, `updated_by`, `deleted_by`, `restored_by`, `linked_by`, …) store usernames, not ids; 17 of them hold names that are not in `users` (`staff-test`, `test`, `system`, `seed`, `audit`, portal e-mail addresses, `System Administrator`) — e.g. `deleted_records.deleted_by` 26 rows, `restored_by` 26 rows. Not a defect by itself (free text), but nothing links an action back to a user row once the account is renamed or removed.

Unique constraints/indexes present: PKs, `users.username`, `vehicles.license_plate` (raw, not normalised), `vehicles.barcode`, `reservations.contract_number`, `app_settings.key`, `active_sessions.session_id`, `fine_import_files.file_hash`, `portal_users lower(email)`, `portal_customer_settings.customer_id`, `portal_document_acks.document_id`, `vehicle_customer_blacklist(vehicle_id, customer_id)`, `interactive_damage_checks(reservation_id, check_type)`, `damage_check_templates` partial unique on `is_default`.

## 2. Orphan scan results

Every reference-like column was joined to its target (`p12-orphans.cjs`, output `p12-orphans.json`). Columns not listed had 0 orphans and 0 soft-deleted targets.

| Column | Orphans (target row missing) | pre-existing / audit | Sample | Target soft-deleted / in recycle bin |
|---|---|---|---|---|
| reservations.vehicle_id | **262 live** (260 at scan time) | 243 / 17-19 | res 2175→veh 1022, 2176→1023, 2179/2180→1025 (all `maintenance_block`, status `active`, notes "Vehicle maintenance block", created 2026-09-06..08, created_by null); 3218 (block, audit), 3234 (standard, audit) | 0 in recycle bin — these vehicle ids never had a `deleted_records` row nor a `vehicle.delete` audit row |
| reservations.customer_id | 2 | 0 / 2 | 3230→1257 ("AUDIT clone reservation"), 3241→999999999 ("AUDIT-nonexist-customer", BUG-039) | n/a |
| reservations.replacement_for_reservation_id | 0 | | | 1: replacement 3221 → original 3216 soft-deleted (audit; BUG-014 shape) |
| documents.reservation_id | 1 | 0 / 1 | doc 218 → res 3314 (hard-deleted by another agent) | **15** documents on soft-deleted reservations (5 pre-existing: docs 27/28/29 → res 1, 38 → 1516, 40 → 1519) — BUG-055 |
| expenses.vehicle_id (NOT NULL, no FK) | 1 | 0 / 1 | expense 2003 → vehicle 999999 | 0 |
| reservation_driver_assignments.reservation_id | 0 | | | 1: assignment 287 → res 3308 soft-deleted (audit) |
| scan_events.vehicle_id / reservation_id | 0 at scan; 1 after test a2 (scan 81 → vehicle 1790 deleted, then restored) | | | |
| portal_activity_log.entity_id | 18 | pre/audit not split (no reliable timestamp) | entity `request` 16 rows (sample id 68), `driver` 2 rows (sample 247) | |
| audit_logs.resource_id | 597 | 540 / 57 | fine 342 (331 pre), reservation 140 (130 pre), vehicle 64 (37 pre), customer 51 (42 pre), document 6, user 1 | expected for hard deletes; shows how much was hard-deleted in the clone |
| session (store) passport user / portalUserId | 0 | | 21 rows, none expired | |
| active_sessions.user_id | 0 (FK) | | but 171 of 176 rows have no matching `session` row; all 176 unexpired (expires_at up to 2026-10-10), oldest 2026-08-21, 113 rows for `admin` — BUG-095 | |
| email_logs.vehicle_ids | 0 (table has 0 rows) | | | |
| deleted_records snapshots | 13 vehicle snapshots (11 restored), 27 fine snapshots (all restored). 10 restored snapshots have their `entity_id` occupied again by the restored row (expected). Two entities have 2 snapshots each (vehicle 1709: ids 31 restored + 32 unrestored; vehicle 1762: 36 + 37 both restored — phase 9 test). Snapshot-internal references (customer ids, replacement ids) all resolve; no reservation/document ids inside snapshots were reused by other rows. | | | |

Orphans of the 5 SET NULL / CASCADE link types that vehicle delete destroys without snapshotting were produced live in test a2 (section 7).

## 3. Duplicate scan results

| Check | Groups / extra rows | Pre-existing? | Sample |
|---|---|---|---|
| vehicles by normalised plate (upper, strip non-alnum) | 2 / 3 | audit only | `AU001X`: 1671 `AU-001-X`, 1699 `au001x`, 1700 `AU 001 X`; `AU9P97073A`: 1766, 1769 — BUG-020 |
| vehicles by chassis_number | 0 | | |
| customers by lower(name) | 3 / 3 | audit only | 1248/1251 "audit klant1", 1249/1252, 1269/1270 |
| customers by lower(email) | 3 / 3 | audit only | same ids |
| customers by debtor_number | 1 / 1 | audit only | 1264/1265 `AUDIT-DEB-1788983243554` — BUG-045 |
| **reservations genuine double bookings** (same vehicle, both live rental rows, strict multi-day overlap; maintenance blocks and same-day turnover excluded) | 237 pairs on 54 vehicles | **50 pairs on 46 vehicles pre-existing**; 187 audit pairs on 8 vehicles (171 alone on vehicle 1696 from the phase-10 race test) | pre-existing e.g. vehicle 206: 21 and 297 both `booked` 2026-05-19..21 (identical range); vehicle 8: 573 (picked_up 05-28..06-02) vs 1102 (picked_up 05-23..05-31); vehicle 239: 354/1036/1248 all picked_up overlapping; vehicle 428: 17 vs 820 both picked_up 07-12..; full list in `p12-scan.json → summary.doubleBookingsPreDetail` |
| same-day turnover pairs (end = other start) | 10 vehicles / 11 pairs | mixed | by design |
| maintenance blocks exact duplicates (same vehicle, start, end, both live) | 28 / 36 | all pre-existing | `1496|2026-09-09|open`: 2942, 2943, 2946 — every group is on a vehicle id that no longer exists |
| maintenance blocks overlapping on the same vehicle | 160 pairs on 38 vehicles | 146 pre-existing | only 3 pairs are on vehicles that exist — BUG-037 |
| contract numbers colliding after `ltrim('0')` | 3 / 3 | all pre-existing | `0100` (res 131) vs `100` (525); `0011` (12) vs `11` (199); `0012` (13) vs `12` (1392). 992 of 1049 contract numbers have a leading zero, 35 are non-numeric |
| contract numbers still set on soft-deleted reservations | 0 | | delete route clears them |
| documents same file_path | 9 / 20 | 3 groups pre-existing (docs 27/28/29 `48XT138_contract_20260826.pdf`, 31/32, …) | audit: 8 rows on `12XT102_contract_20260909.pdf` — BUG-027 |
| documents same (vehicle, reservation, type) | 3 / 3 | audit | 215/216, 232/233, 234/235 |
| placeholder spares per original (live) | 0 | | app-level check in `createPlaceholderReservation` holds |
| live replacements per original | 2 / 2 | audit | original 3236 → 3237 (veh 1668) + 3238 (veh 1669) both `pending`; original 3336 → 3354 (TBD) + 3379 (veh 1758 picked_up) — BUG-032 |
| users by lower(username) / lower(email) | 0 | | |
| portal_users by lower(email) | 0 | | unique index exists |
| drivers by customer+email / licence number | 0 | | |
| app_settings keys | 0 | | unique |
| pdf_templates is_default > 1 | 0 | | app-only rule, currently satisfied |
| transports per reservation_id | 0 | | |
| fines by plate + offence_at | 1 / 1 | ids 17 and 73 | |
| interactive_damage_checks (reservation, type) | 0 | | unique index |
| audit_logs same action+resource within 2 s | 22 groups / 19 extra | | `vehicle.delete|1709` 15 rows, `vehicle.delete|1762` 6 rows: middleware + manual AuditLogger both log (phase-1 item 12); test j2 shows 2 `vehicle.delete` rows for one delete |

## 4. Status / enum results

Distinct values per status column vs `shared/schema.ts` (`p12-scan2.json → statuses`):

| Column | Enum (source) | Values found (count) | Outside enum — live rows (pre-existing) |
|---|---|---|---|
| reservations.status | booked, picked_up, returned, completed, cancelled (schema.ts:26-31, 42-48) | booked 626, completed 513, picked_up 510, **active 269**, cancelled 20, returned 17, scheduled 6, pending 5, confirmed 3, in 3, garbage 1 | **278 (248)**: `active` 265 blocks (243 pre; written by `createMaintenanceBlock` database-storage.ts:3329), `pending` 4 replacements (`createReplacementReservation` :3224), `scheduled` 4 blocks (pre), `in` 1 block 1506 (pre), `confirmed` 3 + `garbage` 1 (audit, BUG-016/BUG-084). None of these can move through `PATCH /:id/status` (no transition entry) |
| reservations.type | standard, replacement, maintenance_block | 1635 / 45 / 293 | 0 |
| reservations.spare_vehicle_status | assigned, ready, picked_up, returned (+cancelled) | assigned 1964 (default on every row incl. 1635 standard rentals), picked_up 4, returned 3, ready 2 | 0, but the default `assigned` on non-replacement rows makes the column meaningless for filtering |
| reservations.maintenance_status | scheduled, in, out | null 1689, scheduled 205, in 40, out 38, garbage 1 | 1 (audit, BUG-052) |
| reservations.maintenance_category | scheduled_maintenance, repair | null 1703, repair 269, '' 1 | 1 (res 505, pre) |
| reservations.delivery_status | pending … completed | null 1972, '' 1 | 1 (res 505, pre) |
| reservations.fuel_level_pickup / _return | empty, 1/4, 1/2, 3/4, full | also `Full` 5+2, `half` 1 | 8 (7 pre) — mixed case breaks equality filters |
| vehicles.availability_status | available, needs_fixing, not_for_rental, rented (schema.ts:18-23) | rented 278, available 256, **scheduled 42**, needs_fixing 2, banana_not_real 2, not_for_rental 1 | 44 (33 pre): `scheduled` is written by `syncVehicleAvailabilityWithReservations` but absent from the enum; `banana_not_real` = BUG-021 |
| vehicles.maintenance_status | ok, needs_service, in_service | 577 / 1 / 2 | 0 |
| vehicles.current_fuel_level | as fuel | `Full` 6, `half` 1 | 7 |
| vehicle_transports.status / transport_type | scheduled, in_progress, completed, cancelled / swap, tow, repossession, delivery, other | all in range | 0 |
| portal_requests.status / type | new, in_progress, done, rejected / booking … other | all in range | 0 |
| fines.status | new, linked, charged, paid, disputed, cancelled (shared/fines.ts) | also `open` 1 | 1 (fine created via generic PATCH) |
| drivers.status, apk_date_changes.status, portal_users.role, users.role, audit_logs.status, scan_events.match_type | | all in range | 0 |
| delivery_tasks, backup_runs (`failed` 256 / `success` 1), fine_import_files | no enum in schema | | – |

## 5. Stale-state results

| Check | Count | pre-existing | Sample |
|---|---|---|---|
| vehicles `in_service` without a live block covering today | 2 | 0 | 1670 AU-004-X (needs_fixing), 1675 AU-005-X (rented) |
| blocks `maintenance_status = in` whose vehicle is not in_service | 1 | 1 | block 1506 on vehicle 469 (rented, ok) |
| blocks `out` whose vehicle still needs_fixing/in_service | 0 | | |
| vehicles `rented` without a live picked_up rental | 8 | 6 | 2 12XT102, 4 14XT104, 41, 74, 82, 240; audit 1668, 1742 |
| vehicles with a live picked_up rental but availability != rented | 62 | mostly pre | 13 23XT113 `scheduled` with res 353 picked_up starting 2026-09-27 |
| picked_up rentals past end_date | 358 (317 > 30 days) | 357 | 214 (end 2026-02-07), 796, 1303, 110; 344 have no actual_pickup_date |
| picked_up rentals whose start_date is in the future | 130 | 126 | seed rows marked picked_up before they start |
| booked rentals > 30 days past start, never picked up | 336 | 335 | 1468 (2026-02-02), 386, 1072; audit 3233 (2020-01-01, BUG-040 shape) |
| placeholders past end_date still unassigned | 3 | 2 | 1533 (end 2026-08-29, transport 27), 1549 (end 2026-08-30); audit 3354 |
| live placeholders (any date) | 7 | 2 | incl. 3382 with neither original nor transport link (audit) |
| reservations end_date < start_date | 5 | 0 | 3229 block 2099-01-01..2020-01-01 `active`; 3299/3339/3361/3364 `returned` (BUG-019 mechanism: return overwrote end_date with today) |
| non-ISO dates | 4 | 3 | 1517/1520/1532 end_date `2026-08-29T16:01:07.706Z` (returned); audit 3442 end_date `not-a-date` (BUG-084) |
| live replacements whose original is deleted/cancelled/completed | 3 | 1 | 1503 (orig 84 completed), 3221 (orig 3216 soft-deleted), 3357 placeholder (orig 3355 cancelled) — BUG-014 |
| live replacements with no live block on the original vehicle and no transport | 5 | 0 | 3221, 3249, 3311, 3354 |
| transports `scheduled` > 7 days past | 3 | 3 | 33 (delivery 2026-07-29, res 1501), 27, 28 (swap 2026-08-29) |
| transports spare_required without spare_reservation (open) | 1 | 0 | 42 |
| spare_assignment notifications whose placeholder no longer exists | 55 of 62 (all 62 unread) | 51 | 171 `[placeholder:2329]`, 172 `[placeholder:2337]`, 173 `[placeholder:2340]` — the placeholders were hard-deleted (`storage.deleteReservation`, BUG-004 path) |
| portal_requests `done` booking without reservation | 3 | | 103, 148, 149 |
| portal maintenance request without reservation_id | 1 | 0 | 588 |
| drivers with license_file_path but no license_document_id | 2 | 0 | 855, 856 |
| soft-deleted reservations still holding contract_number | 0 | | |
| picked_up/completed standard rentals without contract number | 3 | 0 | |
| sequences vs max(id) | consistent (vehicles seq 1787 ≥ max 1783 after restores) | | |

## 6. Files vs documents

Bases checked: `C:\Users\kees lam\Desktop\LVStest-main\audit-uploads` (UPLOADS_DIR of the audit server) and the repo `uploads\` dir (what `process.cwd()`-relative code in `routes.ts:5129/5133` resolves against).

| Table.column | Rows | Path shapes | Resolves against | Missing on disk |
|---|---|---|---|---|
| documents.file_path | 117 | 95 relative-to-uploads (`AU12FX\contracts\…`), 22 `uploads\`-prefixed (pre-existing) | 59 via UPLOADS_DIR, 46 via cwd (the 22 `uploads\` rows + `..\audit-uploads\…` rows), 36 via cwd/uploads fallback | **0** (every row resolves under at least one base, but no single base resolves all 117 — BUG-026/BUG-029 class: the download route uses cwd, uploads use UPLOADS_DIR) |
| expenses.receipt_file_path | 4 | 4 absolute Windows paths | none | **4** (3 pre-existing under `…\LVStest-main\uploads\13XT103\receipts\…` which is another machine's checkout; 1 audit) — BUG-060 context |
| fines.letter_file_path | 1 | `uploads\`-prefixed | cwd | 0 |
| drivers.license_file_path | 2 | `..\audit-uploads\drivers\…` | cwd / UPLOADS_DIR | 0 |
| reservations.damage_check_path | 1 | `/tmp/AUDIT-path` (audit, BUG-084) | none | 1 |
| pdf_templates.background_path | 1 | `..\audit-uploads\templates\template_8_background.png` | none | 1 (audit; template 8 falls back to the built-in layout — test b2) |
| portal_request_attachments.file_path | 1 | relative | UPLOADS_DIR | 0 |
| fine_import_files.raw_path | 1 | `uploads\` | cwd | 0 |

Files without any DB row: `audit-uploads` 16 of 65 files (14.8 MB: 12 regenerated contracts under `48XT138\contracts`, 3 under `12XT102`, 1 template background — BUG-027/BUG-050 residue); repo `uploads` 98 of 157 files (6.5 MB: `fines` 34, `portal-requests` 32, `reports` 12, damage checks for `8-TST-02`, `255-XT-785`, `27TNJ2`, `29XT569`, … from the original dev environment). Whether a `uploads` file is referenced cannot be told from the DB because path bases differ per feature.

## 7. Transaction tests (Part B)

Storage code was read first: `db.transaction` exists only in `deleteVehicle` (database-storage.ts:540), `restoreDeletedRecord` (:663), `restoreDeletedFine` (:751), `applyTransportUpdate` (:2029), the three default-template switches (:4101/4119/4152) and `assignDriverToReservation` (services/driver-assignments.ts:23). Everything below was run against :5001 with SQL read-back; SQL writes only on `AUDIT-P12` rows to set up the failure.

| # | Workflow | Steps | Failure injected | Expected (atomic) | Actual rows left | tx? |
|---|---|---|---|---|---|---|
| a1 | Vehicle delete (`DELETE /api/vehicles/1788`) | snapshot into deleted_records → delete documents/expenses/reservations/damage checks/waitlist → delete vehicle | `interactive_damage_checks` row on **another** vehicle referencing reservation 3407 (FK NO ACTION) so the reservation delete fails | nothing changes, clear error | **Rolled back correctly**: vehicle, reservation intact, 0 deleted_records rows (sequence advanced 44→45 only). Response 500 with the raw pg error object (`code 23503`, table and constraint names). Side finding: a damage check on another vehicle blocks the delete entirely | yes (database-storage.ts:540) |
| a2 | Vehicle delete + restore with links from other tables | as a1, then `POST /api/deleted-records/46/restore` | none needed — observe what the cascade destroys | delete and restore are inverse operations | Delete 200. FK side-effects not in the snapshot: `vehicle_transports.reservation_id` 54→null (SET NULL), `fines` 513 vehicle_id+reservation_id→null, `apk_date_changes` 12 deleted (CASCADE), `reservation_driver_assignments` 295 deleted (CASCADE), `scan_events` 81 left dangling; document 306 (reservation-only, vehicle_id null) left orphaned and not counted (`relatedCounts.documents = 0`). After restore 200: reservation back, but transport/fine links still null, apk row and driver assignment gone for good | yes, but snapshot incomplete (:546-575) |
| b1 | Reservation pickup (`POST /api/reservations/3409/pickup`) | update reservation (status, contract number, mileage, actual_pickup_date) → compute vehicle status → update vehicle → contract PDF → document | vehicle set to `not_for_rental` (own row) so `getStatusOnPickup` throws after the reservation write | 400, reservation stays `booked`, contract number free | **400 returned, reservation is `picked_up`** with contract_number `AUDIT-P12-3409`, pickup_mileage 5000, actual_pickup_date set; vehicle untouched (mileage 1000, not rented); no document. Retry → 400 "Cannot pickup reservation with status: picked_up". Recovery only via `PATCH /status {booked}` (reverse allow-list) which cleared the fields | **no** (database-storage.ts:1662-1713) |
| b2 | Pickup with a broken PDF template (template 8, missing background) | as b1 with `templateId: 8` | template background file absent | either a contract or a clear failure | 200; generator fell back to the built-in layout (pdf-generator.ts:94-124) and produced a 310 KB contract; nothing to roll back. The PDF step is wrapped in try/catch (routes.ts:4144-4226) so a real generator failure would still leave the reservation `picked_up` without a contract document and return 200 — not injectable through the API without changing code | no |
| c1 | maintenance-with-spare, 2nd assignment references reservation 99999999 | pre-validate all → create block → delete old placeholders → create replacements | invalid reservation id | 400, no writes | 400 "Reservation 99999999 not found"; 0 blocks, 0 spares — pre-validation (routes.ts:2818-2915) runs before any write | no, but effectively atomic here |
| c2 | maintenance-with-spare, both assignments claim the same spare 1795 for the same 10 days | as c1 | conflicting assignments within one request | 409 for the second assignment | **201**: block 3413 + replacements 3414 (cust 1277) and 3415 (cust 1278) both on vehicle 1795, identical dates — spare double-booked by one request (each assignment is validated against the DB only, :2898-2909) | no |
| c3 | maintenance-with-spare with spare vehicle id 98765432 | as c1 | non-existent spare | 400 | 201; replacement 3418 with vehicle_id 98765432 (BUG-039) | no |
| d | `POST /api/transports` swap with spare 1798 that has a rental starting on the transport date | insert transport → applyTransportUpdate (tx: conflict check, spare reservation, markVehicleForService) | intended: conflict | 409, no rows | **201**: transport 55 with spare reservation 3420 on vehicle 1798 for 2027-12-04, while rental 3419 (booked 2027-12-04..06) exists — conflict check bypassed (see D12-002) | partly |
| d2 | same with rental 2028-01-12..15 strictly containing the transport date | as d | genuine conflict | 409, no transport row | **409, but transport 59 exists** with spare_required=false, related_vehicle_id null, visible in `GET /api/transports`; vehicle maintenance status correctly not changed (rolled back inside the tx) | insert outside the tx (routes.ts:7411-7422) |
| e | Placeholder assign-vehicle, two staff assign different vehicles at once | update reservation → mirror transport → delete notification | concurrent `POST …/3422/assign-vehicle` with vehicles 1800 and 1801 | second call 404/409 | both 200, each response claims its own vehicle; final row vehicle 1801 (last write wins); notification deleted; no duplicate reservation | no (database-storage.ts:3017-3103) |
| f | Portal maintenance approval (`POST /api/portal-requests/594/approve`) twice concurrently | create block → update notes → set rental spare decision → placeholder → mileage → sync → notification → mail → reply message → request status | concurrency + SMTP unreachable (`email_config` smtpHost 127.0.0.1:1, set by an earlier phase) | second approval 400 "already closed"; one block | **two blocks 3424 and 3425** (both `active`, same dates, portal_request_id 594), two reply messages (222, 223), two portal notifications (418, 419), one placeholder 3426 (dedupe inside `createPlaceholderReservation`), request `done`. Mail: `sendEmail` returned false (email-service.ts:298-309), 0 rows in `email_logs`, no error to staff | no (routes/portal-requests.ts:307-347; `finish` :47) |
| f2 | Single approval, timed | as f | SMTP unreachable | 200 | 200 in 85 ms; block 3449, portal notification 422 (`maint:3449:planned`), `email_logs` still 0 rows | no |
| h | `POST /api/vehicles/bulk-import-csv` 5 rows, row 2 invalid (`licensePlate: 12345`) | per-row create | TypeError in row 2 | rows before/after imported, failures reported (documented behaviour) | 200: imported AU-12P-X, AU-12Q-X; failed: 12345 (`licensePlate.replace is not a function`), `au12px` (normalised duplicate caught), exact duplicate caught. Non-atomic by design; `getAllVehicles()` is called once per row (routes.ts:933) | no (by design) |
| i | `DELETE /api/customers/1279` with driver 859, reservation 3427 (driver assigned), waitlist row | single `DELETE customers` (cascades by FK) | `vehicle_waitlist` row (FK NO ACTION) | either blocked cleanly or fully removed | first attempt 500 with the raw pg error, nothing deleted (single statement, atomic). After removing the waitlist row: 204; driver and assignment cascaded (assignment 296 driver_id→null), **reservation 3427 remains with customer_id 1279 and is served by `GET /api/reservations/3427`** (BUG-007); no deleted_records snapshot. Portal-account creation returned 400 in this fixture, so the portal_users cascade was not exercised here (FK CASCADE confirmed from the schema) | n/a |
| j | Restore raced against a new vehicle taking the plate | delete vehicle 1806 → parallel restore ×2 + `POST /api/vehicles AU-12S-X` | plate taken mid-flight | consistent outcome | create won (1807); both restores 409 LICENSE_PLATE_TAKEN; record 47 unrestored; reservation 3428 exists only inside the snapshot. DB consistent | yes |
| j2 | Three parallel restores of record 49 | restore ×3 | concurrency | one 200, others 409 | 500 `duplicate key value violates unique constraint "vehicles_pkey"`, 200, 409 (BUG-043). DB consistent: one vehicle, reservation and document back, restored_at set once. Two `vehicle.delete` audit rows for one delete; the restore is logged as `vehicle.update` | yes (id/plate checks outside the tx, :648-661) |
| k | `POST /api/reservations` one-day rentals against rental 3450 (2028-02-02..05) | conflict check → insert | none — deterministic | 409 for any day inside the range | one-day on the **first day** (3451) → 201; identical one-day ranges 3454/3455 on 2028-03-03 → 201 both; `GET /api/reservations/check-conflicts` → `[]`; one-day in the middle → 409 (correct); one-day on the last day → 201 (turnover, by design) | no |

## 8. BUGs

```
BUG D12-001
Severity: HIGH
Feature: Reservation pickup (POST /api/reservations/:id/pickup)
Status: OPEN
Reproduction: Vehicle AU-12E-X (1792) set to availability_status='not_for_rental'; reservation 3409 booked today; POST /api/reservations/3409/pickup {contractNumber:"AUDIT-P12-3409", pickupMileage:5000, fuelLevelPickup:"full"}.
Expected: 400 and no change: reservation stays 'booked', contract number unused, vehicle untouched.
Actual: 400 "Cannot pickup vehicle that is marked as not for rental" but reservations row is now status='picked_up', contract_number='AUDIT-P12-3409', pickup_mileage=5000, actual_pickup_date set; vehicles row unchanged (current_mileage 1000, not 'rented'); no contract document. A retry is refused ("Only 'booked' reservations can be picked up"); the contract number is burned (unique index) until someone reverses the status by hand.
Root cause: server/database-storage.ts:1662-1713 pickupReservation writes the reservation (:1662) before it evaluates getStatusOnPickup (:1699-1703) and writes the vehicle (:1709); no db.transaction. returnReservation (:1751-1786) has the same shape. The route (server/routes.ts:4067-4245) also runs the contract-number override and the PDF/document step outside any transaction.
Affected files: server/database-storage.ts, server/routes.ts, server/vehicle-status-helper.ts
Affected data: 1 audit row (3409, reverted via PATCH /status). Pre-existing candidates: 8 vehicles 'rented' without a picked_up rental / 62 vehicles with a picked_up rental but not 'rented' are consistent with half-applied pickups/returns but cannot be attributed without logs.
Security impact: none directly.
Business impact: a rental that the desk believes failed is recorded as handed over; the vehicle keeps showing available; the next legitimate pickup fails on status; the contract number sequence gets a hole.
Fix: wrap pickupReservation/returnReservation in db.transaction (evaluate getStatusOnPickup and the mileage rule before any write, or write vehicle first); make the route's document step either part of the transaction or an explicit "contract pending" state.
Regression test: not_for_rental vehicle + booked reservation → pickup → assert 400 and reservation.status='booked', contract_number null, vehicle unchanged; then set vehicle available → pickup → 200 with document row.
```

```
BUG D12-002
Severity: HIGH
Feature: Availability check (checkReservationConflicts) — one-day reservations
Status: OPEN
Reproduction: Vehicle 1819 has rental 3450 booked 2028-02-02..2028-02-05 (no times). POST /api/reservations {vehicleId:1819, customerId:1278, startDate:"2028-02-02", endDate:"2028-02-02"} → 201 (id 3451). Create two identical one-day rentals 2028-03-03..2028-03-03 → both 201 (3454, 3455). GET /api/reservations/check-conflicts?vehicleId=1819&startDate=2028-03-03&endDate=2028-03-03 → []. Same hole via POST /api/transports: spare reservation 3420 (2027-12-04, times 00:00-23:59) accepted on vehicle 1798 although rental 3419 runs 2027-12-04..06.
Expected: a reservation whose only day lies inside another live reservation (first day, or the same single day) conflicts; the same-day-turnover exception should only apply when one side ends on the day the other starts.
Actual: any reservation with startDate = endDate = D is accepted when an existing reservation starts or ends on D and either side has no time, including identical ranges. The comment at database-storage.ts:1550-1557 claims "an identical range always still conflicts" — false for single-day ranges.
Root cause: server/database-storage.ts:1558-1578: the NOT(...) turnover clause fires on (existing.end_date = new.start_date) OR (new.end_date = existing.start_date) with NULL times treated as "no conflict"; for a one-day request both equalities hold against the boundary of a multi-day rental. applyTransportUpdate's explicit 00:00/23:59 window (:2093-2097) does not help because the existing rental's times are NULL.
Affected files: server/database-storage.ts (checkReservationConflicts, applyTransportUpdate, assignVehicleToPlaceholder, createReplacementReservation), server/routes.ts (POST /api/reservations, /basic, check-conflicts), server/routes/portal-requests.ts (approveBooking)
Affected data: audit rows 3451, 3454/3455, 3420 (vehicle 1798). Pre-existing: the 50 double-booking pairs in section 3 include 2 identical-range pairs (vehicle 206: 21/297; vehicle 428: 17/820 overlap by one day) consistent with this hole.
Security impact: none.
Business impact: deterministic double bookings from the normal booking form and from every transport with a spare — one-day spares/transports are the common case.
Fix: treat a request as a turnover only when it is not fully contained in the existing range, i.e. require new.startDate <> new.endDate or existing.startDate <> existing.endDate, and never apply the exception when new.startDate = existing.startDate; add a regression fixture for identical single-day ranges.
Regression test: existing D..D+3 → POST one-day D → 409; one-day D+3 → 201 (turnover); identical one-day twice → second 409; transport spare on a vehicle whose rental starts that day → 409.
```

```
BUG D12-003
Severity: HIGH
Feature: POST /api/reservations/maintenance-with-spare — spare assignments validated only against the database
Status: OPEN
Reproduction: Vehicle 1794 with rentals 3411 (cust 1277) and 3412 (cust 1278); POST maintenance-with-spare with two spareVehicleAssignments both {spareVehicleId:1795, startDate:S, endDate:S+9}.
Expected: 409 for the second assignment (spare 1795 already claimed in the same request); nothing written.
Actual: 201; block 3413 plus replacements 3414 and 3415, both on vehicle 1795 for identical dates, two customers.
Root cause: server/routes.ts:2818-2915 pre-validates each assignment with storage.checkReservationConflicts against the DB (Promise.all, :2898-2909) and never against the other assignments in the payload; creation (:2960-3042) then inserts without re-checking and without a transaction.
Affected files: server/routes.ts
Affected data: audit rows 3413/3414/3415.
Security impact: none.
Business impact: the maintenance planner can hand the same spare car to two customers for the same period; the second customer finds no car.
Fix: after pre-validation, check the assignments against each other (same spareVehicleId with overlapping dates → 409), then insert block + replacements in one db.transaction.
Regression test: two assignments sharing a spare vehicle with overlapping dates → 409 and zero rows; non-overlapping → 201 with both rows.
```

```
BUG D12-004
Severity: MEDIUM
Feature: Portal maintenance approval (POST /api/portal-requests/:id/approve)
Status: OPEN
Reproduction: Portal request 594 (type maintenance, rental 3423, needsReplacement). Send two approve calls concurrently ({startDate:"2026-09-18", durationDays:2}).
Expected: one 200, the other 400 "Request is already closed"; one maintenance block.
Actual: both 200; two maintenance blocks 3424 and 3425 (same vehicle, same dates, both status 'active', both portal_request_id 594), two staff replies (messages 222, 223), two portal notifications (418, 419); one placeholder (3426) because createPlaceholderReservation has a duplicate check. Also true for a fast double click in the UI.
Root cause: server/routes/portal-requests.ts:308 checks isValidRequestTransition on a row read before the writes; the ten writes in approveMaintenance (:320-347) and finish (:47) run without a transaction or row lock, so the second request passes the same check. The same shape applies to approveBooking (:205-259) and approveMaintenanceChange (:349-394).
Affected files: server/routes/portal-requests.ts, server/services/portal-requests-storage.ts
Affected data: audit rows 3424/3425 (request 594).
Security impact: none.
Business impact: duplicate maintenance blocks (BUG-037 data) and duplicate customer notifications from one click.
Fix: perform the status transition as a conditional UPDATE (`... WHERE status IN (allowed)`) at the start and abort when 0 rows are affected; wrap the approval writes in db.transaction.
Regression test: two concurrent approvals → exactly one block, one reply, one notification; second call 400.
```

```
BUG D12-005
Severity: MEDIUM
Feature: POST /api/transports with spare assignment
Status: OPEN
Reproduction: Spare vehicle 1815 has rental 3443 2028-01-12..15. POST /api/transports {vehicleId:1814, transportType:"swap", scheduledDate:"2028-01-13", spareRequired:true, relatedVehicleId:1815, isBreakdownOrMaintenance:true}.
Expected: 409 and no transport row.
Actual: 409 "Replacement vehicle has conflicting reservations for this date" — but transport 59 exists (status scheduled, spare_required false, related_vehicle_id null, is_breakdown false) and is listed in GET /api/transports. Staff who retry create a second transport.
Root cause: server/routes.ts:7411-7422 inserts the bare transport with storage.createTransport (no tx) and only then calls applyTransportUpdate, whose transaction rolls back its own writes (vehicle maintenance status was correctly untouched) but not the earlier insert.
Affected files: server/routes.ts, server/database-storage.ts
Affected data: audit row vehicle_transports 59. Pre-existing candidates: transport 42 (spare_required, no spare reservation) may be this shape.
Security impact: none.
Business impact: phantom transports on the Transports page after a failed save; duplicates on retry.
Fix: run createTransport inside the same db.transaction as applyTransportUpdate (pass tx), or delete the inserted row when applyTransportUpdate throws.
Regression test: conflicting spare → 409 and count(vehicle_transports where reason=…) = 0.
```

```
BUG D12-006
Severity: MEDIUM
Feature: Vehicle delete snapshot / recycle-bin restore
Status: OPEN
Reproduction: Vehicle 1790 with reservation 3408; transport 54 (other vehicle) with reservation_id 3408; fine 513 with vehicle_id 1790 and reservation_id 3408; apk_date_changes 12; reservation_driver_assignments 295; document 306 with reservation_id 3408 and vehicle_id null; scan_events 81. DELETE /api/vehicles/1790 (200) then POST /api/deleted-records/46/restore (200).
Expected: restore puts back everything the delete took away; the delete confirmation counts everything that will be affected.
Actual: after restore the reservation is back but vehicle_transports.reservation_id, fines.vehicle_id and fines.reservation_id stay NULL (FK SET NULL fired during the delete), apk_date_changes 12 and driver assignment 295 are gone (FK CASCADE), scan_events 81 pointed at a missing vehicle in between; document 306 was orphaned during the delete and relatedCounts reported documents: 0. Additionally (test a1) a damage check on another vehicle that references one of the vehicle's reservations makes the whole delete fail with a raw 500 (FK NO ACTION on interactive_damage_checks.reservation_id).
Root cause: server/database-storage.ts:546-575 snapshots only rows selected by vehicleId in 7 tables; the FK rules on fines, vehicle_transports.reservation_id, apk_date_changes, reservation_driver_assignments, delivery_tasks, portal_requests.reservation_id, interactive_damage_checks.reservation_id (schema.ts) act on the cascaded reservations and are neither captured (:546-575) nor replayed (:663-715); getVehicleDeleteImpact (:498-527) counts documents by vehicleId only.
Affected files: server/database-storage.ts, shared/schema.ts
Affected data: audit rows listed above. Pre-existing: cannot be measured (the links are already gone), but 11 restored vehicle snapshots exist.
Security impact: none.
Business impact: fines lose their vehicle/rental attribution, transports lose their rental link, APK alerts and driver assignments vanish silently on delete+restore; the delete dialog under-reports impact.
Fix: extend the snapshot to every table with an FK (direct or via the reservations) and restore them; count reservation-linked documents in the impact; catch FK errors and return a 409 with the blocking table instead of the raw pg error. Making reservations.vehicle_id a real FK with a documented cascade needs owner approval.
Regression test: fixture as above → delete → restore → assert all links equal to before; delete with a foreign damage check → 409 with a message, no 500.
```

```
BUG D12-007
Severity: MEDIUM
Feature: Maintenance blocks and spare notifications referencing rows that no longer exist (pre-existing data)
Status: OPEN
Reproduction: select count(*) from reservations r where deleted_at is null and vehicle_id is not null and not exists (select 1 from vehicles v where v.id=r.vehicle_id) → 262 (243 with created_at < 2026-09-09), 258 of them type maintenance_block status 'active', 163 distinct vehicle ids 1022..1660, created 2026-09-06 19:52 .. 2026-09-08 by createMaintenanceBlock (notes "Vehicle maintenance block", created_by null); 139 have start_date >= today. select count(*) from custom_notifications n where type='spare_assignment' and the [placeholder:N] id does not exist → 55 of 62 (51 pre-existing, all unread), e.g. 171 [placeholder:2329].
Expected: a block cannot outlive its vehicle; a notification cannot outlive its placeholder.
Actual: the vehicles were removed without any deleted_records row or vehicle.delete audit row (0 audit rows for ids 1022-1660), so the blocks stay 'active' forever and are counted by every calendar/availability query that joins on vehicle_id; the placeholders were hard-deleted (storage.deleteReservation, the BUG-004 path) leaving their notifications.
Root cause: reservations.vehicle_id has no FK (shared/schema.ts:711) and custom_notifications carries the placeholder id inside description text, so nothing cleans up; the source event was a hard delete outside the application's delete path.
Affected files: shared/schema.ts, server/database-storage.ts (createMaintenanceBlock :3329, deleteReservation :1270, deleteNotificationsByTypeAndPattern)
Affected data: 243 pre-existing blocks (ids 2175-3199), 51 pre-existing notifications; 19 audit blocks (e.g. 3218) and 4 audit notifications.
Security impact: none.
Business impact: 139 phantom "active" maintenance blocks in the future calendar window; 62 unread staff notifications that can never be resolved.
Fix: one-off cleanup (soft-delete blocks whose vehicle is missing; delete notifications whose placeholder is missing) — needs owner approval; add an FK on reservations.vehicle_id (or a nightly integrity job) and store the placeholder id in a column with a FK.
Regression test: integrity query above returns 0 after cleanup; creating a block for a non-existent vehicle → 400.
```

```
BUG D12-008
Severity: MEDIUM
Feature: Reservation / vehicle lifecycle states in pre-existing data
Status: OPEN
Reproduction: select count(*) from reservations where deleted_at is null and status='picked_up' and end_date < current_date::text → 358 (357 pre-existing; 344 have no actual_pickup_date, 480 picked_up rows have no pickup_mileage); … and start_date > current_date::text → 130 (126 pre-existing); status='booked' and type='standard' and start_date < today-30 → 336 (335 pre-existing); 62 vehicles have a live picked_up rental but availability != 'rented'; 8 vehicles are 'rented' without any picked_up rental.
Expected: a 'picked_up' rental has a pickup date and mileage and started; a vehicle is 'rented' iff a rental is picked up.
Actual: 1 in 4 live reservations is in a state the pickup/return flow cannot produce (picked up before the start date, or picked up with no handover data), and vehicle availability disagrees with the rentals for 70 vehicles. syncVehicleAvailabilityWithReservations (database-storage.ts:224-353) only reconciles available/scheduled/rented from dates, ignores maintenance blocks, and never derives needs_fixing; no job flags overdue returns.
Root cause: pre-existing data imported/seeded outside the state machine (no audit rows) plus the non-atomic pickup/return (D12-001) and status writes via generic PATCH (BUG-016/BUG-084).
Affected files: server/database-storage.ts, server/vehicle-status-helper.ts
Affected data: counts above; samples 214, 796, 1303 (picked_up, end 2026-02), 353 on vehicle 13 (picked_up, starts 2026-09-27), vehicles 2, 4, 41, 74, 82, 240 ('rented' with no rental).
Security impact: none.
Business impact: overdue/return dashboards and fleet availability are wrong for a large share of the fleet; contract regeneration and mileage reports lack pickup data.
Fix: data reconciliation script (owner approval): picked_up with start_date in the future → booked; picked_up past end_date without actual data → flag for review; recompute vehicles.availability_status from rentals + blocks. Add a DB CHECK or application guard that picked_up requires actual_pickup_date and pickup_mileage.
Regression test: integrity queries above return 0 after reconciliation; PATCH /:id {status:'picked_up'} without pickup data → 400.
```

```
BUG D12-009
Severity: LOW
Feature: Contract numbers — leading zeros and free text
Status: OPEN
Reproduction: select ltrim(contract_number,'0'), array_agg(id) from reservations where contract_number is not null and deleted_at is null group by 1 having count(*)>1 → '100' (131 '0100', 525 '100'), '11' (12 '0011', 199 '11'), '12' (13 '0012', 1392 '12'). 992 of 1049 contract numbers carry a leading zero, 35 are non-numeric.
Expected: one canonical format; the unique index reflects business uniqueness.
Actual: the unique index on the raw text lets '0100' and '100' coexist; getNextContractNumber (database-storage.ts:3626) parses numbers, so the suggested next number can collide with a zero-padded existing one and the override comparison (routes.ts:4085-4094) uses trimmed strings.
Root cause: contract_number is free text with no normalisation on write (shared/schema.ts:727, routes.ts:4074-4136).
Affected files: server/routes.ts, server/database-storage.ts, shared/schema.ts
Affected data: 3 pre-existing pairs; all pre-existing rows use zero padding while audit rows do not.
Security impact: none.
Business impact: two contracts can carry the "same" number on paper; lookups by number miss one variant.
Fix: normalise on write (strip leading zeros or fix the width), add a unique index on the normalised value (needs owner approval for the migration), and make getNextContractNumber use the same normalisation.
Regression test: create with '0100' when '100' exists → 409.
```

```
BUG D12-010
Severity: LOW
Feature: Error responses when a delete is blocked by a foreign key
Status: OPEN
Reproduction: DELETE /api/vehicles/1788 while an interactive_damage_checks row (on another vehicle) references its reservation; DELETE /api/customers/1279 while a vehicle_waitlist row references the customer.
Expected: 409 with a message naming what blocks the delete.
Actual: 500 with the complete pg error object in the body (severity, code 23503, detail "Key (id)=(3407) is still referenced from table interactive_damage_checks", schema, table, constraint, file/line of the server). Nothing is deleted (correct).
Root cause: server/routes.ts:1685-1688 and :2131 send `error` verbatim (`res.status(500).json({ message, error })`).
Affected files: server/routes.ts
Affected data: none.
Security impact: internal schema and constraint names leak to any user with MANAGE_VEHICLES/MANAGE_CUSTOMERS (same class as BUG-057/BUG-103).
Business impact: staff cannot tell why the delete failed.
Fix: map 23503 to 409 with a translated message; never serialise the error object.
Regression test: blocked delete → 409, body contains no "constraint"/"schema" keys.
```

```
BUG D12-011
Severity: LOW
Feature: Placeholder assign-vehicle under concurrency
Status: OPEN
Reproduction: two concurrent POST /api/placeholder-reservations/3422/assign-vehicle with vehicleId 1800 and 1801.
Expected: second call 409/404; one caller told the truth.
Actual: both 200, each response echoes its own vehicle; the row ends with vehicle 1801 (last write wins) and the note text of the last writer; the caller who was told "1800 assigned" is wrong.
Root cause: server/database-storage.ts:3017-3103 reads the placeholder, checks conflicts and updates in three separate statements without a transaction or a conditional UPDATE on placeholder_spare = true.
Affected files: server/database-storage.ts
Affected data: audit row 3422.
Security impact: none.
Business impact: two planners can believe two different spares were arranged; one spare is never reserved.
Fix: `UPDATE reservations SET … WHERE id=$1 AND placeholder_spare AND vehicle_id IS NULL` and return 409 when 0 rows are affected; keep the transport mirror in the same transaction.
Regression test: concurrent assigns → exactly one 200.
```

```
BUG D12-012
Severity: LOW
Feature: Enum drift between shared/schema.ts and what the server writes
Status: OPEN
Reproduction: see section 4: reservations.status 'active' (265 live blocks) and 'pending' (4 replacements) written by createMaintenanceBlock (database-storage.ts:3329) and createReplacementReservation (:3224); vehicles.availability_status 'scheduled' (42 rows) written by syncVehicleAvailabilityWithReservations (:224-353) — neither value is in ReservationStatus/VehicleAvailabilityStatus (schema.ts:18-31) nor in VALID_RESERVATION_TRANSITIONS (:42-48); fuel levels 'Full'/'half' (15 rows across three columns).
Expected: one source of truth for allowed values; every writer uses it.
Actual: 278 live reservations and 44 vehicles hold values that the status API refuses to transition and that the UI filters do not know (maintenance-transport.md "Additional evidence" left this unfiled; giving it an id here so it is tracked).
Root cause: hard-coded literals in the storage layer; text columns without CHECK constraints.
Affected files: server/database-storage.ts, shared/schema.ts, server/vehicle-status-helper.ts
Affected data: 248 pre-existing reservations, 33 pre-existing vehicles, 7 pre-existing fuel rows.
Security impact: none.
Business impact: blocks in 'active' can never be completed/cancelled through PATCH /:id/status; availability filters miss 'scheduled' vehicles.
Fix: write 'booked' for blocks/replacements (as assignVehicleToPlaceholder and applyTransportUpdate already do), add 'scheduled' to the enum or stop writing it, lower-case fuel levels; optionally CHECK constraints (owner approval).
Regression test: after the fix, select distinct status/availability_status is a subset of the enums.
```

```
BUG D12-013
Severity: LOW
Feature: Outgoing mail failures are invisible
Status: OPEN
Reproduction: email_config has smtpHost 127.0.0.1 port 1 (unreachable). Approve portal request 595 → 200 in 85 ms; portal notification 422 written; email_logs has 0 rows; no warning in the response.
Expected: a failed customer mail is recorded (email_logs.emails_failed/failure_reason) and visible to staff.
Actual: sendEmail returns false (server/utils/email-service.ts:298-309) and every caller discards the boolean (services/portal-maintenance-events.ts:92,117; routes/portal-requests.ts:56; routes/portal-admin.ts:62 only stores inviteSent). email_logs (which has the columns for it) stays empty for the whole audit database.
Root cause: return-false contract without logging; callers treat mail as fire-and-forget.
Affected files: server/utils/email-service.ts, server/services/portal-mail.ts, server/services/portal-maintenance-events.ts, server/routes/portal-requests.ts
Affected data: email_logs 0 rows despite dozens of mail-triggering actions during phases 9-12.
Security impact: none.
Business impact: customers never receive maintenance/spare/reply mails and nobody is told; the in-app notification exists, so staff assume the mail went out.
Fix: write an email_logs row on every attempt (sent/failed + reason); surface `mailSent:false` in approval/reply responses and the request timeline.
Regression test: unreachable SMTP → approval 200 with mailSent:false and one email_logs row with failure_reason.
```

Severity totals (new): HIGH 3 (D12-001, D12-002, D12-003), MEDIUM 5 (D12-004 … D12-008), LOW 5 (D12-009 … D12-013).

## 9. Re-confirmed existing bugs (with data evidence)

- **BUG-006** double booking: 50 pre-existing genuine overlap pairs on 46 vehicles in the clone (list in `p12-scan.json → summary.doubleBookingsPreDetail`), plus 187 audit pairs. D12-002 adds a deterministic path.
- **BUG-007** customer hard delete: test i — reservation 3427 kept customer_id 1279 after the delete and is still served by the API; drivers/portal settings cascade silently; no snapshot.
- **BUG-014** dangling replacements: 3 live (1503 pre-existing → original 84 completed; 3221; 3357 placeholder → original cancelled).
- **BUG-016 / BUG-084** status/mass assignment: rows with status 'garbage' (3293), 'confirmed' (3213-3222), end_date 'not-a-date' (3442), damage_check_path '/tmp/AUDIT-path' (3304).
- **BUG-020** plate normalisation: 2 groups (1671/1699/1700; 1766/1769) — the unique index is on the raw string.
- **BUG-021** availability free text: 2 rows 'banana_not_real'.
- **BUG-022** vehicle delete removes other customers' reservations: test a2/j — reservations live only inside the snapshot while deleted; restore blocked when the plate is re-created (j).
- **BUG-027** N documents per file: 9 groups / 20 extra rows (3 groups pre-existing: 27/28/29, 31/32).
- **BUG-032** two active replacements: originals 3236 and 3336.
- **BUG-037** overlapping blocks: 160 live pairs (146 pre-existing), 28 exact duplicate groups.
- **BUG-039** reservations on non-existent ids: 3230, 3241, replacement 3418 (spare vehicle 98765432), expense 2003 → vehicle 999999.
- **BUG-040** overdue guard: 3233 (start 2020-01-01) and 335 pre-existing stale 'booked' rows.
- **BUG-043** parallel restore: test j2 — 500 duplicate key + 200 + 409; DB consistent.
- **BUG-045** duplicate debtor numbers: 1264/1265.
- **BUG-050** template files left behind: `audit-uploads\templates` 1 file without row.
- **BUG-052** maintenance_status free text: 'garbage' (3217).
- **BUG-055** reservation delete orphans: 15 documents (5 pre-existing) and driver assignment 287 on soft-deleted reservations.
- **BUG-060** receipt paths: all 4 expenses.receipt_file_path rows are absolute machine paths; none resolve on this machine.
- **BUG-090 / BUG-057 class**: raw error objects in 500 bodies (D12-010 for the FK case).
- **BUG-095** active_sessions never pruned: 176 rows (55 pre-existing, oldest 2026-08-21), 171 without a session-store row, all "unexpired".
- Phase-1 item 12 (double audit rows): 22 groups; every vehicle delete logs twice.

## 10. Not tested (why)

- Backup/restore atomicity — phase 17 (out of scope by instruction).
- Vehicle delete with an oversized snapshot or a concurrent restore during the delete: no injection point via the API without code changes; the FK-failure case (a1) proves the transaction rolls back.
- Pickup with a genuinely failing PDF generator: template 8's missing background falls back to the built-in layout (pdf-generator.ts:94-124); the try/catch at routes.ts:4144-4226 means a real failure would still commit the pickup — documented from code, not runtime-proven.
- Reservation DELETE cascade loop (routes.ts:4621-4700) mid-loop failure: no injection point; concurrency case is BUG-090.
- portal_users cascade on customer delete: account creation returned 400 in fixture i (payload shape), cascade taken from the FK definition.
- Slow (timing-out) SMTP: the configured host refuses instantly; only "unreachable" was measured (85 ms approval).
- File existence for `documents.file_path` against a production `UPLOADS_DIR`: only the two local bases were checked.
- `lvstest` database and port 5000: never touched.

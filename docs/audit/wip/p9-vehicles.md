# Phase 9 — Vehicle management (lifecycle chain) — QA/security audit

2026-09-10. Audit server `http://localhost:5001`, database `lvs_audit` only. Admin session `admin` plus a second staff session `AUDIT-manager-1788982804001` (role manager, created in an earlier phase) for the concurrency cases; each `Session` uses its own `fakeIp` (`10.9.1.40` / `10.9.1.41`) so the general 1000/15 min `apiLimiter` and the login limiter do not collide with other agents. Sessions are persisted in `scripts/p9-session-*.json` and reused (one login per session name).

Scripts (run from the repo root with `node docs/audit/wip/scripts/<name>`), outputs next to them:

| Script | Covers | Output |
|---|---|---|
| `scripts/p9-lib.cjs` | session reuse, fake IP, step/SQL logger | – |
| `scripts/p9-01-lifecycle.cjs` | create → edit (APK/warranty/service) → concurrent edit → barcode → mileage (pickup/return/manual) → maintenance vs booked/picked-up → documents | `scripts/p9-out-01.txt` |
| `scripts/p9-02-delete-restore.cjs` | transport assignment → delete vehicle with reservations of two customers + documents + driver + blacklist + expense + transports + APK change + fine → reserve the deleted vehicle → restore → row-by-row/file diff → restore twice → restore vs barcode collision | `scripts/p9-out-02.txt` |
| `scripts/p9-03-import-race-conflicts.cjs` | bulk-import-plates / bulk-import-csv success paths, blacklist race, reservation date edits vs check-conflicts, rapid concurrent booking, APK date-change confirm flow, delete while picked_up, audit rows | `scripts/p9-out-03.txt` |
| `scripts/p9-04-gaps.cjs` | empty-plate vehicle, orphaned files, plate rename with documents, warranty/APK window edges, overlaps endpoint, barcode via PATCH, PATCH-vs-pickup race, transport on deleted vehicle | `scripts/p9-out-04.txt` |

Main fixture: vehicle **V = id 1762 `AU-901-X`** (the whole chain ran on this one vehicle), **W = id 1764 `AU-902-X`**, customers 1275 (`AUDIT-P9-CustA-…`) and 1276 (`AUDIT-P9-CustB-…`), driver 858. All created data is prefixed `AUDIT-` / plates `AU-9xx-X` and left in place. The audit server never went down during this phase (`/health` 200 before and after every script; no CRITICAL crash finding).

"Archive": the application has **no archive concept for vehicles**. `grep -ri archiv server client/src` only hits backup code and the lucide `Archive` icon on the recycle-bin button in `client/src/pages/vehicles/index.tsx:634`; the only "inactive" status in `shared/schema.ts:402` belongs to drivers. The closest equivalents are `availabilityStatus = not_for_rental` (tested under status/maintenance below) and the recycle bin (delete → `deleted_records` → restore, tested in full).

## Tested (passed / working as intended)

- **Create** (`POST /api/vehicles`) with APK, warranty, last-service and interval fields: 201, row exact in `vehicles`, barcode `VEH-001762` auto-assigned, `audit_logs` row `vehicle.create` with label. The new vehicle immediately shows in `apk-expiring`, `warranty-expiring` and `service-due` (`isServiceDue:true` because lastServiceDate was 13 months back with a 12-month interval).
- **Edit** (`PATCH /api/vehicles/:id`): field update persisted with `updated_by`/`updated_at`; `audit_logs` `vehicle.update` carries a field diff (`remarks: null → "AUDIT-P9 edited"`). Same-field concurrent PATCH from two sessions: last writer wins, both 200, DB holds the later value (`AUDIT-SAME-B`) — expected.
- **Service-due scheduler** (`POST /api/vehicles/service-due/scan`): creates one `custom_notifications` row (`type=service_due`, tag `[service:1762]`, priority high) for the due vehicle; after logging a service (`lastServiceDate=today`, `lastServiceMileage=current`) a second scan removes it (`notificationsRemoved:1`). Idempotent on re-run.
- **APK / warranty reminder windows**: with default settings (30 days) a date is listed when it is within `[today − 2 months, today + 30 days]`: −70 d not listed, −40 d listed, today listed, +30 listed, +31 not listed — matches `getVehiclesWithApkExpiringSoon`/`…WarrantyExpiringSoon` (`server/database-storage.ts:826-851, 878-`). `not_for_rental` vehicles are excluded (default `maintenanceExcludedStatuses`). Empty-string dates are nulled. The 2-month past cut-off means a vehicle whose APK expired >2 months ago silently drops off the reminder list — design choice, flagged as an observation only.
- **APK date-change flow** (`/api/apk-date-changes`): pending list, `confirm` writes `vehicles.apk_date`, second confirm and a dismiss after confirm both cleanly 400 "already resolved"; `scan-status` reachable. `POST /api/documents` with `documentType=APK Inspection` + `apkDate` updates `vehicles.apk_date` (verified by SQL).
- **Mileage**: `PATCH /api/vehicles/:id/mileage` decrease without password → 400 `requiresOverride`; with `mileageOverridePassword` → 200 and the audit trail columns `previous_mileage`, `mileage_decreased_by`, `mileage_decreased_at` are filled; non-integer / string `currentMileage` on the generic PATCH → 400 zod. Pickup with mileage below current → 400 override required; pickup 39100 → vehicle `current_mileage=39100`, `availability_status=rented`, reservation `picked_up`, contract PDF row in `documents`; return below pickup → 409; return 39300 → vehicle 39300 / `available`, reservation `returned`, damage-check document row created.
- **Barcode**: `GET /api/barcodes/VEH-001762` resolves the vehicle (type `vehicle`); regenerate → `VEH-001762-R2`, old code 404, new code 200; duplicate barcode on `POST /api/vehicles` is rejected (409, but see V9-015 for the message) and on PATCH (400, unique constraint `vehicles_barcode_unique` holds).
- **Blacklist duplicate-add race**: 10 parallel `POST /api/vehicles/1762/blacklist` for the same customer → exactly one 201, nine clean 400 "already blacklisted", one row in `vehicle_customer_blacklist`. (The phase 3-5 doc suspected this race; it does not reproduce.)
- **Bulk import (success paths)**: `bulk-import-plates` imports valid plates as `brand/model = Unknown` with `created_by`, rejects exact/normalised duplicates inside one batch (`au-9p…-a`, `AU 9P… A` → "Vehicle already exists") and on re-import; `bulk-import-csv` imports valid rows, rejects an in-batch duplicate and a row without plate, maps `gps: "ja"` → true, Excel serial `companyDate: "46000"` → `2025-12-09`, `productionDate: "2020"` → `2020-01-01`.
- **Delete-impact + delete + restore (happy path)**: `GET /delete-impact` counts match SQL; `DELETE` with typed plate → `deleted_records` row with `payload` (vehicle, 8 reservations, 7 documents, 1 expense, 1 transport, 1 blacklist) and `related_counts`; restore → vehicle, all 8 reservations (same ids, same statuses incl. soft-deleted maintenance block), all 7 document rows, expense, blacklist and the vehicle's own transport (id 41 incl. its `reservation_id` link) come back, files still on disk and downloadable, `vehicles_id_seq` re-synced; second restore → 409 `ALREADY_RESTORED`.
- **Documents**: upload (`Other`, `APK Inspection`), list per vehicle, `DELETE /api/documents/:id` removes both row and file; after a vehicle delete the document row is gone and `GET /api/documents/:id` is 404; after restore the row and download work again.
- **Delete-vehicle confirmation** still works for normal plates (typed-plate mismatch cases were covered in phase 3-5).
- **Transport assignment**: `POST /api/transports` on V (tow, linked to reservation 3367) and on W with `spareRequired:true, relatedVehicleId:V` (creates a `replacement` reservation 3369 on V and links `spare_reservation_id`).
- **PATCH-vs-pickup race**: generic `PATCH /api/vehicles/:id {remarks}` fired 0–1200 ms after `POST /:id/pickup` on a fresh vehicle, 6 rounds — the pickup's `availability_status=rented`/`current_mileage` were never overwritten (0/6). Not reproducible with these timings; the general lost-update mechanism is still proven by V9-005.
- `GET /api/vehicles/:id/overlaps` without dates → clean 400. `GET /api/vehicles/available` does not list a deleted vehicle.

## Not tested (why)

- **RDW APK scan** (`POST /api/apk-date-changes/scan-now`, `server/utils/rdw-apk-scanner.ts`, nightly 02:30): it calls the external RDW open-data API for every vehicle (570+). Not triggered — outbound traffic to a third party from the audit box was not in scope; the confirm/dismiss side of the flow was tested with SQL-inserted `apk_date_changes` fixtures instead.
- **Backup/restore of vehicles via the backup service** — separate area (`backups.ts`), out of scope here.
- **Damage-check PDF generation / interactive damage checks on the vehicle** (`/api/vehicles/:id/damage-check-pdf`, `interactive_damage_checks`) — documents/mail area; only the row cascade on delete was observed (count 0 in fixtures).
- **Waitlist** (`vehicle_waitlist`) — no API to create entries was found in scope; only the delete snapshot key was observed.
- `GET /api/reservations?vehicleId=` — observed to return the full list (1947 rows) regardless of the query string; the route only reads `search` (`server/routes.ts` reservations list handler). Reservations area, noted for the reservations tracker, not filed here.
- Portal-side booking of a deleted/maintenance vehicle — portal is a separate phase.

## Findings summary

| ID | Sev | Feature | One line |
|---|---|---|---|
| V9-001 | HIGH | Reservation date edit | `PATCH /api/reservations/:id` skips the conflict check unless `vehicleId` **and** `startDate` are in the body → date-only edits create overlapping bookings; `check-conflicts` says 409, the write says 200 |
| V9-002 | HIGH | Recycle bin vs bookings | A deleted (recycle-bin) vehicle stays bookable (`check-conflicts` → `[]`, `POST /api/reservations` → 201); restore re-inserts the snapshotted reservations without any conflict check → double booking |
| V9-003 | HIGH | Pickup vs vehicle status | A vehicle in `needs_fixing` / `maintenance_status=in_service` (and with an open maintenance block) can be picked up; the pickup/return cycle erases the manual `needs_fixing`; `PATCH /:id/status {picked_up}` bypasses even the `not_for_rental` guard |
| V9-004 | MEDIUM | Delete/restore round trip | Restore silently loses: driver assignment, pending APK date change, fine ↔ vehicle/reservation links, other transports' spare-vehicle links (`related_vehicle_id`, `spare_reservation_id`) |
| V9-005 | MEDIUM | Concurrent vehicle edit | `PATCH /api/vehicles/:id` is read-merge-write of the whole row: two sessions editing different fields lose one of the updates in 5/5 rounds |
| V9-006 | MEDIUM | bulk-import-plates | Creates a vehicle with an empty license plate (id 1767); such a vehicle is deletable with `confirmLicensePlate:""`; non-string entries leak raw JS `TypeError` text |
| V9-007 | MEDIUM | bulk-import-csv dates | Dutch `dd-mm-yyyy` parsed as US `mm-dd` and shifted one day back; impossible dates rolled over; unparseable APK dates silently dropped; `productionDate` garbage stored verbatim |
| V9-008 | MEDIUM | Barcode | `barcode` is a free-form client field: can be set to another vehicle's plate (hijacks plate scans), to `RES-`/spare-key forms (dead barcode); regenerate collides with a client-set value → 500 |
| V9-009 | MEDIUM | Recycle bin restore | Restore blocked by a barcode collision returns raw 500 `duplicate key … vehicles_barcode_unique` (id and plate are pre-checked, barcode is not) |
| V9-010 | MEDIUM | Reservation mileage edit | After return, `PATCH /api/reservations/:id` accepts `returnMileage < pickupMileage` and `pickupMileage > returnMileage`, and never syncs `vehicles.current_mileage` |
| V9-011 | LOW | Status change warnings | `validateManualStatusChange` warnings ("vehicle has upcoming bookings") are only `console.log`ged, never returned to the client |
| V9-012 | LOW | Audit trail | Every vehicle delete writes two `vehicle.delete` rows (route + middleware); a restore is logged as `vehicle.update` |
| V9-013 | LOW | Transports | `POST /api/transports` with a deleted `vehicleId` or `relatedVehicleId` → unmapped 500 |
| V9-014 | LOW | Service fields | `serviceIntervalKm:-5`, `serviceIntervalMonths:0`, future `lastServiceDate`, `lastServiceMileage > currentMileage` all accepted; vehicle silently drops out of `service-due` |
| V9-015 | LOW | Barcode error mapping | Duplicate barcode on create reports "license plate already exists" (`field: licensePlate`); on PATCH the raw constraint name is returned |
| V9-016 | LOW | Document files | Vehicle delete leaves files on disk with no purge path; document folders are keyed by plate, so a renamed vehicle and a new vehicle reusing the old plate share one folder |

Counts: CRITICAL 0 · HIGH 3 · MEDIUM 7 · LOW 6.

## BUGs

```
BUG V9-001
Severity: HIGH
Feature: Reservations - date edits on an existing reservation (PATCH /api/reservations/:id)
Status: OPEN
Reproduction: scripts/p9-03-import-race-conflicts.cjs step D, p9-out-03.txt
  Fixtures on vehicle 1762: R5 = 3367 (booked, 2026-09-30..2026-10-05), R6 = 3368 (booked, 2026-10-10..2026-10-13), ghost 3370 (booked, 2026-10-01..2026-10-03).
  1. GET /api/reservations/check-conflicts?vehicleId=1762&startDate=2026-09-30&endDate=2026-10-11&excludeReservationId=3367 -> 200 [3370, 3368]  (conflicts reported)
  2. PATCH /api/reservations/3367 {"endDate":"2026-10-11"} -> 200, body endDate 2026-10-11
     SQL: select start_date,end_date from reservations where id=3367 -> 2026-09-30 / 2026-10-11 (now overlaps 3368 and 3370)
  3. (reset) PATCH /api/reservations/3368 {"startDate":"2026-10-04"} -> 200; SQL shows 3367 (09-30..10-05) and 3368 (10-04..10-13) overlapping.
  4. PATCH /api/reservations/3367 {"startDate":"2026-09-30","endDate":"2026-10-11"} (both dates, no vehicleId) -> 200, endDate 2026-10-11
  5. Control: PATCH /api/reservations/3367 {"vehicleId":1762,"startDate":"2026-09-30","endDate":"2026-10-11"} -> 409 "Reservation conflicts with existing bookings"; PATCH /3367/basic with the full row -> 409.
Expected: any change to startDate/endDate/startTime/endTime runs the same conflict check as create and as /basic; check-conflicts and the actual write must agree.
Actual: the conflict check in the generic PATCH only runs when the body contains vehicleId AND startDate. A partial PATCH with only endDate, only startDate, or both dates without vehicleId is written unchecked; the vehicle ends up double-booked while check-conflicts (used by the UI before saving) reports the conflict.
Root cause: server/routes.ts:3645 `if (reservationData.vehicleId && reservationData.startDate) { ... checkReservationConflicts(...) }` inside app.patch("/api/reservations/:id") (3445-). The comment above it even says "only if vehicle, startDate or endDate are being updated" but the condition is a conjunction on two of the three and endDate is not in it at all. For endDate-only bodies startDate is undefined so the block is skipped.
Affected files: server/routes.ts:3445-3700 (PATCH /api/reservations/:id)
Affected data: reservations 3367 / 3368 (dates reset afterwards); any reservation edited through the date-only path in production.
Security impact: none (requires MANAGE_RESERVATIONS).
Business impact: the most common edit ("extend the rental by a few days", "customer picks up a day earlier") silently creates a double booking that the create path and /basic would have refused; the UI's pre-check says conflict but the save succeeds, so staff trust the wrong one.
Fix (proposal only): run the conflict check whenever any of vehicleId/startDate/endDate/startTime/endTime is present in the body, using the merged (existing + patch) values: `const effective = {...existing, ...reservationData}; if (bodyTouches(['vehicleId','startDate','endDate','startTime','endTime'])) checkReservationConflicts(effective.vehicleId, effective.startDate, effective.endDate, id, ...)`.
Regression test (proposal): book A (d1..d5) and B (d10..d13) on one vehicle; PATCH A {endDate: d11} -> expect 409; PATCH B {startDate: d4} -> expect 409; assert rows unchanged.
```

```
BUG V9-002
Severity: HIGH
Feature: Recycle bin - a deleted vehicle remains bookable; restore does not reconcile bookings made while it was deleted
Status: OPEN
Reproduction: scripts/p9-02-delete-restore.cjs steps 2-5 (p9-out-02.txt); scripts/p9-04-gaps.cjs step H (p9-out-04.txt)
  1. Vehicle 1762 has booked reservation 3367 (customer 1275, 2026-09-30..2026-10-05). DELETE /api/vehicles/1762 {"confirmLicensePlate":"AU-901-X"} -> 200 restorable:true (deleted_records id 36; reservations hard-deleted, snapshot in payload).
  2. GET /api/reservations/check-conflicts?vehicleId=1762&startDate=2026-10-01&endDate=2026-10-03 -> 200 []   (vehicle does not exist, no conflict reported)
     GET /api/vehicles/1762 -> 404
  3. POST /api/reservations {"vehicleId":1762,"customerId":1276,"startDate":"2026-10-01","endDate":"2026-10-03","status":"booked"} -> 201 id 3370
     SQL: select id,vehicle_id,status from reservations where id=3370 -> 3370 / 1762 / booked. GET /api/reservations/3370 -> 200 with "vehicle": null; GET /api/reservations lists it with vehicle null.
  4. POST /api/deleted-records/36/restore -> 200 "Restored AU-901-X AUDIT-P9 Lifecycle."
  5. SQL: select a.id,b.id from reservations a join reservations b on same vehicle ... overlapping, both booked, vehicle_id=1762 -> (3367, 3370). GET check-conflicts 2026-10-01..2026-10-03 -> [3370, 3367]. Vehicle 1762 is now double-booked for 1-3 Oct for two different customers.
  6. Repeat on a fresh vehicle 1787 (AU-906-X): delete, then POST /api/reservations -> 201 id 3403 (still present as a ghost, vehicle_id 1787 has no vehicle row).
Expected: a vehicle in the recycle bin is not bookable (404 / 409 on POST and a conflict/"vehicle not found" from check-conflicts), or, failing that, restore must refuse/flag snapshotted reservations that now overlap rows created in the meantime.
Actual: the create path performs no vehicle-existence check (reservations.vehicle_id has no FK - see RS-009), check-conflicts finds nothing because the old rows were hard-deleted with the vehicle, and restoreDeletedRecord re-inserts the snapshot blindly. The ghost booking is invisible in the vehicle picker (the vehicle is gone) but is still served by GET /api/reservations with vehicle:null.
Root cause: server/routes.ts POST /api/reservations (~2435-2520): no `storage.getVehicle(vehicleId)` guard (RS-009 root cause); server/database-storage.ts:683-697 restoreDeletedRecord: `tx.insert(reservations).values(revive(reservations, payload.reservations))` with no overlap check against rows created after the delete; deleteVehicle (database-storage.ts:592-599) hard-deletes the reservations so checkReservationConflicts has nothing to compare against.
Affected files: server/routes.ts (POST /api/reservations, GET /api/reservations/check-conflicts), server/database-storage.ts:637-725 (restoreDeletedRecord), 535-618 (deleteVehicle)
Affected data: reservations 3370 (ghost created while 1762 was deleted, now a live double booking with 3367), 3403 (ghost on non-existent vehicle 1787).
Security impact: none directly.
Business impact: the incident this project already had ("vehicle plus reservation vanished") has a follow-on failure mode: while the vehicle is in the bin, staff can still book it by id (e.g. from a stale form/tab or an integration), and the admin restore then silently produces a double booking with no warning. Ghost reservations also break every view that joins reservation -> vehicle.
Fix (proposal only): (1) in POST /api/reservations and check-conflicts, 404 when the vehicle does not exist (and, for extra safety, refuse ids present in deleted_records with restored_at IS NULL); (2) in restoreDeletedRecord, run checkReservationConflicts for each snapshotted non-cancelled reservation and either abort with a 409 listing the conflicts or restore them as `cancelled` with a note; (3) longer term, soft-delete reservations on vehicle delete (BUG-022) so the conflict check still sees them.
Regression test (proposal): delete a vehicle with a booked reservation; POST a reservation for the same vehicle/dates -> expect 404/409; restore -> expect no overlapping booked pairs for that vehicle in SQL.
```

```
BUG V9-003
Severity: HIGH
Feature: Pickup vs vehicle availability/maintenance status (POST /api/reservations/:id/pickup, PATCH /:id/status, return)
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step F, p9-out-01.txt (vehicle 1762)
  1. POST /api/reservations (customer 1276, +3..+6) -> 201 id 3339. PATCH /api/vehicles/1762 {"availabilityStatus":"needs_fixing"} -> 200 (no warning in the body, see V9-011). PATCH /api/vehicles/1762/maintenance-status {"status":"in_service","note":"AUDIT-P9 in workshop"} -> 200 availability needs_fixing / maintenance in_service.
  2. POST /api/reservations/3339/pickup {"contractNumber":"AUDIT-P9-R2-…","pickupMileage":39400,"fuelLevelPickup":"full"} -> 200, reservation picked_up.
     SQL vehicles 1762: availability_status='rented', maintenance_status='in_service', maintenance_note='AUDIT-P9 in workshop'  (a car "in the workshop" is now with a customer)
  3. POST /api/reservations/3339/return {"returnMileage":39450,...} -> 200.
     SQL vehicles 1762: availability_status='available', maintenance_status='in_service'   (the manual needs_fixing is gone; the vehicle is offered as available while still flagged in service)
  4. Same again with an open maintenance block: R3 = 3340 picked up; maintenance-status in_service and PATCH availabilityStatus needs_fixing on the rented vehicle -> 200/200; POST /api/reservations {"type":"maintenance_block", today..+1} -> 200 needsSpareVehicle:true and block 3341 created; return 3340 -> 200; SQL vehicle: available / in_service. GET /api/vehicles/available today..+1 does not list it, but POST /api/reservations for today..+1 -> 201 id 3342 (BUG-018 re-confirmed).
  5. Guard bypass: PATCH /api/vehicles/1762 {"availabilityStatus":"not_for_rental"} -> 200; POST /api/reservations/3342/pickup -> 400 "Cannot pickup vehicle that is marked as \"not for rental\"." (correct); PATCH /api/reservations/3342/status {"status":"picked_up"} -> 200. SQL: reservation 3342 picked_up, vehicle availability_status not_for_rental.
Expected: a vehicle whose availability is needs_fixing, whose maintenance_status is in_service/scheduled, or that has an open maintenance block for the period cannot be handed to a customer without an explicit override; a manual needs_fixing must survive a rental cycle (the return code already tries to preserve it); every path that moves a reservation to picked_up applies the same guard.
Actual: only not_for_rental is blocked, and only on /pickup. Pickup overwrites needs_fixing with rented, so on return the "preserve manual status" branch no longer sees needs_fixing and sets available. The /status endpoint applies no vehicle-status check at all.
Root cause: server/vehicle-status-helper.ts getStatusOnPickup() — only `currentStatus === 'not_for_rental'` returns allowed:false, everything else returns newStatus 'rented'; server/database-storage.ts:1700-1706 (pickupReservation) writes that newStatus over needs_fixing and never looks at maintenanceStatus or maintenance blocks; server/database-storage.ts:1777-1782 (returnReservation) only preserves needs_fixing/not_for_rental if they are still the current status; server/routes.ts:3230-3445 (PATCH /api/reservations/:id/status) transitions to picked_up without calling getStatusOnPickup.
Affected files: server/vehicle-status-helper.ts, server/database-storage.ts:1640-1790, server/routes.ts:3230-3445
Affected data: vehicle 1762 went through available -> needs_fixing/in_service -> rented -> available/in_service; reservations 3339, 3340, 3342.
Security impact: none.
Business impact: a car marked "in workshop" or "needs fixing" (brakes, damage, missing APK) can be handed out by the normal counter flow; after it comes back the workshop flag on availability is gone while maintenance_status still says in_service, so the two status fields contradict each other and the vehicle shows as bookable in status-based views. Same class as BUG-018 (booking) but at the pickup step, where the physical hand-over happens.
Fix (proposal only): extend getStatusOnPickup(currentStatus, vehicle, context) to refuse needs_fixing, maintenanceStatus in_service/scheduled and an overlapping open maintenance block unless an explicit override flag/password is supplied; keep the pre-pickup manual status in a column (or derive it) so return restores it; make PATCH /:id/status call the same guard when the target is picked_up (or forbid picked_up via /status and require /pickup).
Regression test (proposal): set needs_fixing + in_service, attempt /pickup and /status picked_up -> both 4xx; after an override pickup+return, assert availability_status is still needs_fixing while maintenance_status is in_service.
```

```
BUG V9-004
Severity: MEDIUM
Feature: Recycle bin - vehicle delete/restore is not a faithful round trip
Status: OPEN
Reproduction: scripts/p9-02-delete-restore.cjs steps 1-5, p9-out-02.txt (SNAPSHOT BEFORE DELETE vs AFTER RESTORE)
  Fixtures on vehicle 1762 before delete: reservation 3367 with driver 858 (reservation_driver_assignments id 290); apk_date_changes id 10 (pending, new_apk_date 2027-10-01); fines id 512 (vehicle_id 1762, reservation_id 3338, customer_id 1275); vehicle_transports 41 (vehicle 1762, reservation 3367) and 42 (vehicle 1764, related_vehicle_id 1762, spare_reservation_id 3369, spare_required true).
  DELETE /api/vehicles/1762 {"confirmLicensePlate":"AU-901-X"} -> 200; POST /api/deleted-records/36/restore -> 200.
  SQL after restore:
    reservation_driver_assignments where reservation_id=3367 -> []          (before: 1 row)
    apk_date_changes where vehicle_id=1762 -> []                            (before: 1 pending row)
    fines where id=512 -> vehicle_id NULL, reservation_id NULL               (before: 1762 / 3338)
    vehicle_transports 42 -> related_vehicle_id NULL, spare_reservation_id NULL, spare_required still true   (before: 1762 / 3369)
    reservations 3369 (type replacement, the spare booking on 1762) -> restored, but nothing points at it any more
  delete_records.payload keys: vehicle, reservations, documents, expenses, damageChecks, waitlist, transports, blacklist — none of the four tables above.
  Response of DELETE and of GET /delete-impact never mention these rows (counts: reservations, documents, expenses, damageChecks, waitlist, transports, blacklist only).
Expected: "restorable: true" means everything that disappears comes back; at minimum delete-impact must list what will be lost for good.
Actual: rows removed or unlinked by Postgres FK actions are neither counted, nor snapshotted, nor restored: reservation_driver_assignments (ON DELETE CASCADE via reservations), apk_date_changes (ON DELETE CASCADE via vehicles), fines.vehicle_id / fines.reservation_id (ON DELETE SET NULL), vehicle_transports.related_vehicle_id / spare_reservation_id on OTHER vehicles' transports (ON DELETE SET NULL).
Root cause: server/database-storage.ts:535-618 deleteVehicle snapshots a hand-picked list of seven tables; shared/schema.ts:521 (reservation_driver_assignments.reservation_id cascade), :1277 (apk_date_changes.vehicle_id cascade), :564 and :575 (fines vehicle_id/reservation_id set null), :1591 and :1599 (vehicle_transports.related_vehicle_id / spare_reservation_id set null) act silently; restoreDeletedRecord (637-725) can only re-insert what was snapshotted; getVehicleDeleteImpact (498-533) counts the same seven tables only.
Affected files: server/database-storage.ts:498-725; shared/schema.ts:521,564,575,1277,1591,1599
Affected data: reservation_driver_assignments 290 (gone), apk_date_changes 10 (gone), fines 512 (unlinked), vehicle_transports 42 (spare link lost), reservation 3369 (orphaned replacement booking).
Security impact: none.
Business impact: after an accidental delete + restore the driver on a future rental is gone, a pending RDW APK change is lost until the next nightly scan, a traffic fine can no longer be attributed to the rental that caused it (only the customer id survives), and a swap transport for another vehicle silently loses its spare vehicle while still saying spare_required. None of this is visible to the admin doing the restore.
Fix (proposal only): snapshot every FK-dependent row (query information_schema or list them explicitly: reservation_driver_assignments for the snapshotted reservation ids, apk_date_changes, fines rows that reference the vehicle/reservations, transports that reference the vehicle via related_vehicle_id/spare_reservation_id) and restore/re-link them in restoreDeletedRecord; add the same rows to delete-impact so the confirmation dialog shows them.
Regression test (proposal): build the fixture above, delete + restore, assert row-for-row equality (ids and FK columns) for all nine tables.
```

```
BUG V9-005
Severity: MEDIUM
Feature: Vehicles - concurrent edits of the same vehicle lose updates (PATCH /api/vehicles/:id)
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step C, p9-out-01.txt
  Two sessions (admin, AUDIT-manager-…) fire at the same time, 5 rounds:
    S1: PATCH /api/vehicles/1762 {"remarks":"AUDIT-S1-<i>"}      S2: PATCH /api/vehicles/1762 {"tireSize":"AUDIT-S2-<i>"}
  Both return 200 every round. SQL after each round (select remarks, tire_size, updated_by):
    round 0: remarks=AUDIT-P9 edited  tire_size=AUDIT-S2-0   (S1's write lost)
    round 1: remarks=AUDIT-P9 edited  tire_size=AUDIT-S2-1   (lost)
    round 2: remarks=AUDIT-P9 edited  tire_size=AUDIT-S2-2   (lost)
    round 3: remarks=AUDIT-S1-3       tire_size=AUDIT-S2-2   (S2's write lost)
    round 4: remarks=AUDIT-S1-3       tire_size=AUDIT-S2-4   (lost)
  5/5 rounds lost one of the two updates. Final row: remarks=AUDIT-SAME-B, tire_size=AUDIT-S2-4.
Expected: a PATCH that carries one field changes one column; two PATCHes on disjoint fields both persist.
Actual: each request reads the row, merges its own fields over the full row, and writes the full row back; the second writer overwrites the first writer's column with the stale value it read.
Root cause: server/routes.ts:1140-1150 `const existingVehicle = await storage.getVehicle(id); const mergedData = {...existingVehicle, ...sanitizedData}; const vehicleData = insertVehicleSchema.parse(mergedData);` and :1207 `storage.updateVehicle(id, dataWithTracking)` which sets every column of the parsed full row (database-storage.ts updateVehicle). No transaction, no `SELECT ... FOR UPDATE`, no version/updated_at check, and the update statement is not restricted to the fields present in the request.
Affected files: server/routes.ts:1082-1233; server/database-storage.ts (updateVehicle)
Affected data: vehicle 1762 remarks/tire_size (test values).
Security impact: none.
Business impact: two staff members editing the same vehicle within the same second (or the UI saving while a scheduler/scan/pickup updates the row) silently drop one change; because the full row is rewritten, the lost field can be anything the other request did not send — including currentMileage, apkDate or availabilityStatus written by another request in that window. The PATCH-vs-pickup race did not reproduce in 6 timed attempts, so the practical window is the request's own read-to-write time (tens of ms), not a long one.
Fix (proposal only): build the SET list only from the keys actually present in the request (validate with insertVehicleSchema.partial()), or do the read-merge-write inside a transaction with `SELECT ... FOR UPDATE`; optionally add optimistic concurrency on updated_at.
Regression test (proposal): fire two concurrent PATCHes with disjoint fields 10 times; assert both columns hold the new values every time.
```

```
BUG V9-006
Severity: MEDIUM
Feature: Vehicles - bulk-import-plates creates a vehicle with an empty license plate; raw JS errors in the per-row result
Status: OPEN
Reproduction: scripts/p9-03-import-race-conflicts.cjs step A (p9-out-03.txt); scripts/p9-04-gaps.cjs step A (p9-out-04.txt)
  1. POST /api/vehicles/bulk-import-plates {"licensePlates":["AU-9P97073-A","au-9p97073-a","AU 9P97073 A","AU-901-X",12345,"","AU-9P97073-B"]} -> 200
     imported: ["AU-9P97073-A"#1766, ""#1767, "AU-9P97073-B"#1768]; failed: [... {"licensePlate":12345,"error":"licensePlate.replace is not a function"}]
     SQL: select id, license_plate, length(license_plate) from vehicles where id=1767 -> 1767 / '' / 0, brand "Unknown", barcode VEH-001767.
  2. GET /api/vehicles/1767 -> 200 {"licensePlate":"",...}; GET /api/barcodes/VEH-001767 -> 200 plate "".
  3. POST bulk-import-plates ["   "] -> failed "Vehicle already exists" (the whitespace is trimmed by sanitizeInput to "" and matches the empty-plate vehicle); [null] -> failed "Cannot read properties of null (reading 'replace')"; [{"licensePlate":"AU-9OBJ-X"}] -> failed "licensePlate.replace is not a function".
  4. DELETE /api/vehicles/1767 {"confirmLicensePlate":""} -> 200 "Vehicle successfully deleted" (the typed-plate confirmation is satisfied by an empty string).
Expected: an empty/whitespace plate is rejected per row ("License plate is required", as the CSV import already does); non-string entries produce a clean validation message; the single-vehicle create's required-field check applies.
Actual: the plates path has no emptiness check and calls `.replace` on whatever arrived, so "" becomes a real vehicle and non-strings turn into JS TypeError messages in the response.
Root cause: server/routes.ts:862-880 (bulk-import-plates loop): `const normalizedPlate = licensePlate.replace(/[-\s]/g, '').toUpperCase();` with no `if (!licensePlate)` guard (contrast :921-925 in bulk-import-csv which has one); storage.createVehicle is called with licensePlate "" which the DB accepts (text NOT NULL, unique — only one such row can exist). server/routes.ts:1641 delete confirmation `normalize(confirmation) !== normalize(impact.vehicle.licensePlate)` is trivially true for "".
Affected files: server/routes.ts:850-908, 1624-1691
Affected data: vehicle 1767 (empty plate; deleted in step 4, still in deleted_records and restorable).
Security impact: none.
Business impact: a CSV/plate paste with a blank line creates a nameless vehicle that appears in every list and can be booked; only one can exist because the empty string is unique, which makes the later "Vehicle already exists" for blank rows confusing.
Fix (proposal only): `if (typeof licensePlate !== 'string' || !licensePlate.trim()) { failed.push({licensePlate, error: 'License plate is required'}); continue; }` in both bulk loops; reuse the required-field check from POST /api/vehicles.
Regression test (proposal): bulk-import ["", "   ", null, 123] -> imported [] and four clean failures; no vehicle row with trim(license_plate)=''.
```

```
BUG V9-007
Severity: MEDIUM
Feature: Vehicles - bulk-import-csv date conversion (APK / company / production dates)
Status: OPEN
Reproduction: scripts/p9-03-import-race-conflicts.cjs step B, p9-out-03.txt
  POST /api/vehicles/bulk-import-csv {"vehicles":[
    {"licensePlate":"AU-9C97073-A","apkDate":"05-03-2027","companyDate":"46000","productionDate":"2020","gps":"ja","registeredTo":"opnaam","company":"ja"},
    {"licensePlate":"AU-9C97073-B","apkDate":"2026-02-30"},
    {"licensePlate":"AU-9C97073-C","apkDate":"31-12-2026"},
    {"licensePlate":"AU-9C97073-D","company":123},
    {"licensePlate":"AU-9C97073-E","apkDate":"2027-03-05T00:00:00.000Z","productionDate":"garbage"}]} -> 200
  SQL (select license_plate, apk_date, company_date, production_date from vehicles where license_plate like 'AU-9C97073%'):
    -A: apk_date 2027-05-02   (input 05-03-2027 = 5 March 2027 in NL; stored as 2 May 2027: month/day swapped AND one day earlier)
    -B: apk_date 2026-03-02   (input 2026-02-30 — impossible date rolled over to 2 March)
    -C: apk_date NULL         (input 31-12-2026 silently dropped; GET /api/vehicles/apk-expiring never lists this vehicle)
    -D: failed {"error":"vehicleInput.company.toLowerCase is not a function"} (row not imported)
    -E: apk_date 2027-03-05 (ISO ok), production_date 'garbage' stored verbatim
Expected: Dutch dd-mm-yyyy (the format the RDW and every Dutch spreadsheet use) parsed correctly, impossible/unparseable dates rejected per row with a message, no timezone shift, productionDate validated.
Actual: convertExcelDate falls through to `new Date(trimmed)` (V8: mm-dd-yyyy, local time) and then `toISOString()` (UTC), so a Europe/Amsterdam midnight becomes the previous day; unparseable strings return null and the field is silently skipped (`if (convertedApkDate)`), impossible ISO dates roll over; productionDate is copied as-is when not a 4-digit year.
Root cause: server/routes.ts:985-1002 (convertExcelDate: `new Date(trimmed)` + `toISOString().split('T')[0]`), :1013-1018 (skip on null), :1052-1058 (productionDate stored raw), :966-968 (`vehicleInput.company.toLowerCase()` on a non-string).
Affected files: server/routes.ts:909-1080
Affected data: vehicles AU-9C97073-A (wrong APK date), -B (rolled-over APK date), -C (APK date lost), -E (production_date 'garbage').
Security impact: none.
Business impact: the APK date is a legal inspection deadline; an import that shifts 5 March to 2 May (or drops it) means the reminder fires two months late or never. The one-day shift also hits every date that does parse. Related to BUG-042 (no calendar validation on the date columns) but this is a different path with its own conversion bug.
Fix (proposal only): parse with an explicit format list (`dd-mm-yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd`, Excel serial) using date-fns `parse` + `isValid`, format with `format(date, 'yyyy-MM-dd')` instead of toISOString, and push a per-row failure when a supplied date cannot be parsed instead of skipping it.
Regression test (proposal): import apkDate "05-03-2027" -> stored 2027-03-05; "31-12-2026" -> 2026-12-31; "2026-02-30" -> row failed with a date error.
```

```
BUG V9-008
Severity: MEDIUM
Feature: Vehicles - barcode is a free-form client-settable field (POST/PATCH /api/vehicles); regenerate collides -> 500
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step D (p9-out-01.txt); scripts/p9-04-gaps.cjs step F (p9-out-04.txt)
  1. Vehicle V 1762 barcode VEH-001762 -> POST /api/vehicles/1762/barcode/regenerate -> 200 VEH-001762-R2.
  2. POST /api/vehicles {"licensePlate":"AU-902-X",...,"barcode":"VEH-001762-R3"} -> 201 (W 1764 now owns V's next revision).
     POST /api/vehicles/1762/barcode/regenerate -> 500 {"message":"Barcode regeneration failed"}; SQL: V still VEH-001762-R2, W VEH-001762-R3.
  3. PATCH /api/vehicles/1764 {"barcode":"AU-901-X"} (V's license plate) -> 200. GET /api/barcodes/AU-901-X -> 200 resolves vehicle id 1764 (W), not V. (Exact barcode match runs before the plate fallback, routes.ts:551-557.) Reset with barcode null -> plate scan resolves 1762 again.
  4. PATCH /api/vehicles/1780 {"barcode":"RES-003367"} -> 200; GET /api/barcodes/RES-003367 -> type reservation 3367 (the vehicle's own barcode can never be scanned).
     PATCH /api/vehicles/1780 {"barcode":"VEH-001762-S"} -> 200; GET /api/barcodes/VEH-001762-S -> vehicle 1762 scannedSpareKey:true (resolves to V's spare key, never to 1780).
Expected: barcode is server-assigned (VEH-<id>[-R<n>]), not accepted from the client on create/update (or at least validated against the VEH- pattern and its own id), and regenerate finds a free revision or returns a clean 409.
Actual: insertVehicleSchema passes `barcode` straight through on create and on the merged PATCH; any string is stored; lookups resolve exact barcode matches first, so a barcode equal to another vehicle's plate shadows that plate; regenerate assumes the next revision is free and turns the unique violation into a 500.
Root cause: shared/schema.ts:266 `barcode: text("barcode").unique()` included in insertVehicleSchema (277-286) with no refinement; server/routes.ts:723-847 and 1082-1233 do not strip/validate it; server/database-storage.ts:380-393 regenerateVehicleBarcode computes `nextRevision` from the current suffix only; server/routes.ts:652-655 maps every error to 500; server/routes.ts:551-557 barcode lookup order.
Affected files: shared/schema.ts:266,277-286; server/routes.ts:494-600, 638-656, 723-847, 1082-1233; server/database-storage.ts:373-393
Affected data: vehicles 1762/1764/1780 (barcodes reset after the test; W's VEH-001762-R3 is still on 1764).
Security impact: LOW-MEDIUM — any user with MANAGE_VEHICLES can make a plate scan of vehicle A resolve to vehicle B (the scan panel then shows B's reservation/transport/maintenance data and logs the scan against B in scan_events), which can be used to hide a vehicle's real state at the counter.
Business impact: printed labels stop matching (regenerate fails or two vehicles carry the same code family), the scan panel returns the wrong car, and the "key audit" feature that relies on barcodes becomes unreliable.
Fix (proposal only): omit `barcode` from insertVehicleSchema (server assigns it in createVehicle, admins regenerate via the dedicated route); in regenerateVehicleBarcode loop until a free revision is found (or catch 23505 and retry), and return 409 on a genuine conflict; in the lookup, only honour exact-barcode matches that match the VEH-<id> pattern of the same vehicle.
Regression test (proposal): POST /api/vehicles with a barcode field -> stored barcode is VEH-<id>, not the supplied value; PATCH barcode -> 400 or ignored; occupy VEH-<id>-R3 elsewhere and regenerate -> 200 with a different free code.
```

```
BUG V9-009
Severity: MEDIUM
Feature: Recycle bin - restore blocked by a barcode collision returns a raw 500
Status: OPEN
Reproduction: scripts/p9-02-delete-restore.cjs step 6, p9-out-02.txt
  1. DELETE /api/vehicles/1762 (barcode VEH-001762-R2) -> 200 (deleted_records id 37).
  2. POST /api/vehicles {"licensePlate":"AU-9BC-1789018297073","brand":"AUDIT-P9","model":"BarcodeTaker","barcode":"VEH-001762-R2"} -> 201 id 1765.
  3. POST /api/deleted-records/37/restore -> 500 {"message":"Error restoring deleted record","error":"duplicate key value violates unique constraint \"vehicles_barcode_unique\""}
     SQL: deleted_records 37 restored_at NULL; vehicles where id=1762 -> [] (transaction rolled back, nothing half-restored).
  4. PATCH /api/vehicles/1765 {"barcode":null} -> 200; POST restore -> 200, vehicle and 9 reservations back.
Expected: the same clean 409 the restore already returns for a taken id (ID_TAKEN) or plate (LICENSE_PLATE_TAKEN), naming the conflicting vehicle.
Actual: only id and license plate are pre-checked; the barcode unique index fires inside the transaction and the route's catch returns 500 with the constraint name.
Root cause: server/database-storage.ts:653-661 restoreDeletedRecord pre-checks `vehicles.id` and `vehicles.licensePlate` only; server/routes.ts:1715-1761 restore route has no 23505 handling (same gap as BUG-043, different trigger: sequential, not concurrent).
Affected files: server/database-storage.ts:637-725; server/routes.ts:1715-1761
Affected data: none corrupted (rollback is clean).
Security impact: none.
Business impact: an admin gets "Error restoring deleted record" with a Postgres constraint name and no hint that the fix is to free the barcode on another vehicle; combined with V9-008 (barcode is client-settable) this is easy to hit.
Fix (proposal only): add a `barcode_taken` pre-check mirroring the plate check and map it to 409 BARCODE_TAKEN; additionally catch 23505 in the route and return 409 with the constraint translated.
Regression test (proposal): delete a vehicle, create another with the same barcode, restore -> expect 409 BARCODE_TAKEN, not 500.
```

```
BUG V9-010
Severity: MEDIUM
Feature: Reservations - pickup/return mileage editable after return without validation or vehicle sync
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step E, p9-out-01.txt
  Reservation 3338 on vehicle 1762 after pickup (39100) and return (39300); vehicle current_mileage 39300.
  1. POST /api/reservations/3338/return {"returnMileage":39050} had been correctly refused 409 "Return mileage (39050) cannot be less than pickup mileage (39100)".
  2. PATCH /api/reservations/3338 {"returnMileage":30000} -> 200, returnMileage 30000.
  3. PATCH /api/reservations/3338 {"pickupMileage":45000} -> 200, pickupMileage 45000.
     SQL: reservations 3338 pickup_mileage 45000, return_mileage 30000; vehicles 1762 current_mileage 39300 (untouched).
Expected: the same rule the return endpoint enforces (return >= pickup, both >= 0) applies to edits, and a corrected return mileage on the vehicle's latest rental updates (or at least warns about) vehicles.current_mileage, the way the mileage endpoints do with the override/audit trail.
Actual: the generic PATCH parses the two fields to int (or null) and writes them; no comparison, no vehicle update, no audit trail.
Root cause: server/routes.ts:3532-3545 (mileage parsing in PATCH /api/reservations/:id) followed by the raw update with no validation ("bypass full schema validation and just use the raw data", same design gap as RS-002); the return/pickup guards live only in database-storage.ts pickupReservation/returnReservation.
Affected files: server/routes.ts:3445-3700
Affected data: reservation 3338 (pickup 45000 / return 30000 left in place as evidence).
Security impact: none.
Business impact: negative-length trips on contracts/invoices and mileage-based reporting, and the vehicle's odometer history diverging from its rentals; mileage corrections done through the reservation form bypass the mileage-decrease authorization that exists everywhere else.
Fix (proposal only): validate pickupMileage/returnMileage against each other (and against the vehicle's mileage timeline) in the PATCH handler; when the edited reservation is the vehicle's most recent return, route the change through the same authorizeMileageDecrease path and update vehicles.current_mileage.
Regression test (proposal): after a return, PATCH returnMileage below pickupMileage -> 400; PATCH a higher returnMileage -> vehicle current_mileage follows.
```

```
BUG V9-011
Severity: LOW
Feature: Vehicles - manual availability-status warnings never reach the client
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step F, p9-out-01.txt
  With booked reservation 3339 on vehicle 1762: PATCH /api/vehicles/1762 {"availabilityStatus":"needs_fixing"} -> 200; response body is the plain vehicle object, no "warning"/"message" key (logged: "response has warning key: false").
  validateManualStatusChange returns warning "Vehicle has upcoming booked reservations. Changing status may require rescheduling those bookings." for exactly this case (vehicle-status-helper.ts:118-124).
Expected: the warning is part of the response (or a 202/flag) so the UI can show it.
Actual: server/routes.ts:1173-1175 `if (validation.warning) { console.log(...) }` — the warning is discarded.
Root cause: server/routes.ts:1173-1175
Affected files: server/routes.ts:1082-1233; server/vehicle-status-helper.ts:74-145
Affected data: none.
Security impact: none.
Business impact: the status machine was designed to warn staff when they take a booked/rented vehicle out of service; the warning exists but nobody sees it (contributes to V9-003).
Fix (proposal only): return `{...vehicle, warning: validation.warning}` (or a `warnings` array) from the PATCH and surface it in the vehicle form.
Regression test (proposal): PATCH needs_fixing on a vehicle with a booked reservation -> response contains the warning text.
```

```
BUG V9-012
Severity: LOW
Feature: Audit trail - duplicate vehicle.delete rows; restore recorded as vehicle.update
Status: OPEN
Reproduction: SQL after scripts/p9-02 and p9-03 (see p9-out-03.txt step G and the SQL block in this report's DB section)
  select id, action, (details ? 'cascaded') as from_route, details->>'path' from audit_logs where resource_type='vehicle' and resource_id='1762' and action='vehicle.delete' order by id
    -> 2317 vehicle.delete from_route=true; 2318 vehicle.delete path=/api/vehicles/1762; 2322 …true; 2323 …path   (two rows per DELETE, both "success")
  select id, action, details->>'restoredFromDeletedRecord' from audit_logs where details->>'restoredFromDeletedRecord' in ('36','37')
    -> 2320 vehicle.update dr=36; 2326 vehicle.update dr=37   (no distinct restore action)
Expected: one audit row per delete; a restore is its own action (vehicle.restore) so it can be searched/reported.
Actual: the route logs vehicle.delete explicitly (routes.ts:1666-1676) and the generic auditMutations middleware (server/middleware/audit.ts:171-) logs the same successful DELETE again; the restore route logs with action 'vehicle.update' (routes.ts:1748) because 'vehicle.restore' is not in the AuditAction union (server/utils/security/auditLogger.ts:21).
Root cause: server/routes.ts:1666-1676, 1748; server/middleware/audit.ts:171-215; server/utils/security/auditLogger.ts:21
Affected files: as above
Affected data: audit_logs (duplicates for every vehicle delete).
Security impact: none (more logging, not less), but duplicate rows inflate "deleted vehicles" counts in any report built on audit_logs.
Business impact: low; makes the incident-review use case ("who deleted/restored this vehicle") noisier.
Fix (proposal only): add DELETE /api/vehicles/:id to SKIPPED_PATH_PATTERNS (the route already logs richer details) or drop the route-level log; add 'vehicle.restore' to the action union and use it in the restore route.
Regression test (proposal): delete a vehicle -> exactly one vehicle.delete row; restore -> one vehicle.restore row.
```

```
BUG V9-013
Severity: LOW
Feature: Transports - creating a transport for a deleted vehicle returns an unmapped 500
Status: OPEN
Reproduction: scripts/p9-02 step 3 and scripts/p9-04 step H (p9-out-02.txt, p9-out-04.txt)
  POST /api/transports {"vehicleId":1787 (deleted),"transportType":"tow","scheduledDate":"2026-09-15","reason":"AUDIT-P9"} -> 500 {"message":"Failed to create transport"}
  POST /api/transports {"vehicleId":1780,"transportType":"swap","spareRequired":true,"relatedVehicleId":1787 (deleted),...} -> 500 {"message":"Failed to create transport"}
Expected: 404 "Vehicle not found" (the vehicle_id FK exists, unlike reservations).
Actual: the FK violation (23503 on vehicle_transports.vehicle_id / related_vehicle_id) is not recognised; the catch only maps "conflicting reservations" and "cannot be the same as" messages.
Root cause: server/routes.ts:7388-7437 (POST /api/transports catch block); no existence check before storage.createTransport / applyTransportUpdate.
Affected files: server/routes.ts:7388-7437
Affected data: none (insert rolled back).
Security impact: none.
Business impact: low; confusing error for staff with a stale transport form.
Fix (proposal only): check both vehicle ids exist and return 404; map Postgres 23503 to 404/409 generically.
Regression test (proposal): POST a transport for a non-existent vehicleId -> 404.
```

```
BUG V9-014
Severity: LOW
Feature: Vehicles - service interval / last-service fields accept nonsense and silently disable the reminder
Status: OPEN
Reproduction: scripts/p9-01-lifecycle.cjs step B, p9-out-01.txt
  PATCH /api/vehicles/1762 {"serviceIntervalKm":-5,"serviceIntervalMonths":0} -> 200; SQL service_interval_km -5, service_interval_months 0; GET /api/vehicles/service-due shows the vehicle with intervalKm 30000 / intervalMonths 12 (the defaults — stored values silently ignored).
  PATCH /api/vehicles/1762 {"lastServiceDate":"2027-10-15","lastServiceMileage":50000} (future date, mileage above current 39500) -> 200; GET service-due no longer lists the vehicle.
Expected: intervals must be > 0, lastServiceDate not in the future, lastServiceMileage <= currentMileage (400 on violation).
Actual: no zod refinement on any of the four fields; computeServiceDue treats non-positive intervals as "use default" (shared/service-due.ts:107-108), so the UI shows -5 while the reminder uses 30000; a future last-service value makes the vehicle look freshly serviced and it disappears from service-due and the nightly notification (the scan removed its notification).
Root cause: shared/schema.ts insertVehicleSchema (277-286) has no refinement for serviceIntervalKm/serviceIntervalMonths/lastServiceDate/lastServiceMileage; shared/service-due.ts:107-108 masks bad values.
Affected files: shared/schema.ts:277-286; shared/service-due.ts; server/routes.ts:1082-1233
Affected data: vehicle 1762 (values restored afterwards).
Security impact: none.
Business impact: a typo in the service fields removes a vehicle from the maintenance reminders without any error; same family as BUG-041/BUG-042.
Fix (proposal only): `.int().positive()` on the intervals, `lastServiceDate <= today` and `lastServiceMileage <= currentMileage` refinements (with the same override semantics as mileage decreases if backdating is legitimate).
Regression test (proposal): PATCH serviceIntervalKm -5 -> 400; lastServiceDate tomorrow -> 400.
```

```
BUG V9-015
Severity: LOW
Feature: Vehicles - duplicate barcode reported as duplicate license plate (create) / raw constraint text (update)
Status: OPEN
Reproduction: scripts/p9-01 step D, scripts/p9-04 step F
  POST /api/vehicles {"licensePlate":"AU-9DUP-1789018297073","brand":"AUDIT-P9","model":"DupBarcode","barcode":"VEH-001762-R2"} -> 409 {"message":"A vehicle with this license plate already exists. Please use a different license plate or edit the existing vehicle.","field":"licensePlate"}
  PATCH /api/vehicles/1780 {"barcode":"VEH-001762-R2"} -> 400 {"message":"Invalid vehicle data","error":"duplicate key value violates unique constraint \"vehicles_barcode_unique\""}
Expected: 409 with field "barcode" and a message about the barcode in both cases.
Actual: the create handler treats any 23505 whose message contains "duplicate key" as a license-plate duplicate; the PATCH handler has no 23505 handling and echoes the driver message.
Root cause: server/routes.ts:829-836 (`errorMessage.includes('license_plate') || errorMessage.includes('duplicate key')`); server/routes.ts:1224-1231 (PATCH catch-all 400).
Affected files: server/routes.ts:723-847, 1082-1233
Affected data: none.
Security impact: minor information disclosure of the constraint name on PATCH (same class as RS-008).
Business impact: staff are told to change the license plate when the barcode is the problem.
Fix (proposal only): inspect `error.constraint` (`vehicles_barcode_unique` vs the plate index) and return field-specific 409s in both handlers.
Regression test (proposal): create/update with a taken barcode -> 409 field "barcode".
```

```
BUG V9-016
Severity: LOW
Feature: Documents - vehicle delete leaves files on disk with no purge; document folders keyed by plate are shared after rename/reuse
Status: OPEN
Reproduction: scripts/p9-04-gaps.cjs steps B and C, p9-out-04.txt
  B. Vehicle 1776 (AU-903-X): POST /api/documents -> id 284, file audit-uploads/AU903X/other/AU903X_Other_….pdf. DELETE /api/vehicles/1776 -> 200; SQL documents where id=284 -> []; file still on disk (needed: restore -> row back, download 200). DELETE again and leave it deleted -> file stays on disk forever; deleted_records has no purge endpoint (route probe: only list/restore exist, routes.ts:1697-1761), so nothing will ever remove it.
  C. Vehicle 1777 created as AU-903-X with document 285 in folder AU903X; PATCH licensePlate -> AU-9RN-73 -> 200; document path unchanged (still downloadable, 200). New vehicle 1778 created with the old plate AU-903-X; its document 286 lands in the same AU903X folder. SQL: documents 285 (vehicle 1777) and 286 (vehicle 1778) both under ..\audit-uploads\AU903X\other\.
Expected: either a purge (empty recycle bin) that removes snapshot + files, or at least an inventory of orphaned files; document storage keyed by vehicle id (or plate+id) so folders are not shared across vehicles.
Actual: deleteVehicle deletes the rows only (database-storage.ts:592) — by necessity, because restore re-uses the files — but there is no counterpart that ever removes them; storage paths are derived from the plate at upload time (documents route, `AU903X/<type>/...`) and never moved on rename.
Root cause: server/database-storage.ts:535-618 (no file handling), server/routes.ts:1697-1761 (no purge route), server/routes.ts:5000-5068 (POST /api/documents path built from the plate).
Affected files: as above
Affected data: audit-uploads/AU903X (files of vehicles 1776 deleted, 1777 renamed, 1778 reuse), AU901X, AU902X.
Security impact: none new (file-path containment issues are DM-002).
Business impact: disk growth over time and, with plate reuse (common when a plate is re-entered after a typo), one folder mixes two vehicles' contracts/damage checks — confusing when browsing the uploads directory or the backup.
Fix (proposal only): add an admin "purge" for deleted_records that removes the snapshot's files; store documents under `<vehicleId>/` (or `<plate>-<id>/`) and move the folder on plate rename.
Regression test (proposal): delete + purge a vehicle -> its files are gone; rename a plate -> documents still resolve and a new vehicle with the old plate gets its own folder.
```

## DB consistency verification (per workflow)

| Workflow | Tables / files checked | Result |
|---|---|---|
| Create V (p9-01 A) | `vehicles` (all fixture columns, barcode, created_by), `audit_logs` (vehicle.create) | consistent |
| Edit V (p9-01 B) | `vehicles` (remarks, updated_by/at, service fields), `audit_logs` (vehicle.update diff), `custom_notifications` (service_due create/remove) | consistent; nonsense service values persisted (V9-014); dd-mm-yyyy APK string persisted (BUG-042) |
| Concurrent edit (p9-01 C) | `vehicles.remarks/tire_size/updated_by` after each round | **inconsistent** — one field lost in 5/5 rounds (V9-005) |
| Barcode (p9-01 D, p9-04 F) | `vehicles.barcode` for 1762/1764/1780, `scan_events` count | rows as described; regenerate 500 left V unchanged (no partial write); hijack value persisted and reset |
| Mileage / pickup / return (p9-01 E) | `vehicles.current_mileage/previous_mileage/mileage_decreased_*`, `reservations.status/pickup_mileage/return_mileage/contract_number/end_date`, `documents` (contract + damage check rows), files under `audit-uploads/AU901X/` | consistent through pickup/return; post-return PATCH left pickup 45000 > return 30000 with vehicle at 39300 (V9-010); `end_date` overwritten to today (RS-005 re-confirmed: 3339 start 09-13, end 09-10) |
| Maintenance vs bookings (p9-01 F) | `vehicles.availability_status/maintenance_status/maintenance_note`, `reservations.status` for 3339/3340/3341/3342 | picked_up while in_service; available + in_service after return (V9-003); block 3341 created although the response was the "needs spare" prompt; 3342 picked_up on not_for_rental |
| Documents (p9-01 G, p9-04 B/C) | `documents` rows + file existence (both path formats), `vehicles.apk_date` after APK doc | rows/files consistent; after vehicle delete rows gone, files kept (V9-016); restore brings rows back and download works |
| Delete V with everything (p9-02 1-2) | `vehicles`, `reservations` (8), `documents` (7), `reservation_driver_assignments`, `expenses`, `vehicle_customer_blacklist`, `vehicle_transports` (41, 42), `apk_date_changes`, `fines`, `scan_events`, `custom_notifications`, `deleted_records.payload/related_counts`, `audit_logs` | snapshot covers 7 tables and matches counts; FK side-effects on 4 other tables not snapshotted (V9-004); two audit rows (V9-012); `scan_events.vehicle_id` kept (no FK) |
| Reserve deleted vehicle (p9-02 3, p9-04 H) | `reservations` 3370 / 3403 (vehicle_id without vehicle row), `vehicle_transports` (none created, 500) | ghost rows exist (V9-002 / RS-009) |
| Restore V (p9-02 4-5) | same tables as delete, `vehicles_id_seq` | vehicle + 8 reservations + 7 documents + expense + blacklist + transport 41 restored with original ids and statuses; 4 tables lost (V9-004); overlapping booked pair (3367, 3370) now live (V9-002); sequence re-synced (last_value 1764) |
| Restore vs barcode collision (p9-02 6) | `deleted_records.restored_at`, `vehicles` 1762/1765 | clean rollback, then restore succeeded after freeing the barcode (V9-009) |
| Bulk imports (p9-03 A/B, p9-04 A) | `vehicles` rows for AU-9P…/AU-9C… and id 1767 (empty plate) | as described in V9-006/V9-007; duplicates inside one batch and re-import correctly refused |
| Blacklist race (p9-03 C) | `vehicle_customer_blacklist` for (1762, 1275) | exactly one row |
| Date edits (p9-03 D) | `reservations.start_date/end_date/end_time` for 3367/3368 | overlaps written by date-only PATCH (V9-001); reset afterwards |
| Rapid booking (p9-03 E) | `reservations` on 1764 for 2026-10-30 | 5 rows for 5 parallel POSTs (RS-001 re-confirmed) |
| APK change confirm (p9-03 F) | `apk_date_changes.status`, `vehicles.apk_date` (1764) | consistent |
| Delete while picked_up (p9-03 G) | `reservations` 3376, `vehicles` 1764, `audit_logs` | reservation hard-deleted while picked_up; after restore vehicle rented / reservation picked_up and return works (BUG-022 new evidence) |
| Warranty/APK windows (p9-04 D) | `vehicles.apk_date/warranty_end_date` (1780) | window [-2 months, +30 d] confirmed; empty string -> NULL; ISO datetime string stored verbatim (BUG-042) |

## Re-confirmed existing bugs (new evidence only)

- **BUG-018 (RS-004) / MT-002** — booking a vehicle that is `needs_fixing` + `maintenance_status=in_service` + inside an open maintenance block: `POST /api/reservations` (1762, today..+1) → 201 id 3342 while `GET /api/vehicles/available` for the same range hides the vehicle (p9-out-01 F).
- **BUG-020 (VC-001)** — the bulk importers normalise plates for their duplicate check (`au-9p97073-a`, `AU 9P97073 A` → "Vehicle already exists") but `POST /api/vehicles {"licensePlate":"au9p97073a"}` right after the import → 201 id 1769 (p9-out-03 A). Also `restoreDeletedRecord` compares the plate with exact `eq()` (database-storage.ts:657-661), so a re-created variant (`au901x`) would not block a restore either.
- **BUG-022 (VC-007 / RS-006)** — vehicle delete while the customer physically has the car: reservation 3376 `picked_up` on 1764; `GET /delete-impact` reports only `reservations: 6` with no status breakdown; `DELETE /api/vehicles/1764` → 200 and the picked_up row is hard-deleted (SQL `[]`); `audit_logs` cascaded `{"reservations":6,...}` (p9-out-03 G). Restore brings it back as picked_up and the return then works.
- **BUG-042 (VC-004)** — `PATCH apkDate "10-10-2026"` → 200, stored verbatim and the vehicle is absent from `apk-expiring` although the intended date is 30 days out (p9-out-01 B); `PATCH apkDate "2026-09-10T00:00:00.000Z"` → 200, stored with the time part (p9-out-04 D). CSV path has its own conversion bug (V9-007).
- **BUG-043 (VC-008)** — sequential variant of the missing 23505 handling in the restore route (V9-009).
- **RS-001** — 5 parallel `POST /api/reservations` for 1764, 2026-10-30..11-01 → 5 × 201, 5 rows (p9-out-03 E).
- **RS-002** — `PATCH /api/reservations/:id/status {picked_up}` skips the vehicle-status guard that `/pickup` applies (folded into V9-003 as it is a vehicle-status guard, not a transition guard).
- **RS-005** — return of 3339 set `end_date` to 2026-09-10 while `start_date` is 2026-09-13 (p9-out-02 snapshot).
- **RS-009** — ghost reservations 3370 and 3403 on non-existent vehicle ids (V9-002 builds on this).
- **DM-003** — `documents.file_path` stored in two formats on the same vehicle (`AU901X\contracts\…` vs `..\audit-uploads\AU901X\other\…`), visible in the p9-out-01 G listing; the audit scripts resolve both.
- **MT-008** — creating a maintenance block did not change `vehicles.availability_status/maintenance_status` (p9-out-01 F: block 3341 created, vehicle stayed `needs_fixing/in_service` only because those had been set manually).

Operational note: no server restart was triggered by any request in this phase (`/health` 200 at the start and end of every script; uptime continuous). The persisted admin/manager sessions had expired between the morning run and the p9-04 run (401 → one fresh login each, within the 5/15 min budget per fake IP).

# Fase 3-5 / 9 / 11 — Maintenance blocks, spare/replacement vehicles, placeholders, transports (runtime-bewezen)

2026-09-09, audit server :5001, database `lvs_audit`. Scripts: `docs/audit/wip/scripts/mt-*.mjs` (node, ESM, reuse `mt-lib.mjs` session helper + `db.mjs` for direct SQL evidence). Test fixtures: vehicles `AU-001-X..AU-008-X` (ids 1668-1670, 1671, 1675, 1704-1705, 1725), customers "AUDIT Klant1/2" (ids 1251/1252), limited user `audit_limited_mt` (id 5, permissions `["view_reservations"]`). All findings reproduced against the live server; SQL evidence pulled directly from `lvs_audit`.

Note on environment: the audit server dropped connections (ECONNREFUSED) twice during this run and the staff login rate limiter (5/15min) was exhausted once, both consistent with other concurrent audit agents sharing the same server/IP — scripts were re-run after the server/rate-limit recovered; this did not affect the validity of the findings below (each is backed by its own request/response + SQL evidence captured right after the call).

## Tested

1. Maintenance blocks: creation on a vehicle with a picked-up rental (`needsSpareVehicle` path + insert-before-followup behaviour), block without endDate, block with endDate before startDate, block on a non-existing vehicle, two overlapping blocks on the same vehicle, editing block dates via `PATCH /:id` and `/basic`, `maintenanceStatus` set to `in`/`out`/an arbitrary value, deleting a block and inspecting its replacement row, vehicle `availabilityStatus`/`maintenanceStatus` after each step, and the reverse case (booking a standard rental onto a vehicle that already has an active block).
2. `mark-needs-service` on booked/picked_up/returned reservations, called twice, with past dates and with an inverted date range; `return-from-service` on a non-replacement reservation and on a non-existing reservation.
3. Placeholder reservations: create (valid, duplicate, ghost rental, customerId mismatch, endDate<startDate), `needing-assignment` with negative/huge/non-numeric `daysAhead`, `assign-vehicle` onto a busy vehicle, the original vehicle, an `in_service` vehicle, an open-ended placeholder with no endDate, and assigning twice.
4. `maintenance-with-spare`: valid create, a spare that overlaps another booking, a `maintenanceId` that isn't a block, empty assignment arrays (both branches — existing `maintenanceId` and new-block), and running it twice for the same block while the first replacement had already been picked up (SQL row count/lifecycle before and after).
5. `assign-spare` and `spare-status`: valid assigned→ready→picked_up→returned path, an invalid backwards transition, `spare-status` on a non-replacement reservation, and both endpoints called by the limited (`view_reservations`-only) user.
6. Transports: create swap/tow/delivery, complete, complete twice, cancel, `generate-report` with a TBD spare and after assignment, reassigning the spare vehicle on the transport day while still `booked` and after it has been `picked_up`, deleting a transport with an active spare reservation, and a two-item bulk-complete with one invalid id.
7. Stale-state SQL sweep across the whole `lvs_audit` database (not just fixtures): replacement rows pointing at deleted/missing originals, TBD placeholders past their end date, `in_service` vehicles without an active block, `out`-status blocks whose vehicle is still `needs_fixing`/`in_service`, and reservations stuck in a `status` value outside `VALID_RESERVATION_TRANSITIONS`.

## Not tested (why)

- Portal-side maintenance approval flow (`server/routes/portal-requests.ts`) — out of scope for this pass (staff-side endpoints only); flagged for a follow-up phase.
- `delivery/estimate-distance` and `optimize-route` — depend on live Nominatim/OSRM geocoding, not maintenance/transport data-integrity; skipped.
- Realtime broadcast content for these entities — already covered by `docs/audit/wip/socket.md` (RT-001), not re-tested here.
- Full portal-driven maintenance-block creation (customer-initiated) — only the staff API paths were exercised.

## Findings summary

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 3 |

---

BUG MT-001
Severity: CRITICAL
Feature: Maintenance scheduling with spare vehicle (`POST /api/reservations/maintenance-with-spare`)
Status: OPEN
Reproduction: Create a maintenance block for vehicle V1 with `maintenance-with-spare` (`maintenanceId` omitted), assigning spare V2 to rental #3312 → replacement reservation #3314 is created. Pick up #3314 via `POST /api/reservations/3314/pickup` (status becomes `picked_up`, i.e. the spare car has physically been handed to the customer). Call `POST /api/reservations/maintenance-with-spare` again with the SAME `maintenanceId` (the block just created) and a new `spareVehicleAssignments` entry for the same original reservation (#3312), assigning a different spare vehicle.
Expected: the server refuses to silently discard an already-picked-up replacement (at minimum: reject with 400, same as `applyTransportUpdate`'s guard for transports — "Cannot change the replacement vehicle — the current one has already been picked up"), or reassigns without destroying the audit trail (soft delete / cancel).
Actual: the second call returns 201 and creates a new replacement reservation; the OLD replacement #3314 (status `picked_up`) is permanently HARD-DELETED from `reservations` — `select * from reservations where id=3314` returns zero rows. There is no soft-delete, no cancellation record, nothing — the row is gone as if it never existed, while the physical vehicle handover it represented is real.
Root cause: `server/routes.ts:2932-2946` (and the mirrored new-block branch at `2932-3022`) collects "old replacements" for the same `originalReservationId`s and calls `storage.deleteReservation(oldReplacement.id)` (a genuine hard `db.delete`, `server/database-storage.ts:1270-1283`) with **no check on `oldReplacement.status`** — unlike `applyTransportUpdate` (`database-storage.ts:2053-2064`), which explicitly refuses to touch a spare reservation once it is `picked_up` or later. The whole route also runs outside a `db.transaction`.
Affected files: server/routes.ts (2932-3022), server/database-storage.ts (1270-1283)
Affected data: `reservations` rows of `type='replacement'` created via the maintenance-with-spare flow; any spare-vehicle handover already in progress for a maintenance block is destroyed the moment someone re-submits/edits the same maintenance-with-spare dialog.
Security impact: none directly, but it is an unauthenticated-by-design internal data-integrity hole reachable by any user with `MANAGE_RESERVATIONS`/`MANAGE_MAINTENANCE`.
Business impact: silent, unrecoverable loss of the record that a specific spare vehicle is with a specific customer (mileage, pickup date, contract linkage all vanish); billing/liability/insurance exposure if the physical car is not tracked; no audit-log trace since the row is gone before the audit middleware's diff would even have anything to compare against on the next read.
Fix proposal: before hard-deleting `oldReplacement`, check its `status`; if it is not `booked`, either reject the re-submission with a clear error (mirroring `applyTransportUpdate`), or convert the cleanup to a `status: 'cancelled'` update (matching the soft-cancel pattern used elsewhere) instead of `deleteReservation`. Wrap the whole route in `db.transaction`.
Regression test proposal: integration test that creates a block + spare, picks up the spare, re-runs `maintenance-with-spare` for the same `maintenanceId`/original reservation, and asserts the old replacement row still exists (status `picked_up` or `cancelled`, never absent) and the route returns an error or a coherent merged result.

---

BUG MT-002
Severity: HIGH
Feature: Maintenance blocks vs. new rentals (`POST /api/reservations`, `checkReservationConflicts`)
Status: OPEN
Reproduction: Create a maintenance block on vehicle V2 for 2026-10-01..2026-10-10 (`POST /api/reservations` with `type: "maintenance_block"`). Then `POST /api/reservations` a normal `type: "standard"` rental for the SAME vehicle V2, customer AUDIT Klant1, 2026-10-03..2026-10-05 (fully inside the block).
Expected: at minimum a warning/soft-block equivalent to the `needsSpareVehicle` prompt the system already shows when a block is created AFTER an existing rental — the workflow is explicitly designed around "tell staff when a maintenance period and a customer rental overlap." Booking a customer directly onto a vehicle currently earmarked for repair with zero indication is the inverse of that same scenario.
Actual: 201, no warning, no conflict, no `needsSpareVehicle` field. `select * from reservations where vehicle_id=1668` afterwards shows the new standard reservation (#3223) sitting inside the maintenance-block date range with the block reservations (#3219/#3220) untouched.
Root cause: `checkReservationConflicts` (`server/database-storage.ts:1582-1589`) explicitly excludes `maintenance_block` rows from conflicts when checking a non-maintenance reservation ("For regular rentals, maintenance blocks don't cause conflicts (rentals continue during maintenance)") — by design for the case where a block is added to an ALREADY rented vehicle (spare-vehicle workflow takes over). But `POST /api/reservations` for a new standard rental uses the exact same conflict check with no direction-aware logic, so a block created first is invisible to the booking path entirely.
Affected files: server/database-storage.ts (1582-1622), server/routes.ts (2602-2630)
Affected data: any vehicle with an active/future maintenance block reservation.
Security impact: none.
Business impact: staff can book a customer onto a vehicle that is scheduled for or currently in repair with no system warning; discovered only at pickup time (or not at all if pickup is also unguarded), leading to no-shows/wrong vehicle handed over.
Fix proposal: when creating a standard reservation, also check overlap against active `maintenance_block` rows on the same vehicle and surface the same `needsSpareVehicle`-style response (or at least a 409/warning) used for the reverse case.
Regression test proposal: create a block, then attempt a standard reservation on the same vehicle/overlapping dates; assert the response flags the conflict rather than 201.

---

BUG MT-003
Severity: HIGH
Feature: Maintenance block deletion (`DELETE /api/reservations/:id`) vs. its assigned replacement
Status: OPEN
Reproduction: Create a maintenance block (#3216) on V1, assign a spare via `POST /api/reservations/3216/assign-spare` (creates replacement #3221 on V3), then `DELETE /api/reservations/3216`.
Expected: the block's soft-delete cascades to (or at least flags) its replacement reservation and frees the spare vehicle back to `available`, matching the doc's own stated design intent for spare cleanup.
Actual: block #3216 is soft-deleted (`deletedAt` set) — but replacement #3221 is left completely untouched: `deleted_at IS NULL`, `status='pending'`, still pointing at `replacement_for_reservation_id=3216` (a now-deleted row). The spare vehicle V3 stays at `availability_status='scheduled'` indefinitely; nothing in the UI or API offers to close/cancel it since its parent block is gone.
Root cause: the `DELETE /:id` route (`server/routes.ts` ~4621-4712, per `docs/audit/01d-domein-en-data-integriteit.md` §"Schrijfpaden") loops over dependent rows but does not appear to reach replacement reservations created via `assign-spare` (as opposed to `maintenance-with-spare`, which at least attempts cleanup, itself buggy per MT-001); `createReplacementReservation` (`database-storage.ts:3178-3239`) also assigns `status: 'active'`/`'pending'` (see MT-015) which never appears in the standard reservation status machine, so no downstream code path expects to have to close it.
Affected files: server/routes.ts (DELETE /api/reservations/:id), server/database-storage.ts (createReplacementReservation, deleteReservation)
Affected data: `reservations` (`type='replacement'`) and `vehicles.availability_status` for any spare assigned via `assign-spare` whose parent block is later deleted. Confirmed via the sitewide stale-state sweep: `select * from reservations r left join reservations orig on orig.id=r.replacement_for_reservation_id where r.type='replacement' and r.deleted_at is null and (orig.id is null or orig.deleted_at is not null)` → 1 row in the audit DB immediately after this single repro (id 3221); this class of row has no cleanup path at all, so it will only accumulate.
Security impact: none.
Business impact: a vehicle used as a spare stays reported as unavailable (`scheduled`) forever after its maintenance block is deleted, silently shrinking the usable fleet; dangling FK-less references make later reporting/queries unreliable.
Fix proposal: on deleting a maintenance block (or any reservation with active replacements pointing at it), soft-delete/cancel its still-`booked`/`pending` replacements and restore the spare vehicle's availability in the same operation, inside a transaction.
Regression test proposal: create block → assign spare → delete block; assert the replacement is also deleted/cancelled and the spare vehicle's `availabilityStatus` is no longer stuck at `scheduled`.

---

BUG MT-004
Severity: HIGH
Feature: Authorization on `PATCH /api/reservations/:id/spare-status`
Status: OPEN
Reproduction: Log in as `audit_limited_mt` (permissions `["view_reservations"]` only). `PATCH /api/reservations/3237/spare-status` with `{"spareVehicleStatus":"returned"}` (reservation already at `returned`, so idempotent, but any valid next-state call behaves the same).
Expected: 403, matching every other spare/maintenance mutation endpoint (`assign-spare`, `mark-needs-service`, etc.), which all require `MANAGE_RESERVATIONS`.
Actual: 200 — the limited user's request succeeds and updates the reservation.
Root cause: `server/routes.ts:4013` registers the route with `requireAuth` only, not `hasPermission(UserPermission.MANAGE_RESERVATIONS)` like its siblings.
Affected files: server/routes.ts (4013-4062)
Affected data: `reservations.spareVehicleStatus` on any reservation, reachable by any authenticated staff account regardless of assigned permissions.
Security impact: broken access control (CWE-862 Missing Authorization) — a low-privilege account (e.g. a view-only reception user) can drive the spare-vehicle handover lifecycle (assigned→ready→picked_up→returned), which in normal operation gates physical vehicle handovers.
Business impact: a user without reservation-management rights can mark a spare vehicle as picked up/returned, potentially triggering downstream availability changes or masking a real handover state, without ever having had "manage reservations" rights.
Fix proposal: add `hasPermission(UserPermission.MANAGE_RESERVATIONS)` to this route, consistent with `assign-spare`, `mark-needs-service`, `return-from-service`.
Regression test proposal: authenticated request with only `view_reservations` to this endpoint must return 403.

---

BUG MT-005
Severity: HIGH
Feature: `mark-needs-service` maintenance block date validation (`POST /api/reservations/:id/mark-needs-service`)
Status: OPEN
Reproduction: `POST /api/reservations/3227/mark-needs-service` with `{"maintenanceStatus":"in_service","serviceStartDate":"2099-01-01","serviceEndDate":"2020-01-01"}` (end before start).
Expected: 400, same as the direct `POST /api/reservations` path with `type: "maintenance_block"`, which correctly rejects `endDate < startDate` ("End date must be on or after start date").
Actual: 200 — `storage.createMaintenanceBlock` inserts the block unchecked. SQL confirms: `select id,start_date,end_date from reservations where id=3229` → `start_date='2099-01-01', end_date='2020-01-01'`.
Root cause: `mark-needs-service` (`server/routes.ts:3823-3834`) calls `storage.createMaintenanceBlock` (`database-storage.ts:3323-3349`) directly with a raw insert, bypassing `insertReservationSchema`'s zod refinement that enforces `endDate >= startDate` for every other reservation-creation path.
Affected files: server/routes.ts (3792-3845), server/database-storage.ts (3323-3349)
Affected data: `reservations` (`type='maintenance_block'`) created via this route with caller-supplied `serviceStartDate`/`serviceEndDate`.
Security impact: none.
Business impact: an inverted-date maintenance block is nonsensical for the maintenance calendar (a block that "ends" 79 years before it "starts") and will break any UI/report that assumes `endDate >= startDate`; also inconsistent behaviour between two creation paths for the same entity confuses staff/support.
Fix proposal: validate `serviceEndDate >= serviceStartDate` in the route (or route both creation paths through the same zod schema/refinement) before calling `createMaintenanceBlock`.
Regression test proposal: call `mark-needs-service` with `serviceEndDate < serviceStartDate`; assert 400 and no row inserted.

---

BUG MT-006
Severity: MEDIUM
Feature: `POST /api/reservations/:id/assign-spare` — repeat assignment
Status: OPEN
Reproduction: `assign-spare` a maintenance block (#3236) with spare V2 → replacement #3237 created. Call `assign-spare` again on the same block id with a different spare V3 (no error — the first assignment was never closed).
Expected: either the prior active replacement is closed/cancelled first (as `applyTransportUpdate` does for transports), or the endpoint rejects the second call while an active replacement already exists (mirroring `createPlaceholderReservation`'s own duplicate check).
Actual: 200 both times — `select id, vehicle_id, status from reservations where replacement_for_reservation_id=3236` shows TWO simultaneous active rows (#3237 on V1668, #3238 on V1669), both `status='pending'`/`spare_vehicle_status='assigned'`.
Root cause: `createReplacementReservation` (`database-storage.ts:3178-3239`) never checks for an existing active replacement for `originalReservationId` before inserting a new one.
Affected files: server/database-storage.ts (3178-3239), server/routes.ts (assign-spare route, 3848-3891)
Affected data: `reservations` (`type='replacement'`) tied to the same maintenance block/rental.
Security impact: none.
Business impact: two vehicles simultaneously "reserved" as the spare for one rental/block — ambiguous which one is actually with the customer, double-blocks two vehicles' availability, and neither has any automatic path to be closed out.
Fix proposal: before inserting, look up any non-cancelled/non-completed replacement for the same `replacementForReservationId` and cancel it (or reject the call) first.
Regression test proposal: call `assign-spare` twice for the same reservation with two different spare vehicles; assert only one active replacement exists afterward.

---

BUG MT-007
Severity: MEDIUM
Feature: `maintenance-with-spare` — schema bypass allowing a vehicle-less maintenance block
Status: OPEN
Reproduction: `POST /api/reservations/maintenance-with-spare` with no `maintenanceId`, `maintenanceData: {startDate:"2027-07-01", endDate:"2027-07-05", type:"maintenance_block"}` (no `vehicleId` — reproduced when the caller's `vehicleId` value serializes to `undefined`, e.g. a stale/undefined form field), `conflictingReservations: []`, `spareVehicleAssignments: []`.
Expected: 400, same rule the direct `POST /api/reservations` path enforces ("Maintenance block reservations must have a vehicleId").
Actual: 201 — `select id, vehicle_id, type from reservations where id=3316` → `vehicle_id=null, type='maintenance_block'`.
Root cause: the new-block branch of `maintenance-with-spare` (`server/routes.ts:2999-3022`) calls `storage.createReservation(maintenanceWithTracking)` directly with the raw `maintenanceData` object, never passing it through `insertReservationSchema`, so none of that schema's cross-field business rules (vehicleId required for `maintenance_block`, etc.) apply on this path.
Affected files: server/routes.ts (2999-3022)
Affected data: `reservations` (`type='maintenance_block'`) created through this specific route.
Security impact: none.
Business impact: a maintenance block with no vehicle can't be shown/filtered correctly on the maintenance calendar (`pages/maintenance/calendar.tsx` groups by vehicle) and represents an otherwise-impossible domain state.
Fix proposal: validate `maintenanceData` through `insertReservationSchema` (or at minimum require `vehicleId`) before calling `createReservation` in this branch, matching the direct-POST path.
Regression test proposal: call `maintenance-with-spare` with `maintenanceData.vehicleId` omitted; assert 400 and no row inserted.

---

BUG MT-008
Severity: MEDIUM
Feature: Maintenance block creation never updates `vehicles.availabilityStatus`/`maintenanceStatus`
Status: OPEN
Reproduction: Create a maintenance block on an `available` vehicle (V2) and, separately, on a `rented` vehicle (V1, via a picked-up rental). Read `vehicles.availability_status`/`maintenance_status` before and after in both cases.
Expected: a vehicle actively covered by a maintenance block reads as unavailable for new bookings (`needs_fixing` or similar), consistent with what `mark-needs-service` does for the same conceptual state.
Actual: unchanged in both cases — V1 stays `rented`/`ok`, V2 stays `available`/`ok`, block or no block. Only the separate `mark-needs-service` endpoint (a different UI entry point for the same "vehicle needs service" concept) sets `needs_fixing`.
Root cause: `storage.createReservation` (`database-storage.ts:1130-1159`), used by the direct `POST /api/reservations type=maintenance_block` path, never touches the `vehicles` table; there is no vehicle-status side effect anywhere in that code path. Matches `docs/audit/01d-domein-en-data-integriteit.md` §Statusmachines/Integriteitsrisico's #9 ("sync leidt `needs_fixing` niet af"), now empirically confirmed at the API level rather than only by static reading.
Affected files: server/database-storage.ts (createReservation, 1130-1159), server/routes.ts (POST /api/reservations maintenance_block branch, 2526-2601)
Affected data: `vehicles.availability_status`/`maintenance_status` for any vehicle whose maintenance block was created via the schedule-maintenance dialog / direct API rather than via `mark-needs-service`.
Security impact: none.
Business impact: combined with MT-002, a vehicle with an active maintenance block is invisible to every automated "is this vehicle available" check (`getAvailableVehiclesInRange`, the vehicle picker) since none of them look at maintenance-block reservations either — the block exists only as a calendar entry, not as a status.
Fix proposal: when creating (and closing) a `maintenance_block` reservation whose period covers "now", call the same vehicle-status transition `mark-needs-service` uses.
Regression test proposal: create a current-dated maintenance block on an available vehicle; assert `availabilityStatus` becomes `needs_fixing` (or equivalent) and reverts when the block is closed/deleted.

---

BUG MT-009
Severity: MEDIUM
Feature: Maintenance block creation on a non-existent vehicle
Status: OPEN
Reproduction: `POST /api/reservations` with `type:"maintenance_block"`, `vehicleId: 999999999` (no such vehicle), valid dates.
Expected: 404/400 — vehicle must exist.
Actual: 201 — reservation #3218 created with `vehicle_id=999999999`.
Root cause: `reservations.vehicleId` has no DB-level FK (`docs/audit/01d-domein-en-data-integriteit.md` §Entiteiten, confirmed) and the maintenance-block branch of `POST /api/reservations` (`server/routes.ts:2526-2601`) never calls `storage.getVehicle` before inserting (the standard-reservation branch does look up the vehicle, at 2634, but only for the BV→Opnaam auto-conversion, and that whole block is skipped for `type==='maintenance_block'`).
Affected files: server/routes.ts (2526-2601), shared/schema.ts (reservations.vehicleId has no `.references()`)
Affected data: `reservations` rows of `type='maintenance_block'` with a `vehicleId` that doesn't resolve to any vehicle.
Security impact: none.
Business impact: an orphaned block shows up in queries/reports keyed off `vehicleId` joins as a null/broken row, and can never be resolved through the UI (no vehicle to click into).
Fix proposal: verify `storage.getVehicle(vehicleId)` exists before inserting a maintenance block (or add the FK at the DB level, per the broader integrity-risk list in the phase-1 doc).
Regression test proposal: `POST /api/reservations type=maintenance_block` with a non-existent `vehicleId`; assert 404.

---

BUG MT-010
Severity: MEDIUM
Feature: `POST /api/placeholder-reservations` — customerId not validated against the original reservation
Status: OPEN
Reproduction: Create a standard rental (#3310) for customer C1 (AUDIT Klant1). `POST /api/placeholder-reservations` with `{"originalReservationId":3310,"customerId":1252 (AUDIT Klant2), "startDate":"2027-05-05","endDate":"2027-05-07"}`.
Expected: 400/409 — the placeholder spare is standing in for reservation #3310's actual renter (C1); attributing it to an unrelated customer (C2) is a data-integrity violation.
Actual: 201 — placeholder #3311 created with `customer_id=1252` while `replacement_for_reservation_id=3310` (whose real customer is 1251).
Root cause: `createPlaceholderReservation` (`database-storage.ts:2955-3015`) only checks that the original reservation exists and that no duplicate placeholder is active; it never cross-checks the supplied `customerId` against `originalReservation.customerId`.
Affected files: server/database-storage.ts (2955-3015), server/routes.ts (4464-4513)
Affected data: `reservations` (`type='replacement', placeholderSpare=true`) whose `customerId` doesn't match their `replacementForReservationId`'s actual customer.
Security impact: none directly, though it means a customer-facing artifact (invoice/contract note referencing the placeholder) could be attributed to the wrong customer.
Business impact: billing/contact mismatches if the spare's eventual invoice or communication follows `customerId` on the placeholder rather than re-deriving it from the original reservation; assignment/notification flows keyed off this row show the wrong customer's name.
Fix proposal: derive `customerId` from the original reservation server-side instead of trusting the request body, or reject when they differ.
Regression test proposal: create a placeholder with a `customerId` different from the original reservation's customer; assert 400.

---

BUG MT-011
Severity: MEDIUM
Feature: `spare-status` endpoint doesn't check reservation type
Status: OPEN
Reproduction: `PATCH /api/reservations/3235/spare-status` (#3235 is an ordinary `type:"standard"` customer rental, not a replacement) with `{"spareVehicleStatus":"ready"}`.
Expected: 400 — `spareVehicleStatus` is a replacement-vehicle concept; setting it on a standard rental is meaningless.
Actual: 200 — the standard reservation's `spare_vehicle_status` column is overwritten to `'ready'`.
Root cause: `server/routes.ts:4013-4062` validates the target status value and the from→to transition via `isValidSpareTransition`, but never checks `existingReservation.type === 'replacement'` first.
Affected files: server/routes.ts (4013-4062)
Affected data: `reservations.spare_vehicle_status` on `type='standard'`/`'maintenance_block'` rows.
Security impact: none (compounds MT-004 — a low-privilege user can do this too).
Business impact: pollutes an unrelated reservation's spare-tracking column; any UI reading `spareVehicleStatus` to decide spare-handover state for a customer rental would show a nonsensical value.
Fix proposal: reject with 400 unless `existingReservation.type === 'replacement'`.
Regression test proposal: PATCH `spare-status` on a `type:"standard"` reservation id; assert 400.

---

BUG MT-012
Severity: LOW
Feature: `PATCH /api/reservations/:id` — unvalidated `maintenanceStatus` values
Status: OPEN
Reproduction: `PATCH /api/reservations/3217` with `{"maintenanceStatus":"garbage"}` (reservation is a `maintenance_block`).
Expected: 400 — only `scheduled`/`in`/`out` are meaningful values per `docs/audit/01d-domein-en-data-integriteit.md` §Statusmachines.
Actual: 200 — `select maintenance_status from reservations where id=3217` → `'garbage'`.
Root cause: the generic `PATCH /:id` route (per the phase-1 audit doc, ~routes.ts:3445) writes `maintenanceStatus` with no enum/transition validation ("geen transitietabel" — now confirmed at the API boundary, not just by static reading).
Affected files: server/routes.ts (generic PATCH /:id reservation route)
Affected data: `reservations.maintenance_status` on any reservation.
Security impact: none.
Business impact: the maintenance calendar's filters/badges (which switch on `scheduled`/`in`/`out`) silently fail to recognize an invalid value, likely hiding the block from views that filter on a known set.
Fix proposal: validate `maintenanceStatus` against an explicit enum (`['scheduled','in','out']`) in the same place `spare-status`/`fines` status already do.
Regression test proposal: PATCH a reservation with an out-of-enum `maintenanceStatus`; assert 400.

---

BUG MT-013
Severity: LOW
Feature: No conflict check between two maintenance blocks on the same vehicle
Status: OPEN
Reproduction: Create block #3219 on V2 for 2026-10-01..2026-10-10, then block #3220 on V2 for 2026-10-05..2026-10-15 (overlapping).
Expected: some signal (warning/409) that the vehicle already has an overlapping block — two simultaneous "out for repair" windows for the same vehicle is not a valid real-world state.
Actual: both created with 201, no warning.
Root cause: `checkReservationConflicts` with `isMaintenanceBlock=true` (`database-storage.ts:1584-1585`) is never actually invoked from the `POST /api/reservations type=maintenance_block` route — that route only re-runs the *customer*-conflict check (`server/routes.ts:2531-2536`) after insert, not a block-vs-block check.
Affected files: server/routes.ts (2526-2601)
Affected data: `reservations` (`type='maintenance_block'`) on the same vehicle with overlapping date ranges.
Security impact: none.
Business impact: minor — mostly a UX/data-quality issue (duplicate/overlapping calendar entries for the same repair), but could confuse `maintenanceStatus` transitions if both blocks are being progressed independently.
Fix proposal: call `checkReservationConflicts(vehicleId, startDate, endDate, newBlockId, true)` after creating a block and surface a warning if it returns other active blocks.
Regression test proposal: create two overlapping maintenance blocks on the same vehicle; assert the second call is flagged.

---

BUG MT-014
Severity: LOW
Feature: Bulk-complete transports has no partial-failure handling
Status: OPEN
Reproduction: Reproduced the client's exact call pattern (`client/src/pages/delivery/dashboard.tsx:316-322`, `Promise.all(ids.map(id => apiRequest("PATCH", ...)))`) directly: `PATCH /api/transports/<valid id>` and `PATCH /api/transports/999999999` in parallel.
Expected: either an atomic all-or-nothing bulk endpoint, or a per-item result the UI can report accurately.
Actual: the valid transport's PATCH succeeds server-side (200, `status` becomes `completed`) while the invalid one 404s — confirmed via SQL (`select status from vehicle_transports where id=<valid>` → `completed`). Because the client wraps both calls in a single `Promise.all`, the whole batch rejects and `bulkCompleteTransportMutation`'s `onError` fires a single generic "update failed" toast — the user is told the bulk action failed even though part of it already committed, and `setSelectedRowKeys` never clears the successfully-completed row.
Root cause: no dedicated bulk API endpoint; the frontend fires N independent PATCH requests via `Promise.all`, which has no partial-success semantics (`client/src/pages/delivery/dashboard.tsx:316-322`).
Affected files: client/src/pages/delivery/dashboard.tsx (316-333), server/routes.ts (PATCH /api/transports/:id, 7438-7471, — server-side behaviour itself is correct/idempotent per item)
Affected data: none corrupted — this is a UX/reporting accuracy issue, not a data-integrity one.
Security impact: none.
Business impact: staff may think a bulk-complete failed and retry or investigate, while some transports are already marked completed; conversely a large batch with one bad id silently loses track of which rows actually succeeded.
Fix proposal: use `Promise.allSettled` and report per-row success/failure (or add a real bulk endpoint that does the same and returns a results array).
Regression test proposal: bulk-complete two ids where one is invalid; assert the UI/API communicates which one succeeded rather than a blanket failure.

---

## Additional evidence (not filed as separate bugs — supporting context)

- **Status values outside the state machine**: `createReplacementReservation` and `createMaintenanceBlock` both insert rows with `status: 'active'` or `'pending'` (`database-storage.ts:3224`, `3329`), neither of which appears in `VALID_RESERVATION_TRANSITIONS` (`shared/schema.ts:42-48`, only `booked/picked_up/completed/cancelled/returned`). `select count(*) from reservations where status in ('active','pending') and deleted_at is null` → **264 rows** in the audit database — roughly 1 in 7 of all reservations. Any of these can never be moved through `PATCH /:id/status` again (its transition table has no entry for `active`/`pending`, so every transition attempt would be rejected) — this is very likely the underlying mechanism behind MT-003's dangling replacements and part of why the stale-state sweep below finds what it does. Referenced from several bugs above rather than filed separately since the fix is the same in each case (use `'booked'`, matching what `assignVehicleToPlaceholder`/`applyTransportUpdate` already do for their own spare reservations).
- **Pre-existing stale placeholders in the (cloned) production data**: the stale-state sweep (item 7) found two placeholder reservations that were already stale before this test session touched anything: id 1549 (`end_date=2026-08-30`, `placeholder_spare=true`, `status='booked'`, `replacement_for_reservation_id=318`) and id 1533 (`end_date=2026-08-29`, same shape, `replacement_for_reservation_id=29`) — both past their end date, still shown as needing spare-vehicle assignment (per `getPlaceholderReservationsNeedingAssignment`'s own filter logic) with no vehicle ever assigned. Real-world confirmation that placeholders can go stale with no expiry/cleanup path, independent of the MT-003/MT-006 mechanisms found here.
- **Working as designed / not a bug** (tested, no defect found): `generate-report` correctly rejects a TBD-spare transport server-side (400), not just client-side, refuting that part of the item-6 hypothesis. `applyTransportUpdate` correctly refuses to reassign a transport's spare vehicle once it has been `picked_up` ("Return it first, or leave it as-is"). Deleting a transport with a still-`booked` spare reservation correctly soft-deletes that spare reservation (no staleness). Completing a transport twice is idempotent (200, no error, no duplicate side effects). `assign-vehicle` on a placeholder correctly rejects a busy vehicle (409), the original vehicle itself (409, via the same conflict check since it's still "busy" with the original rental), an `in_service` vehicle (409), and an open-ended placeholder assignment with no `endDate` (400); re-assigning an already-assigned placeholder correctly 404s (`placeholderSpare` is already `false`, so it no longer matches `assignVehicleToPlaceholder`'s lookup). `needing-assignment?daysAhead=` correctly 400s on negative/non-numeric input via zod.

## Fixture cleanup note

Per instructions, test data was left in place (prefixed `AUDIT-`/`AU-0xx-X`) rather than cleaned up — the database is disposable. No application code was modified.

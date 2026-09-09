# Reservations end-to-end — QA audit (phase 3-5, 10, 13)

2026-09-09. Audit server http://localhost:5001, database `lvs_audit`. All test data prefixed `AUDIT-`
(vehicles `AU-RSV-001..017`, customers `AUDIT-RSV-Customer-*`). Scripts in `docs/audit/wip/scripts/`
(`api.mjs` cookie-jar HTTP helper reusing the shared staff session, `db.mjs` direct-Postgres helper,
`t0*_*.mjs` test scripts, `ids.mjs` test-data id map). The dev server (tsx watch) restarted/dropped
connections several times during testing (ECONNREFUSED, self-recovered within seconds—minutes); this
did not lose any already-committed data and all findings below were re-verified against the DB after
recovery.

## Tested

- Create: valid; end<start (rejected); same-day start=end (accepted); past start date (accepted, no
  validation — see RS-010); far-future 2099 (accepted); missing vehicleId (rejected, zod refine);
  missing customerId (accepted, nullable); non-existing vehicleId/customerId (both accepted — RS-009);
  vehicle with `not_for_rental`/`needs_fixing` (both bookable via API — RS-004); blacklisted
  customer/vehicle pair on create (correctly rejected 409) vs. via edit (bypassed — RS-003);
  totalPrice `-1` / `"abc"` / `1e308` (all accepted, no bound — RS-011); notes 100 kB (accepted in
  full); notes with `<script>`/HTML (stripped server-side by DOMPurify sanitizeInput middleware —
  working as intended, not a bug); unexpected extra fields (`isAdmin`, forced `id`) — safely dropped
  by the zod insert schema, no privilege escalation; malformed JSON (400, but leaks a full Node stack
  trace — RS-014, correctly gated behind `NODE_ENV!=='production'`); wrong `Content-Type: text/plain`
  (400, body not parsed, standard body-parser behaviour, no bug).
- Conflicts: overlapping booking on same vehicle (409, correct); same-day turnover without times
  (accepted, correct per design); same-day turnover with non-overlapping times (accepted, correct);
  same-day turnover with overlapping times (409, correct); `GET /api/reservations/check-conflicts`
  outcome matched the POST outcome in every case tested; standard rental overlapping a
  `maintenance_block` (accepted — confirmed by-design spare-vehicle model, not a bug); a second
  `maintenance_block` overlapping an existing one on the same vehicle (accepted — RS-007, this one
  *is* a bug).
- Race conditions: 10 concurrent `POST /api/reservations` for the same vehicle+period (only 1 of 10
  succeeded — inconclusive, likely connection-pool serialization); repeated with 20 concurrent raw
  `http.request` calls with `keepAlive:false` on a fresh vehicle — 19 of 20 succeeded, all inserted as
  separate overlapping rows (RS-001, confirmed via SQL count). 10 (9 reachable) concurrent
  `POST /:id/pickup` with an identical contract number — only 1 succeeded, the other 8 hit the DB
  unique constraint but as a raw, unhandled 400 (RS-008) rather than corrupting data — no duplicate
  contract numbers were persisted (the DB constraint is an effective last-resort guard).
- Status: valid `booked→picked_up→completed` via `/status` (correct, and confirmed the "mark
  completed" side effect overwrites `endDate` to today — RS-005); invalid `booked→completed` via
  `/status` (correctly rejected 400 with a transition-hint message); reversion `completed→booked` via
  `/status` (allowed per the documented reversion allowlist, confirmed); bypass via
  `PATCH /:id/basic {status:"completed"}` on a `booked` reservation (accepted, no transition check —
  RS-002); bypass via `PATCH /:id {status:"completed"}` on a `booked` reservation (accepted, no
  transition check — RS-002); `PATCH /:id {status:"garbage"}` (accepted and persisted verbatim —
  RS-002, most severe variant); `PATCH /:id/status {status:"garbage"}` (correctly rejected 400
  "Invalid status value" — the dedicated endpoint is well-guarded, only the generic PATCH paths are
  not). `vehicles.availability_status` checked by SQL after each step — unaffected by the status-field
  corruption in this test because none of the corrupted reservations had been picked up (see RS-002
  for why this still matters).
- Pickup/return: missing contract number (400, clear message); duplicate contract number on pickup
  (400, raw DB error — RS-008); mileage lower than pickup without override (400, clear
  `requiresOverride` message); same with `allowMileageDecrease:true` but no password (still blocked,
  correct); with a wrong override password (403, correct); return before pickup (400, clear message);
  pickup twice on the same reservation (second call correctly blocked 400); return twice (second call
  correctly blocked 400); pickup on a cancelled reservation (correctly blocked 400); pickup on a
  soft-deleted reservation (correctly 404). After each step, SQL-verified reservation status, vehicle
  `availability_status`/`current_mileage`, and confirmed contract-PDF/damage-check document rows plus
  the actual files exist under `audit-uploads/<PLATE>/contracts|damage-checks/` (no bug — but see
  RS-005 for the endDate side effect and RS-012 for what a later delete leaves behind).
- Edit: change vehicle to one already booked in the period, via full `PATCH` and via `/basic` (both
  correctly return 409, consistent); change customer (accepted, correct); edit a `completed`
  reservation via full `PATCH` and via `/basic` (both accepted with zero restriction — no
  immutability guard on completed reservations, noted under RS-002's root cause but not filed
  separately since it's a symptom of the same missing-transition-and-state-guard design); comparison
  of `/basic` vs full `PATCH`: `/basic` re-validates the *entire* row through `insertReservationSchema`
  (so omitting `startDate` fails 400), while full `PATCH` accepts arbitrary partial bodies with no
  schema at all (confirmed by successfully setting `damageCheckPath` to an arbitrary string via full
  PATCH with no validation).
- Delete/restore: `DELETE /api/reservations/:id` as admin (200, soft delete: `deletedAt`/`deletedBy`
  set, `contractNumber` nulled, `status` left unchanged e.g. still `picked_up`); delete again (410→
  actually returned 404 "Reservation not found", see note below); `GET` on a deleted reservation (404,
  correctly filtered); no `/restore` endpoint exists for a soft-deleted reservation (confirmed by
  route probe); a reservation with a generated contract document and an active driver assignment was
  deleted — the `documents` row/file and the `reservation_driver_assignments` row both survive,
  orphaned, still pointing at the now-deleted reservation (RS-012).
- Sequence (cancel → modify → change vehicle → delete related vehicle → reload): reproduced end to
  end. Cancelling, editing notes, and reassigning the vehicle on a cancelled reservation were all
  accepted with no restriction. Deleting the vehicle the reservation had just been reassigned to
  **hard-deleted the reservation row itself** (not soft-delete — the row vanished from `reservations`
  entirely, confirmed by SQL and by the vehicle-delete's own audit-log entry recording
  `"cascaded":{"reservations":1}`). This is recoverable only via the separate, vehicle-scoped
  `POST /api/deleted-records/:id/restore` admin endpoint (confirmed working — restored the exact row).
  See RS-006.
- Overdue: created a `picked_up` reservation with `endDate` in the past; `GET /api/reservations/overdue`
  correctly lists it. No bug.
- Recurring: `isRecurring:true, recurringFrequency:"weekly"` accepted and persisted; SQL-confirmed 0
  reservations with `recurringParentId` pointing at it — no generator runs (RS-013).

### Not tested (why)
- `PATCH /:id/basic` and `PATCH /:id` field-by-field diff beyond `status`/`damageCheckPath` (time
  budget; the transition-bypass finding was the priority).
- Notification content/delivery on delete (no notification UI/endpoint was exercised beyond DB row
  presence checks; `portalNotifications`/similar tables were not queried for this feature).
- Full fuzzing matrix on `startTime`/`endTime` regex, `deliveryStatus`/`spareVehicleStatus` enums, and
  `maintenance-with-spare` route (out of scope for this pass; flagged in the read-only audit doc
  already).
- Load-scale race testing beyond 20 concurrent requests (sufficient to prove RS-001; higher concurrency
  was not attempted given the shared audit server was also carrying other parallel test agents).
- Contract-number race via the *suggested*-number endpoint (`GET /api/settings/next-contract-number`)
  specifically — tested the equivalent (and more direct) client-supplied-duplicate race instead, which
  reproduces the same unhandled-500-class error path.

---

## BUG RS-001
Severity: CRITICAL
Feature: Reservation create — double-booking race condition
Status: OPEN
Reproduction:
  1. Create vehicle `AU-RSV-015` (id 1696), no existing reservations.
  2. Fire 20 concurrent `POST /api/reservations` (raw `http.request`, `keepAlive:false`, same session/
     CSRF token) all with `{vehicleId:1696, customerId:1254, startDate:"2026-10-01", endDate:"2026-10-05"}`.
  3. `SELECT count(*) FROM reservations WHERE vehicle_id=1696 AND start_date='2026-10-01'` → 19 rows
     (ids 3261-3279), only 1 request got HTTP 409.
Expected: exactly 1 reservation created; the other 19 requests should receive 409 conflict.
Actual: 19 of 20 concurrent requests all created overlapping "booked" reservations for the identical
vehicle and period — the vehicle is now double- (19×-) booked for the same week.
Root cause: `checkReservationConflicts` (server/database-storage.ts:~1528) runs a plain `SELECT` and
the subsequent `INSERT` in `POST /api/reservations` (server/routes.ts:~2435) happens with no
transaction, no row lock (`SELECT ... FOR UPDATE`), and no DB-level exclusion constraint on
`(vehicle_id, daterange(start_date,end_date))`. Matches the audit doc's predicted risk #1
(`docs/audit/01d-domein-en-data-integriteit.md` §"Integriteitsrisico's" item 1).
Affected files: server/database-storage.ts (checkReservationConflicts), server/routes.ts (POST
/api/reservations handler).
Affected data: `reservations` table — any vehicle can accumulate duplicate overlapping bookings under
concurrent load (e.g. a popular vehicle booked simultaneously from multiple browser tabs/staff at
counter + phone + portal).
Security impact: none directly (requires an authenticated staff/portal session), but it is a
business-logic integrity failure exploitable by a malicious or buggy client double-submitting.
Business impact: a vehicle can be rented to more customers than physically exist — direct revenue/
operational risk (double allocation, customer walks in and the car is already gone).
Fix (proposal only): wrap the conflict-check + insert in a single `db.transaction` using
`SELECT ... FOR UPDATE` on the candidate overlapping rows (or an advisory lock keyed on vehicleId), or
add a Postgres exclusion constraint (`EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date,
end_date) WITH &&)`) as a hard backstop, catching the resulting DB error and mapping it to a friendly
409.
Regression test (proposal): repeat the 20-concurrent-POST scenario in CI against a disposable DB;
assert exactly 1 row is created and 19 responses are 409.

## BUG RS-002
Severity: CRITICAL
Feature: Reservation status — transition bypass via generic PATCH endpoints
Status: OPEN
Reproduction:
  1. Create a `booked` reservation (id 3291) on vehicle 1690.
  2. `PATCH /api/reservations/3291/basic` with the reservation's current full field set plus
     `status:"completed"` → 200, status becomes `completed` directly from `booked` (skipping
     `picked_up` entirely).
  3. Create another `booked` reservation (id 3292). `PATCH /api/reservations/3292` (full patch) with
     body `{"status":"completed"}` → 200, same illegal jump.
  4. Create another `booked` reservation (id 3293). `PATCH /api/reservations/3293` with body
     `{"status":"garbage"}` → 200, and `SELECT status FROM reservations WHERE id=3293` returns the
     literal string `'garbage'`. `GET /api/reservations/3293` happily serves this corrupted row back
     (200).
  5. For comparison, `PATCH /api/reservations/{id}/status` (the dedicated endpoint) with
     `{"status":"garbage"}` on a fresh reservation correctly rejects with 400 `"Invalid status value"`,
     and with `{"status":"completed"}` on a `booked` reservation correctly rejects with 400 "Invalid
     status transition from 'booked' to 'completed'".
Expected: every write path that can set `reservations.status` should be constrained by
`VALID_RESERVATION_TRANSITIONS` / `isValidReservationTransition`, matching the dedicated `/status`
endpoint's behaviour, and only ever accept one of the known enum values.
Actual: `PATCH /:id/basic` and `PATCH /:id` both write `status` straight through with no transition
check and no enum check at all — an arbitrary string is persisted.
Root cause: `PATCH /:id/basic` (server/routes.ts:~3090-3120) runs `insertReservationSchema.parse(...)`
which validates shape but not transition legality (the schema's `status` field is just `text`). `PATCH
/:id` (server/routes.ts:~3445-3602) explicitly bypasses `insertReservationSchema` altogether (comment:
"bypass full schema validation and just use the raw data"), so `status` isn't even shape-checked.
Neither path calls `isValidReservationTransition`. Matches audit doc risk #4.
Affected files: server/routes.ts (`PATCH /api/reservations/:id/basic`, `PATCH /api/reservations/:id`),
shared/schema.ts (`VALID_RESERVATION_TRANSITIONS`, not consulted by these two routes).
Affected data: `reservations.status` for any row — can be forced into an undefined/garbage value,
or transitioned out of order (e.g. skipping pickup, or un-completing/re-completing arbitrarily),
bypassing every side effect the dedicated `/status` endpoint performs (mileage/fuel/contract-number
clearing on reversion, vehicle-status sync).
Security impact: a lower-privileged or buggy client that only has access to the generic edit form
could corrupt operational state that the UI assumes is enum-constrained; no auth bypass by itself.
Business impact: downstream consumers (dashboards, reports, filters, the vehicle-status sync that
keys off `picked_up`) can silently mis-render or mis-count reservations with an invalid or
prematurely-advanced status; a `completed` reservation reached via this path also skips the
pickup/return side effects (no `pickupMileage`, no contract), leaving an inconsistent financial
record.
Fix (proposal only): route both `/basic` and the full `PATCH /:id` through the same
`isValidReservationTransition` check used by `/status` whenever the request body includes a `status`
field that differs from the current value (or simply strip `status` from what these two endpoints are
allowed to write, and require the dedicated `/status` endpoint for all status changes).
Regression test (proposal): for each of `/basic` and `/:id`, attempt `booked→completed` and
`booked→"not-a-real-status"`; assert both are rejected 400 and the DB row is unchanged.

## BUG RS-003
Severity: HIGH
Feature: Vehicle/customer blacklist — bypass via edit
Status: OPEN
Reproduction:
  1. `POST /api/vehicles/1687/blacklist` `{customerId:1256, reason:"AUDIT-blacklist-reason"}` → 201.
  2. `POST /api/reservations {vehicleId:1687, customerId:1256, ...}` → correctly 409 "This customer is
     blacklisted for this vehicle and cannot be booked on it."
  3. `POST /api/reservations {vehicleId:1687, customerId:1254 (not blacklisted), ...}` → 201 (id 3322).
  4. `PATCH /api/reservations/3322 {"customerId":1256}` (the blacklisted customer) → 200 success, the
     reservation now has the blacklisted customer on the blacklisted vehicle, with no error at any
     point.
Expected: the blacklist check that runs on create should also run whenever an edit would result in a
blacklisted (vehicleId, customerId) pair — whether the vehicle or the customer changes.
Actual: the check only exists on `POST /api/reservations`; both `PATCH /:id` and (based on the same
code-read as RS-002) `PATCH /:id/basic` skip it entirely.
Root cause: server/routes.ts:~2505-2516 (create path) calls
`storage.isCustomerBlacklistedForVehicle`; no equivalent call exists in the `PATCH /:id` handler
(~3445+) or `PATCH /:id/basic` (~3090+). Matches audit doc's note under "Beschikbaarheid" table.
Affected files: server/routes.ts (`PATCH /api/reservations/:id`, `PATCH /api/reservations/:id/basic`).
Affected data: `reservations.customerId`/`vehicleId` for any existing reservation.
Security impact: this is exactly the kind of control a blacklist exists to enforce (e.g. a customer
barred for a damage/fraud history) — a two-step workaround (book with any customer, then edit the
customer) fully defeats it with no warning.
Business impact: a blacklisted customer can end up in possession of a vehicle they were explicitly
barred from, via a normal edit flow that any staff user with reservation-edit rights can perform
(intentionally or by habit, e.g. "just changing the name on file").
Fix (proposal only): call the same blacklist check inside both PATCH handlers whenever the effective
post-update `(vehicleId, customerId)` pair differs from the current one.
Regression test (proposal): create a non-blacklisted reservation, blacklist the pair, then PATCH the
reservation's customerId/vehicleId to recreate that exact pair; assert 409.

## BUG RS-004
Severity: HIGH
Feature: Reservation create ignores vehicle availabilityStatus
Status: OPEN
Reproduction:
  1. `PATCH /api/vehicles/1688 {"availabilityStatus":"not_for_rental"}` → 200.
  2. `POST /api/reservations {vehicleId:1688, customerId:1254, startDate:"2029-04-01", endDate:"2029-04-05"}`
     → 201 (id 3324), booking succeeds.
  3. Repeated for `availabilityStatus:"needs_fixing"` on a second vehicle (1689) → also 201 (id 3326).
  4. `GET /api/vehicles/available?startDate=2029-04-01&endDate=2029-04-05` → confirmed neither vehicle
     1688 nor 1689 appears in this list (the picker correctly hides them).
Expected: a vehicle explicitly marked not for rental or in need of repair should not be bookable
through any path, or at minimum the create endpoint should reject/warn the same way the availability
picker filters it out.
Actual: the create endpoint has no awareness of `availabilityStatus` at all — only the UI's vehicle
picker (via `/api/vehicles/available`) filters these out; a direct API call (or a UI flow that doesn't
go through that picker, e.g. editing an existing draft) can still book them.
Root cause: `checkReservationConflicts` (server/database-storage.ts:~1528-1622) performs no
availabilityStatus filtering — confirmed by direct code read and by this reproduction. Matches audit
doc's explicit conclusion: "Gevolg: `not_for_rental`/`needs_fixing` voertuig is via `POST
/api/reservations` boekbaar; UI-picker verbergt hem."
Affected files: server/database-storage.ts (`checkReservationConflicts`), server/routes.ts (POST
/api/reservations).
Affected data: `reservations` rows can exist for vehicles flagged unrentable/broken.
Security impact: none.
Business impact: a vehicle in the workshop ("needs_fixing") or explicitly withdrawn from rental
("not_for_rental") can be booked and, per RS-004's counterpart concern, even picked up — handing a
customer a car that was deliberately marked as not fit to rent.
Fix (proposal only): add an availabilityStatus check to `checkReservationConflicts` (or a preceding
guard in the POST handler) that rejects `not_for_rental`/`needs_fixing` vehicles unless an explicit
staff override flag is passed, mirroring the exclusion `getAvailableVehiclesInRange` already applies.
Regression test (proposal): set a vehicle to each of the two statuses; assert POST /api/reservations
is rejected (or requires override) for both.

## BUG RS-005
Severity: HIGH
Feature: Reservation status "completed" / return — endDate corrupted to today's date
Status: OPEN
Reproduction:
  1. Create a reservation with `startDate:"2026-10-01", endDate:"2026-10-05"` (id 3289).
  2. `PATCH /3289/status {"status":"picked_up"}` → 200.
  3. `PATCH /3289/status {"status":"completed"}` → 200; response body shows
     `"endDate":"2026-09-09"` (today) — **before** `startDate:"2026-10-01"`, an inverted date range.
  4. Separately, `POST /3299/pickup` then `POST /3299/return` on a reservation with
     `startDate:"2028-05-01", endDate:"2028-05-05"`: after return,
     `SELECT start_date, end_date FROM reservations WHERE id=3299` → `start_date='2028-05-01'`,
     `end_date='2026-09-09'` — again endDate is nearly two years before startDate.
Expected: `endDate` should reflect the reservation's actual/agreed end of rental, or at minimum never
end up earlier than `startDate`. The same `insertReservationSchema` refine that blocks
`endDate < startDate` on create (confirmed in RS testing: "end before start" → 400) is not applied
here.
Actual: both the `/status` "mark completed" path and `returnReservation` unconditionally set
`endDate` (and `completionDate`) to the actual completion/return timestamp (today, in this always-
in-the-future test data), overwriting whatever the original planned end date was, without checking it
against `startDate`.
Root cause: server/routes.ts:~3358-3362 (status endpoint, "Marking completed sets endDate to today")
and the equivalent logic inside `returnReservation` (server/database-storage.ts, `pickupReservation`/
`returnReservation` region ~1624-1786) — both write paths bypass the zod refine that would normally
catch this.
Affected files: server/routes.ts (`PATCH /:id/status`), server/database-storage.ts
(`returnReservation`).
Affected data: `reservations.end_date`/`completion_date` for any reservation picked up ahead of its
scheduled end and returned/completed early relative to a future-dated booking, or any reservation
whose real end date is not "today" for other reasons (e.g. backdated data entry).
Security impact: none.
Business impact: reports/exports that rely on `endDate` for rental-duration or revenue-per-day
calculations will show negative-length rentals; any UI that renders a date range will show `end <
start`, which is confusing and may break date-range widgets or sorting.
Fix (proposal only): only update `endDate` to today if it differs from (or is null/blank compared to)
the recorded value, or introduce a separate `actualEndDate` distinct from the planned `endDate`
(the row already carries `actualReturnDate`/`actualPickupDate` for this purpose — prefer relying on
those instead of overwriting `endDate`).
Regression test (proposal): create a reservation with a future endDate, complete/return it today;
assert `endDate` is either left as the original planned value or is not earlier than `startDate`.

## BUG RS-006
Severity: MEDIUM
Feature: Vehicle delete hard-deletes all its reservations (any status), recoverable only via a
separate admin trash endpoint
Status: OPEN
Reproduction:
  1. Create reservation (id 3309) on vehicle A (1722), cancel it, edit its notes, then `PATCH` its
     `vehicleId` to vehicle B (1723) — all accepted with no restriction on editing a cancelled
     reservation.
  2. `DELETE /api/vehicles/1723` with the required `confirmLicensePlate` → 200
     `{"success":true,"restorable":true}`.
  3. `GET /api/reservations/3309` → 404 "Reservation not found".
  4. `SELECT * FROM reservations WHERE id=3309` → zero rows (not soft-deleted — the row is gone).
     `SELECT * FROM deleted_records WHERE entity_type='vehicle' AND entity_id=1723` → present, with
     `audit_logs` recording `"cascaded":{"reservations":1,...}` for the `vehicle.delete` action.
  5. `POST /api/deleted-records/35/restore` (the vehicle's own deleted-records id) → 200, and
     `GET /api/reservations/3309` now returns 200 with the exact original row restored.
Expected: given the audit doc's stated design (reservations are meant to be soft-deleted, with
`deletedAt`/`deletedBy` and no other table hard-deleting them), a vehicle delete removing its
reservations outright — including a merely-cancelled one that carries no financial/operational history
tied to the vehicle itself — is a much more destructive default than the reservation's own DELETE
endpoint uses. At minimum this should be very clearly signalled, and ideally completed/historical
reservations should be preserved (e.g. reparented to a "deleted vehicle" placeholder) rather than
removed.
Actual: `deleteVehicle` (server/database-storage.ts:535-618) snapshots every reservation tied to the
vehicle into `deleted_records.payload` (good) but then hard-deletes them from `reservations`
(`tx.delete(reservations).where(eq(reservations.vehicleId,id))`, line 599) with no filter on status —
booked, cancelled, picked_up, and completed reservations are all removed identically. The only
recovery path is the vehicle-level `/api/deleted-records/:id/restore`, which is admin-only and not
linked from anywhere in the reservation's own UI/API surface (a reservation's own DELETE has no such
recovery at all — see RS in "Tested" notes).
Root cause: server/database-storage.ts:599 (`deleteVehicle`), no status/type filter before the hard
delete.
Affected files: server/database-storage.ts (`deleteVehicle`, `restoreDeletedRecord`).
Affected data: `reservations` rows for any vehicle that gets deleted; recoverable only through
`deleted_records` while that snapshot exists and the vehicle id/license plate haven't been reused.
Security impact: none directly (delete requires MANAGE_VEHICLES + typed license-plate confirmation),
but this is the exact failure mode described in this project's own incident notes (a vehicle plus its
reservation vanishing) — reproduced here on demand with a clean repro.
Business impact: a staff member deleting an old/retired vehicle can silently and permanently (absent
someone finding and using the trash-restore feature) erase completed rental history for that vehicle,
which may be needed for financial reporting, disputes, or audits.
Fix (proposal only): either (a) block vehicle deletion while any non-cancelled/non-completed
reservation still references it (the confirmation dialog already shows the count — make it a hard stop
for `booked`/`picked_up`), or (b) soft-delete the cascaded reservations (set `deletedAt`) instead of
hard-deleting them, keeping them queryable/restorable through the same mechanism used for a direct
reservation delete.
Regression test (proposal): create a vehicle with a completed reservation; delete the vehicle; assert
the reservation is either blocked-from-delete or still present (soft-deleted) in the DB, not gone.

## BUG RS-007
Severity: MEDIUM
Feature: Maintenance-block reservations can double-book the same vehicle
Status: OPEN
Reproduction:
  1. `POST /api/reservations {vehicleId:1684, type:"maintenance_block", startDate:"2026-12-01",
     endDate:"2026-12-10"}` → 201 (id 3257).
  2. `POST /api/reservations {vehicleId:1684, customerId:1254, startDate:"2026-12-03",
     endDate:"2026-12-06"}` (a standard rental inside the block) → 201 (id 3258, allowed by design —
     spare-vehicle model).
  3. `POST /api/reservations {vehicleId:1684, type:"maintenance_block", startDate:"2026-12-05",
     endDate:"2026-12-08"}` (overlaps the *first* maintenance block, 12-05..12-08 inside 12-01..12-10)
     → 200 (not 409) with `{"message":"Customer reservations found during maintenance period",
     "needsSpareVehicle":true,...}`.
  4. `SELECT id,type,start_date,end_date FROM reservations WHERE vehicle_id=1684 AND
     type='maintenance_block'` → both id 3257 (2026-12-01..12-10) and id 3259 (2026-12-05..12-08)
     exist simultaneously — the vehicle is scheduled for two overlapping maintenance windows.
Expected: per the audit doc's documented design ("onderhoudsblok ≠ verhuur" — a maintenance block
should conflict with other maintenance blocks on the same vehicle, just not with standard rentals),
step 3 should have been rejected 409.
Actual: the second maintenance block was created; the create path only checked for/warned about
overlapping *customer* reservations, not the pre-existing maintenance block.
Root cause: audit doc notes the maintenance_block create path (server/routes.ts:~2528) runs its
conflict check *after* the insert already happened ("conflictcheck ná insert"); this reproduction
suggests that post-insert check either doesn't compare against other maintenance blocks or its 200
"needsSpareVehicle" branch masks a block-vs-block conflict that should instead be a 409.
Affected files: server/routes.ts (maintenance_block branch of POST /api/reservations, ~2528-2596).
Affected data: `reservations` (type='maintenance_block') for vehicle 1684 (ids 3257, 3259 — both left
in place for reference).
Security impact: none.
Business impact: a vehicle can be double-scheduled for maintenance/service, which could result in
conflicting workshop bookings or the vehicle being marked unavailable for two overlapping reasons,
confusing planning.
Fix (proposal only): explicitly check new maintenance_block date ranges against existing
maintenance_block rows for the same vehicle before insert, returning 409 on overlap, independent of
the customer-reservation/spare-vehicle check.
Regression test (proposal): create a maintenance_block, then attempt to create a second overlapping
maintenance_block on the same vehicle; assert 409.

## BUG RS-008
Severity: MEDIUM
Feature: Duplicate contract number surfaces as a raw, unhandled database error
Status: OPEN
Reproduction:
  1. Directly: pick up reservation 3296 with `contractNumber:"AUDIT-RACE-CONTRACT-2"`, a number already
     in use by reservation 3281 → 400 `{"message":"duplicate key value violates unique constraint
     \"reservations_contract_number_unique\""}`.
  2. Under race: 9 concurrent `POST /:id/pickup` calls (different reservations) all supplying
     `contractNumber:"AUDIT-RACE-CONTRACT-2"` → 1 succeeded (200), the other 8 all returned this same
     raw-DB-error 400.
Expected: a friendly, handled 409 (matching the pattern already used by `PATCH /:id`'s own duplicate-
contract-number guard, which returns `{"code":"DUPLICATE_CONTRACT_NUMBER", ...}`), not a leaked
Postgres constraint name/message.
Actual: `POST /:id/pickup` (and, per the earlier create-race test, `POST /api/reservations` generally)
has no pre-check for an existing contract number — it relies solely on the DB unique constraint, and
the resulting error is not translated into a clean API response.
Root cause: no duplicate-contract-number pre-check in the pickup handler (server/routes.ts:4067-4239),
unlike `PATCH /:id` (routes.ts:3582-3598) which does have one. The generic catch-all error handling
passes the raw driver error message straight through.
Affected files: server/routes.ts (`POST /api/reservations/:id/pickup`, and the create path).
Affected data: none corrupted — the unique constraint successfully prevented any actual duplicate from
being persisted in every trial.
Security impact: low — the error message reveals the DB constraint/table naming convention
(`reservations_contract_number_unique`), a minor information-disclosure detail, not exploitable
directly.
Business impact: staff see a confusing raw database error instead of "this contract number is already
in use, pick another" — poor UX especially under the exact race scenario the suggested-next-number flow
is meant to avoid.
Fix (proposal only): add the same duplicate-contract-number pre-check used in `PATCH /:id` to the
pickup handler and to `POST /api/reservations`, and/or catch the unique-constraint violation
specifically in the generic error handler and map it to a 409 with a clear message.
Regression test (proposal): attempt to pick up two different reservations with the same contract
number sequentially; assert the second gets a clean 409, not a raw DB message.

## BUG RS-009
Severity: MEDIUM
Feature: Reservation create accepts non-existent vehicleId/customerId (no FK)
Status: OPEN
Reproduction:
  `POST /api/reservations {vehicleId:999999999, customerId:1254, startDate:"2026-12-10",
  endDate:"2026-12-12"}` → 201 (id 3234). `SELECT vehicle_id, status FROM reservations WHERE id=3234`
  confirms `vehicle_id=999999999` persisted, referencing no real vehicle. Same behaviour confirmed for
  a non-existent `customerId` on a valid vehicle (id 3241, `customer_id=999999999`, 201).
Expected: creating a reservation against a vehicle/customer id that doesn't exist should fail (404 or
400), or the column should be a real FK.
Actual: accepted and persisted without any existence check.
Root cause: `reservations.vehicleId`/`customerId` have no `.references()` FK constraint (confirmed in
shared/schema.ts, and explicitly called out in the read-only audit doc §"Niet-afgedwongen
FK-kolommen"); the route handler (server/routes.ts:2435+) does not separately verify the ids exist
before inserting.
Affected files: shared/schema.ts (reservations table definition), server/routes.ts (POST
/api/reservations).
Affected data: `reservations` rows can dangle with no matching vehicle/customer.
Security impact: none directly.
Business impact: orphaned reservations referencing deleted/nonexistent vehicles or customers will
break any UI/report that inner-joins reservations to vehicles/customers (as seen for the vehicle-
delete case where the reservation simply vanished from GET responses — see RS-006's related but
distinct mechanism); here the row is never even tied to a real entity in the first place, which is a
strictly worse variant with no snapshot anywhere.
Fix (proposal only): add explicit existence checks in the route handler before insert (cheap: two
`SELECT id FROM ... WHERE id=$1` calls, or a single query with a `NOT EXISTS`), returning 404 with a
clear field name; longer-term, add real FK constraints as the audit doc recommends.
Regression test (proposal): POST a reservation with a vehicleId that doesn't exist; assert 404/400,
not 201.

## BUG RS-010
Severity: MEDIUM
Feature: Reservation create accepts a start date in the past, which then permanently blocks the
vehicle via the overdue guard
Status: OPEN
Reproduction:
  1. `POST /api/reservations {vehicleId:1682, customerId:1254, startDate:"2020-01-01",
     endDate:"2020-01-05"}` → 201 (id 3233), no validation error despite the date being ~6 years in
     the past relative to the server's current date (2026-09-09) and the reservation never having been
     picked up.
  2. Any subsequent `POST /api/reservations` for vehicle 1682 with *any* future date range → 409
     `{"message":"This vehicle has overdue reservations that must be resolved first",
     "overdueReservations":[{...id 3233...}]}` — confirmed for a 2026-12 range, an unrelated 2027
     range, etc. The vehicle is now unbookable for any future date until an admin manually resolves
     reservation 3233.
Expected: either reject a startDate clearly in the past on create (most rental businesses don't allow
backdating a fresh "booked" reservation), or at minimum don't let one permanently block all unrelated
future bookings on the vehicle.
Actual: the create endpoint has no past-date validation, and the "vehicle has overdue reservations"
guard treats this stale booked-but-never-picked-up reservation as blocking every future booking on the
vehicle, indefinitely, regardless of how far in the future the new request is.
Root cause: no zod-level or route-level check on `startDate` being in the past (server/routes.ts:2435,
shared/schema.ts insertReservationSchema); the overdue-guard query (server/routes.ts:~2624-2629,
`getOverdueReservationsByVehicle`) has no date-proximity limit.
Affected files: server/routes.ts (POST /api/reservations, overdue guard), shared/schema.ts.
Affected data: `reservations` (id 3233 on vehicle 1682, intentionally left in place as a live repro of
the lockout — vehicle 1682 is unbookable for any future date until this row's status changes).
Security impact: none.
Business impact: a single mis-entered past date (typo, timezone confusion, bad import) can silently
and completely take a vehicle out of the bookable fleet with no obvious cause in the booking UI beyond
a generic "overdue reservations" error — likely to cause real support/ops confusion.
Fix (proposal only): reject `startDate` more than e.g. a day in the past on create (with an explicit
override for legitimate backdated data entry, if needed), and/or scope the overdue guard to only block
bookings that would actually overlap the overdue reservation's window rather than blocking the entire
future.
Regression test (proposal): POST a reservation with startDate several years in the past; assert it is
rejected, or, if accepted, assert a later POST for a non-overlapping future date on the same vehicle
still succeeds.

## BUG RS-011
Severity: LOW
Feature: totalPrice has no bounds and non-numeric input is silently discarded
Status: OPEN
Reproduction:
  - `totalPrice:-1` → 201, persisted as `-1` (SQL confirmed).
  - `totalPrice:1e308` → 201, persisted as a literal ~309-digit number in the `numeric` column (SQL
    confirmed).
  - `totalPrice:"abc"` → 201, but `total_price` is `null` in the DB — the invalid value was silently
    dropped with no error returned to the caller.
Expected: negative prices rejected (or clamped), unreasonably large values rejected, and non-numeric
input rejected with a 400 rather than silently nulled.
Actual: all three accepted with 201; only the non-numeric case results in silent data loss (the client
believes the price it sent was saved).
Root cause: `insertReservationSchema`'s totalPrice handling coerces empty/NaN to `undefined`
(shared/schema.ts:813-824) with no `.min()`/`.max()` bound; server/routes.ts:2477-2483 pre-parses it
similarly.
Affected files: shared/schema.ts, server/routes.ts.
Affected data: `reservations.total_price` for the three test rows (ids 3242, 3243, 3244).
Security impact: none.
Business impact: negative/absurd prices could distort financial reports if entered by mistake or
by a scripted integration; the silent-null-on-invalid-input case is a worse UX issue since staff get
no feedback that their price wasn't saved.
Fix (proposal only): add `.min(0)` and a sane `.max()` to the totalPrice zod field, and reject
non-coercible string input with a 400 instead of silently dropping it.
Regression test (proposal): POST with totalPrice -1 and totalPrice "abc"; assert both 400.

## BUG RS-012
Severity: LOW
Feature: Deleting a reservation orphans its documents and driver assignment
Status: OPEN
Reproduction:
  1. Create a reservation with `driverId:161`, pick it up (generates a contract PDF `documents` row).
  2. `DELETE /api/reservations/{id}` → 200, soft-deleted.
  3. `SELECT * FROM documents WHERE reservation_id={id}` → the contract document row still present,
     `SELECT * FROM reservation_driver_assignments WHERE reservation_id={id}` → still present with
     `assigned_until IS NULL` (still "active").
Expected: related rows should either cascade-soft-delete alongside the reservation, or at minimum be
excluded from any "active assignments"/"active documents" views once the parent is gone.
Actual: both rows are left exactly as they were, pointing at a soft-deleted reservation, with no
apparent code path cleaning them up.
Root cause: `DELETE /api/reservations/:id` (server/routes.ts:4621+) only updates the reservations row
itself plus (for maintenance_block type) cascades to related replacement reservations; it does not
touch `documents` or `reservation_driver_assignments`.
Affected files: server/routes.ts (`DELETE /api/reservations/:id`).
Affected data: `documents`, `reservation_driver_assignments` rows referencing deleted reservations.
Security impact: none.
Business impact: minor — any report/UI listing "current driver assignments" or "documents" that
doesn't explicitly join against non-deleted reservations could show stale entries for a rental that
was deleted.
Fix (proposal only): when soft-deleting a reservation, also close out (`assigned_until = now()`) any
open `reservation_driver_assignments` rows, and/or filter `documents`/assignment queries by the
parent reservation's `deletedAt IS NULL`.
Regression test (proposal): delete a reservation with an active driver assignment; assert the
assignment is closed or excluded from "active" queries.

## BUG RS-013
Severity: LOW
Feature: isRecurring/recurringFrequency are accepted and persisted but entirely non-functional
Status: OPEN
Reproduction: `POST /api/reservations {..., isRecurring:true, recurringFrequency:"weekly"}` → 201,
fields persisted as sent. `SELECT count(*) FROM reservations WHERE recurring_parent_id={id}` → 0.
Expected: either the feature generates the recurring child bookings (per its name), or the fields
shouldn't be freely settable via the public API if no generator exists.
Actual: fully inert — confirmed no scheduler/generator anywhere in server/ touches
recurringParentId/recurringFrequency (grep-confirmed in prior research pass).
Root cause: schema/API surface exists (shared/schema.ts) but no corresponding business logic was ever
implemented.
Affected files: shared/schema.ts, server/routes.ts.
Affected data: none corrupted — just inert flags.
Security impact: none.
Business impact: if any client (UI or integration) exposes this as a real toggle, users configuring a
"weekly recurring" booking will get silent no-op behaviour with no indication the feature doesn't work.
Fix (proposal only): either implement the generator, or remove/hide the fields from the write schema
until it exists (reject `isRecurring:true` with a "not yet supported" 400 in the meantime).
Regression test (proposal): n/a until implemented — until then, assert the fields are rejected or
documented as unsupported rather than silently accepted.

## BUG RS-014
Severity: LOW
Feature: Malformed JSON body returns a full Node stack trace
Status: OPEN
Reproduction: `POST /api/reservations` with a body missing the closing quote around a key
(`{"vehicleId": 1682, "customerId": 1254, startDate: "2027-02-01"`) → 400 with
`{"error":"Server Error","message":"Expected double-quoted property name in JSON at position 40 (line
1 column 41)","stack":"SyntaxError: ...\n    at JSON.parse (<anonymous>)\n    at parse
(C:\\Users\\kees lam\\...\\body-parser\\lib\\types\\json.js:92:19)\n ..."}` — includes the full
server-side file path and call stack.
Expected: a generic 400 "invalid JSON" without stack trace/file-path disclosure, in any environment.
Actual: the app's global error handler explicitly includes `err.stack` in the response whenever
`NODE_ENV !== 'production'` (server/index.ts:423-435) — this **is** correctly gated in code, and the
audit server runs in dev mode (`tsx`) by design, so this is expected here and not itself a production
bug. Flagging as a low-severity note because the guard is a single, easy-to-regress `if`, and because
confirming it fires makes it worth verifying explicitly that the real production deployment sets
`NODE_ENV=production`.
Root cause: server/index.ts:428-433 (correctly implemented, verify deployment config separately).
Affected files: server/index.ts.
Affected data: none.
Security impact: information disclosure (internal file paths, library versions/behaviour) if this ever
ran with `NODE_ENV!=='production'` in a reachable environment.
Business impact: none if production config is correct; otherwise, reconnaissance value for an
attacker.
Fix (proposal only): no code change needed if production `NODE_ENV` is confirmed; consider adding a
startup assertion/log that warns loudly if `NODE_ENV` isn't `production` in the deployed environment.
Regression test (proposal): n/a (environment configuration, not application logic).

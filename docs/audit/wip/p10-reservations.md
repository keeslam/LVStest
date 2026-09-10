# Phase 10 — Reservations deep-dive (QA/security)

2026-09-10. Audit server http://localhost:5001, database `lvs_audit` only. Test data: vehicles `AU-101-X`..`AU-118-X`,
`AU-123/124-X`, `AU-131..133-X`, `AU-141..143-X`, `AU-151/152-X` (brand `AUDIT-P10`), customers `AUDIT-P10 Customer A..E`
(ids 1272-1274, 1280, 1281), portal customer 179 (`portaal-test@example.com`), drivers 161/23. Reservation ids created
in this phase: 3345-3448. Scripts: `docs/audit/wip/scripts/p10-*.cjs` (shared helpers `p10-lib.cjs`: one persisted
admin session with rotating `fakeIp 10.10.1.<n>`, `everywhereSnapshot()` = every place the app shows a reservation).
Raw evidence per step is in `p10-<letter>-*.out.json` next to each script. The phase 3-5 report
(`docs/audit/wip/reservations.md`, RS-001..014 = BUG-006/016/017/018/019/022/037/038/039/040/054/055/056/057) is the
baseline; nothing from it is re-filed here.

No request in this phase crashed the audit server (`/health` OK after every script).

---

## 1. Route inventory (what really exists)

All in `server/routes.ts` unless noted. Permission = `hasPermission(...)` unless noted.

| Method/route | Line | Purpose / notes |
|---|---|---|
| `GET /api/reservations` | 2299 | list; only filter is `?search=` (plate/brand/model/customer name/email/phone/barcode) |
| `GET /api/reservations/:id` | 2333 | single (filters `deletedAt`) |
| `GET /api/reservations/range?startDate&endDate` / `/range/:s/:e` | 2139 / 2161 | calendar source (`getReservationsInDateRange`) |
| `GET /api/reservations/upcoming` | 2172 | first 5 by startDate, `status not in (cancelled, completed)` — includes `picked_up`, `returned`, legacy values |
| `GET /api/reservations/upcoming-maintenance` | 2182 | maintenance blocks |
| `GET /api/reservations/vehicle/:vehicleId` | 2192 | |
| `GET /api/reservations/customer/:customerId` | 2236 | |
| `GET /api/reservations/overdue` | 2203 | `status = picked_up AND endDate < today` |
| `GET /api/reservations/overdue/:vehicleId?days=3` | 2218 | `status not in (completed, cancelled) AND endDate < today-3` — also used as the **create-time guard** (2622-2632) |
| `GET /api/reservations/check-availability/:v/:s/:e`, `GET /api/reservations/check-conflicts` | 2247 / 2260 | `checkReservationConflicts` (database-storage.ts:1528) |
| `GET /api/reservations/find-by-contract/:cn` | 2315 | |
| `POST /api/reservations` | 2435 | create (zod `insertReservationSchema`, conflict check, blacklist check, overdue guard) |
| `POST /api/reservations/maintenance-with-spare` | 2787 | |
| `PATCH /api/reservations/:id/basic` | 3090 | **edit path 1**: full re-validation with `insertReservationSchema`, conflict check on the whole row; used by the UI only from `schedule-maintenance-dialog.tsx:336` |
| `PATCH /api/reservations/:id/status` | 3230 | **edit path 2**: enum + `isValidReservationTransition` + explicit reversions; side effects (endDate := today on completed, clears data on reversion) |
| `PATCH /api/reservations/:id` | 3445 | **edit path 3**: *no schema at all* ("bypass full schema validation"); conflict check only when body has both `vehicleId` and `startDate`; used by the reservation form (`reservation-form.tsx:912-950`, multipart FormData incl. the `status` select), the calendar drag/drop (`calendar.tsx:386-391`, body `{startDate,endDate}`) and the calendar "revert to picked_up" button (`calendar.tsx:3274`, body `{status:'picked_up',...}`) |
| `POST /api/reservations/:id/pickup` | 4067 | contract number, mileage, fuel, optional `pickupDate` (unvalidated string), contract PDF |
| `POST /api/reservations/:id/return` | 4249 | mileage, fuel, optional `returnDate` (unvalidated string); sets `status='returned'`, `endDate=completionDate=actualReturnDate=returnDate`; damage-check PDF; vehicle → available |
| `POST /api/reservations/:id/mark-needs-service`, `/assign-spare`, `/return-from-service`, `GET /:id/active-replacement`, `PATCH /:id/spare-status` | 3792-4013 | spare-vehicle flow (`spare-status` is `requireAuth` only) |
| `POST/GET /api/placeholder-reservations`, `/needing-assignment`, `POST /:id/assign-vehicle` | 4464-4567 | placeholder spares (`requireAuth` only) |
| `POST /api/reservations/update-legacy-notes` | 3997 | |
| `DELETE /api/reservations/:id` | 4621 | soft delete (`deletedAt`, `contractNumber := null`); `requireAuth` only (no permission check); cascades soft-delete to replacement children **only for maintenance blocks** |
| `GET /api/contracts/generate/:id`, `POST /api/contracts/generate-versioned/:id`, `GET /api/contracts/data/:id`, `GET /api/documents/reservation/:id` | 5451 / 5798 / 6080 / 4962 | documents |
| Portal: `GET /api/portal/reservations`, `GET /api/portal/reservations/:id`, `POST /api/portal/reservations/:id/driver` | `server/routes/portal.ts:93-113` | |

**Features that do not exist as routes:** there is no *duplicate/copy* reservation feature anywhere (grep of
`client/src/pages/reservations*`, `client/src/components/reservations/*`: only contract-number duplicate *detection*);
no *reschedule* route — rescheduling is the calendar drag/drop (`handleMoveReservation` → `PATCH /:id {startDate,endDate}`)
or the edit form; no *cancel* route — cancelling is `PATCH /:id/status {status:"cancelled"}` (status-change dialog /
quick-status button) or the form's status select (→ `PATCH /:id`); no *restore/undelete* route for reservations
(`/api/deleted-records` only lists vehicles and fines).

---

## 2. Tested (passed / behaved as designed)

- Field-by-field diff `PATCH /:id` vs `/:id/basic` (script A, 69 probes, table in §7). `/basic` correctly rejects garbage
  dates/times, `endDate<startDate`, unknown `type`, negative `fuelCost`/`deliveryFee`, and strips `createdAt/updatedAt/
  *ByUser/deletedAt/deletedBy` (zod). Unknown fields and nested `vehicle`/`customer` objects are ignored by both.
  `/basic` also accepts the wrapped `{body:"<json>"}` form. `PATCH /:id` with an empty body is a harmless 200.
- Very long reservation (5 years, id 3360): create/pickup OK, appears in list/range/byVehicle/byCustomer,
  `check-conflicts` at +1000 days finds it, `/api/vehicles/available` at +1000 days hides the vehicle, contract data says
  "1825 days", financial report `rentalDays 1826` / revenue 100000 (see R10-018 for the off-by-one).
- Far-past reservation (2015, id 3361): accepted (BUG-040), pickup today allowed, listed everywhere; blocks all future
  bookings on its vehicle (BUG-040 re-confirmed).
- Same-day start=end (id 3362): pickup+return today OK, financial rentalDays 1, revenue 50; vehicle back to available.
- Return on a future date (id 3363, `returnDate` today+30): accepted; `returned` with a future endDate; does not block
  bookings (returned rows are excluded from conflicts).
- Pickup today on a reservation starting in 10 days (id 3364): accepted (`actualPickupDate` before `startDate`) —
  early handover is allowed with no warning; recorded as an observation, not a bug.
- Open-ended reservation (endDate null, id 3366): conflicts with every future booking on the vehicle (by design).
- Change customer on a `picked_up` reservation (3383): accepted; contract PDF regenerated in the background
  (`contract_regen` document); audit log records `customerId` from/to.
- Change vehicle on a `picked_up` reservation via `PATCH /:id` and back via `/basic` (3383): old vehicle released to
  `available`, new vehicle becomes `rented`, contract PDF regenerated for the new plate, contract number kept. Consistent
  (no guard that the customer physically has the *old* car — observation).
- Overdue picked_up rental (3392): listed by `/overdue` and `/overdue/:vehicleId`, vehicle `rented`, new booking on the
  vehicle blocked 409; extending via `PATCH /:id {endDate}` removes it from both overdue lists and unblocks the vehicle;
  late return sets `endDate=actualReturnDate=today`, vehicle `available`, damage-check PDF created, financial rentalDays
  11 (planned 6). Audit log has the endDate from/to.
- Soft delete (3387): excluded from GET/list/range/byVehicle/byCustomer/upcoming/overdue and from `check-conflicts`; an
  overlapping booking can be created afterwards (correct); delete-again/edit/status on the deleted row → 404.
- Edits on a `completed` reservation (3386): notes/price/times/dates accepted through both PATCH paths (no
  immutability — known, BUG-016 root cause) and **every change is recorded** in `audit_logs` with field-level from/to
  (`reservation.update`, `reservation.update/basic`).
- Spec sequence (script G, twice): create → assign vehicle → cancel → modify → change vehicle → generate document →
  delete vehicle / delete customer → reload. Every step was accepted (a cancelled reservation can be edited, moved to
  another vehicle and have contracts generated for it — no state guard anywhere). Documents generated for the
  cancelled reservation are stored against the vehicle (`AU133X_contract_20260910.pdf`, versions 1 and 2).
- Portal reads (script H): staff-side date change, vehicle change, driver change (via `PATCH /:id`), pickup, cancel and
  delete are reflected immediately in `GET /api/portal/reservations` and `/:id`; the contract PDF appears in
  `GET /api/portal/documents` after pickup and disappears after delete.
- Blacklist/availability-status/race conditions: not re-run (BUG-006/017/018 unchanged code).

## 3. Not tested (why)

- Socket.IO/realtime — out of scope.
- `maintenance-with-spare`, `return-from-service`, `spare-status` transitions — covered by phase 11 (maintenance/transport).
- Multipart `damageCheckFile` upload on `PATCH /:id` — file handling is phase 12/documents territory; the path field was
  probed as plain JSON only.
- Portal *write* side (`POST /api/portal/reservations/:id/driver`) — phase 11 portal report.
- Higher-concurrency re-run of BUG-006 — nothing changed in the create path.
- UI screenshots — all UI paths were exercised through the exact request shapes the client code sends
  (`reservation-form.tsx`, `calendar.tsx`, `status-change-dialog.tsx`, `schedule-maintenance-dialog.tsx`), not through a browser.

---

## 4. Findings summary

| Id | Sev | Feature | One line |
|---|---|---|---|
| R10-001 | CRITICAL | Reschedule / partial edit | `PATCH /:id` skips the conflict check unless the body has *both* `vehicleId` and `startDate`; the calendar drag/drop sends only dates → deterministic double booking |
| R10-002 | HIGH | Edit | `PATCH /:id` accepts `id` in the body and renumbers the primary key; documents/audit rows orphaned; FK children → raw 400 |
| R10-003 | HIGH | Edit | `PATCH /:id` (the form's own path) persists garbage/inverted dates and times; inverted ranges vanish from the calendar |
| R10-004 | MEDIUM | Edit | mass assignment of system/ownership/measurement fields via `PATCH /:id` (and partly `/basic`) |
| R10-005 | HIGH | Cancel | cancel leaves delivery transport scheduled, driver assignment open, spare + placeholder reservations active and blocking the spare vehicle |
| R10-006 | HIGH | Return / create guard | normally *returned* rentals become "overdue" for the create guard after 3 days and block every future booking on the vehicle (7 legacy vehicles already blocked) |
| R10-007 | MEDIUM | Status model | `returned` vs `completed` are inconsistent between routes; reversions null out the planned `endDate` (row becomes open-ended) |
| R10-008 | MEDIUM | Status model | legacy status values (`active` 265 rows, `confirmed`, `pending`, `scheduled`, `in`) cannot be transitioned at all via `/status`; 45 of them block their vehicles in the create guard |
| R10-009 | MEDIUM | Status / vehicle sync | `/status {completed}` leaves the vehicle `rented` whenever it has another booking within 30 days |
| R10-010 | MEDIUM | Pickup / return | `pickupDate`/`returnDate` are unvalidated strings: `not-a-date`, `2099-13-45`, return before start all persisted (also into PDF file names) |
| R10-011 | MEDIUM | Delete / cancel of picked_up | a picked_up rental can be deleted or cancelled with no guard: vehicle flips to available while the customer has it; contract number freed/reused (delete) or frozen (cancel); return impossible afterwards |
| R10-012 | MEDIUM | Vehicle restore | restoring a deleted vehicle restores its reservations and documents but not the driver-assignment history |
| R10-013 | MEDIUM | Driver history | `/basic` driver changes bypass `reservation_driver_assignments` → portal driver history / fines attribution wrong |
| R10-014 | MEDIUM | Portal notifications | no portal notification for any staff-side change (reschedule, vehicle, driver, cancel, delete) of a portal customer's reservation |
| R10-015 | LOW | Delete | soft-deleted reservations are invisible in `/api/deleted-records` and have no restore path |
| R10-016 | LOW | Error handling | FK violations on both PATCH paths surface as raw 400/500 with Postgres constraint names |
| R10-017 | LOW | Audit log | pickup/return/mark-needs-service/assign-spare are logged as `reservation.create` |
| R10-018 | LOW | Pricing | rental-day count differs by one between contract data ("1825 days") and the financial report (1826) |

Counts: CRITICAL 1, HIGH 4, MEDIUM 9, LOW 4 (18 new). Re-confirmed existing: BUG-007, 016, 019, 022, 038, 039, 040,
054, 055 (§8).

---

## 5. BUGs

```
BUG R10-001
Severity: CRITICAL
Feature: Reservation edit / calendar reschedule — conflict check bypass on partial PATCH
Status: OPEN
Reproduction: (p10-a-patch-diff.cjs "conflict bypass A/B", p10-i-status.cjs I6, p10-d-cancel.cjs D3b)
  1. Vehicle 1735 (AU-103-X) has reservation 3347 booked 2027-03-01..03-05. Reservation 3345 sits on vehicle 1733 for
     the same dates. PATCH /api/reservations/3345 {"vehicleId":1735} → 200; DB vehicle_id=1735;
     GET /api/reservations/check-conflicts?vehicleId=1735&startDate=2027-03-01&endDate=2027-03-05 → [3347, 3345].
  2. Reservation 3359 on vehicle 1735 booked 03-10..03-12. PATCH /api/reservations/3359 {"startDate":"2027-03-02",
     "endDate":"2027-03-04"} → 200; row now 03-02..03-04 on the same vehicle as 3347 (03-01..03-05).
     Control: the same body plus "vehicleId":1735 → 409 "Reservation conflicts with existing bookings".
  3. Exact calendar drag/drop shape (client/src/pages/reservations/calendar.tsx:386-391 sends only startDate/endDate):
     vehicle 1749 has 3440 booked 2026-11-09..11-12; PATCH /api/reservations/3441 {"startDate":"2026-11-10",
     "endDate":"2026-11-13"} → 200. check-conflicts with excludeReservationId=3441 would have returned [3440].
     Afterwards check-conflicts for 11-09..11-13 → [3440, 3441]: the vehicle is double-booked.
  4. Status-only body has the same hole: D1 (3429) cancelled → 3434 booked on the same vehicle/dates →
     PATCH /api/reservations/3429 {"status":"booked"} → 200 → check-conflicts → [3434 booked, 3429 booked].
Expected: any edit that changes vehicle, dates, times or re-activates a reservation must run checkReservationConflicts
with the *effective* post-update values (merge body over the existing row), returning 409 on overlap — exactly what
/basic already does.
Actual: server/routes.ts:3644-3645 `if (reservationData.vehicleId && reservationData.startDate)` — the check is skipped
for every body that lacks either key. The UI's drag/drop reschedule and the "revert to picked_up"/status edits always
lack vehicleId, so the double booking is reachable through normal UI gestures, deterministically (no race needed).
Root cause: server/routes.ts:3644-3665 (PATCH /api/reservations/:id conflict-check gate); calendar.tsx:388-391 body shape.
Affected files: server/routes.ts, client/src/pages/reservations/calendar.tsx.
Affected data: reservations 3345/3347, 3359, 3440/3441, 3429/3434 left overlapping in lvs_audit as evidence.
Security impact: none (needs MANAGE_RESERVATIONS), but it is a total bypass of the booking invariant.
Business impact: same as BUG-006 but deterministic and reachable by dragging a booking in the calendar: two customers
hold the same car for the same days; the drag-confirm dialog gives no warning.
Fix: compute effective = {...existing, ...body}; if vehicleId/startDate/endDate/startTime/endTime/status changed and
effective.status is an active status, run checkReservationConflicts(effective..., id) and 409 on hits. Add the same to
the status endpoint for cancelled→booked reversions (or keep them forbidden).
Regression test: create A on v/d1..d2; create B on v/d3..d4; PATCH B {startDate:d1,endDate:d2} → expect 409;
PATCH B {vehicleId:v2} where v2 is busy → expect 409; DB unchanged.
```

```
BUG R10-002
Severity: HIGH
Feature: Reservation edit — primary key writable through PATCH /:id
Status: OPEN
Reproduction: (p10-a-patch-diff.cjs probe "id", p10-c-pickedup-status.cjs C5a/C5b)
  1. PATCH /api/reservations/3345 {"id":9999999} → 200; `select * from reservations where id=3345` → no row;
     `where id=9999999` → the row (script renumbered it back).
  2. Completed reservation 3386 with a contract document (documents.id=275): PATCH /api/reservations/3386
     {"id":8888889} → 200, response `"id":8888889`; GET /api/reservations/8888889 → 200;
     `select reservation_id from documents where id=275` → 3386 (now points at nothing);
     `audit_logs where resource_id='3386'` → 7 rows still under the old id.
  3. Picked_up reservation 3383 with a reservation_driver_assignments row: PATCH {"id":8888888} → 400
     {"message":"Failed to update reservation","error":"update or delete on table \"reservations\" violates foreign
     key constraint \"reservation_driver_assignments_reservation_id_fkey\" ..."}.
Expected: `id` (and every other server-owned column) must be ignored or rejected by every update endpoint.
Actual: `PATCH /:id` passes `req.body` straight to `storage.updateReservation` (routes.ts:3600-3602 "bypass full schema
validation", 3678) and drizzle happily includes `id` in the SET list. `/basic` is safe (zod strips `id`).
Root cause: server/routes.ts:3600-3602, 3678 + server/database-storage.ts:1209-1211 (`dataToUpdate = {...reservationData}`
with no allow-list).
Affected files: server/routes.ts, server/database-storage.ts.
Affected data: any reservation; child rows without an FK (documents, audit_logs, deleted_records payloads, fines with
reservation_id? — fines/portal_requests/transports/interactive_damage_checks have FKs and will block with a raw error;
documents and audit_logs silently detach).
Security impact: a MANAGE_RESERVATIONS user can detach a reservation from its contract documents and its audit trail,
or collide it into another id range; the raw error leaks constraint names.
Business impact: history/document links break; barcode RES-<id> labels stop resolving.
Fix: strip `id` (and createdAt/createdBy/deleted*/updatedAt) in updateReservation, or validate PATCH /:id with
insertReservationSchema.partial().strict().
Regression test: PATCH {id: X+1} → 400; `select id from reservations where id=X` still present.
```

```
BUG R10-003
Severity: HIGH
Feature: Reservation edit — no validation of dates/times/type on PATCH /:id (the reservation form's path)
Status: OPEN
Reproduction: (p10-a-patch-diff.cjs table; p10-b-dates.cjs B2/B5; p10-i-status.cjs I7)
  PATCH /api/reservations/3345 with each of: {"startDate":"not-a-date"} → 200, DB start_date='not-a-date';
  {"endDate":"2027-02-01"} (before start 2027-03-01) → 200 persisted; {"startTime":"25:99"} → 200; {"endTime":"garbage"}
  → 200; {"type":"garbage"} → 200 persisted. The same bodies on /basic → 400 "Invalid reservation data".
  Consequence of an inverted range: reservation 3361 (start 2015-01-01, end 2014-12-25) and 3364 (start 2026-09-20,
  end 2026-09-05) are absent from GET /api/reservations/range?startDate=<start>&endDate=<end> (`range:false`) while
  present in the list, byVehicle, byCustomer and the overdue-by-vehicle guard. I7: endDate 'not-a-date' still
  "conflicts" only because text comparison happens to order 'n' after '2'.
Expected: same validation as create/basic (YYYY-MM-DD regex, HH:MM regex, endDate >= startDate, type enum), 400 on
violation.
Actual: no validation; date columns are `text`, so anything is stored.
Root cause: server/routes.ts:3600-3602 (raw body); shared/schema.ts reservations date columns are text.
Affected files: server/routes.ts, shared/schema.ts.
Affected data: reservations 3361, 3364 (inverted), 3365 (end_date '2099-13-45'), 3442 (end_date 'not-a-date') in lvs_audit.
Security impact: none direct.
Business impact: a mis-typed date in the edit form silently produces a reservation that the calendar cannot show, that
the overdue guard treats as overdue, and whose conflicts are evaluated by string comparison.
Fix: run `insertReservationSchema.partial()` (plus the date-order refine on the merged row) inside PATCH /:id; add a DB
CHECK (`end_date IS NULL OR end_date >= start_date`) after cleaning existing rows.
Regression test: PATCH {endDate:'not-a-date'} → 400; PATCH {endDate: start-1} → 400.
```

```
BUG R10-004
Severity: MEDIUM
Feature: Reservation edit — mass assignment of system-owned / measured fields
Status: OPEN
Reproduction: (p10-a-patch-diff.cjs table) both PATCH /:id and /basic accept and persist: createdBy "AUDIT-hacker",
  actualPickupDate / actualReturnDate / completionDate (arbitrary), contractNumber (unique-checked on PATCH, raw 500 on
  /basic — BUG-038), pickupMileage -100, returnMileage 5 (below pickup), fuelLevelPickup "garbage", damageCheckPath
  "../../../etc/passwd", replacementForReservationId 1, affectedRentalId 1, portalRequestId 1, spareVehicleStatus /
  maintenanceStatus / deliveryStatus / recurringFrequency "garbage", recurringDayOfWeek 99, isRecurring true,
  placeholderSpare true (PATCH only). PATCH /:id additionally persists deletedBy "AUDIT-hacker" and deletedByUser 1
  (deletedAt itself fails with a Date parse 400). /basic strips created/updated/deleted* meta fields (zod).
  `damageCheckPath` is never served by any route (only nulled in database-storage.ts), so the traversal string is inert.
Expected: only user-editable fields are writable; measured values (mileage, fuel, actual dates, contract number, spare
linkage, delete/create meta) only through their dedicated flows; enums validated.
Actual: no allow-list on PATCH /:id; the insert schema used by /basic treats most of these as free text.
Root cause: server/routes.ts:3600-3602; shared/schema.ts insertReservationSchema (text enums, no min on mileage).
Affected files: server/routes.ts, shared/schema.ts.
Affected data: any reservation.
Security impact: audit/ownership forgery (createdBy/deletedBy), spare-vehicle linkage manipulation.
Business impact: return mileage below pickup, negative mileage and free-text status enums poison reports and the
spare-vehicle widget (reads spareVehicleStatus).
Fix: explicit allow-list for PATCH /:id; z.enum for status-like columns; .min(0) on mileage; reject returnMileage <
pickupMileage.
Regression test: PATCH {createdBy:'x'} → field unchanged; PATCH {pickupMileage:-1} → 400.
```

```
BUG R10-005
Severity: HIGH
Feature: Cancel — no cascade to transport, driver assignment, spare/replacement and placeholder reservations
Status: OPEN
Reproduction: (p10-d-cancel.cjs D1, D4, D5)
  1. Reservation 3429 (AU-115-X, driver 161, deliveryRequired → vehicle_transports 56 'scheduled'); mark-needs-service +
     assign-spare → replacement 3430 on spare AU-116-X (status 'pending', spare_vehicle_status 'assigned');
     placeholder 3431 (placeholder_spare); contract document 309.
  2. PATCH /api/reservations/3429/status {"status":"cancelled"} → 200.
  3. Afterwards: transports 56 still 'scheduled'; driver assignment 161 still open; 3430 still 'pending'/'assigned' and
     spare vehicle 1748 now 'scheduled' (check-conflicts on AU-116-X for the spare period → [3430]);
     3431 still listed by GET /api/placeholder-reservations/needing-assignment; GET /api/reservations/3429/
     active-replacement → 200 returns the placeholder; documents kept (expected).
  4. Same result when cancelling through the form path (D4: PATCH /:id full body with status cancelled — transport 57
     stays scheduled) and through /basic (D5: transport 58 stays scheduled).
Expected: cancelling should close the open driver assignment, cancel (not delete) the auto-created delivery transport
(the DELETE route and `deleteReservation` already do that), and cancel/soft-delete replacement + placeholder
reservations (the DELETE route does this for maintenance blocks).
Actual: the status endpoint only writes status/updatedBy and runs the vehicle sync; `syncDeliveryTransport` in
updateReservation does not react to status changes.
Root cause: server/routes.ts:3230-3445 (status endpoint: only status/updatedBy written at 3408, then the vehicle sync at
3415 — no cascade), database-storage.ts:1209-1250 (`syncDeliveryTransport` keyed on deliveryRequired only).
Affected files: server/routes.ts, server/database-storage.ts.
Affected data: vehicle_transports 56/57/58, reservations 3430/3431 (still active for a cancelled rental).
Security impact: none.
Business impact: a driver is dispatched to deliver a cancelled rental; a spare car stays blocked for a customer who
cancelled; the placeholder keeps asking staff to assign a vehicle.
Fix: in the status endpoint (and any path that sets cancelled), cancel non-completed transports for the reservation,
close driver assignments, and cancel/soft-delete replacement children (reuse the DELETE route's block).
Regression test: cancel a reservation with transport + spare + placeholder; assert transport 'cancelled', replacement
and placeholder cancelled/deleted, needing-assignment empty.
```

```
BUG R10-006
Severity: HIGH
Feature: Return → create-time overdue guard treats "returned" rentals as overdue and blocks the vehicle
Status: OPEN
Reproduction: (p10-c-pickedup-status.cjs C2a, p10-i-status.cjs I1/I2)
  1. Reservation 3384 on AU-113-X: pickup, then POST /return with returnDate today-5 → status 'returned', end_date
     today-5. POST /api/reservations {vehicleId:1745, startDate: today+30, endDate: today+32} → 409 "This vehicle has
     overdue reservations that must be resolved first" listing 3384. After PATCH /3384/status {completed} the same POST
     → 201.
  2. Legacy data in the clone: 7 'returned' rows older than 3 days on 7 vehicles (313/13XT103, 525/99XT279,
     1438/14XT284, ...). POST a 2028 booking on each of the first three → 409 with the returned row as "overdue".
  3. By status, the guard currently blocks: booked 376 rows/255 vehicles (BUG-040), picked_up 352/254 (real overdue),
     active 40/39, returned 7/7, scheduled 4/4, in 1/1.
Expected: a reservation that was returned through the app's own return flow is finished; it must not count as overdue.
The only statuses that mean "customer still has the car" are picked_up (and legacy active).
Actual: getOverdueReservationsByVehicle (database-storage.ts:1494-1526) excludes only completed and cancelled; nothing
ever moves 'returned' to 'completed' automatically, so every normal return becomes a booking blocker on day 4. The
reservation form works around it with an overdue dialog whose "mark completed" action triggers BUG-019.
Root cause: server/database-storage.ts:1515-1516 status filter; server/routes.ts:2622-2632 guard.
Affected files: server/database-storage.ts, server/routes.ts.
Affected data: reservations 313, 525, 1438, 1517, 3227 (+2) block their vehicles today in lvs_audit.
Security impact: none.
Business impact: vehicles silently drop out of the bookable fleet a few days after each return unless staff also
"complete" them; API/portal bookings get a hard 409.
Fix: exclude 'returned' (treat as final) in the guard, or have POST /return set 'completed' directly (see R10-007).
Regression test: pickup + return (returnDate today-5) then POST future booking → 201.
```

```
BUG R10-007
Severity: MEDIUM
Feature: Status model — "returned" vs "completed" inconsistent between routes; reversions null the planned endDate
Status: OPEN
Reproduction: (p10-i-status.cjs I4/I4b/I5, p10-c C2b/C2d, p10-f F4)
  a. PATCH /3439/status {"status":"returned"} on a picked_up reservation → 400 "Invalid status transition from
     'picked_up' to 'returned'" (VALID_RESERVATION_TRANSITIONS has no picked_up→returned) although the endpoint's own
     enum accepts 'returned' and POST /return produces it. The reservation form offers "returned" in its status
     select (reservation-form.tsx:2083) → PATCH /:id {"status":"returned"} → 200 with no return data
     (actual_return_date null) and the vehicle left 'rented'.
  b. PATCH /3439/status {"status":"picked_up"} (returned→picked_up reversion) → 200, row end_date = NULL, actual_return
     /return_mileage null: the planned end date is lost and the rental is now open-ended (conflicts with every future
     booking on AU-116-X). The completed→x reversion does the same (routes.ts:3352-3356).
  c. returned→completed via /status on 3384: end_date rewritten from 2026-09-05 (actual return) to 2026-09-10 (today)
     while actual_return_date stays 09-05 (BUG-019 variant).
  d. Two shapes of "completed": via POST /return + /status → actual_return_date/completion_date/return_mileage set;
     via /status {completed} directly (F4, C2d) → all three null, only return_mileage if departureMileage was sent.
  e. Upcoming list (getUpcomingReservations) filters only cancelled/completed: 'returned' rows with startDate>=today
     satisfy it (3338, 3362, 3363, 3365, 3340), and the live top-5 contained a picked_up and a 'confirmed' row.
Expected: one final state reachable through one flow, with `returned`/`completed` either merged or ordered
(picked_up→returned→completed) consistently in the transition table, the status endpoint, the return route and every
query; reversions must restore the planned end, not null it.
Actual: see above.
Root cause: shared/schema.ts:42-48 (transition table), server/routes.ts:3239-3260 (enum + reversion allowlist),
3348 and 3355 (`dataWithTracking.endDate = null` on reversion), 3358-3361 (completed sets endDate=today),
database-storage.ts:1749-1760 (return sets 'returned' and `endDate: returnDate`), 1358-1386 (upcoming filter at 1373-1374).
Affected files: shared/schema.ts, server/routes.ts, server/database-storage.ts.
Affected data: 3439 (end_date null), 3384 (end_date moved), 22 'returned' rows in the clone.
Security impact: none.
Business impact: reports count rental days differently depending on which button finished the rental; reverting a
return turns the booking open-ended and blocks the car indefinitely.
Fix: keep the planned endDate in a separate column (actualReturnDate already exists) and never overwrite/null it; make
picked_up→returned a legal transition or make /return write 'completed'; filter upcoming to booked only.
Regression test: pickup, return, revert to picked_up → end_date equals the original planned value.
```

```
BUG R10-008
Severity: MEDIUM
Feature: Status model — legacy status values are unreachable by the status endpoint
Status: OPEN
Reproduction: (p10-i-status.cjs I2/I3) status distribution in lvs_audit (non-deleted): booked 634, completed 516,
  picked_up 511, active 265, returned 22, cancelled 18, pending 4, scheduled 4, confirmed 3, in 1, garbage 1.
  Reservation 3425 (status 'active'): PATCH /status {picked_up} → 400 "Invalid status transition from 'active' to
  'picked_up'"; {completed} → 400; {cancelled} → 400. (Row left unchanged.)
Expected: either migrate legacy values to the current enum or let the transition table accept them as aliases
(active≈picked_up, confirmed≈booked).
Actual: VALID_RESERVATION_TRANSITIONS['active'] is undefined → no target is valid; the only way out is the unvalidated
PATCH /:id (BUG-016). Meanwhile these rows count as active for the vehicle sync (status not in cancelled/returned/
completed → vehicle 'rented') and 45 of them (>3 days old) block bookings via the create guard (R10-006 table).
Root cause: shared/schema.ts:42-48; no data migration for the pre-enum statuses; the status endpoint's own enum
(routes.ts:3240) also rejects them as *input*.
Affected files: shared/schema.ts, server/routes.ts, data migration.
Affected data: 277 rows with non-enum statuses in the dev clone.
Security impact: none.
Business impact: staff cannot finish or cancel old rentals through the status dialog; those cars stay 'rented'.
Fix: one-off migration + alias map in isValidReservationTransition.
Regression test: seed a row with status 'active'; /status {completed} → 200.
```

```
BUG R10-009
Severity: MEDIUM
Feature: Vehicle availability after "mark completed" — vehicle stays rented
Status: OPEN
Reproduction: (p10-j-sync.cjs) AU-151-X: reservation 3445 (today-2..today+1) picked up → vehicle 'rented'; second
  booking 3446 (today+10..+12) exists. PATCH /3445/status {"status":"completed","departureMileage":150} → 200.
  Vehicle availability_status: before 'rented', after 'rented', after another sync pass 'rented'.
  Control on AU-152-X with POST /return instead: 'rented' → 'available' → 'scheduled'.
Expected: after the rental is completed the vehicle is 'available' (or 'scheduled' because of the upcoming booking).
Actual: the status endpoint relies on syncVehicleAvailabilityWithReservations, whose priority-3 reset (database-storage.ts
324-345) only touches vehicles that have *no* active or upcoming reservation; a vehicle with an upcoming booking is
never downgraded from 'rented'. POST /return works only because it sets 'available' explicitly first (routes.ts:4285).
Root cause: server/database-storage.ts:224-350 (sync never sets rented→scheduled), server/routes.ts:3408-3416 (status
endpoint writes the row and calls the sync, never releases the vehicle itself).
Affected files: server/database-storage.ts, server/routes.ts.
Affected data: vehicle 1817 (AU-151-X) 'rented' with no running rental.
Security impact: none.
Business impact: fleet list shows cars as out that are on the lot; the pickup route's getStatusOnPickup then treats
the next handover as a pickup from 'rented'.
Fix: in the sync, set vehicles in scheduledVehicleIds but not in rentedVehicleIds to 'scheduled' even if currently
'rented'; and release the vehicle explicitly in the status endpoint on completed/cancelled.
Regression test: the J scenario; assert 'scheduled' after completed.
```

```
BUG R10-010
Severity: MEDIUM
Feature: Pickup / return — pickupDate/returnDate not validated
Status: OPEN
Reproduction: (p10-b-dates.cjs B2/B5/B6)
  - POST /3365/pickup {..., "pickupDate":"not-a-date"} → 200; actual_pickup_date='not-a-date'; contract file
    AU109X_contract_pickup_not-a-date_1789018367524.pdf.
  - POST /3365/return {..., "returnDate":"2099-13-45"} → 200; end_date = actual_return_date = completion_date =
    '2099-13-45'; damage-check file ..._return_2099-13-45_....pdf.
  - POST /3361/return {"returnDate":"2014-12-25"} on a rental starting 2015-01-01 → 200; end_date < start_date; the
    row disappears from /range and is flagged by the overdue-by-vehicle guard (overdueVeh:true).
  - POST /3364/return {"returnDate": today-5} on a rental picked up today (start today+10) → 200, same inversion.
Expected: YYYY-MM-DD validation, returnDate >= actualPickupDate, and (unless explicitly overridden) not in the future.
Actual: `pickupData.pickupDate || today` / `returnData.returnDate || today` are written as-is
(database-storage.ts:1662→1670, 1749→1759).
Root cause: server/routes.ts:4074/4256 destructure without validation; database-storage.ts:1662-1670, 1749-1760.
Affected files: server/routes.ts, server/database-storage.ts.
Affected data: reservations 3361, 3364, 3365; two PDF files with garbage names under audit-uploads/AU109X/.
Security impact: the date string ends up in a file name (sanitised plate, but the date part is raw — path separators
are not stripped; not exploited here).
Business impact: negative rental durations in reports; rows the calendar cannot render.
Fix: zod-validate both dates; reject returnDate < actualPickupDate; sanitise the file-name date part.
Regression test: return with returnDate 'x' → 400; with a date before pickup → 400.
```

```
BUG R10-011
Severity: MEDIUM
Feature: Delete / cancel of a picked_up reservation while the customer has the car
Status: OPEN
Reproduction: (p10-e-delete-overlap.cjs E2, p10-d-cancel.cjs D2)
  Delete: 3389 picked up today (contract AUDIT-P10-E-E2-358340, vehicle AU-101-X 'rented'). DELETE /api/reservations/3389
  → 200. Row: deleted, status still 'picked_up', contract_number null; vehicle → 'available'. POST a new reservation on
  the same vehicle for the same dates → 201 (3390); POST /3390/pickup with the *same* contract number → 200;
  find-by-contract now resolves to 3390. The deleted rental's contract PDF (documents) survives (BUG-055).
  Cancel: 3432 picked up (contract AUDIT-P10-D-D2-720447). PATCH /status {cancelled} → 200 (transition table allows
  picked_up→cancelled). Vehicle → 'available', contract number and pickup data retained, driver assignment open; POST
  /3432/return → 400 "Cannot return reservation with status: cancelled"; another customer can book and pick up the same
  car for the same dates (3433, 200).
Expected: a rental whose car is out should not be deletable/cancellable without returning it (or an explicit
"lost/never returned" override); the contract number of a picked_up rental must not be recycled.
Actual: DELETE has no status guard (routes.ts:4621-4640, `requireAuth` only) and clears contract_number; cancel is a
legal transition with no side effects beyond the vehicle sync.
Root cause: server/routes.ts:4621-4640; shared/schema.ts:44 ('picked_up': ['completed','cancelled']).
Affected files: server/routes.ts, shared/schema.ts.
Affected data: 3389 (deleted picked_up), 3432 (cancelled picked_up), contract number reused on 3390.
Security impact: DELETE is permission-free (any authenticated user) — noted; not re-filed (api-matrix phase).
Business impact: a car that is physically with a customer is shown available and can be handed to a second customer;
the first customer's return can never be recorded.
Fix: block DELETE/cancel for picked_up unless a return was recorded (or require an admin override reason); never null
contract_number on delete of a picked_up row.
Regression test: pickup then DELETE → 409; pickup then /status cancelled → 409 (or override path).
```

```
BUG R10-012
Severity: MEDIUM
Feature: Vehicle recycle-bin restore loses reservation driver-assignment history
Status: OPEN
Reproduction: (p10-g-sequence.cjs variant delete-vehicle) reservation 3437 (driver 161, reservation_driver_assignments
  id 301 open). DELETE /api/vehicles/1810 {confirmLicensePlate:"AU-133-X"} → 200 restorable; reservation row gone
  (BUG-022), documents 312/313 gone, assignment 301 gone (FK cascade), GET /api/reservations/3437 → 404.
  POST /api/deleted-records/48/restore → 200 "Restored AU-133-X"; reservation 3437 back (driver_id 161, notes intact),
  documents 312/313 back, `reservation_driver_assignments where reservation_id=3437` → [] (portal driverHistory empty).
Expected: restore reproduces the pre-delete state, including the driver-assignment history (which the portal and the
fines attribution read).
Actual: deleteVehicle snapshots vehicle/expenses/waitlist/blacklist/documents/transports/damageChecks/reservations
(deleted_records 48 payload keys) but not reservation_driver_assignments; the FK cascade deletes them and restore cannot
recreate them.
Root cause: server/database-storage.ts deleteVehicle (~535-618) snapshot list; restoreDeletedRecord.
Affected files: server/database-storage.ts.
Affected data: reservation 3437 (history lost).
Security impact: none.
Business impact: after a restore, "who was driving" is unknown for every rental of that vehicle — fines can no longer
be attributed.
Fix: include reservation_driver_assignments in the snapshot/restore (or soft-delete instead of hard-delete, per BUG-022).
Regression test: vehicle with a reservation + assignment; delete; restore; assert the assignment row exists.
```

```
BUG R10-013
Severity: MEDIUM
Feature: Driver change through /basic bypasses the driver-assignment history
Status: OPEN
Reproduction: (p10-h-portal.cjs H4/H5, p10-a table "driverId") reservation 3395 (portal customer 179): PATCH /:id
  {driverId:23} → history [161 closed, 23 open] (correct). PATCH /:id/basic {..., driverId:161} → 200, reservation
  driver 161, but reservation_driver_assignments still [161 closed, 23 open]; GET /api/portal/reservations/3395 shows
  driver 161 with driverHistory "161, 23*" (23 marked current). Table probe: driverId via /basic → 0 assignment rows.
Expected: every write of driverId goes through assignDriverToReservation (as PATCH /:id does, routes.ts:3687-3693, and
POST create does, routes.ts:2656).
Actual: /basic writes driverId directly via updateReservation (routes.ts:3201).
Root cause: server/routes.ts:3090-3230 (no assignDriverToReservation call).
Affected files: server/routes.ts.
Affected data: reservation 3395's history.
Security impact: none.
Business impact: portal shows the wrong "current driver"; fines attribution (which the code comment says relies on this
history) points at the previous driver.
Fix: call assignDriverToReservation in /basic when driverId changes.
Regression test: /basic with a new driverId → new open assignment row, previous closed.
```

```
BUG R10-014
Severity: MEDIUM
Feature: Customer portal — no notification for staff-side reservation changes
Status: OPEN
Reproduction: (p10-h-portal.cjs H2-H8) for portal customer 179's reservation 3395: staff reschedule (+1 day), vehicle
  change (AU-123-X → AU-124-X), driver change (161→23), pickup, cancel of the picked_up rental, delete. After each step
  `portal_notifications` count for customer 179 unchanged (newNotifications 0) and GET /api/portal/notifications shows
  only the pre-existing maintenance/request items. The reads (list/detail) do reflect every change.
Expected: at least cancellation, date/vehicle changes and deletion of an active rental should produce a portal
notification (the portal already has a notification system used for maintenance blocks, replacements, request decisions,
APK/service alerts).
Actual: server/services/portal-customer-notifications.ts only has apk/service types; portal-maintenance-events.ts is
wired only into maintenance-block and replacement paths (routes.ts:2529, 3150, 3683 `onMaintenanceBlockChanged` — no-op
for standard reservations); nothing is called from /status, /:id, /basic, DELETE for standard rentals.
Root cause: missing hook (feature gap rather than regression).
Affected files: server/routes.ts, server/services/portal-customer-notifications.ts.
Affected data: none.
Security impact: none.
Business impact: a customer whose rental was cancelled or moved by staff finds out only by opening the portal.
Fix: emit `reservation_changed` / `reservation_cancelled` notifications (dedupe_tag per reservation+field) from the
three edit paths and DELETE when the customer has a portal account.
Regression test: cancel a portal customer's reservation → one portal_notifications row of type reservation_cancelled.
```

```
BUG R10-015
Severity: LOW
Feature: Reservation soft delete — no restore path and not visible in the recycle bin
Status: OPEN
Reproduction: (p10-e E1) DELETE /api/reservations/3387 → 200 (soft). GET /api/deleted-records → entity types present:
  ["vehicle","fine"], no reservation entries. No route matches /api/reservations/:id/restore (phase 3-5 probe). A manual
  `update reservations set deleted_at=null` (the only recovery) re-created a double booking with 3388, which had been
  legitimately created in the meantime (check-conflicts → [3388, 3387]).
Expected: soft-deleted reservations listed in the recycle bin with a restore that re-runs the conflict check.
Actual: soft-delete rows are simply filtered out everywhere; nothing surfaces them.
Root cause: server/routes.ts:1694 (deleted-records lists deleted_records table only); no reservation restore route.
Affected files: server/routes.ts.
Affected data: 3387 (re-deleted by the script).
Security impact: none.
Business impact: an accidental delete is unrecoverable for staff; DB-level recovery can double-book.
Fix: list `reservations where deleted_at is not null` in the recycle bin and add a restore that checks conflicts.
Regression test: delete, restore → 200 and row visible; restore over a conflicting booking → 409.
```

```
BUG R10-016
Severity: LOW
Feature: Error handling — FK violations leak raw Postgres messages on both edit paths
Status: OPEN
Reproduction: (p10-a table, p10-c C4/C5a) PATCH /:id {driverId:999999999} → 400 {"message":"Failed to update
  reservation","error":"insert or update on table \"reservations\" violates foreign key constraint
  \"reservations_driver_id_drivers_id_fk\""}; /basic same body → 500 with the same text; {deliveryStaffId:999999} → 400/
  500; {createdByUser:999999} PATCH → 400; PATCH {id:...} with an assignment → 400 with the FK name; /basic duplicate
  contractNumber → 500 "duplicate key value violates unique constraint \"reservations_contract_number_unique\""
  (BUG-038 class).
Expected: 400/404/409 with a field-level message; no constraint names.
Actual: generic catch blocks echo `error.message` (routes.ts:3218-3228 for /basic → 500, 3778-3790 for PATCH /:id → 400).
Root cause: server/routes.ts catch handlers; no existence check for driverId/deliveryStaffId.
Affected files: server/routes.ts.
Affected data: none.
Security impact: schema disclosure (low).
Business impact: confusing errors in the edit form.
Fix: map pg error codes 23503/23505 to 404/409 with the field name; pre-check driver/staff existence.
Regression test: PATCH {driverId: nonexistent} → 404 "driver not found".
```

```
BUG R10-017
Severity: LOW
Feature: Audit log — sub-actions of reservations logged as "create"
Status: OPEN
Reproduction: (every p10 snapshot) audit_logs for a reservation after pickup/return/mark-needs-service/assign-spare:
  action 'reservation.create' with details.operation 'pickup' / 'return' / 'mark-needs-service' / 'assign-spare'
  (e.g. 3429: "reservation.create, reservation.create/mark-needs-service, reservation.create/assign-spare,
  reservation.update/status").
Expected: 'reservation.pickup', 'reservation.return', ... (or 'reservation.update' with the operation).
Actual: server/middleware/audit.ts:161-168 `verbFor('POST') = 'create'` regardless of sub-path; the sub-action is only
kept in details.
Root cause: server/middleware/audit.ts:161-168, 177.
Affected files: server/middleware/audit.ts.
Affected data: all existing audit rows for these operations.
Security impact: none.
Business impact: the activity log reads "created reservation" three times for one rental; filtering by action is
misleading.
Fix: when subAction is set and the id is present, use `${type}.${subAction}`.
Regression test: pickup → audit action 'reservation.pickup'.
```

```
BUG R10-018
Severity: LOW
Feature: Pricing — rental-day count differs between contract data and the financial report
Status: OPEN
Reproduction: (p10-b B1) reservation 3360, 2026-09-10..2031-09-09: GET /api/contracts/data/3360 → "1825 days";
  GET /api/reports/vehicle-financials?from=2026-09-10&to=2026-09-10&vehicleId=1736 → rentalDays 1826.
  B3 (same day start=end): report rentalDays 1 (contract data key not exposed for that case).
Expected: one day-count convention (inclusive or exclusive) everywhere.
Actual: contract uses end-start; the report counts inclusively.
Root cause: server/routes.ts contract data (~6080+) vs server/routes/reports.ts:269 vehicle-financials day math.
Affected files: server/routes.ts, server/routes/reports.ts.
Affected data: none.
Security impact: none.
Business impact: revenue-per-day and invoice day counts disagree by one day on every rental.
Fix: shared `rentalDays(start,end)` helper.
Regression test: 5-day booking → same count from both endpoints.
```

---

## 6. State-everywhere verification matrix

Legend: Y = the place shows the state consistent with the DB row; N = inconsistent (explained); — = not applicable.
Places: Row = `reservations` row; Get = `GET /:id`; List = `GET /api/reservations`; Range = `/range`; ByV = `/vehicle/:id`;
ByC = `/customer/:id`; Up = `/upcoming`; OvAll = `/overdue`; OvV = `/overdue/:vehicleId`; Veh = `vehicles.availability_status`
(+ `GET /api/vehicles/:id`); Docs = `documents` + `/api/documents/reservation/:id`; Drv = `reservation_driver_assignments`;
Tr = `vehicle_transports`; Rep = replacement/placeholder rows; Audit = `audit_logs`; Portal = `portal_notifications` /
`GET /api/portal/reservations`.

### 6.1 Spec sequence, variant 1 (delete vehicle) — reservation 3437, script p10-g-sequence.cjs

| Step | Row | Get | List | Range | ByV | ByC | Up | OvAll | OvV | Veh | Docs | Drv | Tr | Audit | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 create on AU-131-X (booked, driver 161) | Y | Y | Y | Y | Y | Y | Y(not in top 5) | Y | Y | Y (131 scheduled) | Y(0) | Y(161 open) | — | Y create | |
| 2 assign vehicle AU-132-X | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (131 avail, 132 scheduled) | Y | Y | — | Y update | |
| 3 cancel (/status) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (132 avail) | Y | **N** still open (R10-005) | — | Y update/status | |
| 4 modify notes/price (cancelled) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | — | Y | edit of cancelled accepted |
| 5 change vehicle → AU-133-X (cancelled) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (all avail) | Y | N | — | Y | no conflict check (cancelled) |
| 6 generate contract ×2 | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (2 docs on AU-133-X) | N | — | no *reservation-scoped* audit row (the /api/contracts routes log under another resource type) | contracts for a cancelled rental |
| 7 DELETE vehicle AU-133-X | **N** row hard-deleted (BUG-022) | 404 | gone | — | — | — | gone | gone | — | 404 | **N** docs rows deleted | **N** deleted | — | audit rows remain under old id | recycle bin has the vehicle |
| 7b restore vehicle | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (312/313 back) | **N** history gone (R10-012) | — | Y (vehicle.update restoredFromDeletedRecord) | |
| 8 reload | Y | Y | Y | Y | — | — | — | — | — | Y | Y | N | — | Y | |

### 6.2 Spec sequence, variant 2 (delete customer) — reservation 3438

Steps 1-6 identical to 6.1 (all Y except Drv after cancel and the missing document audit row).

| Step | Row | Get | List | Range | ByC | Docs | Contract data | generate-versioned | customers/with-reservations | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 7 DELETE customer 1281 (204, hard) | **N** customer_id dangling (BUG-007) | 200, `customer` undefined | present, no customer | present, no customer | still returns 1 row for a non-existent customer | Y | 200 (blank customer) | **404 "Vehicle or customer not found"** | 200 | |
| 8 reload | same | same | same | same | | | | | | |

### 6.3 Other sequences (one line each)

| Scenario (script) | Inconsistent places |
|---|---|
| B2 far-past pickup + return before start (3361) | Range N (inverted dates, R10-003/010); OvV N (returned flagged overdue, R10-006); rest Y |
| B5 early pickup + return before start (3364) | Range N; OvV N; rest Y |
| B6 garbage pickup/return dates (3365) | Row/Docs contain garbage; Range Y by accident (string compare) |
| C1a/C1b customer + vehicle change on picked_up (3383) | all Y; contract regenerated; old vehicle released |
| C2a return then rebook (3384) | POST create N (409 overdue guard on a returned rental, R10-006) |
| C2d completed via /status (3386) | Row N (no actual_return/completion), Veh Y (no upcoming booking) |
| D1 cancel with transport/spare/placeholder (3429) | Tr N, Drv N, Rep N (R10-005); spare vehicle Veh N ('scheduled' for a cancelled rental) |
| D2 cancel picked_up (3432) | Veh N ('available' while car is out, R10-011); Drv N |
| E1 soft delete (3387) | all Y (excluded everywhere, conflicts released); recycle bin N (R10-015) |
| E2 delete picked_up (3389) | Veh N; contract number reused (R10-011); Docs orphan (BUG-055) |
| F1-F4 overdue / extend / late return / mark completed (3392, 3394) | all Y except F4 Row (completed without return data, R10-007d) and BUG-019 endDate |
| H1-H8 portal (3395) | Portal reads Y at every step; Portal notifications N (R10-014); driver history N after /basic (R10-013) |
| I4 PATCH status 'returned' (3439) | Veh N ('rented' after returned, R10-009 class); Row N (no return data) |
| J completed via /status with upcoming booking (3445) | Veh N ('rented', R10-009) |

---

## 7. PATCH /:id vs PATCH /:id/basic — field-by-field (script p10-a-patch-diff.cjs, reservations 3345/3346)

W = written to DB, — = ignored/unchanged, 4xx/5xx = rejected. `/basic` was always sent the full valid row plus the probe.

| Field (value) | PATCH /:id | /basic |
|---|---|---|
| id (9999999) | **W — row renumbered** (R10-002) | — |
| vehicleId (free vehicle) | W | W |
| vehicleId (busy vehicle, no dates in body) | **W (no conflict check, R10-001)** | 409 |
| vehicleId / customerId (non-existent) | W / W (BUG-039) | W / W (BUG-039) |
| customerId (other) | W | W |
| driverId (existing) | W + assignment row | W, **no assignment row** (R10-013) |
| driverId (non-existent) | 400 raw FK | 500 raw FK |
| startDate valid / garbage | W / **W 'not-a-date'** | W / 400 |
| endDate valid / before start | W / **W** | W / 400 |
| startTime valid / '25:99' | W / **W** | W / 400 |
| endTime 'garbage' | **W** | 400 |
| actualPickupDate, actualReturnDate, completionDate | W | W |
| status 'garbage' | W (BUG-016) | W (BUG-016) |
| totalPrice -5 / 'abc' | W -5 / null (BUG-054) | W -5 / null (BUG-054) |
| notes | W | W |
| damageCheckPath '../../../etc/passwd' | W | W (never served — inert) |
| contractNumber | W (dup → 409 clean) | W (dup → 500 raw, BUG-038) |
| type 'garbage' / 'maintenance_block' | **W** / W | 400 / W |
| replacementForReservationId, affectedRentalId, portalRequestId (1) | W | W |
| placeholderSpare true | W | 400 |
| spareVehicleStatus / maintenanceStatus / deliveryStatus / recurringFrequency 'garbage' | W | W |
| maintenanceCategory, spareAssignmentDecision 'x' | W | W |
| maintenanceDuration 'abc' | 400 | 400 |
| pickupMileage -100 / returnMileage 5 (< pickup) | W / W | W / W |
| fuelLevelPickup 'garbage', fuelLevelReturn, fuelCardNumber, fuelNotes | W | W |
| fuelCost -1 / deliveryFee -1 | W / W | 400 / 400 |
| isRecurring, recurringParentId, recurringEndDate, recurringDayOfWeek 99, recurringDayOfMonth 99 | W | W |
| deliveryRequired true | W + transport row created (by design `syncDeliveryTransport`) | same |
| deliveryAddress/City/PostalCode/Notes | W | W |
| deliveryStaffId (non-existent) | 400 raw FK | 500 raw FK |
| createdAt / updatedAt | 400 (Date parse) | — (stripped) |
| createdBy 'AUDIT-hacker' | **W** | **W** |
| updatedBy | — (overwritten by server) | — |
| createdByUser / updatedByUser (non-existent) | 400 raw FK | — |
| deletedAt | 400 (Date parse) | — |
| deletedBy 'AUDIT-hacker' / deletedByUser 1 | **W / W** | — / — |
| unknownField, nested vehicle/customer objects | — | — |
| empty body `{}` | 200 no-op | n/a (400 missing fields) |
| wrapped `{body:"<json>"}` | n/a | accepted |

Summary: `/basic` validates shape but not semantics (status, enums, mileage, ownership fields, driver history);
`PATCH /:id` validates nothing at all and is the path the reservation form and the calendar use.

---

## 8. Re-confirmed existing bugs (new evidence only)

- **BUG-016** (status bypass via PATCH/basic): the reservation form's own status select offers `returned`, `completed`,
  `cancelled` in edit mode (reservation-form.tsx:2079-2085) and submits through `PATCH /:id` (FormData) — so the bypass is
  the *normal UI path*, not just an API quirk. Calendar "revert to picked_up" (calendar.tsx:3274) likewise. New
  consequences: cancelled→booked via PATCH is accepted while /status refuses it (D3), and the un-cancel double-books
  (D3b, also R10-001); picked_up→returned via PATCH leaves the vehicle rented (I4).
- **BUG-019** (endDate := today): returned→completed via /status moved end_date from the real return day 2026-09-05 to
  2026-09-10 (C2b, 3384); "mark completed" on an overdue rental (F4, 3394) produced a completed row with no return data
  and end_date = today (financial rentalDays 21 for a 6-day plan).
- **BUG-022** (vehicle delete hard-deletes reservations): reproduced twice more (3437); documents rows and
  driver-assignment rows go with it; restore brings back reservation + documents only (R10-012).
- **BUG-007** (customer hard delete, dangling reservation): reproduced with 3438/customer 1281 — 204, no impact check;
  afterwards `generate-versioned` 404s, list/get show no customer, `/reservations/customer/1281` still returns the row.
- **BUG-038** (raw duplicate-contract error): `/basic` variant → 500 (C4); `PATCH /:id` variant is clean 409.
- **BUG-039** (no FK on vehicleId/customerId): both PATCH paths write 999999999 (A table).
- **BUG-040** (past startDate + overdue guard): 2015 booking (3361) blocks the vehicle; the guard currently blocks 255
  vehicles via stale `booked` rows in the clone (I2) — and, new, 7 via `returned` (R10-006) and 45 via legacy statuses (R10-008).
- **BUG-054** (totalPrice): -5 and 'abc'→null through both PATCH paths.
- **BUG-055** (orphans on delete): E1/E2 — documents and open driver assignment survive; cancel has the same effect
  (R10-005).
- **BUG-056** (recurring fields inert): all recurring fields freely writable via PATCH (A table); still no generator.

Not re-tested: BUG-006 (race), BUG-017 (blacklist), BUG-018 (availabilityStatus), BUG-037, BUG-057.

---

## 9. Scripts and evidence files

| Script | Covers | Output |
|---|---|---|
| p10-setup.cjs, p10-lib.cjs, p10-ids.json | fixtures, session, everywhereSnapshot | |
| p10-a-patch-diff.cjs | gap (1) field diff, conflict bypass | p10-a-patch-diff.out.json |
| p10-b-dates.cjs | gaps (2)(3) long/past/same-day/return-before-start/future/early pickup/garbage dates | p10-b-dates.out.json |
| p10-c-pickedup-status.cjs | gaps (4)(10)(11) picked_up edits, returned/completed, completed edits + audit, PK renumber | p10-c-pickedup-status.out.json |
| p10-d-cancel.cjs | gap (5) cancel effects, un-cancel | p10-d-cancel.out.json |
| p10-e-delete-overlap.cjs | gap (6) delete + overlap, delete picked_up, restore | p10-e-delete-overlap.out.json |
| p10-f-overdue.cjs | gap (7) overdue extend/late return/mark completed | p10-f-overdue.out.json |
| p10-g-sequence.cjs | gap (8) spec sequence ×2 | p10-g-sequence.out.json |
| p10-h-portal.cjs | gap (9) portal reflection + notifications | p10-h-portal.out.json |
| p10-i-status.cjs | gap (10) status consistency, legacy statuses, drag/drop shape | p10-i-status.out.json |
| p10-j-sync.cjs | vehicle status after completed vs return | p10-j-sync.out.json |

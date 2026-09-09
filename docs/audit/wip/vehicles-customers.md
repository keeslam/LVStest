# Fase 3-5 — Vehicles, Customers, Drivers, Blacklist, Recycle Bin, RDW proxy

2026-09-09, tested against `http://localhost:5001` / db `lvs_audit`, commit as checked out at test time. Admin session (`admin`/`admin123`) plus a throwaway limited user `AUDIT-limiteduser` (role `user`, permissions `["view_vehicles","view_customers"]`, id 4). All created records are prefixed `AUDIT-`/`AU-...`. Scripts live in `docs/audit/wip/scripts/` — this area's private copies are suffixed `-vc` (`lib-vc.cjs`, `db-vc.cjs`, `test-*.cjs`) because the shared `scripts/lib.cjs`/`jar.txt`/etc. were being actively edited by other concurrent audit agents in the same directory during this session; reuse `lib-vc.cjs`'s `getAdminSession()`/`getLimitedSession()` helpers (persisted session cookies in `session-vc-admin.json` / `session-vc-limited.json`) to re-run anything below without burning the shared 5-login/15min-per-IP budget again.

Operational note: the dev server under test restarted at least twice during this session (observed via `Get-NetTCPConnection`/PID change and transient `ECONNREFUSED`), and login/API rate limits were exhausted more than once — both consistent with many concurrent audit agents hammering `localhost:5001` at once. Sessions survived the restarts (DB-backed session store), so this didn't invalidate results, but it means the "server crashed" observation itself is **not attributed to any bug below** — no isolated repro, noted for awareness only.

## Tested (passed / working as intended)

- `POST /api/vehicles`: minimal required-field create; exact-duplicate plate correctly rejected 409; missing brand/model rejected 400; whitespace-only and HTML/script plate values correctly reduced to "missing" by the global `sanitizeInput` (DOMPurify strip + trim) middleware and rejected — XSS/whitespace handled correctly.
- Vehicle mileage type coercion: `departureMileage` as a non-numeric string / array / object all correctly rejected 400 by zod; `currentMileage` (which has an explicit `min(0)` in `insertVehicleSchema`) correctly rejects negative values.
- `PATCH /api/vehicles/:id` on a non-existing id → 404. `PATCH` availability to `available` while the vehicle has an active `picked_up` reservation → correctly blocked 400 (`vehicle-status-helper.ts` `validateManualStatusChange`).
- `POST /api/vehicles/bulk-import-plates` and `bulk-import-csv`: malformed payloads (string instead of array, wrong field name, missing field) all rejected cleanly with 400 and a clear message.
- `GET /api/vehicles/:id/delete-impact`, `DELETE /api/vehicles/:id` confirmation flow: no `confirmLicensePlate` → 400 `CONFIRMATION_REQUIRED`; wrong plate typed → same 400; correct plate → deletes and snapshots. Restoring a deleted vehicle via `POST /api/deleted-records/:id/restore` correctly restores the vehicle **and** its reservations with original ids; restoring the same record twice → clean 409 `ALREADY_RESTORED`; restoring when the plate has since been reused by a new vehicle → clean 409 `LICENSE_PLATE_TAKEN`; restoring a non-existing record id → 404.
- Concurrency: 10 parallel `POST /api/vehicles` with the identical plate → exactly one 201, nine clean 409s (Postgres unique index handles the race correctly, no duplicate rows).
- Blacklist (`/api/vehicles/:id/blacklist`, `/api/blacklist/:id`, `/check/:customerId`): add, duplicate-add (400, clean message), remove, remove-again (404), add for a non-existing customer/vehicle (404/404) — all correct.
- Customer email validation: `insertCustomerSchema`'s `optionalEmail` correctly rejects `not-an-email`, `foo@bar`, `@@@` (400 zod) and correctly allows an empty string.
- `PATCH`/`DELETE /api/customers/:id` on a non-existing id → 404/404.
- Driver CRUD: create (JSON, no file), edit, deactivate (`status: 'inactive'`) all work. Deleting a driver that is `driverId` on an active `booked` reservation correctly nulls `reservations.driver_id` via the `ON DELETE SET NULL` FK (`shared/schema.ts:713`) instead of blocking or cascading — the reservation survives. Deleting a non-existing driver → 404.
- Driver license upload: a 0-byte file declared `.pdf` is correctly rejected 400 by `validateAfterUpload`'s magic-byte check with a clean message (no stack trace — different code path than the multer `fileFilter` rejections, see VC-013). Client-supplied filenames (a 1000+ char name, and a `../../../evil.pdf` path-traversal attempt) are irrelevant to storage: the server always names the file itself (`license_customer<id>_<timestamp>.ext`), so neither is exploitable.
- `POST /api/migrate/customer-drivers` run twice as admin: idempotent, second run reports `migrated: 0` (existing-drivers check prevents duplicates).
- Permission boundary, limited user (`view_vehicles`, `view_customers` only) correctly gets 403 on: `POST/PATCH/DELETE /api/vehicles`, `POST /api/customers`, `PATCH/DELETE /api/customers/:id`, `POST /api/customers/:id/drivers`, `PATCH/DELETE /api/drivers/:id`, `POST /api/vehicles/:id/blacklist`, and gets 403 "Admin access required" on the recycle-bin routes (`GET /api/deleted-records`, `POST /api/deleted-records/:id/restore`, which use `requireAdmin` rather than a permission check).
- `GET /api/rdw/vehicle/:licensePlate` with odd input (`../../etc/passwd`, `%00`, a 3000-char plate) → all a clean 404 from the upstream RDW lookup, no crash, no path-traversal or injection effect observed.

## Not tested (why)

- `portal_requests`/`portal_activity_log`/`portal_document_acks` cascade on customer delete — the clone fixture (customer 1257) was given a driver, a portal account and a reservation via real API calls, but not a portal request (would require completing the portal account-activation flow first, out of scope for this pass). The schema declares a cascade FK for `portalRequests`, consistent with what was observed for drivers/portal_users below; not independently verified.
- Bulk import **success** path (valid CSV/plate list actually importing vehicles) — only the malformed-payload rejection path was exercised, per the task's fuzzing focus.
- Barcode uniqueness under manual id collision/reuse — only `POST /api/vehicles/:id/barcode/regenerate` (twice) was exercised; it succeeded both times without inspecting whether the generated value can collide.
- Deep RDW proxy fuzzing (header injection, encoding edge cases beyond `%00`/`../`/length) and whether it has its own rate limit — out of time budget; only the four cases in "Tested" were run.
- Blacklist concurrency (parallel duplicate-add race) — not run; the duplicate check is a non-atomic check-then-insert (`server/routes.ts:1849-1861`) same shape as the restore race in VC-008, so it is plausibly race-able too, but unverified.

## BUGs

```
BUG VC-001
Severity: HIGH
Feature: Vehicles - license plate uniqueness
Status: OPEN
Reproduction:
  1. POST /api/vehicles {"licensePlate":"AU-001-X","brand":"AUDIT-Brand","model":"AUDIT-Model"} -> 201
  2. POST /api/vehicles {"licensePlate":"au001x","brand":"AUDIT-Brand3","model":"AUDIT-Model3"} -> 201 (id 1699)
  3. POST /api/vehicles {"licensePlate":"AU 001 X","brand":"AUDIT-Brand3b","model":"AUDIT-Model3b"} -> 201 (id 1700)
  See docs/audit/wip/scripts/test-vehicles.cjs steps 3/3b, output in out-vehicles-1.txt.
Expected: The three requests represent the same real-world Dutch plate (dashes/spaces are formatting only, plates are case-insensitive) and creating the 2nd/3rd should be rejected the same way the exact-duplicate case is (409, "already exists").
Actual: Three separate vehicle rows (ids 1698ish/1699/1700) exist for what is the same physical plate, each with its own mileage/status/maintenance history, delete/restore state, and reservation set.
Root cause: shared/schema.ts:172 `licensePlate: text("license_plate").notNull().unique()` — the unique constraint (and the server/routes.ts:723-847 create handler, and the 1082-1233 update handler) compare the raw string with no normalization. Contrast with server/utils/rdw-api.ts:140, which normalizes a plate to `[A-Za-z0-9]` uppercase before calling the RDW API — that normalization is never applied to the uniqueness check.
Affected files: server/routes.ts:723-847, server/routes.ts:1082-1233, shared/schema.ts:172
Affected data: vehicles (ids 1699, 1700, plus 1667 "AU-SOCK-5064" and others created by concurrent test agents in the same run - all left in place per instructions)
Security impact: none directly, but enables two independent, divergent records (mileage, damage checks, maintenance, reservations) for the same physical car, which can be used to hide a vehicle's real usage/incident history by booking it under the "other" record.
Business impact: double-booking risk (the conflict/availability checks in database-storage.ts operate per vehicle id, so the same physical car could be booked twice under its two plate-format variants), inconsistent APK/service/mileage tracking, confusing RDW lookups.
Fix (proposal only): normalize the plate (strip non-alphanumerics, uppercase) before the uniqueness check and before insert/update, e.g. reuse the same normalization used in server/utils/rdw-api.ts, and consider a generated/functional unique index on the normalized form so races are still caught by Postgres.
Regression test (proposal): POST a vehicle with plate "AB-123-C", then POST another with "ab123c" and one with "AB 123 C" - both must 409.

BUG VC-002
Severity: LOW
Feature: Vehicles - license plate content/length validation
Status: OPEN
Reproduction:
  POST /api/vehicles {"licensePlate":"AU-🚗-EMOJI","brand":"AUDIT-Emoji","model":"AUDIT-Emoji"} -> 201
  POST /api/vehicles {"licensePlate":"AU-XXXX...(500 X's)","brand":"AUDIT-Long","model":"AUDIT-Long"} -> 201
  See test-vehicles.cjs steps 4/5, out-vehicles-1.txt.
Expected: A Dutch license plate has a fixed short format; the API should reject characters outside what a plate can contain and cap length.
Actual: Both accepted and stored verbatim (text column, no format/length check anywhere in insertVehicleSchema).
Root cause: shared/schema.ts:172 `licensePlate: text(...)` has no zod `.regex()`/`.max()` added in the `insertVehicleSchema.extend({...})` block (schema.ts:277-286).
Affected files: shared/schema.ts:172,277-286
Affected data: vehicles ids created with plates "AU-🚗-EMOJI" and the 500-char plate
Security impact: none observed (no downstream code was found to choke on this - RDW lookups, PDF generation etc. were not separately fuzzed with these values).
Business impact: low - could produce garbled contract PDFs/labels if a long/emoji plate is ever chosen for a real vehicle by mistake; mostly a defense-in-depth gap since the UI likely constrains input already.
Fix (proposal only): add a `.regex(/^[A-Za-z0-9\- ]{1,12}$/)` (or the actual Dutch-plate pattern) to the licensePlate field in insertVehicleSchema.
Regression test (proposal): POST a vehicle with an emoji or 100+ char plate, expect 400.

BUG VC-003
Severity: MEDIUM
Feature: Vehicles - mileage validation
Status: OPEN
Reproduction:
  POST /api/vehicles {"licensePlate":"AU-NEG-<ts>","brand":"AUDIT-Neg","model":"AUDIT-Neg","departureMileage":-500,"returnMileage":-20} -> 201, stored as-is (departureMileage: -500, returnMileage: -20)
  PATCH /api/vehicles/<id> {"departureMileage":-999} -> 200, also stored (verified separately)
Expected: Mileage is a physical odometer reading and cannot be negative - same rule that already exists for currentMileage (shared/schema.ts:285 `.min(0)`).
Actual: departureMileage/returnMileage accept and persist negative integers on both create and update.
Root cause: shared/schema.ts:277-286 `insertVehicleSchema` only extends `currentMileage` with a `.min(0)` refinement; `departureMileage`/`returnMileage` (schema.ts:211-212) keep the drizzle-zod default `z.number().int().optional().nullable()` with no lower bound.
Affected files: shared/schema.ts:211-212,277-286
Affected data: vehicles id 1706 (departureMileage -500, returnMileage -20), id 1730 (departureMileage -999 via PATCH)
Security impact: none.
Business impact: corrupts mileage-based service-interval scheduling (server/database-storage.ts uses currentMileage/lastServiceMileage for service-due calculations) if departure/return mileage is ever fed into that math, and produces obviously wrong figures on printed contracts/damage checks.
Fix (proposal only): extend departureMileage and returnMileage in insertVehicleSchema with the same `mileageSchema`/`.min(0)` pattern already used for currentMileage (schema.ts:922 `mileageSchema` already exists and is unused here).
Regression test (proposal): POST/PATCH a vehicle with departureMileage: -1, expect 400.

BUG VC-004
Severity: MEDIUM
Feature: Vehicles - date field validation (APK, warranty, registration dates)
Status: OPEN
Reproduction:
  POST /api/vehicles {"licensePlate":"AU-007-X","brand":"AUDIT-Date","model":"AUDIT-Date","apkDate":"2026-02-30"} -> 201, apkDate stored literally as "2026-02-30" (not a real calendar date - February has 28/29 days)
  POST /api/vehicles {..., "apkDate":"99999-01-01"} -> 201, stored as "99999-01-01"
Expected: apkDate (and the other *Date text columns - warrantyEndDate, euroZoneEndDate, registeredToDate, companyDate, etc.) drive a legally-required inspection reminder (server/routes.ts:300 GET /api/vehicles/apk-expiring); an impossible calendar date should be rejected rather than silently stored.
Actual: Any string is accepted; no calendar validation anywhere in insertVehicleSchema or the create/update routes (routes.ts:778-782 only nulls empty-string date fields, never validates non-empty ones).
Root cause: shared/schema.ts:187 `apkDate: text(...)` (and sibling date columns) with no zod date refinement in insertVehicleSchema.
Affected files: shared/schema.ts:187,277-286; server/routes.ts:723-847,1082-1233
Affected data: vehicle id 1704 (apkDate "2026-02-30"), id 1705 (apkDate "99999-01-01")
Security impact: none.
Business impact: apk-expiring's query (server/database-storage.ts:826-851) does a lexical string range compare (`apkDate >= pastStr AND apkDate <= futureStr`), so a well-formed-but-impossible date like "2026-02-30" still sorts correctly and would still surface in the reminder list - the practical risk is a malformed value in the *UI* (`new Date("2026-02-30")` rolls over to March in JS) showing staff the wrong APK due date, which is a compliance-relevant field.
Fix (proposal only): add a zod refinement (e.g. `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidCalendarDate)`) for apkDate and the other legally/operationally significant *Date text fields.
Regression test (proposal): POST/PATCH a vehicle with apkDate "2026-02-30", expect 400.

BUG VC-005
Severity: HIGH
Feature: Vehicles - availabilityStatus status machine
Status: OPEN
Reproduction:
  1. POST /api/vehicles {"licensePlate":"AU-STAT-<ts>","brand":"AUDIT-Status","model":"AUDIT-Status"} -> 201 (id 1707, availabilityStatus defaults to "available")
  2. PATCH /api/vehicles/1707 {"availabilityStatus":"banana_not_real"} -> 200, body echoes availabilityStatus: "banana_not_real"
  3. DB check: select availability_status from vehicles where id=1707 -> "banana_not_real"
  See test-vehicles-2.cjs step A, out-vehicles-2.txt.
Expected: availabilityStatus is a 5-value enum (available/scheduled/needs_fixing/not_for_rental/rented per server/vehicle-status-helper.ts:3); an unrecognized value should be rejected 400.
Actual: Accepted and persisted verbatim.
Root cause: server/vehicle-status-helper.ts:74-145 `validateManualStatusChange` only special-cases specific from/to transitions (hasPickedUpReservation, hasMaintenanceBlock, hasBookedReservation, "rented", "scheduled"); any newStatus value that doesn't match one of those branches falls through to the final `return { allowed: true, newStatus }` (line 144) with no allowlist check on newStatus itself. The DB column (shared/schema.ts:261) is plain `text`, so nothing downstream rejects it either.
Affected files: server/vehicle-status-helper.ts:74-145; server/routes.ts:1159-1182 (calls validateManualStatusChange); shared/schema.ts:261
Affected data: vehicle id 1707, availability_status = "banana_not_real"
Security impact: none.
Business impact: every UI view/report that filters by the 5 known statuses (availability dashboards, "vehicles needing attention" lists, the "available for booking" picker in server/database-storage.ts's `getAvailableVehiclesInRange`) will silently exclude this vehicle, since it matches none of the 5 known values - the vehicle effectively vanishes from status-based workflows until someone notices and manually fixes it.
Fix (proposal only): validate newStatus against the VehicleAvailabilityStatus union (`z.enum([...])`) before running the transition-specific checks in validateManualStatusChange, returning `{allowed: false}` for anything outside the 5 known values.
Regression test (proposal): PATCH a vehicle's availabilityStatus to "not_a_real_status", expect 400.

BUG VC-006
Severity: CRITICAL
Feature: Customers - delete cascade / orphaned reservations
Status: OPEN
Reproduction:
  1. Built a clone of customer 179 (which is a fixed portal-login fixture and was not touched directly): POST /api/customers {"name":"AUDIT-Clone179 B.V.",...} -> id 1257; POST /api/customers/1257/drivers {...} -> driver id 853; POST /api/portal-admin/customers/1257/accounts {...} -> portal user id 934; POST /api/reservations {"vehicleId":18,"customerId":1257,"startDate":"2026-11-01","endDate":"2026-11-05","status":"booked"} -> reservation id 3230 (see setup-clone-customer.cjs).
  2. DELETE /api/customers/1257 -> 204 (no confirmation prompt, no impact check).
  3. DB check (test-customer-delete.cjs):
     - customers where id=1257 -> [] (gone, expected)
     - drivers where id=853 -> [] (cascaded, expected - drivers.customerId has ON DELETE CASCADE)
     - portal_users where id=934 -> [] (cascaded, expected)
     - reservations where id=3230 -> STILL PRESENT: {id:3230, customer_id:1257, vehicle_id:18, status:'booked'}
     - select count(*) from reservations where customer_id is not null and not exists(select 1 from customers where id=reservations.customer_id) -> 1 (this row)
  4. GET /api/reservations/3230 as admin -> 200, still returns customerId: 1257 with no indication the customer no longer exists.
Expected: Either the delete is blocked/warned when the customer has active reservations (the way vehicle delete requires typing the plate back, or at minimum surfaces a delete-impact count the way GET /api/vehicles/:id/delete-impact does), or the reservation is cascaded/cancelled/soft-deleted along with the customer. In no case should a `booked` reservation for a real future rental silently end up pointing at a nonexistent customer.
Actual: The customer is hard-deleted with zero confirmation, zero impact check, and the reservation survives with a now-dangling customer_id. The vehicle (id 18) remains implicitly reserved for those dates for a customer that no longer exists, with no UI path to fix it (the customer picker cannot select a deleted customer).
Root cause: server/database-storage.ts:980-986 `deleteCustomer` is a bare `db.delete(customers).where(eq(customers.id, id))` with no impact-check, no snapshot, and no handling of `reservations.customerId`, which shared/schema.ts declares as a plain `integer("customer_id")` with **no** `.references()` FK (unlike drivers.customerId, which has `onDelete: "cascade"`). server/routes.ts:2114-2134 (`DELETE /api/customers/:id`) adds no confirmation or impact check on top of that, unlike the vehicle delete route (routes.ts:1599-1691, which requires GET delete-impact + typed plate confirmation).
Affected files: server/database-storage.ts:980-986; server/routes.ts:2114-2134; shared/schema.ts (reservations.customerId column definition, ~line 700s, no FK)
Affected data: reservations.id=3230 (dangling customer_id=1257); general finding also applies to any customer with reservations - confirmed with this dedicated clone fixture per the task's instruction not to delete customer 179 itself.
Security impact: none directly (no cross-tenant exposure), but is a serious data-integrity hole.
Business impact: a staff member deleting a customer (e.g. to clean up a duplicate) can silently strand a real future booking with no warning, no audit trail of "this reservation lost its customer", and no supported way to repair it short of direct DB access. The vehicle stays effectively blocked for those dates against a ghost customer.
Fix (proposal only): add a `getCustomerDeleteImpact` (mirroring the vehicle one) and a typed-confirmation delete flow; at minimum, block deletion when the customer has non-cancelled/non-completed reservations, or cascade-cancel them transactionally with a snapshot into deleted_records the way deleteVehicle does.
Regression test (proposal): create a customer with a `booked` reservation, DELETE the customer, assert either a 4xx block or that the reservation is no longer left pointing at a nonexistent customer.

BUG VC-007
Severity: HIGH
Feature: Vehicles - delete cascades to OTHER customers' reservations with no per-customer warning
Status: OPEN
Reproduction:
  1. Create vehicle (plate AU-DEL-<ts>).
  2. Create two different customers (custA, custB) and one reservation each on that vehicle: resA (custA, 2026-12-01..05), resB (custB, 2026-12-10..15).
  3. GET /api/vehicles/<id>/delete-impact -> {"counts":{"reservations":2,...}} - only a count, no indication these are two DIFFERENT customers' bookings.
  4. DELETE /api/vehicles/<id> {"confirmLicensePlate":"AU-DEL-<ts>"} -> 200 success.
  5. DB: both reservations (resA and resB) are gone (hard-deleted, snapshotted into deleted_records only).
  See test-delete-restore.cjs, out-delete-restore.txt.
Expected: A confirmation flow exists specifically to prevent "a stray click" from wiping a vehicle and its rentals (per the code comment at server/routes.ts:1631-1632), but the impact shown to the deleting user is only an aggregate count - it doesn't disclose that the reservations belong to multiple different customers, some with a future paid booking, nor is any notification sent to those customers.
Actual: One staff action (delete + type the plate back) silently removes every customer's current and future bookings for that vehicle with no separate acknowledgement of "this will also cancel customer X's Dec 10 booking" and no customer-facing notification observed in the code path (deleteVehicle at database-storage.ts:535-618 has no email/portal-notification call).
Root cause: server/database-storage.ts:592-599 (`tx.delete(reservations).where(eq(reservations.vehicleId, id))`) deletes every reservation on the vehicle unconditionally; server/routes.ts:1599-1621 (`delete-impact`) only returns `counts.reservations` as a number, not a breakdown by customer/status.
Affected files: server/database-storage.ts:498-618; server/routes.ts:1599-1691
Affected data: reservations resA/resB (both hard-deleted, recoverable only via the vehicle-level restore, which un-deletes both together - there's no way to restore just one).
Security impact: none.
Business impact: a vehicle taken out of service (e.g. after an accident) could have a real future customer booking wiped with no automatic notice to that customer, discovered only when the customer shows up (or doesn't get contacted) for a rental that no longer exists in the system.
Fix (proposal only): have delete-impact return the distinct customers/reservation summaries (not just a count) so the confirming staff member sees exactly what will be lost, and/or trigger a notification (email/portal) to affected customers with future bookings when their reservation is removed this way.
Regression test (proposal): create two reservations on one vehicle for two different customers, call delete-impact, assert the response identifies both customers (not just a count).

BUG VC-008
Severity: MEDIUM
Feature: Recycle bin - concurrent restore of the same deleted record
Status: OPEN
Reproduction:
  1. Create + delete a vehicle to get one deleted_records row (id 33 in this run).
  2. Fire 10 concurrent POST /api/deleted-records/33/restore from the same authenticated session (test-concurrency.cjs, Promise.all of 10 admin.request calls).
  3. Observed statuses: [200, 409, 500, 500, 500, 500, 500, 500, 409, 409] - one success, three clean 409 ALREADY_RESTORED, but six raw 500s.
  See out-concurrency.txt.
Expected: Every request beyond the first successful restore should get the same clean 409 `ALREADY_RESTORED` the doc's restore route already returns for a sequential double-restore (verified working correctly in test-delete-restore.cjs).
Actual: Under concurrency, most of the losing requests get an unhandled 500 instead.
Root cause: server/database-storage.ts:637-661 `restoreDeletedRecord` runs its `id_taken`/`license_plate_taken`/`already_restored` existence checks **before** starting `db.transaction` at line 663 (the doc's own read-phase note calls this "kleine TOCTOU"). Under real concurrency, several requests can all pass the pre-checks (record not yet marked restored) and then race inside the transaction's `tx.insert(vehicles).values(...)` (line 687) with the same forced primary key, so all but the winner hit a raw Postgres unique-violation that isn't translated into a clean response by the route's catch block (server/routes.ts:1753-1760 falls through to a generic 500).
Affected files: server/database-storage.ts:637-725; server/routes.ts:1715-1761
Affected data: none corrupted - the record ends up correctly restored exactly once either way; this is a rough-edges/error-handling issue, not silent data loss.
Security impact: none.
Business impact: a staff member double-clicking "restore" (or two staff restoring the same record at once) sees a raw 500 "Error restoring deleted record" instead of a clear "already restored" message, which is confusing but not destructive.
Fix (proposal only): move the id/plate-existence checks inside the transaction (with a `SELECT ... FOR UPDATE` or rely on `ON CONFLICT DO NOTHING` plus checking rowcount), and/or catch the unique-violation (Postgres code 23505) in the route and map it to the same 409 ALREADY_RESTORED response.
Regression test (proposal): fire 5+ concurrent restores of the same deleted_records id, assert every response is either 200 (exactly once) or a clean 409, never a 5xx.

BUG VC-009
Severity: MEDIUM
Feature: Customers - blank/whitespace-only name accepted
Status: OPEN
Reproduction:
  POST /api/customers {"name":"   ","email":"audit-ws-<ts>@example.com"} -> 201, body shows "name":""
Expected: name is the primary identifying field for a customer (shown on every reservation, contract, invoice); a value that is empty after trimming should be rejected the same way missing brand/model is rejected for vehicles.
Actual: The global sanitizeInput middleware (server/middleware/security/sanitization.ts, DOMPurify strip + `.trim()`) correctly reduces "   " to "", but insertCustomerSchema never enforces a minimum length on name, so the empty string sails through zod and gets persisted.
Root cause: shared/schema.ts:291 `name: text("name").notNull()` with no `.min(1)` added in insertCustomerSchema's `.extend({...})` (schema.ts:363-377, which only touches the email fields).
Affected files: shared/schema.ts:291,363-377; server/middleware/security/sanitization.ts:11-13
Affected data: customer id 1260, name = ""
Security impact: none.
Business impact: an unnamed customer record is confusing everywhere it's displayed (reservation lists, contracts, search), and search-by-name can't find it.
Fix (proposal only): add `.min(1, "Name is required")` (after trim) to the `name` field in insertCustomerSchema's extend block, mirroring the explicit required-field check already done for vehicles' licensePlate/brand/model.
Regression test (proposal): POST a customer with name "   ", expect 400.

BUG VC-010
Severity: LOW
Feature: Customers - no length cap on name
Status: OPEN
Reproduction:
  POST /api/customers {"name":"AUDIT-" + "A".repeat(2000), "email":"audit-long-<ts>@example.com"} -> 201, full 2000+ char name stored verbatim.
Expected: A reasonable upper bound (matching whatever the UI form allows).
Actual: No `.max()` anywhere in insertCustomerSchema for name.
Root cause: shared/schema.ts:291,363-377, same gap as VC-009 (no zod extension for name at all).
Affected files: shared/schema.ts:291,363-377
Affected data: customer id 1262
Security impact: none.
Business impact: low - could produce oddly formatted contracts/invoices if such a name is ever printed.
Fix (proposal only): add `.max(255)` (or whatever the DB/UI reasonably supports) alongside the `.min(1)` fix in VC-009.
Regression test (proposal): POST a customer with a 5000-char name, expect 400.

BUG VC-011
Severity: MEDIUM
Feature: Customers - duplicate debtor numbers allowed
Status: OPEN
Reproduction:
  POST /api/customers {"name":"AUDIT-Debtor1-<ts>","debtorNumber":"AUDIT-DEB-<ts>",...} -> 201 (id 1264)
  POST /api/customers {"name":"AUDIT-Debtor2-<ts>","debtorNumber":"AUDIT-DEB-<ts>",...} (same debtorNumber) -> 201 (id 1265)
Expected: A debtor number is an accounting identifier and should be unique per customer (or at least warned about), the way the license-plate/barcode/import-hash uniqueness rules already work for other identifiers in this system.
Actual: Two distinct customers created with the identical debtorNumber; no constraint anywhere.
Root cause: shared/schema.ts:292 `debtorNumber: text("debtor_number")` has no `.unique()` at the DB level and no uniqueness check in server/routes.ts:2041-2062 (`POST /api/customers`).
Affected files: shared/schema.ts:292; server/routes.ts:2041-2062
Affected data: customer ids 1264 and 1265, both debtorNumber "AUDIT-DEB-<ts>"
Security impact: none.
Business impact: accounting/invoice reconciliation risk - two customers sharing a debtor number can misattribute payments or invoices if the debtor number is used as a lookup key anywhere downstream (e.g. import/reconciliation tooling, which the doc's fase 1a notes exists for CJIB/fines imports).
Fix (proposal only): add a partial unique index on debtorNumber (excluding null/empty), and a pre-insert check in the route returning a clear 409, matching the pattern already used for vehicle plates.
Regression test (proposal): create two customers with the same non-null debtorNumber, expect the second to be rejected (or at minimum surfaced as a warning) once this is fixed.

BUG VC-012
Severity: MEDIUM
Feature: Authorization - POST /api/migrate/customer-drivers missing permission check
Status: OPEN
Reproduction:
  Logged in as AUDIT-limiteduser (role "user", permissions ["view_vehicles","view_customers"] only - no manage_customers):
  POST /api/migrate/customer-drivers {} -> 200 {"success":true,"migrated":0,"skipped":0,...}
  (Compare: the same user gets a clean 403 "Not authorized. One of these permissions required: manage_customers" on every other customer/driver-mutating endpoint tested - POST/PATCH/DELETE customers, POST/PATCH/DELETE drivers.)
  See test-permissions.cjs step 10, out-permissions.txt.
Expected: This is a bulk write operation (creates a `drivers` row for every customer that has a `driverLicenseNumber` and no existing drivers) and should require the same manage_customers permission as every other driver-mutating route.
Actual: The route only checks `requireAuth` (any logged-in staff account, regardless of role/permissions, including cleaner/viewer/accountant-type limited accounts) - it succeeded for the limited test user. It happened to report migrated:0 in this run only because the dataset's eligible customers were already migrated by a prior run; on a fresh dataset a limited "view only" account could create real driver rows for every eligible customer.
Root cause: server/routes.ts:6572 `app.post("/api/migrate/customer-drivers", requireAuth, async (req, res) => {...})` - no `hasPermission(UserPermission.MANAGE_CUSTOMERS)` in the middleware chain, unlike every sibling driver route (6385, 6447, 6554 all use `hasPermission(UserPermission.MANAGE_CUSTOMERS)`).
Affected files: server/routes.ts:6572-6635
Affected data: none corrupted in this run (idempotent no-op on the already-migrated dataset), but see business impact.
Security impact: privilege escalation of scope - a low-privilege authenticated account (e.g. cleaner, viewer) can trigger a bulk data-creation operation intended for staff who manage customers.
Business impact: on a dataset with unmigrated customer.driverLicenseNumber values, any logged-in account (regardless of role) could bulk-create driver records, bypassing the intended manage_customers gate.
Fix (proposal only): add `hasPermission(UserPermission.MANAGE_CUSTOMERS)` to the route's middleware chain, matching the other driver routes.
Regression test (proposal): call POST /api/migrate/customer-drivers as a user without manage_customers, expect 403.

BUG VC-013
Severity: MEDIUM
Feature: File uploads - rejected files return 500 instead of 400 (and leak a stack trace outside production)
Status: OPEN
Reproduction:
  POST /api/customers/<id>/drivers (multipart) with licenseFile = a file named "malware.exe" (content-type image/png) -> 500 {"error":"Server Error","message":"This file type is not permitted for security reasons","stack":"Error: ...\n    at ... fileUploadSecurity.ts:219:23\n    at wrappedFileFilter (multer/index.js:44:7)\n..."}
  Same result (500 + stack trace) for: real PNG bytes with a ".txt" extension (fileUploadSecurity.ts:251:9), and an SVG containing an onload XSS payload.
  See test-drivers.cjs steps 4/5/9, out-drivers.txt.
Expected: A rejected upload is a client input-validation failure and should return 400 with just the message - the same clean shape the async magic-byte check (validateAfterUpload, used for the 0-byte-file case in the same test run) already returns.
Actual: The synchronous multer `fileFilter` rejection is a plain `new Error(...)` with no `.status`/`.statusCode`, so it bypasses the route's own try/catch (multer's file filter runs as middleware before the handler), reaches the global Express error handler (server/index.ts:423-435), and gets the default 500. That handler does gate the stack-trace field behind `process.env.NODE_ENV !== 'production'`, so the raw stack trace (including absolute server file paths) is only exposed in non-production environments like this audit server - but the wrong-status-code behavior (500 for a client error) is unconditional and applies in production too.
Root cause: server/utils/security/fileUploadSecurity.ts:219 and :251 (`callback(new Error(...), false)` inside `createSecureMulterFilter`, used by every upload route that calls it per the fase-1a doc, not just drivers); server/index.ts:423-435 (generic error handler defaulting to 500 for any error without an explicit status).
Affected files: server/utils/security/fileUploadSecurity.ts:200-256; server/index.ts:423-435; every route using driverLicenseUpload/createSecureMulterFilter
Affected data: none (no file was actually written for the rejected uploads).
Security impact: LOW-MEDIUM, environment-dependent - only exposes internal file paths/stack traces when NODE_ENV != 'production' (true for this audit/dev server); confirm the real deployment sets NODE_ENV=production before treating this as more than a status-code correctness bug.
Business impact: API clients/integrations that branch on status code (400 = fix your input, 500 = retry/alert ops) will mis-handle a routine "wrong file type" rejection as a server fault.
Fix (proposal only): give the Error thrown in createSecureMulterFilter a `.status = 400`, or wrap the multer middleware call so its callback errors are translated to a 400 JSON response before reaching the generic handler.
Regression test (proposal): upload a file with a disallowed extension, assert the response status is 400 (not 500) and contains no "stack" field regardless of NODE_ENV.

BUG VC-014
Severity: MEDIUM
Feature: RDW proxy - unauthenticated
Status: OPEN
Reproduction:
  curl (no cookies, no login at all) http://localhost:5001/api/rdw/vehicle/AB-123-C -> 404 {"message":"Vehicle not found",...} (a real response from the RDW lookup pipeline, not a 401)
Expected: Looking up vehicle registration data is a feature of the staff app (used when creating/editing a vehicle); it should require at least `requireAuth` the way nearly every other route in this area does.
Actual: The route has no auth/permission middleware at all and is reachable by a fully anonymous client.
Root cause: server/routes.ts:1930 `app.get("/api/rdw/vehicle/:licensePlate", async (req, res) => {...})` - no `requireAuth`/`hasPermission` in the chain (confirmed already by the fase-1a read-through; empirically confirmed here with a zero-cookie request).
Affected files: server/routes.ts:1930-1965
Affected data: none written; this is a read-only proxy.
Security impact: any anonymous visitor can use this app as a free, unauthenticated proxy to query Dutch RDW vehicle-registration data (brand/model/owner-type/APK data) for arbitrary plates, with no rate limit specific to this route and no audit trail of who queried what plate (the global auditMutations middleware only logs successful mutations under /api/*, not GET reads).
Business impact: potential abuse of the app's RDW API quota/credentials by unauthenticated third parties; no way to attribute or block abusive query patterns per-user since there's no login.
Fix (proposal only): add `requireAuth` (and arguably `hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES)`) to this route.
Regression test (proposal): call GET /api/rdw/vehicle/<any-plate> with no session cookie, expect 401.

BUG VC-015
Severity: LOW
Feature: Auth - CSRF token issued by /api/login is invalid on the very next request
Status: OPEN
Reproduction:
  curl -c jar -b jar -X POST /api/login {"username":"admin","password":"admin123"} -> 200, Set-Cookie XSRF-TOKEN=T1
  curl -c jar -b jar -X POST /api/users -H "X-CSRF-Token: T1" {...} -> 403 {"message":"Invalid CSRF token","code":"CSRF_INVALID"} (same response also rotates the cookie to T2)
  curl -c jar -b jar -X POST /api/users -H "X-CSRF-Token: T2" {...} -> 201 (works)
  Reproduced independently via Node fetch with manual cookie-jar handling (docs/audit/wip/scripts/lib-vc.cjs) - same result: the token from the login response's own Set-Cookie always fails on the immediate next mutating request; any request in between (even a GET) makes the following mutating request succeed.
Expected: Per this audit's own README-agents.md recipe ("after login the cookie XSRF-TOKEN is set; send its value as header X-CSRF-Token on every POST/PUT/PATCH/DELETE"), the token issued at login should be valid for use on the immediate next request.
Actual: It never is - one throwaway request (of any method) must happen first.
Root cause: server/auth.ts:332 `req.session.regenerate(...)` runs during the login handler; server/middleware/security/csrf.ts:100-113 `attachCsrfToken` (which computes and Set-Cookies the token, via `generateCsrfToken` at csrf.ts:14-29 which lazily creates `req.session.csrfSecret` if absent) runs as response middleware attached to the *pre-regeneration* session. `session.regenerate()` replaces the session's backing store entry, discarding `csrfSecret`, so by the time the client's next request arrives, the session no longer has the secret the token was signed with, and `verifyCsrfToken` (csrf.ts:34-58) fails.
Affected files: server/auth.ts:332 (session regenerate); server/middleware/security/csrf.ts:14-29,92-96,100-113
Affected data: none.
Security impact: none (this makes CSRF protection stricter than intended, not weaker - it's a false rejection, not a bypass).
Business impact: any API client/integration that logs in and immediately issues a mutating request (without an intervening GET) gets a spurious 403 on its first real call - this audit hit it repeatedly until working around it with a GET-based priming step; the production SPA likely never notices because it always does a GET (e.g. loading the dashboard) before the user's first mutating action.
Fix (proposal only): call `attachCsrfToken` (or re-generate+re-set the cookie) after `req.session.regenerate()` completes in the login handler, rather than relying on the middleware that ran earlier in the pipeline.
Regression test (proposal): POST /api/login, then immediately POST any mutating endpoint using the XSRF-TOKEN cookie from the login response - expect success, not CSRF_INVALID.
```

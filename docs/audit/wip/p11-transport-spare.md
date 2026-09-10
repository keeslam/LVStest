# Phase 11 — Transport & spare vehicle workflow (runtime-proven)

2026-09-10, audit server :5001, database `lvs_audit` only. Scripts: `docs/audit/wip/scripts/p11-*.cjs` (node, CommonJS; `p11-lib.cjs` wraps `lib.cjs` + `db.cjs`; each Session has its own `fakeIp` 10.11.1.x). Outputs are saved next to the scripts as `p11-*.out`. Fixtures: vehicles `AU-11A-X..AU-11K-X` (ids 1751-1761), portal customer 179 ("Klant 179 B.V.", portal user 30), rentals #3335 (vA, picked up), #3336 (vG, picked up), #3337 (vI, picked up, later deleted), #3355 (vK, booked, later cancelled). Every statement below is backed by a request/response in the `.out` files plus SQL read directly from `lvs_audit` right after the call.

Phase 3-5 (`maintenance-transport.md`, MT-001..MT-014 = BUG-004/013/014/015/031/032/033/034/039/035/036/052/037/053) already covered the staff-side maintenance/spare/transport endpoints; those are not re-filed. New defects use ids T11-001.. below.

## Tested (passed unless a T11 id is cited)

Portal-driven maintenance flow (`p11-portal.cjs` P1-P10, `p11-portal2.cjs` Q2-Q6, `p11-portal3.cjs` Q1/Q3b/Q7):

1. Customer `POST /api/portal/requests` type `maintenance` with `needsReplacement=true`, `preferredDate`, `mileage` — 201; staff `custom_notifications` row "Onderhoudsmelding AU-11A-X" written; duplicate open request → 409 `PORTAL_DUPLICATE_REQUEST`; request on another customer's reservation → 404; `preferredDate` in the past → 400.
2. Staff `POST /api/portal-requests/:id/approve` `{startDate, durationDays, category, note}` — block #3343 created with `portalRequestId`, `affectedRentalId`, `maintenanceCategory/Duration`, notes in the staff format; TBD placeholder #3344 created and clipped to the rental; `spareAssignmentDecision='spare_assigned'` on the rental; vehicle mileage raised 1000 → 1500; portal notification `maintenance_planned` (dedupe tag `maint:3343:planned:<date>`) + `request_done`; audit_logs `reservation.create` + `portal_request.reply`; block and placeholder visible in `GET /api/reservations/range`, `GET /api/reservations/upcoming-maintenance`, `GET /api/placeholder-reservations/needing-assignment`; `GET /api/portal/vehicles/mine` shows the block with `canRequestChange=true` and no placeholder leak.
3. Approve the same request twice → 400 "Request is already closed" (idempotent); approve `maintenance_change` twice → 400.
4. Staff assigns a real spare to the placeholder (`POST /api/placeholder-reservations/3344/assign-vehicle`) → placeholder becomes a real replacement on vB, vB `scheduled`, customer notification `replacement_ready` (`spare:3344:1752`), `vehicles/mine.maintenance.replacement` populated, `spare_assignment` staff notification removed.
5. Customer `maintenance_change` (48 h rule): block starting tomorrow → 400 `PORTAL_MAINTENANCE_TOO_LATE`; +2 days at 08:00 (≥48 h) → 201; +2 days with `startTime 23:00` → 201; block with `maintenanceStatus='in'` → 400 TOO_LATE; duplicate open change → 409; change on a block whose vehicle the customer does not have on the road → 404. Approving a change re-dates the block, re-dates an unassigned placeholder, fires `maintenance_moved` with the new-dates dedupe tag (P5/P6), and `durationDays` bounds (0, 61, 1.5, -1) are rejected.
6. Block status via `PATCH /api/reservations/:id` scheduled → in → out → scheduled: notifications `maintenance_in`, `maintenance_out`, then `maintenance_planned` again; repeating the same status sends nothing (dedupe works). Deleting a block fires `maintenance_cancelled`.
7. Weekend approval date → 400 `MAINTENANCE_WEEKEND`; approving after the rental was soft-deleted → 400 "Reservation not found" and the request stays `new` (can still be rejected).

Transports (`p11-transport.cjs` T1-T13, `p11-extra.cjs` X1-X6):

8. Create tow/swap/delivery transports, normal (today) and planned (+7/+10 days); spare workflow create → assigned spare reservation (`type=replacement`, `booked`, 00:00-23:59 window, linked to the picked-up rental of the original vehicle when there is one), spare vehicle `scheduled`, original vehicle `needs_service` with note "Replacement vehicle required for transport #N" when `isBreakdownOrMaintenance`.
9. Change spare (vF → vH): reservation re-pointed in place, conflict check against other reservations that day (409 for a double claim on the same day, T9); remove spare (→ TBD): reservation reverts to placeholder, `generate-report` → 400 server-side, placeholder appears in needing-assignment and can be assigned from that widget (transport `relatedVehicleId` follows); `spareRequired=false` cancels the spare reservation and clears the transport columns; re-enabling creates a fresh spare reservation.
10. Guards after pickup of the spare: changing/removing the spare → 400 "already been picked up"; `DELETE /api/transports/:id` with a picked-up spare keeps that reservation (detached, `replacementForTransportId=null`) and with a still-`booked` spare soft-deletes it and frees the vehicle; create with `relatedVehicleId == vehicleId` → 400.
11. Missing vehicle: soft-deleting (recycle bin) the spare vehicle and the original vehicle, list/GET/generate-report/complete behaviour afterwards, and restore (T11/T12 — defects in T11-004).
12. Document paths: `POST /api/delivery/transports/generate-report` rejects TBD transports (single and mixed batch) with 400 and produces a `transport_report` document for assigned/no-spare transports; the client print button (`client/src/pages/delivery/dashboard.tsx:283-293`) additionally blocks TBD client-side via `getTransportSpareStatus`; the only other client print path is the same mutation (`handlePrintTransportClick`); no `window.print` path exists for transports. Contract endpoints `GET /api/contracts/generate/:id`, `generate-default/:id`, `data/:id`, `POST generate-versioned/:id` exercised with a TBD placeholder, a customer-less transport placeholder, a maintenance block, a picked-up spare and a booked spare (defect T11-007).
13. History: no dedicated vehicle/reservation history table exists (`shared/schema.ts` tables: `audit_logs`, `deleted_records`, `portal_activity_log`, `custom_notifications`, `portal_notifications`, `email_logs`). `audit_logs` records `transport.create/update/delete`, `reservation.create/update/delete`, `placeholder-reservation.create`, `vehicle.delete`, `deleted-record.create`, `delivery.create` (report), `portal_request.reply`, `portal-request.create`; spare pickup and `spare-status` changes appear only as generic `reservation.update` rows; `portal_activity_log` records `request_submitted/request_replied` per customer. `deleted_records` snapshots only vehicles and fines.
14. Whole-DB stale-state sweep (`p11-sweep.cjs`, 25 queries) — see the table at the end.

## Not tested (why)

- Physical PDF content of the generated contract/transport PDFs (only status, content-type, byte size and the `contracts/data` JSON were inspected; no PDF text extraction in this harness).
- `delivery/estimate-distance` and `optimize-route` (external geocoding; same reason as phase 3-5).
- Portal mail delivery — `email_logs` is never written by `sendEmail(...,'custom')` (see T11-016), and the audit SMTP config points at a local stub, so delivery could not be asserted from the database.
- Authorization matrix for transports (`hasPermission(MANAGE_VEHICLES | MANAGE_RESERVATIONS)` on all mutating transport routes was read, not fuzzed with a limited user — the `view_reservations`-only user from phase 3-5 was not reused to stay within the login limiter).
- Bulk-complete partial failure (BUG-053/MT-014 already filed).
- Realtime socket payloads (covered in `socket.md`).

## Findings summary

| Severity | Count | Ids |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 7 | T11-001, 002, 003, 004, 005, 006, 007 |
| MEDIUM | 7 | T11-008, 009, 010, 011, 012, 013, 014 |
| LOW | 3 | T11-015, 016, 017 |

Top 3: T11-004 (recycle-bin delete/restore of a vehicle silently breaks the transport ↔ spare-reservation links and leaves two spare rows per transport), T11-005/T11-006 (portal maintenance-change approval and block deletion both lose track of an already-assigned spare — one duplicates it, the other deletes the wrong block's spare), T11-001/T11-002 (moving or cancelling a transport leaves the spare vehicle booked on the wrong/old day so a second transport can claim it on the real day).

---

BUG T11-001
Severity: HIGH
Feature: Planned transport — changing `scheduledDate` (`PATCH /api/transports/:id`)
Status: OPEN
Reproduction: `p11-transport.cjs` T2 and `p11-extra.cjs` X1/X3. Create a swap transport with spare (transport #51: vE original, spare vC, `scheduledDate` 2026-09-17 → spare reservation #3404 on vC 2026-09-17..17). `PATCH /api/transports/51 {"scheduledDate":"2026-09-19"}` → 200. Then `POST /api/transports {vehicleId: vK, scheduledDate: "2026-09-19", spareRequired: true, relatedVehicleId: <same spare>}`.
Expected: the spare reservation follows the transport day (or the move is refused if the spare is busy on the new day); the second transport claiming the same spare on 2026-09-19 is rejected with 409 like T9 shows for same-day claims.
Actual: transport moves to 2026-09-19, spare reservation #3404 stays on 2026-09-17 (`select start_date,end_date from reservations where id=3404` → 2026-09-17/2026-09-17; same in T2: transport #44 09-20 → 09-23, reservation #3377 stays 09-20). The second transport for the same spare on the real day returns 201 — the spare vehicle is double-booked on the transport day and needlessly blocked on a day nothing happens.
Root cause: `server/database-storage.ts:2025-2221` `applyTransportUpdate` has no branch for `changes.scheduledDate`; it only spreads `...changes` into the `vehicle_transports` update (2208-2218). The spare reservation's `startDate/endDate` are set once at creation (2148-2149) and on reassignment only `vehicleId` is touched (2089-2091).
Affected files: server/database-storage.ts (applyTransportUpdate), server/routes.ts:7438-7471
Affected data: `reservations` (type=replacement, `replacementForTransportId`) of any transport whose date was edited after creation; `vehicles.availabilityStatus` of the spare.
Security impact: none.
Business impact: the replacement car is reserved for the wrong day: it can be handed out to someone else on the transport day (double booking), and stays "scheduled" on the old day for no reason. Sweep F3 shows 0 rows now only because the affected fixtures were later cancelled/deleted during the tests.
Fix: in `applyTransportUpdate`, when `changes.scheduledDate` differs from `current.scheduledDate` and a still-`booked` spare reservation exists, re-run `checkReservationConflicts` for the new day and update the spare reservation's `startDate/endDate` in the same transaction (refuse the move if the spare is busy or already picked up).
Regression test: create transport with spare, PATCH `scheduledDate`, assert the spare reservation's dates equal the new date and that a second transport for the same spare on the new date is rejected.

---

BUG T11-002
Severity: HIGH
Feature: Cancel transport (`PATCH /api/transports/:id {"status":"cancelled"}`)
Status: OPEN
Reproduction: `p11-transport.cjs` T9 (transport #46: vE, spare vJ, 2026-09-15) and `p11-extra.cjs` X3 (transport #51). `PATCH /api/transports/46 {"status":"cancelled"}` → 200. Then `POST /api/transports {vehicleId: vK, scheduledDate: "2026-09-15", spareRequired: true, relatedVehicleId: vJ}`.
Expected: cancelling releases the spare: reservation #3380 cancelled/soft-deleted, vJ back to `available`, another transport may use vJ that day (that is exactly what `DELETE /api/transports/:id` does for a booked spare).
Actual: transport #46 `status='cancelled'`, spare reservation #3380 stays `status='booked'` with `replacement_for_transport_id=46`, vJ stays `availability_status='scheduled'`, the reservation still shows in `GET /api/reservations/range`, and the second transport is refused with 409 "Replacement vehicle has conflicting reservations for this date". Only the original vehicle's maintenance flag is reset. Re-opening (`cancelled → scheduled`) and `completed → in_progress` are also accepted (see T11-009).
Root cause: `server/database-storage.ts:2182-2201` — `closingNow` only drives `markVehicleForService(..., 'ok')`; nothing touches `spareReservationId` on `completed`/`cancelled`.
Affected files: server/database-storage.ts (applyTransportUpdate)
Affected data: `reservations` (replacement rows of cancelled transports), `vehicles.availabilityStatus` of the spare.
Security impact: none.
Business impact: every cancelled transport permanently blocks a spare car for that day until someone finds and deletes the orphan reservation by hand; the "Beheer vervangende voertuigen"/calendar keep showing a spare for a transport that will never happen.
Fix: on `status → cancelled` (and for a still-TBD placeholder also on `completed`, see T11-010) cancel or soft-delete a `booked` spare reservation inside the same transaction, mirroring the DELETE route (`server/routes.ts:7490-7504`).
Regression test: create transport with spare, cancel it, assert spare reservation is cancelled/deleted, spare vehicle `available`, and a new transport for the same spare/day succeeds.

---

BUG T11-003
Severity: HIGH
Feature: Vehicle change on a transport — same-vehicle guard on `PATCH /api/transports/:id {vehicleId}`
Status: OPEN
Reproduction: `p11-transport.cjs` T6/T7, `p11-extra.cjs` X2. Transport #51 has original vE and spare vC. `PATCH /api/transports/51 {"vehicleId": <vC id>}`.
Expected: 400 "Replacement vehicle cannot be the same as the original vehicle" (the check `POST /api/transports` and `PATCH {relatedVehicleId}` already enforce).
Actual: 200 — `vehicle_transports` row now has `vehicle_id = related_vehicle_id = 1753` and spare reservation #3404 sits on the same vehicle. From then on every `PATCH {vehicleId: <anything>}` is rejected with 400 "Replacement vehicle cannot be the same as the original vehicle" (X2 "repair via vehicleId=vE → 400"); only a call that also changes `relatedVehicleId` gets out of the state. In T6-T8 the corrupted transport #44 was then picked up and deleted: the DELETE route restored `vH` (the then-"original") instead of the real original vG, which is why vG is still `needs_service` / "Replacement vehicle required for transport #44" for a transport that no longer exists (sweep H → vehicle 1757).
Root cause: `server/database-storage.ts:2039-2041` compares `nextRelatedVehicleId` with `current.vehicleId`, never with `changes.vehicleId`.
Affected files: server/database-storage.ts (applyTransportUpdate)
Affected data: `vehicle_transports.vehicle_id/related_vehicle_id`, the spare reservation, and `vehicles.maintenance_status/note` of the true original vehicle (stale flag).
Security impact: none.
Business impact: a transport can be saved with the car replacing itself, the transport letter would name the same plate twice, and the original car's "needs service" flag is left behind permanently when that transport is later completed/deleted.
Fix: compute `nextVehicleId = changes.vehicleId ?? current.vehicleId` and compare against `nextRelatedVehicleId`; validate the same in `insertVehicleTransportSchema` refinement.
Regression test: PATCH `vehicleId` equal to the current `relatedVehicleId` → 400; PATCH `vehicleId` to a different vehicle afterwards → 200.

---

BUG T11-004
Severity: HIGH
Feature: Missing vehicle — recycle-bin delete/restore of a vehicle that is a transport's spare or original
Status: OPEN
Reproduction: `p11-transport.cjs` T11/T12. Transport #48 (original vI, spare vD, spare reservation #3381 picked up). (a) `GET /api/vehicles/<vD>/delete-impact` → `transports: 0`; `DELETE /api/vehicles/<vD>` → 200 restorable. (b) `POST /api/deleted-records/39/restore` → 200. (c) `DELETE /api/vehicles/<vI>` (the original) → 200; restore → 200.
Expected: delete-impact counts the transport that uses vD as spare; after restore the transport again points at vD / reservation #3381 exactly as before; deleting the original vehicle keeps the spare reservation's link to the transport.
Actual: (a) FK `related_vehicle_id ON DELETE SET NULL` and the hard delete of the vehicle's reservations null out `related_vehicle_id` and `spare_reservation_id` on transport #48 — the transport now reads as TBD (`GET /api/transports/48` `spareReservation` undefined), and completing it creates a brand-new TBD placeholder #3382 (`applyTransportUpdate` 2095-2173). (b) Restore re-inserts reservation #3381 (`status picked_up`, `replacement_for_transport_id=48`) and vD (`rented`), but transport #48 keeps `related_vehicle_id=null, spare_reservation_id=3382`: two spare rows for one transport, the real picked-up one no longer reachable from the transport (sweep A3 lists 3381 and 3382 as replacements with no live link). (c) Deleting vI cascades the transport row away (`vehicle_id ON DELETE CASCADE`) and sets `replacement_for_transport_id=null` on #3381 and #3382; restore re-inserts transport #48 from the snapshot with `spare_reservation_id=3382`, but the reservations' back-links stay null (sweep F8 → transport 48). `delete-impact` never mentioned any of this (`transports: 0` because it only counts `vehicle_id`).
Root cause: `server/database-storage.ts:535-618` `deleteVehicle` snapshots `vehicleTransports` by `vehicleId` only (561) and lets the FK actions (`shared/schema.ts:1573,1591,1599`, `reservations.replacement_for_transport_id` FK) silently null links on other rows; `restoreDeletedRecord` 663-722 re-inserts snapshot rows without restoring those nulled columns; `getVehicleDeleteImpact` (≈505-527) counts only `vehicle_id`.
Affected files: server/database-storage.ts (deleteVehicle, restoreDeletedRecord, delete-impact), shared/schema.ts (FK actions)
Affected data: `vehicle_transports.related_vehicle_id/spare_reservation_id`, `reservations.replacement_for_transport_id`, duplicate placeholder rows.
Security impact: none.
Business impact: after an accidental vehicle delete + restore (the exact scenario of the 2026-08-25 incident) the transport shows "TBD spare", the real handover of the spare car is invisible from the transport, and a duplicate TBD placeholder asks staff to assign a second car.
Fix: in `deleteVehicle` also snapshot (and on restore re-link) transports where the vehicle is `related_vehicle_id` and reservations linked via `spare_reservation_id`/`replacement_for_transport_id`; count them in delete-impact; consider soft-deleting vehicles instead of relying on FK cascades.
Regression test: transport with picked-up spare → delete spare vehicle → restore → assert `related_vehicle_id`, `spare_reservation_id` and the reservation back-link are identical to before and no extra placeholder exists; same for deleting the original vehicle.

---

BUG T11-005
Severity: HIGH
Feature: Portal `maintenance_change` approval with an already-assigned spare (`POST /api/portal-requests/:id/approve`)
Status: OPEN
Reproduction: `p11-portal.cjs` P4-P5. Block #3343 (2026-09-16..18) has its placeholder already filled: replacement #3344 on vB 2026-09-16..18. Customer files `maintenance_change` `{newDate: 2026-09-23, needsReplacement: true}`; staff approves `{startDate: 2026-09-23, durationDays: 2}`.
Expected: the assigned spare moves with the block (after a conflict check) or the approval is refused/flagged; one live spare per rental.
Actual: block re-dated to 2026-09-23..24, but replacement #3344 stays `booked` on vB for 2026-09-16..18 (dates with no maintenance any more; vB stays `scheduled`), and a NEW TBD placeholder #3348 for 2026-09-23..24 is created → rental #3335 has two live spares at once, one of them stale, and needing-assignment asks for a second car. The customer received `replacement_ready` for vB and then `maintenance_moved` with no word that the spare is no longer valid.
Root cause: `server/routes/portal-requests.ts:375` looks up only `placeholderSpare = true` rows; when the placeholder was already assigned (`placeholderSpare=false`) it finds none and 383-385 `ensurePlaceholderSpare` creates a new one. Nothing re-dates assigned replacements.
Affected files: server/routes/portal-requests.ts (approveMaintenanceChange 349-393, ensurePlaceholderSpare 275-299)
Affected data: `reservations` (type=replacement) for rentals whose block was moved after a spare was assigned; `vehicles.availabilityStatus` of the old spare.
Security impact: none.
Business impact: a spare car is blocked on dates it is not needed, a second one is requested for the real dates, and the customer sees contradictory notifications.
Fix: select any live replacement for the rental (assigned or placeholder); for an assigned one re-run the conflict check on the new period and update its dates (or return 409 asking staff to reassign); only create a placeholder when none exists.
Regression test: approve → assign spare → approve change; assert exactly one live replacement for the rental, dated to the new block period.

---

BUG T11-006
Severity: HIGH
Feature: Deleting a maintenance block — spare cleanup (`DELETE /api/reservations/:id`)
Status: OPEN
Reproduction: `p11-portal2.cjs` Q4/Q5. Vehicle vA has two live blocks for rental #3335: #3343 (with assigned spare #3344 on vB and placeholder #3348) and #3358 (created in P10, same dates). `DELETE /api/reservations/3358`. Second case: block #3353 (2026-09-03..04, portal-approved in the past) with placeholder #3354 for rental #3336 (rental started 2026-09-10, picked up); `DELETE /api/reservations/3353`.
Expected: deleting block #3358 removes only what belongs to #3358; block #3343 keeps its spare. Deleting #3353 removes its own placeholder #3354.
Actual: deleting #3358 soft-deletes #3344 AND #3348 — both belonged to the still-live block #3343 — so #3343 is now scheduled with no spare, `needing-assignment` is empty, and rental #3335 still says `spare_assignment_decision='spare_assigned'` (sweep I → 3335). Deleting #3353 leaves placeholder #3354 untouched (`deleted_at null`, `booked`, dates in the past) — sweep B now lists 3354 next to the two pre-existing stale placeholders 1533/1549.
Root cause: `server/routes.ts:4648-4697` — the cascade collects "affected rentals" purely by date overlap between the block and any standard rental on the vehicle (4659-4669) and then deletes every replacement of those rentals (4675-4680) regardless of which block created them; and because the overlap filter uses the rental's `startDate`, a picked-up rental that started after a (past) block is not matched, whereas `ensurePlaceholderSpare`/`clipToRental` (`portal-requests.ts:268-272`) deliberately ignores the start of a picked-up rental when creating the placeholder.
Affected files: server/routes.ts (DELETE /api/reservations/:id), server/routes/portal-requests.ts (clipToRental)
Affected data: `reservations` (replacement rows) for any vehicle with more than one block, or with a block dated before the rental start.
Security impact: none.
Business impact: deleting a duplicate/old block silently un-books the spare car of the real maintenance (customer shows up, no car), while stale placeholders keep appearing as "needs assignment" forever.
Fix: tie spares to their block (e.g. persist `affectedRentalId` + period on the block and match replacements by `replacementForReservationId` AND period, or add a `maintenanceBlockId` column on replacement rows) and cascade only those; use the same "picked_up ignores start" rule as `clipToRental`.
Regression test: two blocks on one rental, delete one → assert the other block's replacement rows are untouched; past block with placeholder on a picked-up rental → delete → placeholder deleted.

---

BUG T11-007
Severity: HIGH
Feature: Contract PDF endpoints on a TBD placeholder / maintenance block (`GET /api/contracts/generate/:id`, `GET /api/contracts/generate-default/:id`, `GET /api/contracts/data/:id`)
Status: OPEN
Reproduction: `p11-extra.cjs` X5. `GET /api/contracts/generate/3357` (TBD placeholder: `vehicle_id null`, `placeholder_spare true`, for a cancelled rental), `GET /api/contracts/generate/3382` (TBD placeholder, `customer_id null`), `GET /api/contracts/generate-default/3343` (maintenance block).
Expected: 400/409 — a contract requires a real vehicle and customer; a maintenance block is not a rental. `POST /api/contracts/generate-versioned/:id` already answers 400 "Vehicle ID and Customer ID are required" for all of these.
Actual: all return 200 `application/pdf` (~294 KB). `GET /api/contracts/data/3357` shows what is printed: `"licensePlate":"","brand":"","model":"","chassisNumber":""`, contract number `C-3357-20260910` synthesised on the fly. `generate-default/3343` additionally persists `documents` row #299 "Contract (Unsigned)" `AU11AX_contract_20260910.pdf` attached to the maintenance block (routes.ts:6040-6056). No `contractNumber` is written back to the reservation. These routes are `requireAuth` only (no permission check) and are reachable independently of the UI (no direct caller found under `client/src` for `/api/contracts/generate*`; the pickup flow generates its own contract document).
Root cause: `server/routes.ts:5451-5470` and `5963-5990` only check that the reservation exists; no guard on `type`, `placeholderSpare`, `vehicleId`, `customerId` — unlike `generate-versioned` (5798) which validates both ids.
Affected files: server/routes.ts (contracts/generate, generate-default, data)
Affected data: `documents` (bogus "Contract (Unsigned)" rows on blocks/placeholders), generated PDFs on disk.
Security impact: low — any authenticated staff account can mint a blank contract PDF carrying a plausible contract number.
Business impact: a signed-looking contract with empty plate/vehicle fields, or one attached to a maintenance block, can be handed out or filed as if it were real; contradicts the spec's "no document while the vehicle is TBD" rule that `generate-report` enforces.
Fix: refuse (400) when `reservation.type !== 'standard' && !== 'replacement'`, when `placeholderSpare` or `vehicleId`/`customerId` is null; share the guard with `generate-versioned`; add a permission check consistent with other document routes.
Regression test: call the three GET endpoints on a placeholder and on a maintenance block → assert 400 and no `documents` row created.

---

BUG T11-008
Severity: MEDIUM
Feature: Change original vehicle of a transport (`PATCH /api/transports/:id {vehicleId}`)
Status: OPEN
Reproduction: `p11-extra.cjs` X1. Transport #51 (breakdown, original vE flagged `needs_service` "…transport #51", spare vC, reservation #3404 notes "Replacement vehicle for AUDIT P11 TransportOriginal (AU-11E-X)"). `PATCH /api/transports/51 {"vehicleId": <vK>}` → 200.
Expected: vE's maintenance flag is cleared, vK gets flagged, the spare reservation's notes/`replacementForReservationId`/customer are recomputed for the new original.
Actual: `vehicle_id` changes to vK; vE keeps `needs_service` + "Replacement vehicle required for transport #51"; vK stays `ok`; reservation #3404 still says it replaces AU-11E-X; `GET /api/transports/51` reports vehicle AU-11K-X with a spare reservation note naming AU-11E-X.
Root cause: `server/database-storage.ts:2025-2221` has no handling for `changes.vehicleId` (only spread into the update at 2210); breakdown flag logic (2180-2201) keys off `current.vehicleId`.
Affected files: server/database-storage.ts (applyTransportUpdate)
Affected data: `vehicles.maintenance_status/note` of old and new original, `reservations.notes/replacement_for_reservation_id/customer_id` of the spare.
Security impact: none.
Business impact: wrong car stays marked as needing service, the right one is not, and the transport letter/calendar name the wrong "replaced" vehicle.
Fix: on `vehicleId` change: restore the old vehicle (`markVehicleForService(old,'ok')` when flagged by this transport), flag the new one when `isBreakdownOrMaintenance`, and refresh the spare reservation's `notes`, `replacementForReservationId` and `customerId` using the same lookup as creation (2124-2170).
Regression test: change `vehicleId` on a breakdown transport with a spare; assert flags moved and the spare reservation references the new original.

---

BUG T11-009
Severity: MEDIUM
Feature: Transport status transitions and `completedDate`
Status: OPEN
Reproduction: `p11-transport.cjs` T1/T9, `p11-extra.cjs` X3. `PATCH /api/transports/43 {"status":"garbage_status"}`; sequence `in_progress → completed → scheduled → cancelled → completed`; `PATCH /api/transports/46 {"status":"completed"}` without `completedDate`; `completed → in_progress`.
Expected: `status` limited to `scheduled | in_progress | completed | cancelled` (schema comment `shared/schema.ts:1602`), a transition table (at least no reopen of completed/cancelled without an explicit action), and `completedDate` set server-side when completing.
Actual: every value is accepted (200, `status='garbage_status'` / `'bogus'` persisted), every transition is allowed, and `completed_date` stays null unless the client sends it (the dashboard does, `dashboard.tsx:237-243, 316-321`; API callers do not — sweep F7: 2 completed transports with null `completed_date`). A transport with an unknown status disappears from the barcode lookup `getActiveTransportByVehicle` (only `scheduled/in_progress`, database-storage.ts:1975-1986) and from the spare cleanup queries.
Root cause: `insertVehicleTransportSchema` uses plain `text` for status (shared/schema.ts:1602) and `routes.ts:7445` parses `partial()` with no enum/transition check; `applyTransportUpdate` only reacts to `completed/cancelled` for the maintenance flag.
Affected files: shared/schema.ts, server/routes.ts (PATCH /api/transports/:id), server/database-storage.ts (applyTransportUpdate)
Affected data: `vehicle_transports.status/completed_date`.
Security impact: none.
Business impact: inconsistent reporting (completed without date), transports that can be re-opened after closure without undoing the side effects of closing (T11-002), and free-text statuses that no filter recognises.
Fix: `z.enum([...])` for status; a small transition table like `VALID_RESERVATION_TRANSITIONS`; set `completedDate = today` when moving to `completed` and clear it when leaving.
Regression test: PATCH status `'bogus'` → 400; completed → scheduled → 400 (or explicit reopen route); completing without `completedDate` sets it.

---

BUG T11-010
Severity: MEDIUM
Feature: Completing a transport whose spare is still TBD
Status: OPEN
Reproduction: `p11-extra.cjs` X4 (and `p11-transport.cjs` T11 for the create-on-complete variant). Transport #53 (vF, `spareRequired=true`, no spare) → placeholder #3406. `PATCH /api/transports/53 {"status":"completed","completedDate":"2026-09-10"}` → 200. Then `GET /api/placeholder-reservations/needing-assignment?daysAhead=1` and `POST /api/placeholder-reservations/3406/assign-vehicle {vehicleId: vB}`.
Expected: closing the transport closes the TBD placeholder (or the completion is refused while a required spare is TBD); a closed transport's placeholder is not assignable.
Actual: placeholder #3406 stays `booked` and is still listed for assignment; assigning a vehicle returns 200, books vB for the day and writes `related_vehicle_id` onto the COMPLETED transport. In T11 (transport #48, links nulled by the vehicle delete) completing the transport even CREATED a new placeholder #3382 (`applyTransportUpdate` 2095-2173 runs on every update, including `status=completed`). Transport-created placeholders also never get the `spare_assignment` staff notification that reservation-created ones get (`custom_notifications` empty for #3406), so nothing reminds staff of them except the widget.
Root cause: `server/database-storage.ts:2095-2173` (placeholder creation not gated on status), 2182-2201 (no placeholder close-out on completion), `assignVehicleToPlaceholder` 3020-3060 (no check on the linked transport's status), `getPlaceholderReservationsNeedingAssignment` 2940-2950 (no filter on the linked transport).
Affected files: server/database-storage.ts
Affected data: `reservations` placeholder rows of completed transports; `vehicle_transports.related_vehicle_id` of closed transports.
Security impact: none.
Business impact: stale "needs spare" reminders after the transport is over; a real car can be booked for a transport that already happened.
Fix: on `completed`/`cancelled` cancel a still-TBD placeholder; skip placeholder creation when `changes.status` closes the transport; in `assignVehicleToPlaceholder` reject when the linked transport is completed/cancelled; filter closed transports out of needing-assignment.
Regression test: TBD transport → complete → assert placeholder cancelled, not in needing-assignment, assign-vehicle → 4xx.

---

BUG T11-011
Severity: MEDIUM
Feature: "Cancel spare" while TBD (`PATCH /api/transports/:id {"spareRequired":false}`) and the placeholder widget
Status: OPEN
Reproduction: `p11-transport.cjs` T5. Transport #44 with TBD placeholder #3378. `PATCH {"spareRequired":false}` → 200 (reservation #3378 → `status cancelled`, still `placeholder_spare=true`). `GET /api/placeholder-reservations/needing-assignment?daysAhead=60` → still lists #3378 with `status: 'cancelled'`. `POST /api/placeholder-reservations/3378/assign-vehicle {vehicleId: vJ}` → 200.
Expected: a cancelled placeholder is not offered for assignment and cannot be assigned; the transport keeps `spareRequired=false`.
Actual: the cancelled placeholder is listed and assignable; after assignment the transport reads `related_vehicle_id = vJ, spare_required = false, spare_reservation_id = null` (contradictory: `getTransportSpareStatus` says `not_required` while a vehicle is filled in) and reservation #3378 is a `cancelled` row that now carries a vehicle.
Root cause: `getPlaceholderReservationsNeedingAssignment` (`database-storage.ts:2940-2950`) filters on `placeholderSpare/vehicleId/deletedAt` only, not `status`; `assignVehicleToPlaceholder` (3020-3060) likewise, and it writes `relatedVehicleId` to the linked transport without checking `spareRequired`.
Affected files: server/database-storage.ts
Affected data: `reservations` (cancelled placeholders), `vehicle_transports.related_vehicle_id`.
Security impact: none.
Business impact: staff can "assign" a car to a spare that was explicitly cancelled, ending with a transport that shows a replacement car but no spare requirement/reservation.
Fix: add `status = 'booked'` to both queries; when turning the spare off, also set `placeholderSpare=false` (or soft-delete the placeholder as DELETE does); guard `assignVehicleToPlaceholder` on the transport's `spareRequired`.
Regression test: spare off while TBD → needing-assignment excludes it; assign-vehicle → 4xx.

---

BUG T11-012
Severity: MEDIUM
Feature: Portal maintenance approval — date/rental-state validation (`POST /api/portal-requests/:id/approve`, `POST /api/portal/requests`)
Status: OPEN
Reproduction: `p11-portal.cjs` P8/P9. (a) approve request #586 with `startDate: "2026-09-03"` (a week in the past, weekday) → 200. (b) customer files a `maintenance` request on rental #3355 while it is only `booked`; staff cancels the rental (`PATCH /status cancelled`); approve → 200.
Expected: (a) 400 — a maintenance date in the past cannot be planned (the customer form and `preferredDate` check already enforce "today or later"); (b) 400 — no maintenance/spare for a rental that is not booked/picked up (the customer never has this car).
Actual: (a) block #3353 2026-09-03..04 and placeholder #3354 created in the past, customer notified "Onderhoud gepland … op 2026-09-03", placeholder listed as needing assignment; (b) block #3356 + placeholder #3357 created for the cancelled rental, `spare_assignment_decision='spare_assigned'` written onto a cancelled reservation (sweep J → 3357).
Root cause: `server/routes/portal-requests.ts:307-346` only validates the weekend rule and `rental.vehicleId`; no `startDate >= today`, no `rental.status` check; `POST /api/portal/requests` (portal.ts) accepts `maintenance` on `booked` rentals although `vehicles/mine` is defined as picked-up only.
Affected files: server/routes/portal-requests.ts (approveMaintenance), server/routes/portal.ts (request creation)
Affected data: past-dated blocks/placeholders; replacement rows for cancelled rentals.
Security impact: none.
Business impact: stale reminders and misleading customer notifications; a spare requirement for a customer who has no car.
Fix: reject `startDate < today` (and optionally `< tomorrow` like the form); reject when the rental is not `booked`/`picked_up`; on rental cancellation/deletion, cancel open maintenance requests or at least block approval (the deleted-rental case already returns 400).
Regression test: approve with yesterday's date → 400; cancel rental then approve → 400.

---

BUG T11-013
Severity: MEDIUM
Feature: Change original vehicle of a picked-up rental that has a portal maintenance block/spare (`PATCH /api/reservations/:id {vehicleId}`)
Status: OPEN
Reproduction: `p11-portal3.cjs` Q7. Rental #3335 (picked up on vA) has block #3343 (`affectedRentalId=3335`, `portalRequestId=583`) and had spares. `PATCH /api/reservations/3335 {"vehicleId": <vC>}` → 200.
Expected: a warning/decision (the block, its spares and the customer's "Onderhoud gepland" all concern vA which the customer no longer drives), or the block is re-keyed/cancelled with a customer notification.
Actual: rental moves to vC; block #3343 stays on vA (`availability_status` of vA becomes `available` although a scheduled block exists — same class as BUG-033); `GET /api/portal/vehicles/mine` no longer shows any maintenance for the customer; the customer's `maintenance_change` on block #3343 now returns 404 "Maintenance not found"; no notification of any kind. The block and any spare stay bound to `affectedRentalId=3335` whose vehicle is now different (sweep L would catch this state; it was reverted at the end of Q7).
Root cause: the generic `PATCH /api/reservations/:id` path (routes.ts ~3445+) has no awareness of `affectedRentalId`/`portalRequestId` on blocks; `findPortalCustomerForBlock` (portal-maintenance-events.ts:34-44) and `vehicles/mine` are keyed by vehicle only.
Affected files: server/routes.ts (PATCH /api/reservations/:id), server/services/portal-maintenance-events.ts
Affected data: `reservations` blocks/replacements with `affectedRentalId` pointing at a rental now on another vehicle.
Security impact: none.
Business impact: customer keeps a "maintenance on 28-09" notification for a car they returned, cannot change it, and staff see a block with a spare for a rental that is on a different car.
Fix: when a rental's `vehicleId` changes and live blocks/replacements reference it, return a `needsDecision`-style 409 (like `needsSpareVehicle`) or cancel/re-key them and fire `maintenance_cancelled`.
Regression test: rental with linked block → change vehicle → assert either 409 or block cancelled + notification.

---

BUG T11-014
Severity: MEDIUM
Feature: Transport delete is a hard delete with no recycle-bin entry
Status: OPEN
Reproduction: `p11-transport.cjs` T8. `DELETE /api/transports/44` (breakdown transport whose spare #3379 had been picked up) → 204; `select * from vehicle_transports where id=44` → no row; `GET /api/deleted-records` → no entry for the transport; reservation #3379 stays `picked_up` with `replacement_for_transport_id=null`.
Expected: consistent with vehicles/fines, a restorable snapshot in `deleted_records` (or a soft delete), so a transport with a real handover on record can be recovered and the spare reservation keeps its origin.
Actual: the row is gone (`deleteTransport` `db.delete`, database-storage.ts:2005-2008; "No deletedAt column on this table", 1972-1974); only `audit_logs` `transport.delete` with the id remains; the picked-up spare reservation loses the reference to the transport that caused it.
Root cause: no soft-delete/snapshot for `vehicle_transports`; `restoreDeletedRecord` supports only `vehicle` and `fine` (637-645).
Affected files: server/database-storage.ts (deleteTransport, restoreDeletedRecord), server/routes.ts:7473-7520
Affected data: `vehicle_transports`, `reservations.replacement_for_transport_id`.
Security impact: none (route requires MANAGE_VEHICLES/RESERVATIONS).
Business impact: an accidental delete of a transport with a car already handed over is unrecoverable and untraceable from the reservation side (the 2026-08-25 incident was this class of problem for vehicles).
Fix: snapshot the transport (and its spare reservation link) into `deleted_records` before deleting, or add `deletedAt` and filter it like reservations.
Regression test: delete transport → `deleted_records` has an entry → restore re-creates it with the spare link.

---

BUG T11-015
Severity: LOW
Feature: `PATCH /api/vehicles/:id/maintenance-status` vs. the linked maintenance block / portal hook
Status: OPEN
Reproduction: `p11-portal3.cjs` Q3b. vA has scheduled block #3343 (portal request #583). `PATCH /api/vehicles/<vA>/maintenance-status {"status":"in_service","note":"…"}` → 200; then `{"status":"ok"}`.
Expected (spec `2026-09-06-portal-vehicles-maintenance-design.md` §4 lists this route as a hook call site "when it changes the linked block's status"): the scheduled block moves to `in` (and back to `out`/`scheduled`) and the customer gets `maintenance_in`/`maintenance_out`.
Actual: only `vehicles.maintenance_status/note` change; block #3343 stays `scheduled`; no portal notification; the vehicle reads `in_service` while its calendar block says "scheduled" and the customer keeps `canRequestChange=true`. The body also uses `status`, while the earlier phase's assumption `maintenanceStatus` is rejected — undocumented.
Root cause: `server/routes.ts:1240-1273` calls `markVehicleForService` only; no lookup of the vehicle's active block, no `onMaintenanceBlockChanged`.
Affected files: server/routes.ts
Affected data: `vehicles.maintenance_status` vs `reservations.maintenance_status` drift.
Security impact: none.
Business impact: two sources of truth for "in the workshop"; the customer is not told the car is in.
Fix: when the vehicle has an active block, update that block's `maintenanceStatus` through the same path as `PATCH /api/reservations/:id` (which fires the hook), or drop the route in favour of the block status.
Regression test: vehicle with scheduled block → maintenance-status `in_service` → block `in` and one `maintenance_in` notification.

---

BUG T11-016
Severity: LOW
Feature: Portal maintenance/replacement mails have no log
Status: OPEN
Reproduction: after 20+ maintenance events for customer 179 (portal settings `portal_enabled=true`, `emailForMOT` set) `select count(*) from email_logs` → 0 (table completely empty in `lvs_audit`); `p11-portal.cjs` prints `email_logs since start []` after every step.
Expected: an `email_logs` row (or equivalent) per attempted `portal_maintenance` mail, so staff can see whether the customer was mailed.
Actual: `sendMaintenanceMail` → `sendEmail(..., 'custom')` (`server/utils/email-service.ts:302`) returns a boolean and never writes `email_logs`; the only writers of `email_logs` are the APK/maintenance-reminder routes (`server/routes/notifications.ts:338,447`, `routes/email-logs.ts:63`). Failures are only `console.error`ed (`portal-maintenance-events.ts:92,117`).
Root cause: as above.
Affected files: server/utils/email-service.ts, server/services/portal-mail.ts
Affected data: none (missing audit trail).
Security impact: none.
Business impact: no way to prove/see that a customer was informed of planned maintenance or a ready spare.
Fix: log every portal mail attempt (template, recipient, result) to `email_logs`.
Regression test: trigger `maintenance_planned` → one `email_logs` row with template `portal_maintenance`.

---

BUG T11-017
Severity: LOW
Feature: `POST /api/delivery/transports/generate-report` with an unknown `templateId`
Status: OPEN
Reproduction: `p11-extra.cjs` X5: `{"transportIds":[46],"templateId":999999}` → 201, document #303 created with the default layout.
Expected: 404 "Template not found" (the contract endpoints answer 404 for an unknown `templateId`).
Actual: silently falls back to the default template.
Root cause: `server/routes.ts:7696-7698` `templateId ? getTransportReportTemplate(templateId) : getDefault…` — an undefined result is passed on without a check.
Affected files: server/routes.ts
Affected data: `documents` (report generated with a layout the user did not choose).
Security impact: none.
Business impact: minor — a deleted/renamed template yields a letter in the wrong layout without warning.
Fix: return 404 when the requested template does not exist.
Regression test: unknown `templateId` → 404, no document row.

---

## Verification matrix (workflow × checks)

Legend: OK = verified correct; id = defect; n/a = not applicable. Checks: original vehicle state / spare reservation / transport row / history (audit_logs, notifications) / duplicates / stale state.

| Workflow | Original vehicle | Spare reservation | Transport | History | Duplicates | Stale |
|---|---|---|---|---|---|---|
| Normal transport (tow, no spare) T1 | OK (`available`, `ok`) | n/a | status free-text, no completedDate → T11-009 | transport.create/update logged | OK | OK |
| Planned transport with spare T2/X1 | OK (`needs_service` + note) | created, linked to picked-up rental | OK | logged | OK | date move leaves spare on old day → T11-001 |
| Vehicle replacement / change spare T3 | OK | re-pointed in place | OK | logged | OK | vF stayed `scheduled` until sync (transient) |
| Spare vehicle TBD → assigned (widget) T4 | OK | placeholder → real | `relatedVehicleId` follows | placeholder-reservation.create | OK | OK |
| Original vehicle maintenance (block in/out) Q2/Q3b | vehicle status not derived (BUG-033) / T11-015 | untouched (correct) | n/a | portal notifs in/out/planned | OK | OK |
| Spare reservation via portal approve P2/P4 | OK | placeholder clipped, then assigned | n/a | audit + portal notifs + staff notif | OK (repeat approve → 400) | OK |
| Change spare after portal change P5 | OK | assigned spare NOT moved, new TBD → T11-005 | n/a | moved notif only | 2 live spares → T11-005 | old spare stale → T11-005 |
| Remove spare (→TBD) T4 / spareRequired=false T5 | OK | reverted / cancelled | OK | logged | cancelled rows accumulate (acceptable) | cancelled TBD still assignable → T11-011 |
| Cancel spare via transport cancel T9/X3 | OK (flag reset) | stays booked → T11-002 | status cancelled | logged | — | spare vehicle blocked → T11-002 |
| Change original vehicle (transport) X1/X2 | flags not moved → T11-008 | notes/links stale → T11-008 | can equal spare → T11-003 | logged | — | orphaned `needs_service` note on vG (sweep H) → T11-003 |
| Change original vehicle (rental with portal block) Q7 | vA `available` despite block | untouched | n/a | no notification → T11-013 | — | block bound to rental on other car → T11-013 |
| Vehicle change on transport day (booked / picked_up) T8 | OK | change refused after pickup (OK) | delete → hard delete → T11-014 | transport.delete only | — | picked-up spare detached |
| TBD vehicle: generate-report / print T4, T11, X4/X5 | n/a | n/a | 400 server + client guard (OK) | delivery.create | — | completed transport keeps TBD placeholder → T11-010 |
| TBD vehicle: contract PDF X5 | n/a | blank-vehicle PDF → T11-007 | n/a | document row on a block → T11-007 | — | — |
| Pickup status (spare picked up) T8/X6 | OK | `picked_up`, `spareVehicleStatus` follows | API `spareReservation.status` OK | reservation.update only (no dedicated action) | — | OK |
| Printing / PDF preview (transport report) T2/X5 | n/a | n/a | 201 + document | delivery.create | — | unknown template → default → T11-017 |
| Missing vehicle (spare deleted/restored) T11 | OK | hard-deleted then restored unlinked → T11-004 | links nulled → TBD → T11-004 | vehicle.delete, deleted-record.create | 2 spare rows for one transport → T11-004 | orphan picked-up spare (sweep A3) |
| Missing vehicle (original deleted/restored) T12 | restored | back-link lost → T11-004 | cascaded away, restored | logged | — | sweep F8 |
| Block delete cascade Q4/Q5 | OK | other block's spares deleted / past placeholder kept → T11-006 | n/a | maintenance_cancelled notif | — | sweep B (3354), I (3335) |
| Approve past / cancelled rental P8/P9 | OK | past placeholder / placeholder for cancelled rental → T11-012 | n/a | planned notif for past date | — | sweep J (3357) |
| Overlapping approved blocks P10 | OK | placeholder reused (no dup) | n/a | planned notif for 2nd block | 2 blocks same dates → BUG-053 | — |

## Re-confirmed existing bugs (new evidence only)

- **BUG-033 (MT-008)** — block status changes never reach `vehicles`: block #3343 `in`/`out` leaves vA `availability_status='rented', maintenance_status='ok'` (Q2); portal-approved blocks likewise; after the rental moved to vC, vA became `available` with a scheduled block on it (Q7).
- **BUG-053 (MT-013)** — overlapping blocks: the portal approve path (`approveMaintenance`, portal-requests.ts:320) creates a second block on the same vehicle/dates without any check (P10: #3343 and #3358, both `affectedRentalId=3335`), while `approveMaintenanceChange` (line 360) does check — inconsistent. Sweep M: 46 overlapping live block pairs in the whole database.
- **BUG-014 (MT-003)** — block deletion leaves a replacement behind: variant Q5 (past block before the rental start) reproduces it through the portal-created placeholder #3354; the generic cascade is analysed in T11-006.
- **BUG-032 (MT-006)** — two live spares for one rental: sweep K still lists rental #3236 (ids 3237/3238) from phase 3-5; T11-005 shows the portal path creating the same shape.
- **BUG-015 (MT-004)** not re-tested. **BUG-035 (MT-010)** not hit.
- **Status values outside the state machine** (phase 3-5 "additional evidence"): portal `createMaintenanceBlock` also inserts `status='active'` (block rows #3343, #3353, #3356, #3358); sweep E: `active`=263, `pending`=3, plus `confirmed`=3, `scheduled`=4, `in`=1, `garbage`=1 (the last from the MT-012 repro) — the earlier report counted 264 (`active`+`pending`); the other values were not broken out then.
- **BUG-034 (MT-009) class**: `audit_logs` `reservation.create` rows with `resource_id=null` are written for `POST /api/reservations type=maintenance_block` (ids 2152-2155) because that route answers `{needsSpareVehicle:true}` without the created id; noted here for the history question, not re-filed.

## Stale-state sweep (`p11-sweep.cjs`, `p11-sweep.out`) and diff with phase 3-5 item 7

| Check | Phase 3-5 | Now | Notes |
|---|---|---|---|
| A replacements whose original rental is deleted/missing | 1 (3221) | 1 (3221) | unchanged (BUG-014) |
| A2 replacements pointing at a missing transport | — | 0 | FK `set null` hides these (see F8) |
| A3 live replacements with neither rental nor transport link | — | 3 (3369, 3381, 3382) | 3381/3382 from T11-004; 3369 pre-existing |
| B TBD placeholders past their end date | 2 (1533, 1549) | 3 (+3354) | T11-006/T11-012 |
| C vehicles in service without an active block/transport | 0 | 0 | |
| D `out` blocks whose vehicle is still in service | 0 | 0 | |
| E reservation status outside the machine | 264 | 275 (active 263, confirmed 3, garbage 1, in 1, pending 3, scheduled 4) | broken out per value |
| F open transports with deleted/cancelled spare | — | 0 | |
| F2 cancelled transports with a booked spare | — | 0 | #46 was re-opened during T9; T11-002 reproducible on demand |
| F3 spare reservation date ≠ transport date | — | 0 | affected rows cancelled/deleted during tests (T11-001) |
| F4 `vehicle_id = related_vehicle_id` | — | 0 | repaired in X2 (T11-003) |
| F7 completed transports without `completed_date` | — | 2 | T11-009 |
| F8 transport → spare whose back-link differs | — | 1 (transport 48) | T11-004 |
| H vehicles flagged for a transport that is gone/closed | — | 1 (1757 vG) | T11-003 consequence |
| I live rentals `spare_assigned` without a live spare | — | 1 (3335) | T11-006 |
| J live spares for a cancelled/completed rental | — | 2 (1503 pre-existing, 3357) | T11-012 |
| K rentals with >1 live spare | — | 1 (3236: 3237/3238) | BUG-032 |
| M overlapping live block pairs on one vehicle | — | 46 | BUG-053 |
| P vehicles `scheduled` with no live future reservation | — | 20 (ids 168, 414, 295, 357, 160, 102, 189, 13, 165, 475, 317, 492, 175, 126, 203, 141, 92, 166, 291, 231) | pre-existing production data; availability sync gap (not this phase) |

## Scripts

- `p11-lib.cjs` (helpers), `p11-setup.cjs` (fixtures), `p11-explore.cjs` (baseline queries)
- `p11-portal.cjs` / `.out` — portal flow P1-P10
- `p11-portal2.cjs` / `.out` — block status, block delete cascade (Q2-Q6)
- `p11-portal3.cjs` / `.out` — 48 h boundary, vehicle maintenance-status, rental vehicle change (Q1, Q3b, Q7)
- `p11-transport.cjs` / `.out` — transports T1-T13 (status, planned, change/remove/cancel spare, same-vehicle, pickup, missing vehicle, history)
- `p11-extra.cjs` / `.out` — clean transport X1-X3, TBD completed X4, PDF paths X5, history X6
- `p11-sweep.cjs` / `.out` — whole-DB sweep
- `p11-ids.json` — fixture ids

Fixtures were left in place (`AUDIT-`/`AU-11x-X`), no application code modified, nothing committed. None of this phase's requests returned a 5xx or a connection error; `/health` answered OK before the sweep (uptime 290 s at 10:16 UTC, i.e. the server had been restarted shortly before, outside this phase's requests — not attributable to any call made here).

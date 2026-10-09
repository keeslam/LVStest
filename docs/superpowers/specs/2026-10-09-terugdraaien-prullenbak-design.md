# Reversals, picked-up cancellation, recycle bins per kind with purge, one-call maintenance completion — design (sub-project C)

Date: 2026-10-09. Branch: `fix/audit-remediation` (base `4e5f2496` = `main` after sub-project B).
Implements the owner's decisions B-30, B-33, B-36, B-37 and B-38, and the approval B-39
(`docs/audit/besluiten.md`). The facts this design rests on are in the controller workspace
`.superpowers/sdd/2026-10-09-terugdraaien-prullenbak/facts-*.md` (git-ignored); every
file:line there must be verified against the code before it is relied on.

## Background

- A role is a label. Role `admin` bypasses every check (`server/middleware/permissions.ts`);
  every other account has an explicit `permissions` array. Role `manager` has no treatment
  anywhere. Adding a `UserPermission` value needs no DDL (`users.permissions` is jsonb).
- Reversals exist only on `PATCH /api/reservations/:id/status` (guard `manage_reservations`,
  `allowReversion`): picked_up→booked, returned→picked_up, completed→picked_up|booked. They clear
  reservation fields but never touch the vehicle's odometer or fuel level, never mark the generated
  contract or damage check, never ask a confirmation, and `completed→booked` leaves pickup and return
  data on the row. Undoing a cancellation is impossible. Several UI buttons revert with a single
  click and without a permission wrapper.
- A picked-up rental can be cancelled or deleted today by anyone with `manage_reservations`,
  without a warning. Deletion is a soft delete (`reservations.deletedAt`) with a `deleted_records`
  row; confirmation texts still say "permanent".
- `deleted_records` holds five kinds (vehicle, customer, reservation incl. maintenance blocks,
  transport, fine). One shared dialog under Voertuigen lists them all for role `admin` only
  (`requireAdmin` on `GET /api/deleted-records` and the restore route); the fines table has a
  filtered instance. No purge route exists (BUG-150); files on disk are never removed.
- Completing a maintenance block is three client calls with three different rights
  (`POST /api/documents` needs `manage_documents`, `PATCH /api/vehicles/:id` needs
  `manage_vehicles`, `POST /api/reservations/:id/complete-maintenance` accepts
  `manage_maintenance`); a failure halfway leaves the upload and the vehicle changes behind.

## Decisions (owner, 2026-09-21 … 2026-10-09)

- B-30: undoing a pickup, a return and a cancellation is allowed for admin and manager, with a
  per-account checkbox for others; vehicle status and mileage go back too; a reading that would go
  DOWN needs an explicit confirmation.
- B-33: cancelling or deleting a picked-up rental is allowed for admin and manager, per-account
  checkbox for others, with a warning that the rental has been picked up; deleting goes through the
  recycle bin.
- B-36: separate recycle bins per kind, each screen its own (Voertuigen, Klanten, Reserveringen,
  Onderhoud with its own label, Transporten, Boetes).
- B-38: emptying per item, per selection or all, admin and manager only; the bins are visible to
  admin and manager.
- B-37: completing maintenance may include APK date, APK document and mileage, also without
  `manage_vehicles`/`manage_documents`; one action.
- B-39 (approval of this design): three new rights granted once to every account with role
  manager; a cancellation is undone to picked_up when the rental had been picked up, else to booked,
  only when the vehicle is still free for the period; purge also removes files that no other live
  record uses.

## Non-goals

- No change to any other guard; no new behaviour for the customer portal.
- No automatic reopening of spares, transports or driver assignments closed by a cancellation or
  a deletion (the preview says so).
- No retention policy for the bins; no deletion of audit rows.
- The six parked desk-review questions stay parked.

## 1. Three new rights

`UserPermission` (`shared/schema.ts`) gains, in this order after `authorize_mileage_decrease`:

| value | Dutch label (`shared/permission-labels.ts`) | grants |
|---|---|---|
| `revert_handover` | Overdracht terugdraaien | undo pickup, return, cancellation (§2) |
| `cancel_picked_up_rental` | Opgehaalde huur annuleren of verwijderen | cancel/delete a picked-up rental (§3) |
| `manage_recycle_bin` | Prullenbak beheren | see, restore and empty every bin (§4, §5) |

- Role `admin` passes as always. The users dialog shows the new checkboxes automatically
  (`Object.values(UserPermission)`); the manual's §15.4 table gets three rows.
- One-time grant: a hand-written, idempotent step in `startup-migration.js` (marker in
  `app_settings`, pattern of `grantDocumentPermissions`) adds the three values to every user with
  `role = 'manager'` that lacks them; admins are skipped; logs the count; never aborts. Mirror
  script under `scripts/` as before.
- Narrowing, by decision: reversions and picked-up cancellation/deletion no longer work with
  `manage_reservations` alone; the bins open for `manage_recycle_bin` instead of `requireAdmin`
  (`GET /api/deleted-records`, restore, purge). `fix-i-permission-matrix` keeps passing because the
  guards are `hasPermissionMiddleware`.
- E2E: the `manager` profile receives the values automatically (`without(...)`); the `admin`
  profile has `ALL`. No other profile gets them. The server test helper's admin bypasses anyway.

## 2. Reversal engine (B-30)

### 2.1 Readings before a handover (new columns, additive)

`reservations` gains `vehicle_mileage_before_pickup integer`, `vehicle_fuel_before_pickup
text`, `vehicle_mileage_before_return integer`, `vehicle_fuel_before_return text` (nullable, no
default). `pickupReservation` and `returnReservation` write them inside their transaction from the
vehicle row they already lock (`currentMileage`, `currentFuelLevel`). The manifest
(`schema-columns.json`, regenerated by the build) carries the columns to production; nothing else
is needed.

### 2.2 Routes and service

- `GET /api/reservations/:id/revert-preview` and `POST /api/reservations/:id/revert`, both
  `hasPermission(REVERT_HANDOVER)`. Body of the POST: `{ confirmMileageDecrease?: boolean }`.
  The target status is not chosen by the client; it follows from the row (§2.3). The POST also
  carries `planHash`, the hash the preview returned; a missing or different hash is refused with
  409 `REVERT_PLAN_CHANGED` carrying the current plan, so a stale confirmation can never perform
  an undo the user did not see (ratified 2026-10-09).
- `server/services/reservation-revert.ts`: a pure `planRevert(reservation, vehicle,
  laterHandovers, documents)` that returns the plan, and `applyRevert(id, actor, options)` that
  runs the plan in one transaction with `FOR UPDATE` on the reservation and the vehicle. The
  preview route returns `planRevert`'s result; the POST route re-plans inside the transaction and
  refuses if the plan changed (409 `REVERT_PLAN_CHANGED`).
- Plan shape: `{ fromStatus, toStatus, clears: string[], vehicle: { current: {mileage, fuel},
  restoreTo: {mileage, fuel} | null, reason?: "no_reading_stored" | "later_handover" },
  documentsToMarkStale: {id, documentType}[], requiresMileageConfirmation: boolean, warnings:
  string[] (codes), blocked?: { code, message } }`.

### 2.3 Rules

| from (normalised) | to | reservation fields cleared | vehicle | documents marked stale |
|---|---|---|---|---|
| picked_up | booked | actualPickupDate, pickupMileage, fuelLevelPickup, contractNumber, (replacement rows) spareVehicleStatus back to `assigned` | restore to before-pickup readings | the unsigned contract(s) of this reservation |
| returned, completed (returned via a return) | picked_up | actualReturnDate, returnMileage, fuelLevelReturn, fuelCost, fuelCardNumber, fuelNotes, completionDate, (replacement rows) spareVehicleStatus back to `picked_up` | restore to before-return readings | the return damage check(s) of this reservation |
| completed with no return data (closed by hand) | booked if never picked up, else picked_up | completionDate (+ the rows above when going to booked) | as the row reached | as the row reached |
| cancelled | picked_up when `actualPickupDate` is set, else booked | nothing | nothing | nothing |

- Undoing a cancellation requires the vehicle to be bookable for the period excluding this
  reservation (`isVehicleBookable`); otherwise `blocked` with 409 `VEHICLE_NOT_FREE`. Closed
  spares/transports/assignments are not reopened: warning `cascade_not_reopened`.
- Vehicle readings are restored only when this reservation's handover is the vehicle's latest
  mileage write: no other reservation on the same vehicle has an `actualPickupDate` or
  `actualReturnDate` later than this one's. Otherwise the vehicle is left alone with reason
  `later_handover`. Dates are calendar days, so a same-day handover on another reservation counts
  as later (physical order: an undone return is blocked by another rental's pickup the same day;
  an undone pickup is not blocked by a same-day return of an earlier rental). This errs on the
  side of leaving the odometer alone (ratified 2026-10-09). A missing before-reading (rows from before this change) leaves the vehicle
  alone with reason `no_reading_stored`.
- If `restoreTo.mileage < current.mileage`, `requiresMileageConfirmation` is true and the POST
  must carry `confirmMileageDecrease: true`, else 409 `MILEAGE_DECREASE_CONFIRMATION_REQUIRED`
  with both numbers. This is a confirmation, not the `authorize_mileage_decrease` password flow.
- The B-16 shifted `startDate`/`totalPrice` stay (the agreed period); the `[PICKUP]`/`[RETURN]`
  note lines stay; a line `[TERUGGEDRAAID <date> <user>] <from> → <to>` is appended.
- Documents are never deleted: `isStale = true`, `staleReason = "handover reverted"` through the
  registry's existing supersede fields.
- After the transaction: `recomputeVehicleAvailability`, usage-period sync, realtime event,
  portal notice (`onReservationChangedByStaff`), audit `reservation.revert` carrying the plan.
- `PATCH /api/reservations/:id/status` no longer accepts reversions (`allowReversion` removed
  there; the spare-status flow keeps its own use). A reversion attempt there answers 400
  `USE_REVERT_ROUTE`. Existing tests move to the new route. The engine's own target table
  (`RESERVATION_REVERT_TARGETS`) is separate from `RESERVATION_REVERSIONS`, which the spare-status
  flow still uses (ratified 2026-10-09).

### 2.4 Client

One `RevertHandoverDialog` (`client/src/components/reservations/revert-handover-dialog.tsx`,
`data-testid="dialog-revert-handover"`): loads the preview, lists in plain Dutch what will happen
(status, fields, vehicle odometer "van X naar Y" or why not, documents marked as vervallen,
warnings), shows `checkbox-confirm-mileage-decrease` when required, `button-confirm-revert`
disabled until the required checkbox is ticked. Openers (`button-revert-handover`, wrapped in
`RequiresPermission anyOf={[REVERT_HANDOVER]}`): the reservation view dialog in the calendar, the
reservation list dialog, the dashboard quick-status button, the vehicle details quick button and the
completed-rentals list. `StatusChangeDialog`, `QuickStatusChangeButton`'s own dialog and the
hover-card revert are replaced by this dialog; no reversal happens anywhere without the preview
and the confirm button. Texts nl + en.

## 3. Cancelling or deleting a picked-up rental (B-33)

- Server: when the existing status normalises to `picked_up`, `PATCH /api/reservations/:id/status
  { status: "cancelled" }`, the edit form's cancellation through `PATCH /api/reservations/:id`, and
  `DELETE /api/reservations/:id` require `hasPermission(CANCEL_PICKED_UP_RENTAL)` (checked in the
  route after the normal guard) and the body/query flag `confirmPickedUp: true`; without the flag:
  409 `PICKED_UP_CONFIRMATION_REQUIRED { actualPickupDate, contractNumber }`; without the right:
  403 naming the right. Rows in any other status keep today's behaviour. The same check sits on `PATCH /api/reservations/:id/basic`, the fourth writer that
  can set cancelled. Maintenance blocks are exempt: a block was never at a customer, even when a
  legacy spelling normalises to picked_up (ratified 2026-10-09).
- Client: `CancelReservationDialog` and every delete confirmation (calendar, view dialog, list
  dialog, completed list) show, for a picked-up row, a warning box "Deze huur is al opgehaald op
  <datum> met contract <nr>." with `checkbox-confirm-picked-up`; the confirm button stays disabled
  until ticked; the opener is wrapped in `RequiresPermission anyOf={[CANCEL_PICKED_UP_RENTAL]}` for
  picked-up rows and in `MANAGE_RESERVATIONS` otherwise. Confirmation texts that say "permanent" or
  "kan niet ongedaan worden" become "wordt naar de prullenbak verplaatst; terugzetten kan via
  Prullenbak". The cancellation of a picked-up rental does not revert the vehicle; the dialog says
  the car counts as available afterwards and the odometer keeps the pickup reading.

## 4. Recycle bins per kind (B-36)

- `deleted_records.entityType` gains `maintenance_block`: `softDeleteReservation` writes it when
  the row's type is `maintenance_block` (label "Onderhoud #id — plate start"); the restore
  dispatcher treats it like `reservation`. A hand-written idempotent migration step relabels
  existing rows whose `payload->'reservation'->>'type' = 'maintenance_block'` (marker in
  `app_settings`).
- `GET /api/deleted-records?type=<kind>` filters server-side (kinds: vehicle, customer,
  reservation, maintenance_block, transport, fine); without `type` it answers as today. Cap 200
  per kind, newest first, restored rows included (badge).
- One `RecycleBinDialog` (`client/src/components/recycle-bin/recycle-bin-dialog.tsx`, the current
  `DeletedVehiclesDialog` generalised and moved; the old file re-exports until its callers are
  gone) takes `kind` and shows that kind's title, columns and labels; the maintenance kind shows
  "Onderhoud". Openers, one per screen, wrapped in `RequiresPermission anyOf={[MANAGE_RECYCLE_BIN]}`:
  Voertuigen `button-open-recycle-bin` (exists; filter to vehicle), Klanten
  `button-open-recycle-bin-customers`, Reserveringen `button-open-recycle-bin-reservations`,
  Onderhoud `button-open-recycle-bin-maintenance`, Transporten `button-open-recycle-bin-transports`,
  Boetes `button-fines-bin` (exists). i18n per kind nl + en; `describeCounts` prints readable names
  instead of raw keys.
- Restore stays as it is, now behind `manage_recycle_bin`.

## 5. Emptying a bin (B-38)

- Routes, `hasPermission(MANAGE_RECYCLE_BIN)`: `DELETE /api/deleted-records/:id` (one row) and
  `POST /api/deleted-records/purge` with body `{ ids: number[] }` or `{ entityType, all: true }`.
  Response `{ purged: number, failed: {id, code, message}[] }`. Every purge writes an audit row
  `<entityType>.purge` with the label and what was removed.
- `server/services/recycle-bin-purge.ts`, one transaction per record:
  - already restored (`restoredAt` set): only the bin row is deleted;
  - `reservation` / `maintenance_block`: the soft-deleted `reservations` row is hard-deleted after
    its dependants: `interactive_damage_checks` rows (NO ACTION FK) with their files, `documents`
    rows of the reservation with their files, `scan_events.reservation_id` and
    `fiscal_assessments.reservation_id` set to null, the self-links on other reservations
    (`replacement_for_reservation_id`, `maintenance_block_id`, `affected_rental_id`,
    `recurring_parent_id`) set to null; CASCADE/SET NULL FKs do the rest;
  - `vehicle`, `customer`, `fine`, `transport`: rows are already gone; files referenced from the
    snapshot (`documents.filePath`, `expenses.receiptFilePath`, `reservations.damageCheckPath`,
    delivery-task photo/signature paths, `drivers.licenseFilePath`, portal attachment paths,
    `fines.letterFilePath`) are deleted after the commit, each only when the path resolves under the
    uploads directory and no live row in any of those tables references the same path; then the
    bin row is deleted.
  - File removal is best effort after the commit; a failure is logged and reported in `failed`
    without undoing the row purge.
- Client: checkboxes `checkbox-deleted-record-${id}`, per-row `button-purge-${id}`,
  `button-purge-selected`, `button-purge-all`; one confirm dialog `dialog-confirm-purge` naming the
  count and the kind, `button-confirm-purge`; after a purge the list and the affected screens'
  queries are invalidated. A purged customer's debtor number is free again by construction (the bin
  lookup no longer finds a row).

## 6. One-call maintenance completion (B-37)

- `POST /api/reservations/:id/complete-maintenance` accepts multipart (`apkFile` optional) and
  JSON; fields `completionDate` (required), `maintenanceCategory`, `notes`, `currentMileage?`,
  `apkDate?`. Guard unchanged (`MANAGE_MAINTENANCE` or `MANAGE_RESERVATIONS`).
- `completeMaintenance` runs everything in one transaction: the block closes as today; the
  vehicle gets `apkDate` (when given), `currentMileage` (refused with 400
  `MILEAGE_LOWER_THAN_CURRENT { current, given }` when lower than the vehicle's current reading;
  no override), and `lastServiceDate`/`lastServiceMileage` when the category is
  `scheduled_maintenance`; the APK file becomes a `documents` row (`documentType "APK
  Inspection"`, `vehicleId`, `reservationId` = the block, description with the date) written
  before the commit and unlinked when the transaction fails. The response carries the block, the
  vehicle fields written and the document id.
- Client: the completion dialog sends one request (FormData when a file is chosen) and no
  longer calls `POST /api/documents` or `PATCH /api/vehicles/:id`; one error path, nothing half
  done; the `button-complete-maintenance` button is wrapped in `RequiresPermission anyOf={[MANAGE_MAINTENANCE, MANAGE_RESERVATIONS]}`.
- Known limit, unchanged: the maintenance calendar's lists need `view_reservations` (or
  `manage_reservations`) and vehicle view rights to show anything; B-37 only removes the three-rights
  problem of the completion itself. The E2E `maintenance` profile gets `view_reservations` so a
  completion story can run as that profile; documented in `docs/e2e/README.md`.

## 7. Migrations

Additive columns through the manifest (§2.1). Hand-written idempotent steps in
`startup-migration.js`, each behind an `app_settings` marker, never aborting on existing data:
(a) grant the three rights to role manager (§1); (b) relabel maintenance-block bin rows (§4).
`drizzle-kit push` (E2E, local) picks the columns up from `shared/schema.ts`.

## 8. Tests

- Server: reversal plan (pure) and route per row of the table in §2.3, including the latest-handover
  rule, the missing-reading case, the confirmation 409, the cancelled→booked conflict, the stale
  documents, the audit row, and 403 for `manage_reservations` without `revert_handover`; the
  `/status` route refusing reversions; picked-up cancel/delete (409 without flag, 403 without right,
  200 with both, warning data in the 409 body); bins per kind (type filter, maintenance label,
  relabel migration run twice, 403 for a manager-less account, 200 for `manage_recycle_bin`); purge
  per kind (bin row gone, dependants gone, files gone only when unreferenced, restored rows,
  selection and all, audit rows); one-call completion (manage_maintenance-only account completes
  with APK + mileage + file; lower mileage 400 leaves nothing changed; failure rolls back the file);
  migration steps idempotent on lvs_fixtest.
- Client: the four dialogs (revert, cancel/delete warning, recycle bin with purge, completion)
  with permission gating and the disabled-until-ticked rules; the bin dialog per kind.
- E2E: registry entries for every new opener (dialog coverage baseline unchanged or lowered);
  Layer B: desk edge cases (revert a pickup with the mileage confirmation; cancel a picked-up rental
  with the warning); tail specs: bins (delete → bin → restore, delete → purge, for reservations and
  customers; purge frees the debtor number) and the maintenance completion story as the
  `maintenance` profile. Budgets stated per story. `retries: 0`, guards untouched.

## 9. Manual and records

`docs/gebruikershandleiding/`: 05 (terugdraaien, annuleren van een opgehaalde huur), 07 (afronden
in één handeling; the contradiction about the workshop status corrected), 10 and 15 (three rights;
bins for manager; §15.3/§15.4 tables), 02/04/12 (the bin is per screen and can be emptied),
13/14 where reversals are mentioned. `docs/audit/besluiten.md` gets "Uitgevoerd" lines under
B-30, B-33, B-36, B-37, B-38; the regression report rows for BUG-132 and BUG-150 get a dated
closure note. `docs/e2e/README.md` describes the new specs and the profile change.

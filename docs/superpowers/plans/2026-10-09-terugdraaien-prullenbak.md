# Reversals, picked-up cancellation, recycle bins with purge, one-call maintenance completion (sub-project C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new per-account rights; a reversal engine that undoes a pickup, a return or a cancellation with a preview, vehicle readings restored and a confirmation when the odometer would go down; a warning plus right for cancelling or deleting a picked-up rental; one recycle bin per screen with purge; completing maintenance in one transaction.

**Architecture:** Rights stay explicit values in `users.permissions` (role `admin` bypasses, role `manager` gets the three new values once by a startup step). Reversals become a pure plan (`planRevert`) applied in one transaction by a dedicated route; `/status` stops accepting reversions. The recycle bin becomes one kind-aware dialog fed by `GET /api/deleted-records?type=`, with a purge service that removes rows, dependants and unreferenced files. Maintenance completion moves its three writes into `completeMaintenance`'s transaction.

**Tech Stack:** Express 4, Drizzle/PostgreSQL, zod, multer; React 18, TanStack Query, wouter, shadcn/ui, i18next; vitest (server with database, client jsdom); Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md` — binding; read it first. Facts with file:line (verify before relying): `.superpowers/sdd/2026-10-09-terugdraaien-prullenbak/facts-reversals-rights.md`, `facts-bins.md`, `facts-maintenance.md`.

## Global Constraints

- Business rules only as the spec states them; nothing else changes in workflow. Guards: the three narrowings of spec §1 and nothing more; role `admin` always passes (`hasPermission`).
- No screen may show the red toast "Kon de gegevens niet laden", the error boundary or an endless spinner for any profile.
- User-visible text only through i18next in `client/src/locales/nl` AND `en`; server messages English; the client branches on `code`, never on English text.
- Database: schema changes in `shared/schema.ts`; new columns reach production through the manifest (`npm run schema:export` regenerates `schema-columns.json`; commit it when `git diff --ignore-cr-at-eol -- schema-columns.json` shows exactly the new columns and nothing else); every hand-written step in `startup-migration.js` is idempotent, behind an `app_settings` marker where it is a one-time data change, and never aborts on existing data (check, warn, skip).
- Server tests only with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false`. Client: `npx vitest run --project client`. Types: `npx tsc --noEmit -p . && npx tsc --noEmit -p e2e`.
- E2E: `retries: 0`; never loosen `e2e/support/guards.ts`; no allowlist entry without a written reason; port 5010/5011 and database `lvs_e2e` shared, one Playwright run at a time; `npm run e2e:coverage` must not raise the unreached count (`e2e/registry/coverage-baseline.json`); every new opener gets a registry entry; the desk story's budgets change only where a task says so.
- TDD: failing test first, RED shown, then GREEN, in the task report.
- Code and comments in English, matching the surrounding style; a short "why" comment where a rule is not obvious. Commit messages: Dutch Conventional Commits, scopes `(rechten)`, `(reserveringen)`, `(prullenbak)`, `(onderhoud)`, `(e2e)`, `(docs)`, written with a bash heredoc ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; `git add` explicit paths only; never `.claude/launch.json`; never push.
- Report per task: `.superpowers/sdd/2026-10-09-terugdraaien-prullenbak/task-N-report.md` with file:line, verbatim test summary lines, commits, concerns, status DONE | DONE_WITH_CONCERNS | BLOCKED.

---

### Task 1: the three rights, the bin guard, the manager grant

**Files:**
- Modify: `shared/schema.ts` (`UserPermission`), `shared/permission-labels.ts`, `server/routes.ts` (`GET /api/deleted-records`, `POST /api/deleted-records/:id/restore`: `requireAdmin` → `hasPermission(UserPermission.MANAGE_RECYCLE_BIN)`), `startup-migration.js` (new step `grantManagerRightsC()` called where `grantDocumentPermissions` is called), `scripts/migrate-manager-rights-c.ts` (mirror of `scripts/migrate-document-permissions.ts`), `e2e/seed/users.ts` (profile `maintenance` gains `VIEW_RESERVATIONS`; `manager` gets the three values through `without(...)` automatically — assert it in the test), `e2e/registry/dialogs.ts` (the vehicles bin entry: `anyOf: [P.MANAGE_RECYCLE_BIN]`, drop `hiddenWithoutRight` once the opener is wrapped in Task 6 — leave a comment now).
- Test: `server/__tests__/c-01-rights.test.ts`, extend `client/src/components/dialogs/__tests__/users-dialog*.test.tsx` (or create `users-dialog-new-rights.test.tsx`).

**Interfaces:**
- Produces: `UserPermission.REVERT_HANDOVER = "revert_handover"`, `UserPermission.CANCEL_PICKED_UP_RENTAL = "cancel_picked_up_rental"`, `UserPermission.MANAGE_RECYCLE_BIN = "manage_recycle_bin"`; labels "Overdracht terugdraaien", "Opgehaalde huur annuleren of verwijderen", "Prullenbak beheren"; marker key `migration:c_manager_rights`.

- [ ] Write the failing server test: the three values exist in `Object.values(UserPermission)` and have a Dutch label; a user with role `manager` and empty permissions gets exactly the three values after `grantManagerRightsC()` runs (run it twice: second run changes nothing, marker set); an `admin` is skipped; a `user` role is untouched; `GET /api/deleted-records` answers 403 for `manage_reservations` only, 200 for `manage_recycle_bin`, 200 for admin; restore likewise. RED.
- [ ] Implement the enum values, labels, the guard change, the migration step and the mirror script. GREEN.
- [ ] Client test: the users dialog renders the three new checkboxes with their labels. Run `npx vitest run --project client`, both `tsc`, `server/__tests__/fix-i-permission-matrix.test.ts`, `wave12-document-permissions.test.ts`, `b-15-recycle-bin.test.ts`, `fines-routes.test.ts`.
- [ ] Commit `feat(rechten): …` (+ `test(e2e)` for the seed change).

### Task 2: readings before a handover

**Files:**
- Modify: `shared/schema.ts` (reservations: `vehicleMileageBeforePickup: integer("vehicle_mileage_before_pickup")`, `vehicleFuelBeforePickup: text("vehicle_fuel_before_pickup")`, `vehicleMileageBeforeReturn: integer("vehicle_mileage_before_return")`, `vehicleFuelBeforeReturn: text("vehicle_fuel_before_return")`), `server/database-storage.ts` (`pickupReservation`, `returnReservation`: write the four values from the locked vehicle row inside the transaction), `schema-columns.json` (regenerated).
- Test: `server/__tests__/c-02-handover-readings.test.ts`.

**Interfaces:**
- Produces: the four nullable columns; Task 3 reads them.

- [ ] Failing test: after a pickup, the reservation row carries the vehicle's readings from before the pickup; after a return, the before-return readings; rows picked up before this change (insert a row with the columns null) stay null. RED.
- [ ] Implement; run `npm run schema:export`; check `git diff --ignore-cr-at-eol -- schema-columns.json` shows only the four columns. GREEN; run `fix-h-state-machine.test.ts`, `b-16-early-pickup.test.ts`, `wave14-screen-truth.test.ts`; `npx tsc --noEmit -p .`.
- [ ] Commit `feat(reserveringen): …` including `schema-columns.json`.

### Task 3: the reversal engine (server)

**Files:**
- Create: `server/services/reservation-revert.ts`, `shared/revert-codes.ts` (codes `MILEAGE_DECREASE_CONFIRMATION_REQUIRED`, `VEHICLE_NOT_FREE`, `REVERT_PLAN_CHANGED`, `USE_REVERT_ROUTE`, `INVALID_STATUS_TRANSITION`; warning codes `cascade_not_reopened`, `no_reading_stored`, `later_handover`).
- Modify: `server/routes.ts` (new `GET /api/reservations/:id/revert-preview`, `POST /api/reservations/:id/revert`, both `hasPermission(UserPermission.REVERT_HANDOVER)`, registered before `/:id` routes; `PATCH /api/reservations/:id/status` no longer passes `allowReversion` and answers 400 `{ code: "USE_REVERT_ROUTE" }` for a reversion), `server/services/lifecycle.ts` (export `RESERVATION_REVERSIONS` extended with `cancelled: ["booked", "picked_up"]` for the engine only), `server/middleware/audit.ts` (`SELF_LOGGED` for the revert route if it logs itself).
- Test: `server/__tests__/c-03-revert.test.ts`; update `wave14-screen-truth.test.ts` and `fix-h-state-machine.test.ts` to the new route.

**Interfaces:**
- Produces: `planRevert(input: { reservation: Reservation; vehicle: Vehicle | null; laterHandoverExists: boolean; documents: Document[]; vehicleFreeForPeriod: boolean }): RevertPlan` (pure) and `applyRevert(reservationId: number, actor: { username, userId }, options: { confirmMileageDecrease: boolean }): Promise<{ ok: true; plan: RevertPlan; reservation: Reservation } | { ok: false; status: 400|403|404|409; code: string; message: string; plan?: RevertPlan }>`. `RevertPlan` exactly as spec §2.2. Route bodies: preview → `RevertPlan`; POST → `{ plan, reservation }` or `{ code, message, ...details }`.

- [ ] Failing tests (one per row of spec §2.3 plus the rules): picked_up→booked clears the four fields and restores the vehicle readings and marks the unsigned contract stale; completed(returned)→picked_up clears the six return fields + completionDate, restores before-return readings, marks the damage check stale; completed→booked by hand clears everything needed; cancelled→picked_up when `actualPickupDate` set, else →booked; cancelled with the vehicle no longer free → 409 `VEHICLE_NOT_FREE`; a later handover on the same vehicle → vehicle untouched, reason `later_handover`; null before-readings → untouched, reason `no_reading_stored`; restoreTo < current → 409 `MILEAGE_DECREASE_CONFIRMATION_REQUIRED` without the flag, 200 with it; `manage_reservations` without the right → 403; `/status` with a reversion → 400 `USE_REVERT_ROUTE`; availability recomputed; audit row `reservation.revert` exists; the `[TERUGGEDRAAID …]` note line appended. RED.
- [ ] Implement the service and routes. GREEN. Run `fix-h-state-machine.test.ts`, `wave14-screen-truth.test.ts`, `opt-008-spare-status.test.ts`, `fix-x-cascade.test.ts`, `fix-y-audit.test.ts`; `npx tsc --noEmit -p .`.
- [ ] Commit `feat(reserveringen): …` (tests may be a separate `test(reserveringen)` commit).

### Task 4: the reversal dialog (client + E2E)

**Files:**
- Create: `client/src/components/reservations/revert-handover-dialog.tsx` (+ `__tests__/revert-handover-dialog.test.tsx`).
- Modify: the openers listed in spec §2.4 (`client/src/pages/reservations/calendar.tsx` view dialog + completed list + hover card, `client/src/components/reservations/reservation-list-dialog.tsx`, `reservation-quick-status-button.tsx`, `client/src/components/vehicles/quick-status-change-button.tsx`, `client/src/components/dashboard/vehicle-reservations-status-dialog.tsx`), delete or reduce `status-change-dialog.tsx` to a re-export, `client/src/locales/{nl,en}/reservations.json`, `e2e/registry/dialogs.ts` (opener `button-revert-handover` on `/reservations`, `anyOf: [P.REVERT_HANDOVER]`, `allowedPathNeedsState`), `e2e/layer-b/desk/edge-cases.spec.ts` (new Story: pickup, then revert with the mileage confirmation, vehicle shows beschikbaar and the odometer is back; budget stated).

**Interfaces:**
- Consumes: Task 3's preview/POST shapes and codes.
- Produces: `RevertHandoverDialog({ reservationId, open, onOpenChange, onReverted })`; test ids `dialog-revert-handover`, `checkbox-confirm-mileage-decrease`, `button-confirm-revert`, `button-revert-handover`.

- [ ] Failing client tests: preview rendered in Dutch (status from→to, cleared fields, "van X naar Y" or the reason it stays, documents vervallen, warnings); confirm disabled until the checkbox when required; POST carries the flag; 409 codes shown as Dutch sentences; opener disabled with the reason without `revert_handover`. RED → implement → GREEN.
- [ ] Replace every opener; delete the single-click paths. `npx vitest run --project client`, both `tsc`, `npm run e2e:coverage`, `npm run e2e:b`.
- [ ] Commit `feat(reserveringen): …` and `test(e2e): …`.

### Task 5: cancelling or deleting a picked-up rental

**Files:**
- Modify: `server/routes.ts` (`PATCH /:id/status` cancelled branch, `PATCH /:id` cancellation, `DELETE /:id`: the picked-up check from spec §3 with `hasPermission`-style right check returning 403 naming the right and 409 `PICKED_UP_CONFIRMATION_REQUIRED { actualPickupDate, contractNumber }` without `confirmPickedUp`), `client/src/components/reservations/cancel-reservation-dialog.tsx`, the delete confirmations (`calendar.tsx` ConfirmDialog, `reservation-view-dialog.tsx`, `reservation-list-dialog.tsx`, completed list), `client/src/locales/{nl,en}/reservations.json` (warning texts; the three "permanent/kan niet ongedaan" texts), `e2e/layer-b/desk/edge-cases.spec.ts` (Story: cancel a picked-up rental: warning visible, checkbox, cancelled; a `user`-profile attempt shows the greyed opener).
- Test: `server/__tests__/c-05-picked-up-cancel.test.ts`, client tests for the dialog and one delete confirmation.

**Interfaces:**
- Produces: body flag `confirmPickedUp: boolean` (status PATCH and `/:id` PATCH), query `?confirmPickedUp=true` on DELETE; code `PICKED_UP_CONFIRMATION_REQUIRED`; test ids `checkbox-confirm-picked-up`, `warning-picked-up`.

- [ ] Failing server tests: booked row cancels as today; picked_up row: 403 without the right, 409 without the flag (body carries the pickup date and contract number), 200 with both; same three for DELETE and for the `/:id` cancellation; the deleted row is in the bin. RED → implement → GREEN; run `fix-x-cascade.test.ts`, `b-15-recycle-bin.test.ts`, `c-03-revert.test.ts`.
- [ ] Client tests (warning box, disabled confirm, flag sent, texts); openers wrapped per spec §3. `npx vitest run --project client`, both `tsc`, `npm run e2e:b`.
- [ ] Commit `feat(reserveringen): …`, `test(e2e): …`.

### Task 6: recycle bins per kind

**Files:**
- Modify: `server/database-storage.ts` (`softDeleteReservation` writes `entityType: 'maintenance_block'` and label "Onderhoud #id — plate start" for blocks; `getDeletedRecords(limit, entityType?)`; restore dispatcher accepts `maintenance_block`), `server/routes.ts` (`GET /api/deleted-records?type=`), `startup-migration.js` (step `relabelMaintenanceBlockBinRows()` with marker `migration:c_bin_maintenance_label`), `shared/schema.ts` (comment on entityType), `client/src/components/recycle-bin/recycle-bin-dialog.tsx` (new, from `deleted-vehicles-dialog.tsx`; `kind` prop; readable `describeCounts`), `client/src/components/vehicles/deleted-vehicles-dialog.tsx` (re-export), openers on `client/src/pages/vehicles/index.tsx` (wrap in `RequiresPermission anyOf={[MANAGE_RECYCLE_BIN]}`, kind vehicle), `client/src/pages/customers/index.tsx`, `client/src/pages/reservations/calendar.tsx`, `client/src/pages/maintenance/calendar.tsx`, `client/src/pages/delivery/dashboard.tsx`, `client/src/components/fines/fines-table.tsx` (gate by the right instead of `isAdmin`), locales (`recycleBin.*` per kind nl + en), `e2e/registry/dialogs.ts` (six entries, `anyOf: [P.MANAGE_RECYCLE_BIN]`), `e2e/seed/data.ts` only if a seeded deleted row is needed for the registry openers (prefer `allowedPathNeedsState: false`: the dialog opens empty).
- Test: `server/__tests__/c-06-bins-per-kind.test.ts`, `client/src/components/recycle-bin/__tests__/recycle-bin-dialog.test.tsx` (replaces `recycle-bin-types.test.tsx`).

**Interfaces:**
- Produces: `GET /api/deleted-records?type=vehicle|customer|reservation|maintenance_block|transport|fine` (cap 200, newest first); `RecycleBinDialog({ kind, open, onOpenChange })`; test ids `button-open-recycle-bin`, `button-open-recycle-bin-customers`, `button-open-recycle-bin-reservations`, `button-open-recycle-bin-maintenance`, `button-open-recycle-bin-transports`, `button-fines-bin`, rows `deleted-record-${id}`, `button-restore-${id}`.

- [ ] Failing server tests: a deleted block lands with `entityType maintenance_block` and the Onderhoud label and restores; `?type=` filters; the relabel step converts old rows and is idempotent; a `manage_recycle_bin` account lists, a `manage_reservations`-only account gets 403. RED → implement → GREEN; run `b-15-recycle-bin.test.ts`, `b-14-vehicle-delete.test.ts`, `fix-x-cascade.test.ts`, `fines-routes.test.ts`.
- [ ] Client tests per kind (title, labels, restore enabled, maintenance shows "Onderhoud"); openers greyed without the right. `npx vitest run --project client`, both `tsc`, `npm run e2e:coverage`, `npm run e2e:a`.
- [ ] Commit `feat(prullenbak): …`, `test(e2e): …`.

### Task 7: emptying a bin

**Files:**
- Create: `server/services/recycle-bin-purge.ts`, `server/__tests__/c-07-purge.test.ts`, `e2e/layer-b-tail/recycle-bin/bins.spec.ts`.
- Modify: `server/routes.ts` (`DELETE /api/deleted-records/:id`, `POST /api/deleted-records/purge`, both `hasPermission(UserPermission.MANAGE_RECYCLE_BIN)`), `server/middleware/audit.ts` (`SELF_LOGGED`), `client/src/components/recycle-bin/recycle-bin-dialog.tsx` (+ test), locales, `e2e/registry/dialogs.ts` (confirm dialog `dialog-confirm-purge` via `button-purge-all`, `allowedPathNeedsState`), `docs/e2e/README.md`.

**Interfaces:**
- Produces: `purgeDeletedRecords(ids: number[], actor): Promise<{ purged: number; failed: { id, code, message }[] }>`, `purgeAllOfKind(entityType, actor)`; routes as spec §5; test ids `checkbox-deleted-record-${id}`, `button-purge-${id}`, `button-purge-selected`, `button-purge-all`, `dialog-confirm-purge`, `button-confirm-purge`.

- [ ] Failing server tests, per kind: bin row gone; reservation/maintenance_block: the reservation row and its documents, damage checks, driver assignments are gone, self-links on other rows nulled, scan events kept with null reservation; vehicle/customer/fine/transport: files under the uploads dir listed in the snapshot are gone when unreferenced and kept when a live row references the same path, a path outside the uploads dir is never touched; restored rows: only the bin row goes; selection and `all` for one kind; audit rows `<kind>.purge`; 403 without the right; a purged customer's debtor number can be used again. RED → implement → GREEN; run `b-15`, `b-14`, `b-35-debtor-number.test.ts`, `fix-x-cascade.test.ts`, `fix-g-atomic-transitions.test.ts`.
- [ ] Client: selection, three buttons, confirm with count, invalidation; tests. Tail spec (as `manager`, with the CSRF helper): delete a seeded-free customer and a reservation through the UI → each in its own bin → restore one → purge the other → gone; create a customer with the purged debtor number → saved. Budget stated. `npx vitest run --project client`, both `tsc`, `npm run e2e:coverage`, whole `npm run e2e`.
- [ ] Commit `feat(prullenbak): …`, `test(e2e): …`.

### Task 8: one-call maintenance completion

**Files:**
- Modify: `server/routes.ts` (`POST /api/reservations/:id/complete-maintenance` with the upload middleware for field `apkFile`, body parsing for JSON and multipart), `server/database-storage.ts` (`completeMaintenance(id, input: { completionDate, maintenanceCategory?, notes?, currentMileage?, apkDate?, apkFile?: { path, originalName, size, mimeType }, actor })` doing everything in one transaction, unlinking the file on failure), `server/storage.ts` (interface), `client/src/pages/maintenance/calendar.tsx` (the dialog sends one request; `button-complete-maintenance` wrapped), locales, `e2e/registry/dialogs.ts` (`button-complete-*` is per-event: register the dialog with `allowedPathNeedsState`), new `e2e/layer-b/maintenance/complete-maintenance.spec.ts` (Story as the `maintenance` profile: schedule a block on a seeded vehicle, complete it with APK date, mileage and a small PDF; the vehicle shows the new APK date and mileage; the document is listed; budget stated), `docs/e2e/README.md`.
- Test: extend `server/__tests__/opt-015-complete-maintenance.test.ts` (or new `c-08-complete-maintenance.test.ts`), client test for the dialog's single request.

**Interfaces:**
- Produces: response `{ reservation, vehicle: { apkDate, currentMileage, lastServiceDate, lastServiceMileage }, documentId: number | null }`; code `MILEAGE_LOWER_THAN_CURRENT { current, given }`.

- [ ] Failing server tests: a `manage_maintenance`-only account completes with APK date + mileage + file in one call: block closed, vehicle updated, document row with `reservationId` and the file on disk; lower mileage → 400 with the code and nothing changed (no document, no file); a forced failure after the file write leaves no file; JSON body without a file still works; `view_vehicles`-only → 403 (existing). RED → implement → GREEN; run `opt-015`, `opt-006-availability-owner.test.ts`, `wave13-return-from-service.test.ts`, `wave13-scan-end-maintenance.test.ts`, `fix-v-spare-cascade.test.ts`.
- [ ] Client: one request, one error path, wrapped button; test. `npx vitest run --project client`, both `tsc`, `npm run e2e:coverage`, `npm run e2e:b`.
- [ ] Commit `feat(onderhoud): …`, `test(e2e): …`.

### Task 9: manual, records, final verification

- [ ] `docs/gebruikershandleiding/`: chapters 05, 07, 10, 15 (§15.3 and §15.4 tables; the "zesentwintig" count corrected), 02, 04, 12, 13, 14 per spec §9, in the owner's voice; `docs/audit/besluiten.md` "Uitgevoerd" lines under B-30, B-33, B-36, B-37, B-38 with the commit range; `docs/audit/10-phase-36-regressierapport.md` dated closure notes for BUG-132 and BUG-150; `docs/e2e/README.md`.
- [ ] Final verification, summary lines verbatim in the report: full `DATABASE_URL=… DATABASE_SSL=false npx vitest run`, both `tsc`, `npm run e2e:coverage`, `npm run e2e` twice (log the whole output to a file; a wait loop must stop on the exit code, not on a failure marker).
- [ ] Commit `docs(…)`.

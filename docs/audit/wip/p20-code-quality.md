# Phase 20 — Code quality & architecture (static analysis)

Read-only static analysis, 2026-09-11, commit `9825c29a` (branch `feat/customer-portal`).
No application code was modified; nothing was committed.

**Prior work reused, not repeated** (cited rather than re-derived):
`docs/audit/01a-api-en-autorisatie.md` (auth model, endpoint gaps),
`01b-frontend-en-werkprocessen.md` (page sizes, workflow duplication),
`01c-documenten-mail-backup-jobs.md` §"Dubbele implementaties" (7 duplicate pairs),
`01d-domein-en-data-integriteit.md` (status machines, 5 availability definitions, transaction map),
`06-phase-13-16-rapport.md` §"Duplicate implementation" + §7 (PDF/mail/locking proposals),
`07-phase-17-19-rapport.md` (two restore paths, N+1, write-on-read sync, performance baselines),
`graphify-out/GRAPH_REPORT.md` (god nodes — used only to orient; every claim below was verified in code).

Bug ids `BUG-001 … BUG-230` refer to the trackers in `docs/audit/03…07`. Where a code-quality defect is
the *root cause* of an already-filed bug, the bug id is cited instead of re-describing the symptom.

---

## 1. Inventory (numbers)

### 1.1 Size and shape

| Metric | Value | Source |
|---|---|---|
| TypeScript LOC total (`server` + `client/src` + `shared`) | **127 946** | `wc -l` |
| `server/**` | 35 273 LOC, 102 production modules | |
| `client/src/**` | 88 888 LOC, 253 files | |
| `shared/**` | 3 785 LOC, 16 modules | |
| Modules seen by madge (ts/tsx, incl. tests) | 417 | `madge --ts-config tsconfig.json` |
| `tsc --noEmit -p tsconfig.json` | **0 errors** (exit 0) | verified this phase |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** | grep |
| Real `TODO` / `FIXME` / `HACK` markers | **0** (the 13 grep hits are all `XXX` inside licence-plate regex comments, e.g. `server/utils/pdf-generator.ts:33`) | grep |
| `any` occurrences (`: any`, `as any`, `any[]`, `<any>`) | **711** — server 392, client 310, shared 9 | grep |
| `console.*` calls | **server 982**, client 307 — no logger abstraction exists | grep |

**`server/routes.ts` is a monolith: 7 758 lines, and 7 664 of them are one function.**
`registerRoutes` runs from `server/routes.ts:96` to `:7759` and contains **119 inline route
registrations**, 7 multer instances, and the whole reservation/contract/damage-check domain.

Largest files:

| LOC | File |
|---|---|
| 7 758 | `server/routes.ts` |
| 4 476 | `server/database-storage.ts` |
| 4 244 | `client/src/pages/reservations/calendar.tsx` |
| 3 978 | `client/src/components/vehicles/vehicle-details.tsx` |
| 3 110 | `client/src/components/reservations/reservation-form.tsx` |
| 2 615 | `client/src/components/settings/settings-panel.tsx` |
| 2 564 | `client/src/pages/reports/index.tsx` |
| 2 273 | `client/src/pages/documents/template-editor.tsx` |
| 2 263 | `client/src/pages/maintenance/calendar.tsx` |
| 2 261 | `client/src/pages/documents/transport-report-template-editor.tsx` |
| 2 219 | `client/src/pages/CustomerCommunications.tsx` |
| 2 207 | `client/src/pages/documents/index.tsx` |
| 2 110 | `shared/schema.ts` |
| 2 057 | `client/src/components/vehicles/vehicle-form.tsx` |
| 2 044 | `client/src/components/dashboard/quick-actions.tsx` |

Top `console.log` concentrations: `server/routes.ts` 109, `server/index.ts` 51,
`server/database-storage.ts` 43, `server/backupService.ts` 37, `server/utils/pdf-generator.ts` 35,
`client/src/components/vehicles/vehicle-form.tsx` 35, `client/src/pages/reservations/calendar.tsx` 28.

### 1.2 Routes

| Metric | Value |
|---|---|
| HTTP route registrations in `server/**` (excl. tests) | **382** |
| of which in `server/routes.ts` | **119** |
| async handlers | 372 |
| async handlers **without any `try`** | **96 (26 %)** |
| route handlers with no auth middleware at all | 2 (`server/routes.ts:1930` RDW proxy, `:7338` `/object-storage/*`) — already BUG-inventoried in `01a` |
| `requireAuth`-only (no permission) references in `routes.ts` | 32 |
| `hasPermission(...)` references in `routes.ts` | 92 |
| shadowed (unreachable) routes | **1** — see §4 |

### 1.3 Persistence

| Metric | Value |
|---|---|
| `db.transaction(...)` call sites | **9** (`database-storage.ts:540,663,751,2029,4101,4119,4152`, `services/driver-assignments.ts:23`, +1 nested) — unchanged since phase 12 |
| Files using raw `sql\`` templates | 9 (`database-storage.ts` 135 occurrences, `services/portal-storage.ts` 9, `services/portal-dashboard.ts` 3, `routes/backups.ts` 3, 5 others with 1–2) |
| `pool.query` / `pool.connect` outside `db.ts` | 0 |
| direct `db.select/insert/update/delete` inside route modules (bypassing `IStorage`) | 4 files: `routes/email-templates.ts` (7), `routes/email-logs.ts` (3), `routes/portal-requests.ts` (3), `routes/notifications.ts` (2) |
| `IStorage` interface size | 203 method signatures, `server/storage.ts:33-299` |

### 1.4 Test coverage map

`npm test` = `vitest run`. **25 test files**, all under `server/__tests__/`, `shared/*.test.ts` and
`scripts/export-schema.test.ts`. **Zero client tests** (0 `.test.tsx` under `client/`).

Of 102 production modules in `server/` + `shared/`, **36 are referenced by a test and 66 are not**.
The split is not random: every tested module belongs to the portal / fines / CJIB subsystems (the
newest code), and the entire core rental domain is untested.

**Untested critical modules, largest first:**

| LOC | Module | Why it matters |
|---|---|---|
| 7 759 | `server/routes.ts` | every staff endpoint: reservations, pickup/return, contracts, damage checks |
| 4 477 | `server/database-storage.ts` | conflict checking, status sync, delete/restore, transactions |
| 1 490 | `server/utils/pdf-generator.ts` | contracts |
| 1 239 | `server/backupService.ts` | backup + restore |
| 995 | `server/routes/backups.ts` | the second, destructive restore path |
| 811 | `server/pdf-damage-check-generator.ts` | damage-check PDFs |
| 552 | `server/index.ts` | bootstrap, error handlers, static mounts |
| 320 | `server/vehicle-status-helper.ts` | vehicle status machine |
| 301 | `server/utils/financial-reports.ts` | money |
| 280 | `server/utils/security/fileUploadSecurity.ts` | upload allow-listing |
| 232 | `server/middleware/audit.ts` | audit trail |

Tested: `auth.ts`, `portal-auth.ts`, `portal-paths.ts`, `middleware/security/csrf.ts`, `headers.ts`,
`routes/{fines,notifications,portal,portal-admin,portal-requests}.ts`, all `services/cjib/*`,
all `services/portal-*`, `services/{driver-assignments,fine-attribution,fines-storage,reservation-pdf-regeneration}.ts`,
`utils/{email-service,fine-scanner}.ts`, `shared/{fines,paths,portal-requests,schema}.ts`, `storage.ts`, `db.ts`.

---

## 2. Duplication table

| # | Category | Implementations (file:line) | Consequence | Related BUGs | Recommended single owner |
|---|---|---|---|---|---|
| D1 | **Licence-plate formatting** | `server/utils/pdf-generator.ts:19` (12 sidecodes) · `server/pdf-damage-check-generator.ts:13` (identical 12) · `server/routes/notifications.ts:29` (pattern-class algorithm, 4 cases) · `server/utils/rdw-api.ts:38` (length-only split) · `client/src/lib/format-utils.ts:57` (**14** sidecodes — adds `0-XX-000`, `000-XX-0`) · `client/src/lib/utils.ts:16` (length-only, **does not uppercase**, 0 importers) | **6 implementations, 4 different algorithms.** A sidecode-13/14 plate renders as `1-AB-123` on screen but unformatted on the printed contract and damage check, because the two server copies lack those two patterns. The RDW copy and the notification copy produce a third and fourth spelling in e-mail. | — (new) | one `formatLicensePlate` in `shared/` (14 patterns), imported by both sides |
| D2 | **Path resolution for uploads** | `shared/paths.ts:12` `getUploadsDir()` — **21 call sites**; versus **79 hard-coded `process.cwd()`** joins in `server/**`, incl. `server/index.ts:336` (static `/uploads` mount), `routes.ts:5129,5133,5183,5187,5255,5351,5419,6522,6971,7163,2709`, `routes/backups.ts:83,128,148,356,406,427,481,798`, `routes/pdf-templates.ts:342,370,429,562,648`, `routes/damage-check-templates.ts:351,360,447,484`, `routes/report-and-label-templates.ts:278,287,375,412`, `routes/vehicle-diagram-templates.ts:163,174,226,264`, `utils/pdf-generator.ts:74,94,203,547,1464`, `pdf-damage-check-generator.ts:341,379,385` | Setting `UPLOADS_DIR` (the documented production form) silently splits the filesystem in two: writes land in one tree, reads and restores in another. `shared/paths.ts:4-11` documents exactly this failure and it was never applied beyond 21 of 100 sites. | **BUG-026, BUG-029, BUG-169, BUG-198, BUG-200** | `shared/paths.ts` + `server/services/document-paths.ts` |
| D3 | **Reservation status writes** | canonical table `shared/schema.ts:42` `VALID_RESERVATION_TRANSITIONS` + `:60` `isValidReservationTransition` — used **once**, `server/routes.ts:3254`. Writers that bypass it: `PATCH /api/reservations/:id/basic` `routes.ts:3090`, `PATCH /api/reservations/:id` `routes.ts:3445`, `pickupReservation` `database-storage.ts:1664+`, `returnReservation` `database-storage.ts:1751+`, `applyTransportUpdate` `database-storage.ts:2025` | One of five writers enforces the state machine; the other four accept any `status` string. | **BUG-159** (double booking via the edit path), BUG-019 | one `transitionReservation(id, to, ctx)` in the storage layer |
| D4 | **Availability / conflict derivation** | `checkReservationConflicts` `database-storage.ts:1528` (13 callers) · `syncVehicleAvailabilityWithReservations` `database-storage.ts:224` (11 callers) · `getAvailableVehiclesInRange` `database-storage.ts:3109` · `listBusyVehicleIds` `services/portal-storage.ts:264` · `getVehicleStatusContext` `vehicle-status-helper.ts:21` | Five disjoint definitions of "is this car free". `checkReservationConflicts` ignores `availabilityStatus` entirely, so `POST /api/reservations` books a `not_for_rental` car that the picker hides; the portal path adds its own `NOT_RENTABLE` filter (`routes/portal-requests.ts:231`) that the staff path does not have. | 01d risk #5; BUG-006/106/107/159/160 all live on top of it | one `VehicleAvailability` service owning both the overlap predicate and the status filter |
| D5 | **Damage-check template selection** | `routes.ts:6150-6160` (first match from `getDamageCheckTemplatesByVehicle`, no content check) · `routes.ts:6660-6710` (5-step manual match over all templates) · `routes.ts:4327-4343` (same 5-step, inlined into the pickup path) · `services/reservation-pdf-regeneration.ts:299` `pickBestDamageCheckTemplate` (content-aware: skips templates with empty `canvasFields`) — used at `routes.ts:6937,7128,7239` | Four rules, one vehicle. The two non-content-aware pickers happily pick an empty template and emit a blank PDF; the content-aware one does not. | BUG-166, BUG-181, BUG-183 | promote `pickBestDamageCheckTemplate` to the only picker |
| D6 | **Generated-document registration** | **15 `storage.createDocument(...)` call sites**: `routes.ts:2732,2764,3738,4210,4422,5036,5641,5935,6052,6275,6978,7170,7740`, `services/reservation-pdf-regeneration.ts:188,457` — each with its own directory convention (`uploads/<plate>/contracts` at `routes.ts:4845` vs `uploads/contracts/<plate>` at `:4824,5566,5877`), its own filename and its own version counter | Two directory layouts for the same artefact; two PDFs for one plate on one day collide. | **BUG-027, BUG-165, BUG-184, BUG-190** | one `registerGeneratedDocument({buffer, kind, reservation, vehicle})` |
| D7 | **Contract renderers** | `generateRentalContractFromTemplate` `utils/pdf-generator.ts:55` (481 LOC) · `generateRentalContract` `:541` (190 LOC, fixed coordinates) · `generateFallbackContract` `:735` (57 LOC, emits a text file) · dead `generateInteractiveDamageCheckPDF` `:968` (291 LOC) | Confirmed unchanged since phase 14. Two of the three live renderers can only produce wrong or non-PDF output. | BUG-163, BUG-164 | §7.2 of `06-phase-13-16-rapport.md` |
| D8 | **Template-background upload** | 6 near-identical multer routes: `routes/pdf-templates.ts:306,503` · `routes/report-and-label-templates.ts:256,351` · `routes/damage-check-templates.ts:329,423`; **16 independent `multer({...})` instances** across `server/**` | Only one of the three families checks the extension whitelist; a policy change has to be made six times. | BUG-179, BUG-180 | one `saveTemplateBackground(kind, id, file)` |
| D9 | **`template.fields` JSON parsing** | `routes.ts:2697,5489,5524,5727,5862,5995` · `routes/pdf-templates.ts:131` · `database-storage.ts:2304,2329,2361,2515` · `utils/pdf-generator.ts:252,1438` — of which only 5 use the `typeof === 'string' ? JSON.parse : value` guard | 13 copies; the 8 unguarded ones throw on an already-parsed jsonb value. Separately, **6 copies of `JSON.parse(req.body.body)`** for multipart bodies (`routes.ts:2442,2795,3102,4470,6409,6471`). | BUG-168 class | one `parseTemplateFields(row)` in `shared/` |
| D10 | **Input coercion (`""` → `null`)** | `PATCH /api/reservations/:id` `routes.ts:3457-3575` (**25 hand-written field checks**) · `PATCH /:id/basic` `routes.ts:3114` (1 check) · `POST /api/reservations` `routes.ts:2459-2486` (3 checks) · `POST /api/vehicles` `routes.ts:746-779` · `PATCH /api/vehicles/:id` `routes.ts:1102-1137` | The reservation list omits `portalRequestId` and `replacementForTransportId` → every edit-save fails. The two vehicle copies have **already drifted**: `routes.ts:757-763` still defaults absent booleans to `false`, `routes.ts:1116-1122` was fixed not to (comment at `:1110-1115` records the regression). | **BUG-202** (edit form always fails); the vehicle drift is the fix for the silent flag wipe | zod `.preprocess`/`z.coerce` on the insert schemas in `shared/schema.ts` |
| D11 | **Id parsing** | **143 raw `parseInt(req.params.x)`** in `server/**`, versus 3 *separately defined* `idParam` helpers: `routes/fines.ts:33`, `routes/portal.ts:82`, `routes/portal-requests.ts:30` | `NaN` reaches Postgres and returns 500 instead of 400. The three helpers are copies of one another in three files. | **BUG-103**, BUG-088 | one `intParam` middleware in `server/middleware/` |
| D12 | **Admin gate** | `server/middleware/permissions.ts:34` `requireAdmin` (exported, used by `routes.ts:1694,1715`, `routes/users.ts:248`, `routes/app-settings.ts:107,135,156`) and a closure copy in `server/auth.ts:210` used only by `POST /api/register` (`auth.ts:223`) | Two definitions with different 401 bodies (`"Unauthorized"` vs `"Not authenticated"`); a policy change applied to one misses the other. | 01a "Dubbele `requireAdmin`" | `server/middleware/permissions.ts` |
| D13 | **Money / date formatting** | money: `routes/fines.ts:31`, `services/fine-create.ts:8`, `utils/financial-reports.ts:29`, `utils/pdf-generator.ts:872`, `client/src/lib/format-utils.ts:24`, `client/src/lib/utils.ts:68`, `client/src/components/portal/vehicle-cards.tsx:14` = **7**. dates: `utils/pdf-generator.ts:1287`, `utils/rdw-api.ts:106`, `shared/holidays.ts:71`, `client/src/lib/format-utils.ts:7`, `client/src/lib/date-utils.ts:82`, `client/src/components/portal/reservation-card.tsx:11`, `client/src/components/dialogs/backup-dialog.tsx:461`, `client/src/components/ui/reservation-selector.tsx:98`, `client/src/components/vehicles/apk-date-changes-dialog.tsx:43` = **9** | Different decimal and thousands conventions between screen, PDF and e-mail. | BUG-192, BUG-223 | one locale-aware formatter module in `shared/` |
| D14 | **Restore paths** | database: `routes/backups.ts:173` (`restore-data`, inline `psql`, no `ON_ERROR_STOP`, no type-to-confirm) vs `backupService.ts:702` `restoreDatabase` (checksum + `confirmFilename`). files: `routes/backups.ts:452` (`restore-files`, shell `tar -xzf … -C process.cwd()`) vs `backupService.ts:855` `restoreFiles` | Confirmed unchanged from phase 17. The two paths disagree on safety checks and on target directory. | BUG-198, BUG-207, and the "200 = success while the database is empty" matrix in `07` §0 | `backupService` only; delete the inline shell path |
| D15 | **Conflict → HTTP mapping** | 409 + `{message, conflicts[]}` at `routes.ts:2614,3167` and `routes/portal-requests.ts:189,234,361`; but `database-storage.ts:3076,3209` `throw new Error('… conflicting reservations')` which `routes.ts:3884` turns into **400 `{message: error.message}`** and `routes.ts:4609` turns into 409 only because it does `error.message.includes('conflict')` | The same business condition produces 400, 409 or 500 depending on which endpoint you hit, and one path routes on substring matching of an English error message. | BUG-148 class | typed domain errors (`ConflictError`) mapped once |

---

## 3. Dead code

Evidence: `npx ts-prune -p tsconfig.json` (185 lines) cross-checked by grep; `madge --orphans`.

### 3.1 Unreachable functions

| Symbol | Location | Evidence |
|---|---|---|
| `generateInteractiveDamageCheckPDF` (**291 LOC**) | `server/utils/pdf-generator.ts:968` | grep over `server`+`client/src`+`shared`+`scripts`: the definition is the only hit |
| `calculateCorrectStatus` | `server/vehicle-status-helper.ts:147` | ts-prune; 0 importers |
| `getStatusOnMaintenanceStart` | `:227` | ts-prune; 0 importers |
| `getStatusOnMaintenanceEnd` | `:243` | ts-prune; 0 importers |
| `getStatusOnReservationCancel` | `:274` | ts-prune; 0 importers |
| `VEHICLE_STATUS_LABELS` / `VEHICLE_STATUS_COLORS` | `:305`, `:313` | ts-prune; 0 importers |
| `getStatusOnReturn` | `:185` | **imported** at `database-storage.ts:36` but never called (grep: only the import line) — the return path inlines a *different* rule at `database-storage.ts:1775-1781` (always `available`, then a full-table re-sync), where the helper would have returned `scheduled`/`rented` |
| `formatLicensePlate`, `normalizeLicensePlate` | `client/src/lib/utils.ts:16,44` | ts-prune; all 55 importers use `@/lib/format-utils`. `normalizeLicensePlate` also duplicates `shared/fines.ts` |
| `checkLockoutMiddleware` | `server/middleware/security/rateLimiter.ts:135` | ts-prune |
| `sanitizeHtml`, `validateFileUpload` | `server/middleware/security/sanitization.ts:60,69` | ts-prune |
| `updateSessionActivity`, `getUserActiveSessions`, `revokeSession`, `revokeUserSessions` | `server/utils/security/sessionManager.ts:55,69,90,106` | ts-prune — an entire session-revocation feature is built and never wired to a route |
| `setCjibFtpsClient`, `stopCjibScheduler` | `server/services/cjib/poller.ts:9,73` | ts-prune |
| `customerNameOf` | `server/services/portal-customer-notifications.ts:121` | ts-prune |
| `isoDay`, `daysBetween` | `server/services/booking-period.ts:10,17` | ts-prune |
| `EmailError` | `server/utils/email-service.ts:19` | ts-prune |
| `getDutchHolidaysWithInfo` | `shared/holidays.ts:125` | ts-prune |
| client: `useSocket` (`hooks/use-socket.tsx:24`), `forceRefreshLists` + `invalidateAllRelatedData` (`lib/cache-utils.ts:87,106`), `getCustomPriorityStyle` (`lib/calendar-styling.ts:237`), `getColorStyle` (`lib/color-rules.ts:175`), `isWithinNextDays`/`isWithinNextMonths`/`formatDateRange`/`getDuration`/`getWeekDays`/`doDateRangesOverlap` (**6 of 7 exports of `lib/date-utils.ts`**), `PORTAL_COLORS` (`lib/portal-site.ts:21`), `customerLabel`, `PORTAL`, `useConfirmDialog`, `useHidePrices`, `TabsFilter` | see ts-prune output | |

### 3.2 Unreachable route

Full registration-order analysis of all **382** route registrations (script:
scratch `shadow.cjs`, per-file order, `:param` → `[^/]+`) found exactly **one** shadowed route:

```
GET /api/damage-check-templates/by-vehicle (server/routes/damage-check-templates.ts:52)
  shadowed by GET /api/damage-check-templates/:id (server/routes/damage-check-templates.ts:35)
```

= **BUG-088**, re-confirmed. No other route in the codebase is shadowed. Cross-file shadowing was
checked too and is clean: the routers that could collide with `/api/vehicles/:id` are mounted
*before* `registerRoutes` (`server/index.ts:351-357`), so `/api/vehicles/with-reservations` and
`/api/vehicles/filtered` win correctly.

### 3.3 Orphan modules

`madge --orphans` over `server client/src shared`: the only non-entry, non-test orphan is
`client/src/components/ui/tabs-filter.tsx`. An independent alias-aware scan of all 253 client files
agrees. **The client has essentially no orphan files** — this is a strength, not a problem.

### 3.4 Dead feature surface

**Recurring reservations.** `shared/schema.ts:762-767` defines `isRecurring`, `recurringParentId`,
`recurringFrequency`, `recurringEndDate`, `recurringDayOfWeek`, `recurringDayOfMonth`.
`server/routes.ts:3506-3532` contains 27 lines of coercion that make all of them writable through
`PATCH /api/reservations/:id`. There is **no generator anywhere** (grep for `recurring` over `server`
outside `schema.ts` returns only those coercion lines and one field list at
`database-storage.ts:1225`) and **zero references in `client/src`**. Six writable columns that
nothing reads.

**Replit remnants.** `server/objectStorage.ts:5` hard-codes `http://127.0.0.1:1106` (the Replit
sidecar) and is still reachable: instantiated twice in `registerRoutes`
(`routes.ts:98` and `:266` — both handed to `RouteDeps` as the two distinct fields
`objectStorageService` and `objectStorage`, `server/routes/deps.ts:12-13`), exposed unauthenticated at
`routes.ts:7338` (`GET /object-storage/*`), and lazily imported from `utils/pdf-generator.ts:85` for
templates whose `backgroundPath` is absolute. `server/index.ts:201-204` still allow-lists
`*.replit.app` / `*.replit.dev` in CORS; `client/src/locales/{en,nl}/settings.json:846-847` still
offer "Replit Object Storage" as a backup destination in the UI.

### 3.5 Declared dependencies with zero imports

Verified by grepping for `from "<pkg>"` / `require("<pkg>")` / `import("<pkg>")` over
`server client/src shared scripts vite.config.ts`:

`tesseract.js`, `csurf`, `openai`, `cmdk`, `input-otp`, `embla-carousel-react`, `next-themes`,
`zxcvbn`, `google-auth-library` — **9 unused runtime dependencies**. `tar` is also declared
(`package.json:117`) and never imported: backups are written with `archiver`
(`backupService.ts:9,337`) and restored with the **shell** `tar` binary
(`routes/backups.ts:148,356,413,427,481`, `backupService.ts:930`). `xlsx` has exactly one importer.

---

## 4. Circular dependencies

```
$ npx madge --ts-config tsconfig.json --circular --extensions ts,tsx server client/src shared
Processed 417 files

✖ Found 9 circular dependencies!

1) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/fine-dialog.tsx > client/src/components/portal/reservation-dialog.tsx > client/src/components/portal/reservation-card.tsx
2) …                                                                                      > client/src/components/portal/rows.tsx
3) …                                                                                      > client/src/components/portal/vehicle-card.tsx
4) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/fine-dialog.tsx > client/src/components/portal/reservation-dialog.tsx
5) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/fine-dialog.tsx
6) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/list-dialog.tsx
7) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/new-request-dialog.tsx
8) client/src/hooks/use-portal-dialogs.tsx > client/src/components/portal/request-dialog.tsx
9) server/storage.ts > server/database-storage.ts
```

**Count: 9** (8 client, 1 server). Note the graphify report says "Import Cycles — None detected";
that is a false negative of the graph build. Running madge *without* `--ts-config` also reports only
the server cycle, because the `@/` alias is then unresolved — the 8 client cycles only appear when
the tsconfig `paths` are honoured.

- Cycles 1–8 are one hub-and-spoke shape: the dialog hook `use-portal-dialogs.tsx` imports each
  dialog while each dialog imports the hook back. Benign in a bundler, but it makes the portal
  dialog set impossible to code-split and any one of these modules impossible to unit-test in
  isolation.
- Cycle 9 is a **runtime** cycle: `server/storage.ts:301` imports `DatabaseStorage` at the bottom of
  the file, and `server/database-storage.ts:52` imports `IStorage` back from `./storage`. That import
  is not marked `import type`, so esbuild (the production bundler, `package.json:8`) keeps the module
  side-effect edge. It works today only because `export const storage = new DatabaseStorage()` is the
  last statement (`storage.ts:304`); any module-level initialisation added above it would observe a
  half-initialised module.

**Fan-in / fan-out** (from `madge --json`, 417 modules):

| Fan-out (depends on N) | | Fan-in (depended on by N) | |
|---|---|---|---|
| 45 | `server/routes.ts` | 63 | `shared/schema.ts` |
| 32 | `client/src/i18n.ts` | 42 | `server/storage.ts` |
| 28 | `server/index.ts` | 33 | `server/db.ts` |
| 20 | `server/routes/fines.ts` | 19 | `server/services/portal-storage.ts` |
| 19 | `server/routes/portal-requests.ts` | 16 | `server/middleware/permissions.ts` |
| 18 | `server/routes/portal.ts` | 13 | `server/routes/deps.ts` |

`server/routes.ts` is the single highest fan-out module *and* the single largest file *and* the
single largest function. That is the coupling hotspot.

---

## 5. Complexity hotspots

| Rank | LOC | Location | What it is |
|---|---|---|---|
| 1 | **7 664** | `server/routes.ts:96-7759` `registerRoutes` | one function holding 119 route handlers, 7 multer configs and the whole reservation/contract/damage-check domain |
| 2 | **4 082** | `client/src/pages/reservations/calendar.tsx:163-4244` `ReservationCalendarPage` | one React component; only 12 helpers are hoisted out of it, the largest being 63 LOC |
| 3 | **2 906** | `client/src/components/reservations/reservation-form.tsx:206-3111` `ReservationForm` | 9 queries on form-watch, an inline admin-password retry loop, a live conflict check |
| 4 | 481 | `server/utils/pdf-generator.ts:55` `generateRentalContractFromTemplate` | |
| 5 | 350 | `server/routes.ts:2435` `POST /api/reservations` | zod + blacklist + conflicts + overdue + BV→Opnaam + driver + sync + broadcast + preview-token contract + document insert, **no transaction** |
| 6 | 320 | `server/routes.ts:3445` `PATCH /api/reservations/:id` | 25 hand-written coercions, no transition gate, no transaction |
| 7 | 301 | `server/routes.ts:2787` `POST /api/reservations/maintenance-with-spare` | creates a block + a replacement + sets service status, **no transaction** |
| 8 | 291 | `server/utils/pdf-generator.ts:968` `generateInteractiveDamageCheckPDF` | **dead** |
| 9 | 223 | `server/routes.ts:5451` `GET /api/contracts/generate/:reservationId` | |
| 10 | 213 | `server/routes.ts:3230` `PATCH /api/reservations/:id/status` | the one place the state machine is enforced |
| 11 | 211 | `server/routes.ts:4249` `POST /api/reservations/:id/return` | |
| 12 | 207 | `server/routes.ts:7004` `PUT /api/interactive-damage-checks/:id` | |
| 13 | 205 | `server/database-storage.ts:2025` `applyTransportUpdate` | the only storage method with a real transaction — and it still calls `checkReservationConflicts` on the pool `db`, not on `tx` (`database-storage.ts:2083,2105`) |
| 14 | 192 | `server/database-storage.ts:3828` `executeReport` | dynamic report builder |
| 15 | 190 | `server/utils/pdf-generator.ts:541` `generateRentalContract` | legacy fixed-coordinate renderer |
| 16 | 180 | `server/routes.ts:4067` `POST /api/reservations/:id/pickup` | reservation + vehicle written separately, no transaction |
| 17 | 130 | `server/database-storage.ts:224` `syncVehicleAvailabilityWithReservations` | full-table status re-derivation, invoked 11× from routes incl. two GETs |

Also over 1 500 LOC and single-component: `vehicle-details.tsx` (3 978), `settings-panel.tsx` (2 615),
`reports/index.tsx` (2 564), `template-editor.tsx` (2 273), `maintenance/calendar.tsx` (2 263),
`transport-report-template-editor.tsx` (2 261), `CustomerCommunications.tsx` (2 219),
`documents/index.tsx` (2 207), `vehicle-form.tsx` (2 057), `quick-actions.tsx` (2 044),
`pickup-return-dialogs.tsx` (1 917), `interactive-damage-check.tsx` (1 819),
`barcode-label-template-editor.tsx` (1 813), `schedule-maintenance-dialog.tsx` (1 598).

---

## 6. Separation of concerns

1. **Business logic lives in route handlers, not in services.** The reservation domain has no service
   layer at all: conflict checking, BV→Opnaam conversion, driver assignment, contract generation,
   document registration and the realtime broadcast are all written out inline inside
   `routes.ts:2435-2786` and `:3445-3765`. `server/services/` exists (18 modules) but contains only
   portal, fines and CJIB code plus `reservation-pdf-regeneration.ts` — the staff rental core never
   got one.

2. **The storage layer leaks route concerns upward and swallows them downward.**
   `database-storage.ts:3076` and `:3209` throw bare `Error('… conflicting reservations')`; the
   caller at `routes.ts:4609` recovers the HTTP status with
   `error.message.includes('conflict')`. Meanwhile `syncVehicleAvailabilityWithReservations()` — a
   write — is called from inside `GET /api/vehicles` (`routes.ts:466`) and
   `GET /api/vehicles/status/breakdown` (`routes.ts:429`), so a read request rewrites the whole
   `vehicles` table.

3. **Four route modules bypass `IStorage`** and hit drizzle directly:
   `routes/email-templates.ts` (7 statements), `routes/email-logs.ts` (3),
   `routes/portal-requests.ts` (3), `routes/notifications.ts` (2). Everywhere else the 203-method
   `IStorage` boundary is respected — the inconsistency is the problem, not the count.

4. **`RouteDeps` is a grab-bag.** `server/routes/deps.ts:7-16` passes four multer instances, an
   uploads path and **two separate `ObjectStorageService` instances of the same class**
   (`objectStorageService` from `routes.ts:98`, `objectStorage` from `routes.ts:266`) into every
   split-out route module.

5. **Client: 129 raw `fetch()` calls bypass `apiRequest`.** Concentrated in
   `pickup-return-dialogs.tsx` (12), `interactive-damage-check.tsx` (10),
   `CustomerCommunications.tsx` (9), `vehicle-details.tsx` (9), `reservation-form.tsx` (9),
   `calendar.tsx` (8), `backup-dialog.tsx` (7), `quick-actions.tsx` (7), against 313 `apiRequest`
   references. CSRF is patched back in globally by monkey-patching `window.fetch`
   (`client/src/lib/csrf-fetch-interceptor.ts:46`, imported for side effect at `main.tsx:1`) — but the
   interceptor only adds the header. The raw call sites still miss everything else `apiRequest`
   provides: session-expiry detection (`queryClient.ts:8-19`), server error-field propagation
   (`:33-38`) and the admin-password retry (`:110-143`). A raw `fetch` that gets a 401 therefore
   never logs the user out.

6. **Shared validation is one-sided.** `shared/schema.ts` exports the drizzle-zod insert schemas and
   the server parses with them (`insertVehicleSchema.parse`, `insertReservationSchema.parse`), but the
   client forms declare their own `formSchema`/`z.object` locally
   (e.g. `components/customers/customer-form.tsx:29-60`,
   `components/reservations/driver-form-dialog.tsx`, `service-vehicle-dialog.tsx:41`). The rules
   therefore differ per side, which is why the server has to hand-coerce 25 fields (D10).

---

## 7. Inconsistent patterns

| Pattern | State of play | Evidence |
|---|---|---|
| **Error response shape** | `{message}` **665×**, `{error}` **98×**, `{success, message}` 16×, and the global handler emits a *third* shape `{error: 'Server Error', message, stack?}` | `server/index.ts:423-435`; grep counts over `server/**` |
| **Status code for the same condition** | conflict → 409 (`routes.ts:2614,3167`), 400 (`routes.ts:3884`), or 500 (uncaught `Error` from `database-storage.ts:3076`). 400 is used 383×, 404 222×, 409 23×, 422 once. | see D15 |
| **Id validation** | 143 bare `parseInt(req.params.x)` vs 3 duplicated `idParam` helpers | BUG-103 |
| **Async error handling** | 96 of 372 async handlers have no `try`; no `asyncHandler` wrapper exists anywhere (grep `asyncHandler|express-async` → 0 hits); Express is 4.21 so rejections are not caught by the framework | see CQ-001 |
| **i18n** | 183 of 234 `.tsx` files use `useTranslation`; `scripts/find-hardcoded-strings.cjs` over all 234 reports **196 remaining hard-coded UI strings** even in files that already have the hook | BUG-223 |
| **Dates** | 420 `new Date(` in the client, 116 `toISOString()` in the server, 91 `split('T')[0]` truncations, 106 date-fns `format(` calls and 45 `toLocaleDateString` — four conventions, no single date module (`client/src/lib/date-utils.ts` exists but **6 of its 7 exports are dead**) | BUG-224 |
| **Enum overloading** | `maintenanceStatus` is one property name with two disjoint value sets: `ok\|needs_service\|in_service` on `vehicles` (`shared/schema.ts:229`) and `scheduled\|in\|out` on `reservations` (`:744`). `vehicle-status-helper.ts:58-60` defensively accepts all three reservation-side values *plus* `'in_service'`, which a reservation can never hold. | 01d |
| **Module loading** | 3 CommonJS `require('fs')` calls in an ESM build (`backupService.ts:829,838,962`) and ~50 `await import(...)` of first-party modules in hot paths (e.g. `routes.ts:5504,5538,5735,5870,6003` all lazily import the same `pdf-generator`) with no lazy-loading benefit | **BUG-207** |
| **Logging** | 982 `console.*` in `server/**`, none structured, no level control, no logger module | — |
| **API payload naming** | **Consistent** — camelCase everywhere. Zero snake_case keys in `res.json` literals, zero `req.body.snake_case`, zero `req.query.snake_case`. Not a problem; see §11. | verified |

---

## 8. Fragile dependencies

`npm audit` (this phase): **70 vulnerabilities — 3 critical, 23 high, 36 moderate, 8 low.** Phase 2
owns the dependency baseline; what matters *here* is where a vulnerable package meets a code-quality
weakness:

| Package | Installed | Advisory | Code-quality coupling |
|---|---|---|---|
| `drizzle-orm` | **0.39.3** | HIGH — SQL injection via improperly escaped SQL identifiers, fixed in 0.45.2 | the codebase uses **135 raw `sql\`` templates in `database-storage.ts` alone** (plus 20 elsewhere). The blast radius of this advisory is exactly the part of the code that is untested (§1.4). |
| `fast-xml-parser` | 5.11.1 (audit still flags a reachable copy) | **CRITICAL** — entity-expansion / numeric-entity DoS | sole importer is `server/services/cjib/parser.ts:7`, which parses files fetched over FTPS from an external party (`services/cjib/ftps-client.ts`) — i.e. untrusted input |
| `tar` | 7.4.3 | **CRITICAL** — arbitrary file create/overwrite via hardlink path traversal | **declared but never imported.** Backups are written with `archiver` and restored by shelling out to the system `tar` binary. Removing the dependency costs nothing. |
| `express-rate-limit` | 8.1.0 | HIGH — IPv4-mapped IPv6 bypass | compounds BUG-074 (logged-in requests already skip the limiter) |
| `nodemailer` | 7.0.6 | HIGH — mail to unintended domain via interpretation conflict | compounds BUG-171 (no timeouts on the pooled transporter, `utils/email-service.ts:253`) |
| `multer` | **1.4.5-lts.2** | 1.x is end-of-life | **16 independent `multer({...})` instances** (`server/routes.ts:134,143,170,246,2426,4931,6328` + 9 in route modules) have to be migrated one by one |
| `xlsx` | 0.18.5 | HIGH — prototype pollution + ReDoS, no fixed version published on npm | one importer |
| `vitest` | — | CRITICAL (UI server arbitrary read/exec) | dev-only |
| `vite`, `rollup`, `postcss`, `browserslist`, `nanoid`, `picomatch`, `minimatch`, `glob`, `lodash`, `brace-expansion`, `form-data`, `ip-address`, `jws`, `validator`, `ws`, `engine.io`, `socket.io-parser`, `path-to-regexp`, `express` | — | HIGH | mostly transitive |

Plus the environment-level fragility: restores depend on `psql`, `pg_dump` and a GNU-compatible `tar`
being on `PATH` (`backupService.ts:259`, `routes/backups.ts:148,284`), which is why file restore
fails on Windows with `tar (child): Cannot connect to C:` (phase 17).

---

## 9. Prioritised findings

```
CQ-001
Severity: HIGH
Category: separation
Where: 96 async handlers with no try/catch — server/routes/portal.ts:93,99,113,142,158,176,181,185,193,207,212,220,244,249,257,277,289,426,433,457,463,474,505,518 · server/routes/portal-admin.ts:40,45,67,88,98,109,114,124,129,133,141,147,157,165,179,184,196,214,222,231 · server/routes/fines.ts:74,78,83,89,97,105,166,178,184,208,241,277,289,306 · server/routes/portal-requests.ts:62,71,73,80,92,105,115,147,172 · server/portal-auth.ts:233,271,284,288,316,323,338,360,384 · server/routes/expenses.ts:113,120,132,143 · server/auth.ts:263,377 · server/routes.ts:277,478,2026,2161,2172,2182,2192,2236,2247,2333,4940,4951,4962,4985 ; handler: server/index.ts:136-144 -> server/index.ts:96-121 (process.exit)
What: Express 4.21 does not catch rejected promises from async handlers, and the codebase has no
  asyncHandler wrapper (grep "asyncHandler|express-async" over server/** = 0 hits). 26% of all async
  route handlers have no try/catch of their own. Any rejection inside them reaches
  process.on('unhandledRejection') at server/index.ts:136, which calls gracefulShutdown() — which
  ends in process.exit(0) at server/index.ts:114.
Consequence: One bad request kills the whole server for every user. This is the root cause of
  BUG-002 (malformed `payload` on POST /api/portal/requests) and BUG-061 (a non-existent customerId
  → FK violation → process exit), not two isolated bugs. Every portal endpoint and 15 core staff
  GETs are on this list, so the same class is reachable from ~96 places.
Recommendation: Two independent one-line changes, neither of which alters behaviour:
  (a) wrap every registration in an `asyncHandler` (`(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)`)
      so rejections reach the existing error handler at server/index.ts:423;
  (b) make the unhandledRejection handler log-and-continue instead of shutting down — an unhandled
      rejection in a request is not a reason to take the process down (uncaughtException at :126 can stay).
  Doing (b) alone already removes the outage class. Doing (b) is a behaviour change for the operator
  — needs owner approval.
Effort: S
```

```
CQ-002
Severity: HIGH
Category: complexity
Where: server/routes.ts:96-7759 (registerRoutes, 7664 LOC, 119 route registrations, fan-out 45)
What: The single largest function in the codebase is also the highest-fan-out module and the module
  with the most console.log (109), the most `any` lines (45) and zero tests. 22 route modules were
  already split out of it (server/routes/*.ts, 7970 LOC total) — the extraction stopped before the
  rental core.
Consequence: Every reservation, contract and damage-check change is a merge conflict against one
  file; no part of it can be unit-tested without booting the whole app; the 15 createDocument sites
  (D6), the 5 status writers (D3) and the 25 hand-written coercions (D10) all hide inside it.
Recommendation: Continue the existing split using the pattern already in place (RouteDeps +
  registerXRoutes). Highest value first: reservations (routes.ts:2161-4720, ~2500 LOC),
  contracts/damage-checks (routes.ts:5451-7335, ~1900 LOC). Pure moves, no behaviour change.
Effort: L
```

```
CQ-003
Severity: HIGH
Category: duplication
Where: shared/paths.ts:12 (21 call sites) vs 79 hard-coded process.cwd() joins — server/index.ts:336 ·
  server/routes.ts:2709,5129,5133,5183,5187,5255,5351,5419,6522,6523,6971,6977,7163,7169 ·
  server/routes/backups.ts:83,86,128,131,148,356,401,404,406,427,481,798 ·
  server/routes/pdf-templates.ts:342,370,381,429,440,562,575,648,658 ·
  server/routes/damage-check-templates.ts:351,360,447,484 ·
  server/routes/report-and-label-templates.ts:278,287,310,375,412 ·
  server/routes/vehicle-diagram-templates.ts:163,174,226,264 ·
  server/routes/app-settings.ts:88,97,110,118,143 · server/routes/fines.ts:55,100 ·
  server/routes/portal.ts:407,513 · server/utils/pdf-generator.ts:74,94,203,547,1464 ·
  server/pdf-damage-check-generator.ts:341,379,385 · server/backupService.ts:42,53,927 ·
  server/services/document-paths.ts:9,26 · server/services/cjib/importer.ts:33
What: The project has a documented single owner for the uploads root (shared/paths.ts:4-11 explains
  the exact bug this caused) and 79 of ~100 path resolutions still ignore it.
Consequence: With UPLOADS_DIR set — the documented production configuration — writes and reads land
  in different trees. Already filed as BUG-026 (static /uploads mount serves the wrong body),
  BUG-029 (transport report permanent 404), BUG-169 (403 on every driving licence), BUG-198 (file
  restore unpacks into cwd), BUG-200 (uploaded backup is unfindable). These are five symptoms of one
  cause; any new file feature will produce a sixth.
Recommendation: Mechanical: replace `path.join(process.cwd(), 'uploads' | <relative from DB>)` with
  `getUploadsDir()` / `resolveDocumentFilePath()`. Start with server/index.ts:336 (one line, closes
  BUG-026) and routes/backups.ts:406,427,481 (closes BUG-198/200). Then add a lint rule banning
  `process.cwd()` outside shared/paths.ts.
Effort: M
```

```
CQ-004
Severity: HIGH
Category: duplication
Where: server/utils/pdf-generator.ts:19 · server/pdf-damage-check-generator.ts:13 ·
  server/routes/notifications.ts:29 · server/utils/rdw-api.ts:38 ·
  client/src/lib/format-utils.ts:57 · client/src/lib/utils.ts:16
What: Six implementations of formatLicensePlate, four distinct algorithms. The client copy in
  format-utils.ts:57 carries 14 sidecode patterns; both server PDF copies carry only 12 — they are
  missing sidecode 13 (`0-XX-000`) and 14 (`000-XX-0`). rdw-api.ts:38 splits purely by length and
  notifications.ts:29 classifies digit/letter patterns. client/src/lib/utils.ts:16 does not even
  uppercase and has 0 importers (dead, see CQ-011).
Consequence: A sidecode-13/14 plate is shown correctly in the UI, printed unformatted on the rental
  contract and the damage check, and spelled a third way in APK/maintenance reminder e-mail. The
  contract is a legal document; the plate on it is the vehicle identifier.
Recommendation: Move the 14-pattern version to shared/ (next to shared/fines.ts normalizeLicensePlate,
  which is already the shared normaliser) and delete the other five. Pure consolidation; the only
  behaviour change is that two sidecodes start formatting correctly on PDFs — worth flagging to the
  owner but not a policy decision.
Effort: S
```

```
CQ-005
Severity: HIGH
Category: duplication
Where: shared/schema.ts:42,60 (the state machine) — enforced at server/routes.ts:3254 only.
  Bypassed by: server/routes.ts:3090 (PATCH /:id/basic), server/routes.ts:3445 (PATCH /:id),
  server/database-storage.ts:1664 (pickupReservation), :1751 (returnReservation), :2025
  (applyTransportUpdate). Spare status: shared/schema.ts:51 VALID_SPARE_TRANSITIONS enforced at
  server/routes.ts:4013 only, bypassed at database-storage.ts:1676,1758.
What: Two transition tables exist and each is consulted by exactly one of its five-plus writers.
Consequence: BUG-159 (CRITICAL) — two reservations moved onto one vehicle via PATCH both return
  200 because the edit path never checks; the same action done sequentially through /status
  correctly 409s. The edit path is the one the calendar drag-and-drop uses.
Recommendation: Move the gate into the storage layer: one `transitionReservation(id, to, actor)`
  that does `UPDATE … WHERE id=$1 AND status=$2 RETURNING *` (conditional update, which also removes
  the read-then-write race), and make every writer go through it. Behaviour change for /basic and
  the generic PATCH — needs owner approval (which transitions the calendar may perform).
Effort: M
```

```
CQ-006
Severity: HIGH
Category: duplication
Where: server/database-storage.ts:1528 checkReservationConflicts (13 callers: routes.ts:375,2255,
  2282,2531,2604,2900,3123,3653; database-storage.ts:2083,2105,3068,3207;
  routes/portal-requests.ts:185,232,360) · server/database-storage.ts:224
  syncVehicleAvailabilityWithReservations (11 callers) · server/database-storage.ts:3109
  getAvailableVehiclesInRange · server/services/portal-storage.ts:264 listBusyVehicleIds ·
  server/vehicle-status-helper.ts:21 getVehicleStatusContext
What: Five independent answers to "is this vehicle free in this period", differing on: whether
  availabilityStatus is consulted (only getAvailableVehiclesInRange excludes in_service /
  not_for_rental / needs_fixing), whether same-day handover is allowed (checkReservationConflicts
  yes, getAvailableVehiclesInRange no), and whether maintenance blocks count (listBusyVehicleIds yes,
  the others no). Established in 01d §"Beschikbaarheid: vijf implementaties"; re-verified at these
  line numbers.
Consequence: POST /api/reservations will book a not_for_rental vehicle that the UI picker hides,
  because the API-side check never looks at availabilityStatus. The portal path compensates with its
  own NOT_RENTABLE filter (routes/portal-requests.ts:231) that the staff path lacks — the two realms
  enforce different rules on the same table.
Recommendation: One `isVehicleBookable(vehicleId, period, {excludeReservationId, isBlock})` owning
  both the overlap predicate and the status filter; the four other call paths delegate. Aligning the
  rules changes behaviour (staff would start being blocked on not_for_rental cars) — needs owner approval.
Effort: M
```

```
CQ-007
Severity: HIGH
Category: inconsistency
Where: 143 bare parseInt(req.params.x) across server/** vs three separately defined helpers:
  server/routes/fines.ts:33, server/routes/portal.ts:82, server/routes/portal-requests.ts:30
What: The three newest route modules each wrote their own id validator; the other 20 modules
  validate nothing and pass NaN to the storage layer.
Consequence: BUG-103 — non-numeric, oversized or null-byte :id gives 500 (with a raw Postgres error
  shape, BUG-148) instead of 400, on ~19 GET endpoints. BUG-088 is the same failure wearing a
  different hat: `by-vehicle` is parsed as an id.
Recommendation: One `intParam('id')` middleware in server/middleware/, applied at registration
  (`app.get('/api/x/:id', intParam('id'), …)`), and delete the three local copies. Turns 500 into
  400 — a visible change but the correct one.
Effort: M
```

```
CQ-008
Severity: HIGH
Category: separation
Where: 15 storage.createDocument call sites — server/routes.ts:2732,2764,3738,4210,4422,5036,5641,
  5935,6052,6275,6978,7170,7740 · server/services/reservation-pdf-regeneration.ts:188,457.
  Two directory conventions: server/routes.ts:4845 (uploads/<plate>/contracts) vs :4824,5566,5877
  (uploads/contracts/<plate>). Damage checks: routes.ts:6971,7163 build
  uploads/<plate>/damage-checks by hand with process.cwd().
What: There is no owner for "a generated PDF became a document row". Each of the 15 sites picks its
  own directory, filename, version suffix and documentType.
Consequence: BUG-184 — two contracts for the same plate on the same day share one file, so the first
  is silently overwritten and the older row serves the newer bytes. Also BUG-027, BUG-165, BUG-190.
Recommendation: One registerGeneratedDocument({buffer, kind, reservation, vehicle}) that owns the
  path convention, a DB-backed version counter and the insert — exactly proposal 4 of
  06-phase-13-16-rapport.md §7.2. Picking one of the two directory conventions is a migration —
  needs owner approval.
Effort: M
```

```
CQ-009
Severity: HIGH
Category: inconsistency
Where: server/routes.ts:3457-3575 (25 coercion branches) · :3114 (1) · :2459-2486 (3) ·
  :746-749,776-781 (vehicles POST) · :1102-1105,1135-1140 (vehicles PATCH)
What: Empty-string-to-null and "null"-string-to-null conversion is hand-written per field per route
  instead of living in the zod schema. The reservation list at :3457-3575 covers 25 fields and omits
  portalRequestId and replacementForTransportId. The two vehicle copies have already drifted: the
  POST copy (routes.ts:757-763) still defaults every absent boolean flag to false, while the PATCH
  copy (routes.ts:1116-1122) was fixed not to — the comment at :1110-1115 records the regression
  that drift caused (a mileage-only edit wiped gps/spareKey/winterTires).
Consequence: BUG-202 — the reservation edit form fails on every save with
  `invalid input syntax for type integer: ""`, reproduced in the browser in phase 18. The drifted
  vehicle copies mean the same class will recur wherever a new field is added to one route and not
  the other.
Recommendation: Put the coercion in shared/schema.ts on the insert schemas
  (`z.preprocess(v => v === "" || v === "null" ? null : v, …)` / `z.coerce.number().nullable()`) and
  delete all five inline blocks. Fixes BUG-202 as a side effect.
Effort: M
```

```
CQ-010
Severity: MEDIUM
Category: duplication
Where: server/routes.ts:6150-6160 · server/routes.ts:6660-6710 · server/routes.ts:4327-4343 ·
  server/services/reservation-pdf-regeneration.ts:299 pickBestDamageCheckTemplate
  (used at routes.ts:6937,7128,7239 and reservation-pdf-regeneration.ts:348)
What: Four selection rules for one vehicle's damage-check template. Only
  pickBestDamageCheckTemplate checks that the chosen template actually has canvasFields
  (reservation-pdf-regeneration.ts:307-317); the three inline ones do not.
Consequence: BUG-166/181/183 — the same vehicle gets a different template depending on which button
  was pressed, and two of the four paths can select an empty template and emit a blank PDF.
Recommendation: Make pickBestDamageCheckTemplate the only picker (it is already exported and already
  used by three of the seven call sites); delete the three inline ladders.
Effort: S
```

```
CQ-011
Severity: MEDIUM
Category: dead-code
Where: server/vehicle-status-helper.ts:147,227,243,274,305,313 (unreferenced) and :185
  getStatusOnReturn (imported at server/database-storage.ts:36, never called) — the return path
  inlines a different rule at server/database-storage.ts:1775-1781
What: Six of the twelve exports of the vehicle status machine are dead; a seventh is imported but
  bypassed. The inline replacement always sets `available` and then calls
  syncVehicleAvailabilityWithReservations() to fix it, where the helper would have returned
  `scheduled` (a booked reservation exists) or `rented` (another active rental exists) directly.
Consequence: The authoritative status module is not authoritative. Phase 18 observed exactly this:
  after pickup the vehicle stayed `available` while the reservation was `picked_up`. It also forces
  the write-on-read sync of CQ-020 to exist at all.
Recommendation: Either call getStatusOnReturn at database-storage.ts:1775 and delete the inline
  block, or delete the helper module's dead half and stop pretending it is the owner. The first is a
  behaviour change (status would become `scheduled` instead of `available` in some cases) — needs
  owner approval; the second is free.
Effort: S
```

```
CQ-012
Severity: MEDIUM
Category: dead-code
Where: server/utils/pdf-generator.ts:968-1258 generateInteractiveDamageCheckPDF (291 LOC, 0 references
  anywhere in server/, client/src/, shared/, scripts/)
What: An entire second damage-check PDF renderer that nothing calls. Confirmed dead since phase 1c
  and still present.
Consequence: 291 LOC of PDF layout code that looks authoritative to the next reader, maintained by
  nobody, and a second JSON field-parser (pdf-generator.ts:1045) that only it uses.
Recommendation: Delete. Also delete generateFallbackContract (pdf-generator.ts:735) once BUG-163 is
  decided — it archives a .txt as if it were a contract. Deleting the fallback is a behaviour change
  (routes would 500 instead of archiving a text file) — needs owner approval; deleting
  generateInteractiveDamageCheckPDF does not.
Effort: S
```

```
CQ-013
Severity: MEDIUM
Category: dead-code
Where: server/routes/damage-check-templates.ts:35 (GET /:id) registered before :52 (GET /by-vehicle)
What: Full ordering analysis of all 382 route registrations found exactly one unreachable route, and
  it is the one already filed. Cross-file mounting order (server/index.ts:351-357 before
  registerRoutes at :357) is correct.
Consequence: BUG-088 — the endpoint 500s for every identity; the feature is dead.
Recommendation: Move the /by-vehicle registration above /:id. One-line move. (CQ-007's intParam
  middleware would turn the symptom into a clean 400 but would not make the route reachable.)
Effort: S
```

```
CQ-014
Severity: MEDIUM
Category: dependency
Where: package.json — tesseract.js:118, csurf:71, openai:99, tar:117, plus cmdk, input-otp,
  embla-carousel-react, next-themes, zxcvbn, google-auth-library
What: Ten declared runtime dependencies with zero import sites anywhere in server/, client/src/,
  shared/, scripts/ or vite.config.ts.
Consequence: They carry CVEs into the audit surface without carrying any function: `tar` is one of
  the three CRITICAL findings in npm audit and is never imported (backups use `archiver`, restores
  shell out to the system tar). `csurf` is deprecated and unused — the app has its own HMAC CSRF
  (server/middleware/security/csrf.ts). Each one also misleads a reader about what the system does
  (e.g. tesseract.js suggests OCR; the OCR is actually Google Gemini).
Recommendation: Remove from package.json. No code change, no behaviour change.
Effort: S
```

```
CQ-015
Severity: MEDIUM
Category: dead-code
Where: shared/schema.ts:762-767 (6 columns) · server/routes.ts:3506-3532 (27 lines of coercion
  making them writable) · database-storage.ts:1225 (field list) · zero references in client/src
What: The recurring-reservation data model exists and is writable through the API; the generator does
  not exist.
Consequence: Six columns that no code reads, reachable and settable by any user with
  MANAGE_RESERVATIONS. A future reader will assume recurring rentals work.
Recommendation: Decide: implement or drop. Until then, at minimum strip the fields from the accepted
  PATCH payload so the API stops advertising a feature that does nothing. Dropping the columns is a
  migration — needs owner approval.
Effort: S
```

```
CQ-016
Severity: MEDIUM
Category: coupling
Where: server/storage.ts:301 <-> server/database-storage.ts:52 ; and 8 client cycles around
  client/src/hooks/use-portal-dialogs.tsx (see §4)
What: 9 circular dependencies. The server one is a real runtime ESM cycle: database-storage.ts:52
  imports IStorage with a value import (not `import type`), so esbuild — the production bundler,
  package.json:8 — keeps the module edge.
Consequence: It works only because `export const storage = new DatabaseStorage()` is the last
  statement of storage.ts (:304). Any module-level initialisation inserted above it would read a
  half-evaluated module and fail at boot, in production only (tsx dev mode and esbuild resolve
  differently).
Recommendation: (a) change database-storage.ts:52 to `import type { IStorage }` — one word, removes
  the cycle entirely; (b) move `export const storage` out of storage.ts into its own
  server/storage-instance.ts. The client cycles are benign; fixing them means moving the shared
  dialog types into a leaf module — low priority.
Effort: S
```

```
CQ-017
Severity: MEDIUM
Category: complexity
Where: client/src/pages/reservations/calendar.tsx:163-4244 (4082 LOC in one component) ·
  client/src/components/reservations/reservation-form.tsx:206-3111 (2906 LOC) ·
  client/src/components/vehicles/vehicle-details.tsx (3978 LOC file) · 11 more components over 1500 LOC
What: The calendar page hoists only 12 helpers out of a 4082-line component, the largest being 63
  LOC (calendar.tsx:714 getDateStatus). Everything else — 3 breakpoint layouts, drag-and-drop, the
  damage-check dialogs, the history view — is inline JSX and inline hooks.
Consequence: No part of the busiest screen in the product can be tested or memoised independently;
  phase 18 measured 41 re-fired API requests on a browser Back and a double + triple fetch of the
  8 MB /api/reservations payload on this page. There are zero client tests, so any change here is
  verified only by hand.
Recommendation: Extract the three breakpoint views and the dialog set into sibling components with
  explicit props. Pure moves. Do this before, not after, the performance work proposed in
  07-phase-17-19-rapport.md §8.3 — the double fetch at calendar.tsx:608-676 is unfixable while
  everything shares one scope.
Effort: L
```

```
CQ-018
Severity: MEDIUM
Category: separation
Where: 129 raw fetch() call sites in client/src (top: components/reservations/pickup-return-dialogs.tsx
  12, pages/interactive-damage-check.tsx 10, pages/CustomerCommunications.tsx 9,
  components/vehicles/vehicle-details.tsx 9, components/reservations/reservation-form.tsx 9,
  pages/reservations/calendar.tsx 8, components/dialogs/backup-dialog.tsx 7,
  components/dashboard/quick-actions.tsx 7) vs 313 apiRequest references ;
  workaround at client/src/lib/csrf-fetch-interceptor.ts:46 (window.fetch monkey-patch, imported for
  side effect at client/src/main.tsx:1)
What: A third of the client's HTTP traffic bypasses the shared client. CSRF was retrofitted by
  patching window.fetch globally — the file's own comment (lines 6-11) says it exists because
  editing every call site was not attempted.
Consequence: The interceptor restores only the CSRF header. The raw call sites still lack
  session-expiry detection (queryClient.ts:8-19 — so a 401 on a raw fetch never logs the user out,
  the two-tab symptom recorded in phase 18), server error-field propagation (queryClient.ts:33-38 —
  which is how requiresOverride / ADMIN_PASSWORD_REQUIRED reach the caller) and the admin-password
  retry (queryClient.ts:110-143). Contributes to BUG-212 (no timeout, no retry, failures render as
  empty state).
Recommendation: Extend apiRequest to cover the multipart/FormData case (that is why most raw calls
  exist — apiRequest always JSON.stringifies, queryClient.ts:102) and migrate the call sites
  file-by-file, starting with pickup-return-dialogs.tsx. Keep the interceptor as a safety net.
Effort: M
```

```
CQ-019
Severity: MEDIUM
Category: inconsistency
Where: server/routes.ts:4604-4613 (error.message.includes('not found') / .includes('conflict')
  → 404 / 409) ; server/database-storage.ts:3076,3209 (throw new Error with English prose) ;
  server/routes.ts:3884-3886 (same storage error → 400) ; server/routes.ts:2614,3167 and
  server/routes/portal-requests.ts:189,234,361 (→ 409 with a conflicts[] array) ;
  server/index.ts:423-435 (global handler emits a third response shape)
What: Control flow by substring matching on English error messages, and three different response
  shapes ({message} 665×, {error} 98×, {error,message,stack?} from the global handler).
Consequence: The same business condition — "this vehicle is already booked" — returns 409 with
  structured conflicts from one endpoint, 400 with a prose string from another, and 500 from a third.
  Client code cannot branch on it reliably; BUG-148 (raw pg errors reaching clients) lives in the
  same gap. Renaming an error message silently changes an HTTP status code.
Recommendation: A small set of typed domain errors (ConflictError, NotFoundError, ValidationError)
  thrown by the storage layer and mapped once in the global handler at server/index.ts:423. Changes
  status codes on some endpoints — needs owner approval.
Effort: M
```

```
CQ-020
Severity: MEDIUM
Category: performance
Where: server/routes.ts:466 (GET /api/vehicles) and server/routes.ts:429
  (GET /api/vehicles/status/breakdown) both call storage.syncVehicleAvailabilityWithReservations()
  (server/database-storage.ts:224, 130 LOC, full-table re-derivation) before reading
What: Two read endpoints perform a full-table write on every request. The sync exists because the
  write paths do not maintain the status themselves (see CQ-011).
Consequence: Every vehicle list load — the most-used screen, 665 rows — issues an UPDATE storm, and
  makes GET /api/vehicles non-idempotent and non-cacheable (the handler also disables caching at
  routes.ts:461-463). Under the concurrent load of phase 13 this is also a lost-update surface.
Recommendation: Maintain availabilityStatus at the write paths (CQ-011) and reduce the sync to a
  scheduled reconciliation job — the schedulers for exactly this pattern already exist
  (server/serviceDueScheduler.ts, apkScanScheduler.ts). Behaviour change (status would lag a write
  by at most the scheduler interval instead of being recomputed on read) — needs owner approval.
Effort: M
```

```
CQ-021
Severity: MEDIUM
Category: maintenance
Where: server/__tests__/ (22 files) + shared/*.test.ts (3) — 36 of 102 production modules referenced;
  untested: server/routes.ts (7759), server/database-storage.ts (4477),
  server/utils/pdf-generator.ts (1490), server/backupService.ts (1239), server/routes/backups.ts (995),
  server/pdf-damage-check-generator.ts (811), server/index.ts (552),
  server/vehicle-status-helper.ts (320), server/utils/financial-reports.ts (301),
  server/utils/security/fileUploadSecurity.ts (280), server/middleware/audit.ts (232). Client: 0 tests.
What: Test coverage maps exactly onto the newest subsystems (portal, fines, CJIB). The rental core —
  every module named in CQ-003 through CQ-011 — has none.
Consequence: Every consolidation proposed above is currently unverifiable, which is itself the
  reason none of them has been done. It is also why BUG-202 (edit form always 400s) survived to a
  browser test in phase 18 rather than being caught at commit time.
Recommendation: Before any refactor, add characterisation tests for the three highest-risk seams:
  checkReservationConflicts (database-storage.ts:1528), the reservation status writers
  (routes.ts:3090,3230,3445), and resolveDocumentFilePath/getUploadsDir. The harness already exists
  (server/__tests__/portal-helpers.ts builds a staff test app at :117) — it is not a green-field cost.
Effort: L
```

```
CQ-022
Severity: MEDIUM
Category: dependency
Where: server/backupService.ts:829,838,962 (`require('fs').unlinkSync(...)` in an ESM module) ;
  ~50 `await import(...)` of first-party modules in hot paths, e.g. server/routes.ts:5504,5538,5735,
  5870,6003,6009 all lazily importing ./utils/pdf-generator
What: CommonJS require() in an ESM build, plus lazy dynamic imports used as the default import style
  rather than for actual lazy loading.
Consequence: BUG-207 — `require is not defined` throws inside restoreDatabase's cleanup, so a 20 MB
  plain dump is left beside the archive and then listed as a restorable backup. The dynamic imports
  hide the real dependency graph from madge (server/routes.ts's measured fan-out of 45 understates
  it) and defer module-load errors to request time.
Recommendation: Replace the three require() calls with the already-imported fs promises API
  (backupService.ts imports fs at the top). Convert first-party `await import` to static imports
  except where a genuine cycle or cost justifies it.
Effort: S
```

```
CQ-023
Severity: MEDIUM
Category: dead-code
Where: server/objectStorage.ts:5 (REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"),
  :10-15 (audience "replit") ; instantiated twice at server/routes.ts:98 and :266 and carried as two
  distinct RouteDeps fields (server/routes/deps.ts:12-13) ; unauthenticated route
  server/routes.ts:7338 GET /object-storage/* ; reachable from server/utils/pdf-generator.ts:85-91 ;
  server/index.ts:201-204 CORS allow-list for *.replit.app / *.replit.dev ;
  client/src/locales/{en,nl}/settings.json:846-847 offer "Replit Object Storage" in the backup UI
What: The Replit hosting integration was never removed. The app now runs on Coolify.
Consequence: A latent crash path (any template row with an absolute backgroundPath sends the PDF
  generator to 127.0.0.1:1106 and hangs until the connection is refused), an unauthenticated route
  that the security phase already flagged, a CORS allow-list entry for domains the owner does not
  control, and a UI option that cannot work.
Recommendation: Delete server/objectStorage.ts, the /object-storage/* route, the two RouteDeps
  fields, the fallback at pdf-generator.ts:85-91, the two CORS entries and the two locale keys.
  Check first whether any pdf_templates row still holds an absolute backgroundPath (one SELECT) —
  if so, that is a data migration and needs owner approval.
Effort: M
```

```
CQ-024
Severity: LOW
Category: inconsistency
Where: {message} 665× vs {error} 98× vs {success,message} 16× across server/**, plus
  server/index.ts:423-435 emitting {error:'Server Error', message, stack?}
What: Four error/response envelopes. client/src/lib/queryClient.ts:26-29 only knows how to read
  `message`, so anything returned as `{error: "..."}` surfaces to the user as raw JSON.
Consequence: Inconsistent user-facing error text; phase 18 saw a 500 render as an empty state.
Recommendation: Pick {message, code?, details?} and convert the 98 {error} sites mechanically. Do it
  together with CQ-019.
Effort: M
```

```
CQ-025
Severity: LOW
Category: inconsistency
Where: 183 of 234 client .tsx files use useTranslation; scripts/find-hardcoded-strings.cjs reports
  196 remaining hard-coded UI strings, including in files that already have the hook (e.g.
  client/src/pages/settings/damage-check-template-editor.tsx:1093,
  client/src/pages/settings/damage-check-templates.tsx:674,684)
What: i18n coverage is high but not enforced; the project ships its own detector
  (scripts/find-hardcoded-strings.cjs) that nothing runs.
Consequence: BUG-223 — English strings and US date formats in a Dutch UI ("No results.",
  "Showing 0 of 0", "Previous"/"Next" observed in phase 18).
Recommendation: Wire scripts/find-hardcoded-strings.cjs into `npm run check` as a warning, then
  burn the list down. The tool already exists and already works.
Effort: M
```

```
CQ-026
Severity: LOW
Category: inconsistency
Where: 420 `new Date(` in client/src, 116 toISOString() in server, 91 split('T')[0] truncations,
  106 date-fns format() calls, 45 toLocaleDateString ; client/src/lib/date-utils.ts exists but 6 of
  its 7 exports are dead (ts-prune: isWithinNextDays:15, isWithinNextMonths:36, formatDateRange:82,
  getDuration:89, getWeekDays:106, doDateRangesOverlap:114)
What: Dates are stored as `text` (shared/schema.ts uses text() for startDate/endDate) and handled
  with four different conventions; the module that was meant to own this is unused.
Consequence: BUG-224 — document timestamps two hours ahead of reality. `new Date(dateString)` on a
  bare `YYYY-MM-DD` parses as UTC midnight and then renders in local time, which is exactly the
  two-hour shift.
Recommendation: One date module in shared/ with explicit "calendar date" vs "instant" types; adopt
  it at the boundaries (API in/out, PDF, display) rather than everywhere at once.
Effort: L
```

```
CQ-027
Severity: LOW
Category: duplication
Where: server/routes/pdf-templates.ts:306,503 · server/routes/report-and-label-templates.ts:256,351 ·
  server/routes/damage-check-templates.ts:329,423 (6 near-identical background-upload routes, each
  with its own multer instance at :297, :250, :323) ; 16 multer({...}) instances total across server/**
What: The same upload-validate-move-unlink-old sequence written six times, with three different
  validation strictnesses.
Consequence: BUG-179/BUG-180 — only one family checks the extension whitelist, so a PDF background
  carrying JavaScript/OpenAction is accepted and copied into every generated contract. Any future
  upload policy has to be applied in six places and 16 multer configs.
Recommendation: One saveTemplateBackground(kind, id, file) plus one shared multer factory
  (server/utils/security/fileUploadSecurity.ts already exports createSecureMulterFilter — it is used
  by 15 of the 16 instances; the 16th is routes/fines.ts:72 importUpload, which has no filter at all).
Effort: M
```

```
CQ-028
Severity: LOW
Category: duplication
Where: server/middleware/permissions.ts:34 (exported requireAdmin) vs server/auth.ts:210 (closure
  copy, used only by server/auth.ts:223 POST /api/register)
What: Two admin gates with different 401 bodies ("Unauthorized" vs "Not authenticated") and one
  behavioural difference: permissions.ts:35 guards `!req.isAuthenticated || !req.isAuthenticated()`,
  auth.ts:203 assumes the method exists.
Consequence: Maintenance only today, but a policy change (e.g. adding a step-up check) applied to the
  exported one silently misses user registration — the most privileged endpoint in the app.
Recommendation: Delete the auth.ts copy and import from middleware/permissions.
Effort: S
```

```
CQ-029
Severity: LOW
Category: maintenance
Where: 982 console.* in server/** (routes.ts 109 console.log, index.ts 51, database-storage.ts 43,
  backupService.ts 37, pdf-generator.ts 35), 307 in client/src (vehicle-form.tsx 35,
  calendar.tsx 28, reservation-form.tsx 18) ; no logger module exists
What: No log levels, no structure, no redaction, and client debug logging ships to production.
Consequence: Phase 19 measured the log volume as a real cost; 01b records console.log lines carrying
  entity ids in the production bundle. Diagnosing a production incident means reading unstructured
  stdout.
Recommendation: A 30-line logger wrapper (level from env, JSON in production) and a mechanical
  replacement. Strip client console.log via the esbuild/vite `drop` option — one config line.
Effort: M
```

```
CQ-030
Severity: LOW
Category: dead-code
Where: server/utils/security/sessionManager.ts:55,69,90,106 (updateSessionActivity,
  getUserActiveSessions, revokeSession, revokeUserSessions) ·
  server/middleware/security/rateLimiter.ts:135 (checkLockoutMiddleware) ·
  server/middleware/security/sanitization.ts:60,69 (sanitizeHtml, validateFileUpload) ·
  server/services/booking-period.ts:10,17 · server/services/cjib/poller.ts:9,73 ·
  server/utils/email-service.ts:19 · shared/holidays.ts:125 ·
  client/src/hooks/use-socket.tsx:24, lib/cache-utils.ts:87,106, lib/calendar-styling.ts:237,
  lib/color-rules.ts:175, lib/portal-site.ts:21, lib/utils.ts:16,44,
  components/ui/{confirm-dialog.tsx:127, price.tsx:19, tabs-filter.tsx:15},
  components/customers/customer-search-picker.tsx:15, components/portal/ui.tsx:14
What: ~25 exported-but-unused symbols (ts-prune, hand-filtered to exclude shadcn/ui primitives,
  drizzle type exports and in-module uses). Notable: a complete session-revocation feature
  (4 functions, table active_sessions) that is built and never routed.
Consequence: Mostly noise, except the session-revocation set — a reader (or an auditor) reasonably
  assumes admins can revoke a session, and they cannot.
Recommendation: Delete, or wire up the session-revocation endpoints if that was the intent (that is
  a feature decision — needs owner approval).
Effort: S
```

---

## 10. What NOT to refactor

Things that look duplicated or wrong and should be left alone:

1. **`shared/transport-spare-status.ts`.** It looks like a fourth status helper. It is the opposite:
   `01b` records that it was written deliberately to centralise TBD derivation and stop drift with
   `reservations.spareVehicleStatus`. It is the pattern the rest of the code should copy.

2. **The 22 already-split route modules under `server/routes/`.** They are consistent, use
   `RouteDeps`, and (`01a`) have no permission gaps. The `idParam` triplication inside them (CQ-007)
   is worth consolidating; the modules themselves are fine.

3. **`server/services/portal-*` and `services/cjib/*`.** 19 modules, all tested, clear boundaries,
   no direct route coupling. This is the best code in the repository — do not fold it back into a
   "shared" layer to match the older code.

4. **API payload naming.** camelCase throughout, verified: zero snake_case keys in `res.json`
   literals, zero `req.body.snake_case`, zero `req.query.snake_case`. The `snake_case` you see is
   only in status *values* (`picked_up`, `needs_fixing`), which is also consistent.

5. **The 8 client import cycles around `use-portal-dialogs.tsx`.** Real, but benign under a bundler
   and confined to the portal dialog set. Untangling them touches 8 files for no behavioural gain.

6. **`shared/schema.ts` at 2 110 lines.** The graph report suggests splitting it (cohesion 0.02).
   It has 63 dependents — it is the one module every other module agrees on. Splitting it would
   produce 63 import churn diffs and no benefit. Leave it.

7. **`client/src/lib/utils.ts` `cn()`** and the shadcn/ui primitives ts-prune flags. `cn` has 33
   importers; the ui/*.tsx exports are library surface.

8. **The `documents/view|download` retry-with-alternate-path logic** (`routes.ts:5129-5140`,
   `:5183-5194`). It is a symptom of CQ-003, and it is currently the only thing making old rows with
   inconsistent `filePath` values readable. Fix CQ-003 first and migrate the rows; deleting the
   fallback before that would break existing documents.

9. **`archiver` for writing backups.** It works, is verified end-to-end in phase 17, and streams.
   The `tar` *dependency* should go (CQ-014) but the archiver code should not be touched.

10. **`vehicle-details.tsx` (3 978 LOC) and `settings-panel.tsx` (2 615 LOC).** Big, but they are
    tab containers — the complexity is breadth, not depth, and there are no tests to catch a
    regression from splitting them. Lower value than `calendar.tsx` (CQ-017); do those later or not
    at all.

---

## 11. Not analysed (why)

- **Runtime behaviour.** This phase was static only, per the brief. Nothing was executed against the
  application, no database was touched, no server was started.
- **Cyclomatic complexity per function.** No complexity tool ran: `eslint` is not configured in this
  repository (no `.eslintrc*`, no `eslint` dependency) and installing one would change the project
  config, which the brief forbids. Function size (§5) was measured instead, by brace-depth scanning.
- **`knip`.** Not run: it requires a config file to produce usable output on a repo with two entry
  points and a vite/esbuild split build, and adding one would be a project change. `ts-prune` plus
  hand-filtering and `madge --orphans` were used instead; the overlap between the two was used as a
  cross-check.
- **Client bundle composition and tree-shaking.** Would require a production build, out of scope.
- **`client/src/components/ui/*` (shadcn primitives).** Excluded from the dead-export analysis:
  they are vendored library surface, and ts-prune flags almost all of them by design.
- **Test *quality*** (assertions per test, mocking depth). Only the coverage *map* was built. The 25
  existing test files were not reviewed for whether they assert anything meaningful.
- **`.worktrees/` and `.claude/worktrees/`.** Excluded from every scan; they contain a second copy of
  the tree (including `startup-migration.js`) and would double-count everything.
- **Migrations for dropped tables.** `startup-migration.js:208-211` drops four legacy
  `damage_check_pdf_*` tables and `:93` backfills legacy damage-check fields. That code is
  *intentionally* retained for older installations; whether it can be removed depends on which
  schema versions exist in production, which is an operations question, not a static one.
- **`npm audit` triage.** Counted and cross-referenced against usage, but the per-advisory
  exploitability analysis belongs to phase 2 / the security phases.

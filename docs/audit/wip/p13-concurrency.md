# Phase 13 — Concurrency & race conditions

Audit server `http://localhost:5001`, database `lvs_audit` only. All created data prefixed
`AUDIT-P13` / plates `AU-13x-X`. Server stayed up the whole phase (final `/health` 200, uptime
~1168 s, pool healthy). No request killed the server.

## Method

- **Harness:** `docs/audit/wip/scripts/p13-lib.cjs` — persisted staff sessions, each with its own
  `fakeIp` (`10.13.1.1` admin, `10.13.1.2` a *second admin session* = "second tab of the same user",
  `10.13.1.3` throwaway manager `AUDIT-manager-1788982804001`) so the general 1000/15-min `apiLimiter`
  and the 5/15-min `loginLimiter` never collide. Login once per session, reuse cookies + CSRF.
- **True parallelism:** `burst()` fires each request through raw `http.request` with `agent:false`
  (no keep-alive pool — every request opens its own TCP connection), all started in the same tick via
  `Promise.all`, with an optional per-request `delayMs` stagger so a follower can be launched a fixed
  number of milliseconds behind the leader. Same technique RS-001/BUG-006 was proven with. Bursts
  capped at ≤30 to respect the shared server.
- **Verdict per test:** N parallel requests → HTTP outcome distribution → SQL count of the resulting
  rows/final state → consistency verdict. Every raw result saved next to the script as
  `p13-*.out.json`.
- **Scripts:** `p13-00-setup`, `p13-01-edit` (+ `p13-01b-tpl-contract`), `p13-02-lifecycle`,
  `p13-03-spare`, `p13-04-docs`, `p13-05-dblclick`, `p13-06-rapid`, `p13-07-tabs`, `p13-08-recycle`.
- Fixtures: vehicles `AU-1301-X..AU-13xx-X`, customers `AUDIT-P13 customer 1..3`.

## Test matrix

| # | Test | N × timing | Outcome distribution | Final DB state | Verdict |
|---|------|-----------|----------------------|----------------|---------|
| 1a | PATCH `/:id` two users, **different** partial fields | 2 ∥ | 200/200 | both columns kept | OK (column-level update) |
| 1b | PATCH `/:id` two users, **same** field | 2 ∥ | 200/200 | last commit wins, both told "ok" | lost update (same field) |
| 1c | PATCH `/:id` two tabs, **full-row** form bodies | 2 ∥ | 200/200 | tab A's `notes` reverted | **LOST UPDATE — C13-001** |
| 1c-seq | two tabs load same version, save one-after-other | 2 seq | 200/200 | tab A's `notes` reverted | **LOST UPDATE without any race — C13-001** |
| 1d | PATCH `/:id/basic` two users, full row | 2 ∥ | 200/200 | last writer wins | **LOST UPDATE — C13-001** |
| 1e | calendar drag (dates) ∥ `/basic` (stale dates) | 2 ∥ | 200/200 | `/basic` clobbered the drag | lost update (dates) |
| 2a | two users assign **different** vehicles to one reservation | 2 ∥ | 200/200 | last writer's vehicle | both told success, one wrong |
| 2b | two reservations → same vehicle/period via PATCH `/:id` | 2 ∥ | 200/200 | **2 booked rows on one vehicle** | **DOUBLE BOOKING — C13-002** |
| 2b-ctl | same, sequential | 2 seq | 200/409 | 1 row | conflict check works when not raced |
| 2c | two reservations → same vehicle/period via `/basic` | 2 ∥ | 200/200 | **2 booked rows on one vehicle** | **DOUBLE BOOKING — C13-002** |
| 3a | assign-spare same spare, same rental, two sessions | 2 ∥ | 200/400 | 1 replacement | OK (createReplacement dedup? no — see 3b) |
| 3b | assign-spare same spare, **two different rentals**, same days | 2 ∥ | 200/200 | **spare booked to 2 customers** | **SPARE DOUBLE-BOOK — C13-003** |
| 3c | maintenance-with-spare ∥ assign-spare, same rental+spare | 2 ∥ | 201/200 | **2 active replacements on one spare** | **SPARE DOUBLE-BOOK — C13-003** |
| 3c2 | maintenance-with-spare **double-click** | 2, +10 ms | 201/201 | **2 blocks + 2 spare reservations** | **NO IDEMPOTENCY — C13-004** |
| 3d | two transports claim same spare, same day | 2 ∥ | 201/201 | **spare on 2 transports** (00:00–23:59 window defeated) | **SPARE DOUBLE-BOOK — C13-003** |
| 3d-ctl | third transport, sequential | 1 | 409 (+leaves a transport row) | — | confirms BUG-142; race is C13-003 |
| 3e | 3× placeholder-reservations, same rental | 3 ∥ | 201/201/201 | **3 placeholders + 3 notifications** | dedup guard raced (BUG-032 class) |
| 4a | cancel ∥ pickup, 3 timings | 2 ∥ | 200/400 or 200/200 | consistent (cancelled, or picked_up) | OK |
| 4b | cancel ∥ edit | 2 ∥ | 200/200 | cancelled + edited notes | OK (no lost invariant) |
| 4c | return ∥ cancel (picked_up) | 2 ∥ | 200/200 | returned-then-cancelled, mileage consistent | OK-ish (status=cancelled after a real return) |
| 4d | two returns, different mileage | 2 ∥ | 200/400 | one return, vehicle mileage consistent | OK |
| 4e | two pickups, **different** contract numbers | 2 ∥ | 200/200 | **2 contract docs, 1 number lost** | **DOUBLE PICKUP — C13-006** |
| 4f | double-click pickup, same number | 2, +10 ms | 200/400 | 1 pickup, 1 contract | OK |
| 4g | double-click return | 2, +10 ms | 200/200 | **2 damage-check docs** | duplicate document (C13-010 class) |
| 5a | vehicle PATCH `{remarks}` ∥ pickup, 0..80 ms | 2 ∥ ×8 | 200/200 | pickup write never lost (0/8) | tested, no defect |
| 5a2 | vehicle PATCH `{availabilityStatus}` ∥ pickup | 2 ∥ ×3 | 200/200 | last writer wins on status | BUG-122 class |
| 5b | vehicle PATCH `{remarks}` ∥ mark-needs-service | 2 ∥ ×6 | 200/200 | service flag never lost (0/6) | tested, no defect |
| 5c | two users set different `availabilityStatus` + extra field | 2 ∥ | 200/200 | last writer wins | re-confirms BUG-122 |
| 6a | 10× GET `contracts/generate/:id` | 10 ∥ | 200×10 | **10 doc rows, 1 file, dup version labels** | C13-010 |
| 6b | 10× GET `damage-checks/generate/:id` | 10 ∥ | 200×10 (~4.7 s each) | 0 stored rows (this route streams only) | OK, no EBUSY |
| 6c | 10× transport generate-report, same transport | 10 ∥ | 201×10 | 10 rows, 10 distinct files | OK at this timing (Date.now suffix) |
| 6d | 10× POST `contracts/generate-versioned/:id` | 10 ∥ | 200×10 | **20 rows, "Unsigned 9"×5, "10"×5, 1 file** | C13-010 |
| 7 | double-click POST (12 entities) | 2, +15 ms | see inventory | customers/drivers/expenses/transports/blocks/portal-maint → **2 rows** | server-side duplicates — C13 summary |
| 8a | 30× same PATCH | 30 ∥ | 200×30 | consistent, pool ok | OK |
| 8b1 | 30× wrong password, 30 IPs, one account | 30 ∥ | 401×30 | **lock only after burst** | **LOCKOUT RACE — C13-005** |
| 8b2 | 30× wrong password, one IP | 30 ∥ | 401×5, 429×25 | 5 recorded | IP limiter holds |
| 8b3 | 30× correct login, one IP | 30 ∥ | 200×5, 429×25 | 5 sessions | limiter holds; but multi-session (BUG-095) |
| 8c | 30× heavy GETs, /health polled | 30 ∥ ×5 | 200×all | pool saturates (waiting≤40), recovers | no 5xx; `/api/reservations` ~4.2 s p50 under load |
| 9a | logout tab1 ∥ mid-request tab2 | 2 ∥ | 200/200 | in-flight completes, then 401 | OK (session model) |
| 9c | change-password from two tabs, different new pw | 2 ∥ | 200/200 | **only last pw works, both told ok** | C13-009 |
| 9d | admin `active=false` ∥ live session | seq | writes still 200 | live session keeps working until re-login | see notes (BUG-091 class) |
| 9e | admin removes permission ∥ live session | seq | GET/PATCH → 403 | permission change applies immediately | OK |
| 10a | PUT system-settings partial bodies | 2 ∥ | 200/200 | both kept (undefined skipped) | OK |
| 10b | PUT system-settings **full-form** bodies | 2 ∥ | 200/200 | one field reverted | **LOST UPDATE — C13-008** |
| 10c | PATCH pdf-template, two designers add a field | 2 ∥ | 200/200 | **one field lost (blob overwritten)** | **LOST UPDATE — C13-008** |
| 11a | 10× GET next-contract-number | 10 ∥ | 200×10 | all identical (`999999`) | suggestion not reserved |
| 11b | 3 parallel pickups, same suggested number | 3 ∥ | 200/400/400 | 1 pickup, 2 raw DB errors | re-confirms BUG-038 |
| 12a | parallel DELETE same vehicle, two sessions | 2 ∥ | 200/404 | **2 recycle-bin snapshots** | **ORPHAN SNAPSHOT — C13-007** |
| 12b | restore ∥ delete, then delete ∥ restore | 2 ∥ ×2 | 200/404, 200/409 | consistent (1 vehicle or 0, clean records) | OK |
| 12c | DELETE vehicle ∥ pickup of its reservation | 2 ∥ ×3 | 200/200 | vehicle+reservation+contract all vanish into snapshot | see notes (recoverable) |
| 12d | restore ∥ recreate same plate | 2 ∥ | 409/201 | exactly 1 vehicle, clean | OK |

## Findings summary table

| id | Severity | Feature | One-line |
|----|----------|---------|----------|
| C13-001 | MEDIUM | Reservation edit | PATCH `/:id` & `/basic` have no optimistic locking; two tabs saving the full form silently drop each other's fields (also reproduces with **zero** concurrency) |
| C13-002 | HIGH | Reservation edit | Two reservations moved onto the same vehicle/period in parallel both commit — double booking via the edit path (conflict check is check-then-act, no lock) |
| C13-003 | HIGH | Spare vehicle | One spare double-allocated under concurrency: two different rentals (assign-spare), assign-spare ∥ maintenance-with-spare, and two transports the same day (the 00:00–23:59 guard window is defeated by the race) |
| C13-004 | MEDIUM | maintenance-with-spare | No idempotency/transaction: a double-click makes **two** maintenance blocks + two spare reservations (staff-path analog of portal BUG-141) |
| C13-005 | HIGH | Login | Per-account lockout does not throttle a **concurrent** password-guess burst — 30 parallel wrong guesses all evaluated before the 5-attempt lock engages |
| C13-006 | MEDIUM | Pickup | Two parallel pickups with **different** contract numbers both succeed → duplicate contract document + a silently overwritten contract number + last-writer mileage |
| C13-007 | LOW | Recycle bin | Parallel delete of one vehicle leaves a **duplicate/orphan** `deleted_records` snapshot (the losing call returns 404 but its snapshot insert still commits) |
| C13-008 | MEDIUM | Settings / PDF templates | Concurrent full-form saves clobber: `PUT /api/system-settings` and `PATCH /api/pdf-templates/:id` are read-merge-write / whole-blob replace, no merge, no version check |
| C13-009 | LOW | Change password | Parallel change-password from two tabs both return 200; only the last-committed password works, the user is told both succeeded |
| C13-010 | LOW | Document generation | Concurrent contract generation computes the version number from a racing read → duplicate "Contract (Unsigned) N" labels; double-click generate/return also makes duplicate document rows |

**Severity totals (new):** CRITICAL 0 · HIGH 3 · MEDIUM 4 · LOW 3 — 10 new defects.

## Tested — no new defect

- **Vehicle PATCH ∥ pickup (5a) and ∥ mark-needs-service (5b):** 8 and 6 staggered timings (0–80 ms);
  the pickup's mileage/`rented` write and the service flag were **never** lost. The read-merge-write
  window (BUG-122) exists but did not swallow the *other* endpoint's write in these runs — consistent
  with phase 9's own note that the PATCH-vs-pickup race did not reproduce in 6 tries.
- **cancel ∥ pickup / cancel ∥ edit / two returns / two pickups same number (4a,4b,4d,4f):** the
  status guards (`status==='booked'`, `status==='picked_up'`, `deletedAt` filter on the status
  endpoint) held; the loser got a clean 400, final state consistent. Double-click **with the same
  contract number** (4f) is correctly 200/400.
- **restore ∥ delete and restore ∥ recreate-plate (12b, 12d):** consistent every time — one vehicle or
  none, records clean, no 5xx (the losing restore is a clean 409, the recreate a clean 201/409 pair).
- **30× heavy GET bursts (8c):** no 5xx, no crash. The pg pool saturates (observed `waiting` up to 40)
  and `GET /api/reservations` degrades to ~4.2 s p50 (2.3–5.1 s) under 30-way load vs a 150 ms
  single-request baseline, but every request completed 200 and the pool drained back to idle. Recorded
  as a load-degradation observation, not a defect.
- **Login limiter under burst (8b2/8b3):** the per-IP `loginLimiter` correctly caps a single IP at 5
  (rest 429), for both wrong and correct passwords.
- **admin removes permission mid-session (9e):** `deserializeUser` reloads the user row per request, so
  the revoked permission takes effect on the very next call (403). Correct.

## Not tested (why)

- **>30 parallel per burst** — shared audit server; 20–30 was enough to prove every race here (RS-001
  needed only 20).
- **damage-check interactive-save race and fines/notifications concurrency** — out of the phase-13
  scope list; damage-check *PDF* generation was covered (6b).
- **Real reverse-proxy `X-Forwarded-For` stripping** — this machine has no proxy; the lockout race
  (C13-005) is demonstrated with distinct spoofed IPs, which is exactly the BUG-009 precondition.
- **Portal booking-approval race** — already filed as BUG-141; the staff maintenance-with-spare analog
  is filed fresh as C13-004.

## Client double-submit protection inventory

Every primary create/edit **form submit button** disables itself on the mutation's `isPending`, so a
human double-click on the button is blocked within a single tab:

| Form / dialog | Guard | File |
|---|---|---|
| Reservation form | `disabled={createReservationMutation.isPending || hasOverlap}` | `client/src/components/reservations/reservation-form.tsx:2704` |
| Customer form | `disabled={createCustomerMutation.isPending}` | `client/src/components/customers/customer-form.tsx:880` |
| Vehicle form | `disabled={createVehicleMutation.isPending}` | `client/src/components/vehicles/vehicle-form.tsx:2019` |
| Transport dialog | `disabled={mutation.isPending}` | `client/src/components/delivery/transport-dialog.tsx:1050` |
| Expense form | `disabled={createExpenseMutation.isPending}` | `client/src/components/expenses/expense-form.tsx:585` |
| Portal request form | `disabled={submit.isPending}` | `client/src/components/portal/request-form.tsx:193` |
| Driver dialog | `disabled={mutation.isPending}` | `client/src/components/customers/driver-dialog.tsx:517` |
| Pickup / Return dialogs | `disabled={pickupMutation.isPending}` / `returnMutation.isPending` | `client/src/components/reservations/pickup-return-dialogs.tsx:1001,1801` |
| Spare-vehicle dialog | `disabled={assignSpareMutation.isPending}` | `client/src/components/reservations/spare-vehicle-dialog.tsx:262` |
| Spare-vehicle-assignment (placeholder) | `disabled={assignVehiclesMutation.isPending}` | `client/src/components/reservations/spare-vehicle-assignment-dialog.tsx:338` |
| Status-change dialog | `disabled={revertMutation.isPending}` | `client/src/components/reservations/status-change-dialog.tsx:262` |

**What this protection does NOT cover (and why every race above still fires):**

1. **It is per-tab and per-button only.** It shares nothing with a second browser tab, a second staff
   member, or a scripted/API client — the entire threat model of this phase. The server has **no**
   idempotency key, no optimistic-lock token, and no request de-duplication on any of these endpoints,
   so two independent submitters always both reach the handler.
2. **The calendar drag/drop path has no submit button to disable** — it fires
   `PATCH /api/reservations/:id` directly on drop (`calendar.tsx`), so the `isPending` guard never
   applies. This is the exact body shape behind C13-002 and BUG-106.
3. **`maintenance-with-spare` (C13-004)** is driven from `schedule-maintenance-dialog.tsx`; even though
   its button disables, the *server* has no dedup, so any path that fires it twice (a retry, a
   double-navigation, an API client) makes two blocks.
4. **No server-side guard exists for the login/lockout burst (C13-005)** — that is a headless HTTP
   attack, no client involved.

---

## BUGs

### BUG C13-001
Severity: MEDIUM
Feature: Reservation edit — lost update (no optimistic locking on `PATCH /:id` and `/:id/basic`)
Status: OPEN
Reproduction: `p13-01-edit.cjs` tests 1c, 1c-seq, 1d. Reservation 3456. Two sessions (admin + manager)
each `GET` the reservation, then each PATCH the **whole row** (the shape `reservation-form.tsx` sends):
tab A changes `notes`, tab B changes `totalPrice`.
- 1c (parallel, N=2): 200/200 — final row has tab B's `totalPrice` **and tab A's `notes` reverted** to
  the pre-edit value.
- 1c-seq (no race at all, N=2 sequential): both load the same version, tab A saves `notes`, then tab B
  saves its stale copy → 200/200, tab A's `notes` silently gone.
- 1d (`/basic`, parallel): 200/200, last writer wins.
Expected: a save that does not touch a field must not revert it; concurrent/stale saves should either
merge per-column or fail with a conflict (optimistic lock on `updatedAt`/version).
Actual: `PATCH /:id` persists `req.body` verbatim as a full row; `/basic` re-parses the whole row
through `insertReservationSchema`. Neither reads-then-locks, neither checks `updatedAt`. Whoever
commits last overwrites every column the other changed, and both callers get 200 with their own value
echoed.
Root cause: `server/routes.ts:3625-3636` (`/basic` builds the update from the full parsed row) and
`server/routes.ts:3648-3690` (`/:id` sets `dataWithTracking = {...req.body}`); `updateReservation`
(`server/database-storage.ts:1209`) does a plain `UPDATE … SET dataToUpdate WHERE id AND deletedAt IS
NULL` with no version predicate.
Affected files: `server/routes.ts` (`PATCH /api/reservations/:id`, `/:id/basic`),
`server/database-storage.ts:1209` (`updateReservation`).
Affected data: `reservations` 3456 (test values). In production: any reservation edited by two people
close together, or by one person whose form held a stale copy.
Security impact: none.
Business impact: a field an editor never touched (price, dates, driver, notes) is reverted to a stale
value by another save — the exact "two people editing the same booking" case, and it needs no
concurrency to fire (1c-seq). Same class as BUG-122 (vehicles) but on the reservation entity and its
two edit endpoints, which BUG-122 does not cover.
Fix: build the SET list only from keys actually present (validate with `insertReservationSchema.partial()`),
or add optimistic concurrency on `updatedAt` (reject with 409 when the stored `updatedAt` moved).
Regression test: two sessions load the same reservation; A saves one field, B (stale) saves another;
assert both fields hold their new values, or B gets 409.

### BUG C13-002
Severity: HIGH  (same data-corruption class as CRITICAL BUG-006 — double booking — but on the edit path and requiring a genuine race; consider elevating to CRITICAL)
Feature: Reservation edit — double booking via `PATCH /:id` and `/:id/basic` under concurrency
Status: OPEN
Reproduction: `p13-01-edit.cjs` tests 2b, 2c. Two free reservations on two vehicles; in parallel move
both onto the **same** vehicle for the **same** period.
- 2b via `PATCH /:id` (body carries `vehicleId`+`startDate`, so the conflict check *does* run): both
  200 → `SELECT … WHERE vehicle_id=1825 AND status='booked'` = **2 overlapping rows (3457, 3458)**.
- 2c via `/:id/basic`: both 200 → **2 overlapping rows (3461, 3462)** on vehicle 1826.
- 2b-control (sequential): 200 then **409** "Reservation conflicts with existing bookings" — the check
  is correct, it just isn't serialized.
Expected: exactly one of the two concurrent edits succeeds; the other gets 409.
Actual: `checkReservationConflicts` (a plain `SELECT`) and the subsequent `updateReservation` run with
no transaction and no row lock, so both requests read "no conflict" before either writes. Distinct from
BUG-106 (check *skipped* when `vehicleId` absent) and BUG-107 (turnover gap): here the check **runs and
still races**. Same root as BUG-006 but on the edit path rather than create.
Root cause: `server/routes.ts:3648-3666` (`PATCH /:id`: `if (reservationData.vehicleId && reservationData.startDate) { checkReservationConflicts(...) }` then `updateReservation`, not atomic) and
`server/routes.ts:3121-3168` (`/basic`: same check-then-update); `checkReservationConflicts`
(`server/database-storage.ts:1528`) has no `FOR UPDATE`.
Affected files: `server/routes.ts` (both PATCH handlers), `server/database-storage.ts`.
Affected data: `reservations` 3457/3458 (vehicle 1825) and 3461/3462 (vehicle 1826), left overlapping
as evidence.
Security impact: none (requires `MANAGE_RESERVATIONS`).
Business impact: the same physical car booked to two customers for the same week — the core booking
invariant — reachable by two staff editing/moving bookings at once, or the calendar drag path fired
twice.
Fix: wrap conflict-check + update in one `db.transaction` with `SELECT … FOR UPDATE` on candidate
overlaps (or an advisory lock on `vehicleId`), or the Postgres exclusion constraint proposed for
BUG-006; map the violation to 409.
Regression test: two concurrent edits moving two reservations onto one vehicle/period → exactly one
201/200, one 409; one row remains.

### BUG C13-003
Severity: HIGH
Feature: Spare vehicle — one spare double-allocated under concurrency (assign-spare, maintenance-with-spare, transports)
Status: OPEN
Reproduction: `p13-03-spare.cjs`.
- 3b: two different rentals (RA 3506, RB 3507) call `POST /:id/assign-spare` with the **same** spare
  (1857) for the **same** days, in parallel → both 200 → two active `replacement` reservations
  (3508 cust 1282, 3509 cust 1283) both on vehicle 1857, 2029-06-02..05. The spare is promised to two
  customers.
- 3c: `maintenance-with-spare` ∥ `assign-spare` for the same rental (RC 3510) and same spare (1859) →
  201 + 200 → two active replacements (3512 booked, 3513 pending) on one spare for one rental.
- 3d: two transports (for vehicles 1860 and 1862) both request spare 1861 on 2029-09-03, in parallel →
  both 201 → spare reservations 3519 and 3520, both `2029-09-03 00:00–23:59`. The explicit full-day
  window in `applyTransportUpdate` — added *specifically* so two transports can't share a spare on one
  day — is defeated because the two inserts run in separate transactions that don't see each other's
  uncommitted row. Sequential third transport correctly 409s.
Expected: a spare already committed to one rental/transport for a period conflicts for any second
claim; exactly one concurrent claim wins.
Actual: `createReplacementReservation` and `applyTransportUpdate` both do check-then-insert
(`checkReservationConflicts` then `INSERT`) with no lock spanning the two claimants.
Root cause: `server/database-storage.ts:3178-3239` (`createReplacementReservation`: conflict check at
:3206, insert at :3233, no lock) and `server/database-storage.ts:2093-2122` (`applyTransportUpdate`'s
`00:00–23:59` conflict check inside a per-transport transaction that cannot see a sibling transaction's
uncommitted spare row).
Affected files: `server/database-storage.ts` (`createReplacementReservation`, `applyTransportUpdate`),
`server/routes.ts` (`assign-spare`, `maintenance-with-spare`, `POST /api/transports`).
Affected data: replacement reservations 3508/3509, 3512/3513, 3519/3520.
Security impact: none.
Business impact: one physical spare car is simultaneously reserved for two customers or two transports;
one party arrives to no vehicle. Extends BUG-032 (which was assign-spare twice on the *same* rental)
to the cross-rental and cross-transport cases, and shows the transport day-window guard is not
concurrency-safe.
Fix: serialize with `SELECT … FOR UPDATE` on the spare's overlapping rows (or an advisory lock keyed on
the spare vehicleId) inside the insert transaction; for transports, run both the conflict check and the
spare-reservation insert of the two transports under a lock on the related vehicle.
Regression test: two parallel spare claims (any mix of assign-spare/maintenance-with-spare/transport)
for one spare and overlapping dates → exactly one succeeds.

### BUG C13-004
Severity: MEDIUM
Feature: `POST /api/reservations/maintenance-with-spare` — no idempotency, double-click makes duplicates
Status: OPEN
Reproduction: `p13-03-spare.cjs` test 3c2. The exact same `maintenance-with-spare` body sent twice
10 ms apart (a double-click on "schedule maintenance") → **both 201** → two maintenance blocks (3515,
3516) on vehicle 1864 for the same dates, and two spare replacement reservations (3517, 3518) on the
same spare for the same rental.
Expected: one block, one spare; the second call a no-op or 409.
Actual: the handler creates the block via `storage.createReservation` and the replacements via
`Promise.all` with no surrounding transaction, no dedup on `(vehicleId,dates,type=maintenance_block)`,
and no lock. Two concurrent calls each create a full set. Staff-path analog of BUG-141 (portal
double-approval).
Root cause: `server/routes.ts:2787-2960` — the "create new maintenance block" branch (`maintenanceReservation = await storage.createReservation(maintenanceWithTracking)` at ~:3005 with the
replacement `Promise.all` after it) runs outside any transaction and never checks for an existing block.
Affected files: `server/routes.ts` (`maintenance-with-spare`).
Affected data: maintenance blocks 3515/3516, replacements 3517/3518.
Security impact: none.
Business impact: duplicate maintenance blocks and duplicate spare bookings from one click — the same
data shape BUG-037/BUG-141 describe, now on the staff maintenance-with-spare route.
Fix: wrap the whole operation in `db.transaction`; before creating the block, look for a non-deleted
block on the same vehicle/period and reuse or reject; give the replacement inserts the same lock as
C13-003.
Regression test: send the same maintenance-with-spare body twice concurrently → one block, one spare,
the second call 409/no-op.

### BUG C13-005
Severity: HIGH
Feature: Login — per-account lockout does not throttle a concurrent guess burst
Status: OPEN
Reproduction: `p13-06-rapid.cjs` test 8b1. Throwaway user `AUDIT-P13-lock1-…`. 30 `POST /api/login`
with **wrong** passwords, each from a distinct `X-Forwarded-For` (so the per-IP `loginLimiter` never
engages — the BUG-009 precondition), fired in parallel → **all 30 return 401** ("Incorrect password"),
all 30 recorded in `login_attempts`. Only *after* the burst is the account locked (a subsequent correct
login returns 429 "Account temporarily locked"). So 30 guesses were evaluated before the 5-attempt lock
took effect. (Control 8b2, same IP: the IP limiter caps it at 5×401 then 429×25 — that layer works.)
Expected: no more than ~5 password evaluations before the account locks, regardless of source IP or
concurrency.
Actual: `checkAccountLockout` counts the **committed** failed `login_attempts` rows from the last 15
min *before* the current attempt is recorded; under concurrency all 30 requests read a count < 5 (none
of the sibling attempts has been inserted/committed yet) and proceed to a full password verification,
then each records its own failure.
Root cause: `server/auth.ts:268-292` (lockout pre-check) followed by `passport.authenticate` and
`recordLoginAttempt` *after* the verification; `server/middleware/security/rateLimiter.ts:40-90`
(`checkAccountLockout` reads a count with no locking/serialization). Combined with BUG-009 (per-IP
limiter bypass via client-controlled `X-Forwarded-For`), the account-lockout layer — the intended
backstop when the IP layer is bypassed — provides no throttle against a parallel attack.
Affected files: `server/auth.ts:268-370`, `server/middleware/security/rateLimiter.ts:40-90`.
Affected data: `login_attempts` (30 rows for the throwaway account).
Security impact: online brute-force amplification. An attacker who rotates `X-Forwarded-For` (BUG-009)
and fires guesses in parallel gets ~N password checks per lock window instead of 5 — the lockout is not
a real rate limit against concurrency. Passwords are scrypt-verified, so throughput is bounded by CPU,
but the "5 attempts" guarantee is void.
Business impact: the documented account-lockout control (audit §Authentication) does not hold under the
concurrent+spoofed-IP case, weakening the story that "the login path itself is solid".
Fix: make the attempt atomic — insert the failed attempt first and lock on a conditional check
(`INSERT … RETURNING`, then count within the same transaction / `SELECT … FOR UPDATE` on a per-username
counter), or use an atomic counter store keyed on username with a hard cap that concurrent requests
contend on. Pair with fixing BUG-009 so the IP layer is not bypassable.
Regression test: 20 parallel wrong-password logins for one account (distinct IPs) → at most ~5 reach
password verification, the rest 429; a correct login during the window is 429.

### BUG C13-006
Severity: MEDIUM
Feature: Pickup — two concurrent pickups with different contract numbers both succeed
Status: OPEN
Reproduction: `p13-02-lifecycle.cjs` test 4e. One `booked` reservation; two parallel
`POST /:id/pickup` with **different** contract numbers (`AUDIT-P13-4e-A` mileage 1500,
`AUDIT-P13-4e-B` mileage 1600) → **both 200**. Final: reservation `picked_up`,
`contract_number='AUDIT-P13-4e-B'`, mileage 1600 (last writer), and **two** "Contract (Unsigned)"
document rows (343, 344) with two physical PDFs. (Double-click with the *same* number, 4f, is correctly
200/400 because the unique constraint catches it.)
Expected: exactly one pickup succeeds; the second gets 400 "Cannot pickup reservation with status:
picked_up" (which is what happens sequentially).
Actual: `pickupReservation` reads the reservation, checks `status==='booked'`, then updates — no lock.
Both requests read `booked`, both proceed, both generate a contract PDF + document row; the second
UPDATE overwrites contract number and mileage.
Root cause: `server/database-storage.ts:1624-1712` (`pickupReservation`: `getReservation` → status
check → `UPDATE … WHERE id` with no `AND status='booked'` predicate and no lock); the contract-PDF +
`createDocument` block in `server/routes.ts:4067-4247` runs per request.
Affected files: `server/database-storage.ts:1624`, `server/routes.ts` (`POST /:id/pickup`).
Affected data: reservation 3485 (documents 343, 344).
Security impact: none.
Business impact: one handover produces two contract documents with different numbers and a
non-deterministic final mileage; the "losing" contract number is consumed/lost. Confusing paperwork on
the one workflow where the contract-number suggestion is supposed to keep things unique.
Fix: make the status transition a conditional `UPDATE … WHERE id=$1 AND status='booked' RETURNING *`
and treat 0 rows as "already picked up" (400); generate the contract only after the update wins.
Regression test: two concurrent pickups (different numbers) → one 200, one 400; exactly one contract
document row.

### BUG C13-007
Severity: LOW
Feature: Recycle bin — parallel delete of one vehicle leaves a duplicate/orphan snapshot
Status: OPEN
Reproduction: `p13-08-recycle.cjs` test 12a. Vehicle 1868 (`AU-13R1-X`) with one reservation. Two
sessions `DELETE /api/vehicles/1868` in parallel → **200 (mgr) / 404 (admin)**, vehicle gone, but
`deleted_records` holds **two** snapshot rows for entity 1868 (id 50 by admin, id 51 by mgr), each a
full snapshot claiming `reservations:1`. Two `vehicle.delete` success audit rows too.
Expected: one deletion, one recycle-bin snapshot; the losing call is a clean 404 with no side effect.
Actual: `deleteVehicle` runs in a transaction that (1) inserts the snapshot, then (2)
`tx.delete(vehicles) … returning` and returns `!!deleted`. The losing transaction's delete matches 0
rows so it returns `false` (→ route 404) **but the transaction still commits**, so its snapshot insert
persists. Result: a duplicate snapshot pointing at a vehicle this call did not delete.
Root cause: `server/database-storage.ts:535-620` — the snapshot `tx.insert(deletedRecords)` happens
before `tx.delete(vehicles)`, and a 0-row delete returns `false` instead of throwing, so the
transaction commits the orphan snapshot; `server/routes.ts:1657` maps `false` to 404.
Affected files: `server/database-storage.ts:535-620`, `server/routes.ts:1624-1690`.
Affected data: `deleted_records` 50 (orphan) + 51 (real) for vehicle 1868.
Security impact: none.
Business impact: recycle-bin clutter — two identical "restore" entries for one deletion; restoring the
orphan later hits `id_taken`/`license_plate_taken` (or the BUG-043 concurrent-restore 500 path).
Confusing, not destructive.
Fix: in `deleteVehicle`, select-for-update or delete the vehicle row *first* and bail out (roll back /
return before inserting the snapshot) when 0 rows are affected, so only the transaction that actually
deletes writes a snapshot.
Regression test: two concurrent deletes of one vehicle → exactly one 200, one 404/409, and exactly one
`deleted_records` row.

### BUG C13-008
Severity: MEDIUM
Feature: Settings & PDF templates — concurrent saves clobber (no merge, no optimistic lock)
Status: OPEN
Reproduction: `p13-01-edit.cjs`/`p13-01b-tpl-contract.cjs` tests 10b, 10c.
- 10b: two parallel `PUT /api/system-settings`, each sending the **whole** settings form, one changing
  `serviceReminderKm=1414`, the other `apkReminderDays=14` → 200/200 → final row has `apk_reminder_days=14`
  but `service_reminder_km` reverted to 1000 (the other writer's stale copy won). (10a, *partial*
  bodies, is fine because `updateSettings` skips undefined keys.)
- 10c: two designers each `PATCH /api/pdf-templates/8` adding a different field to `fields` → 200/200 →
  the persisted `fields` blob contains field B only; field A is gone.
Expected: concurrent edits to different fields both survive, or the later save fails with a conflict.
Actual: both endpoints replace the whole record/blob from a copy the client read earlier; last writer
wins.
Root cause: `server/routes/app-settings.ts:463-508` + `server/database-storage.ts:3599-3623`
(`updateSettings` sets every provided column); `server/routes/pdf-templates.ts:194-266` +
`server/database-storage.ts:2401` (`updatePdfTemplate` writes `fields` as a whole JSON blob). No
version/`updatedAt` check on either.
Affected files: `server/routes/app-settings.ts`, `server/routes/pdf-templates.ts`,
`server/database-storage.ts` (`updateSettings`, `updatePdfTemplate`).
Affected data: `settings` row 1 (restored after test); pdf-template 8 `fields` (restored after test).
Security impact: none.
Business impact: two admins tuning settings, or two people editing a PDF template's field layout at
once, silently lose one set of changes. Lower stakes than a booking but the same missing-optimistic-lock
pattern (BUG-122 class) on shared configuration.
Fix: optimistic concurrency on `updatedAt` for both endpoints (409 on stale), or accept only the changed
keys; for templates, edit `fields` as a keyed collection rather than replacing the whole array.
Regression test: two concurrent full-form saves of different fields → both survive or the second 409s.

### BUG C13-009
Severity: LOW
Feature: Change password — parallel change from two tabs both succeed
Status: OPEN
Reproduction: `p13-07-tabs.cjs` test 9c. One user logged in twice (two tabs sharing the cookie). Both
tabs `POST /api/users/change-password` in parallel with the same current password and **different** new
passwords (`…A`, `…B`) → **both 200**. Afterward only the last-committed password works (`login A`→401,
`login B`→200); the user was told both changes succeeded.
Expected: one succeeds; the second fails "current password incorrect" (the current password no longer
matches after the first change) or is otherwise rejected.
Actual: both requests verify the current password against the pre-change hash (check-then-write, no
lock), both hash their new value and write; last writer wins.
Root cause: `server/routes/users.ts:349-398` — current-password verification and the hash write are not
atomic and hold no lock; also relates to BUG-091 (other sessions not revoked after a password change).
Affected files: `server/routes/users.ts:349-398`.
Affected data: throwaway user only.
Security impact: minor — needs an already-authenticated session in two tabs. No privilege gain; the
final password is one of the two the legitimate user chose.
Business impact: confusing — the user sees two success toasts but only one password works; the other is
silently the effective one.
Fix: serialize the change (conditional update guarded by the old hash, or a per-user lock); reject the
loser with the standard "current password incorrect".
Regression test: two concurrent change-password calls, different new passwords → one 200, one 4xx.

### BUG C13-010
Severity: LOW
Feature: Document generation — concurrent generation produces duplicate version labels / duplicate rows
Status: OPEN
Reproduction: `p13-04-docs.cjs` tests 6a, 6d (and 4g).
- 6a: 10× parallel `GET /api/contracts/generate/:id` → 10 document rows but labels
  `Contract (Unsigned)`, `…2`, `…2`, `…3`, `…4`, `…4`, `…5`…: version numbers computed from
  `existingDocs` read concurrently, so several rows share a version label, and all 10 rows point at
  **one** physical file (`…_contract_20260910.pdf`).
- 6d: 10× parallel `generate-versioned` → 20 rows with `Unsigned 9`×5 and `Unsigned 10`×5.
- 4g: double-click return → two "Damage Check" rows/files for one return.
Expected: unique, monotonic version numbers and one document row per real generation (or an
overwrite/supersede of the prior unsigned doc).
Actual: the version number is `Math.max(existing versions)+1` computed from a read that races the other
in-flight generations, so duplicates appear; the on-disk filename is date-based (no per-generation
component) so all same-day rows collide on one file — extending the known single-file finding
(`documents-mail.md`) into a concurrency case.
Root cause: `server/routes.ts:5600-5640` (contract version numbering from `getDocumentsByReservation`),
`server/routes.ts:5900-5945` (generate-versioned, same pattern), `server/routes.ts:6215-6250`
(damage-check versioning); filename `${plate}_contract_${currentDate}.pdf` with no unique component.
Affected files: `server/routes.ts` (contract/damage-check generation + versioning).
Affected data: reservation 3531 (10 contract rows, one file); 3532 versioned rows.
Security impact: none.
Business impact: duplicate "Unsigned N" document rows with colliding version labels and a shared
underlying PDF; cosmetic/clutter, not data loss. Mostly relevant when contract generation is triggered
repeatedly (auto-regen on edit + a manual click).
Fix: include a per-generation unique component in the filename and compute the version inside a
transaction (or supersede the prior unsigned row) rather than from a racing read.
Regression test: 5 concurrent generations → 5 distinct files and 5 distinct version labels, or a single
superseding row.

---

## Re-confirmed existing bugs (id + new evidence)

- **BUG-006 (double booking on create, CRITICAL):** `p13-05-dblclick.cjs` — a double-click
  `POST /api/reservations` (same body, 15 ms apart) → 201/409, 1 row (the unique overlap wasn't hit
  here because the two fired far enough apart for the check to serialize; the true 20-way race remains
  as originally proven). New evidence that the *edit* path has the same unlocked check → **C13-002**.
- **BUG-032 (assign-spare twice → two active spares, MEDIUM):** extended by **C13-003** — the same
  unlocked check double-books one spare across two rentals and across two transports, and test 3e shows
  the placeholder dedup guard also races (3× parallel `POST /api/placeholder-reservations` → 3
  placeholders + 3 notifications for one rental).
- **BUG-038 (raw DB error on duplicate contract number, MEDIUM):** `p13-01-edit.cjs` test 11b — 3
  parallel pickups with the same suggested contract number → 1×200, 2×400 with the raw
  `duplicate key value violates unique constraint "reservations_contract_number_unique"`; and 11a shows
  `GET /api/settings/next-contract-number` returns the identical number to 10 concurrent callers (the
  suggestion is never reserved), which is the setup that makes the collision routine.
- **BUG-090 (DELETE `/:id` check-then-act race → 500, MEDIUM):** not re-triggered as a 500 here (my
  concurrent deletes of a *reservation* were not run this phase; the *vehicle* delete race surfaced the
  new C13-007 instead). Cited, not re-filed.
- **BUG-091 (password change doesn't revoke other sessions, MEDIUM):** `p13-07-tabs.cjs` 9c/9d — after
  a password change tab B is not invalidated; and setting `active=false` on a live user still lets that
  session read and write (`/api/user` 200, PATCH 200) until it re-logs in (fresh login 403). New
  evidence, no new number.
- **BUG-095 (logout leaves `active_sessions` rows) / multi-session:** `p13-06-rapid.cjs` 8b3 — 5
  concurrent logins created 5 `active_sessions` rows for one user; no session capping. Cited.
- **BUG-122 (concurrent vehicle PATCH loses updates, MEDIUM):** `p13-02-lifecycle.cjs` 5c — two
  parallel `PATCH /api/vehicles/:id` setting different fields → last writer wins (read-merge-write).
  Re-confirmed; the pickup-vs-PATCH variant again did **not** reproduce (0 lost in 8 timings, 5a).
- **BUG-142 (POST /api/transports leaves an orphan transport after a 409):** `p13-03-spare.cjs`
  3d-control — the sequential third transport returns 409 but a transport row is left behind
  (transportsNow went to 3). Re-confirmed.
- **BUG-141 (portal double-approval):** staff-path analog filed fresh as **C13-004**
  (maintenance-with-spare double-click).

# Phase 6-7 — API endpoint × identity matrix (re-run: real coverage)

This is a full re-run of the previous session's matrix pass. The previous run was blocked by
**AM-001** (98% `429`) and only got real application responses for the first 8 of 360 endpoints.
This run fixes the harness so every one of the 360 endpoints × 8 identities gets a real response.
**Zero `429`s in 3144 requests.**

Scripts run this session, all from repo root (server `localhost:5001`, db `lvs_audit`):

1. `setup-identities.mjs` — re-run to refresh all 8 identities (each login already used its own
   `X-Forwarded-For`, per BUG-009, unchanged from before).
2. `run-matrix.mjs` — **modified this session**, see "Harness changes" below. 3144 requests
   (360 endpoints × up to 8 identities, `999999999`-variant included for `:id` routes), concurrency 4.
   Output: `matrix-raw.json`, `matrix.csv`.
3. `generate-report.mjs` — unmodified, pure aggregation over `matrix-raw.json`. Output:
   `generate-report-output.txt`.

`fuzz-get.mjs`, `malformed-json.mjs`, and `session-tests.mjs` were **not** re-run this session (not
in scope for this pass); their findings (AM-002, AM-003, AM-004, the malformed-JSON results, and the
session tests) are carried forward unchanged from the prior run and independently re-confirmed by
this session's main matrix where the same endpoints were reached (noted inline below).

## Harness changes this session

### 1. `X-Forwarded-For` rotation (fixes AM-001's blocking effect on this harness)

`server/middleware/security/rateLimiter.ts`'s `apiLimiter` (1000 req/15min) is keyed per
`X-Forwarded-For` value (BUG-009's trust-proxy behavior) and — per **AM-001** — never actually skips
authenticated sessions, so *every* identity shares one bucket per source IP. The previous run gave
each identity one static IP, which still blew through 1000 requests combined with a second test pass
on the same IPs.

**Fix (`docs/audit/wip/scripts/matrix/lib.mjs`):** `Session` now accepts `forwardedForBase: {a, b}`
+ `rotateEvery` (default 200). `currentForwardedFor()` computes `10.<a>.<b>.<c>`, incrementing `c`
every `rotateEvery` requests. **`run-matrix.mjs`** assigns each identity a distinct `a` octet
(`admin:21, manager:22, viewer:23, nobody:24, anon:25, portal-admin:26, portal-other:27,
portal-driver:28`) and rotates every 200 requests. Since each identity's mutating+GET traffic this
run is 252-440 requests, this gives every identity 2-3 distinct source IPs, each comfortably under
the 1000/15min ceiling. **Result: 0 of 3144 requests got a `429`.**

### 2. Concurrency 4

`run-matrix.mjs` now builds the full 3144-request job list up front and drains it through a 4-way
worker pool (`runPool()`) instead of one request at a time. Total wall-clock time for the full run
dropped to well under two minutes.

### 3. New finding, fixed in the harness: `POST /api/logout` / `POST /api/portal/logout` as a
mutating-endpoint test **destroys the shared session it needs for the rest of the run**

This is a **test-methodology bug in the previous version of `run-matrix.mjs`**, not an application
bug — recorded here because it silently invalidated most of the first attempt's data for this
session and is exactly the kind of thing a future re-run needs to know about.

`run-matrix.mjs` "safe mode" fires every mutating (`POST`/`PUT`/`PATCH`/`DELETE`) endpoint, with an
empty JSON body, at each of the 6 `MUTATION_IDENTITIES` (`anon, nobody, viewer, portal-admin,
portal-other, portal-driver`) — and `POST /api/logout` / `POST /api/portal/logout` are themselves
ordinary mutating endpoints in `endpoints.json`, so they get tested like any other. Unlike every
other empty-body mutation test, though, logout **actually destroys server-side session state**
(that's its job) — and the harness reuses one `Session` object per identity for that identity's
entire ~400-440-request run. The very first time the runner reached either logout endpoint for a
given identity (order is effectively random under concurrency), that identity's shared cookie jar
went dead for every subsequent request of that identity, turning ~95% of that identity's remaining
results into spurious `401`s instead of their real authorization outcome.

First (unfixed) run's per-identity buckets showed this exactly: `admin`/`manager` (never touch
`MUTATION_IDENTITIES`' mutation pass, so never call logout) came back with real, varied
2xx/403/404 profiles; `nobody`, `viewer`, and all three `portal-*` identities came back **~95% `401`**
across the board, including on endpoints their permissions should have made a clean 200 or 403.
Manually replaying just `POST /api/logout` with an empty body against a known-good session confirmed
the session was dead immediately after and stayed dead.

**Fix:** `run-matrix.mjs` now re-logs-in an identity immediately after its logout-endpoint job
completes (`RELOGIN` map, using each identity's real credentials from `setup-identities.mjs`),
mutating the shared `Session` object in place so the rest of that identity's run keeps working.
`anon` has no session to restore and needs none (its own `POST /api/logout` test is unaffected,
since it never had a session).

After this fix, `nobody`'s bucket went from `{401: ~421, 403: 1, 2xx: 6, ...}` (broken) to
`{401: 7, 403: 346, 404: 20, 2xx: 47, ...}` — all 7 remaining `401`s are `/api/portal/*`
self-service routes, which `nobody` (a staff-only account, no portal session) is correctly denied
with `401` in either case. This is now a clean, trustworthy dataset.

## Summary table (`matrix-raw.json`, 3144 rows, this session's fixed run)

| Identity | 2xx | 3xx | 401 | 403 | 404 | 5xx | 400 (other) | 429 | ERR (`-1`) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| anon | 6 | 0 | 420 | 1 | 4 | 1 | 6 | **0** | 2 | 440 |
| nobody | 47 | 0 | 7 | 346 | 20 | 2 | 16 | **0** | 2 | 440 |
| viewer | 120 | 0 | 6 | 235 | 49 | 5 | 23 | **0** | 2 | 440 |
| portal-admin | 8 | 0 | 415 | 1 | 4 | 1 | 10 | **0** | 1 | 440 |
| portal-other | 8 | 0 | 415 | 1 | 4 | 1 | 10 | **0** | 1 | 440 |
| portal-driver | 7 | 0 | 414 | 3 | 4 | 1 | 9 | **0** | 2 | 440 |
| manager | 162 | 0 | 1 | 6 | 69 | 4 | 8 | **0** | 2 | 252 |
| admin | 167 | 0 | 1 | 0 | 70 | 4 | 8 | **0** | 2 | 252 |
| **Total** | **525** | **0** | **1679** | **593** | **224** | **19** | **90** | **0** | **14** | **3144** |

Reading this table: `nobody` (zero permissions) and `viewer` (view-only permissions) now show
realistic, varied `403`/`404`/`2xx` distributions instead of a 429 or 401 wall — this is the first
time this audit has gotten real coverage on the 352 endpoints beyond the original "first 8". The
high `403` count for `nobody` (346/440) is expected and correct: it's a logged-in account with
*zero* permissions hitting a mostly-permission-gated API. `anon`/`portal-*`'s high `401` counts are
dominated by hitting the staff-only surface (`/api/portal-admin/*`, `/api/portal-requests/*`, plus
the entire non-portal CRUD surface) with no staff session — also expected.

**`ERR` (`-1`, 14 rows) breakdown:**
- 8× `GET *` (the SPA catch-all route, one per identity) — a client-side `TypeError: Failed to parse
  URL from http://localhost:5001*` in `run-matrix.mjs`/`lib.mjs`, not a server response. Same known,
  disregarded artifact as the previous report.
- 6× collateral damage from **AM-005** (new, see below) — a request that crashes the whole Node
  process mid-run drops whatever else was in flight. See AM-005.

## Non-privileged 2xx (34 rows, `non-privileged-2xx` flag: any `POST`/`PUT`/`PATCH`/`DELETE` 2xx by
`anon`/`nobody`/`viewer`/`portal-other`/`portal-driver`)

| Endpoint | Identity | Status | File:line | Middleware | Note |
|---|---|---|---|---|---|
| `POST /api/logout` | anon, nobody, viewer, portal-other, portal-driver | 200 | `server/auth.ts:377` | *(none)* | Intentional no-op logout. Not a bug (known, carried forward). |
| `POST /api/session/heartbeat` | nobody, viewer | 200 | `server/auth.ts:411` | `requireAuth` | Session keepalive only, no data returned beyond "ok". Not a bug. |
| `POST /api/portal/logout` | anon, nobody, viewer, portal-other, portal-driver | 200 | `server/portal-auth.ts:271` | *(none)* | Intentional no-op logout. Not a bug. |
| `POST /api/portal/me/email/cancel` | portal-other, portal-driver | 200 | `server/portal-auth.ts:316` | `requirePortalUser` | Cancels the caller's *own* pending e-mail change. Correctly scoped to self. Not a bug. |
| `POST /api/portal/forgot` | anon, nobody, viewer, portal-other, portal-driver | 200 | `server/portal-auth.ts:373` | `loginLimiter` | Public-by-design password-reset trigger; always `{ok:true}} to prevent e-mail enumeration. Not a bug (also see SR-005 in `security-runtime.md` re: this route's rate-limit bypass, unrelated finding, not edited here). |
| `DELETE /api/reservations/:id` | **nobody** (0 permissions) | 200 | `server/routes.ts:4621` | `requireAuth` only | **Confirms phase-1a risk #5** (already catalogued, `01a-api-en-autorisatie.md:20`, `security-static.md:73,85`) — no `MANAGE_RESERVATIONS` check. First empirical confirmation with a real zero-permission account. |
| `POST /api/migrate/customer-drivers` | nobody, viewer | 200 | `server/routes.ts:6572` | `requireAuth` only | **Confirms BUG-023** (`03-phase-3-5-rapport.md:97,458`) — already a tracked, numbered bug. Not new. |
| `PUT /api/interactive-damage-checks/:id` | nobody, viewer | 200 | `server/routes.ts:7004` | `requireAuth` only | **Confirms phase-1a risk #6** (`01a:25`, `security-static.md:74-77,85`). See also the >1MB table below — `nobody` can also bulk-read *every* interactive damage check. |
| `DELETE /api/interactive-damage-checks/:id` | nobody | 200 | `server/routes.ts:7303` | `requireAuth` only | Same as above. |
| `PUT /api/system-settings` | nobody, viewer | 200 | `server/routes/app-settings.ts:463` | `requireAuth` only | **Confirms BUG-011** (`03-phase-3-5-rapport.md:85,459-470` numbering — see bugtracker row) — already tracked. |
| `POST /api/portal-admin/notifications/:id/read` | viewer | 200 | `server/routes/portal-admin.ts:133` | `canView` (`VIEW_PORTAL`\|`MANAGE_PORTAL`) | `viewer` legitimately has `view_portal`. Marking a notification read only needing view-level access is a reasonable design choice, not a bug. |
| `POST /api/portal-admin/notifications/mark-read` | viewer | 200 | `server/routes/portal-admin.ts:147` | `canView` | Same as above. |
| `DELETE /api/settings/contract-number-override` | nobody, viewer | 200 | `server/routes/settings.ts:122` | `requireAuth` only | **New — see AM-006.** |
| `PATCH /api/vehicle-diagram-templates/:id` | nobody, viewer | 200 | `server/routes/vehicle-diagram-templates.ts:138` | `requireAuth` only | **Confirms phase-1a risk #8** (`01a:26`, `security-static.md:80`). |
| `DELETE /api/vehicle-diagram-templates/:id` | nobody | 200 | `server/routes/vehicle-diagram-templates.ts:211` | `requireAuth` only | Same as above. |

Of the 34 flagged rows, **20 are benign/intentional** (logout, heartbeat, self-service e-mail
cancel, forgot-password) and **14 are missing-permission mutations**, of which **13 confirm
already-catalogued risks/bugs** (phase-1a risks #5/#6/#8, BUG-011, BUG-023) with a real zero/low
-permission account for the first time, and **1 is new** (AM-006, contract-number-override).

**Beyond this flag** (`detectFlags()` only flags mutating verbs — GETs by a low-privilege identity
that shouldn't succeed aren't flagged, but are just as real a finding): `nobody` (0 permissions) got
`200` on `GET /api/interactive-damage-checks` (**18.3 MB**, every interactive damage check in the
database, `server/routes.ts:6783`, `requireAuth` only), `GET /api/interactive-damage-checks/:id`
(1.3MB, `:6794`), `GET /api/interactive-damage-checks/:id/pdf` (2.9MB, `:7213`),
`GET /api/vehicles/:id/damage-check-pdf` (1.9MB, `:6641`, **not** covered by the existing
`interactive-damage-checks*` risk note at `01a:25` — same missing-permission pattern, additional
route), `GET /api/placeholder-reservations`/`/needing-assignment` (`:4516,4543`, confirms
`01a:21`), and `GET /api/vehicles/:vehicleId/customers-with-reservations` (28.8KB, `:4749`,
confirms `01a:21` / `03-phase-3-5-rapport.md:1064`'s explicitly-untested candidate list). All of
these are `requireAuth`-only and match the same already-catalogued risk classes — cited here as
confirming evidence, not new bugs, except where called out as new (AM-006) above.

## 5xx responses (19 rows total, this session's main matrix)

| Endpoint | Identities | Status | File:line | Middleware | Root cause / note |
|---|---|---|---|---|---|
| `GET /object-storage/*` | anon, nobody, viewer, manager, admin, portal-admin, portal-other, portal-driver (all 8) | 500 | `server/routes.ts:7338` | *(none)* | **BUG-051**, re-confirmed — anon gets the identical 500 as admin, proving no auth middleware exists. |
| `GET /api/backups/download-data` | manager, admin | 500 | `server/routes/backups.ts:75` | `hasPermission(MANAGE_BACKUPS)` | **AM-004**, re-confirmed via the main matrix (previously only seen via `fuzz-get.mjs`). |
| `GET /api/damage-check-templates/by-vehicle` | viewer, manager, admin | 500 | `server/routes/damage-check-templates.ts:52` | `hasPermission(VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS)` | **AM-003**, re-confirmed via the main matrix. |
| `GET /api/reports/maintenance-costs` | viewer, manager, admin | 500 | `server/routes/reports.ts:36` | `hasPermission(VIEW_REPORTS, MANAGE_REPORTS)` | Previously documented in the prior run's AM-003/AM-004 write-up as a 4th unconditional-500 endpoint; re-confirmed here. |
| `POST /api/interactive-damage-checks` (empty body) | nobody, viewer | 500 | `server/routes.ts:6849` | `requireAuth` only | **New — see AM-008.** No zod schema; `checkData = {...req.body, ...}` is passed straight to `storage.createInteractiveDamageCheck()`, which throws a raw Postgres NOT-NULL error on a missing required column instead of a 400. |
| `DELETE /api/reservations/:id` | viewer | 500 | `server/routes.ts:4621` | `requireAuth` only | **New — see AM-007.** `nobody`'s concurrent `DELETE` on the same test reservation (both identities share the fixed `ids.reservation` test id) raced with `viewer`'s; the explicit "already deleted → 410" guard at the top of the handler is a check-then-act race against the later `storage.updateReservation()` write, so the loser gets an unhandled 500 instead of a clean `410`/`409`. |

19 rows total: 8 (object-storage/BUG-051) + 2 (backups/AM-004) + 3 (by-vehicle/AM-003) +
3 (maintenance-costs) + 2 (interactive-damage-checks POST/AM-008) + 1 (reservations DELETE
race/AM-007) = 19.

### Carried forward, unchanged (not re-run this session): `fuzz-get.mjs` 5xx findings

Still valid, still open, not re-tested this session (see prior write-up, reproduced by direct
re-check during this session for `by-vehicle`/`download-data`/`maintenance-costs` above):
- **19 GET endpoints** return 500 for a malformed `:id`/string path param instead of 400 — **AM-002**.

## Sensitive-field leaks (10 rows)

| Endpoint | Identities | Verdict |
|---|---|---|
| `GET /api/portal/csrf-token` | all 8 | **False positive.** Response body is `{"token":"<csrf-token>"}` — the CSRF double-submit token is *supposed* to be returned to the same client that requested it; this is the correct implementation of the pattern, not a leak of someone else's secret. |
| `GET /api/settings` | manager, admin | **Real, but already tracked as BUG-010** (`03-phase-3-5-rapport.md:276-288`) — `smtpPassword` returned unredacted to any `MANAGE_BACKUPS` account (`server/routes/settings.ts:15`, no `redactAppSetting`). Verified live this session: `curl` with `manager`'s session returns `"smtpPassword":"AUDIT-super-secret-smtp-pw"` in the `email_config` entry (5302-byte response). Not new. |

0 genuine *new* leaks. Regex: `"(password|passwordHash|password_hash|hash|secret|token|smtpPassword|smtp_password|apiKey|api_key)"\s*:\s*"<value>`, case-insensitive, over every response in `matrix-raw.json`'s scope.

## `>1MB` responses (34 rows)

All 34 are `2xx` to an identity whose permissions legitimately cover the data (`manager`/`admin` with
full permissions, `viewer` with the matching `view_*` permission) **except** `nobody` (6 rows: see
the "Beyond this flag" paragraph above — `nobody` has *zero* permissions and still gets multi-MB
interactive-damage-check dumps via `requireAuth`-only routes). No identity got a large response for
data clearly outside its own scope (e.g. no cross-tenant portal data disclosure was observed).

## New bugs (AM-005 .. AM-008)

### AM-005: Any unhandled promise rejection anywhere in the app crashes the entire server for every user — reproduced via `GET /api/portal-admin/customers/:customerId/settings` with a non-existent `customerId`
**Severity:** CRITICAL
**Feature:** Portal-admin customer settings (`VIEW_PORTAL`/`MANAGE_PORTAL`) — but the underlying mechanism is app-wide
**Status:** OPEN
**Reproduction:** As any account with `VIEW_PORTAL` or `MANAGE_PORTAL` (confirmed with `admin`, `manager`, and `viewer` — all three hit it independently during this run), `GET /api/portal-admin/customers/999999999/settings` → **no response; the TCP connection is dropped and the entire Node process exits.** The server auto-restarts (~15-20s, confirmed via `GET /health` going `000` → `200`), but every in-flight request from every other identity/session at that moment fails too (6 collateral `ERR` rows this run: `admin`/`manager`/`viewer`'s own copy of this same request racing each other, plus `nobody`/`anon`'s concurrently in-flight `GET /api/reports/maintenance-costs` and `portal-driver`'s `DELETE /api/transport-report-templates/:id/backgrounds/:backgroundId`, none of which are otherwise implicated — they just happened to be mid-flight in the same 4-way concurrency pool when the process died). Reproduced twice, independently, in two separate matrix runs this session, plus a standalone manual `curl`/`fetch` repro immediately afterward with a 100% hit rate.
**Expected:** `404` (customer not found) or a clean `400`, matching how every other `:id`-not-found route in this app behaves.
**Actual:** Full-process crash; the server is unreachable for staff *and* portal until it restarts.
**Root cause:** `server/routes/portal-admin.ts:109-111` (`GET /api/portal-admin/customers/:customerId/settings`) calls `portalStorage.getOrCreateCustomerSettings(customerId)` (`server/services/portal-storage.ts:136-143`) with no existence check on `customerId` first. That function does `db.insert(portalCustomerSettings).values({customerId}).onConflictDoNothing()` — `portalCustomerSettings.customerId` (`shared/schema.ts:493`) is `.notNull().unique().references(() => customers.id, {onDelete:"cascade"})`, a real foreign key. Inserting a `customerId` that doesn't exist in `customers` throws a Postgres FK-violation error, which is **not** a conflict (so `onConflictDoNothing()` doesn't help) and is never caught — it escapes the `async (req,res) => {...}` handler as an unhandled promise rejection. `server/index.ts:136-144`'s global `process.on('unhandledRejection', ...)` handler treats **every** unhandled rejection anywhere in the app as fatal and calls `gracefulShutdown()`, which `process.exit()`s. This is the exact same root-cause class already documented for **BUG-002** (`03-phase-3-5-rapport.md:162-174`, `POST /api/portal/requests` with a malformed `payload` string) — BUG-002's own fix proposal already says "reconsider whether 'every unhandled rejection is fatal' is the right process policy" — but this is a **different endpoint, different trigger (a DB foreign-key violation, not a JSON.parse SyntaxError), and a lower privilege bar** (any `VIEW_PORTAL` account, not specific to the portal-requests flow), and neither `03-phase-3-5-rapport.md`, `security-static.md`, nor `security-runtime.md` documents this specific route/trigger.
**Affected files:** `server/routes/portal-admin.ts:109-111`, `server/services/portal-storage.ts:136-143`, `shared/schema.ts:493` (the FK), `server/index.ts:136-144` (the fatal-by-default policy).
**Affected data:** None corrupted (the insert never commits — it's rejected by the FK constraint before any row is written); pure availability impact.
**Security impact:** A full, remote, single-request, unauthenticated-adjacent (any `VIEW_PORTAL` account — a common, low permission) denial-of-service against the entire application, staff and portal alike, matching BUG-002's severity and class. Given the generic "unhandled rejection = fatal" policy, this is very likely **not the only** unguarded async DB call in the app that can be handed a bad foreign key or similar constraint-violating input by a low-privilege user; this run only found this one because the matrix's `999999999`-not-found probe happened to land on an endpoint using `getOrCreate`-with-insert instead of a plain `SELECT`.
**Business impact:** Same as BUG-002 — total outage for every concurrent user (staff back-office included) until someone notices and the process restarts; during this audit it repeatedly interrupted the matrix run itself.
**Fix proposal:** Immediate: check `storage.getCustomer(customerId)` (or catch the FK-violation specifically) before calling `getOrCreateCustomerSettings`, returning 404. Systemic (same as BUG-002's proposal, now with two independent reproductions): audit every route for un-try/caught DB calls that can throw on attacker-controlled input, and/or reconsider `server/index.ts`'s policy of treating all unhandled rejections as fatal — at minimum, an Express route handler's rejection should produce a 500 to that one request via `next(err)`, not `process.exit()` the whole server. A blanket `express-async-errors`-style wrapper (or upgrading to Express 5, which forwards async rejections to error middleware by default) would close this entire bug class at once.
**Regression test proposal:** `GET /api/portal-admin/customers/999999999/settings` as any `VIEW_PORTAL` account must return `404`, and `GET /health` immediately afterward must still return `200` (no restart).

### AM-006: `POST`/`DELETE /api/settings/contract-number-override` writable by any logged-in user
**Severity:** HIGH
**Feature:** Contract numbering override (`server/routes/settings.ts`)
**Status:** OPEN
**Reproduction:** As `nobody` (permissions: `[]`) or `viewer` (view-only permissions), `DELETE /api/settings/contract-number-override` → **200** `{"success":true,"settings":{...},"nextContractNumber":...,"message":"Override cleared - using automatic numbering"}` (682 bytes). `POST /api/settings/contract-number-override {"overrideNumber":<n>}` is reachable the same way (this run's empty-body safe-mode probe hit its own input-validation 400 instead, since `overrideNumber` was `undefined`, but the route has the identical `requireAuth`-only gate — see Root cause).
**Expected:** Setting or clearing the next contract number (used for every new reservation's contract numbering sequence company-wide) should require `manage_settings`, matching every other settings-mutation route.
**Actual:** Any authenticated account, regardless of permissions, can both set an arbitrary override and clear an existing one.
**Root cause:** `server/routes/settings.ts:90` (`POST`) and `:121` (`DELETE`) both register with `requireAuth` only, no `hasPermission(UserPermission.MANAGE_SETTINGS)` — the same missing-permission pattern already tracked for `PUT /api/system-settings` as **BUG-011**, but on a sibling route BUG-011 doesn't cover.
**Affected files:** `server/routes/settings.ts:90-135`.
**Affected data:** `app_settings` (the contract-number-override value); indirectly every reservation created afterward, whose contract number is derived from this value.
**Security impact:** Same class as BUG-011 — a missing permission check on a mutating endpoint, normalized to HIGH per this project's own severity rule (`03-phase-3-5-rapport.md`'s "ontbrekende permissiecheck op een muterend endpoint is HIGH").
**Business impact:** Any logged-in staff account (e.g. a driver-facing kiosk login with no real permissions) can force the next contract number to collide with an existing one, or silently reset the numbering sequence, corrupting contract-number uniqueness/sequencing company-wide.
**Fix proposal:** Add `hasPermission(UserPermission.MANAGE_SETTINGS)` to both routes, matching the sibling settings-mutation routes.
**Regression test proposal:** Both routes called by an account with `permissions:[]` must return 403.

### AM-007: `DELETE /api/reservations/:id` — check-then-act race between the "already deleted" guard and the write lets a concurrent delete of the same reservation 500 instead of 410/409
**Severity:** MEDIUM
**Feature:** Reservation delete (`server/routes.ts:4621`)
**Status:** OPEN
**Reproduction:** Two different logged-in accounts (`nobody` and `viewer`, both `requireAuth`-only-gated per **AM-006**'s sibling finding — but this reproduces with any two accounts able to reach the route) issue `DELETE /api/reservations/<same id>` concurrently. One gets `200` (soft-deleted); the other gets `500` `{"message":"Failed to delete reservation", "error": "..."}` instead of the route's own explicit `410 "Reservation already deleted"` guard.
**Expected:** A concurrent second delete of an already-deleted reservation should hit the handler's own `if (reservation.deletedAt) return res.status(410)` check and return 410, or at worst a clean 404/409 — never an unhandled 500.
**Actual:** 500, with `error.message` echoed into the response body (see Security impact).
**Root cause:** `server/routes.ts:4626-4635` reads `reservation.deletedAt` and checks it *before* the actual write happens down at `:4697` (`storage.updateReservation(id, softDeleteData)`), with substantial work (the `maintenance_block` cascade branch) in between. Two concurrent requests can both pass the `deletedAt` check before either has written, so the guard doesn't actually prevent a concurrent double-delete — whichever request's downstream write/cascade logic hits a data-consistency assumption the other request already invalidated throws, and falls into the generic `catch` at `:4681-4687`, which echoes `error.message` back to the client.
**Affected files:** `server/routes.ts:4621-4687`.
**Affected data:** None corrupted in the reproduction (the "losing" request's write simply fails); this is a robustness/error-handling gap, not a data-integrity one, as far as this run observed.
**Security impact:** Low directly — reaching this requires two already-authorized (if under-permissioned, per AM-006's sibling class) accounts racing the same delete — but the response echoes `error.message` verbatim, which could leak partial internals (query fragments, constraint names) if the underlying error ever contains more than the generic message seen here.
**Business impact:** Two staff members (or a double-click) working the same reservation/maintenance-block deletion at the same time get a confusing opaque 500 instead of an informative "someone else already deleted this."
**Fix proposal:** Re-check `deletedAt` (or use a single conditional `UPDATE ... WHERE deleted_at IS NULL RETURNING *` and treat a zero-row result as "already deleted") at the point of the actual write, not only at the top of the handler; stop echoing raw `error.message` to the client regardless.
**Regression test proposal:** Fire two concurrent `DELETE` requests at the same reservation id; exactly one must return 200, the other must return 404/409/410 — never 500.

### AM-008: `POST /api/interactive-damage-checks` has no request-body schema validation — a body missing required fields throws an unhandled DB error (500) instead of 400
**Severity:** LOW
**Feature:** Interactive damage checks — create (`server/routes.ts:6849`)
**Status:** OPEN
**Reproduction:** As `nobody` or `viewer` (both merely `requireAuth`-gated per the pre-existing risk #6), `POST /api/interactive-damage-checks {}` (empty body) → **500**.
**Expected:** 400 with a validation message identifying the missing required field(s) (e.g. `vehicleId`).
**Actual:** 500, generic message.
**Root cause:** `server/routes.ts:6850-6855` builds `checkData = {...req.body, checkDate: ..., completedBy: ...}` with **no zod schema / no required-field check** at all, then passes it straight to `storage.createInteractiveDamageCheck(checkData, ...)` (`:6868`), which lets a Postgres NOT-NULL (or similar) constraint violation on a genuinely required column escape as an uncaught DB error, caught only by the route's generic `catch`.
**Affected files:** `server/routes.ts:6849-6899`.
**Affected data:** None (the insert fails, nothing is written).
**Security impact:** Minimal — same class as AM-002 (missing input validation → 500 instead of 400), no leak, no bypass, and gated behind the (already-flagged, requireAuth-only) permission gap.
**Business impact:** Same DX/robustness gap as AM-002, on a request body instead of a path param — any client sending an incomplete damage-check payload gets an opaque 500.
**Fix proposal:** Add a zod schema for the create-damage-check body (mirroring whatever the sibling `PUT` update route validates, if anything) and return 400 for missing required fields before reaching `storage.createInteractiveDamageCheck`.
**Regression test proposal:** `POST /api/interactive-damage-checks {}` must return 400, not 500.

### AM-001 (carried forward, evidence updated): `apiLimiter`'s "skip for authenticated users" never fires
**Severity:** High · **Status:** OPEN — unchanged root cause; this session adds a second, larger confirmation and a reconciliation against `SR-002` (see below)
**Evidence added this session:** With `X-Forwarded-For` rotated every 200 requests per identity (this session's harness fix), **all 3144 requests across all 8 identities, admin/manager included, got 0 `429`s** — because no single IP in this run ever crossed ~640 requests in the 15-minute window, safely under the 1000-request shared ceiling `apiLimiter` actually enforces. This is fully consistent with, not contradictory to, the original finding: the limiter still does not distinguish authenticated from anonymous traffic (skip() still can't fire, mount order unchanged — this session did not modify application code) — this run simply engineered around the shared 1000-request budget instead of exempting authenticated sessions from it. See the SR-002 reconciliation below for why this matters.
Everything else (root cause, affected files, fix proposal, regression test) is unchanged from the original AM-001 write-up: `apiLimiter` mounted at `server/index.ts:174` before `setupAuth()` at `:187`; `skip: (req) => req.isAuthenticated && req.isAuthenticated()` (`server/middleware/security/rateLimiter.ts:18-22`) is always falsy because `req.isAuthenticated` doesn't exist yet when it runs.

### AM-002, AM-003, AM-004 (carried forward, unchanged)
See the original write-ups (kept below in "Carried-forward AM-002/003/004 detail" for completeness); AM-003 and AM-004 are independently re-confirmed by this session's main matrix (see the 5xx table above).

## Carried-forward AM-002/003/004 detail (from `fuzz-get.mjs`, not re-run this session)

### AM-002: Non-numeric/oversized/null-byte `:id` and string path params return 500 instead of 400 on ~19 GET endpoints
**Severity:** Low · **Status:** OPEN. As admin, `GET /api/settings/abc` (or `%00`, or a 5000-char digit string) → 500 `{"error":"Failed to fetch setting"}` (`parseInt('abc')` → `NaN` → straight into `storage.getAppSetting(NaN)` → Postgres `invalid input syntax for type integer` → generic catch). Reproduced on 19 endpoints across `barcodes`, `interactive-damage-checks`, `app-settings`, `custom-notifications`, `damage-check-templates`, `expenses`, `settings`, `vehicle-diagram-templates` — see the prior session's full list. **Fix:** shared `parseIntParam(name)` middleware returning 400 for a non-positive-integer `:id`.

### AM-003: `GET /api/damage-check-templates/by-vehicle` is unreachable — shadowed by the earlier-registered `:id` route
**Severity:** Medium · **Status:** OPEN. `server/routes/damage-check-templates.ts:35` registers `:id` *before* `:52`'s `by-vehicle`; Express matches `by-vehicle` as `req.params.id === "by-vehicle"`, `parseInt` → `NaN` → 500. **Fix:** move `/by-vehicle` above `/:id`.

### AM-004: `GET /api/backups/download-data` leaks the live Postgres connection string and a full local filesystem path in its error response
**Severity:** Medium · **Status:** OPEN. `server/routes/backups.ts:95` interpolates `DATABASE_URL` directly into a shell command string for `pg_dump`; the `catch` at `:110-116` returns Node's synthesized `error.message` (the full command line, credentials included) verbatim as `details`. **Fix:** log server-side, return a generic client-facing message.

## Malformed-JSON results (`malformed-json.mjs`, 30 rows, 0×5xx — carried forward, not re-run)

Unchanged from the prior session: 6 of 10 target endpoints correctly 400 all 3 malformed-body
scenarios; `PATCH /api/vehicles/:id`, `/api/reservations/:id`, `/api/customers/:id`, and
`PUT /api/system-settings` return 200 (echoing the resource unchanged) instead of 400 for a
`text/plain`-content-type-with-JSON-body request — a minor input-contract gap (`express.json()`
only parses `application/json`, and these four handlers accept a fully-optional `.partial()` body).
Not re-tested this session; recorded here for continuity, still not a full AM- entry per the prior
session's reasoning (no security/data impact).

## Session tests (`session-tests.mjs` — carried forward, not re-run)

| Test | Status | Result |
|---|---|---|
| CSRF token from another session on `POST /api/vehicles` | 403 `CSRF_INVALID` | Correctly rejected — tokens are session-bound. |
| `POST /api/logout` with an already-idled `viewer` session | 403 | Session had idled out before the call; not a new finding. |
| `GET /api/vehicles?limit=1` after that logout | 401 | Correct — no session reuse after logout. |
| `connect.sid` copied from an arbitrary `session`-table row | 401 | No session-fixation/hijack observed. |

## Top risks from `docs/audit/01a-api-en-autorisatie.md` — confirmed / refuted, this run

| # | Risk | Status | Evidence (this run) |
|---|---|---|---|
| 1 | Socket.IO broadcasts without auth | **Not tested** | HTTP-only matrix; no WebSocket coverage. |
| 2 | Expenses upload/download fully open | **Confirmed** (already BUG-003) | `anon` gets `400` (reached body validation, not `401`) on `POST /api/expenses/with-receipt`, `PATCH /api/expenses/:id`, `PATCH /api/expenses/:id/with-receipt`, and `404` (not `401`) on `GET /api/expenses/:id/receipt` — all four routes BUG-003 already names as missing `requireAuth` entirely. Every *other* `/api/expenses/*` route correctly `401`s for `anon`, matching BUG-003's exact four-route scope. |
| 3 | Open RDW proxy | **Confirmed** (already BUG-046) | `GET /api/rdw/vehicle/:licensePlate` returns the identical `404` for `anon` as for `admin` — no auth middleware, matching BUG-046 exactly. |
| 4 | `/object-storage/*` open | **Confirmed** (already BUG-051) | `anon` gets the identical `500` as `admin`/`manager`/all 8 identities. |
| 5 | Reservation delete without permission | **Confirmed** (already flagged at `01a:20`/`security-static.md:73,85`, first empirical confirmation) | `nobody` (0 permissions) → `200` on `DELETE /api/reservations/:id`. |
| 6 | Interactive damage checks CRUD without permission | **Confirmed** (already flagged at `01a:25`) | `nobody` → `200` on `POST`(500 for empty body, see AM-008)/`PUT`/`DELETE /api/interactive-damage-checks*` and multi-MB reads of every check in the DB via `GET /api/interactive-damage-checks`. Additional un-catalogued sibling route found: `GET /api/vehicles/:id/damage-check-pdf` (`routes.ts:6641`), same gap. |
| 7 | Bulk customer-drivers migration route without permission | **Confirmed** (already BUG-023) | `nobody`/`viewer` → `200` on `POST /api/migrate/customer-drivers`. |
| 8 | Vehicle-diagram-templates without permission | **Confirmed** (already flagged at `01a:26`) | `nobody`/`viewer` → `200` on `PATCH`/`DELETE /api/vehicle-diagram-templates/:id`. |
| 9 | Contract endpoints without permission | **Partially confirmed — new finding (AM-006)** | `nobody`/`viewer` → `200` on `DELETE /api/settings/contract-number-override`; `POST` shares the identical `requireAuth`-only gate (this run's empty-body probe just happened to fail its own field validation first). Not previously catalogued under this name. |
| 10 | SMTP/FTPS passwords stored unencrypted | **Confirmed elsewhere** (BUG-010) | `GET /api/settings` as `manager` returns the live `smtpPassword` in plaintext — re-verified live this session (see Sensitive-field-leaks table). |
| 11 | Document routes bypass central path resolution | **Not tested** | No document-path-traversal probes in this matrix (that's `security-runtime.md`'s Check territory, already covers it as BUG-012). |
| 12 | `/api/settings*` gated on the backup permission instead of settings | **Confirmed by existing docs** (BUG-010) | This run's traffic on `/api/settings/*` is consistent with, not independently re-deriving, BUG-010. |
| 13 | `system-settings` writable with mere login (`requireAuth`, no permission) | **Confirmed** (already BUG-011, first empirical confirmation with a zero-permission account) | `nobody` → `200` on `PUT /api/system-settings`. |
| 14 | No rate limit for logged-in sessions | **Refuted — replaced by AM-001, and now separately reconciled against `SR-002`** | See dedicated section below. |
| 15 | Uploads to Gemini without redaction | **Not tested** | Out of scope for HTTP-matrix testing. |

**New this run:** a full crash/DoS vector (AM-005, CRITICAL) was found via the `999999999`-not-found
probe on a `/api/portal-admin/*` route — not one of the 15 phase-1a risks, but the most severe
finding of this session.

## Reconciliation: `SR-002` ("no rate limit on authenticated calls") vs. `AM-001` (the limiter does apply, at 1000/15min)

`security-runtime.md`'s **SR-002** (line 576) concludes, from a live check this cycle
(`check7-ratelimit.cjs`): *"200 snelle, opeenvolgende `GET /api/vehicles?limit=1`-verzoeken als
ingelogde staff-gebruiker → 200/200, geen enkele 429 ... bevestigt dat een geauthenticeerde sessie
inderdaad volledig buiten `apiLimiter` valt, zoals de `skip`-code voorspelt."* ("confirms an
authenticated session indeed falls entirely outside `apiLimiter`, as the skip-code predicts") — with
an explicit methodological note that this was tested "met een verse IP-bucket" (with a fresh IP
bucket).

This is not actually in conflict with AM-001 once the numbers are lined up — it's an
**underpowered test that drew the wrong conclusion from a true observation**:

- `apiLimiter`'s ceiling is **1000 requests per 15 minutes per source IP** (`rateLimiter.ts`), and it
  applies identically to authenticated and anonymous traffic (AM-001's mount-order proof: `skip()`
  can never fire for anyone, because `req.isAuthenticated` doesn't exist yet at the point `apiLimiter`
  runs).
- SR-002's check sent **200 requests** from a **fresh** IP. 200 is well under 1000 — of course no
  `429` fired, regardless of whether `skip()` works. The test cannot distinguish "authenticated
  sessions are exempt" from "we simply didn't send enough requests from this IP yet to hit the
  shared ceiling that *everyone* shares."
- AM-001's original finding used **enough traffic on one IP** (a second test pass reusing the same
  source IPs) to actually reach the 1000-request ceiling, and found `admin` gets `429`d at the exact
  same rate as `anon` on that IP — direct proof `skip()` never fires.
- **This session's fix worked around the same ceiling from the other direction**: by rotating
  `X-Forwarded-For` every 200 requests per identity, no single IP in this 3144-request run ever
  crossed ~640 requests in the window, so **zero `429`s occurred for any identity, admin/manager
  included** — reproducing SR-002's "no 429 observed" result at 15× the request volume, for the
  *wrong* reason (staying under the shared cap by design), not because authenticated sessions are
  exempt.

**Conclusion: SR-002's stated conclusion is incorrect and should be treated as superseded by AM-001.**
The `skip()` logic does not work for anyone, authenticated or not; `apiLimiter` is a single shared
1000-req/15-min-per-IP budget with no actual distinction between authenticated and anonymous
traffic. SR-002's live check merely stayed under that shared budget, the same way a real office NAT
with moderate multi-user traffic would eventually not (AM-001's original business-impact scenario).
`security-runtime.md` is **not edited by this report** (out of scope for this pass) — this section
exists so a future editor of that file has the evidence needed to correct SR-002's status line.

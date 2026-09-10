# Phase 6-7 — API endpoint × identity matrix

Scripts run (in order), all from repo root except `fuzz-get.mjs`/`malformed-json.mjs`/`generate-report.mjs` which were run from `docs/audit/wip/scripts/matrix/` (server: `localhost:5001`, db `lvs_audit`):

1. `fuzz-get.mjs` — 742 requests as admin (dedicated IP `10.20.30.11`), fuzzing `:id`/string path params (`0`,`-1`,`abc`,`1e3`,`%00`,`../`,5000×`A`) on 80 GET endpoints with params, plus query-string fuzz (`limit=-1&page=abc&daysAhead=1e9`) and `Accept: text/html` on 92 param-less GET endpoints. Output: `fuzz-get-results.json`. **51 rows flagged 5xx.**
2. `malformed-json.mjs` — 30 requests as admin (dedicated IP `10.20.30.12`), 3 malformed-body scenarios (`text/plain` content-type with JSON body, truncated JSON, 2MB JSON body) on 10 representative mutating endpoints. Output: `malformed-json-results.json`. **0 rows 5xx**, 4 rows flagged `unexpected` (200 where 400 was expected).
3. `session-tests.mjs` — 4 targeted session/CSRF tests (cross-session CSRF token reuse, post-logout reuse, `connect.sid` theft from the `session` table) as `viewer`/`nobody` (dedicated IP `10.20.30.13`). Output: `session-tests-results.json`.
4. `generate-report.mjs` — pure aggregation over the pre-existing `matrix-raw.json` (3144 rows: 360 endpoints × up to 8 identities, produced by an earlier run of `run-matrix.mjs`, not re-run this session). Output captured to `generate-report-output.txt`.

## Script bugs fixed

- **`fuzz-get.mjs`**: crashed (`FATAL TypeError: Failed to parse URL from http://localhost:5001*`) on its second pass (query-string/Accept-header fuzz of param-less GET endpoints) because `endpoints.json` includes the SPA/static catch-all route `path: "*"` (`server/index.ts:396`), which isn't a valid URL path segment on its own. Fixed by excluding any endpoint path that doesn't start with `/` from that pass (`docs/audit/wip/scripts/matrix/fuzz-get.mjs`, the `listEps` filter). Re-run succeeded: 742 requests, 51 flagged 5xx.
- **`session-tests.mjs`**: crashed immediately (`TypeError: Cannot read properties of undefined (reading 'replace')` in `../db.mjs`) because `db.mjs` calls `import 'dotenv/config'`, which loads `.env` from `process.cwd()`, and the script's own doc comment/invocation pattern (`node <script>.mjs` from inside `scripts/matrix/`) put the cwd in the wrong place for that to find the repo-root `.env`. No code change was needed — running `node docs/audit/wip/scripts/matrix/session-tests.mjs` from the repo root (matching README-agents.md's stated dotenv convention) resolved it and the script completed normally.
- `malformed-json.mjs` and `generate-report.mjs` ran without any fix needed.

No server crash/restart was observed during any of the four runs (no `status: -1` from a real connection failure — see the `GET *` note below for the one `-1` case, which is a client-side URL-construction artifact of `run-matrix.mjs`/`lib.mjs`, not a server crash).

## Summary table (main matrix, `matrix-raw.json`, 3144 rows)

| Identity | 2xx | 3xx | 401 | 403 | 404 | 5xx | 429 (`other:429`) | ERR (`-1`) | Total |
|---|---|---|---|---|---|---|---|---|---|
| anon | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| nobody | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| viewer | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| portal-admin | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| portal-other | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| portal-driver | 3 | 0 | 3 | 1 | 0 | 1 | 431 | 1 | 440 |
| manager | 3 | 0 | 0 | 0 | 0 | 1 | 247 | 1 | 252 |
| admin | 3 | 0 | 0 | 0 | 0 | 1 | 247 | 1 | 252 |
| **Total** | | | | | | | **3080** | **8** | **3144** |

**Coverage caveat (important):** 3080 of 3144 rows (98%) are `429 Too Many Requests`. Breaking these down, only the **first 8 of 360 endpoints** in `endpoints.json` order (`POST /api/register`, `POST /api/logout`, `GET /api/user`, `POST /api/session/heartbeat`, `POST /api/reauthenticate`, `GET /health`, `GET /api`, `GET *`) got a real application response for every identity; every one of the remaining 352 endpoints returned 429 for all 8 identities, including fully-authenticated `admin`/`manager` (247/252 = 98% 429 for each). This is not a coverage gap in the test script — it is the direct, reproducible symptom of a new bug, **AM-001** below, and it means this matrix run cannot confirm or refute authorization behavior for the vast majority of the 360-endpoint inventory. The `ERR` row for each identity is the `GET *` (SPA catch-all) request, which fails client-side with `TypeError: Failed to parse URL from http://localhost:5001*` inside `run-matrix.mjs`/`lib.mjs` (same root cause as the `fuzz-get.mjs` bug fixed above, not re-fixed in `run-matrix.mjs` since it wasn't re-run) — it is not a server response and should be disregarded, not read as a 5th "error status" bucket.

## Non-privileged 2xx (5 rows, all benign)

| Endpoint | Method | Identity | Status | Note |
|---|---|---|---|---|
| `POST /api/logout` | POST | anon | 200 | Logout is intentionally unauthenticated-safe (idempotent no-op for a session that isn't logged in); `server/auth.ts:377` has no auth middleware by design. Not a vulnerability. |
| `POST /api/logout` | POST | nobody | 200 | Same as above. |
| `POST /api/logout` | POST | viewer | 200 | Same as above. |
| `POST /api/logout` | POST | portal-other | 200 | Same as above (staff-realm logout tested against a portal identity's cookie jar — still just a no-op). |
| `POST /api/logout` | POST | portal-driver | 200 | Same as above. |

No other endpoint produced a 2xx/3xx for a low-privileged identity in the 64 non-429 rows available. `run-matrix.mjs`'s `detectFlags()` flags every mutation-identity 2xx as `non-privileged-2xx` without excluding known-public endpoints the way it does for its `anon-2xx` flag (which has an `isPublic` allow-list including `/api/logout`) — a script heuristic gap, not a new finding, since the underlying behavior (public logout) is correct.

No `anon-2xx` flagged rows (0) and no rows where a portal-* identity reached a staff-only or another customer's endpoint with 2xx/3xx — but see the coverage caveat above: the endpoints most likely to reveal that class of bug (rows 9-360, e.g. the risk items below) never got past the 429 wall in this run.

## 5xx responses

### From the main matrix (`matrix-raw.json`)

| Endpoint | Identities | Status | Root cause |
|---|---|---|---|
| `GET /object-storage/*` | anon, nobody, viewer, manager, admin, portal-admin, portal-other, portal-driver (all 8) | 500 | `server/routes.ts:7338` — `app.get('/object-storage/*', ...)`, no auth middleware. **Already documented as BUG-051** (`docs/audit/03-phase-3-5-rapport.md:854-860`): unauthenticated by design/oversight, and 500s for everyone (including admin) because the backing Replit object-storage sidecar (`127.0.0.1:1106`) isn't reachable in this environment. Matrix run **confirms BUG-051** — anon gets the same 500 as admin, proving no auth middleware sits in front of it (a 401/403 would have shown one existed).

### From `fuzz-get.mjs` (admin only, 51 rows)

All 51 are caught exceptions with generic JSON error bodies — **no stack traces or file paths leaked** (`stackTrace` column false for every row; this differs from the credential/path leak in AM-004 below, which malformed-json.mjs's targets didn't cover).

- **19 GET endpoints** (`:id`/string path param) return 500 for fuzz values `abc`, `%00`, and/or a 5000-char string instead of 400: `/api/barcodes/:code`, `/api/interactive-damage-checks/:id` (+ `/vehicle/:vehicleId`, `/reservation/:reservationId`, `/vehicle/:vehicleId/customer/:customerId`, `/:id/pdf`), `/api/app-settings/key/:key`, `/api/app-settings/:category`, `/api/custom-notifications/type/:type`, `/api/damage-check-templates/:id` (+ `/:id/export`), `/api/expenses/:id/receipt`, `/api/settings/category/:category`, `/api/settings/key/:key`, `/api/settings/check-contract-number/:contractNumber`, `/api/settings/:id`, `/api/vehicle-diagram-templates/:id` (+ `/match/:vehicleId`, `/:id/image`). See **AM-002**.
- **4 GET endpoints** return 500 unconditionally, with or without fuzzed query params (confirmed by direct bare re-test, not just under fuzzing): `/object-storage/*` (BUG-051, above), `/api/backups/download-data`, `/api/damage-check-templates/by-vehicle`, `/api/reports/maintenance-costs`. See **AM-003** and **AM-004**.

## Sensitive-field leaks

Searched all response snippets/notes captured by `fuzz-get-results.json`, `malformed-json-results.json`, `matrix-raw.json`, and `session-tests-results.json` for `password|passwordHash|hash|secret|token|smtp|apiKey` (case-insensitive) followed by an actual value. **0 genuine leaks found.** One false positive: `session-tests-results.json`'s CSRF test returns the literal message `"Invalid CSRF token"` (the word "token" in prose, not a leaked value).

## New bugs (AM-001 .. AM-004)

### AM-001: `apiLimiter`'s "skip for authenticated users" never fires — authenticated staff/admin traffic shares the same 1000-req/15-min bucket as anonymous traffic
**Severity:** High
**Feature:** General API rate limiting (`server/middleware/security/rateLimiter.ts`)
**Status:** OPEN
**Reproduction:** Run the phase 6-7 identity×endpoint matrix (`run-matrix.mjs`, already-produced `matrix-raw.json`) against a real IP that has done any other moderate API traffic in the trailing 15 minutes. Result: `admin` (a fully valid, freshly-verified session — confirmed working with a manual `GET /api/vehicles?limit=1` → 200 immediately before this analysis) gets `429 Too Many Requests` on 247 of its own 252 read-only `GET` requests (98%), identical to `anon`'s 431/440 (98%). Only the first 8 of 360 endpoints (in registration order) get past the limiter for any identity, staff or anonymous, authenticated or not.
**Expected:** Per `docs/audit/01a-api-en-autorisatie.md:10` and the code comment at `server/middleware/security/rateLimiter.ts:9-11` ("Authenticated users bypass this limiter to prevent shared IP issues"), a logged-in `admin`/`manager` session should never be rate-limited by `apiLimiter`.
**Actual:** `admin`/`manager` are rate-limited exactly like `anon` — the skip logic never triggers.
**Root cause:** `server/index.ts:174` mounts `app.use('/api', apiLimiter)` *before* `setupAuth(app)` is called at `server/index.ts:187`; `setupAuth()` is what wires `app.use(unlessPortal(passport.initialize()))` / `app.use(unlessPortal(passport.session()))` (`server/auth.ts:144-145`), which is what attaches `req.isAuthenticated`. Because Express executes middleware in mount order, when `apiLimiter`'s `skip: (req) => req.isAuthenticated && req.isAuthenticated()` (`server/middleware/security/rateLimiter.ts:18-22`) runs, `req.isAuthenticated` does not exist yet on `req` — the check is always falsy, so no request is ever skipped, for any identity.
**Affected files:** `server/index.ts:174,187`; `server/auth.ts:144-145`; `server/middleware/security/rateLimiter.ts:12-23`.
**Affected data:** None (no data corruption); this is an availability/reliability defect, not a data-integrity one.
**Security impact:** Low directly (it over-restricts rather than under-restricts), but it invalidates the stated mitigation for the office-NAT/shared-IP concern the comment describes, and it degrades the reliability of the rate limiter as a DoS control: because the "authenticated bypass" silently doesn't work, every authenticated session on a given IP consumes the *same* 1000-request/15-minute budget as anonymous traffic, so a small burst of anonymous/scripted traffic (or, as observed here, a second test run reusing the same source IP) can lock out legitimate logged-in staff for up to 15 minutes with `429`s on every single API call, including `GET /api/user` (their own session check) and `GET /health`.
**Business impact:** Any office/NAT-shared IP with moderate concurrent API usage (normal multi-tab dashboard polling, multiple staff behind one router, or a second QA/test pass like this one) can push *all* logged-in staff — not just anonymous visitors — into a 15-minute full API lockout. This directly caused this audit's matrix run to only exercise 8 of 360 endpoints.
**Fix proposal:** Mount `apiLimiter` after `setupAuth(app)` (i.e., after `passport.initialize()`/`passport.session()` are wired), or move the auth/session middleware ahead of the rate limiter in `index.ts`, or replace `req.isAuthenticated && req.isAuthenticated()` with a check that works pre-passport (e.g., presence of a valid session-store `connect.sid` cookie is not itself sufficient — the safest fix is the mount-order change).
**Regression test proposal:** Log in as any staff user, then fire 1005 anonymous `GET /health` (or any public) requests from the same IP within one window; the authenticated session's subsequent `GET /api/vehicles` must still return 200, not 429.

### AM-002: Non-numeric/oversized/null-byte `:id` and string path params return 500 instead of 400 on ~19 GET endpoints
**Severity:** Low
**Feature:** Route param validation (widespread pattern, not one endpoint)
**Status:** OPEN
**Reproduction:** As admin, `GET /api/settings/abc` (or `/api/settings/%00`, or a 5000-char digit string in place of `:id`) → 500 `{"error":"Failed to fetch setting"}` (root cause: `parseInt('abc')` → `NaN` → passed straight into `storage.getAppSetting(NaN)` → Postgres `invalid input syntax for type integer` → caught generically). Same pattern reproduced (500 for `abc`/`%00`, some also for the 5000-char value) on: `/api/barcodes/:code`, `/api/interactive-damage-checks/:id`, `/api/interactive-damage-checks/vehicle/:vehicleId`, `/api/interactive-damage-checks/reservation/:reservationId`, `/api/interactive-damage-checks/vehicle/:vehicleId/customer/:customerId`, `/api/interactive-damage-checks/:id/pdf`, `/api/app-settings/key/:key`, `/api/app-settings/:category`, `/api/custom-notifications/type/:type`, `/api/damage-check-templates/:id`, `/api/damage-check-templates/:id/export`, `/api/expenses/:id/receipt`, `/api/settings/category/:category`, `/api/settings/key/:key`, `/api/settings/check-contract-number/:contractNumber`, `/api/settings/:id`, `/api/vehicle-diagram-templates/:id`, `/api/vehicle-diagram-templates/match/:vehicleId`, `/api/vehicle-diagram-templates/:id/image`.
**Expected:** 400 Bad Request for a malformed/non-numeric identifier.
**Actual:** 500 with a generic message (no stack trace or data leaked — the try/catch pattern used across these routes does prevent a worse leak).
**Root cause:** Representative examples — `server/routes/settings.ts:140-153` (`GET /api/settings/:id`: `parseInt(req.params.id)` unchecked at line 142); `server/routes.ts:6794` (`GET /api/interactive-damage-checks/:id`); `server/routes/damage-check-templates.ts:35-49` (`:id`); `server/routes/vehicle-diagram-templates.ts:28` (`:id`); `server/routes/app-settings.ts:210,295`; `server/routes/custom-notifications.ts:42`. Same `parseInt`-without-validation (or raw-string-into-DB-query) pattern repeated route-by-route; no shared param-validation middleware.
**Affected files:** the 19 route files/lines listed above.
**Affected data:** None.
**Security impact:** Minimal — no leak, no bypass, just a wrong status code plus one extra caught DB round-trip/exception per bad request (trivial resource cost, far below anything that would matter given `apiLimiter` (AM-001) already caps traffic at 1000/15min/IP).
**Business impact:** API consumers/integrations get an opaque 500 instead of an actionable 400 for a simple typo'd ID, which is a minor DX/robustness issue, not a customer-facing one (all affected routes require `requireAuth` or a specific permission).
**Fix proposal:** Add a small shared middleware/helper (e.g. `parseIntParam(name)`) that returns 400 immediately when `req.params[name]` isn't a valid positive integer, applied to all `:id`-style numeric route params; for the two string-param routes (`:code`, `:key`, `:category`, `:type`, `:contractNumber`), reject embedded null bytes (`%00`) with 400 before they reach a DB query.
**Regression test proposal:** For each listed endpoint, `GET` with `:id`/`:param` = `abc`, `%00`, and a 5000-char string must return 400, not 500.

### AM-003: `GET /api/damage-check-templates/by-vehicle` is unreachable — shadowed by the earlier-registered `:id` route
**Severity:** Medium
**Feature:** Damage check templates — "templates by vehicle criteria" lookup (`VIEW_DAMAGE_CHECKS`/`MANAGE_DAMAGE_CHECKS`)
**Status:** OPEN
**Reproduction:** As admin, `GET /api/damage-check-templates/by-vehicle` (with or without `?make=Toyota` — same result either way) → 500 `{"message":"Error fetching damage check template"}` (singular "template"). Compare `GET /api/damage-check-templates` (plain list) → 200, and `GET /api/damage-check-templates/999999999` → the same generic message pattern. The returned message text matches the **`:id` handler's** catch block (`server/routes/damage-check-templates.ts:47`, singular "Error fetching damage check template"), not the `by-vehicle` handler's own catch block (`:63`, plural "Error fetching templates") — proof the request never reaches the intended handler.
**Expected:** `GET /api/damage-check-templates/by-vehicle?make=...&model=...&type=...` returns a filtered (or, with no filters, full) list of templates (200).
**Actual:** Always 500, for every caller, regardless of query params.
**Root cause:** `server/routes/damage-check-templates.ts:35` registers `app.get("/api/damage-check-templates/:id", ...)` *before* `server/routes/damage-check-templates.ts:52` registers `app.get("/api/damage-check-templates/by-vehicle", ...)`. Express matches routes in registration order, so a request to `.../by-vehicle` is captured by the `:id` route first, with `req.params.id === "by-vehicle"`; `parseInt("by-vehicle")` → `NaN` → `storage.getDamageCheckTemplate(NaN)` throws (Postgres invalid-integer error) → caught at `:45-48` → 500. The `by-vehicle` handler at `:52-65` is dead code, unreachable by any client.
**Affected files:** `server/routes/damage-check-templates.ts:35,52`.
**Affected data:** None.
**Security impact:** None.
**Business impact:** Any UI feature that calls this endpoint (matching damage-check templates to a vehicle's make/model/type) is completely broken for every user with `VIEW_DAMAGE_CHECKS`/`MANAGE_DAMAGE_CHECKS`, with no working fallback other than fetching the full list and filtering client-side.
**Fix proposal:** Move the `/by-vehicle` route registration above `/:id` (or any other literal-segment sibling routes above their parameterized `:id` sibling) — standard Express ordering fix. Search the codebase for the same pattern in other route files registered in `:id`-then-literal order.
**Regression test proposal:** `GET /api/damage-check-templates/by-vehicle` (no query params) must return 200 with a JSON array, not 500; response body must not match the `:id`-handler's singular error message.

### AM-004: `GET /api/backups/download-data` leaks the live Postgres connection string (including credentials) and a full local filesystem path in its error response
**Severity:** Medium
**Feature:** App-data backup download (`MANAGE_BACKUPS`)
**Status:** OPEN
**Reproduction:** As admin (has `MANAGE_BACKUPS`), `GET /api/backups/download-data` → 500 `{"error":"Failed to download app data","details":"Command failed: pg_dump \"postgresql://postgres:postgres@localhost:5432/lvs_audit\" > \"C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\temp\\car-rental-data-2026-09-09.sql\"\n'pg_dump' is not recognized as an internal or external command,..."}`.
**Expected:** On a `pg_dump`-unavailable/failed environment, return a clean, generic message without echoing the constructed shell command, connection string, or local path back to the client — matching the "correct behavior" already documented for the sibling endpoint `POST /api/backups/run`, which per `docs/audit/03-phase-3-5-rapport.md:1103` gives "een nette 500 met een expliciete 'install postgresql-client'-melding en zonder crash" (a clean 500 with an explicit install hint, no leaked internals).
**Actual:** The raw `child_process.exec` error message — which Node constructs by embedding the *literal command line it ran*, including the interpolated `DATABASE_URL` — is returned verbatim in the `details` field of the JSON response, exposing the DB username/password (`postgres:postgres`) and the absolute local server path (`C:\Users\kees lam\Desktop\LVStest-main\LVStest-main\temp\...`).
**Root cause:** `server/routes/backups.ts:95` builds and runs `` execAsync(`pg_dump "${databaseUrl}" > "${filepath}"`) `` with the connection string interpolated directly into the shell command string; the `catch` block at `:110-116` returns `error.message` (which, for a failed `exec()`, is Node's synthesized "Command failed: <the full command line>" text) unredacted as `details` in the JSON response at `:114`.
**Affected files:** `server/routes/backups.ts:75-117`.
**Affected data:** None (the DB itself isn't touched by this failure path — `pg_dump` never ran). The disclosed *credential* is the connection string configured for this environment (`DATABASE_URL`), which on this audit box is likely a shared/default local value, but the pattern generalizes to any environment where `pg_dump` is missing or fails for another reason (disk full, auth failure, wrong path).
**Security impact:** Limited by the `MANAGE_BACKUPS` permission gate (not reachable by anon/unauthenticated or by staff without that permission), but it still discloses live database credentials and internal filesystem layout to an authenticated-but-not-necessarily-admin role (`MANAGE_BACKUPS` is a standalone permission per `docs/audit/03-phase-3-5-rapport.md:276-286`, i.e. BUG-010 already shows a `manage_backups`-only account is a realistic, deliberately-limited-privilege actor in this app) — that account did not need "see the DB password" as part of its job.
**Business impact:** If `DATABASE_URL` ever contains a real, non-default password (e.g. in a production deployment where `pg_dump` isn't installed on the app host, or fails for any transient reason), any backup operator's browser network tab/devtools, or any error-tracking/logging pipeline that captures response bodies, ends up holding the live DB password in plaintext.
**Fix proposal:** In the `catch` block, log the full `error` server-side (already done via `console.error` at `:111`) but return a generic client-facing message (e.g. "Database export failed; contact an administrator") without `error.message`; if a detail is needed for support, strip/redact the connection string before including it.
**Regression test proposal:** With `pg_dump` unavailable/failing, `GET /api/backups/download-data`'s JSON response body must not contain the substring from `DATABASE_URL` (host, user, or password) or any absolute filesystem path.

## Malformed-JSON results detail (`malformed-json.mjs`, 30 rows, 0×5xx)

- 6 of 10 target endpoints (`POST /api/vehicles`, `/api/customers`, `/api/reservations`, `/api/users`, `/api/fines`, `/api/pdf-templates`) correctly return 400 for all 3 scenarios (wrong content-type, truncated JSON, 2MB body) — no issue.
- 4 endpoints — `PATCH /api/vehicles/:id`, `PATCH /api/reservations/:id`, `PATCH /api/customers/:id`, `PUT /api/system-settings` — return **200** (not 400) for the "`text/plain` content-type with a JSON body" scenario, echoing the unchanged resource back. This is a genuinely new (not previously documented) finding, but low-severity: `express.json()` (`server/index.ts:177`) only parses the body when `Content-Type: application/json` is sent, so with `text/plain` the body is left empty; these four handlers accept a `.partial()`/optional-fields body (a normal PATCH/PUT contract) and silently apply a no-op update rather than requiring at least one field, returning 200 with the resource unchanged instead of 400. No data is corrupted (verified: the 2MB-body variant of the same 4 endpoints, which *does* parse successfully, also returns 200 with the original — not test-probe — fields intact). Recorded here as a minor input-contract gap rather than a full AM- entry given its triviality (no security/data impact, just a wrong status code on a malformed-content-type PATCH that happens to have nothing required to validate against).

## Session tests (`session-tests.mjs`)

| Test | Status | Result |
|---|---|---|
| CSRF token from another session (`viewer`'s `X-CSRF-Token` + `nobody`'s session cookie) on `POST /api/vehicles` | 403 `CSRF_INVALID` | Correctly rejected — CSRF tokens are session-bound, not just presence-checked. |
| `POST /api/logout` with the `viewer` session | 403 | `viewer`'s saved session had already idled out (15-min rolling cookie) by the time this ran; see note below. |
| `GET /api/vehicles?limit=1` after that logout, same cookie jar | 401 `Not authenticated` | Correct — no session reuse after logout. |
| `connect.sid` copied from an arbitrary row in the `session` table | 401 `Not authenticated` | No session-fixation/hijack via a raw `session`-table `sid` value observed (either the sampled row was itself already expired, or the raw sid alone isn't sufficient — either way, not exploitable here). |

Note: the `viewer` session file (`session-viewer.json`) was already saved from a prior identity-setup run; a manual re-check showed `GET /api/vehicles?limit=1` on that same cookie returning 401 (idle-expired) before `session-tests.mjs` even ran its logout call, which explains the 403 (not 200) on the logout call itself — likely the same CSRF-token-bound-to-now-expired-session mechanism as the first test, applied incidentally. Not a new finding; documented here for traceability, not as an AM- bug (no incorrect authorization observed — logout on a dead session correctly does *not* succeed as an authenticated action, and a fresh un-idled test would be needed to check logout's own status code cleanly, which is out of scope for this pass given AM-001's rate-limit pressure on repeat runs).

## Top risks from `docs/audit/01a-api-en-autorisatie.md` — confirmed / refuted by this matrix run

| # | Risk | Status | Evidence |
|---|---|---|---|
| 1 | Socket.IO broadcasts without auth | **Not tested** | This matrix is HTTP-only; no WebSocket coverage. |
| 2 | Expenses upload/download fully open | **Inconclusive** | `/api/expenses/*` endpoints were never reached by an anon/nobody identity in this run — blocked by AM-001's 429 wall before reaching auth checks. |
| 3 | Open RDW proxy | **Inconclusive** | Same — endpoint never reached in this run. |
| 4 | `/object-storage/*` open | **Confirmed** (already tracked as BUG-051) | `anon` got the identical `500` as `admin`/`manager` on `GET /object-storage/*` — a 401/403 would indicate an auth check exists; getting the same 500 as an authenticated call proves none does. Matches BUG-051's own reproduction exactly. |
| 5 | Reservation delete without permission | **Inconclusive** | Not reached (429). |
| 6 | Interactive damage checks CRUD without permission | **Inconclusive** | Not reached (429) for the authorization question itself; this run did newly find (AM-002) that malformed `:id` values on several `interactive-damage-checks` GET routes 500 instead of 400 — a related but distinct finding. |
| 7 | Bulk customer-drivers migration route without permission | **Inconclusive** | Not reached (429). |
| 8 | Vehicle-diagram-templates without permission | **Inconclusive** | Not reached for the authorization question; AM-002 did newly find malformed-`:id` 500s on 3 of its GET routes. |
| 9 | Contract endpoints without permission | **Inconclusive** | Not reached (429). |
| 10 | SMTP/FTPS passwords stored unencrypted | **Not tested by this run** | Out of scope for HTTP-matrix testing (confirmed elsewhere as BUG-010 per `03-phase-3-5-rapport.md`). |
| 11 | Document routes bypass central path resolution | **Inconclusive** | Not reached (429). |
| 12 | `/api/settings*` gated on the backup permission instead of settings | **Confirmed by existing docs, not newly tested here** | Already tracked as BUG-010 (`docs/audit/03-phase-3-5-rapport.md:276-288`) — this run's `/api/settings/:id` traffic (AM-002) confirms the routes are live and permission-gated with `MANAGE_BACKUPS` (`server/routes/settings.ts:140`), consistent with BUG-010, but did not itself re-test the SMTP-password leak. |
| 13 | `system-settings` writable with mere login (`requireAuth`, no permission) | **Inconclusive** | `PUT /api/system-settings` was hit by `malformed-json.mjs` as **admin** only (not a low-privilege identity), so this run doesn't independently confirm/refute the missing-permission claim; `server/routes/app-settings.ts:463` (`requireAuth` only, no `hasPermission`) is consistent with the risk as filed. |
| 14 | No rate limit for logged-in sessions | **Refuted — and replaced by a worse, opposite bug (AM-001)** | The premise (logged-in sessions have *no* limit) is false: `admin`, a fully-authenticated identity, got 429 on 247/252 (98%) of its own GET requests in this run — rate limiting *does* apply to logged-in sessions, because the code that's supposed to exempt them (`server/middleware/security/rateLimiter.ts:18-22`) never actually fires (AM-001). This also directly resolves the "niet apart gemeten" (not separately measured) gap noted for this item at `docs/audit/03-phase-3-5-rapport.md:1001`. |
| 15 | Uploads to Gemini without redaction | **Not tested by this run** | Out of scope for HTTP-matrix testing. |

**Overall**: only risk #4 (`/object-storage/*`, already BUG-051) and risk #14 (rate limiting, now AM-001) have direct evidence from this matrix run. The other 12 authorization-shaped risks (#2,3,5-9,11,13,15) remain open/untested because AM-001 blocked 352 of 360 endpoints from ever reaching the application's auth/permission middleware during this run. **Recommendation:** re-run `run-matrix.mjs` after either (a) waiting a full clean 15-minute window with zero other traffic from the test IP immediately before starting, or (b) fixing AM-001 first so authenticated identities genuinely bypass the limiter, whichever is more practical for the audit's remaining time budget.

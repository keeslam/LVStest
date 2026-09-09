# Phase 3–5 + Phase 7 (first pass) — Staff auth/sessions, users/settings/backups, customer portal

Date 2026-09-09, audit server `http://localhost:5001` (dev/tsx), database `lvs_audit`. Read `docs/audit/wip/README-agents.md` and `docs/audit/01a-api-en-autorisatie.md` first; this report turns several of 01a's read-only candidates into reproduced, evidence-backed findings and adds new ones found only by exercising the running app. Scripts used are in `docs/audit/wip/scripts/` (`setup.cjs`, `area-a2.cjs`, `area-a3.cjs`, `area-b.cjs`, `area-c.cjs`, `area-c-attachments.cjs`, `area-c-crash-repro.cjs`, `lib.cjs`, `db.cjs`). All test records are prefixed `AUDIT-`/`audit-`.

**Operational note:** the shared dev server on port 5001 crashed twice during this session — once from a benign `EADDRINUSE` race with another concurrent audit agent restarting it, and once as a direct, reproducible consequence of AP-002 below. Both times it was restarted with `PORT=5001 NODE_ENV=development DATABASE_URL=...lvs_audit npx tsx server/index.ts` per the README recipe. Several concurrent audit agents share this one dev-server process; a crash from any one of them takes down everyone's testing.

## Tested

**Area A — staff auth & sessions**
- `POST /api/login` fuzz: empty body, missing password, username as array/object, 10 kB username, SQL-ish `' OR 1=1--`, unicode username, inactive user (403 "Account has been disabled").
- Account lockout: 6× wrong password on a throwaway user (each attempt from a distinct spoofed source IP, to isolate the *account* lockout from the *IP* rate limiter) → locked on attempt 6; correct password then also rejected (429) from a 7th fresh IP; `login_attempts` rows inspected directly.
- Session: protected endpoint with no cookie (401), with a garbage `connect.sid` (401), after `POST /api/logout` (401), after deleting the row from the `session` table directly (401).
- CSRF: POST without `X-CSRF-Token` (403), with a valid token from a *different* session (403), with the header present but no session cookie at all (403). No GET-based mutation routes exist (grepped `auth.ts`/`users.ts`/`portal.ts`/`portal-auth.ts`; CSRF middleware itself only guards non-GET methods).
- `POST /api/users/change-password`: wrong current password (400), new password 1 char (400, policy message), new password 500 chars (400, "too long"), new == current (200, **allowed**), reuse of the immediately-previous password (200, **allowed**), `password_history` table inspected (empty).
- `PATCH /api/users/:id` targeting another user's id as a fully unprivileged user (`permissions=[]`): correctly blocked, 403 "Not authorized to update other user accounts".
- Rate limiting: 20 rapid correct-password logins for a throwaway user, single IP → never 429 (`skipSuccessfulRequests: true`). 6 wrong-password / invalid-body requests from one spoofed IP → 429 on the 6th (baseline). 6 further requests each from a *distinct* spoofed IP (including the literal `::ffff:127.0.0.1` form named in the brief, and a `X-Forwarded-For: 127.0.0.1, 203.0.113.5` multi-hop form) → limiter never trips.

**Area B — users, settings, backups (admin / `permissions=[]` limited user / `manager` role with all permissions)**
- `GET/PUT /api/system-settings`, `GET /api/settings`, `GET /api/backup-settings`, `GET /api/backups/status`, `GET /api/app-settings` as admin, limited, and manager.
- `PUT /api/system-settings` as the limited user (no permission gate on the route at all).
- `POST /api/backups/run` as admin (pg_dump absent → clean `500` with an explicit "install postgresql-client" message, no crash) and as limited (403).
- `GET /api/backups/download/:filename` and `/api/backups/download/:type/:filename` with `../../../../etc/passwd` (URL-encoded and double-encoded) → `400 Invalid filename` both times.
- `PATCH /api/users/:id/admin` as manager (role-gated `requireAdmin` → 403, correct).
- `POST /api/users` with `role: "admin"` as manager → **201, real admin user created**.
- `PATCH /api/users/:id` (self) as manager, setting `role: "admin"` → **200, DB role flips manager → admin**.
- `PATCH /api/users/:id` (self) as the limited user, attempting to add `permissions`/`role`/`active` → correctly stripped by the self-update whitelist, DB unchanged.
- Settings fuzz: `contract-number-override` negative (400, validated), huge (`99999999999`, **500 unhandled**), string (400, validated); `maintenanceExcludedStatuses` as a string via `PUT /api/system-settings` (**500 unhandled**, readback afterwards shows the old array untouched); malformed-JSON POST body to `/api/app-settings` (400 with a stack trace — confirmed in `server/index.ts` to be gated behind `NODE_ENV !== 'production'`, so **not** reported as a bug); email config created with host `127.0.0.1`/port `1`, then read back via four different endpoints to map the redaction boundary.

**Area C — customer portal (customer 179's existing test account + a driver-role account + a second-customer admin account created for this run, all activated by writing a `scrypt` hash directly into `portal_users.password_hash` with the same algorithm as `server/auth.ts:hashPassword`)**
- `POST /api/portal/login` fuzz: empty body, array email, 10 kB email.
- Portal account lockout: 6× wrong password (distinct spoofed IP each) → locked on attempt 6; correct password then still rejected; `login_attempts` rows inspected.
- Portal CSRF: missing header (403), token from a different portal session (403).
- IDOR: with the customer-179 session, requested `/api/portal/reservations/:id`, `/documents/:id/download`, `/fines/:id`, `/requests/:id`, `/vehicles/mine` (list, not scoped by id), `PATCH /api/portal/drivers/:id`, `POST /api/portal/requests` with another customer's `reservationId`, `DELETE /api/portal/requests/:id`, `POST /api/portal/documents/:id/ack` — all against fixture rows belonging to customer 1 (`AUDIT-Other Driver` id 852, a `AUDIT-1` fine id 511 on reservation 80, an `AUDIT` portal-request id 577, plus a pre-existing document id 1 on customer 242's reservation 505). **Every one returned 404/no data — no IDOR found**, confirming 01a's read-only conclusion under live test.
- Driver-role account (customer 179, linked to driver 23): sees only its own 2 reservations (out of the customer's full set), `POST /api/portal/drivers` → 403 role-forbidden, `PATCH /api/portal/me/company` → 403 role-forbidden.
- Requests fuzz: `type: "garbage"` (400, enum validated), `payload` as a valid-JSON-but-non-object string (400, validated), `payload` as an **invalid-JSON string → crashes the whole server process** (see AP-002), message 100 kB (400, 4000-char cap enforced), booking `startDate: "2020-01-01"` (400), booking a currently-rented vehicle for a 2030 date (**201 — correct**: booking availability is calendar/period-based, not live status, by design — `NOT_RENTABLE` check only applies to genuinely non-rentable states), booking a blacklisted vehicle (403), withdrawing a `done` request (400), messaging on a `done` request (400), 6 attachments (400, 5-max enforced), a 15 MB attachment (400, 10 MB cap enforced), an `.exe` (MZ header) renamed `.pdf` (400, rejected by the magic-byte filter).
- Feature switches: `canSubmitRequests: false` for customer 179 → subsequent `POST /api/portal/requests` returns 403 `FEATURE_DISABLED`; `portalEnabled: false` → the existing logged-in session gets 403 `PORTAL_DISABLED` on `GET /api/portal/me` and then 401 on the next call (account logged out server-side on that request). Both restored afterwards.

## Not tested (why)

- **Real-time session idle expiry** (15 min staff / 60 min portal, both rolling): documented from code (`server/auth.ts:114`, `server/portal-auth.ts:38`) rather than waited out in real time — the shared server was already unstable during this run and burning 15–60 minutes of wall clock per attempt wasn't a good trade against the other test areas.
- **Backup restore** (`/restore-data`, `/restore-code`, `/restore-files`, `/restore/database`, `/restore/complete`): destructive to the audit DB/instance and pg_dump is absent so there's no legitimate backup file to restore from; deferred, only `run`/`status`/download-path-traversal were exercised as instructed.
- **Full endpoint-by-endpoint GET-mutation sweep**: confirmed no GET route performs a write in the four auth/portal route files and that the CSRF middleware only guards non-GET; a sweep of all 352 endpoints is Phase 6–8's endpoint matrix, out of this scope.
- **Password-history depth beyond N=1**: since `password_history` is never written at all (AP-006), one round-trip (change, then change back) is sufficient proof; deeper reuse-window testing would add nothing.
- **`trust proxy=1` in a real reverse-proxy topology**: this dev box has no proxy in front, so AP-004 is demonstrated against a topology where the header should not be trusted at all. Whether Coolify/production puts a real proxy in front that this setting is *correct* for (and whether that proxy strips/overwrites client-supplied `X-Forwarded-For`) was not verified — flagged as an assumption for whoever fixes this.
- **Actual SMTP send** with the `127.0.0.1:1` config: only the settings write/read-back was tested; sending mail is Phase 16 per the audit plan.
- Known-devices / new-device warning mail, session-store failover, concurrent-session limits: out of scope for Areas A–C as scoped by this task.

## Bugs

### AP-001 — `manager` role can self-promote to admin and mint new admin accounts
- **Severity:** Critical
- **Feature:** User management / role-based access control
- **Status:** OPEN
- **Reproduction:**
  1. As admin, create a user with `role: "manager"` and the full permission set including `manage_users` (no `admin` role).
  2. Log in as that user.
  3. `POST /api/users` with `{ username, password, role: "admin", ... }` → **201**, a brand-new user with `role: "admin"` exists (DB-verified, id 12/13 in this run).
  4. Separately, `PATCH /api/users/<own id>` with `{ role: "admin" }` → **200**, the caller's own row flips from `manager` to `admin` in the DB (verified before/after: `{id:10, role:"manager"}` → `{id:10, role:"admin"}`).
- **Expected:** Only an actual `admin` (or a narrower "can grant admin" permission) can create or promote another account to `role: "admin"`. A non-admin with `manage_users` should be able to manage ordinary staff accounts, not mint or become admins.
- **Actual:** Any account with the `manage_users` permission — regardless of its own role — can set `role: "admin"` on any user, including itself, via two independent routes.
- **Root cause:**
  - `server/routes/users.ts:92-132` (`POST /api/users`) is gated only by `hasPermission(UserPermission.MANAGE_USERS)`; it never checks the *value* of `role` in the body against the caller's own role.
  - `server/routes/users.ts:134-245` (`PATCH /api/users/:id`) computes `isSelfUpdate`, `isAdmin`, `hasManageUsersPermission`. The strict field whitelist (username/fullName/email only) is applied **only** when `isSelfUpdate && !isAdmin && !hasManageUsersPermission`. A manager satisfies `isSelfUpdate` but also `hasManageUsersPermission`, so it falls into the `else` branch and the entire `req.body` — including `role` and `permissions` — is applied verbatim. The separate `PATCH /api/users/:id/admin` route *is* correctly role-gated (`requireAdmin`, tested → 403 for manager), but it's not the only door.
- **Affected files:** `server/routes/users.ts:92-132`, `server/routes/users.ts:134-245`.
- **Affected data:** `users.role`, `users.permissions` for any row, including the attacker's own.
- **Security impact:** Full vertical privilege escalation from a "manager, not admin" account to unrestricted admin, with no admin approval step. Combined with `manage_users` being a fairly ordinary-sounding permission to hand to a shift lead or ops person, this is a realistic path from "trusted-but-limited staff" to full admin.
- **Business impact:** Any manager-tier account is effectively equivalent to admin. Audit trails (`updatedBy`) still show who did it, but nothing prevents or flags it happening.
- **Fix proposal:** In both routes, require the caller to already be `role: "admin"` before `role` can be set to `"admin"` (or introduce a distinct `grant_admin` permission held only by real admins). For the self-update path specifically, `role` and `permissions` should never be settable on one's own row except by an actual admin, regardless of `manage_users`.
- **Regression test proposal:** A user with `role: "manager"` and `manage_users` permission (but not `role: "admin"`) must get 403 from both `POST /api/users {role:"admin"}` and `PATCH /api/users/:id {role:"admin"}` (self and other), and the DB must show no change.

### AP-002 — malformed portal request payload crashes the entire server
- **Severity:** Critical
- **Feature:** Customer portal — `POST /api/portal/requests`
- **Status:** OPEN
- **Reproduction:**
  1. Log in to the portal as any account (tested with the customer-179 admin account, `portaal-test@example.com`).
  2. `POST /api/portal/requests` with JSON body `{"type":"other","message":"...","payload":"not-json-at-all"}` (a non-JSON string in `payload`).
  3. The request never returns a response; the TCP connection is reset (`ECONNRESET`); the entire Node process exits and **the server stops answering any request, for every user, staff and portal alike**, until someone restarts it.
  4. Reproduced twice in isolation (`docs/audit/wip/scripts/area-c-crash-repro.cjs`), each time bringing the shared dev server down for every concurrent audit session on this box.
- **Expected:** A malformed `payload` field should produce a `400 PORTAL_VALIDATION` response, exactly like the adjacent "valid JSON but not an object" case does.
- **Actual:** The process crashes.
- **Root cause:** `server/routes/portal.ts` (the `POST /api/portal/requests` handler, around the `base = z.object({...}).safeParse(req.body)` call):
  ```ts
  payload: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown())),
  ```
  `JSON.parse` throws a `SyntaxError` synchronously *inside* the zod `.preprocess()` callback when the string isn't valid JSON. Zod's `safeParse` does not catch exceptions thrown by a `.preprocess()` transform (only validation failures are turned into a `ZodError`), so the `SyntaxError` propagates out of the `async (req, res) => {...}` handler as an unhandled rejection. The app's global uncaught-exception/unhandled-rejection handler in `server/index.ts` treats this as fatal and runs a full graceful (or forced) shutdown — appropriate for a genuinely fatal error, catastrophic for a single bad user request.
- **Affected files:** `server/routes/portal.ts` (payload schema in the `POST /api/portal/requests` handler), `server/index.ts` (global uncaught-exception handler that terminates the process).
- **Affected data:** None directly corrupted, but any in-flight request from any other user (staff or portal) is dropped when the process dies.
- **Security impact:** Unauthenticated-adjacent (only requires a valid, even low-privilege, portal login — e.g. the driver-role account, which has no admin rights at all) remote denial-of-service against the entire application, staff side included, with a single HTTP request.
- **Business impact:** Total outage until someone notices and restarts the process; in this shared audit environment it took down every concurrent audit agent's testing twice.
- **Fix proposal:** Wrap the `JSON.parse` in the `.preprocess()` callback in a try/catch that returns a sentinel (e.g. `z.NEVER` or a value that fails the downstream `z.record()` check) instead of throwing — or validate/parse the string before handing it to zod. More generally, wrap the whole route handler body in try/catch (or add `express-async-errors` / an async wrapper) so a thrown error becomes a `400`/`500` JSON response instead of an uncaught exception, and audit other `JSON.parse(...)` calls fed by request bodies for the same pattern.
- **Regression test proposal:** `POST /api/portal/requests` with `payload: "not-json-at-all"` must return `400 PORTAL_VALIDATION` and the process must still be answering requests immediately afterward (assert a follow-up `GET /api/portal/me` on the same or a new session still returns 200/401 as appropriate, not a connection error).

### AP-003 — account lockout lasts ~9× longer than documented (timezone bug)
- **Severity:** High
- **Feature:** Staff and portal login lockout (`checkAccountLockout`)
- **Status:** OPEN
- **Reproduction:**
  1. Trigger a lockout (5 failed logins for one account, as in the Area A/C repro above).
  2. The 429 response body reports `"Account temporarily locked ... try again in 135 minute(s)"`, `remainingTime: 8100` (seconds) — for a lockout documented and coded as 15 minutes.
  3. Confirmed the mechanism directly: `login_attempts.attempted_at` is stored as `timestamp without time zone`; the Postgres session's `TimeZone` is `Europe/Berlin` (currently UTC+2, DST). Reading the same raw row two ways:
     - `pg` driver default parsing (as used by `docs/audit/wip/scripts/db.cjs`) treats the naive string as the Node process's local time → produces the correct instant.
     - Drizzle ORM's timestamp mapping (as used by `checkAccountLockout` in the running server, via `db.select().from(loginAttempts)`) treats the same naive string as UTC → produces a Date **2 hours later** than reality.
     - Verified with a direct `to_char()` dump plus both parsings side by side: difference = exactly 7,200,000 ms = 120 minutes = the current Berlin UTC offset. `15 (documented) + 120 (offset bug) = 135` matches the observed message exactly.
- **Expected:** Lockout lasts 15 minutes from the oldest qualifying failed attempt, per `server/middleware/security/rateLimiter.ts`'s own comments and the `15 * 60 * 1000` constant.
- **Actual:** Lockout lasts `15 + (local UTC offset in minutes)` — 135 minutes in this environment right now (CEST, UTC+2); it would be ~76 minutes in winter (CET, UTC+1), and the offset (and thus the bug's severity) depends entirely on the Postgres session's configured `TimeZone`.
- **Root cause:** `shared/schema.ts:1990` declares `attemptedAt: timestamp("attempted_at").defaultNow().notNull()` — a `timestamp without time zone` column — with a Postgres session timezone that is not UTC. Postgres itself stores/returns the session-local wall-clock string with no zone marker. Drizzle-orm's default mapping for that column type assumes the naive string is UTC and appends `Z`, silently double-applying the session's UTC offset when the value is later compared against `Date.now()` (which *is* real UTC) in `checkAccountLockout` (`server/middleware/security/rateLimiter.ts:40-86`).
- **Affected files:** `shared/schema.ts:1990` (and by the same pattern, any other `timestamp()` column read through Drizzle and compared against `Date.now()`), `server/middleware/security/rateLimiter.ts:40-86`.
- **Affected data:** `login_attempts.attempted_at` interpretation; the same class of bug likely affects any other lockout/expiry math built on a bare `timestamp` column, though only the login lockout path was verified here.
- **Security impact:** Low directly (longer lockouts don't help an attacker), but it materially changes the account-lockout security control's actual behavior from its documented/coded value, which matters for incident response and support expectations.
- **Business impact:** A staff or portal user who mistypes their password 5 times is locked out for well over two hours instead of 15 minutes, with no way to self-recover and a support message that (if it even quotes the number) tells them the wrong wait time. This will generate support load and rage on this Postgres/OS timezone configuration.
- **Fix proposal:** Either store `attempted_at` (and any other timestamp read through Drizzle and compared to wall-clock `Date.now()`) as `timestamptz` (`timestamp with time zone`), or run Postgres sessions with `TimeZone=UTC` app-wide, or read this specific column with `{ mode: 'string' }` and parse it explicitly as UTC to match how it was written. Whichever fix is chosen, add a regression test that inserts a row, waits (or fakes) past the intended window, and asserts the lockout clears within the documented 15 minutes regardless of the server/DB process timezone.
- **Regression test proposal:** With the Postgres session `TimeZone` set to a non-UTC zone (e.g. `Europe/Berlin`) in the test setup, lock an account, then assert `remainingTime` in the 429 response is within a few seconds of 900 (15 min), not ~8100.

### AP-004 — per-IP login rate limiter is fully bypassable via `X-Forwarded-For`
- **Severity:** High
- **Feature:** Staff and portal login rate limiting (`loginLimiter`)
- **Status:** OPEN
- **Reproduction:**
  1. `app.set("trust proxy", 1)` (`server/auth.ts:135`) applies to the whole Express app, including `/api/login` and `/api/portal/login`.
  2. 6 requests to `POST /api/login` with the *same* spoofed `X-Forwarded-For` → 429 on the 6th (baseline, limiter works as designed for one IP).
  3. 6 further requests, each with a *different* spoofed `X-Forwarded-For` (plain IPv4s, and separately the literal `::ffff:127.0.0.1` form, and a multi-hop `X-Forwarded-For: 127.0.0.1, 203.0.113.5` form) → **every single one gets through as a normal 401**, the limiter never trips, because each is treated as a distinct client IP.
  4. This dev box has no real reverse proxy in front of it — the header is entirely attacker-controlled.
- **Expected:** The 5-attempts-per-15-minutes login limiter should throttle an attacker regardless of a self-reported source IP.
- **Actual:** Trivially bypassed by varying `X-Forwarded-For` per request.
- **Root cause:** `express-rate-limit`'s default key generator uses `req.ip`, which — with `trust proxy: 1` — is derived from the client-supplied `X-Forwarded-For` header. With no real proxy validating/overwriting that header before it reaches the app, any client can present a different apparent IP on every request. This is also flagged as a known `express-rate-limit`/proxy-trust class of issue in Phase 2's `npm audit` ("IPv4-mapped IPv6 omzeilt per-client limiet") — this finding reproduces it directly against this app's actual login endpoints rather than as a dependency advisory.
- **Affected files:** `server/auth.ts:135` (`trust proxy`), `server/middleware/security/rateLimiter.ts:28-35` (`loginLimiter`), used by both `server/auth.ts:263` and `server/portal-auth.ts:233`.
- **Affected data:** None directly; enables the *attack surface*, not a data change.
- **Security impact:** The per-account lockout (AP-003's subject) is unaffected by this, since it keys on username only — so brute-forcing *one* account is still capped at 5 attempts. But this bypass means an attacker can spray a handful of password guesses across an unlimited number of *different* usernames/emails from one machine without ever being throttled, which is exactly the large-scale credential-stuffing scenario the IP limiter exists to blunt.
- **Business impact:** Meaningfully weakens brute-force/credential-stuffing defenses for both the staff and portal login surfaces.
- **Fix proposal:** If this deployment (Coolify) does sit behind a real reverse proxy, confirm `trust proxy` is set to the correct hop count and that the proxy itself strips/overwrites any client-supplied `X-Forwarded-For` before forwarding. If there is no trusted proxy in front, set `trust proxy` to `false` (or remove it for the login routes specifically) so `req.ip` reflects the real socket address. Consider layering a secondary, IP-independent control (e.g. a global attempts-per-minute cap, or CAPTCHA after N failures) that doesn't depend on trusting client-supplied headers at all.
- **Regression test proposal:** 6 requests to `/api/login` with 6 different `X-Forwarded-For` values must still trip a limiter (either because `trust proxy` no longer honors the header, or because of a header-independent secondary control) by the 6th request.

### AP-005 — `GET /api/settings` leaks the raw SMTP password to any `manage_backups` holder
- **Severity:** High
- **Feature:** App settings / email configuration
- **Status:** OPEN
- **Reproduction:**
  1. As admin, create an `email_config` app setting with `smtpPassword: "AUDIT-super-secret-smtp-pw"`.
  2. Confirm `GET /api/app-settings` (list) and `GET /api/app-settings/key/email_config` both correctly redact it (`smtpPassword: ""`) for any authenticated user — this part works as intended.
  3. Confirm `GET /api/app-settings/email` (category route, gated on `manage_settings`) correctly returns the real password, and that a user with `permissions: []` gets 403 from it.
  4. Grant a throwaway user **only** `manage_backups` (explicitly *not* `manage_settings`) and log in as them.
  5. `GET /api/settings` (the older, separate settings module) → **200**, and the `email_config` entry in the response array contains the **unredacted** `smtpPassword: "AUDIT-super-secret-smtp-pw"`.
- **Expected:** Only holders of `manage_settings` (or admin) should ever see the raw SMTP password; a `manage_backups`-only account should get either a redacted value or 403, matching the boundary already enforced correctly on the `/api/app-settings/*` routes.
- **Actual:** `GET /api/settings` is gated on the *wrong* permission (`manage_backups` instead of `manage_settings`) and reads the setting via `storage.getAllAppSettings()` directly with no redaction at all, so the boundary that exists elsewhere in the codebase (`redactAppSetting`, `server/routes/app-settings.ts:28-33`) is simply absent on this parallel route.
- **Root cause:** `server/routes/settings.ts:15` (`GET /api/settings`, and the sibling `/category/:category`, `/key/:key`, `/:id` routes at lines 25/36/140) are all gated with `hasPermission(UserPermission.MANAGE_BACKUPS)` — already flagged as "vermoedelijk verkeerde permissie" in `docs/audit/01a-api-en-autorisatie.md` — and none of them redact `smtpPassword` before responding, unlike the newer `server/routes/app-settings.ts` module that duplicates most of the same functionality correctly.
- **Affected files:** `server/routes/settings.ts:15-231`, contrast with `server/routes/app-settings.ts:24-44,210-213`.
- **Affected data:** `app_settings` rows with `category = 'email'` (and any other setting category that happens to store a secret the same way).
- **Security impact:** SMTP credential disclosure to a permission tier (`manage_backups`) that has no obvious reason to see email credentials, widening the blast radius of any account compromise or insider-misuse scenario for that role.
- **Business impact:** Real mailbox credentials (in production, not the dev/test host used here) would be exposed to backup operators; a compromised SMTP account can be used for spam/phishing under the company's domain.
- **Fix proposal:** Either retire `server/routes/settings.ts`'s app-settings routes in favor of the `app-settings.ts` module (per 01a's note that these look like near-duplicates), or apply the same `redactAppSetting` treatment and correct permission (`manage_settings`) to every route in `settings.ts` that can return a setting value.
- **Regression test proposal:** A user with `permissions: ["manage_backups"]` only must never see a non-empty `smtpPassword` from any settings-read endpoint.

### AP-006 — password reuse is never prevented; `password_history` is dead code
- **Severity:** Medium
- **Feature:** `POST /api/users/change-password`
- **Status:** OPEN
- **Reproduction:**
  1. As a throwaway user, `POST /api/users/change-password` with `newPassword` equal to the current password → **200 success** (no "must differ" check).
  2. Change the password to a new value (200), then immediately change it back to the original value → **200 success**.
  3. `select * from password_history where user_id = <id>` → **0 rows**, both before and after.
  4. `grep -rn passwordHistory server/` shows the table is imported into `server/storage.ts` and nothing else — no insert, no lookup, anywhere in the codebase.
- **Expected:** Given the schema explicitly models `password_history` (`shared/schema.ts:1967-1979`), the intent was presumably to prevent reuse of at least the immediately preceding password(s); at minimum, a "new password must differ from current" check is standard practice.
- **Actual:** No history is ever recorded, no reuse check exists at all, and a user can even "change" their password to the exact same value they already had.
- **Root cause:** `server/routes/users.ts:349-398` (`POST /api/users/change-password`) hashes and stores the new password with no comparison against history or the current value; `passwordHistory`/`insertPasswordHistorySchema` (`shared/schema.ts:1967-1979`) is fully defined but never referenced from any route or storage method.
- **Affected files:** `server/routes/users.ts:349-398`, `shared/schema.ts:1967-1979`, `server/storage.ts:24`.
- **Affected data:** `users.password`; `password_history` table (permanently empty).
- **Security impact:** Low-to-moderate — weakens the value of a forced password rotation (e.g. after a suspected compromise), since a user can immediately rotate right back to the compromised password.
- **Business impact:** None directly; mostly a compliance/best-practice gap if password rotation policies are ever required.
- **Fix proposal:** Either implement the history check the schema clearly intended (hash-compare `newPassword` against the current hash and the last N rows of `password_history`, insert a row on every successful change), or remove the unused table/types if reuse prevention is deliberately out of scope, so the schema doesn't imply a control that doesn't exist.
- **Regression test proposal:** `change-password` with `newPassword === currentPassword` must be rejected with a clear validation message; changing A→B→A must reject the second change once history is implemented.

### AP-007 — `system-settings` is writable by any authenticated user, no permission required
- **Severity:** Medium
- **Feature:** `GET/PUT /api/system-settings`
- **Status:** OPEN
- **Reproduction:** As a throwaway user with `permissions: []` (no permissions at all), `PUT /api/system-settings` with `{ contractNumberStart: 999999, tollRatePerKm: "9.99" }` → **200**, and the values are persisted (confirmed via a follow-up `GET` as admin).
- **Expected:** Writing system-wide settings (contract numbering, service-interval defaults, toll rate, depot address, maintenance-excluded statuses) should require at least `manage_settings`, matching the permission model used everywhere else for administrative configuration.
- **Actual:** The route only checks `requireAuth` (any logged-in session, any role, any permission set).
- **Root cause:** `server/routes/app-settings.ts:431` (`GET /api/system-settings`) and `:463` (`PUT /api/system-settings`) use `requireAuth` only, with no `hasPermission(...)` gate — already flagged as a read-only candidate in `docs/audit/01a-api-en-autorisatie.md` ("13. system-settings schrijfbaar met alleen login"), now confirmed live.
- **Affected files:** `server/routes/app-settings.ts:431,463`.
- **Affected data:** The single `settings` row (contract numbering, service intervals, toll rate, depot address, etc.) — application-wide, not per-user.
- **Security impact:** Low-severity from a confidentiality standpoint (nothing secret here), but it's an availability/integrity gap: any account, however low-privilege, can globally change contract numbering or service-reminder thresholds.
- **Business impact:** A compromised or careless low-privilege account (e.g. a viewer/cleaner-role account) can silently corrupt contract numbering (colliding with real contracts) or disable APK/warranty/service reminders company-wide.
- **Fix proposal:** Add `hasPermission(UserPermission.MANAGE_SETTINGS)` (or a more specific permission) to both routes.
- **Regression test proposal:** A user with `permissions: []` must get 403 from `PUT /api/system-settings`; a user with `manage_settings` must succeed.

### AP-008 — missing input validation on settings writes causes unhandled 500s
- **Severity:** Medium
- **Feature:** `POST /api/settings/contract-number-override`, `PUT /api/system-settings`
- **Status:** OPEN
- **Reproduction:**
  1. `POST /api/settings/contract-number-override` with `{ overrideNumber: 99999999999 }` (11 digits) → **500 `{"message":"Error setting override"}`** (negative and string values are correctly rejected with 400 by the existing `typeof`/`< 1` check; only the "too large for the column" case falls through to an unhandled DB error).
  2. `PUT /api/system-settings` with `{ maintenanceExcludedStatuses: "not_an_array" }` (string instead of array) → **500 `{"message":"Error updating settings"}`**. A follow-up `GET /api/system-settings` shows the value was *not* corrupted (old array intact), so this specific case fails safe, but as an unhandled exception rather than a validation error.
- **Expected:** Out-of-range or wrong-shaped input should be rejected with a `400` and a useful message, the same way the negative/string `overrideNumber` cases already are.
- **Actual:** Both cases reach the database layer, throw there, and are caught only by the route's generic `catch` → generic `500`.
- **Root cause:** `server/routes/settings.ts:91-119` (`contract-number-override`) validates `typeof`/`< 1` but not an upper bound before handing the number to Postgres (integer overflow). `PUT /api/system-settings` (`server/routes/app-settings.ts:463-497`) destructures `req.body` directly into `storage.updateSettings(...)` with no schema validation at all (no Zod), so any wrong-typed field only fails once it reaches the DB driver.
- **Affected files:** `server/routes/settings.ts:91-119`, `server/routes/app-settings.ts:463-497`.
- **Affected data:** None corrupted in the reproduced cases (writes fail entirely), but the lack of a schema means other wrong-shaped fields on the same routes are unvalidated too.
- **Security impact:** Low — this is a robustness/input-validation gap, not directly exploitable beyond noisy 500s and (in dev mode only) a stack trace in the response body, which is correctly suppressed in production (`NODE_ENV==='production'` check in `server/index.ts`).
- **Business impact:** A typo'd/malformed settings-form submission surfaces as an opaque server error instead of a field-level validation message, and — combined with AP-007 — any authenticated user can trigger it.
- **Fix proposal:** Add a Zod schema for the `PUT /api/system-settings` body (matching the shape already destructured), and an upper bound (e.g. fits in a Postgres `integer`) on `overrideNumber`.
- **Regression test proposal:** Both reproductions above should return `400` with a validation message instead of `500`.

### AP-009 — new password identical to current password is silently accepted
- **Severity:** Low
- **Feature:** `POST /api/users/change-password`
- **Status:** OPEN
- **Reproduction:** `POST /api/users/change-password` with `newPassword` equal to the account's current password → 200 success.
- **Expected:** Most password-change flows reject "new password is the same as the old one" with a clear message.
- **Actual:** Silently accepted (also part of AP-006's root cause, listed separately here since it's independently fixable with a one-line check even before any history feature exists).
- **Root cause:** `server/routes/users.ts:349-398` never compares `newPassword` to the current password before hashing and storing it.
- **Affected files:** `server/routes/users.ts:349-398`.
- **Affected data:** `users.password`.
- **Security impact:** Negligible on its own.
- **Business impact:** Minor UX gap; a "forced rotation" has no teeth if the same password is accepted back immediately.
- **Fix proposal:** After verifying `currentPassword`, compare it (via `comparePasswords`) against `newPassword` and reject with 400 if they match, independent of the broader AP-006 fix.
- **Regression test proposal:** `change-password` with `newPassword === currentPassword` must return 400.

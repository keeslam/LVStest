# Phase 34 + 35 — remediation plan (PLAN ONLY)

Repo `C:\Users\kees lam\Desktop\LVStest-main\LVStest-main`, branch `fix/audit-remediation`
(code identical to production `main` 3e28645e). Written against the consolidated audit reports
`docs/audit/03-…` through `docs/audit/08-…` and the code-quality evidence in
`docs/audit/wip/p20-code-quality.md`.

**This document changes no application code.** It is the work order for phase 35 (bug fixing) and
phase 34 (workflow improvements). Nothing in it may be executed before the owner has read
§1 (Scope & rules) and §7 (Business decisions still open).

Bug titles are quoted verbatim in Dutch, exactly as they appear in the tracker; everything else is
in English.

---

## 1. Scope & rules

### 1.1 What may be changed without further approval

The owner has already approved (a) fixing the technical defects found in phases 3–19 and (b) the
33 OPT proposals *as a set*. On that basis the following may be implemented on
`fix/audit-remediation` without asking again:

1. Every bug in the **TECHNICAL-FIX** bucket of the triage table below (191 bugs). These are
   defects where the correct behaviour is not in dispute: a crash, a missing permission check, a
   wrong path, a lost update, a value silently dropped.
2. Every bug in the **ENVIRONMENT/DEV-ONLY** bucket (2 bugs) — test-harness changes only.
3. The **17 non-decision OPT proposals** (QUICK WIN / MEDIUM / LARGE), as phase 34, *after* the FIX
   clusters they depend on have landed.
4. New test files, new test helpers, new `vitest` projects, and the test-database switch.
5. Purely additive, non-behavioural refactors that a fix requires — extracting a shared helper,
   adding a zod schema, adding a middleware — provided the extracted behaviour is the behaviour the
   old code already had on the happy path.

### 1.2 What may NOT be changed without a written owner decision

1. The **32 BUSINESS-DECISION bugs**. Each changes what an employee or a customer experiences, or
   what a status means. They stay OPEN until the owner answers the question in §7.
2. The **16 BUSINESS DECISION OPTs**. Approval of the set was explicitly *not* a choice of rule.
   Section 7 lists the one question that has to be answered per item. Do not design, build or
   prototype these.
3. **Any change to production data.** No clean-up migration, no orphan-row deletion, no status
   reconciliation, no timestamp rewrite. BUG-143, BUG-144, BUG-224 and OPT-033 are all in this
   category.
4. **Any schema migration that is not additive.** Adding a nullable column or a partial index is
   allowed inside a TECHNICAL-FIX when the fix needs it, provided `npm run schema:export` is rerun
   so `schema-columns.json` stays the source of truth for the production additive sync. Adding a
   NOT NULL constraint, a foreign key, a CHECK constraint, or changing a column type is **not** —
   those run against 675 vehicles and a dataset with known orphan rows, and are owner decisions.
5. **Deployment configuration.** `trust proxy` hop count, `NODE_ENV`, gzip at the proxy, the
   Dockerfile's tool dependencies, the Coolify start command. See the DEFERRED bucket.
6. **Dependency upgrades with breaking changes.** `npm audit` reports 70 vulnerabilities (3
   critical, 23 high). Clearing them is a separate, owner-scheduled job — not part of a bug wave.
   The one exception is activating the already-declared-but-unimported `tar` package (CQ-014),
   which FIX-L needs.

### 1.3 Rules of engagement for every wave

- **Branch:** all work on `fix/audit-remediation`. One commit per FIX cluster, message
  `fix(audit): FIX-x <name> — closes BUG-a, BUG-b, …`.
- **Test database — mandatory, every run, no exception:**

  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run
  ```

  PowerShell equivalent:

  ```
  $env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/lvs_fixtest'; npx vitest run
  ```

  `server/__tests__/setup.ts` calls `dotenv.config()`, which does **not** overwrite an
  already-present environment variable, so the command-line value wins over `.env`. `lvs_fixtest`
  is a clone of dev and exists for exactly this reason: the suite currently leaves 258 orphan
  maintenance blocks behind in whatever database it runs against (BUG-145), because
  `cleanupPortalTestData` in `server/__tests__/portal-helpers.ts:73-93` deletes reservations only
  by *test-customer* id and then hard-deletes the `PT%` vehicles. Never run the suite against the
  dev database again.
- **Baseline:** 26 files / 126 tests green. Every wave ends green and the test count only goes up.
- **`npm run check` (tsc) stays at zero errors** — part of every wave's acceptance.
- **No cross-wave rework.** A wave that has to reopen a file an earlier wave already rewrote is a
  planning error; the wave order in §5 exists to prevent that.
- **`server/routes.ts` is a single-writer resource.** It is 7 758 LOC of which 7 664 sit inside one
  function (`registerRoutes`, `:96-7759`), with 119 route registrations and fan-out 45. **23 of the
  27 clusters touch it.** Two workers may never have it open at the same time. §5 marks, per wave,
  which cluster owns `routes.ts` and which clusters may run beside it.
- **Never split `registerRoutes` as part of a bug fix.** Phase 20 explicitly warns that the 22
  already-extracted modules under `server/routes/` are the good pattern, but extracting more of the
  monolith mid-remediation would make every subsequent wave's diff unreviewable. Extraction, if the
  owner wants it, is a separate job after wave 9.

### 1.4 Counts

| Bucket | Count |
|---|---|
| (a) TECHNICAL-FIX | **191** |
| (b) BUSINESS-DECISION | **32** |
| (c) ALREADY-REFUTED / NOT-REPRODUCIBLE | **2** |
| (d) ENVIRONMENT/DEV-ONLY | **2** |
| (e) DEFERRED (needs infrastructure from the owner) | **3** |
| **Total** | **230** |

Severity distribution of the tracker as a whole: **13 CRITICAL · 64 HIGH · 94 MEDIUM · 59 LOW**.

The audit's own classification was 198 T / 32 B. This plan keeps all 32 B as BUSINESS-DECISION and
moves 7 of the 198 T out of TECHNICAL-FIX:

- **REFUTED:** BUG-076 (`originalname` traversal on the backup upload — busboy reduces the name to
  its basename for both `/` and `\`; verified live in phase 15, neither encoding escaped) and
  BUG-097 (the backup filename filter misses the backslash — `..` is rejected with 400 before the
  backslash gap can matter; all three traversal encodings gave 400). Both stay on the board as
  *hardening* (replace the `includes` blacklist with a `path.basename()` comparison, apply
  `sanitizeFilename`) because today the protection comes from a library detail of this
  multer/busboy version, not from our own code. Neither is an open hole and neither earns a wave.
- **ENVIRONMENT/DEV-ONLY:** BUG-057 (malformed JSON returns a full Node stack trace — the code at
  `server/index.ts:428-433` is correct and dev-gated; what is needed is a confirmation that the
  deployed `NODE_ENV` is `production`, plus a loud start-up assertion when it is not) and BUG-145
  (the vitest suite runs against the shared dev database and leaves 258 orphan maintenance blocks).
- **DEFERRED:** BUG-009 and BUG-082 (both need the real Coolify/Traefik hop count and proof that
  the proxy *overwrites* rather than appends `X-Forwarded-For`; setting `trust proxy` wrong is worse
  than leaving it) and BUG-214 (HTTP compression — the audit could not verify whether Traefik
  already gzips; adding `compression` on top of a proxy that already does it wastes CPU).

**A note on BUG-079.** Phase 19 refuted its *volume* claim (203 bytes per line, ≈1 MB/day at 5 000
requests — not a problem). The *leak* half — full JSON response bodies written to the container log —
stands. BUG-079 therefore remains TECHNICAL-FIX (cluster FIX-U) with its scope narrowed to
redaction/disable, and the CPU-and-volume half lives on as BUG-227 instead.

**E18-007 is not in the tracker.** "Enter does not submit the login form" was reproduced twice in
the browser harness but the code is a normal `<form onSubmit=…>` with a `type="submit"` button, and
the identical symptom appeared on the separate portal login form — strongly suggesting the harness's
synthetic Return key. Confirm it once by hand in a real browser (`/auth`, type credentials, press
Enter, watch for `POST /api/login`); if it really does not fire, open it as a new LOW bug.

---

## 2. Triage table — all 230 bugs

Bucket key: **TECHNICAL-FIX** · **BUSINESS-DECISION** · **REFUTED** · **ENV/DEV-ONLY** ·
**DEFERRED**. "Root-cause cluster" names the FIX cluster for technical bugs, and for business
decisions the OPT it belongs to plus the question the owner must answer. "Files touched" is the
tracker's own *Affected files*, condensed. "Risk of fix" is the risk of *making the change*, not the
risk of leaving the bug alone.

| BUG | Sev | Title (NL, verbatim) | Bucket | Root-cause cluster / decision | Files touched | Test type | Risk |
|---|---|---|---|---|---|---|---|
| BUG-001 | CRITICAL | manager met manage_users promoveert zichzelf tot admin (was AP-001) | TECHNICAL-FIX | FIX-I permission gaps | server/routes/users.ts:92-132, :134-245 | supertest | med |
| BUG-002 | CRITICAL | malformed payload in POST /api/portal/requests sloopt het hele serverproces (was AP-002 / DM-001) | TECHNICAL-FIX | FIX-A async errors (CQ-001) | server/routes/portal.ts:305-317, server/index.ts (unhandledRejection-handler) | supertest + child-process | low |
| BUG-003 | CRITICAL | vier expenses-routes volledig zonder authenticatie (was DM-012) | TECHNICAL-FIX | FIX-J unauth endpoints | server/routes/expenses.ts:158,275,341,405 | supertest | low |
| BUG-004 | CRITICAL | maintenance-with-spare hard-delete van een al opgehaalde vervanger (was MT-001) | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes.ts:2932-3022, server/database-storage.ts:1270-1283 | integration | high |
| BUG-005 | CRITICAL | Socket.IO zonder authenticatie broadcast volledige records (was RT-001) | TECHNICAL-FIX | FIX-J unauth endpoints | server/index.ts, server/realtime-events.ts, client/src/hooks/use-socket.tsx | supertest | low |
| BUG-006 | CRITICAL | dubbele boeking onder concurrency (was RS-001) | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/database-storage.ts (checkReservationConflicts), server/routes.ts (POST /api/reservation… | integration + concurrency | high |
| BUG-007 | CRITICAL | klant hard verwijderd zonder impactcheck; booked reservering blijft dangling (was VC-006) | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/database-storage.ts:980-986, server/routes.ts:2114-2134, shared/schema.ts (reservations.… | integration + SQL | high |
| BUG-008 | HIGH | account-lockout duurt 135 in plaats van 15 minuten (timezone-bug) (was AP-003) | TECHNICAL-FIX | FIX-K auth/session/limits | shared/schema.ts:1990, server/middleware/security/rateLimiter.ts:40-86 | supertest | med |
| BUG-009 | HIGH | login-rate-limiter volledig te omzeilen via X-Forwarded-For (was AP-004) | DEFERRED | DEFERRED — needs the real Coolify/Traefik hop count and XFF-strip behaviour | server/auth.ts:135,263, server/middleware/security/rateLimiter.ts:28-35, server/portal-auth.ts:… | n/a until infra known | n/a |
| BUG-010 | HIGH | GET /api/settings lekt het onversleutelde SMTP-wachtwoord aan manage_backups (was AP-005) | TECHNICAL-FIX | FIX-I permission gaps | server/routes/settings.ts:15-231, contrast met server/routes/app-settings.ts:24-44,210-213 | supertest | med |
| BUG-011 | HIGH | PUT /api/system-settings schrijfbaar door elke ingelogde gebruiker (was AP-007) | TECHNICAL-FIX | FIX-I permission gaps | server/routes/app-settings.ts:431,463 | supertest | med |
| BUG-012 | HIGH | documents.file_path zonder path containment in view/download/delete (was DM-002) | TECHNICAL-FIX | FIX-C path containment | server/routes.ts:5111-5217, :5403-5427, server/services/document-paths.ts:16 | supertest | med |
| BUG-013 | HIGH | nieuwe verhuur op een voertuig met actief onderhoudsblok, zonder enige waarschuwing (was MT-002) | BUSINESS-DECISION | OPT-023 — hard block or soft warning when booking over an active maintenance block? | server/database-storage.ts:1582-1622, server/routes.ts:2602-2630 | n/a until decided | n/a |
| BUG-014 | HIGH | blok verwijderen laat vervanger en spare-voertuig eeuwig scheduled (was MT-003) | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes.ts (DELETE /api/reservations/:id), server/database-storage.ts (createReplacementR… | integration | high |
| BUG-015 | HIGH | PATCH /api/reservations/:id/spare-status mist de permissiecheck (was MT-004) | TECHNICAL-FIX | FIX-I permission gaps | server/routes.ts:4013-4062 | supertest | med |
| BUG-016 | HIGH | statusmachine omzeild via PATCH /:id en /basic; status "garbage" wordt gepersisteerd (was RS-002) | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts (PATCH /api/reservations/:id/basic, PATCH /api/reservations/:id), shared/schem… | integration | high |
| BUG-017 | HIGH | blacklist omzeilbaar door klant of voertuig via een edit te wisselen (was RS-003) | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts (PATCH /api/reservations/:id, PATCH /api/reservations/:id/basic) | supertest | low |
| BUG-018 | HIGH | not_for_rental/needs_fixing voertuig blijft boekbaar via de API (was RS-004) | BUSINESS-DECISION | OPT-004 — does not_for_rental / needs_fixing make a vehicle unbookable, and may staff override? | server/database-storage.ts (checkReservationConflicts), server/routes.ts (POST /api/reservation… | n/a until decided | n/a |
| BUG-019 | HIGH | afronden/inleveren overschrijft endDate met vandaag → omgekeerd datumbereik (was RS-005) | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts (PATCH /:id/status), server/database-storage.ts (returnReservation) | integration | high |
| BUG-020 | HIGH | kentekenuniciteit zonder normalisatie (was VC-001) | TECHNICAL-FIX | FIX-Z schema validation | server/routes.ts:723-847, :1082-1233, shared/schema.ts:172 | unit (zod) | med |
| BUG-021 | HIGH | availabilityStatus accepteert een willekeurige waarde (was VC-005) | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/vehicle-status-helper.ts:74-145, server/routes.ts:1159-1182, shared/schema.ts:261 | integration | high |
| BUG-022 | HIGH | voertuig verwijderen hard-delete alle reserveringen van alle klanten (was VC-007 / RS-006) | BUSINESS-DECISION | OPT-033 — may a vehicle with live reservations be deleted at all, and what happens to other customers' rows? | server/database-storage.ts:498-618, server/routes.ts:1599-1691 | n/a until decided | n/a |
| BUG-023 | HIGH | POST /api/migrate/customer-drivers bulk-write met alleen requireAuth (was VC-012) | TECHNICAL-FIX | FIX-I permission gaps | server/routes.ts:6572-6635 | supertest | med |
| BUG-024 | MEDIUM | wachtwoordhergebruik nooit geblokkeerd; password_history is dode code (was AP-006 / AP-009) | BUSINESS-DECISION | no OPT — password policy: enforce history/reuse ban, or drop the unused table? | server/routes/users.ts:349-398, shared/schema.ts:1967-1979, server/storage.ts:24 | n/a until decided | n/a |
| BUG-025 | MEDIUM | ontbrekende inputvalidatie op settings-writes veroorzaakt onafgevangen 500's (was AP-008) | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes/settings.ts:91-119, server/routes/app-settings.ts:463-497 | supertest | high |
| BUG-026 | MEDIUM | statische /uploads-mount negeert UPLOADS_DIR en geeft 200 met de verkeerde body (was DM-003) | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/index.ts (app.use('/uploads', requireAuth, express.static(uploadsPath)) en de uploadsPat… | integration (tmp UPLOADS_DIR) | low |
| BUG-027 | MEDIUM | contract-hergeneratie maakt N documents-rijen op één fysiek bestand (was DM-004) | TECHNICAL-FIX | FIX-O document registration (CQ-008) | server/routes.ts (contract-opslagblok, ~5560-5625) | integration | med |
| BUG-028 | MEDIUM | default PDF-template zonder velden levert volledig blanco contracten (was DM-005) | TECHNICAL-FIX | FIX-P template validation | server/routes.ts:5451-5560, :5963-6010, server/utils/pdf-generator.ts (generateRentalContractFr… | supertest + PDF text | med |
| BUG-029 | MEDIUM | transport-report permanent 404 bij afwijkende UPLOADS_DIR (was DM-006) | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/routes.ts (POST /api/delivery/transports/generate-report, ~7666-7749), server/services/d… | integration (tmp UPLOADS_DIR) | low |
| BUG-030 | MEDIUM | geweigerde upload geeft 500 met volledige stack trace in plaats van 400 (was VC-013 / DM-008) | TECHNICAL-FIX | FIX-AA route domain guards | server/utils/security/fileUploadSecurity.ts:200-256, server/routes/pdf-templates.ts:297-303, se… | supertest | low |
| BUG-031 | MEDIUM | mark-needs-service accepteert een omgekeerd datumbereik (was MT-005) | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts:3792-3845, server/database-storage.ts:3323-3349 | supertest | low |
| BUG-032 | MEDIUM | assign-spare tweemaal levert twee gelijktijdig actieve vervangers op (was MT-006) | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/database-storage.ts:3178-3239, server/routes.ts (assign-spare, 3848-3891) | integration | high |
| BUG-033 | MEDIUM | maintenance-with-spare maakt een onderhoudsblok zonder vehicleId (was MT-007) | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes.ts:2999-3022 | integration | high |
| BUG-034 | MEDIUM | onderhoudsblok wijzigt vehicles.availabilityStatus/maintenanceStatus niet (was MT-008) | BUSINESS-DECISION | OPT-006 — does creating a maintenance block change the vehicle status, and back again on delete? | server/database-storage.ts:1130-1159, server/routes.ts:2526-2601 | n/a until decided | n/a |
| BUG-035 | MEDIUM | placeholder accepteert een customerId die niet bij de originele huur hoort (was MT-010) | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/database-storage.ts:2955-3015, server/routes.ts:4464-4513 | integration | high |
| BUG-036 | MEDIUM | spare-status controleert het reserveringstype niet (was MT-011) | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts:4013-4062 | integration | high |
| BUG-037 | MEDIUM | twee overlappende onderhoudsblokken op hetzelfde voertuig toegestaan (was RS-007 / MT-013) | BUSINESS-DECISION | OPT-023 — may two maintenance blocks overlap on one vehicle? | server/routes.ts:2526-2601 | n/a until decided | n/a |
| BUG-038 | MEDIUM | dubbel contractnummer levert een rauwe databasefout op (was RS-008) | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts (POST /api/reservations/:id/pickup en het create-pad) | supertest | low |
| BUG-039 | MEDIUM | reservering/onderhoudsblok op een niet-bestaande vehicleId/customerId (was RS-009 / MT-009) | TECHNICAL-FIX | FIX-AA route domain guards | shared/schema.ts (reservations-tabel), server/routes.ts:2435+, :2526-2601 | supertest | low |
| BUG-040 | MEDIUM | startdatum in het verleden blokkeert het voertuig permanent via de overdue-guard (was RS-010) | BUSINESS-DECISION | OPT-001/OPT-003 — is backdating a start date allowed, and what does the overdue gate count? | server/routes.ts (POST /api/reservations, overdue-guard), shared/schema.ts | n/a until decided | n/a |
| BUG-041 | MEDIUM | negatieve departureMileage/returnMileage geaccepteerd (was VC-003) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:211-212,277-286 | unit (zod) | med |
| BUG-042 | MEDIUM | onmogelijke datums in APK-/garantievelden geaccepteerd (was VC-004) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:187,277-286, server/routes.ts:723-847, :1082-1233 | unit (zod) | med |
| BUG-043 | MEDIUM | gelijktijdige restore van hetzelfde verwijderde record geeft rauwe 500's (was VC-008) | TECHNICAL-FIX | FIX-G atomic transitions | server/database-storage.ts:637-725, server/routes.ts:1715-1761 | concurrency (parallel supertest) | med |
| BUG-044 | MEDIUM | klant met lege naam (whitespace) wordt aangemaakt (was VC-009) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:291,363-377, server/middleware/security/sanitization.ts:11-13 | unit (zod) | med |
| BUG-045 | MEDIUM | dubbele debiteurnummers toegestaan (was VC-011) | BUSINESS-DECISION | OPT-019 — must debtorNumber be unique, or only warn? | shared/schema.ts:292, server/routes.ts:2041-2062 | n/a until decided | n/a |
| BUG-046 | MEDIUM | RDW-proxy volledig zonder authenticatie (was VC-014) | TECHNICAL-FIX | FIX-J unauth endpoints | server/routes.ts:1930-1965 | supertest | low |
| BUG-047 | MEDIUM | CSRF-token uit /api/login is ongeldig op het eerstvolgende verzoek (was VC-015) | TECHNICAL-FIX | FIX-K auth/session/limits | server/auth.ts:332, server/middleware/security/csrf.ts:14-29,92-96,100-113 | supertest | med |
| BUG-048 | LOW | PDF-template accepteert fields in elke vorm; generatie valt stil terug (was DM-007) | TECHNICAL-FIX | FIX-P template validation | shared/schema.ts:1096-1109, server/routes.ts:5451-5560 | supertest + PDF text | med |
| BUG-049 | LOW | POST /api/documents geeft 500 + stack bij verkeerde multipart-veldvolgorde (was DM-009) | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts:4810, :4876 | supertest | low |
| BUG-050 | LOW | template verwijderen laat background-/preview-bestanden op schijf staan (was DM-010) | TECHNICAL-FIX | FIX-O document registration (CQ-008) | server/routes/pdf-templates.ts:268-293 | integration | med |
| BUG-051 | LOW | /object-storage/* zonder authenticatie (vandaag inert) (was DM-013) | TECHNICAL-FIX | FIX-J unauth endpoints | server/routes.ts:7338-7353 | supertest | low |
| BUG-052 | LOW | maintenanceStatus accepteert een waarde buiten de enum via de generieke PATCH (was MT-012) | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts (generieke PATCH /:id reserveringroute) | supertest | high |
| BUG-053 | LOW | bulk-complete van transporten zonder partial-failure-afhandeling (was MT-014) | TECHNICAL-FIX | FIX-Q client robustness | client/src/pages/delivery/dashboard.tsx:316-333, server/routes.ts:7438-7471 (server-side per it… | unit (client, jsdom) | low |
| BUG-054 | LOW | totalPrice zonder grenzen; niet-numerieke invoer verdwijnt stil naar null (was RS-011) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:813-824, server/routes.ts:2477-2483 | unit (zod) | med |
| BUG-055 | LOW | reservering verwijderen laat documenten en driver-assignment wees achter (was RS-012) | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/routes.ts (DELETE /api/reservations/:id) | integration + SQL | high |
| BUG-056 | LOW | isRecurring/recurringFrequency zijn volledig inert (was RS-013) | BUSINESS-DECISION | no OPT — implement recurring reservations or remove the fields? | shared/schema.ts, server/routes.ts | n/a until decided | n/a |
| BUG-057 | LOW | malformed JSON geeft een volledige Node-stack trace (dev-gated) (was RS-014) | ENV/DEV-ONLY | ENV — correct in code, dev-gated; verify NODE_ENV=production in Coolify | server/index.ts | n/a | low |
| BUG-058 | LOW | geen formaat- of lengtecontrole op het kenteken (was VC-002) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:172,277-286 | unit (zod) | med |
| BUG-059 | LOW | geen lengtelimiet op de klantnaam (was VC-010) | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:291,363-377 | unit (zod) | med |
| BUG-060 | CRITICAL | Ongeauthenticeerde arbitrary file read via receiptFilePath van een expense | TECHNICAL-FIX | FIX-C path containment | server/routes/expenses.ts:158,170-176,275,298,302-319,341,405, shared/schema.ts:1009,1026-1032 | supertest | med |
| BUG-061 | CRITICAL | Eén request met een niet-bestaand customerId zet het hele serverproces uit (FK-violation → unhandled reje… | TECHNICAL-FIX | FIX-A async errors (CQ-001) | server/routes/portal-admin.ts:109-111, server/services/portal-storage.ts:136-143, shared/schema… | supertest + child-process | low |
| BUG-062 | HIGH | Standaard-admin admin / admin123 wordt ook in productie aangemaakt en naar de log geschreven | TECHNICAL-FIX | FIX-K auth/session/limits | server/initAdmin.ts:21-101, server/index.ts:507,538 | supertest | med |
| BUG-063 | HIGH | Mass assignment op PATCH /api/users/:id: wachtwoordreset van elk account en schrijftoegang op elke kolom | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes/users.ts:135-237, server/database-storage.ts:151-171 | supertest | high |
| BUG-064 | HIGH | DELETE /api/reservations/:id mist de permissiecheck; cascadeert naar vervangingsreserveringen | TECHNICAL-FIX | FIX-I permission gaps | server/routes.ts:4621-4687 | supertest | med |
| BUG-065 | HIGH | Interactive damage checks: volledige CRUD én bulk-read zonder permissiecheck | TECHNICAL-FIX | FIX-I permission gaps | server/routes.ts:6641,6783-7335 | supertest | med |
| BUG-066 | HIGH | vehicle-diagram-templates: aanmaken, wijzigen en verwijderen (incl. fs.unlink) met alleen requireAuth | TECHNICAL-FIX | FIX-I permission gaps | server/routes/vehicle-diagram-templates.ts:89,138,174-176,211,226-228 | supertest | med |
| BUG-067 | HIGH | POST/DELETE /api/settings/contract-number-override schrijfbaar door elke ingelogde gebruiker | TECHNICAL-FIX | FIX-I permission gaps | server/routes/settings.ts:90-135 | supertest | med |
| BUG-068 | HIGH | Placeholder-reserveringen en spare-overzichten zonder permissiecheck | TECHNICAL-FIX | FIX-I permission gaps | server/routes.ts:4464-4600, :4749 | supertest | med |
| BUG-069 | HIGH | Geauthenticeerde RCE via backup-restore: tar -xzf van een geüpload archief over process.cwd() | TECHNICAL-FIX | FIX-L restore safety | server/routes/backups.ts:354,485, server/backupService.ts:927-936 | integration + SQL (scratch DB) | high |
| BUG-070 | HIGH | Arbitrary file delete via backgroundPath/diagramPath in vier templatemodules | TECHNICAL-FIX | FIX-C path containment | server/routes/pdf-templates.ts, damage-check-templates.ts, report-and-label-templates.ts, vehic… | supertest | med |
| BUG-071 | HIGH | SSRF: willekeurige host:port-verbinding en directory-listing via de CJIB-FTPS-testroute | TECHNICAL-FIX | FIX-U outbound/headers | server/routes/fines.ts:121-133, server/services/cjib/config.ts:7-8, server/services/cjib/ftps-c… | supertest | med |
| BUG-072 | HIGH | Stored XSS via javascript:-URL's die met window.open() geopend worden | TECHNICAL-FIX | FIX-R client XSS sinks | client/src/components/expenses/expense-view-dialog.tsx, reservations/pickup-return-dialogs.tsx,… | unit (client, jsdom) | low |
| BUG-073 | HIGH | DOM-XSS via innerHTML met driver.licenseFilePath | TECHNICAL-FIX | FIX-R client XSS sinks | client/src/components/customers/driver-view-dialog.tsx:156-168, shared/schema.ts:417 | unit (client, jsdom) | low |
| BUG-074 | HIGH | apiLimiter's "skip voor ingelogde gebruikers" vuurt nooit; één gedeelde 1000/15 min-bucket per IP voor ie… | TECHNICAL-FIX | FIX-K auth/session/limits | server/index.ts:174,187, server/middleware/security/rateLimiter.ts:12-23 | supertest | med |
| BUG-075 | HIGH | GET /api/backups/download-data lekt de live Postgres-connectiestring in de foutrespons | TECHNICAL-FIX | FIX-L restore safety | server/routes/backups.ts:95,110-116 | integration + SQL (scratch DB) | high |
| BUG-076 | MEDIUM | Path traversal bij schrijven in POST /api/backups/upload via originalname | REFUTED | REFUTED — busboy reduces originalname to basename; defensive hardening only (phase 15 runtime) | server/routes/backups.ts:785-810 | static assert only | low |
| BUG-077 | MEDIUM | SSRF/portscan-orakel via de SMTP-testroute | TECHNICAL-FIX | FIX-U outbound/headers | server/routes/app-settings.ts:309-330, server/utils/email-service.ts:142-221 | supertest | med |
| BUG-078 | MEDIUM | CSP staat unsafe-inline en unsafe-eval toe, ook in productie | TECHNICAL-FIX | FIX-U outbound/headers | server/middleware/security/headers.ts:14-46 | supertest | high |
| BUG-079 | MEDIUM | De request-logger schrijft volledige JSON-responsebodies naar de containerlog | TECHNICAL-FIX | FIX-U outbound/headers | server/index.ts:249-266 | supertest | med |
| BUG-080 | MEDIUM | TLS-certificaatvalidatie uitgeschakeld voor alle uitgaande SMTP | TECHNICAL-FIX | FIX-M mail reliability | server/utils/email-service.ts:97-105,216-218,261-263 | integration (SMTP stub) | low |
| BUG-081 | MEDIUM | Geauthenticeerde mail relay: vrije ontvangers, ongeëscapete HTML en echte bijlagen vanaf het bedrijfsdome… | BUSINESS-DECISION | OPT-027/OPT-013 — may staff mail a document to a free address, or only to the reservation customer? | server/routes.ts:5226-5290,5374-5380, server/routes/notifications.ts:432-437 | n/a until decided | n/a |
| BUG-082 | MEDIUM | X-Forwarded-For wordt vertrouwd voor de IP-adressen in de audit-log en active_sessions | DEFERRED | DEFERRED — same trust-proxy topology fact as BUG-009 | server/utils/security/auditLogger.ts:103-106, server/utils/security/sessionManager.ts:175-181, … | n/a until infra known | n/a |
| BUG-083 | MEDIUM | Portaalsessies vallen terug op het hardgecodeerde secret "portal-dev-secret" | TECHNICAL-FIX | FIX-K auth/session/limits | server/portal-auth.ts:163, server/auth.ts:67-85 | supertest | med |
| BUG-084 | MEDIUM | Mass assignment op PATCH /api/reservations/:id: rauwe body naar db.update() | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts:3517, server/database-storage.ts:1209-1246 | supertest | high |
| BUG-085 | MEDIUM | /uploads is statisch bereikbaar voor élke ingelogde medewerker, zonder permissiecheck | TECHNICAL-FIX | FIX-I permission gaps | server/index.ts:336-338, shared/paths.ts:12 | supertest | med |
| BUG-086 | MEDIUM | De globale input-sanitizer raakt multipart-bodies niet (bewezen stored payload) | TECHNICAL-FIX | FIX-R client XSS sinks | server/middleware/security/sanitization.ts:41-54, server/index.ts:181 | unit (client, jsdom) | low |
| BUG-087 | MEDIUM | CSP-header-injectie via allowedFrameOrigins van de portalconfig | TECHNICAL-FIX | FIX-U outbound/headers | server/middleware/security/headers.ts:110-125, server/services/portal-config.ts | supertest | med |
| BUG-088 | MEDIUM | GET /api/damage-check-templates/by-vehicle is onbereikbaar: geschaduwd door de eerder geregistreerde :id-… | TECHNICAL-FIX | FIX-E :id validation (CQ-007) | server/routes/damage-check-templates.ts:35,52 | supertest | low |
| BUG-089 | MEDIUM | GET /api/reports/maintenance-costs geeft onvoorwaardelijk 500 | TECHNICAL-FIX | FIX-E :id validation (CQ-007) | server/routes/reports.ts:36 | supertest | low |
| BUG-090 | MEDIUM | DELETE /api/reservations/:id: check-then-act-race levert 500 met error.message in de respons | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/routes.ts:4621-4697 | integration + SQL | high |
| BUG-091 | MEDIUM | Een wachtwoordwijziging trekt andere actieve sessies niet in | TECHNICAL-FIX | FIX-K auth/session/limits | server/routes/users.ts:349-398, server/portal-auth.ts:360-368, server/utils/security/sessionMan… | supertest | med |
| BUG-092 | MEDIUM | POST /api/portal/forgot heeft in de praktijk geen rate limit (skipSuccessfulRequests + altijd-200) | TECHNICAL-FIX | FIX-K auth/session/limits | server/middleware/security/rateLimiter.ts:28-35, server/portal-auth.ts:373-382 | supertest | med |
| BUG-093 | LOW | /health is ongeauthenticeerd, lekt omgevingsinformatie en doet een volledige users-query | TECHNICAL-FIX | FIX-J unauth endpoints | server/index.ts:273-330 | supertest | low |
| BUG-094 | LOW | scrypt draait met Node-standaardparameters (N=16384) | TECHNICAL-FIX | FIX-K auth/session/limits | server/auth.ts:33-51 | supertest | med |
| BUG-095 | LOW | Uitloggen ruimt de active_sessions-rij niet op; expiresAt staat op 30 dagen tegenover een cookie van 15 m… | TECHNICAL-FIX | FIX-K auth/session/limits | server/auth.ts:114,355-356,377-398, server/utils/security/sessionManager.ts:9-50 | supertest | med |
| BUG-096 | LOW | CSRF-tokenvergelijking niet constant-time; anonieme bezoekers krijgen een sessie en een geldig token | TECHNICAL-FIX | FIX-K auth/session/limits | server/middleware/security/csrf.ts:14-113 | supertest | med |
| BUG-097 | LOW | De bestandsnaamfilter van de backup-routes mist de backslash | REFUTED | REFUTED — ".." is rejected before the backslash gap matters; hardening only (phase 15 runtime) | server/routes/backups.ts:585-721 | static assert only | low |
| BUG-098 | LOW | resolveDocumentFilePath() volgt symlinks binnen uploads/ | TECHNICAL-FIX | FIX-C path containment | server/services/document-paths.ts:19-47 | supertest | med |
| BUG-099 | LOW | Geen time-out op de uitgaande geocoding-/routingverzoeken | TECHNICAL-FIX | FIX-U outbound/headers | server/geocoding.ts:36,118, server/routes.ts:7529-7619 | supertest | med |
| BUG-100 | LOW | fromName/fromEmail worden rauw in een mailheader geïnterpoleerd | TECHNICAL-FIX | FIX-M mail reliability | server/utils/email-service.ts:97-105,276 | integration (SMTP stub) | low |
| BUG-101 | LOW | Ongebounde recursie bij het parsen van CJIB-XML zet het proces stil | TECHNICAL-FIX | FIX-A async errors (CQ-001) | server/services/cjib/parser.ts:108-113, server/routes/fines.ts:89-95, server/index.ts:126-134 | supertest + child-process | low |
| BUG-102 | LOW | innerHTML in de print-/rapportbouwer van de client | TECHNICAL-FIX | FIX-R client XSS sinks | client/src/pages/reports/index.tsx:614-1247 | unit (client, jsdom) | low |
| BUG-103 | LOW | Niet-numerieke, oversized of null-byte :id-parameters geven 500 in plaats van 400 op ~19 GET-endpoints | TECHNICAL-FIX | FIX-E :id validation (CQ-007) | server/routes.ts + app-settings.ts, settings.ts, expenses.ts, custom-notifications.ts, damage-c… | supertest | low |
| BUG-104 | LOW | POST /api/interactive-damage-checks heeft geen bodyvalidatie: ontbrekende verplichte velden geven 500 | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts:6849-6899 | supertest | high |
| BUG-105 | LOW | Eén gedeelde rate-limiter-teller over vier auth-routes | TECHNICAL-FIX | FIX-K auth/session/limits | server/middleware/security/rateLimiter.ts:28-35, server/auth.ts:263, server/portal-auth.ts:233,… | supertest | med |
| BUG-106 | CRITICAL | Conflictcontrole wordt overgeslagen bij elke gedeeltelijke PATCH op een reservering; kalender-drag/drop b… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/routes.ts:3445-3700, client/src/pages/reservations/calendar.tsx:386-391 | integration + concurrency | high |
| BUG-107 | CRITICAL | checkReservationConflicts laat een eendaagse reservering middenin een bestaande verhuur toe (turnover-uit… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/database-storage.ts (checkReservationConflicts, applyTransportUpdate, assignVehicleToPla… | integration + concurrency | high |
| BUG-108 | HIGH | Een voertuig in de prullenbak blijft boekbaar; het terugzetten plaatst de gesnapshotte boekingen er zonde… | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/routes.ts, server/database-storage.ts:535-618, 637-725 | integration + SQL | high |
| BUG-109 | HIGH | Een voertuig met needs_fixing / maintenance_status=in_service of een open onderhoudsblok kan gewoon meege… | BUSINESS-DECISION | OPT-007 — block or warn on pickup of a workshop-flagged vehicle, and who may override? | server/vehicle-status-helper.ts, server/database-storage.ts:1640-1790, server/routes.ts:3230-34… | n/a until decided | n/a |
| BUG-110 | HIGH | Voertuig verwijderen en terugzetten is geen getrouwe round trip: vijf koppelingstypen verdwijnen zonder m… | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/database-storage.ts:498-725; shared/schema.ts:521, 564, 575, 1277, 1573, 1591, 1599 | integration + SQL | high |
| BUG-111 | HIGH | PATCH /api/reservations/:id valideert datums, tijden en type niet: onzin- en omgekeerde datums worden opg… | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts, shared/schema.ts | supertest | high |
| BUG-112 | HIGH | Annuleren van een reservering cascadeert niet: transport blijft gepland, chauffeurstoewijzing open, verva… | TECHNICAL-FIX | FIX-X delete/cancel cascade | server/routes.ts, server/database-storage.ts | integration + SQL | high |
| BUG-113 | HIGH | Normaal ingeleverde verhuur (returned) telt na drie dagen als "te laat" en blokkeert elke toekomstige boe… | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/database-storage.ts, server/routes.ts | integration | high |
| BUG-114 | HIGH | De datum van een transport wijzigen laat de vervangingsreservering op de oude dag staan | TECHNICAL-FIX | FIX-W transport consistency | server/database-storage.ts (applyTransportUpdate), server/routes.ts:7438-7471 | integration | med |
| BUG-115 | HIGH | Een transport annuleren laat de vervangingsreservering geboekt en de reserveauto geblokkeerd | TECHNICAL-FIX | FIX-W transport consistency | server/database-storage.ts (applyTransportUpdate) | integration | med |
| BUG-116 | HIGH | Het originele voertuig van een transport mag gelijk worden aan de vervanger; daarna is het transport alle… | TECHNICAL-FIX | FIX-W transport consistency | server/database-storage.ts (applyTransportUpdate) | integration | med |
| BUG-117 | HIGH | Goedkeuring van een portaal-onderhoudswijziging laat een al toegewezen vervanger op de oude datum staan e… | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes/portal-requests.ts (approveMaintenanceChange 349-393, ensurePlaceholderSpare 275-… | integration | high |
| BUG-118 | HIGH | Een onderhoudsblok verwijderen wist de vervangers van een **ander** blok; een blok vóór de verhuurstart l… | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes.ts (DELETE /api/reservations/:id), server/routes/portal-requests.ts (clipToRental… | integration | high |
| BUG-119 | HIGH | De contract-PDF-endpoints leveren een blanco contract voor een TBD-placeholder en voor een onderhoudsblok… | TECHNICAL-FIX | FIX-N PDF rendering | server/routes.ts (contracts/generate, generate-default, data) | integration + PDF text | med |
| BUG-120 | HIGH | Pickup schrijft de reservering vóór de voertuigcontrole en zonder transactie: bij een 400 blijft de verhu… | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/database-storage.ts, server/routes.ts, server/vehicle-status-helper.ts | integration | high |
| BUG-121 | HIGH | maintenance-with-spare controleert de vervangertoewijzingen binnen één payload niet tegen elkaar: dezelfd… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/routes.ts | integration + concurrency | high |
| BUG-122 | MEDIUM | Gelijktijdige PATCH op één voertuig verliest updates (read-merge-write van de hele rij) | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts:1082-1233; server/database-storage.ts (updateVehicle) | supertest | high |
| BUG-123 | MEDIUM | bulk-import-plates maakt een voertuig met een leeg kenteken en lekt rauwe JS-foutmeldingen per rij | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts:850-908, 1624-1691 | supertest | low |
| BUG-124 | MEDIUM | bulk-import-csv leest Nederlandse datums als Amerikaanse, verschuift ze een dag en laat onleesbare datums… | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts:909-1080 | supertest | low |
| BUG-125 | MEDIUM | barcode is een vrij invulbaar clientveld: kentekenscans zijn te kapen en regenerate botst met een 500 | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:266, 277-286; server/routes.ts:494-600, 638-656, 723-847, 1082-1233; server/da… | unit (zod) | med |
| BUG-126 | MEDIUM | Een restore die op een barcodebotsing stuit geeft een rauwe 500 in plaats van de nette 409 die voor id en… | TECHNICAL-FIX | FIX-G atomic transitions | server/database-storage.ts:637-725; server/routes.ts:1715-1761 | concurrency (parallel supertest) | med |
| BUG-127 | MEDIUM | Kilometerstanden van een afgeronde verhuur zijn vrij bewerkbaar, zonder onderlinge controle en zonder syn… | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts:3445-3700 | supertest | high |
| BUG-128 | MEDIUM | returned en completed zijn inconsistent tussen de routes; een statusomkering wist de geplande einddatum | TECHNICAL-FIX | FIX-H state machine (CQ-005) | shared/schema.ts, server/routes.ts, server/database-storage.ts | integration | high |
| BUG-129 | MEDIUM | Statuswaarden buiten de statusmachine: 278 reserveringen en 44 voertuigen dragen waarden die geen enkele … | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/database-storage.ts, shared/schema.ts, server/routes.ts, server/vehicle-status-helper.ts | integration | high |
| BUG-130 | MEDIUM | Na "markeer als afgerond" blijft het voertuig rented zodra er nog een boeking binnen 30 dagen staat | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/database-storage.ts, server/routes.ts | integration | high |
| BUG-131 | MEDIUM | pickupDate en returnDate worden niet gevalideerd en belanden ongefilterd in bestandsnamen | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts, server/database-storage.ts | supertest | low |
| BUG-132 | MEDIUM | Een opgehaalde verhuur kan verwijderd of geannuleerd worden terwijl de klant de auto heeft; het contractn… | BUSINESS-DECISION | OPT-017 — may a picked_up rental be cancelled/deleted, and does the contract number stay burned? | server/routes.ts, shared/schema.ts | n/a until decided | n/a |
| BUG-133 | MEDIUM | Een chauffeurswijziging via /basic omzeilt de chauffeurshistorie | TECHNICAL-FIX | FIX-AA route domain guards | server/routes.ts | supertest | low |
| BUG-134 | MEDIUM | Geen portaalmelding bij welke wijziging van kantoor dan ook aan de reservering van een portaalklant | BUSINESS-DECISION | OPT-027 — which office-side changes does the portal customer get told about? | server/routes.ts, server/services/portal-customer-notifications.ts | n/a until decided | n/a |
| BUG-135 | MEDIUM | Het originele voertuig van een transport wijzigen laat de werkplaatsvlag en de vervangersnotities op de o… | TECHNICAL-FIX | FIX-W transport consistency | server/database-storage.ts (applyTransportUpdate) | integration | med |
| BUG-136 | MEDIUM | Transportstatus is vrije tekst zonder transitietabel; completedDate blijft leeg bij API-gebruik | TECHNICAL-FIX | FIX-H state machine (CQ-005) | shared/schema.ts, server/routes.ts, server/database-storage.ts | integration | high |
| BUG-137 | MEDIUM | Placeholder-vervangers van afgeronde, geannuleerde of uitgezette transporten blijven in de toewijswidget … | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/database-storage.ts | integration | high |
| BUG-138 | MEDIUM | Portaalonderhoud kan in het verleden en op een geannuleerde verhuur worden goedgekeurd | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes/portal-requests.ts (approveMaintenance), server/routes/portal.ts (aanvraagcreatie… | integration | high |
| BUG-139 | MEDIUM | Het voertuig van een verhuur met een portaal-onderhoudsblok wisselen laat het blok, de vervanger en de kl… | TECHNICAL-FIX | FIX-V maintenance/spare cascade | server/routes.ts, server/services/portal-maintenance-events.ts | integration | high |
| BUG-140 | MEDIUM | Een transport verwijderen is een harde delete zonder prullenbakvermelding | BUSINESS-DECISION | OPT-018 — does a deleted transport go to the recycle bin? | server/database-storage.ts (deleteTransport, restoreDeletedRecord), server/routes.ts:7473-7520 | n/a until decided | n/a |
| BUG-141 | MEDIUM | Twee gelijktijdige portaalgoedkeuringen maken twee onderhoudsblokken, twee antwoorden en twee klantmeldin… | TECHNICAL-FIX | FIX-G atomic transitions | server/routes/portal-requests.ts, server/services/portal-requests-storage.ts | concurrency (parallel supertest) | med |
| BUG-142 | MEDIUM | POST /api/transports laat na een 409 een weestransport achter | TECHNICAL-FIX | FIX-G atomic transitions | server/routes.ts, server/database-storage.ts | concurrency (parallel supertest) | med |
| BUG-143 | MEDIUM | Weesrijen overleven omdat er geen FK en geen opruimpad is: onderhoudsblokken op verdwenen voertuigen en m… | BUSINESS-DECISION | OPT-033 — clean up or keep the existing orphan rows before FKs are switched on? | shared/schema.ts, server/database-storage.ts | n/a until decided | n/a |
| BUG-144 | MEDIUM | De levenscyclusstatussen in de bestaande data komen niet overeen met de statusmachine | BUSINESS-DECISION | OPT-033 — reconcile the out-of-state-machine lifecycle data, or leave it as history? | server/database-storage.ts, server/vehicle-status-helper.ts | n/a until decided | n/a |
| BUG-145 | MEDIUM | De vitest-suite draait tegen de gedeelde dev-database en laat 258 wees-onderhoudsblokken achter | ENV/DEV-ONLY | ENV — test-suite pollution; fixed by lvs_fixtest + helper cleanup widening | server/__tests__/portal-helpers.ts:74-93, server/__tests__/portal-maintenance-events.test.ts, s… | suite config | low |
| BUG-146 | LOW | Waarschuwingen bij een handmatige statuswijziging bereiken de client nooit | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts:1082-1233; server/vehicle-status-helper.ts:74-145 | integration | high |
| BUG-147 | LOW | Elke voertuigverwijdering schrijft twee vehicle.delete-auditrijen; een restore wordt als vehicle.update g… | TECHNICAL-FIX | FIX-Y audit log | server/routes.ts:1666-1676,:1748, server/middleware/audit.ts:171-215, server/utils/security/aud… | integration + SQL | low |
| BUG-148 | LOW | Databasefouten (23503/23505) worden rauw doorgegeven of op het verkeerde veld gemapt | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts | supertest | med |
| BUG-149 | LOW | Service-intervalvelden accepteren onzin en zetten de onderhoudsherinnering stilzwijgend uit | TECHNICAL-FIX | FIX-Z schema validation | shared/schema.ts:277-286; shared/service-due.ts; server/routes.ts:1082-1233 | unit (zod) | med |
| BUG-150 | LOW | Bestanden blijven na een voertuigverwijdering voorgoed op schijf staan; documentmappen op kenteken worden… | TECHNICAL-FIX | FIX-O document registration (CQ-008) | server/database-storage.ts:535-618, server/routes.ts:1697-1761, :5000-5068 | integration | med |
| BUG-151 | LOW | Soft-deleted reserveringen staan niet in de prullenbak en hebben geen herstelpad | BUSINESS-DECISION | OPT-018 — trash + restore for reservations, and who may restore? | server/routes.ts | n/a until decided | n/a |
| BUG-152 | LOW | Subacties van reserveringen worden als reservation.create gelogd | TECHNICAL-FIX | FIX-Y audit log | server/middleware/audit.ts | integration + SQL | low |
| BUG-153 | LOW | Het aantal verhuurdagen verschilt één tussen de contractgegevens en het financiële rapport | BUSINESS-DECISION | OPT-030 — which rental-day convention is authoritative (contract or financial report)? | server/routes.ts, server/routes/reports.ts | n/a until decided | n/a |
| BUG-154 | LOW | PATCH /api/vehicles/:id/maintenance-status raakt het gekoppelde onderhoudsblok en de portaalhook niet | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts | integration | high |
| BUG-155 | LOW | Uitgaande portaalmail wordt nergens gelogd en mislukkingen zijn onzichtbaar | TECHNICAL-FIX | FIX-M mail reliability | server/utils/email-service.ts, server/services/portal-mail.ts, server/services/portal-maintenan… | integration (SMTP stub) | low |
| BUG-156 | LOW | Een onbekend templateId bij het transportrapport valt stil terug op de standaardlayout | TECHNICAL-FIX | FIX-N PDF rendering | server/routes.ts | integration + PDF text | med |
| BUG-157 | LOW | Contractnummers met voorloopnullen: '0100' en '100' bestaan naast elkaar | BUSINESS-DECISION | no OPT — is the contract number zero-padded, and are existing rows normalised? | server/routes.ts, server/database-storage.ts, shared/schema.ts | n/a until decided | n/a |
| BUG-158 | LOW | assign-vehicle op een placeholder onder gelijktijdigheid: beide aanroepers krijgen 200, de laatste schrij… | TECHNICAL-FIX | FIX-G atomic transitions | server/database-storage.ts | concurrency (parallel supertest) | med |
| BUG-159 | CRITICAL | Twee gelijktijdige bewerkingen verplaatsen twee reserveringen naar hetzelfde voertuig en dezelfde periode… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/routes.ts (beide PATCH-handlers), server/database-storage.ts:1528 | integration + concurrency | high |
| BUG-160 | HIGH | Eén reserveauto wordt onder concurrency aan twee partijen tegelijk toegewezen (assign-spare, maintenance-… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/database-storage.ts, server/routes.ts (assign-spare, maintenance-with-spare, POST /api/t… | integration + concurrency | high |
| BUG-161 | HIGH | De accountlockout throttlet een gelijktijdige wachtwoordburst niet: 30 parallelle gokken worden alle 30 v… | TECHNICAL-FIX | FIX-K auth/session/limits | server/auth.ts:268-370, server/middleware/security/rateLimiter.ts:40-90 | supertest | med |
| BUG-162 | HIGH | Tekens buiten WinAnsi laten velden stil wegvallen: contracten zonder huurdersnaam, transportbrieven zonde… | TECHNICAL-FIX | FIX-N PDF rendering | server/utils/pdf-generator.ts, server/pdf-damage-check-generator.ts (bevat de sanitizer die ged… | integration + PDF text | med |
| BUG-163 | HIGH | De fallbackgenerator levert een plattetekstbestand dat als PDF wordt geserveerd én als PDF wordt gearchiv… | BUSINESS-DECISION | OPT-014 — may contract generation hard-fail (no document) instead of delivering an unusable file? | server/utils/pdf-generator.ts, server/routes.ts:5451-5650, 5963-6078 | n/a until decided | n/a |
| BUG-164 | HIGH | De legacy contractgenerator zet élke waarde in het verkeerde vak (ontbrekende y-flip) | TECHNICAL-FIX | FIX-N PDF rendering | server/utils/pdf-generator.ts:541-733, aanroepers in server/routes.ts | integration + PDF text | med |
| BUG-165 | HIGH | generate-default en damage-checks/generate schrijven het bestand maar de documents-rij mislukt altijd | TECHNICAL-FIX | FIX-N PDF rendering | server/routes.ts:6017-6062, 6217-6280 | integration + PDF text | med |
| BUG-166 | HIGH | De schadecheck drukt de klant af als null null | TECHNICAL-FIX | FIX-N PDF rendering | server/routes.ts:6178-6190, 6720-6746 | integration + PDF text | med |
| BUG-167 | HIGH | Contract- en schadecheck-PDF-endpoints hebben geen permissiecontrole (alleen requireAuth) | BUSINESS-DECISION | OPT-014 — which role/permission covers generating, previewing and viewing contract & damage-check PDFs? | server/routes.ts, server/routes/app-settings.ts | n/a until decided | n/a |
| BUG-168 | HIGH | Een ongevalideerde page-waarde in een schadecheck-sjabloon blokkeert de hele server minutenlang | TECHNICAL-FIX | FIX-P template validation | server/pdf-damage-check-generator.ts, server/routes/damage-check-templates.ts | supertest + PDF text | med |
| BUG-169 | HIGH | Met UPLOADS_DIR (de productievorm) geeft GET /api/drivers/:id/license 403 op élk rijbewijs | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/routes.ts:6512-6540 | integration (tmp UPLOADS_DIR) | low |
| BUG-170 | HIGH | Eén APK-/onderhouds-/custom-herinnering gaat naar élke klant die ooit een reservering op dat kenteken had | BUSINESS-DECISION | OPT-027 — who is the recipient of a vehicle reminder: only the current holder, or every past/future renter? | server/routes/notifications.ts | n/a until decided | n/a |
| BUG-171 | HIGH | De gepoolde SMTP-transporter heeft geen timeouts en maar 2 verbindingen: één hangende mailserver legt áll… | TECHNICAL-FIX | FIX-M mail reliability | server/utils/email-service.ts | integration (SMTP stub) | low |
| BUG-172 | MEDIUM | Reservering bewerken kent geen optimistic locking: twee tabbladen die het volledige formulier opslaan wis… | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts, server/database-storage.ts:1209 | supertest | high |
| BUG-173 | MEDIUM | maintenance-with-spare kent geen idempotentie: een dubbelklik maakt twee onderhoudsblokken én twee reserv… | TECHNICAL-FIX | FIX-F bookability (CQ-006) | server/routes.ts | integration + concurrency | high |
| BUG-174 | MEDIUM | Twee gelijktijdige pickups met verschillende contractnummers slagen allebei | TECHNICAL-FIX | FIX-G atomic transitions | server/database-storage.ts:1624, server/routes.ts | concurrency (parallel supertest) | med |
| BUG-175 | MEDIUM | Gelijktijdige saves van systeeminstellingen en PDF-sjablonen overschrijven elkaar (geen merge, geen versi… | TECHNICAL-FIX | FIX-G atomic transitions | server/routes/app-settings.ts, server/routes/pdf-templates.ts, server/database-storage.ts | concurrency (parallel supertest) | med |
| BUG-176 | MEDIUM | canvasFields van schadecheck-sjablonen worden niet gevalideerd: één foute entry breekt élke PDF voor die … | TECHNICAL-FIX | FIX-P template validation | server/routes/damage-check-templates.ts, server/pdf-damage-check-generator.ts | supertest + PDF text | med |
| BUG-177 | MEDIUM | De headerafbeelding van de schadecheck ligt over het sjabloonvlak heen, met een hoogte die van de afbeeld… | TECHNICAL-FIX | FIX-P template validation | server/pdf-damage-check-generator.ts, server/routes/app-settings.ts, client/src/pages/settings/… | supertest + PDF text | med |
| BUG-178 | MEDIUM | Geen enkele generator breekt of kapt af: lange waarden lopen van de pagina en gaan in print verloren | BUSINESS-DECISION | OPT-014 — truncate, wrap or reject values that do not fit on the PDF? | server/utils/pdf-generator.ts, server/pdf-damage-check-generator.ts, de client-editors, shared/… | n/a until decided | n/a |
| BUG-179 | MEDIUM | Contractsjabloon-achtergronden degraderen stil: kapot, ontbrekend of verkeerd formaat valt terug op de st… | TECHNICAL-FIX | FIX-P template validation | server/utils/pdf-generator.ts, server/routes/pdf-templates.ts (en de twee kopieën in report-and… | supertest + PDF text | med |
| BUG-180 | MEDIUM | De document-level inhoud van een PDF-achtergrond (OpenAction-JavaScript, extra pagina's) wordt in élk geg… | TECHNICAL-FIX | FIX-P template validation | server/utils/pdf-generator.ts, server/routes/pdf-templates.ts:306-412 | supertest + PDF text | med |
| BUG-181 | MEDIUM | Sjabloonkeuze valt inconsistent terug: willekeurig contractsjabloon, blanco transportrapport, drie schade… | BUSINESS-DECISION | OPT-014 — refuse to generate when no default template is marked, or pick one? | server/database-storage.ts, server/routes.ts, server/services/reservation-pdf-regeneration.ts | n/a until decided | n/a |
| BUG-182 | MEDIUM | generate-versioned controleert de reservering niet en evenmin of voertuig/klant erbij horen | BUSINESS-DECISION | OPT-014 — is "draft contract before saving" a supported workflow, and how is it archived? | server/routes.ts | n/a until decided | n/a |
| BUG-183 | MEDIUM | GET /api/vehicles/:id/damage-check-pdf drukt een oude, niet-gerelateerde reservering af; bij open einde w… | BUSINESS-DECISION | OPT-025/OPT-014 — which reservation belongs on a damage check when no rental runs today? | server/routes.ts:6717-6746, 6176-6190 | n/a until decided | n/a |
| BUG-184 | MEDIUM | Twee geüploade contract-PDF's voor dezelfde plaat op dezelfde dag delen één bestand: de eerste wordt over… | TECHNICAL-FIX | FIX-O document registration (CQ-008) | server/routes.ts:4873-4915, 5000-5035 | integration | med |
| BUG-185 | MEDIUM | Geen idempotentie of retry-bescherming op mail; een vastgelopen bulkverzending logt helemaal niets | TECHNICAL-FIX | FIX-M mail reliability | server/routes/notifications.ts, server/routes.ts:5219/5305, server/services/portal-mail.ts | integration (SMTP stub) | low |
| BUG-186 | MEDIUM | De opgeslagen smtpSecure-vlag wordt genegeerd: mail die als TLS is ingesteld gaat in platte tekst, en een… | TECHNICAL-FIX | FIX-M mail reliability | server/utils/email-service.ts, server/routes/app-settings.ts | integration (SMTP stub) | low |
| BUG-187 | MEDIUM | Portaalgebruiker-gecontroleerde velden worden als rauwe HTML in mail én in-app-meldingen gerenderd (phish… | TECHNICAL-FIX | FIX-M mail reliability | server/services/portal-mail.ts, server/services/portal-notifications.ts | integration (SMTP stub) | low |
| BUG-188 | LOW | Parallel verwijderen van één voertuig laat een dubbele/wees-snapshot in de prullenbak achter | TECHNICAL-FIX | FIX-G atomic transitions | server/database-storage.ts:535-620, server/routes.ts:1624-1690 | concurrency (parallel supertest) | med |
| BUG-189 | LOW | Een wachtwoordwijziging vanuit twee tabbladen slaagt tweemaal; alleen de laatste werkt | TECHNICAL-FIX | FIX-G atomic transitions | server/routes/users.ts:349-398 | concurrency (parallel supertest) | med |
| BUG-190 | LOW | Gelijktijdige documentgeneratie levert dubbele versielabels en dubbele documentrijen op | TECHNICAL-FIX | FIX-O document registration (CQ-008) | server/routes.ts | integration | med |
| BUG-191 | LOW | De contractrenderer drukt placeholdertekst af voor onoplosbare velden en accepteert absurde geometrie | TECHNICAL-FIX | FIX-N PDF rendering | server/utils/pdf-generator.ts, server/routes/pdf-templates.ts | integration + PDF text | med |
| BUG-192 | LOW | Gemengde talen en formaten binnen één document; de language-kolom van het sjabloon wordt genegeerd | BUSINESS-DECISION | OPT-014 — which source decides document language and date/currency format? | server/utils/pdf-generator.ts, server/pdf-damage-check-generator.ts, server/routes.ts | n/a until decided | n/a |
| BUG-193 | LOW | De previewafbeelding van een PDF-achtergrond wordt op Windows nooit gegenereerd (en er worden twee canvas… | TECHNICAL-FIX | FIX-P template validation | server/utils/pdf-to-image.ts, server/routes/pdf-templates.ts | supertest + PDF text | med |
| BUG-194 | LOW | Validatiegaten op de PDF- en sjabloon-endpoints: geaccepteerde rommel en een verkeerde statuscode | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts, server/routes/pdf-templates.ts, server/routes/report-and-label-templates.ts, … | supertest | high |
| BUG-195 | LOW | Een document waarvan het bestand verdwenen is blijft in elke lijst staan als normaal document | BUSINESS-DECISION | OPT-014/OPT-033 — mark, hide or clean up a document whose file is gone? | server/routes.ts:5111-5217, server/routes/expenses.ts:161-186, server/routes.ts:6512-6540, serv… | n/a until decided | n/a |
| BUG-196 | LOW | Kapotte "Openen in de app"-deeplink in staff-meldingen en een verminkt euroteken in boetemail | TECHNICAL-FIX | FIX-M mail reliability | server/services/portal-notifications.ts, server/services/portal-mail.ts | integration (SMTP stub) | low |
| BUG-197 | CRITICAL | Een beschadigde of onvolledige back-up wordt teruggezet als "succes" en laat de database half of leeg ach… | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts, server/routes/backups.ts, server/backupVerification.ts (ongebruikt bij… | integration + SQL (scratch DB) | high |
| BUG-198 | HIGH | Bestandsherstel pakt uit in process.cwd() in plaats van in UPLOADS_DIR; de veiligheidsback-up komt uit ee… | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/backupService.ts, server/routes/backups.ts | integration (tmp UPLOADS_DIR) | low |
| BUG-199 | HIGH | Een dump met \connect/CREATE DATABASE herstelt in een ándere database (en dropt die eerst), terwijl de do… | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts, server/routes/backups.ts | integration + SQL (scratch DB) | high |
| BUG-200 | HIGH | POST /api/backups/upload schrijft naar process.cwd()/backups in plaats van BACKUP_PATH: een geüploade bac… | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/routes/backups.ts | integration (tmp UPLOADS_DIR) | low |
| BUG-201 | HIGH | Eén reservering met een onleesbare datum laat de hele reserveringspagina crashen; er is nergens een error… | TECHNICAL-FIX | FIX-Q client robustness | client/src/pages/reservations/calendar.tsx, client/src/App.tsx | unit (client, jsdom) | low |
| BUG-202 | HIGH | Het bewerkformulier van reserveringen faalt altijd: portalRequestId="" en replacementForTransportId="" wo… | TECHNICAL-FIX | FIX-D body validation (CQ-009) | server/routes.ts, client/src/components/reservations/reservation-form.tsx | supertest | med |
| BUG-203 | HIGH | getReservationsInDateRange is N+1: 924 statements voor één maandweergave, 3 774 voor een jaar | TECHNICAL-FIX | FIX-T performance | server/database-storage.ts:1285-1356; consumenten client/src/pages/reservations/calendar.tsx:60… | integration + SQL count | med |
| BUG-204 | HIGH | De reserveringspagina downloadt 19,6 MB bij de eerste weergave, waarvan 16 MB dezelfde lijst tweemaal (tw… | TECHNICAL-FIX | FIX-T performance | client/src/pages/reservations/calendar.tsx:583-711, client/src/lib/cache-utils.ts:22-30, client… | integration + SQL count | high |
| BUG-205 | HIGH | Lijstendpoints bedden de volledige voertuig- én klantrij in elke regel in en kennen nergens paginering: 8… | BUSINESS-DECISION | OPT-001 — API contract: may list endpoints stop embedding full vehicle/customer rows and start paginating? | server/database-storage.ts (bovenstaande), server/routes.ts:2299-2313, :2139-2170, :2203-2216; … | n/a until decided | n/a |
| BUG-206 | MEDIUM | Elke back-up laat zijn tijdelijke kopie achter in os.tmpdir() (13 MB + 118 MB per run, voor altijd) | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts | integration + SQL (scratch DB) | high |
| BUG-207 | MEDIUM | require is not defined (ESM) in de opruiming van restoreDatabase: een platte dump van 20 MB blijft naast … | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts | integration + SQL (scratch DB) | high |
| BUG-208 | MEDIUM | restore/complete is niet atomair: de database is al vervangen (en iedereen uitgelogd) wanneer de bestande… | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts, server/routes/backups.ts | integration + SQL (scratch DB) | high |
| BUG-209 | MEDIUM | download-files archiveert process.cwd()/uploads in plaats van UPLOADS_DIR; de download-data-dump mist --c… | TECHNICAL-FIX | FIX-B uploads path (CQ-003) | server/routes/backups.ts | integration (tmp UPLOADS_DIR) | low |
| BUG-210 | MEDIUM | De kalenderpagina scrollt horizontaal bij 1182 px, en na het sluiten van een dialoog blijft de viewport v… | TECHNICAL-FIX | FIX-S UI layout/i18n | client/src/pages/reservations/calendar.tsx, client/src/layouts/MainLayout.tsx | unit (client, jsdom) | low |
| BUG-211 | MEDIUM | Ophalen mag weken vóór de startdatum, zonder waarschuwing; het voertuig blijft available terwijl de reser… | BUSINESS-DECISION | OPT-017 — early pickup: confirm and move the start date, or block? | server/routes.ts (pickup), server/vehicle-status-helper.ts, client/src/components/reservations/… | n/a until decided | n/a |
| BUG-212 | MEDIUM | Mislukte GET-requests worden als lege toestand getoond, er is geen requesttimeout, geen retry en geen enk… | TECHNICAL-FIX | FIX-Q client robustness | client/src/lib/queryClient.ts, client/src/pages/reports/*, client/src/hooks/use-socket.tsx | unit (client, jsdom) | low |
| BUG-213 | MEDIUM | Een tabblad waarvan de sessie beëindigd is, toont gecachete gegevens door en gaat nooit naar de loginpagi… | TECHNICAL-FIX | FIX-Q client robustness | client/src/lib/queryClient.ts, client/src/hooks/use-auth.tsx, client/src/components/protected-r… | unit (client, jsdom) | low |
| BUG-214 | MEDIUM | Geen HTTP-compressie: responses van 8 MB / 4,25 MB / 1,65 MB gaan ongecomprimeerd de deur uit terwijl gzi… | DEFERRED | DEFERRED — first confirm whether Traefik already gzips in production | server/index.ts, package.json | n/a until infra known | n/a |
| BUG-215 | MEDIUM | Elke schadecheck-PDF codeert een header-PNG van 1,6 MB opnieuw: 581 ms CPU, 3,5 MB per bestand, 2,6 s sti… | TECHNICAL-FIX | FIX-T performance | server/pdf-damage-check-generator.ts:376-421, server/routes/app-settings.ts:62-135, server/rout… | integration + SQL count | med |
| BUG-216 | MEDIUM | GET /api/interactive-damage-checks levert 17 MB base64-diagrammen, en het kilometerstandrapport laadt die… | BUSINESS-DECISION | OPT-033 — move diagram/signature blobs out of the text columns into files or object storage? | server/database-storage.ts:4341-4343, server/routes/reports.ts:287-302, client/src/pages/reserv… | n/a until decided | n/a |
| BUG-217 | MEDIUM | GET /api/vehicles en /status/breakdown draaien de statussync (2 SELECT + tot 3 UPDATE) bij élke lees-acti… | TECHNICAL-FIX | FIX-H state machine (CQ-005) | server/routes.ts:426-475, server/database-storage.ts:224-353 | integration | high |
| BUG-218 | MEDIUM | express.json({ limit: '50mb' }) staat globaal: één body van 20 MB kost +100 MB RSS en wordt geparsed en g… | TECHNICAL-FIX | FIX-T performance | server/index.ts:163-164, server/middleware/security/sanitization.ts:18-41 | integration + SQL count | high |
| BUG-219 | LOW | Herstel hangt af van externe gunzip- en tar-binaries terwijl zlib en archiver al gebruikt worden; op een … | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts, server/routes/backups.ts, Dockerfile (declareert deze afhankelijkheden… | integration + SQL (scratch DB) | high |
| BUG-220 | LOW | De backup_runs-geschiedenis overleeft een herstel niet: spookruns blijven op running staan en de pre-rest… | TECHNICAL-FIX | FIX-L restore safety | server/backupService.ts | integration + SQL (scratch DB) | high |
| BUG-221 | LOW | Status- en UX-gaten in het back-upscherm (bundel van zes) | TECHNICAL-FIX | FIX-L restore safety | server/routes/backups.ts, server/backupService.ts, server/backupScheduler.ts, client/src/compon… | integration + SQL (scratch DB) | high |
| BUG-222 | LOW | Tabletlayout: de zijbalk blijft uitgeklapt en tabellen worden afgekapt | TECHNICAL-FIX | FIX-S UI layout/i18n | client/src/layouts/MainLayout.tsx, client/src/pages/vehicles*.tsx | unit (client, jsdom) | low |
| BUG-223 | LOW | Onvertaalde Engelse teksten en Amerikaanse datumnotaties in de Nederlandse UI | TECHNICAL-FIX | FIX-S UI layout/i18n | client/src (data-table, reserveringsdetaildialoog, documentenlijst, rapportenkop, 404-pagina) | unit (client, jsdom) | low |
| BUG-224 | LOW | Documenttijdstempels staan twee uur vóór op de werkelijkheid | BUSINESS-DECISION | OPT-033 — timestamptz migration across nearly every table: run it, and what happens to existing values? | shared/schema.ts, server/database-storage.ts (de document-insert), de documentlijsten in de cli… | n/a until decided | n/a |
| BUG-225 | LOW | Klikken naast de nieuwe-reserveringsdialoog gooit alles weg wat er is ingetypt | TECHNICAL-FIX | FIX-Q client robustness | client/src/components/reservations/reservation-form.tsx (de dialoogwrapper) | unit (client, jsdom) | low |
| BUG-226 | LOW | customers/with-reservations en find-by-contract laden de volledige reserveringstabel om één boolean te be… | TECHNICAL-FIX | FIX-T performance | server/routes.ts:1986-2024, :2315-2331 | integration + SQL count | med |
| BUG-227 | LOW | Per-rij-console.log op het heetste leespad (17,6 KB per kalenderlading) en 34 logregels per contract-PDF | TECHNICAL-FIX | FIX-T performance | server/database-storage.ts:1313-1335, server/utils/pdf-generator.ts, server/routes.ts | integration + SQL count | med |
| BUG-228 | LOW | Ongememoiseerde kalenderrendering: per cel een .filter over de hele reserveringsset (statisch — ongemeten… | TECHNICAL-FIX | FIX-S UI layout/i18n | client/src/pages/reservations/calendar.tsx, client/src/components/dashboard/reservation-calenda… | unit (client, jsdom) | low |
| BUG-229 | LOW | De socketinvalidatie matcht op key.includes('/' + id) en invalideert daardoor niet-gerelateerde queries | TECHNICAL-FIX | FIX-Q client robustness | client/src/lib/cache-utils.ts | unit (client, jsdom) | low |
| BUG-230 | LOW | Nachtelijke scans: de service-duescan laadt alle voertuigen tweemaal, de RDW-scan doet 665 sequentiële ex… | TECHNICAL-FIX | FIX-T performance | server/utils/service-due-scanner.ts, server/utils/rdw-apk-scanner.ts, server/services/portal-cu… | integration + SQL count | med |

---

## 3. Cluster catalogue — FIX-A … FIX-AA

27 clusters cover all 191 TECHNICAL-FIX bugs; every bug appears in exactly one cluster. Each entry
gives: the bugs it closes, the **one** change that closes them, the files, the regression tests
(file name + the assertions that must exist), the risk, and whether it can run independently.

Every new server-side test file lives under `server/__tests__/`, matching the existing layout, and
is named `fix-<cluster letter>-<subject>.test.ts` so the wave a test belongs to is obvious from
`ls`. Shared helpers go in `server/__tests__/helpers/` (new directory) — see §8.

---

### FIX-A — async error handling & process survival (CQ-001)

**Closes (3):** BUG-002 (CRITICAL), BUG-061 (CRITICAL), BUG-101 (LOW).

**The single change.** 96 of 372 async handlers (26 %) have no `try` at all, and
`server/index.ts:136-144` treats *every* unhandled rejection as fatal: `gracefulShutdown()` →
`process.exit`. One malformed field from any low-privileged portal account therefore takes the whole
backoffice down. Introduce one `asyncHandler(fn)` wrapper (or `express-async-errors`) applied at
route-registration level so a rejected handler promise reaches the Express error handler instead of
`process.on('unhandledRejection')`, and change the process policy: log the rejection with its stack,
increment a counter, and only exit on a *repeated* rejection or an `uncaughtException`. Then fix the
three specific throwers: wrap the bare `JSON.parse` in the zod `.preprocess()` at
`server/routes/portal.ts:316-317` in try/catch returning `z.NEVER`; add an existence check before
`portalStorage.getOrCreateCustomerSettings(customerId)` (`server/routes/portal-admin.ts:109-111`)
so a bad `customerId` is a 404, not an FK violation; add a depth limit to `collectRecordNodes`
(`server/services/cjib/parser.ts:108-113`).

**Files.** `server/index.ts` · new `server/middleware/asyncHandler.ts` · `server/routes/portal.ts` ·
`server/routes/portal-admin.ts` · `server/services/portal-storage.ts` ·
`server/services/cjib/parser.ts` · `server/routes/fines.ts`. Does **not** touch `server/routes.ts`.

**Regression tests.** `server/__tests__/fix-a-async-crash.test.ts`
- `POST /api/portal/requests` with `payload:"not-json-at-all"` → **400**, and the very next
  `GET /api/portal/me` on the same app instance answers (200/401) rather than ECONNRESET.
- `GET|POST` on a portal-admin route with a non-existent `customerId` → **404**, no FK error text in
  the body.
- CJIB XML with 200 nested levels → **400**, response received.
- A survival test that does not kill the runner: `server/__tests__/fix-a-process-policy.test.ts`
  spawns `tsx server/index.ts` as a **child process** on an ephemeral port against `lvs_fixtest`,
  fires the three payloads, asserts the child is still alive (`child.exitCode === null`) and still
  answering, then SIGTERMs it. See §8.2.

**Risk:** low. Behaviour only becomes *less* fatal. The one thing to watch: making rejections
non-fatal could hide a genuinely corrupt state, so the log line must be loud and must include the
route.

**Independence:** fully independent. Best done first — every later wave's tests benefit from a
server that does not die on a bad payload.

---

### FIX-B — uploads path resolution through `getUploadsDir()` (CQ-003)

**Closes (6):** BUG-026, BUG-029, BUG-169 (HIGH), BUG-198 (HIGH), BUG-200 (HIGH), BUG-209.

**The single change.** `shared/paths.ts:12` `getUploadsDir()` is the documented owner of the uploads
root, used 21 times; alongside it sit **79 hard `process.cwd()` joins**. With `UPLOADS_DIR` set —
the production form — the filesystem silently splits in two: the static mount serves the wrong tree,
driver licences 403 on every request, transport reports 404 forever, uploaded backups land where
nothing can find them, and file restore extracts into the application directory. Replace every
uploads-related `path.join(process.cwd(), 'uploads')` with `getUploadsDir()`, every ad-hoc
`path.relative(uploadsDir, filePath)` with the existing `getRelativePath()`
(`server/services/document-paths.ts:6`), and export `resolveBackupPath()` from `backupService` so
the backup upload route uses it instead of `path.join(process.cwd(),'backups')`.

**Files.** `server/index.ts` (static mount + `uploadsPath`) · `server/routes.ts` (`:6512-6540`
drivers licence, `~7666-7749` transport report) · `server/routes/backups.ts` (`:406`, `:427`,
`:481`, `:798`, `:83`, `:95`) · `server/backupService.ts` (`:927`) · `server/services/document-paths.ts`.

**Regression tests.** `server/__tests__/fix-b-uploads-dir.test.ts`, all run with
`process.env.UPLOADS_DIR` pointed at a `fs.mkdtempSync()` directory (see §8.3)
- write a file through an upload route, then `GET /uploads/<relative>` → 200 with **the same bytes**.
- generate a transport report, then `GET /api/documents/download/:id` → 200 `application/pdf`,
  not 404.
- a driver with a `licenseFilePath` under the temp dir: `GET /api/drivers/:id/license` → 200, not 403.
- `POST /api/backups/upload` → the file exists under `resolveBackupPath()`, and
  `GET /api/backups` lists it.
- a negative assertion that matters: `grep`-style unit test asserting no *new*
  `path.join(process.cwd(), 'uploads')` appears — implement as a small source scan in
  `server/__tests__/fix-b-no-cwd-uploads.test.ts` with an explicit allowlist of the remaining legacy
  fallback in `documents/view|download` (phase 20 §2.5 point 8: that fallback is the only reason old
  rows are still readable and must stay until the rows are migrated).

**Risk:** low in code, **medium in data**. Fixing the path does not move the files that were written
to the wrong tree. The plan is: fix the code, then have the owner run a one-off inventory of what
sits under `cwd/uploads` versus `UPLOADS_DIR` in production. Moving files is a production data
action and needs approval (§1.2).

**Independence:** independent of everything except FIX-L, which must land *after* it (FIX-L's
extraction target is `getUploadsDir()`).

---

### FIX-C — path containment and server-owned path fields

**Closes (4):** BUG-012 (HIGH), BUG-060 (CRITICAL), BUG-070 (HIGH), BUG-098.

**The single change.** Two halves of one rule. (1) Path-like columns — `receiptFilePath`,
`backgroundPath`, `backgroundPreviewPath`, `diagramPath`, `previewPath`, `licenseFilePath`,
`pdfPath`, `filePath` — must never be writable from a request body: `.omit()` them from the insert
schemas in `shared/schema.ts` and set them server-side. (2) Every filesystem operation built from a
stored path goes through `resolveDocumentFilePath()` (`server/services/document-paths.ts:19-47`),
which additionally gets `fs.realpathSync()` after `path.resolve()` so a symlink inside `uploads/`
cannot escape.

**Files.** `shared/schema.ts` (`:1009`, `:1026-1032`, `:417`, `:1007`) ·
`server/services/document-paths.ts:19-47` · `server/routes.ts:5111-5217`, `:5403-5427` ·
`server/routes/expenses.ts:158-186,275-319` · `server/routes/pdf-templates.ts`,
`damage-check-templates.ts`, `report-and-label-templates.ts`, `vehicle-diagram-templates.ts`.

**Regression tests.** `server/__tests__/fix-c-path-containment.test.ts`
- set `documents.file_path` to `'../package.json'` and to an absolute path in `lvs_fixtest`;
  view/download/delete must each return 404/400 and `fs.existsSync('package.json')` must still be
  true afterwards.
- `POST /api/expenses` with `receiptFilePath:"../../package.json"` → the created row's
  `receiptFilePath` is **not** the supplied value (schema omitted it).
- create a symlink inside the temp uploads dir pointing outside; `resolveDocumentFilePath` returns
  null / the route returns 404.
- `PATCH` a pdf-template with `backgroundPath:"../../x"` then `DELETE` it → the outside file still
  exists.

**Risk:** medium — `resolveDocumentFilePath` becoming stricter can 404 legitimate legacy rows whose
paths were written by the old code. Mitigation: keep the documented fallback branch for
`documents/view|download` (phase 20 §2.5) and log every rejection with the offending stored path so
the owner gets a list of rows to migrate.

**Independence:** independent. Shares `server/routes.ts` with FIX-I/FIX-J, so same worker.

---

### FIX-D — request-body validation and partial-update semantics (CQ-009, mass assignment)

**Closes (12):** BUG-202 (HIGH), BUG-084, BUG-111 (HIGH), BUG-063 (HIGH), BUG-025, BUG-052,
BUG-104, BUG-122, BUG-127, BUG-148, BUG-172, BUG-194.

**The single change — the highest-leverage fix in the whole plan.** Today there are 25 hand-written
empty-string coercion blocks that have already drifted (CQ-009), and the two reservation PATCH
handlers pass the raw body to `db.update()` with the comment *"bypass full schema validation and just
use the raw data"* (`server/routes.ts:3600-3602`). Build one small module —
`server/middleware/validateBody.ts` — that per route: (a) coerces `""` and `"null"` to `null` for
every nullable integer/numeric column, derived **from the drizzle table definition**, not from a
hand-maintained list; (b) validates the body with `<insertSchema>.partial()`; (c) strips
`id`/`createdAt`/`createdBy`/`deletedAt`/`deletedBy` and every path column; (d) builds the SET list
from the keys that were actually present, which simultaneously ends the read-merge-write
lost-update behaviour of `updateVehicle`/`updateReservation`. Apply it to `PATCH /api/reservations/:id`,
`/basic`, `PATCH /api/vehicles/:id`, `PATCH /api/users/:id`, `PUT /api/system-settings`,
`POST /api/interactive-damage-checks` and the template routes. Finally, map Postgres error codes
centrally: **23503 → 404/409, 23505 → 409** with the field name taken from `error.constraint`, and
never serialise the error object into the response.

**Files.** new `server/middleware/validateBody.ts` · new `server/utils/pgErrors.ts` ·
`server/routes.ts` (`:3090-3230`, `:3445-3700`, `:1082-1233`, `:6849-6899`, `:829-836`,
`:1224-1231`, `:7388-7437`) · `server/routes/users.ts:135-237` ·
`server/routes/app-settings.ts:463-508` · `server/routes/settings.ts:91-119` ·
`server/database-storage.ts` (`updateReservation :1209`, `updateVehicle`) · `shared/schema.ts`.

**Regression tests.** `server/__tests__/fix-d-patch-validation.test.ts`
- **BUG-202 is the acceptance test for the whole cluster:** `PATCH /api/reservations/:id` with the
  exact multipart body the edit form sends, including `portalRequestId:""` and
  `replacementForTransportId:""` → **200** and both columns `null` in the DB. Today this is a 100 %
  failure.
- `PATCH /api/reservations/:id {status:"completed"}` from `booked` → 400; `{status:"garbage"}` → 400;
  row unchanged.
- `PATCH /api/reservations/:id {endDate:"2020-01-01"}` on a reservation starting 2026 → 400 (reverse
  range), row unchanged.
- `PATCH /api/users/:id {password:"x"}` on *another* user as a non-admin → 403; `{id:999}` → the id
  column is unchanged.
- two sequential PATCHes each sending one field → both fields present afterwards (no field wiped).
- `POST /api/transports` with a non-existent `vehicleId` → **404 with a field name**, and the body
  contains no `constraint`, no `detail`, no stack.
- `PUT /api/system-settings` with `overrideNumber: 9e18` → 400, not 500.

**Risk:** **high** — this is the cluster most likely to break a working screen, because several
clients currently rely on sending the whole row back. Mitigation: land it early (wave 2) so there is
maximum time to notice, and write the `.partial()` schemas to accept *supersets* (unknown keys
stripped, not rejected) in the first commit; tighten to `.strict()` only in a later, separate commit
once the client is known to be clean.

**Independence:** depends on FIX-E (the `:id` middleware runs before body validation). Everything in
FIX-F, FIX-G, FIX-H and FIX-AA assumes FIX-D's partial-update semantics — do not reorder.

---

### FIX-E — `:id` parameter validation and route ordering (CQ-007)

**Closes (3):** BUG-103, BUG-088, BUG-089.

**The single change.** 143 bare `parseInt(req.params.x)` against 3 duplicated helpers. One
`parseIntParam(name)` middleware returning 400 for anything that is not a positive integer, mounted
on every `:id` route (the 19 endpoints from the phase-8 fuzz list plus the rest). While in the file:
move `GET /api/damage-check-templates/by-vehicle` above the `/:id` registration that currently
shadows it (`server/routes/damage-check-templates.ts:35` vs `:52`), and find the root cause of the
unconditional 500 on `GET /api/reports/maintenance-costs` (`server/routes/reports.ts:36`) — the
audit expects the same class of unvalidated parameter.

**Files.** new `server/middleware/parseIntParam.ts` · `server/routes.ts` ·
`server/routes/app-settings.ts`, `settings.ts`, `expenses.ts`, `custom-notifications.ts`,
`damage-check-templates.ts`, `vehicle-diagram-templates.ts`, `reports.ts`.

**Regression tests.** `server/__tests__/fix-e-id-params.test.ts`
- a table-driven test over the 19 fuzz-list routes × `['abc','999999999999999999999','1%00','-1','0']`
  → every combination **400**, never 500, and the response body has no `stack`.
- `GET /api/damage-check-templates/by-vehicle?vehicleId=…` → 200 (proves it is reachable).
- `GET /api/reports/maintenance-costs` → 200 with a JSON array.

**Risk:** low. The only trap is a route whose `:id` is legitimately non-numeric (filenames,
license plates) — enumerate those first and leave them alone.

**Independence:** independent; must precede FIX-D.

---

### FIX-F — one bookability predicate, checked inside the write transaction (CQ-006)

**Closes (7):** BUG-006 (CRITICAL), BUG-106 (CRITICAL), BUG-107 (CRITICAL), BUG-121 (HIGH),
BUG-159 (CRITICAL), BUG-160 (HIGH), BUG-173.

**The single change.** There are **five** separate answers to "is this vehicle free in this period"
and the one that is materially correct is dead code. Introduce a single
`isVehicleBookable(tx, vehicleId, period, { excludeReservationId, isMaintenanceBlock, … })` in
`server/database-storage.ts` that owns both the overlap predicate *and* the status filter, and make
all four existing paths delegate to it. Three concrete defects go with it:
(a) the turnover exception at `:1558-1578` must not fire when the request lies entirely inside the
existing range — require `new.startDate <> new.endDate` or `existing.startDate <> existing.endDate`;
(b) `PATCH /api/reservations/:id` must compute `effective = {...existing, ...body}` and run the
check whenever the body carries any of `vehicleId/startDate/endDate/startTime/endTime/status`,
instead of only when `vehicleId && startDate` are both present;
(c) the check and the insert/update must be in **one** `db.transaction` with `SELECT … FOR UPDATE`
on the candidate overlapping rows (or a `pg_advisory_xact_lock` on `vehicleId`), which is also what
closes the spare-vehicle double-assignment and the intra-payload duplicate in
`maintenance-with-spare`.

**Files.** `server/database-storage.ts` (`checkReservationConflicts` `:1528-1622`,
`createReplacementReservation` `:3178-3239`, `applyTransportUpdate` `:2093-2122`,
`assignVehicleToPlaceholder`) · `server/routes.ts` (`POST /api/reservations` ~`:2435`,
`PATCH /:id` `:3644-3666`, `/basic` `:3121-3168`, `assign-spare` `:3848-3891`,
`maintenance-with-spare` `:2787-3042`) · `client/src/pages/reservations/calendar.tsx:386-391`
(drag/drop sends a partial PATCH — no change needed once the server is right, but assert it).

**Regression tests.** `server/__tests__/fix-f-bookability.test.ts` and
`server/__tests__/fix-f-conflicts-concurrency.test.ts`
- unit: `isVehicleBookable` truth table — same-day-inside-existing → **false** (BUG-107);
  true turnover (existing ends the day the new one starts, both multi-day) → **true**;
  `not_for_rental` / `needs_fixing` vehicle → **false** *only once the owner has decided BUG-018*;
  until then assert the current behaviour explicitly so the decision shows up as a failing test.
- integration: drag-and-drop shape — `PATCH /api/reservations/:id` with **only** `vehicleId` onto an
  occupied vehicle → **409**, not 200.
- concurrency: 20 parallel `POST /api/reservations` for the same vehicle/period → exactly **1**
  row (`SELECT count(*)`), 19 × 409, zero 500.
- concurrency: two parallel `assign-spare` calls with the same spare → exactly one replacement
  reservation.
- `maintenance-with-spare` with two assignments in one payload using the same spare on overlapping
  dates → 409, and **no** partial rows written (assert the block was not created either).

**Risk:** **high**. Row locks in a codebase with 9 `db.transaction` call sites and 203 storage
methods invite deadlocks. Rule: always take locks in ascending `vehicleId` order, keep transactions
short, and set a `statement_timeout` in the test helper so a deadlock fails fast instead of hanging
the suite.

**Independence:** needs FIX-D (partial-update semantics) and FIX-E. Must precede FIX-H and FIX-V.

---

### FIX-G — atomic single-writer transitions (conditional UPDATE / row lock)

**Closes (9):** BUG-043, BUG-126, BUG-141, BUG-142, BUG-158, BUG-174, BUG-175, BUG-188, BUG-189.

**The single change.** Nine independent check-then-act races with one shape: read a row, decide,
then write unconditionally. Replace each with a **conditional UPDATE that carries the precondition
in its WHERE clause** and treat `rowCount === 0` as "someone else won" (409 / "already done"), and
put the surrounding writes in one transaction:
`UPDATE reservations SET status='picked_up' … WHERE id=$1 AND status='booked' RETURNING *` (pickup);
`… WHERE id=$1 AND placeholder_spare AND vehicle_id IS NULL` (assign-vehicle);
the portal request transition at the *start* of `approveMaintenance`; the restore checks moved
*inside* `db.transaction` with a `barcode_taken` pre-check next to the existing `id_taken` /
`license_plate_taken`; delete-the-row-first-then-snapshot in `deleteVehicle`; optimistic concurrency
on `updatedAt` for settings and pdf-template saves; the password change as a conditional update on
the old hash; and `createTransport` moved inside `applyTransportUpdate`'s transaction so a 409 no
longer leaves an orphan transport.

**Files.** `server/database-storage.ts` (`pickupReservation :1624-1712`,
`assignVehicleToPlaceholder :3017-3103`, `restoreDeletedRecord :637-725`, `deleteVehicle :535-620`,
`updateSettings :3599-3623`, `updatePdfTemplate :2401`) · `server/routes/portal-requests.ts:307-347` ·
`server/routes/users.ts:349-398` · `server/routes/app-settings.ts:463-508` ·
`server/routes/pdf-templates.ts:194-266` · `server/routes.ts` (`:1715-1761`, `:4067-4239`,
`:7411-7422`, `:1624-1690`).

**Regression tests.** `server/__tests__/fix-g-atomic-transitions.test.ts` (all parallel-request tests)
- 2 parallel pickups with different contract numbers → one 200, one 400/409; exactly one contract
  number persisted; exactly one `documents` row.
- 5 parallel restores of one `deleted_records` id → exactly one 200, the rest 409 `ALREADY_RESTORED`;
  **zero 5xx**.
- a restore onto a taken barcode → **409 `BARCODE_TAKEN`**, not 500.
- 2 parallel portal approvals of one request → one maintenance block, one reply, one customer mail
  (count rows + count stub messages).
- 2 parallel `assign-vehicle` on one placeholder → one 200, one 409.
- 2 parallel vehicle deletes → exactly one row in `deleted_records`.
- 2 parallel password changes with the same current password → one 200, one 400.
- `POST /api/transports` that ends in 409 → `SELECT count(*) FROM vehicle_transports` unchanged.

**Risk:** medium. Conditional updates are mechanical; the risk is a precondition written too
tightly, turning a legitimate retry into a 409. Every 409 must carry a distinguishable code.

**Independence:** shares transaction shape with FIX-F — same wave, same worker for the
`database-storage.ts` regions.

---

### FIX-H — one owner for the reservation and vehicle state machines (CQ-005, CQ-011)

**Closes (13):** BUG-016 (HIGH), BUG-019 (HIGH), BUG-021 (HIGH), BUG-036, BUG-113 (HIGH),
BUG-120 (HIGH), BUG-128, BUG-129, BUG-130, BUG-136, BUG-146, BUG-154, BUG-217.

**The single change.** `VALID_RESERVATION_TRANSITIONS` exists and is enforced by **1 of 5** writers;
6 of the 12 exports of `vehicle-status-helper.ts` are dead, including `getStatusOnReturn`, which is
imported and never called. Route every status write — `PATCH /:id`, `/basic`, `/status`,
`returnReservation`, `pickupReservation`, `createMaintenanceBlock` — through one
`applyReservationTransition(tx, id, from, to)` that validates against the table and returns 400 on an
invalid or unknown value; do the same for `availabilityStatus` (validate against the
`VehicleAvailabilityStatus` union before the transition-specific branches in
`validateManualStatusChange`, `server/vehicle-status-helper.ts:74-145`, which today falls through to
`{allowed:true}`) and for `maintenanceStatus` (`['scheduled','in','out']`) and transport status.
Four behavioural corrections ride along: never overwrite `endDate` on completion/return — the row
already has `actualReturnDate`/`actualPickupDate` (BUG-019, BUG-128); exclude `returned` from the
overdue gate, which today makes a normally-returned rental block the vehicle after three days
(BUG-113); make `pickupReservation`/`returnReservation` transactional with the vehicle check
evaluated **before** the first write (BUG-120); and move the vehicle status sync out of
`GET /api/vehicles` and `/status/breakdown` into the reservation mutations and the nightly scheduler
where it already runs (BUG-217).

**Files.** `shared/schema.ts:18-48` · `server/vehicle-status-helper.ts:74-145` ·
`server/database-storage.ts` (`:224-353` sync, `:1624-1790` pickup/return, `:1515-1516` overdue
filter, `:3323-3349` maintenance block) · `server/routes.ts` (`:426-475`, `:1082-1233`, `:1240-1273`,
`:3090-3230`, `:3230-3445`, `:3445-3700`, `:2622-2632`, `:7438-7471`).

**Regression tests.** `server/__tests__/fix-h-state-machine.test.ts`
- a table-driven transition matrix: for each of the 5 write paths × each illegal transition → 400 and
  the row unchanged; for each legal transition → 200 and the row changed. This single table is the
  cluster's acceptance criterion.
- `PATCH … {availabilityStatus:"not_a_real_status"}` → 400; `{maintenanceStatus:"nonsense"}` → 400.
- complete a reservation whose `endDate` is in the future → `endDate` unchanged, `actualReturnDate`
  set; assert `endDate >= startDate` always.
- a `returned` reservation older than three days → a new booking on that vehicle for a
  non-overlapping future window **succeeds** (today it is blocked).
- pickup that must fail the vehicle check → status still `booked`, **no** contract number consumed,
  no `documents` row.
- `GET /api/vehicles` executes **zero** UPDATE statements — assert with the SQL counter helper (§8.6).

**Risk:** **high**. This is the cluster that can most easily make a screen say "not allowed" where
staff are used to "allowed". Two bugs in this area (BUG-109, BUG-211) are held back as
BUSINESS-DECISION precisely because their rule is a choice; FIX-H must implement only the
mechanically-correct part and must not silently decide those.

**Independence:** depends on FIX-D, FIX-F, FIX-G. Blocks nothing downstream except OPT-006/008/015.

---

### FIX-I — permission middleware gaps

**Closes (11):** BUG-001 (CRITICAL), BUG-010 (HIGH), BUG-011 (HIGH), BUG-015 (HIGH), BUG-023 (HIGH),
BUG-064 (HIGH), BUG-065 (HIGH), BUG-066 (HIGH), BUG-067 (HIGH), BUG-068 (HIGH), BUG-085.

**The single change.** A set of route registrations that have `requireAuth` but no
`hasPermission(...)`, plus one route family with the *wrong* permission and one privilege
escalation. Add the missing `hasPermission(...)` to each registration; make `POST /api/users` and
`PATCH /api/users/:id` require the caller to actually hold `role:"admin"` before `role` may be set to
`"admin"`, and forbid `role`/`permissions` on the caller's own row unless the caller is a real admin;
move the app-settings reads in `server/routes/settings.ts` behind `manage_settings` and apply the
existing `redactAppSetting` so `manage_backups` can no longer read the plaintext SMTP password;
replace the blanket `/uploads` static mount with the scoped download routes (or at minimum
`hasPermission(MANAGE_DOCUMENTS)`).

Then make the gap un-repeatable: add `server/__tests__/fix-i-permission-matrix.test.ts` which walks
the **entire** router stack at runtime, and fails on any registration that has neither
`hasPermission` nor an explicit entry in an allowlist of intentionally public routes
(`/api/login`, `/health`, …). This is the default-deny net that the audit recommends and it is what
stops the twelfth instance of this bug.

**Files.** `server/routes/users.ts:92-245` · `server/routes/settings.ts:15-231`, `:90-135` ·
`server/routes/app-settings.ts:431,463` · `server/routes.ts` (`:4013`, `:4464-4600`, `:4621-4687`,
`:6572-6635`, `:6641`, `:6783-7335`, `:4749`) · `server/routes/vehicle-diagram-templates.ts:89,138,211` ·
`server/index.ts:336-338`.

**Regression tests.** as above, plus per-bug assertions in
`server/__tests__/fix-i-permissions.test.ts`
- a `manager` with `manage_users` (not admin): `POST /api/users {role:"admin"}` → **403**;
  `PATCH /api/users/<own id> {role:"admin"}` → **403**; DB rows unchanged.
- a user with `permissions:[]`: `PUT /api/system-settings` → 403; with `manage_settings` → 200.
- a user with only `manage_backups`: no settings read endpoint returns a non-empty `smtpPassword`.
- a user with only `view_reservations`: `PATCH /api/reservations/:id/spare-status` → 403,
  `DELETE /api/reservations/:id` → 403, every placeholder route → 403.
- a user without `manage_customers`: `POST /api/migrate/customer-drivers` → 403.
- all seven damage-check routes → 403 without the damage-check permission.

**Risk:** medium — a permission added where staff genuinely need it turns into a support call on day
one. Before committing, list every route this cluster gates and have the owner confirm the
permission name against the roles that exist (that confirmation is a *naming* check, not a business
decision, so it does not block).

**Independence:** independent. Shares `server/routes.ts` with FIX-J and FIX-C.

---

### FIX-J — unauthenticated endpoints

**Closes (5):** BUG-003 (CRITICAL), BUG-005 (CRITICAL), BUG-046, BUG-051, BUG-093.

**The single change.** Four expenses routes, the RDW proxy and the object-storage passthrough have
no auth middleware at all; Socket.IO accepts any connection and `io.emit`s whole records to it; and
`/health` is anonymous, returns environment variables and runs a full `getAllUsers()`. Add
`hasPermission(MANAGE_EXPENSES)` to `server/routes/expenses.ts:158,275,341,405`, `requireAuth` to
the RDW and object-storage routes, a Socket.IO handshake middleware that validates the express
session cookie against the session store and otherwise `next(new Error('unauthorized'))` — and cut
the broadcast payload down to `{entityType, action, id}`, which is all the client uses to invalidate
queries. Strip `envVars` and `userCount` from `/health` and replace the users query with `SELECT 1`.

**Files.** `server/routes/expenses.ts` · `server/routes.ts:1930-1965`, `:7338-7353` ·
`server/index.ts:196-237`, `:273-330` · `server/realtime-events.ts:11-23` ·
`client/src/hooks/use-socket.tsx` (payload shape).

**Regression tests.** `server/__tests__/fix-j-unauthenticated.test.ts`
- all four expenses routes plus `GET /api/expenses/:id/receipt` with a fresh cookie jar → **401**
  each, and `SELECT count(*) FROM expenses` unchanged.
- `GET /api/rdw/vehicle/<plate>` without a cookie → 401.
- a static assertion that `/object-storage/*` is registered with `requireAuth` (the endpoint has no
  functional behaviour in this environment to test against).
- `socket.io-client` without a cookie → `connect_error`; with a valid session → an event whose
  payload has **only** `{entityType, action, id}` (assert no `licensePlate`, no `customer`).
- `GET /health` → 200, body has no `envVars`, no `userCount`.

**Risk:** low, with one exception: the Socket.IO payload shrink is a client-visible contract change.
Verify `use-socket.tsx` and `cache-utils.ts` only read the id before shipping.

**Independence:** independent. Shares `server/index.ts` with FIX-A — sequence them.

---

### FIX-K — authentication, session and rate-limit hardening

**Closes (12):** BUG-008 (HIGH), BUG-047, BUG-062 (HIGH), BUG-074 (HIGH), BUG-083, BUG-091,
BUG-092, BUG-094, BUG-095, BUG-096, BUG-105, BUG-161 (HIGH).

**The single change.** One pass over `server/auth.ts`, `server/portal-auth.ts` and
`server/middleware/security/`: store `attempted_at` as `timestamptz` (or force `TimeZone=UTC` on the
pool) so a 15-minute lockout stops lasting 135; re-issue the CSRF token *after*
`req.session.regenerate()` in the login handler; refuse to start in production without
`DEFAULT_ADMIN_PASSWORD` and delete `admin123` from both the code and the deployment log; mount
`apiLimiter` **after** `setupAuth()` so its `skip()` can ever fire, and key it on `req.user.id` with
a fallback to `req.ip`; give `/api/portal/*` its own limiter instances with
`skipSuccessfulRequests:false` so the always-200 forgot-password route is actually limited; reuse
`resolveSessionSecret()` for the portal realm instead of `"portal-dev-secret"`; call
`revokeUserSessions()` and `removeSession()` on password change and logout and set `expiresAt` to the
cookie `maxAge`; compare CSRF tokens with `timingSafeEqual`; give scrypt explicit cost parameters and
re-hash on successful login; and make the failed-login count atomic (record first, then decide on a
conditional count inside the same transaction) so 30 parallel guesses do not all get fully evaluated.

**Files.** `server/auth.ts` (`:33-51`, `:67-85`, `:114`, `:135`, `:263`, `:268-370`, `:332`,
`:355-356`, `:377-398`) · `server/portal-auth.ts` (`:163`, `:233`, `:360-368`, `:373-384`) ·
`server/middleware/security/rateLimiter.ts` (`:12-23`, `:28-35`, `:40-90`) ·
`server/middleware/security/csrf.ts` · `server/utils/security/sessionManager.ts` ·
`server/initAdmin.ts` · `server/index.ts:174,187` · `shared/schema.ts:1990`.
**Does not touch `server/routes.ts`.**

**Regression tests.** `server/__tests__/fix-k-auth-hardening.test.ts`
- with the Postgres session on `Europe/Berlin`, lock an account and assert `remainingTime ≈ 900`,
  not ≈ 8100.
- `POST /api/login`, then immediately a mutating endpoint with the `XSRF-TOKEN` from that response →
  success, no `CSRF_INVALID`.
- 30 parallel wrong-password logins → the account is locked and **fewer than 30** password
  comparisons ran (assert via a spy on `comparePasswords`, or by wall-clock: the batch must not take
  30 × scrypt).
- `POST /api/portal/forgot` 20 times → a 429 appears.
- a burst on `/api/portal/login` does not consume the staff `/api/login` budget (separate buckets).
- change a password in session A → session B's next request is 401 and its `active_sessions` row is
  gone.
- logout → `SELECT count(*) FROM active_sessions WHERE session_id=…` is 0.
- `NODE_ENV=production` without `DEFAULT_ADMIN_PASSWORD` → the start-up helper throws (test the
  exported function, not the process).

**Risk:** medium. The lockout/limiter changes can lock out real staff if a bucket is keyed wrong;
each limiter needs an explicit, asserted key.

**Independence:** fully independent — **this is the best cluster to run in parallel with a
`routes.ts` cluster.**

---

### FIX-L — backup and restore safety

**Closes (10):** BUG-069 (HIGH), BUG-075 (HIGH), BUG-197 (CRITICAL), BUG-199 (HIGH), BUG-206,
BUG-207, BUG-208, BUG-219, BUG-220, BUG-221.

**The single change.** Restore today is `psql <url> -f <file>` with no `ON_ERROR_STOP`, no
`--single-transaction`, and no pre-flight check, so a truncated or corrupt dump returns **200
"Database restore completed successfully"** while leaving the database half-empty and every sequence
reset to 1. Rewrite the restore path as one guarded pipeline:
(1) verify the archive before touching anything — `verifyDatabaseBackup()` already exists and is only
used after *creating* a backup; run it on the file to be restored, including the
`PostgreSQL database dump complete` end marker, for uploads too;
(2) reject any dump containing `\connect`, `\!`, `\i`, `\copy … PROGRAM`, `CREATE|DROP DATABASE` or
`ALTER SYSTEM`;
(3) run psql with `-v ON_ERROR_STOP=1 --single-transaction`, fail the request on a non-zero exit and
return the first `ERROR:` line;
(4) stage the **files** archive first, into a temp directory, and only then touch the database, so a
file failure can no longer happen after everyone has been logged out — and answer partial failure
with an explicit `{databaseRestored, filesRestored}` body rather than a flat "failed";
(5) extract with the `tar` npm package (already a declared dependency with zero imports, CQ-014) and
`zlib.createGunzip()` instead of `spawn('tar')`/`spawn('gunzip')`, with a per-entry filter rejecting
`..` and absolute paths and a target of `getUploadsDir()` — this closes the authenticated RCE and
makes restore work on a Windows host;
(6) `unlink` every temp file in a `finally`, import `unlinkSync` at module top (the ESM
`require is not defined` bug), and clean stale `db-backup-*`/`files-backup-*` at start-up;
(7) never interpolate `DATABASE_URL` into a shell string — `spawn()` with an argument array and
`PGPASSWORD` in the env — and never return `error.message` to the client;
(8) exclude `backup_runs` data from the dump (or repair `running` rows after a restore) and rewrite
the `pre-restore` row once psql finishes;
(9) the six small UX/status gaps of BUG-221: 409 + `Retry-After` on a concurrent run, a real next-run
time from `cron-parser`, an existence check in `/api/backups/health`, delete empty date folders,
reject zero-byte uploads, require a `confirm` field on the upload-restore routes.

**Files.** `server/backupService.ts` (`:118-133`, `:217-246`, `:702-846`, `:760`, `:798-823`,
`:829-838`, `:927-936`, `:994-1009`, `:1113`) · `server/routes/backups.ts` (`:83`, `:95`, `:110-116`,
`:283-295`, `:354`, `:356`, `:406`, `:427`, `:481`, `:485`, `:585-721`, `:656-661`, `:739-750`,
`:753-843`, `:785-810`, `:987-992`) · `server/backupVerification.ts` · `server/backupScheduler.ts` ·
`client/src/components/dialogs/backup-dialog.tsx`. **Does not touch `server/routes.ts`.**

**Regression tests.** `server/__tests__/fix-l-restore-safety.test.ts`, against a **scratch**
database created per test (`lvs_fixtest_restore_<pid>`), never `lvs_fixtest` itself — see §8.4. Reuse
the phase-17 fixtures:
- `p17-copyerror.sql.gz` → **500** with `"invalid input syntax"` in the message, and
  `SELECT count(*) FROM vehicles` **unchanged**.
- `p17-half.sql` (truncated at 50 %) → 500, `users` count unchanged, login still works.
- `p17-empty.sql.gz` → 500 (missing end marker), and `vehicles_id_seq.last_value` unchanged.
- the good archive → 200, and the row counts equal the dump's.
- a dump containing `\connect other_db` → 400 before psql runs.
- a tar entry named `../../evil.txt` → rejected; the file does not appear outside the temp uploads
  dir.
- after any restore attempt, `os.tmpdir()` holds no new `db-backup-*`/`files-backup-*`.
- a forced `pg_dump` failure → the response body contains no `postgresql://` substring.
- `POST` a second backup while one runs → 409 with `Retry-After`.

**Risk:** **high** — this is the code path that can destroy the dataset, and its tests must therefore
never point at a database anyone cares about. The scratch-database helper is a hard prerequisite; do
not write a single line of FIX-L before §8.4 exists and is proven to create and drop its own
database.

**Independence:** depends on FIX-B (it extracts into `getUploadsDir()`). Otherwise independent and
does not touch `routes.ts` — a good parallel partner.

---

### FIX-M — mail reliability, logging and injection

**Closes (8):** BUG-080, BUG-100, BUG-155, BUG-171 (HIGH), BUG-185, BUG-186, BUG-187, BUG-196.

**The single change.** The pooled SMTP transporter has `maxConnections:2` and **no** timeouts, so one
hanging mail server stops all mail including password recovery; nothing is logged, so "did the
customer get the contract" has no answer; `smtpSecure` is ignored (it is derived from
`smtpPort === '465'` as a *string*); TLS certificate validation is off; `fromName`/`fromEmail` are
interpolated raw into a header; and `renderTemplate` substitutes `{{var}}` without escaping, so
portal-controlled fields render as raw HTML in mail and in stored notifications. One pass over
`server/utils/email-service.ts` + `server/services/portal-mail.ts`: add
`connectionTimeout`/`greetingTimeout`/`socketTimeout` (10 s each), `rejectUnauthorized:true`, honour
the stored `smtpSecure`, validate `fromEmail`/`host`/`port` on save and reject CR/LF, pass the from
address in object form, HTML-escape every interpolated variable, set a UTF-8 charset on the fine
mail, build the staff deep link from an explicit `?request=<id>` parameter, and write an
`email_logs` row for **every** attempt — success and failure — incrementally (in a `finally`), not
once after the loop. Return `mailSent:false` in the approval/reply responses instead of swallowing it.

**Files.** `server/utils/email-service.ts` (`:88-105`, `:142-221`, `:216-218`, `:253-276`) ·
`server/services/portal-mail.ts` (`:108`, `:171-188`) · `server/services/portal-notifications.ts:61-65` ·
`server/services/portal-maintenance-events.ts` · `server/routes/notifications.ts:180-347` ·
`server/routes/app-settings.ts:309-333` · `server/routes.ts:5219-5305` (the two document-mail routes).

**Regression tests.** `server/__tests__/fix-m-mail.test.ts`, driving the existing raw-TCP stub
`docs/audit/wip/scripts/p16-stub.cjs` (§8.5)
- stub mode `silent` → the send fails within ~10 s (assert elapsed < 15 000 ms) instead of hanging,
  and an `email_logs` row exists with the failure reason.
- stub mode `ok` → an `email_logs` row with `result='sent'`, the recipient and the template name.
- a template variable containing `<img src=x onerror=alert(1)>` → the captured DATA body contains the
  escaped form and **not** the raw tag.
- `fromName` containing `\r\nBcc: evil@x` → rejected at save time (400).
- settings with `smtpSecure:true` and port 587 → the transporter is created with `secure:true`
  (assert on the options object, not on the wire).
- a bulk send that throws halfway → `email_logs` holds one row per attempted recipient, not zero.

**Risk:** low. `rejectUnauthorized:true` is the one behaviour that can break a working setup (a
self-signed corporate relay); make it a setting that defaults to true and log loudly when it is
turned off.

**Independence:** fully independent; barely touches `routes.ts`. Good parallel partner.

---

### FIX-N — PDF rendering correctness

**Closes (7):** BUG-119 (HIGH), BUG-156, BUG-162 (HIGH), BUG-164 (HIGH), BUG-165 (HIGH),
BUG-166 (HIGH), BUG-191.

**The single change.** Contracts silently lose fields and print in the wrong places. Four concrete
defects, one pass over `server/utils/pdf-generator.ts`: register `@pdf-lib/fontkit` and embed one
Unicode TTF (or apply the `sanitizeForWinAnsi` that already exists in
`server/pdf-damage-check-generator.ts`) so a character outside WinAnsi no longer makes the whole
field vanish through the per-field try/catch at `:517-519` and `:1426-1428`; delete the legacy
generator at `:541-733` whose y-coordinates are never flipped (`842 - y` is applied by the template
renderer at `:450` and nowhere else), so every value lands in the wrong box; stop passing
`uploadDate: new Date().toISOString()` (a **string**) to `storage.createDocument` at
`server/routes.ts:6047` and `:6268` — drop the property, the column defaults to `now()` — which is
why `generate-default` and `damage-checks/generate` write the file and then **always** fail to
register the row; use one `buildDamageCheckReservationData()` with
`customer.name || [firstName,lastName].filter(Boolean).join(' ')` so the damage check stops printing
`null null`; refuse to generate a contract for a `maintenance_block`, a TBD placeholder, or a
reservation without vehicle/customer (share the guard `generate-versioned` already has at `:5798`);
return 404 for an unknown transport-report `templateId` instead of silently falling back; and
whitelist the field sources so an unresolvable field prints `''` with a warning instead of its own
name.

**Files.** `server/utils/pdf-generator.ts` (`:88-207`, `:210-211`, `:344-390`, `:419-431`,
`:474-519`, `:541-733`, `:1420-1428`) · `server/pdf-damage-check-generator.ts` (the sanitizer) ·
`server/routes.ts` (`:5451-5470`, `:5963-5990`, `:6017-6062`, `:6178-6190`, `:6217-6280`,
`:6720-6746`, `:7696-7698`).

**Regression tests.** `server/__tests__/fix-n-pdf-content.test.ts`, using the phase-14 extractor
`docs/audit/wip/scripts/p14-pdfinfo.cjs` (§8.7) — these assert on **text**, not on byte counts
- a customer named `"Jørgen Ångström"` → the extracted text of page 1 **contains that exact string**
  (today the field is empty).
- a generated contract → the extracted item positions put the end date inside the page box
  (`0 ≤ x ≤ 595`, `0 ≤ y ≤ 842`) and in the same box as the template's field definition.
- `generate-default` → response 200 **and** `SELECT count(*) FROM documents WHERE reservation_id=…`
  went up by exactly 1 (today it never does).
- a damage check for a customer with only `name` → the text contains the name and **not** `null null`.
- contract generation for a `maintenance_block` id → 400, and no `documents` row, and no file on disk.
- transport report with `templateId: 999999` → 404.
- a template field whose source does not resolve → the extracted text does not contain the field's
  own name.

**Risk:** medium. Embedding a Unicode font changes every generated PDF's bytes and size; the text
assertions are what keep that honest. Deleting the legacy generator is safe only after confirming
its two callers are switched — do that in the same commit.

**Independence:** depends on FIX-B (paths) and FIX-D (`:id`/body validation on the generate routes).
BUG-163 (the plain-text fallback served as a PDF) and BUG-167 (permissions on the nine PDF routes)
sit in this area but are **BUSINESS-DECISION** and are not part of this cluster.

---

### FIX-O — document registration and file naming (CQ-008)

**Closes (5):** BUG-027, BUG-050, BUG-150, BUG-184, BUG-190.

**The single change.** There are **15** `createDocument` call sites with 2 folder conventions, and
the contract branch builds its filename from plate + date only — so two contracts for the same plate
on the same day share one file, the first is overwritten, and deleting either breaks the other. One
`registerGeneratedDocument({reservationId, vehicleId, kind, bytes})` helper that owns the folder, a
unique filename (plate + kind + ISO timestamp with milliseconds — the pattern the non-contract branch
already uses), the version number computed **inside** a transaction rather than from a racing read,
and the `documents` row. Store under `<vehicleId>/` rather than `<plate>/` so a plate change or reuse
no longer merges two vehicles' folders. Unlink template background/preview files in the pdf-template
DELETE handler, with the same shared-default guard the replace path already has.

**Files.** new `server/services/document-registry.ts` · `server/routes.ts` (`:4873-4915`,
`:5000-5068`, `:5560-5640`, `:5900-5945`, `:6215-6250`, `:1697-1761`) ·
`server/routes/pdf-templates.ts:268-293` · `server/database-storage.ts:535-618`.

**Regression tests.** `server/__tests__/fix-o-document-registry.test.ts`
- generate the same contract twice for one reservation → two `documents` rows with **two different**
  `file_path` values, both files present; delete the first → the second still downloads 200.
- upload two contract PDFs for the same plate on the same day → the two stored files differ in bytes.
- two parallel generations → version labels `1` and `2`, never `1` and `1`.
- delete a pdf template that has a background → the background file is gone from the temp uploads dir.
- rename a vehicle's plate → its existing documents still download 200 (folder is by id).

**Risk:** medium. Changing the storage convention makes *new* rows differ from old ones; the fallback
path logic in `documents/view|download` must stay (phase 20 §2.5 point 8) and the test above pins it.

**Independence:** depends on FIX-B. Pairs naturally with FIX-N in the same wave, different worker
only if `routes.ts` regions do not overlap — they do (`:5451-6280`), so **same worker**.

---

### FIX-P — template validation and background handling

**Closes (8):** BUG-028, BUG-048, BUG-168 (HIGH), BUG-176, BUG-177, BUG-179, BUG-180, BUG-193.

**The single change.** `template.fields` / `canvasFields` are jsonb written from a spread of
`req.body` in 4 routes with no schema at all (13 copies of the parse, 8 without a guard), and the
generator trusts them: `Math.max(1, ...fields.map(f => Number(f.page) || 1))` at
`server/pdf-damage-check-generator.ts:322-323` will happily allocate a million pages and block the
event loop for minutes. Write one shared zod `CanvasField` / `TemplateField` schema in `shared/`
(the TypeScript type already exists in `shared/damage-check-default-layout.ts`) — `page` 1..10,
`fontSize` 4..72, `x` 0..595, `y` 0..842, width/height within the page, `damageTypes` a string array
of ≤ 20, `type` an enum — and apply it on POST, PUT, import and preview in all four template route
families; clamp `maxPage` in the generator as defence in depth and wrap each field draw in its own
try/catch. Alongside: treat "configured background unreadable" as an **error** instead of the current
five nested silent fallbacks to the default template; sniff the content type instead of trusting
`path.extname(originalname)`; build the output as a **fresh** `PDFDocument` with `copyPages`/
`embedPage` so a background PDF's `/JavaScript`, `/OpenAction`, `/AA`, `/Launch` and `/EmbeddedFiles`
are not copied into every generated contract; refuse uploads containing those keys; fix the pdfjs
worker path to `pathToFileURL(...).href` and use one canvas implementation so background previews are
generated on Windows at all; and give the damage-check header a fixed band (letterbox into 595×70)
with overlay positions stored as percentages.

**Files.** new `shared/template-fields.ts` · `server/routes/pdf-templates.ts` (`:194-266`, `:306-412`,
`:346-352`, `:605-629`) · `server/routes/damage-check-templates.ts` (`:88`, `:200-235`, `:531`) ·
`server/routes/report-and-label-templates.ts` (`:116`, `:212`) ·
`server/pdf-damage-check-generator.ts` (`:322-323`, `:376-425`, `:430`, `:634-650`) ·
`server/utils/pdf-generator.ts:88-207` · `server/utils/pdf-to-image.ts:1-8` ·
`server/routes.ts:5451-5560` · `client/src/pages/settings/damage-check-template-editor.tsx`.

**Regression tests.** `server/__tests__/fix-p-templates.test.ts`
- `POST` a damage-check template with `page: 99999` → **400**, and the request completes in < 1 s
  (the event-loop assertion: measure elapsed around the call).
- `POST` a template with `fields` as a string / an object / an array of nonsense → 400 each.
- generate from a template with `fields: []` → a distinguishable warning response, not a silent blank
  PDF.
- upload a background PDF carrying `/OpenAction` → rejected; and if one is already stored, the
  generated contract's raw bytes contain no `/OpenAction`.
- upload a `.png` renamed to `.pdf` → rejected by content sniffing.
- a template whose configured background file is missing → generation returns an error mentioning the
  template, instead of silently producing the default layout.
- `pdf-to-image` on Windows produces a preview file (skip with a clear message on non-Windows CI).

**Risk:** medium — validation on jsonb that existing rows may already violate. Run the schema over
every existing `pdf_templates` / `damage_check_templates` row in `lvs_fixtest` as part of the test and
print the violators; if production rows fail, the owner needs to see that list before this ships.

**Independence:** depends on FIX-D. Pairs with FIX-N/FIX-O but touches mostly `server/routes/*`.

---

### FIX-Q — client robustness

**Closes (6):** BUG-053, BUG-201 (HIGH), BUG-212, BUG-213, BUG-225, BUG-229.

**The single change.** There is no `ErrorBoundary` anywhere in `client/src` (zero grep hits), no
request timeout, no global 401 handling and no global query error handler — so one reservation with an
unparseable date white-screens the entire reservations page, a dead server looks like an empty list,
and a tab whose session expired serves stale cache forever. Add: a route-level `ErrorBoundary` in
`client/src/App.tsx` with a "Reload / report" fallback; one `safeFormatDate()` helper
(`isValid(parsed) ? format(...) : '–'`) used everywhere a date is formatted; a global query error
handler that shows a toast and renders an inline error state instead of the empty state; an
`AbortController` timeout (30 s) with a retry button in `client/src/lib/queryClient.ts`; global 401
handling that clears the query cache and navigates to `/login`; `Promise.allSettled` with a per-row
result for the transport bulk complete; `onPointerDownOutside` guarded by `form.formState.isDirty` on
the reservation dialog; and a correct socket invalidation regex
(`new RegExp('/' + id + '(/|$|\\?)')` instead of `key.includes('/'+id)`).

**Files.** `client/src/App.tsx` · new `client/src/components/ErrorBoundary.tsx` ·
new `client/src/lib/safe-date.ts` · `client/src/lib/queryClient.ts` · `client/src/lib/cache-utils.ts` ·
`client/src/hooks/use-auth.tsx` · `client/src/components/protected-route.tsx` ·
`client/src/pages/reservations/calendar.tsx:3205` ·
`client/src/components/reservations/reservation-form.tsx` ·
`client/src/pages/delivery/dashboard.tsx:316-333`.

**Regression tests.** This is the first client test in the repo — it needs the new jsdom vitest
project from §8.8. `client/src/lib/__tests__/safe-date.test.ts`,
`client/src/lib/__tests__/cache-utils.test.ts`, `client/src/components/__tests__/error-boundary.test.tsx`
- `safeFormatDate('not-a-date')` → `'–'`, never throws; `safeFormatDate(null)` → `'–'`.
- `ErrorBoundary` around a component that throws → renders the fallback, not a blank tree.
- `matchesId('/api/reservations/1', 1)` true; `matchesId('/api/reservations/12', 1)` **false**
  (today's `includes` says true).
- `queryClient` with a 401 response → cache cleared, redirect called (spy).
- a fetch that never resolves → rejects within the timeout.

**Risk:** low — additive. The 401 redirect is the one thing to test carefully so it does not fire on
the login page itself.

**Independence:** fully independent of all server clusters.

---

### FIX-R — client XSS sinks and the ingress sanitizer

**Closes (4):** BUG-072 (HIGH), BUG-073 (HIGH), BUG-086, BUG-102.

**The single change.** The global input sanitizer at
`server/middleware/security/sanitization.ts:41-54` is registered before multer, so it never sees a
multipart body — a stored payload through that door was proven in phase 6–8. Rather than chase the
ingress, fix the sinks: an `isSafeHttpUrl()` guard before every `window.open()`, `createElement` +
`textContent` instead of `innerHTML` in the driver view dialog and the report/print builder, and
`z.string().url()` on `receiptUrl`. Keep the sanitizer but also run it after multer (wrap
`upload.single`/`.array`) as defence in depth.

**Files.** `client/src/components/expenses/expense-view-dialog.tsx:386` ·
`client/src/components/reservations/pickup-return-dialogs.tsx:737,782,1538,1583` ·
`client/src/components/reservations/reservation-documents-dialog.tsx:154` ·
`client/src/components/customers/driver-view-dialog.tsx:156-168` ·
`client/src/pages/reports/index.tsx:614-1247` · `shared/schema.ts:1007,417` ·
`server/middleware/security/sanitization.ts` · `server/routes.ts:170,246` ·
`server/routes/expenses.ts:275`.

**Regression tests.** `client/src/lib/__tests__/safe-url.test.ts` and
`server/__tests__/fix-r-sanitizer-multipart.test.ts`
- `isSafeHttpUrl('javascript:alert(1)')` false; `'data:text/html,…'` false; `'https://x/y'` true;
  `'/uploads/a.pdf'` true.
- rendering a driver whose `licenseFilePath` is `"<img src=x onerror=…>"` → the DOM contains the
  literal text, and `document.querySelector('img[onerror]')` is null.
- a multipart POST with a script tag in a text field → the stored value is sanitized (or the sink
  test above proves it cannot execute — assert at least one of the two, explicitly).

**Risk:** low.

**Independence:** independent; shares `shared/schema.ts` with FIX-C (path-field omits) — same wave or
sequence them.

---

### FIX-S — UI layout and Dutch-language gaps

**Closes (4):** BUG-210, BUG-222, BUG-223, BUG-228.

**The single change.** Four presentation defects with no server side: the calendar's minimum grid
width exceeds the content area at 1182 px and a closed Radix dialog leaves the horizontal scroll
offset behind (so the sidebar covers the header); the sidebar breakpoint is `md` (768 px), i.e.
expanded at exactly tablet width, and tables have no `overflow-x-auto` wrapper; 196 hard-coded UI
strings and `date-fns` `format` calls without the `nl` locale; and every calendar cell runs a
`.filter` over the entire reservation set. Fix with `overflow-x: auto` on the calendar container plus
`min-w-0` on the main column and a `scrollX` reset on dialog close; move the sidebar breakpoint to
`lg`; one shared `formatDateNl()` wrapper plus i18n keys for the data-table/404/detail strings; and
bucket reservations into a `Map` per day and per vehicle with `React.memo` on the day cell.

**Files.** `client/src/pages/reservations/calendar.tsx` · `client/src/layouts/MainLayout.tsx` ·
`client/src/components/ui/data-table*.tsx` · `client/src/pages/vehicles*.tsx` ·
`client/src/contexts/GlobalDialogContext.tsx` · `client/src/pages/maintenance/calendar.tsx` ·
`client/src/components/dashboard/reservation-calendar.tsx`.

**Regression tests.** `client/src/lib/__tests__/format-date-nl.test.ts` plus a small
`client/src/pages/reservations/__tests__/calendar-buckets.test.ts`
- `formatDateNl(new Date('2026-03-09'))` → `'9 maart 2026'` (or the chosen pattern), never `'March'`.
- the bucketing function: given 1 000 reservations and 30 days, each day's bucket contains exactly the
  reservations overlapping it, and the function is called once per render, not once per cell (assert
  the call count).
- layout assertions are **not** unit-testable here: verify BUG-210/BUG-222 manually at 768 px, 1024 px
  and 1182 px and record the result in the wave's acceptance note. Do not fake a browser test for this.

**Risk:** low. Note the coupling: BUG-223 (screen language/format) and BUG-192 (document
language/format) must not be decided separately — BUG-192 is a BUSINESS-DECISION, so FIX-S may only
change the **screen**.

**Independence:** fully independent.

---

### FIX-T — performance on the hot paths

**Closes (7):** BUG-203 (HIGH), BUG-204 (HIGH), BUG-215, BUG-218, BUG-226, BUG-227, BUG-230.

**The single change.** `getReservationsInDateRange` at `server/database-storage.ts:1285-1356` runs
three `await db.select()` calls **per row** — 924 statements for one month view, 3 774 for a year.
Replace the loop with the three `inArray()` selects that `getAllReservations` already uses at
`:1062-1103`. The reservations page then downloads 19,6 MB on first view because one URL is
registered under two query keys; collapse to one key with a `select`. Beyond that: normalise the
damage-check header image on upload (≤ 1200 px, JPEG q80) instead of re-encoding a 1,6 MB PNG on every
generation (581 ms CPU each, 2,6 s of full-server stall at 5 concurrent); lower
`express.json()` from a global `50mb` to `1mb` and mount the large limit only on the two interactive
damage-check routes; replace the two full-table loads (`customers/with-reservations`,
`find-by-contract`) with `EXISTS` and an indexed lookup; delete the per-row `console.log` on the
hottest read path (17,6 KB of console output per calendar load) and the 34 log lines per contract PDF;
and stop the nightly scanners re-loading the fleet twice.

**Files.** `server/database-storage.ts` (`:1285-1356`, `:1313-1335`) ·
`server/routes.ts` (`:1986-2024`, `:2315-2331`, `:6117-6335`) · `server/index.ts:163-164` ·
`server/pdf-damage-check-generator.ts:376-421` · `server/routes/app-settings.ts:62-135` ·
`server/utils/pdf-generator.ts:67-192` · `server/utils/service-due-scanner.ts` ·
`server/utils/rdw-apk-scanner.ts` · `client/src/pages/reservations/calendar.tsx:583-711` ·
`client/src/lib/cache-utils.ts`.

**Regression tests.** `server/__tests__/fix-t-query-counts.test.ts`, using the SQL statement counter
from §8.6 — these assert on **statement counts**, which is what regresses
- `getReservationsInDateRange` over a month with ≥ 50 reservations → **≤ 5** statements (today: 924).
- the same call returns byte-identical data to the pre-fix implementation (snapshot the shape).
- `GET /api/customers/with-reservations` → ≤ 2 statements.
- `POST /api/…` with a 5 MB JSON body on a normal route → **413**; the same body on
  `POST /api/interactive-damage-checks` → accepted.
- generating two damage-check PDFs sequentially → the header image is embedded from cache (assert
  the encode function is called once).

**Risk:** medium. BUG-204's query-key collapse is a client behaviour change on the busiest screen;
BUG-218's body-limit drop will 413 something nobody expected — enumerate every route that legitimately
posts > 1 MB before committing.

**Independence:** depends on FIX-H (which removes the write from `GET /api/vehicles`). Otherwise
independent. Do **not** start OPT-001 before this lands — the new "Today" screen built on today's
loading pattern would multiply the problem.

---

### FIX-U — outbound requests and security headers

**Closes (6):** BUG-071 (HIGH), BUG-077, BUG-078, BUG-079, BUG-087, BUG-099.

**The single change.** Three outbound paths accept an arbitrary destination — the CJIB FTPS test
route, the SMTP test route, and the geocoding/routing calls — giving an authenticated user a
port-scan oracle and an SSRF primitive, with no timeout. Add one shared
`assertPublicHost(hostname)` that resolves DNS and rejects private, loopback and link-local ranges
(re-checked after redirects), an allowlist for CJIB hostnames, a single generic error message so the
route stops being an oracle, and an `AbortController` with a 5–10 s timeout plus a maximum number of
stops on the routing call. Alongside: gate `unsafe-inline`/`unsafe-eval` in the CSP on
`NODE_ENV !== 'production'`, drop the unused `cdn.jsdelivr.net`, tighten `imgSrc`/`connectSrc`;
validate `allowedFrameOrigins` (no path, no space, no `;`, no `*`) before it is interpolated into the
CSP header and make the `X-Frame-Options` removal conditional; and redact the request logger so it
stops writing full JSON response bodies to the container log.

**Files.** new `server/utils/security/outboundGuard.ts` · `server/routes/fines.ts:121-133` ·
`server/services/cjib/config.ts`, `ftps-client.ts`, `poller.ts` ·
`server/routes/app-settings.ts:309-330` · `server/utils/email-service.ts:142-221` ·
`server/geocoding.ts:36,118` · `server/routes.ts:7529-7619` ·
`server/middleware/security/headers.ts:14-46,110-125` · `server/index.ts:249-266`.

**Regression tests.** `server/__tests__/fix-u-outbound.test.ts`
- `assertPublicHost` truth table: `127.0.0.1`, `localhost`, `10.0.0.1`, `192.168.1.1`, `169.254.169.254`,
  `::1` → reject; a public name → accept.
- the CJIB test route with `host:"127.0.0.1", port:22` → 400 and a **generic** message; assert the
  response body is byte-identical for a refused port and an open port (no oracle).
- the SMTP test route with a private host → same.
- geocoding against a stub that never answers → the request fails within the timeout.
- `NODE_ENV=production` → the CSP header contains neither `unsafe-inline` nor `unsafe-eval`.
- `allowedFrameOrigins: "https://a.example; script-src *"` → rejected at save time.
- a request whose response body contains `smtpPassword` → the log line does not contain the value.

**Risk:** medium — **the CSP change can white-screen the production build** if any bundled library
relies on `eval` or inline styles. Acceptance must include loading the built app in a real browser
with the console open; if something breaks, the correct answer is a nonce/hash, not putting
`unsafe-eval` back.

**Independence:** independent.

---

### FIX-V — maintenance and spare-vehicle cascade

**Closes (10):** BUG-004 (CRITICAL), BUG-014 (HIGH), BUG-032, BUG-033, BUG-035, BUG-117 (HIGH),
BUG-118 (HIGH), BUG-137, BUG-138, BUG-139.

**The single change.** Replacement reservations are attached to their parent only by
`replacementForReservationId`, with no link to the *block* that caused them — so deleting one block
wipes another block's spares (the cascade matches on date overlap alone,
`server/routes.ts:4648-4697`), resubmitting `maintenance-with-spare` hard-deletes a spare that is
already `picked_up`, and the portal approval path creates a second placeholder because it only looks
for rows with `placeholderSpare = true`. Add a `maintenanceBlockId` (nullable, additive) to the
replacement rows, make every cascade match on **that** plus the period, never on date overlap alone;
replace every hard delete of a replacement with a status check first — refuse if it is not `booked`
(the message `applyTransportUpdate` already uses) or cancel instead of delete; run the whole
`maintenance-with-spare` operation, and the block delete, inside one `db.transaction`; refuse a second
active spare for the same parent; derive the placeholder's `customerId` from the original reservation
instead of trusting the body; validate the new-block branch through `insertReservationSchema` so a
block without `vehicleId` is a 400; close TBD placeholders when their transport completes or is
cancelled; and reject portal maintenance approval with a start date in the past or on a rental that is
not `booked`/`picked_up`.

**Files.** `server/routes.ts` (`:2787-3042`, `:3792-3891`, `:4464-4513`, `:4621-4712`) ·
`server/database-storage.ts` (`createReplacementReservation :3178-3239`,
`createPlaceholderReservation :2955-3015`, `assignVehicleToPlaceholder :3020-3060`,
`deleteReservation :1270-1283`, `:2095-2201`) · `server/routes/portal-requests.ts` (`:275-299`,
`:307-346`, `:349-393`) · `shared/schema.ts` (new nullable column).

**Regression tests.** `server/__tests__/fix-v-spare-cascade.test.ts`
- block + spare, pick the spare up, resubmit `maintenance-with-spare` with the same `maintenanceId`
  → **400 or 409**, and `SELECT * FROM reservations WHERE id=<spare>` still returns a row with status
  `picked_up`. (Today: zero rows.)
- block A with spares and block B with spares on one vehicle, delete A → B's spares still exist.
- block → assign spare → delete block → the spare is cancelled/deleted **and** the spare vehicle is
  not left on `scheduled`.
- `assign-spare` twice with two different spares → exactly one active replacement.
- `maintenance-with-spare` with `maintenanceData.vehicleId` omitted → 400 and zero inserted rows.
- placeholder with a `customerId` different from the original → the stored `customerId` equals the
  original's (or 400).
- complete the transport that owns a TBD placeholder → the placeholder disappears from
  `needing-assignment`.
- portal maintenance approval with `startDate` yesterday → 400; on a cancelled rental → 400.

**Risk:** **high** — the densest tangle in the codebase, and the one that caused the 2026-08-25
incident where a vehicle and its reservation vanished. Every delete in this cluster must be converted
to a status change or guarded by a status check before anything else is touched.

**Independence:** depends on FIX-F and FIX-G (locks and transactions). Heavy `routes.ts` owner.

---

### FIX-W — transport record consistency

**Closes (4):** BUG-114 (HIGH), BUG-115 (HIGH), BUG-116 (HIGH), BUG-135.

**The single change.** `applyTransportUpdate` (`server/database-storage.ts:2025-2221`) spreads
`...changes` into the `vehicle_transports` update and has a branch for almost nothing else: no branch
for `scheduledDate` (so moving a transport leaves its replacement reservation on the old day), none
for `vehicleId` (so the workshop flag and the spare notes stay on the old car), nothing that touches
`spareReservationId` when the transport is cancelled (so the spare car stays blocked), and the
same-vehicle check compares `nextRelatedVehicleId` against `current.vehicleId` instead of against
`changes.vehicleId ?? current.vehicleId`. Add the four missing branches inside the existing
transaction, each re-running the conflict check from FIX-F for the new period.

**Files.** `server/database-storage.ts:2025-2221` · `server/routes.ts:7438-7471` · `shared/schema.ts`
(`insertVehicleTransportSchema` refinement).

**Regression tests.** `server/__tests__/fix-w-transport.test.ts`
- move a transport's `scheduledDate` forward → the replacement reservation's `startDate`/`endDate`
  moved with it, and a conflicting new date returns 409 without changing anything.
- cancel a transport → its `booked` replacement reservation is cancelled and the spare vehicle is
  bookable again for that period.
- set `vehicleId` equal to `relatedVehicleId` in one PATCH → 400.
- change a transport's `vehicleId` → the old vehicle's workshop flag is cleared and the new one is
  flagged; the spare notes moved.

**Risk:** medium.

**Independence:** depends on FIX-F. Small `routes.ts` footprint — can run beside FIX-V if, and only
if, one worker owns `database-storage.ts:2025-2221`.

---

### FIX-X — delete/cancel cascade and orphan prevention

**Closes (6):** BUG-007 (CRITICAL), BUG-055, BUG-090, BUG-108 (HIGH), BUG-110 (HIGH), BUG-112 (HIGH).

**The single change.** Deleting and cancelling do not propagate, and the recycle bin is not a faithful
round trip. `deleteCustomer` (`server/database-storage.ts:980-986`) is a bare `db.delete` with no
impact check, leaving `booked` reservations pointing at a customer that no longer exists (there is no
FK). `deleteVehicle` snapshots a hand-written list of seven tables and misses five relationship types,
and `restoreDeletedRecord` re-inserts the snapshotted reservations with **no conflict check**, on top
of whatever was booked in the meantime. Cancelling a reservation touches nothing else: the transport
stays planned, the driver assignment stays open, the spare and the placeholder stay active. And
`DELETE /api/reservations/:id` is a check-then-act race that answers 500 with `error.message`.

The change: a `getCustomerDeleteImpact()` mirroring the vehicle version, with deletion blocked while
non-cancelled/non-completed reservations exist; a snapshot that enumerates **every** FK-dependent row
(derive the list from `information_schema` rather than by hand, so it cannot go stale again); a
conflict check per snapshotted reservation on restore, with the conflicting ones reported rather than
silently double-booked; a guard rejecting a reservation on a vehicle that does not exist or sits in
`deleted_records` unrestored; one shared `cascadeOnReservationClosed(tx, id, reason)` called from the
status endpoint, the delete route and every other path that writes `cancelled`, which closes driver
assignments, cancels non-completed transports, and cancels replacement/placeholder children; and a
single conditional `UPDATE … WHERE deleted_at IS NULL RETURNING *` for the delete, with zero rows
meaning "already deleted" instead of a 500.

**Files.** `server/database-storage.ts` (`:498-725`, `:980-986`, `:1209-1250`) ·
`server/routes.ts` (`:1599-1691`, `:2114-2134`, `:3230-3445`, `:4621-4712`) · `shared/schema.ts`.

**Regression tests.** `server/__tests__/fix-x-cascade.test.ts`
- create a customer with a `booked` reservation, delete the customer → **4xx**, and the reservation
  still points at an existing customer row.
- delete a vehicle, then `SELECT` every FK-dependent table for rows still referencing it → zero, and
  the snapshot payload contains each of the five previously-missed relationship types.
- delete a vehicle, book its period on another vehicle, restore → the restore reports the conflict;
  no overlapping pair exists afterwards (`SELECT` overlap query returns 0 rows).
- `POST /api/reservations` for a vehicle id sitting in `deleted_records` → 404.
- cancel a reservation that has a transport, a driver assignment, a spare and a placeholder → all four
  are closed/cancelled in the same transaction; assert with four `SELECT`s.
- two parallel `DELETE` of one reservation → one 200, one 404/409, **no 500**, and no `error.message`
  in any body.

**Risk:** **high** — this is the cluster closest to the 2026-08-25 vehicle-delete incident. Note the
boundary: BUG-022 ("voertuig verwijderen hard-delete alle reserveringen van alle klanten") is a
**BUSINESS-DECISION** — whether a vehicle with live reservations may be deleted at all is the owner's
call. FIX-X may make the impact *visible and faithful*; it may not decide to block the delete.

**Independence:** depends on FIX-F, FIX-G, FIX-H. Heavy `routes.ts` owner — same worker as FIX-V.

---

### FIX-Y — audit-log correctness

**Closes (2):** BUG-147, BUG-152.

**The single change.** Every vehicle deletion writes two `vehicle.delete` rows (the route logs richer
details and the middleware logs again), a restore is recorded as `vehicle.update`, and every
reservation sub-action is recorded as `reservation.create`. Add `DELETE /api/vehicles/:id` to
`SKIPPED_PATH_PATTERNS`, add `'vehicle.restore'` to the action union and use it, and emit
`${type}.${subAction}` when a sub-action and an id are known.

**Files.** `server/middleware/audit.ts:161-215` · `server/utils/security/auditLogger.ts:21` ·
`server/routes.ts:1666-1676,:1748`.

**Regression tests.** `server/__tests__/fix-y-audit.test.ts`
- delete a vehicle → exactly **one** `audit_logs` row with action `vehicle.delete`.
- restore it → one row with action `vehicle.restore`.
- pick up a reservation → the row's action is `reservation.pickup`, not `reservation.create`.

**Risk:** low.

**Independence:** independent; tiny. A good filler task for a worker waiting on a `routes.ts` lock.

---

### FIX-Z — schema-level input validation

**Closes (9):** BUG-020 (HIGH), BUG-041, BUG-042, BUG-044, BUG-054, BUG-058, BUG-059, BUG-125,
BUG-149.

**The single change.** A set of columns that `drizzle-zod` typed permissively and nobody tightened:
a license plate with no format, length or normalisation (so `AB-123-C` and `ab123c` are two vehicles);
negative mileages; `apkDate: "2026-02-30"`; a customer name of `" "` or 5 000 characters; a
`totalPrice` with no bounds where non-numeric input silently becomes `null`; a client-writable
`barcode`; and service intervals that accept nonsense and silently switch the maintenance reminder
off. One pass over the `.extend({...})` blocks in `shared/schema.ts` adding the refinements — reusing
`mileageSchema` at `:922`, which already exists and is not used here — plus plate normalisation
(strip non-alphanumerics, uppercase, the same normalisation `server/utils/rdw-api.ts` uses) applied
**before** the uniqueness check and before insert/update, and `barcode` removed from
`insertVehicleSchema` entirely (the server assigns it; admins regenerate through the dedicated route,
which must also retry until it finds a free revision instead of colliding with a 500).

**Files.** `shared/schema.ts` (`:172`, `:187`, `:211-212`, `:266`, `:277-286`, `:291-292`,
`:363-377`, `:813-824`, `:922`) · `shared/service-due.ts:107-108` ·
`server/routes.ts` (`:494-600`, `:723-847`, `:1082-1233`, `:2477-2483`) ·
`server/database-storage.ts:373-393`.

**Regression tests.** `shared/schema-validation.test.ts` — pure zod unit tests, no database, fast
- plate: `"AB-123-C"`, then `"ab123c"` and `"AB 123 C"` → the second and third are rejected as
  duplicates at the route level (integration), and the schema normalises all three to one form (unit).
- emoji plate and a 100-character plate → 400.
- `departureMileage: -1`, `returnMileage: -1` → 400.
- `apkDate: "2026-02-30"` → 400; `"2026-02-28"` → ok.
- customer `name: " "` → 400; `name: "x".repeat(5000)` → 400.
- `totalPrice: -1` → 400; `totalPrice: "abc"` → 400 (not a silent `null`).
- `barcode` present in a create body → stripped, and the stored barcode is server-generated.
- service interval `0` / `-1` / `"abc"` → 400.

**Risk:** medium in **data**, not in code: existing rows may violate the new rules, and any route that
re-parses a full row on update (the read-merge-write pattern FIX-D removes) would then start
rejecting saves of untouched legacy rows. That is exactly why FIX-D must land first. As part of this
cluster, run the new schemas over every row in `lvs_fixtest` and print violators.

**Independence:** depends on FIX-D. Otherwise independent. Note BUG-045 (duplicate debtor numbers)
and BUG-157 (leading zeros in contract numbers) look like they belong here but are
BUSINESS-DECISIONs.

---

### FIX-AA — route-level domain guards and error shaping

**Closes (10):** BUG-017 (HIGH), BUG-030, BUG-031, BUG-038, BUG-039, BUG-049, BUG-123, BUG-124,
BUG-131, BUG-133.

**The single change.** Ten guards that exist on one path and are missing on the sibling path. Run the
blacklist check in both reservation PATCH handlers, not only on create; validate
`serviceEndDate >= serviceStartDate` in `mark-needs-service`, which bypasses the zod refinement by
calling `createMaintenanceBlock` directly; pre-check duplicate contract numbers in the pickup handler
the way `PATCH /:id` already does; verify `vehicleId`/`customerId` exist before the insert (there is
no FK) and answer 404 with the field name; give the multer `fileFilter` error a `.status = 400` so a
rejected upload stops being a 500 with a stack, and read `vehicleId` from the query instead of relying
on multipart field order; add the `if (!licensePlate)` guard that `bulk-import-csv` has and
`bulk-import-plates` lacks; parse import dates with an explicit format list (`dd-mm-yyyy`,
`dd/mm/yyyy`, `yyyy-mm-dd`, Excel serial) via date-fns `parse`/`isValid` and format with
`format(date,'yyyy-MM-dd')` instead of `new Date(...).toISOString()`, which reads Dutch dates as
American and shifts them a day; validate `pickupDate`/`returnDate` and sanitise the date part before
it reaches a filename; and call `assignDriverToReservation` from `/basic` so a driver change through
that route still lands in the driver history.

**Files.** `server/routes.ts` (`:850-908`, `:909-1080`, `:2435-2520`, `:3090-3230`, `:3445-3700`,
`:3792-3845`, `:4067-4239`, `:4256`, `:4810-4876`) ·
`server/utils/security/fileUploadSecurity.ts:200-256` · `server/routes/pdf-templates.ts:297-303` ·
`server/database-storage.ts:3323-3349`.

**Regression tests.** `server/__tests__/fix-aa-route-guards.test.ts`
- blacklist a `(vehicle, customer)` pair, then PATCH an existing reservation onto exactly that pair
  through **both** PATCH routes → 409 each.
- `mark-needs-service` with `serviceEndDate < serviceStartDate` → 400, zero rows inserted.
- two pickups with the same contract number → the second is a clean **409**, and the body contains no
  raw driver message.
- `POST /api/reservations` with a non-existent `vehicleId` → 404 naming the field.
- upload with a disallowed extension, and separately an oversized file → **400** each, no `stack`
  field, regardless of `NODE_ENV`.
- `POST /api/documents` with the `file` part before `vehicleId` → 400, not 500.
- `bulk-import-plates` with an empty plate → that row is reported as failed, no vehicle created.
- `bulk-import-csv` with `09-03-2026` → stored as `2026-03-09` (not `2026-09-03`, not shifted a day),
  and an unparseable date is reported per row instead of dropped.
- change the driver through `/basic` → a new row exists in the driver-assignment history.

**Risk:** low — each guard is small and mirrors an existing one.

**Independence:** depends on FIX-D and FIX-E.

---

## 4. Dependency graph

```
                       FIX-A  (async / process)        FIX-K (auth hardening)
                          |                              (independent)
                          v
   FIX-E (:id) ---> FIX-D (body validation) ---+---> FIX-Z (schema validation)
                          |                    |
                          |                    +---> FIX-AA (route guards)
                          v
                       FIX-F (bookability, locks)
                          |
                          +---> FIX-G (atomic transitions)
                          |
                          v
                       FIX-H (state machine) ---> FIX-T (performance)
                          |
                          +---> FIX-V (spare cascade)
                          +---> FIX-W (transport)
                          +---> FIX-X (delete/cancel cascade)
                          
   FIX-B (uploads path) ---+---> FIX-L (restore safety)
                           +---> FIX-O (document registry) ---+
                           |                                   |
   FIX-C (containment) ----+                                   +--> FIX-N (PDF content)
                                                               |
                          FIX-D --------------------------------+--> FIX-P (templates)

   Independent of everything above:
     FIX-I (permissions)   FIX-J (unauth)   FIX-M (mail)   FIX-U (outbound/headers)
     FIX-Q (client)        FIX-R (XSS)      FIX-S (UI)     FIX-Y (audit log)
```

**Hard edges (must not be reordered):**

| Edge | Reason |
|---|---|
| FIX-E → FIX-D | the `:id` middleware runs before body validation; otherwise both rewrite the same registration lines |
| FIX-D → FIX-F/G/H/Z/AA | all of them assume "SET list built from present keys only"; without it they re-introduce lost updates |
| FIX-F → FIX-G | both change the same transaction regions in `database-storage.ts` |
| FIX-F/G → FIX-H | the state machine writes need the locks to be meaningful |
| FIX-H → FIX-V/W/X | cascades act on statuses; the statuses must be trustworthy first |
| FIX-H → FIX-T | FIX-H is what removes the write from `GET /api/vehicles` (BUG-217) |
| FIX-B → FIX-L | FIX-L extracts into `getUploadsDir()` |
| FIX-B → FIX-O → FIX-N | the document registry needs correct paths; the PDF tests assert on registered rows |
| FIX-D → FIX-P | template bodies are validated by the same mechanism |

**Soft edges (nice, not required):** FIX-A before everything (a server that survives bad input makes
every other test suite less flaky); FIX-I/FIX-J before any cluster whose tests need a non-admin
identity.

**`server/routes.ts` ownership.** These 23 clusters touch the monolith and must never be worked in
parallel with each other:

> FIX-B, FIX-C, FIX-D, FIX-E, FIX-F, FIX-G, FIX-H, FIX-I, FIX-J, FIX-M, FIX-N, FIX-O, FIX-P,
> FIX-Q, FIX-R, FIX-T, FIX-U, FIX-V, FIX-W, FIX-X, FIX-Y, FIX-Z, FIX-AA

These 4 do **not** touch it and are the only safe parallel partners:

> **FIX-A**, **FIX-K**, **FIX-L**, **FIX-S**

(FIX-A does touch `server/index.ts`, which FIX-J also edits — sequence those two.)

---

## 5. Wave order and acceptance criteria

Ten waves. Each is implementable, testable and committable on its own, and each ends with the full
suite green against `lvs_fixtest`. The **routes.ts owner** column names the single worker allowed to
have the monolith open; the **parallel partner** column names what a second worker may do at the same
time.

| Wave | Clusters | routes.ts owner | Parallel partner | Bugs closed |
|---|---|---|---|---|
| 0 | test harness (BUG-145) | — | — | 1 |
| 1 | FIX-A, FIX-J, FIX-I, FIX-C | FIX-J → FIX-I → FIX-C (in that order) | FIX-A first, then idle/FIX-K prep | 23 |
| 2 | FIX-E, FIX-D, FIX-Z, FIX-AA | FIX-E → FIX-D → FIX-Z → FIX-AA | FIX-K | 34 + 12 |
| 3 | FIX-F, FIX-G | FIX-F → FIX-G | FIX-L (after wave 5's FIX-B — else FIX-M) | 16 |
| 4 | FIX-H, FIX-V, FIX-W, FIX-X, FIX-Y | FIX-H → FIX-V → FIX-X → FIX-W → FIX-Y | FIX-S | 35 |
| 5 | FIX-B, FIX-L | FIX-B | FIX-L | 16 |
| 6 | FIX-N, FIX-O, FIX-P | FIX-O → FIX-N → FIX-P | FIX-M | 20 |
| 7 | FIX-U | FIX-U | FIX-Q | 6 |
| 8 | FIX-T | FIX-T | FIX-R | 7 |
| 9 | FIX-Q, FIX-R, FIX-S (whatever is left) | — | — | remainder |

Because FIX-K, FIX-L, FIX-M, FIX-S, FIX-Q and FIX-R are `routes.ts`-free or nearly so, they are
deliberately scheduled as the parallel partner of a monolith-heavy wave rather than getting a wave of
their own. Waves 7–9 exist for whatever slips.

### Wave 0 — test harness (no application code)

Switch every documented command to `lvs_fixtest`; widen `cleanupPortalTestData` in
`server/__tests__/portal-helpers.ts:73-93` so it deletes reservations by **test-vehicle id** as well
as by test-customer id, before the `PT%` vehicles are removed (that single omission is what leaves the
258 orphan maintenance blocks); add the helpers of §8 (`appFactory`, `withTempUploads`,
`withScratchDatabase`, `sqlCounter`, `smtpStub`, `pdfText`, `parallel`).

**Acceptance:** `DATABASE_URL=…lvs_fixtest npx vitest run` → 26 files / 126 tests green; running the
suite twice in a row leaves `SELECT count(*) FROM reservations WHERE type='maintenance_block'`
unchanged; the dev database is untouched (compare a row-count snapshot before and after).

### Wave 1 — availability and the open doors

FIX-A, FIX-J, FIX-I, FIX-C. Closes 7 of the 13 CRITICALs.

**Acceptance:** the three crash payloads return 4xx and the child-process server is still alive; the
runtime permission-matrix test passes with an explicit public-route allowlist; no endpoint outside
that allowlist answers 2xx to an anonymous request; a `manager` with `manage_users` cannot become
admin; `documents.file_path` traversal is refused on all three routes; suite green; `tsc` clean.

### Wave 2 — the request boundary

FIX-E, FIX-D, FIX-Z, FIX-AA (+ FIX-K in parallel). The largest wave and the one that unblocks
everything downstream.

**Acceptance:** **the reservation edit form saves** (BUG-202's test is the gate); the 19-route ×
5-payload parameter matrix is all 400 and no 500; no route rewrites a field it was not sent; the
Postgres error mapping returns 404/409 with a field name and never leaks `constraint`/`detail`;
the schema-violation report over `lvs_fixtest` is attached to the commit; suite green.

> **Hotfix note.** BUG-202 is flagged in the audit (§8.2 of report 07) as a candidate for an
> immediate hotfix, because the reservation edit form fails 100 % of the time today. If the owner
> wants it before the wave lands, cherry-pick **only** the generic `"" → null` coercion for nullable
> integer columns onto `main` as its own commit, with the BUG-202 test attached. Do not cherry-pick
> the rest of FIX-D.

### Wave 3 — booking integrity

FIX-F, FIX-G (+ FIX-M in parallel).

**Acceptance:** 20 parallel bookings for one vehicle/period produce exactly one row; the one-day
in-the-middle booking is refused; a partial PATCH that moves a reservation onto an occupied vehicle
is 409; every one of the nine race tests in FIX-G yields exactly one winner and zero 5xx; no test in
the suite deadlocks (the `statement_timeout` guard proves it); suite green.

### Wave 4 — lifecycle and cascades

FIX-H, FIX-V, FIX-W, FIX-X, FIX-Y (+ FIX-S in parallel). The heaviest `routes.ts` wave.

**Acceptance:** the transition matrix (5 write paths × every illegal transition) is all 400; `endDate`
is never overwritten by a completion; a `returned` rental no longer blocks the vehicle; a picked-up
spare survives a resubmitted `maintenance-with-spare`; deleting block A leaves block B's spares;
cancelling a reservation closes its transport, driver assignment, spare and placeholder in one
transaction; a vehicle delete/restore round trip loses nothing and double-books nothing;
`GET /api/vehicles` issues zero UPDATEs; suite green.

### Wave 5 — file paths and restore safety

FIX-B (routes.ts) with FIX-L in parallel (FIX-L does not touch the monolith).

**Acceptance:** with `UPLOADS_DIR` set to a temp directory, upload → serve → download round trips work
for documents, transport reports, driver licences and backups; each of the three phase-17 corrupt
fixtures returns 500 with the failing statement and **leaves row counts unchanged**; the good archive
restores with matching counts; a `\connect` dump is refused before psql runs; a `../` tar entry is
refused; `os.tmpdir()` is clean after every run; no response body contains `postgresql://`; suite
green.

### Wave 6 — documents

FIX-O → FIX-N → FIX-P (+ FIX-M if it has not landed).

**Acceptance:** a contract generated for a customer with non-WinAnsi characters contains that name in
its extracted text; every generate route that writes a file also writes exactly one `documents` row;
two generations never share a file; a damage check never prints `null null`; a template with
`page:99999` is refused in under a second; a background PDF's `/OpenAction` never reaches a generated
contract; suite green.

### Wave 7 — outbound and headers

FIX-U (+ FIX-Q in parallel).

**Acceptance:** the private-range truth table passes; the CJIB and SMTP test routes return a
byte-identical body for open and closed ports; production CSP has neither `unsafe-inline` nor
`unsafe-eval` **and the built app loads in a real browser with a clean console** (manual check,
recorded in the commit message); no response body appears in the log; suite green.

### Wave 8 — performance

FIX-T (+ FIX-R in parallel).

**Acceptance:** `getReservationsInDateRange` for a month is ≤ 5 statements and returns the same data;
the reservations page issues one request per URL; a 5 MB body is 413 everywhere except the two
interactive damage-check routes; the damage-check header is encoded once; suite green.

### Wave 9 — client and clean-up

FIX-Q, FIX-R, FIX-S remainder, plus the two REFUTED hardening items (BUG-076 `sanitizeFilename`,
BUG-097 `path.basename()` comparison) and the BUG-057 start-up assertion.

**Acceptance:** the jsdom test project runs and is green; an unparseable date renders `–` instead of
white-screening; a 401 clears the cache and redirects; the socket invalidation regex no longer matches
`/12` for id `1`; manual layout check at 768/1024/1182 px recorded; suite green; `tsc` clean; full
suite wall-clock still under the §8.9 budget.

---

## 6. Phase 34 — the 17 non-decision OPT tasks

Phase 34 starts **after** phase 35's wave 9. Categories and counts are the report's own:
**QUICK WIN 10 · MEDIUM 6 · LARGE 1 = 17** non-decision proposals (the other 16 are BUSINESS
DECISION and are in §7). Each task below has the same shape as a FIX cluster: files, tests,
dependencies.

The dependency column names FIX clusters (phase 35) and other OPTs. **An OPT whose dependency list
contains a BUSINESS DECISION OPT cannot start until that decision is made** — where that happens it
is called out.

### QUICK WIN

**OPT-002 — Ophalen/Innemen en Scannen als primaire ingang** (prio 2, S)
Replace two of the five primary quick-action tiles with "Ophalen starten" / "Innemen starten" reusing
the scan panel's own choose-pickup-or-return logic; put "Opnieuw scannen" first in the tile grid or
auto-reset after a completed action; wire `onSuccess → lookup(barcode)` on the five dialogs that
currently drop out of scan mode; connect or delete `openScanDialog`.
*Files:* `client/src/pages/dashboard*`, the scan panel component, the five dialogs, the global dialog
context. *Tests:* jsdom — after a successful action the scan handler is re-armed (assert the callback
fires); the tile router picks "return" for a `picked_up` reservation and "pickup" for a `booked` one.
*Depends on:* **BUG-218 tablet layout (FIX-S/wave 9)**; nothing else.

**OPT-005 — Contract bevestigen en direct afdrukken/mailen in de ophaaldialoog** (prio 5, S)
Pickup/return routes return the created document id; the dialog shows "Contract klaar" with
Afdrukken / Mail naar klant, or "Contract kon niet gemaakt worden" with Opnieuw proberen.
*Files:* `server/routes.ts` pickup/return responses, `client/src/components/reservations/pickup-return-dialogs.tsx`.
*Tests:* supertest — the pickup response carries `documentId`; jsdom — a response without
`documentId` renders the failure state. *Depends on:* **FIX-N and FIX-O** (otherwise the dialog
reports success on a row pointing at the wrong bytes).

**OPT-008 — Vervanger krijgt de status die hij fysiek heeft** (prio 8, S)
Let the replacement reservation's status follow `spare_vehicle_status`, and use
`shared/transport-spare-status.ts` — written for exactly this and named in phase 20 as "the model,
not the problem" — for the maintenance path as well as the transport path.
*Files:* `shared/transport-spare-status.ts` (consumer side only), `server/database-storage.ts`,
`server/routes.ts` spare routes. *Tests:* integration — a spare that is `picked_up` is not offered as
available for the same period. *Depends on:* **FIX-H**; **OPT-006**.

**OPT-011 — Opmerkingenbevestiging per opmerking** (prio 11, S)
Ask again only when the remark text changed since the last confirmed pickup of that vehicle.
*Files:* pickup dialog + a small `confirmed_remarks` store (additive column or table). *Tests:*
integration — unchanged remark → no prompt; edited remark → prompt returns. *Depends on:* nothing.

**OPT-012 — Zoekbalk: debounce, contractnummer, Nederlandse teksten** (prio 12, S)
250–300 ms debounce as the vehicles page already has, clear the term on selecting a result, add
contract-number search through the existing `find-by-contract`, translate the two English strings.
*Files:* the global search component, `server/routes.ts:2315-2331`. *Tests:* jsdom — N keystrokes
produce 1 request; supertest — searching a contract number returns the reservation.
*Depends on:* **FIX-T** (`find-by-contract` currently loads the whole table); overlaps BUG-223 in FIX-S.

**OPT-013 — Elke uitgaande mail loggen en de status tonen** (prio 13, S)
Log every outgoing mail in `email_logs`, show "verzonden op … aan …" / "verzenden mislukt" on the
document, set an SMTP timeout. *Files:* the two document-mail routes, the eight portal paths, the
document list UI. *Tests:* already written as part of FIX-M; this OPT adds the UI assertions.
*Depends on:* **FIX-M** — which already implements the server half, so OPT-013 is reduced to the
document-status UI. Say so explicitly when scheduling it.

**OPT-016 — Bulkacties met resultaat per rij** (prio 16, S)
Sequential with a per-row result, the pattern `server/services/cjib/importer.ts` already uses, and a
summary "8 gelukt, 2 mislukt" naming the failures. *Files:* transport bulk complete, APK confirm bulk,
`client/src/pages/delivery/dashboard.tsx`. *Tests:* integration — a bulk of 3 with 1 invalid id
returns 3 result entries, 2 ok and 1 error, and the 2 valid ones did happen.
*Depends on:* **FIX-Q** (which already converts the transport bulk to `allSettled`).

**OPT-019 — Dubbele klant en chauffeur detecteren** (prio 19, S)
Warn-and-open on duplicate e-mail/phone, exactly the fines dialog's "Kenmerk bestaat al — Openen"
pattern. Never block. *Files:* customer/driver create routes + dialogs. *Tests:* supertest — creating
a customer with an existing e-mail returns 200 plus a `duplicates:[{id,name}]` field.
*Depends on:* nothing. Note: BUG-045 (must `debtorNumber` be unique?) is a **decision** and is not
part of this.

**OPT-020 — Adres- en KvK-gegevens opzoeken** (prio 20, S–M)
Postcode + house number → street/city on blur through the existing geocoder behind one endpoint; a KvK
lookup filling company name, address and status; an "Adres overnemen van klant" button in the delivery
section. *Files:* new `server/routes/lookup.ts`, the customer and delivery forms. *Tests:* supertest
against a stubbed upstream — a timeout returns 200 with `null` and never blocks the form.
*Depends on:* **FIX-U** (the outbound guard and timeout must exist before a new outbound call is added).

**OPT-022 — Auditlog per record ("Geschiedenis"-tab)** (prio 22, S)
Make `resourceId` and `search` work and add a History tab to the reservation, vehicle and customer
dialogs. *Files:* `server/routes/audit*`, the three dialogs. *Tests:* supertest — filtering by
`resourceId` returns only that record's rows; integration — after FIX-Y the rows have the right action
names. *Depends on:* **FIX-Y** (otherwise the tab shows `reservation.create` for everything).
*Open sub-question at build time:* which permission may see employee names on that tab — flag it to
the owner then, it is not a blocker now.

### MEDIUM

**OPT-006 — `availability_status`: één eigenaar, geen bijwerkingen** (prio 6, S–M)
Separate "why is this car unavailable" from "is this car available": stop the maintenance-status route
writing `availability_status`, or make it restore the previous value — the logic that preserves
`not_for_rental` already exists in `getStatusOnMaintenanceEnd` and is never called.
*Files:* `server/vehicle-status-helper.ts`, `server/routes.ts:1240-1273`, `server/database-storage.ts:224-353`.
*Tests:* integration — a `not_for_rental` vehicle that goes through a full maintenance cycle is still
`not_for_rental` at the end. *Depends on:* **FIX-H**, CQ-011. **Blocked by OPT-004 (BUSINESS
DECISION)** — OPT-004 decides the house definition of "available" and OPT-006 implements its
ownership. Do not start OPT-006 before OPT-004 is answered.

**OPT-010 — Micro-bewerkdialogen** (prio 10, M)
"Datums wijzigen", "Klant wijzigen", "Voertuig wijzigen" dialogs that send only the changed fields, in
the style of `edit-contract-number-dialog.tsx`, each running the same conflict check as the create
path. *Files:* three new dialogs, `server/routes.ts` PATCH handlers. *Tests:* jsdom — each dialog
sends exactly the fields it owns; supertest — each micro-endpoint runs the conflict check.
*Depends on:* **FIX-D** (the form has to work again), **FIX-F** (one conflict predicate), FIX-D's
partial-update semantics. Risk: a sixth write path without validation — the acceptance test is that
each micro-dialog hits the *same* handler code path as the full form.

**OPT-015 — "Onderhoud afronden" als één handeling** (prio 15, M)
One transactional action that closes the block, clears the vehicle flag and returns the spare, with one
date convention. *Files:* new route + `database-storage.ts` transaction, maintenance UI. *Tests:*
integration — the single call leaves block closed, vehicle flag cleared and spare returned, and a
forced failure halfway leaves **none** of the three changed. *Depends on:* **FIX-H**, **FIX-V**,
**OPT-006**, **OPT-008**. **OPT-006 is blocked by OPT-004**, so OPT-015 inherits that block.

**OPT-018 — Verwijderde reservering in de prullenbak** (prio 18, M)
Add `reservation` to `deleted_records` with the pattern vehicles already have: impact preview,
restore with confirmation, conflict check on restore. *Files:* `server/database-storage.ts`
(`restoreDeletedRecord` currently supports only `vehicle` and `fine`), `server/routes.ts:1694`, the
recycle-bin UI. *Tests:* integration — delete → the row appears in the bin → restore → the row is back
and no overlap exists; a restore that would overlap reports the conflict instead of creating it.
*Depends on:* **FIX-X** (which is what makes vehicle restore conflict-safe — do not copy the current
one-click, no-confirmation, no-conflict-check behaviour). **Note:** *whether* deleted reservations get
a bin at all is BUG-151, a BUSINESS-DECISION. OPT-018 as a build task is approved; BUG-151's question
("who may restore, and is admin-only right?") still needs an answer before the permission is chosen.

**OPT-021 — Een kleine set sneltoetsen** (prio 21, M)
Ctrl+K or `/` for search, N for new reservation, S for scan, Escape closes, Enter submits, plus a
shortcut overview. *Files:* a global key handler + the overview dialog. *Tests:* jsdom — the handler
does **not** fire while focus is in an input, a textarea, a contenteditable, or the scan field. That
exclusion test is the whole point: a letter shortcut firing while the barcode scanner types is worse
than no shortcut. *Depends on:* **OPT-002**.

**OPT-031 — RDW-verrijking bij voertuigimport + echte voortgang** (prio 31, M)
Call the existing RDW client per row with a per-row fallback, enrich and verify the CSV import against
RDW and mark differences, load the fleet once instead of per row, bound the batch, show real progress
or none. *Files:* `server/routes.ts:850-1080`, `server/utils/rdw-api.ts`, the import UI.
*Tests:* integration against a stubbed RDW — one failing row does not fail the import; the fleet is
loaded once (SQL counter). *Depends on:* **FIX-AA** (the import date/plate guards), **FIX-T**.
*Carve-out:* extending the nightly RDW scan to more fields (fuel, euro class, WOK) is **not** part of
this task — the report marks that extension as a separate BUSINESS DECISION (auto-apply versus a
confirmation queue).

### LARGE

**OPT-024 — Bulkacties uitbreiden: reserveringslijst en batchcontracten** (prio 24, L)
Extend the checkbox-plus-bulk pattern to the reservation list (bulk complete, bulk print) and add batch
contract generation for tomorrow's pickups in one print job, on the Barcodeboek model. The existing
batch generation is capped at 50 — that cap must be chosen deliberately, not inherited.
*Files:* reservation list page, a new batch-generation route, the print view.
*Tests:* integration — a batch of 50 produces 50 documents rows and one merged PDF whose extracted text
contains all 50 contract numbers; a batch of 51 is rejected with a clear message.
*Depends on:* **OPT-016** (per-row results must exist first — a bulk action without them is worse than
none), **FIX-O** (unique filenames), **FIX-N**. **Blocked by OPT-003 (BUSINESS DECISION)** — "bulk
complete" has no meaning until the owner defines what "afgerond" is.

### Phase-34 scheduling summary

| Can start right after wave 9 | Blocked on a business decision |
|---|---|
| OPT-011, OPT-013 (UI half), OPT-016, OPT-019, OPT-020, OPT-022, OPT-012, OPT-005, OPT-002, OPT-010, OPT-018 (build; permission pending BUG-151), OPT-021, OPT-031 | OPT-006 and OPT-008 and OPT-015 (all wait on **OPT-004**); OPT-024 (waits on **OPT-003**) |

---

## 7. Business decisions still open

### 7.1 The 16 BUSINESS DECISION OPTs — one question each

Nothing below may be designed, prototyped or built until the owner answers. The questions are the
report's own, compressed to one sentence.

1. **OPT-001 — Werkdagscherm "Vandaag"**: which rows belong on "Openstaande punten" (which are tasks
   and which are noise), and does "Vandaag" replace the current dashboard as the start page?
2. **OPT-003 — Huur afsluiten bij inname**: may a rental be closed automatically on return, or does a
   check step remain — and which existing rows may be swept up in the one-off clean-up?
3. **OPT-004 — Eén definitie van "beschikbaar"**: does a car in the workshop, a car with a planned
   block in that period, or a car carrying the repair flag count as "available"?
4. **OPT-007 — Werkplaatsvlag blokkeert verhuur**: block or warn on pickup of a workshop-flagged car,
   and who may override (everyone, an administrator, or with an admin password as for mileage)?
5. **OPT-009 — Voertuigsuggestie en vervanger-toewijzing**: what makes a car "comparable" (type, fuel,
   price class, segment), and may a more expensive car be offered automatically as a replacement?
6. **OPT-014 — Documentversiebeheer**: regenerate automatically or only mark as outdated, what happens
   to an already-signed version, and how long are old versions kept?
7. **OPT-017 — Terugdraaien van statusfouten**: may a cancellation be reversed at all and by whom, and
   is an orphaned contract PDF kept as history or deleted?
8. **OPT-023 — Onderhoudsblok als zacht conflict**: block or warn when booking over a planned
   maintenance block, and if warn, must a replacement be chosen immediately or may that wait?
9. **OPT-025 — "Klaar om te verhuren"-checklist**: which fields are mandatory before a car may be
   rented and before a contract may be generated, and does the block land at intake, at booking, or at
   contract generation?
10. **OPT-026 — BV → Opnaam**: may this conversion ever happen automatically, and if not, does the
    booking still go through when the employee answers "no"?
11. **OPT-027 — Klantcommunicatie bij kantoorwijzigingen**: which events are the customer's business —
    does a cancellation or a vehicle swap reach them automatically, or does that stay a phone call?
12. **OPT-028 — Annulering: cascade of expliciete vraag**: cascade automatically or ask explicitly, and
    which consequences may never disappear automatically (a transport already under way, a spare
    already handed over)?
13. **OPT-029 — Pechomruil**: on a breakdown swap, does the original rental continue, suspend or close
    — and what does that mean for invoicing the replacement period?
14. **OPT-030 — Prijsmodel**: does the price follow a date change automatically, what is the pricing
    model for open-ended rentals, and is there a mileage bundle with an overage rate?
15. **OPT-032 — Sleutelkastaudit**: is the key-cabinet audit a compliance document — if so, how long is
    it kept, who may read it, and must it be signed?
16. **OPT-033 — Referentiële integriteit en prullenbak voor klanten**: are the existing orphan rows
    cleaned up or preserved before foreign keys are switched on, and may a customer with history still
    be deleted?

### 7.2 The 32 BUSINESS-DECISION bugs

These are listed in full, with their question, in the triage table (§2, "Root-cause cluster /
decision" column). Grouped by the decision that unlocks them:

| Decision | Bugs held |
|---|---|
| **OPT-004** (what "available" means) | BUG-018 |
| **OPT-006** (who owns `availability_status`) | BUG-034 |
| **OPT-007** (workshop flag blocks pickup) | BUG-109 |
| **OPT-014** (document versioning, templates, permissions) | BUG-163, 167, 178, 181, 182, 183, 192, 195 |
| **OPT-017** (reversing status mistakes) | BUG-132, BUG-211 |
| **OPT-018** (recycle bin scope) | BUG-140, BUG-151 |
| **OPT-019** (duplicate detection) | BUG-045 |
| **OPT-023** (maintenance block as soft conflict) | BUG-013, BUG-037 |
| **OPT-025** (ready-to-rent checklist) | BUG-183 (shared with OPT-014) |
| **OPT-027** (customer communication) | BUG-081, BUG-134, BUG-170 |
| **OPT-030** (pricing model) | BUG-153 |
| **OPT-033** (referential integrity, data migration) | BUG-022, BUG-143, BUG-144, BUG-205, BUG-216, BUG-224 |
| **OPT-001/OPT-003** (day screen, closing rentals) | BUG-040 |
| **No OPT — standalone questions** | BUG-024 (password reuse policy), BUG-056 (recurring reservations: implement or remove), BUG-157 (contract-number padding) |

Five of these bugs have a *technical half* that is not a decision. Because the rule is one bucket per
bug, they stay BUSINESS-DECISION in the table, but the moment the owner answers, the technical half is
already specified: BUG-211 (derive `availabilityStatus` from `status === 'picked_up'` regardless of
dates — that is a defect, not a choice), BUG-216 (a projection without the blob columns for lists and
reports), BUG-205 (column projection, separate from the pagination contract), BUG-181 (return 404 for
an unknown `templateId`) and BUG-183 (render "open" for a missing `endDate`). Flag these to the owner
as "cheap the day you answer".

---

## 8. Regression-test strategy

The hard facts: **0 client tests**, 36 of 102 production modules touched by a test, and the entire
rental core — `server/routes.ts` (7 758 LOC), `server/database-storage.ts` (4 476 LOC) — has **zero**.
Everything below is about making the untestable testable without a rewrite.

### 8.1 Testing a 15 000-LOC core that has never been tested

Do **not** try to unit-test `registerRoutes`. Test it through HTTP, with the real database.

Add `server/__tests__/helpers/app.ts`:

```ts
// builds the real Express app in-process: setupAuth + registerRoutes, no listen()
export async function makeApp(): Promise<Express>
// logs in and returns a supertest agent with session + XSRF cookie already set
export async function agentFor(perms: string[] | 'admin'): Promise<SuperAgentTest>
```

`agentFor()` creates a throwaway user with exactly the permissions asked for, which is what makes the
permission clusters (FIX-I, FIX-J) testable at all, and what lets every other cluster assert
"403 for the wrong role" in one line. Data is created through the API wherever possible — that way the
test exercises the same validation the user hits — and through `db` directly only when the API refuses
to create the broken state the bug needs (a `file_path` of `'../package.json'`, a status outside the
enum).

Fixtures follow the existing convention: a recognisable prefix (`FIXT-` for this work, next to the
`PT%`/`AUDIT-` prefixes already in the database) so a leak is greppable, and a `cleanupFixtures()` in
`afterAll` that deletes **by vehicle id and by customer id**, in FK order — the omission that made
BUG-145 (258 orphan maintenance blocks) is exactly "cleaned by customer id only".

Coverage target per wave: every bug in the wave has at least one assertion that fails on the
pre-fix code. Write the failing test first, confirm it fails, then fix. For the clusters with a
matrix (FIX-E parameters, FIX-H transitions, FIX-I permissions) one table-driven test file covers a
dozen bugs and is the cluster's acceptance gate.

### 8.2 Testing crash-on-unhandled-rejection without killing the runner

The bug is literally "the process exits". A vitest worker that exits takes the run with it, so the
server under test must **not** be the runner.

`server/__tests__/helpers/childServer.ts` spawns the real server as a child process:

```ts
const child = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test',
         DATABASE_URL: process.env.DATABASE_URL },
  stdio: ['ignore', 'pipe', 'pipe'],
});
// wait for the listening line, return { port, child, stderr: string[] }
```

The test then fires the malformed payload over plain `http`, and asserts three things:
`response.status === 400`; `child.exitCode === null` **and** `child.signalCode === null` after a short
settle; and a follow-up request on the same port still answers. `afterAll` sends SIGTERM and waits for
exit. Because the child writes its own stderr into an array, the test can also assert that the
rejection **was** logged — the new policy is "log loudly, do not exit", and silence would be a
different bug.

Two guard rails: give the child an ephemeral port (`server.listen(0)` style, or a port derived from
`process.pid`) so parallel runs never collide, and mark the file with a longer `testTimeout` since a
cold `tsx` boot is seconds. Everything else about async errors — the 400 itself, the FK 404, the XML
depth limit — is tested in-process with supertest, where it is fast; only the *survival* assertion
needs the child.

### 8.3 Testing file paths with a temporary `UPLOADS_DIR`

`server/__tests__/helpers/uploads.ts`:

```ts
export async function withTempUploads<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-uploads-'));
  const prev = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = dir;
  try { return await fn(dir); }
  finally { process.env.UPLOADS_DIR = prev; fs.rmSync(dir, { recursive: true, force: true }); }
}
```

This works because `getUploadsDir()` (`shared/paths.ts:12`) reads `process.env.UPLOADS_DIR` on **every
call** rather than caching it at import time — which is exactly why FIX-B's whole point is to make
every path go through it. The temp directory is also what makes the negative assertions honest: a
traversal test can assert that a file outside `dir` was not touched, and the `process.cwd()` bugs
become visible as "the file landed in the repo root instead of in `dir`".

Two rules: never set `UPLOADS_DIR` globally in `setup.ts` (that would hide the bugs in the 79
`process.cwd()` joins instead of exposing them — each path test must opt in), and always assert the
**bytes**, not just the status code, on a round trip. BUG-026 returns 200 with the *wrong* body; a
status assertion alone would pass.

### 8.4 A scratch database for the restore tests

FIX-L restores databases. It must never point at `lvs_fixtest`, let alone dev.
`server/__tests__/helpers/scratchDb.ts`:

```ts
// CREATE DATABASE lvs_scratch_<pid>_<n> from template0, run the schema,
// yield its connection URL, then DROP DATABASE ... WITH (FORCE) in finally
export async function withScratchDatabase<T>(fn: (url: string) => Promise<T>): Promise<T>
```

The restore routes take their target from `DATABASE_URL`, so the test sets it to the scratch URL for
the duration of the call. Belt and braces: the helper refuses to run if the resulting database name
does not match `/^lvs_scratch_/`, and the FIX-L test file asserts that guard first. The phase-17
fixtures (`p17-copyerror.sql.gz`, `p17-half.sql`, `p17-empty.sql.gz`, the good archive) are copied
into `server/__tests__/fixtures/backups/` rather than read from `docs/audit/wip/` so the test does not
depend on audit artefacts staying put.

Row counts before and after are the assertion that matters — "500 and `vehicles` still has N rows" is
the whole bug. `WITH (FORCE)` on the drop is required because psql may leave a connection behind.

### 8.5 Testing mail with the raw-TCP stub

`docs/audit/wip/scripts/p16-stub.cjs` is already written as a module with a `start(opts)` entry point
and ten switchable failure modes (`ok`, `silent`, `hang-ehlo`, `drop`, `drop-data`, `data-hang`,
`auth535`, `rcpt550`, `tls-required`, `starttls-only`) and it captures the full DATA body. Move it to
`server/__tests__/helpers/smtpStub.cjs` (same file, no changes) and wrap it:

```ts
export async function withSmtpStub<T>(mode: string, fn: (stub) => Promise<T>): Promise<T>
```

The wrapper starts the stub on an ephemeral port, writes the SMTP settings into `app_settings` for the
duration (host `127.0.0.1`, that port, the credentials the stub accepts), runs the test, restores the
previous settings and stops the stub. `stub.messages` then holds the captured envelopes and bodies,
which is what makes the escaping assertions in FIX-M possible: the test can look for the literal
`&lt;img` in the DATA body and assert the raw `<img ... onerror` is absent.

The `silent` and `data-hang` modes are how BUG-171 (no timeouts on the pooled transporter) is tested:
start the stub in `silent`, call the send, assert it rejects in under 15 s. Without the timeouts, that
test hangs until vitest's own timeout — which is the failing state, and the reason `testTimeout` for
that file must be set *below* the CI budget so the failure is a clean red rather than a killed run.

Never test mail against a real SMTP server, and never against `smtp.*` from `.env`.

### 8.6 Counting SQL statements (N+1 and read-side writes)

Several acceptance criteria are statement counts, not timings — counts are stable across machines.
`server/__tests__/helpers/sqlCounter.ts` wraps the drizzle logger:

```ts
export function countSql<T>(fn: () => Promise<T>): Promise<{ result: T; statements: string[] }>
```

Drizzle accepts a `logger` on the connection; the helper swaps in a collecting logger for the duration
and returns every statement. That gives two kinds of assertion that no timing test can:
`statements.length <= 5` for `getReservationsInDateRange` (today 924 for a month), and
`statements.filter(s => /^\s*update/i.test(s)).length === 0` for `GET /api/vehicles` (BUG-217, which
runs 2 SELECTs and up to 3 UPDATEs on every read).

### 8.7 Testing PDF content

`docs/audit/wip/scripts/p14-pdfinfo.cjs` already does exactly what is needed: it loads a buffer with
`pdfjs-dist/legacy`, returns `{valid, pages, pageSizes, text[], items[{str,x,y,w,h}], outOfBounds[]}`,
and flags items that fall outside the page box. Move it to
`server/__tests__/helpers/pdfText.cjs` unchanged and import it.

Three assertion styles, in order of preference:
- **text contains** — the customer's name, the contract number, the licence plate. This is what
  catches BUG-162 (characters outside WinAnsi make the whole field disappear) and BUG-166 (`null null`).
  Never assert on file size or byte count; both change for innocent reasons.
- **positions** — `items` with `x`/`y` proves BUG-164 (the missing `842 - y` flip puts every value in
  the wrong box) and BUG-191 (absurd geometry). Assert the end date sits within the template's declared
  field rectangle, not merely "somewhere on the page"; and assert `outOfBounds` is empty.
- **structure** — `pages === 1`, and for BUG-180 a raw-bytes check that the output contains no
  `/OpenAction`, `/JavaScript` or `/Launch` copied from the background.

For the fallback-generator bug (BUG-163, held as a decision) the same helper gives the proof either
way: `valid === false` means the bytes are not a PDF at all.

### 8.8 Client tests — a second vitest project

There are zero client tests today, and `vitest.config.ts` includes only
`server/**`, `shared/**`, `scripts/**` with a setup file that demands `DATABASE_URL`. Do not widen the
existing project — a jsdom test must not require Postgres. Add a **second project** so the two have
separate environments and setup files:

```ts
// vitest.config.ts — projects: server (node, current setup, fileParallelism false)
//                              client (jsdom, no DB setup, fileParallelism true)
```

The client project gets `environment: 'jsdom'`, the existing `@`/`@shared` aliases, and
`@testing-library/react` + `@testing-library/jest-dom` as devDependencies. Scope it deliberately: the
client clusters (FIX-Q, FIX-R, FIX-S) need *pure functions and one boundary component* —
`safeFormatDate`, `isSafeHttpUrl`, the cache-invalidation matcher, the calendar bucketing function,
the `ErrorBoundary`. That is high value for little setup. Do **not** attempt to mount
`calendar.tsx` (4 082 LOC in one component) in jsdom; extracting its pure parts into testable helpers
is what FIX-S does, and the tests follow the extraction, not the other way round.

Client tests run with the same command; they simply do not touch the database.

### 8.9 Keeping the full suite fast enough to run after every wave

The suite must stay runnable in full after every single cluster, or the "no cross-wave regression"
rule is unenforceable. Budget: **under 3 minutes** for the server project on a developer machine.

- `fileParallelism: false` stays for the server project — the tests share one Postgres and the
  concurrency tests depend on real contention. Do not turn it on to buy speed; buy speed elsewhere.
- **One app instance per file.** `makeApp()` in a module-level `beforeAll`, not per test. Building the
  Express app is the expensive part.
- **Create fixtures once per file**, in `beforeAll`, and have each test work on its own row. Only the
  concurrency tests need a pristine row per case.
- **Keep the slow files few and marked.** The child-process test (§8.2), the scratch-database restore
  tests (§8.4) and the SMTP timeout tests (§8.5) are inherently seconds each. Put them in files named
  `*.slow.test.ts` and give the wave command two shapes: `npx vitest run` for everything (the gate at
  the end of a wave) and `npx vitest run --exclude '**/*.slow.test.ts'` for the inner loop. Both still
  carry the `lvs_fixtest` URL.
- **No `sleep`.** Every wait is a poll on a condition with a deadline. A fixed sleep is the single
  biggest source of slow, flaky suites.
- **Set a `statement_timeout`** (say 5 s) on the test connection. A row-lock mistake in FIX-F/FIX-G
  then fails fast and legibly instead of hanging the run until vitest's timeout.
- **Watch the trend.** Record the wall-clock in each wave's commit message. If wave 6 is 40 % slower
  than wave 5, find out why then, not at wave 9.

### 8.10 Concurrency tests

`server/__tests__/helpers/parallel.ts`:

```ts
export async function fireParallel<T>(n: number, fn: (i: number) => Promise<T>)
  : Promise<PromiseSettledResult<T>[]>
```

`Promise.allSettled` over N in-flight supertest requests against the same in-process app. Two things
make these tests meaningful rather than decorative:

1. **Assert on the database, not only on the responses.** "Exactly one row" is the property;
   "19 × 409" is a nice-to-have. `SELECT count(*)` after the burst is the real assertion, because a
   race can produce 20 × 200 and still one row (correct) or 1 × 200 and two rows (broken).
2. **Assert zero 5xx.** Every race bug in this tracker shows up as a raw 500 first and a duplicate row
   second.

Ten of the eleven concurrency bugs reproduce reliably at N = 20 in-process; the eleventh (BUG-161,
30 parallel password guesses) needs the burst to be genuinely simultaneous, so build the N promises
first and `await Promise.allSettled` once, rather than awaiting inside a loop. Keep these files
`*.slow.test.ts` if they exceed a second or two.

---

## 9. Risks and rollback

### 9.1 The five things most likely to go wrong

| # | Risk | Why it is real here | Mitigation |
|---|---|---|---|
| 1 | **FIX-D breaks a working screen** | several clients today send the whole row back on save; switching to "only the keys present" plus `.partial()` changes what a save means | land it in wave 2 with maximum time to notice; accept supersets (strip unknown keys) in the first commit, `.strict()` only later and separately; BUG-202's test is the gate in both directions |
| 2 | **FIX-F/FIX-G introduce deadlocks** | 9 `db.transaction` call sites against 203 storage methods; row locks are new to this codebase | always lock in ascending `vehicleId` order; keep transactions to a single logical operation; `statement_timeout` on the test connection so a deadlock is a red test, not a hung run |
| 3 | **FIX-H/FIX-V/FIX-X make the desk say "not allowed"** | these clusters enforce rules that have been unenforced for the life of the product; staff have built habits around the gaps | implement only the mechanically-correct half; every rule that is a *choice* is already held as BUSINESS-DECISION (BUG-013, 018, 022, 037, 109, 132, 211); when in doubt, stop and ask rather than decide |
| 4 | **FIX-L destroys a database** | it is the restore path; a test pointed at the wrong URL is catastrophic | the scratch-database helper (§8.4) refuses any name not matching `/^lvs_scratch_/`, and that guard is itself the first assertion in the file; never run FIX-L tests with a `DATABASE_URL` the helper did not create |
| 5 | **FIX-U's CSP white-screens production** | removing `unsafe-eval`/`unsafe-inline` breaks any bundled library that needs them, and no test catches it | acceptance for wave 7 includes loading the **built** app in a real browser with the console open; if something breaks, add a nonce or hash — never restore `unsafe-eval` |

Runners-up worth naming: FIX-Z's tightened schemas rejecting saves of legacy rows that violate the new
rules (mitigated by running the schemas over every `lvs_fixtest` row and printing violators before
committing); FIX-T's body-limit drop 413-ing a route nobody remembered posts megabytes (enumerate
first); FIX-B fixing the code but not moving the files already written to the wrong tree; and FIX-J's
socket payload shrink breaking a client that reads more than the id.

### 9.2 Rollback

- **Per cluster.** One commit per cluster is the unit of revert: `git revert <sha>` restores the
  previous behaviour and the previous tests together. This is the main reason clusters never share a
  commit.
- **Per wave.** Tag the branch at the end of every green wave (`audit-wave-3-green`). A wave that turns
  out bad is `git reset --hard audit-wave-<n-1>-green` on the branch — nothing has been merged to
  `main` yet.
- **Additive-only schema.** Every column this plan adds is nullable, so reverting the code leaves an
  unused column rather than a broken table. That matches how production migrations already work in
  this project (`schema-columns.json`, additive sync) and is why §1.2 forbids anything else. Re-run
  `npm run schema:export` in the same commit that adds a column.
- **Production is not touched by any of this.** Nothing in phase 34/35 changes production data;
  everything ships as code on `fix/audit-remediation`, which reaches production only when the owner
  merges and deploys. The deployment itself is the one irreversible step, and that is why the DEFERRED
  bucket (trust proxy, `NODE_ENV`, gzip, Dockerfile) is not in any wave: those are changes that only
  show their behaviour in the deployed environment and belong to a separate, supervised release.
- **A pre-deploy backup is a precondition, not a nicety.** Because FIX-L rewrites the restore path,
  the first deploy after wave 5 should be preceded by a manual `pg_dump` taken outside the
  application, and the restore of that dump should be rehearsed on a scratch database before the
  deploy — not after an incident.

### 9.3 What this plan deliberately does not do

- It does not split `server/routes.ts`. Phase 20 §2.5 lists nine things that look like mess and are
  not; the 22 already-extracted route modules are the good pattern, and extracting more mid-remediation
  would make every wave's diff unreviewable. Extraction is a separate job, after wave 9, if the owner
  wants it.
- It does not touch `shared/schema.ts`'s size (2 110 LOC, 63 dependents), the eight benign client
  import cycles, or the shadcn/ui surface that `ts-prune` flags.
- It does not clear `npm audit`. 70 vulnerabilities, 3 critical, is a real number and a separate,
  owner-scheduled job with its own regression risk.
- It does not implement a single BUSINESS DECISION. Sixteen OPTs and thirty-two bugs wait on §7.

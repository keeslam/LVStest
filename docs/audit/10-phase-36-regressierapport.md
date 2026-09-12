# Fase 36 — Volledig regressierapport

**Datum:** 2026-09-12 · **Tak:** `fix/audit-remediation` (75 commits boven `main`) ·
**Server:** `http://127.0.0.1:5003` · **Database:** `lvs_regress` · **Opdracht:** verifiëren, niet repareren.

Dit rapport controleert of de fixes uit fase 34 en 35 doen wat ze beloven. Het draait de
reproducties uit de audit zelf opnieuw tegen de gerepareerde code en noteert per bug wat er
gebeurde. Er is in deze fase **geen applicatiecode gewijzigd**; `git status` toont alleen de
onbewaakte map `docs/audit/wip/scripts/p36/` met de testscripts en hun uitvoer.

---

## 1. Methode en omgeving

### 1.1 Wat er draaide

| Onderdeel | Waarde |
|---|---|
| Applicatie | `http://127.0.0.1:5003`, tak `fix/audit-remediation` |
| Uitvoermodus | **`NODE_ENV=development`** (bevestigd: procesketen `cross-env NODE_ENV=development tsx server/index.ts`, PID 20456) |
| Database | `lvs_regress` — verse kloon van de ontwikkelkloon `lvstest` (499 voertuigen / 1806 reserveringen), gemigreerd met `startup-migration.js` |
| Uploadsmap | `C:\Users\kees lam\Desktop\LVStest-main\regress-uploads` |
| Back-upmap | `C:\Users\kees lam\Desktop\LVStest-main\regress-backups` |
| Inloggen | `admin` / `admin123`; daarnaast het eigen testaccount `audit-p36w` en de portaalgebruiker `portaal-test@example.com` (klant 179) |
| Draaitijd | De server is de hele fase **niet één keer herstart**: `/health` liep monotoon door van `uptime 158 s` bij aanvang tot `uptime 2755 s` na de laatste hersteltest. |

**De ontwikkelmodus is belangrijk voor drie uitspraken in dit rapport** en wordt daar telkens
genoemd: (a) een onbekende `/api/…`-route valt door naar de SPA en geeft **200 met HTML** in plaats
van 404 JSON — de 404-afhandelaar in `server/index.ts:450-453` zit in de productietak die alleen
draait als er een gebouwde `public/`-map is; (b) foutantwoorden dragen een stacktrace
(`server/index.ts:476-481`, bewust `NODE_ENV`-gebonden — dit is BUG-057); (c) prestatiecijfers zijn
gemeten op `tsx` zonder productiebundel. De sprong van een dev- naar een productie-uitvoering is
dus nog niet gemeten en hoort in een aparte controle vóór uitrol.

### 1.2 Hoe er gemeten is

- **Reproducties.** Voor elke bug zijn de velden *Reproduction* en *Regression test* uit het eigen
  trackerrapport (`docs/audit/03-…` t/m `07-…`) uitgelezen naar
  `docs/audit/wip/scripts/p36/bugindex.json` (alle 230 gevonden, geen gaten) en opnieuw uitgevoerd.
- **Werkwijze.** Echte HTTP-verzoeken via `docs/audit/wip/scripts/p36/lib.cjs` (cookies en CSRF
  automatisch), echte SQL tegen `lvs_regress`, echte bestanden in de uploads- en back-upmap, echte
  gegenereerde PDF's (tekst uitgelezen met `pdfjs-dist`). Bestaande auditscripts (`p9-*` … `p19-*`)
  zijn **gekopieerd** naar `p36/` en op poort 5003 gericht; de originelen zijn niet aangeraakt.
- **Verdeling.** Vijf parallelle controleurs, elk met een eigen bugbereik en een eigen
  fixture-voorvoegsel (`AUDIT-P36A` … `AUDIT-P36E`); de werkstroomdoorloop, de metingen, de
  opschoningsscripts en de proceskill-tests zijn door de leider zelf gedaan (`AUDIT-P36W`).
- **Codeinspectie** is toegestaan waar een runtime-reproductie onmogelijk of onverantwoord was
  (bijvoorbeeld een herstel dat de repository zou overschrijven). Dat staat dan letterlijk in het
  bewijs als `code-inspectie`, met bestand en regelnummer.

### 1.3 Woordenboek van de oordelen

| Oordeel | Betekenis |
|---|---|
| **FIXED** | De beschreven reproductie geeft nu het beschreven verwachte resultaat. |
| **NOT FIXED** | De reproductie geeft nog steeds het oude, kapotte resultaat — of de belofte is maar gedeeltelijk waargemaakt. |
| **CHANGED BY DECISION** | Het gedrag wijkt bewust af, volgens een vastgelegd eigenaarsbesluit uit `besluiten.md`; het B-nummer staat erbij. |
| **NOT APPLICABLE** | Weerlegd, alleen-ontwikkelomgeving, of door het plan uitgesteld; er viel niets te repareren. |
| **NIET VASTGESTELD** | Niet te reproduceren, in geen van beide richtingen. Dit is nadrukkelijk **geen** "opgelost". |

### 1.4 Wat de meting kon vertroebelen — en wat daaraan gedaan is

- **Gedeelde limieten.** De nieuwe verzoeklimiet telt **per gebruiker** (1000 per 15 minuten,
  `server/middleware/security/rateLimiter.ts:24-37`), en de inloglimiet **per IP** (5 mislukte
  pogingen per 15 minuten). Vijf gelijktijdige controleurs op één account liepen daar tegenaan.
  Dat is de fix van BUG-074/BUG-009 die werkt, niet een storing — maar het betekende wel dat er
  eigen testaccounts aangemaakt moesten worden en dat sommige metingen herhaald zijn in een stille
  periode. Waar een meting in een drukke periode viel, staat dat erbij.
- **Ruis bij het tellen van SQL.** De statementtelling is gedaan met de methode van fase 19
  (`log_min_duration_statement = 0`, tellen van `statement:`/`execute`-regels), met per endpoint
  drie herhalingen waarvan het **minimum** is genomen; vervuiling kan alleen optellen. De
  Postgres-instelling is daarna exact teruggezet (`-1`, `log_line_prefix = '%t '`).
- **Fixtures.** Alles wat is aangemaakt draagt een `AUDIT-P36`-voorvoegsel. Dat is zichtbaar in de
  cijfers: de rijaantallen in de metingen liggen hoger dan de 499/1806 waarmee de kloon begon.

---

## 2. Uitkomst in één oogopslag

| Oordeel | Aantal | Aandeel |
|---|---|---|
| **FIXED** | **171** | 74,3 % |
| **NOT FIXED** | **42** | 18,3 % |
| **CHANGED BY DECISION** | **12** | 5,2 % |
| **NOT APPLICABLE** | **5** | 2,2 % |
| **NIET VASTGESTELD** | **0** | 0 % |
| Totaal | 230 | |

Per zwaarte:

| Zwaarte | FIXED | NOT FIXED | CHANGED BY DECISION | NOT APPLICABLE |
|---|---|---|---|---|
| **CRITICAL** (13) | **13** | 0 | 0 | 0 |
| **HIGH** (64) | 50 | 9 | 5 | 0 |
| **MEDIUM** (94) | 67 | 18 | 6 | 3 |
| **LOW** (59) | 41 | 15 | 1 | 2 |

**Alle dertien CRITICAL-bugs zijn dicht en runtime bevestigd.** Dat is het belangrijkste cijfer in
dit rapport. Daaronder wordt het beeld gemengder: van de 64 HIGH-bugs staan er negen nog open,
waarvan er twee — BUG-069 en BUG-070 — beveiligingsgaten zijn die het plan als gesloten opvoert.

Er is **geen enkele bug die niet vastgesteld kon worden**: elk van de 230 reproducties gaf een
eenduidige uitkomst in de ene of de andere richting.

### 2.1 De eenheidstests als los signaal

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run
```

**119 testbestanden / 893 tests, alle groen, afsluitcode 0**, looptijd 531 s. De opdracht noemde
116 bestanden / 850 tests als stand vóór de laatste twee commits; de suite is dus met 3 bestanden
en 43 tests gegroeid en nergens roder geworden.

Let wel: een groene eenheidstestsuite en dit rapport meten niet hetzelfde. Van de 42 bugs die
hieronder NOT FIXED heten, zijn er meerdere waarvoor wél een test bestaat die groen is — die test
dekt dan de helft van de bug die is opgelost. BUG-192 is daar het scherpste voorbeeld van.

### 2.2 De twee proceskill-bugs, apart bewezen

Dit was de zwaarste klasse in de audit: één verzoek dat het hele Node-proces uitzette, waarna de
applicatie 15-20 s onbereikbaar was voor iedereen.

| Bug | Lading | Antwoord | Uptime ervoor → erna | Daarna nog een gewoon verzoek |
|---|---|---|---|---|
| **BUG-061** | `GET /api/portal-admin/customers/999999999/settings` | **404** `{"message":"Customer not found"}` | 332,8 s → 333,1 s (**doorgelopen**) | `GET /api/vehicles` → 200 |
| **BUG-002** | `POST /api/portal/requests` met `payload:"not-json-at-all"` | **400** `{"error":"payload is not valid JSON","code":"PORTAL_VALIDATION"}` | 373,1 s → 373,9 s (**doorgelopen**) | `GET /api/portal/me` → 200, `GET /api/vehicles` → 200 |
| **BUG-101** | 19 600 022 B XML, 2,8 miljoen niveaus diep | **400** | 776,35 s → 776,54 s (**doorgelopen**) | `GET /health` → 200 |

Script: `p36-killcheck.cjs`. De uptime is de sluitende maat: een herstart zet hem terug op nul.
Hij liep gedurende de hele fase monotoon door, van 158 s bij aanvang tot 2 755 s na de laatste
hersteltest — **geen enkele herstart**, ook niet na duizenden verzoeken van vijf gelijktijdige
controleurs, drie DoS-ladingen, een databaseherstel en een reeks corrupte archieven.

---

## 3. Resultaten per bug

Eén regel per bug, alle 230. De volledige reproductie per bug staat in de logboeken onder
`docs/audit/wip/scripts/p36/` (`results-A.jsonl` … `results-E.jsonl`, met de probescripts ernaast).

| BUG | Sev | Verdict | Bewijs |
|---|---|---|---|
| BUG-001 | CRITICAL | FIXED | manager id=7 met permissie manage_users: POST /api/users {role:"admin"} -> 403 "Only an administrator can create an administrator account"; PATCH /api/users/7 … |
| BUG-002 | CRITICAL | FIXED | POST /api/portal/requests {payload:"not-json-at-all"} als portaal-test@example.com -> 400 {"error":"payload is not valid JSON","code":"PORTAL_VALIDATION"}; dir… |
| BUG-003 | CRITICAL | FIXED | Verse cookie jar zonder login (XSRF-TOKEN wel verkregen via GET /): POST /api/expenses/with-receipt -> 401, GET /api/expenses/1/receipt -> 401, PATCH /api/expe… |
| BUG-004 | CRITICAL | FIXED | maintenance-with-spare blok 3293 + vervanger 3294, vervanger opgehaald (200, status picked_up); tweede maintenance-with-spare met maintenanceId=3293 en een and… |
| BUG-005 | CRITICAL | FIXED | socket.io-client zonder cookie naar 127.0.0.1:5003 -> connect_error "unauthorized", 0 events ontvangen terwijl een admin intussen voertuigen aanmaakte; met ses… |
| BUG-006 | CRITICAL | FIXED | 20 gelijktijdige POST /api/reservations (raw http, keepAlive:false, identiek bereik op voertuig 1790) -> {"201":1,"409":19}, de 19 met {"code":"CONFLICT"}. |
| BUG-007 | CRITICAL | FIXED | besluiten B-08: klant 1254 met booked reservering 3226 -> GET /api/customers/1254/delete-impact geeft blocked:true + blockingReservations[3226]; DELETE /api/cu… |
| BUG-008 | HIGH | FIXED | 5+ mislukte logins op een wegwerpaccount -> 429 {"message":"Account temporarily locked ... try again in 15 minute(s)","remainingTime":899} (was 135 minuten / 8… |
| BUG-009 | HIGH | NOT FIXED | 10 opeenvolgende POST /api/login met telkens een andere gespoofte X-Forwarded-For (gewone IPv4, ::ffff:127.0.0.1, multi-hop "127.0.0.1, 203.0.113.5") en 10 ver… |
| BUG-010 | HIGH | FIXED | app_settings.email_config bevat in de DB letterlijk smtpPassword "AUDIT-P36A-smtp-pw"; user met permissions:["manage_backups"] krijgt GET /api/settings -> 403,… |
| BUG-011 | HIGH | FIXED | user id=8 met permissions:[]: PUT /api/system-settings {contractNumberStart:999999,tollRatePerKm:"9.99"} -> 403 {"message":"Not authorized. One of these permis… |
| BUG-012 | HIGH | FIXED | documents.file_path via SQL op 'package.json', '../LVStest-main/package.json' en een absoluut pad gezet: GET /api/documents/view|download/:id geeft in alle dri… |
| BUG-013 | HIGH | CHANGED BY DECISION | besluiten B-09 (waarschuwen, medewerker mag doorgaan): blok 3254 (2027-10-01..10-10) daarna standaardhuur 2027-10-03..10-05 -> 201 met warnings:[{"code":"MAINT… |
| BUG-014 | HIGH | FIXED | Blok 3269 + assign-spare (vervanger 3270 op voertuig 1727), daarna DELETE /api/reservations/3269 -> 200; SQL: vervanger 3270 heeft deleted_at=2026-09-12 19:00:… |
| BUG-015 | HIGH | FIXED | user met permissions:["view_reservations"]: PATCH /api/reservations/3221/spare-status {"spareVehicleStatus":"returned"} -> 403 {"message":"Not authorized. One … |
| BUG-016 | HIGH | FIXED | PATCH /api/reservations/3240/basic status=completed -> 400 INVALID_STATUS_TRANSITION; PATCH /api/reservations/3241 status=completed -> 400 INVALID_STATUS_TRANS… |
| BUG-017 | HIGH | FIXED | Klant 1248 geblacklist op voertuig 1704; reservering 3244 (klant 1247) daarna PATCH /api/reservations/3244 {"customerId":1248} -> 409 "This customer is blackli… |
| BUG-018 | HIGH | CHANGED BY DECISION | besluiten B-01 + B-03: voertuig op not_for_rental -> POST /api/reservations 409 {"code":"NOT_FOR_RENTAL"}; voertuig op needs_fixing blijft bewust boekbaar (201… |
| BUG-019 | HIGH | FIXED | Reservering 3245 (2027-10-01..10-05): PATCH /status picked_up daarna completed -> 200 met endDate="2027-10-05" (onveranderd, niet vandaag); via POST /pickup + … |
| BUG-020 | HIGH | FIXED | POST /api/vehicles "P36A-020-2828" -> 201; daarna "p36a0202828" -> 409 en "P36A 020 2828" -> 409, beide met dezelfde duplicaatmelding als het exacte duplicaat.… |
| BUG-021 | HIGH | FIXED | PATCH /api/vehicles/1669 {"availabilityStatus":"banana_not_real"} -> 400 {"code":"INVALID_AVAILABILITY_STATUS","details":{"received":"banana_not_real","allowed… |
| BUG-022 | HIGH | FIXED | besluiten B-14: voertuig met reserveringen van twee verschillende klanten -> GET /api/vehicles/:id/delete-impact geeft blocked:true en blockingReservations met… |
| BUG-023 | HIGH | FIXED | user met permissions:[]: POST /api/migrate/customer-drivers {} -> 403 {"message":"Not authorized. One of these permissions required: manage_customers"}. |
| BUG-024 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id in besluiten.md over wachtwoordhergebruik). POST /api/users/change-password met newPassword === currentPassword -> 200 "P… |
| BUG-025 | MEDIUM | FIXED | POST /api/settings/contract-number-override {"overrideNumber":99999999999} -> 400 "Must be a whole number between 1 and 2147483647"; PUT /api/system-settings {… |
| BUG-026 | MEDIUM | FIXED | Server draait met UPLOADS_DIR=...\regress-uploads; contract gegenereerd naar documents/1773/contract_unsigned/...pdf, en GET /uploads/documents/1773/contract_u… |
| BUG-027 | MEDIUM | FIXED | Twee keer GET /api/contracts/generate/3319 -> twee documents-rijen met VERSCHILLENDE bestandspaden (..._2026-09-12T19-05-23-661Z_ou9b.pdf vs ..._19-05-23-730Z_… |
| BUG-028 | MEDIUM | FIXED | GET /api/contracts/generate/:id?templateId=2 (template "gffg" met fields:[]) -> 409 "The PDF template \"gffg\" has no fields, so the contract would be complete… |
| BUG-029 | MEDIUM | FIXED | POST /api/delivery/transports/generate-report {transportIds:[43,41,42]} -> 201, documents.file_path = "reports/Transport_Reports_3_vehicles_12-09-2026_78787.pd… |
| BUG-030 | MEDIUM | FIXED | POST /api/documents met filename "malware.exe" -> 400 (was 500) {"message":"This file type is not permitted for security reasons"}. Restpunt: de body bevat in … |
| BUG-031 | MEDIUM | FIXED | POST /api/reservations/:id/mark-needs-service {serviceStartDate:"2099-01-01",serviceEndDate:"2020-01-01"} -> 400 {"message":"Invalid service date range","error… |
| BUG-032 | MEDIUM | FIXED | Twee keer assign-spare op blok 3266 met verschillende spares -> beide 200, maar SQL toont vervanger 3267 op status 'cancelled' en alleen 3268 nog 'booked': pre… |
| BUG-033 | MEDIUM | FIXED | POST /api/reservations/maintenance-with-spare met maintenanceData zonder vehicleId -> 400 {"message":"Invalid maintenance data","errors":[{"field":"type","mess… |
| BUG-034 | MEDIUM | CHANGED BY DECISION | besluiten B-09 (+B-01/B-03): een blok dat vandaag dekt zet vehicles.availability_status wel degelijk op needs_fixing — niet synchroon bij create (t+0s en t+3s … |
| BUG-035 | MEDIUM | FIXED | POST /api/placeholder-reservations {originalReservationId:3263 (klant 1247), customerId:1248} -> 201, maar SQL toont customer_id=1247: de server leidt de klant… |
| BUG-036 | MEDIUM | FIXED | PATCH /api/reservations/:id/spare-status {"spareVehicleStatus":"ready"} op een type:"standard" reservering -> 400 {"message":"Spare vehicle status can only be … |
| BUG-037 | MEDIUM | CHANGED BY DECISION | besluiten B-09 ("twee overlappende onderhoudsblokken op één auto vallen onder dezelfde regel" = waarschuwen, opslaan mag): blok 3421 (2028-11-01..11-10) daarna… |
| BUG-038 | MEDIUM | FIXED | Tweede POST /api/reservations/:id/pickup met een al gebruikt contractnummer -> 409 {"message":"Contract number \"P36C-DUP-9372828\" is already used by reservat… |
| BUG-039 | MEDIUM | FIXED | POST /api/reservations met vehicleId 999999999 -> 404 {"message":"Vehicle not found","field":"vehicleId"}; met customerId 999999999 -> 404 {"message":"Customer… |
| BUG-040 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over backdaten/overdue-guard). POST /api/reservations {startDate:"2020-01-01",endDate:"2020-01-05"} op vers voertuig 1707… |
| BUG-041 | MEDIUM | FIXED | POST /api/vehicles {departureMileage:-500,returnMileage:-20} -> 400 met per veld "Mileage cannot be negative"; PATCH /api/vehicles/1668 {departureMileage:-999}… |
| BUG-042 | MEDIUM | FIXED | POST /api/vehicles apkDate "2026-02-30" -> 400 "That is not a real calendar date"; apkDate "99999-01-01" -> 400 "Use the yyyy-MM-dd format" + "That is not a re… |
| BUG-043 | MEDIUM | FIXED | 10 gelijktijdige POST /api/deleted-records/41/restore (raw http, keepAlive:false) -> {"200":1,"409":9}, de negen met {"code":"ALREADY_RESTORED"}; geen enkele 5… |
| BUG-044 | MEDIUM | FIXED | POST /api/customers {"name":" "} -> 400 {"message":"Invalid customer data", issues:[{code:"too_small",minimum:1,message:"Name is required"}]}. |
| BUG-045 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over uniciteit van het debiteurnummer). Twee klanten met hetzelfde debtorNumber "AUDIT-P36A-DEB-9372828" -> 201 (id 1252)… |
| BUG-046 | MEDIUM | FIXED | GET /api/rdw/vehicle/AB-123-C zonder enige cookie -> 401 {"message":"Unauthorized"} (was 404 uit de echte RDW-lookupketen). |
| BUG-047 | MEDIUM | FIXED | POST /api/login (skipPrime) levert XSRF-TOKEN T1; de eerstvolgende muterende call POST /api/customers met precies dat token -> 201, geen CSRF_INVALID. |
| BUG-048 | LOW | FIXED | POST /api/pdf-templates met fields als array-van-strings -> 400 "Expected object, received string"; met fields als object -> 400 "fields must be an array of fi… |
| BUG-049 | LOW | FIXED | POST /api/documents met het file-onderdeel vóór vehicleId -> 400 (was 500) "Vehicle ID is required. Send vehicleId before the file, or as a query parameter." R… |
| BUG-050 | LOW | FIXED | Template 7 aangemaakt, background geüpload (regress-uploads/templates/template_7_background.png aanwezig), DELETE /api/pdf-templates/7 -> 200 en een directory … |
| BUG-051 | LOW | FIXED | GET /object-storage/anything zonder sessiecookie -> 401 {"message":"Unauthorized"} (was 500 "Error loading file from object storage", identiek aan een adminses… |
| BUG-052 | LOW | FIXED | PATCH /api/reservations/3243 {"maintenanceStatus":"garbage"} op een maintenance_block -> 400 {"errors":[{"field":"maintenanceStatus","message":"Invalid input"}… |
| BUG-053 | LOW | FIXED | Serverzijde per item correct: PATCH /api/transports/42 en /api/transports/999999999 parallel -> 200 resp. 404 "Transport not found", en SQL bevestigt transport… |
| BUG-054 | LOW | NOT FIXED | Twee van de drie gevallen zijn dicht: totalPrice -1 en 1e308 geven nu 400 "The amount must be between 0 and 10000000". Maar POST /api/reservations {totalPrice:… |
| BUG-055 | LOW | NOT FIXED | De bestuurdershelft is gerepareerd: reservation_driver_assignments rij 292 krijgt assigned_until=2026-09-12 19:09:39 na DELETE /api/reservations/:id. De docume… |
| BUG-056 | LOW | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over terugkerende reserveringen). POST /api/reservations {isRecurring:true,recurringFrequency:"weekly"} -> 201 (id 3249),… |
| BUG-057 | LOW | NOT APPLICABLE | Dev-only en door de eigen bronregel als omgevingsconfiguratie geclassificeerd ("Regressietest: N.v.t."). Runtime op deze dev-server: POST /api/reservations met… |
| BUG-058 | LOW | FIXED | POST /api/vehicles met een emoji-kenteken -> 400 {"field":"licensePlate","message":"License plate is too long"} + formaatfout; met 500 X'en -> 400 met dezelfde… |
| BUG-059 | LOW | FIXED | POST /api/customers met een naam van 5000+ tekens -> 400 {"code":"too_big","maximum":255,"message":"Name is too long"}. |
| BUG-060 | CRITICAL | FIXED | Anon POST /api/expenses/with-receipt -> 401 {"message":"Not authenticated"} (GET /api/expenses 401, POST /api/expenses 401); as manage_expenses a body with rec… |
| BUG-061 | CRITICAL | FIXED | AUDIT-P36B-viewer (view_portal) GET /api/portal-admin/customers/999999999/settings -> 404 {"message":"Customer not found"}; id 2147483647 -> 404; /health uptim… |
| BUG-062 | HIGH | FIXED | tsx-evaluated server/initAdmin.ts: resolveDefaultAdminPassword({NODE_ENV:'production'}) THROWS 'DEFAULT_ADMIN_PASSWORD is not set. Refusing to create the first… |
| BUG-063 | HIGH | FIXED | AUDIT-P36B-manager (role manager, manage_users) PATCH /api/users/5 {"password":...} -> 403 'Only an administrator can set another account's password'; PATCH se… |
| BUG-064 | HIGH | FIXED | AUDIT-P36B-nobody (permissions []) DELETE /api/reservations/3213 -> 403 {"message":"Not authorized. One of these permissions required: manage_reservations"}; t… |
| BUG-065 | HIGH | FIXED | As permissions:[] all seven routes -> 403: GET /api/interactive-damage-checks, GET /:id, POST, PUT /:id, GET /:id/pdf, DELETE /:id and GET /api/vehicles/2/dama… |
| BUG-066 | HIGH | FIXED | POST /api/vehicle-diagram-templates, PATCH /api/vehicle-diagram-templates/1 and DELETE /api/vehicle-diagram-templates/1 as permissions:[] -> 403 'required: man… |
| BUG-067 | HIGH | FIXED | DELETE /api/settings/contract-number-override as permissions:[] and as viewer -> 403 'required: manage_settings'; POST with {"overrideNumber":999123} as permis… |
| BUG-068 | HIGH | FIXED | As permissions:[]: GET /api/placeholder-reservations, /api/placeholder-reservations/needing-assignment, /api/vehicles/2/customers-with-reservations, /api/spare… |
| BUG-069 | HIGH | NOT FIXED | /api/backups/restore-files is fixed (archive with member dist/server/index.js -> 400 'entries that would be written outside the uploads directory', absolute-pa… |
| BUG-070 | HIGH | NOT FIXED | Regression clause 1 fails: PATCH /api/pdf-templates/2 {"backgroundPath":"../../AUDIT-P36B-canary.txt"} -> 200 and the value is stored (server/routes/pdf-templa… |
| BUG-071 | HIGH | FIXED | POST /api/fines/cjib-config/test as manage_fines with host 127.0.0.1:5432 (open), 169.254.169.254:80, nonexistent.invalid:21, example.com:21 and ftp.cjib.nl:21… |
| BUG-072 | HIGH | FIXED | POST /api/expenses receiptUrl='javascript:alert(1)' -> 400 'Only http(s), mailto, tel links or a path inside this application are allowed'; a local Windows pat… |
| BUG-073 | HIGH | FIXED | Portal POST /api/portal/drivers with licenseFilePath='x" onmouseover="AUDITP36B' -> 201 with the field dropped (driverInputSchema whitelist, server/routes/port… |
| BUG-074 | HIGH | FIXED | 1010 GET /api/vehicles as one logged-in user while rotating X-Forwarded-For over 6 values -> 429 at request #995 (RateLimit-Limit 1000, 993x200 then 429); a di… |
| BUG-075 | HIGH | FIXED | GET /api/backups/download-data as AUDIT-P36B-manager (manage_backups) -> 200, 20,513,305 bytes of pg_dump output; the body contains no 'postgres://' and no 'pa… |
| BUG-076 | MEDIUM | NOT APPLICABLE | REFUTED by the plan (09-remediation-plan.md:224, hardening only). Hardening verified: POST /api/backups/upload with filename="../../AUDIT-P36B-esc.sql" -> 200 … |
| BUG-077 | MEDIUM | FIXED | POST /api/app-settings/email/test as manage_settings to 127.0.0.1:5432 (port open), 127.0.0.1:9 (port closed) and 169.254.169.254:80 -> all three 400 with the … |
| BUG-078 | MEDIUM | FIXED | tsx-evaluated buildCspDirectives(true) -> scriptSrc ["'self'"], connectSrc ["'self'","wss:"], imgSrc ["'self'","data:","blob:"], no cdn.jsdelivr.net and no 'un… |
| BUG-079 | MEDIUM | FIXED | code-inspectie: server/index.ts:300-316 only monkeypatches res.json when LOG_RESPONSE_BODIES==='true' (an opt-in that is not set here), and :327 pipes whatever… |
| BUG-080 | MEDIUM | FIXED | code-inspectie: server/utils/email-service.ts:186 derives rejectUnauthorized = !(smtpAllowInvalidCert), :378 passes it to the send transport and :314 to the te… |
| BUG-081 | MEDIUM | NOT APPLICABLE | Deferred by the plan: 09-remediation-plan.md:229 classifies it BUSINESS-DECISION, 'n/a until decided' (OPT-027), and besluiten.md has no B-id for it. Unchanged… |
| BUG-082 | MEDIUM | NOT APPLICABLE | Deferred by the plan (09-remediation-plan.md:230, DEFERRED until the real Coolify/Traefik hop count is known) - and it still reproduces exactly: logging in wit… |
| BUG-083 | MEDIUM | FIXED | server/portal-auth.ts:190 is now `secret: resolveSessionSecret()` and the string 'portal-dev-secret' no longer exists in the tree, so the portal no longer sign… |
| BUG-084 | MEDIUM | FIXED | AUDIT-P36B-manager PATCH /api/reservations/3224 {"id":9999,"deletedBy":"AUDIT-P36B-forged","deletedAt":null,"createdBy":"AUDIT-P36B"} -> 200; SQL afterwards: i… |
| BUG-085 | MEDIUM | FIXED | AUDIT-P36B-viewer (view_vehicles/view_customers/... only) GET /uploads/, /uploads/templates/ and /uploads/temp/ -> 403 on all three; the static mount no longer… |
| BUG-086 | MEDIUM | FIXED | Portal POST /api/portal/requests with message 'AUDIT-P36B-JSON-<a href="javascript:alert(3)">click</a>' as JSON -> stored 'AUDIT-P36B-JSON-click' (id 578); the… |
| BUG-087 | MEDIUM | FIXED | As manage_portal, PUT /api/portal-admin/config allowedFrameOrigins with "https://a.example; script-src * 'unsafe-inline'", "https://b.example/path", "https://c… |
| BUG-088 | MEDIUM | FIXED | GET /api/damage-check-templates/by-vehicle?vehicleId=2 -> 200 as admin and 200 as AUDIT-P36B-viewer (was 500 for every identity); the /by-vehicle route is no l… |
| BUG-089 | MEDIUM | FIXED | GET /api/reports/maintenance-costs -> 200 without parameters and 200 with ?startDate=2026-01-01&endDate=2026-12-31, as admin (was an unconditional 500). |
| BUG-090 | MEDIUM | FIXED | Two identities firing DELETE /api/reservations/3361 in parallel -> 200 {"message":"Reservation deleted successfully","deletedBy":"AUDIT-P36B-manager"} and 410 … |
| BUG-091 | MEDIUM | FIXED | Throwaway user AUDIT-P36B-s1789239851890 logged in twice; session A POST /api/users/change-password -> 200, immediately after that session B GET /api/user -> 4… |
| BUG-092 | MEDIUM | FIXED | 14 consecutive POST /api/portal/forgot for portaal-test@example.com from one IP -> 200 for #1-#10 and 429 'Too many requests, please try again after 15 minutes… |
| BUG-093 | LOW | FIXED | Anonymous GET /health -> 200 with body {"status":"OK","timestamp":...,"uptime":910.7,"database":{"connected":true,"pool":{...}}} - no envVars key and no userCo… |
| BUG-094 | LOW | FIXED | SQL over users.password: every hash written by this branch ends in '.s65536.8.1' (N=2^16, r=8, p=1 recorded in the hash string, server/auth.ts SCRYPT_PARAMS), … |
| BUG-095 | LOW | FIXED | After POST /api/logout for the session on X-Forwarded-For 198.51.100.93 (and the password-revoked session .92), SELECT count(*) FROM active_sessions WHERE ip_a… |
| BUG-096 | LOW | NOT FIXED | Half fixed: verifyCsrfToken now compares with crypto.timingSafeEqual (server/middleware/security/csrf.ts:54-62). The documented regression clause 'anonymous GE… |
| BUG-097 | LOW | NOT APPLICABLE | REFUTED by the plan (09-remediation-plan.md:245, hardening only). The hardening did land - the includes() blacklist is replaced by an isPlainFilename() basenam… |
| BUG-098 | LOW | FIXED | Planted a directory junction regress-uploads/AUDIT-P36B-leakdir -> LVStest-main/AUDIT-P36B-outside-dir (a real symlink needs Administrator on this host) with a… |
| BUG-099 | LOW | FIXED | fetchWithTimeout (server/utils/security/outboundGuard.ts), which both geocoding calls now use, aborted a never-answering local HTTP server after 1507 ms with A… |
| BUG-100 | LOW | FIXED | POST /api/app-settings category 'email' with fromName containing CR+LF -> 400 {"message":"Invalid e-mail settings","errors":[{"field":"fromName","message":"A l… |
| BUG-101 | LOW | FIXED | POST /api/fines/imports/upload as manage_fines with a 19,600,022-byte XML nested 2.8M levels deep -> 400 (import row status 'failed'); /health uptime 776.35331… |
| BUG-102 | LOW | FIXED | client/src/pages/reports/index.tsx:1259 still assigns doc.body.innerHTML, but every server-supplied value now goes through escapeHtml (18 call sites: brand, mo… |
| BUG-103 | LOW | FIXED | As admin: GET /api/settings/abc -> 400 {"message":"Invalid id","field":"id"}, /api/settings/%00 -> 400 'Invalid characters in URL', /api/settings/<46 digits> -… |
| BUG-104 | LOW | FIXED | POST /api/interactive-damage-checks with an empty body -> 400 {"message":"Invalid damage check data","errors":[{"field":"vehicleId","message":"Required"},{"fie… |
| BUG-105 | LOW | FIXED | After exhausting the portal-forgot bucket on IP 203.0.113.200 (429 from request #11), POST /api/login with staff credentials from that same IP -> 200 and POST … |
| BUG-106 | CRITICAL | FIXED | PATCH /api/reservations/3214 {endDate:2027-10-27} -> 409 CONFLICT en de rij blijft 2027-10-17..21; PATCH B {startDate} -> 409; PATCH A {vehicleId: bezet 1671} … |
| BUG-107 | CRITICAL | FIXED | Voertuig 1672 met D..D+3: eendaagse boeking op D -> 409, middenin -> 409, op D+3 -> 201 (turnover); tweemaal hetzelfde eendaagse bereik op 1673 -> tweede 409, … |
| BUG-108 | HIGH | FIXED | DELETE /api/vehicles/1678 met een booked reservering -> 409 VEHICLE_HAS_LIVE_RESERVATIONS (B-14); na annuleren delete 200 en POST /api/reservations op datzelfd… |
| BUG-109 | HIGH | CHANGED BY DECISION | B-03: voertuig 1753 op needs_fixing + maintenance in_service -> POST /pickup 409 VEHICLE_IN_WORKSHOP (overridable) en PATCH /status {picked_up} 409; pickup met… |
| BUG-110 | HIGH | FIXED | delete-impact van voertuig 1859 telt apk_date_changes 1, reservation_driver_assignments 1, fines.vehicle_id 1, fines.reservation_id 1, vehicle_transports.relat… |
| BUG-111 | HIGH | FIXED | PATCH /api/reservations/3220: {startDate:'not-a-date'} 400 'Use the yyyy-MM-dd format', {endDate < start} 400 'End date must be on or after start date', {start… |
| BUG-112 | HIGH | CHANGED BY DECISION | B-04: GET /api/reservations/3441/cancel-impact toont transports[54], spares[3442], drivers[296]; PATCH /status {cancelled, cascade:{transports:true,spares:true… |
| BUG-113 | HIGH | CHANGED BY DECISION | B-02: POST /api/reservations/3302/return zet de status direct op 'completed' (niet 'returned'); een boeking 30 dagen later op datzelfde voertuig -> 201. Bestaa… |
| BUG-114 | HIGH | FIXED | PATCH /api/transports/44 {scheduledDate:'2027-04-02'} -> vervangingsreservering 3323 staat daarna op 2027-04-02..2027-04-02; een tweede transport dat dezelfde … |
| BUG-115 | HIGH | FIXED | PATCH /api/transports/46 {status:'cancelled'} -> vervangingsreservering 3324 is weg (select geeft null), reservevoertuig 1783 staat weer op 'available', en een… |
| BUG-116 | HIGH | FIXED | PATCH /api/transports/44 {vehicleId: 1779 = de huidige relatedVehicleId} -> 400 'Replacement vehicle cannot be the same as the original vehicle'; vehicle_id/re… |
| BUG-117 | HIGH | FIXED | Portaalblok 3379 met toegewezen vervanger 3380 (voertuig 1835): goedkeuring van de maintenance_change verplaatst het blok naar 2026-10-12..13 en vervanger 3380… |
| BUG-118 | HIGH | FIXED | Twee blokken 3386/3388 met eigen vervangers 3387/3389: DELETE van blok 3388 soft-delete alleen 3389, 3387 blijft ongemoeid. Verlopen blok 3444 op een opgehaald… |
| BUG-119 | HIGH | NOT FIXED | generate/:id en generate-default/:id geven nu 400 op placeholder 3334 en blok 3335, maar GET /api/contracts/data/3334 geeft nog 200 met licensePlate/brand/mode… |
| BUG-120 | HIGH | FIXED | Voertuig 1754 op not_for_rental met booked 3301: POST /pickup met contractNumber -> 409 en de rij is onaangeroerd (status booked, contract_number null, pickup_… |
| BUG-121 | HIGH | FIXED | POST /api/reservations/maintenance-with-spare met twee toewijzingen op dezelfde reserveauto met overlappende datums -> 409 CONFLICT en nul blokken/vervangers w… |
| BUG-122 | MEDIUM | FIXED | Vijf rondes van twee gelijktijdige PATCHes op voertuig 1789 (remarks vs tireSize): 0 van de 5 rondes verliest een update, beide kolommen dragen elke ronde de n… |
| BUG-123 | MEDIUM | FIXED | POST /api/vehicles/bulk-import-plates met ['', ' ', null, 12345, {licensePlate:'x'}] -> imported [] en vijfmaal 'License plate is required'; select * from vehi… |
| BUG-124 | MEDIUM | FIXED | bulk-import-csv: apkDate '05-03-2027' -> apk_date 2027-03-05, companyDate '31-12-2026' -> 2026-12-31, productionDate '2020' -> 2020-01-01; '2026-02-30' wordt p… |
| BUG-125 | MEDIUM | NOT FIXED | POST /api/vehicles met barcode 'P36C-A' (het kenteken van voertuig 1670) -> 201 en de waarde wordt letterlijk opgeslagen; GET /api/barcodes/P36C-A resolvet daa… |
| BUG-126 | MEDIUM | FIXED | Voertuig 1699 verwijderd, zijn barcode VEH-001699 via SQL op voertuig 1677 gezet, restore -> 409 {"code":"BARCODE_TAKEN","message":"Another vehicle already use… |
| BUG-127 | MEDIUM | NOT FIXED | PATCH returnMileage onder de pickupstand -> 400 (goed), maar PATCH /api/reservations/3306 {returnMileage:39500} geeft 200 terwijl vehicles.current_mileage op 3… |
| BUG-128 | MEDIUM | FIXED | Reservering 3333, gepland end_date 2026-09-15: na pickup + return en daarna PATCH /status {picked_up} -> 200 en end_date is nog steeds 2026-09-15 in plaats van… |
| BUG-129 | MEDIUM | CHANGED BY DECISION | B-02: legacy rij 2175 met status 'active' gaat via PATCH /api/reservations/2175/status {completed} nu naar 200 (voorheen door geen enkele UI-actie te wijzigen)… |
| BUG-130 | MEDIUM | FIXED | Voertuig 1756 stond 'rented' met een boeking over 10 dagen: PATCH /api/reservations/3304/status {completed, departureMileage} -> voertuig gaat naar 'scheduled'… |
| BUG-131 | MEDIUM | FIXED | POST /pickup {pickupDate:'x'} -> 400 'Use a real yyyy-MM-dd date'; POST /return {returnDate:'x'} -> 400; returnDate vóór de ophaaldatum -> 400 'The return date… |
| BUG-132 | MEDIUM | NOT FIXED | Opgehaalde verhuur 3309: PATCH /status {cancelled} -> 200 en DELETE /api/reservations/3309 -> 200 (soft delete), beide zonder statusguard of overridepad; er is… |
| BUG-133 | MEDIUM | FIXED | PATCH /api/reservations/3313/basic {driverId:161} sluit toewijzing 289 (driver 23, assigned_until gezet) en opent rij 290 (driver 161) in reservation_driver_as… |
| BUG-134 | MEDIUM | NOT FIXED | B-06 vraagt om een melding bij datum-/voertuigwijziging en bij annulering, maar PATCH endDate, PATCH vehicleId, PATCH /status {cancelled} en DELETE op reserver… |
| BUG-135 | MEDIUM | FIXED | PATCH /api/transports/44 {vehicleId:1781}: voertuig 1778 gaat terug naar maintenance_status 'ok' met lege notitie, 1781 krijgt 'needs_service' + 'Replacement v… |
| BUG-136 | MEDIUM | FIXED | PATCH /api/transports/44 {status:'garbage_status'} -> 400 INVALID_TRANSPORT_STATUS met allowed-lijst; {status:'completed'} zonder completedDate zet completed_d… |
| BUG-137 | MEDIUM | FIXED | TBD-transport 48 afronden zet placeholder 3326 op status 'cancelled' (placeholder_spare false); GET /api/placeholder-reservations/needing-assignment bevat hem … |
| BUG-138 | MEDIUM | FIXED | POST /api/portal-requests/583/approve met een startDate een week in het verleden -> 400 MAINTENANCE_IN_PAST; goedkeuren op de inmiddels geannuleerde verhuur 33… |
| BUG-139 | MEDIUM | CHANGED BY DECISION | B-13: PATCH /api/reservations/3367 {vehicleId:1826} laat blok 3368 op het fysieke voertuig 1824 staan, de gekoppelde vervanger vervalt (0 live replacement-rije… |
| BUG-140 | MEDIUM | CHANGED BY DECISION | B-15: DELETE /api/transports/47 -> 204 en GET /api/deleted-records bevat entityType 'transport' (record 40, 'Transport #47 — P36T64813O3 2027-04-10'); restore … |
| BUG-141 | MEDIUM | FIXED | Twee gelijktijdige POST /api/portal-requests/581/approve: één 200 en één 409 {"code":"ALREADY_HANDLED","message":"Request is already closed"}; precies één onde… |
| BUG-142 | MEDIUM | FIXED | POST /api/transports met een vervanger die die dag al verhuurd is -> 409 'Replacement vehicle has conflicting reservations for this date' en select id from veh… |
| BUG-143 | MEDIUM | NOT FIXED | Het createpad is dicht (POST /api/reservations en een maintenance_block met vehicleId 98765432 -> beide 404 'Vehicle not found'), maar de oude weesrijen leven:… |
| BUG-144 | MEDIUM | NOT FIXED | PATCH /api/reservations/3318 {status:'picked_up'} -> 200 en PATCH /:id/status {picked_up} -> 200 op een reservering die pas op 2026-11-11 begint; de rij staat … |
| BUG-145 | MEDIUM | FIXED | cleanupPortalTestData verwijdert reserveringen nu ook via de test-voertuig-id's en de suite wijst naar een eigen database (server/__tests__/setup.ts:14 noemt l… |
| BUG-146 | LOW | FIXED | PATCH /api/vehicles/1675 {availabilityStatus:'needs_fixing'} op een voertuig met een booked reservering -> 200 en de responsbody bevat de sleutel 'warning'. |
| BUG-147 | LOW | FIXED | Voor voertuig 1696 bevat audit_logs precies één vehicle.delete-rij (id 1631) voor de DELETE, en de restore is gelogd als een eigen actie vehicle.restore (id 16… |
| BUG-148 | LOW | NOT FIXED | Twee van de vier regressie-asserts falen: POST /api/reservations met driverId 98765432 -> 400 'Failed to create reservation' en PATCH /:id {driverId:98765432} … |
| BUG-149 | LOW | NOT FIXED | PATCH /api/vehicles/1670 {serviceIntervalKm:-5, serviceIntervalMonths:0} -> 400 'The interval must be greater than zero' (goed), maar {lastServiceDate: vandaag… |
| BUG-150 | LOW | NOT FIXED | Er is nog geen purge: DELETE /api/deleted-records/purge en /api/deleted-records/1/purge vallen terug op de SPA-HTML, en server/routes.ts kent alleen GET /api/d… |
| BUG-151 | LOW | CHANGED BY DECISION | B-15: DELETE /api/reservations/3339 -> GET /api/deleted-records bevat 'Reservering #3339 — P36X23272RB 2027-07-29' (record 42); met een inmiddels overlappende … |
| BUG-152 | LOW | FIXED | audit_logs voor reservering 3314 na pickup en return: acties reservation.create, reservation.pickup (details.operation 'pickup') en reservation.return (details… |
| BUG-153 | LOW | NOT FIXED | Reservering 3315 van 2026-12-21 t/m 2026-12-25: GET /api/contracts/data/3315 geeft "duration":"4 days", GET /api/reports/vehicle-financials?from=2026-12-21&to=… |
| BUG-154 | LOW | FIXED | Voertuig 1876 met portaalblok 3429: PATCH /api/vehicles/1876/maintenance-status {status:'in_service'} zet het blok op maintenance_status 'in' en schrijft porta… |
| BUG-155 | LOW | FIXED | Een portaalgoedkeuring met onbereikbare mail geeft 200 met mailSent:false en schrijft email_logs-rijen 33-36 met result 'failed' en failure_reason 'No valid em… |
| BUG-156 | LOW | FIXED | POST /api/delivery/transports/generate-report {transportIds:[44], templateId:999999} -> 404 'Transport report template not found' en geen documentrij. |
| BUG-157 | LOW | NOT FIXED | Pickup met contractNumber '992899' -> 200 en daarna een pickup met '0992899' -> 200; select id,contract_number geeft beide rijen naast elkaar (3316 '992899', 3… |
| BUG-158 | LOW | FIXED | Twee gelijktijdige POST /api/placeholder-reservations/3358/assign-vehicle met verschillende voertuigen: één 200 en één 409 {"code":"CONFLICT","message":"This p… |
| BUG-159 | CRITICAL | FIXED | Twee parallelle PATCH /api/reservations/:id naar voertuig 1843 (2027-01-10..15): 200 + 409 CONFLICT, precies 1 booked-rij op het doelvoertuig; idem op /:id/bas… |
| BUG-160 | HIGH | FIXED | Twee gelijktijdige assign-spare-claims op spare 1866 voor dezelfde periode: 200 + 409 CONFLICT, exact 1 replacement-reservering (3414) op de spare (p36d-12-con… |
| BUG-161 | HIGH | NOT FIXED | 20 parallelle foute logins op AUDIT-P36D-lock1, elk vanaf een eigen X-Forwarded-For: 10x401 "Incorrect password" (volledige wachtwoordverificatie) + 10x429, tw… |
| BUG-162 | HIGH | FIXED | GET /api/contracts/generate/3230?templateId=3 (klant 1258 met emoji/CJK/RTL in naam, adres en telefoon): 200 PDF waarvan de paginatekst de huurdersnaam bevat (… |
| BUG-163 | HIGH | NOT FIXED | Technisch weg (generateFallbackContract verwijderd in ee037093; GET /api/contracts/generate/3230?templateId=999999 -> 404 "Template not found", geen documents-… |
| BUG-164 | HIGH | FIXED | De legacygenerator bestaat niet meer: `git diff main..HEAD -- server/utils/pdf-generator.ts` toont de verwijdering van `generateRentalContract` en `generateFal… |
| BUG-165 | HIGH | FIXED | GET /api/contracts/generate-default/3228 -> 200 + documents-rij 206 (Contract (Unsigned), content_type application/pdf, version 2); GET /api/damage-checks/gene… |
| BUG-166 | HIGH | FIXED | Schadecheck voor klant 1255 (alleen `name`, first/last NULL): paginatekst bevat "AUDIT-P36D Normal Customer" en nergens "null null" (p36d-01-pdf.out.json A6, p… |
| BUG-167 | HIGH | NOT FIXED | Gebruiker AUDIT-P36D-limited (rol user, permissies [view_vehicles]) krijgt nog steeds 200 op GET /api/contracts/generate/3228, GET /api/contracts/generate-defa… |
| BUG-168 | HIGH | FIXED | POST /api/damage-check-templates/preview-pdf met page:40000 -> 400 in 10 ms ({"path":"0.page","message":"Number must be less than or equal to 10"}); PUT /api/d… |
| BUG-169 | HIGH | FIXED | Met UPLOADS_DIR buiten de repo: POST /api/customers/1255/drivers (licenseFile) -> 201, drivers.license_file_path = "drivers/license_customer1255_...jpg" (geen … |
| BUG-170 | HIGH | NOT FIXED | POST /api/notifications/send {vehicleIds:[1883],template:"apk"} -> 200 {sent:3}; de SMTP-stub ving 3 berichten: de huidige houder (audit-p36d-now), een terugge… |
| BUG-171 | HIGH | FIXED | SMTP-stub op 127.0.0.1:2537 in modus hang-ehlo: de bulkverzending voor 3 ontvangers keerde na 30,1 s terug (3 x de 10 s SMTP_TIMEOUT_MS uit server/utils/email-… |
| BUG-172 | MEDIUM | NOT FIXED | Twee sessies lezen reservering 3410; A PATCHt de hele rij met nieuwe notes -> 200 (DB: notes=AUDIT-P36D NOTES-FROM-A), B PATCHt daarna zijn verouderde kopie me… |
| BUG-173 | MEDIUM | FIXED | Dezelfde maintenance-with-spare-body tweemaal gelijktijdig op voertuig 1873: 201 + 409 CONFLICT; DB toont exact 1 maintenance_block (3424) en exact 1 vervangin… |
| BUG-174 | MEDIUM | FIXED | Twee parallelle POST /api/reservations/3415/pickup met verschillende contractnummers: 200 + 400 "Cannot pickup reservation with status: picked_up"; DB houdt co… |
| BUG-175 | MEDIUM | FIXED | PUT /api/system-settings vanuit twee sessies -> 200 + 409; PATCH /api/pdf-templates/3 met de exacte updated_at -> 200 (A), de verouderde kopie (B) -> 409 STALE… |
| BUG-176 | MEDIUM | FIXED | preview-pdf: damageTypes met emoji -> 200 geldige PDF (geen 500), damageTypes [42,null,{}] -> 400 met veldfouten, gemengde rommel ([{type:unknownType},{zonder … |
| BUG-177 | MEDIUM | FIXED | 1:1 headerafbeelding (600x600) geupload en schadecheck gegenereerd: de enige tekstitems in de headerband (y>772) zijn de overlay "12/09/2026" (y=820, h=8) en "… |
| BUG-178 | MEDIUM | FIXED | Contract voor klant 1257 (naam/adres 250 tekens, merk/model 300) en transportrapport voor transport 35 (bestemming/reden/notities extreem lang): pdfjs meldt 0 … |
| BUG-179 | MEDIUM | NOT FIXED | Deel gefixt (corrupte of ontbrekende achtergrond -> 500 i.p.v. stille standaard; JPEG-bytes met .png-naam -> 400), maar: POST /api/pdf-templates/4/backgrounds/… |
| BUG-180 | MEDIUM | FIXED | Upload van een 3-pagina-PDF met catalog /OpenAction -> /JavaScript als sjabloonachtergrond wordt geweigerd: 400 "This PDF contains document-level JavaScript or… |
| BUG-181 | MEDIUM | NOT FIXED | (b) generate-report met templateId 999999 -> 404 en (c) de schadecheckroutes kiezen hetzelfde sjabloon, maar (a) is onveranderd: na is_default=false op alle pd… |
| BUG-182 | MEDIUM | FIXED | POST /api/contracts/generate-versioned/999999?templateId=3 -> 404 "Reservation not found" zonder documents-rij; dezelfde route op reservering 3228 met vreemd v… |
| BUG-183 | MEDIUM | NOT FIXED | Eerste helft gefixt (voertuig 1690 met alleen een reservering uit 2020: GET /api/vehicles/1690/damage-check-pdf geeft paginatekst "AUDIT-P36D DC AU3D7X 12/09/2… |
| BUG-184 | MEDIUM | FIXED | Twee POST /api/documents (documentType=contract, vehicleId 1683, zelfde dag) -> 201 id 266 met filePath contracts/AU3D0X/AU3D0X_contract_20260912_1789240181794… |
| BUG-185 | MEDIUM | NOT FIXED | Twee identieke POST /api/notifications/send gelijktijdig -> beide 200 {sent:3}; de SMTP-stub ving 6 berichten (elke ontvanger twee keer) en er ontstonden 8 ema… |
| BUG-186 | MEDIUM | FIXED | Config met smtpSecure:true op de plaintextpoort 2536 opgeslagen: de verzending faalt ({sent:0,failed:3}) en de stub ving 0 berichten, dus er gaat niets meer in… |
| BUG-187 | MEDIUM | FIXED | Portaalgebruiker 30 zette fullName op 'AUDIT-P36D <a href="https://evil.example/login">...</a>'; opgeslagen waarde bevat geen markup meer en de staff-meldingsm… |
| BUG-188 | LOW | FIXED | Twee parallelle DELETE /api/vehicles/1871 (met confirmLicensePlate): 200 + 404 "Vehicle not found"; deleted_records bevat precies 1 snapshot (id 53, related_co… |
| BUG-189 | LOW | FIXED | Twee parallelle POST /api/users/change-password met hetzelfde huidige en verschillende nieuwe wachtwoorden: 400 "Current password is incorrect" + 200; daarna l… |
| BUG-190 | LOW | FIXED | Vijf gelijktijdige GET /api/contracts/generate/3228?templateId=3 -> 5x200 en documents-rijen 208-212 met 5 verschillende file_paths (..._2026-09-12T19-02-29-30… |
| BUG-191 | LOW | FIXED | Sjabloon 5 met velden source nonexistentSource (naam SHOULD-NOT-PRINT-...), __proto__, vehicleId, foo.bar en zonder source: aanmaken 201, GET /api/contracts/ge… |
| BUG-192 | LOW | NOT FIXED | B-18 besluit "altijd Nederlands, dd-mm-jjjj, bedragen met een komma" is niet geimplementeerd: het contract voor reservering 3228 drukt "September 13, 2026" / "… |
| BUG-193 | LOW | FIXED | POST /api/pdf-templates/3/background met een tekst-PDF op Windows -> 200 met backgroundPreviewPath templates/template_3_background_preview.png; het bestand bes… |
| BUG-194 | LOW | NOT FIXED | Deel gefixt (PATCH /api/pdf-templates/:id met fields "{oops" of een 2 MB-string -> 400 i.p.v. 404; generate-versioned met vehicleId {$gt:0} -> 400; interactive… |
| BUG-195 | LOW | FIXED | Document 268 geupload en het bestand daarna van schijf verwijderd: GET /api/documents/view/268 en /download/268 -> 404, en zowel GET /api/documents/268 als GET… |
| BUG-196 | LOW | FIXED | Portaalaanvraag 588: custom_notifications.link = "/portal-admin?request=588" en de staff-mail bevat <a href="https://portaal.lamgroep.nl/portal-admin?request=5… |
| BUG-197 | CRITICAL | FIXED | e-backups3: a full-size dump with an injected `SELECT 1/0;` -> 500 {"error":"The restore failed and was rolled back; the database was not changed. psql exited … |
| BUG-198 | HIGH | FIXED | e-backups2: with UPLOADS_DIR=regress-uploads I deleted regress-uploads/documents/1682/damage_check/P36W01_...pdf, then POST /api/backups/restore/files -> 200 "… |
| BUG-199 | HIGH | FIXED | e-backups3: a full-size dump with `\connect lvs_regress_other` -> 400 "Refusing to restore: the dump contains \connect, which can act outside the database bein… |
| BUG-200 | HIGH | FIXED | e-backups2: POST /api/backups/upload (type=database) -> 200; the file appeared as C:\...\regress-backups\uploaded-database-2026-09-12T19-07-36-642Z-AUDIT-P36E-… |
| BUG-201 | HIGH | FIXED | Browser at 127.0.0.1:5003/reservations with SQL fixtures 3446 (end_date 'not-a-date') and 3447 ('2099-13-45') present: the page rendered, no ErrorBoundary fall… |
| BUG-202 | HIGH | FIXED | e-api: multipart PATCH /api/reservations/3396 carrying driverId/replacementForReservationId/replacementForTransportId/affectedRentalId/portalRequestId/delivery… |
| BUG-203 | HIGH | FIXED | e-sqlcount on :5003: the 5-week grid 2026-08-31..10-04 (331 rows) = 11 statements, 1-year range (1724 rows) = 11 statements (was 924 / 3774); per-table scan de… |
| BUG-204 | HIGH | FIXED | calendar.tsx now has exactly one key for the full list (`queryKey: ['/api/reservations']` at :645); the second key ['/api/reservations', vehicles?.length] is g… |
| BUG-205 | HIGH | NOT FIXED | e-api/e-perf on :5003: GET /api/reservations = 1949-1984 rows, 7 590 852-7 736 798 bytes (3 895 B per row, unchanged shape); item[0] still embeds the full vehi… |
| BUG-206 | MEDIUM | FIXED | e-backups: os.tmpdir() held zero db-backup-*/files-backup-*/restore-* entries before and after three POST /api/backups/run (newTempFiles = []), and still zero … |
| BUG-207 | MEDIUM | FIXED | e-backups2/e-backups3: after four refused restores and one successful restore, `walk(BACKUP_PATH) filter /\.sql$/` = [] — no plaintext dump beside any archive … |
| BUG-208 | MEDIUM | FIXED | e-backups2: POST /api/backups/restore/complete with a valid DB archive and a corrupt files archive -> 400 {"error":"Refusing to restore: the files archive is u… |
| BUG-209 | MEDIUM | NOT FIXED | Half fixed: GET /api/backups/download-data -> 200, 20 456 897 bytes, contains DROP TABLE IF EXISTS and zero `OWNER TO` lines, and leaves no new file under <cwd… |
| BUG-210 | MEDIUM | NOT FIXED | Browser at viewport 1182x698 on /reservations: document.documentElement.scrollWidth = 1418 vs clientWidth 1167-1182 (originally 1416 vs 1166) — the named regre… |
| BUG-211 | MEDIUM | CHANGED BY DECISION | Decision B-16 (docs/audit/besluiten.md:100). e-api2 on reservation 3397 (startDate 2026-10-22): POST /pickup without an answer -> 409 {"code":"PICKUP_BEFORE_ST… |
| BUG-212 | MEDIUM | NOT FIXED | Two of the three named expectations landed: a global QueryCache onError toast fires (observed live after login: "Could not load the data / Failed to execute 'j… |
| BUG-213 | MEDIUM | FIXED | Browser: with the tab logged in I killed the session from a second client (POST /api/logout -> 200), then clicked "Voertuigen" in the sidebar — the tab went to… |
| BUG-214 | MEDIUM | NOT FIXED | Decision B-19 says compression must be on in the application itself; it is not. `curl`-equivalent raw fetch with `Accept-Encoding: gzip` to GET /api/vehicles r… |
| BUG-215 | MEDIUM | FIXED | e-api: GET /api/damage-checks/generate/3398 -> 200, 5 615 / 5 619 / 5 619 bytes in 372 / 96 / 109 ms (was 3 465 695 bytes at p50 581 ms). Blocking probe: while… |
| BUG-216 | MEDIUM | FIXED | e-api: GET /api/interactive-damage-checks -> 14 rows, 4 408 bytes (was 17 043 541), and the item keys are id,vehicleId,reservationId,checkType,checkDate,diagra… |
| BUG-217 | MEDIUM | FIXED | e-perf: pg_stat_user_tables.n_tup_upd on `vehicles` moved by 0 across 3 repetitions each of GET /api/vehicles (200, ~55 ms) and GET /api/vehicles/status/breakd… |
| BUG-218 | MEDIUM | FIXED | e-api: POST /api/vehicles with a 2 MB JSON body -> 413 "request entity too large" in 16 ms, and with a 20 MB body -> 413 in 91 ms — rejected by the body parser… |
| BUG-219 | LOW | NOT FIXED | The restore half is fixed: on this Windows host POST /api/backups/restore/database, /restore/files, /restore-files and /restore-data all completed (200 or a de… |
| BUG-220 | LOW | FIXED | e-backups2: the created archive no longer carries backup_runs data (`COPY public.backup_runs` absent from the 20 404 729-byte dump; pg_dump now runs --exclude-… |
| BUG-221 | LOW | FIXED | All six points: (a) two concurrent POST /api/backups/run -> [200, 409] with {"error":"A backup is already running...","retryAfterSeconds":60} and header retry-… |
| BUG-222 | LOW | FIXED | Browser at 768x1024 on /vehicles: the sidebar is a hamburger drawer (screenshot), the page does not scroll horizontally (documentElement.scrollWidth 753 == cli… |
| BUG-223 | LOW | FIXED | All six documented items are Dutch now, checked in the live UI: empty vehicle search -> "Geen resultaten.", "0 van 0 getoond", "Vorige", "Volgende"; /portal ->… |
| BUG-224 | LOW | NOT FIXED | The code path is NOT fixed for new rows. A document generated at 21:18:26 CEST (19:18:26 UTC) stored `2026-09-12 21:18:26.112472` in documents.upload_date, the… |
| BUG-225 | LOW | FIXED | Browser: opened "Nieuwe reservering", typed "AUDIT-P36E dirty form text" into the notes textarea and set startDate, then dispatched pointerdown/mousedown/mouse… |
| BUG-226 | LOW | FIXED | e-api: GET /api/reservations/find-by-contract/AUDIT-P36C-Q40430-1 -> 200 in 25.6 ms, 4 450 bytes (one row), 2 statements, 0 sequential scans of `reservations` … |
| BUG-227 | LOW | FIXED | code-inspectie plus runtime: getReservationsInDateRange in server/database-storage.ts now contains 0 console.* calls (the four-lines-per-maintenance-block logg… |
| BUG-228 | LOW | NOT FIXED | Partly remediated, two named symptoms unchanged. Fixed: the per-vehicle-cell filter is now a useMemo bucket map (calendar.tsx:947-955, getReservationsForDay re… |
| BUG-229 | LOW | FIXED | client/src/lib/query-key-match.ts replaces the substring test with a whole-path-segment match (the id must be followed by end, '/', '?' or '#') and every cache… |
| BUG-230 | LOW | NOT FIXED | Two of the three named sites fixed, one unchanged. Fixed: service-due-scanner.ts:106-107 loads the fleet once and hands it to getServiceDueVehicles({settings, … |


---

## 3A. De uitzonderingen, per categorie

De 171 bugs met het oordeel FIXED staan in de tabel hierboven en worden hier niet herhaald. Wat
hieronder staat is alles wat géén schone reparatie was.

### FIXED — 171 bugs

Deze staan in de tabel van §3 en worden hier niet herhaald.

### NOT FIXED — 42 bugs

| BUG | Sev | Titel | Bewijs |
|---|---|---|---|
| BUG-009 | HIGH | login-rate-limiter volledig te omzeilen via `X-Forwarded-For` (was AP-004) | 10 opeenvolgende POST /api/login met telkens een andere gespoofte X-Forwarded-For (gewone IPv4, ::ffff:127.0.0.1, multi-hop "127.0.0.1, 203.0.113.5") en 10 verschillende onbekende gebruikersnamen -> … |
| BUG-024 | MEDIUM | wachtwoordhergebruik nooit geblokkeerd; `password_history` is dode code (was AP-006 / AP-… | Eigenaarsbesluit ontbreekt (geen B-id in besluiten.md over wachtwoordhergebruik). POST /api/users/change-password met newPassword === currentPassword -> 200 "Password successfully updated"; daarna A-… |
| BUG-040 | MEDIUM | startdatum in het verleden blokkeert het voertuig permanent via de overdue-guard (was RS-… | Eigenaarsbesluit ontbreekt (geen B-id over backdaten/overdue-guard). POST /api/reservations {startDate:"2020-01-01",endDate:"2020-01-05"} op vers voertuig 1707 -> 201 (id 3247); daarna POST voor 2028… |
| BUG-045 | MEDIUM | dubbele debiteurnummers toegestaan (was VC-011) | Eigenaarsbesluit ontbreekt (geen B-id over uniciteit van het debiteurnummer). Twee klanten met hetzelfde debtorNumber "AUDIT-P36A-DEB-9372828" -> 201 (id 1252) en 201 (id 1253), geen waarschuwing; SQ… |
| BUG-054 | LOW | `totalPrice` zonder grenzen; niet-numerieke invoer verdwijnt stil naar `null` (was RS-011) | Twee van de drie gevallen zijn dicht: totalPrice -1 en 1e308 geven nu 400 "The amount must be between 0 and 10000000". Maar POST /api/reservations {totalPrice:"abc"} -> 201 (id 3248) en SQL toont tot… |
| BUG-055 | LOW | reservering verwijderen laat documenten en driver-assignment wees achter (was RS-012) | De bestuurdershelft is gerepareerd: reservation_driver_assignments rij 292 krijgt assigned_until=2026-09-12 19:09:39 na DELETE /api/reservations/:id. De documentenhelft niet: na de soft delete staan … |
| BUG-056 | LOW | `isRecurring`/`recurringFrequency` zijn volledig inert (was RS-013) | Eigenaarsbesluit ontbreekt (geen B-id over terugkerende reserveringen). POST /api/reservations {isRecurring:true,recurringFrequency:"weekly"} -> 201 (id 3249), velden opgeslagen zoals verstuurd, en S… |
| BUG-069 | HIGH | Geauthenticeerde RCE via backup-restore: `tar -xzf` van een geüpload archief over `proces… | /api/backups/restore-files is fixed (archive with member dist/server/index.js -> 400 'entries that would be written outside the uploads directory', absolute-path member -> 400), but /api/backups/rest… |
| BUG-070 | HIGH | Arbitrary file delete via `backgroundPath`/`diagramPath` in vier templatemodules | Regression clause 1 fails: PATCH /api/pdf-templates/2 {"backgroundPath":"../../AUDIT-P36B-canary.txt"} -> 200 and the value is stored (server/routes/pdf-templates.ts:278-295 keeps backgroundPath from… |
| BUG-096 | LOW | CSRF-tokenvergelijking niet constant-time; anonieme bezoekers krijgen een sessie en een g… | Half fixed: verifyCsrfToken now compares with crypto.timingSafeEqual (server/middleware/security/csrf.ts:54-62). The documented regression clause 'anonymous GET / creates no session row' still fails:… |
| BUG-119 | HIGH | De contract-PDF-endpoints leveren een blanco contract voor een TBD-placeholder en voor ee… | generate/:id en generate-default/:id geven nu 400 op placeholder 3334 en blok 3335, maar GET /api/contracts/data/3334 geeft nog 200 met licensePlate/brand/model/chassisNumber leeg en het verzonnen co… |
| BUG-125 | MEDIUM | `barcode` is een vrij invulbaar clientveld: kentekenscans zijn te kapen en `regenerate` b… | POST /api/vehicles met barcode 'P36C-A' (het kenteken van voertuig 1670) -> 201 en de waarde wordt letterlijk opgeslagen; GET /api/barcodes/P36C-A resolvet daarna naar voertuig 1697 in plaats van 167… |
| BUG-127 | MEDIUM | Kilometerstanden van een afgeronde verhuur zijn vrij bewerkbaar, zonder onderlinge contro… | PATCH returnMileage onder de pickupstand -> 400 (goed), maar PATCH /api/reservations/3306 {returnMileage:39500} geeft 200 terwijl vehicles.current_mileage op 39300 blijft en de respons geen warning-s… |
| BUG-132 | MEDIUM | Een opgehaalde verhuur kan verwijderd of geannuleerd worden terwijl de klant de auto heef… | Opgehaalde verhuur 3309: PATCH /status {cancelled} -> 200 en DELETE /api/reservations/3309 -> 200 (soft delete), beide zonder statusguard of overridepad; er is geen B-besluit over het afbreken van ee… |
| BUG-134 | MEDIUM | Geen portaalmelding bij welke wijziging van kantoor dan ook aan de reservering van een po… | B-06 vraagt om een melding bij datum-/voertuigwijziging en bij annulering, maar PATCH endDate, PATCH vehicleId, PATCH /status {cancelled} en DELETE op reserveringen van portaalklant 179 leveren elk 0… |
| BUG-143 | MEDIUM | Weesrijen overleven omdat er geen FK en geen opruimpad is: onderhoudsblokken op verdwenen… | Het createpad is dicht (POST /api/reservations en een maintenance_block met vehicleId 98765432 -> beide 404 'Vehicle not found'), maar de oude weesrijen leven: select count(*) from reservations r whe… |
| BUG-144 | MEDIUM | De levenscyclusstatussen in de bestaande data komen niet overeen met de statusmachine | PATCH /api/reservations/3318 {status:'picked_up'} -> 200 en PATCH /:id/status {picked_up} -> 200 op een reservering die pas op 2026-11-11 begint; de rij staat daarna op picked_up met actual_pickup_da… |
| BUG-148 | LOW | Databasefouten (23503/23505) worden rauw doorgegeven of op het verkeerde veld gemapt | Twee van de vier regressie-asserts falen: POST /api/reservations met driverId 98765432 -> 400 'Failed to create reservation' en PATCH /:id {driverId:98765432} -> 409 'This record is still linked to o… |
| BUG-149 | LOW | Service-intervalvelden accepteren onzin en zetten de onderhoudsherinnering stilzwijgend u… | PATCH /api/vehicles/1670 {serviceIntervalKm:-5, serviceIntervalMonths:0} -> 400 'The interval must be greater than zero' (goed), maar {lastServiceDate: vandaag+365, lastServiceMileage: 900000} -> 200… |
| BUG-150 | LOW | Bestanden blijven na een voertuigverwijdering voorgoed op schijf staan; documentmappen op… | Er is nog geen purge: DELETE /api/deleted-records/purge en /api/deleted-records/1/purge vallen terug op de SPA-HTML, en server/routes.ts kent alleen GET /api/deleted-records (:2033) en POST /api/dele… |
| BUG-153 | LOW | Het aantal verhuurdagen verschilt één tussen de contractgegevens en het financiële rapport | Reservering 3315 van 2026-12-21 t/m 2026-12-25: GET /api/contracts/data/3315 geeft "duration":"4 days", GET /api/reports/vehicle-financials?from=2026-12-21&to=2026-12-25 geeft rentalDays 5 — nog stee… |
| BUG-157 | LOW | Contractnummers met voorloopnullen: `'0100'` en `'100'` bestaan naast elkaar | Pickup met contractNumber '992899' -> 200 en daarna een pickup met '0992899' -> 200; select id,contract_number geeft beide rijen naast elkaar (3316 '992899', 3317 '0992899'). In lvs_regress vallen no… |
| BUG-161 | HIGH | De accountlockout throttlet een gelijktijdige wachtwoordburst niet: 30 parallelle gokken … | 20 parallelle foute logins op AUDIT-P36D-lock1, elk vanaf een eigen X-Forwarded-For: 10x401 "Incorrect password" (volledige wachtwoordverificatie) + 10x429, twee keer reproduceerbaar; de gedocumentee… |
| BUG-163 | HIGH | De fallbackgenerator levert een plattetekstbestand dat als PDF wordt geserveerd én als PD… | Technisch weg (generateFallbackContract verwijderd in ee037093; GET /api/contracts/generate/3230?templateId=999999 -> 404 "Template not found", geen documents-rij), maar de OPT-014-eigenaarsvraag "ma… |
| BUG-167 | HIGH | Contract- en schadecheck-PDF-endpoints hebben geen permissiecontrole (alleen `requireAuth… | Gebruiker AUDIT-P36D-limited (rol user, permissies [view_vehicles]) krijgt nog steeds 200 op GET /api/contracts/generate/3228, GET /api/contracts/generate-default/3228, POST /api/contracts/generate-v… |
| BUG-170 | HIGH | Eén APK-/onderhouds-/custom-herinnering gaat naar élke klant die ooit een reservering op … | POST /api/notifications/send {vehicleIds:[1883],template:"apk"} -> 200 {sent:3}; de SMTP-stub ving 3 berichten: de huidige houder (audit-p36d-now), een teruggebrachte huurder uit 2021 (audit-p36d-pas… |
| BUG-172 | MEDIUM | Reservering bewerken kent geen optimistic locking: twee tabbladen die het volledige formu… | Twee sessies lezen reservering 3410; A PATCHt de hele rij met nieuwe notes -> 200 (DB: notes=AUDIT-P36D NOTES-FROM-A), B PATCHt daarna zijn verouderde kopie met alleen totalPrice gewijzigd -> ook 200… |
| BUG-179 | MEDIUM | Contractsjabloon-achtergronden degraderen stil: kapot, ontbrekend of verkeerd formaat val… | Deel gefixt (corrupte of ontbrekende achtergrond -> 500 i.p.v. stille standaard; JPEG-bytes met .png-naam -> 400), maar: POST /api/pdf-templates/4/backgrounds/1/select met de achtergrond van sjabloon… |
| BUG-181 | MEDIUM | Sjabloonkeuze valt inconsistent terug: willekeurig contractsjabloon, blanco transportrapp… | (b) generate-report met templateId 999999 -> 404 en (c) de schadecheckroutes kiezen hetzelfde sjabloon, maar (a) is onveranderd: na is_default=false op alle pdf_templates geeft GET /api/pdf-templates… |
| BUG-183 | MEDIUM | `GET /api/vehicles/:id/damage-check-pdf` drukt een oude, niet-gerelateerde reservering af… | Eerste helft gefixt (voertuig 1690 met alleen een reservering uit 2020: GET /api/vehicles/1690/damage-check-pdf geeft paginatekst "AUDIT-P36D DC AU3D7X 12/09/2026" - geen klant, geen contractnummer),… |
| BUG-185 | MEDIUM | Geen idempotentie of retry-bescherming op mail; een vastgelopen bulkverzending logt helem… | Twee identieke POST /api/notifications/send gelijktijdig -> beide 200 {sent:3}; de SMTP-stub ving 6 berichten (elke ontvanger twee keer) en er ontstonden 8 email_logs-rijen (6 per ontvanger + 2 samen… |
| BUG-192 | LOW | Gemengde talen en formaten binnen één document; de `language`-kolom van het sjabloon word… | B-18 besluit "altijd Nederlands, dd-mm-jjjj, bedragen met een komma" is niet geimplementeerd: het contract voor reservering 3228 drukt "September 13, 2026" / "September 20, 2026" / "7 days" af naast … |
| BUG-194 | LOW | Validatiegaten op de PDF- en sjabloon-endpoints: geaccepteerde rommel en een verkeerde st… | Deel gefixt (PATCH /api/pdf-templates/:id met fields "{oops" of een 2 MB-string -> 400 i.p.v. 404; generate-versioned met vehicleId {$gt:0} -> 400; interactive-damage-checks/abc/pdf -> 400; geen driv… |
| BUG-205 | HIGH | Lijstendpoints bedden de volledige voertuig- én klantrij in elke regel in en kennen nerge… | e-api/e-perf on :5003: GET /api/reservations = 1949-1984 rows, 7 590 852-7 736 798 bytes (3 895 B per row, unchanged shape); item[0] still embeds the full vehicle row (81 keys) and the full customer … |
| BUG-209 | MEDIUM | `download-files` archiveert `process.cwd()/uploads` in plaats van `UPLOADS_DIR`; de `down… | Half fixed: GET /api/backups/download-data -> 200, 20 456 897 bytes, contains DROP TABLE IF EXISTS and zero `OWNER TO` lines, and leaves no new file under <cwd>/temp. But GET /api/backups/download-fi… |
| BUG-210 | MEDIUM | De kalenderpagina scrollt horizontaal bij 1182 px, en na het sluiten van een dialoog blij… | Browser at viewport 1182x698 on /reservations: document.documentElement.scrollWidth = 1418 vs clientWidth 1167-1182 (originally 1416 vs 1166) — the named regression test (scrollWidth <= clientWidth a… |
| BUG-212 | MEDIUM | Mislukte GET-requests worden als lege toestand getoond, er is geen requesttimeout, geen r… | Two of the three named expectations landed: a global QueryCache onError toast fires (observed live after login: "Could not load the data / Failed to execute 'json' on 'Response'") and fetchWithTimeou… |
| BUG-214 | MEDIUM | Geen HTTP-compressie: responses van 8 MB / 4,25 MB / 1,65 MB gaan ongecomprimeerd de deur… | Decision B-19 says compression must be on in the application itself; it is not. `curl`-equivalent raw fetch with `Accept-Encoding: gzip` to GET /api/vehicles returns NO content-encoding header at all… |
| BUG-219 | LOW | Herstel hangt af van externe `gunzip`- en `tar`-binaries terwijl zlib en archiver al gebr… | The restore half is fixed: on this Windows host POST /api/backups/restore/database, /restore/files, /restore-files and /restore-data all completed (200 or a deliberate 4xx) with no `spawn gunzip ENOE… |
| BUG-224 | LOW | Documenttijdstempels staan twee uur vóór op de werkelijkheid | The code path is NOT fixed for new rows. A document generated at 21:18:26 CEST (19:18:26 UTC) stored `2026-09-12 21:18:26.112472` in documents.upload_date, the API returned it as "2026-09-12T21:18:26… |
| BUG-228 | LOW | Ongememoiseerde kalenderrendering: per cel een `.filter` over de hele reserveringsset (st… | Partly remediated, two named symptoms unchanged. Fixed: the per-vehicle-cell filter is now a useMemo bucket map (calendar.tsx:947-955, getReservationsForDay reads reservationCells.get(cellKey(...))) … |
| BUG-230 | LOW | Nachtelijke scans: de service-duescan laadt alle voertuigen tweemaal, de RDW-scan doet 66… | Two of the three named sites fixed, one unchanged. Fixed: service-due-scanner.ts:106-107 loads the fleet once and hands it to getServiceDueVehicles({settings, vehicles}) (the function now takes a `pr… |

### CHANGED BY DECISION — 12 bugs

| BUG | Sev | Titel | Bewijs |
|---|---|---|---|
| BUG-013 | HIGH | nieuwe verhuur op een voertuig met actief onderhoudsblok, zonder enige waarschuwing (was … | besluiten B-09 (waarschuwen, medewerker mag doorgaan): blok 3254 (2027-10-01..10-10) daarna standaardhuur 2027-10-03..10-05 -> 201 met warnings:[{"code":"MAINTENANCE_OVERLAP","message":"Let op: dit v… |
| BUG-018 | HIGH | `not_for_rental`/`needs_fixing` voertuig blijft boekbaar via de API (was RS-004) | besluiten B-01 + B-03: voertuig op not_for_rental -> POST /api/reservations 409 {"code":"NOT_FOR_RENTAL"}; voertuig op needs_fixing blijft bewust boekbaar (201) maar de uitgifte wordt geweigerd: POST… |
| BUG-034 | MEDIUM | onderhoudsblok wijzigt `vehicles.availabilityStatus`/`maintenanceStatus` niet (was MT-008) | besluiten B-09 (+B-01/B-03): een blok dat vandaag dekt zet vehicles.availability_status wel degelijk op needs_fixing — niet synchroon bij create (t+0s en t+3s nog 'available/ok') maar via de statussy… |
| BUG-037 | MEDIUM | twee overlappende onderhoudsblokken op hetzelfde voertuig toegestaan (was RS-007 / MT-013) | besluiten B-09 ("twee overlappende onderhoudsblokken op één auto vallen onder dezelfde regel" = waarschuwen, opslaan mag): blok 3421 (2028-11-01..11-10) daarna blok 2028-11-05..11-08 -> 201 met warni… |
| BUG-109 | HIGH | Een voertuig met `needs_fixing` / `maintenance_status=in_service` of een open onderhoudsb… | B-03: voertuig 1753 op needs_fixing + maintenance in_service -> POST /pickup 409 VEHICLE_IN_WORKSHOP (overridable) en PATCH /status {picked_up} 409; pickup met forceWorkshopOverride+forceWorkshopReas… |
| BUG-112 | HIGH | Annuleren van een reservering cascadeert niet: transport blijft gepland, chauffeurstoewij… | B-04: GET /api/reservations/3441/cancel-impact toont transports[54], spares[3442], drivers[296]; PATCH /status {cancelled, cascade:{transports:true,spares:true,placeholders:true,drivers:true}} -> 200… |
| BUG-113 | HIGH | Normaal ingeleverde verhuur (`returned`) telt na drie dagen als "te laat" en blokkeert el… | B-02: POST /api/reservations/3302/return zet de status direct op 'completed' (niet 'returned'); een boeking 30 dagen later op datzelfde voertuig -> 201. Bestaande legacy 'returned'-rijen 313 en 525 b… |
| BUG-129 | MEDIUM | Statuswaarden buiten de statusmachine: 278 reserveringen en 44 voertuigen dragen waarden … | B-02: legacy rij 2175 met status 'active' gaat via PATCH /api/reservations/2175/status {completed} nu naar 200 (voorheen door geen enkele UI-actie te wijzigen); nieuwe schrijfacties produceren alleen… |
| BUG-139 | MEDIUM | Het voertuig van een verhuur met een portaal-onderhoudsblok wisselen laat het blok, de ve… | B-13: PATCH /api/reservations/3367 {vehicleId:1826} laat blok 3368 op het fysieke voertuig 1824 staan, de gekoppelde vervanger vervalt (0 live replacement-rijen) en de klant krijgt portal_notificatio… |
| BUG-140 | MEDIUM | Een transport verwijderen is een harde delete zonder prullenbakvermelding | B-15: DELETE /api/transports/47 -> 204 en GET /api/deleted-records bevat entityType 'transport' (record 40, 'Transport #47 — P36T64813O3 2027-04-10'); restore -> 200 en transport 47 is terug met rela… |
| BUG-151 | LOW | Soft-deleted reserveringen staan niet in de prullenbak en hebben geen herstelpad | B-15: DELETE /api/reservations/3339 -> GET /api/deleted-records bevat 'Reservering #3339 — P36X23272RB 2027-07-29' (record 42); met een inmiddels overlappende boeking geeft restore 409 {"code":"RESER… |
| BUG-211 | MEDIUM | Ophalen mag weken vóór de startdatum, zonder waarschuwing; het voertuig blijft `available… | Decision B-16 (docs/audit/besluiten.md:100). e-api2 on reservation 3397 (startDate 2026-10-22): POST /pickup without an answer -> 409 {"code":"PICKUP_BEFORE_START_DATE","message":"Deze huur begint pa… |

### NOT APPLICABLE — 5 bugs

| BUG | Sev | Titel | Bewijs |
|---|---|---|---|
| BUG-057 | LOW | malformed JSON geeft een volledige Node-stack trace (dev-gated) (was RS-014) | Dev-only en door de eigen bronregel als omgevingsconfiguratie geclassificeerd ("Regressietest: N.v.t."). Runtime op deze dev-server: POST /api/reservations met malformed JSON -> 400 met volledig stac… |
| BUG-076 | MEDIUM | Path traversal bij schrijven in `POST /api/backups/upload` via `originalname` | REFUTED by the plan (09-remediation-plan.md:224, hardening only). Hardening verified: POST /api/backups/upload with filename="../../AUDIT-P36B-esc.sql" -> 200 and the file landed as regress-backups/u… |
| BUG-081 | MEDIUM | Geauthenticeerde mail relay: vrije ontvangers, ongeëscapete HTML en echte bijlagen vanaf … | Deferred by the plan: 09-remediation-plan.md:229 classifies it BUSINESS-DECISION, 'n/a until decided' (OPT-027), and besluiten.md has no B-id for it. Unchanged in code: server/routes.ts:5975-5990 sti… |
| BUG-082 | MEDIUM | `X-Forwarded-For` wordt vertrouwd voor de IP-adressen in de audit-log en `active_sessions` | Deferred by the plan (09-remediation-plan.md:230, DEFERRED until the real Coolify/Traefik hop count is known) - and it still reproduces exactly: logging in with X-Forwarded-For: 198.51.100.94 from 12… |
| BUG-097 | LOW | De bestandsnaamfilter van de backup-routes mist de backslash | REFUTED by the plan (09-remediation-plan.md:245, hardening only). The hardening did land - the includes() blacklist is replaced by an isPlainFilename() basename allowlist (server/routes/backups.ts:64… |


---

## 4. Doorloop van de kernwerkstromen

Alle stappen zijn echte HTTP-verzoeken op :5003, met de uitkomst uit de database ernaast gelegd.
De laatste kolom zet de stap naast de bevinding uit `08-phase-20-33-workflow-rapport.md` §4
(de ketenbreuken B1-1 t/m B4-4).

### 4.1 Keten 1 — klant, reservering, contract, ophalen, innemen, documenten

Scripts: `p36-flow1-rental.cjs`, `p36-flow1b-contract.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Klant aanmaken | HTTP 201, klant 1251 | gelijk |
| 2 | Voertuig aanmaken | HTTP 201, voertuig 1682 | gelijk |
| 3 | Reservering, start morgen | HTTP 201, reservering 3225 | gelijk |
| 4 | Contract genereren | HTTP 200, `application/pdf`, 5 433 B; de tekst bevat klantnaam, adres, kenteken en contractnummer | **beter** — B4-3: genereren registreert nu wel een `documents`-rij |
| 5a | Ophalen vóór de startdatum, zonder antwoord | **HTTP 409 `PICKUP_BEFORE_START_DATE`** — "Deze huur begint pas op 2026-09-13. Gaat de huur vandaag in?" | **nieuw gedrag (B-16)** |
| 5b | Ophalen na "ja" | HTTP 200, status `picked_up`, startdatum verschoven naar 2026-09-12 | **nieuw gedrag (B-16)** |
| 6a | Innemen | HTTP 200 | gelijk |
| 6b | Status na innemen | **`completed`**, `completion_date = 2026-09-12` | **beter** — B1-5: `returned` bleef vroeger staan (B-02) |
| 6c | Einddatum na innemen | **2026-09-17**, de afgesproken datum, ongewijzigd | **beter** — B1-3: innemen overschreef de einddatum vroeger met vandaag |
| 6d | Voertuig na innemen | `available`, kilometerstand 10 200 | gelijk |
| 7 | Documenten bij de reservering | HTTP 200; bekijken en downloaden beide 200 | gelijk |
| 8 | Contract verouderd na een wijziging | Na een datumwijziging krijgt document 261 de status **verouderd**; opnieuw genereren geeft 201 en document 262 | **beter** — B4-1 en B4-2 (B-05); het versienummer staat nu in een eigen kolom |

**Observatie bij stap 4.** Het sjabloon dat in deze database als standaard staat (`gffg`, id 2)
heeft **nul velden**, en generatie weigert daarop met een duidelijke 409: het contract zou blanco
zijn. Dat is precies het gewenste gedrag, maar het betekent ook dat er met de huidige
standaardinstelling van deze database geen contract te maken is tot iemand een sjabloon met velden
als standaard zet. Voor de doorloop is een sjabloon met 20 velden gebruikt.


### 4.2 Keten 2 — onderhoud, vervanger, transport, afronden

Scripts: `p36-flow2-maint.cjs`, `p36-flow2b.cjs`, `p36-flow2c-spare.cjs`, `p36-flow2d.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Onderhoudsblok op een vrije auto | HTTP 201 | gelijk |
| 2 | Boeken over een onderhoudsblok | **HTTP 201 — mag** | **nieuw gedrag (B-09)**: vroeger 409 |
| 3 | Waarschuwing vooraf | `GET /api/reservations/booking-check` geeft `warnings` met code `MAINTENANCE_OVERLAP`: "Let op: dit voertuig staat in deze periode ingepland voor onderhoud (02-10-2026 t/m 04-10-2026). Opslaan mag; het onderhoudsblok blijft staan." | **nieuw (B-09)**, Nederlands, dd-mm-jjjj |
| 4 | Telt de auto als beschikbaar tijdens onderhoud? | `GET /api/vehicles/available` → **nee** | **conform B-01** |
| 5 | Onderhoud op een auto met een lopende huur | HTTP 200 met `needsSpareVehicle:true`, de conflicterende huur en `maintenanceReservationId` | gelijk gedrag, nu met het id erbij |
| 6 | Onderhoud plus vervanger in één handeling | HTTP 201: één blok en één vervangingsreservering | **beter** — B3-2: kostte drie handelingen in twee schermen |
| 7 | Transport aanmaken en afronden | 201 respectievelijk 200 | gelijk |
| 8 | Werkplaatsvlag na het afronden van het transport | blijft **`needs_fixing`**, de notitie blijft staan | **beter** — B2-2: de vlag werd vroeger gewist |
| 9 | Ophalen van een auto in de werkplaats | **HTTP 409 `VEHICLE_IN_WORKSHOP`**, `overridable:true` | **nieuw gedrag (B-03)** |
| 10 | Onderhoud afronden met een datum vóór de start van het blok | HTTP 400 "The completion date cannot be before the block started." | **beter** — B3-3: schreef vroeger een einddatum vóór de startdatum |

**Eén robuustheidsgat, geen achteruitgang.** Laat een aanroeper `maintenanceId` weg bij
`maintenance-with-spare`, dan maakt de server een **tweede** onderhoudsblok aan naast het blok dat
de vorige aanroep al aanmaakte — waargenomen: blok 3329 en 3330 op voertuig 1788, waarvan alleen
3330 aan de vervanger hangt. Het echte scherm stuurt `maintenanceId` wel mee; de server dwingt het
niet af.

### 4.3 Keten 3 — portaalaanvraag, beoordeling aan de balie

Script: `p36-flow3-portal.cjs`, portaalklant 179.

| # | Stap | Resultaat |
|---|---|---|
| 1 | Klant logt in op het portaal | HTTP 200 |
| 2 | Voertuig online zetten | HTTP 200 |
| 3 | Klant dient een boekingsaanvraag in | HTTP 201, aanvraag 577 |
| 4 | Aanvraag in de balie-inbox | HTTP 200, gevonden; teller nieuwe aanvragen = 1 |
| 5 | Oppakken | HTTP 200, status `in_progress` |
| 6 | Goedkeuren | HTTP 200; er ontstaat reservering 3299 |
| 7 | Klant ziet de reservering | HTTP 200, reservering 3299 bovenaan de portaallijst |
| 8 | Portaalmelding voor de klant | HTTP 200, drie meldingen, laatste "Aanvraag #577 afgehandeld" |
| 9 | Aanvraag afgesloten | status `done` |

**Kanttekening.** De aangemaakte reservering heeft `portal_request_id = NULL`: de koppeling bestaat
alleen van de aanvraag naar de reservering, niet terug, terwijl de kolom er wel is.


### 4.4 Keten 4 — back-up en herstel

Script: `p36-flow4-backup.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Back-upgezondheid | 200, `backupPathFromEnv:true`, pad wijst naar `regress-backups`, `stale:false` | **nieuw** |
| 2 | Back-up draaien | 200; database-archief 13 940 612 B mét checksum en manifest, plus een bestandsarchief | gelijk, nu met checksum |
| 3 | Herstel zonder bevestiging | **HTTP 400** "Confirmation does not match. Type the exact backup filename to confirm this restore." | **nieuw** — bevestigingsdrempel |
| 4 | Beschadigd archief, geen gzip | HTTP 400 "Refusing to restore: the dump is only 45 bytes — it is empty or truncated, **so nothing was changed**." | **beter** — vroeger een lege 500 (BUG-197) |
| 5 | Geldige gzip met onzin erin | HTTP 400, zelfde boodschap, 56 B na uitpakken | **beter** |
| 6 | Padtraversal in de bestandsnaam, ook met backslashes | HTTP 404 "Backup file not found" | **beter** |
| 7 | **Goed archief herstellen** | **HTTP 200 in 4 426 ms**; vooraf automatisch een veiligheidsback-up, waarvan de naam in het antwoord terugkomt | **beter** — veiligheidskopie en naamteruggave zijn nieuw |
| 8 | Toestand na het herstel | Database teruggerold naar de momentopname van 19:09: voertuigen 716 naar **645**, reserveringen 2 034 naar **1 948**, gebruikers 23 naar **21** | herstel doet wat het belooft |
| 9 | Server na alles | `/health` 200, uptime 2 755 s, doorgelopen | geen procesimpact |

Twee dingen werken hier **niet**, en die staan als bug in de tabel: `GET /api/backups/download-files`
en `download-code` geven op deze Windows-host nog steeds **500** met de melding
`tar (child): Cannot connect to C: resolve failed` (BUG-209, BUG-219) — het herstelpad is omgezet
naar de npm-`tar`-bibliotheek, het downloadpad roept nog de externe `tar` aan zonder `--force-local`.

### 4.5 Keten 5 — bulkimport

Script: `p36-flow5-import.cjs`.

| Rij | Invoer | Resultaat |
|---|---|---|
| A | APK-datum `31-12-2027`, Nederlandse notatie | geïmporteerd, opgeslagen als **2027-12-31** — geen dagverschuiving |
| B | APK-datum `2027-12-31`, ISO | geïmporteerd, 2027-12-31 |
| C | APK-datum `geen idee` | **afgekeurd met een melding per regel**: "apkDate is not a date we can read (use dd-mm-yyyy or yyyy-MM-dd)" |
| D | APK-datum leeg | geïmporteerd, APK leeg |
| E | geen kenteken | afgekeurd: "License plate is required" |

Eindstand 3 geïmporteerd, 2 afgekeurd, elk met een eigen reden — precies **B-12**. BUG-124
(Nederlandse datums als Amerikaanse lezen, onleesbare datums stil weglaten) is daarmee dicht.

### 4.6 Besloten gedragsveranderingen, apart nagelopen

Script: `p36-flow6-besluiten.cjs`.

| Besluit | Wat er gebeurt | Bewijs |
|---|---|---|
| **B-14** voertuig verwijderen | Eerst een impactlijst, dan een bevestiging ("typ het kenteken"), en pas daarna de weigering | impactlijst 200 met `blocked:true`; verwijderen zonder bevestiging 400 `CONFIRMATION_REQUIRED`; mét bevestiging **409 `VEHICLE_HAS_LIVE_RESERVATIONS`** — "Dit voertuig heeft een lopende of geplande huur en kan niet worden verwijderd." |
| **B-08** klant verwijderen | Zelfde regel | **409 `CUSTOMER_HAS_LIVE_RESERVATIONS`** met de blokkerende reserveringen erbij |
| **B-15** prullenbak | `GET /api/deleted-records` bevat 47 rijen: 9 reserveringen, 10 voertuigen, 1 transport, 27 bekeuringen | terugzetten geeft 200 "Restored Reservering #3375 …"; de reservering staat daarna weer op `booked` |
| **B-17** werkdagscherm | `/api/today` levert `pickups`, `returns`, `maintenance`, `transports`, `spareAssignments`, `portalRequests` en een `counts`-blok — de drie groepen uit B-17, en **geen** lijst "te laat terug", zoals besloten | HTTP 200, 4 790 B, 5 gejoinde queries, geen N+1 |

### 4.7 Werd er iets slechter dan de audit het aantrof?

**Nee, met één uitzondering.** Geen 5xx in de rooktest over 43 schermendpoints, geen procesherstart,
geen werkstroom die vastliep, en twee endpoints die de audit kapot aantrof doen het weer:

| Endpoint | Audit (fase 19) | Nu |
|---|---|---|
| `GET /api/reports/maintenance-costs` | **HTTP 500** (BUG-089) | HTTP 200, 87 005 B, 89 ms |
| `GET /api/reports/mileage-per-month` | 126,9 ms, laadt 17 MB base64 om kilometerstanden te lezen | HTTP 200, 116 729 B, 83 ms |

De uitzondering is **de taal van de gegenereerde documenten**: besluit B-18 is genomen en niet
uitgevoerd (§7). Dat is geen achteruitgang ten opzichte van de audit, maar wel een besluit dat
onuitgevoerd in productie zou komen.

Drie kleinere zaken die opvielen en die géén achteruitgang zijn, maar wel de aandacht verdienen:

1. **De meldingen zijn gemengd Nederlands en Engels.** Alles wat in deze ronde nieuw is gebouwd
   spreekt Nederlands ("Deze huur begint pas op …", "Dit voertuig heeft een lopende of geplande
   huur …"); de oudere meldingen eromheen zijn nog Engels ("This vehicle is marked as needing
   service …", "Invalid pickup date", "Reservation not found"). Een medewerker ziet in één
   werkstroom beide talen.
2. **Een onbekende `/api/…`-route geeft in ontwikkelmodus 200 met HTML** in plaats van 404. De
   404-afhandelaar bestaat (`server/index.ts:450-453`) maar zit in de productietak.
3. **De 429-melding van de verzoeklimiet is kale HTML** ("Too many requests, please try again
   later."), geen JSON met foutcode zoals de rest van de API. Een scherm kan daar niets
   verstandigs mee tonen.


---

## 5. Metingen — wat fase 19 mat, opnieuw gemeten op de gerepareerde code

**Leesinstructie.** De "voor"-kolom komt uit `docs/audit/wip/p19-performance.md`, gemeten op
`lvs_audit` (665 voertuigen / 2 075 reserveringen). De "na"-kolom is `lvs_regress` (499 voertuigen /
1 806 reserveringen plus de P36-fixtures). **De databases zijn niet even groot.** Absolute
bytetotalen zijn daarom niet één-op-één vergelijkbaar; **bytes per rij en statementtellingen wel**,
en dat zijn de getallen waar de conclusies op rusten.

De statementtellingen hieronder zijn gemeten met **dezelfde methode als fase 19**:
`log_min_duration_statement = 0` plus `log_line_prefix = '%t %d %a '`, tellen van `statement:`- en
`execute`-regels die bij `lvs_regress` horen, drie herhalingen waarvan het minimum. De
Postgres-instellingen zijn daarna exact teruggezet op `-1` en `'%t '`. Een tweede controleur kwam
met een andere methode (transactietellerdelta's) op vrijwel dezelfde getallen uit; waar ze
verschillen staan beide vermeld.

### 5.1 De maandweergave van de kalender — de zwaarste klacht van fase 19

| Meting | Voor (fase 19) | Na (fase 36) |
|---|---|---|
| **SQL-statements, maand** | **924** voor 462 rijen (2 per rij, N+1) | **9** voor 392 rijen · tweede meting 11 voor 331 rijen |
| **SQL-statements, heel jaar** | **3 774** voor 1 894 rijen | **11** voor 1 724 rijen |
| Latentie p50 / p95 | 1 275 ms / 3 692 ms | **58,4 ms / 67,1 ms** |
| Latentie, 10 parallel (p95) | 6 893 ms | **361 ms** |
| Payload | 1 651 568 B (3 582 B per rij) | 1 462 700 B (**3 559 B per rij — ongewijzigd**) |

Dit is de duidelijkste winst in het hele rapport. De statementtelling is **constant geworden**: een
maand en een heel jaar kosten evenveel queries. De code laat zien waarom — `getReservationsInDateRange`
(`server/database-storage.ts:2065`) laadt voertuigen, chauffeurs en de klant-van-het-blok nu in
gebundelde `inArray`-queries in plaats van twee tot drie queries per rij, en de vier
`console.log`-regels per onderhoudsblok zijn weg.

Wat **niet** veranderd is: de omvang per rij. De volledige voertuig- en klantrij zit nog in elk
reserveringsitem. Dat is BUG-205, en dat is een eigenaarsbeslissing die nog niet genomen is.

### 5.2 De lijsten

| Endpoint | Voor: bytes (rijen) | Voor: B/rij | Na: bytes (rijen) | Na: B/rij | Oordeel |
|---|---|---|---|---|---|
| `GET /api/reservations` | 8 029 598 (2 075) | 3 869 | 7 736 798 (1 984) | **3 899** | ongewijzigd; `?limit=50` wordt genegeerd |
| `GET /api/vehicles` | 1 157 506 (665) | 1 740 | 1 299 182 (713) | **1 822** | ongewijzigd |
| `GET /api/customers` | 406 358 (348) | 1 168 | 380 828 (332) | **1 147** | ongewijzigd |
| `GET /api/expenses` | 4 252 990 (1 999) | 2 128 | 4 404 949 (1 995) | **2 208** | ongewijzigd |
| **`GET /api/interactive-damage-checks`** | **17 043 541** (14) | 1 217 396 | **4 408** (14) | **315** | **3 866× kleiner** |
| `GET /api/today` | bestond niet | — | 4 790 / 6 285 (8 groepen) | — | nieuw, 5 gejoinde queries |

De schadecheck-lijst is het tweede grote succes: de base64-afbeeldingen zijn uit de lijstprojectie
gehaald, waardoor 17 MB naar 4,4 kB gaat en het rapport dat die lijst gebruikte
(`mileage-per-month`) van 126,9 ms naar 83 ms.

### 5.3 Schrijven tijdens het lezen, en de eerste schermopbouw

| Meting | Voor | Na |
|---|---|---|
| `GET /api/vehicles` doet UPDATE's tijdens het lezen | tot 3 UPDATE's per leesverzoek | **0** — de statementlog toont alleen sessie-select, tweemaal gebruiker, één voertuig-select en de rollende sessie-UPDATE; de teller `n_tup_upd` blijft over drie herhalingen op 0 |
| Reserveringenpagina, eerste opbouw | 9 verzoeken / **19,61 MB** (de 8 MB-lijst werd **twee keer** gehaald) | 8 verzoeken / **11,63 MB** — de lijst wordt nog één keer gehaald |
| Dashboard | 17 verzoeken / 13,06 MB | 17 verzoeken / 12,76 MB |
| Onderhoudskalender | 10 / 10,51 MB | 10 / 10,19 MB |
| Voertuigen | 4 / 8,77 MB | 4 / 8,62 MB |
| Klanten | 5 / 8,05 MB | 5 / 7,74 MB |
| Schadecheck-PDF | 3 465 695 B, p50 581 ms, piek 2 598 ms | **5 619 B**, 96-109 ms, piek **131 ms** |
| Logregels per schermopbouw op het hete pad | 17 566 B consolelog; PDF-generatie 34 regels | **0**; PDF-generatie **1** |
| Verzoek met een lichaam van 2 MB | 400 ná het parsen, +100 MB RSS | **413 in 16 ms** |

De dubbele ophaalactie op de reserveringenpagina is weg (twee cachesleutels voor dezelfde URL zijn
er één geworden): 19,61 MB naar 11,63 MB, ruim 40 % minder. De overige pagina's zijn nauwelijks
veranderd, want daar zat geen dubbeling — daar zit de omvang in de rijen zelf (BUG-205) en in het
ontbreken van compressie.

### 5.4 Compressie — besluit B-19, niet uitgevoerd

**B-19 luidt: "aanzetten in de applicatie zelf, niet afhankelijk van wat de proxy doet."**
Dat is niet gebeurd. Plat gezegd: **er is geen compressie.**

| Controle | Uitkomst |
|---|---|
| `grep compression package.json server/` | **0 treffers** — het pakket is geen afhankelijkheid en er is geen middleware |
| `GET /api/vehicles` met `Accept-Encoding: gzip, deflate, br` | HTTP 200, **geen `content-encoding`-kop**, geen `vary`-kop, `content-length: 983 438` |
| `GET /api/reservations`, idem | 7 047 576 B ongecomprimeerd over de lijn |
| `GET /api/customers`, idem | 361 140 B ongecomprimeerd |
| Wat het zou schelen (gemeten met gzip -6 op dezelfde bytes) | `/api/vehicles` 950 868 → **32 810 B (28,5×)** · `/api/reservations` 6 917 279 → **255 974 B (27×)** |

Dit is geen randgeval: het is de grootste enkele winst die nog op tafel ligt, hij is met één
middleware te halen, het besluit is genomen, en hij zit er niet in. In de tabel is dit **BUG-214,
NOT FIXED**.


---

## 6. De twee opschoningsscripts, in proefdraaimodus

Beide scripts zijn **alleen als proefdraai** uitgevoerd, tegen `lvs_regress`. Ze schrijven niets
zonder `--apply`, en ze weigeren te schrijven buiten `lvs_fixtest` zonder een expliciete vlag.
De aanroep die nodig was op deze host:

```
DATABASE_SSL=false DATABASE_URL='postgresql://postgres:postgres@localhost:5432/lvs_regress?sslmode=disable' \
  npx tsx scripts/close-returned-reservations.ts
```

(zonder `DATABASE_SSL=false` breekt beide scripts af op "The server does not support SSL connections" —
het startscript van de server zet die variabele wel, de losse scripts niet. Dat is een kleine
bedieningsvalstrik voor wie dit ooit in productie draait.)

### 6.1 `close-returned-reservations.ts` (B-02)

```
[B-02] 4 live reservation(s) sit on 'returned'. Re-run with --apply to close them.
```

**Vier rijen.** Dat is niet wat het besluit verwacht, en dit is de belangrijkste bevinding van deze
paragraaf. `besluiten.md` B-02 zegt: *"Eenmalige bulkactie sluit de bestaande oude rijen af die nu
voertuigen blokkeren (788 rijen / 423 voertuigen in de dev-kloon)."* Het script zoekt alleen op
`status = 'returned'`, en zo veel rijen met die status zijn er niet.

De 788 uit het besluit blijken iets anders te tellen. Op dezelfde kloon:

| Telling | SQL | Uitkomst |
|---|---|---|
| Rijen met status `returned`, niet verwijderd | `status='returned' and deleted_at is null` | **4** |
| Rijen die een voertuig blokkeren: niet afgesloten, einddatum in het verleden | `deleted_at is null and status not in ('completed','cancelled') and end_date < vandaag` | **790 rijen / 417 voertuigen** |

Uitgesplitst: 380 `booked`, 363 `picked_up`, 38 `active`, 4 `returned`, 4 `scheduled`, 1 `in`.

**Gevolg:** het script zoals het er nu staat sluit **4 van de 790** blokkerende rijen af. De
eenmalige bulkactie uit B-02 is daarmee feitelijk niet geleverd. De vraag welke van die 790 rijen
afgesloten mogen worden — een `picked_up`-rij uit 2024 is iets anders dan een `booked`-rij van
vorige week — is een eigenaarsbeslissing die nog niet gesteld is. Dit rapport verandert niets; het
meldt alleen dat het getal in het besluit en het getal in het script niet hetzelfde meten.

### 6.2 `normalize-license-plates.ts` (B-10)

```
[B-10] geen botsingen. 11 voertuig(en) staan niet in genormaliseerde vorm.
Draai opnieuw met --apply om ze op te schonen en de unieke index te plaatsen.
```

Die 11 zijn **alle elf testvoertuigen van deze fase** (`P36A-V1-…`, `P36C-A` … `P36C-H`). Op de
onaangeroerde, productievormige kloon is het antwoord schoon:

| Telling op `lvstest` (alleen gelezen, niets gewijzigd) | Uitkomst |
|---|---|
| Voertuigen | 499 |
| Kentekens die na normalisatie veranderen | **0** |
| Groepen die na normalisatie samenvallen (botsingen) | **0** |

**Dat is het antwoord op de vraag die B-10 vooraf stelde.** Er zijn geen voertuigen die na
normalisatie samenvallen, dus de opschoning en de unieke index kunnen zonder samenvoegingsbesluit
geplaatst worden. Het script stopt correct bij botsingen; er zijn er geen.

Eén losse waarneming die hier bij hoort: BUG-157 (contractnummers met en zonder voorloopnul naast
elkaar) staat nog open, en in `lvs_regress` zijn **drie** zulke botsingsgroepen. Dat is een andere
kolom dan het kenteken en valt buiten dit script.


---

## 7. Wat nog open staat

De 42 NOT FIXED-bugs vallen in vier groepen. De eerste groep is de groep die telt.

### 7.1 Echt gemist — het plan noemt ze gesloten, ze zijn het niet

**BUG-069 (HIGH) — uitpakken van een archief over de applicatiemap.**
Het plan zet deze in cluster FIX-L ("restore safety"); geen enkele commit noemt hem.
`/api/backups/restore-files` **is** gerepareerd: een archief met `dist/server/index.js` erin geeft
400 met "entries that would be written outside the uploads directory".
Maar **`/api/backups/restore-code` pakt nog steeds uit over `process.cwd()`**, achter alleen een
filter op `..` en absolute paden (`server/routes/backups.ts:424-440`), en doet daarna
`process.exit(0)` (`:452`). Datzelfde filter, nagespeeld in een afgeschermde map op de
gedocumenteerde lading, wees **nul** items af en schreef `dist/server/index.js` en een
`node_modules`-bestand weg. De route is bewust niet echt afgevuurd — dat zou de draaiende
applicatie overschrijven. Dit is een pad van een archiefupload naar het draaien van eigen code.

**BUG-070 (HIGH) — willekeurig pad in `backgroundPath`.**
De helft die er het meest toe deed is dicht: een bestand buiten de uploadsmap **overleeft** het
verwijderen van een sjabloonachtergrond. Maar het pad wordt nog steeds aangenomen:
`PATCH /api/pdf-templates/2` met `backgroundPath: "../../AUDIT-P36B-canary.txt"` geeft **200** en
slaat die waarde op; hetzelfde geldt voor `PUT /api/damage-check-templates/1`.

**BUG-009 (HIGH) — de inloglimiet is te omzeilen met een verzonnen afzender-IP.**
Het plan zet deze op DEFERRED omdat het echte aantal proxystappen van Coolify onbekend is. Dat
verklaart de meting niet: **tien inlogpogingen achter elkaar, elk met een andere verzonnen
`X-Forwarded-For`, gaven tien keer 401** en geen enkele 429 — terwijl dezelfde tien pogingen vanaf
één IP bij nummer 6 een 429 geven. `app.set("trust proxy", 1)` staat er (`server/auth.ts:182`) en
`loginLimiter` heeft geen eigen `keyGenerator`. De rem op wachtwoordraden is daarmee vanaf het open
internet uit te zetten, ongeacht hoeveel proxystappen er zijn.

**BUG-161 (HIGH)** hoort bij dezelfde familie: twintig parallelle foute inlogpogingen vanaf twintig
IP's leveren tien volledige wachtwoordverificaties op voordat de limiet ingrijpt, waar de audit ~5
als plafond noemde. De accountvergrendeling zelf werkt wel.

**BUG-192 — besluit B-18 is genomen en niet uitgevoerd.**
Op papier LOW, in de praktijk zichtbaar op elk document dat een klant krijgt. Het contract drukt
`September 13, 2026`, `September 20, 2026` en `7 days` — Engels, Amerikaanse notatie — pal naast
`12 september 2026` en `€ 1.234,50`, die wél Nederlands zijn. De bron is één plek:
`server/utils/pdf-generator.ts:440-442` gebruikt `format(startDate, 'MMMM d, yyyy')` zonder locale
en bouwt `duration` als een Engelse tekst. De transportbrief zegt "Vehicle Swap" en "Tow" en toont
`€0.00` met een punt; de schadecheck mengt `12-09-2026` met `12/09/2026`. Twee controleurs vonden
dit onafhankelijk van elkaar. **Dit is nadrukkelijk geen CHANGED BY DECISION:** het besloten gedrag
is aantoonbaar niet wat de applicatie produceert.

**BUG-214 — besluit B-19 is genomen en niet uitgevoerd.**
Geen compressiemiddleware, geen afhankelijkheid in `package.json`, geen `content-encoding` op welk
antwoord dan ook. Zie §5.4 voor de cijfers: 27 tot 28 keer kleiner, met één middleware.

**BUG-224 — tijdstempels zonder tijdzone.**
Het codepad is **niet** gerepareerd voor nieuwe rijen: een document dat om 21:18:26 Nederlandse tijd
is gemaakt, staat als `21:18:26` in een kolom zonder tijdzone, komt als `…T21:18:26Z` terug en toont
in het scherm **23:18:26** — precies de +120 minuten uit de bug. Het schema heeft nog 101 kolommen
`timestamp without time zone` en nul met tijdzone.


### 7.2 Wachtend op een eigenaarsbesluit dat nooit gesteld is

Deze reproduceren nog precies zoals beschreven, maar het plan verbiedt ze te repareren zonder
besluit, en in `besluiten.md` staat geen B-nummer dat ze dekt. Ze zijn niet gemist — ze zijn
**niet gevraagd**.

| Bug | Zwaarte | De vraag die beantwoord moet worden |
|---|---|---|
| BUG-024 | MEDIUM | Mag een nieuw wachtwoord gelijk zijn aan het oude? Nu wel, en er is geen wachtwoordhistorie. |
| BUG-040 | MEDIUM | Mag een reservering in het verleden worden aangemaakt? Nu wel — en die blokkeert daarna elke toekomstige boeking op dat voertuig. |
| BUG-045 | MEDIUM | Moet een debiteurnummer uniek zijn? Nu niet, en er komt geen waarschuwing. |
| BUG-056 | LOW | Wat moet een terugkerende reservering doen? De velden zijn vrij te zetten, er ontstaan geen kindrijen. |
| BUG-132 | MEDIUM | Mag een opgehaalde verhuring geannuleerd of verwijderd worden, en door wie? Nu allebei, zonder drempel. |
| BUG-163 | HIGH | Mag contractgeneratie hard falen in plaats van een onbruikbaar bestand leveren? De noodoplossing is weg en een onbekend sjabloon geeft 404, maar de OPT-014-vraag is onbeantwoord; B-05 gaat alleen over verouderde documenten. |
| BUG-167 | HIGH | Welke permissie mag een contract genereren en de klantgegevens erin zien? Zie hieronder. |
| BUG-170 | HIGH | Wie krijgt een voertuigherinnering? Zie hieronder. |
| BUG-081 | MEDIUM | Dezelfde OPT-027-vraag over ontvangers; in de tabel als NOT APPLICABLE geteld omdat het plan hem uitstelt. |

Twee daarvan verdienen een eigen zin, omdat het wachten op een besluit hier een open deur laat staan:

**BUG-167.** Een account met uitsluitend `view_vehicles` krijgt **200** op `contracts/generate`,
`generate-default`, `generate-versioned` én `contracts/data` — dat laatste met adres, telefoonnummer
en rijbewijsnummer van de klant — en schrijft daarbij gewoon `documents`-rijen weg. Alleen de
schadecheckroutes geven inmiddels 403. Zolang de permissievraag onbeslist is, staat inzage in
klantgegevens open voor de laagste rol die er is.

**BUG-170.** Eén APK-herinnering voor één voertuig leverde **drie** verzonden mails op: de huidige
houder, iemand die het voertuig in 2021 huurde, en iemand van wie de huur pas in juli 2027 begint.
`server/routes/notifications.ts:130-143` koppelt voertuig aan reservering aan klant zonder filter op
status of datum en zonder ontdubbeling.

### 7.3 Half gerepareerd — de bug is kleiner geworden, niet weg

Voor elk hiervan slaagt een deel van de gedocumenteerde regressietest en een ander deel niet; de
exacte bewijsregel staat in de tabel van §3.

BUG-054 (tekst als prijs wordt stil `NULL`) · BUG-055 (documenten overleven het verwijderen van hun
reservering) · BUG-096 (een anoniem verzoek maakt nog steeds een sessierij) · BUG-119
(`contracts/data` geeft nog een verzonnen contractnummer voor een placeholder en voor een
onderhoudsblok) · BUG-125 (een barcode mag het kenteken van een ánder voertuig zijn) · BUG-127 (de
kilometerstand van het voertuig loopt niet mee met een correctie) · BUG-148 (twee van de vier
foutmeldingen nog generiek) · BUG-149 (laatste servicebeurt mag in de toekomst en boven de
tellerstand liggen) · BUG-150 (geen definitief legen van de prullenbak; uploads nog op kenteken
gesleuteld) · BUG-153 (huurdagen verschillen tussen contract en financieel rapport) · BUG-157
(contractnummer met en zonder voorloopnul naast elkaar) · BUG-172 (bij twee tabbladen wint de
laatste opslag stil) · BUG-179 (achtergrond van een ánder sjabloon is selecteerbaar; een verwijderde
achtergrond blijft aangewezen) · BUG-181 (zonder standaardsjabloon wordt gewoon de eerste rij
gebruikt) · BUG-183 (een open reservering krijgt een verzonnen periode van zeven dagen) · BUG-185
(twee gelijktijdige verzendingen sturen alles dubbel) · BUG-194 (lege naam, `fields:null` en
negatieve labelmaten worden nog geaccepteerd; drie routes geven nog 500) · BUG-209 en BUG-219
(`download-files` en `download-code` geven nog 500 door `tar` zonder `--force-local`) · BUG-210 (het
reserveringenscherm scrolt horizontaal op tabletbreedte) · BUG-212 (geen verbindingsindicator, vijf
rapportcomponenten zonder foutafhandeling) · BUG-228 en BUG-230 (telkens één van de genoemde plekken
nog ongewijzigd) · BUG-205 (lijsten zonder paginering, volledige voertuig- en klantrij nog ingebed —
formeel een eigenaarsbeslissing).

### 7.4 Bestaande gegevens die niet opgeschoond mogen worden

Het plan verbiedt in §1.2.3 elke wijziging aan bestaande gegevens. Voor deze twee is het **codepad**
beoordeeld en de **gegevensvoorraad** geteld.

| Bug | Codepad voor nieuwe rijen | Nog aanwezige oude rijen |
|---|---|---|
| **BUG-143** | **Dicht** — een reservering of onderhoudsblok op een niet-bestaand voertuig geeft 404 "Vehicle not found" | **258 weesrijen**, alle van het type `maintenance_block`; nog steeds geen foreign key op `reservations.vehicle_id` |
| **BUG-144** | **Niet dicht** — een statuswijziging naar `picked_up` geeft 200 op een verhuring die pas op 2026-11-11 begint, met lege ophaaldatum en lege ophaalkilometerstand | 363 rijen `picked_up` met een einddatum in het verleden · 123 `picked_up` met een startdatum in de toekomst · 340 blijvende `booked` |

BUG-143 is daarmee nog alleen een opschoningsvraag; **BUG-144 is ook nu nog een codegat.**

### 7.5 Terecht niet gerepareerd

BUG-057 (stacktrace in ontwikkelmodus — bewust aan `NODE_ENV` gebonden; commit `4828c2d1` voegde er
een luide startwaarschuwing aan toe) · BUG-076 en BUG-097 (door het plan weerlegd; de verharding is
er wél — de zwarte lijst is vervangen door een `isPlainFilename()`-toets en geen van de twaalf
traversalladingen leverde bestandsinhoud op) · BUG-081 en BUG-082 (door het plan uitgesteld).

Let op bij **BUG-082**: die reproduceert nog exact. Een verzonnen `X-Forwarded-For` komt letterlijk
in `active_sessions.ip_address` én in `audit_logs.ip_address` terecht, terwijl de echte tegenpartij
127.0.0.1 is. Het IP-adres in het auditspoor is dus door de client te verzinnen — dat is precies de
kolom waarnaar gekeken wordt als er ooit weer iets verdwijnt.

### 7.6 Twee randgevallen waar dit rapport zelf een keuze heeft gemaakt

**BUG-030 en BUG-049 staan op FIXED.** De inhoudelijke fout (een 500 werd een 400) is verholpen.
Hun regressietest eist letterlijk "geen `stack`-veld, ongeacht `NODE_ENV`", en in ontwikkelmodus zit
die stacktrace er nog. Dat is hetzelfde gedrag dat het plan bij BUG-057 als omgevingskwestie heeft
geclassificeerd, dus het is hier consequent zo behandeld. Wie de regressietest letterlijk leest, mag
ze NOT FIXED noemen; aan wat de code doet verandert dat niets.

**BUG-034 staat op CHANGED BY DECISION (B-09)**, met twee kanttekeningen voor de eigenaar van
OPT-006: het omzetten naar `needs_fixing` gebeurt niet meteen maar via de statussynchronisatie
(waargenomen na ongeveer 23 seconden) en draait niet terug als het blok wordt verwijderd; en een
onderhoudsblok in de **toekomst** haalt het voertuig niet uit `GET /api/vehicles/available` voor die
periode — wat wringt met B-01.


---

## 8. Wat is veranderd voor de gebruiker

Dit is de lijst voor het handboek (fase 37 en verder): gedrag dat een medewerker of een
portaalklant daadwerkelijk merkt. Alles hieronder is in deze fase op :5003 waargenomen, niet
afgeleid uit de code.

### 8.1 Ophalen en innemen

1. **De app vraagt of de huur eerder ingaat.** Wordt een auto opgehaald vóór de afgesproken
   startdatum, dan verschijnt eerst een vraag: "Deze huur begint pas op … . Gaat de huur vandaag
   in?" Bij ja schuift de startdatum naar vandaag en klopt de periode weer met de prijs; bij nee
   gebeurt er niets. Vroeger ging het ophalen gewoon door. *(B-16)*
2. **Innemen sluit de huur meteen af.** De reservering gaat direct op "afgesloten" en de auto is
   meteen weer vrij. Er is geen tussentoestand meer die dagen later de auto nog blokkeert. *(B-02)*
3. **De afgesproken einddatum blijft staan.** Innemen overschrijft de einddatum niet meer met
   vandaag; de werkelijke innamedatum komt in een eigen veld.
4. **Een auto uit de werkplaats kan niet zomaar mee.** Staat de auto op "moet gerepareerd worden"
   of "in onderhoud", dan wordt de uitgifte geweigerd. Een beheerder kan met opgaaf van reden toch
   doorgaan. *(B-03)*
5. **Een contractnummer dat al bestaat wordt geweigerd** met de melding welke reservering het al
   gebruikt, in plaats van een technische databasefout.

### 8.2 Boeken en plannen

6. **Boeken over een onderhoudsblok mag, met een waarschuwing.** Het scherm meldt vooraf: "Let op:
   dit voertuig staat in deze periode ingepland voor onderhoud (… t/m …). Opslaan mag; het
   onderhoudsblok blijft staan." Opslaan blijft mogelijk. Vroeger weigerde de app dit. *(B-09)*
7. **"Beschikbaar" betekent overal hetzelfde:** vrij in de gevraagde periode én status in orde. Een
   auto in onderhoud telt niet mee als beschikbaar, ook al mag hij wél bewust geboekt worden. *(B-01)*
8. **Dubbel boeken lukt niet meer, ook niet als twee mensen tegelijk opslaan.** Van twintig
   gelijktijdige pogingen op dezelfde auto en periode slaagde er precies één; de andere negentien
   kregen een nette conflictmelding met de botsende reservering erbij.
9. **Onderhoud met vervanger is één handeling geworden.** Blok plaatsen, vervanger toewijzen en de
   klantreservering bijwerken gebeuren in één keer in plaats van drie handelingen over twee
   schermen. Ook afronden is één knop.
10. **De werkplaatsvlag verdwijnt niet meer** als een transport wordt afgerond of een auto wordt
    ingenomen. De notitie erbij blijft ook staan.

### 8.3 Verwijderen en terughalen

11. **Een auto of klant met een lopende of geplande huur gaat niet weg.** De app toont eerst een
    impactlijst, vraagt dan om een bevestiging — bij een auto: typ het kenteken — en weigert daarna
    met een Nederlandse uitleg en de blokkerende huren erbij. *(B-14, B-08)*
12. **Er is een prullenbak voor reserveringen en transporten**, naast die voor voertuigen. Wat
    verwijderd is, is terug te zetten en staat onder "Verwijderde records" met wie het wanneer
    verwijderd heeft. *(B-15)*
13. **Annuleren vraagt wat er met het bijbehorende moet.** Transport, vervangingsreservering en
    chauffeurstoewijzing worden getoond, en per onderdeel wordt gevraagd of het mee moet. *(B-04)*


### 8.4 Documenten

14. **Een gewijzigde reservering markeert het contract als "verouderd"**, met een knop "opnieuw
    genereren". Het oude document blijft bewaard. Vroeger bleef er een contract staan met de oude
    prijs zonder dat iets dat liet zien. *(B-05)*
15. **Het versienummer staat niet meer in de documentsoort.** Er staat niet langer "Contract
    (Unsigned) 2" in de typekolom; de versie heeft een eigen veld.
16. **Een sjabloon zonder velden levert geen blanco contract meer op.** De app weigert met de uitleg
    dat het sjabloon geen velden heeft. *Let op: het sjabloon dat nu als standaard staat is er zo
    één — er moet vóór ingebruikname een sjabloon mét velden als standaard worden gezet.*
17. **Het schadecheck-PDF is van 3,4 MB naar 5,6 kB gegaan** en wordt in ongeveer 100 milliseconden
    gemaakt in plaats van een halve tot ruim twee seconden.
18. **Nog niet veranderd, wel besloten:** de datums op het contract staan nog in het Engels
    ("September 13, 2026", "7 days") naast Nederlandse datums en bedragen. Besluit B-18 schrijft
    overal Nederlands met dd-mm-jjjj voor. **Dit hoort niet in het handboek als "zo werkt het" —
    het is openstaand werk.**

### 8.5 Dagelijks werk

19. **Er is een werkdagscherm "Vandaag"** met drie groepen: wat vandaag opgehaald en ingenomen moet
    worden (met de knop om dat meteen te doen), onderhoud en transport van vandaag inclusief nog toe
    te wijzen vervangers, en nieuwe portaalaanvragen. Er is bewust géén lijst "te laat terug". *(B-17)*
20. **De kalendermaand opent merkbaar sneller:** van ruim een seconde naar ongeveer 60
    milliseconden, en van 924 databasevragen naar negen. Bij drukte is het verschil groter: tien
    gelijktijdige gebruikers gingen van bijna zeven seconden naar ongeveer een derde seconde.
21. **De reserveringenpagina haalt de lijst nog maar één keer op** in plaats van twee keer: van
    19,6 MB naar 11,6 MB per schermopbouw.
22. **De zoekbalk wacht tot je uitgetypt bent** en vindt nu ook een contractnummer — het nummer dat
    een klant aan de telefoon voorleest.
23. **Er is geschiedenis per record**: wie wat wanneer wijzigde, per reservering, voertuig of klant.
24. **Bulkacties geven een resultaat per regel** in plaats van één melding voor de hele stapel.
25. **Bij importeren wordt een onleesbare datum per regel afgekeurd** met de reden erbij; de overige
    regels worden gewoon geïmporteerd, en een Nederlandse datum verschuift geen dag meer. *(B-12)*

### 8.6 Dingen die kunnen verrassen

26. **De app kan "te veel verzoeken" antwoorden.** Er geldt nu een limiet van 1 000 verzoeken per
    kwartier per gebruiker, en vijf mislukte inlogpogingen per kwartier per werkplek. Wie veel
    tabbladen openhoudt of een lange bulkactie draait, kan die grens raken. De melding die dan
    verschijnt is kale technische tekst; dat mag het handboek benoemen.
27. **Een herstel van een back-up vraagt om de bestandsnaam.** De medewerker moet de exacte
    bestandsnaam overtypen voordat het herstel begint, en de app maakt vooraf automatisch een
    veiligheidskopie waarvan de naam in de bevestiging staat.
28. **Een beschadigde of onvolledige back-up wordt geweigerd met uitleg** — "de dump is maar 45
    bytes, er is niets gewijzigd" — in plaats van een lege foutmelding.
29. **De meldingen zijn nog gemengd Nederlands en Engels.** Alles wat in deze ronde nieuw is gebouwd
    spreekt Nederlands; de oudere meldingen eromheen niet. In één werkstroom komen beide talen voor.


---

## 9. Bewijsmateriaal

Alles staat in `docs/audit/wip/scripts/p36/`:

| Bestand | Inhoud |
|---|---|
| `results-A.jsonl` … `results-E.jsonl` | oordeel plus bewijsregel per bug, alle 230 |
| `aggregate.json`, `table-all.md`, `sections.md` | de samengevoegde uitslag en de tabellen in dit rapport |
| `bugindex.json` | reproductie en regressietest per bug, uit de rapporten 03 t/m 07 |
| `p36-killcheck.cjs` | de proceskill-tests (BUG-002, BUG-061, BUG-101) |
| `p36-flow1…flow6*.cjs`, `flow*.json` | de werkstroomdoorloop |
| `p36-smoke.cjs`, `smoke.json` | de rooktest over 43 schermendpoints |
| `p36-measure.cjs`, `p36-sqlcount3.cjs`, `measurements.json`, `sqlcount.json` | de metingen van de leider |
| `e-perf.out.json`, `e-sqlcount.out.json`, `e-compress.out.json` | de metingen van de tweede controleur |
| `a-*.cjs`, `b-*.cjs`, `p36c-*.cjs`, `p36d-*.cjs`, `e-*.cjs` | de probescripts per bugbereik |
| `vitest.out` | de volledige uitvoer van de eenheidstestsuite |

De originele auditscripts onder `docs/audit/wip/scripts/` zijn niet gewijzigd; wat nodig was is
gekopieerd naar `p36/` en op poort 5003 gericht. Aan de applicatiecode is niets veranderd —
`git diff HEAD` is leeg, en `git status` toont alleen de onbewaakte map `p36/`.

### Fixtures die in `lvs_regress` zijn achtergebleven

Alles draagt een `AUDIT-P36`-voorvoegsel. Testaccounts: `audit-p36w`, `AUDIT-P36B-nobody`,
`AUDIT-P36B-viewer`, `AUDIT-P36B-manager`, `AUDIT-P36D-adm`, `AUDIT-P36D-limited`. Het wachtwoord
van de bestaande portaalgebruiker `portaal-test@example.com` is gezet om de BUG-002-reproductie te
kunnen draaien. Twee controleurs hebben waarden die zij tijdelijk overschreven
(`pdf_templates.background_path`, `damage_check_templates.background_path`, `app_settings` id 7,
`pdf_templates.is_default`) uit de vooraf gemaakte dump teruggezet.

**Let op bij hergebruik van deze database:** de laatste handeling van deze fase was de hersteltest
uit §4.4 stap 7. `lvs_regress` staat daardoor op de momentopname van 19:09 uur — voertuigen 645,
reserveringen 1 948, gebruikers 21. Fixtures die ná dat tijdstip zijn aangemaakt, en de
bewijsregels in dit rapport die daarnaar verwijzen, bestaan in de database niet meer. De
veiligheidskopie van vlak vóór het herstel staat als
`regress-backups/database/2026/09/12/db-backup-2026-09-12T19-33-33-865Z.sql.gz`.

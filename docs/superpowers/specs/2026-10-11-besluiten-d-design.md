# Deelproject D — de B-41-besluiten: ontwerp

Status: concept voor goedkeuring door de eigenaar (2026-10-11). Bron: docs/audit/besluiten.md B-41 (antwoorden van Kees op D1–D20, de fiscale prullenbak en "Pech"). Feiten: `.superpowers/sdd/2026-10-11-besluiten-d/facts-*.md`. Basis: `main` = a47d98b9, branch `feat/besluiten-d`.

Bindende regels uit constraints.md gelden onverkort: geen guard verruimd of vernauwd buiten dit ontwerp; teksten via i18next nl+en; client vertaalt op code; migraties idempotent en nooit abortend; E2E `retries: 0`, guards.ts onaangeraakt; één Playwright-eigenaar; geen test-omweg in servercode.

De voorstellen waar het besluit ruimte laat staan als **Voorstel** en zijn in de Nederlandse samenvatting aan Kees voorgelegd.

---

## 1. Kosten: tankbedrag wordt kostenpost (D1)

**Besluit.** Een tankbedrag bij "Brandstofstatus bijwerken" wordt ook een kostenpost (categorie `fuel`) op dat voertuig; "laatste tankbedrag" op het voertuig blijft.

**Ontwerp.**
- `PATCH /api/vehicles/:id/fuel-status` (routes.ts:1961-2045) valideert `cost` server-side (positief getal ≤ 1.000.000; anders 400 `FUEL_COST_INVALID`) en maakt, als er een bedrag is, in dezelfde request één kostenpost: `vehicleId`, `category: "fuel"`, `amount`, `date = isoToday()`, `description = "Tankbeurt <niveau> <datum>"` (nl-vast, want het is data; de weergave vertaalt niet), `createdBy`. De bon van de tankbeurt wordt dé bon van de kostenpost: het bestand komt in `uploads/<plate>/fuel_receipt/`, de kostenpost krijgt `receiptFilePath` daarnaar; het voertuig houdt `fuelRefillReceipt` op hetzelfde pad.
- **Idempotentie en koppeling.** Nieuwe kolom `expenses.source` (text, nullable; waarde `fuel_refill`) en `expenses.source_ref` (text, nullable; `vehicle:<id>:<fuelRefillDate ISO>`). Bij een tweede update met hetzelfde niveau, bedrag en datum binnen 2 minuten (dubbelklik, herhaalde verzending) wordt geen tweede kostenpost gemaakt (lookup op `source_ref`). Een bewust nieuwe tankbeurt op dezelfde dag krijgt een andere `fuelRefillDate` en dus een nieuwe kostenpost. Kolommen via `shared/schema.ts` + manifest (`schema-columns.json`), geen datamigratie.
- **Rechten.** Voorstel: het aanmaken van deze kostenpost is een gevolg van de brandstofupdate en vraagt géén "Kosten beheren"; de route blijft `MANAGE_VEHICLES`. De kostenpost is daarna alleen te bewerken door wie Kosten beheren heeft (bestaande regels).
- **Audit.** De route schrijft zelf een `expense.create`-auditregel (`AuditLogger.logFromRequest`, zoals purge/restore), details `{source: "fuel_refill", vehicleId, amount}`; de bestaande `vehicle.fuel-status`-regel blijft.
- **Transactie.** `createExpense` krijgt een optionele `tx`; voertuigupdate en kostenpost in één transactie; bij een fout van de kostenpost wordt niets opgeslagen en antwoordt de route 500 `FUEL_EXPENSE_FAILED` (bestandsupload wordt dan weer verwijderd).
- **Purge-veiligheid.** `vehicles.fuelRefillReceipt` komt in `EXTRA_LIVE_COLUMNS` van recycle-bin-purge.ts, zodat het legen van een kostenpost het bonbestand niet weghaalt zolang het voertuig ernaar wijst.
- **Client.** Het dialoog toont na opslaan "Brandstofstatus bijgewerkt; kostenpost van € 45,50 geboekt" (nl/en). De socket-broadcast `expenses.created` zorgt dat Kosten-lijsten verversen; het dialoog roept daarnaast `invalidateExpenseData` aan. Het veld "laatste tankbedrag" wordt zichtbaar op de Brandstof-kaart in voertuigdetails (bedrag + datum; nu nergens getoond).
- **Tests.** Server: bedrag → kostenpost `fuel` met bon, geen bedrag → geen kostenpost, dubbele verzending → één kostenpost, ongeldig bedrag → 400, transactie rolt terug. Client: toast, invalidatie. Bestaand `fuel-status-cost-p1.test.tsx` blijft.

## 2. Bulkimport: onbekende kentekens (D2)

**Besluit.** Niet aanmaken bij "niet gevonden" (wel bij een RDW-storing, met waarschuwing), tenzij het vinkje "ook onbekende kentekens aanmaken" aanstaat; zulke regels tellen als waarschuwing, niet als geslaagd.

**Ontwerp.**
- Beide importroutes (`bulk-import-plates`, `bulk-import-csv`) krijgen bodyoptie `createUnknown: boolean` (standaard false). Voorstel: het vinkje geldt voor beide tabbladen (kentekens en CSV); B-41 zegt "bulkimport" zonder onderscheid.
- Per rij drie uitkomsten: `imported` (RDW ok), `warnings` (nieuw: `{licensePlate, code, vehicle?}`), `failed`. Codes: `RDW_NOT_FOUND_SKIPPED` (niet aangemaakt), `RDW_NOT_FOUND_CREATED` (aangemaakt wegens vinkje, als "Unknown/Unknown" of met de CSV-waarden), `RDW_UNAVAILABLE_CREATED` (storing: aangemaakt zonder RDW-gegevens, zoals vandaag; OPT-031 blijft). `enrichFromRdw` levert al `reason`; de route vertaalt `not_found` vs `timeout|upstream|error`.
- Antwoord `{imported, warnings, failed, maxBatch}`; de teller in de toast telt geslaagd / waarschuwing / mislukt apart (nl/en).
- Client: checkbox `checkbox-import-create-unknown` boven de invoer (beide tabbladen), standaard uit; resultaatkaart met drie groepen; waarschuwingstekst per code via `describeApiError`-achtige mapping in vehicles.json (niet meer "Niet gevonden bij de RDW" voor een storing).
- Tests: opt-031 :82-110 wordt herschreven (not_found → warning zonder voertuig; met vinkje → warning met voertuig; timeout → warning met voertuig), overige blijven.

## 3. Reserveringsstatus alleen via handelingen (D3)

**Besluit.** Statusveld uit het formulier; nieuw is altijd Geboekt; status verandert alleen via Ophalen, Inleveren, Annuleren en Terugdraaien.

**Ontwerp.**
- **Client.** reservation-form.tsx: FormField status (:2199-2234) weg; de "kies Opgehaald → open ophaaldialoog"-logica (:1275-1307) weg; de velden die alleen bij `completed` zichtbaar waren (vertrekkilometerstand, brandstof retour, brandstofkosten; :2264-2326) verdwijnen uit het formulier (ze worden door Inleveren gezet en zijn in de reserveringsweergave te zien). Contractnummer blijft bewerkbaar via het bestaande aparte dialoog, niet in het formulier. Voorstel: na het opslaan van een nieuwe reservering biedt de bevestiging een knop "Nu ophalen" (opent het ophaaldialoog voor die reservering) zodat "boeken en direct meegeven" één klik extra blijft. Annuleren vanuit het bewerkformulier gaat via `PATCH /:id/status {cancelled}` (met het bestaande picked-up-vinkje).
- **Server.** `POST /api/reservations`: voor `type !== 'maintenance_block'` wordt `status` genegeerd en op `booked` gezet (geen 400: oude clients blijven werken; wel een waarschuwing in het log). `PATCH /:id` en `/:id/basic`: voor niet-blokken wordt een meegegeven `status` geweigerd met 400 `USE_STATUS_ROUTE` (behalve als het gelijk is aan de huidige status: idempotent, zoals c-05 :269-276 pint). Blokken houden hun uitzondering (D7 regelt `out`).
- **Tests.** c-05 `cancelViaForm` → `/status`; fix-h :230-255 en wave11 :79-93 worden "status via /:id → 400 USE_STATUS_ROUTE"; nieuwe test: POST met `status:"picked_up"` levert `booked`. Client: formulier zonder statusveld; "Nu ophalen"-knop opent het dialoog.
- **Handleiding.** 05-reserveringen.md :170, :305-306, :648-651 herschrijven; "Ingeleverd" als handmatige stap verdwijnt.

## 4. Onderhoud (D4, D5, D6, D7)

### 4.1 Annuleren in "Vervangende voertuigen toewijzen" (D4)
**Besluit.** Annuleren maakt het hele plannen ongedaan; zonder vervanger plannen = "Later vervanger toewijzen".

**Ontwerp.**
- Nieuwe route `POST /api/reservations/:id/abort-planning` (MANAGE_RESERVATIONS of MANAGE_MAINTENANCE): verwijdert een onderhoudsblok **hard** als het (a) type `maintenance_block` is, (b) status `scheduled/booked`, (c) geen vervangers of placeholders eraan hangen, (d) korter dan 1 uur geleden is aangemaakt door dezelfde gebruiker. Anders 409 `PLANNING_NOT_ABORTABLE` (de client valt dan terug op het gewone Verwijderen naar de prullenbak). Voorstel: hard verwijderen, zodat een afgebroken planning de prullenbak niet vervuilt; alternatief is de bestaande soft delete (prullenbakregel "Onderhoud #id").
- De route stuurt het portaal-event "onderhoud geannuleerd" alleen als er eerder een "gepland"-melding is verstuurd (portal-maintenance-events: controleer op de bestaande notificatie-dedupe-tag), en schrijft een auditregel `reservation.abort-planning`.
- Client: Annuleren, Escape, kruisje en klik buiten het vervangersdialoog roepen eerst een bevestiging aan ("Plannen afbreken? Het onderhoud wordt weer weggehaald.") en daarna de route; toast "Plannen afgebroken". De radio "Later vervanger toewijzen" blijft de weg om zonder vervanger te plannen.
- Tests: server (abort binnen regels; weigering met vervanger; weigering na een uur), client (Annuleren → bevestiging → route; Escape idem), laag-B onderhoudsverhaal uitbreiden met één stap.

### 4.2 Gepland onderhoud zet de auto niet op Reparatie nodig (D5)
**Besluit.** Pas bij "Binnen"; de geplande periode blokkeert wel nieuwe reserveringen.

**Ontwerp.**
- `deriveVehicleAvailability` (lifecycle.ts:585-618): een live blok dat vandaag dekt met blokstatus `scheduled` levert `availability_status = scheduled` (bestaat al in de enum; B-01: niet beschikbaar), niet `needs_fixing`. Een blok met status `in`/`in_service` levert `needs_fixing` (zoals nu). `isOpenBlockMaintenanceStatus` blijft voor de andere gebruikers; alleen de `hasOpenBlock`-tak splitst in "gepland" en "binnen".
- Gevolgen: portaal-online-lijst (alleen `available`) blijft die auto verbergen; de overdrachtspoort weigert `needs_fixing`, een `scheduled` auto mag worden opgehaald (de balie beslist). Voorstel: bij ophalen van een huur op een auto met een gepland onderhoud dat de ophaaldag dekt toont het ophaaldialoog een waarschuwing (geen blokkade).
- "Blokkeert wel nieuwe reserveringen": vandaag waarschuwt een blok alleen bij boeken (B-09). Voorstel: B-09 blijft (waarschuwing met doorgaan), omdat Kees in B-09 bewust voor waarschuwen koos; D5 verandert alleen de voertuigstatus. Als Kees een harde blokkade wil, is dat een nieuw besluit.
- Tests: c-08b :119-130 en :190-201 (scheduled → `scheduled`, niet `needs_fixing`), b-09 :143-159 blijft (niet available), fix-h derivatietests uitbreiden.

### 4.3 Verwijderen of annuleren van een blok wist "Reparatie nodig" als dat alleen door dat blok kwam (D6)
**Ontwerp.**
- Nieuwe kolom `vehicles.maintenance_status_block_id` (integer, nullable, via manifest). Elke schrijver van `maintenance_status` zet hem: check-in via `PATCH /api/vehicles/:id/maintenance-status` met `blockId` → dat blok; `mark-needs-service` met blok → dat blok, zonder blok → null; handmatige `availabilityStatus: needs_fixing` → null; transporten → null; `completeMaintenance`/`returnVehicleFromService`/`freeVehicleWhenBlockClosed` → null (status terug naar ok).
- Bij `DELETE /api/reservations/:id` van een blok, `/abort-planning`, en `PATCH … {cancelled}` van een blok: als `maintenance_status_block_id === blok.id` en geen ander blok met status `in`/`in_service` dekt vandaag → `markVehicleForService('ok')` + recompute met `clearWorkshopFlag`. Anders ongemoeid.
- Backfill: geen (bestaande `needs_fixing`-auto's houden hun stand; de kolom vult zich bij de volgende handeling).
- Tests: c-08b :190-201 wordt "DELETE van het blok dat de auto binnen meldde → ok"; wave14 :253-300 (handmatig blijft sticky) blijft groen; nieuwe gevallen: tweede open blok → blijft needs_fixing; handmatige melding → blijft.

### 4.4 "Uit" vervangen door "Afronden" (D7)
**Ontwerp.**
- maintenance-edit-dialog.tsx: statusselect houdt alleen `Gepland` en `Binnen`; een blok dat al afgerond is toont de status als tekst ("Afgerond op <datum>") en het formulier is alleen-lezen voor status. Nieuwe knop "Afronden" in het dialoog (`button-edit-complete-maintenance`, RequiresPermission anyOf MANAGE_MAINTENANCE/MANAGE_RESERVATIONS) opent `CompleteMaintenanceDialog`; na succes sluit ook het bewerkdialoog. Dezelfde wijziging in de bewerkmodus van het plan-dialoog (scanpaneel).
- Server: `PATCH /:id` en `/:id/basic` weigeren voor een blok `status/maintenanceStatus ∈ {out, completed}` met 400 `USE_COMPLETE_ROUTE` (maintenance-edit-bugs.md:144). `PATCH /api/vehicles/:id/maintenance-status {status:'ok'}` terwijl een blok vandaag dekt met status `in`: 409 `USE_COMPLETE_ROUTE` met `blockId`; het scanpaneel ("Terug uit onderhoud") opent dan het Afronden-dialoog voor dat blok. Zonder dekkend blok blijft de route werken (auto zonder blok terug van service).
- `completeMaintenance` weigert een al afgerond blok (409 `ALREADY_COMPLETED`).
- "Voltooien" in de kalenderknop en dialoogtitel wordt overal "Afronden" (één woord).
- Tests: maintenance-edit-dialog-status.test.tsx (optie "Uit" weg, knop Afronden), c-08b "Binnen then Uit" → 400 USE_COMPLETE_ROUTE, wave13-scan-end-maintenance (409 + dialoog), registry-ingang voor de nieuwe opener met `allowedPathNeedsState`/`deniedPathNeedsState`.

## 5. Prullenbakken voor chauffeurs en kostenposten (D8)

**Ontwerp.**
- `DELETED_RECORD_KINDS` + `driver`, `expense`. Verwijderen wordt snapshot-in-`deleted_records` + hard delete in één transactie (patroon bekeuring/transport), payload = de rij plus voor chauffeur: de SET-NULL-koppelingen (`portal_users.driver_id`, `reservation_driver_assignments`, `fines.driver_id`, `reservations.driver_id`, `vehicle_usage_periods.primary_driver_id`) als `nulled`-lijst; voor kostenpost: `inboxItemId` en de plek in `invoice_inbox_items.expense_ids`.
- Terugzetten (dispatcher :816-835): chauffeur alleen als de klant bestaat (anders `CUSTOMER_MISSING`, met de hint de klant eerst terug te zetten); herstelt de koppelingen waar de doelrijen nog bestaan; kostenpost herstelt `inboxItemId` als het postvakitem bestaat en voegt het id weer toe aan `expense_ids`; voertuig weg → kostenpost terug met waarschuwing (geen FK).
- Legen: generieke tak; bestanden `drivers.licenseFilePath` en `expenses.receiptFilePath` staan al in `SNAPSHOT_FILE_COLUMNS`; live-referentiecheck (postvakbijlage!) bestaat.
- Openers (RequiresPermission MANAGE_RECYCLE_BIN): Kosten-pagina (`button-expenses-bin`), klantdetails bij Chauffeurs (`button-drivers-bin`, filter op die klant via `?customerId=`: GET `/api/deleted-records?type=driver&customerId=` nieuw optioneel filter). `BIN_CHANGE_PREFIXES` + `/api/expenses`, `/api/drivers`. Teksten nl/en per kind in recycleBin.json; verwijderteksten "permanent" verdwijnen uit customers.json/vehicles.json/expenses.json.
- Audit: `driver.delete`/`expense.delete` krijgen label + snapshot (drivers in `TRACKED_RESOURCES`).
- Tests: c-06 (exact 8 kinds), c-07 (purge van beide), restore-tests per kind, client dialog/openers/registry (2 ingangen), handleiding 03/10 en Kosten.

## 6. Bekeuringen (D9, D10)

### 6.1 Alleen registreren (D9)
- `FineStatus` houdt de zes waarden (data), maar `ACTIVE_FINE_STATUSES = [new, linked, cancelled]` stuurt filters en keuzes; `LEGACY_FINE_STATUSES = [charged, paid, disputed]` worden alleen getoond als badge op een bekeuring die zo'n status al heeft, en komen alleen in de filterlijst als er zulke rijen zijn (serverteller in de lijstresponse).
- Server: dode takken `charged`/`paid` in `/status` weg; `PATCH /:id` weigert niet meer op `paid` (alleen op `cancelled`); `/status` naar `charged|paid|disputed` → 400 `STATUS_NOT_SUPPORTED`.
- Portaal: `CUSTOMER_VISIBLE_FINE_STATUSES` blijft (oude rijen zichtbaar); teksten die Doorbelast/Betaald beloven weg (portal.json :658, :976-979 herformuleren naar "u regelt doorbelasten aan uw bestuurder zelf", handleiding 15:135, portal-wordpress-embed al goed).
- Datum: `charged_at`/`paid_at` blijven als kolommen (0 rijen in productie te verwachten; controle in het containerlog: `SELECT status, count(*) FROM fines GROUP BY 1` als eenmalige logregel bij start? Nee: geen migratie nodig; wel in de uitrolnotitie).
- Tests: fines-routes :68-78 wordt `STATUS_NOT_SUPPORTED`; shared/fines.test.ts bijwerken; client filtertest.

### 6.2 Knop "Klant informeren" (D10)
- Create/auto-link (fine-create.ts:50-52), CJIB-import (importer.ts:42) en handmatig koppelen (`notifyLinked`) sturen geen mail en geen portaalmelding meer.
- Nieuwe route `POST /api/fines/:id/notify-customer` (MANAGE_FINES): vereist status `linked` en een klant; stuurt `sendFineLinkedMail` + portaalmelding; antwoordt `{sent: boolean, reason?: "NO_CUSTOMER" | "NO_EMAIL" | "PORTAL_DISABLED" | "MAIL_FAILED"}`; logt in `email_logs` met `logTemplate: "fine_linked"` (nieuwe sjabloonsleutel, ook als kind in het logboek); auditregel `fine.notify-customer`; `fines.customer_notified_at` (nieuwe kolom, manifest) voor "Klant geïnformeerd op <datum>" in het detail.
- Client: knop "Klant informeren" in FineDialog (status linked), met bevestiging die het adres noemt; daarna tekst "Klant geïnformeerd op …" en de knop wordt "Opnieuw informeren". Toasts per `reason` (nl/en).
- Tests: fines-routes :51-52 en :94-108 omdraaien (geen mail bij create); nieuwe route-tests per reason; client knop; handleiding 09-email.md.

## 7. Tijdzone (D11)

### 7.1 Tijdzone-instelling
- Nieuwe `app_settings`-sleutel `office_timezone` (IANA-naam, standaard `Europe/Amsterdam`), zichtbaar in App-instellingen (select met de Europese zones + zoekveld; toont huidige offset en of zomertijd actief is; `Intl.supportedValuesOf('timeZone')`). Leesbaar voor elke ingelogde gebruiker via de bestaande leesallowlist; het portaal gebruikt de serverwaarde.
- Server: `officeTimeZone()` (gecachet, 60 s, cache leeg bij opslaan) in server/services/office-time.ts; `isoToday`/`officeDate` (lifecycle.ts:478-492), importer.ts:164, portal-mail.ts:230, portal-maintenance-events.ts:24-28 (offsetberekening generiek via Intl), dutch-format.ts:65-80 (expliciete zone), fiscal csvDate(assessedAt) → zone. Cron-planners lezen de zone bij aanmaken en herplannen bij wijziging (event uit de settings-save); cjib/poller.ts krijgt de zone.
- Client: `officeToday()` e.a. (office-date.ts) lezen de zone uit een kleine `useOfficeTimeZone()`-store gevuld bij app-start uit `/api/app-settings/key/office_timezone` (met fallback Europe/Amsterdam zolang niet geladen); format-date-nl.ts, csv.ts `csvDateTime`, activity-log-panel.tsx formatteren in die zone.
- Niet aanraken: de omrekenaanname in startup-migration.js:694 en migrate-timestamps-to-timestamptz.ts:64 (beschrijft hoe oude data is geschreven).
- Tests: office-today.test.ts e.a. parametriseren op zone; één test met `America/Curacao` bewijst dat de instelling doorwerkt (server + client).

### 7.2 Omzetting van de database (B-22, X1) in stappen
- Niet in deze branch uitgevoerd. Dit deelproject levert: (1) de per-kolomlijst "NL-wandkloktijd of UTC" als bestand `docs/superpowers/specs/2026-10-11-timestamptz-kolommen.md`, afgeleid van de schrijvers (`now()`-default = NL-wandklok; `new Date()` uit de app = UTC); (2) `scripts/migrate-timestamps-to-timestamptz.ts --report` uitgebreid met die lijst zodat het rapport per kolom de gekozen regel toont; (3) een uitrolnotitie voor Kees: back-up, kopie, rapport, venster, `TIMESTAMPTZ_MIGRATION=apply` één keer. De uitvoering is een aparte actie met Kees erbij.

## 8. Wachtwoordregel (D12)
- `shared/password-policy.ts`: `PASSWORD_MIN_LENGTH = 10`, `passwordPolicyIssues(pw)` → lijst codes (`tooShort`, `needsLower`, `needsUpper`, `needsDigit`). Server gebruikt het in POST /api/users, PATCH /api/users/:id (alleen als `password` meekomt), change-password en /api/register → 400 `PASSWORD_TOO_WEAK` met `issues[]`; de controle komt ná de 403-checks (fix-i/fix-d-tests). Zelfwijziging via PATCH zonder huidig wachtwoord: Voorstel: PATCH op het eigen account mag geen wachtwoord meer zetten (alleen change-password met huidig wachtwoord); een beheerder mag via PATCH wel een nieuw wachtwoord voor een ander zetten (reset).
- Client: profiel- en gebruikersdialoog gebruiken dezelfde `passwordPolicyIssues` (zod-refine) en tonen de hint "Minimaal 10 tekens, met hoofdletter, kleine letter en cijfer"; code `PASSWORD_TOO_WEAK` in `userErrorText`.
- Portaalwachtwoorden blijven 10 zonder klassen (buiten dit besluit; genoteerd).
- Tests: de genoemde ~8 testen krijgen geldige wachtwoorden; nieuwe tests per route; policy-unit-tests.

## 9. Rechten-afhankelijkheden (D13)
- `shared/permission-dependencies.ts`: tabel `{right: {required: Permission[], optional: Permission[], adminOnly?: boolean}}` volgens de feitentabel (facts-rechten §D13), met een test die elke `PAGE_ACCESS`-pagina en elke `NoDataAccess`-site aan een regel koppelt (bron-check zoals recycle-bin-openers.test).
- Gebruikersbeheer (users-dialog.tsx:712-752): per recht een regel "Heeft nodig: Voertuigen bekijken, Reserveringen bekijken" (grijs als die al aanstaan; oranje icoon als niet), en één knop boven de lijst "Benodigde rechten ook aanzetten" die de ontbrekende `required` rechten aanvinkt (niets automatisch bij opslaan). Rechten met `adminOnly` tonen "alleen voor beheerders" en zijn voor een niet-admin uitgeschakeld in de lijst (server accepteert ze nog: geen guardwijziging).
- Leesmodus: zelfde hint met waarschuwingsicoon bij ontbrekende afhankelijkheden.
- Tests: client dialoogtest (knop vinkt aan), shared-tabeltest.

## 10. Geweigerde pogingen melden aan de beheerder (D14)
- `audit_logs`: actie `access.denied` (status `failure`, details `{method, path, required, page?}`) geschreven door `hasPermissionMiddleware` (patroon fiscalGuard; GET's inbegrepen) en door een nieuwe route `POST /api/access-denied` (authenticated-only, in de fix-i-lijst) die de geen-toegang-pagina aanroept met `{page}`. Dedupe per gebruiker+pad per 5 minuten (geen storm).
- Nieuwe kolom `users.last_login_at` (manifest) gezet in auth.ts bij succesvol inloggen, ná het lezen van de vorige waarde die in de loginrespons meekomt als `previousLoginAt`.
- Melding: Voorstel: voor accounts met rol `admin` (B-41 zegt "beheerder"); op het dashboard een banner (patroon backup-staleness-banner) "Sinds je vorige inlog (<datum>) probeerden <n> medewerkers iets waarvoor ze geen recht hebben" met knop "Bekijken" → dialoog met regels (wie, wat, wanneer; data uit `GET /api/access-denied?since=`, MANAGE_USERS). Geen banner als n = 0. Daarnaast één rij in het meldingencentrum? Nee: custom_notifications is niet per gebruiker; de banner volstaat.
- Tests: middleware schrijft de regel; dedupe; route; banner met 0 en met n; e2e: één laag-A-controle dat de banner voor admin niet rood is.

## 11. Beheerder verwijderen (D19)
- Vooraf: 20 FK's naar `users.id` zonder ON DELETE. Migratiestap (idempotent, marker `d19_user_fk_set_null`) zet ze op `ON DELETE SET NULL` (de gebruikersnaam staat al als tekst in audit-/logregels), zodat verwijderen echt werkt. Zonder deze stap antwoordt de route vandaag 404 bij elk account dat ooit inlogde.
- Server `DELETE /api/users/:id`: 400 `CANNOT_DELETE_SELF` (bestaat), 409 `LAST_ADMIN` als het doel de laatste actieve beheerder is (telling onder `SELECT … FOR UPDATE` in één transactie), anders verwijderen (een beheerder mag een andere beheerder verwijderen). `PATCH`: 409 `LAST_ADMIN` bij het demoten of deactiveren van de laatste actieve beheerder.
- Client: verwijderknop alleen uit voor jezelf en voor de laatste beheerder (server telt; de dialoog leest `isLastAdmin` uit de gebruikerslijst-response); codes gemapt.
- Tests: p8-user-error-codes + users-dialog-feedback aanpassen; nieuwe: laatste admin geweigerd, tweede admin verwijderbaar, FK-migratie maakt verwijderen van een ingelogd account mogelijk.

## 12. Sjabloon-plekhouders (D15)
- Nieuwe `app_settings`-sleutel `company_name` (standaard "Autolease Lam"), in App-instellingen; vervangt de hardgecodeerde namen in email-templates-i18n.ts en de `fromName`-default (portal-mail "Lam Groep" blijft portaalspecifiek: aparte sleutel `portal_company_name`? Voorstel: één sleutel voor beide).
- Verzenden stuurt `templateId`/`category` mee (CustomerCommunications.tsx:372-378); de server vult per ontvanger: `companyName`, `customerEmail`, `customerPhone`, `reservationStart`/`reservationEnd` (uit `currentRenterReservation`, leeg zonder reservering), `maintenanceDate` alleen voor categorie `maintenance` (= `vehicles.lastServiceDate` of de datum van het dekkende blok). Onbekende of lege plekhouders worden leeg verzonden (`blank`), nooit als code.
- Builder: de aanbodlijst filtert op categorie (`maintenanceDate` alleen bij Onderhoud); `KNOWN_PLACEHOLDERS` wordt de volledige lijst; de voorvertoning toont per ontvanger welke plekhouders leeg blijven (bestaande `preview-empty-note`).
- Tests: message-placeholders, communication-preview (:38-50), p3-communicatie, laag-B send-and-log-verhaal (één extra plekhouder).

## 13. RDW-typehermapping toepassen (D17)
- Voorstel: in de app in plaats van via Coolify. Instellingen → Voertuigen → kaart "RDW-voertuigtypes": knop "Controleren" start een achtergrondtaak (MANAGE_VEHICLES) die per voertuig de RDW raadpleegt (150 ms pauze, `AbortSignal.timeout`), het plan opslaat in `app_settings` (`rdw_type_remap_plan`: `{createdAt, rows:[{id, plate, from, to}], notFound, failed}`) en de lijst toont; knop "Toepassen" (alleen rol admin, bevestiging met het aantal) past exact dat plan toe (alleen rijen waarvan het type nog gelijk is aan `from`), in één transactie, met een auditregel `vehicle.type-remap` per voertuig, en wist het plan. Het script `scripts/remap-vehicle-types.ts` blijft voor lokaal gebruik.
- Tests: server (plan maken met gemockte RDW; toepassen alleen ongewijzigde rijen; tweede keer niets), client kaart + bevestiging; registry-ingang.

## 14. Fiscale prullenbak (afwijkend van advies)
- `purgeReservationRows`: de `FiscalDataPresentError`-weigering verdwijnt; in dezelfde transactie: review cases → assessments (eigen periodes én die met `reservation_id` = deze reservering) → periode (cascade) → reservering. Succes-auditregel krijgt `removed.fiscal_assessments` en `removed.fiscal_review_cases`; `recordFiscalEvent` schrijft `purged` (nieuwe actie in `FISCAL_AUDIT_ACTIONS`) met de telling en de reserverings-id (de fiscale audittrail is append-only en blijft dus het bewijs dat er iets is weggegooid).
- Client: `purgeNote` voor reservering/onderhoud zegt "Fiscale beoordelingen van deze reservering worden ook definitief verwijderd"; de bevestiging toont het aantal beoordelingen (uit de bin-rij `relatedCounts`, aangevuld met een fiscale telling in GET `/api/deleted-records`); `FISCAL_DATA_PRESENT` verdwijnt uit `PURGE_ERROR_CODES`.
- Kanttekening in besluiten.md en handleiding: fiscale bewaarplicht; Kees' keuze.
- Klantpurge (cascade via `vehicle_usage_periods.customer_id`): dezelfde fiscale telling en tekst (anders verdwijnen beoordelingen stil).
- Tests: c-07 :607-730 omdraaien; recycle-bin-purge.test.tsx :326-357, :415-424.

## 15. Overig
- "Pech" blijft (geen wijziging). D16, D18, D20: geen bouw; D20 → regel in docs/e2e/README.md ("geen browsertests tussen 02:00 en 04:00").

## 16. Volgorde, pakketten en verificatie
Pakketten (één Playwright-eigenaar tegelijk, geen stash/checkout):
- **DA Onderhoud** (4.1–4.4) — L; raakt lifecycle, routes, maintenance-dialogen, c-08b.
- **DB Reserveringsstatus** (3) — M; reservation-form, PATCH-routes, c-05.
- **DC Kosten + prullenbakken** (1, 5) — L; expenses, fuel route, deleted_records kinds.
- **DD Bekeuringen** (6) — M.
- **DE Rechten en beheer** (8, 9, 10, 11) — L; users.ts, users-dialog, auth, FK-migratie.
- **DF Tijdzone + bedrijfsnaam + sjablonen** (7.1, 12) — L; settings, office-time, notifications.
- **DG Import + RDW-hermapping** (2, 13) — M.
- **DH Fiscale purge** (14) — S.
- **DI Docs + B-22-kolommenlijst** (7.2, handleiding, besluiten "Uitgevoerd").
Elk pakket: TDD, sonnet-implementeerder, sonnet-review, haiku-nacontrole; eindgolf; opus-eindbeoordeling; volledige verificatie (tsc, vitest, coverage, e2e 2×, niet tussen 02:00–04:00); push op Kees' woord.

Schema-wijzigingen (manifest + schema.ts): `expenses.source`, `expenses.source_ref`, `vehicles.maintenance_status_block_id`, `fines.customer_notified_at`, `users.last_login_at`. Migratiestappen met marker: `d19_user_fk_set_null`. Nieuwe app_settings-sleutels: `office_timezone`, `company_name`, `rdw_type_remap_plan`.

Na de uitrol te controleren: containerlog `d19_user_fk_set_null` (20 constraints), de tijdzone-instelling staat op Europe/Amsterdam, `SELECT status, count(*) FROM fines GROUP BY 1` (oude statussen), RDW-controle draaien en de lijst bekijken vóór "Toepassen".

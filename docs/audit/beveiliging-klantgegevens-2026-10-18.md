# Beveiligingsdoorlichting LVStest — klantgegevens (18 oktober 2026)

Alleen gelezen: geen bestanden in de repo gewijzigd, geen server gestart, geen database aangeraakt.
Basis: branch `main` op commit a34a52c3.

**Bevestigd** betekent: ik heb het codepad van begin tot eind gevolgd. Het is níet live uitgeprobeerd.
**Vermoeden** betekent: de code wijst die kant op, maar een stuk hangt af van hoe het in productie
is ingesteld of gebruikt.

Ernst: **Kritiek** (buitenstaander kan direct bij klantgegevens) · **Hoog** · **Middel** · **Laag**.
Moeite: **klein** (uur tot dag) · **groot** (meerdere dagen of ombouw).

---

## Samenvatting

Er is niets Kritiek gevonden. Een buitenstaander zonder account komt niet bij klantgegevens: elke
`/api`-route vraagt een login, en bijna overal ook het juiste recht. De bestanden in `uploads/` staan
achter login plus recht. Het portaal is per klant en per bestuurder goed afgeschermd.

Wel gevonden:

| # | Ernst | Kort | Status |
|---|---|---|---|
| 1 | Hoog | Medewerker met alleen "reserveringen beheren" kan via een schadecheck-bestand code laten draaien in de sessie van een beheerder | bevestigd |
| 2 | Hoog | Portaalklant kan met zijn eigen portaalcookie meeluisteren op de live meldingen van kantoor (namen en berichten van andere klanten) | bevestigd |
| 3 | Hoog | Uitgeschakeld medewerkersaccount blijft werken zolang de sessie loopt | bevestigd |
| 4 | Middel | Een medewerker kan via `/API/PORTAL/...` (hoofdletters) optreden als het portaalaccount met hetzelfde nummer | bevestigd |
| 5 | Middel | Recht "gebruikers beheren" is in de praktijk bijna beheerder | bevestigd |
| 6 | Middel | Bestandsnaam van een upload kan buiten de uploadmap schrijven (schadecheck, voertuigtekening) | bevestigd |
| 7 | Laag | Rapportbouwer toont namen, e-mail en telefoon van klanten en bestuurders zonder klantrecht | bevestigd |
| 8 | Laag | Back-upmap vrij in te stellen, back-uprecht = volledige database | bevestigd |
| 9 | Laag | Iedereen kan een account (ook beheerder) 15 minuten op slot zetten | bevestigd |
| 10 | Laag | Persoonsgegevens en zoektermen in de serverlog | bevestigd |
| 11 | Laag | `/uploads` serveert bestanden zonder vaste veilige headers | bevestigd |
| 12 | Laag | Kleine dingen: geen tweestaps-login, foutteksten, rijbewijs zonder Content-Type, `setupAuth` twee keer | bevestigd / vermoeden |

---

## Bevindingen

### 1. Hoog — Code in de sessie van een beheerder via een schadecheck-bestand (bevestigd)

**Waar**
- `server/routes.ts:3452` (`POST /api/reservations`) en `server/routes.ts:4784` (`PATCH /api/reservations/:id`)
  nemen een bestand `damageCheckFile` aan via `damageCheckUpload` (`server/routes.ts:3403-3450`).
- Op deze twee routes wordt de inhoud van het bestand **niet** gecontroleerd: er staat geen
  `validateAfterUpload`, wat wel staat bij documenten, rijbewijzen, APK en bonnen (`server/routes.ts:2144, 5422, 6863, 8025, 8095`).
- Het filter `createSecureMulterFilter` (`server/utils/security/fileUploadSecurity.ts:244-255`) kijkt
  alleen naar de extensie (.pdf/.jpg/.png) en of het opgegeven type het woord "pdf", "png" of "jpeg"
  *bevat*. Daardoor gaat bijvoorbeeld `text/html;x=pdf` of `application/javascript;x=pdf` erdoor.
- Dat opgegeven type wordt bewaard als `contentType: req.file.mimetype` (`server/routes.ts:3813` en `:5104`).
- `GET /api/documents/view/:id` stuurt het bestand terug met precies dat type en `inline`
  (`server/routes.ts:7033-7034`). Bij download gaat het ook mis (`:7084`).
- De app opent zo'n document in een iframe of nieuw tabblad op het eigen adres
  (`client/src/components/reservations/reservation-form.tsx:2731`, `reservation-view-dialog.tsx:1148`).

**Wat kan er misgaan**
Een medewerker met alleen "reserveringen beheren" uploadt twee "schadechecks":
- één bestand dat eigenlijk JavaScript is, met het opgegeven type `application/javascript;x=pdf`;
- één bestand dat eigenlijk HTML is, met het type `text/html;x=pdf`, en dat het eerste bestand inlaadt.

De beveiligingsregel van de browser (CSP: alleen scripts van het eigen adres) houdt dit niet
tegen, want het script komt van het eigen adres. Opent een beheerder de reservering en bekijkt hij
de schadecheck, dan draait de code met de rechten van die beheerder. Die code kan bijvoorbeeld een
nieuw account met alle rechten aanmaken, een back-up van de database downloaden of alle klanten
ophalen.

**Oplossing**
1. Gebruik op `/api/documents/view` en `/download` dezelfde `setSafeFileHeaders()` als het portaal
   (`server/utils/portal-files.ts`): het type volgt uit de extensie, alleen pdf/png/jpg inline, plus
   `nosniff` en `CSP: sandbox`.
2. Zet `validateAfterUpload` ook op de schadecheck-upload van reserveringen.
3. Maak in `createSecureMulterFilter` van "bevat" een exacte vergelijking.

**Moeite:** klein.

---

### 2. Hoog — Portaalklant kan meeluisteren op de live meldingen van kantoor (bevestigd)

**Waar**
- De Socket.IO-verbinding (live verversen in de kantoor-app) accepteert iedereen die in de sessie
  iets heeft staan onder `passport.user`: `server/index.ts:268-279` (`if (!userId)`).
- Het portaal bewaart zijn sessies **in dezelfde tabel** (`session`) en tekent ze **met hetzelfde
  geheim** (`SESSION_SECRET`): `server/portal-auth.ts:234-245` tegenover `server/auth.ts:117-151, 178-190`.
  Alleen de cookienaam verschilt (`portal.sid` tegenover `connect.sid`). Die naam hoort niet bij
  de handtekening.
- In een portaalsessie staat `passport.user = {kind:"portal", id}`. Dat is "iets", dus de
  verbinding wordt geaccepteerd.
- Wat er live wordt rondgestuurd: van elk gewijzigd record het nummer, en bij portaalgebeurtenissen
  de volledige titel en omschrijving (`server/realtime-events.ts:23-27, 40-45`,
  `server/services/portal-notifications.ts:54-57`). Voorbeelden: "Nieuwe aanvraag (…): *bedrijfsnaam*",
  de eerste 200 tekens van het bericht van de klant, en "*Naam* heeft *bestuurder* als bestuurder
  ingesteld (was *andere naam*)" (`server/routes/portal.ts:174-180, 335-339, 497-504`).

**Wat kan er misgaan**
Een klant met een portaalaccount zet de waarde van zijn eigen `portal.sid`-cookie in een cookie
met de naam `connect.sid`, en maakt verbinding met `/socket.io`. Dat kan met een eenvoudig script.
Daarna ziet hij live de namen, berichten en bestuurderswissels van **alle andere klanten** die het
portaal gebruiken. Dat is een datalek naar buiten (AVG).

De gewone `/api`-routes van kantoor blijven toevallig dicht: het inlezen van zo'n portaalsessie
loopt daar vast op een databasefout (500).

**Oplossing**
- In de controle bij het verbinden: eis dat `passport.user` een getal is, zoek de medewerker op,
  en controleer dat die bestaat en actief is.
- Liever ook: geef het portaal een eigen geheim (bijvoorbeeld `PORTAL_SESSION_SECRET`) en/of een
  eigen sessietabel (`tableName: "portal_session"`). Dan past de ene sessie nooit op de andere.

**Moeite:** klein.

---

### 3. Hoog — Uitgeschakeld medewerkersaccount blijft werken (bevestigd)

**Waar**
- `server/auth.ts:269-289`: bij elk verzoek wordt de gebruiker opnieuw uit de database geladen,
  maar `active` wordt niet gecontroleerd. `requireAuth` (`:292-297`) en `hasPermission`
  (`server/middleware/permissions.ts:120-138`) doen dat ook niet.
- `server/routes/users.ts:516-552`: bij `active: false`, en ook als een beheerder het wachtwoord van
  iemand anders opnieuw instelt, worden de open sessies van dat account niet beëindigd. Bij "eigen
  wachtwoord wijzigen" gebeurt dat wel (`:655-666`).
- Ook de live verbinding controleert `active` niet (`server/index.ts:268-279`).

**Wat kan er misgaan**
Een medewerker gaat uit dienst. Je zet zijn account op "uitgeschakeld", maar hij is nog ingelogd
(bijvoorbeeld op een telefoon of thuis). Zolang hij binnen 15 minuten steeds iets doet, houdt hij
toegang tot alle klanten, documenten en rijbewijzen waar hij rechten voor had. Hetzelfde geldt
als je zijn wachtwoord reset omdat je denkt dat het gestolen is: de dief blijft ingelogd.
Rechten weghalen werkt wel meteen. Alleen het uitschakelen niet.

**Oplossing**
- In `deserializeUser`: als `!user.active`, behandel het als niet ingelogd (`done(null, false)`).
- In `PATCH /api/users/:id`: roep `revokeUserSessions(id)` aan bij `active: false` en bij een
  wachtwoordreset door een beheerder.

**Moeite:** klein.

---

### 4. Middel — Medewerker kan optreden als portaalaccount met hetzelfde nummer (bevestigd)

**Waar**
- `server/auth.ts:224-225` slaat de kantoorsessie over voor portaaladressen. De controle
  (`server/portal-paths.ts`) is **hoofdlettergevoelig**.
- Express zelf zoekt routes **niet** hoofdlettergevoelig op. `app.use("/api/portal", …)`
  (`server/portal-auth.ts:283`) en alle `app.get("/api/portal/…")` reageren dus ook op `/API/PORTAL/…`.
- Bij `/API/PORTAL/reservations` loopt dus éérst de kantoorsessie (`req.user` = de medewerker).
  Daarna kan het portaal die sessie niet lezen, maar `req.user` blijft gewoon staan.
- `requirePortalUser` (`server/portal-auth.ts:298-309`) kijkt alleen naar `req.user.id` en laadt het
  portaalaccount met **datzelfde nummer**.

**Wat kan er misgaan**
Medewerker nummer 3 (ook een account zonder rechten, bijvoorbeeld een kiosk-account) opent
`/API/PORTAL/reservations`. Hij ziet dan de reserveringen, documenten, bekeuringen en (als dat
een admin-account is) de bestuurders met rijbewijsnummers van portaalaccount nummer 3. Hij kan
daar ook acties doen, en die komen in het logboek te staan als acties van die klant. Na elk verzoek
wordt de medewerker wel uitgelogd. Het werkt dus per verzoek, maar het werkt.

**Oplossing**
- `isPortalPath` hoofdletterongevoelig maken (`path.toLowerCase()`), of `app.set("case sensitive routing", true)`.
- In `requirePortalUser` ook controleren dat de sessie echt een portaalsessie is
  (`req.session.passport.user.kind === "portal"`).

**Moeite:** klein.

---

### 5. Middel — "Gebruikers beheren" is bijna beheerder (bevestigd)

**Waar**
- `server/routes/users.ts:282-345` (`POST /api/users`): wie `manage_users` heeft, mag een account
  aanmaken met **elk** recht (back-ups, instellingen, documenten…) en een zelfgekozen wachtwoord.
  Alleen de rol "admin" is geblokkeerd (`:301-303`).
- `server/routes/users.ts:446-475` (`PATCH`): diezelfde persoon mag bij anderen elk recht aan- of
  uitzetten en andere beheerders uitschakelen, zolang er minstens één overblijft (`:480-483`).

**Wat kan er misgaan**
Een ploegleider die je "gebruikers beheren" geeft om collega's toe te voegen, maakt een
hulpaccount aan met `manage_backups`. Daarmee downloadt hij de hele database met alle klanten.
Of hij zet de andere beheerders uit.

**Oplossing**
Je mag alleen rechten uitdelen die je zelf hebt ("plafond"). Andere beheerder-accounts aanpassen
of uitschakelen alleen als je zelf beheerder bent.

**Moeite:** klein.

---

### 6. Middel — Uploadnaam kan buiten de uploadmap schrijven (bevestigd)

**Waar**
- `server/routes.ts:3417`: de bestandsnaam van een schadecheck wordt gemaakt met
  `req.body.startDate`, zonder schoonmaak. Multer plakt naam en map aan elkaar
  (`path.join`), dus `startDate = "../../../…"` schrijft het bestand ergens anders op de schijf.
  Op deze route wordt de inhoud ook niet gecontroleerd (zie punt 1).
- `server/routes/vehicle-diagram-templates.ts:225-227`: hetzelfde met `req.body.make` en
  `req.body.model` bij `fs.rename`. Daar wordt de inhoud wel gecontroleerd (alleen afbeeldingen).
- `sanitizeInput` haalt alleen HTML weg, geen `../` (`server/middleware/security/sanitization.ts:11-35`).

**Wat kan er misgaan**
Een medewerker met "reserveringen beheren" of "voertuigen beheren" kan een bestand met extensie
.pdf/.jpg/.png in elke map zetten waar de server mag schrijven, bijvoorbeeld de map met de
publieke website-bestanden. Dat bestand is dan zonder login op te halen. Bestaande bestanden
overschrijven lukt niet (er komt altijd een tijdstempel achter de naam), maar dit is wel een opstapje.

**Oplossing**
`sanitizeFilename()` (of `.replace(/[^0-9-]/g, "")` voor een datum) op `startDate`, `make` en
`model`. Controleer daarnaast na `path.join` of het resultaat nog binnen de uploadmap valt.

**Moeite:** klein.

---

### 7. Laag — Rapportbouwer omzeilt het klantrecht (bevestigd)

**Waar:** `POST /api/reports/execute` (`server/routes/reports.ts:112`) met recht `view_reports`.
De bronnen staan in `server/database-storage.ts:6462-6468`. Daar zitten `customers` en `drivers` bij,
met de velden naam, e-mail, telefoon en plaats (`shared/report-builder-config.ts:113-170`).

**Wat kan er misgaan:** iemand met alleen "rapporten bekijken" kan een lijst trekken met naam,
e-mail en telefoon van alle klanten en bestuurders, terwijl hij het klantenscherm niet mag openen.

**Oplossing:** de bronnen `customers` en `drivers` alleen toestaan als de gebruiker ook
`view_customers`/`manage_customers` heeft.

**Moeite:** klein.

---

### 8. Laag — Back-uprecht is het hele huis (bevestigd)

**Waar**
- `server/routes/backups.ts:129-165`: `localPath` in de back-upinstellingen wordt zonder controle opgeslagen.
- `server/backupService.ts:60-61`: dat pad wordt gebruikt, tenzij `BACKUP_PATH` in de omgeving staat.
- Met `manage_backups` download je de volledige database (`:170`), inclusief wachtwoord-hashes en
  alle klantgegevens, en kun je een database terugzetten (`:255`).

**Wat kan er misgaan:** wie dit recht heeft, kan de nachtelijke back-ups in een map laten
schrijven die publiek bereikbaar is, of via "terugzetten" zichzelf beheerder maken. Dat is
waarschijnlijk zo bedoeld. Het risico is vooral dat je dit recht te makkelijk uitdeelt.

**Oplossing:** back-uproutes alleen voor beheerders, en opnieuw om het wachtwoord vragen bij
download en terugzetten. Zet `BACKUP_PATH` vast in Coolify (dan telt `localPath` niet meer), of
weiger een `localPath` buiten een vaste map.

**Moeite:** klein.

---

### 9. Laag — Iedereen kan een account op slot zetten (bevestigd)

**Waar:** `server/middleware/security/rateLimiter.ts:73-75` en `server/auth.ts:368-387`: na 5 foute
pogingen in 15 minuten gaat de **gebruikersnaam** op slot, ongeacht vanaf welk adres. Voor het
portaal geldt hetzelfde per e-mailadres (`server/portal-auth.ts:321-329`).

**Wat kan er misgaan:** iemand van buiten die de gebruikersnaam "admin" raadt, kan die
steeds opnieuw op slot zetten. Dan kan de beheerder niet inloggen. Gegevens lekken er niet door.

**Oplossing:** de slottelling per gebruikersnaam *en* IP-adres doen, of na 5 fouten een korte
vertraging geven in plaats van een slot.

**Moeite:** klein.

---

### 10. Laag — Persoonsgegevens in de serverlog (bevestigd)

**Waar**
- Hele verzoeken worden gelogd: `server/routes/expenses.ts:387, 422, 442, 508, 571`,
  `server/routes.ts:1029, 1543, 3850, 6200`.
- Elke `/api`-regel in de log bevat de volledige URL met zoekvraag (`server/index.ts:318, 333`).
  Daarmee komen zoektermen als klantnaam, e-mail of telefoon in de Coolify-log.
- Preview-tokens van contracten worden gelogd (`server/routes.ts:7521, 7550`).
- Wachtwoorden worden wél overal weggelaten (`server/utils/log-redaction.ts`,
  `server/middleware/audit.ts:138-147`). Dat is goed.

**Oplossing:** de `console.log(req.body)`-regels weghalen, en bij `/api/customers`, `/api/drivers`
en zoekroutes alleen het pad loggen.

**Moeite:** klein.

---

### 11. Laag — `/uploads` zonder vaste veilige headers (bevestigd)

**Waar:** `server/middleware/uploads-mount.ts:41-46`: `express.static` met login plus
`manage_documents`. Het bestandstype volgt uit de extensie.

**Wat kan er misgaan:** oude bestanden in `uploads/` met een gevaarlijke extensie (de code noemt
zelf `.html`-facturen van vóór de C2-reparatie), of CJIB-importbestanden (`.xml`), worden in de
browser getoond in plaats van gedownload. De CSP houdt scripts in productie tegen, dus de schade
is klein. Geen enkel scherm linkt naar `/uploads`.

**Oplossing:** de mount weghalen, of `setHeaders` die alles behalve pdf/png/jpg als download
(`attachment`) stuurt, plus `CSP: sandbox`.

**Moeite:** klein.

---

### 12. Laag — Kleinere punten

- **Geen tweestaps-login voor medewerkers** (advies). Wie één wachtwoord heeft, kan bij alle
  klantgegevens. Overweeg TOTP, in elk geval voor beheerders en `manage_backups`. Moeite: groot.
- **Foutteksten naar de browser**: op 37 plekken gaat `error.message` mee in het antwoord (vooral
  `server/routes.ts` en `server/utils/route-errors.ts`). Alleen voor ingelogde medewerkers.
  Moeite: klein.
- **Rijbewijs in het portaal zonder Content-Type**: `server/routes/portal.ts:612-613` zet geen
  type en geen sandbox. Gebruik `setSafeFileHeaders` zoals de andere portaalbestanden. De inhoud
  is wel gecontroleerd, dus het risico is klein. Moeite: klein.
- **Bestandsnaam ongefilterd in de header**: `server/routes.ts:7033` en `:7083` zetten
  `document.fileName` tussen aanhalingstekens. Bij schadechecks is dat de originele naam van de
  uploader (`:3809`). Een `"` in de naam breekt de header. Moeite: klein.
- **`setupAuth()` draait twee keer** (`server/index.ts:228` en `server/routes.ts:513`): een tweede
  sessie-store en een dubbele database-opvraag per verzoek. Geen lek, wel rommelig. Moeite: klein.
- **Vermoeden: interne notities van bestuurders zichtbaar voor de klant**: het portaal stuurt het
  veld `notes` van een bestuurder mee naar de admin van de klant (`server/routes/portal.ts:100`).
  Als kantoor daar interne opmerkingen in zet ("niet meer aan verhuren"), ziet de klant die. Check
  hoe het veld gebruikt wordt.
- **Vermoeden: hash van het km-overschrijfwachtwoord in gebruikerslijsten**: `GET /api/users` en
  `GET /api/user` halen alleen `password` weg, niet `mileageOverridePasswordHash`
  (`shared/schema.ts:167`, `server/routes/users.ts:240-249`). De kolom lijkt nergens meer gevuld te
  worden. Haal hem uit de antwoorden of uit het schema.
- **`/object-storage/*` voor elke ingelogde medewerker** (`server/routes.ts:9000-9017`). Dit gaat
  via de Replit-sidecar en doet op Coolify niets. Als er ooit echte object-opslag (back-ups!) aan
  hangt, kan iedere medewerker elk object ophalen. Weghalen. Moeite: klein.

---

## Gecontroleerd en in orde

- **Toegang per route**: alle routes in `server/routes.ts` en `server/routes/*.ts` hebben
  `hasPermission`/`requireAdmin` of een bewuste uitzondering. Die uitzonderingen staan in
  `server/__tests__/fix-i-permission-matrix.test.ts:19-62`. Klanten, bestuurders, documenten,
  reserveringen, back-ups, gebruikers, instellingen, bekeuringen, kosten, fiscaal en
  portaalbeheer vragen allemaal het juiste recht. Routers via `mountStaffRouters` krijgen hun recht
  bij het koppelen (`server/middleware/staff-routers.ts:79-84`).
- **Zonder login**: alleen `/health` (zonder gebruikersaantallen of instellingen), `/api`, login,
  logout en `/api/user` (401). Socket.IO weigert verbindingen zonder sessie (zie wel punt 2).
- **Pad-uitbraak bij downloads**: documenten, bekeuringsbrieven, bonnen, facturen uit het
  postvak, portaalbijlagen, rijbewijzen en tekeningen gaan allemaal via `resolveDocumentFilePath`
  / `resolveInvoiceFile` met een controle binnen `uploads/`. Back-upnamen gaan via `isPlainFilename`.
  Opgeslagen paden in sjablonen worden geweigerd als ze buiten uploads wijzen
  (`server/middleware/stored-path-guard.ts`).
- **Bestandstypes bij download**: portaal (`setSafeFileHeaders`), facturen-postvak
  (`server/routes/expense-inbox.ts:186-197`), bonnen (`server/routes/expenses.ts:306-316`) en
  bekeuringsbrieven zetten zelf een veilig type. Alleen `/api/documents/view|download` niet (punt 1).
- **Facturen per e-mail**: het type wordt bepaald door de bytes en de naam door de server
  (`server/services/invoice-inbox/importer.ts:94-115`).
- **Wachtwoorden en tokens in antwoorden**: login, `/api/user`, `/api/users`, `POST`/`PATCH` users
  halen `password` weg. Portaalaccounts in beheer zonder `passwordHash`, token-hashes en apparaten
  (`server/routes/portal-admin.ts:18-22`). Uitnodigings- en e-mailwijzigingstokens worden alleen
  gehasht opgeslagen.
- **Geheimen in instellingen**: het SMTP-wachtwoord en de wachtwoorden van IMAP (facturen) en CJIB
  worden gemaskeerd bij elke leesroute. Generiek schrijven naar die sleutels wordt geweigerd
  (`server/utils/security/redactAppSetting.ts`). De Gemini-sleutel staat alleen in de omgeving.
- **Geheimen in git**: `.env` staat in `.gitignore` en is nooit gecommit. `.env.coolify` en
  `.env.sample` zijn alleen voorbeelden. `cookies.txt` staat in git maar is leeg (ook in de
  geschiedenis). Geen sleutels of wachtwoorden in de code gevonden.
- **Sessiegeheim**: geen vaste terugvalwaarde meer. Zonder `SESSION_SECRET` wordt een willekeurig
  geheim gemaakt, met een waarschuwing (`server/auth.ts:117-135`). Geen standaard-beheerderswachtwoord
  in productie (`server/initAdmin.ts:15-35`).
- **Cookies**: medewerkers `httpOnly`, `SameSite=Strict`, `Secure` automatisch bij HTTPS, 15 minuten
  inactief. Portaal `httpOnly`, `Lax`, 1 uur. Sessie-ID wordt vernieuwd bij inloggen (beide).
  CSRF-token op alle schrijfacties (beide).
- **Headers**: Helmet met CSP (productie: `script-src 'self'`, geen `unsafe-inline`/`eval`), HSTS
  van 1 jaar, `nosniff`, `X-Frame-Options SAMEORIGIN`, `Referrer-Policy`. Het portaal staat alleen
  in een iframe op de ingestelde adressen (gevalideerd). Geen CORS-middleware, dus alleen het eigen
  adres.
- **Rate limits**: medewerker-login 5 fout per 15 minuten per IP, plus slot per naam. Portaallogin,
  wachtwoord vergeten, activeren en e-mailwijziging elk een eigen limiet. Algemene API 1000 per 15
  minuten per gebruiker. Portaal-schrijfacties 200 per 15 minuten per account.
- **Portaal (IDOR)**: reserveringen, documenten, bekeuringen, aanvragen en bijlagen, bestuurders,
  rijbewijzen, voertuigen, meldingen en fiscaal: alles via `customerId` uit de sessie, met
  bestuurder-scope waar nodig (`server/services/portal-storage.ts:64-71, 220-243, 312-318`). Een
  bestuurder-account ziet geen collega's (`requirePortalRole("admin")` op bestuurders). Bij
  "wachtwoord vergeten" en e-mailwijziging is niet te zien of een adres bestaat. Bedrijfsadressen
  wijzigen vraagt het wachtwoord opnieuw.
- **Logboek**: wachtwoordvelden worden gemaskeerd in het audit-log. Antwoorden worden standaard
  niet gelogd (`LOG_RESPONSE_BODIES`).
- **CSV-exports**: beschermd tegen Excel-formules (`client/src/lib/csv.ts`,
  `server/services/fiscal/reports.ts:218-222`).
- **Portaalmails**: alle ingevulde waarden worden HTML-geëscaped (`server/services/portal-mail.ts:225-240`).

## Niet gecontroleerd

- Het gedrag in een echte browser en een live server. Alles hierboven is uit de code afgeleid.
- Bekende kwetsbaarheden in npm-pakketten (`npm audit` niet gedraaid).
- De instellingen in Coolify zelf (proxy, `TRUST_PROXY_HOPS`, `BACKUP_PATH`, firewall, databasetoegang).
- De React-kant buiten `dangerouslySetInnerHTML` (alleen de handleiding gebruikt dat, met eigen inhoud).
- Hoe lang persoonsgegevens bewaard blijven (audit-log, prullenbak, e-maillog).

---

## Nacontrole (hoofdsessie, 18 oktober 2026)

De drie punten met ernst Hoog zijn in de code nagelopen en kloppen:
- punt 1: `createSecureMulterFilter` accepteert een opgegeven type dat het woord pdf/png/jpeg *bevat* (`server/utils/security/fileUploadSecurity.ts`, `mimeAllowed`);
- punt 2: de Socket.IO-controle kijkt alleen of `req.session.passport.user` iets bevat (`server/index.ts`, `io.use`), en het portaal gebruikt hetzelfde `resolveSessionSecret()` en dezelfde sessietabel (`server/portal-auth.ts`);
- punt 3: `deserializeUser` controleert `active` niet (`server/auth.ts`).

Geen van deze punten is in dit werk opgelost. Fixes die gedrag veranderen, wachten op akkoord van Kees.

Eén klein ding is wel meegenomen: de melding "contract gezien en akkoord" linkte naar `/reservations/<id>`, een pagina die niet bestaat. Die melding linkt nu naar `/reservations/edit/<id>`.

## Contract tekenen in het portaal (nieuw, 18 oktober 2026)

Wat de nieuwe functie zelf aan beveiliging meebrengt:
- Elke route zoekt het document op via `getDocumentForCustomer`: de klant komt uit de sessie, met bestuurder-scope. Het nummer van een andere klant geeft 404.
- Alleen portaalbeheerders tekenen (`requirePortalRole("admin")`). Daarbij gelden CSRF, de algemene schrijflimiet en een eigen limiet van 20 per uur per account.
- De klant stuurt de SHA-256 mee van het bestand dat hij te zien kreeg. Staat er op de server een ander bestand, dan weigert de server.
- Alleen de nieuwste, niet-verouderde versie kan getekend worden.
- Per document kan maar één handtekening worden gezet. Dat dwingt een unieke index af, ook in `startup-migration.js`.
- Per handtekening wordt een audittrail opgeslagen in `portal_contract_signatures`:
  - naam en e-mailadres;
  - tijd, IP-adres en browser;
  - versie van de verklaring;
  - SHA-256 van het originele en van het getekende bestand.

  Dezelfde handtekening staat ook in het portaal-activiteitenlog en in `audit_logs` (`portal.contract_signed`).
- Kantoor kan het getekende contract en het origineel niet verwijderen en niet van type veranderen (409).
- De server controleert de hashes elke keer dat iemand naar de handtekening kijkt. Is het getekende bestand gewijzigd, dan geeft het portaal het niet meer uit.
- De klant krijgt een mail met een link, nooit de PDF zelf.

Let op bij productie: het IP-adres op de handtekening is pas het echte adres van de klant als `TRUST_PROXY_HOPS` in Coolify goed staat. Anders staat er het adres van de proxy.

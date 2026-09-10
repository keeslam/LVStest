# Fase 13–16 — geconsolideerd rapport (concurrency, PDF & sjablonen, bestandsafhandeling, e-mail/SMTP)

2026-09-10 · branch `feat/customer-portal` · auditserver `http://localhost:5001` (dev/tsx) · database
`lvs_audit`. Samengevoegd uit `docs/audit/wip/p13-concurrency.md` (C13-001…010),
`docs/audit/wip/p14-pdf-templates.md` (P14-001…019), `docs/audit/wip/p15-files.md` (F15-001…003) en
`docs/audit/wip/p16-email.md` (E16-001…006). Bestaande bevindingen uit
`docs/audit/03-phase-3-5-rapport.md` (BUG-001…059), `docs/audit/04-phase-6-8-security-report.md`
(BUG-060…105) en `docs/audit/05-phase-9-12-rapport.md` (BUG-106…158) worden **gerefereerd, niet
herhaald**. Er is geen applicatiecode gewijzigd, niets gecommit en de applicatie is niet in productie
gedraaid.

## Context — lees dit vóór elk getal

- **Alles draaide op de auditserver `:5001` tegen `lvs_audit`.** De dev-server op poort 5000 en de
  database `lvstest` zijn nooit aangeraakt. `lvs_audit` is een **kloon van de DEV-database**, niet van
  productie: codefouten gelden onverkort voor productie, datavondsten moeten daar eerst opnieuw gemeten
  worden.
- **Uploads staan buiten de repo.** `UPLOADS_DIR=C:\Users\kees lam\Desktop\LVStest-main\audit-uploads`
  — exact de vorm van de Coolify-deployment (gemount volume buiten `cwd`). Juist die configuratie legt
  de padresolutiefouten van fase 15 bloot; routes die `process.cwd()/uploads` hardcoden falen daar.
- **Er is nooit echte mail verstuurd.** Alle SMTP liep via een zelfgebouwde raw-TCP-stub op
  `127.0.0.1:2525` (`docs/audit/wip/scripts/p16-stub.cjs`) met schakelbare faalmodi. De
  `app_settings`-rijen `email_config` en `portal_config` zijn na afloop met `p16-z-restore.cjs`
  **teruggezet naar de snapshot van vóór de fase** (geverifieerd: identiek aan
  `p16-original-settings.json`).
- **Fixtures dragen de prefix `AUDIT-P13`/`AUDIT-P14`/`AUDIT-`/`AUDIT-P16`** en kentekens `AU-13x-X`,
  `AU-14x-X`, `AU-15A-X`. Ze zijn bewust blijven staan als bewijsmateriaal.
- **De server is in geen enkele fase gecrasht.** `/health` gaf 200 vóór en na elk script. Eén test
  (P14-007, 40 000 pagina's) maakte de server ~45 s onbereikbaar voor alle clients zonder herstart.

```text
DOCUMENT / EMAIL REPORT

PDF findings: 11 (BUG-162…167, 178, 183, 190, 191, 192) — contracten waarin de huurdersnaam
  ontbreekt zodra er één niet-WinAnsi-teken in staat (BUG-162), een fallbackgenerator die een
  **plattetekstbestand** als `.pdf` uitlevert en opslaat (BUG-163), een tweede fallback die elke
  waarde in het verkeerde vak zet doordat de y-flip ontbreekt (BUG-164), twee routes die het bestand
  wél schrijven maar de `documents`-rij **altijd** laten mislukken (BUG-165) en schadechecks die de
  klant als `null null` afdrukken voor ~99% van de klanten (BUG-166).
Template findings: 10 (BUG-168, 175…177, 179…182, 193, 194) — een ongevalideerde `page`-waarde in een
  schadecheck-sjabloon maakt 40 000 pagina's en blokkeert de hele server 76 s (BUG-168), de
  JavaScript/OpenAction van een geüploade PDF-achtergrond wordt in élk gegenereerd contract
  meegekopieerd (BUG-180), onleesbare of ontbrekende achtergronden vallen stil terug op de
  standaardlayout (BUG-179) en gelijktijdige sjabloon-/instellingenopslag overschrijft elkaars velden
  (BUG-175).
File findings: 3 (BUG-169, 184, 195) — met `UPLOADS_DIR` (de productievorm) geeft
  `GET /api/drivers/:id/license` **403 op elk rijbewijs** (BUG-169), twee contract-PDF's voor dezelfde
  plaat op dezelfde dag delen één bestand zodat de eerste stil overschreven wordt en de oude rij de
  nieuwe bytes serveert (BUG-184), en een document waarvan het bestand weg is blijft in elke lijst
  staan als normaal document (BUG-195).
Email findings: 4 (BUG-170, 185, 187, 196) — één APK-herinnering voor één auto ging naar **vier
  verschillende klanten** (BUG-170), er is geen enkele dedupe zodat een tweede klik tijdens een trage
  server dubbele mail bezorgt (BUG-185), portaalgebruikers kunnen rauwe HTML/phishinglinks in de
  staff-mail en in de in-app-melding planten (BUG-187), en de "Openen in de app"-link is stuk terwijl
  het euroteken in boetemails als `â¬` aankomt (BUG-196).
SMTP findings: 2 (BUG-171, 186) — de gepoolde transporter heeft géén connection-, greeting- of
  sockettimeout en maar 2 verbindingen, zodat één hangende mailserver alle mail (inclusief
  portaal-wachtwoordherstel) laat vastlopen zonder ooit terug te geven (BUG-171), en de opgeslagen
  `smtpSecure`-vlag wordt genegeerd zodat mail die de beheerder als TLS beschouwt in plaats daarvan
  in platte tekst verstuurd wordt (BUG-186).
Duplicate implementation: 3 renderers voor één contract (`generateRentalContractFromTemplate`
  `server/utils/pdf-generator.ts:55`, `generateRentalContract` `:541`, `generateFallbackContract`
  `:735`) plus één dode (`generateInteractiveDamageCheckPDF` `:968`), waarvan er twee alleen fout of
  niet-PDF-uitvoer maken; 3 verschillende coördinatenformules (`pdf-generator.ts:439-461` contract,
  `:1411-1425` transport, `pdf-damage-check-generator.ts:443-450` schade); 10 kopieën van "als string
  dan `JSON.parse`" voor `fields`; 3 onafhankelijke schadecheck-sjabloonkiezers (`routes.ts:6155-6165`,
  `:6660-6710`, `services/reservation-pdf-regeneration.ts:299-320`) die voor hetzelfde voertuig een
  ander sjabloon kiezen; 4 inline kopieën van `reservationData` voor schadechecks; 5 opslagblokken voor
  "contract als document" met twee mapconventies; 4 kopieën van `formatLicensePlate`; en 3 identieke
  multer-uploadroutes voor sjabloonachtergronden (`routes/pdf-templates.ts`,
  `routes/report-and-label-templates.ts`, `routes/damage-check-templates.ts`) waarvan er maar één de
  extensiewhitelist controleert.
Proposed technical improvements: (1) één gedeelde `renderPositionedFields()` met één
  coördinatenformule en één WinAnsi-sanitizer (of een Unicode-TTF via `@pdf-lib/fontkit`) voor contract
  én transport; (2) G2/G3/G4 verwijderen en de route hard laten falen in plaats van een tekstbestand
  te archiveren; (3) één `resolveDamageCheckTemplate(vehicle)` en één
  `buildDamageCheckReservationData(reservation)`; (4) één `registerGeneratedDocument()` die
  mapconventie, versienummering (met DB-garantie) en de `documents`-insert bezit; (5) één
  `saveTemplateBackground(kind,id,file)` met extensie- en contenttypecontrole; (6) één zod-schema per
  sjabloontype (`fields`/`canvasFields`) toegepast op create, update, import én preview; (7) alle
  padresolutie via `getUploadsDir()`/`resolveDocumentFilePath()`; (8) timeouts + een grotere of
  per-doel gescheiden SMTP-pool; (9) een mailwachtrij met retry, idempotentiesleutel en volledige
  `email_logs`-registratie; (10) optimistic locking (`updatedAt`-predicaat) op reservering,
  instellingen en sjablonen, en `SELECT … FOR UPDATE`/advisory locks rond elke check-then-act.
```

**Nieuwe bugs:** 38 (BUG-159 … BUG-196) — 1 CRITICAL, 12 HIGH, 16 MEDIUM, 9 LOW.
**Totaal tracker na deze fase:** 196 bugs — **12 CRITICAL, 56 HIGH, 81 MEDIUM, 47 LOW**.

---

## 0. Concurrency (fase 13) — STOP 6 sluit ook deze fase af

Fase 13 is met echte parallelle HTTP-requests gedraaid: `docs/audit/wip/scripts/p13-lib.cjs` vuurt elke
request via een eigen `http.request` met `agent:false` (geen keep-alive-pool, elke request een eigen
TCP-verbinding), allemaal gestart in dezelfde tick via `Promise.all`, met een optionele stagger van
10–80 ms zodat een "tweede klik" exact gesimuleerd kan worden. Elke sessie kreeg een eigen `fakeIp`
(`10.13.1.1` admin, `10.13.1.2` een tweede admin-tabblad, `10.13.1.3` een wegwerpmanager) zodat de
gedeelde `apiLimiter` (1000/15 min) en `loginLimiter` (5/15 min) nooit in de weg zaten. Bursts waren
gemaximeerd op 30 requests om de gedeelde server te ontzien; 20–30 bleek ruim genoeg om élke race
hieronder te bewijzen. Per test is de HTTP-uitkomstverdeling én de daarna met SQL gelezen eindtoestand
vastgelegd (`p13-*.out.json`). De client beschermt zichzelf wél: elke primaire formulierknop is
`disabled` op `isPending` — maar dat is **per tabblad en per knop**, deelt niets met een tweede
medewerker, een tweede tabblad of een scriptclient, en de kalender-drag/drop heeft helemaal geen knop
om uit te schakelen. De server heeft **geen enkele** idempotentiesleutel, optimistic-locktoken of
request-deduplicatie.

Bewezen raceklassen:

| Klasse | Wat er gebeurt | Bug-id's |
|---|---|---|
| **Dubbele boeking via het bewerkpad** | twee reserveringen tegelijk naar hetzelfde voertuig/dezelfde periode verplaatsen (`PATCH /:id` én `/basic`) → beide 200, twee `booked`-rijen op één auto; sequentieel geeft dezelfde actie correct 409 | **BUG-159** (CRITICAL) |
| **Vervanger dubbel toegewezen** | dezelfde reserveauto in twee verschillende verhuringen (`assign-spare`), `maintenance-with-spare` ∥ `assign-spare`, en twee transporten op dezelfde dag — het 00:00–23:59-venster wordt door de race verslagen | **BUG-160** (HIGH) |
| **Lockout-burst** | 30 parallelle foute wachtwoorden vanaf 30 IP's → alle 30 volledig geëvalueerd (401), pas ná de burst gaat het slot op 5 pogingen dicht | **BUG-161** (HIGH) |
| **Lost updates** | twee volledige formuliersaves overschrijven elkaars velden zonder waarschuwing — reserveringen (reproduceert zelfs **zonder** race), systeeminstellingen en de `fields`-blob van een PDF-sjabloon | **BUG-172**, **BUG-175**; voertuigen herbevestigd als **BUG-122** |
| **Dubbelklik-duplicaten** | server-side duplicaten bij `maintenance-with-spare` (2 blokken + 2 vervangers), twee pickups met verschillende contractnummers (2 contractdocumenten, 1 nummer weg), dubbelklik-retour (2 schadecheckdocumenten) en 12 create-endpoints (klanten, chauffeurs, kosten, transporten, blokken, portaalonderhoud) | **BUG-173**, **BUG-174**, **BUG-190**; portaalvariant herbevestigd als **BUG-141** |
| **Instellingen-clobber** | `PUT /api/system-settings` en `PATCH /api/pdf-templates/:id` zijn read-merge-write / blob-replace zonder versiecontrole | **BUG-175** |
| **Overige racegevolgen** | parallelle delete van één voertuig laat een weessnapshot in de prullenbak achter; parallelle wachtwoordwijziging vanuit twee tabbladen geeft twee keer 200 terwijl maar één wachtwoord werkt | **BUG-188**, **BUG-189** |

Wat wél standhield: statusguards (`cancel ∥ pickup`, `cancel ∥ edit`, twee retouren, dubbelklik-pickup
mét hetzelfde contractnummer), `restore ∥ delete` en `restore ∥ hergebruik kenteken`, de per-IP
loginlimiter, het onmiddellijk intrekken van een permissie midden in een sessie, en 30 parallelle zware
GET's (pool verzadigt tot `waiting=40`, `GET /api/reservations` degradeert naar ~4,2 s p50, maar alles
geeft 200 en de pool loopt weer leeg).

---

## 1. Voor de eigenaar

Acht punten in gewone taal.

1. **Documenten kunnen stil verkeerd of leeg zijn.** Staat er één bijzonder teken in een naam, adres,
   automodel of notitie — een emoji, een Turkse of Arabische letter, een pijltje `→` — dan verdwijnt
   dat hele veld van het contract. Er komt geen foutmelding: u krijgt een net contract **zonder de naam
   van de huurder**. Gaat er iets anders mis, dan levert het systeem soms een gewoon tekstbestand af
   met `.pdf` erachter (onleesbaar in elke pdf-lezer) of een contract waarin élke waarde in het
   verkeerde vakje staat. Schadechecks drukken bij bijna alle klanten `null null` af in plaats van de
   klantnaam. **BUG-162, BUG-163, BUG-164, BUG-166.**
2. **Sommige gegenereerde documenten verschijnen nergens in het systeem.** Twee knoppen ("standaard
   contract" en "schadecheck genereren") schrijven het bestand wel naar schijf, maar de databaseregel
   mislukt **altijd** door een programmeerfout. De medewerker ziet 200 OK en een download, maar het
   document staat niet in het dossier — dus wordt het opnieuw gegenereerd, en nog eens, en de bestanden
   stapelen zich op zonder dat iemand ze terugvindt. **BUG-165.**
3. **Een APK-herinnering voor één auto is naar vier verschillende klanten gegaan.** De mail wordt
   verstuurd aan iedereen die ooit een reservering op dat kenteken had, niet aan de klant die de auto
   nú heeft. Elke ontvanger leest daarmee het kenteken en de APK-status van een auto die niet van hem
   is. Dit is een privacykwestie, geen schoonheidsfoutje. **BUG-170.**
4. **Als de mailserver hangt, hangt uw hele mailverkeer — inclusief wachtwoordherstel.** Er staat geen
   enkele tijdslimiet op de mailverbinding en er zijn maar twee lijnen. Twee vastgelopen mails bezetten
   beide lijnen; alles daarna blijft wachten, ook een klant die op "wachtwoord vergeten" klikt. In de
   test kwam er na 45 seconden nog steeds geen antwoord. De rest van het systeem blijft ondertussen
   gewoon werken, dus niemand merkt het — behalve de mensen die op een mail wachten. Bovendien wordt de
   SSL-schakelaar in de instellingen genegeerd: mail die u versleuteld denkt te versturen gaat in platte
   tekst. **BUG-171, BUG-186.**
5. **In de productieopstelling zijn rijbewijzen niet op te vragen.** Omdat de bestanden daar op een
   apart gekoppeld volume staan en één route nog naar de oude map zoekt, krijgt de medewerker bij élk
   rijbewijs "Access denied" — terwijl het uploaden gewoon lukte. In het klantenportaal werkt exact
   dezelfde opvraag wél. Dat is een compleet geblokkeerde KYC-/complianceflow. **BUG-169.**
6. **Twee keer klikken is niet onschuldig.** De knop in het scherm blokkeert zichzelf, maar de server
   doet dat niet. Twee tabbladen, twee medewerkers of één trage klik maken: twee onderhoudsblokken met
   twee reserveauto's, twee contracten met verschillende nummers op één uitgifte, twee schadechecks bij
   één inname, dubbele klanten/chauffeurs/kostenposten/transporten, en — het ernstigst — **dezelfde
   auto twee keer verhuurd in dezelfde week** wanneer twee mensen tegelijk een boeking verslepen.
   **BUG-159, BUG-173, BUG-174, BUG-190.**
7. **Twee mensen die tegelijk hetzelfde formulier opslaan, wissen elkaars werk uit.** Beiden krijgen
   "opgeslagen", maar alleen de laatste telt — bij reserveringen, bij de systeeminstellingen en bij een
   PDF-sjabloon dat twee ontwerpers tegelijk bewerken. Bij reserveringen gebeurt dit zelfs **zonder**
   dat er iets tegelijk gebeurt: een tabblad dat al even openstond overschrijft bij opslaan gewoon de
   tussentijdse wijziging van een collega. **BUG-172, BUG-175.**
8. **Negen punten zijn geen programmeerfout maar een keuze die u moet maken.** Wie mag contracten en
   schadechecks genereren en inzien? Wat gebeurt er als een contract niet gemaakt kán worden — geen
   document, of toch een onbruikbaar bestand? Wie hoort een APK-herinnering te krijgen? Welke taal en
   dagtelling zijn leidend op een document? Welke reservering hoort op een schadecheck als de auto
   niets verhuurd staat? Hoe lang mogen namen en adressen zijn voordat ze niet meer op papier passen?
   Deze staan in §7 als voorstel, niet als opdracht. **BUG-163, BUG-167, BUG-170, BUG-178, BUG-181,
   BUG-182, BUG-183, BUG-192, BUG-195.**

---

## 2. Totalen

### 2.1 Nieuw in deze fase

| Severity | Nieuw | Bug-id's |
|---|---|---|
| CRITICAL | 1 | BUG-159 |
| HIGH | 12 | BUG-160 … BUG-171 |
| MEDIUM | 16 | BUG-172 … BUG-187 |
| LOW | 9 | BUG-188 … BUG-196 |
| **Totaal** | **38** | **BUG-159 … BUG-196** |

Verdeling over de bronfases: fase 13 → 10 bugs, fase 14 → 19, fase 15 → 3, fase 16 → 6.

### 2.2 Cumulatief tracker BUG-001 … BUG-196

| Severity | BUG-001…059 | BUG-060…105 | BUG-106…158 | BUG-159…196 | Totaal |
|---|---|---|---|---|---|
| CRITICAL | 7 | 2 | 2 | 1 | **12** |
| HIGH | 16 | 14 | 14 | 12 | **56** |
| MEDIUM | 24 | 17 | 24 | 16 | **81** |
| LOW | 12 | 13 | 13 | 9 | **47** |
| **Totaal** | **59** | **46** | **53** | **38** | **196** |

### 2.3 T/B-classificatie van de 38 nieuwe bugs

**T** = technische fout, mag met een regressietest gefixt worden zonder goedkeuring van de eigenaar.
**B** = bedrijfsregel/procesbesluit — de eigenaar moet eerst kiezen; komt terug als OPT-voorstel in §7.

| Type | Aantal | Bug-id's |
|---|---|---|
| T | 29 | alle nieuwe bugs behalve de negen hieronder |
| B | 9 | BUG-163, BUG-167, BUG-170, BUG-178, BUG-181, BUG-182, BUG-183, BUG-192, BUG-195 |

### 2.4 Severity-normalisaties ten opzichte van de bronrapporten

| Bron | Bronseverity | Nieuw | Reden |
|---|---|---|---|
| C13-002 | HIGH | **CRITICAL** (BUG-159) | de tracker classificeert élke dubbele boeking als CRITICAL — deterministisch (BUG-106, BUG-107) én racend (BUG-006). Het bronrapport stelde de verhoging zelf al voor ("consider elevating to CRITICAL"). Dat het bewerkpad betreft en niet het createpad verandert niets aan het gevolg: dezelfde auto, twee klanten, dezelfde week. |

Alle overige 37 bugs behouden de severity van hun bronrapport. Twee **bestaande** bugs krijgen een
voorgestelde verlaging op grond van runtimebewijs uit fase 15 — zonder hernummering, zie §6:
**BUG-076** (MEDIUM → voorstel **LOW**) en **BUG-097** (blijft LOW, voorstel: afwaarderen tot
hardeningpunt).

---

## 3. Per fase

### 3.1 Fase 13 — Concurrency & raceconditions

Fixtures: voertuigen `AU-1301-X`…`AU-13R1-X`, klanten `AUDIT-P13 customer 1..3`, reserveringen
3456-3532. Scripts `p13-00-setup`, `p13-01-edit` (+ `p13-01b-tpl-contract`), `p13-02-lifecycle`,
`p13-03-spare`, `p13-04-docs`, `p13-05-dblclick`, `p13-06-rapid`, `p13-07-tabs`, `p13-08-recycle`; ruwe
uitkomsten in `p13-*.out.json`. Server bleef de hele fase draaien (`/health` 200, uptime ~1168 s, pool
gezond).

**Getest (geslaagd)**
- **Voertuig-`PATCH` ∥ pickup (5a) en ∥ `mark-needs-service` (5b):** 8 respectievelijk 6 vertragingen
  (0–80 ms); de kilometerstand/`rented`-schrijfactie van de pickup en de servicevlag gingen **nooit**
  verloren (0/8 en 0/6). Het read-merge-write-venster van BUG-122 bestaat, maar slikte in deze runs de
  schrijfactie van het ándere endpoint niet op.
- **`cancel ∥ pickup`, `cancel ∥ edit`, twee retouren, dubbelklik-pickup met hetzelfde contractnummer
  (4a, 4b, 4d, 4f):** de statusguards (`status==='booked'`, `status==='picked_up'`, `deletedAt`-filter)
  hielden; de verliezer kreeg een nette 400, eindtoestand consistent.
- **`restore ∥ delete` en `restore ∥ kenteken opnieuw aanmaken` (12b, 12d):** elke keer consistent —
  één voertuig of geen, records schoon, geen 5xx (verliezende restore netjes 409, hergebruik 201/409).
- **Loginlimiter onder burst (8b2/8b3):** de per-IP `loginLimiter` maximeert één IP correct op 5 (rest
  429), zowel bij foute als bij juiste wachtwoorden.
- **Permissie intrekken midden in een sessie (9e):** `deserializeUser` herlaadt de gebruikersrij per
  request, dus de ingetrokken permissie werkt bij de eerstvolgende call (403). Correct.
- **30 parallelle zware GET's (8c):** geen 5xx, geen crash; de pg-pool verzadigt (`waiting` tot 40) en
  `GET /api/reservations` degradeert naar ~4,2 s p50 (2,3–5,1 s) tegenover 150 ms enkelvoudig, maar
  alles voltooit met 200 en de pool loopt weer leeg. Genoteerd als belastingobservatie, niet als
  defect.
- **10× `damage-checks/generate/:id` parallel (6b):** 10×200 (~4,7 s per call), 0 opgeslagen rijen
  (deze route streamt alleen), geen EBUSY.
- **10× transport-`generate-report` op hetzelfde transport (6c):** 10×201, 10 rijen, 10 verschillende
  bestanden (`Date.now`-suffix) — bij deze timing geen collisie.

**Niet getest**
- **>30 parallelle requests per burst** — gedeelde auditserver; 20–30 was genoeg om elke race te
  bewijzen (RS-001 had er 20 nodig).
- **Interactieve-save-race van schadechecks en concurrency op boetes/meldingen** — buiten de
  scopelijst van fase 13; de PDF-generatie van schadechecks is wél gedekt (6b).
- **Een echte reverse proxy die `X-Forwarded-For` strip** — deze machine heeft er geen; de
  lockout-race (BUG-161) is aangetoond met gespoofde IP's, precies de voorwaarde van BUG-009.
- **Race op portaal-boekingsgoedkeuring** — al gefiled als BUG-141; de staff-analoog
  (`maintenance-with-spare`) is vers gefiled als BUG-173.

**Bevindingen:** 10 (C13-001…010) → 10 nieuwe bugs, geen samenvoegingen.

### 3.2 Fase 14 — PDF- & sjabloonsysteem

Fixtures: klanten 1285-1297, voertuigen `AU-140-X`…`AU-14C-X`, reserveringen 3466-3477, transporten
60-64/72, `pdf_templates` 9-14, `transport_report_templates` 2-3, `damage_check_templates` 4,
`vehicle_diagram_templates` 2, `interactive_damage_checks` 15, plus een wegwerpgebruiker
`AUDIT-P14-limited` (permissies `["view_vehicles"]`, id 19). Scripts `p14-lib.cjs`, `p14-pdfinfo.cjs`
(pdfjs tekst + coördinaten, paginatelling, PNG-render), `p14-setup.cjs`, `p14-a-contracts.cjs`,
`p14-b-templates.cjs`, `p14-c-damage.cjs`, `p14-d-transport.cjs`, `p14-e-perms.cjs`,
`p14-f-eventloop.cjs`. **14 PDF's zijn naar PNG gerenderd en visueel geïnspecteerd** — dit is de eerste
fase waarin de fysieke inhoud van de documenten is beoordeeld en niet alleen status/contenttype/omvang
(het openstaande punt uit fase 9-12 §8). `pdfjs-dist 5.4.296`, `pdf-lib 1.17.1`, `canvas 3.2.0` en
`@napi-rs/canvas` stonden al in `node_modules`; er is niets geïnstalleerd. Defaults zijn hersteld
(`pdf_templates` → id 2, `transport_report_templates` → id 1, `damage_check_templates` → id 1).

#### Generator-inventarisatie

| # | Generator | File:line | Bibliotheek | Aangeroepen door | Sjabloonbron | Opgeslagen? |
|---|---|---|---|---|---|---|
| G1 | `generateRentalContractFromTemplate` | `server/utils/pdf-generator.ts:55-535` | pdf-lib, Helvetica (WinAnsi) | `contracts/generate/:id`, `generate-default/:id`, `generate-versioned/:id`, `contracts/preview`, `pdf-templates/:id/preview`, pickupflow (`routes.ts:2705, 4190`), regeneratieservice | `pdf_templates.fields` (jsonb, 3 vormen) + `backgroundPath` (PDF/PNG/JPG, lokaal of object storage) | `documents`-rij + bestand, via **drie** verschillende opslagblokken |
| G2 | `generateRentalContract` (legacy, vaste coördinaten) | `pdf-generator.ts:541-733` | pdf-lib | fallback in `routes.ts:4191, 5509, 5551, 5557, 6010` (onbekend `templateId`, geen sjabloonrij, of G1 gooit) | hardcoded `process.cwd()/uploads/templates/rental_contract_template.pdf` | idem |
| G3 | `generateFallbackContract` | `pdf-generator.ts:735-793` | **geen** — geeft een **tekst**-Buffer | catch van G1 (`:531`) en G2 (`:727`) | — | geserveerd als `application/pdf`, opgeslagen als `.pdf` (**BUG-163**) |
| G4 | `generateInteractiveDamageCheckPDF` | `pdf-generator.ts:968-1258` | pdf-lib | **geen aanroeper** (dode code, opnieuw met grep bevestigd) | — | — |
| G5 | `generateDamageCheckPDFWithTemplate` → `…FromCanvas` | `server/pdf-damage-check-generator.ts:802 → 114-757` | pdf-lib, eigen `sanitizeForWinAnsi` | `damage-checks/generate/:id`, `vehicles/:id/damage-check-pdf`, `interactive-damage-checks/:id/pdf`, auto-PDF bij POST/PUT, pickupflow (`:4398`), `damage-check-templates/preview-pdf`, regeneratie | `damage_check_templates.canvasFields` + headerafbeelding uit `app_settings` + `vehicle_diagram_templates` | rij + bestand (insert van de generate-route mislukt altijd, **BUG-165**) |
| G6 | `generateTransportReportsPdf` | `pdf-generator.ts:1450-1489` | pdf-lib | `delivery/transports/generate-report`, `transport-report-templates/:id/preview` | `transport_report_templates.fields` + afbeeldingachtergrond | `documents`-rij (`transport_report`, pad relatief aan uploads-root → BUG-029) |
| G7 | `renderBarcodePng` | `server/utils/barcode-png.ts:5` | eigen PNG-encoder | ingebed rechtsboven door G1/G2 | — | in het contract |
| C1 | Sleutellabels / barcodeboek | `client/src/components/barcodes/key-label-print.ts:159, 239` | HTML in verborgen iframe + `window.print()` | alleen client | `barcode_label_templates` (geen serverzijdige validatie) | nee |
| C2 | Printen van serverPDF's | `pdf-preview-dialog.tsx:39/56`, `pages/documents/index.tsx:249/277`, e.a. | iframe/popup `print()` | alleen client | — | nee |
| — | `convertPdfToPng` | `server/utils/pdf-to-image.ts:17` | pdfjs + `canvas` | achtergronduploads (`routes/pdf-templates.ts:377, :566`) | — | previewafbeelding (faalt op Windows, **BUG-193**) |

Er bestaat **geen** server-side generator voor facturen, boetes, kosten of rapporten (rapporten zijn
JSON/HTML en worden client-side geprint; `invoice-scanner.ts` léést alleen PDF's). Het portaal genereert
niets zelf, het serveert bestaande `documents`-rijen.

#### Dubbele-implementatie-analyse (voorstel, niets gewijzigd)

| Onderwerp | Implementaties (file:line) | Waargenomen divergentie |
|---|---|---|
| Contractrendering | G1 `pdf-generator.ts:55`, G2 `:541`, G3 `:735`, dode G4 `:968` | G1 = gepositioneerde velden (top-left, geflipt); G2 = vaste coördinaten **zonder** y-flip → elke waarde in het verkeerde vak (BUG-164); G3 = platte tekst (BUG-163); G4 onbereikbaar |
| Coördinatentransformatie editor→PDF | `pdf-generator.ts:439-461` (`842-y-1-0.85*fontHeight`, padX 6), `:1411-1425` (transport, formule gekopieerd), `pdf-damage-check-generator.ts:443-450, 522, 563, 626-640` (`PAGE_H-yTop-PAD_Y-0.78*fontSize`, padX 4) | drie verschillende baselineformules; hetzelfde (x,y) landt per documenttype op een andere hoogte |
| `fields` parsen | `pdf-generator.ts:230-280`, `:1434-1443`, `routes.ts:2697, 5484-5497, 5519-5533, 5722-5730, 5857-5865, 5990-5998`, `routes/pdf-templates.ts:126-138`, `database-storage.ts:2327-2335` | **10 kopieën** van "als string dan `JSON.parse`"; geen enkele valideert de elementvorm (BUG-048) |
| Veldwaarde-resolutie | contract `pdf-generator.ts:312-392`, transport `:1401` (`data[source] ?? ''`), schade `:672-676` (`dynVals[source] ?? '{{source}}'`) | drie gedragingen bij een onbekende bron: label afdrukken / niets / `{{source}}` (BUG-191) |
| WinAnsi-veiligheid | alleen `pdf-damage-check-generator.ts:123-137` `sanitizeForWinAnsi` | contract en transport hebben er geen → velden vallen stil weg (BUG-162) |
| Schadecheck-sjabloonkeuze | `routes.ts:6155-6165` (alfabetisch eerste), `routes.ts:6660-6710` (5-traps make/model/type), `services/reservation-pdf-regeneration.ts:299-320` `pickBestDamageCheckTemplate` | hetzelfde voertuig (1840) kreeg sjabloon 4 uit twee endpoints en sjabloon 1 uit het derde (BUG-181) |
| `reservationData` voor schadechecks | `routes.ts:6178-6190`, `:6720-6746`, `:6940-6950`, `:7250-7262`, `reservation-pdf-regeneration.ts:~370` | drie contractnummerformaten en twee naambronnen op één documenttype (BUG-166, BUG-183) |
| Contract als document opslaan | `routes.ts:5561-5650`, `:5885-5950`, `:6020-6060`, `:4824` (pickup), `reservation-pdf-regeneration.ts:131-200` | twee mapconventies, één bestandsnaam voor elke versie (BUG-027), één pad dat nooit registreert (BUG-165) |
| Schadecheck als document opslaan | `routes.ts:6217-6280`, `:6960-7000`, `:7150-7190`, `reservation-pdf-regeneration.ts:418-460` | idem |
| `formatLicensePlate` | `pdf-generator.ts:19`, `pdf-damage-check-generator.ts:13`, `rdw-api.ts:35`, `client/src/lib/format-utils.ts:57` | identieke kopieën; leidt streepjes opnieuw af uit de ruwe string (`AU-14B-X` → `AU-14-BX`) |
| Achtergrond laden | contract `pdf-generator.ts:73-207` (5 geneste fallbacks), transport `:1462-1478` (alleen afbeelding), schade (kolom `backgroundPath` bestaat maar wordt nooit gelezen) | contract valt stil terug (BUG-179); transport tekent stilzwijgend niets; schade negeert de kolom volledig |
| Uploadroutes voor achtergronden | `routes/pdf-templates.ts:306-412, 503-603`, `routes/report-and-label-templates.ts:256-300, 351-388`, `routes/damage-check-templates.ts:329-372, 423-460` | drie kopieën van dezelfde multer+write+preview-code; alleen de transportkopie controleert de extensiewhitelist |

**Verdict:** alleen al het contractpad heeft drie renderers, waarvan er twee (G2, G3) uitsluitend
verkeerde of niet-PDF-uitvoer maken, plus één dode renderer (G4). Het consolidatievoorstel staat in §7.

**Getest (geslaagd)**
- G1 met een volledig 20-velds sjabloon op een normale reservering rendert élke bron (`customer.*`,
  `vehicle.*`, `reservation.*`, `contractNumber`, `contractDate`, `driver.*`, midden/rechts uitgelijnd)
  op de bedoelde coördinaten; barcode `RES-003466` rechtsboven; 1 pagina, 311 kB, parseert met pdfjs én
  pdf-lib. `contracts/data/:id` geeft dezelfde waarden als de PDF; `€ 1.234.567,89` correct opgemaakt.
- Previewtokenflow: het token is gebonden aan de aanmakende gebruiker (ophalen als een andere gebruiker
  → 404); `/api/contracts/preview/../../etc/passwd` → SPA-HTML, geen traversal.
- PNG-achtergrond werkt: het contract wordt een 5 kB afbeeldingsgedekte A4 met de velden erop; ook een
  JPEG-bibliotheekachtergrond werkt; een bibliotheekachtergrond verwijderen ruimt de bestanden op;
  `POST /backgrounds` zonder `name` → 400.
- De transportroute weigert een TBD-vervangertransport met 400 en het transport-id (de serverguard die
  BUG-119 aan contractzijde mist, is hier wél aanwezig); batchlimiet (max 50) en "niets gevonden" → 404
  werken.
- Schadecheck-conceptpreview met een lege body of een niet-array `canvasFields` rendert een lege pagina
  in plaats van te falen; diagramupload en -inbedding werken, een ontbrekend/kapot diagrambestand
  degradeert naar een zichtbare placeholder; export → import → clone-rondgang werkt.
- Permissiechecks op `/api/pdf-templates*`, `/api/damage-check-templates*`,
  `/api/transport-report-templates*`, `generate-report` en `damage-checks/generate` zijn **correct**
  (403 voor de beperkte gebruiker, 401 anoniem).

**Niet getest**
- **Legacy sjabloonbestand afwezig** (`uploads/templates/rental_contract_template.pdf`): de enige kopie
  staat in `process.cwd()/uploads` van de dev-server op poort 5000, die niet aangeraakt mag worden. Het
  gevolg (G2 → tekstfallback) is afgeleid uit `pdf-generator.ts:548-549, 727` plus het feit dat
  `uploads/` gitignored is en het pad `UPLOADS_DIR` negeert — een verse deployment heeft dat bestand
  dus helemaal niet.
- **Portaalzijde**: er bestaat geen generatie in het portaal; het downloadt alleen bestaande documenten.
- **Replit-object-storage-achtergrond** (`backgroundPath` beginnend met `/`): sidecar onbereikbaar, al
  gedekt in fase 3-5 (DM-013).
- **Visuele overlapcontrole met de vectorvorm van het standaardsjabloon**: pdfjs geeft tekstboxen, geen
  vectorvormen — "lange tekst overlapt de voorgedrukte tekst niet" is dus **niet verifieerbaar** verder
  dan de paginarandcontrole.
- **Client-side printuitvoer** (sleutellabels, barcodeboek, kalender/rapport printen): HTML +
  `window.print()`, niet te renderen in dit harnas; alleen de sjabloon-CRUD is uitgeoefend.
- **`page ≥ 100 000` of 100 000 contractvelden**: niet geprobeerd op de gedeelde server nadat de
  40 000-paginarun hem al ~45 s blokkeerde (BUG-168 extrapoleert lineair: ~2 ms en ~380 B per pagina).
- **Pickup-/returnflows die contracten en schadechecks genereren**: fase 10/13-gebied; alleen de
  generator die ze aanroepen (G1/G5) is hier getest.
- **Rate limiting/DoS op `contracts/generate`** door een gewone gebruiker: niet gemeten (elke call
  ~100 ms, 310 kB bestand + rij).

**Bevindingen:** 19 (P14-001…019) → 19 nieuwe bugs, geen samenvoegingen.

### 3.3 Fase 15 — Bestandsafhandeling

`UPLOADS_DIR` stond **buiten de repo** (`…\LVStest-main\audit-uploads`) — exact de productievorm.
Fixtures onder `docs/audit/wip/scripts/files/p15/`, voertuig 1832 (`AU-15A-X`). Scripts
`p15-a-docs.cjs`, `p15-b-endpoints.cjs`, `p15-c-traversal.cjs`. Elk tijdelijk bestand buiten de database
is achteraf verwijderd (twee losse bestanden in `backups/` opgeruimd; niets is buiten
`UPLOADS_DIR`/`backups` beland).

#### Upload-inventarisatie (verdicht — 31 routes)

| Groep | Routes | Auth | Opslag | Limiet | fileFilter | magic-byte-controle |
|---|---|---|---|---|---|---|
| Documenten & schadechecks | `POST /api/documents`, `POST/PATCH /api/reservations[/:id]` | `MANAGE_DOCUMENTS` / `MANAGE_RESERVATIONS` | schijf `<UPLOADS>/<plaat>/<type>/` of `contracts/<plaat>/` | 25 / 10 MB, 1 bestand | `'document'` | ✓ op `/api/documents`, **geen** op de reserveringsroutes |
| Kosten & bonnen | `POST /api/expenses`, `…/with-receipt`, `PATCH /api/expenses/:id[/with-receipt]`, `POST /api/expenses/scan` | `MANAGE_EXPENSES`, **3 routes zonder auth (BUG-003)** | schijf `receipts/`, scan via `temp/` → `invoices/<hash>.pdf` | 25 MB, 1 | `'document'` / `'pdf'` | ✓ |
| Brandstofbon | `PATCH /api/vehicles/:id/fuel-status` | `MANAGE_VEHICLES` | schijf `<plaat>/fuel_receipt/` | 25 MB, 1 | `'document'` | ✓ |
| Rijbewijzen | `POST /api/customers/:id/drivers`, `PATCH /api/drivers/:id`, `POST /api/portal/drivers/:id/license` | `MANAGE_CUSTOMERS` / portaal | schijf `<UPLOADS>/drivers/` | 10 MB, 1 | `'document'` | ✓ |
| Sjabloonachtergronden (3 modules × 2 routes) | `pdf-templates`, `damage-check-templates`, `transport-report-templates` | `MANAGE_PDF_TEMPLATES` / `MANAGE_DAMAGE_CHECKS` | **memory** → `<UPLOADS>/templates|…/` | 10 MB, 1 | `'document'` (+ ext-check alleen bij schade/transport) | `validateFileBuffer` ✓ |
| Diagrammen & header | `damage-check-templates/upload-photo`, `POST/PATCH /api/vehicle-diagram-templates`, `POST /api/damage-check-fields/header` | `MANAGE_DAMAGE_CHECKS` / **`requireAuth` only (BUG-066)** / admin | schijf `vehicle-diagrams/`, `damage-check/` | 10 / 5 MB, 1 | `'image'` | ✓ behalve `upload-photo` en `header` |
| Back-ups | `POST /api/backups/upload`, `restore-data`, `restore-code`, `restore-files` | `MANAGE_BACKUPS` | schijf `temp/` → `backups/` | **1 GB**, 1 | `'backup'` | ✓ (restore = tar over cwd, BUG-069) |
| Boetes | `POST /api/fines/scan`, `POST /api/fines`, `…/:id/letter`, `fines/imports/upload` | `canManage` | schijf `fines/`; import in **memory** | 10 / 20 MB, 1 | `'document'`; import **geen filter** (ext-regex achteraf) | ✓ behalve import (XML/CSV geparsed) |
| Portaal | `POST /api/portal/requests` | portaalgebruiker + `canSubmitRequests` | schijf `portal-requests/` | 10 MB, **5 bestanden** | `'document'` | ✓ |

#### Serveer-inventarisatie (verdicht — 19 routes)

| Groep | Padresolutie | Containment | Oordeel |
|---|---|---|---|
| `GET /api/documents/view|download/:id` | `path.join(cwd, filePath)` (+ `uploads/`-fallback) | **geen** (BUG-012) | werkt mét `UPLOADS_DIR` omdat `join` de `..\` bewaart |
| `GET /api/expenses/:id/receipt` | `path.resolve(receiptFilePath)` | **geen**, **geen auth** | arbitrary read (BUG-003/BUG-060) |
| `GET /api/drivers/:id/license` | `path.resolve(cwd, licenseFilePath)` | `startsWith(cwd/uploads)` | **kapot met `UPLOADS_DIR` → 403 (BUG-169)** |
| `GET /api/vehicle-diagram-templates/:id/image`, `GET /api/damage-check-fields/header` | `path.join(cwd, …)` | geen | pad is serverzijdig gezet; leeskant van BUG-066/070 |
| `GET /api/fines/:id/letter`, `…/imports/:id/file` | `resolveDocumentFilePath` / `path.resolve(cwd, rawPath)` | ✓ (symlinkcaveat BUG-098) | correct |
| `GET /api/backups/download/:filename` (2 varianten) | service `join(backupPath, name)` | blokkeert `..` en `/` (backslashgat BUG-097) | traversal runtime geblokkeerd, zie §6 |
| `GET /uploads/*` (statisch) | `express.static(cwd/uploads)` | statische resolver | **negeert `UPLOADS_DIR`** (BUG-085/BUG-026); missende paden → 200 SPA-shell |
| 5 portaalroutes + `GET /api/portal-requests/:id/attachments/:attachmentId` | `resolveDocumentFilePath` | ✓ + per klant gescopeerd | **correct** — de portaalvariant van het rijbewijs werkt wél waar de staffroute faalt |
| `GET /object-storage/*` | Replit-sidecar | n.v.t. | BUG-051 (inert) |

**Getest (geslaagd)**
- **Magic-byte-handhaving is solide** op elke schijfroute die `validateAfterUpload` aanroept:
  EXE-als-`.pdf` (`400` "content does not match… detected application/x-msdownload"),
  tekst-als-`.pdf`, 0-bytebestand en verkeerde inhoud geven alle netjes 400.
  `createSecureMulterFilter` blokkeert gevaarlijke extensies (`.exe`, `.svg`, `.html`, …) en laat een
  gedeclareerde `application/octet-stream` alleen door naar de strengere magic-bytepoort.
- **Opgeslagen bestandsnamen vertrouwen client-input nooit.** Documenten/kosten/brandstof/schadecheck
  leiden `<plaat>_<type>_<datum>_<timestamp><ext>` af; rijbewijzen/boetes/portaal krijgen
  servergegenereerde namen; `busboy` reduceert `originalname` bovendien tot de basename — **live
  geverifieerd voor zowel `/` als `\`** — zodat `../`, `..\`, `%00`, spaties, unicode/emoji en
  255-tekennamen niet kunnen traverseren of botsen.
- **Traversal op beide backup-downloadroutes is geblokkeerd**: `..%2f..%2fpackage.json`,
  `..\..\package.json` en `....//package.json` geven alle drie **400 "Invalid filename"**.
- **Polyglot PDF/`<script>` wordt veilig geserveerd**: `X-Content-Type-Options: nosniff` staat er
  (helm + een tweede expliciete header) en het `Content-Type` komt uit een magic-byte-gevalideerde PDF
  → geen XSS via de documentroutes.
- **De portaalserveerroutes zijn correct gescopeerd en containment-gecontroleerd** (alle via
  `resolveDocumentFilePath()` + per-klantscope).
- **CJIB-import** parseert XML met `fast-xml-parser` (geen entity-resolutie, dus geen XXE) binnen
  try/catch; misvormde invoer degradeert naar een "failed"-importrij zonder crash; verkeerde extensies
  → 400.
- **Grote uploads worden naar schijf gestreamd** (multer `diskStorage`/`dest`), dus een body van 60 MB
  laat de RSS van het proces niet exploderen.

**Niet getest**
- **Portaal `POST /api/portal/requests` met misvormde `payload`** (de DM-001/BUG-002 proceskill) —
  bewust **niet** opnieuw getriggerd: het sloopt de gedeelde server voor elke gelijktijdige agent.
- **Backup-restore (`restore-data/code/files`)** — BUG-069 (tar over cwd) is een destructieve
  RCE-primitief; niet uitgevoerd tegen de gedeelde instance.
- **Diepe/entity-expansie-XML-DoS op de CJIB-import** — `collectRecordNodes`/`flatten` zijn onbegrensd
  recursief, maar de recursie zit binnen de try/catch van `parseCjibFile`, dus een `RangeError` wordt
  gevangen. Een echt vijandig billion-laughs-bestand kan nog steeds CPU/geheugen opstoken; alleen een
  ondiepe misvormde case is verstuurd. Genoteerd als LOW-restrisico, **geen bug gefiled** (exploiteer-
  baarheid ongetest).
- **Hoofdlettercollisie `A.PDF` vs `a.pdf`** — niet apart geforceerd; alle routes behalve het
  contractpad (BUG-184) zetten een milliseconde-timestamp achter de naam.
- **Permissiefout (alleen-lezen bestand/map)** — de impactvollere opslagfouten (oversize → 500,
  ontbrekend bestand → 404, `UPLOADS_DIR`-mismatch → 403) zijn zonder ACL-wijziging gereproduceerd.

**Bevindingen:** 3 (F15-001…003) → 3 nieuwe bugs, plus zes herbevestigingen inclusief twee
**ontkrachtingen** (BUG-076, BUG-097 — zie §6).

### 3.4 Fase 16 — E-mail / SMTP

Staff-adminsessie, portaalklant 179 (`portaal-test@example.com`), portaalgebruiker 30. Alle SMTP liep
via `p16-stub.cjs` op `127.0.0.1:2525` met schakelbare faalmodi; de app werd erheen gewezen via zijn
eigen `POST /api/app-settings` (rij `email_config`). De volledige DATA-capture (10 MB
`p16-smtp-log.jsonl`) is selectief gegrepd, nooit integraal gelezen. Centrale code:
`server/utils/email-service.ts`, `server/routes/notifications.ts`, `server/routes.ts:5219/5305`,
`server/services/portal-mail.ts`, `server/services/portal-notifications.ts`,
`server/routes/app-settings.ts:309`.

#### Mailpad-inventarisatie (verdicht)

| Pad | Instellingenbron | Ontvanger | Taal | In `email_logs`? | Retry/idempotentie |
|---|---|---|---|---|---|
| `POST /api/documents/:id/email`, `POST /api/email/send-documents` | `email_documents`, anders `email_config` | `recipients` / `recipientEmail` uit de body (komma-gesplitst) | taal van de opsteller, geen i18n | **nee** | **nee** |
| `POST /api/notifications/send` (apk / maintenance / custom) | `email_apk` / `email_maintenance` / `email_custom`, anders `email_config` | join `vehicles→reservations→customers`, kiest `emailForMOT`→`email`→`emailGeneral` | i18n nl/en op `customer.preferredLanguage` | **ja** (één rij per call, ná de lus) | nee |
| `POST /api/notifications/send-gps-activation` | `email_gps` | `app_settings.gps_recipient_email` | vaste nl-tekst | ja | nee |
| 8 portaalpaden (invite, reset, new-device, e-mailwijziging, boete-gekoppeld, onderhoud, antwoord op aanvraag, staffmelding) | `custom` → `email_custom`/`email_config` | portaalgebruiker / klant / `notificationEmail` | vaste nl-sjablonen uit `email_templates` | **nee** | nee (onderhoud dedupt op meldingstag, de mail volgt) |
| `POST /api/app-settings/email/test` | alleen de body (host/port/user/pass) | geen (alleen verify) | — | nee | n.v.t. |

Alle 8 portaalpaden **en** beide staff-documentpaden zijn onzichtbaar voor `email_logs`; alleen de twee
`notifications.ts`-handlers en de GPS-handler schrijven rijen. Empirisch bevestigd: `email_logs` bleef
op `10` staan door élke faalcase heen.

#### SMTP-faalmatrix (verdicht)

| Modus | HTTP + latency | Toestand achteraf |
|---|---|---|
| happy `ok` | 200, ~40 ms | bezorgd; bijlage byte-identiek aan het bestand op schijf (310 858 B) |
| `auth535` / `rcpt550` / `tls-required` / `starttls-only` | **500**, 23–27 ms | niets verstuurd, generieke melding "Failed to send email…" |
| `silent` (geen banner) | **500 na 30 035 ms** | niets verstuurd; 30 s stilstand, daarna generieke fout |
| `hang-ehlo` (banner, geen EHLO-antwoord) | **GEEN ANTWOORD binnen 45 000 ms**, socket nog open | thread geblokkeerd, keert nooit terug |
| `data-hang` (geen 250 na DATA) | **GEEN ANTWOORD binnen 45 000 ms**; body **wél** ontvangen | duplicaatrisico: de server heeft de mail, de app denkt van niet |
| `drop` (RST bij connect) | **GEEN ANTWOORD binnen 20 000 ms**; 120 verbindingen in 20 s | late bezorging zodra de stub weer `ok` is |
| `drop-data` | 500, 20 ms; body ontvangen | app meldt mislukt, ontvanger kreeg hem tóch |
| ontbrekende config / DNS `.invalid` / refused | 500, 8–51 ms | niets verstuurd |
| onbereikbaar `10.255.255.1` | **GEEN ANTWOORD binnen 20 000 ms** (2 min connectTimeout) | thread geblokkeerd |
| poort `abc`/`0`/`-1`/`99999`/`""` | 500, ~20 ms; **rij ongewijzigd opgeslagen** | niets verstuurd (BUG-025) |
| `smtpSecure:true` op poort 2525 | **200 — in platte tekst verstuurd** | de opgeslagen vlag werd genegeerd (**BUG-186**) |
| `fromEmail:"not an address"` | **200 — verstuurd** met `MAIL FROM:<not an address>` | malformed envelope bezorgd, geen validatie |
| `auth535` op bulk-APK | **200** `{sent:0,failed:4}` + `email_logs`-rij met `failure_reason` | het **enige** pad dat een mislukking vastlegt |
| `auth535` op 5 portaalpaden | 200 naar de aanroeper | DB volledig gecommit (antwoord `done`, token geroteerd, blok aangemaakt, boete gekoppeld); **geen mail, geen log, geen signaal** (BUG-155) |

`/health` gaf **200 in 4–59 ms tijdens élke hang**: een vastgelopen mailverzending blokkeert alleen de
eigen requestthread, niet de event loop — maar hij houdt wél een van de twee poolverbindingen vast.

**Getest (geslaagd)**
- Happy-path documentmail: juiste ontvanger/onderwerp/afzender, HTML+tekst-alternatief, bijlage
  byte-identiek aan de PDF op schijf.
- Meerdere/lege/ontbrekende ontvangers: kommasplitsing werkt; leeg → nette 400; onbekende en dubbele
  document-id's afgehandeld; ontbrekend bestand → 404; een gedeeltelijke set slaat het missende bestand
  over. De allowlist van documenttypen (alleen contract/schadecheck) wordt op beide routes gehandhaafd.
- Doelprecedentie: `email_documents` gaat vóór `email_config`, en valt netjes terug als de rij weg is;
  een rommelrij met `category=email` breekt de fallback niet.
- Bulk-i18n: nl vs en op `preferredLanguage`; ontbrekende APK-datum → "Unknown"; `{placeholder}`-
  substitutie werkt en een onbekende placeholder blijft letterlijk staan.
- De SMTP-testroute rapporteert succes/auth/timeout onderscheidend en verstuurt nooit iets.
- **Portaaltokenmodel:** invite/reset-token is 256-bit random, alleen de sha256 wordt opgeslagen, 72 uur
  geldig (server-side in UTC), **eenmalig** bruikbaar, en een tweede invite overschrijft de hash zodat
  er altijd maar één geldige link is. `portalBaseUrl` wordt letterlijk gebruikt maar is
  **staff-geconfigureerd**: een `Host: evil.example`-header verandert de link níét (geen
  host-header-poisoning).
- `POST /api/portal/forgot` geeft een uniforme 200 voor bekende, onbekende, geblokkeerde en
  hoofdlettervariante adressen — geen enumeratie-orakel in de body (de ontbrekende rate limit is wél
  BUG-092).
- Onderhoudsmeldingen zijn idempotent via de dedupe-tag; goedkeuring en melding blijven gecommit als
  SMTP faalt.

**Niet getest**
- **Echte TLS / poort 465**: de stub kan geen TLS (STARTTLS → drop), dus `smtpSecure:true` over een
  werkelijk versleuteld kanaal is niet uitgeoefend; de platte-tekstwaarneming staat wel vast.
- **Werkelijke rate limiting/abuse-detectie van de provider** (BUG-081): buiten scope voor een lokale
  stub.
- De cases `unroutable`, `drop` en `hang-ehlo` zijn **afgekapt** op 20–45 s in plaats van doorgedraaid
  tot nodemailers volle ~2 min connectTimeout; "hangt onbepaald" volgt uit het bereiken van de cap met
  een nog open socket.
- **Herkomst van de `email_logs`-rij uit C4**: het rij-id is niet vastgelegd, dus dat die rij een oudere
  is kan wel beredeneerd maar niet bewezen worden.
- `POST /api/notifications/send` met `customerIds` (zonder voertuig) en met
  `individualEmailSelections`: alleen het voertuiggestuurde pad is uitgeoefend.

**Bevindingen:** 6 (E16-001…006) → 6 nieuwe bugs, geen samenvoegingen.

---

## 4. Deduplicatie — mapping wip-id → tracker-id

Bevindingen die dezelfde root cause delen zouden samengevoegd worden; in deze vier fases is dat
**nul keer** nodig gebleken — elke bevinding heeft een eigen root cause en een eigen regressietest. Wel
zijn er **elf expliciete rulings** genomen over "nieuw nummer versus bestaande bug", plus **twee
gedeeltelijke toewijzingen** waarin de helft van een bevinding naar een bestaande bug gaat, en **twee
ontkrachtingen** van bestaande bugs. Alles staat hieronder.

| Wip-id | Verdict | Tracker-id |
|---|---|---|
| C13-001 | nieuw — BUG-122 dekt hetzelfde read-merge-write-patroon op **voertuigen**; dit is de reserveringsentiteit met twee eigen edit-endpoints (`PATCH /:id` en `/:id/basic`) en reproduceert bovendien **zonder enige concurrency** (test 1c-seq) | **BUG-172** |
| C13-002 | nieuw, **severity genormaliseerd HIGH→CRITICAL**. *Ruling:* onderscheiden van BUG-006 (createpad), BUG-106 (controle **overgeslagen** als `vehicleId` ontbreekt) en BUG-107 (turnovergat): hier **draait de controle wél** en raced hij alsnog, omdat `checkReservationConflicts` en `updateReservation` niet in één transactie met rijvergrendeling zitten. Eigen fix (`FOR UPDATE`/advisory lock/exclusion constraint), eigen regressietest | **BUG-159** |
| C13-003 | nieuw — **samenvoeging met BUG-032/BUG-121 overwogen en afgewezen.** BUG-032 = tweemaal `assign-spare` op **dezelfde** verhuring zonder bestaanscontrole (ontbrekende lookup, deterministisch). BUG-121 = twee vervangers **binnen één payload** van `maintenance-with-spare` (ontbrekende interne validatie). C13-003 is een **race over drie verschillende endpoints**: `assign-spare` op **twee verschillende verhuringen**, `assign-spare` ∥ `maintenance-with-spare`, en twee `POST /api/transports` op dezelfde dag — waarbij het expliciete 00:00–23:59-venster van `applyTransportUpdate`, dat juist tégen dat laatste geval is gebouwd, door de race wordt verslagen. Andere fix (rijvergrendeling die twee transacties omspant), andere regressietest | **BUG-160** |
| C13-004 | nieuw — **gescheiden gehouden van BUG-141.** Andere endpoint (`POST /api/reservations/maintenance-with-spare` in `server/routes.ts:2787-2960` versus `POST /api/portal-requests/:id/approve` in `server/routes/portal-requests.ts`), andere aanroepers, andere fix. Het gevolg is dezelfde datavorm (twee blokken + twee vervangers), maar de root cause zit in een ander bestand en de portaalfix repareert het staffpad niet | **BUG-173** |
| C13-005 | nieuw — versterkt BUG-009 (per-IP-limiter omzeilbaar via `X-Forwarded-For`) en BUG-105 (gedeelde teller), maar dit is de **account**-lockout die als backstop bedoeld is en onder concurrency geen enkele throttle levert | **BUG-161** |
| C13-006 | nieuw — *ruling:* niet samengevoegd met BUG-038 (rauwe DB-fout bij een dubbel contractnummer) noch met BUG-120 (pickup schrijft vóór de voertuigcontrole, geen transactie). BUG-038 is precies het geval waarin de twee pickups **hetzelfde** nummer gebruiken (unieke constraint vangt het, met een lelijke fout). C13-006 is het geval met **verschillende** nummers, waar geen enkele constraint bestaat: beide slagen, twee contractdocumenten, één nummer stil overschreven. `p13-01-edit.cjs` test 11a/11b levert wél nieuwe evidence bij BUG-038 (zie §6) | **BUG-174** |
| C13-007 | nieuw | **BUG-188** |
| C13-008 | nieuw (bevat beide endpoints — `PUT /api/system-settings` en `PATCH /api/pdf-templates/:id` — omdat het één en hetzelfde read-merge-write-/blob-replace-patroon is met één gedeelde fix: optimistic concurrency op `updatedAt`) | **BUG-175** |
| C13-009 | nieuw — *ruling:* onderscheiden van BUG-091. BUG-091 is "een wachtwoordwijziging trekt andere **sessies** niet in" (sessiebeheer). C13-009 is de check-then-write-race binnen `POST /api/users/change-password` zelf: beide tabbladen valideren tegen dezelfde oude hash, beide schrijven, beide krijgen 200. Fase 13 levert daarnaast nieuwe evidence bíj BUG-091 (tabblad B blijft na de wijziging gewoon werken; `active=false` zetten stopt een lopende sessie evenmin) — zie §6 | **BUG-189** |
| C13-010 | nieuw — *gedeeltelijke toewijzing:* de helft "alle rijen wijzen naar één fysiek bestand" is **BUG-027** (herbevestigd, geen nieuw nummer). Het nieuwe deel is de **racende versienummering**: `Math.max(bestaande versies)+1` uit een lezing die de andere in-flight generaties niet ziet, waardoor labels dubbel voorkomen (`Unsigned 9`×5, `10`×5), plus de dubbelklik-retour die twee schadecheckdocumenten maakt. De 5-parallelle-run uit fase 14 (A10, "Contract (Unsigned) 12" tweemaal) is als extra evidence hier ondergebracht | **BUG-190** |
| P14-001 | nieuw | **BUG-162** |
| P14-002 | nieuw — *ruling:* niet samengevoegd met P14-003 hoewel beide het legacypad betreffen. Andere root cause (tekst-Buffer uit `generateFallbackContract` na een gevangen fout of een ontbrekend sjabloonbestand versus een ontbrekende y-flip in de tekenlus), andere fix, andere regressietest ("body begint met `%PDF-`" versus "veld staat in de bovenste pagina-helft"). Beide worden wél door hetzelfde consolidatievoorstel (§7) opgelost | **BUG-163** |
| P14-003 | nieuw (zie P14-002) | **BUG-164** |
| P14-004 | nieuw | **BUG-165** |
| P14-005 | nieuw | **BUG-166** |
| P14-006 | nieuw — *ruling:* dit stond als **gat** gecatalogiseerd in `docs/audit/01a-api-en-autorisatie.md:23-24` en api-matrix item 6, maar had **nog geen tracker-id**; fase 14 levert het runtimebewijs (limited user → 200 op negen routes, inclusief het aanmaken van `documents`-rijen 442/444). Krijgt daarom een eigen nummer in plaats van een verwijzing | **BUG-167** |
| P14-007 | nieuw | **BUG-168** |
| P14-008 | nieuw — BUG-048 dekt dat sjablonen malformede `fields` **accepteren**; dit gaat over `canvasFields` van schadechecksjablonen én over het gevolg (één foute entry → 500 op élke PDF voor die voertuigklasse) en over de import die de default-vlag kan overnemen | **BUG-176** |
| P14-009 | nieuw | **BUG-177** |
| P14-010 | nieuw | **BUG-178** |
| P14-011 | nieuw — BUG-070 dekt padmisbruik ván `backgroundPath`; dit gaat over onleesbare/verkeerde/verwijderde achtergronden die stil terugvallen, over `select` zonder eigendomscontrole en over de niet-gereset `backgroundPath` na een bibliotheekdelete | **BUG-179** |
| P14-012 | nieuw | **BUG-180** |
| P14-013 | nieuw — *ruling:* BUG-156 dekt precies één van de vier gevallen (onbekend `templateId` bij het contract → stille fallback). De drie andere zijn nieuw: geen default → willekeurige eerste rij, onbekend transport-`templateId` → **blanco gearchiveerd rapport**, en drie schadecheckmatchers die voor hetzelfde voertuig een ander sjabloon kiezen | **BUG-181** |
| P14-014 | nieuw | **BUG-182** |
| P14-015 | nieuw | **BUG-183** |
| P14-016 | nieuw — BUG-048 gaat over wat er geaccepteerd wordt bij het opslaan; dit gaat over wat er op papier terechtkomt (veldlabels als waarde, `[object Object]`, interne id's, een 500 pt letter over de hele pagina) | **BUG-191** |
| P14-017 | nieuw | **BUG-192** |
| P14-018 | nieuw | **BUG-193** |
| P14-019 | nieuw — *gedeeltelijke toewijzing:* de helft "niet-numerieke `:id` → 500" is **BUG-103** (herbevestigd) en "rauwe Postgres-tekst in de body" is **BUG-148**/BUG-057 (herbevestigd). Het nieuwe deel is de **bodyvalidatie op de sjabloon- en generatie-endpoints**: `PATCH /api/pdf-templates/:id` met kapotte JSON → **404** "Failed to update template" (verkeerde status, fout ingeslikt), lege `name` en `fields: null` geaccepteerd, `fields:"not json"` op een transportsjabloon geaccepteerd (elk rapport ermee wordt blanco), en negatieve labelafmetingen geaccepteerd | **BUG-194** |
| F15-001 | nieuw, **HIGH** — dezelfde familie als BUG-026 (statische mount negeert `UPLOADS_DIR`) en BUG-029 (transportrapport 404), maar hier is het een **harde functionele blokkade op de staffroute** in exact de productievorm: elk rijbewijs geeft 403 terwijl de portaalroute voor hetzelfde bestand 200 geeft. Eigen root cause (`path.resolve(process.cwd(),'uploads')` in de containmentcheck van `routes.ts:6520-6533`), eigen fix, eigen regressietest | **BUG-169** |
| F15-002 | nieuw — *ruling:* **gescheiden gehouden van BUG-027.** BUG-027 = contract**hergeneratie** maakt N `documents`-rijen op één bestand. F15-002 is de **uploadroute** (`POST /api/documents`, `documentType="contract"`): twee verschillende geüploade PDF's op dezelfde plaat/dag krijgen hetzelfde bestandspad, de eerste wordt stil overschreven, en — het nieuwe gedeelte — `GET /api/documents/view/324` levert daarna de **bytes van document 325**. Andere root cause (de contracttak van de `documentStorage.filename`-callback laat de timestamp weg die de standaardtak wél zet), ander schadebeeld (dataverlies + cross-serving) | **BUG-184** |
| F15-003 | nieuw — complementair aan BUG-150 (bestanden blijven achter nadat de rij weg is); dit is het omgekeerde: de rij blijft achter nadat het bestand weg is | **BUG-195** |
| E16-001 | nieuw, **HIGH** (datalek) | **BUG-170** |
| E16-002 | nieuw, **HIGH** | **BUG-171** |
| E16-003 | nieuw — BUG-155 dekt "portaalmail wordt nooit gelogd en mislukkingen zijn onzichtbaar". E16-003 is idempotentie/dedupe (dubbele bezorging na een retry tijdens een trage server) plus het feit dat `notifications.ts` zijn `email_logs`-rij pas **ná** de hele lus schrijft, zodat een vastgelopen bulkrun helemaal niets logt | **BUG-185** |
| E16-004 | nieuw — BUG-080 dekt `rejectUnauthorized:false`; dit is dat `smtpSecure` überhaupt genegeerd wordt (TLS alleen bij de **string** `'465'`) plus het accepteren van een malformed `fromEmail`. BUG-025 (settings zonder validatie) wordt hierdoor herbevestigd | **BUG-186** |
| E16-005 | nieuw — *ruling:* gescheiden van BUG-081, BUG-086 én BUG-100 omdat de **sink een andere is**. BUG-081 = staff-geschreven HTML in documentmail (de afzender is de aanvaller). BUG-086 = de ingress-sanitizer raakt multipart-bodies niet (een ander middleware-gat, ander pad). BUG-100 = `fromName` rauw in een **header**. E16-005 zit in `renderTemplate` (`server/services/portal-mail.ts:108`), een eigen `{{var}}`-substitutie zonder escaping, gevoed door **portaalgebruiker-gecontroleerde** velden (`fullName`, `User-Agent`, antwoordtekst), met als gevolg een live phishinglink in de **staff**-mailbox én in de opgeslagen `custom_notifications`-rij | **BUG-187** |
| E16-006 | nieuw | **BUG-196** |

**Nul samenvoegingen**, **elf rulings** (C13-002 severity, C13-003, C13-004, C13-006, C13-009, P14-002/003, P14-006, P14-013, F15-001, F15-002, E16-005), **twee gedeeltelijke toewijzingen**
(C13-010 → deels BUG-027; P14-019 → deels BUG-103/BUG-148) en **twee ontkrachtingen** van bestaande
bugs (BUG-076, BUG-097 — zie §6).

---

## 5. Bugtracker-aanvulling — BUG-159 … BUG-196

Type: **T** = technische fout · **B** = bedrijfsregel/procesbesluit (goedkeuring nodig, zie §7).

### 5.1 CRITICAL

#### BUG-159 — Twee gelijktijdige bewerkingen verplaatsen twee reserveringen naar hetzelfde voertuig en dezelfde periode: de conflictcontrole draait wél, maar raced
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **T** · **Bron:** C13-002 (HIGH) — *severity genormaliseerd naar CRITICAL, conform BUG-006/BUG-106/BUG-107*
- **Feature:** Reservering bewerken — `PATCH /api/reservations/:id` en `PATCH /api/reservations/:id/basic` onder concurrency
- **Reproduction:** `p13-01-edit.cjs` tests 2b, 2c. Twee vrije reserveringen op twee voertuigen; verplaats ze **parallel** (twee sessies, elk een eigen TCP-verbinding, gestart in dezelfde tick) naar **hetzelfde** voertuig en **dezelfde** periode.
  - 2b via `PATCH /:id` (body bevat `vehicleId` **én** `startDate`, dus de conflictcontrole draait daadwerkelijk): beide **200** → `SELECT … WHERE vehicle_id=1825 AND status='booked'` = **twee overlappende rijen (3457, 3458)**.
  - 2c via `/:id/basic`: beide **200** → **twee overlappende rijen (3461, 3462)** op voertuig 1826.
  - 2b-controle **sequentieel**: 200, daarna **409** "Reservation conflicts with existing bookings" — de controle is dus correct, hij is alleen niet geserialiseerd.
- **Expected:** precies één van de twee gelijktijdige bewerkingen slaagt; de andere krijgt 409.
- **Actual:** `checkReservationConflicts` is een gewone `SELECT` en de daaropvolgende `updateReservation` een gewone `UPDATE`, zonder transactie en zonder rijvergrendeling. Beide requests lezen "geen conflict" vóórdat een van beide schrijft, dus beide committen.
- **Root cause:** `server/routes.ts:3648-3666` (`PATCH /:id`: `if (reservationData.vehicleId && reservationData.startDate) { checkReservationConflicts(...) }` gevolgd door `updateReservation`, niet atomair) en `server/routes.ts:3121-3168` (`/basic`: dezelfde check-then-update); `checkReservationConflicts` (`server/database-storage.ts:1528`) heeft geen `FOR UPDATE`.
- **Affected files:** `server/routes.ts` (beide PATCH-handlers), `server/database-storage.ts:1528`
- **Affected data:** reserveringen 3457/3458 (voertuig 1825) en 3461/3462 (voertuig 1826), bewust overlappend gelaten als bewijs. In productie: elk voertuig waarop twee medewerkers tegelijk een boeking verslepen of verplaatsen.
- **Security impact:** geen (vereist `MANAGE_RESERVATIONS`), maar het is een volledige doorbraak van de boekingsinvariant.
- **Business impact:** dezelfde fysieke auto aan twee klanten in dezelfde week — de kernfout van dit systeem, nu bereikbaar via het meest normale gebaar dat er is: twee mensen die tegelijk in de kalender werken, of één kalender-drag die tweemaal afvuurt. Onderscheiden van BUG-106 (controle overgeslagen bij een partiële body) en BUG-107 (turnovergat): daar faalt de logica, hier faalt de **serialisatie**.
- **Fix proposal:** conflictcontrole + update in één `db.transaction` met `SELECT … FOR UPDATE` op de kandidaat-overlappen, of een advisory lock op `vehicleId`, of de Postgres exclusion constraint die al voor BUG-006 is voorgesteld; map de schending naar 409.
- **Regression test:** twee gelijktijdige bewerkingen die twee reserveringen naar één voertuig/periode verplaatsen → precies één 200 en één 409; daarna precies één `booked`-rij in dat venster.

### 5.2 HIGH

#### BUG-160 — Eén reserveauto wordt onder concurrency aan twee partijen tegelijk toegewezen (assign-spare, maintenance-with-spare, transporten)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** C13-003
- **Feature:** Vervangend vervoer — `POST /api/reservations/:id/assign-spare`, `POST /api/reservations/maintenance-with-spare`, `POST /api/transports`
- **Reproduction:** `p13-03-spare.cjs`.
  - **3b:** twee verschillende verhuringen (RA 3506, RB 3507) roepen parallel `assign-spare` aan met **dezelfde** reserveauto (1857) voor **dezelfde** dagen → beide 200 → twee actieve `replacement`-reserveringen (3508 klant 1282, 3509 klant 1283) op voertuig 1857, 2029-06-02..05.
  - **3c:** `maintenance-with-spare` ∥ `assign-spare` voor dezelfde verhuring (RC 3510) en dezelfde spare (1859) → 201 + 200 → twee actieve vervangers (3512 `booked`, 3513 `pending`) op één spare voor één verhuring.
  - **3d:** twee transporten (voor voertuig 1860 en 1862) claimen parallel spare 1861 op 2029-09-03 → beide 201 → spare-reserveringen 3519 en 3520, beide `2029-09-03 00:00–23:59`. Het expliciete dagvenster in `applyTransportUpdate` — juist toegevoegd zodat twee transporten geen spare kunnen delen — wordt verslagen omdat de twee inserts in aparte transacties draaien die elkaars ongecommitte rij niet zien. Een derde, **sequentieel** transport geeft correct 409.
- **Expected:** een spare die al aan een verhuring/transport is toegezegd conflicteert voor elke tweede claim; precies één gelijktijdige claim wint.
- **Actual:** `createReplacementReservation` en `applyTransportUpdate` doen beide check-then-insert (`checkReservationConflicts`, daarna `INSERT`) zonder een vergrendeling die de twee claimanten omspant.
- **Root cause:** `server/database-storage.ts:3178-3239` (`createReplacementReservation`: conflictcontrole op :3206, insert op :3233, geen lock) en `server/database-storage.ts:2093-2122` (`applyTransportUpdate`'s 00:00–23:59-controle binnen een per-transport-transactie).
- **Affected files:** `server/database-storage.ts`, `server/routes.ts` (`assign-spare`, `maintenance-with-spare`, `POST /api/transports`)
- **Affected data:** vervangingsreserveringen 3508/3509, 3512/3513, 3519/3520.
- **Security impact:** geen.
- **Business impact:** één fysieke reserveauto staat tegelijk gereserveerd voor twee klanten of twee transporten; één van beide partijen staat voor niets klaar. Breidt BUG-032 (tweemaal assign-spare op **dezelfde** verhuring) uit naar het cross-verhuring- en cross-transportgeval, en toont aan dat de dagvenstergarantie van transporten niet concurrency-veilig is.
- **Fix proposal:** serialiseer met `SELECT … FOR UPDATE` op de overlappende rijen van de spare (of een advisory lock op de spare-`vehicleId`) binnen de insert-transactie; laat bij transporten zowel de conflictcontrole als de spare-insert onder één lock op het betrokken voertuig draaien.
- **Regression test:** twee parallelle spareclaims (elke mix van assign-spare/maintenance-with-spare/transport) op één spare met overlappende datums → precies één slaagt.

#### BUG-161 — De accountlockout throttlet een gelijktijdige wachtwoordburst niet: 30 parallelle gokken worden alle 30 volledig geëvalueerd
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** C13-005
- **Feature:** Inloggen — `POST /api/login`, accountlockout na 5 mislukte pogingen
- **Reproduction:** `p13-06-rapid.cjs` test 8b1. Wegwerpgebruiker `AUDIT-P13-lock1-…`. 30 `POST /api/login` met **foute** wachtwoorden, elk vanaf een eigen `X-Forwarded-For` (zodat de per-IP `loginLimiter` niet aanslaat — precies de voorwaarde van BUG-009), parallel afgevuurd → **alle 30 geven 401** ("Incorrect password") en alle 30 worden in `login_attempts` vastgelegd. Pas **ná** de burst is het account op slot (een daaropvolgende juiste login → 429 "Account temporarily locked"). Er zijn dus 30 wachtwoordverificaties uitgevoerd vóórdat het slot van 5 pogingen greep. Controle 8b2 (alles vanaf één IP): 5×401 daarna 429×25 — die laag werkt wél.
- **Expected:** niet meer dan ~5 wachtwoordevaluaties voordat het account op slot gaat, ongeacht bron-IP of gelijktijdigheid.
- **Actual:** `checkAccountLockout` telt de **gecommitte** mislukte `login_attempts` van de laatste 15 minuten **vóórdat** de huidige poging wordt geregistreerd. Onder concurrency lezen alle 30 requests een telling < 5 (geen van de zusterpogingen is dan al ingevoegd/gecommit), gaan alle 30 door naar een volledige wachtwoordverificatie en registreren daarna elk hun eigen mislukking.
- **Root cause:** `server/auth.ts:268-292` (lockout-voorcontrole) gevolgd door `passport.authenticate` en pas dáárna `recordLoginAttempt`; `server/middleware/security/rateLimiter.ts:40-90` (`checkAccountLockout` leest een telling zonder locking of serialisatie).
- **Affected files:** `server/auth.ts:268-370`, `server/middleware/security/rateLimiter.ts:40-90`
- **Affected data:** `login_attempts` (30 rijen voor het wegwerpaccount).
- **Security impact:** amplificatie van online brute force. Een aanvaller die `X-Forwarded-For` roteert (BUG-009) en parallel vuurt krijgt ~N wachtwoordchecks per lockvenster in plaats van 5. Wachtwoorden worden met scrypt geverifieerd, dus de doorvoer is CPU-begrensd, maar de belofte "maximaal 5 pogingen" geldt niet.
- **Business impact:** de gedocumenteerde lockoutcontrole (audit §Authentication) houdt niet stand in het gecombineerde concurrency+gespoofte-IP-geval; de stelling "het inlogpad zelf is solide" moet daarop bijgesteld worden.
- **Fix proposal:** maak de poging atomair — registreer de mislukking eerst en beslis op een conditionele controle (`INSERT … RETURNING` gevolgd door een telling binnen dezelfde transactie, of `SELECT … FOR UPDATE` op een teller per gebruikersnaam), of gebruik een atomaire tellerstore met een harde bovengrens waarop gelijktijdige requests botsen. Combineer met een fix voor BUG-009 zodat de IP-laag niet omzeilbaar is.
- **Regression test:** 20 parallelle foute logins op één account (verschillende IP's) → hooguit ~5 bereiken de wachtwoordverificatie, de rest 429; een juiste login binnen het venster is 429.

#### BUG-162 — Tekens buiten WinAnsi laten velden stil wegvallen: contracten zonder huurdersnaam, transportbrieven zonder adressen
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** P14-001
- **Feature:** Contract-PDF (sjabloonrenderer G1) en transportrapport-PDF (G6)
- **Reproduction:** `p14-a-contracts.cjs` A2 (`GET /api/contracts/generate/3475?templateId=9`, klant 1291 "AUDIT-P14 Spéçiål Ünïcödé ß € 😀 日本語 مرحبا …", adres met "→", telefoon met "☎", model met emoji) en `p14-d-transport.cjs` D1 (`POST /api/delivery/transports/generate-report {transportIds:[62]}` met emoji/CJK/RTL in herkomst, bestemming, chauffeur, reden, notities, klant).
- **Expected:** de glyphs worden met een Unicode-font gerenderd, óf vervangen (zoals de schadecheckgenerator met `sanitizeForWinAnsi` doet), óf het verzoek faalt zichtbaar. De naam van de huurder mag nooit van een contract ontbreken.
- **Actual:** 200, geldige PDF, maar élk veld waarvan de waarde zo'n teken bevat is **afwezig**. De paginatekst van `a2_full_special.pdf` = "1234 ÄB Ærø %d %s %n {{x}} Citroën AU-14-BX AUDITP14AU14BX September 11, 2026 September 18, 2026 7 days € 99,50 C-3475-20260910 10 september 2026" — geen klantnaam, geen adres, geen telefoon, geen model. `d1_transport_special.pdf` bevat helemaal geen regel "Van:", "Naar:", "Chauffeur:", "Reden:", "Notities:" of "Klant:". Serverlog: `Error drawing transport report field lblNaar: Error: WinAnsi cannot encode "م" (0x0645) ... at drawTransportReportPage (pdf-generator.ts:1420)`, idem voor 0x1f600 en 0x2192. Latin-1-tekens (é ü ß € Æ ø) renderen wel correct.
- **Root cause:** `server/utils/pdf-generator.ts:210-211` embed `StandardFonts.Helvetica` (alleen WinAnsi); de per-veld try/catch op `:517-519` (contract) en `:1426-1428` (transport) slikt de encodingfout en gaat door. Alleen `server/pdf-damage-check-generator.ts:123-137` saneert.
- **Affected files:** `server/utils/pdf-generator.ts`, `server/pdf-damage-check-generator.ts` (bevat de sanitizer die gedeeld zou moeten worden)
- **Affected data:** elk contract en elke transportbrief voor klanten, adressen of voertuigen met niet-Latin-1-tekens (Turkse/Poolse/Arabische namen, emoji in notities, een "→" dat iemand intypt).
- **Security impact:** geen directe; documentintegriteit: een ondertekend huurcontract zónder de naam van de huurder.
- **Business impact:** juridisch onjuiste documenten die aan klanten en chauffeurs worden meegegeven, en het is vanuit de UI niet te zien (200 + bestand).
- **Fix proposal:** registreer `@pdf-lib/fontkit` en embed één Unicode-TTF (DejaVu/Noto) voor alle drie de generatoren, óf pas één gedeelde `sanitizeForWinAnsi` toe vóór elke `drawText`/`widthOfTextAtSize`; log op warn-niveau en meld "tekens vervangen" terug in de response of de documentnotities.
- **Regression test:** render een contract en een transportrapport voor een klant "Zoë 😀 日本語 مرحبا" en assert dat de geëxtraheerde paginatekst "Zoë" bevat plus een vervanging voor de rest, en dat het aantal getekende velden gelijk is aan het aantal sjabloonvelden.

#### BUG-163 — De fallbackgenerator levert een plattetekstbestand dat als PDF wordt geserveerd én als PDF wordt gearchiveerd
- **Severity:** HIGH · **Status:** OPEN · **Type:** **B** (mag contractgeneratie hard falen — geen document — in plaats van een onbruikbaar bestand af te leveren?) · **Bron:** P14-002
- **Feature:** Contractgeneratie — `generateFallbackContract` (G3)
- **Reproduction:** `p14-a-contracts.cjs` A4: `GET /api/contracts/generate/3475?templateId=999999` (onbekend `templateId` → legacygenerator; reservering 3475 heeft de emoji-klant). Daarna `select id, file_path, file_size from documents where id=336` en `head -c 8` van het bestand.
- **Expected:** óf een echte PDF, óf HTTP 500 — nooit een tekstbestand met `Content-Type: application/pdf`, en nooit een `documents`-rij die naar een niet-PDF wijst.
- **Actual:** 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename=rental_contract_3475.pdf`, body 1342 bytes beginnend met "\nAuto Lease LAM\nKerkweg 47a\n3214 VC Zuidland …RENTAL CONTRACT…" (platte tekst). `documents`-rij 336 (`Contract (Unsigned) 2`, `..\audit-uploads\contracts\AU14BX\AU14BX_contract_20260910.pdf`, `file_size` 1342) en het bestand op schijf beginnen met "\nAuto Le" — het eerdere geldige contract voor die plaat/dag is overschreven (BUG-027/BUG-184). Elke pdf-lezer meldt het document als corrupt.
- **Root cause:** `server/utils/pdf-generator.ts:735-793` `generateFallbackContract` geeft `Buffer.from(text)` terug; bereikt vanuit de catch op `:727` (legacy, wanneer `page.drawText` gooit — zie BUG-162), vanuit `fs.readFileSync` op `:548-549` op elke deployment waar `uploads/` niet meegeleverd is (het pad is `process.cwd()/uploads/templates/rental_contract_template.pdf`, negeert `UPLOADS_DIR`, en het bestand is gitignored), en vanuit de buitenste catch op `:531`. `routes.ts:5561-5650` slaat vervolgens op wat het ook maar krijgt, als `.pdf`.
- **Affected files:** `server/utils/pdf-generator.ts`, `server/routes.ts:5451-5650, 5963-6078`
- **Affected data:** `documents`-rijen + bestanden voor elke reservering die het fallbackpad raakt; de emoji-reservering 3214 uit fase 3-5 is een kandidaat.
- **Security impact:** geen. Data-integriteit: corrupte documenten in het archief.
- **Business impact:** medewerkers downloaden een onleesbaar "contract"; het archief bevat stilzwijgend tekstbestanden met de extensie `.pdf`.
- **Fix proposal:** verwijder `generateFallbackContract`, laat `generateRentalContract` gooien, laat de routes 500 teruggeven met een duidelijke melding en **géén** `documents`-rij schrijven; verplaats het standaardsjabloon naar de repo (of naar `UPLOADS_DIR`) en los het pad op via `getUploadsDir()`. **Besluit voor de eigenaar:** liever geen document dan een onbruikbaar document?
- **Regression test:** roep de generate-route aan voor een reservering met een niet-WinAnsi-klantnaam én een onbekend `templateId`; assert dat de body met `%PDF-` begint of dat de status 500 is, en dat er geen `documents`-rij ontstaat met een niet-PDF-header.

#### BUG-164 — De legacy contractgenerator zet élke waarde in het verkeerde vak (ontbrekende y-flip)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** P14-003
- **Feature:** Contractgeneratie — `generateRentalContract` (G2, vaste coördinaten)
- **Reproduction:** `p14-a-contracts.cjs` A4: `GET /api/contracts/generate/3466?templateId=999999` (of `=-1`) → `files/p14/a4_unknown_template_legacy_normal.pdf/.png`. Hetzelfde pad wordt gekozen wanneer er géén `pdf_templates`-rij bestaat, bij een onbekend `templateId` (BUG-156) en wanneer de sjabloonrenderer gooit (`routes.ts:5509, 5551, 5557, 6010, 4191`).
- **Expected:** merk/model/kenteken in "Gegevens voertuig", naam/adres in "Huurder / bestuurder 1", datums in "Huurtijd van-tot", prijs in "Huurprijs", contractdatum onderaan.
- **Actual (PNG geïnspecteerd + pdfjs-coördinaten):** contractdatum "10 september 2026" in de "Groep"-regel van het voertuigblok (y=637 vanaf onder); klantnaam/adres/postcode/plaats/telefoon/rijbewijs in het blok "Bestuurder 2" (y=254..358); merk/model/kenteken binnen "Schade aan het voertuig" (y=150..179); "Nederland" afgedrukt als telefoonwaarde; start-/einddatum op de regel "Hoog eigen risico" met de einddatum afgekapt aan de rechterrand (pdfjs: "September 1" op x=545, loopt voorbij 595 pt); prijs op de regel "Premie vermindering eigen risico". De voorgedrukte labels van het formulier worden door niet-bijbehorende waarden overschreven.
- **Root cause:** `server/utils/pdf-generator.ts:569-703` geeft editorstijl-y-waarden (top-left) rechtstreeks door aan pdf-lib (bottom-left origin) — de `842 - y`-flip die de sjabloonrenderer op `:450` wél toepast, ontbreekt hier; x=545 voor de einddatum laat ~50 pt over voor een string van ~85 pt.
- **Affected files:** `server/utils/pdf-generator.ts:541-733`, aanroepers in `server/routes.ts`
- **Affected data:** elk contract dat via het fallbackpad is geproduceerd (onbekend `templateId`, geen sjablonen, rendererfout).
- **Security impact:** geen. Juridisch: een onleesbaar/verkeerd ingevuld huurcontract.
- **Business impact:** het fallbackpad levert documenten op die met de hand overgedaan moeten worden; in combinatie met BUG-156 levert één typefout in `templateId` stilzwijgend zo'n document op.
- **Fix proposal:** verwijder de legacygenerator volledig (hij dupliceert G1 met een hardcoded veldlijst); als een "hardcoded standaardlayout" gewenst blijft, druk die dan uit als een geseede `pdf_templates`-rij zodat G1 hem rendert. Onderdeel van het consolidatievoorstel in §7.
- **Regression test:** render via `generateRentalContract` voor een fixture-reservering en assert met pdfjs dat het item met de klantnaam y > 500 heeft (bovenste helft) en dat élk tekstitem voldoet aan `x + width <= 595`.

#### BUG-165 — `generate-default` en `damage-checks/generate` schrijven het bestand maar de `documents`-rij mislukt altijd
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** P14-004
- **Feature:** `GET /api/contracts/generate-default/:id` en `GET /api/damage-checks/generate/:reservationId`
- **Reproduction:** `p14-a-contracts.cjs` A5 (`generate-default/3466` en `/3475`), `p14-c-damage.cjs` C1 (`damage-checks/generate/3476` en `/3477`), `p14-e-perms.cjs`. Daarna `select * from documents where reservation_id in (3476,3477) and document_type like 'Damage Check (Unsigned)%'` → **0 rijen**; de tijdens A5/E aangemaakte documenten bevatten geen enkele `generate-default`-rij (de rijen 328-357/442-445 komen alle van `generate`/`generate-versioned`).
- **Expected:** 200 + een `documents`-rij (`Contract (Unsigned)` / `Damage Check (Unsigned) n`), zoals de code bedoelt.
- **Actual:** 200 en de PDF downloadt; serverlog bij élke call: `⚠️ Error saving contract to documents (PDF will still download): TypeError: value.toISOString is not a function at PgTimestamp.mapToDriverValue` (idem `⚠️ Error saving damage check to documents`). De bestanden staan op schijf (`audit-uploads/AU14CX/damage-checks/AU14CX_DamageCheck_Unsigned_2026-09-10_*.pdf`, `audit-uploads/AU140X/contracts/AU140X_Contract_Unsigned_*.pdf`) zónder rij → weesbestanden, niets in de Documenten-UI, de versienummering telt nooit op.
- **Root cause:** `server/routes.ts:6047` en `:6268` geven `uploadDate: new Date().toISOString()` (een **string**) door aan `storage.createDocument`; de timestamp-mapper van drizzle verwacht een `Date`. `insertDocumentSchema` laat `uploadDate` weg (`shared/schema.ts:1067`) maar `createDocument` valideert niet, dus de string bereikt de driver. De andere opslagblokken (`:5561`, `:5885`) zetten `uploadDate` niet en werken daarom wel.
- **Affected files:** `server/routes.ts:6017-6062, 6217-6280`
- **Affected data:** alle "unsigned" schadechecks die ooit via de reserveringsknop zijn gemaakt en alle contracten via `generate-default` sinds deze code live is: bestanden zonder rij.
- **Security impact:** geen. Opslag: onbegrensde weesbestanden.
- **Business impact:** het tabblad Documenten van de reservering toont de zojuist gegenereerde schadecheck nooit; medewerkers genereren daarom opnieuw (nog meer weesbestanden), en de regeneratieservice (`reservation-pdf-regeneration.ts:326`) vindt geen `Damage Check (Unsigned)`-rijen en regenereert dus nooit.
- **Fix proposal:** laat de `uploadDate`-property weg (de kolom heeft `default now()`) of geef `new Date()` door; voeg een unittest rond `storage.createDocument` met exact deze payload toe; overweeg het verzoek te laten falen (of minstens een waarschuwingsheader terug te geven) wanneer de rij-insert mislukt, in plaats van stil 200 te geven.
- **Regression test:** roep beide routes aan voor een fixture-reservering en assert per route één nieuwe `documents`-rij met `content_type application/pdf` en een bestaand bestand.

#### BUG-166 — De schadecheck drukt de klant af als `null null`
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** P14-005
- **Feature:** Schadecheck-PDF — `GET /api/damage-checks/generate/:id` en `GET /api/vehicles/:id/damage-check-pdf`
- **Reproduction:** `p14-c-damage.cjs` C1/C2: `GET /api/damage-checks/generate/3476` en `GET /api/vehicles/1840/damage-check-pdf` (reservering 3476, klant 1285 "AUDIT-P14 Normal Customer", `first_name`/`last_name` NULL — net als **331 van de 335** klanten in deze database). Sjabloon 4 heeft een dynamisch veld `source=customerName`.
- **Expected:** "AUDIT-P14 Normal Customer" — de waarde uit `customers.name` die overal elders wordt gebruikt (o.a. `routes.ts:6946, 7255` en het contract).
- **Actual:** de paginatekst bevat **"null null"** op de klantpositie (zichtbaar in de PNG naast het contractnummer). Alleen klant 1289, met wél een voor- en achternaam, drukt "AuditFirst AuditLast" af.
- **Root cause:** `server/routes.ts:6187` `customerName: \`${reservation.customer.firstName} ${reservation.customer.lastName}\`` en `:6742` `customer ? \`${customer.firstName} ${customer.lastName}\` : 'N/A'` — het klantmodel heeft `name` als primair veld; voor- en achternaam zijn optioneel en in 4 rijen gevuld.
- **Affected files:** `server/routes.ts:6178-6190, 6720-6746`
- **Affected data:** elke schadecheck uit deze twee routes voor de ~99% klanten zonder voor-/achternaam.
- **Security impact:** geen. Documentintegriteit: het inspectierapport identificeert de huurder niet.
- **Business impact:** bij schadediscussies is juist de klantnaam op de ondertekende check nodig; personeel moet het met de hand corrigeren.
- **Fix proposal:** één gedeelde `buildDamageCheckReservationData(reservation)` met `customer.name || [firstName,lastName].filter(Boolean).join(' ')`; verwijder de vier inline kopieën.
- **Regression test:** genereer voor een klant met alleen `name` en assert dat de paginatekst die naam bevat en niet "null".

#### BUG-167 — Contract- en schadecheck-PDF-endpoints hebben geen permissiecontrole (alleen `requireAuth`)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **B** (welke permissie hoort erop, en mag genereren dat een document **wegschrijft** achter dezelfde permissie als lezen?) · **Bron:** P14-006 — *stond als gat in `docs/audit/01a-api-en-autorisatie.md:23-24` en api-matrix item 6, zonder tracker-id; runtimebewijs hier toegevoegd*
- **Feature:** Negen document-endpoints
- **Reproduction:** `p14-e-perms.cjs` — gebruiker `AUDIT-P14-limited` (rol `user`, permissies `["view_vehicles"]`) versus anoniem versus admin op 27 endpoints. Resultaten (anon/limited/admin): `GET /api/contracts/generate/3466?templateId=9` → **401/200/200** (PDF 311 626 B, `documents`-rij 442 met `created_by AUDIT-P14-limited`); `GET /api/contracts/generate-default/3466` → 401/200/200; `POST /api/contracts/generate-versioned/3466` → 401/200/200 (rij 444); `POST /api/contracts/preview` → 401/200/200 (token + PDF met klant-PII); `GET /api/contracts/data/3466` → 401/200/200 (JSON met naam, adres, telefoon, rijbewijs); `GET /api/vehicles/1840/damage-check-pdf` → 401/200/200 (1,9 MB); `GET /api/interactive-damage-checks/15/pdf` → 401/200/200 (handtekeningen + klant); `POST /api/interactive-damage-checks` → 401/201/201; `GET /api/damage-check-fields/header` → 401/200/200. Alle sjabloonroutes, `/api/damage-checks/generate` en `generate-report` geven **wel** correct 403.
- **Expected:** contractgeneratie/preview/data achter `VIEW_RESERVATIONS` of `MANAGE_RESERVATIONS` (generatie die documenten wegschrijft achter `MANAGE_RESERVATIONS`/`MANAGE_DOCUMENTS`); schadecheck-PDF's achter `VIEW`/`MANAGE_DAMAGE_CHECKS`, zoals `/api/damage-checks/generate` al doet.
- **Actual:** elke actieve medewerkerslogin, ongeacht permissies, kan contracten voor élke reservering produceren en persisteren (rijen + bestanden van 310 kB, onbegrensd), de contractgegevens van élke klant lezen en élke ondertekende schadecheck ophalen.
- **Root cause:** `server/routes.ts:5451, 5676, 5768, 5798, 5963, 6080, 6641, 7213, 6849` (allemaal alleen `requireAuth`); `server/routes/app-settings.ts:79`.
- **Affected files:** `server/routes.ts`, `server/routes/app-settings.ts`
- **Affected data:** PII van alle klanten (naam, adres, telefoon, rijbewijs) en alle ondertekende schadechecks; groei van de `documents`-tabel.
- **Security impact:** horizontale informatieonthulling binnen het medewerkersdomein plus schrijven van documenten zonder permissie; tevens een goedkope resource-exhaustionvector (elke call schrijft een bestand van 310 kB).
- **Business impact:** het permissiemodel dat in het gebruikersbeheer wordt gepresenteerd ("view_reservations", "manage_damage_checks") wordt juist voor de gevoeligste documenten niet afgedwongen.
- **Fix proposal:** `hasPermission(...)` op de negen routes; persistentie achter een manage-permissie; overweeg een rate limit per gebruiker op generatie. **Besluit voor de eigenaar:** welke rol/permissie hoort bij genereren, previewen en inzien.
- **Regression test:** breid de matrixscripts uit met deze routes en assert 403 voor de "niemand"-identiteit.

#### BUG-168 — Een ongevalideerde `page`-waarde in een schadecheck-sjabloon blokkeert de hele server minutenlang
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** P14-007
- **Feature:** Schadecheck-sjablonen — `POST /api/damage-check-templates/preview-pdf` en `PUT /api/damage-check-templates/:id`
- **Reproduction:** `p14-c-damage.cjs` C5 en `p14-f-eventloop.cjs`: `POST /api/damage-check-templates/preview-pdf {name:"x", canvasFields:[{id:"a",type:"text",x:40,y:200,name:"on page 40000",fontSize:11,page:40000}]}` (admin of elke `MANAGE_DAMAGE_CHECKS`-gebruiker). Hetzelfde veld via `PUT /api/damage-check-templates/:id` (geen validatie) laat élke schadecheck-PDF voor de bijpassende voertuigen — inclusief de auto-PDF in de pickup-/returnflow — hetzelfde doen.
- **Expected:** `page` begrensd op een klein getal (bijv. ≤ 10) bij het opslaan én bij het renderen; generatie buiten de event loop of met een tijd-/omvangsbudget.
- **Actual:** `page=200` → 200 pagina's / 0,7 s; `page=5000` → 5000 pagina's / 3,5 MB / 5,1 s; `page=40000` → **200 OK, 40 000 pagina's, 15,3 MB, 75,9 s**; tijdens dat verzoek gaven twee opeenvolgende `GET /health`-probes een timeout na 20 s elk en duurde de volgende 6 s — de server was ~45 s onbereikbaar voor élke client, CPU-gebonden in het ene Node-proces. Lineaire kosten ≈ 2 ms en 380 B per pagina, dus `page=1e6` zou ~30 min en ~400 MB kosten. Geen crash/herstart (dus een DoS, niet het auto-restartgeval).
- **Root cause:** `server/pdf-damage-check-generator.ts:322-323` (`const maxPage = Math.max(1, ...fields.map(f => Number(f.page) || 1)); const pages = Array.from({ length: maxPage }, () => pdfDoc.addPage(...))`) en de headerafbeeldingslus op `:407-421` die op élke pagina tekent; `routes/damage-check-templates.ts:88-190` (preview) en `:200-235` (create/update) accepteren het concept zonder validatie.
- **Affected files:** `server/pdf-damage-check-generator.ts`, `server/routes/damage-check-templates.ts`
- **Affected data:** niets beschadigd; wel de beschikbaarheid van de hele applicatie.
- **Security impact:** geauthenticeerde DoS door elke gebruiker met `MANAGE_DAMAGE_CHECKS` (het account `ike` heeft die); de opgeslagen variant treft alle gebruikers voor onbepaalde tijd.
- **Business impact:** één verkeerde sjabloonopslag = elke pickup/return die een schadecheck genereert legt de server minuten stil.
- **Fix proposal:** zod-validatie op `canvasFields` (page 1..10, fontSize 4..72, breedte/hoogte ≤ pagina, `damageTypes` string[] ≤ 20, type-enum) op POST/PUT/import/preview; klem `maxPage` af in de generator; weiger sjablonen met meer dan N velden.
- **Regression test:** `PUT` van een sjabloon met `page=99999` → 400; unittest op de generator: paginatelling ≤ 10 bij `page=99999`.

#### BUG-169 — Met `UPLOADS_DIR` (de productievorm) geeft `GET /api/drivers/:id/license` 403 op élk rijbewijs
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** F15-001
- **Feature:** Rijbewijs ophalen (staffzijde)
- **Reproduction:** (1) `UPLOADS_DIR` staat buiten de repo (auditserver: `C:\…\audit-uploads`; productie/Coolify: het gemounte volume). (2) `POST /api/customers/2/drivers` (multipart, `displayName` + `licenseFile=valid.jpg`) → 201; de server slaat `drivers.license_file_path = "..\audit-uploads\drivers\license_customer2_<ts>.jpg"` op (`path.relative(cwd, UPLOADS_DIR/…)` levert een pad met `..\`-prefix). (3) `GET /api/drivers/860/license` (ingelogd, `VIEW_CUSTOMERS`) → **403 `{"error":"Access denied"}`**. Scripts `p15-c-traversal.cjs` / `p15-b-endpoints.cjs`; capture `p15-c-traversal.out.json` (`driverServe.status=403`).
- **Expected:** het zojuist geüploade rijbewijs wordt teruggegeven (200, de JPG-bytes), precies zoals de portaaltegenhanger `GET /api/portal/drivers/:id/license` dat wél doet (die gebruikt `resolveDocumentFilePath` en geeft 200).
- **Actual:** 403 "Access denied" voor élk legitiem geüpload rijbewijs. De containmentcheck vergelijkt het opgeloste bestandspad met `path.resolve(cwd,'uploads')`; het echte bestand staat onder `UPLOADS_DIR`, waarvan het opgeloste pad niet met `cwd/uploads` begint, dus de check faalt altijd.
- **Root cause:** `server/routes.ts:6520-6533` — `const uploadsDir = path.resolve(process.cwd(), 'uploads'); const requestedPath = path.resolve(process.cwd(), driver.licenseFilePath); if (!requestedPath.startsWith(uploadsDir)) return res.status(403)…`. Hardcodeert `'uploads'` in plaats van `getUploadsDir()`; zelfde familie als BUG-026 (statische mount) en BUG-029 (transportrapport 404), maar hier is het een harde autorisatie-/functionele fout op de staffroute.
- **Affected files:** `server/routes.ts:6512-6540`
- **Affected data:** `drivers.license_file_path` (alle rijen zodra `UPLOADS_DIR` gezet is).
- **Security impact:** alleen beschikbaarheid voor medewerkers (het bestand wordt niet blootgesteld). Let op: dezelfde data is wél bereikbaar via `/uploads/drivers/...` (BUG-085) en via de portaalroute — dit is dus een **inconsistentie**, geen containmentwinst. De check wekt de indruk van bescherming terwijl hij elders open staat.
- **Business impact:** in de productie-/Coolify-deployment (`UPLOADS_DIR` = gemount volume) kan **geen enkel** rijbewijs vanuit de staff-app bekeken of gedownload worden — een kern-compliance-/KYC-workflow is volledig stuk; medewerkers zien "Access denied" bij documenten die probleemloos geüpload zijn.
- **Fix proposal:** vervang `path.resolve(process.cwd(),'uploads')` door `getUploadsDir()`, of laat de hele handler via `resolveDocumentFilePath()` lopen zoals de portaal- en boeteroutes al doen, en controleer containment daarna tegen de opgeloste uploadsmap.
- **Regression test:** met `UPLOADS_DIR` buiten `cwd`: upload een rijbewijs, dan `GET /api/drivers/:id/license` → 200 + juiste bytes; assert dat een opgeslagen pad in de vorm `"..\..\etc\passwd"` nog steeds 403 geeft.

#### BUG-170 — Eén APK-/onderhouds-/custom-herinnering gaat naar élke klant die ooit een reservering op dat kenteken had
- **Severity:** HIGH · **Status:** OPEN · **Type:** **B** (wie hoort deze mail te krijgen: alleen de huidige houder, of ook toekomstige/vorige huurders?) · **Bron:** E16-001
- **Feature:** Bulkmeldingen — `POST /api/notifications/send` (templates `apk`, `maintenance`, `custom`)
- **Reproduction:** `p16-c-hang.cjs` case C5 (stubmodus `ok`); ook zichtbaar in `p16-a2-staff.cjs` A8a waar voertuig 1802 naar 4 RCPT's uitwaaierde. `POST /api/notifications/send {vehicleIds:[4],template:"apk"}` → HTTP 200 `{sent:4,failed:0}`; de stub ving **vier** berichten, één elk aan `klant3@example.com`, `klant111@example.com`, `klant215@example.com` en `keeslamapk45@gmail.com` (klant 179). Voertuig 4 had 4 live `booked`-reserveringen voor de klanten 111, 215, 3 en 179; alle vier kregen dezelfde mail "APK Herinnering - 14XT104 verloopt binnenkort".
- **Expected:** een APK-/onderhoudsherinnering voor een voertuig gaat alleen naar de klant die het op dat moment onder zich heeft — één ontvanger.
- **Actual:** de bulkquery left-joint `vehicles → reservations → customers` met alleen `inArray(vehicles.id, vehicleIds)`, zonder filter op status, datum of "huidige houder", en de ontvangerslus dedupt niet op klant. Elke historische of toekomstige reserveringsrij wordt een ontvanger.
- **Root cause:** `server/routes/notifications.ts:127-143`
- **Affected files:** `server/routes/notifications.ts`
- **Affected data:** `customers.email` / `emailForMOT` van elke klant die ooit aan het voertuig gekoppeld was; `vehicles.licensePlate` en de APK-status worden cross-klant onthuld.
- **Security impact:** cross-klant PII-/voertuigstatusonthulling. Een klant leert dat een kenteken dat hij ooit (of straks) huurt een APK nodig heeft, plus de impliciete koppeling klant↔voertuig.
- **Business impact:** klanten krijgen herinneringen voor auto's die ze niet onder zich hebben; supportruis; AVG-blootstelling (dataminimalisatie).
- **Fix proposal:** beperk de join tot de reservering die "vandaag" dekt (status `picked_up`/standaard, `deletedAt` null, datumbereik omvat nu) en dedup ontvangers per klant; of stuur uitsluitend vanuit de huidige houder. **Besluit voor de eigenaar:** wie is de beoogde ontvanger.
- **Regression test:** seed een voertuig met reserveringen voor 3 klanten (1 huidig, 2 verleden/toekomst); assert dat de verzending exact de huidige houder raakt.

#### BUG-171 — De gepoolde SMTP-transporter heeft geen timeouts en maar 2 verbindingen: één hangende mailserver legt álle mail stil, inclusief wachtwoordherstel
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** E16-002
- **Feature:** SMTP-transporterpool (alle uitgaande mail)
- **Reproduction:** `p16-c-hang.cjs` C1 (modi `hang-ehlo`, `data-hang`), C2 (`data-hang`, twee verzendingen + een derde), C2b (portaal-`forgot` terwijl de pool vastzit); `p16-a2-staff.cjs` A5 (onbereikbare host).
  - **C1:** documentverzendingen onder `hang-ehlo` en `data-hang` gaven **GEEN ANTWOORD binnen 45 000 ms** met de socket nog open (`openSockets:1`).
  - **C2:** met `data-hang` hielden twee verzendingen beide poolverbindingen bezet (`connections:2, openSockets:2`); een derde verzending 1,5 s later hing ook — **zelfs nadat de stub weer op `ok` stond** (`third:"hang (queued behind hung connections)"`).
  - **C2b:** een volstrekt losstaande `POST /api/portal/forgot` hing de volle 15 000 ms cap uit, omdat forgot-mail `purpose:"custom"` gebruikt → dezelfde `email_config`-rij → dezelfde `transporterKey` → dezelfde pool van 2. Eén vastzittende SMTP-server stalt dus het wachtwoordherstel van élke klant.
  - Sockets komen pas vrij als de tegenpartij sluit: na `stub.dropAll()` voltooiden de wachtende verzendingen alsnog (`connections:4`). `/health` gaf de hele tijd 200 in 4–59 ms.
- **Expected:** een trage of niet-reagerende SMTP-server laat één verzoek binnen een korte, begrensde timeout falen en raakt de andere mailpaden niet.
- **Actual:** zoals boven; het echte verzendpad draait op nodemailers defaults (~2 min connect, ~30 s greeting, ~10 min socket) en keert bij `hang-ehlo`/`data-hang` feitelijk nooit terug.
- **Root cause:** `server/utils/email-service.ts:253-267` — `getTransporter` maakt de pool met `pool:true, maxConnections:2, maxMessages:100` maar **zonder** `connectionTimeout`/`greetingTimeout`/`socketTimeout` (die staan alleen op de wegwerptransporter van `testSmtpConnection`, `:219-220`). `transporterKey` (`:242`) sleutelt alleen op `host:port:user:secure`, dus elk doel dat naar dezelfde credentials resolvet deelt één pool van 2.
- **Affected files:** `server/utils/email-service.ts`
- **Affected data:** geen direct; wel de beschikbaarheid van elk mail-dragend verzoek (wachtwoordherstel, uitnodigingen, documentmail, bulk).
- **Security impact:** beschikbaarheid/DoS — een verkeerd ingestelde of trage SMTP-host stalt wachtwoordherstel- en uitnodigingsmail voor alle klanten; requestthreads houden sockets onbepaald open.
- **Business impact:** open-eind spinners voor personeel en klanten; wachtwoordresets stil vertraagd; moeilijk te diagnosticeren "de mail is traag"-incidenten.
- **Fix proposal:** zet `connectionTimeout`/`greetingTimeout`/`socketTimeout` (bijv. 10 s elk) op de gepoolde transporter; overweeg een pool per doel of een hogere `maxConnections`; faal snel en toon de fout.
- **Regression test:** wijs naar een stub die TCP accepteert maar nooit groet; assert dat de verzending binnen de ingestelde timeout afwijst en dat een tweede, ongerelateerde verzending ongestoord blijft.

### 5.3 MEDIUM

#### BUG-172 — Reservering bewerken kent geen optimistic locking: twee tabbladen die het volledige formulier opslaan wissen elkaars velden — ook zónder race
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** C13-001
- **Feature:** Reservering bewerken — `PATCH /api/reservations/:id` en `/:id/basic`
- **Reproduction:** `p13-01-edit.cjs` tests 1c, 1c-seq, 1d op reservering 3456. Twee sessies (admin + manager) doen elk een `GET` op de reservering en daarna een `PATCH` met de **hele rij** (de vorm die `reservation-form.tsx` verstuurt): tabblad A wijzigt `notes`, tabblad B wijzigt `totalPrice`.
  - **1c (parallel, N=2):** 200/200 — de eindrij heeft `totalPrice` van B **en `notes` van A teruggedraaid** naar de waarde van vóór de bewerking.
  - **1c-seq (géén race, N=2 sequentieel):** beide laden dezelfde versie, A slaat `notes` op, daarna slaat B zijn verouderde kopie op → 200/200 en `notes` van A is stil verdwenen.
  - **1d (`/basic`, parallel):** 200/200, laatste schrijver wint.
- **Expected:** een opslagactie die een veld niet aanraakt mag dat veld niet terugdraaien; gelijktijdige of verouderde saves moeten óf per kolom samenvoegen, óf falen met een conflict (optimistic lock op `updatedAt`/versie).
- **Actual:** `PATCH /:id` persisteert `req.body` letterlijk als volledige rij; `/basic` herparseert de hele rij door `insertReservationSchema`. Geen van beide leest-dan-vergrendelt, geen van beide controleert `updatedAt`. Wie als laatste commit overschrijft élke kolom die de ander wijzigde, en beide aanroepers krijgen 200 met hun eigen waarde terug.
- **Root cause:** `server/routes.ts:3625-3636` (`/basic` bouwt de update uit de volledig geparseerde rij) en `server/routes.ts:3648-3690` (`/:id` zet `dataWithTracking = {...req.body}`); `updateReservation` (`server/database-storage.ts:1209`) doet een kale `UPDATE … SET dataToUpdate WHERE id AND deletedAt IS NULL` zonder versiepredicaat.
- **Affected files:** `server/routes.ts`, `server/database-storage.ts:1209`
- **Affected data:** reservering 3456 (testwaarden). In productie: elke reservering die door twee mensen kort na elkaar bewerkt wordt, of door één persoon met een verouderde kopie in het formulier.
- **Security impact:** geen.
- **Business impact:** een veld dat de bewerker nooit heeft aangeraakt (prijs, datums, chauffeur, notities) wordt door een andere save teruggezet op een oude waarde — precies het geval "twee mensen bewerken dezelfde boeking", en het heeft **geen concurrency nodig** (1c-seq). Zelfde klasse als BUG-122 (voertuigen), maar op de reserveringsentiteit en haar twee bewerk-endpoints, die BUG-122 niet dekt.
- **Fix proposal:** bouw de SET-lijst alleen uit sleutels die daadwerkelijk aanwezig zijn (valideer met `insertReservationSchema.partial()`), of voeg optimistic concurrency op `updatedAt` toe (409 zodra de opgeslagen `updatedAt` verschoven is).
- **Regression test:** twee sessies laden dezelfde reservering; A slaat één veld op, B (verouderd) een ander; assert dat beide velden hun nieuwe waarde houden, of dat B 409 krijgt.

#### BUG-173 — `maintenance-with-spare` kent geen idempotentie: een dubbelklik maakt twee onderhoudsblokken én twee reserveauto's
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** C13-004
- **Feature:** `POST /api/reservations/maintenance-with-spare`
- **Reproduction:** `p13-03-spare.cjs` test 3c2. Exact dezelfde `maintenance-with-spare`-body tweemaal verstuurd met 10 ms ertussen (een dubbelklik op "onderhoud inplannen") → **beide 201** → twee onderhoudsblokken (3515, 3516) op voertuig 1864 voor dezelfde datums, plus twee vervangingsreserveringen (3517, 3518) op dezelfde spare voor dezelfde verhuring.
- **Expected:** één blok, één spare; de tweede call is een no-op of 409.
- **Actual:** de handler maakt het blok via `storage.createReservation` en de vervangers via `Promise.all`, zonder omvattende transactie, zonder dedupe op `(vehicleId, datums, type=maintenance_block)` en zonder lock. Twee gelijktijdige calls maken elk een volledige set.
- **Root cause:** `server/routes.ts:2787-2960` — de tak "nieuw onderhoudsblok aanmaken" (`maintenanceReservation = await storage.createReservation(maintenanceWithTracking)` rond `:3005`, met de `Promise.all` van de vervangers erna) draait buiten elke transactie en zoekt nooit naar een bestaand blok.
- **Affected files:** `server/routes.ts`
- **Affected data:** onderhoudsblokken 3515/3516, vervangers 3517/3518.
- **Security impact:** geen.
- **Business impact:** dubbele onderhoudsblokken en dubbele spareboekingen uit één klik — dezelfde datavorm als BUG-037/BUG-141, nu op de staff-route. Gescheiden gehouden van BUG-141 omdat de portaalfix (`portal-requests.ts`) dit pad niet raakt.
- **Fix proposal:** zet de hele operatie in één `db.transaction`; zoek vóór het aanmaken naar een niet-verwijderd blok op hetzelfde voertuig/dezelfde periode en hergebruik dat of weiger; geef de vervanger-inserts dezelfde lock als BUG-160.
- **Regression test:** stuur dezelfde `maintenance-with-spare`-body tweemaal gelijktijdig → één blok, één spare, tweede call 409/no-op.

#### BUG-174 — Twee gelijktijdige pickups met verschillende contractnummers slagen allebei
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** C13-006
- **Feature:** Uitgifte — `POST /api/reservations/:id/pickup`
- **Reproduction:** `p13-02-lifecycle.cjs` test 4e. Eén `booked` reservering; twee parallelle `POST /:id/pickup` met **verschillende** contractnummers (`AUDIT-P13-4e-A` km 1500, `AUDIT-P13-4e-B` km 1600) → **beide 200**. Eindtoestand: reservering `picked_up`, `contract_number='AUDIT-P13-4e-B'`, kilometerstand 1600 (laatste schrijver), en **twee** "Contract (Unsigned)"-documentrijen (343, 344) met twee fysieke PDF's. (Dubbelklik met hetzelfde nummer, 4f, geeft correct 200/400 omdat de unieke constraint hem vangt.)
- **Expected:** precies één pickup slaagt; de tweede krijgt 400 "Cannot pickup reservation with status: picked_up" — wat sequentieel ook gebeurt.
- **Actual:** `pickupReservation` leest de reservering, controleert `status==='booked'` en doet daarna een update — zonder lock. Beide requests lezen `booked`, beide gaan door, beide genereren een contract-PDF plus documentrij; de tweede UPDATE overschrijft contractnummer en kilometerstand.
- **Root cause:** `server/database-storage.ts:1624-1712` (`pickupReservation`: `getReservation` → statuscontrole → `UPDATE … WHERE id` zonder `AND status='booked'`-predicaat en zonder lock); het contract-PDF-/`createDocument`-blok in `server/routes.ts:4067-4247` draait per request.
- **Affected files:** `server/database-storage.ts:1624`, `server/routes.ts`
- **Affected data:** reservering 3485 (documenten 343, 344).
- **Security impact:** geen.
- **Business impact:** één fysieke overdracht levert twee contractdocumenten met verschillende nummers en een niet-deterministische eindkilometerstand op; het "verliezende" contractnummer is verbruikt en verdwenen. Verwarrende papierwinkel op precies de workflow waar het contractnummer uniciteit moet garanderen. Onderscheiden van BUG-038 (zelfde nummer → rauwe DB-fout) en BUG-120 (pickup schrijft vóór de voertuigcontrole).
- **Fix proposal:** maak de statusovergang een conditionele `UPDATE … WHERE id=$1 AND status='booked' RETURNING *` en behandel 0 rijen als "al opgehaald" (400); genereer het contract pas nadat de update gewonnen heeft.
- **Regression test:** twee gelijktijdige pickups (verschillende nummers) → één 200, één 400; precies één contractdocumentrij.

#### BUG-175 — Gelijktijdige saves van systeeminstellingen en PDF-sjablonen overschrijven elkaar (geen merge, geen versiecontrole)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** C13-008
- **Feature:** `PUT /api/system-settings` en `PATCH /api/pdf-templates/:id`
- **Reproduction:** `p13-01-edit.cjs` / `p13-01b-tpl-contract.cjs` tests 10b, 10c.
  - **10b:** twee parallelle `PUT /api/system-settings`, elk met het **hele** instellingenformulier, de een wijzigt `serviceReminderKm=1414`, de ander `apkReminderDays=14` → 200/200 → de eindrij heeft `apk_reminder_days=14` maar `service_reminder_km` is teruggezet op 1000 (de verouderde kopie van de andere schrijver won). (10a, met **partiële** bodies, gaat wél goed omdat `updateSettings` `undefined`-sleutels overslaat.)
  - **10c:** twee ontwerpers doen elk een `PATCH /api/pdf-templates/8` waarbij ze een ander veld aan `fields` toevoegen → 200/200 → de opgeslagen `fields`-blob bevat alleen veld B; veld A is weg.
- **Expected:** gelijktijdige bewerkingen van verschillende velden overleven allebei, of de latere save faalt met een conflict.
- **Actual:** beide endpoints vervangen de hele rij/blob vanuit een kopie die de client eerder heeft gelezen; laatste schrijver wint.
- **Root cause:** `server/routes/app-settings.ts:463-508` + `server/database-storage.ts:3599-3623` (`updateSettings` zet elke aangeleverde kolom); `server/routes/pdf-templates.ts:194-266` + `server/database-storage.ts:2401` (`updatePdfTemplate` schrijft `fields` als één JSON-blob). Geen versie-/`updatedAt`-controle op beide.
- **Affected files:** `server/routes/app-settings.ts`, `server/routes/pdf-templates.ts`, `server/database-storage.ts`
- **Affected data:** `settings` rij 1 (na de test hersteld); `pdf_templates` 8 `fields` (na de test hersteld).
- **Security impact:** geen.
- **Business impact:** twee beheerders die instellingen bijstellen, of twee mensen die tegelijk de veldindeling van een PDF-sjabloon bewerken, verliezen stilzwijgend één set wijzigingen. Lagere inzet dan een boeking, maar hetzelfde ontbrekende-optimistic-lockpatroon (BUG-122-klasse) op gedeelde configuratie.
- **Fix proposal:** optimistic concurrency op `updatedAt` voor beide endpoints (409 bij verouderd), of accepteer alleen de gewijzigde sleutels; bewerk `fields` als een gesleutelde collectie in plaats van de hele array te vervangen.
- **Regression test:** twee gelijktijdige volledige-formuliersaves van verschillende velden → beide overleven, of de tweede geeft 409.

#### BUG-176 — `canvasFields` van schadecheck-sjablonen worden niet gevalideerd: één foute entry breekt élke PDF voor die voertuigklasse; een import kan de default overnemen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** P14-008
- **Feature:** `POST/PUT /api/damage-check-templates[/:id]`, `/import`, `/preview-pdf`
- **Reproduction:** `p14-c-damage.cjs` C4/C7/C8. `POST /preview-pdf` met `canvasFields [{type:"inspection", damageTypes:["ja","😀","nee"]}]` → **500**; `damageTypes [42,null,{a:1}]` → 500; `[{type:"unknownType"}, {name:"no type"}, "string-field", null, 42]` → 500; een dynamisch veld met `source "__proto__"` → 500. `PUT /api/damage-check-templates/4` accepteert vrijwel alles (`canvasFields:"not an array"` faalde alleen omdat `isDefault:"yes"` geen boolean is). `POST /import {name, canvasFields:"garbage", isDefault:true}` → **200** en het geïmporteerde sjabloon werd de enige default (`select id from damage_check_templates where is_default` → 6) tot dat met `/1/set-default` is teruggezet.
- **Expected:** 400 met veldfouten op create/update/import/preview; de generator slaat een fout veld over in plaats van het hele document te laten falen; een import wijzigt de default nooit stilzwijgend.
- **Actual:** zoals boven; zodra zo'n sjabloon opgeslagen is, falen `GET /api/vehicles/:id/damage-check-pdf`, `/api/damage-checks/generate/:id` én de auto-PDF in de pickup-/returnflow met 500 (of slaan het document stil over) voor élk voertuig dat het sjabloon matcht.
- **Root cause:** `server/routes/damage-check-templates.ts:200-235` (spread van `req.body`), `:531` (import), `:88` (preview) — geen schema; `pdf-damage-check-generator.ts:634` `font.widthOfTextAtSize(t, optSize)` met het rauwe `damageType`, `:430` `Number(f.page)` op `null`, `:673` `dynVals[String(f.source)]` geeft voor `"__proto__"` `Object.prototype` terug waarop `sanitizeForWinAnsi` `.replace` aanroept.
- **Affected files:** `server/routes/damage-check-templates.ts`, `server/pdf-damage-check-generator.ts`
- **Affected data:** `damage_check_templates`-rijen; de `is_default`-vlag.
- **Security impact:** laag (vereist `MANAGE_DAMAGE_CHECKS`); weigering van de schadecheckfunctie.
- **Business impact:** een corrupte import of API-misbruik schakelt schadecheck-PDF's voor een hele voertuigklasse uit met een ondoorzichtige 500.
- **Fix proposal:** gedeeld zod-schema voor `CanvasField` (`shared/damage-check-default-layout.ts` heeft het TS-type al), toegepast in alle vier de routes; try/catch per veld in de generator; import negeert `isDefault` tenzij expliciet gevraagd.
- **Regression test:** `POST /preview-pdf` met de drie payloads hierboven → 400; `PUT` met `canvasFields [null]` → 400.

#### BUG-177 — De headerafbeelding van de schadecheck ligt over het sjabloonvlak heen, met een hoogte die van de afbeelding afhangt en die de editor nooit toont
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** P14-009
- **Feature:** Schadecheck-PDF (G5) + de sjablooneditor
- **Reproduction:** huidige `app_settings.damage_check_fields.headerImagePath = uploads\damage-check\header-1787427063629.png` (1983×793 px). Elke schadecheck-PDF, bijv. `p14-c-damage.cjs` C1 → `files/p14/c1_dc_generate_name_only.png`, `c3_interactive_check.png`.
- **Expected:** editor en generator zijn het eens over een vaste headerband (bijv. 60-80 pt) en de sjabloonvelden beginnen daaronder; de datum-/contractoverlay staat relatief tot die band, op een leesbaar formaat.
- **Actual (PNG):** de header wordt 595 pt breed × **238 pt hoog** (uit de beeldverhouding afgeleid) over y=604..842 getekend en dekt élk veld met y < 238 in editorcoördinaten af — titel, kenteken, merk, model, klant ("null null") en datums van sjabloon 4 staan op de donkere afbeelding en zijn nauwelijks leesbaar; met het geseede standaardsjabloon (id 1) verdwijnen de checklistregels op y=30..160 volledig onder de afbeelding. De overlay-datum "10/09/2026" en het contractnummer worden op **29 pt** (`textSize = round(headerH*0.12)`) gerenderd op pixelposities (445,28)/(445,80) die voor de oorspronkelijke meegeleverde afbeelding bedoeld waren, dus midden in de foto. De meegeleverde standaardheader `attached_assets/image_1779471993617.png` zit niet in de repository (149 andere bestanden wel), dus zonder upload heeft de PDF helemaal geen header (alleen een waarschuwing).
- **Root cause:** `server/pdf-damage-check-generator.ts:384-425` (`headerH = 595 * srcH/srcW`; `datumSrcX/Y` hardcoded; op elke pagina vóór de velden getekend); geen headerbegrip in `client/src/pages/settings/damage-check-template-editor.tsx` (alleen `headerText`); de uploadroute `app-settings.ts:107` valideert de afbeelding maar niet de verhouding.
- **Affected files:** `server/pdf-damage-check-generator.ts`, `server/routes/app-settings.ts`, `client/src/pages/settings/damage-check-template-editor.tsx`
- **Affected data:** elke schadecheck-PDF zolang er een hoge headerafbeelding is ingesteld.
- **Security impact:** geen.
- **Business impact:** schadechecks met een onleesbaar identificatieblok; sjabloonauteurs zien de botsing niet in de editor.
- **Fix proposal:** leg de hoogte van de headerband vast (pas de afbeelding letterboxend in een 595×70-vak), sla de overlayposities op als percentage van de band, render de band als vergrendelde bovenzone in de editor, valideer de beeldverhouding bij het uploaden (of crop) en lever de standaardheader mee in de repo.
- **Regression test:** genereer met een 1:1-headerafbeelding en assert dat de baseline van het eerste sjabloonveld onder de headerband ligt; assert dat de overlay-fontgrootte ≤ 12 is.

#### BUG-178 — Geen enkele generator breekt of kapt af: lange waarden lopen van de pagina en gaan in print verloren
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (welke maximale lengtes gelden voor namen, adressen en notities — dat is een bedrijfsregel, niet alleen een renderkeuze) · **Bron:** P14-010
- **Feature:** Alle PDF-generatoren (contract G1/G2, schadecheck G5, transportrapport G6)
- **Reproduction:** `p14-a-contracts.cjs` A2/A4 met reservering 3474 (klant 1290: naam 500 tekens, adres 1000, plaats 240, telefoon 62, rijbewijs 200; voertuig 1838: merk/model 300 tekens) → `a2_full_long.pdf/.png`, `a4_unknown_template_legacy_long.pdf`; `p14-d-transport.cjs` D1/D3 met transport 61 (bestemming 1000, chauffeur 300, reden 2000, notities 20 kB) → `d1_transport_long.pdf/.png`, `d3_transport_mytemplate_long.pdf`; `p14-c-damage.cjs` C3 (20 kB notities in de interactieve check).
- **Expected:** afbreken binnen de veld-/vakbreedte, of afkappen met een ellips, of shrink-to-fit, of te lange invoer weigeren waar het document hem niet kan bevatten.
- **Actual:** pdfjs-coördinaten tonen **8 tekstruns** op het contract die van de pagina lopen (naam op x=61 breedte 539 → voorbij 595 pt; gecentreerde naam begint op x=0,1; rechts uitgelijnde naam begint op x=-2,5, dus met de oorsprong búiten de pagina), 5 op het legacycontract en 5-8 op de transportbrieven; de PNG's laten de tekst onder de rechtermarge verdwijnen — de staart van élke lange waarde is in print verloren en de rechterkolom van het contractformulier wordt door de tekst van de linkerkolom overschreven.
- **Root cause:** `pdf-generator.ts:474-517` (één `drawText`, de uitlijnrekensom gaat ervan uit dat de tekst past), `:1420-1428`, `pdf-damage-check-generator.ts:640-650`; het sjabloonmodel kent geen breedte (de editor slaat er geen op) en er staat geen `maxLength` op de tekstkolommen van klant/voertuig/transport (`customers.name` accepteerde 500 tekens, adres 1000).
- **Affected files:** `server/utils/pdf-generator.ts`, `server/pdf-damage-check-generator.ts`, de client-editors, `shared/schema.ts`
- **Affected data:** documenten voor klanten/bedrijven met lange namen of adressen, transporten met lange notities.
- **Security impact:** geen.
- **Business impact:** gedrukte contracten en chauffeursbrieven met ontbrekende of overlappende informatie.
- **Fix proposal:** voeg optionele `width`/`maxLines` toe aan gepositioneerde velden (default: paginabreedte − x − marge), implementeer woordafbreking met `widthOfTextAtSize`, en voeg verstandige `maxLength`-validatie op de invoer toe. **Besluit voor de eigenaar:** welke maximale lengtes (voorstel: naam 200, adres 300, notities 5000).
- **Regression test:** render de lange fixture en assert met pdfjs dat élk tekstitem voldoet aan `x ≥ 0` en `x + width ≤ 595`.

#### BUG-179 — Contractsjabloon-achtergronden degraderen stil: kapot, ontbrekend of verkeerd formaat valt terug op de standaard, met loshangende paden
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** P14-011
- **Feature:** Achtergronden van contractsjablonen (upload, bibliotheek, select, delete, generatie)
- **Reproduction:** `p14-b-templates.cjs` B4-B6 op sjabloon 12/14. (1) Overschrijf na een geldige PNG-upload `audit-uploads/templates/template_12_background.png` met rommelbytes, met 0 bytes, met een PDF, met JPEG-bytes, en verwijder hem ten slotte → `GET /api/contracts/generate/3466?templateId=12` geeft élke keer **200**, 311 626 B, pagina 1 opgebouwd uit het **standaard vectorsjabloon** (pdf-lib: 12 contentstreams, 1 afbeelding = de barcode), de sjabloonrij zegt nog steeds `backgroundPath=…template_12_background.png`, en `GET /<backgroundPreviewPath>` (wat de editor laadt) geeft 200 `text/html` (SPA-fallback) in plaats van 404. (2) JPEG-bytes met de naam `x.png` en mimetype `image/jpeg` → 200, opgeslagen als `template_12_background.png`, generatie valt stil terug op de standaard (`embedPng` faalt). (3) `POST /api/pdf-templates/9/backgrounds/1/select` met de achtergrond van een **ander** sjabloon → 200, sjabloon 9 gebruikt nu het bestand van sjabloon 12; `DELETE /api/pdf-templates/12/backgrounds/1` verwijdert het bestand, maar de `backgroundPath` van 12 (én 9) wijst nog naar het verwijderde bestand → de volgende generatie gebruikt stil de standaard.
- **Expected:** generatie met een onleesbare geconfigureerde achtergrond faalt hoorbaar (500 + log) of markeert minstens de fallback; de upload leidt de extensie af uit het gedetecteerde contenttype; select controleert eigendom; het verwijderen van de actieve achtergrond reset `backgroundPath` (of wordt geweigerd); een ontbrekende preview geeft 404.
- **Actual:** zoals boven — het eigen briefpapier van de exploitant verdwijnt uit élk nieuw contract zonder enig signaal.
- **Root cause:** `server/utils/pdf-generator.ts:88-207` (vijf geneste fallbacks naar het standaardsjabloon, alle met `console.log`); `routes/pdf-templates.ts:346-352` (`ext = path.extname(req.file.originalname)`), `:605-629` (geen `templateId`-controle bij select), `:631-676` (geen reset van het actieve pad); `server/index.ts` statische uploadsroute + SPA-catch-all voor de preview-URL (BUG-029-familie).
- **Affected files:** `server/utils/pdf-generator.ts`, `server/routes/pdf-templates.ts` (en de twee kopieën in `report-and-label-templates.ts` / `damage-check-templates.ts`)
- **Affected data:** `pdf_templates.backgroundPath` / `backgroundPreviewPath`, `template_backgrounds`
- **Security impact:** laag (BUG-070 dekt al het padmisbruik van `backgroundPath`).
- **Business impact:** contracten gedrukt op het verkeerde briefpapier; de editor toont een gebroken afbeelding zonder uitleg.
- **Fix proposal:** behandel "geconfigureerde achtergrond onleesbaar" als een fout; sniff het contenttype en leid de extensie daaruit af; valideer eigendom bij select; null bij een bibliotheekdelete elk sjabloon dat de achtergrond gebruikt; laat de statische route 404 geven voor ontbrekende bestanden.
- **Regression test:** corrumpeer het achtergrondbestand in een test en assert dat de generate-route 500 (of een waarschuwingsheader) geeft in plaats van 200 met de standaardachtergrond.

#### BUG-180 — De document-level inhoud van een PDF-achtergrond (OpenAction-JavaScript, extra pagina's) wordt in élk gegenereerd contract meegekopieerd
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** P14-012
- **Feature:** PDF-achtergrond van een contractsjabloon
- **Reproduction:** `p14-b-templates.cjs` B5: bouw een 3-pagina-PDF met catalog `/OpenAction → /S /JavaScript /JS (app.alert('AUDIT-P14 background JavaScript'))` (`files/p14/b5_background_3pages_js.pdf`), upload hem als achtergrond van sjabloon 12 (geaccepteerd, 200, `backgroundPreviewPath` null — BUG-193), `GET /api/contracts/generate/3466?templateId=12` → `files/p14/b5_pdf_background_3pages.pdf`.
- **Expected:** alleen het uiterlijk van pagina 1 wordt als achtergrond gebruikt (`copyPages`/`embedPage` in een vers document); geen scripts, acties, formulieren of embedded files uit de upload overleven; paginatelling = 1.
- **Actual:** het gegenereerde contract heeft **3 pagina's**, velden alleen op pagina 1, en pdf-lib toont catalog `OpenAction = << /Type /Action /S /JavaScript /JS (app.alert('AUDIT-P14 background JavaScript')) >>`; `documents`-rij 421 (5788 B) bewaart het. De uploadvalidator (`validateFileBuffer`, type `document`) controleert alleen magic bytes.
- **Root cause:** `server/utils/pdf-generator.ts:113` `pdfDoc = await PDFDocument.load(templateBytes)` — het geüploade document **wordt** het uitvoerdocument; `:540` slaat het op met alles wat het meedroeg.
- **Affected files:** `server/utils/pdf-generator.ts`, `server/routes/pdf-templates.ts:306-412`
- **Affected data:** elk contract dat met een PDF-achtergrond is gegenereerd.
- **Security impact:** een gebruiker met `MANAGE_PDF_TEMPLATES` (of iedereen via BUG-070-achtig padmisbruik) kan actieve inhoud planten die in Acrobat/Foxit draait bij élke klant of medewerker die een contract opent (JS is gesandboxed maar ondersteunt phishingdialogen, launch-acties in oudere viewers en exfiltratie via `submitForm`); ook kunnen er extra pagina's/voorwaarden in het contract verstopt worden.
- **Business impact:** reputatie/juridisch; klanten ontvangen documenten met verborgen inhoud.
- **Fix proposal:** maak een vers `PDFDocument`, `copyPages`/`embedPage` pagina 1 van de achtergrond en bewaar de broncatalogus nooit; weiger bij het uploaden PDF's met `/JavaScript`, `/OpenAction`, `/AA`, `/Launch` of `/EmbeddedFiles`, of vlak ze af via pdf-to-image en gebruik de PNG.
- **Regression test:** upload de fixture-PDF en assert dat het gegenereerde contract 1 pagina heeft en geen OpenAction/JavaScript-objecten bevat.

#### BUG-181 — Sjabloonkeuze valt inconsistent terug: willekeurig contractsjabloon, blanco transportrapport, drie schadecheckmatchers die het oneens zijn
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (wat hoort er te gebeuren zonder default, en mag een default überhaupt verwijderd worden?) · **Bron:** P14-013 — *BUG-156 dekt alleen "onbekend contract-`templateId` → standaardlayout"*
- **Feature:** Sjabloonresolutie voor contract, transportrapport en schadecheck
- **Reproduction:** (a) `p14-b-templates.cjs` B7: `PATCH /api/pdf-templates/13 {isDefault:true}` → `DELETE /api/pdf-templates/13` → `select id from pdf_templates where is_default` = leeg; `GET /api/pdf-templates/default` → 200 `{id:9,"AUDIT-P14 full fields"}` (niet als default gemarkeerd); `GET /api/contracts/generate/3466` → 200, gerenderd met sjabloon 9 (de eerste rij op invoegvolgorde). (b) `p14-d-transport.cjs` D3: `POST /api/delivery/transports/generate-report {transportIds:[60], templateId:999999}` → **201**, `documents`-rij 439, bestand 643 B, 1 pagina, **helemaal geen tekst**. (c) `p14-c-damage.cjs`: voertuig 1840 (merk/model matchen sjabloon 4, `vehicleType 'van'`, sjabloon 4 heeft `vehicleType` NULL): `GET /api/damage-checks/generate/3476` → sjabloon 4 (alfabetisch eerste), `GET /api/vehicles/1840/damage-check-pdf` → sjabloon 4 (trap 2 merk+model), `GET /api/interactive-damage-checks/15/pdf` en de auto-PDF bij pickup → **sjabloon 1** "Auto-Generated Default" (`pickBest` eist gelijkheid van `vehicleType` zodra het voertuig een type heeft).
- **Expected:** (a) geen default → expliciete fout "geen standaardsjabloon" of het geseede standaardsjabloon, nooit "eerste rij"; (b) onbekend `templateId` → 404, nooit een blanco document; (c) één matcher.
- **Actual:** zoals boven; bij (a) hangt de vervanger van de verwijderde default af van de invoegvolgorde, bij (b) wordt een blanco brief gearchiveerd, bij (c) krijgt hetzelfde voertuig een andere layout afhankelijk van welke knop personeel indrukt.
- **Root cause:** (a) `server/database-storage.ts:2322` `allTemplates.find(t => t.isDefault) || allTemplates[0]` (ook `reservation-pdf-regeneration.ts:117`); (b) `server/routes.ts:7692-7694` `templateId ? getTransportReportTemplate(templateId) : getDefault…` zonder null-check, waarna `generateTransportReportsPdf` niets tekent; (c) `routes.ts:6155-6165` versus `:6660-6710` versus `services/reservation-pdf-regeneration.ts:299-320` (en `getDamageCheckTemplatesByVehicle` sorteert op naam).
- **Affected files:** `server/database-storage.ts`, `server/routes.ts`, `server/services/reservation-pdf-regeneration.ts`
- **Affected data:** documenten die zijn geproduceerd nadat een default is verwijderd; `transport_report`-documenten met een onbekend `templateId`.
- **Security impact:** geen.
- **Business impact:** onvoorspelbare layouts; blanco brieven in het archief.
- **Fix proposal:** `getDefaultPdfTemplate` geeft `undefined` terug wanneer er geen default is gemarkeerd en de routes geven 409 "geen standaardsjabloon"; `generate-report` geeft 404 bij een onbekend `templateId`; één gedeelde `resolveDamageCheckTemplate` voor alle zes de aanroepers; het verwijderen van een default wordt geweigerd of draagt de vlag expliciet over. **Besluit voor de eigenaar:** weigeren of automatisch overdragen.
- **Regression test:** verwijder de default → genereer → verwacht 409; `generate-report` met `templateId 999999` → 404; snapshottest dat de drie schadecheckroutes voor één fixturevoertuig hetzelfde sjabloon-id kiezen.

#### BUG-182 — `generate-versioned` controleert de reservering niet en evenmin of voertuig/klant erbij horen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (is "concept-contract vóór opslaan" een ondersteunde workflow, en zo ja: hoe wordt zo'n document herkenbaar gearchiveerd?) · **Bron:** P14-014
- **Feature:** `POST /api/contracts/generate-versioned/:reservationId`
- **Reproduction:** `p14-a-contracts.cjs` A7: `POST /api/contracts/generate-versioned/999999?templateId=9 {vehicleId:1833, customerId:1285, startDate, endDate}` → 200 met een PDF met contractnummer "C-999999-20260910" en `select * from documents where reservation_id=999999` → rij 365 (voertuig 1833, `Contract (Unsigned)`, bestand `..\audit-uploads\contracts\AU140X\AU140X_contract_20260910.pdf` — dezelfde bestandsnaam die élk AU140X-contract van die dag gebruikt, BUG-027). `POST …/3466` met `vehicleId 1839` / `customerId 1291` (niet die van de reservering) → 200 en `documents`-rij 364, gehangen aan reservering 3466, met klant 1291 en voertuig AU-14-BX erop.
- **Expected:** 404 voor een niet-bestaande reservering; voor een bestaande óf de formuliergegevens valideren tegen de reservering, óf de afwijking vastleggen (notities) — en de "bewerkmodus vóór opslaan"-use case hoort minstens `MANAGE_RESERVATIONS` te vereisen (BUG-167).
- **Actual:** loshangende `documents`-rijen (`documents.reservation_id` heeft geen FK), een contractbestand dat het bestand van de échte reservering van die dag overschrijft, en contracten die aan een reservering hangen maar een andere klant noemen.
- **Root cause:** `server/routes.ts:5798-5960` — `reservationId` wordt alleen door `parseInt` gehaald, nooit geladen; voertuig en klant komen uit de body.
- **Affected files:** `server/routes.ts`
- **Affected data:** `documents`-rijen 364/365 in de audit-DB; vergelijkbare rijen in productie.
- **Security impact:** laag; in combinatie met BUG-167 kan elke gebruiker willekeurige contractdocumenten aan elk reserverings-id hangen.
- **Business impact:** verkeerd contract in de documentenlijst van een reservering; archiefvervuiling.
- **Fix proposal:** laad de reservering (404), eis `MANAGE_RESERVATIONS`, en forceer voertuig/klant uit de reservering óf leg "concept met niet-opgeslagen formuliergegevens" vast in `documentType`/notities; gebruik een unieke bestandsnaam per versie. **Besluit voor de eigenaar:** blijft de conceptflow bestaan?
- **Regression test:** `POST` voor reservering 999999 → 404 en geen `documents`-rij.

#### BUG-183 — `GET /api/vehicles/:id/damage-check-pdf` drukt een oude, niet-gerelateerde reservering af; bij open einde worden de huurdagen verzonnen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (welke reservering hoort op een schadecheck als er vandaag geen verhuring loopt?) · **Bron:** P14-015
- **Feature:** Schadecheck vanaf de voertuigpagina
- **Reproduction:** `p14-c-damage.cjs` C2: voertuig 1837 heeft één reservering 3472 (2020-01-01..2020-01-05, klant 1291); `GET /api/vehicles/1837/damage-check-pdf` → contractnummer "#3472" op de check van vandaag (`c2_vehicle_dc_old_reservation_2020.pdf`; met een sjabloon dat `customerName` bevat zou ook die klant erop staan). `GET /api/damage-checks/generate/3469` (open einde, `endDate` NULL) → `endDate` afgedrukt als start + 7 dagen en `rentalDays` 7 (`routes.ts:6180`).
- **Expected:** geen reserveringsblok wanneer er geen reservering vandaag dekt (of de eerstvolgende, duidelijk gelabeld); open einde → "open" en geen dagentelling.
- **Actual:** `reservations.find(current) || reservations[0]` kiest de meest recente verhuring uit het verleden; de check wordt voorgevuld met een klant die de auto jaren geleden heeft ingeleverd.
- **Root cause:** `server/routes.ts:6725` (`|| reservations[0]`, en `getReservationsByVehicle` sorteert op `start_date desc`); `:6180` (`new Date(startDate.getTime() + 7*24*3600*1000)`).
- **Affected files:** `server/routes.ts:6717-6746, 6176-6190`
- **Affected data:** schadechecks die vanaf de voertuigpagina voor stilstaande auto's worden gemaakt.
- **Security impact:** beperkte PII-lekkage (de naam van de vorige huurder op een nieuwe check).
- **Business impact:** verkeerde klant/contract op het inspectieformulier; personeel kan de verkeerde huurder laten tekenen.
- **Fix proposal:** gebruik alleen een reservering waarvan de periode vandaag omvat (of het expliciete `reservationId` dat de client meestuurt); render "open" bij een ontbrekende `endDate`. **Besluit voor de eigenaar:** leeg laten, of de eerstvolgende reservering tonen met een label.
- **Regression test:** voertuig met alleen een reservering uit het verleden → paginatekst bevat geen `#<id>`; open einde → geen `rentalDays`.

#### BUG-184 — Twee geüploade contract-PDF's voor dezelfde plaat op dezelfde dag delen één bestand: de eerste wordt overschreven en serveert daarna de bytes van de tweede
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** F15-002
- **Feature:** `POST /api/documents` met `documentType="contract"`
- **Reproduction:** (1) `POST /api/documents` (`documentType="contract"`, `vehicleId=1832`, bestand `valid.pdf`) → 201, id **324**, `filePath ..\audit-uploads\contracts\AU15AX\AU15AX_contract_20260910.pdf`. (2) `POST /api/documents` (zelfde type/voertuig, bestand `polyglot.pdf` — **andere inhoud**) → 201, id **325**, `filePath` **identiek** aan stap 1. (3) `GET /api/documents/view/324` → 200 maar levert de bytes van `polyglot.pdf` (`"%PDF-1.4\n<script>alert(document.domain)…"`) — de oorspronkelijke inhoud van document 324 is weg. Script `p15-a-docs.cjs`, capture `p15-a-docs.out.json` (`contractDup`: doc1/doc2 zelfde `filePath`; `doc1_view_head` = inhoud van doc2).
- **Expected:** elk geüpload document behoudt zijn eigen bytes; twee rijen mogen nooit één fysiek bestand delen (versioneer de bestandsnaam met een timestamp zoals élk ander documenttype, of weiger/vervang met één rij).
- **Actual:** de contractbestandsnaam is `<plaat>_contract_<JJJJMMDD><ext>` **zonder timestamp**, dus twee contractuploads op dezelfde dag voor dezelfde plaat schrijven naar hetzelfde pad; de tweede overschrijft de eerste stil terwijl er een tweede `documents`-rij bij komt. De eerdere rij serveert daarna de inhoud van het latere bestand.
- **Root cause:** `server/routes.ts` ~`4900-4911` (`documentStorage.filename`-callback, contracttak: `${sanitizedPlate}_contract_${currentDate}${extension}` — de timestamp die de niet-contracttak wél zet ontbreekt), plus de parallelle `getRelativePath` in de POST-handler.
- **Affected files:** `server/routes.ts:4873-4915, 5000-5035`
- **Affected data:** `documents`-rijen van type "contract" die één bestand delen; oudere rijen stil beschadigd.
- **Security impact:** laag-tot-matig — iemand met `MANAGE_DOCUMENTS` kan de bytes op schijf van een bestaand contract overschrijven (repudiatie/bewijsmanipulatie: de metadata van de rij blijft ongewijzigd, de geserveerde PDF is verwisseld).
- **Business impact:** stil verlies van juridische documenten: het opnieuw uploaden van een gecorrigeerd contract vernietigt het eerdere, en elke eerdere documentrij toont daarna andermans contract. Dezelfde gedeelde-bestandsoorzaak als BUG-027 (hergeneratie), maar bereikt via de uploadroute en met de extra schade van cross-serving.
- **Fix proposal:** neem de milliseconde-timestamp op in de contractbestandsnaam (zoals de standaardtak al doet), of dedupliceer naar één rij per (plaat, contract, dag) en vervang atomair.
- **Regression test:** upload twee verschillende contract-PDF's voor één voertuig op dezelfde dag; assert twee verschillende `filePath`s en dat `view/:id` van elk zijn eigen bytes teruggeeft.

#### BUG-185 — Geen idempotentie of retry-bescherming op mail; een vastgelopen bulkverzending logt helemaal niets
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E16-003
- **Feature:** Alle mailverzendroutes + `email_logs`
- **Reproduction:** `p16-c-hang.cjs` C3 (retry tijdens een storing), C4 (bulk met een stille SMTP-server); `p16-a-staff.cjs` A1 (dubbelklik), `p16-a2-staff.cjs` A8g (bulk-dubbelklik).
  - **C3:** de eerste verzending hing onder `drop`; 3 s later een "retry"; toen de stub weer op `ok` stond werden **beide** bezorgd (`msgsDelivered:2`, identieke onderwerpen).
  - **A1/A8g:** dubbelklikken leverden 2 respectievelijk 8 zelfstandige berichten op.
  - **C4:** een bulkverzending tegen een stille server gaf **GEEN ANTWOORD binnen 40 s** en schreef, omdat `notifications.ts` zijn `email_logs`-rij pas ná de lus invoegt, **geen eigen logrij**; de rij die het script las (`emails_sent:1`) was een oudere, niet-gerelateerde rij. (Het rij-id is niet vastgelegd, dus die herkomst is beredeneerd, niet bewezen; zeker is dat C4 zelf niets logde.)
- **Expected:** een opnieuw ingediende verzending tijdens een trage server levert geen duplicaten; een bulkrun legt vast wat hij gedaan heeft, ook als hij vastloopt.
- **Actual:** zoals boven.
- **Root cause:** geen idempotentiesleutel of dedupe op welke verzendroute dan ook; `server/routes/notifications.ts:180-347` verstuurt sequentieel en voegt de enige `email_logs`-rij pas op `:338` in, ná de hele lus; de portaal- en documentroutes loggen helemaal nooit.
- **Affected files:** `server/routes/notifications.ts`, `server/routes.ts:5219/5305`, `server/services/portal-mail.ts`
- **Affected data:** volledigheid van `email_logs`; dubbele klantmail.
- **Security impact:** laag; mailspam/verwarring.
- **Business impact:** dubbele herinneringen en resetmails; geen audittrail voor vastgelopen of halve bulkruns. Complementair aan BUG-155 (portaalmail wordt sowieso nooit gelogd).
- **Fix proposal:** een kortlevende idempotentiegarantie per (route, payload) plus deduplicatie op requestniveau; schrijf de `email_logs`-rij incrementeel of in een `finally`.
- **Regression test:** vuur twee identieke verzendingen gelijktijdig af; assert één bezorging en één logrij.

#### BUG-186 — De opgeslagen `smtpSecure`-vlag wordt genegeerd: mail die als TLS is ingesteld gaat in platte tekst, en een ongeldig afzendadres wordt geaccepteerd
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E16-004
- **Feature:** Interpretatie en validatie van de SMTP-configuratie
- **Reproduction:** `p16-a2-staff.cjs` A5: met `smtpSecure:true` en poort 2525 werd de mail **in platte tekst verstuurd (200)**; poort `465` als **getal** → 500 (secure werd `false` door de stringvergelijking, dus de TLS-handshake vond nooit plaats); `fromEmail:"not an address"` → **200** en verstuurd met `MAIL FROM:<not an address>`.
- **Expected:** de opgeslagen `smtpSecure`-vlag bepaalt TLS; een ongeldig afzendadres wordt vóór verzending geweigerd.
- **Actual:** zoals boven — de opgeslagen boolean wordt genegeerd.
- **Root cause:** `server/utils/email-service.ts:104` `smtpSecure: value.smtpPort === '465'` negeert `value.smtpSecure` en matcht alleen de **string** `'465'`; `:88-95` valideert de aanwezigheid maar niet het formaat van `fromEmail`/`host`/`port`. De instellingen worden zonder enige validatie weggeschreven (`server/routes/app-settings.ts:333-402` slaat `value` letterlijk op — BUG-025).
- **Affected files:** `server/utils/email-service.ts`, `server/routes/app-settings.ts`
- **Affected data:** `app_settings` `email_config`; vertrouwelijkheid van mail onderweg.
- **Security impact:** mail die een beheerder als TLS-beschermd beschouwt kan in cleartext verstuurd worden; een malformed afzender helpt bij spoofing en bounceproblemen. Versterkt BUG-080 (`rejectUnauthorized:false`).
- **Business impact:** stille misconfiguratie; de SSL-schakelaar in de instellingen doet niets.
- **Fix proposal:** honoreer `value.smtpSecure` (poort 465 ⇒ secure als default); valideer `fromEmail`/`host`/`port` bij het opslaan.
- **Regression test:** sla `smtpSecure:true` op poort 587 op; assert dat de transporter met `secure:true` (of een STARTTLS-upgrade) wordt gemaakt en platte tekst weigert.

#### BUG-187 — Portaalgebruiker-gecontroleerde velden worden als rauwe HTML in mail én in-app-meldingen gerenderd (phishinglink-injectie)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E16-005
- **Feature:** Portaalmail- en meldingtemplating (`renderTemplate`)
- **Reproduction:** `p16-b-portal.cjs` B9a, B7, B10b. Een portaalgebruiker zette `fullName` op `AUDIT-P16 <a href="https://evil.example/login">Klik hier om uw wachtwoord te vernieuwen</a>`; die markup werd **live gerenderd in de staff-meldingsmail** én **rauw opgeslagen** in `custom_notifications.description`. Een geprepareerde `User-Agent` `<b>bold</b> <a href="https://evil.example">x</a>` verscheen als werkende link in de beveiligingsmail "nieuwe aanmelding" van de klant zelf (B7, `linkOf → https://evil.example`). Ook het antwoord van een medewerker op een aanvraag wordt rauw gerenderd (B10b).
- **Expected:** door gebruikers aangeleverde tekst wordt HTML-geëscaped voordat hij in een mailbody of melding terechtkomt.
- **Actual:** zoals boven.
- **Root cause:** `server/services/portal-mail.ts` `renderTemplate` (`:108`) doet een kale `{{var}}`-substitutie zonder escaping; `server/services/portal-notifications.ts:61-65` geeft dezelfde rauwe variabelen door aan zowel de mail als de opgeslagen melding. Nergens op het portaalmailpad wordt output-encoding toegepast.
- **Affected files:** `server/services/portal-mail.ts`, `server/services/portal-notifications.ts`
- **Affected data:** inhoud van staff-mailboxen, `custom_notifications`-rijen, beveiligingsmail aan klanten.
- **Security impact:** HTML-/phishinginjectie — een klant kan een "reset uw wachtwoord"-link planten in de mail die personeel ontvangt (én in de melding op het staff-dashboard); wie de login van een klant heeft kan een misleidende link in de nieuw-apparaat-waarschuwing van die klant zetten. **Onderscheiden van BUG-081** (staff-geschreven HTML in documentmail — daar is de afzender de aanvaller), **BUG-086** (de ingress-sanitizer raakt multipart-bodies niet — een ander middleware-gat) en **BUG-100** (`fromName` rauw in een header): de sink is hier `renderTemplate` in `portal-mail.ts` en de invoer komt van de **portaalgebruiker**.
- **Business impact:** social-engineeringoppervlak richting personeel én klanten.
- **Fix proposal:** HTML-escape elke geïnterpoleerde variabele in `renderTemplate` (of stap over op een template-engine met auto-escaping) en escape meldingsbeschrijvingen vóór opslag/rendering.
- **Regression test:** zet `fullName` op `<script>`/`<a>`; assert dat de bezorgde mail en de opgeslagen melding geëscapete entiteiten bevatten.

### 5.4 LOW

#### BUG-188 — Parallel verwijderen van één voertuig laat een dubbele/wees-snapshot in de prullenbak achter
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** C13-007
- **Feature:** Prullenbak — `DELETE /api/vehicles/:id`
- **Reproduction:** `p13-08-recycle.cjs` test 12a. Voertuig 1868 (`AU-13R1-X`) met één reservering. Twee sessies doen parallel `DELETE /api/vehicles/1868` → **200 (manager) / 404 (admin)**, het voertuig is weg, maar `deleted_records` bevat **twee** snapshotrijen voor entiteit 1868 (id 50 door admin, id 51 door de manager), elk een volledige snapshot die `reservations:1` claimt. Ook twee `vehicle.delete`-succesrijen in `audit_logs`.
- **Expected:** één verwijdering, één snapshot; de verliezende call is een schone 404 zonder neveneffect.
- **Actual:** `deleteVehicle` draait een transactie die (1) de snapshot invoegt en daarna (2) `tx.delete(vehicles) … returning` doet en `!!deleted` teruggeeft. De verliezende transactie raakt met haar delete 0 rijen en geeft dus `false` terug (→ route 404), **maar de transactie commit alsnog**, zodat haar snapshot-insert blijft staan: een dubbele snapshot die naar een voertuig wijst dat deze call niet heeft verwijderd.
- **Root cause:** `server/database-storage.ts:535-620` — de snapshot-`tx.insert(deletedRecords)` gebeurt vóór `tx.delete(vehicles)`, en een delete van 0 rijen geeft `false` in plaats van te gooien, dus de transactie commit de weessnapshot; `server/routes.ts:1657` mapt `false` naar 404.
- **Affected files:** `server/database-storage.ts:535-620`, `server/routes.ts:1624-1690`
- **Affected data:** `deleted_records` 50 (wees) + 51 (echt) voor voertuig 1868.
- **Security impact:** geen.
- **Business impact:** rommel in de prullenbak — twee identieke "herstel"-regels voor één verwijdering; de wees later herstellen loopt op `id_taken`/`license_plate_taken` (of het 500-pad van BUG-043). Verwarrend, niet destructief.
- **Fix proposal:** verwijder in `deleteVehicle` de voertuigrij **eerst** (of `SELECT … FOR UPDATE`) en breek af (rollback/return) vóór de snapshot-insert wanneer er 0 rijen geraakt zijn, zodat alleen de transactie die daadwerkelijk verwijdert een snapshot schrijft.
- **Regression test:** twee gelijktijdige deletes van één voertuig → precies één 200, één 404/409, en precies één `deleted_records`-rij.

#### BUG-189 — Een wachtwoordwijziging vanuit twee tabbladen slaagt tweemaal; alleen de laatste werkt
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** C13-009
- **Feature:** `POST /api/users/change-password`
- **Reproduction:** `p13-07-tabs.cjs` test 9c. Eén gebruiker, tweemaal ingelogd (twee tabbladen die de cookie delen). Beide tabbladen doen parallel `POST /api/users/change-password` met hetzelfde huidige wachtwoord en **verschillende** nieuwe wachtwoorden (`…A`, `…B`) → **beide 200**. Daarna werkt alleen het als laatste gecommitte wachtwoord (`login A` → 401, `login B` → 200); de gebruiker heeft twee keer "gelukt" gezien.
- **Expected:** één slaagt; de tweede faalt met "huidig wachtwoord onjuist" (het huidige wachtwoord klopt na de eerste wijziging immers niet meer) of wordt anderszins geweigerd.
- **Actual:** beide requests verifiëren het huidige wachtwoord tegen de hash van vóór de wijziging (check-then-write, geen lock), beide hashen hun nieuwe waarde en schrijven; laatste schrijver wint.
- **Root cause:** `server/routes/users.ts:349-398` — de verificatie van het huidige wachtwoord en het schrijven van de hash zijn niet atomair en houden geen lock. Gerelateerd aan, maar onderscheiden van BUG-091 (andere sessies worden na een wachtwoordwijziging niet ingetrokken).
- **Affected files:** `server/routes/users.ts:349-398`
- **Affected data:** alleen de wegwerpgebruiker.
- **Security impact:** gering — vereist een al geauthenticeerde sessie in twee tabbladen; geen privilegewinst, het uiteindelijke wachtwoord is er één die de rechtmatige gebruiker zelf heeft gekozen.
- **Business impact:** verwarrend — de gebruiker ziet twee succesmeldingen terwijl er maar één wachtwoord werkt, en hij weet niet welk.
- **Fix proposal:** serialiseer de wijziging (conditionele update op de oude hash, of een lock per gebruiker); wijs de verliezer af met de standaardmelding "huidig wachtwoord onjuist".
- **Regression test:** twee gelijktijdige change-password-calls met verschillende nieuwe wachtwoorden → één 200, één 4xx.

#### BUG-190 — Gelijktijdige documentgeneratie levert dubbele versielabels en dubbele documentrijen op
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** C13-010 — *de helft "alle rijen op één fysiek bestand" valt onder BUG-027 (herbevestigd, §6)*
- **Feature:** Contract- en schadecheckgeneratie (versienummering)
- **Reproduction:** `p13-04-docs.cjs` tests 6a, 6d en 4g; aanvullend `p14-a-contracts.cjs` A10.
  - **6a:** 10× parallel `GET /api/contracts/generate/:id` → 10 documentrijen met de labels `Contract (Unsigned)`, `…2`, `…2`, `…3`, `…4`, `…4`, `…5`… — de versienummers zijn berekend uit een `existingDocs`-lezing die de andere generaties niet ziet, dus meerdere rijen delen een versielabel; alle 10 wijzen naar **één** fysiek bestand (`…_contract_20260910.pdf`).
  - **6d:** 10× parallel `generate-versioned` → 20 rijen met `Unsigned 9`×5 en `Unsigned 10`×5.
  - **4g:** dubbelklik-retour → twee "Damage Check"-rijen/bestanden voor één inname.
  - **A10 (fase 14):** 5 parallelle calls produceerden "Contract (Unsigned) 12" tweemaal.
- **Expected:** unieke, oplopende versienummers en één documentrij per echte generatie (of het superseden van de vorige unsigned rij).
- **Actual:** het versienummer is `Math.max(bestaande versies)+1` uit een lezing die de andere in-flight generaties raced, dus duplicaten; de bestandsnaam op schijf is datumgebaseerd (geen per-generatie-component) waardoor alle rijen van dezelfde dag op één bestand botsen.
- **Root cause:** `server/routes.ts:5600-5640` (contractversienummering uit `getDocumentsByReservation`), `:5900-5945` (generate-versioned, hetzelfde patroon), `:6215-6250` (schadecheckversionering); bestandsnaam `${plate}_contract_${currentDate}.pdf` zonder unieke component.
- **Affected files:** `server/routes.ts`
- **Affected data:** reservering 3531 (10 contractrijen, één bestand); 3532 (versioned rijen).
- **Security impact:** geen.
- **Business impact:** dubbele "Unsigned N"-documentrijen met botsende versielabels op één onderliggende PDF; rommel, geen dataverlies. Vooral relevant wanneer contractgeneratie herhaald wordt getriggerd (auto-regeneratie bij bewerken + een handmatige klik).
- **Fix proposal:** neem een unieke component per generatie op in de bestandsnaam en bereken de versie binnen een transactie (of supersede de vorige unsigned rij) in plaats van uit een racende lezing.
- **Regression test:** 5 gelijktijdige generaties → 5 verschillende bestanden en 5 verschillende versielabels, of één superseding rij.

#### BUG-191 — De contractrenderer drukt placeholdertekst af voor onoplosbare velden en accepteert absurde geometrie
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** P14-016 — *BUG-048 dekt het accepteren van malformede velden; dit gaat over wat er op papier komt*
- **Feature:** Contractsjabloonrenderer (G1)
- **Reproduction:** `p14-a-contracts.cjs` A3 (sjabloon 10 "AUDIT-P14 invalid fields") → `files/p14/a3_invalid_fields.pdf/.png` en A8 (sjabloonpreview). pdfjs-items: `"SHOULD-NOT-PRINT-unknown-plain"` (de **veldnaam** wordt afgedrukt omdat de bron `nonexistentSource` onbekend is), `"[object Object]"` (bron `__proto__`), `"1833"` (bron `vehicleId` — een intern id), `"NoSource"`/`"NullField"`/`"Field"`/`"Field"` (velden zonder bron en niet-object-entries) op (61,218)/(6,833)/(6,831); `"Zuidland"` op (6,833) bij `x:"abc"`; `fontSize 500` geaccepteerd → een 500 pt "AU" van het kenteken bedekt de hele pagina (PNG); `fontSize 0/-12/"big"` → 12; `page:3` genegeerd (op pagina 1 getekend); coördinaten -50/-50 en 2000/2000 → buiten de pagina getekend (stil onzichtbaar).
- **Expected:** onbekende bron → lege string + waarschuwing (zoals de transportrenderer doet), geen interne id's, `fontSize` geklemd (bijv. 6-48), coördinaten geklemd tot de pagina, niet-object-entries geweigerd.
- **Actual:** zoals boven; het klantgerichte contract kan de labels van de sjabloonauteur bevatten.
- **Root cause:** `server/utils/pdf-generator.ts:386-390` (`else if (field.name) value = field.name; else value = source || 'Field'`), `:344-355` (`source in contractData` ontsluit elke sleutel, inclusief `vehicleId` en prototypeleden), `:419-431` (geen bovengrens op `fontSize`), `:439-461` (geen clamping).
- **Affected files:** `server/utils/pdf-generator.ts`, `server/routes/pdf-templates.ts`
- **Affected data:** contracten die met een verkeerd geconfigureerd sjabloon zijn gerenderd.
- **Security impact:** verwaarloosbaar (prototypetoegang levert `"[object Object]"`).
- **Business impact:** verwarrende/onjuiste contracten na een typefout in het sjabloon.
- **Fix proposal:** whitelist van bronnen (de lijst uit de editor), zod-schema op `fields` (x 0..595, y 0..842, fontSize 6..48, `textAlign` enum), onbekend → `''` + waarschuwing.
- **Regression test:** render sjabloon 10 en assert dat de paginatekst geen `"SHOULD-NOT-PRINT"`, `"[object Object]"` of `"Field"` bevat.

#### BUG-192 — Gemengde talen en formaten binnen één document; de `language`-kolom van het sjabloon wordt genegeerd
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (welke taal en welk datum-/valutaformaat zijn leidend, en waar komt die keuze vandaan: sjabloon, klant of systeeminstelling?) · **Bron:** P14-017
- **Feature:** Alle generatoren
- **Reproduction:** elk contract (`a2_full_normal.pdf`): start/eind "September 11, 2026" (date-fns default `en`) naast contractdatum "10 september 2026" (nl-locale), duur "7 days", open einde "To be determined", prijs "€ 750,00" (`Intl` nl-NL) naast "€0.00" voor null/0 (hardcoded); het legacycontract voegt "Nederland" toe. Transportbrieven: "Type transport: Vehicle Swap" / "Tow" (en) naast "Aflevering", "Gepland", "Terughaling" (nl). Schadechecks: overlay "10/09/2026" (`toLocaleDateString('en-GB')`) naast "10-09-2026" (`dd-MM-yyyy`); `damage_check_templates.language` (`'nl'|'en'`) wordt door de generator **nooit gelezen** (C7: `language=en` gaf identieke uitvoer). De client-UI is i18n-vaardig (react-i18next), dus zelfs een Engelse UI produceert Nederlands/Engelse hybride PDF's.
- **Expected:** één locale per document, gestuurd door de taal van het sjabloon of van de klant.
- **Actual:** zoals boven.
- **Root cause:** `server/utils/pdf-generator.ts:846-850, 872-878, 1258-1270`; `server/pdf-damage-check-generator.ts:296, 410`; `server/routes.ts:6183-6186`.
- **Affected files:** `server/utils/pdf-generator.ts`, `server/pdf-damage-check-generator.ts`, `server/routes.ts`
- **Affected data:** elk gegenereerd document.
- **Security impact:** geen.
- **Business impact:** onprofessioneel ogende documenten; een Engelstalige klant krijgt half-Nederlandse papieren.
- **Fix proposal:** centrale formatters (datum/valuta/labels) die een locale aannemen; gebruik `template.language` (schadechecks) of `customer.preferred_language`. **Besluit voor de eigenaar:** welke bron is leidend.
- **Regression test:** snapshot van `prepareContractData` voor locale `nl` en `en`.

#### BUG-193 — De previewafbeelding van een PDF-achtergrond wordt op Windows nooit gegenereerd (en er worden twee canvas-implementaties gemengd)
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** P14-018
- **Feature:** Sjablooneditor — achtergrondpreview
- **Reproduction:** `p14-b-templates.cjs` B5: `POST /api/pdf-templates/12/background` met een PDF → 200, maar `backgroundPreviewPath: null`; serverlog: `⚠️ Failed to generate preview image: Error: Failed to convert PDF to PNG: Setting up fake worker failed: "Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'" at convertPdfToPng (server/utils/pdf-to-image.ts:103)`.
- **Expected:** previewPNG op élk platform; een mislukking wordt aan de editor gemeld (die toont nu een leeg canvas voor PDF-achtergronden).
- **Actual:** op Windows heeft élke PDF-achtergrond geen editorpreview; het sjabloon genereert verder wel gewoon. Daarnaast maakt `pdfjs-dist 5` zijn interne canvassen met `@napi-rs/canvas` terwijl `pdf-to-image.ts` in een context van het `canvas`-pakket rendert; in dit harnas gooide die combinatie "Image or Canvas expected" voor élke pagina met een afbeelding. Het app-pad wordt niet bereikt omdat de workerfout eerder komt — dit tweede punt is dus een codeleeswaarneming.
- **Root cause:** `server/utils/pdf-to-image.ts:7-8` (`workerSrc = path.join(...)` in plaats van `pathToFileURL(...).href`), `:1` (`import { createCanvas } from 'canvas'`).
- **Affected files:** `server/utils/pdf-to-image.ts`, `server/routes/pdf-templates.ts`
- **Affected data:** `pdf_templates.backgroundPreviewPath`.
- **Security impact:** geen.
- **Business impact:** sjabloonontwerpers kunnen op Windows niet zien waar hun velden ten opzichte van de achtergrond landen — wat het aanmaken van slechte sjablonen (BUG-177, BUG-191) in de hand werkt.
- **Fix proposal:** `GlobalWorkerOptions.workerSrc = pathToFileURL(...).href`; render met `@napi-rs/canvas` (of geef een `CanvasFactory` mee); geef de fout terug aan de client zodat de editor "geen preview" kan tonen.
- **Regression test:** upload in CI op Windows een tekst-PDF als achtergrond en assert dat `backgroundPreviewPath` gezet is en dat de PNG niet-witte pixels bevat.

#### BUG-194 — Validatiegaten op de PDF- en sjabloon-endpoints: geaccepteerde rommel en een verkeerde statuscode
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** P14-019 — *de helften ":id niet-numeriek → 500" en "rauwe Postgres-tekst in de body" vallen onder BUG-103 respectievelijk BUG-148/BUG-057 (herbevestigd, §6)*
- **Feature:** `POST /api/contracts/preview`, `generate-versioned`, `generate-report`, `PATCH /api/pdf-templates/:id`, `PATCH /api/transport-report-templates/:id`, `PATCH /api/barcode-label-templates/:id`
- **Reproduction:** `POST /api/contracts/preview` met `startDate "not-a-date"` of zonder datums → 500 `{"error":"Invalid time value"}`; met `vehicleId "abc"`/`{$gt:0}` → 500 met de gelekte Postgrestekst `invalid input syntax for type integer: "abc"` (idem `generate-versioned`); `POST generate-report` met `transportIds ["abc",60]` of `[{id:60}]` → 500, `templateId "abc"`/`{a:1}` → 500; `GET /api/interactive-damage-checks/abc/pdf` → 500; **`PATCH /api/pdf-templates/:id` met `fields "{oops"` of een string van 2 MB → 404 "Failed to update template"** (de DB-fout wordt ingeslikt en als "niet gevonden" gerapporteerd); `PATCH name ""` → 200 opgeslagen; `PATCH fields null` → 200 opgeslagen (generatie meldt daarna "No template fields"); `PATCH /api/transport-report-templates/:id fields "not json"` → 200 opgeslagen (élk rapport met dat sjabloon wordt blanco); `PATCH /api/barcode-label-templates/:id labelWidthMm -5, labelHeightMm 0, fields "garbage"` → 200.
- **Expected:** 400 met een melding voor elk van deze gevallen; geen drivertekst in de respons; `name` verplicht; `fields` moet een array zijn.
- **Actual:** zoals boven.
- **Root cause:** `routes.ts:5676-5765, 5798-5960, 7666-7700` (geen zod op de body), `:7213` (geen `isNaN`-controle), `routes/pdf-templates.ts:194-266` (geen schema, catch → 404), `report-and-label-templates.ts:116` en `:212` (jsonb accepteert elke JSON), `database-storage.ts:2401-2528` (geeft bij elke fout `undefined` terug).
- **Affected files:** `server/routes.ts`, `server/routes/pdf-templates.ts`, `server/routes/report-and-label-templates.ts`, `server/database-storage.ts`
- **Affected data:** sjabloonrijen met lege naam, `null` velden of niet-JSON `fields`.
- **Security impact:** informatielekkage van de databasestructuur via de foutteksten (BUG-148-familie).
- **Business impact:** een sjabloon dat "opgeslagen" lijkt maar élk rapport blanco maakt; een mislukte opslag die als "niet gevonden" wordt gerapporteerd, waardoor de gebruiker de verkeerde conclusie trekt.
- **Fix proposal:** zod-schema's per route (id's positieve integers, ISO-datums, `fields` een array van de editorvorm), een `parseIntParam`-middleware, en storagefouten correct naar 400/500 mappen.
- **Regression test:** tabelgedreven test van bovenstaande payloads die 400 verwacht en assert dat de body de substring "syntax for type" niet bevat.

#### BUG-195 — Een document waarvan het bestand verdwenen is blijft in elke lijst staan als normaal document
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (moet zo'n rij gemarkeerd, verborgen of opgeruimd worden — en door een achtergrondtaak of handmatig?) · **Bron:** F15-003
- **Feature:** Documenten/bonnen serveren
- **Reproduction:** (1) Upload een document (id 321) en verwijder daarna zijn bestand handmatig van schijf. (2) `GET /api/documents/view/321` → **404** "Document file not found on disk"; `GET /api/documents/download/321` → 404. (3) `GET /api/documents/321` → **200** (de rij geldt nog steeds als een geldig document) en hij staat gewoon in `GET /api/documents` en in de lijsten per voertuig/reservering. Script `p15-a-docs.cjs` (`missingFile: viewStatus 404, rowStillExists true`).
- **Expected:** een document waarvan het onderliggende bestand weg is wordt gemarkeerd (bijv. een "bestand ontbreekt"-status) of gereconcilieerd, zodat de UI het niet als een normaal, openbaar document presenteert.
- **Actual:** de rij wordt nooit gemarkeerd of opgeruimd; elke lijst blijft een document aanbieden dat bij openen 404 geeft. Hetzelfde patroon op `GET /api/expenses/:id/receipt`, `GET /api/drivers/:id/license` en `GET /api/fines/:id/letter` (alle 404 zonder de rij aan te raken).
- **Root cause:** de view-/downloadhandlers (`server/routes.ts:5147, 5201`) geven 404 bij een ontbrekend bestand maar werken `documents` nooit bij; er bestaat geen reconciliatietaak. Complementair aan BUG-150 (het omgekeerde: bestanden blijven staan nadat de rij verwijderd is).
- **Affected files:** `server/routes.ts:5111-5217`, `server/routes/expenses.ts:161-186`, `server/routes.ts:6512-6540`, `server/routes/fines.ts`
- **Affected data:** `documents`/`expenses`/`drivers`/`fines`-rijen met een inmiddels ontbrekend bestand.
- **Security impact:** geen.
- **Business impact:** gebruikers klikken herhaaldelijk op documenten die zonder uitleg niet openen; de datakwaliteit drift stil weg (verouderde verwijzingen stapelen op).
- **Fix proposal:** markeer de rij bij een 404-op-schijf (nullable `file_missing_at`/status) zodat de UI het kan tonen, of lever een beheerdersreconciliatietaak; op zijn minst een duidelijker melding. **Besluit voor de eigenaar:** markeren, verbergen of opruimen — en dit is een migratie (extra kolom), zie §7.2.
- **Regression test:** upload, verwijder het bestand, assert dat de lijst het document als ontbrekend markeert en niet als een normaal te openen document.

#### BUG-196 — Kapotte "Openen in de app"-deeplink in staff-meldingen en een verminkt euroteken in boetemail
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** E16-006
- **Feature:** Staff-meldingslinks en de boete-gekoppeld-mail
- **Reproduction:** `p16-b2-portal.cjs` B10a/B11a: de link wordt `/portal-admin?requestY8` respectievelijk ``/portal-admin?request`0`` — het aanvraag-id wordt zonder scheidingsteken of parameternaam achter `?request` geplakt, wat een niet-klikbare/onjuiste deeplink oplevert. `p16-b3-fine.cjs` B12b: de body bevat `â¬ 42.50` — het euroteken wordt als Latin-1-interpretatie van UTF-8-bytes weergegeven.
- **Expected:** een werkende "Openen in de app"-link (`?request=<id>`) en een correct gecodeerd euroteken.
- **Actual:** zoals boven.
- **Root cause:** linkopbouw voor de **staff**-gebeurtenis (`server/services/portal-notifications.ts` / de aanroeper die `event.link` doorgeeft) en een charset-mismatch in de opbouw van de boetemailbody (`server/services/portal-mail.ts:171-188` / de transportencoding). De exacte linkbron is in deze ronde niet vastgepind.
- **Affected files:** `server/services/portal-notifications.ts`, `server/services/portal-mail.ts`
- **Affected data:** geen; cosmetisch/gebruiksgemak.
- **Security impact:** geen.
- **Business impact:** kapotte staff-deeplinks; onprofessionele eurorendering in klantmail over boetes.
- **Fix proposal:** bouw de deeplink met een expliciete parameter (`?request=<id>`); zet een UTF-8-charset/encoding op de boetemail.
- **Regression test:** assert dat de staff-link matcht met `/portal-admin?request=<id>` en dat de boetebody `€` bevat.

---

## 6. Herbevestigde bestaande bugs (nieuwe evidence, geen nieuw nummer)

**Twee ontkrachtingen — voorstel tot severityverlaging (zonder hernummering):**

- **BUG-076** (path traversal bij schrijven in `POST /api/backups/upload` via `originalname`, nu **MEDIUM**) — het statische gat is echt (`originalname` wordt zonder `sanitizeFilename` in `newFilename` geconcateneerd), **maar runtime is het niet uitbuitbaar via de HTTP-laag**: `busboy` reduceert `originalname` tot de basename, voor zowel `/` als `\`. Live geverifieerd: `../../audit-uploads/x.sql` én `..\..\..\audit-uploads\x.sql` belandden allebei in `backups/` als `uploaded-database-<ts>-x.sql`; **geen van beide ontsnapte**. Evidence: `p15-b-endpoints.cjs`, `p15-c-traversal.cjs`. **Voorstel: verlagen naar LOW** (defensieve fix blijft gewenst — de bescherming komt nu van een bibliotheekdetail van deze multer/busboy-versie, niet van de eigen code).
- **BUG-097** (de bestandsnaamfilter van de backup-routes mist de backslash, **LOW**) — bevestigd **niet uitbuitbaar**: `GET /api/backups/download/:filename` weigert élke naam met `..` (400 "Invalid filename") vóórdat het backslashgat er iets toe doet; alle drie de traversalcoderingen (`..%2f..%2fpackage.json`, `..\..\package.json`, `....//package.json`) gaven 400. **Voorstel: laten staan op LOW en afwaarderen tot hardeningpunt** (blacklist → `path.basename()`-vergelijking), niet als openstaand lek behandelen.

**Overige herbevestigingen:**

- **BUG-006** (dubbele boeking, CRITICAL) — `p13-05-dblclick.cjs`: een dubbelklik op `POST /api/reservations` (zelfde body, 15 ms ertussen) gaf 201/409 met 1 rij (deze twee vuurden ver genoeg uit elkaar om te serialiseren; de echte 20-weg-race staat nog steeds zoals oorspronkelijk bewezen). Nieuw: het **bewerkpad** heeft dezelfde niet-vergrendelde controle → **BUG-159**.
- **BUG-010** (`GET /api/settings` lekt het onversleutelde SMTP-wachtwoord) — fase 16 A9: `GET /api/settings` → 200 met `AUDIT-p16-smtp-secret` in de body (`settingsHasPw:true`); `GET /api/app-settings/email` geeft het wachtwoord óók in cleartext (`appSettingsEmailPw:["AUDIT-p16-smtp-secret"]`). **Nuance die het bronrapport aanscherpt:** het lijst-endpoint `GET /api/app-settings` **redacteert** het wél naar `""` (`appSettingsPw:""`), dus het lek zit specifiek in `/api/settings` én in `/api/app-settings/:category`. En `/api/settings` hangt op `MANAGE_BACKUPS` (`server/routes/settings.ts:15`) — een ándere permissie dan het beheren van instellingen, wat de blootstelling breder maakt dan de titel van BUG-010 suggereert.
- **BUG-012** (documenten zonder path containment) — bevestigd aanwezig: view/download/delete bouwen alle `path.join(cwd, filePath)` / `unlinkSync` zonder containment; niet opnieuw uitgebuit (er is vandaag geen route waarmee een client `filePath` kan zetten, per SEC-023). Gecitéérd.
- **BUG-025** (settings-writes zonder validatie) — fase 16 A5: poorten `abc`/`0`/`-1`/`99999`, een kale string als waarde en `fromEmail:"not an address"` werden alle door `POST /api/app-settings` (`app-settings.ts:333`) opgeslagen zonder schemacontrole; het faalt pas op het moment van verzenden.
- **BUG-026 / BUG-085** (`/uploads` statisch negeert `UPLOADS_DIR`) — fase 15: `GET /uploads/<willekeurig ontbrekend pad>` geeft **200 met de SPA-HTML-shell** (dev), en de mount is hardcoded op `cwd/uploads` terwijl de app naar `UPLOADS_DIR` schrijft; alle bestanden van deze fase staan onder `audit-uploads` en worden dus door de statische mount niet geserveerd.
- **BUG-027** (N documentrijen op één fysiek bestand) — fase 14: **16** `Contract (Unsigned)`-rijen voor reservering 3466 wijzen alle naar `contracts/AU140X/AU140X_contract_20260910.pdf`; de inhoud is die van de láátste call — inclusief de tekstversie van BUG-163 die het geldige contract van AU14BX overschreef. Nieuw: 5 parallelle calls (A10) leverden dubbele versielabels op; die racende nummering is apart gefiled als **BUG-190**, de uploadvariant als **BUG-184**.
- **BUG-028** (standaardsjabloon zonder velden → blanco contracten) — standaardsjabloon id 2 "gffg" heeft nog steeds `[]`; de contracten uit A1/A5 bevatten nul tekstitems (alleen de barcode-afbeelding) — en de legacy-fallback die tenminste nog data zou afdrukken is zelf stuk (BUG-164).
- **BUG-029** (transportrapport onbereikbaar) — élk van de 12 `transport_report`-rijen die deze fase zijn aangemaakt (432-441, 446) geeft 404 op `GET /api/documents/download/:id`, terwijl het bestand onder `audit-uploads/reports/` staat.
- **BUG-030** (geweigerde upload → 500 met stack trace) — fase 15 reproduceerde dit met **twee nieuwe varianten**: (a) een geweigerde gevaarlijke extensie (`AUDIT-x.exe`) en (b) het multer-`LIMIT_FILE_SIZE`-pad (60 MB `huge.pdf` naar `POST /api/documents` én naar `POST /api/pdf-templates/:id/background`) geven beide **HTTP 500** `{"error":"Server Error","message":"File too large","stack":"MulterError: File too large ...\\node_modules\\multer\\..."}` met absolute lokale paden in de body.
- **BUG-032** (`assign-spare` tweemaal → twee actieve vervangers) — uitgebreid door **BUG-160**: dezelfde niet-vergrendelde controle boekt één spare dubbel over twee verhuringen én over twee transporten. Test 3e laat bovendien zien dat de placeholder-dedupeguard óók raced: 3× parallel `POST /api/placeholder-reservations` → 3 placeholders + 3 meldingen voor één verhuring.
- **BUG-038** (rauwe DB-fout bij een dubbel contractnummer) — `p13-01-edit.cjs` 11b: 3 parallelle pickups met hetzelfde voorgestelde contractnummer → 1×200 en 2×400 met de rauwe melding `duplicate key value violates unique constraint "reservations_contract_number_unique"`. En 11a toont dat `GET /api/settings/next-contract-number` aan 10 gelijktijdige aanroepers **hetzelfde** nummer (`999999`) teruggeeft — de suggestie wordt nooit gereserveerd, wat de botsing routine maakt.
- **BUG-048** (sjablonen accepteren malformede `fields`) — sjabloon 10 met `'just-a-string'`, `42`, `null`, negatieve/NaN-coördinaten en `fontSize 500` werd met 201 geaccepteerd; het zichtbare gevolg staat in **BUG-191**.
- **BUG-050** (sjabloon verwijderen laat achtergrondbestanden staan) — na `DELETE /api/pdf-templates/12` staat `audit-uploads/templates/template_12_background.pdf` (de achtergrond mét JavaScript) nog op schijf; bibliotheekbestanden verdwijnen alleen in de database via cascade.
- **BUG-057 / BUG-103 / BUG-148** (rauwe foutobjecten en niet-numerieke `:id`) — fase 14 (BUG-194) levert nieuwe voorbeelden: `vehicleId "abc"` → 500 met Postgrestekst in de body; `GET /api/interactive-damage-checks/abc/pdf` → 500 (NaN naar Postgres).
- **BUG-060 / BUG-003** (ongeauthenticeerde expenses-routes + arbitrary read via `receiptFilePath`) — door inspectie bevestigd nog steeds aanwezig (`POST /api/expenses/with-receipt`, beide PATCH-varianten en `GET /api/expenses/:id/receipt` dragen geen auth-middleware; `insertExpenseSchema` houdt `receiptFilePath`); niet opnieuw uitgebuit.
- **BUG-066** (`vehicle-diagram-templates` met alleen `requireAuth`) — de beperkte gebruiker kreeg `GET /api/vehicle-diagram-templates` → 200 (362 B).
- **BUG-070** (arbitrary file delete via `backgroundPath`/`diagramPath`) — niet opnieuw uitgevoerd (destructief); de `PATCH` van een transportsjabloon met `backgroundPath: "../../.env"` werd alleen geweigerd omdat `createdAt` in dezelfde body op zod stuk liep — het pad zelf wordt **niet** gevalideerd.
- **BUG-077** (SSRF/portscan-orakel via de SMTP-testroute) — fase 16 A10: `POST /api/app-settings/email/test` neemt host en poort uit de body (`app-settings.ts:311-323`) en geeft onderscheidende uitkomsten terug — `auth535` → "basic authentication is disabled", niet-numerieke poort → "timed out", `drop` → "unexpected error", `ok` → "successful" — een timing-/meldingsorakel om interne hosts mee af te tasten.
- **BUG-080** (TLS-certificaatvalidatie uitgeschakeld) — aanwezig op zowel de gepoolde verzendtransporter (`email-service.ts:262`) als de testtransporter (`:217`).
- **BUG-081** (geauthenticeerde mail relay) — fase 16 A0/A2a: personeel kan naar elke komma-gescheiden ontvangerslijst versturen met een echte contract-PDF als bijlage en rauwe `<p>message</p>`-HTML. **Nieuw:** A2d — een `recipients`-waarde met `\r\nBcc: y@example.invalid` liet nodemailer `y@example.invalid` als **echte envelope-RCPT** toevoegen (verborgen ontvanger), terwijl de geïnjecteerde `Subject`-CRLF wél werd gevouwen/geneutraliseerd.
- **BUG-086** (de ingress-sanitizer raakt multipart niet) — niet opnieuw uitgevoerd; **BUG-187** toont een tweede, onafhankelijke route naar hetzelfde effect (geen output-escaping in `renderTemplate`), waardoor een fix op alleen de sanitizer onvoldoende is.
- **BUG-090** (`DELETE /api/reservations/:id` check-then-act → 500) — niet opnieuw als 500 getriggerd; de gelijktijdige deletes van deze fase betroffen een **voertuig** en leverden het nieuwe **BUG-188** op. Gecitéérd, niet opnieuw gefiled.
- **BUG-091** (wachtwoordwijziging trekt andere sessies niet in) — `p13-07-tabs.cjs` 9c/9d: na een wachtwoordwijziging blijft tabblad B geldig; en `active=false` zetten op een live gebruiker laat die sessie gewoon lezen én schrijven (`/api/user` 200, PATCH 200) tot hij opnieuw inlogt (verse login → 403). Nieuwe evidence, geen nieuw nummer; de race binnen de wijziging zelf is **BUG-189**.
- **BUG-092** (portaal-`forgot` heeft geen effectieve rate limit) — `server/portal-auth.ts:373` mount `loginLimiter` op `/api/portal/forgot`, maar die limiter is `{max:5, skipSuccessfulRequests:true}` (`rateLimiter.ts:28`) en forgot antwoordt **altijd** 200 `{ok:true}` — elke request telt dus als "geslaagd" en wordt overgeslagen, waardoor de limiter een no-op is. In de hele B-serie is nergens een 429 waargenomen.
- **BUG-095** (uitloggen ruimt `active_sessions` niet op) — `p13-06-rapid.cjs` 8b3: 5 gelijktijdige logins maakten 5 `active_sessions`-rijen voor één gebruiker; er is geen sessiecap.
- **BUG-100** (`fromName` rauw in een mailheader) — fase 16 A5: opgeslagen `AUDIT "P16"\r\nX-Inj: 1` belandde in de From-header als `"AUDITP16 X-Inj: 1" <…>`; nodemailer strippte de CRLF (dus geen geïnjecteerde header), maar de aanhalingstekens/inhoud gaan ongeëscaped door de weergavenaam (`email-service.ts:277`).
- **BUG-119** (contractroutes blanco voor TBD-placeholder/onderhoudsblok) — niet opnieuw getest; genoteerd dat de transportzijde TBD-transporten **wél** weigert (400).
- **BUG-122** (gelijktijdige voertuig-`PATCH` verliest updates) — `p13-02-lifecycle.cjs` 5c: twee parallelle `PATCH /api/vehicles/:id` met verschillende velden → laatste schrijver wint (read-merge-write). De pickup-versus-PATCH-variant reproduceerde opnieuw **niet** (0 verloren in 8 timings, 5a) — consistent met de notitie uit fase 9.
- **BUG-131** (pickup-/returndatums in bestandsnamen), **BUG-098** (symlink volgen), **BUG-073** (DOM-XSS via `licenseFilePath`), **BUG-150** (bestanden blijven na een rij-delete), **BUG-088** (by-vehicle-route overschaduwd) — alle door codeinspectie nog aanwezig; gecitéérd, buiten de dynamische scope van deze fases.
- **BUG-141** (twee gelijktijdige portaalgoedkeuringen) — de staff-analoog is vers gefiled als **BUG-173**.
- **BUG-142** (`POST /api/transports` laat na een 409 een weestransport achter) — `p13-03-spare.cjs` 3d-controle: het sequentiële derde transport geeft 409 maar laat een transportrij staan (`transportsNow` ging naar 3). Herbevestigd.
- **BUG-153** (dagtelling) — `prepareContractData` gebruikt nog steeds `Math.ceil(abs(end-start)/dag)` → "7 days" voor 11..18 september; `rentalDays` op schadechecks gebruikt dezelfde formule in drie kopieën (`routes.ts:6181, 6737, 6948`) plus `endDate ? … : 0` op `:7261` — **vier** kopieën van de dagentelling.
- **BUG-155** (portaalmail wordt nooit gelogd, mislukkingen onzichtbaar) — bevestigd over de hele B-serie: `email_logs` bleef op `10` staan na uitnodiging, reset, forgot, nieuw apparaat, e-mailwijziging, boete-koppeling, aanvraagantwoord, onderhoud en staffmelding — én na élke SMTP-535-mislukking (B4, B8b, B10c, B11c, B12c). Portaalaanroepers gooien de boolean van `sendEmail` weg, dus de klant/medewerker krijgt 200 met de database volledig gecommit terwijl er geen mail uitging en niets is vastgelegd.
- **BUG-156** (onbekend `templateId` → standaardlayout) — `templateId=999999`/`-1` → legacygenerator (de uitvoer van BUG-164); `templateId=abc` → `parseInt` NaN → behandeld als "geen templateId" → standaardsjabloon (blanco). De drie ándere fallbackgevallen zijn apart gefiled als **BUG-181**.

**Niet opnieuw getest in deze fases:** BUG-002/DM-001 (portaal-proceskill — bewust niet getriggerd), BUG-069 (tar-over-cwd restore — destructief), BUG-070 (arbitrary delete — destructief), BUG-086, BUG-088, BUG-119, BUG-131.

---

## 7. Voorgestelde wijzigingen die goedkeuring vereisen

Niets hiervan is uitgevoerd. Dit zijn **voorstellen**; ze wijzigen bedrijfsregels, architectuur of de
gegevensstructuur en horen als OPT-voorstel voorgelegd te worden.

### 7.1 Bedrijfsregels en procesbesluiten (de negen B-bugs)

| Bug | Te nemen besluit |
|---|---|
| BUG-163 | Mag contractgeneratie **hard falen** (500, geen document) wanneer er geen bruikbaar sjabloon of geen renderbare inhoud is, in plaats van een onbruikbaar bestand te archiveren? |
| BUG-167 | Welke permissie hoort op contract- en schadecheckgeneratie, -preview en -inzage? En mag genereren dat een `documents`-rij **wegschrijft** achter dezelfde permissie zitten als alleen lezen? |
| BUG-170 | Wie hoort een APK-/onderhouds-/custom-herinnering te ontvangen: alleen de klant die de auto vandaag onder zich heeft, of ook toekomstige en vorige huurders? |
| BUG-178 | Welke maximale lengtes gelden voor klantnaam, adres, plaats, merk/model en notities (voorstel: naam 200, adres 300, notities 5000), en wat gebeurt er met bestaande te lange waarden — afbreken op papier of afkappen bij invoer? |
| BUG-181 | Wat gebeurt er wanneer er geen standaardsjabloon is: weigeren met een duidelijke fout, of automatisch een ander sjabloon promoveren? En mag een standaardsjabloon überhaupt verwijderd worden? |
| BUG-182 | Blijft "concept-contract genereren vóór het opslaan van de reservering" een ondersteunde workflow? Zo ja, hoe wordt zo'n document herkenbaar gearchiveerd (eigen documenttype, notitie, of helemaal niet opslaan)? |
| BUG-183 | Welke reservering hoort op een schadecheck die vanaf de voertuigpagina wordt gemaakt terwijl er vandaag geen verhuring loopt: geen enkele, of de eerstvolgende met een expliciet label? |
| BUG-192 | Welke taal en welk datum-/valutaformaat zijn leidend per document, en waar komt die keuze vandaan: de taal van het sjabloon, de voorkeurstaal van de klant, of een systeeminstelling? |
| BUG-195 | Wat moet er gebeuren met een document waarvan het bestand ontbreekt: markeren in de lijst, verbergen, of periodiek opruimen? En wie mag die reconciliatie draaien? |

### 7.2 Consolidatie van de PDF-generatoren (voorstel uit fase 14 §2)

Dit is een **refactoring** die niet in deze audit is gestart. Voorgestelde volgorde:

1. **Eén gedeelde `renderPositionedFields(page, fields, values, fonts, {origin, padding})`** voor contract
   én transport, met één coördinatenformule en één tekstsanitizer — of, beter, een via
   `@pdf-lib/fontkit` ingebed Unicode-font zodat sanitatie overbodig wordt (lost BUG-162 en de drie
   uiteenlopende baselineformules op).
2. **Verwijder G2 (`generateRentalContract`), G3 (`generateFallbackContract`) en de dode G4
   (`generateInteractiveDamageCheckPDF`)**; laat de routes 500 geven wanneer er niets te renderen valt
   in plaats van een tekstbestand te archiveren (BUG-163, BUG-164). Wil men een "hardcoded
   standaardlayout" behouden, druk die dan uit als een geseede `pdf_templates`-rij.
3. **Eén `resolveDamageCheckTemplate(vehicle)`** voor alle zes de aanroepers en **één
   `buildDamageCheckReservationData(reservation)`** in plaats van vier inline kopieën (BUG-166,
   BUG-181, BUG-183, en het vierde exemplaar van de dagentelling van BUG-153).
4. **Eén `registerGeneratedDocument({buffer, kind, reservation, vehicle})`** die de mapconventie, de
   versienummering (met een DB-garantie in plaats van een racende lezing) en de `documents`-insert
   bezit — vervangt de vijf contract- en vier schadecheck-opslagblokken en lost BUG-027, BUG-165,
   BUG-184 en BUG-190 in één keer op.
5. **Eén `saveTemplateBackground(kind, id, file)`** in plaats van drie kopieën van dezelfde
   multer-route, met extensie- én contenttypecontrole en met een PDF-inhoudspolicy (BUG-179, BUG-180).
6. **Eén gedeelde `formatLicensePlate`** (nu vier identieke kopieën) en één set locale-bewuste
   formatters voor datum, valuta en labels (BUG-192).

### 7.3 Mailwachtrij, retry en logging (voorstel uit fase 16)

De huidige opzet verstuurt synchroon binnen het HTTP-verzoek, zonder timeout, zonder retry, zonder
idempotentie en — op 10 van de 13 paden — zonder enige registratie. Voorgesteld ontwerp:

1. **Timeouts op de gepoolde transporter** (`connectionTimeout`/`greetingTimeout`/`socketTimeout`, bijv.
   10 s) als **eerste, kleinste stap** — dit alleen al haalt de "hangt onbepaald"-klasse weg (BUG-171).
2. **Een persistente wachtrij**: de route zet een rij in `email_outbox` en geeft direct terug; een worker
   verstuurt met exponentiële backoff en een dead-letterstatus. Daarmee verdwijnt de koppeling tussen
   "de mailserver is traag" en "de gebruiker wacht" volledig.
3. **Idempotentiesleutel per (route, payload-hash, korte TTL)** zodat een dubbelklik of een retry één
   bezorging oplevert (BUG-185).
4. **`email_logs` voor élk pad**, inclusief de acht portaalpaden en beide documentpaden, incrementeel
   geschreven (of in een `finally`) zodat een vastgelopen bulkrun zichtbaar blijft (BUG-185, BUG-155).
5. **Per-doel gescheiden pools of een hogere `maxConnections`**, zodat transactionele mail
   (wachtwoordherstel, uitnodigingen) nooit achter een bulkrun of een vastzittende verbinding komt te
   staan (BUG-171).
6. **Escaping in `renderTemplate`** als vaste stap in het verzendpad, niet per template (BUG-187).

### 7.4 Idempotentie en optimistic locking (voorstel uit fase 13)

De client beschermt per tabblad en per knop; de server beschermt nergens. Voorgesteld:

1. **Optimistic concurrency op `updatedAt`** voor `reservations`, `settings` en `pdf_templates`: de
   client stuurt de gelezen `updatedAt` mee, de server weigert met 409 zodra die verschoven is
   (BUG-172, BUG-175). Dit vereist een aanpassing aan de client-formulieren en is dus geen puur
   serverzijdige fix.
2. **Een `Idempotency-Key`-header** op de create-/actie-endpoints (pickup, return, assign-spare,
   maintenance-with-spare, transport-create, documentgeneratie, mailverzending), met een korte
   bewaartabel die een herhaald verzoek hetzelfde antwoord geeft in plaats van een tweede rij (BUG-173,
   BUG-174, BUG-190, BUG-185).
3. **Conditionele statusovergangen** (`UPDATE … WHERE id=$1 AND status='booked' RETURNING *`) in plaats
   van lezen-controleren-schrijven, op élke levenscyclusroute (BUG-174).
4. **`SELECT … FOR UPDATE` of een advisory lock op `vehicleId`** rond conflictcontrole + insert/update
   voor boekingen en vervangers — of, structureler, een **Postgres exclusion constraint** op
   (`vehicle_id`, periode) voor actieve reserveringen, die BUG-006, BUG-106, BUG-107, BUG-159 en
   BUG-160 in één slag onmogelijk maakt. Dit is een **migratie** en vereist eerst een meting en
   opschoning van de bestaande overlappende rijen in productie (zie fase 12, §7.2 van
   `05-phase-9-12-rapport.md`).
5. **Een atomaire teller voor de accountlockout** (`INSERT … RETURNING` + telling binnen dezelfde
   transactie, of een aparte counterstore) zodat de "5 pogingen"-garantie ook onder concurrency geldt
   (BUG-161).
6. **Een extra kolom voor "bestand ontbreekt"** op `documents` (BUG-195) — migratie, dus onderdeel van
   het besluit in §7.1.

---

## 8. Niet gedekt

**Buiten scope van deze vier fases (per instructie of elders belegd)**
- Back-up/restore en de atomiciteit daarvan (fase 17), Socket.IO/realtime (`socket.md`), de volledige
  autorisatiematrix (fase 6-8). De database `lvstest` en poort 5000 zijn nooit aangeraakt.
- Portaalzijdige documentgeneratie: die bestaat niet — het portaal serveert alleen bestaande
  `documents`-rijen.

**Niet uitgevoerd wegens gedeelde infrastructuur of destructiviteit**
- **Portaal `POST /api/portal/requests` met misvormde `payload`** (BUG-002/DM-001): sloopt het
  serverproces voor elke gelijktijdige auditagent. Bewust niet getriggerd.
- **Backup-restore (`restore-data`/`restore-code`/`restore-files`)**: BUG-069 is een destructieve
  tar-over-cwd-primitief.
- **`BUG-070` arbitrary file delete** en het verwijderen van het legacy contractsjabloon uit
  `process.cwd()/uploads` (dat bestand hoort bij de dev-server op poort 5000).
- **Bursts groter dan 30 requests** en **`page ≥ 100 000` / 100 000 contractvelden**: de gedeelde server
  lag na de 40 000-paginarun al ~45 s stil.

**Niet meetbaar in dit harnas**
- **Echte TLS/poort 465**: de SMTP-stub spreekt geen TLS, dus `smtpSecure:true` over een werkelijk
  versleuteld kanaal is niet uitgeoefend.
- **Werkelijke mailbezorging, providerlimieten en abuse-detectie** (BUG-081).
- **Client-side printuitvoer** (sleutellabels, barcodeboek, kalender- en rapportprint): HTML +
  `window.print()`.
- **Visuele overlap tussen lange waarden en de voorgedrukte vectorvorm** van het standaardcontract:
  pdfjs levert tekstboxen, geen vectorvormen. "Geen overlap" is dus **niet verifieerbaar** verder dan de
  paginarandcontrole.
- **Een echte reverse proxy die `X-Forwarded-For` strip**: deze machine heeft er geen; de lockout-race
  is met gespoofte IP's aangetoond.
- **Replit-object-storage-achtergronden**: de sidecar is onbereikbaar (al gedekt als DM-013).

**Afgekapt in plaats van uitgedraaid**
- De SMTP-modi `unroutable`, `drop` en `hang-ehlo` zijn op 20-45 s afgekapt in plaats van doorgedraaid
  tot nodemailers volledige ~2 min connectTimeout; de conclusie "hangt onbepaald" volgt uit het bereiken
  van de cap met een nog open socket.
- De herkomst van de `email_logs`-rij uit C4 is beredeneerd, niet bewezen (het rij-id is niet
  vastgelegd).

**Openstaande meetvragen (eerst in productie beantwoorden)**
- Hoeveel `documents`-rijen wijzen daar naar een ontbrekend bestand, en hoeveel bestanden hebben geen
  rij (BUG-165, BUG-195)?
- Hoeveel contract-`documents`-rijen delen daar één `file_path` (BUG-027, BUG-184)?
- Werkt `GET /api/drivers/:id/license` in productie überhaupt, of geeft hij daar — zoals verwacht — 403
  op élk rijbewijs (BUG-169)?
- Naar hoeveel klanten is een APK-herinnering per voertuig werkelijk gegaan (BUG-170)?
- Staat `smtpSecure` daar aan terwijl er over een niet-465-poort wordt verstuurd (BUG-186)?

---

In deze fases is **geen applicatiecode gewijzigd**, is er **niets gecommit**, is de applicatie **niet in
productie gedraaid** en is er **geen enkele grootschalige refactoring gestart** — de consolidatie van de
PDF-generatoren, het mailwachtrij-ontwerp en het idempotentie-/lockingvoorstel in §7 zijn uitsluitend
voorstellen. Alle waarnemingen komen van de auditserver `:5001` tegen de database `lvs_audit`; alle
SMTP-verkeer liep naar een lokale stub op `127.0.0.1:2525` en de mailinstellingen zijn na afloop
teruggezet naar de snapshot van vóór de fase. De aangemaakte fixtures dragen de prefix `AUDIT-` /
kentekens `AU-…-X` en zijn bewust blijven staan als bewijsmateriaal.

HARD STOP — STOP POINT 6

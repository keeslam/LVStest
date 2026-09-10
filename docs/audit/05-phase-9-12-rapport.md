# Fase 9–12 — geconsolideerd rapport (voertuigen, reserveringen, transport/vervangers, database-integriteit)

2026-09-10 · branch `feat/customer-portal` · audit-server `http://localhost:5001` (dev/tsx) · database
`lvs_audit`. Samengevoegd uit `docs/audit/wip/p9-vehicles.md` (V9-001…016),
`docs/audit/wip/p10-reservations.md` (R10-001…018), `docs/audit/wip/p11-transport-spare.md`
(T11-001…017) en `docs/audit/wip/p12-db-integrity.md` (D12-001…013). Bestaande bevindingen uit
`docs/audit/03-phase-3-5-rapport.md` (BUG-001…059) en `docs/audit/04-phase-6-8-security-report.md`
(BUG-060…105) worden **gerefereerd, niet herhaald**. Er is geen applicatiecode gewijzigd, niets
gecommit en de applicatie is niet in productie gedraaid.

## Context van de database — lees dit vóór elk getal

`lvs_audit` is een **kloon van de DEV-database `lvstest`**, niet van productie. Alles wat hieronder
"pre-existing" heet, betekent: **de rij stond al in de dev-kloon voordat een auditagent hem aanraakte**
(`created_at < 2026-09-09`). Dat is iets anders dan "staat ook in productie". De dev-database is
jarenlang gebruikt voor handmatige tests, seeds, imports en — zoals BUG-145 aantoont — voor de
geautomatiseerde testsuite. Daardoor geldt:

- **Codefouten** (alles wat met een request tegen `:5001` is bewezen) gelden onverkort voor productie:
  dezelfde code draait daar.
- **Datavondsten** ("50 dubbele boekingen", "358 picked_up-verhuringen over hun einddatum", "262
  weesreserveringen") zijn vondsten **in de dev-kloon**. Ze bewijzen dát de code zulke rijen kan
  produceren, maar de aantallen zeggen niets over productie. **Elk pre-existing datapunt moet eerst in
  de productiedatabase opnieuw gemeten worden voordat het als productieprobleem behandeld wordt.**
- De 258 weesonderhoudsblokken op voertuig-id's 1022–1657 zijn aantoonbaar **geen productiedata maar
  testsuite-afval** (BUG-145). Ze zijn hieronder overal apart geannoteerd.

Voor de audit zijn nieuwe fixtures aangemaakt met de prefix `AUDIT-` / kentekens `AU-…-X`; die rijen
zijn met "audit" gelabeld en zijn per definitie geen productiesignaal.

```text
DATABASE REPORT

Integrity problems: 14 referentiekolommen zonder FK (van 82 integer-referentiekolommen), waaronder
  reservations.vehicle_id, reservations.customer_id, documents.vehicle_id/reservation_id en
  expenses.vehicle_id (NOT NULL); 6 status/enum-kolommen bevatten waarden buiten hun enum
  (reservations.status 278 live rijen / 248 pre-existing; vehicles.availability_status 44 / 33
  pre-existing); 3 contractnummers vallen samen na het strippen van voorloopnullen (pre-existing);
  4 reserveringen met niet-ISO-datums (3 pre-existing) en 5 met end_date < start_date (audit).
Orphaned records: 262 live reserveringen op niet-bestaande voertuigen — waarvan 258 onderhoudsblokken
  met status 'active' aantoonbaar door de vitest-suite zijn geschreven (BUG-145), dus **4 echte
  weesreserveringen** blijven over; 55 ongelezen spare_assignment-meldingen die naar verwijderde
  placeholders wijzen (51 pre-existing); 15 documenten op soft-deleted reserveringen (5 pre-existing);
  2 reserveringen + 1 kostenpost + 1 document op niet-bestaande id's (alle audit); 176 active_sessions
  waarvan 171 zonder session-store-rij (55 pre-existing); 597 audit_logs-rijen op verdwenen resources
  (540 pre-existing, verwacht bij hard deletes).
Duplicates: 50 pre-existing echte dubbele-boekingsparen op 46 voertuigen (+187 auditparen op 8
  voertuigen, waarvan 171 uit één racetest); 160 overlappende live onderhoudsblokparen (146
  pre-existing) waarvan **157 op voertuigen die niet bestaan** — vrijwel geheel hetzelfde
  testsuite-afval als BUG-145 — inclusief 28 exact-duplicaatgroepen; 9 file_path-groepen met meerdere
  documentrijen op één fysiek bestand (20 extra rijen, 3 groepen pre-existing); 2 genormaliseerde
  kentekengroepen, 3 klant-e-mail/naamgroepen, 1 debiteurnummer (alle audit); 2 originelen met 2 live
  vervangers; 1 boetepaar op kenteken + overtredingsmoment (id 17/73).
Transaction problems: 9 workflows met meerdere schrijfacties zonder db.transaction (pickup, return,
  maintenance-with-spare, portaalgoedkeuring, transport-create (insert buiten de tx), placeholder
  assign, delete-cascade van een reservering, klant verwijderen (geen snapshot), bulk import (per rij,
  by design)); 4 workflows zijn wél transactioneel (voertuig verwijderen, restore, applyTransportUpdate,
  chauffeurstoewijzing).
Rollback problems: 3 bewezen halve schrijfacties — pickup laat de reservering 'picked_up' met een
  verbrand contractnummer achter en geeft toch 400 (BUG-120); POST /api/transports laat na een 409 een
  weestransport achter (BUG-142); twee gelijktijdige portaalgoedkeuringen maken twee blokken, twee
  antwoorden en twee meldingen (BUG-141). Voertuig verwijderen/herstellen is wél atomair, maar de
  snapshot mist 5 koppelingstypen, dus de restore verliest ze stil (BUG-110). Waar een transactie
  bestaat, rolt hij correct terug (tests a1, j2).
State inconsistencies: 358 'picked_up' verhuringen over hun einddatum (357 pre-existing; 344 zonder
  actual_pickup_date); 130 'picked_up' verhuringen met een startdatum in de toekomst (126 pre-existing);
  336 'booked' verhuringen > 30 dagen over hun startdatum (335 pre-existing); 62 voertuigen met een live
  picked_up-verhuur maar availability != 'rented'; 8 voertuigen 'rented' zonder picked_up-verhuur (6
  pre-existing); 3 verlopen niet-toegewezen placeholders (2 pre-existing); 3 loshangende vervangers (1
  pre-existing); 2 in_service-voertuigen zonder live blok (audit); 3 transporten 'scheduled' > 7 dagen
  in het verleden (pre-existing); 139 wees-'active'-blokken die nog in het toekomstige kalendervenster
  vallen — **alle 139 uit de vitest-suite (BUG-145)**.
```

**Nieuwe bugs:** 53 (BUG-106 … BUG-158) — 2 CRITICAL, 14 HIGH, 24 MEDIUM, 13 LOW.
**Totaal tracker na deze fase:** 158 bugs — **11 CRITICAL, 44 HIGH, 65 MEDIUM, 38 LOW**.

---

## 1. Voor de eigenaar

Acht punten in gewone taal. "De kloon" = de testdatabase waarop deze audit draaide; die is gemaakt van
de **ontwikkelomgeving**, niet van uw echte administratie.

1. **Twee auto's kunnen aantoonbaar twee keer tegelijk verhuurd worden — en dat gebeurt door heel
   normale handelingen.** Als een medewerker een boeking in de kalender versleept, of in het
   bewerkformulier alleen de einddatum aanpast ("de klant houdt hem twee dagen langer"), wordt de
   dubbele-boekingscontrole **overgeslagen**. Het scherm waarschuwt vooraf wél voor het conflict, maar
   het opslaan lukt toch. Daarnaast accepteert het systeem een boeking van één dag midden in een
   bestaande verhuur. Dit zijn geen zeldzame samenlooptjes: het gebeurt elke keer. **BUG-106, BUG-107.**
2. **Een auto die in de werkplaats staat, kan gewoon aan een klant meegegeven worden.** De enige status
   die het uitgeven blokkeert is "niet voor verhuur"; "moet gerepareerd worden", "in onderhoud" en zelfs
   een lopend onderhoudsblok houden de balie niet tegen. Na terugkomst is de werkplaatsvlag bovendien
   verdwenen. **BUG-109.**
3. **Een auto uit de prullenbak terughalen kan een dubbele boeking opleveren — precies de situatie uit
   het incident van 25 augustus.** Zolang de auto in de prullenbak zit, kan er gewoon op geboekt worden;
   bij het terugzetten worden de oude boekingen er zonder controle bovenop gezet. En het terugzetten is
   niet compleet: chauffeurskoppeling, openstaande APK-wijziging, de koppeling van een boete aan de
   verhuur en de vervangerslinks van transporten komen **niet** terug. **BUG-108, BUG-110.**
4. **Een geannuleerde of afgeronde afspraak laat overal resten achter.** Annuleren van een verhuur laat
   de chauffeursrit, de vervangende auto en de placeholder gewoon staan; annuleren van een transport
   houdt de vervangende auto voor die dag geblokkeerd; een onderhoudsblok verwijderen kan de
   vervangende auto van een **ander** blok wegboeken. **BUG-112, BUG-115, BUG-118.**
5. **Wat "deterministisch dubbel boeken" betekent:** BUG-106 (slepen in de kalender / alleen datum
   wijzigen), BUG-107 (eendaagse boeking binnen een bestaande verhuur, ook via elk transport met
   vervanger) en BUG-121 (twee keer dezelfde vervanger in één onderhoudsplanning) gaan **altijd** fout,
   zonder dat er twee mensen tegelijk hoeven te klikken. BUG-114, BUG-115 en BUG-117 leveren hetzelfde
   resultaat op via een omweg (de vervangende auto blijft op de verkeerde dag geblokkeerd of dubbel).
6. **Onderscheid tussen "de software is stuk" en "de testdatabase is rommelig".** Alles in punt 1 t/m 5
   is een **codefout** en geldt ook voor productie. De grote getallen in het datarapport hierboven — 358
   verhuringen die volgens het systeem nog buiten staan, 336 boekingen die nooit zijn opgehaald, 262
   reserveringen op auto's die niet bestaan — zijn vondsten **in de kloon van de ontwikkelomgeving**.
   Ze bewijzen dat de software zulke rijen kán maken, maar de aantallen moeten eerst in de echte
   database opnieuw gemeten worden. **BUG-143, BUG-144** zijn daarom als voorstel geformuleerd, niet als
   opdracht.
7. **258 van die "spookonderhoudsblokken" komen niet uit uw administratie maar uit de testsuite.** De
   automatische tests draaien tegen dezelfde ontwikkeldatabase als waar u in werkt, en ruimen hun eigen
   onderhoudsblokken niet op. Dat vervuilt de ontwikkelomgeving stilletjes en verbergt echte fouten. Het
   is **geen** productiebevinding, maar het mechanisme (auto hard verwijderen, blokken blijven staan) is
   hetzelfde als in de echte code. **BUG-145.**
8. **De klant hoort niets.** Verzet, annuleer of verwijder kantoor een reservering van een
   portaalklant, dan krijgt die klant geen enkele melding. En van de onderhouds- en vervangersmails
   wordt nergens vastgelegd of ze verstuurd zijn — de mailserver stond in de audit onbereikbaar en dat
   merkte niemand. **BUG-134, BUG-155.**

---

## 2. Totalen

### 2.1 Nieuw in deze fase

| Severity | Nieuw | Bug-id's |
|---|---|---|
| CRITICAL | 2 | BUG-106, BUG-107 |
| HIGH | 14 | BUG-108 … BUG-121 |
| MEDIUM | 24 | BUG-122 … BUG-145 |
| LOW | 13 | BUG-146 … BUG-158 |
| **Totaal** | **53** | **BUG-106 … BUG-158** |

### 2.2 Cumulatief tracker BUG-001 … BUG-158

| Severity | BUG-001…059 | BUG-060…105 | BUG-106…158 | Totaal |
|---|---|---|---|---|
| CRITICAL | 7 | 2 | 2 | **11** |
| HIGH | 16 | 14 | 14 | **44** |
| MEDIUM | 24 | 17 | 24 | **65** |
| LOW | 12 | 13 | 13 | **38** |
| **Totaal** | **59** | **46** | **53** | **158** |

### 2.3 T/B-classificatie van de 53 nieuwe bugs

**T** = technische fout, mag met een regressietest gefixt worden zonder goedkeuring van de eigenaar.
**B** = bedrijfsregel/procesbesluit — de eigenaar moet eerst kiezen; komt terug als OPT-voorstel in §7.

| Type | Aantal | Bug-id's |
|---|---|---|
| T | 44 | alle nieuwe bugs behalve de negen hieronder |
| B | 9 | BUG-109, BUG-132, BUG-134, BUG-140, BUG-143, BUG-144, BUG-151, BUG-153, BUG-157 |

### 2.4 Severity-normalisaties ten opzichte van de bronrapporten

| Bron | Bronseverity | Nieuw | Reden |
|---|---|---|---|
| V9-001 | HIGH | CRITICAL (BUG-106) | samengevoegd met R10-001, dat dezelfde root cause CRITICAL noemde en de kalender-drag/drop als normaal UI-gebaar aantoonde |
| D12-002 | HIGH | CRITICAL (BUG-107) | deterministische dubbele boeking via het normale boekingsformulier; het tracker classificeert dubbele boeking al als CRITICAL (BUG-006) |
| V9-004 | MEDIUM | HIGH (BUG-110) | samengevoegd met T11-004 (HIGH), R10-012 (MEDIUM) en D12-006 (MEDIUM); samen 5 koppelingstypen dataverlies bij de exacte scenario van het incident van 2026-08-25 |
| R10-012 | MEDIUM | HIGH (BUG-110) | idem |
| D12-006 | MEDIUM | HIGH (BUG-110) | idem |
| D12-012 | LOW | MEDIUM (BUG-129) | samengevoegd met R10-008 (MEDIUM); 278 live reserveringen die via geen enkele UI-actie meer af te ronden zijn is meer dan cosmetisch |
| D12-013 | LOW | LOW (BUG-155) | ongewijzigd, samengevoegd met T11-016 (LOW) |
| D12-003 | HIGH | HIGH (BUG-121) | **niet** verhoogd naar CRITICAL hoewel het ook deterministisch dubbel boekt: het vereist een payload waarin de planner zichzelf tegenspreekt, niet een gewoon UI-gebaar |

Alle overige bugs behouden de severity van hun bronrapport.

---

## 3. Per fase

### 3.1 Fase 9 — Voertuigbeheer (levenscyclusketen)

Hoofdfixture: voertuig **V = id 1762 `AU-901-X`**, **W = id 1764 `AU-902-X`**, klanten 1275/1276,
chauffeur 858. Scripts `docs/audit/wip/scripts/p9-0{1,2,3,4}-*.cjs`, output `p9-out-0{1,2,3,4}.txt`.
Twee sessies (`admin` + `AUDIT-manager-1788982804001`, elk met eigen `fakeIp`) voor de
concurrency-cases. `/health` gaf 200 vóór en na elk script; geen enkele crash in deze fase.

**Getest (geslaagd)**
- Aanmaken met APK-/garantie-/servicevelden → 201, rij exact, barcode `VEH-001762` automatisch,
  `audit_logs` `vehicle.create`; voertuig verschijnt direct in `apk-expiring`, `warranty-expiring` en
  `service-due`.
- Bewerken (`PATCH /api/vehicles/:id`) met `updated_by`/`updated_at` en velddiff in `audit_logs`;
  gelijktijdige PATCH op hetzelfde veld → last writer wins (verwacht).
- Service-due-scheduler (`POST /api/vehicles/service-due/scan`): één `custom_notifications`-rij,
  idempotent, en na het loggen van een service verdwijnt de melding (`notificationsRemoved:1`).
- APK-/garantievenster `[vandaag − 2 maanden, vandaag + 30 dagen]` exact bevestigd (−70 d niet, −40 d
  wel, +30 wel, +31 niet); `not_for_rental`-voertuigen worden uitgesloten; lege datums worden NULL.
- APK-datumwijzigingsflow (`/api/apk-date-changes`): confirm schrijft `vehicles.apk_date`, tweede
  confirm en dismiss-na-confirm geven netjes 400 "already resolved".
- Kilometerstanden: verlaging zonder wachtwoord → 400 `requiresOverride`, met
  `mileageOverridePassword` → 200 inclusief `previous_mileage` / `mileage_decreased_by` /
  `mileage_decreased_at`; pickup 39100 → voertuig `rented`, contract-PDF; return onder pickup → 409;
  return 39300 → voertuig `available`, schadecheck-document.
- Barcode: `GET /api/barcodes/VEH-001762` resolvet, regenerate → `VEH-001762-R2`, oude code 404,
  uniciteitsconstraint `vehicles_barcode_unique` houdt stand.
- Blacklist-race: 10 parallelle `POST /api/vehicles/1762/blacklist` → exact één 201, negen nette 400 en
  één rij. (Het vermoeden uit fase 3-5 reproduceert **niet**.)
- Bulk import happy path: `bulk-import-plates` importeert geldige kentekens als `Unknown/Unknown`,
  weigert exacte én genormaliseerde duplicaten binnen één batch; `bulk-import-csv` mapt `gps: "ja"` →
  true en Excel-serienummer `46000` → `2025-12-09`.
- Delete-impact + delete + restore happy path: telling klopt met SQL, `deleted_records`-payload bevat
  voertuig + 8 reserveringen + 7 documenten + 1 kostenpost + 1 transport + 1 blacklistrij; restore zet
  alles met dezelfde id's terug, bestanden blijven downloadbaar, `vehicles_id_seq` wordt hersynct,
  tweede restore → 409 `ALREADY_RESTORED`.
- Documenten: upload, lijst per voertuig, `DELETE /api/documents/:id` verwijdert rij én bestand.
- Transporttoewijzing (tow gekoppeld aan reservering 3367; swap met `spareRequired` → replacement 3369).
- PATCH-vs-pickup-race: 6 rondes met 0–1200 ms vertraging — de pickup-status werd **nooit**
  overschreven (0/6).
- `GET /api/vehicles/:id/overlaps` zonder datums → nette 400; `GET /api/vehicles/available` toont geen
  verwijderd voertuig.

**Niet getest**
- RDW-APK-scan (`POST /api/apk-date-changes/scan-now`, nachtelijk 02:30): roept voor 570+ voertuigen de
  externe RDW-API aan; uitgaand verkeer naar een derde partij viel buiten scope. De confirm/dismiss-kant
  is met SQL-fixtures wél getest.
- Backup/restore van voertuigen via de backupservice (`backups.ts`) — eigen fase.
- Damage-check-PDF-generatie en `interactive_damage_checks` — documenten/mail-gebied.
- Waitlist (`vehicle_waitlist`) — geen API gevonden om rijen aan te maken.
- Portaalzijde van het boeken van een verwijderd/geblokkeerd voertuig — fase 11.
- **Archief bestaat niet**: `grep -ri archiv server client/src` raakt alleen backupcode en het
  lucide-icoon op de prullenbakknop (`client/src/pages/vehicles/index.tsx:634`); het enige "inactive" in
  `shared/schema.ts:402` hoort bij chauffeurs. De dichtstbijzijnde equivalenten
  (`availabilityStatus=not_for_rental` en de prullenbak) zijn wél volledig getest.

**Bevindingen:** 16 (V9-001…016) → 12 nieuwe bugs, 4 opgegaan in samenvoegingen (zie §4).

### 3.2 Fase 10 — Reserveringen (diepteonderzoek)

Fixtures: voertuigen `AU-101-X`…`AU-152-X` (merk `AUDIT-P10`), klanten 1272-1274/1280/1281,
portaalklant 179, chauffeurs 161/23, reserveringen 3345-3448. Scripts `p10-a` … `p10-j`, ruwe evidence
in `p10-*.out.json`. Geen enkel request liet de server crashen.

**Getest (geslaagd)**
- Veld-voor-veld-diff `PATCH /:id` versus `/:id/basic` (69 probes, volledige tabel in
  `p10-reservations.md` §7). `/basic` weigert correct onzin-datums/-tijden, `endDate < startDate`,
  onbekend `type`, negatieve `fuelCost`/`deliveryFee` en strippt de meta-velden.
- Zeer lange verhuur (5 jaar, 3360): create/pickup, lijst, range, byVehicle, byCustomer,
  `check-conflicts` op +1000 dagen en de beschikbaarheidslijst gedragen zich consistent.
- Ver in het verleden (2015, 3361), start = eind op dezelfde dag (3362), retour op een toekomstige datum
  (3363), pickup 10 dagen vóór de startdatum (3364) en open einde (`endDate` null, 3366): alle
  geaccepteerd en overal consistent zichtbaar.
- Klant wisselen op een `picked_up` reservering (3383) → contract-PDF opnieuw gegenereerd, audit-log
  met `customerId` van/naar; voertuig wisselen op een `picked_up` reservering → oude auto `available`,
  nieuwe `rented`, contractnummer behouden.
- Te late verhuur (3392): staat in `/overdue` en `/overdue/:vehicleId`, blokkeert een nieuwe boeking met
  409, verdwijnt uit beide lijsten na verlenging, en de late retour zet `endDate=actualReturnDate=vandaag`.
- Soft delete (3387): overal correct uitgesloten (lijst, range, byVehicle, byCustomer, upcoming,
  overdue, `check-conflicts`); een overlappende boeking daarna is toegestaan; delete/edit/status op de
  verwijderde rij → 404.
- Bewerkingen op een `completed` reservering worden **volledig** in `audit_logs` vastgelegd met
  veldniveau van/naar.
- De volledige specsequentie (aanmaken → voertuig toewijzen → annuleren → wijzigen → voertuig wisselen →
  document genereren → voertuig/klant verwijderen → herladen), tweemaal uitgevoerd.
- Portaalleeskant: elke wijziging van kantoor is direct zichtbaar in `GET /api/portal/reservations` en
  `/:id`; de contract-PDF verschijnt na pickup in `GET /api/portal/documents` en verdwijnt na delete.

**Niet getest**
- Socket.IO/realtime — buiten scope (afgedekt in `socket.md`).
- `maintenance-with-spare`, `return-from-service`, `spare-status` — fase 11.
- Multipart `damageCheckFile`-upload op `PATCH /:id` — documentgebied.
- Portaal-**schrijf**kant (`POST /api/portal/reservations/:id/driver`) — fase 11.
- Hogere-concurrency-herhaling van BUG-006 — createpad ongewijzigd.
- Geen browser-UI-screenshots: alle UI-paden zijn nagebootst met exact de requestvormen die
  `reservation-form.tsx`, `calendar.tsx`, `status-change-dialog.tsx` en
  `schedule-maintenance-dialog.tsx` versturen.
- **Bestaat niet als route:** dupliceren/kopiëren van een reservering, een aparte reschedule-route, een
  aparte annuleerroute en een restore-route voor reserveringen.

**Bevindingen:** 18 (R10-001…018) → 14 nieuwe bugs, 2 opgegaan in samenvoegingen, 2 herbevestigingen
van BUG-084/BUG-041.

### 3.3 Fase 11 — Transport & vervangend vervoer (runtime bewezen)

Fixtures: voertuigen `AU-11A-X`…`AU-11K-X` (1751-1761), portaalklant 179 (portaalgebruiker 30),
verhuringen #3335, #3336, #3337, #3355. Scripts `p11-portal{,2,3}.cjs`, `p11-transport.cjs`,
`p11-extra.cjs`, `p11-sweep.cjs`; elke uitspraak is onderbouwd met een request/response plus SQL die
direct daarna uit `lvs_audit` is gelezen. Geen enkele 5xx of verbindingsfout in deze fase.

**Getest (geslaagd)**
- Volledige portaal-onderhoudsflow: klant dient `maintenance` in met `needsReplacement` → staffmelding;
  dubbele open aanvraag → 409 `PORTAL_DUPLICATE_REQUEST`; aanvraag op andermans verhuur → 404;
  `preferredDate` in het verleden → 400.
- Staff-goedkeuring maakt blok #3343 met `portalRequestId`/`affectedRentalId`, TBD-placeholder #3344
  geclipt op de verhuur, `spareAssignmentDecision='spare_assigned'`, portaalmelding
  `maintenance_planned` (dedupe-tag `maint:3343:planned:<datum>`) + `request_done`, audit-rijen, en het
  blok is zichtbaar in `range`, `upcoming-maintenance` en `needing-assignment` — zonder placeholderlek
  naar de klant.
- Dezelfde aanvraag tweemaal goedkeuren → 400 "Request is already closed" (idempotent).
- Echte vervanger toewijzen aan de placeholder → placeholder wordt een echte replacement, vB
  `scheduled`, klantmelding `replacement_ready`, staffmelding opgeruimd.
- 48-uursregel bij `maintenance_change`: morgen → 400 `PORTAL_MAINTENANCE_TOO_LATE`, +2 dagen 08:00 →
  201, blok met `maintenanceStatus='in'` → 400, dubbele open wijziging → 409; `durationDays` 0, 61, 1.5
  en -1 worden alle geweigerd; weekenddatum → 400 `MAINTENANCE_WEEKEND`.
- Blokstatus `scheduled → in → out → scheduled` levert exact de meldingen `maintenance_in`,
  `maintenance_out`, `maintenance_planned`; dezelfde status herhalen stuurt niets (dedupe werkt).
- Transporten: aanmaken van tow/swap/delivery, gepland en vandaag; vervangerflow met correct gekoppelde
  replacement-reservering (00:00–23:59-venster) en `needs_service`-vlag op het origineel; vervanger
  wisselen met conflictcontrole (409 bij een dubbele claim op dezelfde dag); vervanger verwijderen →
  terug naar TBD; `spareRequired=false` annuleert de vervangingsreservering.
- Guards na pickup van de vervanger: wisselen/verwijderen → 400 "already been picked up"; DELETE met een
  opgehaalde vervanger behoudt die reservering; `relatedVehicleId == vehicleId` bij **create** → 400.
- `POST /api/delivery/transports/generate-report` weigert TBD-transporten (enkel en in een gemengde
  batch) met 400 en maakt wél een `transport_report`-document voor toegewezen transporten; de printknop
  in `client/src/pages/delivery/dashboard.tsx:283-293` blokkeert TBD ook aan clientzijde.
- Historie-inventarisatie: er bestaat **geen** aparte voertuig- of reserveringshistorietabel; alleen
  `audit_logs`, `deleted_records`, `portal_activity_log`, `custom_notifications`, `portal_notifications`
  en `email_logs`.
- Stale-state-sweep over de hele database (25 queries, `p11-sweep.out`) met diff tegen fase 3-5.

**Niet getest**
- Fysieke PDF-inhoud van de gegenereerde contract-/transportdocumenten (alleen status, content-type,
  bytegrootte en de `contracts/data`-JSON zijn geïnspecteerd).
- `delivery/estimate-distance` en `optimize-route` (externe geocoding).
- Portaalmailbezorging — `email_logs` wordt door `sendEmail(...,'custom')` nooit geschreven (BUG-155) en
  de audit-SMTP wijst naar een lokale stub.
- Autorisatiematrix voor transporten: `hasPermission(MANAGE_VEHICLES | MANAGE_RESERVATIONS)` is gelezen,
  niet gefuzzd met een beperkt account (om binnen de loginlimiter te blijven).
- Bulk-complete partial failure (al gedekt door BUG-053) en realtime socketpayloads.

**Bevindingen:** 17 (T11-001…017) → 13 nieuwe bugs, 4 opgegaan in samenvoegingen.

### 3.4 Fase 12 — Database & data-integriteit

`lvs_audit`: 47 tabellen, 68 echte FK's. Scripts `p12-fk-inventory.cjs`, `p12-orphans.cjs`,
`p12-scan2.cjs`, `p12-summary.cjs` (read-only scans → `p12-scan.json`) plus `p12-lib.cjs` + `p12-txn.cjs`
voor de transactietests (`p12-txn.out.json`, fixtures in `p12-ids.json`). Alle tellingen zijn genomen op
2026-09-10 terwijl fase 9-11 nog schreef: de audit-aantallen bewegen dus nog, de pre-existing aantallen
niet.

**Getest (geslaagd / uitgevoerd)**
- Volledige FK-inventarisatie: 82 integer-referentiekolommen, 68 met constraint, **14 zonder**; alle
  ON DELETE-regels vastgelegd.
- Weesscan over élke referentiekolom, inclusief de polymorfe (`deleted_records.entity_id`,
  `portal_activity_log.entity_id`) en de tekstuele actor-kolommen (17 waarden die niet in `users` staan).
- Duplicaatscan: 22 verschillende duplicaatdefinities (genormaliseerde kentekens, chassisnummers,
  klantnaam/e-mail/debiteurnummer, echte dubbele boekingen met turnover-uitzondering, overlappende
  blokken, contractnummers na het strippen van voorloopnullen, documentpaden, placeholders per
  origineel, gebruikers, portaalgebruikers, chauffeurs, app-settings, templates, transporten, boetes,
  schadechecks, audit-log-dubbels).
- Enum-drift per statuskolom tegen `shared/schema.ts`.
- Bestanden versus documentrijen tegen twee bases (`audit-uploads` van de auditserver en de
  repo-`uploads`): **0** van de 117 `documents.file_path`-rijen mist op schijf, maar geen enkele base
  resolvet ze alle 117; 4 van de 4 `expenses.receipt_file_path`-rijen resolveren nergens.
- 16 transactie-/rollbacktests (a1, a2, b1, b2, c1, c2, c3, d, d2, e, f, f2, h, i, j, j2, k) met
  geïnjecteerde fouten en SQL-terugleescontrole. Waar een transactie bestaat, rolt hij correct terug
  (a1: FK-fout tijdens voertuigverwijdering laat niets achter; j2: drie parallelle restores laten de DB
  consistent).
- `restoreDeletedRecord` onder concurrency (j, j2) en `checkReservationConflicts` op de dagranden (k).

**Niet getest**
- Backup/restore-atomiciteit — fase 17, buiten scope per instructie.
- Voertuig verwijderen met een gigantische snapshot of een gelijktijdige restore tijdens de delete —
  geen injectiepunt via de API zonder codewijziging.
- Pickup met een écht falende PDF-generator: template 8 valt terug op de ingebouwde layout
  (`pdf-generator.ts:94-124`); dat een echte generatorfout de pickup tóch zou committen
  (`routes.ts:4144-4226` try/catch) is uit code afgeleid, niet runtime bewezen.
- Mid-loop-fout in de delete-cascade van een reservering (`routes.ts:4621-4700`) — geen injectiepunt.
- `portal_users`-cascade bij het verwijderen van een klant — de accountaanmaak gaf in die fixture 400;
  de cascade is uit de FK-definitie overgenomen.
- Trage (time-outende) SMTP: de geconfigureerde host weigert direct.
- Bestandsbestaan van `documents.file_path` tegen een **productie**-`UPLOADS_DIR`.
- De database `lvstest` en poort 5000 zijn nooit aangeraakt.

**Bevindingen:** 13 (D12-001…013) → 8 nieuwe bugs, 5 opgegaan in samenvoegingen. Plus 1 extra bevinding
van de leidende auditor (BUG-145).

---

## 4. Deduplicatie — mapping wip-id → tracker-id

Bevindingen die dezelfde root cause delen zijn **samengevoegd** tot één bug met alle evidences.
Bevindingen die alleen nieuwe evidence bij een bestaande bug leveren krijgen **geen** nieuw nummer en
staan in §6.

| Wip-id | Verdict | Tracker-id |
|---|---|---|
| V9-001 | **samengevoegd met R10-001** — identieke root cause `server/routes.ts:3644-3645` (conflictcontrole alleen als `vehicleId` **én** `startDate` in de body staan); V9-001 levert de evidence via het bewerkformulier (alleen `endDate`), R10-001 via de kalender-drag/drop | **BUG-106** |
| V9-002 | nieuw | **BUG-108** |
| V9-003 | nieuw (bevat RS-002's `/status`-omzeiling als deelbewijs) | **BUG-109** |
| V9-004 | **samengevoegd met R10-012, T11-004, D12-006** — één root cause: `deleteVehicle` snapshot (database-storage.ts:535-618) dekt 7 tabellen, de FK-acties op de overige tabellen worden niet vastgelegd en `restoreDeletedRecord` kan ze dus niet terugzetten; V9-004 levert chauffeur/APK/boete/transport-links, R10-012 de chauffeurshistorie, T11-004 de transport↔vervanger-links + dubbele placeholder, D12-006 de meting met alle vijf koppelingstypen tegelijk | **BUG-110** |
| V9-005 | nieuw | **BUG-122** |
| V9-006 | nieuw | **BUG-123** |
| V9-007 | nieuw | **BUG-124** |
| V9-008 | nieuw | **BUG-125** |
| V9-009 | nieuw (de rauwe-500-helft valt onder BUG-148; het ontbrekende `barcode_taken`-voorcontrole is de eigen bug) | **BUG-126** |
| V9-010 | nieuw | **BUG-127** |
| V9-011 | nieuw | **BUG-146** |
| V9-012 | nieuw (D12 §3 levert extra evidence: 22 dubbele audit-groepen) | **BUG-147** |
| V9-013 | **samengevoegd met V9-015, R10-016, D12-010** — één klasse: Postgres-foutcodes 23503/23505 worden niet herkend en de rauwe drivermelding/het rauwe errorobject gaat naar de client | **BUG-148** |
| V9-014 | nieuw | **BUG-149** |
| V9-015 | **samengevoegd** (zie V9-013) | **BUG-148** |
| V9-016 | nieuw | **BUG-150** |
| R10-001 | **samengevoegd met V9-001** (zie boven); severity CRITICAL behouden | **BUG-106** |
| R10-002 | geen nieuw nummer — `id` schrijfbaar via `PATCH /:id` is exact het scenario dat BUG-084 al beschrijft; nieuwe evidence in §6 | = **BUG-084** (herbevestigd) |
| R10-003 | nieuw — BUG-084 dekt *welke kolommen* schrijfbaar zijn, niet dat de **waarden** van datum/tijd/type ongevalideerd blijven | **BUG-111** |
| R10-004 | geen nieuw nummer — mass assignment van systeemvelden = BUG-084, negatieve/omgekeerde kilometerstanden = BUG-041; nieuwe evidence in §6 | = **BUG-084 + BUG-041** (herbevestigd) |
| R10-005 | nieuw | **BUG-112** |
| R10-006 | nieuw (verlengt BUG-040: dezelfde guard, andere statuswaarde) | **BUG-113** |
| R10-007 | nieuw | **BUG-128** |
| R10-008 | **samengevoegd met D12-012** — dezelfde populatie rijen (statuswaarden buiten de enum) en dezelfde oorzaak (hardcoded literals in de storagelaag + tekstkolommen zonder CHECK); R10-008 levert het gedragsbewijs (`/status` → 400 voor elke transitie), D12-012 de volledige telling per kolom | **BUG-129** |
| R10-009 | nieuw | **BUG-130** |
| R10-010 | nieuw (aparte root cause t.o.v. BUG-111: de pickup/return-routes, niet de generieke PATCH) | **BUG-131** |
| R10-011 | nieuw | **BUG-132** |
| R10-012 | **samengevoegd** (zie V9-004) | **BUG-110** |
| R10-013 | nieuw | **BUG-133** |
| R10-014 | nieuw | **BUG-134** |
| R10-015 | nieuw | **BUG-151** |
| R10-016 | **samengevoegd** (zie V9-013) | **BUG-148** |
| R10-017 | nieuw (andere root cause dan BUG-147: `verbFor('POST')`, niet dubbele logging) | **BUG-152** |
| R10-018 | nieuw | **BUG-153** |
| T11-001 | nieuw | **BUG-114** |
| T11-002 | nieuw | **BUG-115** |
| T11-003 | nieuw | **BUG-116** |
| T11-004 | **samengevoegd** (zie V9-004); het gevolg "completing maakt een nieuwe placeholder" is als deelbewijs ondergebracht bij BUG-137 | **BUG-110** |
| T11-005 | nieuw — **overwogen samenvoeging met D12-004 afgewezen**: beide maken dubbele vervangers/blokken op `POST /api/portal-requests/:id/approve`, maar T11-005 is een ontbrekende lookup (`placeholderSpare = true` vindt een al toegewezen vervanger niet) en D12-004 is een ontbrekende transactie/rijvergrendeling; verschillende fixes en verschillende regressietests | **BUG-117** |
| T11-006 | nieuw (verlengt BUG-014 met de verkeerde-blok-cascade) | **BUG-118** |
| T11-007 | nieuw | **BUG-119** |
| T11-008 | nieuw | **BUG-135** |
| T11-009 | nieuw | **BUG-136** |
| T11-010 | **samengevoegd met T11-011** — beide komen uit dezelfde twee functies zonder statusfilter (`getPlaceholderReservationsNeedingAssignment` database-storage.ts:2940-2950 en `assignVehicleToPlaceholder` :3020-3060); T11-010 levert de "voltooid transport", T11-011 de "geannuleerde placeholder" | **BUG-137** |
| T11-011 | **samengevoegd** (zie T11-010) | **BUG-137** |
| T11-012 | nieuw | **BUG-138** |
| T11-013 | nieuw | **BUG-139** |
| T11-014 | nieuw | **BUG-140** |
| T11-015 | nieuw | **BUG-154** |
| T11-016 | **samengevoegd met D12-013** — identieke root cause: `sendEmail(...)` geeft een boolean terug die elke aanroeper weggooit en `email_logs` wordt door dat pad nooit geschreven (0 rijen in de hele database) | **BUG-155** |
| T11-017 | nieuw | **BUG-156** |
| D12-001 | nieuw | **BUG-120** |
| D12-002 | nieuw, severity genormaliseerd HIGH→CRITICAL | **BUG-107** |
| D12-003 | nieuw | **BUG-121** |
| D12-004 | nieuw (samenvoeging met T11-005 afgewezen, zie daar) | **BUG-141** |
| D12-005 | nieuw | **BUG-142** |
| D12-006 | **samengevoegd** (zie V9-004) | **BUG-110** |
| D12-007 | nieuw — de 258 'active'-blokken op niet-bestaande voertuigen zijn hier **afgesplitst** naar BUG-145 (bewezen testsuite-afval); BUG-143 houdt het mechanisme (geen FK, geen opruimpad) en de 55 wees-`spare_assignment`-meldingen | **BUG-143** |
| D12-008 | nieuw | **BUG-144** |
| D12-009 | nieuw | **BUG-157** |
| D12-010 | **samengevoegd** (zie V9-013) | **BUG-148** |
| D12-011 | nieuw | **BUG-158** |
| D12-012 | **samengevoegd** (zie R10-008), severity genormaliseerd LOW→MEDIUM | **BUG-129** |
| D12-013 | **samengevoegd** (zie T11-016) | **BUG-155** |
| Extra bevinding leidende auditor (258 wees-'active'-blokken op voertuig-id's 1022-1657) | nieuw | **BUG-145** |

**Zes samenvoegingen**, waarin 16 wip-bevindingen zijn opgegaan in 6 bugs (BUG-106, BUG-110, BUG-129,
BUG-137, BUG-148, BUG-155), plus **twee** bevindingen die volledig in bestaande tracker-bugs vallen
(R10-002 en R10-004 → BUG-084 / BUG-041). Eén samenvoeging is expliciet **overwogen en afgewezen**
(T11-005 versus D12-004).

---

## 5. Bugtracker-aanvulling — BUG-106 … BUG-158

Type: **T** = technische fout · **B** = bedrijfsregel/procesbesluit (goedkeuring nodig, zie §7).

### 5.1 CRITICAL

#### BUG-106 — Conflictcontrole wordt overgeslagen bij elke gedeeltelijke `PATCH` op een reservering; kalender-drag/drop boekt deterministisch dubbel
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **T** · **Bron:** V9-001 (HIGH) + R10-001 (CRITICAL) — *samengevoegd, severity genormaliseerd naar CRITICAL*
- **Feature:** Reservering bewerken / verplaatsen (`PATCH /api/reservations/:id`) — het pad dat zowel het bewerkformulier als de kalender gebruikt
- **Reproduction:**
  - *Alleen einddatum (`p9-03-import-race-conflicts.cjs` stap D, `p9-out-03.txt`):* voertuig 1762 met R5 = 3367 (`booked`, 2026-09-30..2026-10-05), R6 = 3368 (`booked`, 2026-10-10..2026-10-13) en ghost 3370 (`booked`, 2026-10-01..2026-10-03). (1) `GET /api/reservations/check-conflicts?vehicleId=1762&startDate=2026-09-30&endDate=2026-10-11&excludeReservationId=3367` → 200 `[3370, 3368]`. (2) `PATCH /api/reservations/3367 {"endDate":"2026-10-11"}` → **200**; SQL: `2026-09-30 / 2026-10-11` — overlapt nu 3368 én 3370. (3) `PATCH /api/reservations/3368 {"startDate":"2026-10-04"}` → 200, overlap met 3367. (4) `PATCH /api/reservations/3367 {"startDate":"2026-09-30","endDate":"2026-10-11"}` (beide datums, géén `vehicleId`) → 200. (5) Controle: dezelfde body **mét** `"vehicleId":1762` → **409** "Reservation conflicts with existing bookings"; `PATCH /3367/basic` met de volledige rij → **409**.
  - *Kalender-drag/drop (`p10-a-patch-diff.cjs`, `p10-i-status.cjs` I6, `p10-d-cancel.cjs` D3b):* voertuig 1749 heeft 3440 `booked` 2026-11-09..11-12; exact de body die `client/src/pages/reservations/calendar.tsx:386-391` verstuurt — `PATCH /api/reservations/3441 {"startDate":"2026-11-10","endDate":"2026-11-13"}` → **200**; daarna `check-conflicts` 11-09..11-13 → `[3440, 3441]`. Ook `PATCH /api/reservations/3345 {"vehicleId":1735}` (bezet voertuig, geen datums in de body) → 200; en `PATCH /api/reservations/3429 {"status":"booked"}` (annulering terugdraaien) → 200 met `[3434 booked, 3429 booked]` als resultaat.
- **Expected:** elke wijziging van `vehicleId`, `startDate`, `endDate`, `startTime`, `endTime` of een heractivering van de status draait dezelfde `checkReservationConflicts` als het createpad en als `/basic`, op de **effectieve** waarden (bestaande rij + patch), en geeft 409 bij overlap. `check-conflicts` en de daadwerkelijke schrijfactie moeten hetzelfde antwoord geven.
- **Actual:** de conflictcontrole staat achter `if (reservationData.vehicleId && reservationData.startDate)`. Elke body die één van die twee sleutels mist wordt ongecontroleerd weggeschreven — en de kalender-drag/drop, de "terug naar picked_up"-knop en het bewerkformulier sturen `vehicleId` structureel niet mee. `endDate` komt in de conditie helemaal niet voor, terwijl het commentaar erboven "only if vehicle, startDate or endDate are being updated" belooft.
- **Root cause:** `server/routes.ts:3644-3645` (`if (reservationData.vehicleId && reservationData.startDate) { … checkReservationConflicts(…) }`) binnen `app.patch("/api/reservations/:id")` (3445-3700); `client/src/pages/reservations/calendar.tsx:386-391` (bodyvorm).
- **Affected files:** `server/routes.ts:3445-3700`, `client/src/pages/reservations/calendar.tsx:386-391`
- **Affected data:** reserveringen 3367/3368/3370 (in fase 9 teruggezet), 3345/3347, 3359, 3440/3441, 3429/3434 (in `lvs_audit` bewust overlappend gelaten als bewijs). In productie: elke reservering die via een datumwijziging of een sleepactie is aangepast.
- **Security impact:** geen (vereist `MANAGE_RESERVATIONS`), maar het is een volledige bypass van de boekingsinvariant.
- **Business impact:** de meest voorkomende bewerking ("verhuur een paar dagen verlengen", "klant haalt een dag eerder op") en het meest voorkomende gebaar (boeking verslepen in de kalender) maken stilzwijgend een dubbele boeking die het createpad en `/basic` wél zouden weigeren. Het scherm toont vooraf de conflictwaarschuwing, het opslaan lukt daarna toch — medewerkers vertrouwen de verkeerde van de twee.
- **Fix proposal:** `const effective = {...existing, ...reservationData}`; draai `checkReservationConflicts(effective.vehicleId, effective.startDate, effective.endDate, id, …)` zodra de body één van `vehicleId/startDate/endDate/startTime/endTime/status` bevat en `effective.status` een actieve status is; 409 bij treffers. Doe hetzelfde in het status-endpoint voor `cancelled → booked` (of houd die transitie verboden).
- **Regression test:** boek A (d1..d5) en B (d10..d13) op één voertuig; `PATCH A {endDate: d11}` → 409; `PATCH B {startDate: d4}` → 409; `PATCH B {vehicleId: bezet voertuig}` → 409; rijen ongewijzigd.

#### BUG-107 — `checkReservationConflicts` laat een eendaagse reservering middenin een bestaande verhuur toe (turnover-uitzondering te breed)
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **T** · **Bron:** D12-002 (HIGH) — *severity genormaliseerd naar CRITICAL, conform BUG-006*
- **Feature:** Beschikbaarheidscontrole (`checkReservationConflicts`) — gebruikt door `POST /api/reservations`, `/basic`, `check-conflicts`, `applyTransportUpdate`, `assignVehicleToPlaceholder`, `createReplacementReservation` en `approveBooking`
- **Reproduction:** voertuig 1819 heeft verhuur 3450 `booked` 2028-02-02..2028-02-05 (geen tijden). `POST /api/reservations {vehicleId:1819, customerId:1278, startDate:"2028-02-02", endDate:"2028-02-02"}` → **201** (id 3451). Twee identieke eendaagse verhuringen 2028-03-03..2028-03-03 → **beide 201** (3454, 3455). `GET /api/reservations/check-conflicts?vehicleId=1819&startDate=2028-03-03&endDate=2028-03-03` → `[]`. Zelfde gat via transporten: vervangingsreservering 3420 (2027-12-04, tijden 00:00-23:59) wordt geaccepteerd op voertuig 1798 terwijl verhuur 3419 van 2027-12-04..06 loopt. Controle: een eendaagse boeking **midden** in het bereik → correct 409; op de laatste dag → 201 (turnover, by design).
- **Expected:** een reservering waarvan de enige dag binnen een andere live reservering valt, conflicteert. De turnover-uitzondering hoort alleen te gelden wanneer de één eindigt op de dag dat de ander begint.
- **Actual:** elke reservering met `startDate = endDate = D` wordt geaccepteerd zodra een bestaande reservering op D begint óf eindigt en één van beide geen tijden heeft — inclusief twee identieke eendaagse bereiken. Het commentaar op `database-storage.ts:1550-1557` beweert "an identical range always still conflicts"; dat klopt niet voor eendaagse bereiken.
- **Root cause:** `server/database-storage.ts:1558-1578` — de `NOT(...)`-turnoverclausule vuurt op `(existing.end_date = new.start_date) OR (new.end_date = existing.start_date)` met NULL-tijden als "geen conflict"; bij een eendaagse aanvraag gelden beide gelijkheden tegen de randen van een meerdaagse verhuur. Het expliciete 00:00/23:59-venster van `applyTransportUpdate` (:2093-2097) helpt niet omdat de bestaande verhuur NULL-tijden heeft.
- **Affected files:** `server/database-storage.ts` (`checkReservationConflicts`, `applyTransportUpdate`, `assignVehicleToPlaceholder`, `createReplacementReservation`), `server/routes.ts` (`POST /api/reservations`, `/basic`, `check-conflicts`), `server/routes/portal-requests.ts` (`approveBooking`)
- **Affected data:** auditrijen 3451, 3454/3455, 3420 (voertuig 1798). Pre-existing in de kloon: van de 50 echte dubbele-boekingsparen bevatten er 2 identieke bereiken (voertuig 206: 21/297; voertuig 428: 17/820 met één dag overlap) die bij dit gat passen — **te herverifiëren in productie**.
- **Security impact:** geen.
- **Business impact:** deterministische dubbele boekingen vanuit het gewone boekingsformulier én vanuit élk transport met een vervanger — en eendaagse vervangers/transporten zijn juist het normale geval.
- **Fix proposal:** behandel een aanvraag alleen als turnover wanneer hij niet volledig binnen het bestaande bereik valt: eis `new.startDate <> new.endDate` of `existing.startDate <> existing.endDate`, en pas de uitzondering nooit toe wanneer `new.startDate = existing.startDate`.
- **Regression test:** bestaand D..D+3 → eendaagse boeking op D → 409; eendaagse boeking op D+3 → 201 (turnover); tweemaal hetzelfde eendaagse bereik → tweede 409; transportvervanger op een voertuig waarvan de verhuur die dag begint → 409.

### 5.2 HIGH

#### BUG-108 — Een voertuig in de prullenbak blijft boekbaar; het terugzetten plaatst de gesnapshotte boekingen er zonder conflictcontrole bovenop
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** V9-002
- **Feature:** Prullenbak versus boekingen (`DELETE /api/vehicles/:id`, `POST /api/reservations`, `GET /api/reservations/check-conflicts`, `POST /api/deleted-records/:id/restore`)
- **Reproduction:** (`p9-02-delete-restore.cjs` stappen 2-5, `p9-04-gaps.cjs` stap H) (1) voertuig 1762 heeft `booked` reservering 3367 (klant 1275, 2026-09-30..2026-10-05); `DELETE /api/vehicles/1762 {"confirmLicensePlate":"AU-901-X"}` → 200 `restorable:true` (`deleted_records` id 36; reserveringen hard verwijderd, alleen in de snapshot). (2) `GET /api/reservations/check-conflicts?vehicleId=1762&startDate=2026-10-01&endDate=2026-10-03` → 200 `[]`; `GET /api/vehicles/1762` → 404. (3) `POST /api/reservations {"vehicleId":1762,"customerId":1276,"startDate":"2026-10-01","endDate":"2026-10-03","status":"booked"}` → **201** id 3370; `GET /api/reservations/3370` → 200 met `"vehicle": null`. (4) `POST /api/deleted-records/36/restore` → 200. (5) SQL: 3367 en 3370 zijn nu beide `booked` op voertuig 1762 en overlappen 1-3 oktober voor twee verschillende klanten; `check-conflicts` → `[3370, 3367]`. (6) Herhaald op vers voertuig 1787 (`AU-906-X`): ghost 3403 blijft achter op een voertuig-id zonder voertuigrij.
- **Expected:** een voertuig in de prullenbak is niet boekbaar (404/409 op `POST` en een duidelijk antwoord van `check-conflicts`); en als dat toch kan, moet de restore de gesnapshotte niet-geannuleerde reserveringen tegen de inmiddels aangemaakte rijen controleren en weigeren of markeren.
- **Actual:** het createpad doet geen enkele bestaanscontrole op het voertuig (`reservations.vehicle_id` heeft geen FK — BUG-039), `check-conflicts` vindt niets omdat de oude rijen mét het voertuig hard zijn verwijderd, en `restoreDeletedRecord` voegt de snapshot blind weer in.
- **Root cause:** `server/routes.ts` `POST /api/reservations` (~2435-2520, geen `storage.getVehicle(vehicleId)`-guard); `server/database-storage.ts:683-697` `restoreDeletedRecord` (`tx.insert(reservations).values(revive(reservations, payload.reservations))` zonder overlapcontrole); `server/database-storage.ts:592-599` `deleteVehicle` (hard delete van de reserveringen).
- **Affected files:** `server/routes.ts`, `server/database-storage.ts:535-618, 637-725`
- **Affected data:** reservering 3370 (ghost, nu een live dubbele boeking met 3367) en 3403 (ghost op het niet-bestaande voertuig 1787).
- **Security impact:** geen direct.
- **Business impact:** dit is de vervolgschade van het incident dat dit project al kent ("voertuig plus reservering verdwenen"): zolang de auto in de bak zit kan personeel er via een oud tabblad of een integratie gewoon op boeken, en de restore levert daarna zonder één waarschuwing een dubbele boeking op. Ghost-reserveringen breken bovendien elk overzicht dat reservering → voertuig joint.
- **Fix proposal:** (1) 404 in `POST /api/reservations` en `check-conflicts` wanneer het voertuig niet bestaat (en extra veilig: weiger id's die in `deleted_records` staan met `restored_at IS NULL`); (2) in `restoreDeletedRecord` per gesnapshotte niet-geannuleerde reservering `checkReservationConflicts` draaien en óf met 409 afbreken met de conflictlijst, óf terugzetten als `cancelled` met een notitie; (3) op termijn de reserveringen soft-deleten bij een voertuigverwijdering (BUG-022) zodat de conflictcontrole ze blijft zien.
- **Regression test:** verwijder een voertuig met een `booked` reservering; `POST` een reservering op hetzelfde voertuig/dezelfde dagen → 404/409; restore → geen enkel overlappend `booked` paar op dat voertuig in SQL.

#### BUG-109 — Een voertuig met `needs_fixing` / `maintenance_status=in_service` of een open onderhoudsblok kan gewoon meegegeven worden; `PATCH /:id/status` omzeilt zelfs de `not_for_rental`-guard
- **Severity:** HIGH · **Status:** OPEN · **Type:** **B** (of, en met welke override, een auto in onderhoud tóch uitgegeven mag worden is een procesafspraak — zelfde klasse als BUG-013) · **Bron:** V9-003 (bevat RS-002 als deelbewijs)
- **Feature:** Ophalen versus voertuigstatus (`POST /api/reservations/:id/pickup`, `PATCH /api/reservations/:id/status`, return)
- **Reproduction:** (`p9-01-lifecycle.cjs` stap F, `p9-out-01.txt`, voertuig 1762) (1) `POST /api/reservations` (klant 1276, +3..+6) → 201 id 3339; `PATCH /api/vehicles/1762 {"availabilityStatus":"needs_fixing"}` → 200 (zonder waarschuwing in de body, zie BUG-146); `PATCH /api/vehicles/1762/maintenance-status {"status":"in_service","note":"AUDIT-P9 in workshop"}` → 200. (2) `POST /api/reservations/3339/pickup {…,"pickupMileage":39400,"fuelLevelPickup":"full"}` → **200**; SQL: `availability_status='rented'`, `maintenance_status='in_service'`, `maintenance_note='AUDIT-P9 in workshop'` — een auto "in de werkplaats" staat nu bij een klant. (3) `POST /api/reservations/3339/return` → 200; SQL: `availability_status='available'`, `maintenance_status='in_service'` — de handmatige `needs_fixing` is weg en de auto wordt weer als beschikbaar aangeboden. (4) Zelfde met een open onderhoudsblok: blok 3341 aangemaakt, verhuur 3340 opgehaald en teruggebracht → voertuig `available` / `in_service`; `GET /api/vehicles/available` verbergt de auto wél, maar `POST /api/reservations` voor dezelfde periode → 201 id 3342 (BUG-018 herbevestigd). (5) Guard-bypass: `PATCH /api/vehicles/1762 {"availabilityStatus":"not_for_rental"}` → 200; `POST /api/reservations/3342/pickup` → **400** "Cannot pickup vehicle that is marked as \"not for rental\"." (correct); maar `PATCH /api/reservations/3342/status {"status":"picked_up"}` → **200** met de auto op `not_for_rental`.
- **Expected:** een voertuig met `needs_fixing`, met `maintenance_status` `in_service`/`scheduled`, of met een open onderhoudsblok in die periode gaat niet zonder expliciete override naar een klant; een handmatige `needs_fixing` overleeft een verhuurcyclus (de returncode probeert dat al); élk pad dat een reservering naar `picked_up` brengt past dezelfde guard toe.
- **Actual:** alleen `not_for_rental` wordt geblokkeerd, en alleen op `/pickup`. De pickup overschrijft `needs_fixing` met `rented`, waardoor de "bewaar de handmatige status"-tak bij de return niets meer ziet en `available` schrijft. Het `/status`-endpoint doet geen enkele voertuigstatuscontrole.
- **Root cause:** `server/vehicle-status-helper.ts` `getStatusOnPickup()` — alleen `currentStatus === 'not_for_rental'` geeft `allowed:false`, al het overige geeft `newStatus 'rented'`; `server/database-storage.ts:1700-1706` (`pickupReservation`) schrijft die status over `needs_fixing` heen en kijkt nooit naar `maintenanceStatus` of naar onderhoudsblokken; `server/database-storage.ts:1777-1782` (`returnReservation`) bewaart `needs_fixing`/`not_for_rental` alleen als dat nog de huidige status is; `server/routes.ts:3230-3445` (`PATCH /api/reservations/:id/status`) gaat naar `picked_up` zonder `getStatusOnPickup` aan te roepen.
- **Affected files:** `server/vehicle-status-helper.ts`, `server/database-storage.ts:1640-1790`, `server/routes.ts:3230-3445`
- **Affected data:** voertuig 1762 doorliep `available → needs_fixing/in_service → rented → available/in_service`; reserveringen 3339, 3340, 3342.
- **Security impact:** geen.
- **Business impact:** een auto met kapotte remmen, schade of een ontbrekende APK kan via de normale baliestroom meegegeven worden; na terugkomst spreken de twee statusvelden elkaar tegen (`available` naast `in_service`) en staat de auto in statusgestuurde overzichten weer als verhuurbaar. Zelfde klasse als BUG-018 (boeken), maar nu op het moment van de fysieke overdracht.
- **Fix proposal:** breid `getStatusOnPickup(currentStatus, vehicle, context)` uit zodat `needs_fixing`, `maintenanceStatus` `in_service`/`scheduled` en een overlappend open onderhoudsblok worden geweigerd tenzij een expliciete override (vlag/wachtwoord) meekomt; bewaar de pre-pickupstatus in een kolom zodat de return hem terugzet; laat `PATCH /:id/status` dezelfde guard aanroepen bij doelstatus `picked_up`, of verbied `picked_up` via `/status` en dwing `/pickup` af.
- **Regression test:** zet `needs_fixing` + `in_service`, probeer `/pickup` en `/status {picked_up}` → beide 4xx; na een override-pickup + return is `availability_status` nog steeds `needs_fixing` terwijl `maintenance_status` `in_service` is.

#### BUG-110 — Voertuig verwijderen en terugzetten is geen getrouwe round trip: vijf koppelingstypen verdwijnen zonder melding, en `delete-impact` telt ze niet
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** V9-004 (MEDIUM) + R10-012 (MEDIUM) + T11-004 (HIGH) + D12-006 (MEDIUM) — *samengevoegd, severity genormaliseerd naar HIGH*
- **Feature:** Prullenbak — `deleteVehicle` / `getVehicleDeleteImpact` / `restoreDeletedRecord`
- **Reproduction:**
  - *V9-004 (`p9-02-delete-restore.cjs` 1-5, `p9-out-02.txt`):* fixtures op voertuig 1762 vóór de delete: reservering 3367 met chauffeur 858 (`reservation_driver_assignments` id 290); `apk_date_changes` id 10 (pending, `new_apk_date` 2027-10-01); `fines` id 512 (vehicle 1762, reservation 3338, customer 1275); `vehicle_transports` 41 (voertuig 1762, reservering 3367) en 42 (voertuig 1764, `related_vehicle_id` 1762, `spare_reservation_id` 3369). Na `DELETE` + `POST /api/deleted-records/36/restore`: `reservation_driver_assignments where reservation_id=3367` → `[]`; `apk_date_changes where vehicle_id=1762` → `[]`; `fines` 512 → `vehicle_id NULL, reservation_id NULL`; `vehicle_transports` 42 → `related_vehicle_id NULL, spare_reservation_id NULL` terwijl `spare_required` nog `true` is; reservering 3369 staat er nog maar niets wijst er meer naar. `deleted_records.payload`-sleutels: vehicle, reservations, documents, expenses, damageChecks, waitlist, transports, blacklist — geen van de vier bovenstaande tabellen.
  - *R10-012 (`p10-g-sequence.cjs`):* reservering 3437 met chauffeur 161 en open `reservation_driver_assignments` 301. `DELETE /api/vehicles/1810 {confirmLicensePlate:"AU-133-X"}` → 200; `POST /api/deleted-records/48/restore` → 200: reservering 3437 terug (chauffeur-id intact), documenten 312/313 terug, maar `reservation_driver_assignments where reservation_id=3437` → `[]` en de portaal-`driverHistory` is leeg.
  - *T11-004 (`p11-transport.cjs` T11/T12):* transport #48 (origineel vI, vervanger vD, vervangingsreservering #3381 opgehaald). (a) `GET /api/vehicles/<vD>/delete-impact` → `transports: 0`; na `DELETE` staat transport #48 als TBD (`spareReservation` undefined) en het afronden ervan maakt een gloednieuwe TBD-placeholder #3382. (b) Na restore: reservering #3381 terug (`picked_up`, `replacement_for_transport_id=48`), maar transport #48 houdt `related_vehicle_id=null, spare_reservation_id=3382` — **twee vervangersrijen voor één transport**, waarvan de echte, opgehaalde niet meer vanuit het transport bereikbaar is. (c) Het origineel verwijderen cascadeert de transportrij weg en zet `replacement_for_transport_id=null` op #3381/#3382; de restore zet het transport terug met `spare_reservation_id=3382` maar de terugverwijzingen blijven null (sweep F8 → transport 48).
  - *D12-006 (test a2):* voertuig 1790 met reservering 3408, transport 54 (ánder voertuig) met `reservation_id` 3408, boete 513, `apk_date_changes` 12, `reservation_driver_assignments` 295, document 306 (`reservation_id` 3408, `vehicle_id` null), `scan_events` 81. Na `DELETE` (200) + restore (200): `vehicle_transports.reservation_id`, `fines.vehicle_id` en `fines.reservation_id` blijven **NULL** (SET NULL vuurde tijdens de delete), `apk_date_changes` 12 en toewijzing 295 zijn **weg** (CASCADE), `scan_events` 81 wees ertussenin naar een niet-bestaand voertuig, document 306 raakte los en werd geteld als `relatedCounts.documents = 0`. Aanvullend (test a1): een `interactive_damage_checks`-rij op een **ander** voertuig die naar een reservering van dit voertuig verwijst, laat de hele delete klappen met een rauwe 500 (FK NO ACTION).
- **Expected:** "restorable: true" betekent dat alles wat verdwijnt terugkomt; en minimaal moet `delete-impact` tonen wat definitief verloren gaat.
- **Actual:** rijen die Postgres via FK-acties verwijdert of losknipt worden niet geteld, niet gesnapshot en niet hersteld: `reservation_driver_assignments` (CASCADE via reservations), `apk_date_changes` (CASCADE via vehicles), `fines.vehicle_id`/`fines.reservation_id` (SET NULL), `vehicle_transports.reservation_id`/`related_vehicle_id`/`spare_reservation_id` van **andere** voertuigen (SET NULL), en reservering-gekoppelde documenten.
- **Root cause:** `server/database-storage.ts:535-618` `deleteVehicle` snapshot een handmatig lijstje van zeven tabellen, geselecteerd op `vehicleId` (:546-575, transporten op :561); `shared/schema.ts:521` (`reservation_driver_assignments.reservation_id` CASCADE), `:1277` (`apk_date_changes.vehicle_id` CASCADE), `:564`/`:575` (`fines` SET NULL), `:1573`/`:1591`/`:1599` (`vehicle_transports`) werken stil; `restoreDeletedRecord` (:637-725, herinsert :663-715) kan alleen terugzetten wat gesnapshot is; `getVehicleDeleteImpact` (:498-533) telt dezelfde zeven tabellen en documenten alleen op `vehicleId`.
- **Affected files:** `server/database-storage.ts:498-725`; `shared/schema.ts:521, 564, 575, 1277, 1573, 1591, 1599`
- **Affected data:** `reservation_driver_assignments` 290 en 295 en 301 (weg), `apk_date_changes` 10 en 12 (weg), `fines` 512 en 513 (losgekoppeld), `vehicle_transports` 42 en 54 (vervanger-/verhuurlink kwijt), reserveringen 3369 (weesvervanger), 3381/3382 (twee vervangers op transport 48), document 306.
- **Security impact:** geen.
- **Business impact:** precies het scenario van het incident van 2026-08-25. Na een verkeerde delete + restore is de chauffeur op een toekomstige verhuur weg, een openstaande RDW-APK-wijziging verdwenen tot de volgende nachtelijke scan, een verkeersboete niet meer aan de juiste verhuur toe te rekenen (alleen de klant-id overleeft), en een wisseltransport voor een ánder voertuig raakt zijn vervanger kwijt terwijl het nog "vervanger vereist" zegt. Het transport toont daarna "TBD vervanger", de echte overdracht is onzichtbaar en er verschijnt een dubbele TBD-placeholder die om een tweede auto vraagt. De beheerder die de restore doet ziet niets van dit alles.
- **Fix proposal:** snapshot élke FK-afhankelijke rij — expliciet opsommen of via `information_schema`: `reservation_driver_assignments` voor de gesnapshotte reservering-id's, `apk_date_changes`, `fines` die naar het voertuig of de reserveringen verwijzen, transporten die het voertuig via `related_vehicle_id`/`spare_reservation_id` raken, reservering-gekoppelde documenten — en herstel/herkoppel ze in `restoreDeletedRecord`; tel ze mee in `delete-impact`; vang FK-fouten af met een 409 die de blokkerende tabel noemt in plaats van een rauwe 500. Het maken van `reservations.vehicle_id` tot een echte FK met een gedocumenteerde cascade vraagt goedkeuring (zie §7).
- **Regression test:** bouw de fixture hierboven, verwijder en herstel, en assert rij-voor-rij gelijkheid (id's én FK-kolommen) voor alle negen tabellen; transport met een opgehaalde vervanger → vervangervoertuig verwijderen → herstellen → `related_vehicle_id`, `spare_reservation_id` en de terugverwijzing identiek, geen extra placeholder; delete met een vreemde damage check → 409 met melding, geen 500.

#### BUG-111 — `PATCH /api/reservations/:id` valideert datums, tijden en `type` niet: onzin- en omgekeerde datums worden opgeslagen
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** R10-003
- **Feature:** Reservering bewerken via het pad dat het reserveringsformulier zelf gebruikt
- **Reproduction:** (`p10-a-patch-diff.cjs`, `p10-b-dates.cjs` B2/B5, `p10-i-status.cjs` I7) `PATCH /api/reservations/3345` met achtereenvolgens `{"startDate":"not-a-date"}` → 200 en `start_date='not-a-date'` in de DB; `{"endDate":"2027-02-01"}` (vóór de start 2027-03-01) → 200 en opgeslagen; `{"startTime":"25:99"}` → 200; `{"endTime":"garbage"}` → 200; `{"type":"garbage"}` → 200 en opgeslagen. Dezelfde bodies op `/basic` → **400** "Invalid reservation data". Gevolg van een omgekeerd bereik: reserveringen 3361 (start 2015-01-01, eind 2014-12-25) en 3364 (start 2026-09-20, eind 2026-09-05) ontbreken in `GET /api/reservations/range?startDate=<start>&endDate=<eind>` terwijl ze wél in de lijst, byVehicle, byCustomer en de overdue-guard staan. I7: `endDate` `'not-a-date'` "conflicteert" alleen doordat tekstvergelijking `'n'` na `'2'` sorteert.
- **Expected:** dezelfde validatie als bij create en `/basic` (YYYY-MM-DD, HH:MM, `endDate >= startDate`, `type` uit de enum), 400 bij overtreding.
- **Actual:** geen enkele validatie; de datumkolommen zijn `text`, dus alles wordt opgeslagen.
- **Root cause:** `server/routes.ts:3600-3602` (rauwe body, commentaar "bypass full schema validation and just use the raw data"); de datumkolommen van `reservations` in `shared/schema.ts` zijn `text`.
- **Affected files:** `server/routes.ts`, `shared/schema.ts`
- **Affected data:** reserveringen 3361, 3364 (omgekeerd), 3365 (`end_date '2099-13-45'`), 3442 (`end_date 'not-a-date'`) in `lvs_audit`.
- **Security impact:** geen direct.
- **Business impact:** één typefout in het bewerkformulier levert stilzwijgend een reservering op die de kalender niet kan tonen, die de overdue-guard als te laat beschouwt en waarvan de conflicten met stringvergelijking beoordeeld worden.
- **Fix proposal:** draai `insertReservationSchema.partial()` (plus de datumvolgorde-refine op de samengevoegde rij) binnen `PATCH /:id`; voeg na het opschonen van de bestaande rijen een DB-CHECK toe (`end_date IS NULL OR end_date >= start_date`).
- **Regression test:** `PATCH {endDate:'not-a-date'}` → 400; `PATCH {endDate: start-1}` → 400.

#### BUG-112 — Annuleren van een reservering cascadeert niet: transport blijft gepland, chauffeurstoewijzing open, vervanger en placeholder actief
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** R10-005
- **Feature:** Annuleren (`PATCH /api/reservations/:id/status {cancelled}`, en dezelfde uitkomst via `PATCH /:id` en `/basic`)
- **Reproduction:** (`p10-d-cancel.cjs` D1, D4, D5) (1) reservering 3429 (`AU-115-X`, chauffeur 161, `deliveryRequired` → `vehicle_transports` 56 `scheduled`); `mark-needs-service` + `assign-spare` → vervanger 3430 op reservevoertuig `AU-116-X` (`pending` / `spare_vehicle_status 'assigned'`); placeholder 3431; contractdocument 309. (2) `PATCH /api/reservations/3429/status {"status":"cancelled"}` → 200. (3) Daarna: transport 56 nog steeds `scheduled`; chauffeurstoewijzing 161 nog open; 3430 nog `pending`/`assigned` en reservevoertuig 1748 nu `scheduled` (`check-conflicts` op `AU-116-X` → `[3430]`); 3431 staat nog in `GET /api/placeholder-reservations/needing-assignment`; `GET /api/reservations/3429/active-replacement` → 200 met de placeholder. (4) Zelfde uitkomst via het formulierpad (D4: transport 57 blijft `scheduled`) en via `/basic` (D5: transport 58).
- **Expected:** annuleren sluit de open chauffeurstoewijzing, annuleert (niet: verwijdert) het automatisch aangemaakte bezorgtransport — wat de DELETE-route en `deleteReservation` al doen — en annuleert/soft-delete de vervangings- en placeholderreserveringen (wat de DELETE-route al doet voor onderhoudsblokken).
- **Actual:** het status-endpoint schrijft alleen `status`/`updatedBy` en draait de voertuigsync; `syncDeliveryTransport` in `updateReservation` reageert niet op statuswijzigingen.
- **Root cause:** `server/routes.ts:3230-3445` (status-endpoint: alleen de schrijfactie op 3408 en de sync op 3415, geen cascade); `server/database-storage.ts:1209-1250` (`syncDeliveryTransport` keyt alleen op `deliveryRequired`).
- **Affected files:** `server/routes.ts`, `server/database-storage.ts`
- **Affected data:** `vehicle_transports` 56/57/58, reserveringen 3430/3431 (nog actief voor een geannuleerde verhuur).
- **Security impact:** geen.
- **Business impact:** er wordt een chauffeur op pad gestuurd om een geannuleerde verhuur te bezorgen; een reserveauto blijft geblokkeerd voor een klant die geannuleerd heeft; de placeholder blijft om een auto vragen.
- **Fix proposal:** annuleer in het status-endpoint (en in elk pad dat `cancelled` zet) de niet-afgeronde transporten van de reservering, sluit de chauffeurstoewijzingen en annuleer/soft-delete de vervangings- en placeholderkinderen — hergebruik het blok uit de DELETE-route.
- **Regression test:** annuleer een reservering met transport + vervanger + placeholder; assert transport `cancelled`, vervanger en placeholder geannuleerd/verwijderd, `needing-assignment` leeg.

#### BUG-113 — Normaal ingeleverde verhuur (`returned`) telt na drie dagen als "te laat" en blokkeert elke toekomstige boeking op dat voertuig
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** R10-006 — *verlengt BUG-040 (zelfde guard, andere statuswaarde)*
- **Feature:** Retour versus de overdue-guard bij het aanmaken van een reservering
- **Reproduction:** (`p10-c-pickedup-status.cjs` C2a, `p10-i-status.cjs` I1/I2) (1) reservering 3384 op `AU-113-X`: pickup, daarna `POST /return` met `returnDate` vandaag−5 → status `returned`, `end_date` vandaag−5. `POST /api/reservations {vehicleId:1745, startDate: vandaag+30, endDate: vandaag+32}` → **409** "This vehicle has overdue reservations that must be resolved first", met 3384 in de lijst. Na `PATCH /3384/status {completed}` → dezelfde POST → 201. (2) In de kloon: 7 `returned`-rijen ouder dan drie dagen op 7 voertuigen (313/13XT103, 525/99XT279, 1438/14XT284, …); een boeking in 2028 op de eerste drie → 409 met de `returned`-rij als "overdue". (3) De guard blokkeert op dit moment: `booked` 376 rijen op 255 voertuigen (BUG-040), `picked_up` 352/254 (echt te laat), `active` 40/39, `returned` 7/7, `scheduled` 4/4, `in` 1/1.
- **Expected:** een reservering die via de eigen returnflow is ingeleverd, is afgerond en telt niet als te laat. De enige statussen die "de klant heeft de auto nog" betekenen zijn `picked_up` (en het legacy `active`).
- **Actual:** `getOverdueReservationsByVehicle` sluit alleen `completed` en `cancelled` uit, en niets zet `returned` ooit automatisch op `completed`; elke normale retour wordt op dag 4 een boekingsblokkade. Het reserveringsformulier omzeilt dit met een overdue-dialoog waarvan de knop "markeer als afgerond" BUG-019 triggert.
- **Root cause:** `server/database-storage.ts:1515-1516` (statusfilter); `server/routes.ts:2622-2632` (guard).
- **Affected files:** `server/database-storage.ts`, `server/routes.ts`
- **Affected data:** reserveringen 313, 525, 1438, 1517, 3227 (+2) blokkeren vandaag hun voertuig in `lvs_audit` — **aantallen te herverifiëren in productie**.
- **Security impact:** geen.
- **Business impact:** auto's vallen een paar dagen na elke retour stilletjes uit de verhuurbare vloot tenzij personeel ze óók nog "afrondt"; API- en portaalboekingen krijgen een harde 409.
- **Fix proposal:** sluit `returned` uit in de guard (behandel het als eindstatus), of laat `POST /return` direct `completed` schrijven (zie BUG-128).
- **Regression test:** pickup + return (`returnDate` vandaag−5), daarna een toekomstige boeking → 201.

#### BUG-114 — De datum van een transport wijzigen laat de vervangingsreservering op de oude dag staan
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-001
- **Feature:** Gepland transport — `scheduledDate` wijzigen (`PATCH /api/transports/:id`)
- **Reproduction:** (`p11-transport.cjs` T2, `p11-extra.cjs` X1/X3) maak een swaptransport met vervanger (transport #51: origineel vE, vervanger vC, `scheduledDate` 2026-09-17 → vervangingsreservering #3404 op vC 2026-09-17..17). `PATCH /api/transports/51 {"scheduledDate":"2026-09-19"}` → 200. `select start_date,end_date from reservations where id=3404` → **2026-09-17 / 2026-09-17** (idem in T2: transport #44 09-20 → 09-23, reservering #3377 blijft op 09-20). Vervolgens `POST /api/transports {vehicleId: vK, scheduledDate:"2026-09-19", spareRequired:true, relatedVehicleId: <dezelfde vervanger>}` → **201**.
- **Expected:** de vervangingsreservering volgt de transportdag (of de verplaatsing wordt geweigerd als de vervanger dan bezet is); het tweede transport dat dezelfde vervanger op 2026-09-19 claimt wordt met 409 geweigerd, zoals T9 dat voor dezelfde dag wél laat zien.
- **Actual:** het transport verhuist, de reservering blijft staan; de vervangende auto is op de transportdag dubbel geboekt en op een dag waarop niets gebeurt onnodig geblokkeerd.
- **Root cause:** `server/database-storage.ts:2025-2221` `applyTransportUpdate` heeft geen tak voor `changes.scheduledDate`; het spreidt `...changes` alleen in de `vehicle_transports`-update (2208-2218). `startDate`/`endDate` van de vervangingsreservering worden eenmalig bij creatie gezet (2148-2149) en bij een herbenoeming wordt alleen `vehicleId` aangeraakt (2089-2091).
- **Affected files:** `server/database-storage.ts` (`applyTransportUpdate`), `server/routes.ts:7438-7471`
- **Affected data:** `reservations` (type `replacement`, `replacementForTransportId`) van elk transport waarvan de datum na creatie is gewijzigd; `vehicles.availabilityStatus` van de vervanger. Sweep F3 staat nu op 0 rijen omdat de betrokken fixtures later in de tests zijn geannuleerd/verwijderd.
- **Security impact:** geen.
- **Business impact:** de vervangende auto staat op de verkeerde dag gereserveerd: op de transportdag kan hij aan iemand anders meegegeven worden, en op de oude dag blijft hij nodeloos "scheduled".
- **Fix proposal:** wanneer `changes.scheduledDate` afwijkt van `current.scheduledDate` en er nog een `booked` vervangingsreservering bestaat: draai `checkReservationConflicts` voor de nieuwe dag en werk `startDate`/`endDate` van de vervangingsreservering in dezelfde transactie bij; weiger de verplaatsing als de vervanger bezet of al opgehaald is.
- **Regression test:** transport met vervanger, `PATCH scheduledDate`, assert dat de datums van de vervangingsreservering gelijk zijn aan de nieuwe dag en dat een tweede transport voor dezelfde vervanger op die dag wordt geweigerd.

#### BUG-115 — Een transport annuleren laat de vervangingsreservering geboekt en de reserveauto geblokkeerd
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-002
- **Feature:** Transport annuleren (`PATCH /api/transports/:id {"status":"cancelled"}`)
- **Reproduction:** (`p11-transport.cjs` T9 — transport #46: vE, vervanger vJ, 2026-09-15; `p11-extra.cjs` X3 — transport #51) `PATCH /api/transports/46 {"status":"cancelled"}` → 200. Daarna `POST /api/transports {vehicleId: vK, scheduledDate:"2026-09-15", spareRequired:true, relatedVehicleId: vJ}` → **409** "Replacement vehicle has conflicting reservations for this date". SQL: transport #46 `status='cancelled'`, vervangingsreservering #3380 nog `status='booked'` met `replacement_for_transport_id=46`, vJ nog `availability_status='scheduled'`, en de reservering staat nog in `GET /api/reservations/range`. Alleen de onderhoudsvlag van het originele voertuig wordt gereset. Ook `cancelled → scheduled` en `completed → in_progress` worden geaccepteerd (BUG-136).
- **Expected:** annuleren geeft de vervanger vrij — reservering #3380 geannuleerd/soft-deleted, vJ terug naar `available`, een ander transport mag vJ die dag gebruiken. Dat is exact wat `DELETE /api/transports/:id` al doet voor een `booked` vervanger.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:2182-2201` — `closingNow` stuurt alleen `markVehicleForService(..., 'ok')` aan; niets raakt `spareReservationId` aan bij `completed`/`cancelled`.
- **Affected files:** `server/database-storage.ts` (`applyTransportUpdate`)
- **Affected data:** `reservations` (vervangersrijen van geannuleerde transporten), `vehicles.availabilityStatus` van de vervanger.
- **Security impact:** geen.
- **Business impact:** elk geannuleerd transport blokkeert een reserveauto voor die dag totdat iemand de weesreservering handmatig terugvindt en verwijdert; het scherm "Beheer vervangende voertuigen" en de kalender blijven een vervanger tonen voor een transport dat nooit plaatsvindt.
- **Fix proposal:** annuleer of soft-delete bij `status → cancelled` (en voor een nog-TBD-placeholder ook bij `completed`, zie BUG-137) een `booked` vervangingsreservering binnen dezelfde transactie, naar het voorbeeld van de DELETE-route (`server/routes.ts:7490-7504`).
- **Regression test:** transport met vervanger aanmaken, annuleren, assert dat de vervangingsreservering geannuleerd/verwijderd is, de reserveauto `available` en dat een nieuw transport voor dezelfde vervanger/dag lukt.

#### BUG-116 — Het originele voertuig van een transport mag gelijk worden aan de vervanger; daarna is het transport alleen nog via een omweg te repareren
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-003
- **Feature:** Voertuigwissel op een transport — de "niet hetzelfde voertuig"-guard op `PATCH /api/transports/:id {vehicleId}`
- **Reproduction:** (`p11-transport.cjs` T6/T7, `p11-extra.cjs` X2) transport #51 heeft origineel vE en vervanger vC. `PATCH /api/transports/51 {"vehicleId": <vC id>}` → **200**: de rij heeft nu `vehicle_id = related_vehicle_id = 1753` en vervangingsreservering #3404 staat op datzelfde voertuig. Vanaf dat moment geeft elke `PATCH {vehicleId: <wat dan ook>}` **400** "Replacement vehicle cannot be the same as the original vehicle" (X2: "repair via vehicleId=vE → 400"); alleen een aanroep die óók `relatedVehicleId` wijzigt komt uit die toestand. In T6-T8 werd het gecorrumpeerde transport #44 daarna opgehaald en verwijderd, waarbij de DELETE-route vH (de toenmalige "originele") herstelde in plaats van het echte origineel vG — daarom staat vG nu nog steeds op `needs_service` met de notitie "Replacement vehicle required for transport #44" voor een transport dat niet meer bestaat (sweep H → voertuig 1757).
- **Expected:** 400 "Replacement vehicle cannot be the same as the original vehicle" — de controle die `POST /api/transports` en `PATCH {relatedVehicleId}` al afdwingen.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:2039-2041` vergelijkt `nextRelatedVehicleId` met `current.vehicleId` en nooit met `changes.vehicleId`.
- **Affected files:** `server/database-storage.ts` (`applyTransportUpdate`)
- **Affected data:** `vehicle_transports.vehicle_id`/`related_vehicle_id`, de vervangingsreservering, en `vehicles.maintenance_status`/`note` van het échte originele voertuig (blijvende vlag).
- **Security impact:** geen.
- **Business impact:** een transport kan bewaard worden waarin de auto zichzelf vervangt, de transportbrief zou tweemaal hetzelfde kenteken noemen, en de "moet naar de werkplaats"-vlag van de juiste auto blijft permanent staan wanneer dat transport later wordt afgerond of verwijderd.
- **Fix proposal:** bereken `nextVehicleId = changes.vehicleId ?? current.vehicleId` en vergelijk dat met `nextRelatedVehicleId`; valideer hetzelfde in de refinement van `insertVehicleTransportSchema`.
- **Regression test:** `PATCH vehicleId` gelijk aan de huidige `relatedVehicleId` → 400; daarna `PATCH vehicleId` naar een ander voertuig → 200.

#### BUG-117 — Goedkeuring van een portaal-onderhoudswijziging laat een al toegewezen vervanger op de oude datum staan en maakt een tweede placeholder
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-005
- **Feature:** `POST /api/portal-requests/:id/approve` voor het type `maintenance_change`
- **Reproduction:** (`p11-portal.cjs` P4-P5) blok #3343 (2026-09-16..18) heeft zijn placeholder al ingevuld: vervanger #3344 op vB, 2026-09-16..18. De klant dient `maintenance_change` in (`{newDate: 2026-09-23, needsReplacement: true}`); kantoor keurt goed met `{startDate: 2026-09-23, durationDays: 2}`. Resultaat: het blok verhuist naar 2026-09-23..24, maar vervanger #3344 blijft `booked` op vB voor 2026-09-16..18 (dagen waarop geen onderhoud meer is; vB blijft `scheduled`), en er komt een **nieuwe** TBD-placeholder #3348 voor 2026-09-23..24 bij → verhuur #3335 heeft twee live vervangers tegelijk en `needing-assignment` vraagt om een tweede auto. De klant kreeg eerst `replacement_ready` voor vB en daarna `maintenance_moved`, zonder één woord dat de vervanger niet meer geldt.
- **Expected:** de toegewezen vervanger verhuist mee (na een conflictcontrole) of de goedkeuring wordt geweigerd/gemarkeerd; één live vervanger per verhuur.
- **Actual:** zie boven.
- **Root cause:** `server/routes/portal-requests.ts:375` zoekt uitsluitend rijen met `placeholderSpare = true`; is de placeholder al toegewezen (`placeholderSpare=false`), dan vindt hij niets en maakt `ensurePlaceholderSpare` (383-385) een nieuwe. Toegewezen vervangers worden nergens opnieuw gedateerd.
- **Affected files:** `server/routes/portal-requests.ts` (`approveMaintenanceChange` 349-393, `ensurePlaceholderSpare` 275-299)
- **Affected data:** `reservations` (type `replacement`) van verhuringen waarvan het blok is verplaatst nadat een vervanger was toegewezen; `vehicles.availabilityStatus` van de oude vervanger.
- **Security impact:** geen.
- **Business impact:** een reserveauto staat geblokkeerd op dagen waarop hij niet nodig is, er wordt een tweede auto gevraagd voor de echte dagen, en de klant krijgt tegenstrijdige meldingen.
- **Fix proposal:** selecteer élke live vervanger van de verhuur (toegewezen óf placeholder); bij een toegewezen vervanger de conflictcontrole op de nieuwe periode draaien en de datums bijwerken (of 409 met het verzoek aan kantoor om opnieuw toe te wijzen); maak alleen een placeholder wanneer er nog geen is.
- **Regression test:** goedkeuren → vervanger toewijzen → wijziging goedkeuren; assert exact één live vervanger voor de verhuur, gedateerd op de nieuwe blokperiode.

#### BUG-118 — Een onderhoudsblok verwijderen wist de vervangers van een **ander** blok; een blok vóór de verhuurstart laat zijn eigen placeholder juist staan
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-006 — *verlengt BUG-014 met de verkeerde-blok-cascade*
- **Feature:** `DELETE /api/reservations/:id` op een onderhoudsblok — de vervangeropruiming
- **Reproduction:** (`p11-portal2.cjs` Q4/Q5) voertuig vA heeft twee live blokken voor verhuur #3335: #3343 (met toegewezen vervanger #3344 op vB en placeholder #3348) en #3358 (in P10 aangemaakt, dezelfde datums). `DELETE /api/reservations/3358` soft-delete **#3344 én #3348** — beide hoorden bij het nog levende blok #3343 — zodat #3343 nu gepland staat zónder vervanger, `needing-assignment` leeg is en verhuur #3335 nog steeds `spare_assignment_decision='spare_assigned'` zegt (sweep I → 3335). Tweede geval: blok #3353 (2026-09-03..04, portaal-goedgekeurd in het verleden) met placeholder #3354 voor verhuur #3336 (gestart 2026-09-10, opgehaald); `DELETE /api/reservations/3353` laat placeholder #3354 **onaangeroerd** (`deleted_at` null, `booked`, datums in het verleden) — sweep B toont 3354 nu naast de twee al bestaande verlopen placeholders 1533/1549.
- **Expected:** het verwijderen van blok #3358 raakt alleen wat bij #3358 hoort; blok #3343 houdt zijn vervanger. Het verwijderen van #3353 verwijdert zijn eigen placeholder #3354.
- **Actual:** zie boven.
- **Root cause:** `server/routes.ts:4648-4697` — de cascade verzamelt "betrokken verhuringen" puur op datumoverlap tussen het blok en elke standaardverhuur op het voertuig (4659-4669) en verwijdert vervolgens élke vervanger van die verhuringen (4675-4680), ongeacht welk blok ze heeft aangemaakt; en omdat het overlapfilter de `startDate` van de verhuur gebruikt, wordt een opgehaalde verhuur die ná een (verlopen) blok begon niet gematcht, terwijl `ensurePlaceholderSpare`/`clipToRental` (`portal-requests.ts:268-272`) de start van een opgehaalde verhuur juist bewust negeert bij het aanmaken van de placeholder.
- **Affected files:** `server/routes.ts` (`DELETE /api/reservations/:id`), `server/routes/portal-requests.ts` (`clipToRental`)
- **Affected data:** `reservations` (vervangersrijen) van elk voertuig met meer dan één blok, of met een blok dat vóór de verhuurstart valt.
- **Security impact:** geen.
- **Business impact:** het opruimen van een dubbel of oud blok boekt stilzwijgend de reserveauto van het échte onderhoud weg (de klant staat zonder auto), terwijl verlopen placeholders eeuwig als "moet toegewezen worden" blijven staan.
- **Fix proposal:** koppel vervangers aan hún blok (bijvoorbeeld `affectedRentalId` + periode op het blok vastleggen en vervangers matchen op `replacementForReservationId` **én** periode, of een `maintenanceBlockId`-kolom op vervangersrijen) en cascadeer alleen die; gebruik dezelfde "opgehaald negeert de start"-regel als `clipToRental`.
- **Regression test:** twee blokken op één verhuur, verwijder er één → de vervangersrijen van het andere blok zijn ongewijzigd; verlopen blok met placeholder op een opgehaalde verhuur → verwijderen → placeholder verwijderd.

#### BUG-119 — De contract-PDF-endpoints leveren een blanco contract voor een TBD-placeholder en voor een onderhoudsblok, inclusief een documentrij
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** T11-007
- **Feature:** `GET /api/contracts/generate/:id`, `GET /api/contracts/generate-default/:id`, `GET /api/contracts/data/:id`
- **Reproduction:** (`p11-extra.cjs` X5) `GET /api/contracts/generate/3357` (TBD-placeholder: `vehicle_id null`, `placeholder_spare true`, voor een geannuleerde verhuur), `GET /api/contracts/generate/3382` (TBD-placeholder, `customer_id null`) en `GET /api/contracts/generate-default/3343` (onderhoudsblok) geven alle drie **200 `application/pdf`** (~294 KB). `GET /api/contracts/data/3357` toont wat er gedrukt wordt: `"licensePlate":"","brand":"","model":"","chassisNumber":""` met een ter plekke verzonnen contractnummer `C-3357-20260910`. `generate-default/3343` schrijft bovendien documentrij #299 "Contract (Unsigned)" `AU11AX_contract_20260910.pdf` **vast aan het onderhoudsblok** (routes.ts:6040-6056). Er wordt geen `contractNumber` teruggeschreven naar de reservering. De routes zijn alleen `requireAuth`. Ter vergelijking: `POST /api/contracts/generate-versioned/:id` antwoordt op alle drie correct met 400 "Vehicle ID and Customer ID are required".
- **Expected:** 400/409 — een contract vereist een echt voertuig en een echte klant, en een onderhoudsblok is geen verhuur.
- **Actual:** zie boven.
- **Root cause:** `server/routes.ts:5451-5470` en `5963-5990` controleren alleen of de reservering bestaat; geen guard op `type`, `placeholderSpare`, `vehicleId` of `customerId`, in tegenstelling tot `generate-versioned` (5798).
- **Affected files:** `server/routes.ts` (`contracts/generate`, `generate-default`, `data`)
- **Affected data:** `documents` (onterechte "Contract (Unsigned)"-rijen op blokken/placeholders), gegenereerde PDF's op schijf.
- **Security impact:** laag — elk geauthenticeerd medewerkersaccount kan een blanco contract-PDF met een plausibel contractnummer aanmaken.
- **Business impact:** een contract dat er echt uitziet maar lege kenteken-/voertuigvelden heeft, of dat aan een onderhoudsblok hangt, kan uitgereikt of gearchiveerd worden alsof het geldig is — precies in strijd met de "geen document zolang het voertuig TBD is"-regel die `generate-report` wél afdwingt.
- **Fix proposal:** weiger met 400 wanneer `reservation.type` niet `standard` of `replacement` is, of wanneer `placeholderSpare` waar is of `vehicleId`/`customerId` null; deel de guard met `generate-versioned`; voeg een permissiecheck toe in lijn met de andere documentroutes.
- **Regression test:** roep de drie GET-endpoints aan op een placeholder en op een onderhoudsblok → 400 en geen `documents`-rij.

#### BUG-120 — Pickup schrijft de reservering vóór de voertuigcontrole en zonder transactie: bij een 400 blijft de verhuur `picked_up` met een verbrand contractnummer
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** D12-001
- **Feature:** Reservering ophalen (`POST /api/reservations/:id/pickup`)
- **Reproduction:** (test b1) voertuig `AU-12E-X` (1792) op `availability_status='not_for_rental'`; reservering 3409 `booked` vandaag; `POST /api/reservations/3409/pickup {contractNumber:"AUDIT-P12-3409", pickupMileage:5000, fuelLevelPickup:"full"}` → **400** "Cannot pickup vehicle that is marked as not for rental" — maar de `reservations`-rij is nu `status='picked_up'`, `contract_number='AUDIT-P12-3409'`, `pickup_mileage=5000`, `actual_pickup_date` gezet; de `vehicles`-rij is ongewijzigd (`current_mileage` 1000, niet `rented`); geen contractdocument. Opnieuw proberen → 400 "Only 'booked' reservations can be picked up". Herstel lukte alleen via `PATCH /status {booked}` (de omgekeerde allow-list), wat de velden wiste.
- **Expected:** 400 en géén wijziging: reservering blijft `booked`, contractnummer ongebruikt, voertuig onaangeroerd.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:1662-1713` — `pickupReservation` schrijft de reservering (:1662) vóórdat `getStatusOnPickup` wordt geëvalueerd (:1699-1703) en het voertuig wordt bijgewerkt (:1709); geen `db.transaction`. `returnReservation` (:1751-1786) heeft dezelfde vorm. De route (`server/routes.ts:4067-4245`) draait bovendien de contractnummer-override en de PDF-/documentstap buiten elke transactie.
- **Affected files:** `server/database-storage.ts`, `server/routes.ts`, `server/vehicle-status-helper.ts`
- **Affected data:** 1 auditrij (3409, teruggedraaid via `PATCH /status`). Kandidaten in de kloon: de 8 voertuigen `rented` zonder opgehaalde verhuur en de 62 voertuigen met een opgehaalde verhuur maar zonder `rented` passen bij half uitgevoerde pickups/returns, maar zijn zonder logs niet toe te wijzen — **te herverifiëren in productie**.
- **Security impact:** geen direct.
- **Business impact:** een verhuur waarvan de balie denkt dat hij mislukt is, staat geregistreerd als overgedragen; de auto blijft ondertussen als beschikbaar staan; de volgende legitieme pickup mislukt op de status; en de contractnummerreeks krijgt een gat.
- **Fix proposal:** wikkel `pickupReservation`/`returnReservation` in `db.transaction` en evalueer `getStatusOnPickup` en de kilometerregel vóór élke schrijfactie (of schrijf het voertuig eerst); maak de documentstap in de route onderdeel van de transactie of introduceer een expliciete "contract pending"-toestand.
- **Regression test:** `not_for_rental`-voertuig + `booked` reservering → pickup → 400 en `reservation.status='booked'`, `contract_number` null, voertuig ongewijzigd; daarna voertuig op `available` → pickup → 200 met documentrij.

#### BUG-121 — `maintenance-with-spare` controleert de vervangertoewijzingen binnen één payload niet tegen elkaar: dezelfde reserveauto voor twee klanten
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** D12-003 — *bewust **niet** verhoogd naar CRITICAL: vereist een payload waarin de planner zichzelf tegenspreekt*
- **Feature:** `POST /api/reservations/maintenance-with-spare`
- **Reproduction:** (test c2) voertuig 1794 met verhuringen 3411 (klant 1277) en 3412 (klant 1278); `POST maintenance-with-spare` met twee `spareVehicleAssignments`, beide `{spareVehicleId:1795, startDate:S, endDate:S+9}` → **201**: blok 3413 plus vervangers 3414 en 3415, beide op voertuig 1795 met identieke datums voor twee verschillende klanten. Aanvullend (test c3): met `spareVehicleId: 98765432` → **201** en vervanger 3418 op een niet-bestaand voertuig (BUG-039). Ter vergelijking (test c1): een verwijzing naar reservering 99999999 → 400 "Reservation 99999999 not found" met nul schrijfacties — de prevalidatie draait wél vóór elke schrijfactie.
- **Expected:** 409 voor de tweede toewijzing (vervanger 1795 is in hetzelfde verzoek al geclaimd); niets weggeschreven.
- **Actual:** zie boven.
- **Root cause:** `server/routes.ts:2818-2915` valideert elke toewijzing met `storage.checkReservationConflicts` tegen de **database** (`Promise.all`, :2898-2909) en nooit tegen de andere toewijzingen in dezelfde payload; het aanmaken (:2960-3042) voegt daarna in zonder hercontrole en zonder transactie.
- **Affected files:** `server/routes.ts`
- **Affected data:** auditrijen 3413/3414/3415 en 3418.
- **Security impact:** geen.
- **Business impact:** de onderhoudsplanner kan dezelfde reserveauto aan twee klanten voor dezelfde periode toezeggen; de tweede klant staat zonder auto.
- **Fix proposal:** controleer na de prevalidatie de toewijzingen onderling (zelfde `spareVehicleId` met overlappende datums → 409) en voeg blok + vervangers in één `db.transaction` in.
- **Regression test:** twee toewijzingen met dezelfde reserveauto en overlappende datums → 409 en nul rijen; niet-overlappend → 201 met beide rijen.

### 5.3 MEDIUM

#### BUG-122 — Gelijktijdige `PATCH` op één voertuig verliest updates (read-merge-write van de hele rij)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-005
- **Feature:** Voertuig bewerken (`PATCH /api/vehicles/:id`)
- **Reproduction:** (`p9-01-lifecycle.cjs` stap C, `p9-out-01.txt`) twee sessies (admin en `AUDIT-manager-…`) vuren tegelijk, 5 rondes: S1 `PATCH /api/vehicles/1762 {"remarks":"AUDIT-S1-<i>"}`, S2 `PATCH /api/vehicles/1762 {"tireSize":"AUDIT-S2-<i>"}`. Beide krijgen elke ronde 200. SQL na elke ronde: ronde 0 `remarks=AUDIT-P9 edited / tire_size=AUDIT-S2-0` (S1 verloren), ronde 1 idem (verloren), ronde 2 idem (verloren), ronde 3 `remarks=AUDIT-S1-3 / tire_size=AUDIT-S2-2` (S2 verloren), ronde 4 `remarks=AUDIT-S1-3 / tire_size=AUDIT-S2-4` (verloren). **5 van de 5 rondes verliest één van de twee updates.**
- **Expected:** een PATCH met één veld wijzigt één kolom; twee PATCHes op verschillende velden blijven allebei staan.
- **Actual:** elk verzoek leest de rij, merget zijn eigen velden over de volledige rij en schrijft de volledige rij terug; de tweede schrijver overschrijft de kolom van de eerste met de verouderde waarde die hij zelf gelezen had.
- **Root cause:** `server/routes.ts:1140-1150` (`const existingVehicle = await storage.getVehicle(id); const mergedData = {...existingVehicle, ...sanitizedData}; const vehicleData = insertVehicleSchema.parse(mergedData);`) en `:1207` (`storage.updateVehicle(id, dataWithTracking)`, dat elke kolom van de geparste volledige rij zet). Geen transactie, geen `SELECT … FOR UPDATE`, geen versie-/`updated_at`-controle, en de update is niet beperkt tot de velden uit het verzoek.
- **Affected files:** `server/routes.ts:1082-1233`; `server/database-storage.ts` (`updateVehicle`)
- **Affected data:** voertuig 1762 `remarks`/`tire_size` (testwaarden).
- **Security impact:** geen.
- **Business impact:** twee medewerkers die binnen dezelfde seconde hetzelfde voertuig bewerken — of het formulier dat opslaat terwijl een scan/scheduler/pickup dezelfde rij bijwerkt — laten stilzwijgend één wijziging vallen. Omdat de volledige rij wordt herschreven kan het verloren veld álles zijn wat het andere verzoek niet meestuurde, inclusief `currentMileage`, `apkDate` of `availabilityStatus`. De PATCH-vs-pickup-race reproduceerde niet in 6 getimede pogingen, dus het praktische venster is de lees-naar-schrijftijd van het verzoek zelf (tientallen ms).
- **Fix proposal:** bouw de SET-lijst alleen uit de sleutels die daadwerkelijk in het verzoek zitten (valideer met `insertVehicleSchema.partial()`), of doe de read-merge-write in een transactie met `SELECT … FOR UPDATE`; optioneel optimistische concurrency op `updated_at`.
- **Regression test:** vuur tien keer twee gelijktijdige PATCHes met verschillende velden; beide kolommen houden elke keer de nieuwe waarde.

#### BUG-123 — `bulk-import-plates` maakt een voertuig met een leeg kenteken en lekt rauwe JS-foutmeldingen per rij
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-006
- **Feature:** Voertuigen — `POST /api/vehicles/bulk-import-plates`
- **Reproduction:** (`p9-03-import-race-conflicts.cjs` stap A, `p9-04-gaps.cjs` stap A) (1) `POST /api/vehicles/bulk-import-plates {"licensePlates":["AU-9P97073-A","au-9p97073-a","AU 9P97073 A","AU-901-X",12345,"","AU-9P97073-B"]}` → 200 met `imported: ["AU-9P97073-A"#1766, ""#1767, "AU-9P97073-B"#1768]` en `failed: [… {"licensePlate":12345,"error":"licensePlate.replace is not a function"}]`. SQL: `select id, license_plate, length(license_plate) from vehicles where id=1767` → `1767 / '' / 0`, merk "Unknown", barcode `VEH-001767`. (2) `GET /api/vehicles/1767` → 200 met `"licensePlate":""`; `GET /api/barcodes/VEH-001767` → 200 met kenteken `""`. (3) `["   "]` → failed "Vehicle already exists" (de spaties worden door `sanitizeInput` tot `""` getrimd en matchen het lege-kentekenvoertuig); `[null]` → "Cannot read properties of null (reading 'replace')"; `[{"licensePlate":"AU-9OBJ-X"}]` → "licensePlate.replace is not a function". (4) `DELETE /api/vehicles/1767 {"confirmLicensePlate":""}` → 200 "Vehicle successfully deleted" — de overtype-bevestiging wordt door een lege string voldaan.
- **Expected:** een leeg of alleen-witruimte kenteken wordt per rij geweigerd ("License plate is required", zoals de CSV-import al doet); niet-strings leveren een nette validatiemelding; de verplichte-veldcontrole van de losse create geldt ook hier.
- **Actual:** het platenpad heeft geen leegcontrole en roept `.replace` aan op wat er ook binnenkomt.
- **Root cause:** `server/routes.ts:862-880` (`const normalizedPlate = licensePlate.replace(/[-\s]/g, '').toUpperCase();` zonder `if (!licensePlate)`-guard; vergelijk `:921-925` in `bulk-import-csv`, dat die guard wél heeft); `storage.createVehicle` wordt aangeroepen met `licensePlate ""` wat de DB accepteert (text NOT NULL, unique — er kan er dus maar één zijn). `server/routes.ts:1641` verwerpt de bevestiging met `normalize(confirmation) !== normalize(impact.vehicle.licensePlate)`, wat voor `""` triviaal waar is.
- **Affected files:** `server/routes.ts:850-908, 1624-1691`
- **Affected data:** voertuig 1767 (leeg kenteken; in stap 4 verwijderd, staat nog in `deleted_records` en is herstelbaar).
- **Security impact:** geen.
- **Business impact:** een CSV of geplakte kentekenlijst met een lege regel maakt een naamloos voertuig aan dat in elke lijst verschijnt en geboekt kan worden; er kan er maar één bestaan omdat de lege string uniek is, waardoor de latere melding "Vehicle already exists" bij blanco regels verwarrend is.
- **Fix proposal:** `if (typeof licensePlate !== 'string' || !licensePlate.trim()) { failed.push({licensePlate, error: 'License plate is required'}); continue; }` in beide bulklussen; hergebruik de verplichte-veldcontrole van `POST /api/vehicles`.
- **Regression test:** bulk-import `["", "   ", null, 123]` → `imported []` en vier nette fouten; geen enkele voertuigrij met `trim(license_plate)=''`.

#### BUG-124 — `bulk-import-csv` leest Nederlandse datums als Amerikaanse, verschuift ze een dag en laat onleesbare datums stilzwijgend vallen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-007
- **Feature:** Voertuigen — `POST /api/vehicles/bulk-import-csv`, datumconversie (APK, bedrijfsdatum, productiedatum)
- **Reproduction:** (`p9-03-import-race-conflicts.cjs` stap B, `p9-out-03.txt`) import van vijf rijen; SQL `select license_plate, apk_date, company_date, production_date from vehicles where license_plate like 'AU-9C97073%'`:
  - `-A` (`apkDate "05-03-2027"`, NL = 5 maart 2027) → `apk_date 2027-05-02`: maand en dag verwisseld **én** een dag eerder.
  - `-B` (`apkDate "2026-02-30"`, onmogelijke datum) → `apk_date 2026-03-02`, doorgerold.
  - `-C` (`apkDate "31-12-2026"`) → `apk_date NULL`, stilzwijgend gedropt; het voertuig komt nooit in `GET /api/vehicles/apk-expiring`.
  - `-D` (`company: 123`) → failed `"vehicleInput.company.toLowerCase is not a function"`, rij niet geïmporteerd.
  - `-E` (`apkDate "2027-03-05T00:00:00.000Z"`, `productionDate "garbage"`) → `apk_date 2027-03-05` (ISO gaat goed), `production_date 'garbage'` letterlijk opgeslagen.
- **Expected:** Nederlands `dd-mm-yyyy` (het formaat van de RDW en van elk Nederlands spreadsheet) correct geparst; onmogelijke of onleesbare datums per rij geweigerd met een melding; geen tijdzoneverschuiving; `productionDate` gevalideerd.
- **Actual:** `convertExcelDate` valt terug op `new Date(trimmed)` (V8 leest dat als mm-dd-yyyy, lokale tijd) en daarna `toISOString()` (UTC), zodat een middernacht in Europe/Amsterdam de vorige dag wordt; onleesbare strings geven null en het veld wordt overgeslagen (`if (convertedApkDate)`); onmogelijke ISO-datums rollen door; `productionDate` wordt letterlijk gekopieerd wanneer het geen 4-cijferig jaartal is.
- **Root cause:** `server/routes.ts:985-1002` (`convertExcelDate`: `new Date(trimmed)` + `toISOString().split('T')[0]`), `:1013-1018` (skip bij null), `:1052-1058` (`productionDate` rauw opgeslagen), `:966-968` (`vehicleInput.company.toLowerCase()` op een niet-string).
- **Affected files:** `server/routes.ts:909-1080`
- **Affected data:** voertuigen `AU-9C97073-A` (verkeerde APK-datum), `-B` (doorgerold), `-C` (APK-datum verdwenen), `-E` (`production_date 'garbage'`).
- **Security impact:** geen.
- **Business impact:** de APK-datum is een wettelijke keuringstermijn; een import die 5 maart tot 2 mei maakt (of de datum laat vallen) betekent dat de herinnering twee maanden te laat of nooit afgaat. De verschuiving van één dag treft bovendien élke datum die wél geparst wordt. Verwant aan BUG-042 (geen kalendervalidatie op de datumkolommen), maar dit is een ander pad met een eigen conversiefout.
- **Fix proposal:** parse met een expliciete formaatlijst (`dd-mm-yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd`, Excel-serienummer) via date-fns `parse` + `isValid`, formatteer met `format(date, 'yyyy-MM-dd')` in plaats van `toISOString`, en geef een fout per rij wanneer een aangeleverde datum niet te parsen is in plaats van hem over te slaan.
- **Regression test:** import `apkDate "05-03-2027"` → opgeslagen `2027-03-05`; `"31-12-2026"` → `2026-12-31`; `"2026-02-30"` → rij faalt met een datumfout.

#### BUG-125 — `barcode` is een vrij invulbaar clientveld: kentekenscans zijn te kapen en `regenerate` botst met een 500
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-008
- **Feature:** Voertuigen — barcode op `POST`/`PATCH /api/vehicles`, `POST /api/vehicles/:id/barcode/regenerate`, `GET /api/barcodes/:code`
- **Reproduction:** (`p9-01-lifecycle.cjs` stap D, `p9-04-gaps.cjs` stap F) (1) voertuig V 1762 barcode `VEH-001762` → regenerate → 200 `VEH-001762-R2`. (2) `POST /api/vehicles {"licensePlate":"AU-902-X",…,"barcode":"VEH-001762-R3"}` → 201 (W 1764 bezit nu V's volgende revisie); `POST /api/vehicles/1762/barcode/regenerate` → **500** `{"message":"Barcode regeneration failed"}`. (3) `PATCH /api/vehicles/1764 {"barcode":"AU-901-X"}` (het kenteken van V) → 200; `GET /api/barcodes/AU-901-X` → 200 en resolvet naar voertuig **1764 (W)**, niet naar V (exacte barcodematch gaat vóór de kentekenfallback, `routes.ts:551-557`). (4) `PATCH /api/vehicles/1780 {"barcode":"RES-003367"}` → 200; `GET /api/barcodes/RES-003367` → type `reservation` 3367 (de eigen barcode van het voertuig is nooit meer scanbaar). `PATCH /api/vehicles/1780 {"barcode":"VEH-001762-S"}` → 200; scannen levert voertuig 1762 met `scannedSpareKey:true`.
- **Expected:** de barcode wordt server-side toegekend (`VEH-<id>[-R<n>]`) en niet van de client geaccepteerd bij create/update (of minimaal gevalideerd tegen het `VEH-`-patroon van het eigen id); `regenerate` zoekt een vrije revisie of geeft een nette 409.
- **Actual:** `insertVehicleSchema` laat `barcode` ongefilterd door bij create én bij de samengevoegde PATCH; elke string wordt opgeslagen; lookups matchen eerst exact op barcode, dus een barcode gelijk aan het kenteken van een andere auto overschaduwt dat kenteken; `regenerate` gaat ervan uit dat de volgende revisie vrij is en verandert de uniciteitsfout in een 500.
- **Root cause:** `shared/schema.ts:266` (`barcode: text("barcode").unique()`) opgenomen in `insertVehicleSchema` (277-286) zonder refinement; `server/routes.ts:723-847` en `1082-1233` strippen/valideren het niet; `server/database-storage.ts:380-393` `regenerateVehicleBarcode` berekent `nextRevision` alleen uit het huidige suffix; `server/routes.ts:652-655` mapt elke fout naar 500; `server/routes.ts:551-557` bepaalt de lookupvolgorde.
- **Affected files:** `shared/schema.ts:266, 277-286`; `server/routes.ts:494-600, 638-656, 723-847, 1082-1233`; `server/database-storage.ts:373-393`
- **Affected data:** voertuigen 1762/1764/1780 (barcodes na de test teruggezet; W houdt nog `VEH-001762-R3`).
- **Security impact:** LAAG-MIDDEL — elke gebruiker met `MANAGE_VEHICLES` kan een kentekenscan van auto A naar auto B laten resolven; het scanpaneel toont dan B's reservering/transport/onderhoud en logt de scan in `scan_events` op B, wat te gebruiken is om de echte toestand van een auto aan de balie te verbergen.
- **Business impact:** geprinte labels kloppen niet meer (regenerate faalt of twee auto's dragen dezelfde codefamilie), het scanpaneel toont de verkeerde auto, en de sleutelaudit die op barcodes leunt wordt onbetrouwbaar.
- **Fix proposal:** laat `barcode` weg uit `insertVehicleSchema` (de server kent hem toe in `createVehicle`, beheerders regenereren via de eigen route); laat `regenerateVehicleBarcode` doorlopen tot een vrije revisie (of vang 23505 op en probeer opnieuw) en geef 409 bij een echt conflict; honoreer in de lookup alleen exacte barcodematches die het `VEH-<id>`-patroon van datzelfde voertuig volgen.
- **Regression test:** `POST /api/vehicles` met een `barcode`-veld → opgeslagen barcode is `VEH-<id>`, niet de meegestuurde waarde; `PATCH barcode` → 400 of genegeerd; bezet `VEH-<id>-R3` elders en regenereer → 200 met een andere vrije code.

#### BUG-126 — Een restore die op een barcodebotsing stuit geeft een rauwe 500 in plaats van de nette 409 die voor id en kenteken al bestaat
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-009 — *dezelfde leemte als BUG-043, andere trigger (sequentieel, niet gelijktijdig); de rauwe-foutkant valt onder BUG-148*
- **Feature:** Prullenbak — `POST /api/deleted-records/:id/restore`
- **Reproduction:** (`p9-02-delete-restore.cjs` stap 6, `p9-out-02.txt`) (1) `DELETE /api/vehicles/1762` (barcode `VEH-001762-R2`) → 200 (`deleted_records` id 37). (2) `POST /api/vehicles {"licensePlate":"AU-9BC-1789018297073","brand":"AUDIT-P9","model":"BarcodeTaker","barcode":"VEH-001762-R2"}` → 201 id 1765. (3) `POST /api/deleted-records/37/restore` → **500** `{"message":"Error restoring deleted record","error":"duplicate key value violates unique constraint \"vehicles_barcode_unique\""}`; SQL: `deleted_records` 37 `restored_at` NULL, `vehicles where id=1762` → `[]` (transactie netjes teruggedraaid, niets half hersteld). (4) `PATCH /api/vehicles/1765 {"barcode":null}` → 200; restore → 200, voertuig en 9 reserveringen terug.
- **Expected:** dezelfde nette 409 die de restore al geeft voor een bezet id (`ID_TAKEN`) of kenteken (`LICENSE_PLATE_TAKEN`), met vermelding van het botsende voertuig.
- **Actual:** alleen id en kenteken worden vooraf gecontroleerd; de barcode-uniciteitsindex vuurt binnen de transactie en de catch van de route geeft een 500 met de constraintnaam.
- **Root cause:** `server/database-storage.ts:653-661` `restoreDeletedRecord` controleert vooraf alleen `vehicles.id` en `vehicles.licensePlate`; `server/routes.ts:1715-1761` heeft geen 23505-afhandeling.
- **Affected files:** `server/database-storage.ts:637-725`; `server/routes.ts:1715-1761`
- **Affected data:** geen corruptie (de rollback is schoon).
- **Security impact:** geen.
- **Business impact:** een beheerder krijgt "Error restoring deleted record" met een Postgres-constraintnaam en geen enkele hint dat de oplossing is om de barcode op een ander voertuig vrij te maken; in combinatie met BUG-125 (barcode is client-zetbaar) is dit makkelijk te raken.
- **Fix proposal:** voeg een `barcode_taken`-voorcontrole toe naar het model van de kentekencontrole en map die op 409 `BARCODE_TAKEN`; vang daarnaast 23505 af in de route en geef 409 met de vertaalde constraint.
- **Regression test:** verwijder een voertuig, maak een ander met dezelfde barcode, restore → 409 `BARCODE_TAKEN`, geen 500.

#### BUG-127 — Kilometerstanden van een afgeronde verhuur zijn vrij bewerkbaar, zonder onderlinge controle en zonder synchronisatie met het voertuig
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** V9-010 — *verwant aan BUG-041 (negatieve standen) maar een ander pad en een ander gebrek*
- **Feature:** Reserveringen — `pickupMileage`/`returnMileage` bewerken na de retour (`PATCH /api/reservations/:id`)
- **Reproduction:** (`p9-01-lifecycle.cjs` stap E, `p9-out-01.txt`) reservering 3338 op voertuig 1762 na pickup (39100) en return (39300); voertuig `current_mileage` 39300. (1) `POST /api/reservations/3338/return {"returnMileage":39050}` was terecht geweigerd met 409 "Return mileage (39050) cannot be less than pickup mileage (39100)". (2) `PATCH /api/reservations/3338 {"returnMileage":30000}` → **200**. (3) `PATCH /api/reservations/3338 {"pickupMileage":45000}` → **200**. SQL: reservering 3338 `pickup_mileage 45000`, `return_mileage 30000`; voertuig 1762 `current_mileage 39300` (onaangeroerd).
- **Expected:** dezelfde regel die het return-endpoint afdwingt (return ≥ pickup, beide ≥ 0) geldt ook bij bewerken; en een gecorrigeerde retourstand op de laatste verhuur van het voertuig werkt `vehicles.current_mileage` bij (of waarschuwt), zoals de kilometerendpoints dat met override en audittrail doen.
- **Actual:** de generieke PATCH parseert de twee velden naar int (of null) en schrijft ze weg; geen vergelijking, geen voertuigupdate, geen audittrail.
- **Root cause:** `server/routes.ts:3532-3545` (kilometerparsing in `PATCH /api/reservations/:id`) gevolgd door de rauwe update zonder validatie ("bypass full schema validation and just use the raw data"); de pickup-/returnguards leven alleen in `database-storage.ts` `pickupReservation`/`returnReservation`.
- **Affected files:** `server/routes.ts:3445-3700`
- **Affected data:** reservering 3338 (pickup 45000 / return 30000 bewust als bewijs laten staan).
- **Security impact:** geen.
- **Business impact:** ritten met een negatieve lengte op contracten, facturen en kilometerrapportages, en een kilometerhistorie van het voertuig die uiteenloopt met zijn verhuringen; correcties via het reserveringsformulier omzeilen de autorisatie voor kilometerverlagingen die overal elders wél geldt.
- **Fix proposal:** valideer `pickupMileage`/`returnMileage` tegen elkaar (en tegen de kilometerhistorie van het voertuig) in de PATCH-handler; wanneer de bewerkte reservering de laatste retour van het voertuig is, laat de wijziging dan via hetzelfde `authorizeMileageDecrease`-pad lopen en werk `vehicles.current_mileage` bij.
- **Regression test:** na een retour `PATCH returnMileage` onder de pickupstand → 400; `PATCH` een hogere `returnMileage` → `current_mileage` van het voertuig volgt.

#### BUG-128 — `returned` en `completed` zijn inconsistent tussen de routes; een statusomkering wist de geplande einddatum
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** R10-007
- **Feature:** Statusmodel van reserveringen (`PATCH /:id/status`, `POST /:id/return`, het statusveld in het formulier)
- **Reproduction:** (`p10-i-status.cjs` I4/I4b/I5, `p10-c` C2b/C2d, `p10-f` F4)
  a. `PATCH /3439/status {"status":"returned"}` op een `picked_up` reservering → **400** "Invalid status transition from 'picked_up' to 'returned'" (de transitietabel kent `picked_up→returned` niet), terwijl de enum van datzelfde endpoint `returned` wél accepteert en `POST /return` die status juist produceert. Het reserveringsformulier biedt "returned" aan in het statusveld (`reservation-form.tsx:2083`) en verstuurt via `PATCH /:id` → 200 zonder enige retourdata (`actual_return_date` null) en met het voertuig op `rented`.
  b. `PATCH /3439/status {"status":"picked_up"}` (omkering `returned → picked_up`) → 200 met `end_date = NULL` en `actual_return`/`return_mileage` null: de geplande einddatum is weg en de verhuur is nu open-ended (conflicteert met élke toekomstige boeking op `AU-116-X`). De omkering vanaf `completed` doet hetzelfde (`routes.ts:3352-3356`).
  c. `returned → completed` via `/status` op 3384 herschrijft `end_date` van 2026-09-05 (de echte retourdag) naar 2026-09-10 (vandaag) terwijl `actual_return_date` op 09-05 blijft staan (variant van BUG-019).
  d. Twee vormen van "completed": via `POST /return` + `/status` staan `actual_return_date`/`completion_date`/`return_mileage` gevuld; via `/status {completed}` direct (F4, C2d) zijn alle drie null.
  e. `getUpcomingReservations` filtert alleen op `cancelled`/`completed`, dus `returned`-rijen met een startdatum vanaf vandaag voldoen eraan (3338, 3362, 3363, 3365, 3340) en de live top-5 bevatte een `picked_up` en een `confirmed` rij.
- **Expected:** één eindtoestand, bereikbaar via één flow, met `returned`/`completed` óf samengevoegd óf geordend (`picked_up → returned → completed`) en dat consistent in de transitietabel, het status-endpoint, de returnroute en elke query; een omkering herstelt het geplande einde in plaats van het te wissen.
- **Actual:** zie boven.
- **Root cause:** `shared/schema.ts:42-48` (transitietabel), `server/routes.ts:3239-3260` (enum + toegestane omkeringen), `:3348` en `:3355` (`dataWithTracking.endDate = null` bij omkering), `:3358-3361` (`completed` zet `endDate` op vandaag), `server/database-storage.ts:1749-1760` (return zet `'returned'` en `endDate: returnDate`), `:1358-1386` (upcoming-filter op 1373-1374).
- **Affected files:** `shared/schema.ts`, `server/routes.ts`, `server/database-storage.ts`
- **Affected data:** 3439 (`end_date` null), 3384 (`end_date` verplaatst), 22 `returned`-rijen in de kloon.
- **Security impact:** geen.
- **Business impact:** rapportages tellen verhuurdagen verschillend afhankelijk van met welke knop de verhuur is afgesloten; een retour terugdraaien maakt de boeking open-ended en blokkeert de auto oneindig.
- **Fix proposal:** houd de geplande `endDate` in een aparte kolom (`actualReturnDate` bestaat al) en overschrijf/nul hem nooit; maak `picked_up → returned` een geldige transitie óf laat `/return` direct `completed` schrijven; filter `upcoming` op `booked`.
- **Regression test:** pickup, return, terug naar `picked_up` → `end_date` is gelijk aan de oorspronkelijk geplande waarde.

#### BUG-129 — Statuswaarden buiten de statusmachine: 278 reserveringen en 44 voertuigen dragen waarden die geen enkele UI-actie meer kan wijzigen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** (de opruimmigratie voor de bestaande rijen vraagt wél goedkeuring, zie §7) · **Bron:** R10-008 (MEDIUM) + D12-012 (LOW) — *samengevoegd, severity genormaliseerd naar MEDIUM*
- **Feature:** Statusmodel van reserveringen en voertuigen (enum-drift tussen `shared/schema.ts` en wat de server schrijft)
- **Reproduction:**
  - *Gedrag (`p10-i-status.cjs` I2/I3):* statusverdeling in `lvs_audit` (niet-verwijderd): `booked` 634, `completed` 516, `picked_up` 511, **`active` 265**, `returned` 22, `cancelled` 18, `pending` 4, `scheduled` 4, `confirmed` 3, `in` 1, `garbage` 1. Reservering 3425 (`active`): `PATCH /status {picked_up}` → **400** "Invalid status transition from 'active' to 'picked_up'"; `{completed}` → 400; `{cancelled}` → 400. De rij is langs geen enkele weg af te ronden behalve de ongevalideerde `PATCH /:id` (BUG-016/BUG-084).
  - *Telling (`p12-scan2.json → statuses`):* `reservations.status` **278 live rijen buiten de enum (248 pre-existing)**: `active` 265 blokken (243 pre-existing, geschreven door `createMaintenanceBlock` `database-storage.ts:3329`), `pending` 4 vervangers (`createReplacementReservation` :3224), `scheduled` 4 blokken, `in` 1 blok (1506), `confirmed` 3 + `garbage` 1 (audit). `vehicles.availability_status`: **44 buiten de enum (33 pre-existing)** — `scheduled` 42 rijen (geschreven door `syncVehicleAvailabilityWithReservations` :224-353 maar niet in de enum) en `banana_not_real` 2 (BUG-021). Daarnaast brandstofniveaus `Full` 6+5+2 en `half` 1+1 over drie kolommen (15 rijen, 7 pre-existing) die gelijkheidsfilters breken.
  - Deze rijen tellen wél mee als actief voor de voertuigsync (status niet in `cancelled/returned/completed` → voertuig `rented`) en 45 ervan blokkeren boekingen via de create-guard (BUG-113).
- **Expected:** één bron van waarheid voor de toegestane waarden, die élke schrijver gebruikt; of een migratie van de legacy-waarden, of aliassen in de transitietabel (`active≈picked_up`, `confirmed≈booked`).
- **Actual:** `VALID_RESERVATION_TRANSITIONS['active']` is undefined, dus geen enkel doel is geldig, en de eigen enum van het status-endpoint (`routes.ts:3240`) weigert deze waarden ook als **invoer**.
- **Root cause:** hardgecodeerde literals in de storagelaag (`database-storage.ts:3329`, `:3224`, `:224-353`); tekstkolommen zonder CHECK-constraint; `shared/schema.ts:18-31, 42-48` kent de waarden niet; geen datamigratie voor de pre-enum-statussen.
- **Affected files:** `server/database-storage.ts`, `shared/schema.ts`, `server/routes.ts`, `server/vehicle-status-helper.ts`
- **Affected data:** 278 live reserveringen (248 pre-existing in de kloon) en 44 voertuigen (33 pre-existing) — **te herverifiëren in productie**. Let op: het leeuwendeel van de `active`-blokken komt niet uit de administratie maar uit de testsuite (BUG-145).
- **Security impact:** geen.
- **Business impact:** blokken met status `active` kunnen nooit via `PATCH /:id/status` afgerond of geannuleerd worden, dus die auto's blijven `rented`; beschikbaarheidsfilters missen `scheduled`-voertuigen; en personeel kan oude verhuringen niet via de statusdialoog afsluiten.
- **Fix proposal:** schrijf `booked` voor blokken en vervangers (zoals `assignVehicleToPlaceholder` en `applyTransportUpdate` al doen), voeg `scheduled` toe aan de voertuig-enum of stop met die waarde te schrijven, en normaliseer de brandstofniveaus naar kleine letters; voeg een aliasmap toe aan `isValidReservationTransition` voor de legacy-waarden. De eenmalige datamigratie en eventuele CHECK-constraints vragen goedkeuring (§7).
- **Regression test:** seed een rij met status `active`; `/status {completed}` → 200. Na de fix is `select distinct status` / `availability_status` een deelverzameling van de enums.

#### BUG-130 — Na "markeer als afgerond" blijft het voertuig `rented` zodra er nog een boeking binnen 30 dagen staat
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** R10-009
- **Feature:** Voertuigbeschikbaarheid na `PATCH /api/reservations/:id/status {completed}`
- **Reproduction:** (`p10-j-sync.cjs`) `AU-151-X`: reservering 3445 (vandaag−2..vandaag+1) opgehaald → voertuig `rented`; tweede boeking 3446 (vandaag+10..+12) bestaat. `PATCH /3445/status {"status":"completed","departureMileage":150}` → 200. `availability_status`: vóór `rented`, erna `rented`, en na nóg een syncronde nog steeds `rented`. Controle op `AU-152-X` mét `POST /return` in plaats daarvan: `rented` → `available` → `scheduled`.
- **Expected:** na het afronden is het voertuig `available` (of `scheduled` vanwege de komende boeking).
- **Actual:** het status-endpoint leunt op `syncVehicleAvailabilityWithReservations`, waarvan de prioriteit-3-reset (`database-storage.ts:324-345`) alleen voertuigen aanraakt die géén actieve of komende reservering hebben; een voertuig met een komende boeking wordt dus nooit uit `rented` gehaald. `POST /return` werkt alleen omdat die route eerst expliciet `available` schrijft (`routes.ts:4285`).
- **Root cause:** `server/database-storage.ts:224-350` (de sync zet nooit `rented → scheduled`), `server/routes.ts:3408-3416` (het status-endpoint schrijft de rij en roept de sync aan, maar geeft het voertuig zelf nooit vrij).
- **Affected files:** `server/database-storage.ts`, `server/routes.ts`
- **Affected data:** voertuig 1817 (`AU-151-X`) staat `rented` zonder lopende verhuur.
- **Security impact:** geen.
- **Business impact:** de vlootlijst toont auto's als "buiten" terwijl ze op het terrein staan; `getStatusOnPickup` behandelt de volgende overdracht daarna als een pickup vanuit `rented`.
- **Fix proposal:** zet in de sync voertuigen die in `scheduledVehicleIds` maar niet in `rentedVehicleIds` zitten op `scheduled`, ook als ze nu `rented` zijn; en geef het voertuig expliciet vrij in het status-endpoint bij `completed`/`cancelled`.
- **Regression test:** het J-scenario; assert `scheduled` na `completed`.

#### BUG-131 — `pickupDate` en `returnDate` worden niet gevalideerd en belanden ongefilterd in bestandsnamen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** R10-010
- **Feature:** `POST /api/reservations/:id/pickup` en `/return`
- **Reproduction:** (`p10-b-dates.cjs` B2/B5/B6)
  - `POST /3365/pickup {…, "pickupDate":"not-a-date"}` → **200**; `actual_pickup_date='not-a-date'`; contractbestand `AU109X_contract_pickup_not-a-date_1789018367524.pdf`.
  - `POST /3365/return {…, "returnDate":"2099-13-45"}` → **200**; `end_date = actual_return_date = completion_date = '2099-13-45'`; schadecheckbestand `…_return_2099-13-45_….pdf`.
  - `POST /3361/return {"returnDate":"2014-12-25"}` op een verhuur die 2015-01-01 begint → 200; `end_date < start_date`; de rij verdwijnt uit `/range` en wordt door de overdue-guard opgepikt.
  - `POST /3364/return {"returnDate": vandaag−5}` op een vandaag opgehaalde verhuur (start vandaag+10) → 200, zelfde omkering.
- **Expected:** YYYY-MM-DD-validatie, `returnDate >= actualPickupDate`, en (tenzij expliciet overruled) niet in de toekomst.
- **Actual:** `pickupData.pickupDate || today` en `returnData.returnDate || today` worden ongewijzigd weggeschreven.
- **Root cause:** `server/routes.ts:4074`/`:4256` destructureren zonder validatie; `server/database-storage.ts:1662-1670, 1749-1760`.
- **Affected files:** `server/routes.ts`, `server/database-storage.ts`
- **Affected data:** reserveringen 3361, 3364, 3365; twee PDF-bestanden met onzinnamen onder `audit-uploads/AU109X/`.
- **Security impact:** de datumstring belandt in een bestandsnaam (het kenteken wordt gesaneerd, het datumdeel niet — padscheidingstekens worden niet gestript; in deze audit niet uitgebuit).
- **Business impact:** negatieve verhuurduren in rapportages en rijen die de kalender niet kan renderen.
- **Fix proposal:** valideer beide datums met zod; weiger `returnDate < actualPickupDate`; saneer het datumdeel van de bestandsnaam.
- **Regression test:** return met `returnDate 'x'` → 400; met een datum vóór de pickup → 400.

#### BUG-132 — Een opgehaalde verhuur kan verwijderd of geannuleerd worden terwijl de klant de auto heeft; het contractnummer wordt vrijgegeven en hergebruikt
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (of, en met welke override, een lopende verhuur afgebroken mag worden is een procesafspraak) · **Bron:** R10-011
- **Feature:** `DELETE /api/reservations/:id` en `PATCH /:id/status {cancelled}` op een `picked_up` reservering
- **Reproduction:** (`p10-e-delete-overlap.cjs` E2, `p10-d-cancel.cjs` D2)
  - *Verwijderen:* 3389 vandaag opgehaald (contract `AUDIT-P10-E-E2-358340`, voertuig `AU-101-X` `rented`). `DELETE /api/reservations/3389` → **200**: rij soft-deleted, status nog steeds `picked_up`, `contract_number` null; voertuig → `available`. Een nieuwe reservering op hetzelfde voertuig voor dezelfde dagen → 201 (3390); `POST /3390/pickup` met **hetzelfde** contractnummer → 200; `find-by-contract` wijst voortaan naar 3390. De contract-PDF van de verwijderde verhuur blijft bestaan (BUG-055).
  - *Annuleren:* 3432 opgehaald (contract `AUDIT-P10-D-D2-720447`). `PATCH /status {cancelled}` → 200 (de transitietabel staat `picked_up→cancelled` toe). Voertuig → `available`, contractnummer en pickupdata blijven staan, chauffeurstoewijzing blijft open; `POST /3432/return` → **400** "Cannot return reservation with status: cancelled"; een andere klant kan dezelfde auto voor dezelfde dagen boeken en ophalen (3433, 200).
- **Expected:** een verhuur waarvan de auto buiten is, is niet verwijderbaar/annuleerbaar zonder eerst in te leveren (of met een expliciete "kwijt/nooit teruggebracht"-override); het contractnummer van een opgehaalde verhuur wordt nooit hergebruikt.
- **Actual:** `DELETE` heeft geen statusguard (`routes.ts:4621-4640`, alleen `requireAuth`) en wist `contract_number`; annuleren is een geldige transitie zonder neveneffecten behalve de voertuigsync.
- **Root cause:** `server/routes.ts:4621-4640`; `shared/schema.ts:44` (`'picked_up': ['completed','cancelled']`).
- **Affected files:** `server/routes.ts`, `shared/schema.ts`
- **Affected data:** 3389 (verwijderde `picked_up`), 3432 (geannuleerde `picked_up`), contractnummer hergebruikt op 3390.
- **Security impact:** `DELETE` is permissieloos (elke ingelogde gebruiker) — al vastgelegd als BUG-064, hier niet opnieuw gefiled.
- **Business impact:** een auto die fysiek bij een klant staat wordt als beschikbaar getoond en kan aan een tweede klant meegegeven worden; de retour van de eerste klant kan nooit meer geregistreerd worden.
- **Fix proposal:** blokkeer `DELETE` en `cancelled` voor `picked_up` tenzij er een retour is vastgelegd (of eis een beheerdersoverride met reden); wis `contract_number` nooit bij het verwijderen van een opgehaalde rij.
- **Regression test:** pickup, dan `DELETE` → 409; pickup, dan `/status cancelled` → 409 (of het overridepad).

#### BUG-133 — Een chauffeurswijziging via `/basic` omzeilt de chauffeurshistorie
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** R10-013
- **Feature:** `PATCH /api/reservations/:id/basic` — `driverId`
- **Reproduction:** (`p10-h-portal.cjs` H4/H5, tabel in `p10-a`) reservering 3395 (portaalklant 179): `PATCH /:id {driverId:23}` → historie `[161 gesloten, 23 open]` (correct). Daarna `PATCH /:id/basic {…, driverId:161}` → 200, de reservering staat op chauffeur 161, maar `reservation_driver_assignments` bevat nog steeds `[161 gesloten, 23 open]`; `GET /api/portal/reservations/3395` toont chauffeur 161 met `driverHistory` "161, 23*" (23 als huidige gemarkeerd). Veldprobe: `driverId` via `/basic` → **0** toewijzingsrijen.
- **Expected:** elke schrijfactie op `driverId` gaat via `assignDriverToReservation`, zoals `PATCH /:id` (`routes.ts:3687-3693`) en het createpad (`routes.ts:2656`) al doen.
- **Actual:** `/basic` schrijft `driverId` rechtstreeks via `updateReservation` (`routes.ts:3201`).
- **Root cause:** `server/routes.ts:3090-3230` (geen aanroep van `assignDriverToReservation`).
- **Affected files:** `server/routes.ts`
- **Affected data:** de historie van reservering 3395.
- **Security impact:** geen.
- **Business impact:** het portaal toont de verkeerde "huidige chauffeur", en de boetetoewijzing — die volgens het codecommentaar op deze historie leunt — wijst de vorige chauffeur aan.
- **Fix proposal:** roep `assignDriverToReservation` aan in `/basic` zodra `driverId` verandert.
- **Regression test:** `/basic` met een nieuwe `driverId` → nieuwe open toewijzingsrij, vorige gesloten.

#### BUG-134 — Geen portaalmelding bij welke wijziging van kantoor dan ook aan de reservering van een portaalklant
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (welke gebeurtenissen een klantmelding verdienen is een bedrijfsbesluit) · **Bron:** R10-014
- **Feature:** Klantportaal — meldingen bij wijzigingen aan de staffzijde
- **Reproduction:** (`p10-h-portal.cjs` H2-H8) voor reservering 3395 van portaalklant 179: verplaatsen (+1 dag), voertuigwissel (`AU-123-X` → `AU-124-X`), chauffeurswissel (161→23), pickup, annuleren van de opgehaalde verhuur en verwijderen. Na élke stap is het aantal `portal_notifications` voor klant 179 ongewijzigd (`newNotifications 0`) en toont `GET /api/portal/notifications` alleen de al bestaande onderhouds-/aanvraagitems. De leeskant (lijst en detail) reflecteert elke wijziging wél.
- **Expected:** minimaal annulering, datum-/voertuigwijziging en verwijdering van een lopende verhuur leveren een portaalmelding op — het portaal heeft al een meldingssysteem dat gebruikt wordt voor onderhoudsblokken, vervangers, aanvraagbeslissingen en APK-/servicealerts.
- **Actual:** `server/services/portal-customer-notifications.ts` kent alleen apk-/servicetypen; `portal-maintenance-events.ts` is uitsluitend aangesloten op de onderhoudsblok- en vervangerspaden (`routes.ts:2529, 3150, 3683` `onMaintenanceBlockChanged` — een no-op voor standaardreserveringen); vanuit `/status`, `/:id`, `/basic` en `DELETE` wordt voor gewone verhuringen niets aangeroepen.
- **Root cause:** ontbrekende hook (functiegat, geen regressie).
- **Affected files:** `server/routes.ts`, `server/services/portal-customer-notifications.ts`
- **Affected data:** geen.
- **Security impact:** geen.
- **Business impact:** een klant wiens verhuur is geannuleerd of verplaatst komt daar pas achter door zelf het portaal te openen.
- **Fix proposal:** stuur `reservation_changed`/`reservation_cancelled`-meldingen (met een dedupe-tag per reservering + veld) vanuit de drie bewerkpaden en vanuit `DELETE`, wanneer de klant een portaalaccount heeft.
- **Regression test:** annuleer de reservering van een portaalklant → één `portal_notifications`-rij van het type `reservation_cancelled`.

#### BUG-135 — Het originele voertuig van een transport wijzigen laat de werkplaatsvlag en de vervangersnotities op de oude auto staan
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** T11-008
- **Feature:** `PATCH /api/transports/:id {vehicleId}`
- **Reproduction:** (`p11-extra.cjs` X1) transport #51 (breakdown; origineel vE gemarkeerd `needs_service` met notitie "…transport #51"; vervanger vC; reservering #3404 met notitie "Replacement vehicle for AUDIT P11 TransportOriginal (AU-11E-X)"). `PATCH /api/transports/51 {"vehicleId": <vK>}` → 200: `vehicle_id` wordt vK, maar vE houdt `needs_service` + "Replacement vehicle required for transport #51", vK blijft `ok`, en reservering #3404 zegt nog steeds dat hij `AU-11E-X` vervangt. `GET /api/transports/51` rapporteert voertuig `AU-11K-X` met een vervangersnotitie die `AU-11E-X` noemt.
- **Expected:** de vlag van vE wordt gewist, vK wordt gevlagd, en de notities, `replacementForReservationId` en klant van de vervangingsreservering worden voor het nieuwe origineel herberekend.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:2025-2221` heeft geen afhandeling voor `changes.vehicleId` (het wordt alleen in de update gespreid op :2210); de breakdown-vlaglogica (2180-2201) keyt op `current.vehicleId`.
- **Affected files:** `server/database-storage.ts` (`applyTransportUpdate`)
- **Affected data:** `vehicles.maintenance_status`/`note` van het oude en nieuwe origineel; `reservations.notes`/`replacement_for_reservation_id`/`customer_id` van de vervanger.
- **Security impact:** geen.
- **Business impact:** de verkeerde auto blijft als "moet naar de werkplaats" staan en de juiste niet, en de transportbrief en de kalender noemen het verkeerde "vervangen" voertuig.
- **Fix proposal:** bij een wijziging van `vehicleId`: herstel de oude auto (`markVehicleForService(old,'ok')` als hij door dít transport gevlagd was), vlag de nieuwe wanneer `isBreakdownOrMaintenance`, en ververs `notes`, `replacementForReservationId` en `customerId` van de vervangingsreservering met dezelfde lookup als bij creatie (2124-2170).
- **Regression test:** wijzig `vehicleId` op een breakdowntransport met vervanger; assert dat de vlaggen zijn verhuisd en dat de vervangingsreservering naar het nieuwe origineel verwijst.

#### BUG-136 — Transportstatus is vrije tekst zonder transitietabel; `completedDate` blijft leeg bij API-gebruik
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** T11-009
- **Feature:** `PATCH /api/transports/:id` — `status` en `completedDate`
- **Reproduction:** (`p11-transport.cjs` T1/T9, `p11-extra.cjs` X3) `PATCH /api/transports/43 {"status":"garbage_status"}` → **200**, `status='garbage_status'` opgeslagen; de reeks `in_progress → completed → scheduled → cancelled → completed` wordt volledig geaccepteerd; `PATCH /api/transports/46 {"status":"completed"}` zonder `completedDate` laat `completed_date` **null** (het dashboard stuurt hem wél mee, `dashboard.tsx:237-243, 316-321`, API-aanroepers niet — sweep F7: 2 afgeronde transporten zonder `completed_date`); `completed → in_progress` mag ook. Een transport met een onbekende status verdwijnt uit de barcodelookup `getActiveTransportByVehicle` (die alleen `scheduled`/`in_progress` kent, `database-storage.ts:1975-1986`) en uit de vervangeropruimqueries.
- **Expected:** `status` beperkt tot `scheduled | in_progress | completed | cancelled` (zoals het schemacommentaar `shared/schema.ts:1602` zegt), een transitietabel (in elk geval geen heropening van `completed`/`cancelled` zonder expliciete actie), en `completedDate` server-side gezet bij het afronden.
- **Actual:** zie boven.
- **Root cause:** `insertVehicleTransportSchema` gebruikt gewone `text` voor `status` (`shared/schema.ts:1602`) en `routes.ts:7445` parseert met `partial()` zonder enum- of transitiecontrole; `applyTransportUpdate` reageert alleen op `completed`/`cancelled` voor de onderhoudsvlag.
- **Affected files:** `shared/schema.ts`, `server/routes.ts`, `server/database-storage.ts`
- **Affected data:** `vehicle_transports.status`/`completed_date`.
- **Security impact:** geen.
- **Business impact:** inconsistente rapportage (afgerond zonder datum), transporten die na afsluiting heropend worden zonder dat de neveneffecten van het afsluiten teruggedraaid worden (BUG-115), en vrije-tekststatussen die geen enkel filter herkent.
- **Fix proposal:** `z.enum([...])` voor `status`; een kleine transitietabel naar het model van `VALID_RESERVATION_TRANSITIONS`; zet `completedDate = vandaag` bij de overgang naar `completed` en wis hem bij het verlaten daarvan.
- **Regression test:** `PATCH status 'bogus'` → 400; `completed → scheduled` → 400 (of een expliciete heropenroute); afronden zonder `completedDate` zet hem alsnog.

#### BUG-137 — Placeholder-vervangers van afgeronde, geannuleerde of uitgezette transporten blijven in de toewijswidget staan en zijn nog toewijsbaar
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** T11-010 + T11-011 — *samengevoegd (zelfde twee functies zonder statusfilter)*
- **Feature:** `GET /api/placeholder-reservations/needing-assignment`, `POST /api/placeholder-reservations/:id/assign-vehicle`, in combinatie met `PATCH /api/transports/:id`
- **Reproduction:**
  - *Afgerond transport (`p11-extra.cjs` X4):* transport #53 (vF, `spareRequired=true`, geen vervanger) → placeholder #3406. `PATCH /api/transports/53 {"status":"completed","completedDate":"2026-09-10"}` → 200. Placeholder #3406 blijft `booked` en staat nog in `GET /api/placeholder-reservations/needing-assignment?daysAhead=1`; `POST /api/placeholder-reservations/3406/assign-vehicle {vehicleId: vB}` → **200**, boekt vB voor die dag en schrijft `related_vehicle_id` op het **afgeronde** transport. In `p11-transport.cjs` T11 maakte het afronden van transport #48 zelfs een gloednieuwe placeholder #3382 aan (`applyTransportUpdate` 2095-2173 draait bij élke update, ook `status=completed`). Door een transport aangemaakte placeholders krijgen bovendien nooit de `spare_assignment`-staffmelding die reservering-placeholders wél krijgen (`custom_notifications` leeg voor #3406).
  - *Uitgezette vervanger (`p11-transport.cjs` T5):* transport #44 met TBD-placeholder #3378. `PATCH {"spareRequired":false}` → 200 (reservering #3378 → `status cancelled`, nog steeds `placeholder_spare=true`). `GET …/needing-assignment?daysAhead=60` toont #3378 nog steeds, mét `status: 'cancelled'`. `POST /api/placeholder-reservations/3378/assign-vehicle {vehicleId: vJ}` → **200**; daarna leest het transport `related_vehicle_id = vJ, spare_required = false, spare_reservation_id = null` (tegenstrijdig: `getTransportSpareStatus` zegt `not_required` terwijl er een voertuig ingevuld staat) en is #3378 een `cancelled` rij mét voertuig.
- **Expected:** het afsluiten van een transport sluit de TBD-placeholder (of het afronden wordt geweigerd zolang een verplichte vervanger TBD is); een geannuleerde placeholder wordt niet aangeboden en is niet toewijsbaar.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:2095-2173` (placeholdercreatie niet afhankelijk van de status), `:2182-2201` (geen afsluiting van de placeholder bij het afronden), `assignVehicleToPlaceholder` `:3020-3060` (geen controle op de status van het gekoppelde transport, geen controle op `spareRequired`), `getPlaceholderReservationsNeedingAssignment` `:2940-2950` (filtert alleen op `placeholderSpare`/`vehicleId`/`deletedAt`, niet op `status` en niet op het gekoppelde transport).
- **Affected files:** `server/database-storage.ts`
- **Affected data:** placeholderrijen van afgeronde transporten (#3406, #3382, #3378); `vehicle_transports.related_vehicle_id` van gesloten transporten.
- **Security impact:** geen.
- **Business impact:** verouderde "vervanger nodig"-herinneringen nadat het transport al geweest is; een échte auto kan geboekt worden voor een transport dat al heeft plaatsgevonden of waarvan de vervanger juist expliciet is geschrapt.
- **Fix proposal:** annuleer bij `completed`/`cancelled` een nog-TBD-placeholder; sla de placeholdercreatie over wanneer `changes.status` het transport sluit; weiger in `assignVehicleToPlaceholder` wanneer het gekoppelde transport gesloten is of `spareRequired` false is; voeg `status = 'booked'` toe aan beide queries en zet bij het uitzetten van de vervanger ook `placeholderSpare=false` (of soft-delete de placeholder, zoals `DELETE` doet).
- **Regression test:** TBD-transport → afronden → placeholder geannuleerd, niet in `needing-assignment`, `assign-vehicle` → 4xx; vervanger uitzetten terwijl TBD → `needing-assignment` sluit hem uit, `assign-vehicle` → 4xx.

#### BUG-138 — Portaalonderhoud kan in het verleden en op een geannuleerde verhuur worden goedgekeurd
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** T11-012
- **Feature:** `POST /api/portal-requests/:id/approve` en `POST /api/portal/requests`
- **Reproduction:** (`p11-portal.cjs` P8/P9) (a) aanvraag #586 goedkeuren met `startDate: "2026-09-03"` (een week in het verleden, doordeweeks) → **200**: blok #3353 (2026-09-03..04) en placeholder #3354 in het verleden aangemaakt, klant krijgt de melding "Onderhoud gepland … op 2026-09-03", en de placeholder komt in `needing-assignment`. (b) De klant dient een `maintenance`-aanvraag in op verhuur #3355 terwijl die alleen `booked` is; kantoor annuleert de verhuur (`PATCH /status cancelled`); goedkeuren → **200**: blok #3356 + placeholder #3357 voor de geannuleerde verhuur, en `spare_assignment_decision='spare_assigned'` op een geannuleerde reservering (sweep J → 3357).
- **Expected:** (a) 400 — onderhoud kan niet in het verleden gepland worden (het klantformulier en de `preferredDate`-controle dwingen "vandaag of later" al af); (b) 400 — geen onderhoud/vervanger voor een verhuur die niet `booked`/`picked_up` is.
- **Actual:** zie boven.
- **Root cause:** `server/routes/portal-requests.ts:307-346` valideert alleen de weekendregel en `rental.vehicleId`; geen `startDate >= today` en geen statuscontrole op de verhuur; `POST /api/portal/requests` (`portal.ts`) accepteert `maintenance` op `booked` verhuringen terwijl `vehicles/mine` alleen opgehaalde auto's kent.
- **Affected files:** `server/routes/portal-requests.ts` (`approveMaintenance`), `server/routes/portal.ts` (aanvraagcreatie)
- **Affected data:** blokken/placeholders met datums in het verleden; vervangersrijen voor geannuleerde verhuringen.
- **Security impact:** geen.
- **Business impact:** verouderde herinneringen en misleidende klantmeldingen, plus een vervangersbehoefte voor een klant die helemaal geen auto heeft.
- **Fix proposal:** weiger `startDate < vandaag` (eventueel `< morgen`, zoals het formulier); weiger wanneer de verhuur niet `booked`/`picked_up` is; annuleer bij het annuleren/verwijderen van een verhuur de openstaande onderhoudsaanvragen, of blokkeer op zijn minst de goedkeuring (voor een verwijderde verhuur gebeurt dat al met 400).
- **Regression test:** goedkeuren met de datum van gisteren → 400; verhuur annuleren en dan goedkeuren → 400.

#### BUG-139 — Het voertuig van een verhuur met een portaal-onderhoudsblok wisselen laat het blok, de vervanger en de klantmelding op de oude auto achter
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** T11-013
- **Feature:** `PATCH /api/reservations/:id {vehicleId}` op een opgehaalde verhuur met een portaalblok
- **Reproduction:** (`p11-portal3.cjs` Q7) verhuur #3335 (opgehaald op vA) heeft blok #3343 (`affectedRentalId=3335`, `portalRequestId=583`) en had vervangers. `PATCH /api/reservations/3335 {"vehicleId": <vC>}` → **200**: de verhuur staat op vC, blok #3343 blijft op vA (waarvan `availability_status` `available` wordt terwijl er een gepland blok op staat — zelfde klasse als BUG-034), `GET /api/portal/vehicles/mine` toont de klant geen onderhoud meer, de `maintenance_change` van de klant op blok #3343 geeft voortaan **404** "Maintenance not found", en er gaat geen enkele melding uit. Het blok en de eventuele vervanger blijven gebonden aan `affectedRentalId=3335`, waarvan het voertuig nu een ander is. (De toestand is aan het eind van Q7 teruggedraaid.)
- **Expected:** een waarschuwing/beslissing (het blok, de vervangers en de "Onderhoud gepland"-melding gaan alle over vA, die de klant niet meer rijdt), of het blok wordt herbenoemd/geannuleerd mét klantmelding.
- **Actual:** zie boven.
- **Root cause:** het generieke `PATCH /api/reservations/:id`-pad (`routes.ts` ~3445+) weet niets van `affectedRentalId`/`portalRequestId` op blokken; `findPortalCustomerForBlock` (`portal-maintenance-events.ts:34-44`) en `vehicles/mine` keyen alleen op voertuig.
- **Affected files:** `server/routes.ts`, `server/services/portal-maintenance-events.ts`
- **Affected data:** blokken/vervangers met een `affectedRentalId` die naar een verhuur op een ander voertuig wijst.
- **Security impact:** geen.
- **Business impact:** de klant houdt een melding "onderhoud op 28-09" voor een auto die hij heeft ingeleverd, kan die niet meer wijzigen, en kantoor ziet een blok met vervanger voor een verhuur die op een andere auto staat.
- **Fix proposal:** wanneer de `vehicleId` van een verhuur wijzigt en er live blokken/vervangers naar verwijzen: geef een `needsDecision`-achtige 409 (zoals `needsSpareVehicle`) of annuleer/herbenoem ze en stuur `maintenance_cancelled`.
- **Regression test:** verhuur met gekoppeld blok → voertuig wisselen → 409 óf blok geannuleerd + melding.

#### BUG-140 — Een transport verwijderen is een harde delete zonder prullenbakvermelding
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (of transporten een prullenbak krijgen is een productbesluit) · **Bron:** T11-014
- **Feature:** `DELETE /api/transports/:id`
- **Reproduction:** (`p11-transport.cjs` T8) `DELETE /api/transports/44` (breakdowntransport waarvan vervanger #3379 al was opgehaald) → **204**; `select * from vehicle_transports where id=44` → geen rij; `GET /api/deleted-records` → geen vermelding voor het transport; reservering #3379 blijft `picked_up` met `replacement_for_transport_id=null`.
- **Expected:** consistent met voertuigen en boetes: een herstelbare snapshot in `deleted_records` (of een soft delete), zodat een transport met een echte overdracht terug te halen is en de vervangingsreservering zijn herkomst houdt.
- **Actual:** de rij is weg (`deleteTransport` doet `db.delete`, `database-storage.ts:2005-2008`; commentaar "No deletedAt column on this table", 1972-1974); alleen `audit_logs` `transport.delete` met het id blijft over.
- **Root cause:** geen soft delete/snapshot voor `vehicle_transports`; `restoreDeletedRecord` ondersteunt alleen `vehicle` en `fine` (637-645).
- **Affected files:** `server/database-storage.ts` (`deleteTransport`, `restoreDeletedRecord`), `server/routes.ts:7473-7520`
- **Affected data:** `vehicle_transports`, `reservations.replacement_for_transport_id`.
- **Security impact:** geen (de route vereist `MANAGE_VEHICLES`/`MANAGE_RESERVATIONS`).
- **Business impact:** het per ongeluk verwijderen van een transport waarvan de auto al is overgedragen is onherstelbaar en vanaf de reserveringskant niet meer te traceren — dezelfde klasse probleem als het incident van 2026-08-25, maar dan voor transporten.
- **Fix proposal:** snapshot het transport (inclusief de vervangerslink) in `deleted_records` vóór het verwijderen, of voeg een `deletedAt`-kolom toe en filter die zoals bij reserveringen.
- **Regression test:** transport verwijderen → `deleted_records` bevat een vermelding → restore maakt hem opnieuw aan mét vervangerslink.

#### BUG-141 — Twee gelijktijdige portaalgoedkeuringen maken twee onderhoudsblokken, twee antwoorden en twee klantmeldingen
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** D12-004
- **Feature:** `POST /api/portal-requests/:id/approve`
- **Reproduction:** (test f) portaalaanvraag 594 (type `maintenance`, verhuur 3423, `needsReplacement`). Twee `approve`-aanroepen tegelijk versturen (`{startDate:"2026-09-18", durationDays:2}`) → **beide 200**: onderhoudsblokken **3424 en 3425** (zelfde voertuig, zelfde datums, beide `status 'active'`, beide `portal_request_id 594`), twee staffantwoorden (berichten 222, 223), twee portaalmeldingen (418, 419); één placeholder (3426, omdat `createPlaceholderReservation` wél een duplicaatcontrole heeft); aanvraag `done`. Ook te raken met een snelle dubbelklik in de UI. Ter controle (test f2): één enkele goedkeuring duurt 85 ms en levert blok 3449 met één melding 422.
- **Expected:** één 200 en één 400 "Request is already closed"; één onderhoudsblok.
- **Actual:** zie boven.
- **Root cause:** `server/routes/portal-requests.ts:308` controleert `isValidRequestTransition` op een rij die vóór de schrijfacties is gelezen; de tien schrijfacties in `approveMaintenance` (:320-347) en `finish` (:47) draaien zonder transactie of rijvergrendeling, zodat het tweede verzoek dezelfde controle passeert. Dezelfde vorm geldt voor `approveBooking` (:205-259) en `approveMaintenanceChange` (:349-394).
- **Affected files:** `server/routes/portal-requests.ts`, `server/services/portal-requests-storage.ts`
- **Affected data:** auditrijen 3424/3425 (aanvraag 594).
- **Security impact:** geen.
- **Business impact:** dubbele onderhoudsblokken (de data achter BUG-037) en dubbele klantmeldingen uit één klik.
- **Fix proposal:** voer de statusovergang als voorwaardelijke `UPDATE … WHERE status IN (toegestaan)` aan het begin uit en breek af wanneer 0 rijen zijn geraakt; wikkel de goedkeuringsschrijfacties in `db.transaction`.
- **Regression test:** twee gelijktijdige goedkeuringen → precies één blok, één antwoord, één melding; de tweede aanroep 400.

#### BUG-142 — `POST /api/transports` laat na een 409 een weestransport achter
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** D12-005
- **Feature:** `POST /api/transports` met vervangertoewijzing
- **Reproduction:** (test d2) reservevoertuig 1815 heeft verhuur 3443 van 2028-01-12..15. `POST /api/transports {vehicleId:1814, transportType:"swap", scheduledDate:"2028-01-13", spareRequired:true, relatedVehicleId:1815, isBreakdownOrMaintenance:true}` → **409** "Replacement vehicle has conflicting reservations for this date" — maar transport **59** bestaat (`status scheduled`, `spare_required false`, `related_vehicle_id null`, `is_breakdown false`) en staat in `GET /api/transports`. Personeel dat het opnieuw probeert maakt een tweede transport. (Ter vergelijking, test d: dezelfde opzet met een verhuur die op de transportdag *begint* geeft juist 201 door BUG-107.)
- **Expected:** 409 en geen enkele transportrij.
- **Actual:** zie boven; de onderhoudsstatus van het voertuig bleef wél correct onaangeroerd (dat deel zit in de transactie).
- **Root cause:** `server/routes.ts:7411-7422` voegt het kale transport in met `storage.createTransport` (buiten elke transactie) en roept pas daarna `applyTransportUpdate` aan, waarvan de transactie zijn eigen schrijfacties terugdraait maar niet de eerdere insert.
- **Affected files:** `server/routes.ts`, `server/database-storage.ts`
- **Affected data:** auditrij `vehicle_transports` 59. Kandidaat in de kloon: transport 42 (`spare_required` zonder vervangingsreservering) past bij deze vorm — **te herverifiëren in productie**.
- **Security impact:** geen.
- **Business impact:** spooktransporten op de transportpagina na een mislukte opslagpoging, en duplicaten zodra iemand het opnieuw probeert.
- **Fix proposal:** draai `createTransport` binnen dezelfde `db.transaction` als `applyTransportUpdate` (geef `tx` door), of verwijder de ingevoegde rij wanneer `applyTransportUpdate` gooit.
- **Regression test:** conflicterende vervanger → 409 en `count(vehicle_transports where reason=…) = 0`.

#### BUG-143 — Weesrijen overleven omdat er geen FK en geen opruimpad is: onderhoudsblokken op verdwenen voertuigen en meldingen op verdwenen placeholders
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (de eenmalige opschoning en het toevoegen van FK's zijn wijzigingen aan de gegevensstructuur, zie §7) · **Bron:** D12-007 — *de 258 `active`-blokken zijn hier afgesplitst naar BUG-145*
- **Feature:** Data-integriteit — `reservations.vehicle_id` zonder FK, `custom_notifications` met een id in de beschrijvingstekst
- **Reproduction:** `select count(*) from reservations r where deleted_at is null and vehicle_id is not null and not exists (select 1 from vehicles v where v.id=r.vehicle_id)` → **262** (243 met `created_at < 2026-09-09`), waarvan 258 van het type `maintenance_block` met status `active`, verdeeld over 163 verschillende voertuig-id's 1022..1660, aangemaakt 2026-09-06 19:52 .. 2026-09-08 door `createMaintenanceBlock` (notities "Vehicle maintenance block", `created_by` null); 139 daarvan hebben `start_date >= vandaag`. Er is voor de id's 1022-1660 **geen enkele** `deleted_records`-rij en **geen enkele** `vehicle.delete`-auditrij: die voertuigen zijn buiten het deletepad van de applicatie om verdwenen. Verder: `select count(*) from custom_notifications n where type='spare_assignment'` en het `[placeholder:N]`-id niet bestaat → **55 van de 62** (51 pre-existing, alle ongelezen), bijvoorbeeld 171 `[placeholder:2329]`, 172 `[placeholder:2337]`, 173 `[placeholder:2340]`.
- **Expected:** een blok kan zijn voertuig niet overleven; een melding kan haar placeholder niet overleven.
- **Actual:** omdat `reservations.vehicle_id` geen FK heeft en `custom_notifications` het placeholder-id alleen in vrije tekst draagt, ruimt niets deze rijen op. De placeholders zelf zijn hard verwijderd via `storage.deleteReservation` (het BUG-004-pad).
- **Root cause:** `shared/schema.ts:711` (geen FK op `reservations.vehicle_id`); `server/database-storage.ts` `createMaintenanceBlock` (:3329), `deleteReservation` (:1270), `deleteNotificationsByTypeAndPattern`.
- **Affected files:** `shared/schema.ts`, `server/database-storage.ts`
- **Affected data:** in de kloon: 243 pre-existing blokken (id's 2175-3199) en 51 pre-existing meldingen, plus 19 auditblokken en 4 auditmeldingen. **Het overgrote deel van de blokken is testsuite-afval (BUG-145), niet uw administratie — en al deze aantallen moeten eerst in productie opnieuw gemeten worden.**
- **Security impact:** geen.
- **Business impact:** 139 spook-"actieve" onderhoudsblokken in het toekomstige kalendervenster en 62 ongelezen staffmeldingen die nooit meer opgelost kunnen worden — in de ontwikkelomgeving. Of dat ook voor productie geldt is onbekend tot het daar gemeten is.
- **Fix proposal (voorstel, goedkeuring nodig):** eenmalige opschoning (blokken waarvan het voertuig ontbreekt soft-deleten; meldingen waarvan de placeholder ontbreekt verwijderen), plus een FK op `reservations.vehicle_id` (of een nachtelijke integriteitstaak) en het placeholder-id in een echte kolom met FK.
- **Regression test:** de integriteitsquery hierboven geeft 0 na de opschoning; een blok aanmaken voor een niet-bestaand voertuig → 400.

#### BUG-144 — De levenscyclusstatussen in de bestaande data komen niet overeen met de statusmachine
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (een datareconciliatie is een wijziging aan bestaande gegevens, zie §7) · **Bron:** D12-008
- **Feature:** Reservering- en voertuigtoestanden in de bestaande (dev-)data
- **Reproduction:** `select count(*) from reservations where deleted_at is null and status='picked_up' and end_date < current_date::text` → **358** (357 pre-existing; 344 zonder `actual_pickup_date`; 480 `picked_up`-rijen hebben geen `pickup_mileage`); `… and start_date > current_date::text` → **130** (126 pre-existing); `status='booked' and type='standard' and start_date < vandaag−30` → **336** (335 pre-existing); 62 voertuigen hebben een live `picked_up`-verhuur maar `availability != 'rented'`; 8 voertuigen zijn `rented` zonder enige `picked_up`-verhuur.
- **Expected:** een `picked_up`-verhuur heeft een ophaaldatum en kilometerstand en is begonnen; een voertuig is `rented` dan en slechts dan als er een verhuur is opgehaald.
- **Actual:** ongeveer één op de vier live reserveringen in de kloon staat in een toestand die de pickup-/returnflow niet kan produceren (opgehaald vóór de startdatum, of opgehaald zonder overdrachtsgegevens), en de voertuigbeschikbaarheid spreekt de verhuringen tegen voor 70 voertuigen. `syncVehicleAvailabilityWithReservations` (`database-storage.ts:224-353`) verzoent alleen `available`/`scheduled`/`rented` op basis van datums, negeert onderhoudsblokken en leidt nooit `needs_fixing` af; geen enkele taak signaleert te late retouren.
- **Root cause:** data die buiten de statusmachine om is geïmporteerd/geseed (geen auditrijen), in combinatie met de niet-atomaire pickup/return (BUG-120) en statuswijzigingen via de generieke PATCH (BUG-016/BUG-084).
- **Affected files:** `server/database-storage.ts`, `server/vehicle-status-helper.ts`
- **Affected data:** de aantallen hierboven; voorbeelden 214, 796, 1303 (`picked_up`, einde 2026-02), 353 op voertuig 13 (`picked_up`, begint 2026-09-27), voertuigen 2, 4, 41, 74, 82, 240 (`rented` zonder verhuur). **Alle aantallen komen uit de dev-kloon en moeten in productie opnieuw gemeten worden voordat er iets mee gedaan wordt.**
- **Security impact:** geen.
- **Business impact:** overzichten voor te late retouren en vlootbeschikbaarheid kloppen voor een groot deel van de vloot niet; contractregeneratie en kilometerrapportages missen ophaalgegevens.
- **Fix proposal (voorstel, goedkeuring nodig):** een reconciliatiescript — `picked_up` met een startdatum in de toekomst → `booked`; `picked_up` over de einddatum zonder werkelijke gegevens → markeren voor beoordeling; `vehicles.availability_status` herberekenen uit verhuringen én blokken. Technisch deel dat wél zonder goedkeuring kan: een applicatieguard (of DB-CHECK) die eist dat `picked_up` een `actual_pickup_date` en `pickup_mileage` heeft.
- **Regression test:** de integriteitsqueries geven 0 na de reconciliatie; `PATCH /:id {status:'picked_up'}` zonder ophaalgegevens → 400.

#### BUG-145 — De vitest-suite draait tegen de gedeelde dev-database en laat 258 wees-onderhoudsblokken achter
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** aanvullende bevinding van de leidende auditor (verklaart de grootste post uit D12-007)
- **Feature:** Testinfrastructuur — `server/__tests__` versus de ontwikkelomgeving
- **Reproduction:** de 258 `active`-onderhoudsblokken op niet-bestaande voertuig-id's **1022–1657** in de dev-kloon dragen alle het profiel `notes = 'Vehicle maintenance block'`, `created_by` null, `customer_id` null, `portal_request_id` null, aangemaakt tussen 2026-09-06 en 2026-09-09, met startdatums als 2098-12-20, 2099-03-01, 2099-04-01, 2026-10-10 en 2026-08-20. Dat profiel komt uit de testsuite: `server/__tests__/portal-maintenance-events.test.ts` en `server/__tests__/portal-requests-routes.test.ts` roepen `storage.createMaintenanceBlock(...)` aan (`server/database-storage.ts:3323-3340`, dat `status 'active'` invoegt), en de opruimhelper `cleanupPortalTestData` in `server/__tests__/portal-helpers.ts:74-93` verwijdert reserveringen **uitsluitend via de id's van de testklanten** — terwijl de blokken `customer_id` NULL hebben — en doet daarna een **harde delete van de `PT%`-voertuigen**. De blokken blijven dus achter op voertuig-id's die niet meer bestaan; dat dit kan, komt doordat `reservations.vehicle_id` geen FK heeft (BUG-039).
- **Expected:** de testsuite draait tegen een eigen database en laat na afloop geen enkele rij achter; de opruimhelper verwijdert alles wat de test heeft gemaakt.
- **Actual:** de suite schrijft in de gedeelde dev-database en ruimt zijn eigen onderhoudsblokken niet op, omdat de opruimquery op klant-id filtert en de blokken geen klant hebben.
- **Root cause:** `server/__tests__/portal-helpers.ts:74-93` (`cleanupPortalTestData`: verwijdert reserveringen via de testklant-id's en hard-delete daarna de `PT%`-voertuigen); `server/database-storage.ts:3323-3340` (`createMaintenanceBlock` schrijft `status 'active'` zonder klant); `shared/schema.ts` (geen FK op `reservations.vehicle_id`, BUG-039); de testconfiguratie wijst naar dezelfde database als de ontwikkelomgeving.
- **Affected files:** `server/__tests__/portal-helpers.ts:74-93`, `server/__tests__/portal-maintenance-events.test.ts`, `server/__tests__/portal-requests-routes.test.ts`, `server/database-storage.ts:3323-3340`
- **Affected data:** 258 `active`-blokken op voertuig-id's 1022–1657 in de dev-kloon, waarvan 139 in het toekomstige kalendervenster vallen en 157 van de 160 overlappende blokparen vormen. **Dit is een dev-artefact, uitdrukkelijk géén productiebevinding.**
- **Security impact:** geen.
- **Business impact:** de gedeelde ontwikkeldatabase raakt bij elke testronde verder vervuild; de vervuiling verbergt échte defecten (elke integriteitsscan wordt gedomineerd door dit afval) en maakt handmatig testen in dezelfde omgeving onbetrouwbaar. Het onderliggende mechanisme — een voertuig hard verwijderen terwijl er blokken op staan — is exact hetzelfde als in de productiecode (BUG-110, BUG-143).
- **Fix proposal:** laat `cleanupPortalTestData` óók de reserveringen van de test-**voertuig**-id's verwijderen (en niet alleen die van de testklanten) vóórdat de voertuigen worden verwijderd; laat de suite tegen een eigen testdatabase draaien (aparte `DATABASE_URL` in de vitest-configuratie), zodat de ontwikkeldatabase nooit meer testafval bevat.
- **Regression test:** tel vóór en na een volledige `vitest`-run `select count(*) from reservations r where r.vehicle_id is not null and not exists (select 1 from vehicles v where v.id = r.vehicle_id)` — het aantal moet gelijk blijven.

### 5.4 LOW

#### BUG-146 — Waarschuwingen bij een handmatige statuswijziging bereiken de client nooit
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** V9-011
- **Feature:** Voertuigen — handmatige `availabilityStatus`-wijziging (`PATCH /api/vehicles/:id`)
- **Reproduction:** (`p9-01-lifecycle.cjs` stap F) met `booked` reservering 3339 op voertuig 1762: `PATCH /api/vehicles/1762 {"availabilityStatus":"needs_fixing"}` → 200; de responsbody is het kale voertuigobject, zonder `warning`- of `message`-sleutel (gelogd: "response has warning key: false"). `validateManualStatusChange` geeft voor exact dit geval de waarschuwing "Vehicle has upcoming booked reservations. Changing status may require rescheduling those bookings." terug (`vehicle-status-helper.ts:118-124`).
- **Expected:** de waarschuwing maakt deel uit van de respons (of een 202/vlag) zodat de UI hem kan tonen.
- **Actual:** `server/routes.ts:1173-1175` — `if (validation.warning) { console.log(...) }`; de waarschuwing wordt weggegooid.
- **Root cause:** `server/routes.ts:1173-1175`
- **Affected files:** `server/routes.ts:1082-1233`; `server/vehicle-status-helper.ts:74-145`
- **Affected data:** geen.
- **Security impact:** geen.
- **Business impact:** de statusmachine is juist ontworpen om personeel te waarschuwen wanneer het een geboekt/verhuurd voertuig uit dienst neemt; die waarschuwing bestaat maar niemand ziet hem — wat bijdraagt aan BUG-109.
- **Fix proposal:** geef `{...vehicle, warning: validation.warning}` (of een `warnings`-array) terug uit de PATCH en toon dat in het voertuigformulier.
- **Regression test:** `PATCH needs_fixing` op een voertuig met een `booked` reservering → de respons bevat de waarschuwingstekst.

#### BUG-147 — Elke voertuigverwijdering schrijft twee `vehicle.delete`-auditrijen; een restore wordt als `vehicle.update` gelogd
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** V9-012 (+ meting uit p12 §3)
- **Feature:** Audittrail rond verwijderen/herstellen van voertuigen
- **Reproduction:** `select id, action, (details ? 'cascaded') as from_route, details->>'path' from audit_logs where resource_type='vehicle' and resource_id='1762' and action='vehicle.delete' order by id` → `2317 vehicle.delete from_route=true`, `2318 vehicle.delete path=/api/vehicles/1762`, `2322 …true`, `2323 …path` — twee rijen per DELETE, beide "success". `select id, action, details->>'restoredFromDeletedRecord' from audit_logs where details->>'restoredFromDeletedRecord' in ('36','37')` → `2320 vehicle.update dr=36`, `2326 vehicle.update dr=37` — geen eigen restore-actie. Fase 12 telt dit database-breed: 22 groepen van dezelfde actie + resource binnen 2 seconden, waaronder `vehicle.delete|1709` (15 rijen) en `vehicle.delete|1762` (6 rijen); test j2 laat 2 `vehicle.delete`-rijen voor één delete zien.
- **Expected:** één auditrij per delete; een restore is een eigen actie (`vehicle.restore`) zodat er op gezocht en gerapporteerd kan worden.
- **Actual:** de route logt `vehicle.delete` expliciet (`routes.ts:1666-1676`) en de generieke `auditMutations`-middleware (`server/middleware/audit.ts:171-`) logt dezelfde geslaagde DELETE nog eens; de restore-route logt met actie `'vehicle.update'` (`routes.ts:1748`) omdat `'vehicle.restore'` niet in de `AuditAction`-union staat (`server/utils/security/auditLogger.ts:21`).
- **Root cause:** `server/routes.ts:1666-1676, 1748`; `server/middleware/audit.ts:171-215`; `server/utils/security/auditLogger.ts:21`
- **Affected files:** als boven
- **Affected data:** `audit_logs` (duplicaten bij elke voertuigverwijdering).
- **Security impact:** geen (meer logging, niet minder), maar dubbele rijen blazen elke telling van "verwijderde voertuigen" op die op `audit_logs` is gebouwd.
- **Business impact:** laag; het maakt het incidentonderzoek ("wie heeft dit voertuig verwijderd/hersteld") onnodig rommelig.
- **Fix proposal:** voeg `DELETE /api/vehicles/:id` toe aan `SKIPPED_PATH_PATTERNS` (de route logt zelf al rijkere details) of laat de routelog weg; voeg `'vehicle.restore'` toe aan de actie-union en gebruik die in de restore-route.
- **Regression test:** verwijder een voertuig → exact één `vehicle.delete`-rij; herstel → één `vehicle.restore`-rij.

#### BUG-148 — Databasefouten (23503/23505) worden rauw doorgegeven of op het verkeerde veld gemapt
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** V9-013 + V9-015 + R10-016 + D12-010 — *samengevoegd (één klasse: pg-foutcodes worden niet herkend)*
- **Feature:** Foutafhandeling op transporten, voertuigen, reserveringen en verwijderacties
- **Reproduction:**
  - *V9-013 (transporten):* `POST /api/transports {"vehicleId":1787 (verwijderd),"transportType":"tow","scheduledDate":"2026-09-15","reason":"AUDIT-P9"}` → **500** `{"message":"Failed to create transport"}`; idem met een verwijderd `relatedVehicleId`. De FK-schending (23503 op `vehicle_transports.vehicle_id`/`related_vehicle_id`) wordt niet herkend; de catch mapt alleen de meldingen "conflicting reservations" en "cannot be the same as".
  - *V9-015 (barcode):* `POST /api/vehicles {…,"barcode":"VEH-001762-R2"}` → 409 `{"message":"A vehicle with this license plate already exists…","field":"licensePlate"}` — het gaat om de **barcode**, niet het kenteken; `PATCH /api/vehicles/1780 {"barcode":"VEH-001762-R2"}` → 400 `{"message":"Invalid vehicle data","error":"duplicate key value violates unique constraint \"vehicles_barcode_unique\""}`.
  - *R10-016 (reserveringen):* `PATCH /:id {driverId:999999999}` → 400 `{"message":"Failed to update reservation","error":"insert or update on table \"reservations\" violates foreign key constraint \"reservations_driver_id_drivers_id_fk\""}`; dezelfde body op `/basic` → **500** met dezelfde tekst; `{deliveryStaffId:999999}` → 400/500; `/basic` met een dubbel `contractNumber` → 500 "duplicate key value violates unique constraint \"reservations_contract_number_unique\"" (klasse BUG-038).
  - *D12-010 (verwijderen):* `DELETE /api/vehicles/1788` terwijl een `interactive_damage_checks`-rij (op een **ander** voertuig) naar een reservering ervan verwijst → **500** met het **complete pg-errorobject** in de body (severity, `code 23503`, detail "Key (id)=(3407) is still referenced from table interactive_damage_checks", schema, tabel, constraint, bestand/regel van de server). `DELETE /api/customers/1279` met een `vehicle_waitlist`-rij → idem. Er wordt correct niets verwijderd.
- **Expected:** 400/404/409 met een veldgerichte melding; geen constraintnamen, schemanamen of serverpaden in de respons.
- **Actual:** generieke catch-blokken echoën `error.message` of serialiseren het hele errorobject; de create-handler van voertuigen beschouwt élke 23505 met "duplicate key" als een kentekenduplicaat.
- **Root cause:** `server/routes.ts:7388-7437` (catch van `POST /api/transports`, geen bestaanscontrole vooraf); `server/routes.ts:829-836` (`errorMessage.includes('license_plate') || errorMessage.includes('duplicate key')`) en `:1224-1231` (PATCH-catch-all 400); `server/routes.ts:3218-3228` (`/basic` → 500) en `:3778-3790` (`PATCH /:id` → 400); `server/routes.ts:1685-1688` en `:2131` (`res.status(500).json({ message, error })` met het rauwe object).
- **Affected files:** `server/routes.ts`
- **Affected data:** geen (alle inserts/deletes worden teruggedraaid).
- **Security impact:** interne schema- en constraintnamen lekken naar elke gebruiker met `MANAGE_VEHICLES`/`MANAGE_CUSTOMERS`/`MANAGE_RESERVATIONS` (zelfde klasse als BUG-057, BUG-090, BUG-103).
- **Business impact:** personeel kan niet zien waarom een actie mislukte: men wordt aangeraden het kenteken te wijzigen terwijl de barcode het probleem is, of krijgt een Postgres-constraintnaam te zien in plaats van "deze klant heeft nog een wachtlijstrij".
- **Fix proposal:** map de pg-codes 23503 → 404/409 en 23505 → 409 centraal, met de veldnaam uit `error.constraint`; serialiseer het errorobject nooit; controleer het bestaan van `vehicleId`/`relatedVehicleId`/`driverId`/`deliveryStaffId` vooraf en geef 404.
- **Regression test:** `POST` een transport met een niet-bestaande `vehicleId` → 404; create/update met een bezette barcode → 409 met `field: "barcode"`; `PATCH {driverId: niet-bestaand}` → 404 "driver not found"; geblokkeerde delete → 409 zonder `constraint`/`schema`-sleutels in de body.

#### BUG-149 — Service-intervalvelden accepteren onzin en zetten de onderhoudsherinnering stilzwijgend uit
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** V9-014
- **Feature:** Voertuigen — `serviceIntervalKm`, `serviceIntervalMonths`, `lastServiceDate`, `lastServiceMileage`
- **Reproduction:** (`p9-01-lifecycle.cjs` stap B) `PATCH /api/vehicles/1762 {"serviceIntervalKm":-5,"serviceIntervalMonths":0}` → 200; SQL `service_interval_km -5`, `service_interval_months 0`, terwijl `GET /api/vehicles/service-due` het voertuig toont met `intervalKm 30000` / `intervalMonths 12` (de defaults — de opgeslagen waarden worden stil genegeerd). `PATCH /api/vehicles/1762 {"lastServiceDate":"2027-10-15","lastServiceMileage":50000}` (datum in de toekomst, stand boven de huidige 39500) → 200; `GET service-due` toont het voertuig daarna helemaal niet meer.
- **Expected:** intervallen > 0, `lastServiceDate` niet in de toekomst, `lastServiceMileage <= currentMileage`, met 400 bij overtreding.
- **Actual:** geen enkele zod-refinement op de vier velden; `computeServiceDue` behandelt niet-positieve intervallen als "gebruik de default" (`shared/service-due.ts:107-108`), zodat de UI −5 toont terwijl de herinnering met 30000 rekent; een toekomstige laatste-servicewaarde laat de auto vers onderhouden lijken en hij verdwijnt uit `service-due` én uit de nachtelijke melding.
- **Root cause:** `shared/schema.ts:277-286` (`insertVehicleSchema` zonder refinement); `shared/service-due.ts:107-108` (maskeert slechte waarden).
- **Affected files:** `shared/schema.ts:277-286`; `shared/service-due.ts`; `server/routes.ts:1082-1233`
- **Affected data:** voertuig 1762 (waarden na de test hersteld).
- **Security impact:** geen.
- **Business impact:** een typefout in de servicevelden haalt een voertuig zonder enige foutmelding uit de onderhoudsherinneringen; zelfde familie als BUG-041/BUG-042.
- **Fix proposal:** `.int().positive()` op de intervallen en refinements `lastServiceDate <= vandaag` en `lastServiceMileage <= currentMileage` (met dezelfde override-semantiek als bij kilometerverlagingen wanneer terugdateren legitiem is).
- **Regression test:** `PATCH serviceIntervalKm -5` → 400; `lastServiceDate` morgen → 400.

#### BUG-150 — Bestanden blijven na een voertuigverwijdering voorgoed op schijf staan; documentmappen op kenteken worden na hernoemen of hergebruik gedeeld
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** V9-016
- **Feature:** Documenten — bestandsopslag bij verwijderen, hernoemen en hergebruik van een kenteken
- **Reproduction:** (`p9-04-gaps.cjs` stappen B en C) **B.** voertuig 1776 (`AU-903-X`): `POST /api/documents` → id 284, bestand `audit-uploads/AU903X/other/AU903X_Other_….pdf`. `DELETE /api/vehicles/1776` → 200; `documents where id=284` → `[]`; het bestand staat er nog (nodig, want een restore heeft het weer nodig). Wordt het voertuig niet hersteld, dan blijft het bestand voor altijd staan: `deleted_records` heeft geen purge-endpoint (routeprobe: alleen list en restore bestaan, `routes.ts:1697-1761`). **C.** voertuig 1777 aangemaakt als `AU-903-X` met document 285 in map `AU903X`; `PATCH licensePlate` → `AU-9RN-73` → 200, het documentpad blijft ongewijzigd (nog steeds downloadbaar, 200). Nieuw voertuig 1778 met het oude kenteken `AU-903-X`; zijn document 286 belandt in dezelfde map `AU903X`. SQL: documenten 285 (voertuig 1777) en 286 (voertuig 1778) staan beide onder `..\audit-uploads\AU903X\other\`.
- **Expected:** óf een purge ("prullenbak legen") die snapshot én bestanden opruimt, óf minstens een inventarisatie van weesbestanden; documentopslag gesleuteld op voertuig-id (of kenteken + id) zodat mappen niet tussen voertuigen gedeeld worden.
- **Actual:** `deleteVehicle` verwijdert alleen de rijen (`database-storage.ts:592`) — noodzakelijk, omdat de restore de bestanden hergebruikt — maar er is geen tegenhanger die ze ooit opruimt; opslagpaden worden bij het uploaden uit het kenteken afgeleid en bij hernoemen nooit verplaatst.
- **Root cause:** `server/database-storage.ts:535-618` (geen bestandsafhandeling), `server/routes.ts:1697-1761` (geen purgeroute), `server/routes.ts:5000-5068` (`POST /api/documents` bouwt het pad uit het kenteken).
- **Affected files:** als boven
- **Affected data:** `audit-uploads/AU903X` (bestanden van het verwijderde 1776, het hernoemde 1777 en het hergebruikte 1778), `AU901X`, `AU902X`. Fase 12 telt database-breed 16 van de 65 bestanden in `audit-uploads` zonder DB-rij (14,8 MB) en 98 van de 157 in de repo-`uploads` (6,5 MB).
- **Security impact:** geen nieuw (padcontainment is BUG-012).
- **Business impact:** de schijf groeit onbeperkt, en bij hergebruik van een kenteken (gewoon na een typefout) staan de contracten en schadechecks van twee verschillende auto's in één map — verwarrend bij het doorbladeren van de uploadmap of van een back-up.
- **Fix proposal:** een beheerderspurge voor `deleted_records` die ook de bestanden uit de snapshot verwijdert; sla documenten op onder `<vehicleId>/` (of `<kenteken>-<id>/`) en verplaats de map bij een kentekenwijziging.
- **Regression test:** voertuig verwijderen + purgen → de bestanden zijn weg; kenteken hernoemen → documenten blijven oplosbaar en een nieuw voertuig met het oude kenteken krijgt zijn eigen map.

#### BUG-151 — Soft-deleted reserveringen staan niet in de prullenbak en hebben geen herstelpad
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (of reserveringen in de prullenbak horen is een productbesluit) · **Bron:** R10-015
- **Feature:** `DELETE /api/reservations/:id` (soft delete) versus `GET /api/deleted-records`
- **Reproduction:** (`p10-e` E1) `DELETE /api/reservations/3387` → 200 (soft). `GET /api/deleted-records` → aanwezige entiteitstypen `["vehicle","fine"]`, geen enkele reservering. Er is geen route die matcht op `/api/reservations/:id/restore` (probe uit fase 3-5). Een handmatige `update reservations set deleted_at=null` — de enige mogelijke herstelactie — maakte meteen een dubbele boeking met 3388, dat inmiddels legitiem was aangemaakt (`check-conflicts` → `[3388, 3387]`).
- **Expected:** soft-deleted reserveringen staan in de prullenbak, met een herstelactie die de conflictcontrole opnieuw draait.
- **Actual:** soft-deleted rijen worden overal simpelweg weggefilterd; niets brengt ze aan de oppervlakte.
- **Root cause:** `server/routes.ts:1694` (`deleted-records` toont alleen de tabel `deleted_records`); geen restore-route voor reserveringen.
- **Affected files:** `server/routes.ts`
- **Affected data:** 3387 (door het script opnieuw verwijderd).
- **Security impact:** geen.
- **Business impact:** een per ongeluk verwijderde reservering is voor personeel onherstelbaar; herstel op databaseniveau kan dubbel boeken.
- **Fix proposal:** toon `reservations where deleted_at is not null` in de prullenbak en voeg een restore toe die conflicten controleert.
- **Regression test:** verwijderen, herstellen → 200 en rij zichtbaar; herstellen over een conflicterende boeking heen → 409.

#### BUG-152 — Subacties van reserveringen worden als `reservation.create` gelogd
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** R10-017
- **Feature:** Audittrail — pickup, return, `mark-needs-service`, `assign-spare`
- **Reproduction:** (elke p10-snapshot) `audit_logs` voor een reservering na pickup/return/mark-needs-service/assign-spare: actie `reservation.create` met `details.operation` `pickup` / `return` / `mark-needs-service` / `assign-spare` — bijvoorbeeld voor 3429: "reservation.create, reservation.create/mark-needs-service, reservation.create/assign-spare, reservation.update/status".
- **Expected:** `reservation.pickup`, `reservation.return`, … (of `reservation.update` met de operatie).
- **Actual:** `server/middleware/audit.ts:161-168` — `verbFor('POST') = 'create'`, ongeacht het subpad; de subactie blijft alleen in `details` staan.
- **Root cause:** `server/middleware/audit.ts:161-168, 177`
- **Affected files:** `server/middleware/audit.ts`
- **Affected data:** alle bestaande auditrijen voor deze operaties.
- **Security impact:** geen.
- **Business impact:** het activiteitenlog zegt drie keer "reservering aangemaakt" voor één verhuur; filteren op actie is misleidend.
- **Fix proposal:** gebruik `${type}.${subAction}` wanneer er een subactie is en het id bekend is.
- **Regression test:** pickup → auditactie `reservation.pickup`.

#### BUG-153 — Het aantal verhuurdagen verschilt één tussen de contractgegevens en het financiële rapport
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (welke conventie leidend is, raakt facturatie) · **Bron:** R10-018
- **Feature:** Prijsberekening — `GET /api/contracts/data/:id` versus `GET /api/reports/vehicle-financials`
- **Reproduction:** (`p10-b` B1) reservering 3360, 2026-09-10..2031-09-09: `GET /api/contracts/data/3360` → "1825 days"; `GET /api/reports/vehicle-financials?from=2026-09-10&to=2026-09-10&vehicleId=1736` → `rentalDays 1826`. B3 (start = eind): rapport `rentalDays 1`.
- **Expected:** overal dezelfde dagtelling (inclusief óf exclusief).
- **Actual:** het contract rekent `eind − start`, het rapport telt inclusief.
- **Root cause:** `server/routes.ts` (contractgegevens, ~6080+) versus `server/routes/reports.ts:269` (dagberekening van `vehicle-financials`).
- **Affected files:** `server/routes.ts`, `server/routes/reports.ts`
- **Affected data:** geen.
- **Security impact:** geen.
- **Business impact:** omzet-per-dag en het aantal dagen op de factuur verschillen bij élke verhuur één dag.
- **Fix proposal:** één gedeelde helper `rentalDays(start, end)` — de eigenaar kiest welke conventie leidend is (zie §7).
- **Regression test:** boeking van 5 dagen → beide endpoints geven hetzelfde aantal.

#### BUG-154 — `PATCH /api/vehicles/:id/maintenance-status` raakt het gekoppelde onderhoudsblok en de portaalhook niet
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** T11-015
- **Feature:** Voertuigonderhoudsstatus versus het onderhoudsblok
- **Reproduction:** (`p11-portal3.cjs` Q3b) vA heeft gepland blok #3343 (portaalaanvraag #583). `PATCH /api/vehicles/<vA>/maintenance-status {"status":"in_service","note":"…"}` → 200; daarna `{"status":"ok"}` → 200. Resultaat: alleen `vehicles.maintenance_status`/`note` wijzigen; blok #3343 blijft `scheduled`; geen enkele portaalmelding; het voertuig leest `in_service` terwijl zijn kalenderblok "scheduled" zegt en de klant `canRequestChange=true` houdt. De body gebruikt bovendien `status`, terwijl de aanname `maintenanceStatus` uit een eerdere fase wordt geweigerd — ongedocumenteerd.
- **Expected:** het ontwerpdocument `2026-09-06-portal-vehicles-maintenance-design.md` §4 noemt deze route als hook-aanroeppunt "wanneer de status van het gekoppelde blok verandert": het geplande blok gaat naar `in` (en terug naar `out`/`scheduled`) en de klant krijgt `maintenance_in`/`maintenance_out`.
- **Actual:** zie boven.
- **Root cause:** `server/routes.ts:1240-1273` roept alleen `markVehicleForService` aan; geen lookup van het actieve blok, geen `onMaintenanceBlockChanged`.
- **Affected files:** `server/routes.ts`
- **Affected data:** drift tussen `vehicles.maintenance_status` en `reservations.maintenance_status`.
- **Security impact:** geen.
- **Business impact:** twee bronnen van waarheid voor "staat in de werkplaats"; de klant wordt niet verteld dat de auto binnen is.
- **Fix proposal:** werk, wanneer het voertuig een actief blok heeft, de `maintenanceStatus` van dat blok bij via hetzelfde pad als `PATCH /api/reservations/:id` (dat de hook wél afvuurt), of laat de route vervallen ten gunste van de blokstatus.
- **Regression test:** voertuig met gepland blok → `maintenance-status in_service` → blok `in` en één `maintenance_in`-melding.

#### BUG-155 — Uitgaande portaalmail wordt nergens gelogd en mislukkingen zijn onzichtbaar
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** T11-016 + D12-013 — *samengevoegd (zelfde root cause)*
- **Feature:** Mail bij onderhoud, vervangers en portaalantwoorden
- **Reproduction:** na 20+ onderhoudsgebeurtenissen voor klant 179 (`portal_enabled=true`, `emailForMOT` gezet): `select count(*) from email_logs` → **0** (de tabel is in heel `lvs_audit` leeg); `p11-portal.cjs` print na élke stap `email_logs since start []`. Met `email_config` op `smtpHost 127.0.0.1` poort 1 (onbereikbaar): `POST /api/portal-requests/595/approve` → **200 in 85 ms**, portaalmelding 422 geschreven, `email_logs` nog steeds 0 rijen, geen waarschuwing in de respons.
- **Expected:** per poging tot een `portal_maintenance`-mail een `email_logs`-rij (verzonden/mislukt + reden), zichtbaar voor personeel.
- **Actual:** `sendMaintenanceMail` → `sendEmail(..., 'custom')` (`server/utils/email-service.ts:298-309`) geeft een boolean terug en schrijft nooit `email_logs`; élke aanroeper gooit die boolean weg (`services/portal-maintenance-events.ts:92,117`; `routes/portal-requests.ts:56`; `routes/portal-admin.ts:62` bewaart alleen `inviteSent`); mislukkingen worden alleen `console.error`ed. De enige schrijvers van `email_logs` zijn de APK-/onderhoudsherinneringsroutes (`server/routes/notifications.ts:338,447`, `routes/email-logs.ts:63`).
- **Root cause:** een return-false-contract zonder logging; aanroepers behandelen mail als fire-and-forget.
- **Affected files:** `server/utils/email-service.ts`, `server/services/portal-mail.ts`, `server/services/portal-maintenance-events.ts`, `server/routes/portal-requests.ts`
- **Affected data:** `email_logs` 0 rijen ondanks tientallen mailtriggerende acties in de fases 9-12.
- **Security impact:** geen.
- **Business impact:** klanten ontvangen geen onderhouds-, vervangers- of antwoordmails en niemand wordt daarvan op de hoogte gesteld; omdat de in-app-melding er wél is, gaat personeel ervan uit dat de mail verstuurd is. Er is ook geen bewijs achteraf dat een klant geïnformeerd is.
- **Fix proposal:** schrijf bij élke poging een `email_logs`-rij (template, ontvanger, resultaat, foutreden) en geef `mailSent:false` terug in de goedkeurings-/antwoordresponses en in de aanvraagtijdlijn.
- **Regression test:** onbereikbare SMTP → goedkeuring 200 met `mailSent:false` en één `email_logs`-rij met `failure_reason`; geslaagde `maintenance_planned` → één rij met template `portal_maintenance`.

#### BUG-156 — Een onbekend `templateId` bij het transportrapport valt stil terug op de standaardlayout
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** T11-017
- **Feature:** `POST /api/delivery/transports/generate-report`
- **Reproduction:** (`p11-extra.cjs` X5) `{"transportIds":[46],"templateId":999999}` → **201**, document #303 aangemaakt met de standaardlayout.
- **Expected:** 404 "Template not found" — de contract-endpoints antwoorden dat wél bij een onbekend `templateId`.
- **Actual:** stille terugval op de standaard.
- **Root cause:** `server/routes.ts:7696-7698` — `templateId ? getTransportReportTemplate(templateId) : getDefault…`; een undefined resultaat wordt zonder controle doorgegeven.
- **Affected files:** `server/routes.ts`
- **Affected data:** `documents` (rapport gegenereerd met een layout die de gebruiker niet gekozen heeft).
- **Security impact:** geen.
- **Business impact:** klein — een verwijderd of hernoemd sjabloon levert zonder waarschuwing een brief in de verkeerde layout.
- **Fix proposal:** geef 404 wanneer het gevraagde sjabloon niet bestaat.
- **Regression test:** onbekend `templateId` → 404, geen documentrij.

#### BUG-157 — Contractnummers met voorloopnullen: `'0100'` en `'100'` bestaan naast elkaar
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (normalisatie plus een unieke index op de genormaliseerde waarde is een migratie, zie §7) · **Bron:** D12-009
- **Feature:** Contractnummering
- **Reproduction:** `select ltrim(contract_number,'0'), array_agg(id) from reservations where contract_number is not null and deleted_at is null group by 1 having count(*)>1` → `'100'` (131 = `'0100'`, 525 = `'100'`), `'11'` (12 = `'0011'`, 199 = `'11'`), `'12'` (13 = `'0012'`, 1392 = `'12'`). **992 van de 1049** contractnummers dragen een voorloopnul, 35 zijn niet-numeriek.
- **Expected:** één canoniek formaat; de unieke index weerspiegelt de bedrijfsmatige uniciteit.
- **Actual:** de unieke index staat op de rauwe tekst, dus `'0100'` en `'100'` kunnen naast elkaar bestaan; `getNextContractNumber` (`database-storage.ts:3626`) parseert getallen, zodat het voorgestelde volgende nummer kan botsen met een bestaand zero-padded nummer, en de override-vergelijking (`routes.ts:4085-4094`) gebruikt getrimde strings.
- **Root cause:** `contract_number` is vrije tekst zonder normalisatie bij het schrijven (`shared/schema.ts:727`, `routes.ts:4074-4136`).
- **Affected files:** `server/routes.ts`, `server/database-storage.ts`, `shared/schema.ts`
- **Affected data:** 3 pre-existing paren in de kloon; alle pre-existing rijen gebruiken zero-padding, de auditrijen niet — **te herverifiëren in productie**.
- **Security impact:** geen.
- **Business impact:** twee contracten kunnen op papier "hetzelfde" nummer dragen; zoeken op nummer mist één van beide varianten.
- **Fix proposal (voorstel, goedkeuring nodig):** normaliseer bij het schrijven (voorloopnullen strippen óf de breedte vastzetten), voeg een unieke index op de genormaliseerde waarde toe en laat `getNextContractNumber` dezelfde normalisatie gebruiken.
- **Regression test:** een contract aanmaken met `'0100'` terwijl `'100'` bestaat → 409.

#### BUG-158 — `assign-vehicle` op een placeholder onder gelijktijdigheid: beide aanroepers krijgen 200, de laatste schrijver wint
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** D12-011
- **Feature:** `POST /api/placeholder-reservations/:id/assign-vehicle`
- **Reproduction:** (test e) twee gelijktijdige `POST /api/placeholder-reservations/3422/assign-vehicle` met `vehicleId` 1800 en 1801 → **beide 200**, elk antwoord noemt zijn eigen voertuig; de rij eindigt op voertuig 1801 (last write wins) met de notitietekst van de laatste schrijver; de melding wordt verwijderd; er ontstaat geen dubbele reservering. De aanroeper die "1800 toegewezen" te horen kreeg, heeft het mis.
- **Expected:** de tweede aanroep krijgt 409/404; één aanroeper krijgt de waarheid te horen.
- **Actual:** zie boven.
- **Root cause:** `server/database-storage.ts:3017-3103` leest de placeholder, controleert conflicten en werkt bij in drie losse statements, zonder transactie en zonder voorwaardelijke UPDATE op `placeholder_spare = true`.
- **Affected files:** `server/database-storage.ts`
- **Affected data:** auditrij 3422.
- **Security impact:** geen.
- **Business impact:** twee planners kunnen geloven dat twee verschillende reserveauto's geregeld zijn; één ervan is nooit gereserveerd.
- **Fix proposal:** `UPDATE reservations SET … WHERE id=$1 AND placeholder_spare AND vehicle_id IS NULL` en 409 wanneer 0 rijen zijn geraakt; houd de transportspiegeling in dezelfde transactie.
- **Regression test:** gelijktijdige toewijzingen → precies één 200.

---

## 6. Herbevestigde bestaande bugs (nieuwe evidence, geen nieuw nummer)

Twee nummerfouten in de bronrapporten zijn hier gecorrigeerd: `p11-transport-spare.md` noemt MT-008 abusievelijk "BUG-033" (juist is **BUG-034**) en MT-013 abusievelijk "BUG-053" (juist is **BUG-037**; BUG-053 is MT-014, bulk-complete).

- **BUG-006** (dubbele boeking) — fase 12 telt **50 pre-existing echte overlapparen op 46 voertuigen** in de kloon (volledige lijst in `p12-scan.json → summary.doubleBookingsPreDetail`), plus 187 auditparen; fase 9 reproduceert de race opnieuw: 5 parallelle `POST /api/reservations` op voertuig 1764 voor 2026-10-30..11-01 → 5 × 201 en 5 rijen. BUG-107 voegt een deterministisch pad toe dat geen race nodig heeft.
- **BUG-007** (klant hard verwijderd) — fase 10: klant 1281 verwijderd (204, geen impactcheck); daarna 404 op `generate-versioned`, lijst/detail tonen geen klant, maar `/api/reservations/customer/1281` geeft de rij nog steeds terug. Fase 12 test i: reservering 3427 houdt `customer_id 1279` na het verwijderen en wordt gewoon geserveerd; chauffeur en toewijzing cascaderen (toewijzing 296 `driver_id`→null); geen `deleted_records`-snapshot. De eerste poging faalde met een rauwe 500 op een `vehicle_waitlist`-rij (zie BUG-148).
- **BUG-012 / BUG-026** (bestandspaden) — fase 12: `documents.file_path` bestaat in twee vormen op hetzelfde voertuig (`AU901X\contracts\…` versus `..\audit-uploads\AU901X\other\…`); van de 117 rijen resolvet er **geen enkele base alle 117** (59 via `UPLOADS_DIR`, 46 via `cwd`, 36 via de `cwd/uploads`-fallback), terwijl de downloadroute `cwd` gebruikt en de upload `UPLOADS_DIR`.
- **BUG-014** (blok verwijderen laat vervanger achter) — fase 11 variant Q5: een verlopen blok vóór de verhuurstart laat placeholder #3354 staan; fase 12: 3 live vervangers waarvan het origineel verwijderd/geannuleerd/afgerond is (1503 → origineel 84 `completed`; 3221 → origineel 3216 soft-deleted; 3357 → origineel 3355 geannuleerd). De verkeerde-blok-cascade is als BUG-118 apart gefiled.
- **BUG-016 / BUG-084** (statusbypass en mass assignment) — fase 10 laat zien dat dit het **normale UI-pad** is: het statusveld van het reserveringsformulier biedt `returned`, `completed` en `cancelled` aan (`reservation-form.tsx:2079-2085`) en verstuurt via `PATCH /:id` (FormData); de kalenderknop "terug naar picked_up" (`calendar.tsx:3274`) idem. Nieuwe gevolgen: `cancelled→booked` wordt via PATCH geaccepteerd terwijl `/status` het weigert (en de heractivering boekt dubbel, zie BUG-106); `picked_up→returned` via PATCH laat het voertuig `rented`. **R10-002:** `PATCH /api/reservations/3386 {"id":8888889}` → 200 en de rij is hernummerd; `select reservation_id from documents where id=275` → 3386 (wijst nu nergens meer naar) en 7 auditrijen blijven onder het oude id staan; met een `reservation_driver_assignments`-rij geeft dezelfde PATCH 400 met de rauwe FK-naam. **R10-004:** beide bewerkpaden persisteren `createdBy "AUDIT-hacker"`, `actualPickupDate`/`actualReturnDate`/`completionDate`, `damageCheckPath "../../../etc/passwd"` (nooit geserveerd, dus inert), `replacementForReservationId`, `affectedRentalId`, `portalRequestId`, `spareVehicleStatus`/`maintenanceStatus`/`deliveryStatus`/`recurringFrequency` `"garbage"`, `recurringDayOfWeek 99`; `PATCH /:id` schrijft daarbovenop `deletedBy` en `deletedByUser`. Fase 12 vindt de sporen terug in de data: status `'garbage'` (3293), `'confirmed'` (3213-3222), `end_date 'not-a-date'` (3442), `damage_check_path '/tmp/AUDIT-path'` (3304).
- **BUG-018** (voertuig met blok/`needs_fixing` blijft boekbaar) — fase 9: `POST /api/reservations` op voertuig 1762 (vandaag..+1) → 201 id 3342 terwijl `GET /api/vehicles/available` voor exact dat bereik het voertuig verbergt en er een open onderhoudsblok ligt.
- **BUG-019** (`endDate := vandaag`) — fase 10: `returned→completed` via `/status` verplaatste `end_date` van de echte retourdag 2026-09-05 naar 2026-09-10 (3384); "markeer als afgerond" op een te late verhuur (3394) leverde een `completed`-rij zonder retourgegevens en met `end_date = vandaag` (financieel `rentalDays 21` voor een plan van 6 dagen). Fase 9: de return van 3339 zette `end_date` op 2026-09-10 terwijl `start_date` 2026-09-13 is. Fase 12 telt 5 rijen met `end_date < start_date`, waarvan 3299/3339/3361/3364 `returned` zijn.
- **BUG-020** (kentekennormalisatie) — fase 9: de bulkimporters normaliseren voor hun duplicaatcontrole (`au-9p97073-a`, `AU 9P97073 A` → "Vehicle already exists"), maar `POST /api/vehicles {"licensePlate":"au9p97073a"}` direct erna → 201 id 1769. Ook `restoreDeletedRecord` vergelijkt het kenteken met een exacte `eq()` (`database-storage.ts:657-661`), zodat een hergemaakte variant (`au901x`) een restore evenmin zou blokkeren. Fase 12: 2 genormaliseerde kentekengroepen (`AU001X`: 1671/1699/1700; `AU9P97073A`: 1766/1769).
- **BUG-021** (`availabilityStatus` vrije tekst) — fase 12: 2 rijen `banana_not_real` in `vehicles.availability_status`.
- **BUG-022** (voertuigverwijdering hard-delete alle reserveringen) — fase 9: reservering 3376 stond `picked_up` op voertuig 1764; `GET /delete-impact` meldt alleen `reservations: 6` zonder statusuitsplitsing; `DELETE` → 200 en de opgehaalde rij is hard verwijderd (SQL `[]`); na restore is het voertuig weer `rented`, de reservering `picked_up` en werkt de retour gewoon. Fase 10 reproduceert het tweemaal (3437) inclusief het meeverdwijnen van documentrijen en chauffeurstoewijzingen. Fase 12 (tests a2/j): terwijl het voertuig verwijderd is bestaan de reserveringen alleen nog binnen de snapshot, en een restore wordt geblokkeerd zodra het kenteken opnieuw is aangemaakt.
- **BUG-026** — zie BUG-012 hierboven.
- **BUG-027** (N documentrijen op één bestand) — fase 12: 9 `file_path`-groepen met in totaal 20 extra rijen, waarvan 3 groepen pre-existing (docs 27/28/29 op `48XT138_contract_20260826.pdf`, 31/32); audit: 8 rijen op `12XT102_contract_20260909.pdf`.
- **BUG-032** (twee actieve vervangers voor één origineel) — fase 11 sweep K: verhuur #3236 heeft nog steeds 3237/3238; BUG-117 laat het portaalpad dezelfde vorm produceren. Fase 12: originelen 3236 (→ 3237 op voertuig 1668 en 3238 op 1669, beide `pending`) en 3336 (→ 3354 TBD en 3379 `picked_up`).
- **BUG-034** (blokstatus bereikt `vehicles` niet; in `p11` foutief "BUG-033" genoemd) — fase 11: blok #3343 `in`/`out` laat vA op `availability_status='rented', maintenance_status='ok'`; portaal-goedgekeurde blokken idem; nadat de verhuur naar vC verhuisde werd vA `available` terwijl er een gepland blok op stond. Fase 9: het aanmaken van blok 3341 wijzigde `availability_status`/`maintenance_status` niet.
- **BUG-037** (overlappende onderhoudsblokken; in `p11` foutief "BUG-053" genoemd) — fase 11: het portaalpad `approveMaintenance` (`portal-requests.ts:320`) maakt een tweede blok op hetzelfde voertuig en dezelfde datums zonder enige controle (P10: #3343 en #3358, beide `affectedRentalId=3335`), terwijl `approveMaintenanceChange` (regel 360) die controle wél doet — inconsistent. Sweep M: **46 overlappende live blokparen**. Fase 12 telt breder: **160 overlappende live paren op 38 voertuigen** (146 pre-existing) waarvan er slechts 3 op bestaande voertuigen liggen, plus 28 exact-duplicaatgroepen — de rest is het testsuite-afval van BUG-145.
- **BUG-038** (rauwe fout bij dubbel contractnummer) — fase 10: de `/basic`-variant geeft 500 met de constraintnaam; via `PATCH /:id` is het een nette 409.
- **BUG-039** (reservering op een niet-bestaand id) — fase 9: ghostreserveringen 3370 en 3403 op niet-bestaande voertuig-id's. Fase 10: beide PATCH-paden schrijven `999999999` weg. Fase 12: reserveringen 3230 en 3241, vervanger 3418 (reservevoertuig 98765432), kostenpost 2003 → voertuig 999999; en het ontbreken van deze FK is precies wat BUG-145 mogelijk maakt.
- **BUG-040** (startdatum in het verleden + overdue-guard) — fase 10: de boeking uit 2015 (3361) blokkeert zijn voertuig; de guard blokkeert in de kloon **255 voertuigen** via verouderde `booked`-rijen, en nieuw: 7 via `returned` (BUG-113) en 45 via legacy-statussen (BUG-129). Fase 12: 336 `booked`-rijen meer dan 30 dagen over hun startdatum (335 pre-existing).
- **BUG-041** (kilometerstanden zonder ondergrens) — fase 10: `pickupMileage -100` en `returnMileage 5` (onder de pickup) worden via beide bewerkpaden weggeschreven; BUG-127 laat zien dat ook de onderlinge volgorde nergens wordt afgedwongen.
- **BUG-042** (onmogelijke APK-/garantiedatums) — fase 9: `PATCH apkDate "10-10-2026"` → 200, letterlijk opgeslagen, en het voertuig staat niet in `apk-expiring` hoewel de bedoelde datum 30 dagen weg is; `PATCH apkDate "2026-09-10T00:00:00.000Z"` → 200, inclusief tijddeel opgeslagen. Het CSV-pad heeft daarnaast zijn eigen conversiefout (BUG-124).
- **BUG-043** (gelijktijdige restore) — fase 12 test j2: drie parallelle restores van record 49 geven 500 (`duplicate key … vehicles_pkey`), 200 en 409; de database blijft consistent (één voertuig, reservering en document terug, `restored_at` eenmaal gezet). BUG-126 is dezelfde leemte met een sequentiële trigger.
- **BUG-045** (dubbele debiteurnummers) — fase 12: klanten 1264/1265 met `AUDIT-DEB-1788983243554`.
- **BUG-050** (sjabloonbestanden blijven achter) — fase 12: één bestand in `audit-uploads\templates` zonder databaserij.
- **BUG-052** (`maintenanceStatus` vrije tekst) — fase 12: reservering 3217 met `maintenance_status 'garbage'`.
- **BUG-053** (bulk-complete zonder partial-failure-afhandeling) — niet opnieuw getest.
- **BUG-054** (`totalPrice`) — fase 10: `-5` wordt opgeslagen en `'abc'` verdwijnt naar `null` via beide PATCH-paden.
- **BUG-055** (reservering verwijderen laat wezen achter) — fase 10: documenten en een open chauffeurstoewijzing overleven zowel het verwijderen als het annuleren. Fase 12: **15 documenten op soft-deleted reserveringen** (5 pre-existing: docs 27/28/29 → reservering 1, 38 → 1516, 40 → 1519) en chauffeurstoewijzing 287 op een soft-deleted reservering.
- **BUG-056** (terugkerende reserveringen inert) — fase 10: alle `recurring*`-velden zijn vrij schrijfbaar, er is nog steeds geen generator.
- **BUG-057 / BUG-090 / BUG-103** (rauwe foutobjecten) — fase 12: de FK-variant is als BUG-148 gefiled, inclusief het volledige pg-errorobject in de body.
- **BUG-060** (bonpaden) — fase 12: alle 4 rijen in `expenses.receipt_file_path` zijn absolute Windows-paden (3 pre-existing naar `…\LVStest-main\uploads\13XT103\receipts\…`, de checkout van een andere machine); **geen enkele** resolvet op deze machine.
- **BUG-095** (`active_sessions` wordt nooit opgeruimd) — fase 12: 176 rijen (55 pre-existing, oudste 2026-08-21), waarvan 171 zonder session-store-rij, en alle 176 "niet verlopen" (`expires_at` tot 2026-10-10); 113 rijen op `admin`.
- **Fase-1 punt 12** (dubbele auditrijen) — fase 12: 22 groepen dezelfde actie + resource binnen 2 seconden; elke voertuigverwijdering logt tweemaal. Als BUG-147 nu apart gefiled.
- **Observatie zonder eigen nummer:** `POST /api/reservations` met `type=maintenance_block` schrijft `audit_logs`-rijen `reservation.create` met `resource_id = null` (id's 2152-2155), omdat die route `{needsSpareVehicle:true}` antwoordt zonder het aangemaakte id. Genoteerd bij de historievraag van fase 11, niet apart gefiled.

**Niet opnieuw getest in deze fases:** BUG-006 (race, ongewijzigde createcode — wel opnieuw geraakt in fase 9), BUG-015, BUG-017, BUG-035, BUG-037 (staffpad), BUG-053, BUG-057.

---

## 7. Voorgestelde wijzigingen die goedkeuring vereisen

Niets hiervan is uitgevoerd. Dit zijn **voorstellen**; ze wijzigen bedrijfsregels of de gegevensstructuur
en horen als OPT-voorstel voorgelegd te worden.

### 7.1 Bedrijfsregels en procesbesluiten (de negen B-bugs)

| Bug | Te nemen besluit |
|---|---|
| BUG-109 | Mag een auto met `needs_fixing`, `in_service` of een open onderhoudsblok überhaupt meegegeven worden? Zo ja: met welke override (vinkje, reden, wachtwoord, welke rol) en moet de werkplaatsstatus de verhuurcyclus overleven? |
| BUG-132 | Mag een verhuur waarvan de auto fysiek buiten is verwijderd of geannuleerd worden? Zo ja: alleen met een geregistreerde retour, of met een expliciete "kwijt / nooit teruggebracht"-override? En wordt het contractnummer dan definitief geblokkeerd? |
| BUG-134 | Welke wijzigingen aan een reservering verdienen een portaalmelding (annulering, datum, voertuig, chauffeur, verwijdering) en per welk kanaal (portaal, mail, beide)? |
| BUG-140 | Krijgen transporten een prullenbak (snapshot in `deleted_records` of een `deletedAt`-kolom), of blijft verwijderen definitief? |
| BUG-143 | Akkoord voor een **eenmalige opschoning** van weesrijen in de betreffende database: blokken zonder voertuig soft-deleten en `spare_assignment`-meldingen zonder placeholder verwijderen. Zie ook 7.2. |
| BUG-144 | Akkoord voor een **datareconciliatie**: `picked_up` met een startdatum in de toekomst terug naar `booked`, `picked_up` over de einddatum zonder retourgegevens markeren voor beoordeling, en `vehicles.availability_status` herberekenen uit verhuringen én blokken. |
| BUG-151 | Horen soft-deleted reserveringen in de prullenbak, met een herstelknop die op conflicten controleert? |
| BUG-153 | Welke dagtelling is leidend voor facturatie: inclusief (rapport) of exclusief (contract)? De keuze verandert het aantal dagen op elke factuur. |
| BUG-157 | Welk contractnummerformaat is canoniek (met of zonder voorloopnullen) en mag de bestaande nummering genormaliseerd worden? |

### 7.2 Wijzigingen aan de gegevensstructuur (voorstellen uit fase 12)

Alle onderstaande punten zijn **migraties**: ze vereisen eerst een meting in productie, daarna een
opschoning van de bestaande rijen, en pas dan de constraint. Zonder die volgorde faalt de migratie op
bestaande data.

1. **FK op `reservations.vehicle_id` en `reservations.customer_id`** met een gedocumenteerde ON DELETE-regel. Dit dicht BUG-039, maakt BUG-108 (spookreserveringen) en BUG-145 (testafval) structureel onmogelijk. Voorwaarde: eerst de 262 weesrijen opruimen (BUG-143/BUG-145), anders faalt het toevoegen van de constraint. Let op: een `CASCADE` hier maakt het gedrag van BUG-022 permanenter; de gewenste regel is onderdeel van het besluit.
2. **FK's op de overige 12 referentiekolommen zonder constraint**: `documents.vehicle_id`, `documents.reservation_id`, `expenses.vehicle_id` (NOT NULL), `scan_events.vehicle_id`/`reservation_id`, `reservations.replacement_for_reservation_id`, `affected_rental_id`, `portal_request_id`, `recurring_parent_id`, `deleted_records.deleted_by_user_id`, plus de twee polymorfe kolommen (`deleted_records.entity_id`, `portal_activity_log.entity_id`) die alleen met een discriminator-controle of een aparte tabel op te lossen zijn.
3. **Unieke index op het genormaliseerde kenteken** (`upper(regexp_replace(license_plate,'[^A-Za-z0-9]','','g'))`) — dicht BUG-020; eerst de 2 duplicaatgroepen opschonen.
4. **Unieke index op het genormaliseerde contractnummer** — BUG-157; eerst de 3 botsende paren oplossen.
5. **Opruimmigratie voor spookonderhoudsblokken** — BUG-143/BUG-145: soft-delete alle blokken waarvan het voertuig niet bestaat (in de dev-kloon 258 stuks van de testsuite plus enkele echte). In productie eerst meten.
6. **Opruimmigratie voor statussen buiten de enum** — BUG-129: `active` → `booked` voor onderhoudsblokken, `pending` → `booked` voor vervangers, `confirmed`/`scheduled`/`in`/`garbage` per rij beoordelen, brandstofniveaus naar kleine letters; daarna eventueel CHECK-constraints of enum-types op `reservations.status`, `vehicles.availability_status`, `reservations.maintenance_status` en de brandstofkolommen.
7. **DB-CHECK `end_date IS NULL OR end_date >= start_date`** op `reservations` (BUG-111) en een guard/CHECK die eist dat `picked_up` een `actual_pickup_date` en `pickup_mileage` heeft (BUG-144) — beide pas na het opschonen van de bestaande rijen (5 respectievelijk 344 rijen in de kloon).
8. **Uitbreiding van de prullenbaksnapshot** (BUG-110) tot élke FK-afhankelijke rij, plus het meetellen ervan in `delete-impact`. Dit verandert het formaat van `deleted_records.payload`; oude snapshots moeten leesbaar blijven.
9. **Aparte testdatabase voor de vitest-suite** (BUG-145) — geen productiemigratie, wel een wijziging aan de ontwikkelconfiguratie die met de eigenaar/ontwikkelaar afgestemd moet worden omdat de suite nu tegen `lvstest` draait.

---

## 8. Niet gedekt

**Buiten scope van deze vier fases (per instructie of per fase belegd)**
- Back-up/restore en de atomiciteit daarvan (fase 17), Socket.IO/realtime (`socket.md`), de
  autorisatiematrix (fase 6-8, `04-phase-6-8-security-report.md`).
- De database `lvstest` en poort 5000 zijn nooit aangeraakt; alles draaide op `:5001` tegen `lvs_audit`.

**Niet uitgevoerd wegens externe afhankelijkheden**
- RDW-APK-scan (`POST /api/apk-date-changes/scan-now`, `server/utils/rdw-apk-scanner.ts`, nachtelijk
  02:30) — roept voor 570+ voertuigen een externe API aan.
- `delivery/estimate-distance` en `optimize-route` — externe geocoding.
- Werkelijke mailbezorging — de audit-SMTP wijst naar een lokale stub; alleen "onbereikbaar" is
  gemeten (85 ms), niet "traag/time-out".
- Fysieke inhoud van de gegenereerde PDF's (contract, schadecheck, transportrapport): alleen status,
  content-type, bytegrootte en de `contracts/data`-JSON zijn geïnspecteerd; geen tekstextractie.

**Niet injecteerbaar zonder codewijziging**
- Pickup met een écht falende PDF-generator (`routes.ts:4144-4226` try/catch) — uit code afgeleid, niet
  runtime bewezen.
- Mid-loop-fout in de delete-cascade van een reservering (`routes.ts:4621-4700`).
- Voertuigverwijdering met een gelijktijdige restore of een gigantische snapshot.
- `portal_users`-cascade bij het verwijderen van een klant (de accountaanmaak faalde in die fixture met
  400; de cascade komt uit de FK-definitie).

**Bewust niet herhaald**
- BUG-006 (race in het createpad, code ongewijzigd — wel opnieuw geraakt in fase 9), BUG-015, BUG-017,
  BUG-035, BUG-053, BUG-057; blacklist- en `availabilityStatus`-races uit fase 3-5.
- De UI is niet in een browser bediend: alle clientpaden zijn nagebootst met exact de requestvormen die
  `reservation-form.tsx`, `calendar.tsx`, `status-change-dialog.tsx`, `schedule-maintenance-dialog.tsx`
  en `delivery/dashboard.tsx` versturen. Visuele fouten en clientvalidatie zijn dus **niet** gedekt.

**Openstaande meetvragen (moeten in productie beantwoord worden vóór er iets mee gedaan wordt)**
- Alle "pre-existing" aantallen uit het DATABASE REPORT: dubbele boekingen, `picked_up`-rijen over hun
  einddatum, `booked`-rijen die nooit zijn opgehaald, weesrijen, statussen buiten de enum,
  contractnummerbotsingen, `active_sessions`, bestanden zonder databaserij.
- Of de 258 wees-onderhoudsblokken (BUG-145) ook in productie voorkomen — de verwachting is van niet,
  omdat de testsuite daar niet draait, maar dat is niet gemeten.
- Of `documents.file_path` tegen de productie-`UPLOADS_DIR` volledig resolvet (BUG-012/BUG-026).

---

In deze fases is **geen applicatiecode gewijzigd**, is er **niets gecommit** en is de applicatie
**niet in productie gedraaid**. Alle waarnemingen komen van de auditserver `:5001` tegen de database
`lvs_audit`; de aangemaakte fixtures dragen de prefix `AUDIT-` / kentekens `AU-…-X` en zijn bewust
blijven staan als bewijsmateriaal.

HARD STOP — STOP POINT 5

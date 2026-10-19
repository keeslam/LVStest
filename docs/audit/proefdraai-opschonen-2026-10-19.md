# Proefdraai tijdzone-migratie en opruimscripts (19-10-2026)

Op verzoek van Kees zijn de tijdzone-migratie (punt 9b, besluit B-22) en de opruimscripts (punt 10)
als proefdraai uitgevoerd op `lvs_prodtest`. Die database is volgens Kees recent genoeg, al zijn de
voertuigen daarin vervangen door de 99 echte kentekens uit de RDW (geheugen 2026-09-17).

- Op `lvs_prodtest` zelf is niets veranderd. Alle scripts draaiden als droogloop of rapport.
- De tijdzone-migratie is écht uitgevoerd op een wegwerpkopie, `lvs_prodtest_proef`. Daarmee is
  het verschil vóór en na zichtbaar.

## 1. Tijdzone-migratie (B-22): `scripts/migrate-timestamps-to-timestamptz.ts`

**Omvang:**

- 99 kolommen in 45 tabellen staan nog op "zonder tijdzone"; 35 kolommen zijn al omgezet.
- Op de wegwerpkopie duurde de volledige omzetting **4 seconden**.
- Elke tabel wordt tijdens de omzetting kort vergrendeld. Daarom gebeurt de omzetting in een
  rustig moment: de app start opnieuw met `TIMESTAMPTZ_MIGRATION=apply`.

**Wat er op het scherm verandert (steekproef):**

| Waarde | Opgeslagen | App toonde tot nu | Na migratie |
|---|---|---|---|
| reservering #3214, aangemaakt | 2026-09-17 21:26:50 | 17-09 **23:26** | 17-09 **21:26** |
| auditregel #1521 | 2026-09-23 23:51:54 | **24-09** 01:51 | 23-09 23:51 |
| kosten #1998, aangemaakt | 2026-08-21 20:46:13 | 22:46 | 20:46 |
| voertuig #495, gewijzigd | 2026-09-17 19:42:23.574 | 21:42 | **19:42 (fout: moet 21:42 blijven)** |

Het grootste deel wordt dus goed: de twee uur te laat (BUG-224) verdwijnen. Bij een auditregel
kan zelfs de datum veranderen, zoals bij #1521 hierboven.

**Waar het misgaat (kanttekening 1 uit het script):** waarden die de app zelf schreef, staan al
in UTC. De migratie leest ze als Amsterdamse tijd, waardoor ze na de migratie 1 à 2 uur te vroeg
staan. Die waarden zijn te herkennen: ze hebben precies milliseconden, zoals `.574`. Een waarde die
de database zelf schreef, heeft microseconden, zoals `.858742`.

| Kolom | Gevuld | Door de app geschreven (UTC) |
|---|---|---|
| reservations.created_at | 829 | 3 |
| reservations.updated_at | 829 | 17 |
| vehicles.updated_at | 95 | **95** |
| fines.offence_at (tijdstip overtreding) | 5 | **5** |
| audit_logs.created_at | 1521 | 1 |
| customers, expenses, documents, login_attempts | | 0 |

Vooral `fines.offence_at` telt. Dat is het tijdstip van de overtreding, en daarmee wordt een
bekeuring aan een reservering gekoppeld.

**Mogelijke verbetering (nog niet gebouwd):** per waarde kijken. Precies milliseconden lezen als
UTC, de rest als Amsterdamse tijd. Dan blijven ook voertuig- en bekeuringstijden goed. Er is een
heel kleine kans (1 op 1000) dat een databasewaarde toevallig op hele milliseconden eindigt. Die
waarde zou dan 1 à 2 uur verschuiven.

## 2. Oude, niet-afgesloten reserveringen (B-02/B-21): `scripts/close-returned-reservations.ts`

Droogloop met peildag 19-10-2026:

| Groep | Aantal | Wat het script zou doen |
|---|---|---|
| ingeleverd, nog niet afgerond | 0 | afronden |
| gereserveerd, einddatum voorbij, nooit opgehaald | **161** | annuleren |
| verouderde status, einddatum voorbij | **109** | afronden |
| opgehaald, einddatum voorbij | **155** | **niets**: blijft op de werklijst "Nog buiten" voor een mens |

Het script raakt nooit een einddatum en nooit een verwijderde reservering.

## 3. Kentekens gelijktrekken (B-10): `scripts/normalize-license-plates.ts`

- **Geen botsingen.** Geen twee auto's worden na het gelijktrekken hetzelfde kenteken.
- 95 voertuigen staan nog met streepjes opgeslagen. Het script zou ze opslaan zonder streepjes en
  in hoofdletters, en daarna een unieke index plaatsen.
- Op het scherm verandert niets, want de app zet de streepjes zelf terug.

## 4. Datahygiëne (alleen tellen): `scripts/data-hygiene-report.ts`

- **258 weesrijen.** Dit zijn allemaal onderhoudsblokken op een voertuig dat niet meer bestaat.
  Er is geen foreign key op `reservations.vehicle_id`.
- **0 voertuigen** staan in de werkplaats zonder onderhoudsblok, en 0 staan in een blok zonder dat
  aan te geven.
- **260 reserveringen** hebben een verouderde status. 109 daarvan hebben een einddatum die voorbij
  is (zie 2); de rest nog niet.

## Wat er nog van Kees nodig is

Per script een besluit voor productie. Van tevoren altijd eerst een back-up.

1. **Tijdzone-migratie:** zoals hij is, of met de verbetering per waarde?
2. **Reserveringen afsluiten:** de 161 nooit opgehaalde annuleren en de 109 verouderde afronden?
3. **Kentekens gelijktrekken:** plus de unieke index?
4. **258 weesrijen:** verwijderen of laten staan?

De wegwerpkopie `lvs_prodtest_proef` staat nog op de lokale Postgres. Weggooien kan zodra Kees het
niet meer nodig heeft.

## Besluiten van Kees (19-10-2026) en tweede proefdraai

Kees koos:

- **Tijdzone-migratie:** mét de verbetering per waarde.
- **Reserveringen afsluiten:** ja, na een back-up.
- **Kentekens gelijktrekken:** ja, na een back-up.
- **Weesrijen:** naar de prullenbak.

**Tweede proefdraai, op een verse wegwerpkopie `lvs_prodtest_proef`.** Eerst draaide de
opstart-migratie (`startup-migration.js`), net zoals productie bij het opstarten doet. Daarna
draaiden alle scripts écht.

| Stap | Resultaat | Duur |
|---|---|---|
| Tijdzone-migratie, verbeterd (`timestamptzUsing`) | 99 van 99 kolommen omgezet. De steekproef van reserveringen, auditregels en kosten verliest de twee uur. Voertuig #495 blijft 21:42 en de bekeuringen blijven zoals ze nu op het scherm staan (bijv. 01-10 10:00). | 4 s |
| Weesrijen naar prullenbak (`scripts/orphan-blocks-to-bin.ts`, nieuw) | 258 van 258 in de prullenbak van Onderhoud. Ze zijn terug te zetten. | 3 s |
| Reserveringen afsluiten | 161 geannuleerd, 2 afgerond. 155 blijven op "Nog buiten". | 2 s |
| Kentekens gelijktrekken | 95 gelijkgetrokken, unieke index staat. | 3 s |
| Datahygiëne daarna | 0 weesrijen, 0 verouderde statussen, 155 op "Nog buiten". | |

**Volgorde telt.** 107 van de 109 rijen met een verouderde status wáren weesrijen. Gaan de weesrijen
eerst naar de prullenbak, dan rondt het afsluitscript er nog maar 2 af.

**Voor productie:**

- De scripts zitten niet in het productie-image. De Dockerfile kopieert alleen `dist`, `shared` en
  `startup-migration.js`.
- Alleen de tijdzone-migratie heeft al een opstartvlag: `TIMESTAMPTZ_MIGRATION=apply`.
- Voor de andere drie scripts moet nog worden gekozen hoe ze in productie draaien.

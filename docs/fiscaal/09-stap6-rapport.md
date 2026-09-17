# Stap 6: volledige berekeningen, rapporten, documentatie en eindaudit (STOP POINT 6)

Datum 17 september 2026. Branch `fix/audit-remediation`. Alles is test-first gebouwd.

## 1. Open einde, maandsnapshots en eindberekening (besluit F-15)

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| Beoordelingshorizon | `server/services/fiscal/assess.ts` (`buildInput`) | Een periode zonder einddatum wordt beoordeeld tot en met de laatste dag van de beoordelingsmaand (niet meer tot een vooruitkijkhorizon). Een boeking die pas na die maand begint, wordt op haar eigen startdag beoordeeld. |
| Vastgelegd / voorlopig | `server/services/fiscal/rules/pseudo-eindheffing.ts` (`MonthLine.settled`, `Verdict.settledAmount`, `provisionalAmount`) | Een maand is vastgelegd als hij vóór de beoordelingsmaand ligt of als de periode is afgesloten; anders voorlopig. De bedragen worden per deel opgeteld; zonder bedrag blijven beide leeg. |
| Eindberekening | `server/services/fiscal/usage-periods.ts` (`endBasis`, `finalAssessmentSafely`), `assess.ts` (`isFinal`, trigger `final`) | De gebruiksperiode weet of haar einde gepland, werkelijk of open is. Zodra de werkelijke innamedatum bekend wordt, volgt direct een beoordeling met trigger `final`; alle maanden zijn dan vastgelegd. De hash bevat de maandstand en de eindvlag, zodat de maandwissel precies één nieuwe snapshot oplevert en een tweede blik in dezelfde maand niets schrijft. |
| Uitleg | `server/services/fiscal/explain.ts` | "(voorlopig)" achter de lopende maand, "Vastgelegd tot en met …", "Voorlopig (lopende maand): …", "Per kalenderjaar: …", en bij afsluiting "Eindberekening: … alle maanden zijn vastgelegd." |
| Schema | `shared/schema.ts`, `schema-columns.json` | `vehicle_usage_periods.end_basis`; `fiscal_assessments.settled_amount`, `provisional_amount`, `is_final`; maandregels met `settled`. Additief, via de bestaande manifest-sync. De herstelronde vult `end_basis` in voor perioden van vóór dit besluit. |
| Schermen | kantoor: voertuigtab, huurkaart, wachtrij; portaal: pagina Fiscale check | Badge **Eindberekening** of de splitsing "vastgelegd … · voorlopig …"; in het portaal "Voorlopig, beoordeeld t/m …" of "Eindberekening". |

Gedrag in cijfers (parameters van de test, geen uitspraak over de wet): open periode vanaf 10 januari,
beoordeeld op 15 maart: januari en februari vastgelegd (€ 720,00), maart voorlopig (€ 360,00). Inleveren
op 20 maart: eindberekening over 10 januari t/m 20 maart, drie maanden vastgelegd.

## 2. Rapporten, CSV en PDF

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| Maandrapport | `server/services/fiscal/reports.ts` (`monthlyReport`) | Laatste beoordeling van elke open periode, uitgesmeerd over de kalendermaanden van het gekozen jaar: klant, kenteken, periode, maand, dagen, reden, bedrag, stand (vastgelegd / voorlopig / eindberekening), status, regelversie. Totalen, per klant en per maand; het aantal nog niet beoordeelde perioden staat erbij. Zonder bedragen (F-05) blijven de standen staan. |
| CSV | `reportToCsv` | Puntkomma's, BOM, decimale komma, aanhalingstekens waar nodig, totalen en disclaimer onderaan; geen kolom Bedrag zonder bedragen. |
| PDF per beoordeling | `server/services/fiscal/assessment-pdf.ts` | Met pdf-lib en de bestaande tekst-hulpen (`sanitizeForWinAnsi`, `wrapTextToWidth`): feiten, stand, dezelfde uitleg als op het scherm, voetregel met beoordelingsnummer, volgnummer, invoerhash en tijdstip. Zonder dashboard vervallen de €-regels. |
| Routes kantoor | `server/routes/fiscal.ts` | `GET /api/fiscal/reports/monthly`, `GET /api/fiscal/reports/monthly.csv`, `GET /api/fiscal/assessments/:id/pdf` — recht `view_fiscal`; jaar en id gevalideerd (400), onbekend (404). |
| Routes portaal | `server/routes/portal-fiscal.ts` | `GET /api/portal/fiscal/report.csv` (alleen met `fiscal_reports_enabled`, bedragen alleen met dashboard, bestuurdersscope), `GET /api/portal/fiscal/reservations/:id/pdf` (binnen de eigen klant, anders 404). |
| Schermen | Rapporten → tab **Fiscaal** (`client/src/components/fiscal/fiscal-report-tab.tsx`); PDF-links op voertuigtab, huurkaart, rapport en portaal; CSV-knop in het portaal | Tab alleen zichtbaar met een fiscaal recht; jaarkeuze vanaf het eerste afleidingsjaar, klantfilter, totalen, per klant, regels. |

## 3. Randgevallen over maand- en jaargrenzen

`server/services/fiscal/__tests__/edge-cases.test.ts` (8 tests): open periode over de jaarwisseling
(december vastgelegd in de januari-run, jaartotalen gesplitst); boeking die na de beoordelingsmaand
begint; pro rata in een schrikkeljaar-februari (29 dagen, 15/29 = € 186,21); vervangend voertuig
waarvan de vrijstelling in de volgende maand eindigt (rest van die maand geheven); kortstondige huur
over de jaarwisseling (naar een mens); overgangsrecht dat op zijn einddatum stopt; regelversie die
midden in een periode eindigt; en de nachtelijke run op de maandgrens (niets op de 31e, één snapshot op
de 1e, niets op de 2e).

## 4. Documentatie

- `07-handleiding-kantoor.md`: plaats van alles, hoe een beoordeling ontstaat, maand/jaar/eindberekening,
  wachtrij, configuratie en publiceren, rapporten, nachtelijke run, klantschakelaars.
- `08-handleiding-klant.md`: wat de klant ziet, de vragen, per maand en eindberekening, PDF en CSV,
  meldingen; in gewone taal, met de disclaimer.

## 5. Eindaudit

| Controle | Uitkomst |
|---|---|
| Hardgecodeerde fiscale waarden | Geen. Buiten `definitions.ts` (definities met grenzen), de startseed en de tests komen alleen kalenderrekenkunde (12 maanden, maandbereik), lay-outconstanten en de gedeelde afleidingsdatum `USAGE_PERIOD_DERIVATION_START` (besluit F-10, nu in `shared/fiscal-types.ts`, ook gebruikt door de schermen) voor. De labels "vóór 1 januari 2027" in kantoor en portaal worden nu uit die constante gevuld. |
| Dubbele logica | De maandredenen staan één keer (`MONTH_REASON_LABELS` in `shared/fiscal-types.ts`, gebruikt door uitleg en rapport); de uitleg zonder bedragen (`explanationFor`) wordt gedeeld door portaal-DTO en PDF; de bestuurdersscope (`scopeCondition`) door portaal en rapport. |
| Rechten | Alle nieuwe kantoorroutes achter `view_fiscal` via `fiscalGuard` (geweigerde pogingen geaudit); de rechtenmatrixtest loopt de routerstack af; portaalroutes achter `requireFeature("canViewFiscal")`, bestuurderspoort en de rapportschakelaar. De id-validatietest dekt de nieuwe `:id`-routes (400, nooit 5xx). |
| Nooit stil | Niet-beoordeelde perioden worden geteld in het rapport; een periode zonder bedrag toont geen € 0; de eindberekening en de herstelronde loggen fouten en gooien nooit in de schrijfroute. |

## 6. Regressie en migratie

Serverproject: 137 bestanden, 1107 tests groen (534 s). Clientproject: 38 bestanden, 165 tests groen. Typecontrole:
0 fouten. Productiebouw geslaagd. Op de kloon (:5004) geverifieerd in de browser: tab Fiscaal met rij,
totalen, CSV en PDF; portaalpagina met stand "Voorlopig, beoordeeld t/m …", PDF-link en CSV-link.
Volledige server- en clientsuite, typecontrole,
productiebouw en de migratietest op een herstelde productie-vormige database (`lvs_migtest`, hersteld
uit de back-up van vóór de voertuigvervanging: de vier nieuwe kolommen worden additief toegevoegd, de
rest blijft ongemoeid).

## 7. Nog open (stap 7 / na akkoord)

- Publiceren van regelversie 1 blijft een menselijke handeling na de verificatiepunten V1–V10.
- Deploy naar productie: Coolify draait `node startup-migration.js && npm start`; de nieuwe kolommen komen
  additief mee; de herstelronde bij het opstarten vult `end_basis` en gemiste gebruiksperioden.

---

**HARD STOP: STOP POINT 6.** Na goedkeuring start stap 7 (eindregressie en oplevering).

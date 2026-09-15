# Eindcontrole (fase 62 en 63)

Datum 15 september 2026. Branch `fix/audit-remediation`, 104 commits boven `main` (`3e28645e`, de
versie die vandaag in productie draait). Dit document is de laatste controle vóór overdracht: eerst
de volledige regressie, dan de kwaliteitspoort.

---

## 1. Volledige regressie (fase 62)

### 1.1 Geautomatiseerde tests

| Controle | Commando | Uitkomst |
|---|---|---|
| Testsuite | `DATABASE_URL=…/lvs_fixtest npx vitest run` | **147 bestanden, 1088 tests, alles groen**, 667 s |
| Typecontrole | `npm run check` (`tsc`) | **0 fouten** |
| Productiebouw | `npm run build` | **geslaagd**, serverbundel 1,4 MB |
| Werkmap | `git status` | schoon (alleen de niet-getrackte map `graphify-out/`) |

Bij de start van de audit waren dat 26 bestanden en 126 tests. De suite draait tegen een eigen
testdatabase (`lvs_fixtest`), zodat de ontwikkeldatabase er niet meer door vervuild raakt.

### 1.2 Draaiende applicatie

Gecontroleerd op de regressieserver (poort 5003, database `lvs_regress`, een kloon van de
ontwikkeldatabase, met de eindcode en de startmigratie uitgevoerd).

| Controle | Uitkomst |
|---|---|
| Inloggen en sessie | goed |
| `/api/today`, reserveringen, voertuigen, klanten, transporten, kalenderbereik, werklijst "Nog buiten", onderhoudskostenrapport, documenten, kosten | alle **200**, geen enkele 5xx |
| Compressie (besluit B-19) | **aan**: de reserveringslijst gaat als **255 kB** over de lijn in plaats van 7,7 MB |
| Realtime-verbinding | ingelogde sessie krijgt verbinding; verbinding zonder cookie wordt geweigerd met `unauthorized` |
| Scherm "Vandaag" | 6 openstaande punten, met de juiste knoppen per regel |
| Reserveringskalender | laadt, Nederlandse maand- en dagnamen |
| Startmigratie | voegt alle nieuwe kolommen toe op een verse kloon en meldt de nog niet uitgevoerde tijdzonemigratie |

### 1.3 Wat de regressie eerder deze week aan het licht bracht

De regressieronde (fase 36) en het schrijven van de handleiding (fase 57) waren samen strenger dan
de tests. Zij vonden onder meer: het Vandaag-scherm dat 88 spookregels toonde, het formulier
"Voertuig toevoegen" dat stil niets deed, het ontbreken van elke annuleerknop, twee besluiten die wel
waren vastgelegd maar niet gebouwd, en een APK-venster dat over zijn eigen gedrag loog. Alles wat zij
vonden is daarna gerepareerd en met een test vastgelegd.

---

## 2. Kwaliteitspoort (fase 63)

| Eis | Status |
|---|---|
| Alle kritieke bevindingen gesloten | **ja** — 13 van 13, elk met een regressietest |
| Testsuite groen | **ja** — 1088 tests |
| Typecontrole en bouw schoon | **ja** |
| Geen bekende regressie ten opzichte van `main` | **ja** — elke bestaande test is behouden; twee tests zijn strenger gemaakt, geen enkele verzwakt |
| Elke gedragswijziging herleidbaar tot een besluit | **ja** — 24 besluiten in `besluiten.md`, elk met de reden en de geraakte bevindingen |
| Geen werkproceswijziging zonder goedkeuring | **ja** — de zeven nog openstaande vragen zijn bewust niet gebouwd |
| Handleiding beschrijft de eindversie | **ja** — 18 hoofdstukken, elke instructie in de draaiende app uitgevoerd, 13 schermafbeeldingen op voorbeeldgegevens |
| Documentatie compleet | **ja** — fase 0 tot en met 63 vastgelegd in `docs/audit/` |
| Productiecode ongewijzigd tot je akkoord | **ja** — alles staat op `fix/audit-remediation`, `main` is onaangeroerd |

### 2.1 Wat deze poort niet afdekt

- De applicatie is niet in productiemodus (`NODE_ENV=production`) doorgemeten; alle prestatiecijfers
  komen uit de ontwikkelmodus en zijn daarmee pessimistisch.
- De tijdzonemigratie is gebouwd en op een kloon uitgevoerd, maar staat in productie uit tot je het
  kloonrapport hebt gezien.
- Externe diensten (RDW, CJIB, echte SMTP) zijn met stubs en vaste antwoorden getest, niet live.
- De `claude-security`-pluginscan is nooit gedraaid; die vraagt een expliciet akkoord op de kosten.

### 2.2 Oordeel

De applicatie is in een wezenlijk betere staat dan bij de start: geen enkele bekende manier meer om
het proces met één verzoek plat te leggen, geen open deuren meer naar klantgegevens, geen dubbele
boekingen meer langs de paden die de audit kon vinden, en de twee fouten die al wekenlang in
productie zaten zijn weg. Wat resteert is werk dat op jouw beslissing wacht, niet op techniek.

---

**HARD STOP — dit is het einde van de auditopdracht.** De volgende stap is van jou: de branch
beoordelen en in productie zetten volgens de lijst in `11-eindrapport.md`, hoofdstuk 8.

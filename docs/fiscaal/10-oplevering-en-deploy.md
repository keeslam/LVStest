# Stap 7: oplevering en deploy-draaiboek (STOP POINT 7)

Datum 17 september 2026. Branch `fix/audit-remediation`, twaalf commits vóór op `main`; `main` is niet
verder gegaan. Samenvoegen naar `main` start de productie-deploy via Coolify en gebeurt alleen op
uitdrukkelijke opdracht.

## 1. Wat er in deze oplevering zit

| Onderdeel | Commits |
|---|---|
| Audit, wettelijk kader, voorstel, besluiten en schema-ontwerp (stap 1 en 2) | 72257673, be7704c7 |
| Regelmotor, gebruiksperioden, profielen, beoordelingen, wachtrij, audit, routes, startseed (stap 3) | e70b602c, f52a7c2a, d8ec0840, df038a0a |
| Kantoorschermen, impactvoorbeeld, publicatiedialoog, plaatsing in App-instellingen (stap 4, F-13) | ed8900ba, 372e348c, f41e9f7b |
| RDW-profiel, nachtelijke run, klantportaal, meldingen, hook op alle schrijfroutes en herstelronde (stap 5) | 26030e19 |
| RDW-prefill met brandstof, euroklasse en carrosserie; script voor testdatabases | 3f066784 |
| Open einde per maand en per jaar, eindberekening, rapporten, CSV, PDF, handleidingen, eindaudit (stap 6, F-15) | ae4addfc |

Documentatie: `docs/fiscaal/00` t/m `10` en `besluiten.md` (F-00 t/m F-17). Handleidingen: `07` (kantoor)
en `08` (klant).

## 2. Wat gebruikers na de deploy merken

- **Medewerkers zonder fiscaal recht**: niets. De zes rechten (`view_fiscal`, `manage_fiscal_review`,
  `manage_fiscal_configuration`, `approve_fiscal_configuration`, `publish_fiscal_configuration`,
  `view_fiscal_audit_log`) staan standaard uit; een beheerder heeft ze alle.
- **Beheerder**: App-instellingen → Klantenportaal → Fiscale check (regelversie 1 als concept, 27
  parameters, wachtrij, audit); Klantenportaal → knop Fiscale check (overzicht); Voertuig → tab Fiscaal;
  Reservering → kaart Fiscaal gebruik; Rapporten → tab Fiscaal; per klant de zes portaalschakelaars.
- **Klanten**: niets zolang hun hoofdschakelaar uit staat. Met de schakelaar aan verschijnt de tab
  Fiscale check in het portaal.
- **Achtergrond**: bij de eerste start worden gebruiksperioden afgeleid voor bestaande reserveringen
  vanaf 1 januari 2027 (onschuldige rijen, geen beoordeling zonder gepubliceerde versie). De
  nachtelijke run om 03:30 beoordeelt alleen klanten met de schakelaar aan en haalt alleen voor hen
  RDW-gegevens op. Zonder gepubliceerde versie is elke beoordeling "Geen regelversie beschikbaar".

## 3. Deploy-stappen

1. **Back-up** van de productiedatabase (verse dump) en noteer de huidige `main`-commit (697713c4)
   voor een eventuele terugrol.
2. **Samenvoegen**: `fix/audit-remediation` naar `main` pushen. Coolify bouwt het image; het
   `Dockerfile` start met `node startup-migration.js && npm start`.
3. **Migratie**: additief. Zeven fiscale tabellen (met foreign keys en indexen via de expliciete
   stap), de klantschakelaars, en de kolommen van F-15 (`vehicle_usage_periods.end_basis`,
   `fiscal_assessments.settled_amount`, `provisional_amount`, `is_final`) komen uit
   `schema-columns.json`. Niets wordt verwijderd of hernoemd. Getest op een herstelde productie-vormige
   database (`lvs_migtest`).
4. **Omgevingsvariabelen**: geen nieuwe. Het fiscale deel leest geen eigen variabelen. Wel nodig:
   uitgaand HTTPS naar `opendata.rdw.nl` vanuit de container (voor de RDW-knop en de nachtelijke
   verversing); de tijdzone van de planner is in de code vastgezet op Europe/Amsterdam.
5. **Containerlog na de start**, in deze volgorde:
   - `✅ Schema sync from manifest complete` (tweemaal) en `✅ Database migration completed successfully!`
   - `Fiscal scheduler started - nightly run at 03:30`
   - `📐 Gebruiksperioden afgeleid uit N reservering(en)` (alleen de eerste start; daarna alleen
     `📐 Herstelronde: …` als er iets te herstellen viel)
   - geen regel die begint met `fiscal start-up:` of `[fiscal]`.

## 4. Controlelijst na de deploy

1. Inloggen als beheerder → App-instellingen → Klantenportaal → Fiscale check: regelversie 1 staat er
   als **concept** met 27 parameters; niets is gepubliceerd.
2. Voertuig → tab Fiscaal → **RDW opnieuw ophalen** op een echte personenauto: catalogusprijs, categorie,
   brandstofklasse en eerste toelating komen binnen met bron RDW. Mislukt dit, controleer de uitgaande
   verbinding; de fout staat in het profiel (`rdw_error`), de app blijft werken.
3. Rapporten → tab Fiscaal: laadt, toont 0 regels en het aantal nog niet beoordeelde perioden.
4. Rechten uitdelen aan de medewerkers die de check gaan gebruiken (Instellingen → gebruikers).
5. Eén testklant: hoofdschakelaar aan → portaal toont de tab Fiscale check; dashboard nog uit.
6. Beheerderswachtwoord wijzigen (openstaand punt uit de eerdere deploy).

## 5. Vóór het publiceren van regelversie 1

Publiceren is een menselijke handeling. Loop de verificatiepunten **V1–V10** in
`01-wettelijk-kader.md` na (wet tegenover wetsvoorstel: vervangend voertuig 14 dagen, kortstondig 7
dagen, lesauto's, verlenging overgangsrecht; maandtijdvak; betalingstijdvak). Pas waar nodig de
parameters aan in het concept (elke wijziging vraagt een reden en wordt geaudit), bekijk het
**impactvoorbeeld**, laat goedkeuren, en publiceer met de uitdrukkelijke bevestiging. Vanaf de
volgende nacht beoordeelt de run alle open perioden van ingeschakelde klanten en verschijnen
beoordelingszaken in de wachtrij.

## 6. Terugrol

De functie is inert zonder gepubliceerde versie en zonder klantschakelaars. Code terugrollen =
vorige `main`-commit opnieuw deployen; de tabellen en kolommen mogen blijven staan (de oude code
leest ze niet). Nooit tabellen verwijderen: beoordelingen zijn onveranderlijke snapshots.

## 7. Restrisico's en bekende beperkingen

| Punt | Toelichting |
|---|---|
| Juridische status | Vier onderdelen komen uit het wetsvoorstel OFM 2027 (ingediend 15-9-2026), niet uit de wet. De app claimt nergens zekerheid; publicatie pas na V1–V10. |
| RDW-dekking | Catalogusprijs bij 59 % van de gescande vloot (ontbreekt vooral bij auto's van vóór 2009 en bedrijfsauto's). Ontbrekende waarden komen in de wachtrij; kantoor vult ze met bron. Vier kentekens zijn onbekend bij de RDW. |
| Bestaande vloot in de app | Productievoertuigen zonder fiscaal profiel krijgen er een bij de eerste beoordeling of via de knop; de nachtelijke run ververst alleen voor ingeschakelde klanten. |
| Nachtelijke run | Draait in de container om 03:30 Europe/Amsterdam; een herstart overdag mist geen run (de volgende nacht haalt alles in via de herstelronde en de hash). |
| Portaal-CSV en PDF | Alleen achter de klantschakelaars; zonder dashboard geen bedragen. |
| Testdatabases | De lokale databases (`lvstest`, `lvs_prodtest`) bevatten sinds 17-9-2026 de echte vloot uit de RDW; de productiedatabase is door geen enkel script aangeraakt. |

## 8. Regressie op de opgeleverde commit

Op commit ae4addfc: serverproject 137 bestanden, 1107 tests groen (495 s); clientproject 38 bestanden, 165
tests groen; typecontrole 0 fouten. Volledige server- en clientsuite en typecontrole op
commit ae4addfc.

---

**HARD STOP: STOP POINT 7.** De oplevering is compleet; samenvoegen naar `main` alleen op opdracht.

# Rapportenscherm herontwerp — deel 3: gekoppelde velden en Kolommen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De rapportbouwer kan velden tonen, filteren, sorteren en groeperen van de gekoppelde auto, klant, reservering en bestuurder; vaste rapporten krijgen een knop **Kolommen** om kolommen te verbergen en kenteken/merk/model/klantnaam toe te voegen, per gebruiker onthouden.

**Architecture:** In `shared/report-builder-config.ts` krijgt elke bron een lijst `links` (veel-op-één): naam, doelbron, kolom in de hoofdtabel. Een kolom/filter/groep kan `via: <linknaam>` hebben; de server maakt per gebruikte link één `LEFT JOIN` met een alias en lost velden op tegen de doelbron. Vaste rapporten vullen extra kolommen in de browser uit de al geladen voertuigen-/klantenlijst (geen serverwijziging); de keuze staat in user-setting `report_columns`.

**Tech Stack:** Express + Drizzle (`executeReport`), React, kit `ReportTable`, `/api/user-settings`.

**Spec:** `docs/superpowers/specs/2026-10-25-rapporten-scherm-herontwerp-design.md`, "Deel 3" + "Keuzes van mij" (alleen veel-op-één; Kolommen per gebruiker; extra velden auto: kenteken, merk, model; klant: naam).

## Global Constraints

- Alleen veel-op-één koppelingen; nooit één-op-veel (regels verdubbelen nooit).
- Een gekoppeld veld is alleen te kiezen én uit te voeren als de gebruiker ook de doelbron mag gebruiken (`canUseReportSource`); km-velden blijven alleen beheerder. Server weigert anders met 403 `REPORT_SOURCE_RIGHT_REQUIRED`.
- Velden en linknamen uitsluitend uit de whitelist; alias via `sql.identifier`; geen tekst in SQL.
- Oude rapporten zonder `via` werken ongewijzigd.
- Kolommen-keuze per gebruiker in `user_settings` sleutel `report_columns` (`{ [reportId]: { hidden: string[]; extra: string[] } }`); **Terug naar standaard** wist de keuze voor dat rapport. Afdruk en CSV volgen de gekozen kolommen.
- Knopnamen: **Kolommen**, **Terug naar standaard**, groepkoppen in de bouwer **Gekoppeld: Voertuig**, **Gekoppeld: Klant**, **Gekoppeld: Reservering**, **Gekoppeld: Bestuurder**. 7 talen.

## Review Focus

1. Groeperen of tellen op een gekoppeld veld geeft hetzelfde aantal regels als zonder koppeling (geen verdubbeling) (Task 1).
2. Regel zonder koppeling (bv. bekeuring zonder klant) blijft staan met lege gekoppelde velden (LEFT JOIN) (Task 1).
3. Opgeslagen rapport met een gekoppeld veld, uitgevoerd door iemand zonder het doelrecht ⇒ niet zichtbaar/403, geen 500 (Task 1, 2).
4. Kolommen-keuze verwijst naar een kolom die niet meer bestaat ⇒ genegeerd (Task 3).
5. Extra kolom "Kenteken" bij een gebruiker zonder voertuigrecht ⇒ niet aangeboden (Task 3).

---

### Task 1: Server — koppelingen in de bouwer

**Files:**
- Modify: `shared/report-builder-config.ts` (`ReportSourceLink { name: "vehicle" | "customer" | "reservation" | "driver"; target: ReportSourceId; column: string }`; `links` per bron, alleen waar de hoofdtabel die kolom echt heeft (controleer `shared/schema.ts`), verwacht: reservations → vehicle, customer, driver; expenses → vehicle; fines → vehicle, customer, driver, reservation; transports → vehicle, customer, reservation; workshop_visits → vehicle, reservation; damage_checks → vehicle, reservation, customer; mileage_readings → vehicle; drivers → customer; `ReportColumn`/`ReportFilter`/`ReportGrouping` krijgen `via?: string`; helper `linkedSourcesOf(config): ReportSourceId[]`)
- Modify: `server/database-storage.ts` `executeReport` (per gebruikte `via` één `LEFT JOIN <doeltabel> AS <alias> ON <alias>.id = <hoofd>.<column>`; `resolveColumn` accepteert `{ table: doeltabel, field, via }` en controleert dat `via` een link van de hoofdbron is met die doeltabel; groeperen, sorteren, filteren, berekeningen en periodeveld-regels werken ook op gekoppelde velden; result-key voor een gekoppeld veld `${via}.${field}`)
- Modify: `server/routes/reports.ts` (rechtencheck op `dataSources` ∪ `linkedSourcesOf(config)` bij execute, POST/PUT saved; GET saved filtert ook op gekoppelde bronnen)
- Test: `server/__tests__/report-builder-links.test.ts`

- [ ] **Step 1: Write failing tests**: bekeuringen met kolommen `fines.offenceAt`, `vehicles.brand via vehicle`, `customers.name via customer` ⇒ elke bekeuring één regel, met merk en klantnaam, bekeuring zonder klant heeft `customer.name` null; groeperen op `vehicles.brand via vehicle` + Aantal op `fines.id` ⇒ som van de aantallen = aantal bekeuringen; filter `customers.name via customer equals "X"` werkt; onbekende `via` ⇒ 400 `REPORT_LINK_INVALID`; `via: "vehicle"` met `table: "customers"` ⇒ 400; gebruiker met rapport- en bekeuringenrecht maar zonder klantenrecht ⇒ 403 `REPORT_SOURCE_RIGHT_REQUIRED` bij `via customer`, en een opgeslagen rapport met `via customer` staat niet in zijn GET `/saved`; km-velden via vehicle (`currentMileage`) voor niet-beheerder ⇒ 403.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-links.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server/__tests__/report-builder-*.test.ts server/__tests__/report-routes-guards.test.ts` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): builder fields from the linked vehicle, customer, reservation and driver`.

### Task 2: Bouwer — gekoppelde velden kiezen en tonen

**Files:**
- Modify: `client/src/pages/reports/report-builder.tsx` (onder de velden van de hoofdbron per toegestane link een groep **Gekoppeld: <naam>** met de velden van de doelbron, knoppen `button-add-field-${via}.${field}`; kolomregel, filter, groep en periodeveld-select tonen het label "Voertuig · Merk"; links waarvan de gebruiker de doelbron niet mag gebruiken worden niet getoond), `report-builder-output.ts` (`fieldLabel`/`displayCell`/`csvCell` met `via`, result-key `${via}.${field}`), `saved-report-view.tsx` (kolommen met `via`; `EntityLink` voor `vehicle.licensePlate`/`customer.name` wanneer het id bekend is: gebruik de link-kolom van de hoofdbron), locales (7)
- Test: `client/src/pages/reports/__tests__/report-builder-links.test.tsx`

- [ ] **Step 1: Write failing tests**: admin, bron Bekeuringen ⇒ groepen **Gekoppeld: Voertuig/Klant/Bestuurder/Reservering** zichtbaar; klik `button-add-field-vehicle.brand` ⇒ execute-body kolom `{ table: "vehicles", field: "brand", via: "vehicle" }`; resultaatkolomkop "Voertuig · Merk" en cel uit `vehicle.brand`; gebruiker zonder klantenrecht ziet geen **Gekoppeld: Klant**; groeperen op een gekoppeld veld zet `groupBy[0].via`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports` + locale-parity + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): pick linked fields in the report builder`.

### Task 3: Knop Kolommen bij vaste rapporten

**Files:**
- Create: `client/src/components/reports/kit/report-columns-menu.tsx` (`ReportColumnsMenu({ reportId, columns, extras, value, onChange })`: knop **Kolommen** `button-report-columns`, popover met vinkjes per kolom `report-column-toggle-${id}` en per extra veld `report-column-extra-${id}`, **Terug naar standaard** `button-report-columns-reset`), `client/src/components/reports/kit/use-report-columns.ts` (`useReportColumns(reportId, baseColumns, extras)` ⇒ `{ columns, menu }`; leest/schrijft `report_columns`; onbekende ids genegeerd)
- Create: `client/src/components/reports/kit/report-extra-columns.ts` (`vehicleExtras(access, vehiclesById)`, `customerExtras(access, customersById)` ⇒ `ReportTableColumn`-definities voor kenteken, merk, model (auto) en klantnaam; alleen met het recht; data uit de al gecachte `/api/vehicles` en `/api/customers`-queries, alleen opgehaald als een extra kolom aan staat)
- Modify: `ReportTable` (optionele `toolbar` slot naast het zoekveld) en elk rapport met een `ReportTable` of `ReportDetailDialog`-lijst waarvan de regels een `vehicleId` of `customerId` hebben (legacy-rapporten, kit-detaillijsten, `ReportRowsDialog`): `useReportColumns` + menu; afdruk en CSV gebruiken de gekozen kolommen
- Test: `client/src/components/reports/kit/__tests__/report-columns.test.tsx`

- [ ] **Step 1: Write failing tests**: APK-overzicht: kolom **Model** uitzetten ⇒ verdwijnt uit tabel, CSV en afdruk; PUT `report_columns` met `{ "apk-overview": { hidden: ["model"], extra: [] } }`; **Terug naar standaard** ⇒ kolom terug en sleutel voor dat rapport weg; kosten-in-periode: extra **Merk** aanzetten ⇒ kolom met merk uit `/api/vehicles`; gebruiker zonder voertuigrecht ziet geen auto-extra's; opgeslagen keuze met onbekende kolom-id ⇒ geen fout.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): Kolommen button on fixed reports, remembered per user`.

## Controller rulings

(leeg)

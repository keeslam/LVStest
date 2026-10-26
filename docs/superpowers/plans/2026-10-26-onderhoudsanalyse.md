# Onderhoudsanalyse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het venster **Analyse onderhoudskosten** wordt een interactieve analyse: filters, merk-tegen-merk en per type, km-klassen (beheerder), leveranciers, trends met verwachting, signalen, overal doorklikken, afdrukken en CSV; plus een nieuw veld **Leverancier** bij kosten.

**Architecture:** Server: een service `server/services/maintenance-analysis.ts` bouwt per kostenpost een verrijkte regel (auto merk/type/bouwjaar, km-stand op de datum uit de km-historie, km-klasse, leverancier, categorie) en levert daaruit per tabblad een antwoord via `GET /api/reports/maintenance-analysis/<deel>` met dezelfde filterparameters; km-velden worden voor niet-beheerders weggelaten. Client: `maintenance-costs.tsx` wordt herbouwd met eigen filterbalk en tabbladen op de bestaande rapportkit (ReportTable, Kolommen, print, drill-venster, EntityLink, vergelijken).

**Tech Stack:** Express + Drizzle, React + TanStack Query + recharts + i18next, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-onderhoudsanalyse-design.md`

## Global Constraints

- Km-gegevens (kosten per km, km-klassen, km-standen, verwachting) alleen voor beheerders, server-side afgedwongen (niet alleen verborgen).
- Rechten: rapportenrecht (`VIEW_REPORTS`/`MANAGE_REPORTS`), zoals nu; leveranciersveld bewerken met de bestaande kostenrechten.
- Migratie alleen additief via `schema-columns.json` (kolom `expenses.supplier text NULL`); backfill eenmalig bij opstarten met marker `migration:expense_supplier_v1`.
- Km-klassen exact: `0–50.000`, `50–100.000`, `100–150.000`, `150–200.000`, `200.000+` (grens hoort bij de hogere klasse: 50.000 ⇒ 50–100.000).
- Signaaldrempels exact: ≥ 50 % boven gemiddelde van hetzelfde merk+type (beheerder: in dezelfde km-klasse), ≥ 3 vergelijkbare auto's; stijgend = elk van de laatste 3 volle maanden hoger dan de vorige; herhaald = zelfde categorie binnen 90 dagen.
- Verwachting: 3 maanden (90 dagen) × km per dag × kosten per km van type + km-klasse; zonder km per dag of zonder klassegemiddelde ⇒ geen verwachting voor die auto.
- Bestaande regel "oordeel alleen bij genoeg auto's en posten" blijft (MIN-constanten in de huidige pagina).
- Kentekens met `formatLicensePlate`; type zonder dubbel merk (model dat met het merk begint ⇒ merk eraf); categorieën altijd met naam.
- Alle tekst in 7 talen; `locale-parity` groen.

## Review Focus

1. Auto zonder km-historie: valt in "Onbekende km" en telt niet mee in km-vergelijkingen of verwachting (Task 2).
2. Niet-beheerder vraagt een km-deel of km-filter op ⇒ 403 of weggelaten velden, nooit km-data (Task 2).
3. Periode waarin een auto later in de vloot kwam: "per auto per maand" telt alleen de maanden in bezit binnen de periode (Task 2).
4. Leverancier met verschillende schrijfwijze ("Garage Jansen" / "garage jansen ") ⇒ samengevoegd op genormaliseerde naam (Task 1, 2).
5. Doorklik-aantal = aangeklikt getal voor elk vak, staaf en taartstuk (Task 2, 4).

---

### Task 1: Veld Leverancier bij kosten

**Files:**
- Modify: `shared/schema.ts` (`expenses.supplier: text("supplier")`), `schema-columns.json`, startup-migration (backfill: kosten met `inboxItemId` krijgen `parsed.vendor` van het postvakitem, anders de naam uit `fromAddress`; marker `migration:expense_supplier_v1`), postvak-boeking (zet `supplier`), kosten-API (lezen/schrijven, trim, max 120 tekens), `GET /api/expenses/suppliers` (distinct genormaliseerde namen, gesorteerd), kostenformulier (veld **Leverancier** met suggesties), kostenlijst (kolom **Leverancier**), locales
- Test: `server/__tests__/expense-supplier.test.ts`, client-test van het formulier

- [ ] **Step 1: Failing tests**: boeken vanuit het postvak zet `supplier` = `parsed.vendor`; backfill vult bestaande postvakkosten één keer (marker) en laat handmatige kosten leeg; POST/PATCH kosten met `supplier: "  Garage Jansen "` ⇒ opgeslagen "Garage Jansen"; 121 tekens ⇒ 400; `/api/expenses/suppliers` geeft unieke namen (hoofdletterongevoelig samengevoegd); formulier toont suggesties en stuurt `supplier`.
- [ ] **Step 2–4**: Run (FAIL) → implement → run server + client tests + tsc (PASS).
- [ ] **Step 5: Commit** `feat(kosten): supplier on expenses, filled from the invoice inbox`.

### Task 2: Server — analyse-service en eindpunten

**Files:**
- Create: `server/services/maintenance-analysis.ts`, `shared/maintenance-analysis.ts` (types, `KM_BANDS`, `kmBandOf(km)`, `modelWithoutBrand(brand, model)`, signal-constanten)
- Modify: `server/routes/reports.ts` (mount `GET /api/reports/maintenance-analysis/{overview,brands,vehicles,suppliers,trends,signals,rows}`), oude `/api/reports/maintenance-costs` blijft werken tot Task 3 hem niet meer gebruikt (daarna verwijderen in Task 3)
- Test: `server/__tests__/maintenance-analysis.test.ts`

**Interfaces:**
- Query (alle delen): `from`, `to`, `compareFrom?`, `compareTo?`, `category?` (Onderhoud/Banden/Remmen-sleutels zoals `isMaintenanceExpenseCategory`), `brand?`, `model?`, `yearFrom?`, `yearTo?`, `kmBand?` (beheerder), `supplier?`, `vehicleId?`.
- `overview`: `{ tiles: { total, perVehicleMonth, count, perKm? }, previous?, byCategory: [{ key, label, amount, count }], topVehicles: [...] }`
- `brands`: `{ brands: [{ brand, total, perVehicleMonth, perKm?, vehicles, count, rated }], models: [{ brand, model, ... }], kmBands?: [{ brand, model|null, band, perKm, vehicles, count }] }`
- `vehicles`: regels per auto `{ vehicleId, licensePlate, brand, model, year, kmBand?, total, perMonth, perKm?, count, lastDate }`
- `suppliers`: `{ suppliers: [{ supplier, total, count, avg }], downtime: [{ vehicleId, plate, days }], topRepairs: [...] }`
- `trends`: `{ months: [{ month, amount, previous? }], forecast?: [{ month, amount }] }`
- `signals`: `{ signals: [{ kind: "aboveGroup" | "rising" | "repeated", vehicleId, licensePlate, reason params }] }`
- `rows`: kostenposten voor doorklik met dezelfde filters + `drill` (`category|brand|model|supplier|vehicle|month|kmBand`) en `key`; `{ rows, total }`, regels met `id, date, licensePlate, vehicleId, brand, model, category, supplier, amount, description, km?`.
- Km-velden (`perKm`, `kmBands`, `kmBand`, `km`, `forecast`) alleen voor beheerder; `kmBand`-filter of `drill=kmBand` voor niet-beheerder ⇒ 403.
- Per auto per maand = bedrag ÷ maanden in bezit binnen de periode (bezit vanaf aanmaak/registratie tot verkoop/verwijdering of nu).

- [ ] **Step 1: Failing tests** (fixtures: 2 merken, 3 typen, auto's met km-historie in verschillende klassen, kosten met leveranciers): `kmBandOf(49999)` ⇒ `0–50.000`, `kmBandOf(50000)` ⇒ `50–100.000`, `kmBandOf(200000)` ⇒ `200.000+`; `modelWithoutBrand("FIAT","FIAT DUCATO")` ⇒ "DUCATO"; overview byCategory heeft voor elke categorie een label (geen "0"); kosten per km per klasse = som kosten in klasse ÷ km gereden in klasse; niet-beheerder: `perKm` ontbreekt en `kmBand`-filter ⇒ 403; signaal aboveGroup alleen bij ≥ 3 vergelijkbare; herhaald binnen 90 dagen; rising over 3 volle maanden; drill `supplier` aantal = regel count; verwachting = 90 × km/dag × klassetarief.
- [ ] **Step 2–4**: Run (FAIL) → implement → run + tsc (PASS).
- [ ] **Step 5: Commit** `feat(onderhoud): maintenance analysis service with km bands, suppliers, signals and forecast`.

### Task 3: Client — venster, filterbalk, Overzicht en Merken en typen

**Files:**
- Modify: `client/src/pages/reports/maintenance-costs.tsx` (herbouw; filterbalk met periodes uit `report-filters.tsx` (eigen `ReportFiltersProvider` in het venster), **Vergelijk met**, categorie, merk, type, bouwjaar, km-klasse (beheerder), leverancier; tabbladen **Overzicht**, **Merken en typen**, **Voertuigen**, **Leveranciers**, **Trends**, **Signalen** (laatste vier in Task 4)); grafiek-keuzes (wat/hoe); doorklik via `ReportRowsDialog` op `rows`; kenteken via `EntityLink`; oude endpoint-gebruik weg en het oude endpoint verwijderen; locales
- Test: `client/src/pages/reports/__tests__/maintenance-analysis-overview.test.tsx` (bestaande p7a-maintenance-costs tests aanpassen of vervangen; noteer)

- [ ] **Step 1: Failing tests**: filterbalk stuurt `brand`, `model`, `supplier` mee; niet-beheerder ziet geen km-klassefilter en geen per-km-tegel; taart heeft een label per categorie; klik op taartstuk ⇒ doorklikvenster vraagt `rows?drill=category&key=…`; merkentabel → klik op merk toont typen; km-klassentabel (beheerder) vak klik ⇒ `drill=kmBand`; type zonder dubbel merk; kentekens met streepjes; grafiekkeuze staaf/taart/lijn wisselt.
- [ ] **Step 2–4**: Run (FAIL) → implement → run reports tests + locale-parity + tsc (PASS).
- [ ] **Step 5: Commit** `feat(onderhoud): interactive maintenance analysis window, overview and brands`.

### Task 4: Client — Voertuigen, Leveranciers, Trends, Signalen, afdrukken en CSV

**Files:**
- Modify: `maintenance-costs.tsx` (of opgesplitst in `client/src/pages/reports/maintenance/*.tsx`), locales
- Test: `client/src/pages/reports/__tests__/maintenance-analysis-tabs.test.tsx`

- [ ] **Step 1: Failing tests**: Voertuigen-tabel met zoeken (kenteken zonder streepjes), sorteren, **Kolommen**; Leveranciers met "Onbekend"; Trends met vergelijkingsreeks en (beheerder) verwachting als stippellijn; Signalen toont reden in gewone taal en doorklik; elk tabblad **Afdrukken** (afdrukvoorbeeld met tegels/grafiek/tabel) en **CSV**.
- [ ] **Step 2–4**: Run (FAIL) → implement → run + tsc (PASS).
- [ ] **Step 5: Commit** `feat(onderhoud): vehicles, suppliers, trends with forecast and signals, print and CSV`.

### Task 5: Handleiding

- [ ] Hoofdstuk 21 (sectie Onderhoudsanalyse) en hoofdstuk 19 (Leverancier bij kosten) bijwerken in eenvoudig Nederlands met nieuwe schermfoto's via `scripts/handleiding` (shots-21.mjs / shots-19.mjs), checklist 22 regels bijwerken. Commit `docs(handleiding): maintenance analysis and supplier`.

## Controller rulings

(leeg)

### Task 6: Merk/type-profiel (aanvulling na test)

**Spec:** sectie "Aanvulling na test door Kees" in de spec.

- Server: `GET /api/reports/maintenance-analysis/profile?brand=&model=` (+ gewone filters) ⇒ `{ vehicles, avgAgeYears, avgKm?, perVehicleMonth, fleetPerVehicleMonth, byCategory, topRepairs: [{ label, count, amount }], byYear: [{ year, perVehicleMonth, vehicles }], kmBands?, best: [...3], worst: [...3], suppliers, interval: { months, km?, vehicles, outliers: [{ vehicleId, plate, months, km? }] }, replaceHints: [{ vehicleId, plate, ratio12, ratio6 }] }`; km-velden alleen beheerder. `brands`-oordeel tegen de hele vloot (filters op merk/type/leverancier/vehicle tellen niet mee voor het vergelijkingsgemiddelde). Km-tabel: geen tarief bij 0 km of onbekende km (null). Tests met handberekende waarden.
- Client: **Merken en typen**: merk gekozen ⇒ typen van dat merk (grafiek/tabel/km-tabel per type), klik op type ⇒ zet het typefilter; merk + type ⇒ profielkaart met de onderdelen hierboven (doorklik naar kostenregels; kenteken ⇒ dossiervenster; Afdrukken/CSV), hint-teksten in 7 talen.
- Commit `feat(onderhoud): brand and type profile with service interval and replacement hint`.

### Task 7: Meer keuzes in het afdrukvenster (kit, alle rapporten)

**Spec:** sectie "Aanvulling: meer keuzes in het afdrukvenster".

- `client/src/lib/report-document-print.ts`: opties `{ order: sectionIds, sectionOn, pageBreakEach, title?, note?, fontSize: "small"|"normal"|"large", showFilters, perTable: { [id]: { rows: "all"|"page"|"selected"|"pick", picked: rowKeys[], columns: colIds[], sort?: { col, dir } } } }`.
- `PrintSection` table krijgt `columnIds: string[]` en `rowKeys: string[]` (stabiele sleutel per regel, bv. kenteken/id) zodat kiezen en kolommen werken; bestaande producenten (rapportkit-kaarten, legacy-rapporten, bouwer, saved view, onderhoudsanalyse, km-historie) leveren die mee — waar een producent ze niet levert valt het venster terug op index-sleutels en kolomkoppen.
- `report-print.tsx` dialoog: secties met vinkje + omhoog/omlaag; per tabel uitklapbaar blok: Regels (incl. **Zelf kiezen** lijst met zoeken/alles aan/uit/teller), Kolommen (vinkjes), Sorteren; algemeen: titel, notitie, lettergrootte, filterregels, nieuwe pagina per onderdeel, Liggend. Totaal over gekozen regels met label "Totaal (gekozen regels)". 7 talen.
- Tests: kiezen van 2 van 11 regels ⇒ srcDoc bevat precies die 2 (en totaal over die 2); kolom uit ⇒ niet in srcDoc; volgorde omdraaien ⇒ volgorde in srcDoc; nieuwe pagina ⇒ `page-break-before`; titel/notitie ge-escaped; lettergrootte class; sorteren aflopend op Totaal; zoeken op kenteken zonder streepjes in de keuzelijst.
- Commit `feat(rapporten): choose rows, columns, sections and layout when printing`.

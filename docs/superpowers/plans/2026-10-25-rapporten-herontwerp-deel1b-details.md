# Rapportenscherm herontwerp — deel 1b: doorklikken, dossiervenster, vergelijken

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In elk rapport kun je doorklikken naar de losse regels en naar een dossiervenster, en kun je elk periodegetal vergelijken met de vorige periode of vorig jaar.

**Architecture:** De server-rapportkit krijgt een optioneel uitsplitsing-/maandfilter (`drill`) op `/rows` en `/export`; de client opent bij een klik op tegel, grafiekpunt of uitsplitsingsregel de bestaande `ReportDetailDialog` met die parameters. Browser-rapporten filteren hun eigen regels in een generiek `ReportRowsDialog`. Een `EntityLink` opent een `EntityQuickView`-venster met kerngegevens en **Openen in nieuw tabblad** (diepe link per pagina). Vergelijken: de filtercontext krijgt `compare`; tegels en maandgrafieken halen de vergelijkingsperiode op met dezelfde query met verschoven datums.

**Tech Stack:** Express + Drizzle (server/services/reports), React + TanStack Query + wouter + shadcn + recharts + i18next, vitest (server tegen echte lokale Postgres-testDB; client jsdom).

**Spec:** `docs/superpowers/specs/2026-10-25-rapporten-scherm-herontwerp-design.md`, sectie "Deel 1b — Details".

## Global Constraints

- Rechten ongewijzigd: drill-regels gaan door dezelfde guards als de rapporten; het dossiervenster gebruikt bestaande endpoints en toont alleen wat de gebruiker mag; km alleen beheerder (`redact` blijft gelden op drill-regels).
- Het aantal regels in een drill-venster is gelijk aan het aangeklikte getal (zelfde `tileWhere` + drill-voorwaarde).
- Ongeldige drill → 400 `INVALID_DRILL`; nooit 500.
- Alle nieuwe tekst in 7 talen; `locale-parity` groen.
- Knopnamen: **Openen in nieuw tabblad**, **Vergelijk met**, **Niet vergelijken**, **Vorige periode**, **Zelfde periode vorig jaar**; verschil "nieuw" als het oude getal 0 is.
- Geen migraties.

## Review Focus

1. Drill-venster telt anders dan het aangeklikte getal (bv. uitsplitsing "Zonder klant" = NULL-sleutel) — moet gelijk zijn (Task 1, 2).
2. Vergelijken bij **Alle gegevens** of **Zelf kiezen** over een schrikkeldag/maandeinde: vorige periode even lang, vorig jaar 29-2 → 28-2 (Task 4).
3. Dossierlink voor een gebruiker zonder het recht van dat dossier (bv. klantlink zonder klantrecht) — geen klikbare link (Task 3).
4. Bezetting heeft `maxDays`: een vergelijkingsperiode die te lang is mag de tegel niet breken (toon "–") (Task 4).
5. Verwijderde of niet-bestaande entiteit in het dossiervenster (404) — nette melding (Task 3).

---

### Task 1: Server — uitsplitsing- en maandfilter op `/rows` en `/export`

**Files:**
- Modify: `server/services/reports/report-kit.ts` (`ReportFilter` krijgt `drill?: { name: string; key: string | null }`; parse `drill` + `key` (`key=__null` ⇒ `null`) en `month=YYYY-MM` (versmalt `from`/`to` tot die maand, doorsnede met de periode) op `/rows` en `/export`; `ReportDefinition.drills?: readonly string[]` — onbekende naam ⇒ 400 `INVALID_DRILL`; drill zonder `drills` ⇒ 400)
- Modify: `server/services/reports/sql-report.ts` (`spec.drillWhere?(drill, filter): SQL` ANDed in count/list wanneer `filter.drill` gezet is)
- Modify: elk kit-rapport in `server/services/reports/*-report.ts`: `drills` = de namen van zijn uitsplitsingen (bv. fines: `customer`, `vehicle`, `driver`; elk rapport: dezelfde sleutel-expressie als zijn `reportBreakdown`-aanroep, NULL-sleutel = `IS NULL`)
- Test: `server/__tests__/report-drill.test.ts` (nieuw), per rapport één case in bestaande `report-*.test.ts` waar dat het eenvoudigst is

**Interfaces:**
- Produces (HTTP): `GET /api/reports/<name>/rows?tile=&drill=<name>&key=<waarde|__null>[&month=YYYY-MM]` en idem `/export`. `total` = `count` van de breakdownregel / maandstaaf.
- Produces (shared): `shared/report-kit.ts`: `REPORT_DRILL_NULL_KEY = "__null"` en per rapport in `shared/reports/*.ts` een `*_DRILLS` const-array (bv. `FINE_REPORT_DRILLS = ["customer","vehicle","driver"] as const`).

- [ ] **Step 1: Write failing tests** (`report-drill.test.ts`, fixtures zoals `report-fines.test.ts`): fines met 3 bekeuringen voor klant A, 1 voor klant B, 1 zonder klant ⇒ summary `byCustomer` A count 3; `/rows?tile=total&drill=customer&key=<A.id>` ⇒ `total` 3; `key=__null` ⇒ 1; `drill=bogus` ⇒ 400 `INVALID_DRILL`; `month=2026-02` met periode jan–mrt ⇒ alleen februari-regels; `/export` met drill ⇒ zelfde regels. Plus één case per ander kit-rapport: drill op zijn eerste uitsplitsing geeft `total` = count van die breakdownregel.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-drill.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server/__tests__/report-drill.test.ts server/__tests__/report-*.test.ts server/__tests__/report-routes-guards.test.ts` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report rows can be narrowed to one breakdown line or one month`.

### Task 2: Client — klikken op tegel, grafiek en uitsplitsing opent de regels

**Files:**
- Modify: `client/src/components/reports/kit/report-detail-dialog.tsx` (prop `drill?: { name: string; key: string | null; label: string }`, `month?: string`; doorgeven in rows/export-query; titel "<tegel> · <label>")
- Modify: `report-breakdown-table.tsx` (prop `onOpen?(row)`; regel = knop, `data-testid="${testId}-row-${key ?? "null"}"`), `report-month-chart.tsx` en `report-top-chart.tsx` (`onPointClick?(point)`; cursor pointer)
- Create: `client/src/components/reports/kit/report-rows-dialog.tsx` (`ReportRowsDialog<R>({ open, onOpenChange, title, rows, columns, csvName })` — `ReportTable` in een dialoog + **CSV** + **Afdrukken** via `ReportPrintDialog`)
- Modify: elke kit-kaart (koppel `onOpen`/`onPointClick` aan `ReportDetailDialog` met de drill), elk browser-rapport in `client/src/pages/reports/legacy/` (tegel, grafiekpunt en uitsplitsingsregel ⇒ `ReportRowsDialog` met de gefilterde onderliggende regels: kosten per categorie ⇒ de kosten; benutting per voertuig ⇒ de reserveringen; klantimpact per klant ⇒ reserveringen en kosten van die klant; onderhoudskosten per voertuig ⇒ de onderhoudskosten; kosten-in-periode/APK/garantie zijn al regels — daar alleen Task 3), occupancy dag-klik ⇒ auto's van die dag (bestaand gedrag behouden)
- Test: `client/src/components/reports/kit/__tests__/report-drill-ui.test.tsx`, `client/src/pages/reports/__tests__/legacy-drill.test.tsx`

**Interfaces:**
- Consumes: Task 1 HTTP-parameters, `REPORT_DRILL_NULL_KEY`, `*_DRILLS`.
- [ ] **Step 1: Write failing tests**: fines-kaart: klik `fines-by-customer-row-<id>` ⇒ detaildialoog vraagt `/api/reports/fines/rows?…tile=total&drill=customer&key=<id>`; klik op maandstaaf ⇒ `month=2026-02`; klik "Zonder klant" ⇒ `key=__null`. Legacy: kosten per categorie, klik "Brandstof" ⇒ `ReportRowsDialog` met precies de brandstofkosten; **CSV** in dat venster levert die regels.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): click a tile, bar or breakdown line to see its rows`.

### Task 3: Dossiervenster en diepe links

**Files:**
- Create: `client/src/components/reports/entity-link.tsx` (`EntityLink({ kind, id, label })`, `kind: "vehicle" | "customer" | "reservation" | "fine" | "driver" | "invoice"`; zonder recht of zonder id ⇒ gewone tekst), `client/src/components/reports/entity-quick-view.tsx` (dialoog `dialog-entity-${kind}` met kerngegevens uit bestaande endpoints, laad-/foutmelding, knop **Openen in nieuw tabblad** `button-entity-open` = `window.open(url, "_blank", "noopener")`)
- Modify: diepe links: `/vehicles?vehicle=<id>` opent de bestaande voertuigdialoog (`client/src/pages/vehicles/index.tsx`), `/reservations?reservation=<id>`, `/fines?fine=<id>` (bestaat er al een, hergebruik), `/customers?customer=<id>` (bestaat al, `customers/index.tsx:58`), `/expenses?expense=<id>` of de factuur-controle-dialoog voor `invoice` (kies de bestaande plek; noteer welke)
- Modify: kolommen met kenteken/klant/reservering/bekeuring/factuur in `ReportDetailDialog`-kolomdefinities van de kit-kaarten en in de `ReportTable`-kolommen van de legacy-rapporten en `ReportRowsDialog`: `cell` gebruikt `EntityLink` (`text()` blijft platte tekst voor zoeken/CSV/afdruk)
- Test: `client/src/components/reports/__tests__/entity-quick-view.test.tsx`, één case per diepe link in de bestaande paginatests of een nieuw bestand

**Interfaces:**
- Rechten per soort (zelfde als de pagina's): vehicle ⇒ voertuigen bekijken/beheren; customer ⇒ klanten; reservation ⇒ reserveringen; fine ⇒ bekeuringen; driver ⇒ klanten (bestuurders staan onder klanten — controleer); invoice ⇒ kosten beheren. Km-stand in het voertuigvenster alleen voor beheerder.
- Kerngegevens: zie spec "Doorklikken naar het dossier".

- [ ] **Step 1: Write failing tests**: `EntityLink kind="vehicle"` voor beheerder ⇒ knop; klik ⇒ `dialog-entity-vehicle` met kenteken en merk; `button-entity-open` roept `window.open("/vehicles?vehicle=7","_blank","noopener")`; gebruiker zonder voertuigrecht ⇒ platte tekst, geen knop; endpoint 404 ⇒ melding "Niet gevonden of verwijderd."; `/vehicles?vehicle=7` opent de voertuigdialoog van auto 7; km-stand niet zichtbaar voor niet-beheerder.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages client/src/components/reports` + tsc — Expected: PASS (bekende rode tests buiten rapporten uitgezonderd).
- [ ] **Step 5: Commit** `feat(rapporten): record quick view from every report list, opens the full record in a new tab`.

### Task 4: Vergelijken met vorige periode of vorig jaar

**Files:**
- Modify: `client/src/pages/reports/report-filters.tsx` (`compare: "none" | "previous" | "lastYear"`, `setCompare`; `comparisonRange(from, to, mode): { from; to } | null` — `previous`: even veel dagen direct vóór `from`; `lastYear`: zelfde datums −1 jaar, 29-2 ⇒ 28-2; `null` bij `none`), `report-filter-bar.tsx` (select `select-report-compare`)
- Create: `client/src/components/reports/kit/use-compared.ts` (`useComparedSummary<T>(endpoint, params, opts)` ⇒ `{ data, previous, compareRange }` — tweede query met dezelfde key-vorm en verschoven `from`/`to`, alleen als `compare !== "none"`)
- Modify: `report-tiles.tsx` (tegel optioneel `previous?: number`, `better?: "up" | "down"`; toont oud getal en `deltaLabel` ↑/↓ %, "nieuw" bij oud 0; kleur alleen bij `better`), `report-month-chart.tsx` (optionele `previousData` als lichtere reeks, uitgelijnd op maandindex), kit-kaarten en legacy-rapporten (tegels die de periode volgen geven `previous` + `better`; niet-periode-tegels niet), overview (alleen margin/occupancy/deliveriesLate), print (`tiles` met `previous`/`delta`; kop noemt "Vergeleken met <periode>")
- Test: `client/src/pages/reports/__tests__/report-compare.test.tsx`, uitbreiding `report-shell-state.test.tsx` voor `comparisonRange`

**Interfaces:**
- `deltaLabel(current: number, previous: number): { text: string; dir: "up" | "down" | "flat" }` (in `report-tiles.tsx`, geëxporteerd).
- `better` per tegel (kies per rapport; voorbeelden): omzet/marge/bezetting/verhuurd ⇒ `up`; kosten/bekeuringen/te laat/schade ⇒ `down`; overige aantallen ⇒ geen.

- [ ] **Step 1: Write failing tests**: `comparisonRange("2026-10-01","2026-10-31","previous")` ⇒ `2026-08-31..2026-09-30` (31 dagen); `lastYear` ⇒ `2025-10-01..2025-10-31`; `("2028-02-29","2028-02-29","lastYear")` ⇒ `2027-02-28..2027-02-28`; `deltaLabel(112,100)` ⇒ `"↑ 12%"`, `deltaLabel(5,0)` ⇒ `"nieuw"`. Fines-kaart met compare `lastYear` vraagt tweede summary met vorig-jaar-datums en tegel `fines-tile-total` toont het oude getal en "↓"/"↑". Occupancy met te lange vergelijkingsperiode ⇒ tegel toont "–" bij oud, geen crash. Afdruk bevat "Vergeleken met".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): compare every period number with the previous period or last year`.

### Task 5: Eindcontrole

- [ ] **Step 1:** `npx vitest run --project client` en `npx vitest run --project server` (bekende rode tests op main uitgezonderd; vergelijk met de lijst in de ledger) en `npx tsc --noEmit -p .`.
- [ ] **Step 2 (controller):** browsercheck: doorklikken op tegel, staaf en uitsplitsingsregel in Voertuigen, Financieel, Klanten, Kantoor; dossiervenster en nieuw tabblad; vergelijken aan/uit; afdruk met vergelijking. Daarna Kees laten testen (deel 1 + 1b).

## Controller rulings

(leeg)

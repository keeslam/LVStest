# Rapportenscherm herontwerp — deel 1: scherm, tabellen, afdrukken, samenvoegen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het rapportenscherm wordt één filterbalk + tabbladen + lijst links / één rapport rechts, met tabellen met pagina's, een afdrukvoorbeeld bij elk rapport, een tabblad Overzicht en drie samengevoegde rapporten.

**Architecture:** Een register (`report-registry.tsx`) beschrijft elk rapport (id, tabblad, titel, zichtbaarheid, component). Filters komen uit een context (`ReportFiltersProvider`) in plaats van props. Elk rapport levert zijn afdrukinhoud via `useReportPrint(...)` aan het `ReportPane`; de knop **Afdrukken** opent `ReportPrintDialog` met keuzes en een voorbeeld-iframe dat exact het te printen HTML-document toont. De oude inline-rapporten uit `index.tsx` (2850 regels) verhuizen naar eigen componenten op een gedeelde `ReportTable` (pagina's 10/25/50, zoeken, sorteren).

**Tech Stack:** React 18, TanStack Query v5, wouter, shadcn/ui + Tailwind, recharts, i18next (7 talen), vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-25-rapporten-scherm-herontwerp-design.md` (deel 1 + "Keuzes van mij").

## Global Constraints

- Geen serverwijzigingen in deel 1, behalve als een taak het expliciet noemt. Geen migraties.
- Elke nieuwe tekst in 7 talen (`client/src/locales/{nl,en,es,pt,it,ro,pl}/reports.json`); `locale-parity` blijft groen (plural `_few` ro/pl, `_many` es/pt/it/pl).
- Nederlands in de app: eenvoudig, korte zinnen, knopnamen zoals in de spec: **Afdrukken**, **CSV**, **Rapportbouwer**, **Onderhoudsanalyse**, **Overzicht**, **Deze maand**, **Vorige maand**, **Dit kwartaal**, **Dit jaar**, **Zelf kiezen**, **Tegels**, **Grafiek**, **Tabel**, **Alle regels**, **Alleen deze pagina**, **Liggend**.
- Rechten ongewijzigd: geldrapporten alleen rapportenrecht; overige rapporten rapportenrecht + bronrecht; km-gegevens alleen beheerder. Een rapport dat de gebruiker niet mag zien staat niet in de lijst; een tabblad zonder zichtbaar rapport staat er niet.
- Datums naar kantoortijd zoals nu (`reportFrom`/`reportTo` "yyyy-MM-dd").
- Opslag per gebruiker via bestaande `/api/user-settings/:key` (GET/PUT/DELETE); geen nieuwe tabel.
- CSV bevat altijd alle regels van het filter; afdruk "Alle regels" ook. Wordt een export afgekapt (`truncated`), dan staat dat op de afdruk.
- Afdrukvoorbeeld = exact het document dat geprint wordt (zelfde HTML-string in de iframe).
- Testids van kit-kaarten (`card-*-report`, tile-testids) blijven bestaan.

## Review Focus

1. Gebruiker met weinig rechten (alleen `view_reports` + één bron): tabbladen zonder zichtbaar rapport moeten verdwijnen, en een URL `?tab=…&report=…` naar een verboden rapport valt terug op het eerste zichtbare rapport (Task 2).
2. Wisselen van periode/voertuig terwijl een tabel op pagina 3 staat: terug naar pagina 1, zoekterm blijft (Task 3).
3. Afdrukken "Alle regels" van een tabel met >100 regels: alle regels op papier, paginanummers, en een melding als de export is afgekapt (Task 4).
4. Een rapport zonder grafiek of zonder tegels: de keuzes die niet bestaan verschijnen niet in de afdrukdialoog (Task 4).
5. Telefoonbreedte (<768px): de lijst links wordt een keuzemenu en de filterbalk past zonder horizontaal scrollen (Task 2).

---

### Task 1: Filtercontext, register en onthouden van keuze

**Files:**
- Create: `client/src/pages/reports/report-filters.tsx`, `client/src/pages/reports/report-registry.tsx` (types + lege lijst), `client/src/pages/reports/use-report-selection.ts`
- Test: `client/src/pages/reports/__tests__/report-shell-state.test.tsx`

**Interfaces:**
- Produces:
  - `type ReportPreset = "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom"`
  - `interface ReportFilters { from: string; to: string; preset: ReportPreset; vehicleId: string /* "all" | id */; category: string /* "all" | categorie */ }`
  - `function presetRange(preset: Exclude<ReportPreset,"custom">, today: string): { from: string; to: string }` (kantoordatum "yyyy-MM-dd"; kwartaal = kalenderkwartaal)
  - `ReportFiltersProvider({ children, initial? })`, `useReportFilters(): ReportFilters & { setPreset(p), setRange(from,to) /* zet preset custom */, setVehicle(id), setCategory(c) }`. Standaard preset `thisMonth`.
  - `type ReportTabId = "overview" | "expenses" | "vehicles" | "customers" | "transports" | "financial" | "fiscal" | "portal" | "office"`
  - `interface ReportDef { id: string; tab: ReportTabId; titleKey: string; visible(ctx: ReportAccess): boolean; Component: React.ComponentType; badge?: React.ComponentType /* klein getal in de lijst, mag null renderen */ }`
  - `interface ReportAccess { isAdmin: boolean; has(perm: string): boolean; canViewFiscal: boolean }`
  - `REPORTS: ReportDef[]` (Task 5-7 vullen), `REPORT_TABS: ReportTabId[]` in deze volgorde: overview, expenses, vehicles, customers, transports, financial, fiscal, portal, office.
  - `visibleReports(access): ReportDef[]`, `visibleTabs(access): ReportTabId[]` (tab alleen als ≥1 zichtbaar rapport).
  - `useReportSelection(access): { tab: ReportTabId; reportId: string; select(tab, reportId?): void }` — leest/schrijft `?tab=&report=` (via `history.replaceState` + wouter `useSearch`), valt terug op laatst gekozen rapport per tabblad uit user-setting `reports_last_selected` (`{ [tab]: reportId }`), anders eerste zichtbare. Ongeldige/verboden id ⇒ eerste zichtbare. Schrijft de keuze terug met PUT (debounce niet nodig; alleen bij wijziging).

- [ ] **Step 1: Write failing tests** in `report-shell-state.test.tsx`:
  - `presetRange("thisMonth","2026-10-25")` → `{from:"2026-10-01",to:"2026-10-31"}`; `lastMonth` → `2026-09-01..2026-09-30`; `thisQuarter` → `2026-10-01..2026-12-31`; `thisYear` → `2026-01-01..2026-12-31`; `lastMonth` op `"2026-01-15"` → `2025-12-01..2025-12-31`.
  - `useReportFilters`: na `setRange("2026-02-01","2026-02-10")` is `preset` `"custom"`.
  - `visibleTabs` met een register van twee test-rapporten (één `vehicles` zichtbaar, één `portal` niet) ⇒ `["vehicles"]`.
  - `useReportSelection`: URL `?tab=vehicles&report=verboden` ⇒ `reportId` is het eerste zichtbare rapport van vehicles; zonder URL en met user-setting `{vehicles:"b"}` ⇒ `tab` eerste zichtbare tab, en `select("vehicles")` kiest `"b"`; `select("vehicles","a")` doet `PUT /api/user-settings/reports_last_selected` met `{value:{vehicles:"a"}}`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/report-shell-state.test.tsx` — Expected: FAIL (modules ontbreken).
- [ ] **Step 3: Implement** de drie modules.
- [ ] **Step 4: Run** — Expected: PASS. `npx tsc --noEmit -p .` schoon.
- [ ] **Step 5: Commit** `feat(rapporten): filter context, report registry and remembered selection`.

### Task 2: Nieuwe schil: filterbalk, tabbladen, lijst en paneel

**Files:**
- Create: `client/src/pages/reports/report-filter-bar.tsx`, `report-nav.tsx`, `report-pane.tsx`, `reports-shell.tsx`
- Modify: `client/src/pages/reports/index.tsx` (`FullReportsPage` rendert `ReportsShell`; `FiscalOnlyReportsPage` blijft), locales
- Test: `client/src/pages/reports/__tests__/reports-shell.test.tsx`; bestaande `reports-query-permissions`, `reports-fiscal-only`, `p7a-reports-filters` aanpassen aan de nieuwe testids

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `ReportFilterBar` (`data-testid="report-filter-bar"`, `className` met `sticky top-0 z-20`): preset-select `select-report-preset` (5 opties), bij `custom` twee datumvelden `input-report-from`/`input-report-to`, periodetekst `report-period-label` ("1-10-2026 t/m 31-10-2026"), voertuig-`SearchableCombobox` `select-report-vehicle` (bestaand component uit de oude filterkaart), categorie-select `select-report-category` (alleen getoond als het actieve rapport `usesCategory: true` heeft; voeg `usesCategory?: boolean` toe aan `ReportDef`), knoppen `button-open-report-builder` (**Rapportbouwer**) en `button-open-maintenance-costs` (**Onderhoudsanalyse**) die de bestaande dialogen openen (verplaats de dialogen uit `index.tsx` naar `reports-shell.tsx`).
  - `ReportNav({ tab, reports, selectedId, onSelect })`: ≥768px een lijst (`data-testid="report-nav"`, items `report-nav-item-${id}`, actief item `aria-current="page"`, badge rechts); <768px een `Select` `select-report-nav` (gebruik bestaande `useIsMobile` hook als die bestaat, anders Tailwind `md:` + beide renderen met `hidden md:block` / `md:hidden`).
  - `ReportPane({ def })`: kop met titel `report-pane-title`, knop **Afdrukken** `button-report-print` (Task 4 vult de dialoog; nu disabled-loos: knop opent dialoog alleen als er afdrukinhoud is, anders verborgen), dan `<def.Component/>`.
  - Tabbladen: `TabsTrigger` testids `tab-report-${tab}` (bestaande `tab-report-transports/financial/fiscal/portal/office` blijven zo heten; nieuw `tab-report-overview`, `tab-report-expenses`, `tab-report-vehicles`, `tab-report-customers`). Label `overview` = **Overzicht**.
  - De oude header-knoppen "Afdrukken: APK/…", de kaarten "Aangepaste rapportbouwer"/"Analyse onderhoudskosten" en de oude filterkaart verdwijnen.
- Tijdens deze taak registreert `report-registry.tsx` voorlopig alle bestaande kit-kaarten (zie Task 6-lijst) zodat de schil iets toont; de oude inline-secties blijven tijdelijk als één registerrapport per oud tabblad (`legacy-operations`, `legacy-expenses`, `legacy-vehicles`, `legacy-customers`, `legacy-transports`, `legacy-financial`) dat de oude JSX rendert met de waarden uit de filtercontext. Task 5 vervangt die.

- [ ] **Step 1: Write failing tests** in `reports-shell.test.tsx` (`useAuth` gemockt zoals `reports-query-permissions.test.tsx`; fetch gestubd):
  - admin: `report-filter-bar` aanwezig; tabbladen in volgorde Overzicht, Kosten, Voertuigen, Klanten, Transporten, Financieel, (Fiscaal als `canViewFiscal`), Portaal, Kantoor; klik op `tab-report-vehicles` toont `report-nav` met o.a. `report-nav-item-occupancy`; klik op dat item ⇒ `report-pane-title` = titel van Bezetting per dag en `card-occupancy-report` aanwezig, en de URL bevat `tab=vehicles&report=occupancy`.
  - `select-report-preset` → **Vorige maand** ⇒ `report-period-label` toont de vorige kalendermaand (met gemockte vandaag `2026-10-25`: "1-9-2026 t/m 30-9-2026").
  - gebruiker `[view_reports, view_fines]`: geen `tab-report-portal`, geen `tab-report-office`, geen `tab-report-customers`; `tab-report-financial` aanwezig.
  - `print-report-apk` en `card-report-builder` bestaan niet meer; `button-open-report-builder` opent de rapportbouwer-dialoog.
  - smal scherm (`window.matchMedia` gestubd op <768px): `select-report-nav` zichtbaar, `report-nav` niet.
- [ ] **Step 2: Run** de nieuwe test — Expected: FAIL.
- [ ] **Step 3: Implement** schil en registratie; pas de bestaande tests aan die op oude testids leunen (lijst in Explore-kaart: `p7a-reports-filters`, `reports-query-permissions`, `reports-fiscal-only`, `p7a-saved-reports-print` (header-printknoppen-case verwijderen, delete-case houden), `reports-mileage-history-card`, `p7a-reports-customers`, `p7a-reports-numbers`). Aangepaste tests moeten nog steeds hetzelfde gedrag bewijzen, alleen via de nieuwe navigatie. Noteer elke aanpassing in het rapport.
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` en `npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): new reports shell with sticky filter bar, report list and one report at a time`.

### Task 3: `ReportTable` met pagina's, zoeken en sorteren

**Files:**
- Create: `client/src/components/reports/kit/report-table.tsx`
- Modify: `client/src/components/ui/table-pager.tsx` (optionele prop `sizes?: number[]`, standaard huidige `PAGE_SIZES`; verbergen alleen als `total <= Math.min(...sizes)`)
- Test: `client/src/components/reports/kit/__tests__/report-table.test.tsx`

**Interfaces:**
- Produces:
  - `interface ReportTableColumn<R> { id: string; label: string; cell(r: R): React.ReactNode; text(r: R): string /* voor zoeken, CSV en afdruk */; sortValue?(r: R): string | number | null; align?: "left" | "right" }`
  - `ReportTable<R>({ rows, columns, rowKey, searchPlaceholder?, defaultSort?: { id: string; dir: "asc"|"desc" }, totals?: Record<string, string> /* totaalregel per kolom-id */, testId, resetKey /* bv. `${from}|${to}|${vehicleId}` */, onView?(view: { all: R[]; page: R[] }) => void })` — pagina's 10/25/50 (`sizes={[10,25,50]}`, standaard 10), zoekveld `${testId}-search` (zoekt in `text()` van alle kolommen, hoofdletterongevoelig), kolomkop sorteert via bestaande `SortableHead`/`nextSort`/`stableSort`, lege staat "Geen gegevens in deze periode." `onView` geeft de gefilterde+gesorteerde regels (`all`) en de huidige pagina (`page`) door — Task 4 gebruikt dat voor "Alleen deze pagina".
  - `reportTableCsv(columns, rows): string[][]` (kop + `text()`), gebruikt door rapporten voor **CSV**.
- [ ] **Step 1: Write failing tests**: 23 regels ⇒ 10 zichtbaar en pager "1-10 van 23"; pagina 3 ⇒ 3 regels; zoeken "XK-11" filtert en zet pagina op 1; klik op kolomkop sorteert oplopend, nogmaals aflopend; `resetKey` wijzigen terwijl op pagina 3 ⇒ pagina 1 en zoekterm blijft; `totals` toont een regel `${testId}-totals`; `onView` krijgt bij pagina 2 `page.length === 10` en `all.length === 23`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** test + `client/src/components/ui` tests die `TablePager` gebruiken (grep) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report table with pages of 10, search and sorting`.

### Task 4: Afdrukken met voorbeeld voor elk rapport

**Files:**
- Create: `client/src/lib/report-document-print.ts`, `client/src/components/reports/kit/report-print.tsx` (context + hook + dialoog)
- Modify: `client/src/pages/reports/report-pane.tsx` (knop **Afdrukken**), `client/src/components/reports/kit/report-month-chart.tsx` en `report-top-chart.tsx` (wrapper-`ref` zodat de svg te pakken is), locales
- Test: `client/src/lib/__tests__/report-document-print.test.ts`, `client/src/components/reports/kit/__tests__/report-print.test.tsx`

**Interfaces:**
- Produces:
  - `type PrintSection = { kind: "tiles"; tiles: Array<{ label: string; value: string }> } | { kind: "chart"; title?: string; getSvg(): string | null } | { kind: "table"; id: string; title?: string; header: string[]; allRows: () => Promise<{ rows: string[][]; truncated: boolean }> | { rows: string[][]; truncated: boolean }; pageRows?: string[][]; selectedRows?: string[][]; totals?: string[] } | { kind: "note"; text: string }`
  - `useReportPrint(sections: PrintSection[] | null)` — rapportcomponent registreert zijn afdrukinhoud bij het omringende `ReportPrintProvider` (in `ReportPane`); `null` = niets te printen.
  - `reportDocumentHtml(opts: { company: string; title: string; period: string; filters: string[]; sections: Array<PrintSection-resolved>; landscape: boolean; printedAt: string }): string` — volledig HTML-document, alles ge-escaped (hergebruik `escapeHtml` uit `report-table-print.ts`), svg wordt ongewijzigd ingevoegd (komt uit eigen DOM), `@page { size: A4 portrait|landscape; margin: 12mm }`, tabelkop herhaalt per pagina (`thead { display: table-header-group }`), voettekst "Gedrukt op {printedAt}" en paginanummer via CSS `counter(page)` in `@page` waar ondersteund.
  - `ReportPrintDialog({ open, onOpenChange, title })` (`data-testid="dialog-report-print"`): links vinkjes `print-option-tiles`, `print-option-chart`, `print-option-table` (alleen voor aanwezige sectiesoorten), bij tabellen een keuze `print-option-rows` met **Alle regels** / **Alleen deze pagina** (alleen als `pageRows`) / **Alleen aangevinkte** (alleen als `selectedRows?.length`), `print-option-landscape` (**Liggend**); rechts iframe `print-preview-frame` met `srcDoc` = exact de HTML die geprint wordt; knop **Afdrukken** `button-print-confirm` roept `iframe.contentWindow.print()` en `reportClientAction("report.print", { details: { report } })` aan zoals `HtmlPreviewDialog`. Standaard alles aan, **Alle regels**, staand. Bedrijfsnaam uit de bestaande bedrijfsinstelling die `HtmlPreviewDialog`/oude `printReport` gebruikte.
  - Ook exporteren: `ReportPrintButton` voor plekken buiten het paneel (Task 8: km-historie).
- [ ] **Step 1: Write failing tests**:
  - `reportDocumentHtml` met een tabel van 120 regels en `truncated: true` ⇒ bevat 120 `<tr>` in tbody, de melding "Niet alle regels passen in de export" (sleutel `reports.print.truncated`), `size: A4 landscape` als `landscape`, en een titel met `<script>` wordt ge-escaped.
  - Dialoog: rapport met alleen een tabel ⇒ geen `print-option-tiles`/`print-option-chart`; `print-option-rows` → **Alleen deze pagina** ⇒ `srcDoc` bevat alleen de `pageRows`; vinkje tabel uit ⇒ geen `<table` in `srcDoc`; `button-print-confirm` roept `print` van de iframe aan.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de twee testbestanden + `npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): print dialog with options and an exact preview for every report`.

### Task 5: Oude rapporten als eigen componenten, met de drie samenvoegingen

**Files:**
- Create: `client/src/pages/reports/report-base-data.ts` (hook `useReportBaseData()` met de page-level queries en afgeleide arrays uit `index.tsx:206-700`: `vehicles`, `filteredExpenses`, `filteredReservations`, `vehicleUtilizationData`, `expensesByCategory`, `expenseTrend`, `maintenanceCostByVehicle`, `apkStatusList`, `warrantyStatusList`, `customerReservationStats`, `customerCostRows`, `recentCustomerReservations`, `transports`), en per rapport één bestand in `client/src/pages/reports/legacy/`:
  - `vehicle-utilization-report.tsx` (**samengevoegd**: tegel gemiddelde benutting, top-10 grafiek, `ReportTable` met alle voertuigen)
  - `expenses-by-category-report.tsx` (**samengevoegd**: grafiek + categorietabel met totaal; `usesCategory`)
  - `expense-trend-report.tsx` (Kostentrends, nu op Kosten; `usesCategory`)
  - `recent-expenses-report.tsx` (**alle** kosten in de periode in `ReportTable`, standaard nieuwste eerst; titel "Kosten in deze periode")
  - `maintenance-cost-by-vehicle-report.tsx`, `apk-overview-report.tsx`, `warranty-report.tsx` (status-filter blijft als select boven de tabel; eigen zoek/paginering vervangen door `ReportTable`)
  - `customer-impact-report.tsx`, `customer-cost-categories-report.tsx`, `recent-customer-reservations-report.tsx` (alle in de periode, niet top 10)
  - `transports-report.tsx` (3 tegels + type/status-select + `ReportTable` met vinkjes; vinkjes leveren `selectedRows` voor afdrukken)
  - `vehicle-financials-report.tsx` (**samengevoegd** uit `financial-tab.tsx`: tegels Omzet/Kosten/Marge, grafiek top 10 op omzet, `ReportTable` met totaalregel, **CSV** zoals nu)
- Modify: `report-registry.tsx` (legacy-placeholders vervangen door deze rapporten), `index.tsx` (oude inline-secties, `printReport` en zijn HTML-bouwers verwijderen), `financial-tab.tsx` (verwijderen; kit-kaarten worden losse registerrapporten), locales (nieuwe titels; ongebruikte sleutels mogen blijven)
- Test: `client/src/pages/reports/__tests__/legacy-reports.test.tsx`; bestaande `p7a-reports-customers`, `p7a-reports-numbers`, `p7a-reports-filters`, `financial-money-reports` aanpassen

**Interfaces:**
- Consumes: Task 1 (`useReportFilters`, `ReportDef`), Task 3 (`ReportTable`, `reportTableCsv`), Task 4 (`useReportPrint`, `PrintSection`).
- Produces: registerrapport-ids (gebruikt door Task 7 Overzicht en latere delen): `vehicle-utilization`, `expenses-by-category`, `expense-trend`, `expenses-in-period`, `maintenance-cost-by-vehicle`, `apk-overview`, `warranty`, `customer-impact`, `customer-cost-categories`, `customer-reservations`, `transports`, `vehicle-financials`.
- Tabindeling: Kosten = expenses-by-category, expense-trend, expenses-in-period; Voertuigen = vehicle-utilization, maintenance-cost-by-vehicle, apk-overview, warranty + kit (Task 6); Klanten = customer-impact, customer-cost-categories, customer-reservations + kit; Transporten = transports; Financieel = vehicle-financials + kit.
- Elk rapport roept `useReportPrint` aan met zijn tegels/grafiek/tabel(len) en geeft `pageRows` uit `ReportTable.onView`.
- Gedrag van berekeningen verandert niet (zelfde functies, verplaatst). Rechten per rapport = de huidige `NoDataAccess`-regels van het oude tabblad (Explore: operations ⇒ vehicles+reservations; expenses ⇒ MANAGE_EXPENSES; vehicles/customers/transports ⇒ eigen families).

- [ ] **Step 1: Write failing tests** in `legacy-reports.test.tsx` (stub-data: 23 voertuigen, kosten in 3 categorieën, 2 transporten):
  - `vehicle-utilization`: `ReportTable` toont 10 van 23 regels, zoeken op een kenteken werkt; afdrukinhoud heeft tiles + chart + table met 23 `allRows`.
  - `expenses-by-category` en `expense-trend` staan op Kosten; de oude `reports-expense-trend` testid blijft op het trendrapport.
  - `vehicle-financials`: totaalregel = som van de regels; **CSV**-knop levert alle regels (niet alleen de pagina).
  - `transports`: twee regels aanvinken ⇒ afdrukdialoog biedt **Alleen aangevinkte** met precies die twee.
  - Gebruiker zonder MANAGE_EXPENSES ziet geen Kosten-rapporten en geen tab Kosten.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; verplaats code, verwijder dode code uit `index.tsx` (doel: `index.tsx` < 200 regels).
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `refactor(rapporten): old reports become their own components, three duplicates merged`.

### Task 6: Kit-kaarten en overige kaarten in het paneel, met afdrukinhoud

**Files:**
- Create: `client/src/components/reports/kit/report-section.tsx` (`ReportSection({ title, description?, testId, children })` — buiten het paneel een `Card` met kop, binnen het paneel (`useInReportPane()`) zonder titel)
- Modify (batch, zelfde soort wijziging): `fines-report-card.tsx`, `extra-costs-report-card.tsx`, `transport-billing-report-card.tsx`, `occupancy-report-card.tsx`, `maintenance-outlook-card.tsx`, `fleet-mileage-report-card.tsx`, `customer-value-report-card.tsx`, `portal-requests-report-card.tsx`, `waitlist-report-card.tsx`, `invoice-inbox-report-card.tsx` (beide delen: Ophaalrondes en Binnengekomen facturen worden twee registerrapporten `invoice-inbox-runs` en `invoice-inbox-items`), `delivery-report-card.tsx`, `damage-checks-report-card.tsx`, `WorkshopDowntimeCard`, km-historie-kaart (admin), `FiscalReportTab`; `report-registry.tsx`
- Test: bestaande kit-tests blijven groen; nieuw `client/src/pages/reports/__tests__/kit-print-sections.test.tsx`

**Interfaces:**
- Consumes: Task 1, Task 4.
- Produces: register-ids `fines`, `extra-costs`, `transport-billing`, `occupancy`, `maintenance-outlook`, `fleet-mileage` (admin), `mileage-history` (admin), `workshop-downtime`, `customer-value`, `portal-requests`, `waitlist`, `invoice-inbox-runs`, `invoice-inbox-items`, `deliveries`, `damage-checks`, `fiscal`.
- Kaarten lezen `from/to/vehicleId` uit `useReportFilters()` in plaats van props (props blijven optioneel als override voor bestaande tests).
- Afdrukinhoud kit-kaart: tiles (label + geformatteerde waarde), month chart (`getSvg`), elke `ReportBreakdownTable` als tabel (alle regels; geen pager). Tegel-detaillijsten houden hun eigen **Afdrukken** in `ReportDetailDialog` (bestaand).
- Lange breakdown-tabellen (>10 regels) krijgen `ReportTable` i.p.v. de vaste tabel (zelfde testid op de wrapper).
- [ ] **Step 1: Write failing test**: fines-kaart in paneel ⇒ geen dubbele titel (alleen `report-pane-title`), afdrukdialoog heeft tiles met "Totaal" en een tabel "Per klant"; occupancy ⇒ chart-optie aanwezig.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (één doorloop over alle kaarten).
- [ ] **Step 4: Run** alle reports-tests + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): every report card fits the pane and can be printed`.

### Task 7: Tabblad Overzicht en getallen in de lijst

**Files:**
- Create: `client/src/pages/reports/overview-report.tsx`, `client/src/pages/reports/report-badges.tsx`
- Modify: `report-registry.tsx`, locales
- Test: `client/src/pages/reports/__tests__/overview-report.test.tsx`

**Interfaces:**
- Consumes: bestaande summary-endpoints (zelfde query keys als de kaarten, zodat TanStack dedupliceert) en `useReportSelection().select`.
- Produces: register-id `overview` (tab `overview`, altijd zichtbaar als ≥1 andere tegel zichtbaar is).
- Tegels (alleen als het bronrapport zichtbaar is), elk `overview-tile-${id}` als knop die `select(tab, reportId)` doet:
  - `margin` — Marge, uit `/api/reports/vehicle-financials` totals ⇒ `vehicle-financials`
  - `occupancy` — Bezetting (% verhuurd), uit occupancy summary ⇒ `occupancy`
  - `finesOpen` — Open bekeuringen, fines tile `new` ⇒ `fines`
  - `apkOverdue` — APK verlopen, aantal `apkStatusList` met status verlopen ⇒ `apk-overview`
  - `maintenanceOverdue` — Onderhoud te laat, maintenance-outlook tile `overdue` ⇒ `maintenance-outlook`
  - `invoicesWaiting` — Facturen ter controle, invoice-inbox-items tile `waiting` ⇒ `invoice-inbox-items`
  - `deliveriesLate` — Te laat bezorgd, delivery tile `late` ⇒ `deliveries`
  - `portalOpen` — Open portaalaanvragen, portal-requests summary (bestaande "open"-tegel) ⇒ `portal-requests`
- Badges in `ReportNav` (alleen als > 0): `fines` (open), `apk-overview` (verlopen), `maintenance-outlook` (te laat), `invoice-inbox-items` (ter controle), `deliveries` (te laat), `portal-requests` (open). Zelfde bronnen als de tegels.
- Overzicht heeft afdrukinhoud: één tiles-sectie met de zichtbare tegels.
- [ ] **Step 1: Write failing tests**: admin ziet 8 tegels; klik `overview-tile-finesOpen` ⇒ actieve tab Financieel en `report-pane-title` = Bekeuringen; gebruiker `[view_reports, view_fines]` ziet `overview-tile-finesOpen` en `overview-tile-margin` maar niet `overview-tile-invoicesWaiting`; badge `report-nav-badge-fines` toont "3" bij 3 nieuwe bekeuringen en ontbreekt bij 0.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): overview tab with the key numbers and counts in the report list`.

### Task 8: Km-historie afdrukken met hetzelfde voorbeeld, opruimen en eindcontrole

**Files:**
- Modify: `client/src/components/vehicles/mileage-history-panel.tsx` (afdrukken via `ReportPrintButton`/`ReportPrintDialog`: tiles = samenvatting, chart, tabel standen; `@/lib/mileage-history-print` mag blijven als die door anderen gebruikt wordt, anders verwijderen), `docs/gebruikershandleiding/22-acceptatiechecklist.md` niet (handleiding komt na deel 4)
- Test: `client/src/components/vehicles/__tests__/mileage-history-panel.test.tsx` aanpassen

- [ ] **Step 1: Write failing test**: klik **Afdrukken** in het km-historiepaneel ⇒ `dialog-report-print` met tabel-optie; `srcDoc` bevat de kentekentitel en alle standen.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run --project client` (bekende 6 rode tests buiten rapporten: xss-sinks 2, availability-dialog 1, customers-query-permissions 3 — die blijven buiten beschouwing) en `npx tsc --noEmit -p .` — Expected: verder groen.
- [ ] **Step 5: Commit** `feat(km): mileage history prints through the report print dialog`.
- [ ] **Step 6 (controller):** browsercheck als beheerder en als beperkte gebruiker: filterbalk blijft staan bij scrollen; elk tabblad toont lijst + één rapport; tabel met pagina's; afdrukvoorbeeld gelijk aan afdruk; telefoonbreedte. Daarna Kees laten testen vóór merge/push.

## Controller rulings

(leeg; wordt tijdens uitvoering gevuld)

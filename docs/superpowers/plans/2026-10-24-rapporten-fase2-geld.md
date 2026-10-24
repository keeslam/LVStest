# Rapporten fase 2: geld (bekeuringen, meer-km/brandstof, transport niet gefactureerd, CSV) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op Rapporten > Financieel ziet kantoor waar geld blijft liggen: bekeuringen per stap, meer-km- en brandstofkosten, niet-gefactureerd transport — elk met tegels die precies de rijen openen die ze tellen, een grafiek, CSV en afdrukken — en de voertuigfinanciën-tabel krijgt een CSV-knop.

**Architecture:** Eerst een kleine herbruikbare rapportkit (fase 3–6 gebruiken hem ook). Server: `server/services/reports/report-kit.ts` parseert periode/paginering en hangt per rapport drie routes op (`/summary`, `/rows`, `/export`) rond een definitie die per tegel één SQL-voorwaarde levert, zodat tegel en lijst nooit uiteenlopen. Client: `client/src/components/reports/kit/` met tegels-als-knoppen, een detaildialoog (server-gepagineerd, sorteren, CSV van alle rijen, afdrukken via `HtmlPreviewDialog`), een maandgrafiek en een top-10-tabel. Daarna drie rapporten (server + kaart op Financieel) en de CSV-knop.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL (`sql` templates), React + TanStack Query, recharts, vitest (server tegen echte testdatabase met `agentFor`, client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` — onderdelen 1, 2, 3, 5, "Gemeenschappelijke regels voor elk nieuw rapport" en de rechtenbesluiten in "Wat Kees besliste".

## Global Constraints

- Server telt, filtert en pagineert; de browser krijgt alleen wat hij toont (anti-doel: geen route die alle rijen naar de browser stuurt behalve `/export`, begrensd op `REPORT_EXPORT_LIMIT = 20000` met `truncated`).
- Een getal op een tegel = het aantal (en bedrag) van de lijst die de tegel opent. Elke tegel heeft één `tileWhere(...)`; summary en rows gebruiken dezelfde.
- Rechten: rapportrecht `VIEW_REPORTS` of `MANAGE_REPORTS` **én** het recht van de bron. Bekeuringen: `VIEW_FINES`/`MANAGE_FINES`. Meer-km/brandstof (reserveringen): `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS`. Transport: `VIEW_VEHICLES`/`MANAGE_VEHICLES`/`VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` (zelfde als `GET /api/transports`, `server/routes.ts:9443`). Zonder bronrecht: kaart niet zichtbaar, geen request, route 403. Admin mag alles (`hasPermission` laat admin door).
- Bekeuringsstappen: `new` / `linked` / `cancelled`, plus groep **"oud"** = `LEGACY_FINE_STATUSES` (`charged`, `paid`, `disputed`, `shared/fines.ts:34`) met eigen tegel; telt mee in het totaalbedrag. Bedrag = `fines.total_amount`.
- Periode: `from`/`to` als `yyyy-mm-dd` kantoordatum, standaard 1 januari van het huidige jaar t/m kantoor-vandaag; ongeldige datum of `from > to` → 400 `INVALID_DATE`. Tijdstempels worden kantoordatum via `AT TIME ZONE officeTimeZone()`.
- Filter "voertuig" van de filterbalk geldt ook: `vehicleId` (`all`/leeg = alle; anders positief geheel getal, anders 400 `INVALID_VEHICLE`).
- CSV via `downloadCsv` (`client/src/lib/csv.ts`; bedragen met `csvNumber`, datums met `csvDate`/`csvDateTime`); afdrukken via `HtmlPreviewDialog` met `escapeHtml` op elke waarde.
- Grafieken met recharts (zoals `financial-tab.tsx`).
- Teksten in nl, en, es, pt, it, ro, pl in `client/src/locales/*/reports.json`; `client/src/__tests__/locale-parity.test.tsx` groen (ook `_many` voor es/pt/it/pl, `_few` voor ro/pl).
- Geen schemawijziging in deze fase (geen `startup-migration.js`, geen `schema-columns.json`).
- Bestaande tabbladen veranderen niet behalve: drie nieuwe kaarten onder Financieel en de CSV-knop op de voertuigfinanciën-tabel.

## Review Focus

1. Een rij precies op de periodegrens in kantoortijd (bekeuring `offence_at = 2025-12-31T23:30Z` = 1 januari 00:30 Amsterdam) hoort in januari, niet in december — test in Task 3.
2. Tegel ≠ lijst (het anti-doel): voor elk rapport en elke tegel moeten `summary.tiles[t]` en `/rows?tile=t` (totaal) plus de som van `/export` hetzelfde zeggen — `expectTilesMatchRows` (Task 1) in Tasks 3, 4, 5.
3. Een factureerbaar transport zonder bedrag (`billable = true`, `billable_amount IS NULL`) telt mee bij "nog niet gefactureerd" (bedrag 0), staat in de lijst met "bedrag ontbreekt" en heeft in de CSV een lege cel, geen `0,00` — test in Task 5.
4. Medewerker met alleen het rapportrecht (of alleen het bronrecht): 403 op alle drie routes, geen kaart, geen request — tests in Tasks 3, 4, 5.
5. Periode "alle gegevens" (`2000-01-01`–`2050-12-31`, wat Financieel stuurt) geeft geen grafiek met 612 lege maanden: `fillMonths` vult alleen tussen de eerste en laatste maand met data — test in Task 1. En een gebruikerstekst als `<script>` in een omschrijving verschijnt geëscaped in de afdruk — test in Task 2.

---

### Task 1: Rapportkit — server

**Files:**
- Create: `shared/report-kit.ts`
- Create: `server/services/reports/report-kit.ts`
- Create: `server/__tests__/helpers/report-kit.ts`
- Modify: `server/routes/mileage-history.ts:11-33` (gebruik `isRealDate` en de standaardperiode uit de kit; gedrag gelijk)
- Modify: `server/services/email-log-query.ts:47-58` (`one`/`positiveInt` uit de kit importeren in plaats van eigen kopieën; gedrag gelijk)
- Test: `server/__tests__/report-kit.test.ts`, `shared/report-kit.test.ts`

**Interfaces:**
- Produces (shared, `shared/report-kit.ts`):
  - `REPORT_PAGE_SIZES = [25, 50, 100, 250] as const`, `REPORT_EXPORT_LIMIT = 20000`, `REPORT_BREAKDOWN_LIMIT = 10`
  - `interface ReportTileTotal { count: number; amount: number }`
  - `interface ReportPage<Row> { rows: Row[]; total: number; page: number; pageSize: number }`
  - `interface ReportExport<Row> { rows: Row[]; truncated: boolean }`
  - `interface ReportBreakdownRow { key: number | string | null; label: string | null; count: number; amount: number }`
  - `fillMonths<T extends { month: string }>(rows: T[], empty: (month: string) => T): T[]` — sorteert op `month` (`yyyy-MM`) en vult ontbrekende maanden tussen de eerste en laatste aan; lege invoer → `[]`.
- Produces (server, `server/services/reports/report-kit.ts`):
  - `interface ReportFilter { from: string; to: string; vehicleId: number | null }`
  - `isRealDate(value: string): boolean` (verplaatst uit `mileage-history.ts`)
  - `defaultReportPeriod(today: string): { from: string; to: string }` → `{ from: "<jaar>-01-01", to: today }`
  - `parseReportFilter(query: Record<string, unknown>, today: string): { ok: true; filter: ReportFilter } | { ok: false; code: "INVALID_DATE" | "INVALID_VEHICLE" }`
  - `oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null`, `positiveInt(value: unknown, fallback: number): number`
  - `parseReportPaging<S extends string>(query: Record<string, unknown>, sorts: readonly S[], defaultSort: S, defaultDir: "asc" | "desc"): { sort: S; dir: "asc" | "desc"; page: number; pageSize: number }` — pageSize default 50, max 250.
  - `officeDaySql(column: SQL | AnyPgColumn): SQL` (timestamptz → kantoordatum) en `textDaySql(column: SQL | AnyPgColumn): SQL` (tekstdatum `yyyy-mm-dd…` → `date`, anders `NULL`, zoals `officeDateSql` in `email-log-query.ts:93`)
  - `inPeriodSql(day: SQL, filter: ReportFilter): SQL` → `day >= from::date AND day <= to::date`
  - `money(sumSql: SQL): SQL<number>` → `round(coalesce(sum, 0)::numeric, 2)::float8`
  - ```ts
    interface ReportDefinition<Tile extends string, Sort extends string, Row, Summary extends { tiles: Record<Tile, ReportTileTotal> }> {
      key: string;                       // "fines" → foutcode FINES_REPORT_FAILED
      tiles: readonly Tile[];
      sorts: readonly Sort[]; defaultSort: Sort; defaultDir: "asc" | "desc";
      summary(filter: ReportFilter): Promise<Summary>;
      count(filter: ReportFilter, tile: Tile): Promise<number>;
      list(filter: ReportFilter, tile: Tile, order: { sort: Sort; dir: "asc" | "desc" }, limit: number, offset: number): Promise<Row[]>;
    }
    mountReport<Tile extends string, Sort extends string, Row, Summary extends { tiles: Record<Tile, ReportTileTotal> }>(
      app: Express, basePath: string, guards: RequestHandler[], def: ReportDefinition<Tile, Sort, Row, Summary>): void
    ```
    Registreert `GET ${basePath}/summary` → `Summary & { from, to }`; `GET ${basePath}/rows?tile=` → `ReportPage<Row>` (pagina begrensd op de laatste, zoals `searchEmailLogs`); `GET ${basePath}/export?tile=` → `ReportExport<Row>` (vraagt `REPORT_EXPORT_LIMIT + 1` rijen). Onbekende/ontbrekende `tile` → 400 `INVALID_TILE`; filterfout → 400 met die code; exceptie → 500 `{ message, code: "<KEY>_REPORT_FAILED" }` (key in hoofdletters, `-` → `_`). `today` = `dateInZone(new Date(), officeTimeZone())`.
- Produces (test helper, `server/__tests__/helpers/report-kit.ts`):
  - `expectTilesMatchRows(agent: TestAgent, basePath: string, params: Record<string, string>, tiles: readonly string[]): Promise<void>` — per tegel: `summary.tiles[t].count === rows.total` (pageSize 250) en `summary.tiles[t].amount` gelijk aan de som van `rows[].amount` uit `/export` (afgerond op 2). Elk rapport zet het tegelbedrag van een rij in het veld `amount`.

- [ ] **Step 1: Write failing unit tests** (`server/__tests__/report-kit.test.ts`, geen database):

```ts
it("standaardperiode is het huidige jaar tot vandaag", () => {
  expect(parseReportFilter({}, "2026-10-24")).toEqual({ ok: true, filter: { from: "2026-01-01", to: "2026-10-24", vehicleId: null } });
});
it("ongeldige datum, from na to en kapot voertuig", () => {
  expect(parseReportFilter({ from: "2026-02-30" }, T)).toEqual({ ok: false, code: "INVALID_DATE" });
  expect(parseReportFilter({ from: "2026-05-01", to: "2026-04-01" }, T)).toEqual({ ok: false, code: "INVALID_DATE" });
  expect(parseReportFilter({ vehicleId: "abc" }, T)).toEqual({ ok: false, code: "INVALID_VEHICLE" });
  expect((parseReportFilter({ vehicleId: "all" }, T) as any).filter.vehicleId).toBeNull();
  expect((parseReportFilter({ vehicleId: "12" }, T) as any).filter.vehicleId).toBe(12);
});
it("paginering begrenst en valt terug", () => {
  expect(parseReportPaging({ pageSize: "1000", sort: "evil", dir: "x" }, ["date", "amount"], "date", "desc"))
    .toEqual({ sort: "date", dir: "desc", page: 1, pageSize: 250 });
});
```
Plus a mount test on a bare `express()` app with `supertest` and a fake definition (in-memory, 3 rows, tiles `["a"]`): `/rows?tile=zz` → 400 `INVALID_TILE`; `/rows?tile=a&page=99&pageSize=25` → `page: 1, total: 3`; `/summary?from=2026-13-01` → 400 `INVALID_DATE`; a definition whose `list` returns `limit` rows → `/export` gives `truncated: true` and `REPORT_EXPORT_LIMIT` rows; a `summary` that throws → 500 code `FAKE_THING_REPORT_FAILED` for key `"fake-thing"`.
`shared/report-kit.test.ts`: `fillMonths([{month:"2026-03",v:1},{month:"2026-01",v:2}], m => ({month:m,v:0})).map(r=>r.month)` → `["2026-01","2026-02","2026-03"]`; `fillMonths([], …)` → `[]`.

- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-kit.test.ts shared/report-kit.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the shared file, the kit and the test helper. Move `isRealDate` out of `mileage-history.ts` and let that route use `isRealDate` + `defaultReportPeriod`; let `email-log-query.ts` import `oneOf`/`positiveInt`.
- [ ] **Step 4: Run** the two new tests plus `server/__tests__/mileage-history-routes.test.ts server/__tests__/email-log-search.test.ts` — Expected: PASS (no regressions).
- [ ] **Step 5: Commit** `feat(rapporten): server report kit (period, paging, summary/rows/export routes)`.

### Task 2: Rapportkit — client

**Files:**
- Create: `client/src/components/reports/kit/report-tiles.tsx`
- Create: `client/src/components/reports/kit/report-detail-dialog.tsx`
- Create: `client/src/components/reports/kit/report-month-chart.tsx`
- Create: `client/src/components/reports/kit/report-breakdown-table.tsx`
- Create: `client/src/lib/report-table-print.ts`
- Modify: `client/src/locales/*/reports.json` (blok `reportKit`) — 7 talen
- Test: `client/src/components/reports/kit/__tests__/report-kit.test.tsx`

**Interfaces:**
- Consumes: `ReportPage`, `ReportExport`, `ReportBreakdownRow`, `REPORT_PAGE_SIZES` (Task 1); `TablePager` (`client/src/components/ui/table-pager.tsx:23`), `SortableHead`/`nextSort`/`SortState` (`client/src/components/ui/sortable-head.tsx`), `HtmlPreviewDialog`, `downloadCsv`/`Cell`, `escapeHtml`, `useToast`.
- Produces:
  - `ReportTiles<T extends string>({ tiles, onOpen, testIdPrefix }: { tiles: Array<{ id: T; label: string; value: string; hint?: string; tone?: "default" | "green" | "red" | "amber" }>; onOpen: (id: T) => void; testIdPrefix: string })` — elke tegel een `<button type="button">` met `data-testid="button-${testIdPrefix}-tile-${id}"`, opmaak als de Analyse-tegels (`CustomerCommunications.tsx:1523-1530`).
  - `interface ReportColumn<Row, S extends string> { id: string; label: string; sortKey?: S; align?: "right"; cell: (row: Row) => React.ReactNode; csv: (row: Row) => Cell; print?: (row: Row) => string }` (`print` default `String(csv(row) ?? "")`)
  - `ReportDetailDialog<Row, S extends string>({ open, onOpenChange, title, description, endpoint, params, tile, columns, defaultSort, rowKey, csvSubject, reportName, testId }: { …; endpoint: string; params: Record<string, string>; tile: string; defaultSort: SortState<S>; rowKey: (row: Row) => string | number })` — query key `[`${endpoint}/rows`, { ...params, tile, sort, dir, page, pageSize }]` met `keepPreviousData`; sorteerkoppen via `SortableHead` met `testId` `sort-${testId}-${sortKey}`, `TablePager` met `testId` `pager-${testId}`; pagina terug naar 1 bij sorteer-/paginagrootte-wijziging; knop **CSV** (`button-${testId}-csv`) haalt `${endpoint}/export?…` (zelfde params, sort, dir) en roept `downloadCsv(csvSubject, columns.map(c => c.label), rows.map(r => columns.map(c => c.csv(r))))`, `truncated` → toast `reportKit.exportTruncated`, fout → toast `reportKit.exportFailed`; knop **Afdrukken** (`button-${testId}-print`) haalt dezelfde export en opent `HtmlPreviewDialog` met `reportTableHtml`. Leeg → `reportKit.empty`.
  - `reportTableHtml(input: { title: string; subtitle: string; header: string[]; rows: string[][]; truncatedNote?: string }): string` — volledig HTML-document, elke waarde door `escapeHtml`.
  - `ReportMonthChart({ data, series, money, stacked, testId }: { data: Array<{ month: string } & Record<string, number>>; series: Array<{ key: string; label: string; color: string }>; money?: boolean; stacked?: boolean; testId: string })` — recharts `BarChart` in `ResponsiveContainer`, y-as `formatCurrency` als `money`; leeg → `reportKit.noData`.
  - `ReportBreakdownTable({ title, rows, nullLabel, money, testId }: { title: string; rows: ReportBreakdownRow[]; nullLabel: string; money?: boolean; testId: string })` — kolommen naam, aantal, bedrag; `label === null` toont `nullLabel`.
- Locale keys `reportKit`: `csv`, `print`, `empty`, `noData`, `loading`, `exportFailed`, `exportTruncated`, `rowsCount_one/_other` (+ `_few`/`_many`), `period`.

- [ ] **Step 1: Write failing tests** (jsdom, fetch stubbed as in `reports-mileage-history-card.test.tsx`, `vi.mock("@/lib/csv", async (orig) => ({ ...(await orig()), downloadCsv: vi.fn() }))`):

```ts
it("een tegel is een knop die zijn id doorgeeft", async () => {
  render(<ReportTiles testIdPrefix="t" tiles={[{ id: "legacy", label: "Oud", value: "2" }]} onOpen={onOpen} />);
  await user.click(screen.getByTestId("button-t-tile-legacy"));
  expect(onOpen).toHaveBeenCalledWith("legacy");
});
it("de dialoog vraagt één pagina van de server en sorteert opnieuw", async () => {
  // open with endpoint "/api/reports/x", params { from: "2026-01-01", to: "2026-12-31" }, tile "a", defaultSort { key: "date", dir: "desc" }
  expect(lastPath()).toBe("/api/reports/x/rows?from=2026-01-01&to=2026-12-31&tile=a&sort=date&dir=desc&page=1&pageSize=50");
  await user.click(screen.getByTestId("sort-x-amount"));
  expect(lastPath()).toContain("sort=amount&dir=asc");
});
it("CSV haalt alle rijen via /export", async () => {
  await user.click(screen.getByTestId("button-x-csv"));
  expect(fetchedPaths()).toContain("/api/reports/x/export?from=2026-01-01&to=2026-12-31&tile=a&sort=date&dir=desc");
  expect(downloadCsv).toHaveBeenCalledWith("x-subject", ["Datum", "Bedrag"], [["01-03-2026", "12,50"]]);
});
it("afdrukken escapet gebruikerstekst", () => {
  const html = reportTableHtml({ title: "T", subtitle: "S", header: ["Omschrijving"], rows: [["<script>x</script>"]] });
  expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  expect(html).not.toContain("<script>x");
});
```

- [ ] **Step 2: Run** `npx vitest run client/src/components/reports/kit/__tests__/report-kit.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the four components, the print helper and the `reportKit` keys in all 7 languages.
- [ ] **Step 4: Run** the kit test and `client/src/__tests__/locale-parity.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): client report kit (tiles, detail dialog, month chart, breakdown)`.

### Task 3: Bekeuringen (onderdeel 1)

**Files:**
- Create: `shared/reports/fines-report.ts`
- Create: `server/services/reports/fines-report.ts`
- Modify: `server/routes/reports.ts` (in `registerReportRoutes`: `mountReport(app, "/api/reports/fines", [hasPermission(VIEW_REPORTS, MANAGE_REPORTS), hasPermission(VIEW_FINES, MANAGE_FINES)], finesReport)`)
- Create: `client/src/pages/reports/fines-report-card.tsx`
- Modify: `client/src/pages/reports/financial-tab.tsx` (kaart onder de voertuigtabel)
- Modify: `client/src/locales/*/reports.json` (blok `moneyReports.fines`)
- Test: `server/__tests__/report-fines.test.ts`, `client/src/pages/reports/__tests__/financial-money-reports.test.tsx` (nieuw; Tasks 4 en 5 voegen er cases aan toe)

**Interfaces:**
- Produces (shared): `FINE_REPORT_TILES = ["new", "linked", "cancelled", "legacy", "total"] as const`; `FINE_REPORT_SORTS = ["offenceAt", "amount", "status", "licensePlate", "customer"] as const`;
  `interface FineReportRow { id: number; offenceAt: string; receivedAt: string | null; licensePlate: string; vehicleId: number | null; description: string; reference: string | null; status: string; amount: number; customerId: number | null; customerName: string | null; driverName: string | null; linkedAt: string | null }`;
  `interface FineReportSummary { tiles: Record<FineReportTile, ReportTileTotal>; avgDaysToLink: number | null; byMonth: Array<{ month: string; new: number; linked: number; cancelled: number; legacy: number }>; byCustomer: ReportBreakdownRow[]; byVehicle: ReportBreakdownRow[]; byDriver: ReportBreakdownRow[] }`
- Produces (server): `export const finesReport: ReportDefinition<FineReportTile, FineReportSort, FineReportRow, FineReportSummary>`.

Rules: periodedag = `officeDaySql(fines.offence_at)`; `vehicleId` filtert `fines.vehicle_id`. Tegels: `new` = status `new`; `linked` = `linked`; `cancelled` = `cancelled`; `legacy` = status in `LEGACY_FINE_STATUSES`; `total` = alles behalve `cancelled`. Bedrag = `total_amount`. `byMonth` = bedrag per groep per maand (`to_char(day,'YYYY-MM')`). Breakdowns over de `total`-rijen, top `REPORT_BREAKDOWN_LIMIT` op bedrag aflopend, dan aantal; zonder klant/bestuurder → `key: null, label: null`. Klantnaam = `customers.name`, bestuurder = `drivers.display_name`, voertuiglabel = `fines.license_plate`. `avgDaysToLink` = gemiddelde van `max(0, officeDay(linked_at) − received_at::date)` over periode-rijen met beide gevuld, op 1 decimaal; geen → `null`. Sorteren: `customer` op `lower(name) NULLS LAST`, altijd `id` als tweede sleutel.

Card: titel/omschrijving; `ReportTiles` (5 tegels: aantal als `value`, bedrag als `hint`; `total` toont het bedrag als `value`); regel "gemiddeld X dagen van ontvangst tot koppelen"; `ReportMonthChart` (stacked, money; reeksen new/linked/legacy/cancelled); drie `ReportBreakdownTable`s (klant, voertuig, bestuurder; nullLabel "Niet gekoppeld"); `ReportDetailDialog` voor de gekozen tegel met kolommen overtredingsdatum, ontvangen, kenteken, omschrijving, kenmerk, status (vertaald, oude statussen met badge "oud"), bedrag, klant, bestuurder. Alleen gerenderd en gevraagd als `useHasPermission(VIEW_FINES, MANAGE_FINES)`. Params: `from`, `to` uit `FinancialTab`, plus `vehicleId` als niet `all`.

- [ ] **Step 1: Write failing server tests** (fixture vehicle V, customer C; fines inserted with `db.insert(fines)` and deleted by id in `afterAll`; all calls with `vehicleId=V&from=2026-01-01&to=2026-12-31`). Fixtures: f1 `new` 100.00 offence `2026-03-05T10:00Z` received `2026-03-10`; f2 `linked` 50.00 offence `2026-03-20T10:00Z` received `2026-03-21` linkedAt `2026-03-25T09:00Z` customer C; f3 `cancelled` 30.00 `2026-04-02T10:00Z`; f4 `paid` 40.00 `2026-04-10T10:00Z` received `2026-04-11` linkedAt `2026-04-13T09:00Z`; f5 `charged` 20.00 `2026-04-15T10:00Z`; f6 `new` 5.00 offence `2025-12-31T23:30:00Z`; f7 `new` 7.00 offence `2026-12-31T23:30:00Z`.

```ts
it("tegels per stap, oud apart, totaal zonder vervallen", async () => {
  const s = (await staff.get("/api/reports/fines/summary").query(Q)).body;
  expect(s.tiles).toEqual({
    new: { count: 2, amount: 105 }, linked: { count: 1, amount: 50 }, cancelled: { count: 1, amount: 30 },
    legacy: { count: 2, amount: 60 }, total: { count: 5, amount: 215 },
  });
  expect(s.avgDaysToLink).toBe(3);
  expect(s.byMonth.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  expect(s.byMonth[0]).toEqual({ month: "2026-01", new: 5, linked: 0, cancelled: 0, legacy: 0 });
  expect(s.byCustomer).toContainEqual({ key: C, label: "<C name>", count: 1, amount: 50 });
  expect(s.byCustomer).toContainEqual({ key: null, label: null, count: 4, amount: 165 });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/fines", Q, FINE_REPORT_TILES));
it("legacy-lijst bevat paid en charged, nieuwste eerst", async () => {
  const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "legacy" })).body;
  expect(r.rows.map((x) => x.status)).toEqual(["charged", "paid"]);
});
it("rechten: rapport + bekeuringen", async () => {
  for (const a of [reportsOnly, finesOnly]) expect((await a.get("/api/reports/fines/summary").query(Q)).status).toBe(403);
  const both = await agentFor(["manage_reports", "manage_fines"]);
  expect((await both.get("/api/reports/fines/rows").query({ ...Q, tile: "new" })).status).toBe(200);
});
```
(`fillMonths` puts `2026-02` in `byMonth` with zeros; f7 falls outside — on 1 January 2027 office time; f6 inside.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-fines.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, `finesReport`, the mount line.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write failing client tests** in `financial-money-reports.test.tsx` (renders `FinancialTab` with `dateRange` `2026-01-01`–`2026-12-31`, `selectedVehicle="all"`, `useAuth` mocked, fetch stubbed): permissions `["view_reports"]` ⇒ no `card-fines-report` and no request starting with `/api/reports/fines`; `["view_reports","view_fines"]` ⇒ `button-fines-tile-legacy` shows `2` and `formatCurrency(60)`; click ⇒ a request to `/api/reports/fines/rows?from=2026-01-01&to=2026-12-31&tile=legacy&sort=offenceAt&dir=desc&page=1&pageSize=50` and dialog `dialog-fines-report` lists the stubbed row's description.
- [ ] **Step 6: Implement** `FinesReportCard`, wire it into `FinancialTab`, add `moneyReports.fines` keys (title, description, tiles.*, avgDaysToLink, avgDaysToLinkNone, byMonth, byCustomer, byVehicle, byDriver, notLinked, legacyBadge, statuses.{new,linked,cancelled,charged,paid,disputed}, columns.*, csvSubject `bekeuringen`) in 7 languages.
- [ ] **Step 7: Run** the client test, `locale-parity.test.tsx`, `client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: PASS.
- [ ] **Step 8: Commit** `feat(rapporten): fines report on Financieel`.

### Task 4: Meer-km en brandstof (onderdeel 2)

**Files:**
- Create: `shared/reports/extra-costs-report.ts`, `server/services/reports/extra-costs-report.ts`
- Modify: `server/routes/reports.ts` (`mountReport(app, "/api/reports/extra-costs", [reports guard, hasPermission(VIEW_RESERVATIONS, MANAGE_RESERVATIONS)], extraCostsReport)`)
- Create: `client/src/pages/reports/extra-costs-report-card.tsx`
- Modify: `client/src/pages/reports/financial-tab.tsx`, `client/src/locales/*/reports.json` (`moneyReports.extraCosts`)
- Test: `server/__tests__/report-extra-costs.test.ts`, cases in `financial-money-reports.test.tsx`

**Interfaces:**
- Produces (shared): `EXTRA_COSTS_TILES = ["extraKm", "fuel", "withExtraKm"] as const`; `EXTRA_COSTS_SORTS = ["startDate", "amount", "extraKm", "fuelCost", "licensePlate", "customer"] as const`;
  `interface ExtraCostsRow { reservationId: number; startDate: string; returnDate: string | null; vehicleId: number; licensePlate: string; brand: string; model: string; customerId: number | null; customerName: string | null; extraKm: number | null; extraKmCost: number | null; fuelCost: number | null; amount: number }` (`amount` = bedrag van de geopende tegel: `extraKmCost` voor `extraKm`/`withExtraKm`, `fuelCost` voor `fuel`);
  `interface ExtraCostsSummary { tiles: Record<ExtraCostsTile, ReportTileTotal>; totalExtraKm: number; byMonth: Array<{ month: string; extraKmCost: number; fuelCost: number }>; byCustomer: ReportBreakdownRow[]; byVehicle: ReportBreakdownRow[] }`
- Produces (server): `extraCostsReport`.

Rules — zelfde verzameling als `buildVehicleFinancials` (`server/utils/financial-reports.ts:91-96`), zodat de som klopt met "waarvan extra kosten": `type = 'standard'`, `status <> 'cancelled'`, `deleted_at IS NULL`, `vehicle_id` gevuld en bestaand voertuig (inner join), periodedag = `textDaySql(start_date)`. Tegels: `extraKm` = `extra_km_cost > 0` (bedrag som `extra_km_cost`); `fuel` = `fuel_cost > 0` (som `fuel_cost`); `withExtraKm` = `extra_km > 0` (bedrag som `extra_km_cost`). `returnDate` = `actual_return_date ?? end_date`. Breakdowns over rijen met `extra_km_cost > 0 OR fuel_cost > 0`, bedrag = `extra_km_cost + fuel_cost`, top 10.

- [ ] **Step 1: Write failing server tests** (vehicle V, customer C; `createFixtureReservation` then `db.update` for the cost columns/`deletedAt`): r1 start `2026-02-01` extraKm 120, extraKmCost 30.00, fuelCost 25.50; r2 `2026-02-15` extraKm 0, fuelCost 40.00; r3 `cancelled` extraKmCost 99; r4 `deletedAt` set, extraKmCost 77; r5 `type: "replacement"` extraKmCost 11; r6 start `2025-12-20` extraKmCost 50.

```ts
expect(s.tiles).toEqual({ extraKm: { count: 1, amount: 30 }, fuel: { count: 2, amount: 65.5 }, withExtraKm: { count: 1, amount: 30 } });
expect(s.totalExtraKm).toBe(120);
expect(s.byMonth).toEqual([{ month: "2026-02", extraKmCost: 30, fuelCost: 65.5 }]);
it("klopt met waarvan extra kosten op Financieel", async () => {
  const fin = (await staff.get("/api/reports/vehicle-financials").query({ from: "2026-01-01", to: "2026-12-31", vehicleId: V })).body;
  expect(fin.totals.extraCosts).toBe(95.5);
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/extra-costs", Q, EXTRA_COSTS_TILES));
// rechten: ["view_reports"] → 403, ["view_reservations"] → 403, ["view_reports","view_reservations"] → 200
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-extra-costs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — Expected after run: PASS.
- [ ] **Step 4: Client** — failing cases first: without a reservations right no `card-extra-costs-report` and no request to `/api/reports/extra-costs`; with it, tile `button-extra-costs-tile-fuel` shows `2` and `formatCurrency(65.5)`. Then `ExtraCostsReportCard` (tiles, regel totaal meer-km, stacked month chart extraKmCost/fuelCost, breakdown klant + voertuig, detail dialog with kolommen reservering, start, inlevering, kenteken, klant, meer-km, meer-km-kosten, brandstof), keys `moneyReports.extraCosts` (csvSubject `meer-km-en-brandstof`) in 7 languages.
- [ ] **Step 5: Run** client test + parity — Expected: PASS.
- [ ] **Step 6: Commit** `feat(rapporten): extra km and fuel report on Financieel`.

### Task 5: Transport niet gefactureerd (onderdeel 3)

**Files:**
- Create: `shared/reports/transport-billing-report.ts`, `server/services/reports/transport-billing-report.ts`
- Modify: `server/routes/reports.ts` (`mountReport(app, "/api/reports/transport-billing", [reports guard, hasPermission(VIEW_VEHICLES, MANAGE_VEHICLES, VIEW_RESERVATIONS, MANAGE_RESERVATIONS)], transportBillingReport)`)
- Create: `client/src/pages/reports/transport-billing-report-card.tsx`
- Modify: `client/src/pages/reports/financial-tab.tsx`, `client/src/locales/*/reports.json` (`moneyReports.transport`)
- Test: `server/__tests__/report-transport-billing.test.ts`, cases in `financial-money-reports.test.tsx`

**Interfaces:**
- Produces (shared): `TRANSPORT_BILLING_TILES = ["notInvoiced", "invoiced", "toll"] as const`; `TRANSPORT_BILLING_SORTS = ["date", "amount", "tollCost", "transportType", "status"] as const`;
  `interface TransportBillingRow { id: number; date: string; transportType: string; status: string; vehicleId: number | null; licensePlate: string | null; isExternalVehicle: boolean; customerId: number | null; customerName: string | null; billable: boolean; billableAmount: number | null; tollCost: number | null; invoiced: boolean; invoicedDate: string | null; distanceKm: number | null; amount: number }` (`amount` = `billableAmount ?? 0`, voor tegel `toll` = `tollCost`);
  `interface TransportBillingSummary { tiles: Record<TransportBillingTile, ReportTileTotal>; missingAmount: number; byMonth: Array<{ month: string; invoiced: number; notInvoiced: number; toll: number }>; byType: Array<{ type: string; count: number; billable: number; notInvoiced: number; toll: number }> }`
- Produces (server): `transportBillingReport`.

**Controller ruling (2026-10-24):** the money that is left behind is the point of this report, and the page period defaults to the last 30 days. So besides the period tiles add tile `openAllTime` = `billable AND NOT invoiced` over ALL periods (same rules otherwise, ignores from/to), label "Nog te factureren (alle perioden)"; clicking it opens the list without a period filter. Add it to `TRANSPORT_BILLING_TILES` and to the summary test (expect it to include an out-of-period not-invoiced fixture that the `notInvoiced` tile excludes).

Rules: `status <> 'cancelled'`; periodedag = `textDaySql(coalesce(completed_date, scheduled_date))`; `vehicleId` filtert `vehicle_id` (externe voertuigen vallen dan weg). Kenteken = `vehicles.license_plate` of, bij `is_external_vehicle`, `external_license_plate`. Tegels: `notInvoiced` = `billable AND NOT invoiced` (som `billable_amount`, null telt 0); `invoiced` = `billable AND invoiced`; `toll` = `toll_cost > 0` (som `toll_cost`). `missingAmount` = aantal `notInvoiced`-rijen met `billable_amount IS NULL`. `byType` over alle periode-rijen, volgorde `swap, tow, repossession, delivery, other`, alleen soorten met rijen.

- [ ] **Step 1: Write failing server tests** (vehicle V, customer C; rows via `db.insert(vehicleTransports)`; cascade-delete with the fixture vehicle; external one deleted by id): t1 `tow` completed, scheduled `2026-05-02`, completed `2026-05-03`, billable 150, toll 12.40; t2 `swap` scheduled `2026-05-10`, billable 80, invoiced, invoicedDate `2026-05-20`; t3 `delivery` `cancelled`, billable 500; t4 `other` scheduled `2026-06-01`, billable, amount null; t5 `repossession` not billable, toll 7.60, scheduled `2026-06-03`; tx external (`isExternalVehicle: true`, `externalLicensePlate: "FIXT-EXT1"`, billable 60) scheduled `2026-06-05`.

```ts
expect(s.tiles).toEqual({ notInvoiced: { count: 2, amount: 150 }, invoiced: { count: 1, amount: 80 }, toll: { count: 2, amount: 20 } });
expect(s.missingAmount).toBe(1);
expect(s.byType).toEqual([
  { type: "swap", count: 1, billable: 80, notInvoiced: 0, toll: 0 },
  { type: "tow", count: 1, billable: 150, notInvoiced: 150, toll: 12.4 },
  { type: "repossession", count: 1, billable: 0, notInvoiced: 0, toll: 7.6 },
  { type: "other", count: 1, billable: 0, notInvoiced: 0, toll: 0 },
]);
expect(s.byMonth.find((m) => m.month === "2026-05")).toEqual({ month: "2026-05", invoiced: 80, notInvoiced: 150, toll: 12.4 });
it("bedrag ontbreekt: telt mee met 0 en billableAmount null", async () => {
  const r = (await staff.get("/api/reports/transport-billing/rows").query({ ...Q, tile: "notInvoiced" })).body;
  expect(r.rows.find((x) => x.id === t4).billableAmount).toBeNull();
});
it("extern voertuig zonder voertuigfilter, met eigen kenteken", async () => {
  const e = (await staff.get("/api/reports/transport-billing/export").query({ from: "2026-06-05", to: "2026-06-05", tile: "notInvoiced" })).body;
  expect(e.rows.find((x) => x.id === tx).licensePlate).toBe("FIXT-EXT1");
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/transport-billing", Q, TRANSPORT_BILLING_TILES));
// rechten: ["view_reports"] → 403, ["view_vehicles"] → 403, ["view_reports","view_reservations"] → 200
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-transport-billing.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — Expected after run: PASS.
- [ ] **Step 4: Client** — failing cases first: without vehicles/reservations right no `card-transport-billing-report`, no request; with it, `button-transport-billing-tile-notInvoiced` shows `2` and `formatCurrency(150)`, and a hint "1 zonder bedrag" when `missingAmount > 0`; a row with `billableAmount: null` shows "bedrag ontbreekt" in the dialog and its CSV cell is `""` (assert on `downloadCsv` args). Then `TransportBillingReportCard` (tiles, month chart invoiced/notInvoiced, per-soort tabel with `delivery:transportDialog.typeLabels.*`, detail dialog: datum, soort, status, kenteken, klant, factureerbaar bedrag, tol, gefactureerd op, km), keys `moneyReports.transport` (csvSubject `transport-facturatie`) in 7 languages.
- [ ] **Step 5: Run** client test + parity — Expected: PASS.
- [ ] **Step 6: Commit** `feat(rapporten): transport billing report on Financieel`.

### Task 6: CSV op Financieel (onderdeel 5)

**Files:**
- Modify: `client/src/pages/reports/financial-tab.tsx:144-148` (knop in de `CardHeader` van de voertuigtabel)
- Modify: `client/src/locales/*/reports.json` (`financialTab.csv.*`)
- Test: case in `client/src/pages/reports/__tests__/financial-money-reports.test.tsx`

**Interfaces:**
- Consumes: `downloadCsv`, `csvNumber` (`client/src/lib/csv.ts`); the existing `activeRows` and `financials.totals`.

Knop `button-financial-csv` (uitgeschakeld zonder `activeRows`). Onderwerp `t('financialTab.csv.subject')` = "voertuigfinancien". Kolommen: kenteken, merk, model, verhuringen, huurdagen, omzet, waarvan extra kosten, per dag, dagprijs, kosten, marge, marge %. Rijen = `activeRows` (zelfde als het scherm, kenteken via `formatLicensePlate`, bedragen via `csvNumber`, lege dagprijs/per dag → `""`, marge % als geheel getal of `""`), plus een laatste rij "Totaal" met de totalen.

- [ ] **Step 1: Write failing test**: stub `/api/reports/vehicle-financials` with one row (`ABC12D`, revenue 1000, extraCosts 95.5, rentals 2, rentalDays 10, expenses 400, margin 600, dailyPrice 90) and totals; click `button-financial-csv` ⇒ `downloadCsv` called once with subject `voertuigfinancien`, a 12-column header, and rows `[[formatLicensePlate("ABC12D"), "Volkswagen", "Golf", 2, 10, "1000,00", "95,50", "100,00", "90,00", "400,00", "600,00", "60"], ["Totaal", "", "", 2, 10, "1000,00", "95,50", "100,00", "", "400,00", "600,00", "60"]]`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the button and keys in 7 languages.
- [ ] **Step 4: Run** the test and parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): CSV export of vehicle financials`.

### Task 7: Afronden

- [ ] Run `npx vitest run server/__tests__/report-kit.test.ts server/__tests__/report-fines.test.ts server/__tests__/report-extra-costs.test.ts server/__tests__/report-transport-billing.test.ts server/__tests__/mileage-history-routes.test.ts server/__tests__/email-log-search.test.ts server/__tests__/fix-i-permission-matrix.test.ts shared/report-kit.test.ts` and `npx vitest run client/src/components/reports client/src/pages/reports client/src/__tests__/locale-parity.test.tsx` — Expected: PASS (bekende rode tests op `main`, zoals `xss-sinks` en `customers-query-permissions`, blijven buiten beschouwing). `npx tsc --noEmit -p .` — geen uitvoer.
- [ ] In de browser (dev server `start`): als admin Rapporten > Financieel, periode dit jaar: drie kaarten, elke tegel opent zijn lijst met gelijk aantal, sorteren, pagineren, CSV en afdrukvoorbeeld; voertuigfilter beperkt alle drie; de CSV-knop van de voertuigtabel. Als medewerker met alleen `view_reports`: geen van de drie kaarten, wel de CSV-knop.
- [ ] Handleiding (`docs/gebruikershandleiding`) alleen bijwerken als een pagina het tabblad Financieel beschrijft.
- [ ] Kees vragen voor merge naar `main` en push (Coolify deployt bij push; geen migratie in deze fase).

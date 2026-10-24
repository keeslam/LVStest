# Rapporten fase 3: vloot (bezettings-heatmap, onderhoud en APK vooruit, kilometerstanden) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op Rapporten > Voertuigen ziet kantoor per dag hoeveel van de actieve vloot verhuurd is (werkplaats en vervangend apart), welke auto's de komende maanden APK of een beurt krijgen (per week, voor de werkplaatsplanning), en — alleen admin — hoeveel km elke auto per maand reed met een lijst van verdachte standen.

**Architecture:** Drie rapporten op de rapportkit van fase 2 (`mountReport` → `/summary`, `/rows`, `/export`; tegels die precies hun lijst openen). De kit krijgt twee kleine uitbreidingen: een maximale periode (`maxDays`) en het per kijker afschermen van velden (`redact`). Bezetting rekent volledig in SQL (`generate_series` over dagen × voertuigen, één toestand per voertuig-dag). Onderhoud vooruit en kilometerstanden hergebruiken de bestaande pure logica (`forecastService`, `analyseMileage`) op één of twee SQL-queries per verzoek; de server pagineert. Rapport 8 vervangt de kaart "Kilometers per maand" op Financieel en de route `/api/reports/mileage-per-month`.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL (`sql` templates), React + TanStack Query, recharts, date-fns, vitest (server tegen de testdatabase met `agentFor`, client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` — onderdelen 6, 7, 8, de km-alinea "Rapport 8" onder K, "Gemeenschappelijke regels voor elk nieuw rapport" en de rechtenbesluiten in "Wat Kees besliste".

## Controller rulings (2026-10-25)

- The phase-2 fix wave refactors the kit so reports supply `tileWhere(tile, filter)` / `tileAmount(tile)` and the kit builds totals, count and list (with an optional per-tile period override). Phase-3 reports use that refactored API; where this plan hand-rolls FILTER totals, use the kit instead. Read server/services/reports/report-kit.ts as it is at the start of each task.
- Money reports need only the reports right (Kees). Non-money reports here keep "reports right + source right" (spec).
- Open question settled: the maintenance calendar (`/api/vehicles/service-forecast`) also switches to km per day from the km history via `mileageHistoryReadingsByVehicle()`, inside Task 3, so the calendar and report 7 never disagree. Existing service-forecast tests must keep passing apart from deliberate source changes.

## Global Constraints

- Server telt, filtert en pagineert; de browser krijgt alleen wat hij toont. Lijsten alleen via `/rows` (max 250 per pagina) en `/export` (max `REPORT_EXPORT_LIMIT = 20000`, met `truncated`).
- Een getal op een tegel = het aantal (en `amount`) van de lijst die de tegel opent; elk rapport gebruikt voor tegel en lijst dezelfde voorwaarde (`stateIs(tile)` / `tileFilter(tile)`); `expectTilesMatchRows` voor elke tegel.
- Bezet = **alleen verhuur** (`type = 'standard'`). Werkplaats (`maintenance_block`) en vervangend (`replacement`) apart, nooit als bezet.
- Km-gegevens **alleen admin**: rapport 8 volledig (`requireAdmin` op alle drie routes, kaart alleen voor `UserRole.ADMIN`); rapport 7 toont niet-admins de verwachte datum maar **geen** km-standen — de server zet `currentMileage`, `nextServiceMileage`, `kmUntilService`, `kmPerDay` op `null` voor niet-admin, de client verbergt die kolommen.
- Overige rechten: `VIEW_REPORTS`/`MANAGE_REPORTS` **én** het bronrecht. Bezetting: `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS`. Onderhoud vooruit: `VIEW_VEHICLES`/`MANAGE_VEHICLES` (zelfde als `GET /api/vehicles/service-forecast`, `server/routes.ts:699`). Zonder recht: kaart niet zichtbaar, geen request, route 403.
- Periode en voertuig uit de filterbalk (`from`/`to` kantoordatum `yyyy-mm-dd`, `vehicleId`), geparsed door `parseReportFilter`; tijdstempels naar kantoordatum met `officeDaySql`, tekstdatums met `textDaySql`.
- Bezettingsheatmap: dagtellingen in SQL met `generate_series`, nooit per voertuig in JS; periode max **366 dagen** (`OCCUPANCY_MAX_DAYS`), anders 400 `PERIOD_TOO_LONG`.
- CSV via `downloadCsv` (in `ReportDetailDialog`), afdrukken via `HtmlPreviewDialog` (`reportTableHtml`), grafieken met recharts.
- Teksten in nl, en, es, pt, it, ro, pl in `client/src/locales/*/reports.json`; `client/src/__tests__/locale-parity.test.tsx` groen (ook `_many` voor es/pt/it/pl, `_few` voor ro/pl).
- Geen schemawijziging (geen `startup-migration.js`, geen `schema-columns.json`).
- Bestaande tabbladen veranderen niet behalve: drie nieuwe kaarten op Voertuigen en het verdwijnen van de kaart "Kilometers per maand" van Financieel (spec: "gaat hierin op").

## Rulings in this plan

1. **Actieve vloot op dag d** = `(out_of_fleet_date IS NULL AND availability_status <> 'not_for_rental') OR out_of_fleet_date > d`, **plus** elk voertuig dat op d een verhuur/vervanging/werkplaatsbezoek heeft (zodat verhuurd ≤ vloot, nooit > 100 %). `created_at` en `date_in` tellen niet (de echte vloot is in september 2026 opnieuw ingelezen; `created_at` zou de historie leeg maken).
2. **Eén toestand per voertuig-dag**, voorrang werkplaats > verhuurd > vervangend > beschikbaar. Een maandhuur loopt door tijdens een werkplaatsbezoek (`getAvailableVehiclesInRange`), maar de auto staat dan in de werkplaats.
3. **Dagen van een reservering**: verhuur en vervangend `start_date` t/m `coalesce(actual_return_date, end_date, greatest(vandaag, start_date))` — zelfde regel als `rentalDays` in `buildVehicleFinancials` (`server/utils/financial-reports.ts:102`); werkplaats `start_date` t/m `coalesce(end_date, vandaag)` — zelfde als `visitDaysInPeriod` (`shared/workshop-visit.ts:63`). Niet `deleted_at`, niet `cancelled`, `vehicle_id` gevuld. "Vandaag" = kantoordatum op de server.
4. **Bezetting-tegels** (`rented`, `replacement`, `workshop`, `available`): `count` = aantal voertuigen met ≥ 1 dag in die toestand in de periode, `amount` = aantal voertuig-dagen. De lijst is per voertuig. Een klik op een dag opent dezelfde lijst met `from = to = die dag`; dan is `count` = de dagtelling.
5. **Kit**: `ReportDefinition` krijgt `maxDays?` (400 `PERIOD_TOO_LONG` op alle drie routes) en `redact?(row, viewer)` (toegepast in `/rows` en `/export`). Geen andere kitwijziging.
6. **Onderhoud vooruit gebruikt de periode als horizon**: de kaart stuurt `from = officeToday()` en `to = from + N maanden` (keuze 1/2/3/6/12, standaard 3); de filterbalkperiode geldt hier niet. `from` is ook de "vandaag" van de voorspelling (`computeServiceDue(…, today)` en `forecastService(…, from)`), zodat de test deterministisch is.
7. **Km per dag voor rapport 7 komt uit `vehicle_mileage_readings`** (niet-vervallen standen), via een nieuwe `mileageHistoryReadingsByVehicle()`; `kmPerDayFromReadings` en `forecastService` ongewijzigd. De onderhoudskalender (`serviceForecasts`, `/api/vehicles/service-forecast`) blijft op zijn huidige bron (zie open vraag).
8. **Onderhoud vooruit — welke auto's**: in de vloot (`out_of_fleet_date IS NULL`) en status niet in `settings.maintenanceExcludedStatuses` (standaard `["not_for_rental"]`); een beurt-regel alleen als `serviceDue.hasData`, `forecast.expectedDate` gevuld en de auto niet `maintenance_status = 'in_service'` (zoals `serviceForecasts`). APK-regel als `apk_date` een datum is. Achterstallig = vervaldatum < `from`, ongeacht hoe oud. Tegels `apk`, `service` (binnen `[from, to]`), `overdue`, `all`; `amount` is overal 0.
9. **Rapport 8 rekent met `analyseMileage`** (dezelfde functie als het km-paneel), zodat de km van een auto in rapport 8 gelijk is aan de samenvatting in Km-historie voor dezelfde periode. `analyseMileage` krijgt per regel `countedKm` en `countedSince`; de verdeling over maanden is naar rato van kantoordagen tussen twee standen met een gehele verdeling waarvan de som exact `drivenKm` is.
10. **Rapport 8 vervangt "Kilometers per maand" op Financieel**: kaart, route `GET /api/reports/mileage-per-month`, `buildMileagePerMonth` (+ alleen-daar-gebruikte helpers) en de locale-sleutels `financialTab.mileage.*` verdwijnen. `collectOdometerReadings` en `storage.getDamageCheckMileageReadings` blijven (nog getest in `fix-t-query-counts.test.ts`).
11. **Rapport 8-tegels**: `driven` (auto's met gereden km > 0; `amount` = km), `warnings` (de waarschuwingsstanden zelf, `amount` 0), `sparse` (auto's in de vloot met < 2 geldige standen in de periode, `amount` 0). Rijen zijn een unie met `kind: "vehicle" | "warning"`.
12. Kaarten controleren zowel het rapportrecht als het bronrecht (de pagina vraagt het rapportrecht al; dubbel is goedkoop en maakt de test "alleen bronrecht" zinvol).

## Review Focus

1. Een verhuur die later is ingeleverd dan gepland, een open huur, en een werkplaatsbezoek dat een lopende huur overlapt: de dag telt één keer, in de juiste toestand — test in Task 2 (V1, V4).
2. Een auto die halverwege de periode uit de vloot gaat, of `not_for_rental` is maar toch verhuurd werd: vloot per dag klopt en geen dag boven 100 % — test in Task 2 (V2, V3, invariant over alle dagen).
3. Een medewerker zonder adminrol die km-standen ziet via `/rows` of `/export` van rapport 7, of rapport 8 opvraagt — tests in Tasks 1, 3, 4 en de kaarttests in 6 en 7.
4. Periode "alle gegevens" (`2000-01-01`–`2050-12-31`) op Voertuigen: de heatmap vraagt niets en toont "kies een periode van maximaal een jaar"; de server weigert met 400 in plaats van 18 000 dagen × vloot te genereren — tests in Tasks 1, 2, 5.
5. Een tikfout-stand (vervallen, teruglopend of sprong) die de km per dag of de maandtotalen opblaast, en maandtotalen die door afronding niet optellen tot het tegeltotaal — tests in Tasks 3 en 4.

---

### Task 1: Rapportkit — maximale periode en afschermen per kijker

**Files:**
- Modify: `server/services/reports/report-kit.ts` (`ReportDefinition`, `mountReport`)
- Test: `server/__tests__/report-kit.test.ts` (nieuwe `describe("mountReport: maxDays en redact")`)

**Interfaces:**
- Produces:
  - `export interface ReportViewer { isAdmin: boolean }` — `isAdmin = req.user?.role === UserRole.ADMIN`.
  - `ReportDefinition` krijgt `maxDays?: number` en `redact?: (row: Row, viewer: ReportViewer) => Row`.
  - `export function periodDays(filter: ReportFilter): number` — aantal kalenderdagen inclusief beide grenzen.
  - Gedrag: als `def.maxDays` en `periodDays(filter) > def.maxDays` → 400 `{ message: "Period too long", code: "PERIOD_TOO_LONG" }` op summary, rows en export (na de filtercontrole, vóór de handler). `/rows` en `/export` geven `rows.map((r) => def.redact ? def.redact(r, viewer) : r)`.

- [ ] **Step 1: Write failing tests** (bare `express()` + `supertest`, fake definitie met tegel `a` en rijen `{ id, secret: 42, amount: 0 }`; een middleware vóór de guards zet `req.user = { role }`):

```ts
it("maxDays: 32 dagen geweigerd, 31 toegestaan", async () => {
  // def.maxDays = 31
  expect((await request(app).get("/x/summary?from=2026-01-01&to=2026-02-01")).body).toEqual({ message: "Period too long", code: "PERIOD_TOO_LONG" });
  expect((await request(app).get("/x/rows?tile=a&from=2026-01-01&to=2026-02-01")).status).toBe(400);
  expect((await request(app).get("/x/summary?from=2026-01-01&to=2026-01-31")).status).toBe(200);
});
it("redact: niet-admin krijgt secret null in rows en export, admin niet", async () => {
  // def.redact = (r, v) => (v.isAdmin ? r : { ...r, secret: null })
  expect((await asUser.get("/x/rows?tile=a")).body.rows[0].secret).toBeNull();
  expect((await asUser.get("/x/export?tile=a")).body.rows[0].secret).toBeNull();
  expect((await asAdmin.get("/x/rows?tile=a")).body.rows[0].secret).toBe(42);
});
it("periodDays telt beide grenzen", () => {
  expect(periodDays({ from: "2024-01-01", to: "2024-12-31", vehicleId: null })).toBe(366);
  expect(periodDays({ from: "2026-03-05", to: "2026-03-05", vehicleId: null })).toBe(1);
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-kit.test.ts` — Expected: FAIL (`periodDays` not exported).
- [ ] **Step 3: Implement** in `report-kit.ts` (import `UserRole` from `../../../shared/schema`).
- [ ] **Step 4: Run** the kit test plus `server/__tests__/report-fines.test.ts server/__tests__/report-extra-costs.test.ts server/__tests__/report-transport-billing.test.ts` — Expected: PASS (fase 2 ongewijzigd).
- [ ] **Step 5: Commit** `feat(rapporten): report kit max period and per-viewer redaction`.

### Task 2: Bezettings-heatmap — server (onderdeel 6)

**Files:**
- Create: `shared/reports/occupancy-report.ts`
- Create: `server/services/reports/occupancy-report.ts`
- Modify: `server/routes/reports.ts` (in `registerReportRoutes`, bij de andere `mountReport`-regels)
- Test: `server/__tests__/report-occupancy.test.ts`

**Interfaces:**
- Consumes: `mountReport`, `ReportDefinition`, `textDaySql`, `periodDays` (Task 1); `isoToday()` (`server/services/lifecycle.ts:595`).
- Produces (shared):
  - `OCCUPANCY_MAX_DAYS = 366`
  - `OCCUPANCY_TILES = ["rented", "replacement", "workshop", "available"] as const`; `type OccupancyTile`
  - `OCCUPANCY_SORTS = ["licensePlate", "amount", "pct"] as const`; `type OccupancySort`
  - `interface OccupancyDay { date: string; fleet: number; rented: number; replacement: number; workshop: number; available: number; pct: number | null }` — `pct` = `rented / fleet × 100` op 1 decimaal, `null` bij `fleet = 0`.
  - `interface OccupancyRow { vehicleId: number; licensePlate: string; brand: string; model: string; fleetDays: number; rentedDays: number; replacementDays: number; workshopDays: number; availableDays: number; pct: number | null; amount: number }` — `amount` = dagen in de toestand van de geopende tegel; `pct` = `rentedDays / fleetDays × 100`, 1 decimaal.
  - `interface OccupancySummary { tiles: Record<OccupancyTile, ReportTileTotal>; days: OccupancyDay[]; avgPct: number | null }` — `days` elke dag van de periode (ook vloot 0), oplopend; `avgPct` = verhuurde voertuig-dagen / vloot-voertuig-dagen × 100, 1 decimaal.
- Produces (server): `export const occupancyReport: ReportDefinition<OccupancyTile, OccupancySort, OccupancyRow, OccupancySummary>` met `key: "occupancy"`, `maxDays: OCCUPANCY_MAX_DAYS`, default sort `licensePlate asc`.
- Route: `mountReport(app, "/api/reports/occupancy", [hasPermission(VIEW_REPORTS, MANAGE_REPORTS), hasPermission(VIEW_RESERVATIONS, MANAGE_RESERVATIONS)], occupancyReport)`.

De kern is één SQL-fragment `vehicleDaysSql(filter, today): SQL` dat `(vehicle_id, day, state)` levert; summary (tegels: `count(DISTINCT vehicle_id) FILTER (WHERE state = …)` en `count(*) FILTER (…)`; dagen: `GROUP BY day`), `count` en `list` (`GROUP BY vehicle_id HAVING count(*) FILTER (WHERE ${stateIs(tile)}) > 0`) bouwen er allemaal op. Algoritme (rulings 1–3), `vehicleId` filtert zowel `vehicles` als `reservations`:

```sql
WITH days AS (SELECT d::date AS day FROM generate_series(:from::date, :to::date, interval '1 day') d),
spans AS (
  SELECT vehicle_id,
         CASE type WHEN 'maintenance_block' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END AS rank,
         textDay(start_date) AS s,
         CASE type WHEN 'maintenance_block' THEN coalesce(textDay(end_date), :today)
              ELSE coalesce(textDay(actual_return_date), textDay(end_date), greatest(:today, textDay(start_date))) END AS e
  FROM reservations
  WHERE deleted_at IS NULL AND status <> 'cancelled' AND vehicle_id IS NOT NULL
    AND type IN ('standard','replacement','maintenance_block') AND textDay(start_date) <= :to),
busy AS (SELECT sp.vehicle_id, d.day, min(sp.rank) AS rank FROM spans sp JOIN days d ON d.day BETWEEN sp.s AND sp.e GROUP BY 1, 2),
fleet AS (SELECT v.id AS vehicle_id, d.day FROM vehicles v JOIN days d
          ON (v.out_of_fleet_date IS NULL AND v.availability_status <> 'not_for_rental') OR textDay(v.out_of_fleet_date) > d.day)
SELECT coalesce(f.vehicle_id, b.vehicle_id) AS vehicle_id, coalesce(f.day, b.day) AS day,
       CASE b.rank WHEN 1 THEN 'workshop' WHEN 2 THEN 'rented' WHEN 3 THEN 'replacement' ELSE 'available' END AS state
FROM fleet f FULL JOIN busy b ON b.vehicle_id = f.vehicle_id AND b.day = f.day
```

- [ ] **Step 1: Write failing server tests.** Periode `P = { from: "2026-03-01", to: "2026-03-10" }`. Fixtures (`createFixtureVehicle`, `createFixtureReservation`, daarna `db.update` voor `actualReturnDate`/`deletedAt`):
  - V1: standard `2026-03-02`–`2026-03-04`, status `returned`, `actualReturnDate "2026-03-05"`; maintenance_block `2026-03-05`–`2026-03-06`; replacement `2026-03-08`–`2026-03-09`; standard `cancelled` `2026-03-10`–`2026-03-10`; standard `2026-03-01`–`2026-03-01` met `deletedAt`.
  - V2: `outOfFleetDate "2026-03-06"`, `availabilityStatus "not_for_rental"`, geen reserveringen.
  - V3: `availabilityStatus "not_for_rental"`, standard `2026-03-03`–`2026-03-03`.
  - V4: standard `2026-03-08`, `endDate: null`, status `picked_up`.

```ts
it("V1: één toestand per dag, werkplaats wint, late inlevering telt door", async () => {
  const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V1 })).body;
  expect(s.tiles).toEqual({ rented: { count: 1, amount: 3 }, replacement: { count: 1, amount: 2 }, workshop: { count: 1, amount: 2 }, available: { count: 1, amount: 3 } });
  expect(s.days).toHaveLength(10);
  expect(s.days.find((d) => d.date === "2026-03-03")).toEqual({ date: "2026-03-03", fleet: 1, rented: 1, replacement: 0, workshop: 0, available: 0, pct: 100 });
  expect(s.days.find((d) => d.date === "2026-03-05")).toMatchObject({ rented: 0, workshop: 1, pct: 0 });
  expect(s.avgPct).toBe(30);
});
it("V1-lijst per voertuig", async () => {
  const r = (await staff.get("/api/reports/occupancy/rows").query({ ...P, vehicleId: V1, tile: "rented" })).body;
  expect(r.rows[0]).toMatchObject({ vehicleId: V1, fleetDays: 10, rentedDays: 3, replacementDays: 2, workshopDays: 2, availableDays: 3, pct: 30, amount: 3 });
});
it("V2 uit de vloot vanaf 6 maart", async () => {
  const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V2 })).body;
  expect(s.tiles.available).toEqual({ count: 1, amount: 5 });
  expect(s.days.find((d) => d.date === "2026-03-06")).toMatchObject({ fleet: 0, pct: null });
});
it("V3 niet te huur maar verhuurd: telt die dag mee in de vloot", async () => {
  const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V3 })).body;
  expect(s.tiles.rented).toEqual({ count: 1, amount: 1 });
  expect(s.tiles.available).toEqual({ count: 0, amount: 0 });
});
it("V4 open huur loopt door tot vandaag", async () => {
  const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V4 })).body;
  expect(s.tiles.rented).toEqual({ count: 1, amount: 3 });
});
it("een dag apart geeft dezelfde aantallen als die dag in de periode", async () => {
  const day = (await staff.get("/api/reports/occupancy/summary").query({ from: "2026-03-03", to: "2026-03-03" })).body;
  const period = (await staff.get("/api/reports/occupancy/summary").query(P)).body;
  const d = period.days.find((x) => x.date === "2026-03-03");
  expect([day.tiles.rented.count, day.tiles.workshop.count, day.tiles.replacement.count, day.tiles.available.count]).toEqual([d.rented, d.workshop, d.replacement, d.available]);
});
it("hele vloot: elke dag telt op tot de vloot en nooit boven 100 %", async () => {
  const s = (await staff.get("/api/reports/occupancy/summary").query(P)).body;
  for (const d of s.days) {
    expect(d.rented + d.replacement + d.workshop + d.available).toBe(d.fleet);
    if (d.fleet > 0) expect(d.pct).toBe(Math.round((d.rented / d.fleet) * 1000) / 10);
  }
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/occupancy", { ...P, vehicleId: String(V1) }, OCCUPANCY_TILES));
it("periode: 366 dagen mag, 367 niet", async () => {
  expect((await staff.get("/api/reports/occupancy/summary").query({ from: "2024-01-01", to: "2024-12-31", vehicleId: V1 })).status).toBe(200);
  expect((await staff.get("/api/reports/occupancy/summary").query({ from: "2025-01-01", to: "2026-01-02" })).body.code).toBe("PERIOD_TOO_LONG");
});
it("summary is hoogstens twee SQL-statements, ongeacht de vloot", async () => {
  const { statements } = await countSql(() => occupancyReport.summary({ from: "2026-01-01", to: "2026-12-31", vehicleId: null }));
  expect(statements.length).toBeLessThanOrEqual(2);
});
it("rechten: rapport + reserveringen", async () => {
  for (const perms of [["view_reports"], ["view_reservations"]]) expect((await (await agentFor(perms)).get("/api/reports/occupancy/summary").query(P)).status).toBe(403);
  expect((await (await agentFor(["view_reports", "view_reservations"])).get("/api/reports/occupancy/rows").query({ ...P, tile: "rented" })).status).toBe(200);
});
```
(`staff = agentFor(["view_reports", "view_reservations"])`; `countSql` uit `./helpers/sqlCounter`.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-occupancy.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, `occupancyReport` (summary = 2 queries: tegels + `avgPct`, en dagen; `fillMonths` niet nodig), mount-regel.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): occupancy report (per-day fleet occupancy in SQL)`.

### Task 3: Onderhoud en APK vooruit — server (onderdeel 7)

**Files:**
- Create: `shared/reports/maintenance-outlook-report.ts`
- Create: `server/services/reports/maintenance-outlook-report.ts`
- Modify: `server/services/service-forecast.ts` (nieuwe export)
- Modify: `server/routes/reports.ts`
- Test: `server/__tests__/report-maintenance-outlook.test.ts`, `shared/reports/maintenance-outlook-report.test.ts`

**Interfaces:**
- Consumes: `computeServiceDue`, `serviceDueDefaultsFromSettings` (`shared/service-due.ts`); `kmPerDayFromReadings`, `forecastService`, `DatedReading` (`shared/service-forecast.ts`); `storage.getSettings()`; `ReportViewer`, `redact` (Task 1).
- Produces (server/services/service-forecast.ts): `export async function mileageHistoryReadingsByVehicle(vehicleIds?: number[]): Promise<Map<number, DatedReading[]>>` — één query op `vehicle_mileage_readings` met `voided_at IS NULL`, `date` = `to_char(recorded_at AT TIME ZONE officeTimeZone(), 'YYYY-MM-DD')`.
- Produces (shared):
  - `MAINTENANCE_OUTLOOK_TILES = ["apk", "service", "overdue", "all"] as const`; `MAINTENANCE_OUTLOOK_SORTS = ["dueDate", "licensePlate", "kind"] as const`
  - `MAINTENANCE_OUTLOOK_HORIZONS = [1, 2, 3, 6, 12] as const`; `DEFAULT_OUTLOOK_HORIZON = 3`
  - `isoWeekStart(ymd: string): string` — maandag van de ISO-week, `yyyy-mm-dd`.
  - `interface MaintenanceOutlookRow { id: string; vehicleId: number; licensePlate: string; brand: string; model: string; kind: "apk" | "service"; dueDate: string; weekStart: string; overdue: boolean; basis: "apk" | "km" | "months"; tooFewReadings: boolean; currentMileage: number | null; nextServiceMileage: number | null; kmUntilService: number | null; kmPerDay: number | null; amount: 0 }` — `id` = `` `${vehicleId}-${kind}` ``.
  - `interface MaintenanceOutlookSummary { tiles: Record<MaintenanceOutlookTile, ReportTileTotal>; byWeek: Array<{ weekStart: string; apk: number; service: number; items: Array<{ vehicleId: number; licensePlate: string; kind: "apk" | "service"; dueDate: string }> }> }` — alleen regels binnen `[from, to]`, weken oplopend, items op `dueDate` dan kenteken.
- Produces (server): `maintenanceOutlookReport` (`key: "maintenance-outlook"`, default sort `dueDate asc`, `redact` zet de vier km-velden op `null` als `!viewer.isAdmin`) en intern `loadOutlookRows(filter: ReportFilter): Promise<MaintenanceOutlookRow[]>` (ruling 8; "vandaag" = `filter.from`, ruling 6). `count`/`list` filteren, sorteren (`dueDate` dan `licensePlate`), en snijden in het geheugen.
- Route: `mountReport(app, "/api/reports/maintenance-outlook", [hasPermission(VIEW_REPORTS, MANAGE_REPORTS), hasPermission(VIEW_VEHICLES, MANAGE_VEHICLES)], maintenanceOutlookReport)`.

- [ ] **Step 1: Write failing tests.** Shared: `isoWeekStart("2026-11-12")` → `"2026-11-09"`, `("2026-11-09")` → `"2026-11-09"`, `("2026-11-15")` → `"2026-11-09"`, `("2027-01-01")` → `"2026-12-28"`.
  Server, `W = { from: "2026-11-02", to: "2027-02-02" }`, fixtures via `createFixtureVehicle(overrides)` en `db.insert(vehicleMileageReadings)`:
  - V7a: `apkDate "2026-11-12"`, `lastServiceDate "2026-03-01"`, `serviceIntervalMonths 12`, `serviceIntervalKm 30000`, `lastServiceMileage 50000`, `currentMileage 78000`; standen `2026-08-01T10:00Z` 70000 en `2026-10-01T10:00Z` 76000 (bron `manual`), plus **vervallen** stand `2026-09-01T10:00Z` 99999 (`voidedAt` gezet).
  - V7b: `apkDate "2026-10-20"`, geen onderhoudsgegevens.
  - V7c: `apkDate "2026-11-10"`, `outOfFleetDate "2026-10-01"`.
  - V7d: `apkDate "2027-03-01"`.

```ts
it("V7a: APK en beurt op km in verschillende weken", async () => {
  const s = (await admin.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: V7a })).body;
  expect(s.tiles).toEqual({ apk: { count: 1, amount: 0 }, service: { count: 1, amount: 0 }, overdue: { count: 0, amount: 0 }, all: { count: 2, amount: 0 } });
  expect(s.byWeek.map((w) => [w.weekStart, w.apk, w.service])).toEqual([["2026-11-09", 1, 0], ["2026-11-23", 0, 1]]);
});
it("admin ziet km, niet-admin alleen datum en basis", async () => {
  const a = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
  expect(a).toMatchObject({ dueDate: "2026-11-23", basis: "km", kmUntilService: 2000, kmPerDay: 98.4, currentMileage: 78000, nextServiceMileage: 80000 });
  for (const path of ["rows", "export"]) {
    const n = (await staff.get(`/api/reports/maintenance-outlook/${path}`).query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
    expect(n).toMatchObject({ dueDate: "2026-11-23", basis: "km", kmUntilService: null, kmPerDay: null, currentMileage: null, nextServiceMileage: null });
  }
});
it("V7b achterstallige APK", async () => {
  const s = (await staff.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: V7b })).body;
  expect(s.tiles.overdue).toEqual({ count: 1, amount: 0 });
  expect(s.byWeek).toEqual([]);
});
it("V7c uit de vloot en V7d buiten de horizon tellen niet", async () => {
  for (const v of [V7c, V7d]) expect((await staff.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: v })).body.tiles.all.count).toBe(0);
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/maintenance-outlook", { ...W, vehicleId: String(V7a) }, MAINTENANCE_OUTLOOK_TILES));
it("rechten: rapport + voertuigen", async () => {
  for (const perms of [["view_reports"], ["view_vehicles"]]) expect((await (await agentFor(perms)).get("/api/reports/maintenance-outlook/summary").query(W)).status).toBe(403);
});
```
(`staff = agentFor(["view_reports", "view_vehicles"])`, `admin = agentFor("admin")`. Rekensom: 6000 km / 61 dagen = 98,4 km/dag; 2000 km → 21 dagen → 2 nov + 21 = 23 nov; op maanden pas 1 maart 2027. Telde de vervallen 99999 mee, dan klopte 98,4 niet.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-maintenance-outlook.test.ts shared/reports/maintenance-outlook-report.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `mileageHistoryReadingsByVehicle`, shared types + `isoWeekStart`, `maintenanceOutlookReport`, mount-regel.
- [ ] **Step 4: Run** the two tests plus `server/__tests__/service-forecast*.test.ts` (als aanwezig) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): maintenance and APK outlook report`.

### Task 4: Kilometerstanden over de vloot — server (onderdeel 8)

**Files:**
- Modify: `shared/mileage-history.ts` (`AnalysedRow`, `analyseMileage`, nieuwe `drivenKmByMonth`)
- Modify: `server/services/mileage-history.ts` (exporteer `toRow`, nieuwe `officePeriodInstants`, `parseFreeKmPerDay`; `getMileageHistory` gebruikt ze, gedrag gelijk)
- Create: `shared/reports/fleet-mileage-report.ts`, `server/services/reports/fleet-mileage-report.ts`
- Modify: `server/routes/reports.ts`
- Test: `shared/mileage-history.test.ts` (nieuwe cases), `server/__tests__/report-fleet-mileage.test.ts`

**Interfaces:**
- Produces (shared/mileage-history.ts):
  - `AnalysedRow` krijgt `countedKm: number` (wat deze regel bijdraagt aan `summary.drivenKm`; 0 bij vervallen, waarschuwing of geen vorige) en `countedSince: string | null` (kantoordatum van de vorige stand; bij de basisregel de dag vóór de effectieve begindatum; `null` als `countedKm = 0`).
  - `drivenKmByMonth(rows: AnalysedRow[], zone?: string): Array<{ month: string; km: number }>` — verdeelt elke `countedKm` gelijk over de kantoordagen `(countedSince, dag van de regel]` (zelfde dag → alles in die maand), gehele getallen via cumulatief afronden (`round(km × t/n) − round(km × (t−d)/n)`), zodat de som exact `drivenKm` is; oplopend, alleen maanden met km > 0.
- Produces (server/services/mileage-history.ts): `officePeriodInstants(from: string, to: string): { start: Date; endExclusive: Date }`, `parseFreeKmPerDay(raw: unknown): number | null`, `toRow(r: VehicleMileageReading): MileageRow` (bestaand, nu geëxporteerd).
- Produces (shared/reports/fleet-mileage-report.ts):
  - `FLEET_MILEAGE_TILES = ["driven", "warnings", "sparse"] as const`; `FLEET_MILEAGE_SORTS = ["licensePlate", "km", "warnings", "date"] as const`
  - `interface FleetMileageVehicleRow { kind: "vehicle"; id: string; vehicleId: number; licensePlate: string; brand: string; model: string; drivenKm: number; avgPerMonth: number | null; freeKm: number | null; overFreeKm: number | null; readings: number; warnings: number; firstReading: string | null; lastReading: string | null; kmByMonth: Record<string, number>; amount: number }` (`id` = `` `v-${vehicleId}` ``; `amount` = `drivenKm` bij `driven`, 0 bij `sparse`)
  - `interface FleetMileageWarningRow { kind: "warning"; id: string; readingId: number; vehicleId: number; licensePlate: string; recordedAt: string; mileage: number; drivenSincePrevious: number | null; warning: "decrease" | "jump"; source: MileageSource; actorName: string | null; amount: 0 }` (`id` = `` `r-${readingId}` ``)
  - `type FleetMileageRow = FleetMileageVehicleRow | FleetMileageWarningRow`
  - `interface FleetMileageSummary { tiles: Record<FleetMileageTile, ReportTileTotal>; byMonth: Array<{ month: string; km: number; vehicles: number }> }` (`fillMonths`; `vehicles` = auto's met km > 0 die maand)
- Produces (server): `fleetMileageReport` (`key: "fleet-mileage"`, default sort `licensePlate asc`; `date` sorteert waarschuwingen op `recordedAt`, auto's op `lastReading`; `km` op `drivenKm`; `warnings` op aantal) en intern `analyseFleet(filter): Promise<{ vehicles: FleetMileageVehicleRow[]; warnings: FleetMileageWarningRow[] }>`: twee queries — standen binnen `officePeriodInstants(from, to)` voor de auto's in scope, en per auto de laatste geldige stand ervóór (`DISTINCT ON (vehicle_id) … ORDER BY vehicle_id, recorded_at DESC, id DESC`); daarna per auto `analyseMileage` met `freeKmPerDay` van de auto. Auto's in scope: `out_of_fleet_date IS NULL OR out_of_fleet_date >= from`, of met een stand in de periode; `vehicleId` filtert.
- Route: `mountReport(app, "/api/reports/fleet-mileage", [requireAdmin], fleetMileageReport)`.

- [ ] **Step 1: Write failing shared tests** (in `shared/mileage-history.test.ts`):

```ts
it("countedKm telt op tot drivenKm en maanden verdelen naar rato", () => {
  // baseline 10000 @2025-12-22T11:00Z; rows 10400 @2026-01-11, 11000 @2026-02-10, 10900 @2026-02-12 (decrease),
  // 11600 @2026-03-01, 20000 @2026-03-02 (jump); from 2026-01-01 to 2026-03-31, today 2026-10-25
  const { rows, summary } = analyseMileage(R, { from: "2026-01-01", to: "2026-03-31", freeKmPerDay: 100, baseline: B, today: "2026-10-25" });
  expect(summary.drivenKm).toBe(1400);
  expect(rows.map((r) => r.countedKm)).toEqual([200, 600, 0, 600, 0]);
  expect(rows[0].countedSince).toBe("2025-12-31");
  expect(drivenKmByMonth(rows)).toEqual([{ month: "2026-01", km: 600 }, { month: "2026-02", km: 768 }, { month: "2026-03", km: 32 }]);
});
it("drivenKmByMonth splitst 300 km over 31 jan → 1 maart als 290 + 10", () => {
  // single counted row: countedSince "2026-01-31", reading on 2026-03-01, countedKm 300
  expect(drivenKmByMonth([row])).toEqual([{ month: "2026-02", km: 290 }, { month: "2026-03", km: 10 }]);
});
```
- [ ] **Step 2: Run** `npx vitest run shared/mileage-history.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `countedKm`/`countedSince` and `drivenKmByMonth`; run `shared/mileage-history.test.ts server/__tests__/mileage-history-service.test.ts` — Expected: PASS (bestaande cases ongewijzigd).
- [ ] **Step 4: Write failing server tests.** `P = { from: "2026-01-01", to: "2026-03-31" }`. V8 (`freeKmPerDay: 100`) met de standen uit Step 1 (bronnen pickup, return, damage_check, manual, pickup, manual) plus een vervallen stand `2026-03-05T11:00Z` 99999; V8b met één stand `2026-02-01T11:00Z` 5000.

```ts
it("V8: tegels, maanden en de rij per auto", async () => {
  const s = (await admin.get("/api/reports/fleet-mileage/summary").query({ ...P, vehicleId: V8 })).body;
  expect(s.tiles).toEqual({ driven: { count: 1, amount: 1400 }, warnings: { count: 2, amount: 0 }, sparse: { count: 0, amount: 0 } });
  expect(s.byMonth).toEqual([{ month: "2026-01", km: 600, vehicles: 1 }, { month: "2026-02", km: 768, vehicles: 1 }, { month: "2026-03", km: 32, vehicles: 1 }]);
  const v = (await admin.get("/api/reports/fleet-mileage/rows").query({ ...P, vehicleId: V8, tile: "driven" })).body.rows[0];
  expect(v).toMatchObject({ kind: "vehicle", drivenKm: 1400, readings: 5, warnings: 2, avgPerMonth: 474, freeKm: 9000, overFreeKm: 0, kmByMonth: { "2026-01": 600, "2026-02": 768, "2026-03": 32 }, amount: 1400 });
});
it("zelfde km als het km-paneel van die auto", async () => {
  const panel = (await admin.get(`/api/mileage-history/${V8}`).query(P)).body;
  expect(panel.summary.drivenKm).toBe(1400);
});
it("waarschuwingen: de standen zelf, nieuwste eerst", async () => {
  const w = (await admin.get("/api/reports/fleet-mileage/rows").query({ ...P, vehicleId: V8, tile: "warnings", sort: "date", dir: "desc" })).body.rows;
  expect(w.map((r) => [r.kind, r.warning, r.mileage])).toEqual([["warning", "jump", 20000], ["warning", "decrease", 10900]]);
});
it("V8b: één stand is weinig data", async () => {
  const s = (await admin.get("/api/reports/fleet-mileage/summary").query({ ...P, vehicleId: V8b })).body;
  expect(s.tiles).toEqual({ driven: { count: 0, amount: 0 }, warnings: { count: 0, amount: 0 }, sparse: { count: 1, amount: 0 } });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(admin, "/api/reports/fleet-mileage", { ...P, vehicleId: String(V8) }, FLEET_MILEAGE_TILES));
it("alleen admin, ook met alle rapport- en voertuigrechten", async () => {
  const staff = await agentFor(["manage_reports", "manage_vehicles", "manage_reservations"]);
  for (const p of ["summary", "rows?tile=driven", "export?tile=driven"]) expect((await staff.get(`/api/reports/fleet-mileage/${p}`)).status).toBe(403);
});
```
- [ ] **Step 5: Run** `npx vitest run server/__tests__/report-fleet-mileage.test.ts` — Expected: FAIL (404).
- [ ] **Step 6: Implement** helpers in `server/services/mileage-history.ts`, shared types, `fleetMileageReport`, mount-regel.
- [ ] **Step 7: Run** the new test plus `server/__tests__/mileage-history-routes.test.ts server/__tests__/mileage-history-service.test.ts` — Expected: PASS.
- [ ] **Step 8: Commit** `feat(rapporten): fleet mileage report (admin only)`.

### Task 5: Bezettings-heatmap — kaart

**Files:**
- Create: `client/src/pages/reports/occupancy-heatmap.tsx` (presentatie + pure helpers)
- Create: `client/src/pages/reports/occupancy-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (Voertuigen-tab, direct na `<WorkshopDowntimeCard …/>`, regel ~2349)
- Modify: `client/src/locales/*/reports.json` (`reportKit.periodTooLong`, blok `fleetReports.occupancy`)
- Test: `client/src/pages/reports/__tests__/fleet-reports.test.tsx` (nieuw; Tasks 6 en 7 voegen cases toe)

**Interfaces:**
- Consumes: `OccupancySummary`, `OccupancyDay`, `OccupancyRow`, `OccupancyTile`, `OccupancySort`, `OCCUPANCY_TILES`, `OCCUPANCY_MAX_DAYS` (Task 2); `ReportTiles`, `ReportDetailDialog`, `ReportColumn` (kit).
- Produces:
  - `calendarWeeks(days: OccupancyDay[]): Array<Array<OccupancyDay | null>>` — rijen maandag–zondag, aangevuld met `null`.
  - `occupancyBucket(pct: number | null): "none" | 0 | 1 | 2 | 3 | 4` — `null` → `"none"`, 0 → 0, ≤ 25 → 1, ≤ 50 → 2, ≤ 75 → 3, anders 4.
  - `OccupancyHeatmap({ days, onSelectDay, selectedDay }: { days: OccupancyDay[]; onSelectDay: (date: string) => void; selectedDay: string | null })` — cel = `<button data-testid="occupancy-day-${date}">` met dagnummer en `pct`, kleur per bucket, oranje stip bij `workshop > 0`, blauwe stip bij `replacement > 0`, `title` met alle aantallen; onder de kalender een recharts `LineChart` (`occupancy-lines`) met per dag verhuurd %, werkplaats % en vervangend % van de vloot.
  - `OccupancyReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-occupancy-report"`; alleen als `useHasPermission(VIEW_REPORTS, MANAGE_REPORTS)` én `useHasPermission(VIEW_RESERVATIONS, MANAGE_RESERVATIONS)`. Periode langer dan `OCCUPANCY_MAX_DAYS` → geen request, tekst `reportKit.periodTooLong` (`occupancy-period-too-long`). Toont periodetegels (`testIdPrefix="occupancy"`, waarde = aantal auto's, hint = voertuig-dagen), regel gemiddelde bezetting, heatmap; klik op een dag toont dagtegels (`testIdPrefix="occupancy-day"`, aantallen uit `summary.days`) en een klik daarop opent `ReportDetailDialog` met `params { from: dag, to: dag, vehicleId? }`. Kolommen: kenteken, merk/model, vlootdagen, verhuurd, werkplaats, vervangend, beschikbaar, bezetting %. `csvSubject` `bezetting`, `reportName` `occupancy`.

- [ ] **Step 1: Write failing tests** (`useAuth` en `fetch` gemockt zoals `financial-money-reports.test.tsx`):

```ts
it("calendarWeeks: 1–10 maart 2026 (zondag t/m dinsdag) is drie weken", () => {
  const w = calendarWeeks(daysOf("2026-03-01", "2026-03-10"));
  expect(w.map((r) => r.map((d) => d?.date ?? null))).toEqual([
    [null, null, null, null, null, null, "2026-03-01"],
    ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"],
    ["2026-03-09", "2026-03-10", null, null, null, null, null],
  ]);
});
it("occupancyBucket", () => expect([null, 0, 25, 25.1, 100].map(occupancyBucket)).toEqual(["none", 0, 1, 2, 4]));
it("zonder reserveringenrecht geen kaart en geen verzoek", …); // permissions ["view_reports","view_vehicles"]
it("periode van 2000 t/m 2050: geen verzoek en de melding", …); // expect no path starting "/api/reports/occupancy", getByTestId("occupancy-period-too-long")
it("klik op een dag en dan op Verhuurd vraagt de lijst van die dag", async () => {
  // permissions ["view_reports","view_reservations"], from 2026-03-01 to 2026-03-10, summary stub with day 2026-03-03 rented 1
  await user.click(await screen.findByTestId("occupancy-day-2026-03-03"));
  expect(screen.getByTestId("occupancy-day-tile-rented-value").textContent).toBe("1");
  await user.click(screen.getByTestId("button-occupancy-day-tile-rented"));
  expect(fetchedPaths()).toContain("/api/reports/occupancy/rows?from=2026-03-03&to=2026-03-03&tile=rented&sort=licensePlate&dir=asc&page=1&pageSize=50");
});
```
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/fleet-reports.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** heatmap, card, plaatsing in `index.tsx` (`from={reportFrom} to={reportTo} vehicleId={selectedVehicle}`), sleutels `fleetReports.occupancy.{title, description, tiles.*, tileHint, avgPct, dayTitle, legend.{rented, workshop, replacement, none}, lines.*, weekdays.*, columns.*, csvSubject}` en `reportKit.periodTooLong` in 7 talen.
- [ ] **Step 4: Run** the test, `client/src/__tests__/locale-parity.test.tsx`, `client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): occupancy heatmap on Voertuigen`.

### Task 6: Onderhoud en APK vooruit — kaart

**Files:**
- Create: `client/src/pages/reports/maintenance-outlook-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (na de bezettingskaart)
- Modify: `client/src/locales/*/reports.json` (`fleetReports.outlook`)
- Test: cases in `client/src/pages/reports/__tests__/fleet-reports.test.tsx`

**Interfaces:**
- Consumes: Task 3 shared types, `MAINTENANCE_OUTLOOK_HORIZONS`, `DEFAULT_OUTLOOK_HORIZON`; `officeToday()` (`client/src/lib/office-date.ts:14`); `addMonths`, `getISOWeek` (date-fns).
- Produces: `MaintenanceOutlookCard({ vehicleId }: { vehicleId?: string })` — `data-testid="card-maintenance-outlook"`; alleen met rapportrecht én `VIEW_VEHICLES`/`MANAGE_VEHICLES`. Select `select-outlook-horizon` (1/2/3/6/12 maanden, standaard 3). Params `{ from: officeToday(), to: format(addMonths(from, horizon), "yyyy-MM-dd"), vehicleId? }`. Tegels (`testIdPrefix="outlook"`, waarde = aantal). Blok "Achterstallig" als `tiles.overdue.count > 0` (knop opent tegel `overdue`). Weektabel: per `byWeek`-regel `data-testid="outlook-week-${weekStart}"` met "Week {{week}} · {{from}} – {{to}}", aantallen APK/beurt en de kentekens (badge APK/Beurt + datum). Dialoogkolommen: kenteken, merk/model, soort, vervaldatum, basis (APK / op km / op maanden; "te weinig km-standen" als `tooFewReadings` en basis `months`), en **alleen voor admin**: huidige stand, km tot beurt, km per dag. `csvSubject` `onderhoud-vooruit`.

- [ ] **Step 1: Write failing tests** (`vi.mock("@/lib/office-date", () => ({ officeToday: () => "2026-11-02" }))`):
  - permissions `["view_reports","view_reservations"]` ⇒ geen `card-maintenance-outlook`, geen verzoek naar `/api/reports/maintenance-outlook`.
  - `["view_reports","view_vehicles"]` ⇒ verzoek `/api/reports/maintenance-outlook/summary?from=2026-11-02&to=2027-02-02`; horizon op 6 ⇒ `…&to=2027-05-02`.
  - summary-stub met week `2026-11-09` en item `AB12CD` apk ⇒ `outlook-week-2026-11-09` bevat `formatLicensePlate("AB12CD")` en "Week 46".
  - niet-admin opent tegel `service` ⇒ dialoogkoppen bevatten niet "Km tot beurt"; met `role: "admin"` wel, en de cel toont `2.000`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** card, plaatsing, sleutels `fleetReports.outlook.{title, description, horizon, horizonOption_one/_other (+_few/_many), tiles.*, overdue, weekLabel, noWeeks, kinds.{apk,service}, basis.{apk,km,months}, tooFewReadings, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** test + parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): maintenance and APK outlook on Voertuigen`.

### Task 7: Kilometerstanden — kaart, en "Kilometers per maand" op Financieel vervalt

**Files:**
- Create: `client/src/pages/reports/fleet-mileage-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (na de onderhoudskaart, vóór de bestaande Km-historie-kaart; binnen `isAdmin`)
- Modify: `client/src/pages/reports/financial-tab.tsx` (kaart `card-mileage-per-month`, de query, `MileagePerMonthReport`, `mileageChart`/`mileageRows`, ongebruikte imports weg)
- Modify: `server/routes/reports.ts:223-242` (route `GET /api/reports/mileage-per-month` weg; import `buildMileagePerMonth` weg)
- Modify: `server/utils/financial-reports.ts` (`buildMileagePerMonth`, `MileagePerMonthReport`, `MileageMonth`, `VehicleMileageRow` en helpers die alleen daar gebruikt worden weg; `collectOdometerReadings` blijft)
- Modify: `server/database-storage.ts:7120-7125` (commentaar verwijst niet meer naar de route)
- Modify: `client/src/locales/*/reports.json` (`financialTab.mileage.*` weg; blok `fleetReports.mileage` erbij)
- Modify: `server/__tests__/mileage-history-routes.test.ts:60-65`, `client/src/components/vehicles/__tests__/mileage-history-panel.test.tsx:82,283-300`
- Test: cases in `client/src/pages/reports/__tests__/fleet-reports.test.tsx`

**Interfaces:**
- Consumes: Task 4 shared types; `ReportMonthChart`, `ReportTiles`, `ReportDetailDialog`; `vehicles:mileageHistory.sources.*` en `vehicles:mileageHistory.warningTypes.*` voor bron- en waarschuwingslabels.
- Produces: `FleetMileageReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-fleet-mileage-report"`; rendert en vraagt alleen als `user.role === UserRole.ADMIN`. Tegels (`testIdPrefix="fleet-mileage"`: `driven` waarde = aantal auto's, hint = km; `warnings`; `sparse`), `ReportMonthChart` (reeks `km`, geen geld; `testId="fleet-mileage-month-chart"`), dialoog per tegel. Kolommen bij `driven`/`sparse`: kenteken, merk/model, km, gemiddeld per maand, vrije km, boven vrije km, standen, waarschuwingen, eerste, laatste, plus één kolom per maand uit `summary.byMonth` (label `MMM yyyy`, waarde `row.kmByMonth[month] ?? 0`). Bij `warnings`: datum/tijd, kenteken, stand, km sinds vorige, waarschuwing, bron, door wie. `csvSubject` `kilometerstanden-vloot`.

- [ ] **Step 1: Write failing tests:**
  - in `fleet-reports.test.tsx`: role `user` met alle rechten ⇒ geen `card-fleet-mileage-report`, geen verzoek naar `/api/reports/fleet-mileage`; role `admin` ⇒ `fleet-mileage-tile-driven-value` toont `1`, klik ⇒ dialoog met kolomkop "jan 2026" en cel `600`; CSV ⇒ `downloadCsv` header eindigt op de drie maandlabels.
  - `mileage-history-panel.test.tsx`: de describe "Financial tab: km per month is admin only" wordt "Financieel heeft geen km-kaart meer": voor admin wordt `/api/reports/mileage-per-month` niet gevraagd en is `card-mileage-per-month` er niet.
  - `mileage-history-routes.test.ts`: `GET /api/reports/mileage-per-month` geeft voor admin 404.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/fleet-reports.test.tsx client/src/components/vehicles/__tests__/mileage-history-panel.test.tsx server/__tests__/mileage-history-routes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** card, plaatsing, verwijderingen, sleutels `fleetReports.mileage.{title, description, tiles.*, tileHint, byMonth, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** de drie tests, `client/src/pages/reports/__tests__/financial-money-reports.test.tsx`, `server/__tests__/fix-t-query-counts.test.ts`, parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): fleet mileage report on Voertuigen replaces km per month on Financieel`.

### Task 8: Afronden

- [ ] Run `npx vitest run server/__tests__/report-kit.test.ts server/__tests__/report-occupancy.test.ts server/__tests__/report-maintenance-outlook.test.ts server/__tests__/report-fleet-mileage.test.ts server/__tests__/report-fines.test.ts server/__tests__/report-extra-costs.test.ts server/__tests__/report-transport-billing.test.ts server/__tests__/mileage-history-routes.test.ts server/__tests__/mileage-history-service.test.ts server/__tests__/fix-i-permission-matrix.test.ts shared/mileage-history.test.ts shared/reports` en `npx vitest run client/src/components/reports client/src/components/vehicles client/src/pages/reports client/src/__tests__/locale-parity.test.tsx` — Expected: PASS (bekende rode tests op `main` buiten beschouwing). `npx tsc --noEmit -p .` — geen uitvoer.
- [ ] In de browser (dev server `start`), als admin op Rapporten > Voertuigen met periode 1 januari – vandaag: heatmap met weken als rijen, klik op een dag → dagtegels → lijst met hetzelfde aantal; onderhoud vooruit per week met km-kolommen; kilometerstanden met maandgrafiek en waarschuwingen; voertuigfilter beperkt alle drie; periode "alle gegevens" toont de melding bij de heatmap. Op Financieel geen km-kaart meer. Als medewerker met `view_reports` + `view_vehicles` (zonder reserveringen): geen heatmap, wel onderhoud vooruit zonder km-kolommen, geen kilometerstanden.
- [ ] Handleiding (`docs/gebruikershandleiding`) alleen bijwerken als een pagina Rapporten > Voertuigen of de km-kaart op Financieel beschrijft.
- [ ] Kees vragen voor merge naar `main` en push (geen migratie in deze fase).

# Rapporten fase 6: rapportbouwer uitbreiden (nieuwe bronnen en grafiek) en afronding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De rapportbouwer krijgt vijf nieuwe bronnen (bekeuringen, transporten, werkplaatsbezoeken, schadechecks, km-historie alleen voor beheerders), elk achter het rapportrecht plus het recht van het onderdeel; een gegroepeerd resultaat krijgt een staaf-, lijn- of taartgrafiek naar keuze. Daarna één afrondingsronde over alle rapporten: één rechtentest over alle `/api/reports/*`-rapporten, een recharts-stub tegen ruis in de clienttests en een bijgewerkte handleiding en acceptatiechecklist.

**Architecture:** De bouwer blijft één bron per rapport, zonder joins. Elke bron staat in `DATA_SOURCES` (`shared/report-builder-config.ts`) met een `access`-regel; één gedeelde functie `canUseReportSource` beslist op de server (route) en in de client (welke bronnen je ziet). `executeReport` krijgt een tabel `REPORT_SOURCE_TABLES` met per bron de Drizzle-tabel, de `FROM` en vaste voorwaarden (werkplaatsbezoeken = `reservations AS workshop_visits` met `type = 'maintenance_block'`). Groeperen wordt in de bouwer instelbaar (één veld, desgewenst per maand) met een berekening per kolom; de grafiek leest het resultaat dat de server al teruggeeft.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL (`sql`-templates), React + TanStack Query, recharts, Radix Select, vitest (server tegen de testdatabase met `agentFor`, `fileParallelism: false`; client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` — onderdeel 15, "Wat Kees besliste" (Km-rechten, Overige rechten, Rapportbouwer), "Gemeenschappelijke regels" en "Anti-doelen" (km-historie alleen admin).

## Besluiten van Kees en de controller (2026-10-25)

- Rechten per nieuwe bron = rapportrecht (`VIEW_REPORTS`/`MANAGE_REPORTS`, zoals nu op `POST /api/reports/execute`) **plus** het recht van het onderdeel: bekeuringen → recht om bekeuringen te bekijken; transporten → de rechten van `GET /api/transports`; werkplaatsbezoeken → het recht dat werkplaatsbezoeken bewaakt; schadechecks → schadecheck bekijken; km-historie → alleen admin. Op de server afgedwongen; de client biedt een bron zonder recht niet aan.
- Laatste taak: rechtentest over alle via `mountReport` gemounte rapporten (403 op `/summary`, `/rows` en `/export` zonder het juiste recht, 401 zonder login), recharts-stub in de jsdom-setup, handleiding 21 en checklist 22 bijwerken in eenvoudig Nederlands.

## Controller rulings (2026-10-25)

- Open questions settled as the plan recommends: workshop-visit right = VIEW/MANAGE_RESERVATIONS or MANAGE_MAINTENANCE; grouping per month only; chart type not saved; damage-check mileage visible with the damage-check right (only km history is admin-only); multi-source ticking cleaned up later; manual screenshots regenerated after merge (not in this phase).
- Kit/state as of phase 5: instantSql, instantIsoSql and officeDaySql in server/services/reports/report-kit.ts (naive = UTC); every new source query that compares or returns timestamps uses them.
- Task 6a must include all 13 mounted reports; read server/routes/reports.ts at the start of the task for the exact list and guards.

## Global Constraints

- Eén bron per rapport, geen joins (spec: "keep that"). Vaste voorwaarden van een bron (prullenbak, vervallen) mogen een subquery zijn, maar nooit een kolom uit een andere tabel tonen.
- Rechten (exact, uit de bronroutes):
  - bekeuringen: `hasPermission(VIEW_FINES, MANAGE_FINES)` (= `canView`, `server/routes/fines.ts:34`, op `GET /api/fines` `:206`);
  - transporten: `VIEW_VEHICLES, MANAGE_VEHICLES, VIEW_RESERVATIONS, MANAGE_RESERVATIONS` (= `GET /api/transports`, `server/routes.ts:9443`);
  - werkplaatsbezoeken: `VIEW_RESERVATIONS, MANAGE_RESERVATIONS, MANAGE_MAINTENANCE` (= `GET /api/reservations/upcoming-maintenance`, `server/routes.ts:3350`, de enige leesroute die alleen werkplaatsbezoeken geeft);
  - schadechecks: `VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS` (= `GET /api/interactive-damage-checks`);
  - km-historie: rol `admin` (zoals `requireAdmin`; spec "Km-rechten: Alles alleen admin").
  - Klanten en chauffeurs houden hun regel (`VIEW_CUSTOMERS`/`MANAGE_CUSTOMERS`, code `CUSTOMER_RIGHT_REQUIRED`, `server/__tests__/security-review-2026-10-18-low.test.ts:31-44` blijft groen).
- `executeReport` houdt `LIMIT 1000`, gebonden parameters, en `ReportValidationError(message, code, field)`; de route geeft dan 400 met `code` en `field`.
- De test "elk aangeboden veld van elke bron is opvraagbaar" (`server/__tests__/report-builder-fields.test.ts`) dekt automatisch de nieuwe bronnen.
- Grafiek met recharts, zoals `ReportMonthChart`/`ReportTopChart`; alleen bij een gegroepeerd resultaat; geen grafiek (en geen keuzelijst) bij een niet-gegroepeerd resultaat.
- Teksten in nl, en, es, pt, it, ro, pl (`client/src/locales/*/reports.json`); `client/src/__tests__/locale-parity.test.tsx` groen (`_many` voor es/pt/it/pl, `_few` voor ro/pl).
- Geen schemawijziging (geen `startup-migration.js`, geen `schema-columns.json`). Geen wijziging aan de bestaande rapportkaarten.
- Handleiding: korte zinnen, gewone woorden, knopnamen vet zoals ze in de app staan; Kees wil eenvoudig Nederlands.

## Rulings in dit plan

1. **Bron-id's en tabellen.** `fines` (tabel `fines`), `transports` (`vehicle_transports`), `workshop_visits` (virtuele tabel `workshop_visits` = `reservations AS workshop_visits`), `damage_checks` (`interactive_damage_checks`), `mileage_readings` (`vehicle_mileage_readings`). De virtuele naam is nodig omdat `getField(table, …)` op tabelnaam zoekt: met `table: 'reservations'` zou het de velden van de bron Reserveringen vinden.
2. **Werkplaatsbezoek** = `workshop_visits.type = 'maintenance_block' AND workshop_visits.deleted_at IS NULL` (zoals `/api/reports/workshop-downtime`, `server/routes/reports.ts:228`). Gewone verhuur en vervangers komen er nooit in.
3. **Schadechecks bij een reservering in de prullenbak tellen niet** (zelfde regel als het Kantoor-rapport, fase 5 ruling 14): `NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = interactive_damage_checks.reservation_id AND r.deleted_at IS NOT NULL)`. Een check zonder reservering telt wel.
4. **Vervallen km-standen tellen standaard niet** (zoals de km-historie: "vervallen regels tellen niet mee"): `voided_at IS NULL`, **tenzij** het rapport een filter op `vehicle_mileage_readings.voidedAt` heeft; dan beslist dat filter.
5. **Bekeuringen en transporten** hebben geen prullenbak; alle rijen, ook vervallen/geannuleerd (filter op Status kan).
6. **Velden** (geen grote of gevoelige kolommen: geen schademarkers, handtekeningen, brieven, notities). Volgorde = volgorde in de lijst hieronder (Task 1).
7. **Km-stand in schadechecks** (`interactive_damage_checks.mileage`) blijft voor iedereen met schadecheckrecht, net als `vehicles.currentMileage` en `reservations.pickupMileage` nu; alleen de bron km-historie is admin-only (zie open vragen).
8. **Rechten voor elke genoemde bron.** De route controleert elke id in `dataSources`, niet alleen de eerste (`["vehicles","mileage_readings"]` van een niet-admin → 403). Onbekende id's laat de route door; `executeReport` geeft dan de bestaande 400.
9. **Foutcode**: klanten/chauffeurs houden `CUSTOMER_RIGHT_REQUIRED`; alle andere bronnen `REPORT_SOURCE_RIGHT_REQUIRED`, met `source: <id>` in de body.
10. **Opgeslagen rapporten**: `GET /api/reports/saved` laat rapporten weg waarvan je een bron niet mag gebruiken; `POST /api/reports/saved` met zo'n bron → 403 (zelfde codes). Uitvoeren via `/execute` weigert al.
11. **Alle velden aanklikbaar**: de bouwer toont alle velden van een bron (nu `fields.slice(0, 5)` + "+8 meer..."). Zonder dit zijn de nieuwe velden (bijv. Vervallen op, Totaalbedrag) niet te kiezen. Sleutel `reportBuilderPage.moreFieldsCount` verdwijnt in alle talen.
12. **Groeperen in de bouwer**: één groepeerveld (keuzelijst "Groeperen op", met "Niet groeperen"). Kies je een veld, dan komt het als kolom bij als het er nog niet staat. Bij een datumveld kan "Per maand". Elke andere kolom krijgt een keuzelijst "Berekening": Geen, Som, Gemiddelde, Kleinste, Grootste (alleen `aggregatable`), Aantal, Aantal verschillend (altijd). De kolom van de groep heeft geen berekening. Opgeslagen rapporten met meer groepeervelden blijven werken (server accepteert een lijst).
13. **Per maand** = `ReportGrouping.period = "month"`; server: tijdstempel → `to_char(officeDaySql(kolom), 'YYYY-MM')` (kantoortijdzone), tekstdatum → `to_char(textDaySql(kolom), 'YYYY-MM')` (onleesbaar → NULL). De kolom met hetzelfde veld zonder berekening toont dezelfde maandwaarde. Alleen voor velden met `type: 'date'`, anders 400 `REPORT_PERIOD_NOT_DATE`; een andere waarde dan `"month"` → 400 `REPORT_PERIOD_UNKNOWN`.
14. **Groepering moet kloppen**: is er een groepering of een kolom met berekening, dan moet elke kolom zonder berekening in de groepering staan; anders 400 `REPORT_COLUMN_NOT_GROUPED` met `field` (`"<tabel>.<veld>"`). Nu geeft zo'n rapport een 500.
15. **Volgorde**: bij een groepering sorteert de server op de groepeervelden, oplopend, `NULLS LAST` (nodig voor een lijngrafiek). Zonder groepering geen `ORDER BY` (zoals nu).
16. **Maand in tabel, afdruk en CSV**: een datumkolom met waarde `yyyy-mm` toont `formatDateNl("yyyy-mm-01T12:00:00", "MMM yyyy")` op scherm en afdruk, en `mm-jjjj` (`"02-2019"`) in de CSV.
17. **Grafiek**: alleen als het resultaat gegroepeerd was (`groupBy.length > 0`). Categorie = de groepswaarde(n) zoals de tabel ze toont, samengevoegd met `" · "`; `null` → `"-"`. Reeksen = kolommen met berekening, label `"<veldlabel> (<berekening>)"`, waarde `Number(...)`, niet-getal → 0. Gegroepeerd zonder berekening: alleen de tekst `reportBuilderPage.chart.needsAggregate`. Staaf en lijn: hoogstens de eerste 50 groepen (`BUILDER_CHART_MAX_GROUPS`), met melding. Taart: alleen de eerste reeks, alleen waarden > 0, de 10 grootste plus "Overig" (som van de rest). Standaard staaf. Kleuren: `#3b82f6`, `#16a34a`, `#f59e0b`, `#dc2626`, `#8b5cf6`, `#0ea5e9`, `#9ca3af` (rondgaand).
18. **Grafiekkeuze wordt niet opgeslagen** in het rapport (YAGNI; open vraag).
19. **Meerdere bronnen aanvinken** blijft zoals het is (de server leest de eerste); niet in deze fase (open vraag).
20. **Afronding a**: één testbestand met per rapport de rechtensets die geweigerd moeten worden; een routewandeling (zoals `collectRoutes` in `fix-i-permission-matrix.test.ts:73`) zorgt dat een later gemount rapport zonder regel in de lijst de test rood maakt.
21. **Afronding b**: `vi.mock("recharts")` in `client/src/__tests__/setup-jsdom.ts` vervangt alleen `ResponsiveContainer` door een vaste maat (800 × 400) en laat de echte grafieken tekenen; bestanden met een eigen `vi.mock("recharts")` (zes p7a-tests) houden hun eigen mock.
22. **Afronding c**: hoofdstuk 21 krijgt nieuwe paragrafen en hernummert Rechten en In het kort (21.9, 21.10); niemand buiten 21 en 22 verwijst naar 21.x (gecontroleerd). Schermafbeeldingen worden niet opnieuw gemaakt in deze fase; tekst en bijschriften die niet meer kloppen worden aangepast (open vraag).

## Review Focus

1. Een medewerker zonder adminrol stuurt zelf `dataSources: ["vehicles", "mileage_readings"]`, of draait een km-rapport dat een beheerder opsloeg: krijgt 403 en ziet het opgeslagen rapport niet in de lijst — tests in Task 2.
2. Een gegroepeerd rapport met een kolom zonder berekening die niet in de groep staat, of `Aantal` zonder groep naast een gewone kolom: duidelijke 400 met veldnaam, geen 500 — test in Task 3.
3. Een bekeuring om 23:30 UTC op 31 januari valt per maand in februari (kantoortijd) — test in Task 3.
4. Werkplaatsbezoeken tonen nooit gewone verhuur of een bezoek uit de prullenbak; schadechecks bij een reservering in de prullenbak en vervallen km-standen tellen niet mee, tenzij je op "Vervallen op" filtert — test in Task 1.
5. Grafiek met een lege groepswaarde, meer dan 10 taartstukken, bedragen als tekst (`"80.00"`) of meer dan 50 groepen: geen lege of kapotte grafiek — tests in Task 5.

---

### Task 1: Vijf nieuwe bronnen in de whitelist (server)

**Files:**
- Modify: `shared/report-builder-config.ts` (types, `DATA_SOURCES`, `canUseReportSource`)
- Modify: `server/database-storage.ts:6549-6750` (`executeReport`: `REPORT_SOURCE_TABLES` in plaats van `reportTables`)
- Modify: `server/__tests__/report-builder-fields.test.ts` (bronlijst vastleggen)
- Test: `server/__tests__/report-builder-sources.test.ts` (nieuw; Tasks 2 en 3 voegen cases toe)

**Interfaces:**
- Produces (shared):
  - `export type ReportSourceAccess = { adminOnly: true } | { anyOf: readonly string[] }`
  - `DataSource` krijgt `access?: ReportSourceAccess`; `ReportGrouping` krijgt `period?: "month"` (gebruikt vanaf Task 3).
  - `export interface ReportSourceUser { role?: string | null; permissions?: readonly string[] | null }`
  - `export function canUseReportSource(user: ReportSourceUser | null | undefined, source: DataSource): boolean` — geen `access` → `true`; `role === UserRole.ADMIN` → `true`; `adminOnly` → `false`; `anyOf` → minstens één in `permissions`. Controleert het rapportrecht **niet** (dat doet de route).
  - `customers` en `drivers` krijgen `access: { anyOf: [VIEW_CUSTOMERS, MANAGE_CUSTOMERS] }`; `vehicles`, `reservations`, `expenses` geen `access`.
  - Vijf nieuwe bronnen achteraan `DATA_SOURCES`, in deze volgorde, met Engelse `label`s (fallback) en operators/`aggregatable` volgens het type (getal → `numberOperators`, `aggregatable: true`; tekst → `textOperators`; datum → `dateOperators`; ja/nee → `booleanOperators`):
    - `fines` / `fines`, `access: { anyOf: [VIEW_FINES, MANAGE_FINES] }`: `id` n, `licensePlate` t, `vehicleId` n, `offenceAt` d, `receivedAt` d, `reference` t, `description` t, `amount` n, `adminFee` n, `totalAmount` n, `status` t, `source` t, `customerId` n, `reservationId` n, `driverId` n, `linkedAt` d.
    - `transports` / `vehicle_transports`, `access: { anyOf: [VIEW_VEHICLES, MANAGE_VEHICLES, VIEW_RESERVATIONS, MANAGE_RESERVATIONS] }`: `id` n, `vehicleId` n, `isExternalVehicle` b, `externalLicensePlate` t, `transportType` t, `status` t, `scheduledDate` d, `completedDate` d, `driverName` t, `distanceKm` n, `tollCost` n, `billable` b, `billableAmount` n, `invoiced` b, `invoicedDate` d, `isBreakdownOrMaintenance` b, `customerId` n, `reservationId` n.
    - `workshop_visits` / `workshop_visits`, `access: { anyOf: [VIEW_RESERVATIONS, MANAGE_RESERVATIONS, MANAGE_MAINTENANCE] }`: `id` n, `vehicleId` n, `startDate` d, `endDate` d, `status` t, `maintenanceStatus` t, `maintenanceCategory` t, `maintenanceType` t, `maintenanceDuration` n, `noInvoiceExpected` b, `affectedRentalId` n.
    - `damage_checks` / `interactive_damage_checks`, `access: { anyOf: [VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS] }`: `id` n, `vehicleId` n, `reservationId` n, `checkType` t, `checkDate` d, `mileage` n, `fuelLevel` t, `completedBy` t.
    - `mileage_readings` / `vehicle_mileage_readings`, `access: { adminOnly: true }`: `id` n, `vehicleId` n, `mileage` n, `recordedAt` d, `source` t, `actorName` t, `voidedAt` d.
- Produces (server, in `database-storage.ts`, module-niveau): `interface ReportSourceTable { table: Record<string, any>; from: SQL; baseWhere?: (filters: unknown[]) => SQL[] }` en `const REPORT_SOURCE_TABLES: Record<string, ReportSourceTable>` op config-tabelnaam: de vijf bestaande (`reservations` met `deleted_at IS NULL` als `baseWhere`, verhuisd uit `:6732-6735`) en de vijf nieuwe met rulings 2-4. `identFor` blijft `"<config-tabel>"."<kolom>"`, dus `from` voor werkplaats = `sql\`reservations AS workshop_visits\``.

- [ ] **Step 1: Write failing tests.**
  - `report-builder-fields.test.ts`, nieuwe `it("de bouwer biedt precies deze bronnen")`: `expect(DATA_SOURCES.map((s) => s.id)).toEqual(["vehicles", "customers", "reservations", "expenses", "drivers", "fines", "transports", "workshop_visits", "damage_checks", "mileage_readings"])`. De bestaande lus "elk aangeboden veld van elke bron is opvraagbaar" (admin) loopt daarmee over alle nieuwe velden.
  - `report-builder-sources.test.ts` (`admin = agentFor("admin")`; voertuig V via `createFixtureVehicle()`, klant K; alle rijen direct met `db.insert`; in `afterAll` eerst schadechecks, bekeuringen, km-standen, transporten op id verwijderen, dan `cleanupFixtures()` en `cleanupFixtureUsers()`). Helper `run(source, table, columns, filters = [])` stuurt altijd ook het filter `{ table, field: "vehicleId", operator: "equals", value: V }`.
    - Reserveringen: S (`type "standard"`), B1 (`"maintenance_block"`), B2 (`"maintenance_block"`, daarna `deletedAt` gezet), T (`"standard"`, daarna `deletedAt`).
    - Schadechecks: D1 bij S, D2 bij T, D3 zonder reservering (alle drie op V, `checkType "return"`).
    - Km-standen op V: M1 10000, M2 10500, M3 10400 met `voidedAt` gezet (`source "manual"`).
    - Transporten op V: X1 `delivery` `scheduled` `"2019-03-01"`, X2 `swap` `completed` `"2019-03-02"`.

```ts
it("werkplaatsbezoeken: alleen bezoeken, niet uit de prullenbak", async () => {
  const res = await run("workshop_visits", "workshop_visits", [{ table: "workshop_visits", field: "id" }]);
  expect(res.status).toBe(200);
  expect(res.body).toEqual([{ id: B1 }]);
});
it("schadechecks bij een reservering in de prullenbak tellen niet", async () => {
  const res = await run("damage_checks", "interactive_damage_checks", [{ table: "interactive_damage_checks", field: "id" }]);
  expect(res.body.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual([D1, D3]);
});
it("vervallen km-standen tellen niet, tenzij je erop filtert", async () => {
  const cols = [{ table: "vehicle_mileage_readings", field: "id", aggregation: "COUNT" }, { table: "vehicle_mileage_readings", field: "mileage", aggregation: "SUM" }];
  const all = await run("mileage_readings", "vehicle_mileage_readings", cols);
  expect(Number(all.body[0].id)).toBe(2);
  expect(Number(all.body[0].mileage)).toBe(20500);
  const voided = await run("mileage_readings", "vehicle_mileage_readings", cols.slice(0, 1),
    [{ table: "vehicle_mileage_readings", field: "voidedAt", operator: "is_not_null", value: null }]);
  expect(Number(voided.body[0].id)).toBe(1);
});
it("transporten: alle soorten en statussen", async () => {
  const res = await run("transports", "vehicle_transports", [{ table: "vehicle_transports", field: "id", aggregation: "COUNT" }]);
  expect(Number(res.body[0].id)).toBe(2);
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-fields.test.ts server/__tests__/report-builder-sources.test.ts` — Expected: FAIL (`Unknown data source: workshop_visits` → 400, bronlijst ongelijk).
- [ ] **Step 3: Implement** de config (types, vijf bronnen, `canUseReportSource`) en `REPORT_SOURCE_TABLES` in `executeReport`: `FROM ${source.from}`, `whereParts` = gebruikersfilters + `source.baseWhere?.(filters) ?? []`. `canUseReportSource` wordt in deze task nog niet aangeroepen (Task 2).
- [ ] **Step 4: Run** de twee tests plus `server/__tests__/security-review-2026-10-18-low.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report builder sources for fines, transports, workshop visits, damage checks, km history`.

### Task 2: Rechten per bron (route, opgeslagen rapporten)

**Files:**
- Modify: `server/routes/reports.ts:9-21` (`mayReportOn` → `deniedReportSource`), `:121-153` (`GET`/`POST /api/reports/saved`), `:169-189` (`POST /api/reports/execute`)
- Test: `server/__tests__/report-builder-sources.test.ts` (cases erbij)

**Interfaces:**
- Consumes: `canUseReportSource`, `getDataSource`, `DataSource` (Task 1).
- Produces (server, lokaal in `reports.ts`):
  - `function deniedReportSource(user: Express.User | undefined, dataSources: unknown): DataSource | null` — eerste bekende bron in de lijst die `canUseReportSource` weigert; `null` als alles mag of de lijst geen array is.
  - `function sourceDeniedBody(source: DataSource): { message: string; code: "CUSTOMER_RIGHT_REQUIRED" | "REPORT_SOURCE_RIGHT_REQUIRED"; source: string }` — `CUSTOMER_RIGHT_REQUIRED` als `source.table` `customers` of `drivers` is (bestaande `message` blijft), anders `"A report on this source needs the right of that part of the app"` met `REPORT_SOURCE_RIGHT_REQUIRED`.
  - `POST /api/reports/execute` en `POST /api/reports/saved`: `deniedReportSource(req.user, config.dataSources)` → 403 met die body (bij `/saved` vóór het opslaan). `GET /api/reports/saved`: rapporten weglaten waarvoor `deniedReportSource(req.user, r.configuration?.dataSources ?? [r.dataSource])` niet `null` is.

- [ ] **Step 1: Write failing tests** in `report-builder-sources.test.ts`. `col = (table, field) => ({ name: "t", dataSources: [id], columns: [{ table, field }], filters: [] })`; per regel een eigen `agentFor`.

```ts
it.each([
  ["fines", "fines", "status", ["view_reports"], 403],
  ["fines", "fines", "status", ["view_fines"], 403],               // geen rapportrecht
  ["fines", "fines", "status", ["view_reports", "view_fines"], 200],
  ["transports", "vehicle_transports", "status", ["view_reports"], 403],
  ["transports", "vehicle_transports", "status", ["view_reports", "view_reservations"], 200],
  ["transports", "vehicle_transports", "status", ["manage_reports", "view_vehicles"], 200],
  ["workshop_visits", "workshop_visits", "status", ["view_reports"], 403],
  ["workshop_visits", "workshop_visits", "status", ["view_reports", "manage_maintenance"], 200],
  ["workshop_visits", "workshop_visits", "status", ["view_reports", "view_reservations"], 200],
  ["damage_checks", "interactive_damage_checks", "checkType", ["view_reports"], 403],
  ["damage_checks", "interactive_damage_checks", "checkType", ["view_reports", "view_damage_checks"], 200],
  ["mileage_readings", "vehicle_mileage_readings", "mileage", ["view_reports", "manage_reports", "view_vehicles", "manage_vehicles"], 403],
  ["mileage_readings", "vehicle_mileage_readings", "mileage", "admin", 200],
])("rechten: %s met %j → %i", async (id, table, field, perms, status) => {
  const agent = await agentFor(perms as any);
  const res = await agent.post("/api/reports/execute").send({ name: "t", dataSources: [id], columns: [{ table, field }], filters: [] });
  expect(res.status).toBe(status);
  if (status === 403 && (perms as string[]).some((p) => p.endsWith("_reports"))) {
    expect(res.body).toMatchObject({ code: "REPORT_SOURCE_RIGHT_REQUIRED", source: id });
  }
});
it("elke genoemde bron telt, niet alleen de eerste", async () => {
  const agent = await agentFor(["view_reports", "view_vehicles"]);
  const res = await agent.post("/api/reports/execute").send({ name: "t", dataSources: ["vehicles", "mileage_readings"], columns: [{ table: "vehicles", field: "licensePlate" }], filters: [] });
  expect(res.status).toBe(403);
  expect(res.body.source).toBe("mileage_readings");
});
it("een km-rapport van de beheerder is onzichtbaar en niet op te slaan voor anderen", async () => {
  const cfg = { name: `Km fixt ${Date.now()}`, dataSources: ["mileage_readings"], columns: [{ table: "vehicle_mileage_readings", field: "mileage" }], filters: [], groupBy: [] };
  const saved = await admin.post("/api/reports/saved").send(cfg);
  expect(saved.status).toBe(200);
  savedIds.push(saved.body.id);
  const manager = await agentFor(["view_reports", "manage_reports"]);
  expect((await manager.get("/api/reports/saved")).body.map((r: any) => r.id)).not.toContain(saved.body.id);
  expect((await admin.get("/api/reports/saved")).body.map((r: any) => r.id)).toContain(saved.body.id);
  const refused = await manager.post("/api/reports/saved").send(cfg);
  expect(refused.status).toBe(403);
  expect(refused.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
});
```
  (`savedIds` in `afterAll` verwijderen via `db.delete(savedReports)`.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-sources.test.ts` — Expected: FAIL (200 waar 403 hoort).
- [ ] **Step 3: Implement** `deniedReportSource`, `sourceDeniedBody` en de drie routes; `mayReportOn` en `PERSONAL_DATA_TABLES` verdwijnen.
- [ ] **Step 4: Run** de test plus `server/__tests__/security-review-2026-10-18-low.test.ts server/__tests__/report-builder-fields.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report builder sources need the right of their part of the app`.

### Task 3: Groeperen per maand, groepering controleren, volgorde (server)

**Files:**
- Modify: `server/database-storage.ts` (`executeReport`; import `officeDaySql`, `textDaySql` uit `./services/reports/report-kit`)
- Test: `server/__tests__/report-builder-sources.test.ts` (cases erbij)

**Interfaces:**
- Consumes: `ReportGrouping.period` (Task 1), `officeDaySql(column)`, `textDaySql(column)` (`server/services/reports/report-kit.ts:104,122`).
- Produces: in `executeReport` één lokale `groupExpr(table, field, period?)`: zonder `period` = `identFor`; met `"month"` = `to_char(officeDaySql(ident), 'YYYY-MM')` als de Drizzle-kolom `columnType` `PgTimestamp` of `PgTimestampString` heeft, anders `to_char(textDaySql(ident), 'YYYY-MM')`. Een kolom zonder berekening waarvan (tabel, gecanoniseerd veld) een groep is, selecteert `groupExpr(...) AS "<veld>"`. Nieuwe `ReportValidationError`-codes (Nederlandse `message`, `field` = `"<tabel>.<veld>"`):
  - `REPORT_PERIOD_UNKNOWN` — `period` aanwezig en niet `"month"`;
  - `REPORT_PERIOD_NOT_DATE` — `period: "month"` op een veld dat geen `type: 'date'` heeft;
  - `REPORT_COLUMN_NOT_GROUPED` — er is een groep of een kolom met berekening, en een kolom zonder berekening staat niet in de groep (`"De kolom <tabel>.<veld> staat niet in de groepering. Kies er een berekening bij of groepeer erop."`).
  - Met groep: `ORDER BY <groupExpr…> ASC NULLS LAST` vóór `LIMIT 1000`.

- [ ] **Step 1: Write failing tests.** Bekeuringen op V (`licensePlate` van V, `description "fixt"`): F1 `offenceAt 2019-01-31T23:30:00Z` (kantoordag 2019-02-01), `amount "40"`, `adminFee "10"`, `totalAmount "50"`, `status "new"`; F2 `2019-02-10T10:00:00Z`, `"25"`, `"5"`, `"30"`, `"linked"`; F3 `2019-03-05T10:00:00Z`, `"25"`, `"0"`, `"25"`, `"new"`.

```ts
it("per maand in kantoortijd, gesorteerd", async () => {
  const res = await admin.post("/api/reports/execute").send({
    name: "t", dataSources: ["fines"],
    columns: [{ table: "fines", field: "offenceAt" }, { table: "fines", field: "totalAmount", aggregation: "SUM" }],
    filters: [{ table: "fines", field: "vehicleId", operator: "equals", value: V }],
    groupBy: [{ table: "fines", field: "offenceAt", period: "month" }],
  });
  expect(res.status).toBe(200);
  expect(res.body.map((r: any) => [r.offenceAt, Number(r.totalAmount)])).toEqual([["2019-02", 80], ["2019-03", 25]]);
});
it("groeperen op tekst, met Aantal", async () => {
  const res = await admin.post("/api/reports/execute").send({
    name: "t", dataSources: ["fines"],
    columns: [{ table: "fines", field: "status" }, { table: "fines", field: "id", aggregation: "COUNT" }],
    filters: [{ table: "fines", field: "vehicleId", operator: "equals", value: V }],
    groupBy: [{ table: "fines", field: "status" }],
  });
  expect(res.body.map((r: any) => [r.status, Number(r.id)])).toEqual([["linked", 1], ["new", 2]]);
});
it("een kolom buiten de groep geeft een duidelijke melding", async () => {
  const res = await admin.post("/api/reports/execute").send({
    name: "t", dataSources: ["fines"],
    columns: [{ table: "fines", field: "status" }, { table: "fines", field: "id", aggregation: "COUNT" }], filters: [],
  });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ code: "REPORT_COLUMN_NOT_GROUPED", field: "fines.status" });
});
it("per maand alleen bij een datumveld, alleen 'month'", async () => {
  const base = { name: "t", dataSources: ["fines"], columns: [{ table: "fines", field: "status" }], filters: [] };
  const a = await admin.post("/api/reports/execute").send({ ...base, groupBy: [{ table: "fines", field: "status", period: "month" }] });
  expect(a.body).toMatchObject({ code: "REPORT_PERIOD_NOT_DATE", field: "fines.status" });
  const b = await admin.post("/api/reports/execute").send({ ...base, columns: [{ table: "fines", field: "offenceAt" }], groupBy: [{ table: "fines", field: "offenceAt", period: "week" }] });
  expect(b.body).toMatchObject({ code: "REPORT_PERIOD_UNKNOWN", field: "fines.offenceAt" });
});
it("tekstdatum per maand (transporten)", async () => {
  const res = await admin.post("/api/reports/execute").send({
    name: "t", dataSources: ["transports"],
    columns: [{ table: "vehicle_transports", field: "scheduledDate" }, { table: "vehicle_transports", field: "id", aggregation: "COUNT" }],
    filters: [{ table: "vehicle_transports", field: "vehicleId", operator: "equals", value: V }],
    groupBy: [{ table: "vehicle_transports", field: "scheduledDate", period: "month" }],
  });
  expect(res.body.map((r: any) => [r.scheduledDate, Number(r.id)])).toEqual([["2019-03", 2]]);
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-sources.test.ts` — Expected: FAIL (500 bij "kolom buiten de groep"; maanden niet gegroepeerd).
- [ ] **Step 3: Implement** `groupExpr`, de drie controles (vóór het bouwen van de query) en de `ORDER BY`.
- [ ] **Step 4: Run** de test plus `server/__tests__/report-builder-fields.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report builder groups per month and checks the grouping`.

### Task 4: Bouwer in de client: bronnen per recht, alle velden, groeperen en berekening

**Files:**
- Modify: `client/src/pages/reports/report-builder.tsx` (`offeredSources` regel 51-52; veldlijst regel 263-281; kolomregels regel 330-348; nieuw blok onder `FilterBuilder`; `handleRunReport`/`handleSaveReport` sturen `groupBy`)
- Modify: `client/src/pages/reports/report-builder-output.ts` (`displayCell`, `csvCell`: maandwaarde, ruling 16; export `aggregationLabel`)
- Modify: `client/src/locales/*/reports.json`
- Test: `client/src/pages/reports/__tests__/report-builder-sources.test.tsx` (nieuw; Task 5 voegt cases toe), `client/src/pages/reports/__tests__/p7a-report-builder.test.tsx` (blijft groen)

**Interfaces:**
- Consumes: `canUseReportSource`, `DATA_SOURCES`, `ReportGrouping` (Task 1); `useAuth` (`@/hooks/use-auth`); `formatDateNl` (`@/lib/format-date-nl`).
- Produces:
  - `offeredSources = DATA_SOURCES.filter((s) => canUseReportSource(user, s))` (vervangt `canSeeCustomers`).
  - Veldknoppen: alle velden, `data-testid="button-add-field-${field.name}"` (ongewijzigd).
  - Kolomregel `idx`: keuzelijst `data-testid="select-column-aggregation-${idx}"` (opties `none` + `SUM`, `AVG`, `MIN`, `MAX` alleen bij `aggregatable`, + `COUNT`, `COUNT_DISTINCT`); niet getoond voor de kolom die de groep is. Tekst achter de kolom: `aggregationLabel(t, agg)` in plaats van de ruwe code.
  - Blok "Groeperen": `data-testid="select-report-group-by"` (waarde `"__none"` of `"<tabel>.<veld>"` van de aangevinkte bronnen) en bij een datumveld `data-testid="checkbox-group-by-month"`. Kiezen zet `groupBy = [{ table, field, period? }]` en voegt de kolom toe als die ontbreekt; "Niet groeperen" zet `groupBy = []`. Verandert de groep, dan vervalt de berekening op de nieuwe groepskolom.
  - `export function aggregationLabel(t: TFunction, agg: string): string` in `report-builder-output.ts` (`reportBuilderPage.aggregation.<AGG>`).
  - `displayCell`/`csvCell`: datumveld zonder berekening met waarde `/^\d{4}-\d{2}$/` → `formatDateNl(\`${v}-01T12:00:00\`, "MMM yyyy")` resp. `"mm-jjjj"`.
  - Sleutels (7 talen): `reportBuilderPage.sources.{fines, transports, workshop_visits, damage_checks, mileage_readings}` (nl: Bekeuringen, Transporten, Werkplaatsbezoeken, Schadechecks, Km-historie); `reportBuilderPage.fields.<tabel>.<veld>` voor alle velden uit Task 1 (nl o.a. `fines.offenceAt` "Datum overtreding", `fines.receivedAt` "Ontvangen op", `fines.reference` "Kenmerk", `fines.amount` "Boetebedrag", `fines.adminFee` "Administratiekosten", `fines.totalAmount` "Totaalbedrag", `fines.source` "Herkomst", `fines.linkedAt` "Gekoppeld op", `vehicle_transports.transportType` "Soort transport", `vehicle_transports.scheduledDate` "Geplande datum", `vehicle_transports.completedDate` "Afgerond op", `vehicle_transports.driverName` "Chauffeur", `vehicle_transports.distanceKm` "Afstand (km)", `vehicle_transports.tollCost` "Tolkosten", `vehicle_transports.billableAmount` "Te factureren bedrag", `vehicle_transports.isBreakdownOrMaintenance` "Pech of onderhoud", `workshop_visits.maintenanceStatus` "Werkplaatsstatus", `workshop_visits.maintenanceCategory` "Categorie", `workshop_visits.maintenanceType` "Soort bezoek", `workshop_visits.maintenanceDuration` "Duur (dagen)", `workshop_visits.noInvoiceExpected` "Geen factuur nodig", `interactive_damage_checks.checkType` "Soort check", `interactive_damage_checks.checkDate` "Datum check", `interactive_damage_checks.completedBy` "Uitgevoerd door", `vehicle_mileage_readings.recordedAt` "Datum", `vehicle_mileage_readings.source` "Bron", `vehicle_mileage_readings.actorName` "Door wie", `vehicle_mileage_readings.voidedAt` "Vervallen op"; id-velden "ID", "Voertuig-ID", "Klant-ID", "Reservering-ID", "Bestuurder-ID"); `reportBuilderPage.groupBy.{label: "Groeperen op", none: "Niet groeperen", perMonth: "Per maand"}`; `reportBuilderPage.aggregation.{label: "Berekening", none: "Geen", SUM: "Som", AVG: "Gemiddelde", COUNT: "Aantal", COUNT_DISTINCT: "Aantal verschillend", MIN: "Kleinste", MAX: "Grootste"}`. `reportBuilderPage.moreFieldsCount_*` weg.

- [ ] **Step 1: Write failing tests** in `report-builder-sources.test.tsx` (`useAuth` gemockt met wisselbare `role`/`permissions` zoals `client/src/pages/maintenance/__tests__/calendar-query-permissions.test.tsx:25-29`; `fetch` en `executeBody` zoals `p7a-report-builder.test.tsx:36-52`):
  - admin: `checkbox-datasource-{fines,transports,workshop_visits,damage_checks,mileage_readings}` aanwezig; teksten `Bekeuringen`, `Transporten`, `Werkplaatsbezoeken`, `Schadechecks`, `Km-historie`.
  - `role user`, `[VIEW_REPORTS, VIEW_FINES]`: `fines`, `vehicles`, `reservations`, `expenses` aanwezig; `transports`, `workshop_visits`, `damage_checks`, `mileage_readings`, `customers`, `drivers` afwezig.
  - `[VIEW_REPORTS, MANAGE_MAINTENANCE]`: `workshop_visits` aanwezig, `transports` afwezig. `[VIEW_REPORTS, VIEW_VEHICLES, MANAGE_VEHICLES]`: `mileage_readings` afwezig.
  - admin, `checkbox-datasource-vehicles` uit, `mileage_readings` aan: `button-add-field-voidedAt` aanwezig (7e veld); `screen.queryByText(/meer\.\.\./)` is `null`.
  - admin, vehicles uit, fines aan; klik `button-add-field-offenceAt` en `button-add-field-totalAmount`; `select-report-group-by` → optie `Datum overtreding`; klik `checkbox-group-by-month`; `select-column-aggregation-1` → `Som`; `select-column-aggregation-0` bestaat niet; klik `button-run-report` ⇒ `executeBody.groupBy` `toEqual([{ table: "fines", field: "offenceAt", period: "month" }])`, `executeBody.columns` `toMatchObject([{ table: "fines", field: "offenceAt" }, { table: "fines", field: "totalAmount", aggregation: "SUM" }])`.
  - admin, vehicles uit, fines aan, geen kolommen; groep `Status` ⇒ kolomregel met `Status` verschijnt; uitvoeren ⇒ `executeBody.columns[0]` `toMatchObject({ field: "status" })`.
  - uitkomst `[{ offenceAt: "2019-02", totalAmount: "80.00" }]` met de groep per maand ⇒ cel in `dialog-report-results` toont `formatDateNl("2019-02-01T12:00:00", "MMM yyyy")`; CSV-knop ⇒ `downloadCsv`-cellen `[["02-2019", "80,00"]]`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/report-builder-sources.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** bronfilter, alle velden, groeperen en berekening, uitvoerhelpers en sleutels in 7 talen.
- [ ] **Step 4: Run** de test plus `client/src/pages/reports/__tests__/p7a-report-builder.test.tsx client/src/pages/reports/__tests__/p7a-saved-reports-print.test.tsx client/src/__tests__/locale-parity.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): report builder offers sources by right, all fields, grouping and calculations`.

### Task 5: Grafiek bij een gegroepeerd resultaat

**Files:**
- Create: `client/src/pages/reports/report-builder-chart.tsx`
- Modify: `client/src/pages/reports/report-builder.tsx` (state `resultGroupBy` gezet in `runReportMutation.onSuccess` uit `config.groupBy ?? []`; `ReportResultsDialog` krijgt prop `groupBy: ReportGrouping[]` en toont `<ReportBuilderChart>` boven de tabel)
- Modify: `client/src/locales/*/reports.json` (`reportBuilderPage.chart.*`)
- Test: `client/src/pages/reports/__tests__/report-builder-chart.test.tsx` (nieuw), cases in `report-builder-sources.test.tsx`

**Interfaces:**
- Consumes: `displayCell`, `fieldLabel`, `aggregationLabel` (Task 4); recharts `BarChart`, `LineChart`, `PieChart`, `Pie`, `Cell`, `Bar`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`.
- Produces (`report-builder-chart.tsx`):
  - `export type BuilderChartType = "bar" | "line" | "pie"`
  - `export const BUILDER_CHART_MAX_GROUPS = 50`, `export const BUILDER_PIE_MAX_SLICES = 10`, `export const BUILDER_CHART_COLORS` (ruling 17)
  - `export interface BuilderChartData { points: Array<{ name: string } & Record<string, number | string>>; series: Array<{ key: string; label: string }>; truncated: boolean }`
  - `export function builderChartData(t: TFunction, rows: Record<string, unknown>[], columns: ReportColumn[], groupBy: ReportGrouping[]): BuilderChartData | null` — `null` als `groupBy` leeg is; `series` leeg als geen kolom een berekening heeft (component toont dan `needsAggregate`).
  - `export function pieSlices(points: BuilderChartData["points"], key: string, otherLabel: string): Array<{ name: string; value: number }>`
  - `export function ReportBuilderChart({ rows, columns, groupBy }: { rows: Record<string, unknown>[]; columns: ReportColumn[]; groupBy: ReportGrouping[] }): JSX.Element | null` — `null` zonder groep; anders `data-testid="report-builder-chart"` met `data-chart-type`, keuzelijst `data-testid="select-report-chart-type"` (Staaf, Lijn, Taart), melding `data-testid="report-builder-chart-truncated"` bij `truncated`, of `data-testid="report-builder-chart-needs-aggregate"`.
  - Sleutels (7 talen): `reportBuilderPage.chart.{title: "Grafiek", type: "Soort grafiek", bar: "Staaf", line: "Lijn", pie: "Taart", other: "Overig", needsAggregate: "Kies bij een kolom een berekening, zoals Som of Aantal, om een grafiek te zien.", firstGroups_one/_other: "De grafiek toont de eerste {{count}} groepen."}` (+ `_few`/`_many`).

- [ ] **Step 1: Write failing tests.**
  - `report-builder-chart.test.tsx` (pure functies, `t = i18n.t`):

```ts
const cols = [{ table: "fines", field: "offenceAt", label: "x" }, { table: "fines", field: "totalAmount", label: "y", aggregation: "SUM" as const }];
const month = [{ table: "fines", field: "offenceAt", period: "month" as const }];
it("punten en reeksen uit het resultaat", () => {
  const d = builderChartData(t, [{ offenceAt: "2019-02", totalAmount: "80.00" }, { offenceAt: null, totalAmount: "x" }], cols, month)!;
  expect(d.points).toEqual([{ name: formatDateNl("2019-02-01T12:00:00", "MMM yyyy"), totalAmount: 80 }, { name: "-", totalAmount: 0 }]);
  expect(d.series).toEqual([{ key: "totalAmount", label: "Totaalbedrag (Som)" }]);
  expect(d.truncated).toBe(false);
});
it("zonder groep geen grafiek, zonder berekening geen reeks", () => {
  expect(builderChartData(t, [], cols, [])).toBeNull();
  expect(builderChartData(t, [{ status: "new" }], [{ table: "fines", field: "status", label: "s" }], [{ table: "fines", field: "status" }])!.series).toEqual([]);
});
it("hoogstens 50 groepen", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ status: `s${i}`, id: "1" }));
  const d = builderChartData(t, rows, [{ table: "fines", field: "status", label: "s" }, { table: "fines", field: "id", label: "i", aggregation: "COUNT" }], [{ table: "fines", field: "status" }])!;
  expect(d.points).toHaveLength(50);
  expect(d.truncated).toBe(true);
});
it("taart: tien grootste plus Overig, alleen positief", () => {
  const points = [...Array.from({ length: 12 }, (_, i) => ({ name: `g${i}`, v: 12 - i })), { name: "nul", v: 0 }, { name: "min", v: -4 }];
  const slices = pieSlices(points, "v", "Overig");
  expect(slices).toHaveLength(11);
  expect(slices[0]).toEqual({ name: "g0", value: 12 });
  expect(slices[10]).toEqual({ name: "Overig", value: 3 });
});
```
  - `report-builder-sources.test.tsx`: gegroepeerde uitvoer (stub `[{ status: "new", id: "2" }, { status: "linked", id: "1" }]`, groep Status, `Aantal` op ID) ⇒ `report-builder-chart` met `data-chart-type="bar"`; `select-report-chart-type` → `Lijn` ⇒ `"line"`; → `Taart` ⇒ `"pie"`. Niet-gegroepeerde uitvoer ⇒ `queryByTestId("report-builder-chart")` en `queryByTestId("select-report-chart-type")` zijn `null`. Gegroepeerd zonder berekening ⇒ `report-builder-chart-needs-aggregate` zichtbaar. Een opgeslagen rapport met `groupBy` uitvoeren (tabblad Opgeslagen rapporten, `button-run-saved-…`) ⇒ grafiek zichtbaar.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/report-builder-chart.test.tsx client/src/pages/reports/__tests__/report-builder-sources.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** de module, de prop en sleutels in 7 talen. Staaf: één `Bar` per reeks; lijn: één `Line` per reeks; taart: `pieSlices` van de eerste reeks met `Cell`-kleuren. Hoogte `h-72`, zoals `ReportMonthChart`.
- [ ] **Step 4: Run** de tests plus `client/src/pages/reports/__tests__/p7a-report-builder.test.tsx client/src/__tests__/locale-parity.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): chart for a grouped report builder result`.

### Task 6: Afronding over alle rapporten (rechtentest, recharts-stub, handleiding)

Drie delen, elk met eigen test en commit.

**Files:**
- Create: `server/__tests__/report-routes-guards.test.ts`
- Modify: `client/src/__tests__/setup-jsdom.ts`
- Modify: `client/src/components/reports/kit/__tests__/report-kit.test.tsx` (één case)
- Modify: `docs/gebruikershandleiding/21-rapporten.md`, `docs/gebruikershandleiding/22-acceptatiechecklist.md`

**Interfaces:**
- Consumes: `agentFor`, `anonAgent`, `makeApp`, `cleanupFixtureUsers` (`server/__tests__/helpers/app.ts`); routewandeling zoals `collectRoutes` (`server/__tests__/fix-i-permission-matrix.test.ts:73-87`, lokaal overnemen).
- Produces: geen productcode.

**Deel a — één rechtentest over alle rapportroutes**

- [ ] **Step 1: Write the test** `report-routes-guards.test.ts`. Per rapport de rechtensets die geweigerd moeten worden (uit `server/routes/reports.ts:59-91`); agents per unieke set hergebruiken (`Map<string, TestAgent>`):

```ts
const REPORTS: Array<{ path: string; tile: string; denied: string[][] }> = [
  { path: "fines", tile: "total", denied: [["view_fines", "manage_fines", "view_vehicles"]] },
  { path: "extra-costs", tile: "extraKm", denied: [["view_reservations", "manage_reservations"]] },
  { path: "transport-billing", tile: "notInvoiced", denied: [["view_vehicles", "view_reservations"]] },
  { path: "customer-value", tile: "revenue", denied: [["view_customers", "manage_customers"]] },
  { path: "occupancy", tile: "rented", denied: [["view_reports"], ["view_reservations", "manage_reservations"]] },
  { path: "maintenance-outlook", tile: "all", denied: [["view_reports"], ["view_vehicles", "manage_vehicles"]] },
  { path: "fleet-mileage", tile: "driven", denied: [["view_reports", "manage_reports", "view_vehicles", "manage_vehicles"]] },
  { path: "portal-requests", tile: "all", denied: [["view_reports"], ["view_portal", "manage_portal"]] },
  { path: "waitlist", tile: "all", denied: [["view_reports"], ["view_portal", "manage_portal"]] },
  { path: "invoice-inbox-runs", tile: "runs", denied: [["view_reports"], ["manage_expenses", "manage_settings"]] },
  { path: "invoice-inbox-items", tile: "all", denied: [["view_reports", "manage_settings"], ["manage_expenses"]] },
  { path: "deliveries", tile: "all", denied: [["view_reports", "view_damage_checks"], ["view_vehicles", "view_reservations"]] },
  { path: "damage-checks", tile: "all", denied: [["view_reports", "view_vehicles"], ["view_damage_checks", "manage_damage_checks"]] },
];
const urls = (r: (typeof REPORTS)[number]) => [
  `/api/reports/${r.path}/summary`, `/api/reports/${r.path}/rows?tile=${r.tile}`, `/api/reports/${r.path}/export?tile=${r.tile}`,
];

it("elk rapport van de kit staat in deze lijst", async () => {
  const app = await makeApp();
  const mounted = collectRoutes(app).map((r) => /^GET \/api\/reports\/([^/]+)\/summary$/.exec(r.key)?.[1]).filter(Boolean).sort();
  expect(mounted).toEqual(REPORTS.map((r) => r.path).sort());
});
it.each(REPORTS)("$path: 403 zonder het juiste recht op summary, rows en export", async (r) => {
  for (const perms of r.denied) {
    const agent = await agentOf(perms);
    for (const url of urls(r)) expect((await agent.get(url)).status, `${perms.join("+")} ${url}`).toBe(403);
  }
});
it.each(REPORTS)("$path: 401 zonder inloggen", async (r) => {
  const anon = await anonAgent();
  for (const url of urls(r)) expect((await anon.get(url)).status, url).toBe(401);
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-routes-guards.test.ts` — Expected: PASS (de guards bestaan al; dit is een vangnet). Faalt een regel, dan eerst nagaan of de lijst of de route fout is; een route versoepelen mag niet.
- [ ] **Step 3: Commit** `test(rapporten): every kit report refuses without its rights`.

**Deel b — recharts-stub in de jsdom-setup**

- [ ] **Step 4: Write the failing test** in `report-kit.test.tsx`: `it("ReportMonthChart tekent in jsdom (vaste maat uit de setup)")` — render `<ReportMonthChart data={[{ month: "2019-01", a: 1 }]} series={[{ key: "a", label: "A", color: "#000" }]} testId="m" />`; `expect(screen.getByTestId("m").querySelector("svg.recharts-surface")).not.toBeNull()`.
- [ ] **Step 5: Run** `npx vitest run client/src/components/reports/kit/__tests__/report-kit.test.tsx` — Expected: FAIL (geen `svg`: breedte 0).
- [ ] **Step 6: Implement** in `setup-jsdom.ts`: `vi.mock("recharts", async (importOriginal) => ({ ...(await importOriginal<typeof import("recharts")>()), ResponsiveContainer: … }))`; de vervanger rendert `React.createElement("div", { style: { width: 800, height: 400 } }, React.cloneElement(children, { width: 800, height: 400 }))` (bestand blijft `.ts`, dus `createElement`). Commentaar: waarom, en dat een eigen `vi.mock("recharts")` in een testbestand voorgaat.
- [ ] **Step 7: Run** `npx vitest run client/src/components/reports client/src/pages/reports` — Expected: PASS; en `npx vitest run client/src/components/reports client/src/pages/reports 2>&1 | grep -c "width(0) and height(0)"` — Expected: `0`.
- [ ] **Step 8: Commit** `test(rapporten): jsdom draws recharts at a fixed size, no width(0) noise`.

**Deel c — handleiding en acceptatiechecklist**

- [ ] **Step 9: Herschrijf `21-rapporten.md`** (korte zinnen, knopnamen vet zoals in `client/src/locales/nl/reports.json` en `vehicles.json`):
  - Intro en 21.1: tabbladen **Operaties**, **Kosten**, **Voertuigen**, **Klanten**, **Transporten**, **Financieel**, **Fiscaal**, **Portaal**, **Kantoor**; tabel met nieuwe regels voor **Portaal** en **Kantoor**, regel **Financieel** zonder "gereden kilometers per maand"; bijschrift van de tabbladenafbeelding niet meer "Operaties tot en met Fiscaal" maar "de tabbladen" (afbeelding zelf blijft; ruling 22).
  - 21.3: alle velden zijn aan te klikken (de waarschuwing "maar vijf velden per bron" en "+8 meer..." weg); nieuwe bronnen **Bekeuringen**, **Transporten**, **Werkplaatsbezoeken**, **Schadechecks**, **Km-historie** (alleen beheerder) en welk vinkje elke bron vraagt; nieuwe stappen **Groeperen op** (met **Per maand** bij een datum), **Berekening** per kolom (**Som**, **Gemiddelde**, **Aantal**, …) en de melding als een kolom niet in de groep staat; in **Rapportresultaten** de **Grafiek** met **Soort grafiek**: **Staaf**, **Lijn**, **Taart** (alleen bij groeperen; taart = tien grootste plus **Overig**; hoogstens 50 groepen); een opgeslagen rapport met een bron die je niet mag, zie je niet.
  - 21.5 Financieel: bovenaan **Omzet**, **Kosten**, **Marge**, **Gereden km**; **CSV**-knop bij **Kosten en opbrengst per voertuig**; drie kaarten **Bekeuringen**, **Meer-km en brandstof**, **Transport en facturatie** met hun tegels; **Kilometers per maand** staat hier niet meer (zit nu in **Kilometerstanden vloot**, alleen beheerder).
  - Nieuw 21.6 **Werken met een rapportkaart**: tegel = knop; de lijst toont precies wat de tegel telt; **CSV** en **Afdrukken** in die lijst; periode en voertuig uit **Rapportfilters**; kaart zonder recht is er niet.
  - Nieuw 21.7 **Voertuigen en Klanten**: **Bezetting per dag** (klik op een dag), **Onderhoud en APK vooruit** (km-standen alleen voor beheerder), **Kilometerstanden vloot** en **Km-historie per voertuig** (alleen beheerder), **Klantwaarde** op Klanten; en het tabblad **Km-historie** in het voertuigscherm (alleen beheerder): lijst, grafiek, waarschuwingen, **Afdrukken**, **CSV**.
  - Nieuw 21.8 **Portaal en Kantoor**: **Portaalaanvragen**, **Wachtlijst**; **Factuurpostvak** (ophaalrondes 90 dagen bewaard; facturenlijst alleen met **Kosten beheren**), **Bezorgen en ophalen** (te laat = niet op de geplande dag afgerond; wissel en slepen staan in het transportrapport), **Schadechecks** (met schade = inleveren met schadepunten).
  - 21.9 **Rechten** (was 21.6): regels erbij voor **Financieel**-kaarten (alleen rapportvinkje), **Bezetting per dag** (ook **Reserveringen bekijken**), **Onderhoud en APK vooruit** (ook **Voertuigen bekijken**), **Portaal** (ook **Portaal bekijken**), elke **Kantoor**-kaart, elke nieuwe bouwerbron, alles over km (alleen beheerder). 21.10 **In het kort** (was 21.7) met regels voor groeperen, grafiek, Portaal, Kantoor en km-historie. Verwijzing "Dat staat in 21.6" in de intro wordt 21.9.
- [ ] **Step 10: Werk `22-acceptatiechecklist.md` bij** (zelfde vorm: `- [ ] **Titel.** [account] … Verwacht: … (hfst 21.x)`):
  - Regel **Rapporten, het scherm** (hfst 2) en **De tabbladen** (hfst 21): ook **Portaal** en **Kantoor**.
  - **Financieel en Fiscaal**: zonder **Kilometers per maand**; plus **CSV** bij de voertuigtabel.
  - Rapportbouwer: **Bekend: maar vijf velden per bron** vervangen door **Alle velden**; nieuw: **Nieuwe bronnen** [beheerder] (tien bronnen); **Bronnen per vinkje** [Rapporten bekijken + Bekeuringen bekijken] (geen Transporten, Werkplaatsbezoeken, Schadechecks, Km-historie); **Groeperen per maand** (bekeuringen, **Datum overtreding**, **Per maand**, **Som** op **Totaalbedrag**: één regel per maand, oud naar nieuw); **Kolom buiten de groep** (melding, geen fout 500); **Grafiek** (Staaf, Lijn, Taart; geen grafiek zonder groep); **Km-historie alleen beheerder** (opgeslagen km-rapport niet zichtbaar voor een ander account).
  - Nieuwe kopjes **Financieel: geld**, **Voertuigen en Klanten**, **Portaal**, **Kantoor** met per kaart: tegels en hun namen; een tegel opent een lijst met hetzelfde aantal; **CSV** en **Afdrukken**; periode en voertuigfilter (Factuurpostvak: melding dat het voertuigfilter niet geldt; melding over 90 dagen); rechten (zonder het vinkje is de kaart er niet). Plus **Km-historie in het voertuigscherm** [beheerder] en [account zonder beheerdersrol]: tabblad niet zichtbaar.
  - Rechtenregel **(hfst 21.6)** wordt **(hfst 21.9)**.
- [ ] **Step 11: Controleer** dat elke knopnaam in de twee bestanden letterlijk in `client/src/locales/nl/*.json` staat (steekproef met `grep -n "<naam>" client/src/locales/nl/reports.json`), en dat `grep -n "Kilometers per maand\|maar vijf velden\|21\.6)" docs/gebruikershandleiding/21-rapporten.md docs/gebruikershandleiding/22-acceptatiechecklist.md` alleen nog bewust bedoelde regels geeft.
- [ ] **Step 12: Commit** `docs(handleiding): reports chapter and checklist for the new reports and the builder`.

**Eindcontrole**

- [ ] **Step 13: Run** `npx vitest run server/__tests__/report-builder-fields.test.ts server/__tests__/report-builder-sources.test.ts server/__tests__/report-routes-guards.test.ts server/__tests__/security-review-2026-10-18-low.test.ts server/__tests__/fix-i-permission-matrix.test.ts` en `npx vitest run client/src/components/reports client/src/pages/reports client/src/__tests__/locale-parity.test.tsx` — Expected: PASS (bekende rode tests op `main` buiten beschouwing, zoals fix-i door `/api/manual`). `npx tsc --noEmit -p .` — geen uitvoer.
- [ ] **Step 14: In de browser** (dev server `start`): als beheerder tien bronnen; bekeuringen per maand met Som → tabel met maanden en een staafgrafiek, wissel naar Lijn en Taart; een niet-gegroepeerd rapport toont geen grafiek; km-historie als bron werkt. Als medewerker met `view_reports` + `view_fines`: alleen Voertuigen, Reserveringen, Kosten, Bekeuringen; een opgeslagen km-rapport staat niet in de lijst.
- [ ] **Step 15:** Kees vragen voor merge naar `main` en push (geen migratie in deze fase), en de open vragen hieronder voorleggen.

## Open vragen voor Kees

- **Werkplaatsbezoeken: welk vinkje?** Gekozen: **Reserveringen bekijken/beheren** of **Onderhoud beheren** (zoals de lijst "komend onderhoud"). Aanbeveling: zo laten. Let op: het rapport "Stilstand in de werkplaats" op Voertuigen vraagt nu alleen het rapportvinkje.
- **Groeperen per week of per jaar?** Nu alleen per maand. Aanbeveling: eerst zo; week/jaar is later één extra waarde.
- **Grafiekkeuze bewaren bij een opgeslagen rapport?** Nu niet; elke keer staaf. Aanbeveling: niet nodig tenzij Kees het mist.
- **Km-stand bij schadechecks** in de bouwer is zichtbaar voor iedereen met het schadecheckvinkje (zoals in het schadecheckscherm zelf). Aanbeveling: zo laten; alleen de km-historie is beheerderszaak.
- **Meerdere bronnen aanvinken** kan nog, maar de bouwer gebruikt alleen de eerste. Aanbeveling: later één bron tegelijk maken (kleine wijziging, raakt bestaande tests).
- **Schermafbeeldingen** in hoofdstuk 21 tonen nog zeven tabbladen. Aanbeveling: na de merge de handleiding-pijplijn (`scripts/handleiding`) opnieuw draaien voor hoofdstuk 21.

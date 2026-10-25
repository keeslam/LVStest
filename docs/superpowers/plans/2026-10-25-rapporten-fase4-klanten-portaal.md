# Rapporten fase 4: klanten en portaal (klantwaarde, portaalaanvragen, wachtlijst) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op Rapporten > Klanten ziet kantoor per klant wat hij opleverde en kostte en hoe hij zich gedroeg (met top 10 beste en top 10 duurste als grafiek); op een nieuw tabblad Portaal staan de portaalaanvragen (per soort, status en maand, reactietijd, afhandelaar, open aanvragen ouder dan 2 dagen) en de wachtlijst (per maand en gewenst type, vervuld of niet, wachttijd).

**Architecture:** Drie rapporten op de rapportkit (`mountReport` → `/summary`, `/rows`, `/export`; tegel = precies de lijst). Portaalaanvragen en wachtlijst zijn rijen uit één tabel en gebruiken `sqlReport` (`tileWhere`/`tileAmount`). Klantwaarde is een rij per klant over vijf bronnen; de rijen bestaan pas voor een periode, dus het bouwt — zoals `occupancy-report.ts` — een `ReportDefinition` direct op één SQL-fragment `customerValueSql(filter, today)` met één `tileIs(tile)` voor tegels, telling, lijst en top 10. De kit krijgt één nieuwe clientcomponent: een liggende staafgrafiek voor een top 10.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL (`sql`-templates), React + TanStack Query, recharts, vitest (server tegen de testdatabase met `agentFor`, client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` — onderdelen 9, 10, 11, "Gemeenschappelijke regels voor elk nieuw rapport" en "Wat Kees besliste" (Klantwaarde, Plek, Elk nieuw rapport, Geld-rechten, Overige rechten).

## Controller rulings (2026-10-25)

- Waitlist (onderdeel 11): nothing in the app writes vehicle_waitlist today, so the report will be empty in practice. Build it as specified with a clear empty-state message; Kees is asked at the end whether he wants a way to add waitlist entries (separate project). Do not switch the report to another data source.
- Kit API: reports build on server/services/reports/sql-report.ts (sqlReport) / report-kit.ts (mountReport with maxDays/redact) as they are at the start of each task; cards must survive a summary without tiles (`data?.tiles?.[id]`); CSV counts 0 decimals, amounts 2, percentages 1.
- km/reading rules changed in phase 3: a jump reading is no longer the previous reading (not relevant to this phase unless you touch km).

## Global Constraints

- Server telt, filtert en pagineert; lijsten alleen via `/rows` (max 250 per pagina) en `/export` (max `REPORT_EXPORT_LIMIT = 20000`, met `truncated`).
- Tegel = lijst: per rapport één voorwaarde voor tegel, telling, lijst, maandgrafiek en uitsplitsing (`tileWhere` / `tileIs`); `expectTilesMatchRows` voor elke tegel. Geld netto (correcties tellen mee, zoals Financieel).
- Klantwaarde is een **geldrapport**: alleen `VIEW_REPORTS` of `MANAGE_REPORTS` (Kees). Omzet en huurdagen = exact de set van Financieel (`buildVehicleFinancials`, `server/utils/financial-reports.ts:62`): `type = 'standard'`, `status <> 'cancelled'`, `deleted_at IS NULL`, bestaand voertuig, startdag in de periode, omzet = `total_price + fuel_cost + extra_km_cost`, dagen = `max(1, eind − start + 1)` met eind = `coalesce(actual_return_date, end_date, greatest(vandaag, start))`.
- Portaalaanvragen en wachtlijst: rapportrecht **én** portaalrecht — `hasPermission(VIEW_REPORTS, MANAGE_REPORTS)` + `hasPermission(VIEW_PORTAL, MANAGE_PORTAL)` (`UserPermission.VIEW_PORTAL = 'view_portal'`, `MANAGE_PORTAL = 'manage_portal'`, `shared/schema.ts:135-136`). Zonder portaalrecht: geen tabblad Portaal, geen request, route 403.
- Periode uit de filterbalk (`from`/`to`, kantoordatum), geparsed door `parseReportFilter`; tijdstempels via `officeDaySql`, tekstdatums via `textDaySql`.
- Open aanvraag "te oud" = status `new` of `in_progress` en `created_at < now() - interval '2 days'` (`PORTAL_STALE_DAYS = 2`, spec: keuze bouwer).
- CSV via `downloadCsv` en afdrukken via de afdrukweergave, beide al in `ReportDetailDialog`; grafieken met recharts.
- Teksten in nl, en, es, pt, it, ro, pl in `client/src/locales/*/reports.json`; `client/src/__tests__/locale-parity.test.tsx` groen (ook `_many` voor es/pt/it/pl, `_few` voor ro/pl).
- Geen schemawijziging (geen `startup-migration.js`, geen `schema-columns.json`).
- Bestaande tabbladen veranderen niet behalve: een kaart bovenaan Klanten en een nieuw tabblad Portaal.

## Rulings in this plan

1. **Klantwaarde staat bovenaan Klanten, buiten de `canViewCustomers`-guard**: het is een geldrapport (alleen rapportrecht, Kees). Iemand zonder klantenrecht ziet de kaart én de bestaande NoDataAccess-regel eronder. Klantnamen staan ook al in de bekeuringen- en meer-km-rapporten voor rapportrecht alleen.
2. **Datum per bron**: omzet, reserveringen, huurdagen, meer-km, brandstof, te laat ingeleverd en annuleringen op de startdag van de reservering (zoals Financieel); bekeuringen op de kantoordag van `offence_at` (zoals het bekeuringenrapport); schadechecks op de kantoordag van `check_date`; portaalaanvragen op de kantoordag van `created_at`.
3. **Kosten door de klant** (geld) = bekeuringen (`total_amount`, status ≠ `cancelled`, = tegel `total` van het bekeuringenrapport) + `extra_km_cost` + `fuel_cost`. Schades hebben geen bedrag in de app; ze tellen als aantal (kolom en kostentegel), niet in het bedrag. Meer-km en brandstof staan dus zowel in omzet (zoals Financieel "waarvan extra kosten") als in kosten; de kaarttekst zegt dat.
4. **Schadecheck met schade** = `check_type = 'return'` met minstens één marker: `damage_markers ~ '^\s*\[\s*[^]\s]'` (een JSON-array die niet leeg is; nooit een cast, dus ongeldige JSON breekt de query niet). Ophaalchecks tellen niet (bestaande schade). Klant via `reservations.customer_id` (inner join, reservering niet verwijderd); checks zonder reservering tellen niet.
5. **Te laat ingeleverd** = in de omzetset en `textDay(actual_return_date) > textDay(end_date)`; alleen de dag telt, niet `end_time`. Nog niet ingeleverde huur telt niet.
6. **Annulering** = `type = 'standard'`, `status = 'cancelled'`, `deleted_at IS NULL`, startdag in de periode; geen eis aan het voertuig.
7. **Rij "zonder klant"**: reserveringen en bekeuringen zonder klant vormen één rij met `customerId = null`, zodat de omzettegel gelijk is aan Financieel en het bekeuringsbedrag aan het bekeuringenrapport.
8. **Voertuigfilter bij klantwaarde**: reserveringen, annuleringen, bekeuringen en schadechecks op hun `vehicle_id`; portaalaanvragen alleen als `reservation_id` naar een reservering van dat voertuig wijst. Zonder voertuigfilter tellen alle aanvragen van de klant.
9. **Klantwaarde-tegels** `revenue` (klanten met ≥ 1 reservering; bedrag = omzet), `costs` (kosten ≠ 0 of ≥ 1 bekeuring of ≥ 1 schadecheck met schade; bedrag = kosten), `late`, `cancelled`, `requests` (klanten met ≥ 1; bedrag = aantal keer). Top 10 beste = rijen van tegel `revenue` op omzet aflopend; top 10 duurste = rijen van tegel `costs` op kosten aflopend; `count` in een top-10-regel = aantal reserveringen.
10. **Portaalcijfers in klantwaarde** zonder portaalrecht: alleen een aantal per klant, geen inhoud — hoort bij het geldrapport (rapportrecht alleen).
11. **Portaal en wachtlijst negeren het voertuigfilter** (aanvragen en wachtlijst gaan meestal niet over één auto); de kaarten tonen de regel `portalReports.vehicleFilterIgnored` als een voertuig gekozen is.
12. **Portaal-tegels** `all`, `open` (`new`/`in_progress`), `done`, `rejected` (alle vier op de kantoordag van `created_at` in de periode) en `stale` (open en ouder dan 2 dagen, **los van de periode**: een werklijst). `amount` is overal 0.
13. **Reactietijd** = mediaan van `replied_at − created_at` in uren (1 decimaal) over aanvragen van tegel `all` met `replied_at`. `replied_at` is het laatste formele antwoord (`finish` in `server/routes/portal-requests.ts:53`), niet het eerste chatbericht — zoals de spec het noemt.
14. **Per soort en status per maand**: maandgrafiek gestapeld per status (nieuw, in behandeling, afgehandeld, afgewezen); tabel soort × status over de periode. Labels uit `portal:admin.requests.type.*` en `portal:admin.requests.status.*`.
15. **Afgehandeld per medewerker** = `handled_by` van aanvragen met status `done` of `rejected` in de periode, via `reportBreakdown` (top 10, op aantal).
16. **Wachtlijst**: gewenst type = `coalesce(nullif(btrim(w.vehicle_type), ''), nullif(btrim(v.vehicle_type), ''))` (bij een gekozen auto zijn type), anders "onbekend". Tegels `all`, `open` (`active`/`contacted`), `fulfilled`, `cancelled` op de kantoordag van `created_at`; `amount` 0. Niet vervuld = alles behalve `fulfilled`. Wachttijd = kantoordag `fulfilled_at` − kantoordag `created_at` in dagen, gemiddeld met 1 decimaal, alleen met `fulfilled_at`. Tabel per type gesorteerd op niet vervuld aflopend ("welk type ontbreekt").
17. Kaarten controleren zelf ook hun rechten (rapportrecht, en bij Portaal ook portaalrecht), zoals de fase-3-kaarten.

## Review Focus

1. Reservering of bekeuring zonder klant, of een negatieve correctie: totalen wijken af van Financieel en het bekeuringenrapport — test in Task 1 (rij zonder klant, omzet = `vehicle-financials`, boetes = `fines` tegel `total`).
2. Schadecheck met `damage_markers` `[]`, `null` of geen JSON: telt niet en geeft geen 500 — test in Task 1.
3. Aanvraag om 23:30 UTC op oudejaarsavond: hoort in de kantoordag (1 januari) — test in Task 2.
4. Open aanvraag van vóór de gekozen periode: staat toch in "ouder dan 2 dagen"; een aanvraag van gisteren niet — test in Task 2.
5. Medewerker met rapportrecht maar zonder portaalrecht: geen tabblad Portaal, geen request, 403 op alle drie routes; klantwaarde wél zichtbaar zonder klantenrecht — tests in Tasks 2, 3, 4, 5.

---

### Task 1: Klantwaarde — server (onderdeel 9)

**Files:**
- Create: `shared/reports/customer-value-report.ts`
- Create: `server/services/reports/customer-value-report.ts`
- Modify: `server/routes/reports.ts` (in `registerReportRoutes`, bij `moneyReportGuards`)
- Test: `server/__tests__/report-customer-value.test.ts`

**Interfaces:**
- Consumes: `mountReport`, `ReportDefinition`, `ReportFilter`, `textDaySql`, `officeDaySql`, `inPeriodSql`, `money` (`report-kit.ts`); `rowsOf` (`sql-report.ts`); `isoToday()` (`server/services/lifecycle.ts:595`); `REPORT_BREAKDOWN_LIMIT`, `ReportBreakdownRow`, `ReportTileTotal` (`shared/report-kit.ts`).
- Produces (shared):
  - `CUSTOMER_VALUE_TILES = ["revenue", "costs", "late", "cancelled", "requests"] as const`; `type CustomerValueTile`
  - `CUSTOMER_VALUE_SORTS = ["amount", "customer", "revenue", "costs", "rentals", "rentalDays", "lateReturns", "cancellations", "portalRequests"] as const`; `type CustomerValueSort`
  - `interface CustomerValueRow { customerId: number | null; customerName: string | null; rentals: number; rentalDays: number; revenue: number; extraKmCost: number; fuelCost: number; finesCount: number; finesAmount: number; damageChecks: number; lateReturns: number; cancellations: number; portalRequests: number; costs: number; amount: number }` — `costs = finesAmount + extraKmCost + fuelCost`; `amount` = bedrag van de geopende tegel (ruling 9).
  - `interface CustomerValueSummary { tiles: Record<CustomerValueTile, ReportTileTotal>; topRevenue: ReportBreakdownRow[]; topCosts: ReportBreakdownRow[] }`
- Produces (server): `export function customerValueSql(filter: ReportFilter, today: string): SQL` — één rij per klant (of `NULL`) met de kolommen van `CustomerValueRow` in snake_case, opgebouwd uit vijf gegroepeerde CTE's (`res`, `cancel`, `fin`, `dmg`, `req`) samengevoegd over hun `customer_id` (`IS NOT DISTINCT FROM`, zodat de NULL-rij één rij is), plus `LEFT JOIN customers`. `export const customerValueReport: ReportDefinition<CustomerValueTile, CustomerValueSort, CustomerValueRow, CustomerValueSummary>` met `key: "customer-value"`, default sort `amount desc`; `tileIs(tile)` en `tileAmount(tile)` op alias `cv` voeden summary, count, list en beide top-10-queries.
- Route: `mountReport(app, "/api/reports/customer-value", moneyReportGuards, customerValueReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { vehicleId: V, from: "2026-01-01", to: "2026-12-31" }`. Fixtures (`createFixtureVehicle`, `createFixtureCustomer("Waarde-A")`/`("Waarde-B")`, `createFixtureReservation` + `db.update`; boetes, checks en aanvragen met `db.insert`, in `afterAll` eerst zelf verwijderd, dan `cleanupFixtures()`):
  - A: R1 standard `returned` 03-01–03-05, `actualReturnDate "2026-03-07"`, `totalPrice "500"`, `extraKmCost "30"`, `fuelCost "20"`; R2 standard 04-01–04-02, `actualReturnDate "2026-04-02"`, `totalPrice "200"`; R3 standard `cancelled` 05-01, `totalPrice "999"`; R4 standard 05-10 met `deletedAt`, `totalPrice "777"`; R5 `replacement` 06-01, `totalPrice "111"`; R6 standard 2025-12-20, `totalPrice "50"`.
  - B: R7 standard 07-01–07-10, `actualReturnDate "2026-07-10"`, `totalPrice "1000"`.
  - Boetes (voertuig V): A `linked` 2026-03-03 `totalAmount "45"`; A `cancelled` 2026-03-04 `"60"`; B `new` 2026-07-05 `"120"`; zonder klant `new` 2026-08-01 `"15"`.
  - Schadechecks (voertuig V): R1 `return` 2026-03-07 markers `'[{"x":0.1,"y":0.2}]'`; R1 `pickup` met marker; R2 `return` markers `'[]'`; R7 `return` markers `'geen json'`.
  - Portaalaanvragen A: één met `reservationId: R1` (2026-03-02), één zonder reservering (2026-03-03).

```ts
it("tegels", async () => {
  const s = (await staff.get("/api/reports/customer-value/summary").query(Q)).body;
  expect(s.tiles).toEqual({
    revenue: { count: 2, amount: 1750 }, costs: { count: 3, amount: 230 },
    late: { count: 1, amount: 1 }, cancelled: { count: 1, amount: 1 }, requests: { count: 1, amount: 1 },
  });
});
it("rij van klant A", async () => {
  const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...Q, tile: "revenue" })).body.rows;
  expect(rows.find((r: any) => r.customerId === A)).toEqual({
    customerId: A, customerName: nameA, rentals: 2, rentalDays: 9, revenue: 750, extraKmCost: 30, fuelCost: 20,
    finesCount: 1, finesAmount: 45, damageChecks: 1, lateReturns: 1, cancellations: 1, portalRequests: 1, costs: 95, amount: 750,
  });
});
it("zonder voertuigfilter telt ook de aanvraag zonder reservering", async () => {
  const { vehicleId, ...noVehicle } = Q;
  const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...noVehicle, tile: "requests", pageSize: "250" })).body.rows;
  expect(rows.find((r: any) => r.customerId === A).portalRequests).toBe(2);
});
it("top 10", async () => {
  const s = (await staff.get("/api/reports/customer-value/summary").query(Q)).body;
  expect(s.topRevenue).toEqual([{ key: B, label: nameB, count: 1, amount: 1000 }, { key: A, label: nameA, count: 2, amount: 750 }]);
  expect(s.topCosts).toEqual([{ key: B, label: nameB, count: 1, amount: 120 }, { key: A, label: nameA, count: 2, amount: 95 }, { key: null, label: null, count: 0, amount: 15 }]);
});
it("klopt met Financieel en met het bekeuringenrapport", async () => {
  const fin = (await staff.get("/api/reports/vehicle-financials").query(Q)).body;
  expect(fin.totals.revenue).toBe(1750);
  expect(fin.totals.rentalDays).toBe(19);
  const all = (await staff.get("/api/reports/customer-value/export").query({ ...Q, tile: "costs" })).body.rows;
  const fines = (await staff.get("/api/reports/fines/summary").query(Q)).body;
  expect(all.reduce((n: number, r: any) => n + r.finesAmount, 0)).toBe(fines.tiles.total.amount); // 180
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/customer-value", Q, CUSTOMER_VALUE_TILES));
it("rechten: alleen het rapportrecht", async () => {
  // agentFor(["view_reports"]) → 200; agentFor(["view_customers","manage_customers"]) → 403 op summary, rows?tile=revenue, export?tile=revenue
});
```
  (`staff = agentFor(["view_reports"])`; de financiële en bekeuringenroute vragen ook alleen het rapportrecht.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-customer-value.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, `customerValueSql`, `customerValueReport`, mount-regel. Eén `today = isoToday()` per verzoek voor summary (zoals occupancy).
- [ ] **Step 4: Run** the test plus `server/__tests__/report-fines.test.ts server/__tests__/report-extra-costs.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): customer value report (server)`.

### Task 2: Portaalaanvragen — server (onderdeel 10)

**Files:**
- Create: `shared/reports/portal-requests-report.ts`
- Create: `server/services/reports/portal-requests-report.ts`
- Modify: `server/routes/reports.ts`
- Test: `server/__tests__/report-portal-requests.test.ts`

**Interfaces:**
- Consumes: `sqlReport`, `reportBreakdown`, `rowsOf`; `officeDaySql`, `inPeriodSql`; `fillMonths`; `portalRequests`, `customers` (`shared/schema.ts:876`).
- Produces (shared):
  - `PORTAL_STALE_DAYS = 2`
  - `PORTAL_REQUEST_REPORT_TILES = ["all", "open", "done", "rejected", "stale"] as const`; `type PortalRequestReportTile`
  - `PORTAL_REQUEST_REPORT_SORTS = ["createdAt", "type", "status", "customer", "replyHours"] as const`; `type PortalRequestReportSort`
  - `interface PortalRequestReportRow { id: number; createdAt: string; type: string; status: string; customerId: number; customerName: string | null; handledBy: string | null; repliedAt: string | null; replyHours: number | null; openDays: number | null; amount: number }` — `openDays` = kantoordag vandaag − kantoordag `created_at` bij `new`/`in_progress`, anders `null`; `amount` 0.
  - `interface PortalRequestMonth { month: string; new: number; inProgress: number; done: number; rejected: number }`
  - `interface PortalRequestTypeCount { type: string; total: number; open: number; done: number; rejected: number }`
  - `interface PortalRequestReportSummary { tiles: Record<PortalRequestReportTile, ReportTileTotal>; byMonth: PortalRequestMonth[]; byType: PortalRequestTypeCount[]; byHandler: ReportBreakdownRow[]; medianReplyHours: number | null; repliedCount: number }` — `byType` zonder limiet, `total` aflopend dan `type` oplopend.
- Produces (server): `export const portalRequestsReport` (`sqlReport`, `key: "portal-requests"`, default `createdAt desc`, `tileAmount` = `sql\`0\``; `tileWhere("stale", _)` zonder periode).
- Route: `mountReport(app, "/api/reports/portal-requests", portalReportGuards, portalRequestsReport)` met `const portalReportGuards = [reportRight, hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL)]`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`, klant P. Aanvragen (`db.insert(portalRequests)`, `message: "FIXT"`):
  - Q1 `extension` `done`, created `2019-03-04T09:00:00Z`, replied `2019-03-04T15:00:00Z`, handledBy `"anna"`
  - Q2 `damage` `rejected`, created `2019-03-10T08:00:00Z`, replied `2019-03-11T08:00:00Z`, handledBy `"anna"`
  - Q3 `extension` `in_progress`, created `2019-04-01T10:00:00Z`, handledBy `"bram"`
  - Q4 `other` `new`, created `2019-04-02T10:00:00Z`
  - Q7 `other` `done`, created `2018-12-31T23:30:00Z` (kantoordag 2019-01-01), replied `2019-01-01T01:30:00Z`, handledBy `"bram"`
  - Q6 `other` `new`, created `2019-12-31T23:30:00Z` (kantoordag 2020-01-01: buiten)
  - Q8 `other` `new`, created `now − 1 dag`; Q9 `other` `new`, created `now − 3 dagen`

```ts
it("tegels, maanden, soorten, mediaan en afhandelaars", async () => {
  const s = (await staff.get("/api/reports/portal-requests/summary").query(Q)).body;
  expect({ all: s.tiles.all, open: s.tiles.open, done: s.tiles.done, rejected: s.tiles.rejected })
    .toEqual({ all: { count: 5, amount: 0 }, open: { count: 2, amount: 0 }, done: { count: 2, amount: 0 }, rejected: { count: 1, amount: 0 } });
  expect(s.byMonth).toEqual([
    { month: "2019-01", new: 0, inProgress: 0, done: 1, rejected: 0 },
    { month: "2019-02", new: 0, inProgress: 0, done: 0, rejected: 0 },
    { month: "2019-03", new: 0, inProgress: 0, done: 1, rejected: 1 },
    { month: "2019-04", new: 1, inProgress: 1, done: 0, rejected: 0 },
  ]);
  expect(s.byType).toEqual([
    { type: "extension", total: 2, open: 1, done: 1, rejected: 0 },
    { type: "other", total: 2, open: 1, done: 1, rejected: 0 },
    { type: "damage", total: 1, open: 0, done: 0, rejected: 1 },
  ]);
  expect(s.medianReplyHours).toBe(6);
  expect(s.repliedCount).toBe(3);
  expect(s.byHandler).toEqual([{ key: "anna", label: "anna", count: 2, amount: 0 }, { key: "bram", label: "bram", count: 1, amount: 0 }]);
});
it("ouder dan 2 dagen: los van de periode", async () => {
  const ids = (await staff.get("/api/reports/portal-requests/export").query({ ...Q, tile: "stale" })).body.rows.map((r: any) => r.id);
  expect(ids).toEqual(expect.arrayContaining([Q3, Q4, Q9]));
  expect(ids).not.toContain(Q8);
});
it("rij", async () => {
  const r = (await staff.get("/api/reports/portal-requests/rows").query({ ...Q, tile: "done", sort: "createdAt", dir: "asc" })).body.rows[0];
  expect(r).toMatchObject({ id: Q7, type: "other", status: "done", customerId: P, handledBy: "bram", replyHours: 2, openDays: null, amount: 0 });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/portal-requests", Q, PORTAL_REQUEST_REPORT_TILES));
it("rechten: rapportrecht én portaalrecht", async () => {
  // ["view_reports"] → 403; ["view_portal","manage_portal"] → 403; ["view_reports","view_portal"] → 200; ["manage_reports","manage_portal"] → 200; admin → 200
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-portal-requests.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, rapport, mount-regel. Mediaan: `percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM replied_at - created_at)) / 3600`, afgerond op 1 decimaal, `null` zonder antwoorden.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): portal requests report (server)`.

### Task 3: Wachtlijst — server (onderdeel 11)

**Files:**
- Create: `shared/reports/waitlist-report.ts`
- Create: `server/services/reports/waitlist-report.ts`
- Modify: `server/routes/reports.ts` (onder de portaalregel, zelfde `portalReportGuards`)
- Test: `server/__tests__/report-waitlist.test.ts`

**Interfaces:**
- Consumes: `sqlReport`, `rowsOf`, `officeDaySql`, `inPeriodSql`, `fillMonths`; `vehicleWaitlist`, `vehicles`, `customers` (`shared/schema.ts:2055`); `portalReportGuards` (Task 2).
- Produces (shared):
  - `WAITLIST_REPORT_TILES = ["all", "open", "fulfilled", "cancelled"] as const`; `type WaitlistReportTile`
  - `WAITLIST_REPORT_SORTS = ["createdAt", "preferredStartDate", "status", "customer", "vehicleType"] as const`; `type WaitlistReportSort`
  - `interface WaitlistReportRow { id: number; createdAt: string; customerId: number; customerName: string | null; vehicleType: string | null; vehicleId: number | null; licensePlate: string | null; preferredStartDate: string; preferredEndDate: string | null; duration: number | null; priority: string; status: string; contactedAt: string | null; fulfilledAt: string | null; daysToFulfil: number | null; amount: number }`
  - `interface WaitlistMonth { month: string; open: number; fulfilled: number; cancelled: number }`
  - `interface WaitlistTypeCount { vehicleType: string | null; total: number; fulfilled: number; notFulfilled: number; avgDaysToFulfil: number | null }`
  - `interface WaitlistReportSummary { tiles: Record<WaitlistReportTile, ReportTileTotal>; byMonth: WaitlistMonth[]; byType: WaitlistTypeCount[]; avgDaysToFulfil: number | null }` — `byType` zonder limiet, gesorteerd `notFulfilled desc, total desc, vehicleType asc NULLS LAST`.
- Produces (server): `export const waitlistReport` (`sqlReport`, `key: "waitlist"`, default `createdAt desc`, `tileAmount` 0).
- Route: `mountReport(app, "/api/reports/waitlist", portalReportGuards, waitlistReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`; voertuig V met `vehicleType: "bestelbus"`, klant W; regels (`db.insert(vehicleWaitlist)`, `preferredStartDate "2019-06-01"`; in `afterAll` vóór `cleanupFixtures()` verwijderen — de FK naar klanten heeft geen cascade):
  - W1 `vehicleType "personenauto"`, `active`, created `2019-02-01T10:00:00Z`
  - W2 `vehicleType null`, `vehicleId V`, `fulfilled`, created `2019-02-05T10:00:00Z`, fulfilled `2019-02-15T10:00:00Z`
  - W3 `"personenauto"`, `cancelled`, created `2019-03-01T10:00:00Z`
  - W4 `"personenauto"`, `fulfilled`, created `2019-03-02T10:00:00Z`, fulfilled `2019-03-06T10:00:00Z`
  - W5 `vehicleType "  "`, geen voertuig, `contacted`, created `2019-03-03T10:00:00Z`
  - W6 `"personenauto"`, `active`, created `2020-01-02T10:00:00Z` (buiten)

```ts
it("tegels, maanden, types en wachttijd", async () => {
  const s = (await staff.get("/api/reports/waitlist/summary").query(Q)).body;
  expect(s.tiles).toEqual({ all: { count: 5, amount: 0 }, open: { count: 2, amount: 0 }, fulfilled: { count: 2, amount: 0 }, cancelled: { count: 1, amount: 0 } });
  expect(s.byMonth).toEqual([{ month: "2019-02", open: 1, fulfilled: 1, cancelled: 0 }, { month: "2019-03", open: 1, fulfilled: 1, cancelled: 1 }]);
  expect(s.byType).toEqual([
    { vehicleType: "personenauto", total: 3, fulfilled: 1, notFulfilled: 2, avgDaysToFulfil: 4 },
    { vehicleType: null, total: 1, fulfilled: 0, notFulfilled: 1, avgDaysToFulfil: null },
    { vehicleType: "bestelbus", total: 1, fulfilled: 1, notFulfilled: 0, avgDaysToFulfil: 10 },
  ]);
  expect(s.avgDaysToFulfil).toBe(7);
});
it("rij met type van de gekozen auto", async () => {
  const r = (await staff.get("/api/reports/waitlist/rows").query({ ...Q, tile: "fulfilled", sort: "createdAt", dir: "asc" })).body.rows[0];
  expect(r).toMatchObject({ id: W2, vehicleType: "bestelbus", vehicleId: V, status: "fulfilled", daysToFulfil: 10, amount: 0 });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/waitlist", Q, WAITLIST_REPORT_TILES));
it("rechten: rapportrecht én portaalrecht", async () => { /* zelfde matrix als Task 2, op /api/reports/waitlist */ });
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-waitlist.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, rapport, mount-regel.
- [ ] **Step 4: Run** the test plus `server/__tests__/fix-i-permission-matrix.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): waitlist report (server)`.

### Task 4: Klantwaarde — kaart op Klanten, met top-10-grafiek in de kit

**Files:**
- Create: `client/src/components/reports/kit/report-top-chart.tsx`
- Create: `client/src/pages/reports/customer-value-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (eerste kind van `<TabsContent value="customers">`, regel ~2401, **vóór** `{!canViewCustomers ? …}`)
- Modify: `client/src/locales/*/reports.json` (`reportKit.noCustomer`, blok `customerReports.value`)
- Test: `client/src/components/reports/kit/__tests__/report-kit.test.tsx` (cases erbij), `client/src/pages/reports/__tests__/customer-portal-reports.test.tsx` (nieuw; Tasks 5 en 6 voegen cases toe), `client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` (case erbij)

**Interfaces:**
- Consumes: Task 1 shared types; `ReportTiles`, `ReportDetailDialog`, `ReportColumn`; `formatCurrency`; `csvNumber`.
- Produces:
  - `topChartData(rows: ReportBreakdownRow[], nullLabel: string): Array<{ name: string; amount: number; count: number }>` — `label ?? nullLabel`, volgorde ongewijzigd.
  - `ReportTopChart({ rows, nullLabel, money, color, testId }: { rows: ReportBreakdownRow[]; nullLabel: string; money?: boolean; color: string; testId: string })` — liggende recharts-`BarChart` (`layout="vertical"`, hoogte `max(160, 32 × rijen)`), lege lijst → `${testId}-empty` met `reportKit.noData`.
  - `CustomerValueReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-customer-value-report"`; alleen met `VIEW_REPORTS`/`MANAGE_REPORTS`. Tegels (`testIdPrefix="customer-value"`): `revenue`/`costs` waarde `formatCurrency(amount)`, overige waarde = `amount`; hint `customerReports.value.customersHint` (`{{count}} klanten`). Regel `customerReports.value.costsNote` (ruling 3). Twee grafieken naast elkaar: `customer-value-top-revenue` (groen `#16a34a`) en `customer-value-top-costs` (rood `#dc2626`). Dialoogkolommen: klant (`null` → `reportKit.noCustomer`), reserveringen, huurdagen, omzet, meer-km, brandstof, bekeuringen (aantal), bekeuringen (bedrag), schadechecks met schade, kosten, te laat, annuleringen, portaalaanvragen. `rowKey = customerId ?? "none"`, default sort `amount desc`, `csvSubject` `klantwaarde`, `reportName` `customer-value`.

- [ ] **Step 1: Write failing tests:**

```ts
// report-kit.test.tsx
it("topChartData: null-label en volgorde", () => {
  expect(topChartData([{ key: 1, label: "A", count: 2, amount: 750 }, { key: null, label: null, count: 0, amount: 15 }], "Zonder klant"))
    .toEqual([{ name: "A", amount: 750, count: 2 }, { name: "Zonder klant", amount: 15, count: 0 }]);
});
it("ReportTopChart leeg", () => { /* rows [] → getByTestId("x-empty") */ });

// customer-portal-reports.test.tsx (useAuth en fetch gemockt zoals financial-money-reports.test.tsx)
it("klantwaarde met alleen rapportrecht", async () => {
  // permissions ["view_reports"], from 2026-01-01 to 2026-12-31
  expect(fetchedPaths()).toContain("/api/reports/customer-value/summary?from=2026-01-01&to=2026-12-31");
  expect((await screen.findByTestId("customer-value-tile-revenue-value")).textContent).toBe(formatCurrency(1750));
  expect(screen.getByTestId("customer-value-tile-late-value").textContent).toBe("1");
});
it("zonder rapportrecht geen kaart en geen verzoek", …); // permissions ["view_customers"]
it("tegel Kosten opent de lijst", async () => {
  await user.click(screen.getByTestId("button-customer-value-tile-costs"));
  expect(fetchedPaths()).toContain("/api/reports/customer-value/rows?from=2026-01-01&to=2026-12-31&tile=costs&sort=amount&dir=desc&page=1&pageSize=50");
  // rij met customerId null toont "Zonder klant"
});

// reports-query-permissions.test.tsx
it("klantwaarde staat op Klanten ook zonder view_customers", async () => {
  // permissions [VIEW_REPORTS]; open tab Klanten → card-customer-value-report én de NoDataAccess-regel
});
```
- [ ] **Step 2: Run** `npx vitest run client/src/components/reports/kit client/src/pages/reports/__tests__/customer-portal-reports.test.tsx client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** component, kaart, plaatsing (`from={reportFrom} to={reportTo} vehicleId={selectedVehicle}`), sleutels `reportKit.noCustomer` en `customerReports.value.{title, description, costsNote, customersHint_one/_other (+_few/_many), tiles.*, topRevenue, topCosts, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** the tests plus `client/src/__tests__/locale-parity.test.tsx client/src/pages/reports/__tests__/p7a-reports-customers.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): customer value on Klanten`.

### Task 5: Tabblad Portaal met portaalaanvragen

**Files:**
- Create: `client/src/pages/reports/portal-requests-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (`canViewPortal`, trigger en `TabsContent value="portal"` na Financieel; kolommenklasse van `TabsList`)
- Modify: `client/src/locales/*/reports.json` (`reportsPage.tabs.portal`, `portalReports.vehicleFilterIgnored`, blok `portalReports.requests`)
- Test: cases in `customer-portal-reports.test.tsx` en `reports-query-permissions.test.tsx`

**Interfaces:**
- Consumes: Task 2 shared types, `PORTAL_STALE_DAYS`; `ReportTiles`, `ReportMonthChart`, `ReportBreakdownTable`, `ReportDetailDialog`; `portal:admin.requests.type.*` en `portal:admin.requests.status.*` (`useTranslation(["reports", "portal"])`).
- Produces:
  - In `index.tsx`: `const canViewPortal = useHasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL)`; trigger `<TabsTrigger value="portal" data-testid="tab-report-portal">` (icoon `MessageSquare`) alleen bij `canViewPortal`; `TabsList` krijgt de klasse uit `const TAB_COLS = { 6: "grid-cols-6", 7: "grid-cols-7", 8: "grid-cols-8" } as const` met `6 + (canViewFiscal ? 1 : 0) + (canViewPortal ? 1 : 0)` (letterlijke klassen voor Tailwind).
  - `PortalRequestsReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-portal-requests-report"`; alleen met rapportrecht én portaalrecht; stuurt **geen** `vehicleId` mee en toont `portal-vehicle-filter-ignored` als `vehicleId` gezet en ≠ `"all"`. Tegels (`testIdPrefix="portal-requests"`, waarde = aantal, `stale` toon `red` met label "Open, ouder dan {{days}} dagen"). Regel mediane reactietijd (`portal-requests-median`): `< 48` uur → "{{hours}} uur", anders "{{days}} dagen" (1 decimaal); geen antwoorden → "–". `ReportMonthChart` gestapeld (reeksen `new`, `inProgress`, `done`, `rejected`). Tabel soort × status (`portal-requests-by-type`). `ReportBreakdownTable` afhandelaars (`nullLabel` = `portalReports.requests.unknownHandler`, geen geld). Dialoogkolommen: nr, aangemaakt, soort, status, klant, behandeld door, beantwoord, reactietijd (uur), open (dagen). Default sort `createdAt desc`, bij tegel `stale` `createdAt asc`. `csvSubject` `portaalaanvragen`, `reportName` `portal-requests`.

- [ ] **Step 1: Write failing tests:**
  - `reports-query-permissions.test.tsx`: `[VIEW_REPORTS]` ⇒ geen `tab-report-portal`, geen verzoek dat begint met `/api/reports/portal-requests` of `/api/reports/waitlist`; `[VIEW_REPORTS, VIEW_PORTAL]` ⇒ tab zichtbaar, klik ⇒ `card-portal-requests-report`.
  - `customer-portal-reports.test.tsx`: met `vehicleId="12"` is het verzoek precies `/api/reports/portal-requests/summary?from=2019-01-01&to=2019-12-31` en is `portal-vehicle-filter-ignored` zichtbaar; summary-stub `medianReplyHours: 6` ⇒ tekst bevat "6 uur"; `72` ⇒ "3 dagen"; tabelrij `extension` toont het label `Verlenging` uit `portal:admin.requests.type.extension` (nl); klik op `button-portal-requests-tile-stale` ⇒ verzoek `/api/reports/portal-requests/rows?from=2019-01-01&to=2019-12-31&tile=stale&sort=createdAt&dir=asc&page=1&pageSize=50`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/customer-portal-reports.test.tsx client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** tab, kaart, sleutels `reportsPage.tabs.portal`, `portalReports.vehicleFilterIgnored`, `portalReports.requests.{title, description, tiles.*, median, medianHours, medianDays, noReplies, byMonth, byType, byHandler, unknownHandler, columns.*, csvSubject}` in 7 talen. (Controleer het nl-label van `extension` in `client/src/locales/nl/portal.json` en zet dat in de test.)
- [ ] **Step 4: Run** the tests plus `client/src/__tests__/locale-parity.test.tsx client/src/pages/reports/__tests__/reports-fiscal-only.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): Portaal tab with portal requests report`.

### Task 6: Wachtlijst — kaart op Portaal

**Files:**
- Create: `client/src/pages/reports/waitlist-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (in `TabsContent value="portal"`, onder de aanvragenkaart)
- Modify: `client/src/locales/*/reports.json` (blok `portalReports.waitlist`)
- Test: cases in `customer-portal-reports.test.tsx`

**Interfaces:**
- Consumes: Task 3 shared types; kitcomponenten.
- Produces: `WaitlistReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-waitlist-report"`; zelfde rechten en voertuigfilterregel als Task 5. Tegels (`testIdPrefix="waitlist"`), regel gemiddelde wachttijd (`waitlist-avg-days`, "–" bij `null`), `ReportMonthChart` gestapeld (`open`, `fulfilled`, `cancelled`), tabel per type (`waitlist-by-type`; `null` → `portalReports.waitlist.unknownType`; kolommen type, totaal, vervuld, niet vervuld, gem. wachttijd). Lege summary (alle tegels 0) → tekst `portalReports.waitlist.empty` (`waitlist-empty`) in plaats van grafiek en tabel. Dialoogkolommen: aangemaakt, klant, type, kenteken, gewenste start, gewenst eind, duur, prioriteit, status, vervuld op, wachttijd. `csvSubject` `wachtlijst`, `reportName` `waitlist`.

- [ ] **Step 1: Write failing tests:** permissions `["view_reports","view_portal"]`: summary-stub met `byType[0] = { vehicleType: null, … notFulfilled: 1 }` ⇒ rij toont "Onbekend"; `avgDaysToFulfil: 7` ⇒ `waitlist-avg-days` bevat "7"; alle tegels 0 ⇒ `waitlist-empty`; klik `button-waitlist-tile-open` ⇒ verzoek `/api/reports/waitlist/rows?from=2019-01-01&to=2019-12-31&tile=open&sort=createdAt&dir=desc&page=1&pageSize=50`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/customer-portal-reports.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** kaart, plaatsing, sleutels `portalReports.waitlist.{title, description, tiles.*, avgDays, byMonth, byType, unknownType, empty, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** the test plus parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): waitlist report on Portaal`.

### Task 7: Afronden

- [ ] Run `npx vitest run server/__tests__/report-customer-value.test.ts server/__tests__/report-portal-requests.test.ts server/__tests__/report-waitlist.test.ts server/__tests__/report-kit.test.ts server/__tests__/report-fines.test.ts server/__tests__/report-extra-costs.test.ts server/__tests__/fix-i-permission-matrix.test.ts shared/reports` en `npx vitest run client/src/components/reports client/src/pages/reports client/src/__tests__/locale-parity.test.tsx` — Expected: PASS (bekende rode tests op `main` buiten beschouwing). `npx tsc --noEmit -p .` — geen uitvoer.
- [ ] In de browser (dev server `start`), als admin, periode 1 januari – vandaag: Klanten toont klantwaarde met twee top-10-grafieken; omzettegel = omzet op Financieel voor dezelfde periode; tegels openen lijsten met hetzelfde aantal; CSV en Afdrukken werken. Tabblad Portaal: aanvragen met maandgrafiek, soort × status, mediaan, afhandelaars, "ouder dan 2 dagen"; wachtlijst (waarschijnlijk leeg: zie open vraag). Als medewerker met alleen `view_reports`: klantwaarde zichtbaar, geen tabblad Portaal.
- [ ] Handleiding (`docs/gebruikershandleiding`) alleen bijwerken als een pagina Rapporten > Klanten of de tabbladen van Rapporten beschrijft.
- [ ] Kees vragen voor merge naar `main` en push (geen migratie in deze fase).

## Open vraag voor Kees

- **De wachtlijst wordt nergens gevuld.** Geen route, scherm of portaalstap schrijft in `vehicle_waitlist` (alleen voertuig verwijderen en de RDW-vervangscript raken de tabel). Rapport 11 wordt volgens de spec gebouwd en toont dan "Nog geen wachtlijstregels"; aanbeveling: zo bouwen en Kees vragen of hij een manier wil om iemand op de wachtlijst te zetten (apart project), in plaats van het rapport nu op afgewezen huuraanvragen uit het portaal te baseren.

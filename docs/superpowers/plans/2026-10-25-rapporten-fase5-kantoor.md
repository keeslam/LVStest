# Rapporten fase 5: kantoor (factuurpostvak, bezorging en ophalen, schadechecks) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een nieuw tabblad Kantoor op Rapporten laat zien hoe de kantoorprocessen lopen: het factuurpostvak (per maand mails, bijlagen, automatisch geboekt, ter controle, overgeslagen, mislukt; meest voorkomende redenen voor controle), bezorgen en ophalen (aantal per maand, op tijd versus te laat, km per rit, per medewerker) en schadechecks (per maand per soort, met schade, voertuigen en klanten met de meeste schades).

**Architecture:** Vier rapporten op de rapportkit, allemaal `sqlReport` (rijen uit één tabel): `invoice-inbox-runs` (ophaalrondes), `invoice-inbox-items` (facturen), `deliveries` (transporten van soort bezorgen/terughalen) en `damage-checks`. Tegels, maandgrafiek en uitsplitsingen komen uit dezelfde `tileWhere` als de lijsten. Drie kaarten op het nieuwe tabblad Kantoor, elk met de bestaande kitcomponenten; geen nieuwe kitcomponent.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL (`sql`-templates), React + TanStack Query, recharts, vitest (server tegen de testdatabase met `agentFor`, `fileParallelism: false`; client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` — onderdelen 12, 13, 14, "Gemeenschappelijke regels voor elk nieuw rapport" en "Wat Kees besliste" (Plek, Elk nieuw rapport, Bezorging te laat, Overige rechten).

## Controller rulings (2026-10-25)

- Bezorging: wissels en sleepritten tellen NIET mee (staan al in het transportrapport).
- Reden bij boeken: de reden waarom een factuur ter controle stond blijft bewaard als die factuur alsnog wordt geboekt. Doe dit in Task 2 als kleine wijziging in server/routes/expense-inbox.ts (~:233): wis review_reason niet meer bij boeken; controleer eerst dat niets "Te controleren" op review_reason filtert (status bepaalt dat) en dat bestaande expense-inbox-tests groen blijven; test dat de reden na boeken bewaard is en in de redenenlijst telt.
- Ophaalrondes 90 dagen bewaard: zo laten; de kaart meldt het.
- Kit as it is now: sqlReport / mountReport; officeDaySql en de nieuwe instant-helper in report-kit.ts (naive = UTC) voor elke vergelijking van een tijdkolom met nu; ReportBreakdownTable hideAmount; ReportTopChart valueLabel; kaarten overleven een samenvatting zonder tegels; CSV aantallen 0 decimalen, bedragen 2, percentages 1. Meervoudsvormen voor tellende teksten ("1 dag").

## Global Constraints

- Server telt, filtert en pagineert; lijsten alleen via `/rows` (max 250 per pagina) en `/export` (max `REPORT_EXPORT_LIMIT = 20000`, met `truncated`).
- Tegel = lijst: per rapport één `tileWhere` voor tegels, telling, lijst, maandgrafiek en uitsplitsingen; `expectTilesMatchRows` voor elke tegel. De `amount` van een rij is wat die rij aan de geopende tegel bijdraagt.
- Rechten (spec "Overige rechten"): rapportrecht `hasPermission(VIEW_REPORTS, MANAGE_REPORTS)` **plus** het recht van de bron, precies zoals de bronroutes nu bewaakt zijn:
  - ophaalrondes: `hasPermission(MANAGE_EXPENSES, MANAGE_SETTINGS)` (= `GET /api/expenses/inbox/runs`, `server/routes/expense-inbox.ts:158`);
  - facturen: `hasPermission(MANAGE_EXPENSES)` (= `GET /api/expenses/inbox/items`, `:167`);
  - bezorging: `hasPermission(VIEW_VEHICLES, MANAGE_VEHICLES, VIEW_RESERVATIONS, MANAGE_RESERVATIONS)` (= `GET /api/transports`, `server/routes.ts:9443`);
  - schadechecks: `hasPermission(VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS)` (= `GET /api/interactive-damage-checks`, `server/routes.ts:8833`).
  Zonder bronrecht: kaart niet zichtbaar, geen verzoek, route 403. Tabblad Kantoor alleen met rapportrecht én minstens één van deze bronrechten.
- Te laat (Kees): **alleen als het niet op de geplande dag is afgerond**.
- Periode uit de filterbalk (`from`/`to`, kantoordatum) via `parseReportFilter`; tijdstempels via `officeDaySql` (werkt voor timestamptz én naïeve UTC-kolommen), tekstdatums via `textDaySql`. Geen kale vergelijking `kolom < now()`: "vandaag" is altijd `officeDaySql(sql\`now()\`)` en wordt alleen met dagen vergeleken.
- CSV via `downloadCsv` en afdrukken via de afdrukweergave, beide al in `ReportDetailDialog`; grafieken met recharts via `ReportMonthChart`; CSV: aantallen 0 decimalen, km 1, percentages 1.
- Kaarten overleven een summary zonder tegels (`data?.tiles?.[id]`).
- Teksten in nl, en, es, pt, it, ro, pl in `client/src/locales/*/reports.json`; `client/src/__tests__/locale-parity.test.tsx` groen (ook `_many` voor es/pt/it/pl, `_few` voor ro/pl).
- Geen schemawijziging (geen `startup-migration.js`, geen `schema-columns.json`). Geen wijziging aan het factuurpostvak, de transporten of de schadechecks zelf.
- Bestaande tabbladen veranderen niet; alleen de `TabsList` krijgt een extra kolomklasse.

## Rulings in dit plan

1. **`delivery_tasks` wordt niet gebruikt.** Niets in de app schrijft de tabel (alleen `server/services/recycle-bin-purge.ts:563` leest en wist hem bij het opruimen van een reservering). Bezorgen en ophalen bestaan in de praktijk als `vehicle_transports`: `syncDeliveryLeg` maakt per reservering met `deliveryRequired` een transport `transport_type = 'delivery'`, `syncCollectionLeg` per reservering met `collectionRequired` een transport `transport_type = 'repossession'` met reden `COLLECTION_LEG_REASON` (`server/database-storage.ts:2049-2130`), en kantoor plant ze ook met de hand op het Bezorging-scherm. Rapport 13 leest daarom `vehicle_transports`.
2. **Welke transporten**: `transport_type IN ('delivery', 'repossession')` (Levering en Terughalen, inclusief de ophaalservice), `status <> 'cancelled'`. Wissel, slepen en overig horen niet bij "bezorging en ophalen" en staan al in het transportfactuurrapport. Externe voertuigen tellen mee (kenteken = `external_license_plate`) en vallen weg bij een voertuigfilter, zoals in `transport-billing-report.ts`.
3. **Dag van een rit** = `textDaySql(scheduled_date)` (de geplande dag). Een rit met onleesbare geplande datum valt buiten elke periode.
4. **Op tijd / te laat / open / afgerond zonder datum** (vier tegels die samen precies tegel `all` zijn), met `plan = textDaySql(scheduled_date)`, `klaar = textDaySql(nullif(completed_date, ''))`, `vandaag = officeDaySql(sql\`now()\`)`:
   - `onTime`: `status = 'completed' AND klaar IS NOT NULL AND klaar <= plan` (eerder klaar telt als op tijd);
   - `late`: `(status = 'completed' AND klaar > plan) OR (status <> 'completed' AND plan < vandaag)`;
   - `open`: `status <> 'completed' AND plan >= vandaag` (nog niet te laat);
   - `undated`: `status = 'completed' AND klaar IS NULL` (oude ritten zonder afrondingsdatum; niet te beoordelen, dus eigen tegel).
   `daysLate` = `klaar − plan` bij afgerond te laat, `vandaag − plan` bij niet afgerond te laat, anders `null`. Percentage op tijd = `onTime / (onTime + late)`, 1 decimaal, `null` als beide 0.
5. **Km per rit** = `distance_km`. Tegelbedrag (`amount`) van het bezorgrapport = `coalesce(distance_km, 0)`: elke tegel toont het aantal ritten met de km als hint. Gemiddelde km per rit = som / aantal ritten **met** `distance_km` in tegel `all`, 1 decimaal.
6. **Medewerker** bij bezorging = `nullif(btrim(driver_name), '')` (het veld "chauffeur" van het transport; `delivery_tasks.assigned_staff_*` bestaat in de praktijk niet). Leeg → "Onbekend". Tabel per medewerker zonder limiet, `trips desc, driver asc NULLS LAST`.
7. **Factuurpostvak = twee rapporten.** `invoice_inbox_runs` heeft precies de cijfers uit de spec (mails, bijlagen, geboekt, ter controle, overgeslagen, mislukt) maar wordt maar `RUN_LOG_RETENTION_DAYS = 90` dagen bewaard (`server/services/invoice-inbox/run-log.ts:8`); `invoice_inbox_items` blijft bewaard en kent de redenen. Rapport "ophaalrondes" telt de rondes, rapport "facturen" de binnengekomen bijlagen. De kaart meldt het bewaren van 90 dagen als de periode eerder begint (`retentionCutoff`).
8. **Rondetegels** `runs`, `mails`, `attachments`, `booked`, `review`, `skipped`, `failed`: tegel `runs` = elke ronde in de periode (`amount` 1 per ronde); de andere = rondes met die kolom > 0, `amount` = die kolom. De kaart toont `amount` als waarde (het getal uit de spec) en het aantal rondes als hint. Dag = kantoordag van `started_at`.
9. **Alleen mail uit het postvak**: een factuurregel telt als `message_id`, `from_address`, `subject` of `mail_date` gevuld is. Wat `POST /api/expenses/from-invoice` (handmatig scannen) aanmaakt heeft die vier leeg en telt niet. Dag = kantoordag van `received_at` (altijd gevuld; `mail_date` kan leeg zijn).
10. **Uitkomst van een factuurregel** (vier tegels die samen `all` zijn, `amount` 0):
    - `staffBooked` = `status = 'booked' AND (updated_by IS DISTINCT FROM created_by OR EXISTS audit_logs met action IN ('expense.inbox.book', 'expense.inbox.book.healed'), resource_type 'invoice_inbox_item', resource_id = id::text)` — de boekroute zet `updatedBy` op de medewerker en schrijft altijd die auditregel; de auditregel vangt de medewerker die zelf "Nu ophalen" drukte;
    - `autoBooked` = `status = 'booked'` en niet `staffBooked`;
    - `waiting` = `status = 'review'`; `dismissed` = `status = 'dismissed'`.
    Extra tegel `flagged` = `review_reason IS NOT NULL` (in de periode): de bron van "meest voorkomende redenen". **Beperking**: de boekroute wist `review_reason` bij boeken na controle (`server/routes/expense-inbox.ts:233`), dus later geboekte controles hebben geen reden meer; de kaart zegt dat (zie open vraag).
11. **Redenen** = alle `review_reason`-waarden van tegel `flagged`, `count desc, reason asc`, zonder limiet (9 bekende redenen); labels uit `expenses:invoiceInbox.reasons.*`, onbekende waarde toont de ruwe tekst.
12. **Factuurpostvak negeert het voertuigfilter** (rondes hebben geen voertuig, veel facturen ook niet); de kaart toont `officeReports.vehicleFilterIgnored` als een voertuig gekozen is. Bezorging en schadechecks volgen het voertuigfilter.
13. **Schadecheck met schade** = `check_type = 'return'` met minstens één marker, met de regex die klantwaarde al gebruikt (`NON_EMPTY_ARRAY`, `server/services/reports/customer-value-report.ts:39`). Die constante verhuist naar `report-kit.ts` als `NON_EMPTY_JSON_ARRAY` zodat beide rapporten dezelfde regel lezen en klantwaarde en dit rapport hetzelfde aantal per klant geven. Ophaalchecks met markers zijn bestaande schade en tellen niet als "met schade".
14. **Welke schadechecks**: dag = kantoordag van `check_date`. Een check bij een reservering in de prullenbak (`reservations.deleted_at IS NOT NULL`) telt niet; een check zonder reservering telt wel, met klant "zonder reservering" (`customerId = null`). Klant = `reservations.customer_id`.
15. **Meeste schades** = `reportBreakdown` over `tileWhere("withDamage")`, per voertuig (label kenteken) en per klant (label naam, `null` = zonder reservering), top 10, `amount` 0 (kaart met `hideAmount`).
16. **Volgorde op het tabblad**: factuurpostvak, bezorging en ophalen, schadechecks. Elke kaart controleert zelf zijn rechten (zoals fase 3 en 4).
17. **Tabbladkolommen**: `TAB_COLS` krijgt `9: "grid-cols-9"`; aantal = `6 + fiscaal + portaal + kantoor`.

## Review Focus

1. Rondes of facturen om 23:30 UTC op oudejaarsavond: horen in de kantoordag 1 januari — tests in Tasks 1, 2 en 4.
2. Een niet afgeronde rit van vorige week telt als te laat, één van overmorgen als open; afgerond zonder datum telt niet als op tijd; samen altijd gelijk aan tegel `all` — test in Task 3.
3. Medewerker die zelf "Nu ophalen" drukte en daarna de controle boekt (`created_by = updated_by`): telt als door kantoor geboekt, niet automatisch — test in Task 2.
4. Schadecheck met `damage_markers` `[]`, `null` of geen JSON, of bij een reservering in de prullenbak: telt niet en geeft geen 500; klantaantallen gelijk aan klantwaarde — test in Task 4.
5. Medewerker met rapportrecht en alleen `manage_settings`: ziet tabblad Kantoor en de ophaalrondes, maar geen factuurlijst en geen verzoek naar `/api/reports/invoice-inbox-items`; zonder enig bronrecht geen tabblad — tests in Tasks 1, 2, 5, 7.

---

### Task 1: Factuurpostvak, ophaalrondes — server (onderdeel 12)

**Files:**
- Create: `shared/reports/invoice-inbox-report.ts` (types voor Tasks 1 en 2)
- Create: `server/services/reports/invoice-inbox-runs-report.ts`
- Modify: `server/routes/reports.ts` (na de portaalregels)
- Test: `server/__tests__/report-invoice-inbox-runs.test.ts`

**Interfaces:**
- Consumes: `sqlReport`, `rowsOf` (`sql-report.ts`); `officeDaySql`, `inPeriodSql`, `ReportFilter` (`report-kit.ts`); `fillMonths`, `ReportTileTotal` (`shared/report-kit.ts`); `invoiceInboxRuns` (`shared/schema.ts:1493`); `RUN_LOG_RETENTION_DAYS` (`server/services/invoice-inbox/run-log.ts:8`); `dateInZone` (`shared/office-timezone`), `officeTimeZone` (`server/services/office-time`).
- Produces (shared):
  - `INBOX_RUN_REPORT_TILES = ["runs", "mails", "attachments", "booked", "review", "skipped", "failed"] as const`; `type InboxRunReportTile`
  - `INBOX_RUN_REPORT_SORTS = ["startedAt", "mails", "attachments", "booked", "review", "skipped", "failed"] as const`; `type InboxRunReportSort`
  - `interface InboxRunReportRow { id: number; startedAt: string; finishedAt: string; trigger: string; triggeredBy: string | null; mails: number; attachments: number; booked: number; review: number; skipped: number; failed: number; errors: string[]; amount: number }`
  - `interface InboxRunMonth { month: string; runs: number; mails: number; attachments: number; booked: number; review: number; skipped: number; failed: number }`
  - `interface InboxRunReportSummary { tiles: Record<InboxRunReportTile, ReportTileTotal>; byMonth: InboxRunMonth[]; retentionDays: number; retentionCutoff: string }` — `retentionCutoff` = kantoordag vandaag − `retentionDays` (yyyy-mm-dd).
- Produces (server): `export const invoiceInboxRunsReport` (`sqlReport`, `key: "invoice-inbox-runs"`, default `startedAt desc`; `tileWhere(tile, filter)` = periode op `officeDaySql(started_at)` plus `kolom > 0` behalve bij `runs`; `tileAmount` = `1` bij `runs`, anders de kolom; `select(tile)` zet `amount` op hetzelfde; maandcijfers = `sum(tileAmount(tile)) FILTER (WHERE tileWhere(tile))` per maand). Vehicle filter wordt genegeerd.
- Route: `const inboxRunGuards = [reportRight, hasPermission(UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS)]`; `mountReport(app, "/api/reports/invoice-inbox-runs", inboxRunGuards, invoiceInboxRunsReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`. Rondes met `db.insert(invoiceInboxRuns)` (`finishedAt` = start + 1 minuut, `trigger "scheduler"` tenzij genoemd; in `afterAll` op id verwijderen):
  - R1 `2019-02-03T10:00Z` mails 3, attachments 4, booked 2, review 1, skipped 1, failed 0
  - R2 `2019-02-20T10:00Z` mails 1, attachments 0, review 1, rest 0
  - R3 `2019-04-05T10:00Z` `trigger "manual"`, `triggeredBy "anna"`, mails 2, attachments 2, failed 2, `errors ["Onderwerp A: timeout", "Onderwerp B: timeout"]`
  - R4 `2019-05-01T10:00Z` alles 0
  - R5 `2018-12-31T23:30Z` (kantoordag 2019-01-01) mails 1, attachments 1, booked 1
  - R6 `2019-12-31T23:30Z` (kantoordag 2020-01-01: buiten) mails 5

```ts
it("tegels en maanden", async () => {
  const s = (await staff.get("/api/reports/invoice-inbox-runs/summary").query(Q)).body;
  expect(s.tiles).toEqual({
    runs: { count: 5, amount: 5 }, mails: { count: 4, amount: 7 }, attachments: { count: 3, amount: 7 },
    booked: { count: 2, amount: 3 }, review: { count: 2, amount: 2 }, skipped: { count: 1, amount: 1 }, failed: { count: 1, amount: 2 },
  });
  expect(s.byMonth).toEqual([
    { month: "2019-01", runs: 1, mails: 1, attachments: 1, booked: 1, review: 0, skipped: 0, failed: 0 },
    { month: "2019-02", runs: 2, mails: 4, attachments: 4, booked: 2, review: 2, skipped: 1, failed: 0 },
    { month: "2019-03", runs: 0, mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0 },
    { month: "2019-04", runs: 1, mails: 2, attachments: 2, booked: 0, review: 0, skipped: 0, failed: 2 },
    { month: "2019-05", runs: 1, mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0 },
  ]);
  expect(s.retentionDays).toBe(90);
  const today = dateInZone(new Date(), officeTimeZone());
  expect(s.retentionCutoff).toBe(new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10));
});
it("rij", async () => {
  const rows = (await staff.get("/api/reports/invoice-inbox-runs/rows").query({ ...Q, tile: "failed" })).body.rows;
  expect(rows).toEqual([{ id: R3, startedAt: "2019-04-05T10:00:00.000Z", finishedAt: "2019-04-05T10:01:00.000Z", trigger: "manual", triggeredBy: "anna",
    mails: 2, attachments: 2, booked: 0, review: 0, skipped: 0, failed: 2, errors: ["Onderwerp A: timeout", "Onderwerp B: timeout"], amount: 2 }]);
});
it("negeert het voertuigfilter", async () => {
  const s = (await staff.get("/api/reports/invoice-inbox-runs/summary").query({ ...Q, vehicleId: "999999" })).body;
  expect(s.tiles.mails).toEqual({ count: 4, amount: 7 });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/invoice-inbox-runs", Q, INBOX_RUN_REPORT_TILES));
it("rechten: rapportrecht én kosten- of instellingenrecht", async () => {
  // ["view_reports"] → 403; ["manage_expenses"] → 403; ["view_reports","manage_expenses"] → 200;
  // ["view_reports","manage_settings"] → 200; "admin" → 200 (summary, rows?tile=runs, export?tile=runs)
});
```
  (`staff = agentFor(["view_reports", "manage_expenses"])`.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-invoice-inbox-runs.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** shared types, rapport, mount-regel. `errors` uit jsonb: `Array.isArray(v) ? v.map(String) : []`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): invoice inbox runs report (server)`.

### Task 2: Factuurpostvak, facturen en redenen — server (onderdeel 12)

**Files:**
- Modify: `shared/reports/invoice-inbox-report.ts`
- Create: `server/services/reports/invoice-inbox-items-report.ts`
- Modify: `server/routes/reports.ts`
- Test: `server/__tests__/report-invoice-inbox-items.test.ts`

**Interfaces:**
- Consumes: Task 1; `invoiceInboxItems` (`shared/schema.ts:1459`), `auditLogs` (`:2516`), `vehicles`; `REVIEW_REASONS` (`shared/invoice-inbox.ts:56`).
- Produces (shared):
  - `INBOX_ITEM_REPORT_TILES = ["all", "autoBooked", "staffBooked", "waiting", "dismissed", "flagged"] as const`; `type InboxItemReportTile`
  - `INBOX_ITEM_REPORT_SORTS = ["receivedAt", "fromAddress", "outcome", "reviewReason"] as const`; `type InboxItemReportSort`
  - `type InboxItemOutcome = "autoBooked" | "staffBooked" | "waiting" | "dismissed"`
  - `interface InboxItemReportRow { id: number; receivedAt: string; mailDate: string | null; fromAddress: string | null; subject: string | null; attachmentName: string | null; status: string; outcome: InboxItemOutcome; reviewReason: string | null; vehicleId: number | null; licensePlate: string | null; processedAt: string | null; handledBy: string | null; amount: number }` — `handledBy` = `updated_by` bij `staffBooked` en `dismissed`, anders `null`; `amount` 0.
  - `interface InboxItemMonth { month: string; autoBooked: number; staffBooked: number; waiting: number; dismissed: number }`
  - `interface InboxReasonCount { reason: string; count: number }`
  - `interface InboxItemReportSummary { tiles: Record<InboxItemReportTile, ReportTileTotal>; byMonth: InboxItemMonth[]; byReason: InboxReasonCount[] }`
- Produces (server): `export const invoiceInboxItemsReport` (`sqlReport`, `key: "invoice-inbox-items"`, default `receivedAt desc`, `tileAmount` 0); één `staffBookedSql` en `outcomeSql` (CASE) gedeeld door `tileWhere`, `select` en maandcijfers. `FROM` = items `LEFT JOIN vehicles`. Voertuigfilter genegeerd (ruling 12).
- Route: `mountReport(app, "/api/reports/invoice-inbox-items", [reportRight, hasPermission(UserPermission.MANAGE_EXPENSES)], invoiceInboxItemsReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`. Regels met `db.insert(invoiceInboxItems)`, `attachmentHash` = `` `fixt-inbox-${n}-${Date.now()}` ``, postvakvelden `messageId "<n@fixt>"`, `fromAddress "lev@fixt.nl"`, `subject "Factuur n"` tenzij anders; in `afterAll` regels en de auditregel op id verwijderen:
  - I1 `booked`, created/updated by `"scheduler"`, received `2019-02-03T10:00Z`
  - I2 `booked`, created/updated by `"anna"`, received `2019-02-04T10:00Z`, plus `db.insert(auditLogs)` `{ action: "expense.inbox.book", resourceType: "invoice_inbox_item", resourceId: String(I2), username: "anna" }`
  - I3 `booked`, created `"scheduler"`, updated `"bram"`, received `2019-03-01T10:00Z`
  - I4 `review`, `reviewReason "no_plate"`, received `2019-03-02T10:00Z`
  - I5 `review`, `"no_plate"`, received `2019-03-03T10:00Z`
  - I6 `dismissed`, `"unknown_sender"`, updated `"bram"`, received `2019-03-04T10:00Z`
  - I7 `review`, `"parse_failed"`, received `2018-12-31T23:30Z` (kantoordag 2019-01-01)
  - I8 handmatige scan: `messageId`, `fromAddress`, `subject`, `mailDate` null, `booked`, created/updated `"anna"`, received `2019-02-05T10:00Z` (telt niet)
  - I9 `review`, `"no_plate"`, received `2019-12-31T23:30Z` (buiten)

```ts
it("tegels, maanden en redenen", async () => {
  const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query(Q)).body;
  expect(s.tiles).toEqual({
    all: { count: 7, amount: 0 }, autoBooked: { count: 1, amount: 0 }, staffBooked: { count: 2, amount: 0 },
    waiting: { count: 3, amount: 0 }, dismissed: { count: 1, amount: 0 }, flagged: { count: 4, amount: 0 },
  });
  expect(s.byMonth).toEqual([
    { month: "2019-01", autoBooked: 0, staffBooked: 0, waiting: 1, dismissed: 0 },
    { month: "2019-02", autoBooked: 1, staffBooked: 1, waiting: 0, dismissed: 0 },
    { month: "2019-03", autoBooked: 0, staffBooked: 1, waiting: 2, dismissed: 1 },
  ]);
  expect(s.byReason).toEqual([{ reason: "no_plate", count: 2 }, { reason: "parse_failed", count: 1 }, { reason: "unknown_sender", count: 1 }]);
});
it("zelf opgehaald en zelf geboekt telt als door kantoor geboekt", async () => {
  const rows = (await staff.get("/api/reports/invoice-inbox-items/rows").query({ ...Q, tile: "staffBooked", sort: "receivedAt", dir: "asc" })).body.rows;
  expect(rows.map((r: any) => r.id)).toEqual([I2, I3]);
  expect(rows[0]).toMatchObject({ outcome: "staffBooked", status: "booked", handledBy: "anna", reviewReason: null, amount: 0 });
});
it("de vier uitkomsten zijn samen alle regels", async () => {
  const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query(Q)).body;
  const { autoBooked, staffBooked, waiting, dismissed } = s.tiles;
  expect(autoBooked.count + staffBooked.count + waiting.count + dismissed.count).toBe(s.tiles.all.count);
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/invoice-inbox-items", Q, INBOX_ITEM_REPORT_TILES));
it("rechten: rapportrecht én kostenrecht", async () => {
  // ["view_reports"] → 403; ["view_reports","manage_settings"] → 403; ["manage_expenses"] → 403;
  // ["view_reports","manage_expenses"] → 200; "admin" → 200
});
```
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-invoice-inbox-items.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** types, rapport, mount-regel. `byReason`: `SELECT review_reason AS reason, count(*)::int FROM … WHERE tileWhere("flagged") GROUP BY 1 ORDER BY 2 DESC, 1 ASC`.
- [ ] **Step 4: Run** the test plus Task 1's test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): invoice inbox items report (server)`.

### Task 3: Bezorgen en ophalen — server (onderdeel 13)

**Files:**
- Create: `shared/reports/delivery-report.ts`
- Create: `server/services/reports/delivery-report.ts`
- Modify: `server/routes/reports.ts`
- Test: `server/__tests__/report-deliveries.test.ts`

**Interfaces:**
- Consumes: `sqlReport`, `rowsOf`, `textDaySql`, `officeDaySql`, `inPeriodSql`, `fillMonths`; `vehicleTransports` (`shared/schema.ts:2169`), `vehicles`, `customers`.
- Produces (shared):
  - `DELIVERY_REPORT_TYPES = ["delivery", "repossession"] as const`
  - `DELIVERY_REPORT_TILES = ["all", "onTime", "late", "open", "undated"] as const`; `type DeliveryReportTile`
  - `DELIVERY_REPORT_SORTS = ["scheduledDate", "completedDate", "transportType", "driver", "distanceKm", "daysLate"] as const`; `type DeliveryReportSort`
  - `type DeliveryPunctuality = "onTime" | "late" | "open" | "undated"`
  - `interface DeliveryReportRow { id: number; transportType: string; status: string; scheduledDate: string; completedDate: string | null; punctuality: DeliveryPunctuality; daysLate: number | null; vehicleId: number | null; licensePlate: string | null; isExternalVehicle: boolean; customerId: number | null; customerName: string | null; reservationId: number | null; driverName: string | null; distanceKm: number | null; amount: number }` — `amount` = `coalesce(distanceKm, 0)` (ruling 5).
  - `interface DeliveryMonth { month: string; onTime: number; late: number; open: number; undated: number }`
  - `interface DeliveryTypeCount { type: string; total: number; onTime: number; late: number; open: number; undated: number; km: number }`
  - `interface DeliveryDriverCount { driver: string | null; trips: number; onTime: number; late: number; km: number }`
  - `interface DeliveryReportSummary { tiles: Record<DeliveryReportTile, ReportTileTotal>; byMonth: DeliveryMonth[]; byType: DeliveryTypeCount[]; byDriver: DeliveryDriverCount[]; onTimePct: number | null; avgKmPerTrip: number | null; tripsWithDistance: number }` — `byType` in de volgorde van `DELIVERY_REPORT_TYPES`, alleen soorten met ritten.
- Produces (server): `export const deliveryReport` (`sqlReport`, `key: "deliveries"`, default `scheduledDate desc`); `punctualitySql` (CASE uit ruling 4) gedeeld door `tileWhere`, `select` en extras.
- Route: `const deliveryGuards = [reportRight, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS)]`; `mountReport(app, "/api/reports/deliveries", deliveryGuards, deliveryReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`; voertuig V, klant K; transporten met `db.insert(vehicleTransports)` (`vehicleId V`, `customerId K` tenzij anders; vóór `cleanupFixtures()` zelf verwijderen):
  - T1 `delivery` `completed`, gepland `"2019-03-04"`, klaar `"2019-03-04"`, `distanceKm "40"`, `driverName "Anna"`
  - T2 `delivery` `completed`, `"2019-03-05"` → `"2019-03-06"`, `"60"`, `"Anna"`
  - T3 `repossession` `completed`, `"2019-03-10"` → `"2019-03-09"`, `"20"`, `" Bram "`
  - T4 `repossession` `scheduled`, `"2019-04-01"`, geen afstand, geen chauffeur
  - T5 `delivery` `in_progress`, `"2019-04-02"`, `"10"`, `driverName ""`
  - T6 `delivery` `completed`, `"2019-04-03"`, `completedDate null`, `"30"`, `"Anna"`
  - T7 `delivery` `cancelled`, `"2019-03-04"`; T8 `swap` `completed`, `"2019-03-04"`; T9 `delivery` `scheduled`, `"2020-01-01"` (alle drie tellen niet)
  - T10 `delivery` `completed`, extern (`vehicleId null`, `isExternalVehicle true`, `externalLicensePlate "XX-99-XX"`), `"2019-05-01"` → `"2019-05-01"`, `"15"`, `"Bram"`
  - F1 `delivery` `scheduled`, gepland = kantoordag vandaag + 3, `"25"`; `Q2 = { from: vandaag, to: vandaag + 10 }`

```ts
it("tegels: km als bedrag, samen gelijk aan alles", async () => {
  const s = (await staff.get("/api/reports/deliveries/summary").query(Q)).body;
  expect(s.tiles).toEqual({
    all: { count: 7, amount: 175 }, onTime: { count: 3, amount: 75 }, late: { count: 3, amount: 70 },
    open: { count: 0, amount: 0 }, undated: { count: 1, amount: 30 },
  });
  expect(s.onTimePct).toBe(50);
  expect(s.avgKmPerTrip).toBe(29.2);
  expect(s.tripsWithDistance).toBe(6);
});
it("maanden, soorten en medewerkers", async () => {
  const s = (await staff.get("/api/reports/deliveries/summary").query(Q)).body;
  expect(s.byMonth).toEqual([
    { month: "2019-03", onTime: 2, late: 1, open: 0, undated: 0 },
    { month: "2019-04", onTime: 0, late: 2, open: 0, undated: 1 },
    { month: "2019-05", onTime: 1, late: 0, open: 0, undated: 0 },
  ]);
  expect(s.byType).toEqual([
    { type: "delivery", total: 5, onTime: 2, late: 2, open: 0, undated: 1, km: 155 },
    { type: "repossession", total: 2, onTime: 1, late: 1, open: 0, undated: 0, km: 20 },
  ]);
  expect(s.byDriver).toEqual([
    { driver: "Anna", trips: 3, onTime: 1, late: 1, km: 130 },
    { driver: "Bram", trips: 2, onTime: 2, late: 0, km: 35 },
    { driver: null, trips: 2, onTime: 0, late: 2, km: 10 },
  ]);
});
it("open is nog niet te laat", async () => {
  const s = (await staff.get("/api/reports/deliveries/summary").query(Q2)).body;
  expect(s.tiles.open).toEqual({ count: 1, amount: 25 });
  expect(s.tiles.late.count).toBe(0);
});
it("voertuigfilter laat externe ritten weg", async () => {
  const s = (await staff.get("/api/reports/deliveries/summary").query({ ...Q, vehicleId: String(V) })).body;
  expect(s.tiles.all).toEqual({ count: 6, amount: 160 });
  expect(s.tiles.onTime).toEqual({ count: 2, amount: 60 });
});
it("rij", async () => {
  const r = (await staff.get("/api/reports/deliveries/rows").query({ ...Q, tile: "late", sort: "scheduledDate", dir: "asc" })).body.rows[0];
  expect(r).toMatchObject({ id: T2, transportType: "delivery", status: "completed", scheduledDate: "2019-03-05", completedDate: "2019-03-06",
    punctuality: "late", daysLate: 1, driverName: "Anna", distanceKm: 60, vehicleId: V, customerId: K, amount: 60 });
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/deliveries", Q, DELIVERY_REPORT_TILES));
it("rechten: rapportrecht én voertuig- of reserveringsrecht", async () => {
  // ["view_reports"] → 403; ["view_vehicles"] → 403; ["view_reports","view_vehicles"] → 200;
  // ["view_reports","view_reservations"] → 200; ["manage_reports","manage_reservations"] → 200
});
```
  (`staff = agentFor(["view_reports", "view_vehicles"])`; `vandaag` = `dateInZone(new Date(), officeTimeZone())`.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-deliveries.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** types, rapport, mount-regel. Datums in de rij als `to_char(dag, 'YYYY-MM-DD')`; `licensePlate` zoals `transport-billing-report.ts:25`.
- [ ] **Step 4: Run** the test plus `server/__tests__/report-transport-billing.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): deliveries and collections report (server)`.

### Task 4: Schadechecks — server (onderdeel 14)

**Files:**
- Modify: `server/services/reports/report-kit.ts` (export `NON_EMPTY_JSON_ARRAY`)
- Modify: `server/services/reports/customer-value-report.ts` (lokale `NON_EMPTY_ARRAY` weg, import gebruiken)
- Create: `shared/reports/damage-checks-report.ts`
- Create: `server/services/reports/damage-checks-report.ts`
- Modify: `server/routes/reports.ts`
- Test: `server/__tests__/report-damage-checks.test.ts`

**Interfaces:**
- Consumes: `sqlReport`, `reportBreakdown`, `rowsOf`, `officeDaySql`, `inPeriodSql`, `fillMonths`; `interactiveDamageChecks` (`shared/schema.ts:2453`), `reservations`, `vehicles`, `customers`.
- Produces (server kit): `export const NON_EMPTY_JSON_ARRAY = "^\\s*\\[\\s*[^]\\s]"` in `report-kit.ts` (zelfde waarde als nu in klantwaarde).
- Produces (shared):
  - `DAMAGE_CHECK_REPORT_TILES = ["all", "pickup", "return", "withDamage"] as const`; `type DamageCheckReportTile`
  - `DAMAGE_CHECK_REPORT_SORTS = ["checkDate", "checkType", "licensePlate", "customer"] as const`; `type DamageCheckReportSort`
  - `interface DamageCheckReportRow { id: number; checkDate: string; checkType: string; vehicleId: number; licensePlate: string | null; reservationId: number | null; customerId: number | null; customerName: string | null; completedBy: string | null; hasDamage: boolean; amount: number }` — `amount` 0.
  - `interface DamageCheckMonth { month: string; pickup: number; return: number; withDamage: number }`
  - `interface DamageCheckReportSummary { tiles: Record<DamageCheckReportTile, ReportTileTotal>; byMonth: DamageCheckMonth[]; byVehicle: ReportBreakdownRow[]; byCustomer: ReportBreakdownRow[] }`
- Produces (server): `export const damageChecksReport` (`sqlReport`, `key: "damage-checks"`, default `checkDate desc`, `tileAmount` 0). `FROM` = checks `JOIN vehicles LEFT JOIN reservations r LEFT JOIN customers ON customers.id = r.customer_id`; basisvoorwaarde `(d.reservation_id IS NULL OR r.deleted_at IS NULL)`, periode op `officeDaySql(check_date)`, voertuigfilter op `d.vehicle_id`.
- Route: `mountReport(app, "/api/reports/damage-checks", [reportRight, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS)], damageChecksReport)`.

- [ ] **Step 1: Write failing tests.** `Q = { from: "2019-01-01", to: "2019-12-31" }`; voertuigen V1, V2; klanten A, B; reserveringen RA (A, V1), RA2 (A, V1), RB (B, V2), RD (A, V1, daarna `deletedAt` gezet). Checks met `db.insert(interactiveDamageChecks)` (in `afterAll` eerst de checks verwijderen — de FK naar reserveringen heeft geen cascade):
  - C1 RA `pickup` `2019-02-01T10:00Z` markers `'[{"x":1}]'`; C2 RA `return` `2019-02-10T10:00Z` `'[{"x":1},{"x":2}]'`
  - C3 RB `pickup` `2019-03-01T10:00Z` `'[]'`; C4 RB `return` `2019-03-05T10:00Z` `'geen json'`
  - C5 RA2 `return` `2019-03-20T10:00Z` `' [ {"x":3} ]'`
  - C6 zonder reservering, V2, `return` `2019-04-01T10:00Z` `'[{"x":4}]'`
  - C7 RD `return` `2019-04-02T10:00Z` `'[{"x":5}]'` (prullenbak: telt niet)
  - C8 zonder reservering, V1, `pickup` `2018-12-31T23:30Z` (kantoordag 2019-01-01), markers `null`
  - C9 zonder reservering, V1, `return` `2019-12-31T23:30Z` `'[{"x":1}]'` (buiten)

```ts
it("tegels, maanden en meeste schades", async () => {
  const s = (await staff.get("/api/reports/damage-checks/summary").query(Q)).body;
  expect(s.tiles).toEqual({ all: { count: 7, amount: 0 }, pickup: { count: 3, amount: 0 }, return: { count: 4, amount: 0 }, withDamage: { count: 3, amount: 0 } });
  expect(s.byMonth).toEqual([
    { month: "2019-01", pickup: 1, return: 0, withDamage: 0 },
    { month: "2019-02", pickup: 1, return: 1, withDamage: 1 },
    { month: "2019-03", pickup: 1, return: 2, withDamage: 1 },
    { month: "2019-04", pickup: 0, return: 1, withDamage: 1 },
  ]);
  expect(s.byVehicle).toEqual([{ key: V1, label: plate1, count: 2, amount: 0 }, { key: V2, label: plate2, count: 1, amount: 0 }]);
  expect(s.byCustomer).toEqual([{ key: A, label: nameA, count: 2, amount: 0 }, { key: null, label: null, count: 1, amount: 0 }]);
});
it("voertuigfilter", async () => {
  const s = (await staff.get("/api/reports/damage-checks/summary").query({ ...Q, vehicleId: String(V1) })).body;
  expect(s.tiles.all.count).toBe(4);
  expect(s.tiles.withDamage.count).toBe(2);
});
it("rij", async () => {
  const r = (await staff.get("/api/reports/damage-checks/rows").query({ ...Q, tile: "withDamage", sort: "checkDate", dir: "asc" })).body.rows[0];
  expect(r).toMatchObject({ id: C2, checkDate: "2019-02-10T10:00:00.000Z", checkType: "return", vehicleId: V1, licensePlate: plate1,
    reservationId: RA, customerId: A, customerName: nameA, hasDamage: true, amount: 0 });
});
it("zelfde aantal per klant als klantwaarde", async () => {
  const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...Q, tile: "costs", pageSize: "250" })).body.rows;
  expect(rows.find((x: any) => x.customerId === A).damageChecks).toBe(2);
});
it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/damage-checks", Q, DAMAGE_CHECK_REPORT_TILES));
it("rechten: rapportrecht én schadecheckrecht", async () => {
  // ["view_reports"] → 403; ["view_damage_checks"] → 403; ["view_reports","view_damage_checks"] → 200;
  // ["manage_reports","manage_damage_checks"] → 200; "admin" → 200
});
```
  (`staff = agentFor(["view_reports", "view_damage_checks"])`.)
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-damage-checks.test.ts` — Expected: FAIL (404).
- [ ] **Step 3: Implement** kitconstante, klantwaarde-import, types, rapport, mount-regel. `hasDamage` = `(check_type = 'return' AND coalesce(damage_markers, '') ~ NON_EMPTY_JSON_ARRAY)`, één SQL-fragment voor `tileWhere("withDamage")` en `select`.
- [ ] **Step 4: Run** the test plus `server/__tests__/report-customer-value.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): damage checks report (server)`.

### Task 5: Tabblad Kantoor met factuurpostvak-kaart

**Files:**
- Create: `client/src/pages/reports/invoice-inbox-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (`TAB_COLS` regel 85; rechten bij regel 186-195; trigger na Portaal; `TabsContent value="office"` na Portaal)
- Modify: `client/src/locales/*/reports.json` (`reportsPage.tabs.office`, `officeReports.vehicleFilterIgnored`, blok `officeReports.inbox`)
- Test: `client/src/pages/reports/__tests__/office-reports.test.tsx` (nieuw; Tasks 6 en 7 voegen cases toe), `client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` (cases erbij)

**Interfaces:**
- Consumes: Tasks 1-2 shared types; `ReportTiles`, `ReportMonthChart`, `ReportDetailDialog`, `ReportColumn`; `expenses:invoiceInbox.reasons.*` (`useTranslation(["reports", "expenses"])`); `csvDateTime`, `csvNumber`; `formatDateTime`.
- Produces:
  - In `index.tsx`: `const canViewReports = useHasPermission(VIEW_REPORTS, MANAGE_REPORTS)`, `const canManageSettings = useHasPermission(MANAGE_SETTINGS)`, `const canViewDamageChecks = useHasPermission(VIEW_DAMAGE_CHECKS, MANAGE_DAMAGE_CHECKS)`, `const canViewOffice = canViewReports && (canViewExpenses || canManageSettings || canViewTransports || canViewDamageChecks)`; `TAB_COLS` met `9: "grid-cols-9"` en aantal `6 + fiscaal + portaal + (canViewOffice ? 1 : 0)`; `<TabsTrigger value="office" data-testid="tab-report-office">` (icoon `Building2`); `TabsContent value="office"` met `<InvoiceInboxReportCard from={reportFrom} to={reportTo} vehicleId={selectedVehicle} />`.
  - `InvoiceInboxReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-invoice-inbox-report"`; alleen met rapportrecht én (`MANAGE_EXPENSES` of `MANAGE_SETTINGS`). Stuurt nooit `vehicleId`; toont `invoice-inbox-vehicle-filter-ignored` bij een gekozen voertuig ≠ `"all"`.
    - Deel ophaalrondes (altijd): tegels `testIdPrefix="invoice-inbox-runs"`, waarde = `amount`, hint `officeReports.inbox.runsHint` (`{{count}} rondes`, meervoud); `invoice-inbox-retention` (`officeReports.inbox.retention`, `{{days}}`) als `from` (of standaard 1 januari) vóór `retentionCutoff` ligt; `ReportMonthChart` gestapeld (`booked` groen `#16a34a`, `review` amber `#f59e0b`, `skipped` grijs `#9ca3af`, `failed` rood `#dc2626`), `testId="invoice-inbox-runs-month-chart"`. Dialoogkolommen: gestart, door (`scheduler` → `officeReports.inbox.scheduler`, anders `triggeredBy`), mails, bijlagen, geboekt, ter controle, overgeslagen, mislukt, fouten (`errors.join("; ")`). `csvSubject` `ophaalrondes`, `reportName` `invoice-inbox-runs`, default sort `startedAt desc`.
    - Deel facturen (alleen met `MANAGE_EXPENSES`; anders geen verzoek): tegels `testIdPrefix="invoice-inbox-items"`, waarde = `count`; regel `officeReports.inbox.reasonsNote` (ruling 10); `ReportMonthChart` gestapeld (`autoBooked`, `staffBooked`, `waiting`, `dismissed`); tabel `invoice-inbox-reasons` (reden via `expenses:invoiceInbox.reasons.${reason}` met `defaultValue: reason`, aantal). Dialoogkolommen: ontvangen, afzender, onderwerp, bijlage, uitkomst, reden, kenteken, afgehandeld door. `csvSubject` `factuurpostvak`, `reportName` `invoice-inbox-items`, default sort `receivedAt desc`.

- [ ] **Step 1: Write failing tests:**
  - `reports-query-permissions.test.tsx`: `[VIEW_REPORTS]` ⇒ geen `tab-report-office`, geen verzoek dat begint met `/api/reports/invoice-inbox`, `/api/reports/deliveries` of `/api/reports/damage-checks`; `[VIEW_REPORTS, MANAGE_SETTINGS]` ⇒ tab zichtbaar, klik ⇒ `card-invoice-inbox-report`, verzoek naar `/api/reports/invoice-inbox-runs/summary`, géén verzoek naar `/api/reports/invoice-inbox-items`.
  - `office-reports.test.tsx` (`useAuth`, `downloadCsv` en `fetch` gemockt zoals `customer-portal-reports.test.tsx`), permissions `["view_reports","manage_expenses"]`, `from="2019-01-01" to="2019-12-31" vehicleId="12"`:
    - verzoeken precies `/api/reports/invoice-inbox-runs/summary?from=2019-01-01&to=2019-12-31` en `/api/reports/invoice-inbox-items/summary?from=2019-01-01&to=2019-12-31`; `invoice-inbox-vehicle-filter-ignored` zichtbaar;
    - runs-stub `mails: { count: 4, amount: 7 }` ⇒ `invoice-inbox-runs-tile-mails-value` = `"7"`; `retentionCutoff: "2026-07-27"` ⇒ `invoice-inbox-retention` zichtbaar; met `from="2026-08-01"` niet;
    - items-stub `byReason: [{ reason: "no_plate", count: 2 }, { reason: "iets_nieuws", count: 1 }]` ⇒ tabel toont `Geen kenteken gevonden` (nl-label `expenses.json` `invoiceInbox.reasons.no_plate`) en `iets_nieuws`;
    - klik `button-invoice-inbox-items-tile-staffBooked` ⇒ verzoek `/api/reports/invoice-inbox-items/rows?from=2019-01-01&to=2019-12-31&tile=staffBooked&sort=receivedAt&dir=desc&page=1&pageSize=50`;
    - permissions `["view_reports","manage_settings"]` ⇒ kaart zichtbaar, geen verzoek naar `/api/reports/invoice-inbox-items`; permissions `["view_reports"]` ⇒ geen kaart, geen verzoek.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/office-reports.test.tsx client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** tab, kaart, sleutels `reportsPage.tabs.office`, `officeReports.vehicleFilterIgnored`, `officeReports.inbox.{title, description, runsTitle, itemsTitle, runsHint_one/_other (+_few/_many), retention, scheduler, reasonsNote, byMonth, reasons, reasonsEmpty, outcome.*, tiles.runs.*, tiles.items.*, columns.runs.*, columns.items.*, csvSubjectRuns, csvSubjectItems}` in 7 talen.
- [ ] **Step 4: Run** the tests plus `client/src/__tests__/locale-parity.test.tsx client/src/pages/reports/__tests__/reports-fiscal-only.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): Kantoor tab with invoice inbox report`.

### Task 6: Bezorgen en ophalen — kaart op Kantoor

**Files:**
- Create: `client/src/pages/reports/delivery-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (in `TabsContent value="office"`, onder de factuurpostvak-kaart)
- Modify: `client/src/locales/*/reports.json` (blok `officeReports.delivery`)
- Test: cases in `office-reports.test.tsx`

**Interfaces:**
- Consumes: Task 3 shared types; kitcomponenten; `delivery:transportDialog.typeLabels.*` (nl `Levering`, `Terughalen`).
- Produces: `DeliveryReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-delivery-report"`; alleen met rapportrecht én een van `VIEW_VEHICLES`, `MANAGE_VEHICLES`, `VIEW_RESERVATIONS`, `MANAGE_RESERVATIONS`; stuurt `vehicleId` mee (behalve `"all"`). Tegels (`testIdPrefix="delivery"`, waarde = `count`, hint `officeReports.delivery.kmHint` = `{{km}} km` met 1 decimaal; tonen `onTime` groen, `late` rood, `open` amber). Regels `delivery-on-time-pct` (`{{pct}}%`, "–" bij `null`) en `delivery-avg-km` (`{{km}} km per rit`, "–" bij `null`). `ReportMonthChart` gestapeld (`onTime` `#16a34a`, `late` `#dc2626`, `open` `#3b82f6`, `undated` `#9ca3af`). Tabel `delivery-by-type` (soort, totaal, op tijd, te laat, open, km) en tabel `delivery-by-driver` (`null` → `officeReports.delivery.unknownDriver`; medewerker, ritten, op tijd, te laat, km). Dialoogkolommen: gepland, afgerond, soort, status, kenteken (extern met `officeReports.delivery.external`), klant, chauffeur, km, dagen te laat. Default sort `scheduledDate desc`, bij tegel `open` `scheduledDate asc`. `csvSubject` `bezorgen-ophalen`, `reportName` `deliveries`.

- [ ] **Step 1: Write failing tests:** permissions `["view_reports","view_reservations"]`, `vehicleId="12"`: verzoek `/api/reports/deliveries/summary?from=2019-01-01&to=2019-12-31&vehicleId=12`; summary-stub `onTimePct: 50`, `avgKmPerTrip: 29.2` ⇒ `delivery-on-time-pct` bevat `50%`, `delivery-avg-km` bevat `29,2`; `byType[0].type = "repossession"` ⇒ tabel toont `Terughalen`; `byDriver` met `driver: null` ⇒ `Onbekend`; klik `button-delivery-tile-open` ⇒ verzoek `/api/reports/deliveries/rows?from=2019-01-01&to=2019-12-31&vehicleId=12&tile=open&sort=scheduledDate&dir=asc&page=1&pageSize=50`; permissions `["view_reports","manage_expenses"]` ⇒ geen `card-delivery-report`, geen verzoek naar `/api/reports/deliveries`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/office-reports.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** kaart, plaatsing, sleutels `officeReports.delivery.{title, description, kmHint, onTimePct, avgKm, none, byMonth, byType, byDriver, unknownDriver, external, punctuality.*, tiles.*, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** the test plus parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): deliveries report on Kantoor`.

### Task 7: Schadechecks — kaart op Kantoor

**Files:**
- Create: `client/src/pages/reports/damage-checks-report-card.tsx`
- Modify: `client/src/pages/reports/index.tsx` (onder de bezorgkaart)
- Modify: `client/src/locales/*/reports.json` (blok `officeReports.damage`)
- Test: cases in `office-reports.test.tsx` en `reports-query-permissions.test.tsx`

**Interfaces:**
- Consumes: Task 4 shared types; `ReportTiles`, `ReportMonthChart`, `ReportBreakdownTable` (`hideAmount`), `ReportDetailDialog`.
- Produces: `DamageChecksReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string })` — `data-testid="card-damage-checks-report"`; alleen met rapportrecht én `VIEW_DAMAGE_CHECKS`/`MANAGE_DAMAGE_CHECKS`; stuurt `vehicleId` mee. Tegels (`testIdPrefix="damage-checks"`, waarde = `count`, `withDamage` rood). Regel `officeReports.damage.withDamageNote` (alleen inleverchecks met markers). `ReportMonthChart` niet gestapeld (`pickup` `#3b82f6`, `return` `#16a34a`, `withDamage` `#dc2626`). `ReportBreakdownTable` `damage-checks-by-vehicle` (nullLabel `officeReports.damage.unknownVehicle`) en `damage-checks-by-customer` (nullLabel `officeReports.damage.noReservation` = "Zonder reservering"), beide `hideAmount`. Dialoogkolommen: datum, soort (`officeReports.damage.checkType.pickup/return`), kenteken, klant, reservering (`#id`), uitgevoerd door, schade (ja/nee). `csvSubject` `schadechecks`, `reportName` `damage-checks`, default sort `checkDate desc`.

- [ ] **Step 1: Write failing tests:**
  - `office-reports.test.tsx`, permissions `["view_reports","view_damage_checks"]`: verzoek `/api/reports/damage-checks/summary?from=2019-01-01&to=2019-12-31&vehicleId=12`; stub `withDamage: { count: 3, amount: 0 }` ⇒ `damage-checks-tile-withDamage-value` = `"3"`; `byCustomer: [{ key: null, label: null, count: 1, amount: 0 }]` ⇒ `Zonder reservering`; klik `button-damage-checks-tile-withDamage` ⇒ verzoek `/api/reports/damage-checks/rows?from=2019-01-01&to=2019-12-31&vehicleId=12&tile=withDamage&sort=checkDate&dir=desc&page=1&pageSize=50`.
  - `reports-query-permissions.test.tsx`: `[VIEW_REPORTS, VIEW_DAMAGE_CHECKS]` ⇒ tab `tab-report-office`, klik ⇒ `card-damage-checks-report` aanwezig, `card-invoice-inbox-report` en `card-delivery-report` afwezig, geen verzoek naar `/api/reports/invoice-inbox` of `/api/reports/deliveries`.
- [ ] **Step 2: Run** `npx vitest run client/src/pages/reports/__tests__/office-reports.test.tsx client/src/pages/reports/__tests__/reports-query-permissions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** kaart, plaatsing, sleutels `officeReports.damage.{title, description, withDamageNote, byMonth, byVehicle, byCustomer, unknownVehicle, noReservation, checkType.pickup, checkType.return, yes, no, tiles.*, columns.*, csvSubject}` in 7 talen.
- [ ] **Step 4: Run** the tests plus parity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): damage checks report on Kantoor`.

### Task 8: Afronden

- [ ] Run `npx vitest run server/__tests__/report-invoice-inbox-runs.test.ts server/__tests__/report-invoice-inbox-items.test.ts server/__tests__/report-deliveries.test.ts server/__tests__/report-damage-checks.test.ts server/__tests__/report-customer-value.test.ts server/__tests__/report-transport-billing.test.ts server/__tests__/report-kit.test.ts server/__tests__/fix-i-permission-matrix.test.ts` en `npx vitest run client/src/components/reports client/src/pages/reports client/src/__tests__/locale-parity.test.tsx` — Expected: PASS (bekende rode tests op `main` buiten beschouwing). `npx tsc --noEmit -p .` — geen uitvoer.
- [ ] In de browser (dev server `start`), als admin, periode 1 januari – vandaag: tabblad Kantoor toont drie kaarten; de melding over 90 dagen staat er bij de ophaalrondes; tegels openen lijsten met hetzelfde aantal; CSV en Afdrukken werken; de bezorgkaart volgt het voertuigfilter, het factuurpostvak toont de melding dat het filter niet geldt. Als medewerker met alleen `view_reports` + `view_damage_checks`: alleen de schadecheckkaart. Met alleen `view_reports`: geen tabblad Kantoor.
- [ ] Handleiding (`docs/gebruikershandleiding`) alleen bijwerken als een pagina de tabbladen van Rapporten beschrijft.
- [ ] Kees vragen voor merge naar `main` en push (geen migratie in deze fase), en de open vragen hieronder voorleggen.

## Open vragen voor Kees

- **`delivery_tasks` is leeg in de praktijk.** Rapport 13 leest daarom de transporten Levering en Terughalen (ruling 1-2). Aanbeveling: zo laten; wissel en slepen blijven in het transportfactuurrapport. Wil Kees ze hier ook zien, dan is dat één regel in `DELIVERY_REPORT_TYPES`.
- **Reden van controle verdwijnt bij boeken.** De boekroute wist `review_reason` als kantoor een factuur na controle boekt, dus "meest voorkomende redenen" telt alleen wat nog wacht of is afgewezen. Aanbeveling: in een aparte kleine wijziging de reden laten staan bij boeken (de lijst "Te controleren" filtert op status, niet op reden); vanaf dan telt het rapport alle controles mee.
- **Ophaalrondes worden 90 dagen bewaard.** Maandcijfers voor mails en mislukte rondes van langer geleden zijn er niet; de facturen zelf wel. Aanbeveling: zo laten (de kaart meldt het); langer bewaren kan door `RUN_LOG_RETENTION_DAYS` te verhogen (± 35.000 rijen per jaar bij elke 15 minuten).

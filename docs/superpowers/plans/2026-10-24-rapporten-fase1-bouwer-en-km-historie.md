# Rapporten fase 1: rapportbouwer repareren en km-historie per auto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De rapportbouwer werkt voor elk veld dat hij aanbiedt, en elke auto krijgt een volledige km-historie (vanaf nu bijgehouden, uit het verleden aangevuld) die alleen een admin kan zien, afdrukken en downloaden.

**Architecture:** Een nieuwe tabel `vehicle_mileage_readings` met één regel per km-stand. Eén service (`server/services/mileage-history.ts`) schrijft, vervalt en leest regels; elke plek die nu een km-stand opslaat roept hem aan in dezelfde transactie/request. Een pure functie in `shared/mileage-history.ts` rekent gereden km, samenvatting en waarschuwingen uit, zodat server, scherm en afdruk hetzelfde tonen. Eén React-paneel toont de historie in het voertuigscherm en in Rapporten > Voertuigen.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL, React + TanStack Query, recharts, vitest (server tegen echte testdatabase, client in jsdom), i18next (7 talen).

**Spec:** `docs/superpowers/specs/2026-10-24-rapporten-uitbreiding-design.md` (onderdelen 0 en K, plus de besluiten over km-rechten en de bestaande km-grafiek).

## Global Constraints

- Km-historie: **alles alleen admin** — bekijken, afdrukken, CSV, routes (`requireAdmin`, `server/middleware/permissions.ts:171`). Niet in het klantportaal.
- De bestaande grafiek "km per maand" op Financieel (`GET /api/reports/mileage-per-month`) wordt ook alleen admin.
- Bronnen: `pickup`, `return`, `damage_check`, `manual`, `portal`, `service`, `import`.
- Portaal: alleen een stand die op kantoor is overgenomen (handmatig of automatisch) komt erin, bron `portal`.
- Teruggedraaid/verwijderd: regel blijft, wordt vervallen (`voidedAt`, `voidedBy`); telt niet mee in samenvatting en waarschuwingen; grijs in de lijst.
- Onlogische sprong: meer dan **2.000 km per dag** tussen twee geldige standen. Teruglopende stand: lager dan de vorige geldige.
- Terughalen uit activiteitenlog: alleen regels met oude en nieuwe km-stand en tijdstip; bron `import`; zonder gebruiker heet de melder "systeem". Idempotent.
- Schema-wijziging alleen additief via `startup-migration.js`; nooit `drizzle-kit push` in productie. `schema-columns.json` regenereren (`npm run schema:export`), drift-test `scripts/export-schema.test.ts` groen.
- Teksten in nl, en, es, pt, it, ro, pl; `client/src/__tests__/locale-parity.test.tsx` groen (ook `_many`-meervoud voor es/pt/it/pl).
- CSV via `downloadCsv` (`client/src/lib/csv.ts`); afdrukken via `HtmlPreviewDialog` (`client/src/components/documents/html-preview-dialog.tsx`) met `escapeHtml` op elke waarde.
- Datums in de kantoortijdzone (`officeTimeZone()` server, `officeToday()` client).

## Review Focus

1. Twee writers voor dezelfde gebeurtenis (bijv. schadecheck die ook de reservering-pickup zet) mogen geen twee regels opleveren: één regel per bronrij — test in Task 4.
2. Een teruggedraaide ophaal geeft geen "teruglopende stand"-waarschuwing — test in Task 3 (pure functie) en Task 4 (revert).
3. Terughalen twee keer draaien levert geen dubbele regels — test in Task 5.
4. Een niet-admin met alle rapportrechten krijgt 403 op elke km-route en ziet geen km-tab/-kaart — tests in Task 6 en Task 7.
5. Auto zonder enige stand, of één stand: paneel en afdruk tonen "geen standen" / geen deling door nul in gemiddeld per maand — test in Task 3 en Task 7.

---

### Task 1: Rapportbouwer — alleen velden die bestaan

**Files:**
- Modify: `shared/report-builder-config.ts:133-167`
- Modify: `server/database-storage.ts:6499-6560` (`executeReport`)
- Modify: `server/routes/reports.ts:142-144`
- Test: `server/__tests__/report-builder-fields.test.ts` (nieuw)

**Interfaces:**
- Produces: `export const RENAMED_REPORT_FIELDS: Record<string, string>` en `export const REMOVED_REPORT_FIELDS: ReadonlySet<string>` in `shared/report-builder-config.ts`, sleutels `"<table>.<field>"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("elk aangeboden veld van elke bron is opvraagbaar", async () => {
  for (const source of DATA_SOURCES) for (const field of source.fields) {
    const res = await admin.post("/api/reports/execute").send({ dataSources: [source.id], columns: [{ table: source.table, field: field.name }] });
    expect(res.status, `${source.id}.${field.name}`).toBe(200);
  }
});
it("een opgeslagen rapport met een oude veldnaam werkt nog", async () => {
  const res = await admin.post("/api/reports/execute").send({ dataSources: ["reservations"], columns: [{ table: "reservations", field: "totalAmount" }] });
  expect(res.status).toBe(200);
});
it("een verwijderd veld geeft een duidelijke melding", async () => {
  const res = await admin.post("/api/reports/execute").send({ dataSources: ["reservations"], columns: [{ table: "reservations", field: "paidAmount" }] });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("REPORT_FIELD_REMOVED");
  expect(res.body.field).toBe("reservations.paidAmount");
});
```

- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-fields.test.ts` — Expected: FAIL (`Field not queryable`).
- [ ] **Step 3: Implement.** Config: `reservationType`→`type`, `totalAmount`→`totalPrice`, `drivers.isPrimary`→`isPrimaryDriver`; remove `dailyRate`, `paymentStatus`, `paidAmount`, `expenses.mileage`. `RENAMED_REPORT_FIELDS = { "reservations.reservationType": "type", "reservations.totalAmount": "totalPrice", "drivers.isPrimary": "isPrimaryDriver" }`; `REMOVED_REPORT_FIELDS = { reservations.dailyRate, reservations.paymentStatus, reservations.paidAmount, expenses.mileage }`. In `executeReport` map columns/filters/groupBy through the renames before resolving; a removed field throws `ReportValidationError` with `code = "REPORT_FIELD_REMOVED"` and `field`; the route returns `{ message, code, field }`. The client shows the message (no extra UI).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `fix(rapporten): report builder offers only fields that exist`.

### Task 2: Tabel en migratie

**Files:**
- Modify: `shared/schema.ts` (na `emailLogs`)
- Modify: `startup-migration.js` (expliciete stap, patroon `portal_activity_log` regels 1852-1864)
- Modify: `schema-columns.json` (via `npm run schema:export`)
- Test: `scripts/export-schema.test.ts` (bestaand)

**Interfaces:**
- Produces: `vehicleMileageReadings` pgTable, `type VehicleMileageReading`, `type MileageSource = "pickup" | "return" | "damage_check" | "manual" | "portal" | "service" | "import"`, `MILEAGE_SOURCES` (in `shared/mileage-history.ts`, Task 3).

Kolommen: `id serial pk`, `vehicle_id integer not null references vehicles(id) on delete cascade`, `mileage integer not null`, `recorded_at timestamptz not null`, `source text not null`, `source_table text`, `source_id integer`, `actor_name text`, `voided_at timestamptz`, `voided_by text`, `created_at timestamptz not null default now()`. Indexen: `(vehicle_id, recorded_at)`; uniek `(source, source_table, source_id)` waar `source_id is not null`.

- [ ] **Step 1:** Add the table to `shared/schema.ts` and the explicit `createTableIfNotExists` + two `CREATE INDEX IF NOT EXISTS` steps to `startup-migration.js`.
- [ ] **Step 2:** Run `npm run schema:export` then `npx vitest run scripts/export-schema.test.ts` — Expected: PASS.
- [ ] **Step 3:** Run `node startup-migration.js` against the local test DB (`.env`) — Expected: log line for the new table, no error; second run is a no-op.
- [ ] **Step 4: Commit** `feat(km): vehicle_mileage_readings table`.

### Task 3: Pure berekening en schrijf-/leesservice

**Files:**
- Create: `shared/mileage-history.ts`
- Create: `shared/mileage-history.test.ts`
- Create: `server/services/mileage-history.ts`
- Test: `server/__tests__/mileage-history-service.test.ts`

**Interfaces:**
- Produces (shared):
  - `MILEAGE_JUMP_KM_PER_DAY = 2000`
  - `interface MileageRow { id: number; mileage: number; recordedAt: string; source: MileageSource; actorName: string | null; voided: boolean }`
  - `interface AnalysedRow extends MileageRow { drivenSincePrevious: number | null; warning: "decrease" | "jump" | null }`
  - `analyseMileage(rows: MileageRow[], opts: { from: string; to: string; freeKmPerDay: number | null }): { rows: AnalysedRow[]; summary: { drivenKm: number; avgPerMonth: number | null; freeKm: number | null; overFreeKm: number | null; readings: number; warnings: number } }` — rows sorted by `recordedAt`, then `id`; voided rows get `drivenSincePrevious = null`, `warning = null` and are skipped as "previous".
- Produces (server):
  - `recordMileageReading(exec: DbOrTx, r: { vehicleId: number; mileage: number; recordedAt: Date; source: MileageSource; sourceTable?: string; sourceId?: number; actorName?: string | null }): Promise<void>` — upsert on `(source, source_table, source_id)`; on conflict update `mileage`, `recorded_at`, `actor_name`, clear `voided_at`/`voided_by`. Ignores `mileage <= 0` or non-finite.
  - `voidMileageReadings(exec: DbOrTx, m: { sourceTable: string; sourceId: number; source?: MileageSource }, by: string): Promise<number>`
  - `getMileageHistory(vehicleId: number, from: string, to: string): Promise<{ vehicle: { id; licensePlate; brand; model; freeKmPerDay }; rows: AnalysedRow[]; summary }>` — reads rows within [from, to] office dates plus the last valid row before `from` (as baseline, not listed).

- [ ] **Step 1: Write failing unit tests** in `shared/mileage-history.test.ts`:

```ts
it("gereden km sinds vorige en samenvatting", () => {
  const out = analyseMileage([row(1, 10000, "2026-01-01"), row(2, 12500, "2026-02-01")], { from: "2026-01-01", to: "2026-02-28", freeKmPerDay: 50 });
  expect(out.rows[1].drivenSincePrevious).toBe(2500);
  expect(out.summary.drivenKm).toBe(2500);
  expect(out.summary.freeKm).toBe(50 * 59);
});
it("teruglopende stand en onlogische sprong", () => {
  const out = analyseMileage([row(1, 10000, "2026-01-01"), row(2, 9000, "2026-01-02"), row(3, 20000, "2026-01-03")], P);
  expect(out.rows[1].warning).toBe("decrease");
  expect(out.rows[2].warning).toBe("jump");
});
it("een vervallen regel geeft geen waarschuwing en telt niet mee", () => {
  const out = analyseMileage([row(1, 10000, "2026-01-01"), { ...row(2, 9000, "2026-01-02"), voided: true }, row(3, 10100, "2026-01-03")], P);
  expect(out.rows[1].warning).toBeNull();
  expect(out.rows[2].drivenSincePrevious).toBe(100);
  expect(out.summary.warnings).toBe(0);
});
it("geen of één stand: geen deling door nul", () => {
  expect(analyseMileage([], P).summary).toMatchObject({ drivenKm: 0, avgPerMonth: null, readings: 0 });
  expect(analyseMileage([row(1, 5, "2026-01-01")], P).summary.avgPerMonth).toBe(0);
});
```

- [ ] **Step 2: Run** `npx vitest run shared/mileage-history.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `analyseMileage` (jump = `(mileage − prev) / max(1, days between) > MILEAGE_JUMP_KM_PER_DAY`; days in period inclusive; `avgPerMonth = drivenKm / (days/30.44)` rounded, `null` with 0 readings).
- [ ] **Step 4: Write failing service test**: record twice for the same `(pickup, reservations, id)` ⇒ 1 row with the second mileage; void ⇒ `voidedAt` set; record again ⇒ un-voided; `getMileageHistory` returns baseline-aware `drivenSincePrevious` for the first listed row.
- [ ] **Step 5: Implement** the service; run both test files — Expected: PASS.
- [ ] **Step 6: Commit** `feat(km): mileage history service and analysis`.

### Task 4: Elke km-stand vastleggen

**Files (modify, record in the same transaction where one exists):**
- `server/database-storage.ts` — `pickupReservation` (≈3135, after DS:3249): `pickup`/`reservations`/reservationId; `returnReservation` (≈3287, after DS:3376): `return`; `completeMaintenance` (≈5742): `service`/`reservations`/reservationId when a reading is written.
- `server/routes.ts` — status route (R:4912-4931 `pickup`; R:4959-4974 `return`); reservation edit (R:5166-5320: `pickup`/`return` on the edited value); damage check create/update (R:8891-8923, R:9047-9079): `damage_check`/`interactive_damage_checks`/checkId; damage check delete (R:9313): `voidMileageReadings(... interactive_damage_checks, id)`; `PATCH /api/vehicles/:id` (R:1800-1818) and `PATCH /api/vehicles/:id/mileage` (R:1936-2010): `manual`, no sourceId, when `currentMileage` changed; `POST /api/vehicles` (R:1125): `manual` when `currentMileage` given.
- `server/routes/portal-requests.ts` — apply-mileage (line 125): `portal`/`portal_requests`/requestId, actor = customer name from the request; automatic path (474-477): same, actor "systeem".
- `server/services/reservation-revert.ts` (484-503) — `voidMileageReadings({ sourceTable: "reservations", sourceId, source: "pickup" | "return" }, actor)`.
- Damage check writes to the reservation (R:8891-8900) must **not** also record `pickup`/`return`: the `damage_check` row is the one reading.
- Test: `server/__tests__/mileage-history-recording.test.ts`

Actor: `req.user?.username ?? "systeem"` (staff), `recordedAt`: the handover time if the route has one, else now.

- [ ] **Step 1: Write failing tests** (real DB, fixture vehicle/customer/reservation): pickup ⇒ one `pickup` row; return ⇒ one `return` row; revert of the return ⇒ that row voided and no `decrease` warning in `getMileageHistory`; damage check create on a pickup ⇒ exactly one row (`damage_check`), update ⇒ still one with new mileage, delete ⇒ voided; `PATCH /api/vehicles/:id { currentMileage }` ⇒ one `manual` row with the username; portal apply-mileage ⇒ one `portal` row; complete-maintenance with a reading ⇒ one `service` row.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/mileage-history-recording.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the calls listed above.
- [ ] **Step 4: Run** the new test plus the existing suites that cover these routes: `npx vitest run server/__tests__ -t "pickup|return|revert|damage|mileage|maintenance|portal-request"` — Expected: PASS (no regressions).
- [ ] **Step 5: Commit** `feat(km): record every odometer reading in the history`.

### Task 5: Verleden terughalen

**Files:**
- Create: `server/services/mileage-backfill.ts`
- Modify: `server/index.ts` (start after migrations, like the other boot jobs; failures logged, never fatal)
- Test: `server/__tests__/mileage-backfill.test.ts`

**Interfaces:**
- Produces: `backfillMileageHistory(): Promise<{ inserted: number; skipped: number }>`; app setting key `mileage_history_backfill_v1` set to the finish time after a complete run (skip when present).

Sources and mapping: reservations not deleted — `pickupMileage` at `actualPickupDate ?? startDate` (`pickup`), `returnMileage` at `actualReturnDate ?? endDate` (`return`), sourceId = reservation id; damage checks — `mileage` at `checkDate` (`damage_check`, sourceId = check id), skipped when the check's reservation reading is the same value on the same day (one reading per event); vehicles — `lastServiceMileage` at `lastServiceDate` (`service`, sourceTable `vehicles`, sourceId = vehicle id); `audit_logs` with `details.changes[]` entry `field = "currentMileage"` and numeric `to`, plus portal rows `details.currentMileage {from,to}` — `import`, sourceTable `audit_logs`, sourceId = audit id, actor = `username ?? "systeem"`, recordedAt = `createdAt`.

- [ ] **Step 1: Write failing test**: fixtures for each source ⇒ one row each with the right source; running `backfillMileageHistory()` twice ⇒ second run inserts 0; the setting key prevents a third run.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with `recordMileageReading` (upsert makes it idempotent) in batches of 500.
- [ ] **Step 4: Run** — Expected: PASS. Then run once against the local DB and note the counts in the commit message.
- [ ] **Step 5: Commit** `feat(km): backfill mileage history from existing records`.

### Task 6: Routes en rechten

**Files:**
- Create: `server/routes/mileage-history.ts`
- Modify: `server/middleware/staff-routers.ts` (mount `/api/mileage-history` with `requireAuth, requireAdmin`)
- Modify: `server/routes/reports.ts:199` (`mileage-per-month` → `requireAdmin`)
- Test: `server/__tests__/mileage-history-routes.test.ts`

**Interfaces:**
- Produces: `GET /api/mileage-history/:vehicleId?from=YYYY-MM-DD&to=YYYY-MM-DD` → return value of `getMileageHistory` (defaults: from = first day of the current year, to = office today; invalid dates → 400 `INVALID_DATE`; unknown vehicle → 404).

- [ ] **Step 1: Write failing tests**: admin ⇒ 200 with `rows`, `summary`, `vehicle`; user with `view_reports`, `manage_reports`, `view_vehicles`, `manage_vehicles` ⇒ 403 on `/api/mileage-history/:id` and on `/api/reports/mileage-per-month`; `from=2026-13-40` ⇒ 400.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** plus `server/__tests__/audit-router-coverage.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(km): admin-only mileage history route; km per month admin-only`.

### Task 7: Km-historie in het voertuigscherm en in Rapporten

**Files:**
- Create: `client/src/components/vehicles/mileage-history-panel.tsx`
- Create: `client/src/lib/mileage-history-print.ts` (HTML for the print preview)
- Modify: `client/src/components/vehicles/vehicle-details.tsx:1481-1489` (tab "Km-historie", only when `isAdmin`, line 170)
- Modify: `client/src/pages/reports/index.tsx` (Voertuigen tab: card with vehicle picker + period + panel, only for admin)
- Modify: `client/src/pages/reports/financial-tab.tsx:55-67, 199-242` (km-per-maand query and card only for admin)
- Modify: `client/src/locales/*/vehicles.json` (and `reports.json` for the card title) — 7 languages
- Test: `client/src/components/vehicles/__tests__/mileage-history-panel.test.tsx`, plus a case in the existing financial-tab test or a new one

**Interfaces:**
- Consumes: `GET /api/mileage-history/:vehicleId` (Task 6), `analyseMileage` types (Task 3).
- Produces: `export function MileageHistoryPanel({ vehicleId, defaultFrom, defaultTo }: { vehicleId: number; defaultFrom?: string; defaultTo?: string })`; `export function mileageHistoryHtml(data, labels, period): string`.

Panel layout: period picker; four tiles (gereden km, gemiddeld per maand, vrije km / boven vrije km, waarschuwingen) — each tile is a button that filters the list (alles / alleen waarschuwingen; the warnings tile opens the list filtered to warnings); line chart (recharts) of mileage over `recordedAt` (valid rows only); table: datum, km-stand, gereden sinds vorige, bron (translated), door wie, waarschuwing badge; voided rows grey with "vervallen"; buttons **Afdrukken** (HtmlPreviewDialog with `mileageHistoryHtml`: header with plate/brand/model/period, summary, list, warnings; chart as an inline SVG polyline generated from the same points) and **CSV** (`downloadCsv`, same columns). Empty state "Nog geen km-standen in deze periode".

- [ ] **Step 1: Write failing tests**: admin sees the tab and the panel lists rows with translated source and a `decrease` badge; voided row has text "vervallen"; non-admin sees no tab and makes no request to `/api/mileage-history`; CSV button calls `downloadCsv` with the rows; empty response shows the empty text; financial tab does not request `/api/reports/mileage-per-month` for a non-admin.
- [ ] **Step 2: Run** `npx vitest run client/src/components/vehicles/__tests__/mileage-history-panel.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the panel, print HTML (escape every value with `escapeHtml`), the tab, the reports card, the financial-tab guard, translations.
- [ ] **Step 4: Run** the panel test, `client/src/__tests__/locale-parity.test.tsx`, and the communications/reports page tests — Expected: PASS. `npx tsc --noEmit -p .` — no output.
- [ ] **Step 5: Verify in the browser** (dev server `start`): as admin open a vehicle → Km-historie: list, chart, print preview, CSV; open Rapporten > Voertuigen → same panel after choosing a vehicle.
- [ ] **Step 6: Commit** `feat(km): mileage history panel in vehicle screen and reports`.

### Task 8: Afronden

- [ ] Run `npx vitest run server/__tests__/mileage-history-*.test.ts server/__tests__/report-builder-fields.test.ts shared/mileage-history.test.ts` and the client project — Expected: PASS (except the pre-existing failures `xss-sinks` and `customers-query-permissions`, which also fail on `main`).
- [ ] Update `client/src/locales` manual/handleiding only if a manual page describes the vehicle tabs (`docs/gebruikershandleiding`).
- [ ] Ask Kees before merging to `main` and pushing (Coolify deploys on push; the migration adds the table, the backfill runs once at boot).

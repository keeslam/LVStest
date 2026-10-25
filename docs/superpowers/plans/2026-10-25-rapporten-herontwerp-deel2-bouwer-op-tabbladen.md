# Rapportenscherm herontwerp — deel 2: rapporten uit de bouwer op de tabbladen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een opgeslagen rapport uit de rapportbouwer kan op een tabblad staan en werkt daar als elk rapport (filterbalk, tabel met pagina's, grafiek bij groeperen, CSV, Afdrukken, doorklikken naar dossier); **Bewerken** werkt het bestaande rapport bij.

**Architecture:** Tabblad en periodeveld worden opgeslagen in `saved_reports.configuration` (`tab`, `periodField`). De server krijgt `PUT /api/reports/saved/:id` en laat `POST /api/reports/execute` een optionele `scope` (`{ from, to, vehicleId }`) toepassen op het periodeveld en de voertuigkolom van de bron. De client voegt per zichtbaar opgeslagen rapport met `tab` een dynamisch registerrapport `saved-<id>` toe dat het rapport uitvoert met de filterbalk als scope.

**Tech Stack:** Express + Drizzle (`server/routes/reports.ts`, `server/database-storage.ts` `executeReport`), React + TanStack Query, bestaande kit (`ReportTable`, `useReportPrint`, `ReportBuilderChart`, `EntityLink`).

**Spec:** `docs/superpowers/specs/2026-10-25-rapporten-scherm-herontwerp-design.md`, "Deel 2" + "Keuzes van mij".

## Global Constraints

- Geen migratie: `tab` en `periodField` in `configuration` (jsonb). Oude rapporten zonder `tab` werken ongewijzigd en staan alleen in **Opgeslagen rapporten**.
- Zichtbaar op een tabblad voor iedereen met het recht voor de bron (`canUseReportSource`); km-historie alleen beheerder; bewerken/opslaan/verwijderen alleen met **Rapporten beheren** (`MANAGE_REPORTS`) én bronrecht.
- Toegestane tabbladen: `expenses`, `vehicles`, `customers`, `transports`, `financial`, `portal`, `office` (niet `overview`, niet `fiscal`).
- `scope` wordt server-side als geparametriseerde voorwaarde toegevoegd (nooit tekst in SQL); een `periodField` dat geen datumveld van de bron is ⇒ 400 `REPORT_PERIOD_FIELD_INVALID`.
- Knopnamen: **Tabblad**, **Niet op een tabblad**, **Periodeveld**, **Geen (hele tabel)**, **Bewerken**, **Opslaan**, **Opslaan als nieuw**. 7 talen.

## Review Focus

1. Gebruiker zonder bronrecht ziet het rapport niet op het tabblad en een URL `?report=saved-<id>` valt terug (Task 3).
2. Rapport met groepering per maand + periode-scope: maanden alleen binnen de periode (Task 1).
3. Bewerken door een gebruiker die het rapport niet mag zien ⇒ 403/404, geen overschrijving (Task 1).
4. Bron zonder voertuigkolom + voertuigfilter gekozen ⇒ filter genegeerd met de notitie "Voertuig geldt niet voor dit rapport." (Task 3).
5. Verwijderd rapport terwijl het tabblad openstaat ⇒ pane valt terug, geen crash (Task 3).

---

### Task 1: Server — scope bij uitvoeren en een rapport bijwerken

**Files:**
- Modify: `shared/report-builder-config.ts` (`ReportConfiguration` krijgt `tab?: ReportTabId-subset`, `periodField?: string`; per bron `vehicleField?: string` = de kolom met het voertuig-id (vehicles: `id`; reservations/expenses/fines/transports/workshop_visits/damage_checks/mileage_readings: `vehicleId`; customers/drivers: geen); `SAVED_REPORT_TABS` const)
- Modify: `server/database-storage.ts` `executeReport(config, scope?)` (scope `{ from: string; to: string; vehicleId?: number }`: `periodField` tussen from en to (datum/tijd volgens het type, kantoordag zoals de groepering: `officeDaySql`/`textDaySql`/PgDate), voertuig via `vehicleField`)
- Modify: `server/routes/reports.ts` (`POST /api/reports/execute` accepteert `scope`; valideer `tab` en `periodField` bij `POST /saved`; nieuw `PUT /api/reports/saved/:id` met `MANAGE_REPORTS` + bronrecht van het bestaande én het nieuwe rapport; audit zoals POST)
- Test: `server/__tests__/report-builder-scope.test.ts`

**Interfaces:**
- Produces: `POST /api/reports/execute` body `{ ...ReportConfiguration, scope?: { from, to, vehicleId? } }`; `PUT /api/reports/saved/:id` body = `ReportConfiguration` ⇒ 200 bijgewerkt rapport; 404 onbekend; 403 zonder bronrecht.

- [ ] **Step 1: Write failing tests**: bekeuringen-rapport met `periodField: "offenceAt"` en scope okt 2026 ⇒ alleen oktoberregels; scope met `vehicleId` ⇒ alleen die auto; scope + groepering per maand ⇒ alleen maanden in de periode; `periodField: "status"` ⇒ 400 `REPORT_PERIOD_FIELD_INVALID`; klanten-bron + `vehicleId` ⇒ genegeerd (geen fout); `POST /saved` met `tab: "overview"` ⇒ 400; `PUT /saved/:id` als beheerder ⇒ 200 en `configuration.tab` bijgewerkt; `PUT` door gebruiker met `MANAGE_REPORTS` zonder bekeuringenrecht op een bekeuringen-rapport ⇒ 403 en rapport ongewijzigd; `PUT` op onbekend id ⇒ 404.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-scope.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server/__tests__/report-builder-*.test.ts server/__tests__/report-routes-guards.test.ts` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): builder reports run within a period and vehicle, and can be updated`.

### Task 2: Bouwer — tabblad, periodeveld en bewerken

**Files:**
- Modify: `client/src/pages/reports/report-builder.tsx` (opslaan-blok: select `select-saved-report-tab` (**Niet op een tabblad** + toegestane tabbladen), select `select-saved-report-period-field` (**Geen (hele tabel)** + datumvelden van de bron); in **Opgeslagen rapporten** per rapport knop **Bewerken** `button-edit-saved-${id}` die `loadSavedReport` doet en de bouwer in bewerkmodus zet (kop "Bewerken: <naam>"); in bewerkmodus knoppen **Opslaan** (PUT) en **Opslaan als nieuw** (POST); tabbladnaam als badge in de lijst)
- Modify: locales (7)
- Test: `client/src/pages/reports/__tests__/report-builder-tabs.test.tsx`

- [ ] **Step 1: Write failing tests**: opslaan met tabblad Financieel en periodeveld **Datum overtreding** ⇒ POST body `configuration.tab === "financial"`, `periodField === "offenceAt"`; **Bewerken** op een opgeslagen rapport ⇒ velden gevuld, **Opslaan** ⇒ `PUT /api/reports/saved/7`; **Opslaan als nieuw** ⇒ POST; periodeveld-opties alleen datumvelden van de aangevinkte bron; zonder `MANAGE_REPORTS` geen **Bewerken**.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports` + locale-parity + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): save a builder report on a tab, with a period field, and edit it`.

### Task 3: Opgeslagen rapporten op de tabbladen

**Files:**
- Create: `client/src/pages/reports/saved-report-view.tsx` (`SavedReportView({ report })`: voert `/api/reports/execute` uit met `scope` uit `useReportFilters()` (vehicleId alleen als bron `vehicleField` heeft); tabel via `ReportTable` (kolommen uit de configuratie, `displayCell`/`csvCell` uit `report-builder-output.ts`, kenteken/klant via `EntityLink` waar de kolom `licensePlate`/`customerId`/`vehicleId` is), grafiek via `ReportBuilderChart` bij groeperen, **CSV**, afdrukinhoud via `useReportPrint`, knop **Bewerken** (alleen `MANAGE_REPORTS`) die de rapportbouwer-dialoog opent met dit rapport in bewerkmodus; notities "Periode geldt niet voor dit rapport." zonder `periodField` en "Voertuig geldt niet voor dit rapport." zonder `vehicleField`; foutcodes via `describeApiError`)
- Modify: `client/src/pages/reports/report-registry.tsx` / `reports-shell.tsx` (dynamische registerrapporten uit `GET /api/reports/saved`: id `saved-${id}`, tab `configuration.tab`, titel = naam, `visible` = `canUseReportSource` voor alle `dataSources`, `ignoresPeriod`/`ignoresVehicle` volgens de configuratie; badge-icoon "eigen rapport" in `ReportNav`), `reports-shell.tsx` (bouwer-dialoog kan geopend worden met een rapport om te bewerken; na opslaan/verwijderen `invalidateByPrefix("/api/reports/saved")`)
- Test: `client/src/pages/reports/__tests__/saved-reports-on-tabs.test.tsx`

- [ ] **Step 1: Write failing tests**: opgeslagen rapport `{ id: 7, name: "Bekeuringen per maand", configuration: { tab: "financial", periodField: "offenceAt", dataSources: ["fines"], groupBy: [month] … } }` ⇒ `report-nav-item-saved-7` op Financieel; openen ⇒ POST `/api/reports/execute` met `scope.from/to` van de filterbalk; tabel + grafiek zichtbaar; **Afdrukken** biedt tabel en grafiek; voertuig kiezen ⇒ `scope.vehicleId`; gebruiker zonder bekeuringenrecht ⇒ niet in de lijst en `?tab=financial&report=saved-7` valt terug; rapport zonder `periodField` ⇒ notitie; **Bewerken** opent de bouwer met de naam gevuld; rapport verdwijnt uit de lijst na verwijderen.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): saved builder reports appear on their tab like any report`.

## Controller rulings

(leeg)

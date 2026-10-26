/**
 * Hoofdstuk 21 (Rapporten), het vernieuwde rapportenscherm (herontwerp oktober 2026):
 * filterbalk, tabbladen met Overzicht, lijst links en één rapport rechts, tabellen,
 * Kolommen, doorklikken, vergelijken, afdrukken met voorbeeld, de rapportbouwer
 * (gekoppelde velden, berekende velden, totaalregel, opslaan op een tabblad) en de
 * km-historie in het voertuigscherm.
 *
 * Alle locators gaan via data-testid (of de rol binnen een venster), zodat kleine
 * wijzigingen in teksten of opmaak de foto's niet breken. Draai met een beheerder-
 * account: de km-rapporten en het tabblad Km-historie zijn alleen voor de beheerder.
 *   MSYS_NO_PATHCONV=1 node scripts/handleiding/run.mjs --account=e2e-admin 21-
 */
import { api, closeDialogs, goto, settle, shot } from "./lib.mjs";
import { openVehicle } from "./shots-04.mjs";

const SAVED_NAME = "Bekeuringen met auto";

const tid = (page, id) => page.getByTestId(id);

/** Opent een Radix-keuzelijst (op testid) en kiest de optie met deze tekst. */
async function choose(page, triggerTestId, optionText, scope = page) {
  await scope.getByTestId(triggerTestId).click();
  const option = page.locator('[role="option"]').filter({ hasText: optionText }).first();
  await option.waitFor();
  await option.click();
  await page.waitForTimeout(250);
}

async function openReports(page, query = "") {
  await goto(page, `/reports${query}`);
  await closeDialogs(page);
  await tid(page, "report-filter-bar").waitFor();
  await settle(page);
}

async function openReport(page, tab, report) {
  await openReports(page, `?tab=${tab}&report=${report}`);
  await tid(page, `report-pane-${report}`).waitFor();
  await settle(page);
  await page.waitForTimeout(600);
}

/** Alle vaste rapporten, per tabblad in de volgorde van de lijst. */
const REPORTS = [
  ["expenses", "expenses-by-category"], ["expenses", "expense-trend"], ["expenses", "expenses-in-period"],
  ["vehicles", "vehicle-utilization"], ["vehicles", "maintenance-cost-by-vehicle"], ["vehicles", "apk-overview"],
  ["vehicles", "warranty"], ["vehicles", "occupancy"], ["vehicles", "maintenance-outlook"],
  ["vehicles", "workshop-downtime"], ["vehicles", "fleet-mileage"], ["vehicles", "mileage-history"],
  ["customers", "customer-impact"], ["customers", "customer-cost-categories"], ["customers", "customer-reservations"],
  ["customers", "customer-value"],
  ["transports", "transports"],
  ["financial", "vehicle-financials"], ["financial", "fines"], ["financial", "extra-costs"], ["financial", "transport-billing"],
  ["fiscal", "fiscal"],
  ["portal", "portal-requests"], ["portal", "waitlist"],
  ["office", "invoice-inbox-runs"], ["office", "invoice-inbox-items"], ["office", "deliveries"], ["office", "damage-checks"],
];

/** Opent het venster Analyse onderhoudskosten (knop Onderhoudsanalyse) op het tabblad Overzicht. */
async function openAnalysis(page) {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await openReports(page, "?tab=vehicles");
  await tid(page, "button-open-maintenance-costs").click();
  const w = tid(page, "maintenance-analysis-window");
  await w.waitFor();
  await tid(page, "button-ma-tile-total").waitFor();
  await settle(page);
  await page.waitForTimeout(800);
  return w;
}

/** De rand van het venster Analyse onderhoudskosten: vast in beeld, dus de markeringen schuiven niet. */
async function windowBox(page) {
  return page.locator('div[role="dialog"]').filter({ has: page.getByTestId("maintenance-analysis-window") }).last().boundingBox();
}

/** Verwijdert het oefenrapport van een vorige run, zodat er maar één is. */
async function removeSavedReport(page) {
  const saved = await api(page, "GET", "/api/reports/saved");
  for (const r of Array.isArray(saved) ? saved : []) {
    if (r.name === SAVED_NAME) await api(page, "DELETE", `/api/reports/saved/${r.id}`);
  }
}

export const steps = [
  {
    name: "21-scherm",
    async run(page) {
      await openReports(page, "?tab=overview");
      await shot(page, "21-scherm", {
        marks: [
          tid(page, "select-report-preset"),
          tid(page, "select-report-compare"),
          { locator: tid(page, "select-report-vehicle"), text: "Voertuig" },
          tid(page, "button-open-report-builder"),
          tid(page, "button-open-maintenance-costs"),
          { locator: page.getByRole("tablist").first(), text: "tabbladen" },
        ],
      });
      // De periodes in de keuzelijst.
      await tid(page, "select-report-preset").click();
      const listbox = page.locator('[role="listbox"]').last();
      await listbox.waitFor();
      await shot(page, "21-periode", { marks: [{ locator: listbox, text: "de periodes" }] });
      await page.locator('[role="option"]').filter({ hasText: "Zelf kiezen" }).first().click();
      await tid(page, "input-report-from").waitFor();
      await shot(page, "21-zelf-kiezen", {
        box: { x: 0, y: 0, width: 1280, height: 330 },
        marks: [tid(page, "input-report-from"), tid(page, "input-report-to")],
      });
    },
  },
  {
    name: "21-overzicht",
    async run(page) {
      await openReports(page, "?tab=overview");
      await tid(page, "overview-tiles").waitFor();
      await settle(page);
      await shot(page, "21-overzicht", {
        marks: [
          { locator: tid(page, "overview-tile-margin"), text: "Marge" },
          { locator: tid(page, "overview-tile-finesOpen"), text: "Open bekeuringen" },
        ],
      });
      await tid(page, "overview-tile-finesOpen").click();
      await tid(page, "report-pane-fines").waitFor();
      await settle(page);
      await page.waitForTimeout(600);
      await shot(page, "21-overzicht-klik", {
        marks: [
          { locator: tid(page, "tab-report-financial"), text: "Financieel" },
          { locator: tid(page, "report-nav-item-fines"), text: "Bekeuringen" },
        ],
      });
    },
  },
  {
    name: "21-lijst",
    async run(page) {
      await openReport(page, "vehicles", "apk-overview");
      await shot(page, "21-lijst", {
        marks: [
          { locator: tid(page, "report-nav"), text: "lijst met rapporten" },
          { locator: tid(page, "report-nav-badge-apk-overview"), text: "getal" },
          { locator: tid(page, "report-pane-title"), text: "het rapport" },
          tid(page, "button-report-print"),
        ],
      });
    },
  },
  {
    name: "21-telefoon",
    async run(page) {
      await page.setViewportSize({ width: 390, height: 844 });
      await openReport(page, "vehicles", "apk-overview");
      await tid(page, "select-report-nav").scrollIntoViewIfNeeded();
      await shot(page, "21-telefoon", { marks: [{ locator: tid(page, "select-report-nav"), text: "Kies een rapport" }] });
      await tid(page, "select-report-nav").click();
      await page.locator('[role="listbox"]').last().waitFor();
      await shot(page, "21-telefoon-menu", { closeups: false });
      await page.keyboard.press("Escape");
    },
  },
  // Elk vast rapport één keer, zoals het opent.
  ...REPORTS.map(([tab, report]) => ({
    name: `21-r-${report}`,
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openReport(page, tab, report);
      if (report === "mileage-history") {
        await tid(page, "select-report-mileage-vehicle").click();
        await page.locator('[role="option"]').first().waitFor();
        await page.keyboard.type("65PRC8");
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await tid(page, "mileage-history-panel").waitFor();
        await settle(page);
        await page.waitForTimeout(600);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `21-r-${report}`);
    },
  })),
  {
    name: "21-tabel",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1100 });
      await openReport(page, "expenses", "expenses-in-period");
      await choose(page, "select-report-preset", "Alle gegevens");
      await settle(page);
      const table = page.locator('[data-testid="report-pane-expenses-in-period"] [data-testid$="-search"]').first();
      await table.waitFor();
      const pager = page.locator('[data-testid$="-pagination"]').first();
      const marks = [
        { locator: table, text: "Zoeken" },
        { locator: page.locator('[data-testid="report-pane-expenses-in-period"] [data-testid*="-sort-"]').first(), text: "kolomkop" },
        tid(page, "button-report-columns"),
      ];
      if (await pager.isVisible().catch(() => false)) {
        marks.push({ locator: page.locator('[data-testid$="-page-size"]').first(), text: "Per pagina" });
        marks.push({ locator: page.locator('[data-testid$="-next-page"]').first(), text: "volgende pagina" });
      }
      await shot(page, "21-tabel", { marks });
      await table.fill("12vkl3");
      await settle(page);
      await shot(page, "21-tabel-zoeken", { marks: [{ locator: table, text: "Zoeken" }] });
      await table.fill("");
      // Kolommen: verbergen, extra velden, terug naar standaard.
      await tid(page, "button-report-columns").click();
      const menu = tid(page, "report-columns-menu");
      await menu.waitFor();
      await shot(page, "21-kolommen", {
        marks: [
          { locator: menu.locator('[data-testid^="report-column-toggle-"]').nth(3), text: "kolom tonen" },
          { locator: menu.locator('[data-testid^="report-column-extra-"]').first(), text: "extra veld" },
          tid(page, "button-report-columns-reset"),
        ],
      });
      // Merk en Model erbij; daarna weer terug naar standaard.
      const extras = menu.locator('[data-testid^="report-column-extra-"]');
      const n = await extras.count();
      for (let i = 0; i < Math.min(n, 2); i += 1) await extras.nth(i).click();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await settle(page);
      await shot(page, "21-kolommen-erbij", {
        marks: [{ locator: page.locator('[data-testid="report-pane-expenses-in-period"] [data-testid*="-sort-"]').filter({ hasText: "Kenteken" }).first(), text: "nieuwe kolom" }],
        closeups: false,
      });
      await tid(page, "button-report-columns").click();
      await tid(page, "button-report-columns-reset").click();
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "21-doorklikken",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1100 });
      // Een tegel: Bekeuringen > Nieuw.
      await openReport(page, "financial", "fines");
      await choose(page, "select-report-preset", "Dit jaar");
      await settle(page);
      const tile = page.locator('[data-testid^="button-"][data-testid*="-tile-new"]').first();
      await shot(page, "21-klik-tegel", { marks: [{ locator: tile, text: "Nieuw" }] });
      await tile.click();
      const detail = page.locator('div[role="dialog"]').last();
      await detail.waitFor();
      await settle(page);
      await page.waitForTimeout(500);
      await shot(page, "21-regels-venster", {
        clip: detail,
        marks: [
          { locator: detail.locator('[data-testid$="-csv"]').first(), text: "CSV" },
          { locator: detail.locator('[data-testid$="-print"]').first(), text: "Afdrukken" },
          { locator: detail.getByTestId("button-report-columns").first(), text: "Kolommen" },
        ],
      });
      // Doorklikken naar het dossier: het kenteken in de lijst.
      const link = detail.locator('[data-testid^="link-entity-vehicle-"]').first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        const entity = page.locator('[data-testid="dialog-entity-vehicle"]');
        await entity.waitFor();
        await settle(page);
        await shot(page, "21-dossier", { clip: entity, marks: [tid(page, "button-entity-open")] });
      }
      await closeDialogs(page);

      // Een staaf en een regel: Kosten per categorie.
      await openReport(page, "expenses", "expenses-by-category");
      await choose(page, "select-report-preset", "Dit jaar");
      await settle(page);
      await page.waitForTimeout(800);
      const bar = page.locator('[data-testid="report-pane-expenses-by-category"] .recharts-bar-rectangle').first();
      const row = page.locator('[data-testid="report-pane-expenses-by-category"] [data-testid*="-open-"]').first();
      await bar.scrollIntoViewIfNeeded();
      await shot(page, "21-klik-staaf", { marks: [{ locator: bar, text: "staaf" }] });
      await row.scrollIntoViewIfNeeded();
      await shot(page, "21-klik-regel", { marks: [{ locator: row, text: "regel" }] });
      await row.click();
      const rows = page.locator('div[role="dialog"]').last();
      await rows.waitFor();
      await settle(page);
      await shot(page, "21-regels-categorie", { clip: rows, closeups: false });
    },
  },
  {
    name: "21-vergelijken",
    async run(page) {
      await openReports(page, "?tab=overview");
      await choose(page, "select-report-compare", "Vorige periode");
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, "21-vergelijken", {
        marks: [
          tid(page, "select-report-compare"),
          { locator: tid(page, "overview-tile-margin"), text: "rood: slechter" },
          { locator: tid(page, "overview-tile-occupancy"), text: "groen: beter" },
          { locator: tid(page, "overview-tile-deliveriesLate"), text: "grijs: gelijk" },
        ],
      });
      await tid(page, "select-report-compare").click();
      await page.locator('[role="listbox"]').last().waitFor();
      await shot(page, "21-vergelijken-keuze", { closeups: false });
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "21-afdrukken",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openReport(page, "vehicles", "vehicle-utilization");
      await shot(page, "21-afdrukken-knop", { marks: [tid(page, "button-report-print")] });
      await tid(page, "button-report-print").click();
      const dlg = tid(page, "dialog-report-print");
      await dlg.waitFor();
      await tid(page, "print-preview-frame").waitFor();
      await settle(page);
      await page.waitForTimeout(1200);
      await shot(page, "21-afdrukvoorbeeld", {
        clip: dlg,
        marks: [
          { locator: tid(page, "print-option-tiles").locator("xpath=.."), text: "Tegels" },
          { locator: tid(page, "print-option-chart").locator("xpath=.."), text: "Grafiek" },
          { locator: tid(page, "print-option-table").locator("xpath=.."), text: "Tabel" },
          { locator: tid(page, "print-option-rows"), text: "Regels" },
          { locator: tid(page, "print-option-landscape").locator("xpath=.."), text: "Liggend" },
          tid(page, "button-print-confirm"),
        ],
      });
      await tid(page, "print-option-landscape").check();
      await page.waitForTimeout(1000);
      await shot(page, "21-afdrukvoorbeeld-liggend", { clip: dlg, closeups: false });
      await closeDialogs(page);

      // Alleen aangevinkte regels: de transportlijst heeft vinkjes.
      await openReport(page, "transports", "transports");
      await choose(page, "select-report-preset", "Alle gegevens");
      const box = page.locator('[data-testid^="checkbox-select-transport-report-"]').first();
      if (await box.isVisible().catch(() => false)) {
        await box.click();
        await shot(page, "21-afdrukken-aangevinkt", { marks: [{ locator: box, text: "vinkje" }, tid(page, "button-report-print")] });
        await tid(page, "button-report-print").click();
        await tid(page, "print-option-rows").waitFor();
        await tid(page, "print-option-rows").selectOption("selected");
        await page.waitForTimeout(800);
        await shot(page, "21-afdrukken-alleen-aangevinkt", {
          clip: tid(page, "dialog-report-print"),
          marks: [{ locator: tid(page, "print-option-rows"), text: "Alleen aangevinkte" }],
        });
      }
      await closeDialogs(page);

      // CSV: bij Kosten en opbrengst per voertuig.
      await openReport(page, "financial", "vehicle-financials");
      const csv = page.locator('[data-testid="report-pane-vehicle-financials"] button').filter({ hasText: /^CSV$/ }).first();
      await shot(page, "21-csv", { marks: [{ locator: csv, text: "CSV" }] });
    },
  },
  {
    name: "21-bouwer",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1400 });
      await removeSavedReport(page);
      await openReports(page, "?tab=financial");
      await tid(page, "button-open-report-builder").click();
      const b = page.locator('div[role="dialog"]').filter({ has: page.getByTestId("button-builder-tab") }).last();
      await b.waitFor();
      await settle(page);
      const scrollTop = () => b.locator(".overflow-auto").first().evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
      await b.getByTestId("button-add-field-licensePlate").waitFor();
      await shot(page, "21-bouwer", {
        clip: b,
        marks: [
          { locator: b.getByTestId("button-builder-tab"), text: "Bouwer" },
          { locator: b.getByTestId("button-saved-tab"), text: "Opgeslagen rapporten" },
          { locator: b.getByTestId("checkbox-datasource-vehicles").locator("xpath=.."), text: "Voertuigen" },
          { locator: b.getByTestId("button-add-field-licensePlate"), text: "+ Kenteken" },
          { locator: b.getByTestId("button-save-report"), text: "Opslaan" },
          { locator: b.getByTestId("button-run-report"), text: "Rapport uitvoeren" },
          { locator: b.getByTestId("button-add-filter"), text: "Filter toevoegen" },
        ],
      });
      // Voertuigen staat al aangevinkt; de gekoppelde velden horen bij de eerste bron, dus eerst uit.
      await b.getByTestId("checkbox-datasource-vehicles").uncheck();
      await b.getByTestId("checkbox-datasource-fines").check();
      await page.waitForTimeout(400);
      await scrollTop();
      await shot(page, "21-bouwer-bron", {
        clip: b,
        marks: [
          { locator: b.getByTestId("checkbox-datasource-fines").locator("xpath=.."), text: "Bekeuringen" },
          { locator: b.getByTestId("button-add-field-offenceAt"), text: "+ Datum overtreding" },
          { locator: b.getByTestId("linked-group-vehicle").locator("span").first(), text: "Gekoppeld: Voertuig" },
          { locator: b.getByTestId("button-add-field-vehicle.licensePlate"), text: "+ Kenteken van de auto" },
        ],
      });
      await shot(page, "21-berekend-knop", { clip: b, marks: [b.getByTestId("button-add-calculated-field")] });
      // Kolommen: datum, totaalbedrag, en via de gekoppelde auto kenteken en merk.
      for (const f of ["offenceAt", "totalAmount", "vehicle.licensePlate", "vehicle.brand"]) {
        await b.getByTestId(`button-add-field-${f}`).click();
        await page.waitForTimeout(250);
      }

      // Berekend veld 1: Rekensom Totaalbedrag × 1,21.
      await b.getByTestId("button-add-calculated-field").click();
      let calc = page.getByTestId("dialog-calculated-field");
      await calc.waitFor();
      await calc.getByTestId("input-calc-name").fill("Incl. btw");
      await calc.locator('[data-testid^="button-formula-field-"]').filter({ hasText: "Totaalbedrag" }).first().click();
      await calc.getByTestId("button-formula-times").click();
      await calc.getByTestId("input-formula-number").fill("1,21");
      await calc.getByTestId("button-formula-add-number").click();
      await choose(page, "select-calc-type", "Bedrag", calc);
      await page.waitForTimeout(300);
      await shot(page, "21-berekend-rekensom", {
        clip: calc,
        marks: [
          { locator: calc.getByTestId("input-calc-name"), text: "Naam" },
          { locator: calc.getByTestId("button-calc-kind-formula"), text: "Rekensom" },
          { locator: calc.getByTestId("formula-bar"), text: "Formule" },
          { locator: calc.getByTestId("button-formula-times"), text: "×" },
          { locator: calc.getByTestId("button-formula-add-number"), text: "Getal toevoegen" },
          { locator: calc.locator('[data-testid^="button-formula-field-"]').filter({ hasText: "Totaalbedrag" }).first(), text: "veld" },
          { locator: calc.getByTestId("select-calc-type"), text: "Soort" },
          { locator: calc.getByTestId("button-save-calculated-field"), text: "Opslaan" },
        ],
      });
      await calc.getByTestId("button-save-calculated-field").click();
      await calc.waitFor({ state: "detached" });

      // Berekend veld 2: Als-dan regel.
      await b.getByTestId("button-add-calculated-field").click();
      calc = page.getByTestId("dialog-calculated-field");
      await calc.waitFor();
      await calc.getByTestId("input-calc-name").fill("Hoog of laag");
      await calc.getByTestId("button-calc-kind-ifThen").click();
      await choose(page, "select-calc-when-field", "Totaalbedrag", calc);
      await choose(page, "select-calc-when-test", "groter dan", calc);
      await calc.getByTestId("input-calc-when-value").fill("100");
      await calc.getByTestId("input-calc-then-text").fill("Hoog");
      await calc.getByTestId("input-calc-otherwise-text").fill("Laag");
      await page.waitForTimeout(300);
      await shot(page, "21-berekend-alsdan", {
        clip: calc,
        marks: [
          { locator: calc.getByTestId("button-calc-kind-ifThen"), text: "Als-dan regel" },
          { locator: calc.getByTestId("select-calc-when-field"), text: "Als" },
          { locator: calc.getByTestId("select-calc-when-test"), text: "Test" },
          { locator: calc.getByTestId("input-calc-when-value"), text: "Waarde" },
          { locator: calc.getByTestId("select-calc-then"), text: "dan" },
          { locator: calc.getByTestId("select-calc-otherwise"), text: "anders" },
        ],
      });
      await calc.getByTestId("button-save-calculated-field").click();
      await calc.waitFor({ state: "detached" });

      // Berekend veld 3: Procent. (Incl. btw − Totaalbedrag) ÷ Incl. btw.
      await b.getByTestId("button-add-calculated-field").click();
      calc = page.getByTestId("dialog-calculated-field");
      await calc.waitFor();
      await calc.getByTestId("input-calc-name").fill("Aandeel btw");
      await calc.getByTestId("button-formula-open").click();
      await calc.locator('[data-testid^="button-formula-calc-"]').filter({ hasText: "Incl. btw" }).first().click();
      await calc.getByTestId("button-formula-minus").click();
      await calc.locator('[data-testid^="button-formula-field-"]').filter({ hasText: "Totaalbedrag" }).first().click();
      await calc.getByTestId("button-formula-close").click();
      await calc.getByTestId("button-formula-divide").click();
      await calc.locator('[data-testid^="button-formula-calc-"]').filter({ hasText: "Incl. btw" }).first().click();
      await choose(page, "select-calc-type", "Procent", calc);
      await page.waitForTimeout(300);
      await shot(page, "21-berekend-procent", {
        clip: calc,
        marks: [
          { locator: calc.getByTestId("formula-bar"), text: "Formule" },
          { locator: calc.getByTestId("select-calc-type"), text: "Soort: Procent" },
          { locator: calc.getByTestId("calc-percent-hint"), text: "uitleg" },
        ],
      });
      await calc.getByTestId("button-save-calculated-field").click();
      await calc.waitFor({ state: "detached" });

      // De drie berekende velden als kolom erbij.
      const calcButtons = b.locator('[data-testid^="button-add-calc-"]');
      for (let i = 0; i < (await calcButtons.count()); i += 1) {
        await calcButtons.nth(i).click();
        await page.waitForTimeout(250);
      }
      // Totaalregel: Som onder Totaalbedrag en Incl. btw.
      await choose(page, "select-column-total-1", "Som", b);
      await choose(page, "select-column-total-4", "Som", b);
      await page.waitForTimeout(300);
      await shot(page, "21-berekend-velden", {
        clip: b,
        marks: [{ locator: b.locator('[data-testid^="button-add-calc-"]').first(), text: "+ Incl. btw" }],
      });
      await scrollTop();
      await shot(page, "21-bouwer-kolommen", {
        clip: b,
        marks: [
          { locator: b.getByTestId("select-column-aggregation-1"), text: "Berekening" },
          { locator: b.getByTestId("select-column-total-4"), text: "Totaalregel" },
          { locator: b.getByTestId("button-remove-column-6"), text: "kruisje" },
          { locator: b.getByTestId("button-run-report"), text: "Rapport uitvoeren" },
          { locator: b.getByTestId("button-save-report"), text: "Opslaan" },
        ],
      });

      // Uitvoeren: de resultaten met de totaalregel.
      await b.getByTestId("button-run-report").click();
      const res = tid(page, "dialog-report-results");
      await res.waitFor();
      await settle(page);
      await shot(page, "21-resultaten", {
        clip: res,
        marks: [
          { locator: res.getByTestId("row-report-totals"), text: "Totaal" },
          { locator: res.getByTestId("button-export-report-csv"), text: "Exporteren naar CSV" },
          { locator: res.getByTestId("button-report-print"), text: "Afdrukken" },
          { locator: res.getByTestId("button-close-results"), text: "Sluiten" },
        ],
      });
      // Afdrukken in de resultaten: hetzelfde afdrukvoorbeeld als bij de vaste rapporten.
      await res.getByTestId("button-report-print").click();
      const pdlg = tid(page, "dialog-report-print");
      await pdlg.waitFor();
      await tid(page, "print-preview-frame").waitFor();
      await page.waitForTimeout(1000);
      await shot(page, "21-resultaten-afdrukken", { clip: pdlg, closeups: false });
      await page.keyboard.press("Escape");
      await pdlg.waitFor({ state: "detached" });
      await res.getByTestId("button-close-results").click();
      await res.waitFor({ state: "detached" });

      // Opslaan op het tabblad Financieel, met Datum overtreding als periodeveld.
      await b.getByTestId("button-save-report").click();
      const save = tid(page, "dialog-save-report");
      await save.waitFor();
      await save.getByTestId("input-report-name").fill(SAVED_NAME);
      await save.getByTestId("textarea-report-description").fill("Alle bekeuringen met kenteken en merk van de auto, en het bedrag met btw.");
      await choose(page, "select-saved-report-tab", "Financieel", save);
      await choose(page, "select-saved-report-period-field", "Datum overtreding", save);
      await shot(page, "21-opslaan", {
        clip: save,
        marks: [
          { locator: save.getByTestId("input-report-name"), text: "Rapportnaam" },
          { locator: save.getByTestId("select-saved-report-tab"), text: "Tabblad" },
          { locator: save.getByTestId("select-saved-report-period-field"), text: "Periodeveld" },
          { locator: save.getByTestId("button-confirm-save"), text: "Rapport opslaan" },
        ],
      });
      await save.getByTestId("button-confirm-save").click();
      await save.waitFor({ state: "detached" });
      await settle(page);

      // Groeperen per maand en de grafiek (niet opgeslagen).
      // Eerst de kolommen zonder berekening weg: Aandeel btw, Hoog of laag, Merk, Kenteken.
      for (const idx of [6, 5, 3, 2]) {
        await b.getByTestId(`button-remove-column-${idx}`).click();
        await page.waitForTimeout(200);
      }
      await choose(page, "select-report-group-by", "Datum overtreding", b);
      await b.getByTestId("checkbox-group-by-month").check();
      await choose(page, "select-column-aggregation-1", "Som", b);
      await choose(page, "select-column-aggregation-2", "Som", b);
      await page.waitForTimeout(300);
      await shot(page, "21-groeperen", {
        clip: b,
        marks: [
          { locator: b.getByTestId("select-report-group-by"), text: "Groeperen op" },
          { locator: b.getByTestId("checkbox-group-by-month").locator("xpath=.."), text: "Per maand" },
          { locator: b.getByTestId("select-column-aggregation-1"), text: "Berekening" },
        ],
      });
      await b.getByTestId("button-run-report").click();
      await res.waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, "21-grafiek", {
        clip: res,
        marks: [{ locator: res.getByTestId("select-report-chart-type"), text: "Soort grafiek" }],
      });
      await res.getByTestId("button-close-results").click();

      // Opgeslagen rapporten.
      await b.getByTestId("button-saved-tab").click();
      await settle(page);
      const card = b.locator('[data-testid^="button-run-saved-"]').first();
      await card.waitFor();
      await shot(page, "21-opgeslagen", {
        clip: b,
        marks: [
          { locator: b.locator('[data-testid^="badge-saved-tab-"]').first(), text: "tabblad" },
          { locator: b.locator('[data-testid^="button-load-report-"]').first(), text: "Gebruiken als begin" },
          { locator: b.locator('[data-testid^="button-edit-saved-"]').first(), text: "Bewerken" },
          { locator: card, text: "Uitvoeren" },
        ],
      });
      await shot(page, "21-opgeslagen-wissen", {
        clip: b.locator('[data-testid^="button-delete-report-"]').first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
        marks: [{ locator: b.locator('[data-testid^="button-delete-report-"]').first(), text: "prullenbak" }],
      });
      await closeDialogs(page);
      await settle(page);
    },
  },
  {
    name: "21-eigen-rapport",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openReports(page, "?tab=financial");
      const saved = await api(page, "GET", "/api/reports/saved");
      const report = (Array.isArray(saved) ? saved : []).find((r) => r.name === SAVED_NAME);
      if (!report) throw new Error(`Opgeslagen rapport "${SAVED_NAME}" niet gevonden; draai eerst 21-bouwer`);
      await openReport(page, "financial", `saved-${report.id}`).catch(async () => {
        await tid(page, `report-nav-item-saved-${report.id}`).click();
        await settle(page);
      });
      await choose(page, "select-report-preset", "Dit jaar");
      await settle(page);
      await tid(page, "saved-report-table").waitFor();
      await shot(page, "21-eigen-rapport", {
        marks: [
          { locator: page.locator('[data-testid^="report-nav-item-saved-"]').first(), text: SAVED_NAME },
          tid(page, "button-edit-saved-report"),
          tid(page, "button-saved-report-csv"),
          tid(page, "button-report-print"),
          { locator: tid(page, "saved-report-table-totals").locator("td").first(), text: "Totaal" },
        ],
      });
      // Bewerken opent de bouwer met dit rapport.
      await tid(page, "button-edit-saved-report").click();
      const b = page.locator('div[role="dialog"]').filter({ has: page.getByTestId("button-builder-tab") }).last();
      await b.waitFor();
      await tid(page, "button-stop-editing").waitFor();
      await settle(page);
      await shot(page, "21-bewerken", {
        box: { x: 0, y: 0, width: 1280, height: 420 },
        marks: [
          { locator: b.getByRole("heading").filter({ hasText: SAVED_NAME }).first(), text: "Bewerken: …" },
          tid(page, "button-stop-editing"),
          { locator: b.getByTestId("button-save-report"), text: "Opslaan" },
        ],
      });
      await b.getByTestId("button-save-report").click();
      const save = tid(page, "dialog-save-report");
      await save.waitFor();
      await shot(page, "21-bewerken-opslaan", {
        clip: save,
        marks: [
          { locator: save.getByTestId("button-confirm-save"), text: "Opslaan" },
          { locator: save.getByTestId("button-confirm-save-as-new"), text: "Opslaan als nieuw" },
        ],
      });
      await save.getByTestId("button-cancel-save").click();
      await closeDialogs(page);
    },
  },
  // Onderhoudsanalyse (21.9). Zaai eerst met `node scripts/handleiding/seed-extra.mjs --onderhoud`.
  // Met een beheerder; 21-ma-medewerker met e2e-manager (zonder km).
  {
    name: "21-ma-venster",
    async run(page) {
      const w = await openAnalysis(page);
      await shot(page, "21-ma-venster", {
        clip: w,
        marks: [
          { locator: tid(page, "select-ma-preset"), text: "Periode" },
          { locator: tid(page, "select-ma-compare"), text: "Vergelijk met" },
          { locator: tid(page, "select-ma-category"), text: "Categorie" },
          { locator: tid(page, "select-ma-brand"), text: "Merk" },
          { locator: tid(page, "select-ma-model"), text: "Type" },
          { locator: tid(page, "input-ma-year-from").locator("xpath=.."), text: "Bouwjaar" },
          { locator: tid(page, "select-ma-kmband"), text: "Km-klasse" },
          { locator: tid(page, "select-ma-supplier"), text: "Leverancier" },
          { locator: w.getByRole("tablist").first(), text: "tabbladen" },
          { locator: tid(page, "tab-content-ma-overview").getByTestId("button-report-print"), text: "Afdrukken" },
        ],
      });
    },
  },
  {
    name: "21-ma-overzicht",
    async run(page) {
      await openAnalysis(page);
      const content = tid(page, "tab-content-ma-overview");
      await shot(page, "21-ma-overzicht", {
        clip: content,
        marks: [
          { locator: tid(page, "button-ma-tile-perKm"), text: "Per km" },
          { locator: tid(page, "ma-category-chart-metric"), text: "Wat" },
          { locator: tid(page, "ma-category-chart-kind"), text: "Hoe" },
          { locator: tid(page, "ma-category-chart").locator(".recharts-pie-sector").first(), text: "taartstuk" },
          { locator: tid(page, "button-ma-top-vehicles-csv"), text: "CSV" },
        ],
      });
      // Een klik op een taartstuk: de kostenregels erachter.
      await tid(page, "ma-category-chart").locator(".recharts-pie-sector").first().click();
      const rows = tid(page, "dialog-ma-rows");
      await rows.waitFor();
      await settle(page);
      await page.waitForTimeout(500);
      await shot(page, "21-ma-regels", {
        clip: rows,
        marks: [
          { locator: rows.locator('[data-testid^="link-entity-vehicle-"]').first(), text: "kenteken" },
          { locator: rows.locator('[data-testid$="-csv"]').first(), text: "CSV" },
          { locator: rows.locator('[data-testid$="-print"]').first(), text: "Afdrukken" },
        ],
      });
    },
  },
  {
    name: "21-ma-merken",
    async run(page) {
      await openAnalysis(page);
      await tid(page, "tab-ma-brands").click();
      await tid(page, "ma-brands-table").waitFor();
      await settle(page);
      await page.waitForTimeout(600);
      const content = tid(page, "tab-content-ma-brands");
      const ford = content.locator('[data-testid^="ma-brands-row-"]').filter({ hasText: /^ford$/i }).first();
      await page.mouse.move(5, 5);
      await shot(page, "21-ma-merken", {
        box: await windowBox(page),
        marks: [
          { locator: tid(page, "ma-brand-chart-metric"), text: "Wat" },
          { locator: tid(page, "ma-brand-chart").locator(".recharts-bar-rectangle").first(), text: "staaf" },
          { locator: ford, text: "Ford" },
        ],
      });
      await ford.click();
      const models = tid(page, "ma-models");
      await models.waitFor();
      await settle(page);
      await page.waitForTimeout(500);
      await shot(page, "21-ma-typen", {
        clip: models,
        marks: [
          { locator: models.locator('[data-testid^="ma-models-table-row-"]').first(), text: "type" },
          { locator: tid(page, "button-ma-models-close"), text: "Typen sluiten" },
        ],
      });
      const km = tid(page, "ma-kmbands");
      await km.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, "21-ma-kmklassen", {
        clip: km,
        marks: [
          { locator: km.locator('[data-testid$="-0–50.000"]').first(), text: "nieuw: 0–50.000 km" },
          { locator: km.locator('[data-testid$="-200.000+"]').first(), text: "oud: 200.000+ km" },
        ],
      });
      // Terug naar alle merken: de km-klassen per merk.
      await tid(page, "button-ma-models-close").click();
      await page.waitForTimeout(500);
      await km.scrollIntoViewIfNeeded();
      await shot(page, "21-ma-kmklassen-merken", { clip: km, closeups: false });
    },
  },
  {
    name: "21-ma-voertuigen",
    async run(page) {
      await openAnalysis(page);
      await tid(page, "tab-ma-vehicles").click();
      await tid(page, "ma-vehicles-table").waitFor();
      await settle(page);
      const content = tid(page, "tab-content-ma-vehicles");
      await shot(page, "21-ma-voertuigen", {
        clip: content,
        marks: [
          { locator: tid(page, "ma-vehicles-table-search"), text: "Zoeken" },
          { locator: content.getByTestId("button-report-columns"), text: "Kolommen" },
          { locator: tid(page, "button-ma-vehicles-csv"), text: "CSV" },
          { locator: content.locator('[data-testid*="-sort-"]').first(), text: "kolomkop" },
        ],
      });
    },
  },
  {
    name: "21-ma-leveranciers",
    async run(page) {
      await openAnalysis(page);
      await tid(page, "tab-ma-suppliers").click();
      await tid(page, "ma-suppliers-table").waitFor();
      await settle(page);
      await page.waitForTimeout(600);
      const content = tid(page, "tab-content-ma-suppliers");
      await page.mouse.move(5, 5);
      await shot(page, "21-ma-leveranciers", {
        box: await windowBox(page),
        marks: [
          { locator: tid(page, "ma-supplier-chart").locator(".recharts-bar-rectangle").first(), text: "staaf" },
          { locator: content.locator('[data-testid^="ma-suppliers-table-row-"]').filter({ hasText: "Onbekend" }).first(), text: "Onbekend" },
        ],
      });
    },
  },
  {
    name: "21-ma-trends",
    async run(page) {
      await openAnalysis(page);
      await tid(page, "tab-ma-trends").click();
      await tid(page, "ma-trends-chart").waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      const content = tid(page, "tab-content-ma-trends");
      await page.mouse.move(5, 5);
      await shot(page, "21-ma-trends", { clip: tid(page, "ma-trends-chart").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), closeups: false });
      void content;
      const forecast = tid(page, "ma-forecast-table");
      await forecast.scrollIntoViewIfNeeded();
      await shot(page, "21-ma-verwachting", {
        clip: forecast,
        marks: [{ locator: forecast.locator('[data-testid^="ma-forecast-table-row-"]').first(), text: "verwachting per auto" }],
      });
    },
  },
  {
    name: "21-ma-signalen",
    async run(page) {
      await openAnalysis(page);
      await tid(page, "tab-ma-signals").click();
      await tid(page, "ma-signals-table").waitFor();
      await settle(page);
      const content = tid(page, "tab-content-ma-signals");
      const row = (re) => content.locator('[data-testid^="ma-signals-table-row-"]').filter({ hasText: re }).first();
      await shot(page, "21-ma-signalen", {
        clip: content,
        marks: [
          { locator: row(/Duurder dan de groep/), text: "Duurder dan de groep" },
          { locator: row(/Stijgende kosten/), text: "Stijgende kosten" },
          { locator: row(/Herhaalde reparatie/), text: "Herhaalde reparatie" },
        ],
      });
    },
  },
  {
    name: "21-ma-medewerker",
    async run(page) {
      const w = await openAnalysis(page);
      await shot(page, "21-ma-medewerker", { clip: w, marks: [{ locator: tid(page, "ma-filter-bar"), text: "geen Km-klasse" }], closeups: false });
    },
  },

  {
    name: "21-km-historie",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openVehicle(page, "65-PRC-8");
          await tid(page, "tab-vehicle-mileage").click();
      const panel = tid(page, "mileage-history-panel");
      await panel.waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      await tid(page, "tab-vehicle-mileage").scrollIntoViewIfNeeded();
      await shot(page, "21-km-historie", {
        marks: [
          tid(page, "tab-vehicle-mileage"),
          { locator: panel.getByTestId("button-report-print"), text: "Afdrukken" },
          { locator: tid(page, "button-mileage-csv"), text: "CSV" },
          { locator: tid(page, "mileage-tile-warnings"), text: "Waarschuwingen" },
        ],
      });
      await panel.getByTestId("button-report-print").click();
      const dlg = tid(page, "dialog-report-print");
      await dlg.waitFor();
      await tid(page, "print-preview-frame").waitFor();
      await page.waitForTimeout(1200);
      await shot(page, "21-km-afdrukvoorbeeld", { clip: dlg, closeups: false });
    },
  },
];

/**
 * Hoofdstuk 22 (Lease offertes): de lijst, een nieuwe offerte met het Excel-voorbeeld
 * (aanschaf 17.318, restwaarde 10.000, 48 maanden, 20.000 km, 9 %, ROB 275, verzekering
 * 97,80, wegenbelasting 34, overige 350 = EUR 466,23), de dealerofferte uitlezen,
 * varianten vergelijken, opslaan, PDF maken, kopieren, zoeken, de waarschuwing bij een
 * verstuurde offerte, geschiedenis, verwijderen en de prullenbak, Instellingen en het
 * sjabloon onder Documenten.
 *
 * De stappen bouwen op elkaar voort (een offerte wordt in de ene stap gemaakt en in
 * de volgende bewerkt). Draai dus altijd alles van dit hoofdstuk, met een beheerder:
 *   MSYS_NO_PATHCONV=1 node scripts/handleiding/run.mjs --account=e2e-admin 22-
 *
 * Het uitlezen van de dealerofferte gebruikt de AI-scanner. In de testomgeving is er
 * geen sleutel, dus het antwoord van de scanner wordt hier in de browser nagebootst
 * (page.route) met verzonnen gegevens; de rest van de stap is de echte app.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pathToFileURL } from "node:url";
import { BASE_URL, OUT_DIR, ROOT, api, closeDialogs, goto, settle, shot } from "./lib.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")).href;

const tid = (page, id) => page.getByTestId(id);
const editor = (page) => tid(page, "dialog-lease-quote-editor");
const state = { quoteId: null, copyId: null, deletedNumber: null };

/** De bewaarde PDF als plaatje (eerste pagina), zonder rode omlijning. */
async function renderPdfPage(bytes, file, width = 800) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const made = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  made.context.fillStyle = "#ffffff";
  made.context.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvas: null, canvasContext: made.context, viewport, intent: "print" }).promise;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, file), made.canvas.toBuffer("image/png"));
}

/** Een eenvoudige verzonnen dealerofferte (PDF) om te uploaden. */
async function makeDealerPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = [
    ["Autohuis Van Dam", bold, 18],
    ["Offerte Peugeot e-Partner Long Allure", bold, 14],
    ["Catalogusprijs                     EUR 16.400,00", font, 12],
    ["Opties                             EUR  1.250,00", font, 12],
    ["Korting                            EUR   -850,00", font, 12],
    ["Afleverkosten                      EUR    518,00", font, 12],
    ["Totaal excl. btw                   EUR 17.318,00", bold, 12],
    ["Totaal incl. btw                   EUR 20.954,78", font, 12],
    ["Levertijd: 8 weken", font, 12],
  ];
  let y = 780;
  for (const [text, f, size] of lines) {
    page.drawText(text, { x: 60, y, size, font: f, color: rgb(0, 0, 0) });
    y -= 28;
  }
  const file = path.join(os.tmpdir(), "dealerofferte-van-dam.pdf");
  fs.writeFileSync(file, await pdf.save());
  return file;
}

const SCAN_ANSWER = {
  parsed: {
    dealerName: "Autohuis Van Dam",
    make: "Peugeot",
    model: "e-Partner",
    trim: "Long Allure",
    catalogPrice: 16400,
    options: 1250,
    discount: -850,
    bpm: null,
    deliveryCosts: 518,
    totalExclVat: 17318,
    totalInclVat: 20954.78,
    deliveryTime: "8 weken",
    quoteDate: null,
    validUntil: null,
  },
  suggestion: { amount: 17318, onlyInclVat: false },
};

// The costs live on each variant: the quote body carries insurance / road tax once and they are copied to its variants.
const VARIANT_COSTS = { interestRatePercent: 9, robPerYear: 275, otherCostsPerYear: 350, marginPerMonth: 0, excessKmPrice: 0.08, shortfallKmPrice: 0.04 };

async function seedQuote(page, body) {
  const { insurancePerMonth = null, roadTaxPerMonth = null, ...quote } = body;
  const created = await api(page, "POST", "/api/lease-quotes", {
    ...quote,
    variants: quote.variants.map((v) => ({ ...VARIANT_COSTS, insurancePerMonth, roadTaxPerMonth, ...v })),
  });
  return created;
}

const base = (extra) => ({ ...extra });

async function openList(page) {
  // De tabel heeft negen kolommen; op 1280 px schuift hij zijdelings.
  await page.setViewportSize({ width: 1440, height: 900 });
  await goto(page, "/lease-quotes");
  await closeDialogs(page);
  await tid(page, "tab-lease-quotes").waitFor();
  await settle(page);
}

async function openQuote(page, id) {
  await tid(page, `row-lease-quote-${id}`).click();
  await editor(page).waitFor();
  await settle(page);
  await tid(page, "section-lease-customer").waitFor();
}

/** Scrolt een stuk van de offerte (in het venster) netjes in beeld, voordat er gemarkeerd en gefotografeerd wordt. */
async function reveal(page, locator) {
  await locator.first().evaluate((el) => {
    const dlg = el.closest('[role="dialog"]');
    dlg.scrollTop += el.getBoundingClientRect().top - dlg.getBoundingClientRect().top - 24;
  });
  await page.waitForTimeout(250);
}

async function typeInto(page, testId, value) {
  const field = tid(page, testId);
  await field.fill(value);
  await field.blur();
}

const pre = [
  {
    name: "22-voorbereiding",
    async run(page) {
      // Voorinstellingen zoals in het voorbeeld, en drie oude offertes voor een gevulde lijst.
      await api(page, "PUT", "/api/lease-quotes/settings", { interestRatePercent: 9, marginPerMonth: 0, robPerYear: 275, otherCostsPerYear: 350, excessKmPrice: 0.08, shortfallKmPrice: 0.04, validityDays: 30 });
      const list = await api(page, "GET", "/api/lease-quotes?pageSize=100");
      if (list.total > 0) return;
      await seedQuote(page, base({
        status: "sent", prospectName: "Peter Jansen", prospectCompany: "Installatiebedrijf Jansen", vehicleMake: "Renault", vehicleModel: "Kangoo E-Tech", vehicleTrim: "Extra",
        purchasePrice: 24500, insurancePerMonth: 105, roadTaxPerMonth: 0,
        variants: [{ termMonths: 48, kmPerYear: 25000, residualValue: 13000, isChosen: true }],
      }));
      await seedQuote(page, base({
        status: "accepted", prospectName: "Anja Groen", prospectCompany: "Hoveniersbedrijf Groen", vehicleMake: "Volkswagen", vehicleModel: "Caddy", vehicleTrim: "Life", licensePlate: "58-GRN-4",
        purchasePrice: 26900, insurancePerMonth: 120, roadTaxPerMonth: 38,
        variants: [{ termMonths: 60, kmPerYear: 30000, residualValue: 12500, isChosen: true }],
      }));
      await seedQuote(page, base({
        status: "concept", prospectName: "Mark van Dijk", prospectCompany: "Bakkerij Van Dijk B.V.", vehicleMake: "Opel", vehicleModel: "Vivaro", vehicleTrim: "L2H1",
        purchasePrice: 31200, insurancePerMonth: 130, roadTaxPerMonth: 42,
        variants: [{ termMonths: 36, kmPerYear: 20000, residualValue: 16000, isChosen: true }, { termMonths: 48, kmPerYear: 20000, residualValue: 14000, isChosen: false }],
      }));
    },
  },
  {
    name: "22-menu",
    async run(page) {
      await goto(page, "/dashboard");
      await closeDialogs(page);
      await settle(page);
      await shot(page, "22-menu", { marks: [page.getByRole("link", { name: "Lease offertes" })] });
    },
  },
  {
    name: "22-offertelijst",
    async run(page) {
      await openList(page);
      const row = page.locator('[data-testid^="row-lease-quote-"]').first();
      await shot(page, "22-offertelijst", {
        marks: [
          { locator: tid(page, "input-search-lease-quotes"), text: "Zoeken" },
          { locator: tid(page, "select-status-lease-quotes"), text: "Status" },
          tid(page, "tab-lease-settings"),
          { locator: tid(page, "button-open-recycle-bin-lease-quotes"), text: "Prullenbak" },
          { locator: tid(page, "button-new-lease-quote"), text: "Nieuwe offerte" },
          { locator: row.locator('[data-testid^="button-copy-lease-quote-"]'), text: "" },
          { locator: row.locator('[data-testid^="button-pdf-lease-quote-"]'), text: "" },
          { locator: row.locator('[data-testid^="button-delete-lease-quote-"]'), text: "" },
        ],
      });
    },
  },
];

const walk = [
  {
    name: "22-nieuwe-offerte",
    async run(page) {
      await openList(page);
      await tid(page, "button-new-lease-quote").click();
      await editor(page).waitFor();
      await settle(page);
      await tid(page, "section-lease-customer").waitFor();
      const title = await editor(page).getByRole("heading").first().innerText();
      console.log(`  offerte ${title}`);
      await shot(page, "22-nieuwe-offerte", {
        clip: editor(page),
        marks: [
          { locator: tid(page, "text-lease-chosen-total"), text: "Prijs per maand" },
          tid(page, "button-customer-mode-prospect"),
          { locator: tid(page, "button-upload-dealer-quote"), text: "Dealerofferte uploaden" },
          tid(page, "button-save-lease-quote"),
        ],
      });
    },
  },
  {
    name: "22-klant",
    async run(page) {
      await tid(page, "button-customer-mode-prospect").click();
      await typeInto(page, "input-prospectName", "Jan de Vries");
      await typeInto(page, "input-prospectCompany", "Bakkerij De Vries B.V.");
      await typeInto(page, "input-prospectEmail", "jan@bakkerijdevries.example");
      await typeInto(page, "input-prospectPhone", "06 12345678");
      await reveal(page, tid(page, "section-lease-customer"));
      await shot(page, "22-klant", {
        clip: tid(page, "section-lease-customer"),
        marks: [
          tid(page, "button-customer-mode-customer"),
          tid(page, "button-customer-mode-prospect"),
          tid(page, "input-prospectName"),
          tid(page, "input-prospectCompany"),
          tid(page, "input-prospectEmail"),
          tid(page, "input-prospectPhone"),
        ],
      });
    },
  },
  {
    name: "22-dealerofferte",
    async run(page) {
      const file = await makeDealerPdf();
      // De AI-scanner nabootsen (zie de kop van dit bestand).
      await page.route("**/api/lease-quotes/*/files/*/scan", async (route) => {
        await new Promise((r) => setTimeout(r, 400));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SCAN_ANSWER) });
      });
      await reveal(page, tid(page, "section-lease-vehicle"));
      await shot(page, "22-dealerofferte-knop", {
        clip: tid(page, "section-lease-vehicle"),
        marks: [{ locator: tid(page, "button-upload-dealer-quote"), text: "Dealerofferte uploaden" }],
      });
      await tid(page, "input-dealer-file").setInputFiles(file);
      const scan = tid(page, "dialog-dealer-scan");
      await scan.waitFor();
      await tid(page, "button-scan-apply").waitFor();
      await settle(page);
      await shot(page, "22-dealerofferte-controle", {
        clip: scan,
        marks: [
          { locator: tid(page, "checkbox-scan-purchasePrice"), text: "overnemen" },
          tid(page, "button-scan-apply"),
          tid(page, "button-scan-cancel"),
        ],
      });
      await tid(page, "button-scan-apply").click();
      await scan.waitFor({ state: "detached" });
      await settle(page);
      await reveal(page, tid(page, "section-lease-vehicle"));
      await shot(page, "22-dealerofferte-overgenomen", {
        clip: tid(page, "section-lease-vehicle"),
        marks: [tid(page, "input-vehicleMake"), tid(page, "input-vehicleModel"), tid(page, "input-vehicleTrim"), tid(page, "input-dealerName"), tid(page, "input-deliveryTime")],
      });
      await reveal(page, tid(page, "section-lease-purchase"));
      await shot(page, "22-aanschaf", {
        clip: tid(page, "section-lease-purchase"),
        marks: [tid(page, "input-purchasePrice"), { locator: page.getByText("Opbouw van de prijs (ter controle)"), text: "Opbouw ter controle" }],
      });
    },
  },
  {
    name: "22-kosten",
    async run(page) {
      // The costs are rows of the variants table (section 4), prefilled from the settings.
      await typeInto(page, "input-variant-insurancePerMonth-0", "97,80");
      await typeInto(page, "input-variant-roadTaxPerMonth-0", "34");
      await reveal(page, tid(page, "section-lease-variants"));
      await shot(page, "22-kosten", {
        clip: tid(page, "section-lease-variants"),
        marks: [
          tid(page, "input-variant-interestRatePercent-0"),
          tid(page, "input-variant-robPerYear-0"),
          tid(page, "input-variant-otherCostsPerYear-0"),
          tid(page, "input-variant-insurancePerMonth-0"),
          tid(page, "input-variant-roadTaxPerMonth-0"),
          tid(page, "input-variant-marginPerMonth-0"),
          tid(page, "input-variant-excessKmPrice-0"),
          tid(page, "input-variant-shortfallKmPrice-0"),
        ],
      });
    },
  },
  {
    name: "22-varianten",
    async run(page) {
      await typeInto(page, "input-variant-term-0", "48");
      await typeInto(page, "input-variant-km-0", "20000");
      await typeInto(page, "input-variant-residual-0", "10000");
      await settle(page);
      const total = (await tid(page, "variant-total-0").innerText()).trim();
      console.log(`  totaal variant 1: ${total}`);
      if (!/466,23/.test(total)) throw new Error(`Totaal is ${total}, verwacht 466,23`);
      await reveal(page, tid(page, "section-lease-variants"));
      await shot(page, "22-varianten", {
        clip: tid(page, "section-lease-variants"),
        marks: [
          { locator: tid(page, "input-variant-term-0"), text: "Looptijd", align: "left" },
          { locator: tid(page, "input-variant-km-0"), text: "Km per jaar", align: "left" },
          { locator: tid(page, "input-variant-residual-0"), text: "Restwaarde", align: "left" },
          { locator: tid(page, "variant-total-0"), text: "Totaal", align: "left" },
          { locator: tid(page, "variant-costPerKm-0"), text: "Per km", align: "left" },
        ],
      });
      await shot(page, "22-bovenaan-prijs", {
        box: await (async () => {
          await editor(page).evaluate((el) => el.scrollTo(0, 0));
          const header = await editor(page).getByRole("heading").first().boundingBox();
          return { x: header.x - 20, y: Math.max(0, header.y - 50), width: 760, height: 120 };
        })(),
        marks: [{ locator: tid(page, "text-lease-chosen-total"), text: "Naar de klant" }],
      });
    },
  },
  {
    name: "22-varianten-vergelijken",
    async run(page) {
      await tid(page, "button-add-variant").click();
      await typeInto(page, "input-variant-term-1", "60");
      await typeInto(page, "input-variant-residual-1", "7500");
      await tid(page, "button-duplicate-variant-0").click();
      await typeInto(page, "input-variant-term-1", "36");
      await typeInto(page, "input-variant-residual-1", "12000");
      await settle(page);
      await reveal(page, tid(page, "section-lease-variants"));
      await shot(page, "22-variant-toevoegen", {
        clip: tid(page, "section-lease-variants"),
        marks: [
          { locator: tid(page, "button-add-variant"), text: "Variant toevoegen" },
          { locator: tid(page, "button-duplicate-variant-0"), text: "Dupliceren", align: "left" },
          { locator: tid(page, "button-remove-variant-2"), text: "Verwijderen", align: "left" },
        ],
      });
      await tid(page, "button-choose-variant-2").click();
      await settle(page);
      await reveal(page, tid(page, "section-lease-variants"));
      await shot(page, "22-variant-gekozen", {
        clip: tid(page, "section-lease-variants"),
        marks: [{ locator: tid(page, "button-choose-variant-2"), text: "Deze naar de klant", align: "left" }, { locator: tid(page, "variant-total-2"), text: "Totaal", align: "left" }],
      });
      // Terug naar variant 1: de klant krijgt het Excel-voorbeeld.
      await tid(page, "button-choose-variant-0").click();
      await settle(page);
    },
  },
  {
    name: "22-offerte-gegevens",
    async run(page) {
      await typeInto(page, "input-internalNotes", "Klant wil eerst de 48 maanden zien.");
      await reveal(page, tid(page, "section-lease-quote"));
      await shot(page, "22-offerte-gegevens", {
        clip: tid(page, "section-lease-quote"),
        marks: [tid(page, "select-lease-quote-status"), tid(page, "input-quoteDate"), tid(page, "input-validUntil"), tid(page, "input-internalNotes")],
      });
    },
  },
  {
    name: "22-opslaan",
    async run(page) {
      await shot(page, "22-opslaan", {
        clip: tid(page, "button-save-lease-quote").locator("xpath=.."),
        marks: [
          tid(page, "button-save-lease-quote"),
          tid(page, "button-pdf-lease-quote"),
          tid(page, "button-copy-lease-quote"),
          tid(page, "button-history-lease-quote"),
          tid(page, "button-close-lease-quote"),
        ],
        pad: 40,
      });
      await tid(page, "button-save-lease-quote").click();
      const toast = page.getByText("De offerte is opgeslagen.", { exact: true }).locator("visible=true").first();
      await toast.waitFor();
      await shot(page, "22-opgeslagen", {
        box: { x: 0, y: 760, width: 640, height: 140 },
        marks: [{ locator: toast.locator("xpath=ancestor::li[1]"), text: "Melding" }],
      });
    },
  },
  {
    name: "22-pdf",
    async run(page) {
      const popups = [];
      page.context().on("page", (p) => popups.push(p));
      await tid(page, "button-pdf-lease-quote").click();
      await page.getByText(/^De PDF van offerte .* is gemaakt\.$/).locator("visible=true").first().waitFor();
      await settle(page);
      for (const p of popups) await p.close().catch(() => {});
      // Wacht tot de melding weg is, anders staat hij over de foto.
      await page.getByText(/^De PDF van offerte .* is gemaakt.$/).waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
      const section = tid(page, "section-lease-quote");
      const open = section.locator('[data-testid^="link-open-lease-file-"]').first();
      await editor(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(250);
      await shot(page, "22-pdf", {
        clip: section.locator("div.space-y-2").last(),
        marks: [{ locator: open, text: "Openen" }, { locator: section.locator('[data-testid^="link-download-lease-file-"]').first(), text: "Downloaden" }],
      });
      const href = await open.evaluate((a) => a.getAttribute("href"));
      const bytes = await (await page.request.get(`${BASE_URL}${href}`)).body();
      await renderPdfPage(bytes, "22-pdf-voorbeeld.png");
      console.log("  ✓ 22-pdf-voorbeeld.png");
    },
  },
  {
    name: "22-kopieren",
    async run(page) {
      await tid(page, "button-copy-lease-quote").click();
      const dlg = tid(page, "dialog-copy-lease-quote");
      await dlg.waitFor();
      await shot(page, "22-kopieren", {
        clip: dlg,
        marks: [tid(page, "button-copy-yes"), tid(page, "button-copy-no"), tid(page, "button-copy-cancel")],
      });
      await tid(page, "button-copy-no").click();
      await dlg.waitFor({ state: "detached" });
      await editor(page).getByText(/^Offerte LO-/).first().waitFor();
      await settle(page);
      await page.waitForTimeout(400);
      await shot(page, "22-kopie-geopend", {
        box: await (async () => {
          const header = await editor(page).getByRole("heading").first().boundingBox();
          return { x: header.x - 20, y: Math.max(0, header.y - 50), width: 760, height: 120 };
        })(),
        marks: [{ locator: editor(page).getByText(/^Offerte LO-/).first(), text: "Nieuw nummer" }],
      });
      await closeDialogs(page);
    },
  },
];

const post = [
  {
    name: "22-zoeken",
    async run(page) {
      await openList(page);
      await tid(page, "input-search-lease-quotes").fill("Vries");
      await settle(page);
      await page.waitForTimeout(500);
      await shot(page, "22-zoeken", {
        marks: [{ locator: tid(page, "input-search-lease-quotes"), text: "Zoeken" }, { locator: page.locator('[data-testid^="row-lease-quote-"]').first(), text: "Gevonden offerte" }],
      });
      await tid(page, "input-search-lease-quotes").fill("");
      await tid(page, "select-status-lease-quotes").click();
      await page.getByRole("option", { name: "Geaccepteerd" }).click();
      await settle(page);
      await shot(page, "22-status-filter", { marks: [{ locator: tid(page, "select-status-lease-quotes"), text: "Status" }, { locator: page.locator('[data-testid^="row-lease-quote-"]').first().locator("td").nth(6), text: "Alleen geaccepteerd" }] });
      await tid(page, "select-status-lease-quotes").click();
      await page.getByRole("option", { name: "Alle statussen" }).click();
      await settle(page);
    },
  },
  {
    name: "22-waarschuwing",
    async run(page) {
      await openList(page);
      await tid(page, "input-search-lease-quotes").fill("Vries");
      await settle(page);
      await page.waitForTimeout(500);
      // De eerste (nieuwste) treffer is de kopie; de oorspronkelijke offerte is de laatste.
      await page.locator('[data-testid^="row-lease-quote-"]').last().click();
      await editor(page).waitFor();
      await tid(page, "section-lease-customer").waitFor();
      await settle(page);
      await tid(page, "select-lease-quote-status").click();
      await page.getByRole("option", { name: "Verstuurd" }).click();
      await tid(page, "button-save-lease-quote").click();
      await page.getByText("De offerte is opgeslagen.", { exact: true }).locator("visible=true").first().waitFor();
      await typeInto(page, "input-internalNotes", "Klant wil eerst de 48 maanden zien. Gebeld op maandag.");
      await tid(page, "button-save-lease-quote").click();
      const confirm = tid(page, "button-confirm-edit-warning");
      await confirm.waitFor();
      await shot(page, "22-waarschuwing", {
        clip: page.getByRole("alertdialog"),
        marks: [{ locator: confirm, text: "Ja, wijzigen" }, { locator: page.getByRole("button", { name: "Nee", exact: true }), text: "Nee" }],
      });
      await confirm.click();
      await page.getByText("De offerte is opgeslagen.", { exact: true }).locator("visible=true").first().waitFor();
    },
  },
  {
    name: "22-geschiedenis",
    async run(page) {
      await tid(page, "button-history-lease-quote").click();
      const dlg = page.getByRole("dialog").last();
      await dlg.waitFor();
      await settle(page);
      await page.waitForTimeout(600);
      await shot(page, "22-geschiedenis", { clip: dlg });
      await closeDialogs(page);
    },
  },
  {
    name: "22-verwijderen",
    async run(page) {
      await openList(page);
      const first = page.locator('[data-testid^="row-lease-quote-"]').first();
      state.deletedNumber = (await first.locator("td").first().innerText()).trim();
      await first.locator('[data-testid^="button-delete-lease-quote-"]').click();
      const dlg = page.getByRole("alertdialog");
      await dlg.waitFor();
      await shot(page, "22-verwijderen", {
        clip: dlg,
        marks: [{ locator: tid(page, "button-confirm-delete-lease-quote"), text: "Verwijderen" }, { locator: dlg.getByRole("button", { name: "Annuleren" }), text: "Annuleren" }],
      });
      await tid(page, "button-confirm-delete-lease-quote").click();
      const toast = page.getByText(/staat in de prullenbak\.$/).locator("visible=true").first();
      await toast.waitFor();
      await settle(page);
      await shot(page, "22-verwijderd", { marks: [{ locator: toast.locator("xpath=ancestor::li[1]"), text: "Melding" }, { locator: tid(page, "button-open-recycle-bin-lease-quotes"), text: "Prullenbak" }] });
    },
  },
  {
    name: "22-prullenbak",
    async run(page) {
      await tid(page, "button-open-recycle-bin-lease-quotes").click();
      const dlg = page.getByRole("dialog").last();
      await dlg.waitFor();
      await settle(page);
      await page.waitForTimeout(500);
      const restore = dlg.getByRole("button", { name: /Terugzetten/ }).first();
      await shot(page, "22-prullenbak", { clip: dlg, marks: [{ locator: restore, text: "Terugzetten" }] });
      await restore.click();
      await page.waitForTimeout(800);
      await settle(page);
      await closeDialogs(page);
    },
  },
  {
    name: "22-instellingen",
    async run(page) {
      await openList(page);
      await tid(page, "tab-lease-settings").click();
      await tid(page, "button-save-lease-settings").waitFor();
      await settle(page);
      await shot(page, "22-instellingen", {
        marks: [
          { locator: tid(page, "input-interestRatePercent"), text: "" },
          { locator: tid(page, "input-marginPerMonth"), text: "" },
          { locator: tid(page, "input-robPerYear"), text: "" },
          { locator: tid(page, "input-otherCostsPerYear"), text: "" },
          { locator: tid(page, "input-excessKmPrice"), text: "" },
          { locator: tid(page, "input-shortfallKmPrice"), text: "" },
          { locator: tid(page, "input-validityDays"), text: "" },
          tid(page, "button-save-lease-settings"),
        ],
      });
      await tid(page, "button-save-lease-settings").click();
      const toast = page.getByText("De instellingen zijn opgeslagen.", { exact: true }).locator("visible=true").first();
      await toast.waitFor();
      await shot(page, "22-instellingen-opgeslagen", { box: { x: 0, y: 0, width: 1280, height: 640 }, marks: [{ locator: toast.locator("xpath=ancestor::li[1]"), text: "Melding" }] });
    },
  },
  {
    name: "22-sjabloon",
    async run(page) {
      await goto(page, "/documents");
      await closeDialogs(page);
      const tab = page.getByRole("tab", { name: "Lease offertes" });
      await tab.click();
      await settle(page);
      await shot(page, "22-sjabloon-tab", { marks: [tab] });
      const open = page.getByRole("button", { name: "Sjablooneditor openen" }).last();
      await open.click();
      const dlg = page.getByRole("dialog").last();
      await dlg.waitFor();
      await settle(page);
      await page.waitForTimeout(1000);
      await shot(page, "22-sjabloon-editor", {
        clip: dlg,
        marks: [
          { locator: dlg.getByRole("button", { name: "Opslaan" }), text: "Opslaan" },
          { locator: dlg.getByRole("button", { name: "Achtergrondbibliotheek" }), text: "Achtergrond" },
          { locator: dlg.getByRole("button", { name: "Veld toevoegen" }), text: "Veld toevoegen" },
        ],
      });
      await closeDialogs(page);
    },
  },
];

// De offerte maken (nieuwe-offerte t/m kopieren) is een stap: run.mjs sluit na elke stap de open
// vensters, en een half ingevulde offerte mag niet verloren gaan.
export const steps = [
  ...pre,
  {
    name: "22-offerte-maken",
    async run(page) {
      for (const part of walk) {
        console.log(`  - ${part.name}`);
        await part.run(page);
      }
    },
  },
  ...post,
];

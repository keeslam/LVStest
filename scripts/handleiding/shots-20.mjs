/** Hoofdstuk 20 (Klantenportaal en bekeuringen): portaalbeheer, aanvragen afhandelen, bekeuringen invoeren en koppelen. Vraagt seed-extra.mjs. */
import { closeDialogs, dialog, goto, settle, shot, ymd } from "./lib.mjs";

async function openRequest(page, text) {
  await goto(page, "/portal-admin");
  await closeDialogs(page);
  await settle(page);
  await page.getByText(text).first().click();
  const dlg = dialog(page, /Aanvraag #/);
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

export const steps = [
  {
    name: "20-klantenportaal-beheren",
    async run(page) {
      await goto(page, "/portal-admin");
      await closeDialogs(page);
      await settle(page);
      await shot(page, "20-klantenportaal-beheren", {
        marks: [
          page.getByRole("button", { name: "Bekeuringen", exact: true }),
          page.getByRole("button", { name: "Fiscale check" }),
          page.getByRole("button", { name: "Account uitnodigen" }),
          { locator: page.getByText("Aanvragen", { exact: true }).first().locator("xpath=ancestor::*[self::button or @role='button'][1]"), text: "Aanvragen" },
          { locator: page.getByText("Aandacht nodig", { exact: true }).first(), text: "Aandacht nodig" },
        ],
      });
    },
  },
  {
    name: "20-aanvraag-verlenging",
    async run(page) {
      const dlg = await openRequest(page, "Verlenging · Hoveniersbedrijf Groen");
      await dlg.getByRole("button", { name: "Akkoord" }).click();
      await page.waitForTimeout(300);
      await shot(page, "20-aanvraag-verlenging", {
        clip: dlg,
        marks: [
          { locator: dlg.getByRole("button", { name: /^#\d+ 65-PRC-8/ }), text: "Reservering" },
          dlg.getByRole("button", { name: "Akkoord" }),
          dlg.getByRole("textbox", { name: "Antwoord aan klant" }),
          dlg.getByRole("button", { name: "In behandeling nemen" }),
          dlg.getByRole("button", { name: "Goedkeuren (past reservering aan)" }),
          dlg.getByRole("button", { name: "Beantwoorden en afhandelen" }),
          dlg.getByRole("button", { name: "Afwijzen" }),
        ],
      });
    },
  },
  {
    name: "20-aanvraag-huur",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1400 });
      const dlg = await openRequest(page, "Huuraanvraag · Bakkerij Van Dijk B.V.");
      await shot(page, "20-aanvraag-huur", {
        clip: dlg,
        marks: [dlg.getByRole("button", { name: "Goedkeuren: reservering aanmaken" }), dlg.getByRole("button", { name: "Antwoord mailen (blijft open)" }), dlg.getByRole("button", { name: "Afwijzen" })],
      });
      await dlg.getByRole("button", { name: "Goedkeuren: reservering aanmaken" }).click();
      await page.waitForTimeout(1200);
      await settle(page);
      const create = dlg.getByRole("button", { name: "Reservering aanmaken en goedkeuren" });
      await create.scrollIntoViewIfNeeded();
      await shot(page, "20-aanvraag-huur-reservering", { clip: dlg, marks: [create] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "20-aanvraag-onderhoud",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1400 });
      const dlg = await openRequest(page, "Onderhoud/storing · Installatiebedrijf Jansen");
      const plan = dlg.getByRole("button", { name: "Inplannen in de onderhoudskalender" });
      await shot(page, "20-aanvraag-onderhoud", { clip: dlg, marks: [plan] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "20-bekeuringen",
    async run(page) {
      await goto(page, "/fines");
      await closeDialogs(page);
      await settle(page);
      await shot(page, "20-bekeuringen", {
        marks: [
          page.getByRole("button", { name: "Exporteren (CSV)" }),
          page.getByRole("button", { name: "Prullenbak" }),
          page.getByRole("button", { name: "CJIB-importen" }),
          page.getByRole("button", { name: "Brieven scannen" }),
          page.getByRole("button", { name: "Nieuwe bekeuring" }),
        ],
      });
    },
  },
  {
    name: "20-nieuwe-bekeuring",
    async run(page) {
      await goto(page, "/fines");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Nieuwe bekeuring" }).click();
      const dlg = dialog(page, "Nieuwe bekeuring");
      await dlg.waitFor();
      await dlg.getByRole("textbox", { name: "Kenteken" }).fill("56-TRN-7");
      await dlg.getByRole("textbox", { name: "Datum en tijd overtreding" }).fill(`${ymd(-9)}T08:15`);
      await dlg.getByRole("textbox", { name: "Kenmerk (CJIB)" }).fill("CJIB-3001-2026-04588");
      await dlg.getByRole("spinbutton", { name: "Bedrag (€)" }).fill("73");
      await dlg.getByRole("textbox", { name: "Omschrijving" }).fill("Door rood licht gereden, Spaanse Polder Rotterdam");
      await page.waitForTimeout(500);
      await shot(page, "20-nieuwe-bekeuring", {
        clip: dlg,
        marks: [
          { locator: dlg.getByRole("button", { name: "Brief (PDF/JPG/PNG)" }), text: "Brief kiezen" },
          dlg.getByRole("button", { name: "Brief scannen" }),
          dlg.getByRole("textbox", { name: "Kenteken" }),
          dlg.getByRole("textbox", { name: "Datum en tijd overtreding" }),
          dlg.getByRole("spinbutton", { name: "Bedrag (€)" }),
          dlg.getByRole("textbox", { name: "Omschrijving" }),
          dlg.getByRole("button", { name: "Opslaan" }),
        ],
      });
    },
  },
  {
    name: "20-bekeuring-koppelen",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1400 });
      await goto(page, "/fines");
      await closeDialogs(page);
      await settle(page);
      await page.getByText("Snelheidsovertreding 12 km/u").first().click();
      const dlg = dialog(page, /Bekeuring #/);
      await dlg.waitFor();
      await settle(page);
      const search = dlg.getByRole("textbox", { name: "Klant zoeken…" });
      await search.fill("Hoveniers");
      await page.waitForTimeout(600);
      await dlg.getByText("Hoveniersbedrijf Groen").first().click();
      await page.waitForTimeout(600);
      const link = dlg.getByRole("button", { name: "Koppelen" });
      await link.scrollIntoViewIfNeeded();
      await shot(page, "20-bekeuring-koppelen", {
        clip: dlg,
        marks: [{ locator: dlg.getByRole("button", { name: "Wijzigen" }).first().locator("xpath=.."), text: "Gekozen klant" }, dlg.getByRole("textbox", { name: "Toelichting voor klant" }), link],
      });
      await link.click();
      await page.waitForTimeout(1200);
      await settle(page);
      const inform = dlg.getByRole("button", { name: /Klant informeren/ });
      if (await inform.count()) {
        await inform.first().scrollIntoViewIfNeeded();
        await shot(page, "20-bekeuring-gekoppeld", { clip: dlg, marks: [inform.first()] });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "20-cjib-importen",
    async run(page) {
      await goto(page, "/fines");
      await closeDialogs(page);
      await page.getByRole("button", { name: "CJIB-importen" }).click();
      const dlg = dialog(page);
      await dlg.waitFor();
      await settle(page);
      await shot(page, "20-cjib-importen", { clip: dlg, marks: [dlg.getByRole("button", { name: "Nu ophalen" }), dlg.getByRole("button", { name: "Bestand uploaden" })] });
      await closeDialogs(page);
      await page.getByRole("button", { name: "Brieven scannen" }).click();
      const scan = dialog(page);
      await scan.waitFor();
      await settle(page);
      await shot(page, "20-brieven-scannen", { clip: scan });
    },
  },
  {
    name: "20-fiscale-check",
    async run(page) {
      await goto(page, "/portal-admin");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Fiscale check" }).click();
      const dlg = dialog(page);
      await dlg.waitFor();
      await settle(page);
      await shot(page, "20-fiscale-check", { clip: dlg });
    },
  },
];

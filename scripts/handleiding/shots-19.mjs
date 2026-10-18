/** Hoofdstuk 19 (Kosten en facturen): het scherm Kostenbeheer, kosten registreren, ontvangen facturen controleren en boeken. Vraagt seed-extra.mjs. */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

async function openInbox(page) {
  await goto(page, "/expenses");
  await closeDialogs(page);
  await page.getByRole("button", { name: /^Ontvangen facturen/ }).click();
  const inbox = dialog(page, "Ontvangen facturen");
  await inbox.waitFor();
  await settle(page);
  return inbox;
}

export const steps = [
  {
    name: "19-kostenbeheer",
    async run(page) {
      await goto(page, "/expenses");
      await closeDialogs(page);
      await shot(page, "19-kostenbeheer", {
        marks: [
          page.getByRole("button", { name: "Verwijderde kostenposten" }),
          page.getByRole("button", { name: /^Ontvangen facturen/ }),
          page.getByRole("button", { name: "Factuur scannen" }),
          page.getByRole("button", { name: "Kosten registreren" }),
        ],
      });
      await shot(page, "19-kostenoverzicht-filters", {
        box: { x: 256, y: 180, width: 760, height: 420 },
        marks: [
          { locator: page.getByRole("button", { name: "Alle voertuigen" }), text: "Voertuig" },
          page.getByRole("textbox", { name: "Van", exact: true }),
          page.getByRole("textbox", { name: "Tot en met" }),
          page.getByRole("combobox", { name: "Categorie" }),
          { locator: page.getByRole("textbox", { name: /Zoeken op kenteken, merk, categorie/ }), text: "Zoeken" },
          page.getByRole("button", { name: "Deze maand" }),
          page.getByRole("button", { name: "Exporteren (CSV)" }),
        ],
      });
      const perCategory = page.getByRole("button", { name: "Per categorie" });
      await perCategory.scrollIntoViewIfNeeded();
      await shot(page, "19-kosten-per-categorie", {
        marks: [perCategory, page.getByRole("button", { name: "Alle kosten" }), page.getByRole("button", { name: /^Banden \(/ })],
      });
    },
  },
  {
    name: "19-kosten-registreren",
    async run(page) {
      // Het formulier is hoger dan 900 px.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await goto(page, "/expenses");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Kosten registreren" }).click();
      const form = dialog(page, "Nieuwe kosten toevoegen");
      await form.waitFor();
      await form.getByRole("button", { name: "Zoek en selecteer een voertuig..." }).click();
      await page.keyboard.type("Transit");
      await page.waitForTimeout(600);
      await page.getByText("56-TRN-7", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(300);
      await form.getByRole("combobox", { name: "Categorie" }).click();
      await page.getByRole("option", { name: /Schoonmaak/ }).first().click();
      await form.getByRole("spinbutton", { name: /Bedrag/ }).fill("39.50");
      await form.getByRole("textbox", { name: "Omschrijving" }).fill("Binnenkant laten reinigen na verhuur");
      await shot(page, "19-kosten-registreren", {
        clip: form,
        marks: [
          { locator: form.getByRole("button", { name: /56-TRN-7|Zoek en selecteer een voertuig/ }), text: "Voertuig" },
          form.getByRole("combobox", { name: "Categorie" }),
          form.getByRole("spinbutton", { name: /Bedrag/ }),
          form.getByRole("textbox", { name: "Datum", exact: true }),
          form.getByRole("textbox", { name: "Omschrijving" }),
          { locator: form.getByRole("tab", { name: "Bestand uploaden" }), text: "Bon toevoegen" },
          form.getByRole("button", { name: "Kosten registreren" }),
        ],
      });
      await form.getByRole("button", { name: "Kosten registreren" }).click();
      const toast = page.getByText("Kosten succesvol geregistreerd", { exact: true }).locator("visible=true").first();
      await toast.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(450);
      await shot(page, "19-kosten-geregistreerd", { box: { x: 0, y: 1140, width: 640, height: 260 }, marks: [{ locator: toast.locator("xpath=ancestor::li[1]"), text: "Melding" }] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "19-ontvangen-facturen",
    async run(page) {
      const inbox = await openInbox(page);
      await shot(page, "19-ontvangen-facturen", {
        clip: inbox,
        marks: [
          inbox.getByRole("button", { name: "Nu ophalen" }),
          inbox.getByRole("button", { name: "Logboek" }),
          { locator: inbox.getByRole("tablist"), text: "tabbladen" },
          inbox.getByRole("button", { name: "Controleren" }).first(),
        ],
      });
      await inbox.getByRole("button", { name: "Logboek" }).click();
      const log = dialog(page, /Logboek/);
      await log.waitFor();
      await settle(page);
      await shot(page, "19-factuurpostvak-logboek", { clip: log, marks: [{ locator: log.getByRole("tablist"), text: "tabbladen" }] });
    },
  },
  {
    name: "19-factuur-controleren",
    async run(page) {
      // Viewport hoger: het controlevenster is lang.
      await page.setViewportSize({ width: 1280, height: 1300 });
      const inbox = await openInbox(page);
      await inbox.getByRole("button", { name: "Controleren" }).first().click();
      const review = dialog(page, "Factuur controleren");
      await review.waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, "19-factuur-controleren", {
        clip: review,
        marks: [
          review.getByRole("textbox", { name: "Leverancier" }),
          { locator: review.getByRole("button", { name: /^Voertuig/ }), text: "Voertuig" },
          { locator: review.getByRole("checkbox", { name: /Alles selecteren/ }), text: "Regels" },
          review.getByRole("button", { name: "Afzender vertrouwen" }),
          review.getByRole("button", { name: "Afwijzen" }),
          review.getByRole("button", { name: "Boeken" }),
        ],
      });
      await review.getByRole("button", { name: "Boeken" }).click();
      await page.waitForTimeout(1500);
      await settle(page);
      const booked = dialog(page, "Ontvangen facturen");
      if (await booked.isVisible().catch(() => false)) {
        await booked.getByRole("tab", { name: /Geboekt/ }).click();
        await page.waitForTimeout(800);
        await shot(page, "19-factuur-geboekt", { clip: booked, marks: [booked.getByRole("tab", { name: /Geboekt/ })] });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "19-factuur-scannen",
    async run(page) {
      await goto(page, "/expenses");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Factuur scannen" }).click();
      const scan = page.locator('[role="dialog"]').last();
      await scan.waitFor();
      await settle(page);
      await shot(page, "19-factuur-scannen", { clip: scan });
    },
  },
  {
    name: "19-verwijderde-kostenposten",
    async run(page) {
      await goto(page, "/expenses");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Verwijderde kostenposten" }).click();
      const bin = dialog(page);
      await bin.waitFor();
      await settle(page);
      await shot(page, "19-verwijderde-kostenposten", { clip: bin });
    },
  },
];

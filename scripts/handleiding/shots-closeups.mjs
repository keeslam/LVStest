/**
 * Uitvergrotingen: één knop, veld of tegel met wat ruimte eromheen, zodat de
 * lezer precies ziet waar hij moet klikken. Draait na de gewone hoofdstukken
 * (de bestandsnamen beginnen met het hoofdstuknummer).
 */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const PAD = 36;
const userButton = (page) => page.locator("header button").filter({ hasText: /admin|manager/i }).first();

async function closeup(page, name, locator, marks = [locator]) {
  await shot(page, name, { clip: locator, pad: PAD, marks });
}

export const steps = [
  {
    name: "01-close-zoekveld",
    async run(page) {
      await goto(page, "/");
      await closeup(page, "01-close-zoekveld", page.getByRole("textbox", { name: "Zoeken..." }));
      await closeup(page, "01-close-naam", userButton(page));
      await closeup(page, "01-close-belletje", page.getByRole("button", { name: /^Meldingen/ }));
      await closeup(page, "02-close-menu-klanten", page.getByRole("link", { name: "Klanten" }));
      await closeup(page, "02-close-tegel-ophalen", page.getByRole("button", { name: /^Ophalen starten/ }));
      await closeup(page, "02-close-tegel-innemen", page.getByRole("button", { name: /^Innemen starten/ }));
      await closeup(page, "02-close-tegel-nieuwe-reservering", page.getByRole("button", { name: "Nieuwe reservering" }));
    },
  },
  {
    name: "03-close-klanten",
    async run(page) {
      await goto(page, "/customers");
      await closeup(page, "03-close-knop-klant-toevoegen", page.getByRole("button", { name: "Klant toevoegen" }));
      const row = page.getByRole("row").filter({ hasText: "Bakkerij Van Dijk" }).first();
      await shot(page, "03-close-rij-bekijken", { clip: row, pad: 8, marks: [row.getByRole("button", { name: "Bekijken", exact: true }), row.getByRole("button", { name: "Nieuwe reservering" }), row.getByRole("button", { name: "Verwijderen" })] });
      await closeup(page, "03-close-zoekveld-klanten", page.getByRole("textbox", { name: "Klanten zoeken" }));
      await row.getByRole("button", { name: "Bekijken", exact: true }).click();
      const dlg = dialog(page, "Klantgegevens");
      await dlg.waitFor();
      await settle(page);
      await closeup(page, "03-close-tabbladen-klant", dlg.getByRole("tablist"), [dlg.getByRole("tab", { name: "Chauffeurs" }), dlg.getByRole("tab", { name: "Portaal" })]);
      const block = dlg.getByRole("button", { name: "Voertuig blokkeren" });
      await block.scrollIntoViewIfNeeded();
      await closeup(page, "03-close-knop-voertuig-blokkeren", block);
    },
  },
  {
    name: "04-close-voertuigen",
    async run(page) {
      await goto(page, "/vehicles");
      await closeup(page, "04-close-knop-voertuig-toevoegen", page.getByRole("button", { name: "Voertuig toevoegen" }));
      await closeup(page, "04-close-zoekveld-voertuigen", page.getByRole("textbox", { name: /Zoeken op kenteken/ }));
      const row = page.getByRole("row").filter({ hasText: "34-SPR-5" }).first();
      await shot(page, "04-close-rij-voertuig", { clip: row, pad: 8, marks: [row.getByRole("button", { name: "Bekijken", exact: true })] });
      await row.getByRole("button", { name: "Bekijken", exact: true }).click();
      const dlg = dialog(page, /Voertuiggegevens/);
      await dlg.waitFor();
      await settle(page);
      await closeup(page, "04-close-knoppen-voertuigkaart", dlg.getByRole("button", { name: "Terug" }).locator("xpath=.."), [
        dlg.getByRole("button", { name: "Barcode bekijken" }),
        dlg.getByRole("button", { name: "Bewerken" }),
        dlg.getByRole("button", { name: "Brandstofstatus bijwerken" }),
        dlg.getByRole("button", { name: "Verwijderen" }),
        dlg.getByRole("button", { name: "Nieuwe reservering" }),
      ]);
    },
  },
  {
    name: "05-close-reserveringen",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await closeup(page, "05-close-knop-nieuwe-reservering", page.getByRole("button", { name: "Nieuwe reservering" }));
      const entry = page.getByText("34-SPR-5", { exact: true }).first();
      const cell = entry.locator("xpath=ancestor::*[contains(@class,'min-h') or contains(@class,'border')][1]");
      await shot(page, "05-close-dagvakje", { clip: cell, pad: 12, marks: [entry] });
      await entry.click();
      const dlg = dialog(page, /Reserveringsdetails/);
      await dlg.waitFor();
      await settle(page);
      await closeup(page, "05-close-knop-ophalen-starten", dlg.getByRole("button", { name: "Ophalen starten" }));
      await dlg.getByRole("button", { name: "Ophalen starten" }).click();
      const pickup = dialog(page, "Ophaalproces starten");
      const warning = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
      await Promise.race([warning.waitFor({ timeout: 15_000 }), pickup.waitFor({ timeout: 15_000 })]);
      if (await warning.isVisible().catch(() => false)) await warning.getByRole("button", { name: /Ik bevestig/ }).click();
      await pickup.waitFor();
      await settle(page);
      await closeup(page, "05-close-velden-ophalen", pickup.getByText("Ophaaldetails").locator("xpath=.."), [
        pickup.getByRole("textbox", { name: /Contractnummer/ }),
        pickup.getByRole("spinbutton", { name: /Kilometerstand bij ophalen/ }),
      ]);
      await closeup(page, "05-close-knop-ophalen-voltooien", pickup.getByRole("button", { name: /Ophalen voltooien/ }));
      await closeDialogs(page);
    },
  },
  {
    name: "07-close-onderhoud",
    async run(page) {
      await goto(page, "/maintenance");
      await closeDialogs(page);
      await closeup(page, "07-close-knop-onderhoud-plannen", page.getByRole("button", { name: "Onderhoud plannen" }));
    },
  },
  {
    name: "06-close-transport",
    async run(page) {
      await goto(page, "/delivery");
      await closeup(page, "06-close-knop-nieuw-transport", page.getByRole("button", { name: "Nieuw transport" }));
    },
  },
  {
    name: "08-close-documenten",
    async run(page) {
      await goto(page, "/documents");
      await closeup(page, "08-close-knop-document-uploaden", page.getByRole("button", { name: "Document uploaden" }));
      await closeup(page, "08-close-tabbladen-documenten", page.getByRole("tablist").first(), [page.getByRole("tab", { name: "Contractsjablonen" }), page.getByRole("tab", { name: "Barcodelabels" })]);
    },
  },
  {
    name: "09-close-communicatie",
    async run(page) {
      await goto(page, "/communications");
      await closeup(page, "09-close-tabbladen-communicatie", page.getByRole("tablist").first(), [page.getByRole("tab", { name: "Meldingen versturen" }), page.getByRole("tab", { name: "E-maillogboek" })]);
    },
  },
  {
    name: "18-close-scannen",
    async run(page) {
      await goto(page, "/scan");
      await closeup(page, "18-close-scanveld", page.getByRole("textbox", { name: /Scan of typ een barcode/ }), [page.getByRole("textbox", { name: /Scan of typ een barcode/ }), page.getByRole("button", { name: "Zoeken" })]);
    },
  },
];

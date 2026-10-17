/** Hoofdstuk 4 (Voertuigen): lijst, voertuigkaart, toevoegen, bewerken, brandstof, barcode, verwijderen. */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const SPRINTER = "34-SPR-5";
const TEMP = "77-TMP-7";

export async function openVehicle(page, plate) {
  await goto(page, "/vehicles");
  const search = page.getByRole("textbox", { name: /Zoeken op kenteken/ });
  await search.fill(plate);
  await page.waitForTimeout(600);
  await settle(page);
  await page.getByRole("button", { name: "Bekijken", exact: true }).first().click();
  const warning = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
  if (await warning.isVisible({ timeout: 1500 }).catch(() => false)) {
    await warning.getByRole("button", { name: "Ik begrijp het" }).click();
  }
  const dlg = dialog(page, /Voertuiggegevens/);
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

async function pickOption(page, combobox, option) {
  await combobox.click();
  await page.getByRole("option", { name: option }).first().click();
  await page.waitForTimeout(300);
}

export const steps = [
  {
    name: "04-voertuigen-lijst-knoppen",
    async run(page) {
      await goto(page, "/vehicles");
      await shot(page, "04-voertuigen-lijst-knoppen", {
        marks: [
          page.getByRole("textbox", { name: /Zoeken op kenteken/ }),
          page.getByRole("button", { name: "Filter functies" }),
          page.getByRole("combobox").nth(0),
          page.getByRole("combobox").nth(1),
          page.getByRole("button", { name: "Bekijken", exact: true }).first(),
          page.getByRole("button", { name: "Voertuig toevoegen" }),
        ],
      });
      await shot(page, "04-voertuigen-knoppen-rechtsboven", {
        box: { x: 256, y: 60, width: 1024, height: 110 },
        marks: [
          page.getByRole("button", { name: "Verwijderde voertuigen" }),
          page.getByRole("button", { name: "Barcodeboek" }),
          page.getByRole("button", { name: "Sleutelkast-audit" }),
          page.getByRole("button", { name: "Reservesleutelkast-audit" }),
          page.getByRole("button", { name: "Bulk importeren" }),
          page.getByRole("button", { name: "Voertuig toevoegen" }),
        ],
      });
    },
  },
  {
    name: "04-voertuigopmerkingen",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("textbox", { name: /Zoeken op kenteken/ }).fill("12-VKL-3");
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Bekijken", exact: true }).first().click();
      const warning = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
      await warning.waitFor();
      await shot(page, "04-voertuigopmerkingen", { clip: warning, marks: [warning.getByRole("button", { name: "Ik begrijp het" })] });
    },
  },
  {
    name: "04-voertuiggegevens",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await shot(page, "04-voertuiggegevens", {
        clip: dlg,
        marks: [
          dlg.getByRole("button", { name: "Barcode bekijken" }),
          dlg.getByRole("button", { name: "Bewerken" }),
          dlg.getByRole("button", { name: "Brandstofstatus bijwerken" }),
          dlg.getByRole("button", { name: "Nieuwe reservering" }),
          dlg.getByRole("tablist"),
        ],
      });
      await shot(page, "04-voertuigkaart-tegels", {
        clip: dlg,
        marks: [
          dlg.getByRole("button", { name: "Kilometerstand aanpassen" }),
          dlg.getByRole("button", { name: "Brandstofniveau aanpassen" }),
          dlg.getByRole("button", { name: "APK-vervaldatum aanpassen" }),
        ],
      });
      const change = dlg.getByRole("button", { name: "Wijzigen" }).first();
      await change.scrollIntoViewIfNeeded();
      await shot(page, "04-beschikbaarheidsstatus", { clip: dlg, marks: [change] });
    },
  },
  {
    name: "04-kilometerstand",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("button", { name: "Kilometerstand aanpassen" }).click();
      const km = dialog(page, "Kilometerstand aanpassen");
      await km.waitFor();
      await km.getByRole("spinbutton").fill("82350");
      await shot(page, "04-kilometerstand", { clip: km, marks: [km.getByRole("spinbutton"), km.getByRole("button", { name: "Opslaan" })] });
    },
  },
  {
    name: "04-brandstofstatus",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("button", { name: "Brandstofstatus bijwerken" }).click();
      const fuel = dialog(page, "Brandstofstatus bijwerken");
      await fuel.waitFor();
      await pickOption(page, fuel.getByRole("combobox", { name: "Brandstofniveau" }), "Vol");
      await fuel.getByRole("textbox", { name: /Tankkosten/ }).fill("45,50");
      await shot(page, "04-brandstofstatus", {
        clip: fuel,
        marks: [fuel.getByRole("combobox", { name: "Brandstofniveau" }), fuel.getByRole("textbox", { name: /Tankkosten/ }), fuel.getByRole("button", { name: "Bon uploaden" }), fuel.getByRole("button", { name: "Brandstofstatus bijwerken" })],
      });
    },
  },
  {
    name: "04-tabbladen",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("tab", { name: "Documenten" }).click();
      await settle(page);
      await shot(page, "04-documenten-tabblad", {
        clip: dlg,
        marks: [dlg.getByRole("tab", { name: "Documenten" }), dlg.getByRole("button", { name: "Document uploaden" }), dlg.getByRole("button", { name: "Nieuwe check" })],
      });
      await dlg.getByRole("tab", { name: "Onderhoud" }).click();
      await settle(page);
      await shot(page, "04-onderhoud-tabblad", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Onderhoud" })] });
      await dlg.getByRole("tab", { name: "Kosten" }).click();
      await settle(page);
      await shot(page, "04-kosten-tabblad", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Kosten" })] });
      await dlg.getByRole("tab", { name: "Geschiedenis" }).click();
      await settle(page);
      await shot(page, "04-geschiedenis-tabblad", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Geschiedenis" })] });
    },
  },
  {
    name: "04-klant-zwarte-lijst",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("tab", { name: "Reserveringen" }).click();
      await settle(page);
      const add = dlg.getByRole("button", { name: "Toevoegen aan zwarte lijst" }).first();
      await add.scrollIntoViewIfNeeded();
      await shot(page, "04-klant-zwarte-lijst", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Reserveringen" }), add] });
    },
  },
  {
    name: "04-voertuigbarcode",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("button", { name: "Barcode bekijken" }).click();
      const bc = dialog(page, "Voertuigbarcode");
      await bc.waitFor();
      await settle(page);
      await shot(page, "04-voertuigbarcode", {
        clip: bc,
        marks: [bc.getByRole("combobox", { name: "Labelsjabloon" }), bc.getByRole("button", { name: "Sleutellabel afdrukken" }), bc.getByRole("button", { name: "Reservesleutel-label afdrukken" })],
      });
      await pickOption(page, bc.getByRole("combobox", { name: "Labelsjabloon" }), /DYMO-tape/);
      await settle(page);
      await shot(page, "04-voertuigbarcode-dymo", { clip: bc });
    },
  },
  {
    name: "04-voertuig-bewerken",
    async run(page) {
      const dlg = await openVehicle(page, SPRINTER);
      await dlg.getByRole("button", { name: "Bewerken" }).click();
      const edit = dialog(page, "Voertuig bewerken");
      await edit.waitFor();
      await shot(page, "04-voertuig-bewerken", {
        clip: edit,
        marks: [edit.getByRole("button", { name: "Opzoeken" }), edit.getByRole("tablist"), edit.getByRole("button", { name: "Voertuig bijwerken" })],
      });
      for (const [tab, name] of [["Technisch", "04-voertuig-bewerken-technisch"], ["Datums", "04-voertuig-bewerken-datums"], ["Contract", "04-voertuig-bewerken-contract"], ["Overig", "04-voertuig-bewerken-overig"]]) {
        await edit.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(300);
        await shot(page, name, { clip: edit, marks: [edit.getByRole("tab", { name: tab })] });
      }
    },
  },
  {
    name: "04-voertuig-toevoegen",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Voertuig toevoegen" }).click();
      const add = dialog(page, "Nieuw voertuig toevoegen");
      await add.waitFor();
      await add.getByRole("textbox", { name: "Kenteken" }).fill("99-XYZ-1");
      await shot(page, "04-voertuig-toevoegen", {
        clip: add,
        marks: [add.getByRole("textbox", { name: "Kenteken" }), add.getByRole("button", { name: "Opzoeken" }), add.getByRole("button", { name: "Voertuig toevoegen" })],
      });
      await add.getByRole("button", { name: "Opzoeken" }).click();
      await page.waitForTimeout(1500);
      await settle(page);
      await shot(page, "04-voertuig-toevoegen-rdw", { clip: add });
    },
  },
  {
    name: "04-bulk-importeren",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Bulk importeren" }).click();
      const bulk = dialog(page, "Voertuigen bulk importeren");
      await bulk.waitFor();
      await bulk.getByRole("textbox", { name: "Kentekens" }).fill("88-PQR-2\n66-KLM-4");
      await shot(page, "04-bulk-importeren", {
        clip: bulk,
        marks: [bulk.getByRole("checkbox"), bulk.getByRole("tab", { name: "CSV uploaden" }), bulk.getByRole("textbox", { name: "Kentekens" }), bulk.getByRole("button", { name: "Import starten" })],
      });
    },
  },
  {
    name: "04-barcodeboek",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Barcodeboek" }).click();
      const book = dialog(page, "Barcodeboek");
      await book.waitFor();
      await settle(page);
      await shot(page, "04-barcodeboek", {
        clip: book,
        marks: [book.getByRole("combobox", { name: "Labelsjabloon" }), book.getByRole("button", { name: /Alles afdrukken/ }), book.getByRole("button", { name: "Stickers afdrukken" })],
      });
    },
  },
  {
    name: "04-voertuig-verwijderen",
    async run(page) {
      const sprinter = await openVehicle(page, SPRINTER);
      await sprinter.getByRole("button", { name: "Verwijderen" }).first().click();
      const blocked = dialog(page, "Voertuig verwijderen");
      await blocked.waitFor();
      await settle(page);
      await shot(page, "04-voertuig-verwijderen-geweigerd", { clip: blocked });
      await closeDialogs(page);

      const temp = await openVehicle(page, TEMP);
      await temp.getByRole("button", { name: "Verwijderen" }).first().click();
      const del = dialog(page, "Voertuig verwijderen");
      await del.waitFor();
      await settle(page);
      await del.getByRole("textbox").first().fill(TEMP);
      await shot(page, "04-voertuig-verwijderen", { clip: del, marks: [del.getByRole("textbox").first(), del.getByRole("button", { name: "Voertuig verwijderen" })] });
      await del.getByRole("button", { name: "Voertuig verwijderen" }).click();
      await settle(page);
      await closeDialogs(page);

      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Verwijderde voertuigen" }).click();
      const bin = dialog(page);
      await bin.waitFor();
      await settle(page);
      await shot(page, "04-verwijderde-voertuigen", { clip: bin, marks: [bin.getByRole("button", { name: "Terugzetten" }).first(), bin.getByRole("button", { name: "Definitief verwijderen" }).first()] });
      await bin.getByRole("button", { name: "Terugzetten" }).first().click();
      await settle(page);
    },
  },
  {
    name: "04-rdw-voertuigtypes",
    async run(page) {
      await goto(page, "/");
      await page.locator("header button").filter({ hasText: /admin/i }).first().click();
      await page.getByRole("button", { name: "App-instellingen" }).click();
      const settings = dialog(page);
      await settings.waitFor();
      await settle(page);
      await settings.getByRole("tab", { name: "Voertuigen" }).click();
      await settle(page);
      await shot(page, "04-rdw-voertuigtypes", { clip: settings, marks: [settings.getByRole("tab", { name: "Voertuigen" }), settings.getByRole("button", { name: "Controleren" })] });
    },
  },
];

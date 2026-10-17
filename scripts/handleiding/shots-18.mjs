/** Hoofdstuk 18 (Barcode en scannen): scanresultaat, tegels, recente scans, camera, sleutelkast-audit, barcodeboek-tape. */
import { api, closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const scanField = (page) => page.getByRole("textbox", { name: /Scan of typ een barcode/ });

async function scan(page, code) {
  await goto(page, "/scan");
  const input = scanField(page);
  await input.fill(code);
  await input.press("Enter");
  await settle(page);
  await page.waitForTimeout(600);
  return input;
}

export const steps = [
  {
    name: "18-scanscherm-knoppen",
    async run(page) {
      await goto(page, "/scan");
      await shot(page, "18-scanscherm-knoppen", { marks: [scanField(page), page.getByRole("button", { name: "Zoeken" }), page.getByRole("button", { name: "Camera scannen" })] });
    },
  },
  {
    name: "18-scanresultaat",
    async run(page) {
      await scan(page, "34-SPR-5");
      await shot(page, "18-scanresultaat", { fullPage: true });
      const tiles = ["Ophalen starten", "Inleveren starten", "Reservering maken", "Voertuig openen", "Reservering openen", "Kosten registreren", "Document uploaden", "Tanken", "Km-stand bijwerken", "Onderhoud inplannen", "Opnieuw scannen"];
      const marks = [];
      for (const tile of tiles) {
        const button = page.getByRole("button", { name: tile }).first();
        if (await button.count()) marks.push(button);
      }
      await marks[0]?.scrollIntoViewIfNeeded();
      await shot(page, "18-scanresultaat-tegels", { marks });
      await scan(page, "12-VKL-3");
      await shot(page, "18-scanresultaat-verhuurd", { fullPage: true });
    },
  },
  {
    name: "18-recente-scans",
    async run(page) {
      await scan(page, "ZZ-00-ZZ");
      await shot(page, "18-geen-match", { box: { x: 256, y: 60, width: 1024, height: 360 } });
      await scan(page, "65-PRC-8");
      const recent = page.getByText("Recente scans").first();
      await recent.scrollIntoViewIfNeeded();
      await shot(page, "18-recente-scans", { fullPage: true });
    },
  },
  {
    name: "18-camera",
    async run(page) {
      await goto(page, "/scan");
      const camera = page.getByRole("button", { name: "Camera scannen" }).first();
      if (await camera.count()) {
        await camera.click();
        const dlg = dialog(page, "Camera scannen");
        await dlg.waitFor();
        await page.waitForTimeout(1500);
        await shot(page, "18-camera", { clip: dlg });
      }
    },
  },
  {
    name: "18-sleutelkast-audit",
    async run(page) {
      const vehicles = await api(page, "GET", "/api/vehicles");
      const sprinter = vehicles.find((v) => v.licensePlate === "34-SPR-5");
      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Sleutelkast-audit", exact: true }).click();
      const dlg = page.getByRole("dialog", { name: "Sleutelkast-audit", exact: true });
      await dlg.waitFor();
      await settle(page);
      const input = dlg.getByRole("textbox").first();
      await input.fill(sprinter.barcode);
      await input.press("Enter");
      await page.waitForTimeout(800);
      await shot(page, "18-sleutelkast-audit", { clip: dlg, marks: [input, dlg.getByRole("button", { name: "Audit afronden" })] });
      await dlg.getByRole("button", { name: "Audit afronden" }).click();
      await page.waitForTimeout(800);
      await shot(page, "18-sleutelkast-audit-uitslag", { clip: dlg });
    },
  },
  {
    name: "18-barcodeboek-dymo",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("button", { name: "Barcodeboek" }).click();
      const book = dialog(page, "Barcodeboek");
      await book.waitFor();
      await settle(page);
      await book.getByRole("combobox", { name: "Labelsjabloon" }).click();
      await page.getByRole("option", { name: /DYMO-tape/ }).first().click();
      await settle(page);
      await book.getByRole("button", { name: "Alles selecteren" }).click();
      await page.waitForTimeout(300);
      await shot(page, "18-barcodeboek-dymo", { clip: book, marks: [book.getByRole("combobox", { name: "Labelsjabloon" }), book.getByRole("button", { name: /Selectie afdrukken|Alles afdrukken/ }).first()] });
    },
  },
];

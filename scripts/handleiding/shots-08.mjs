/** Hoofdstuk 8 (Documenten): bibliotheek, uploaden, documentknoppen, reserveringsdocumenten, sjablonen. */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";
import { openFullReservation } from "./shots-05.mjs";

export const steps = [
  {
    name: "08-documentbibliotheek",
    async run(page) {
      await goto(page, "/documents");
      await shot(page, "08-documentbibliotheek-knoppen", {
        marks: [
          page.getByRole("button", { name: "Document uploaden" }),
          page.getByRole("tablist").first(),
          page.getByRole("textbox", { name: "Documenten zoeken..." }),
          page.getByRole("button", { name: "Alles uitklappen" }),
        ],
      });
      await page.getByRole("button", { name: /12-VKL-3 - Volkswagen Crafter/ }).click();
      await settle(page);
      await page.getByRole("button", { name: /^Contracten/ }).first().click();
      await settle(page);
      await shot(page, "08-documentknoppen", {
        marks: [
          page.getByRole("button", { name: "Bekijken" }).first(),
          page.getByRole("link", { name: "Downloaden" }).first(),
          page.getByRole("button", { name: "Afdrukken" }).first(),
          page.getByRole("button", { name: "E-mailen" }).first(),
          page.getByRole("button", { name: "Verwijderen" }).first(),
          page.getByRole("button", { name: "Opnieuw genereren" }).first(),
        ],
      });
    },
  },
  {
    name: "08-document-uploaden",
    async run(page) {
      await goto(page, "/documents");
      await page.getByRole("button", { name: "Document uploaden" }).click();
      const dlg = dialog(page, "Document uploaden");
      await dlg.waitFor();
      await dlg.getByRole("button", { name: /Selecteer een voertuig/ }).click();
      await page.keyboard.type("Sprinter");
      await page.waitForTimeout(500);
      await page.getByText("34-SPR-5", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(600);
      await settle(page);
      await shot(page, "08-document-uploaden", { clip: dlg });
    },
  },
  {
    name: "08-reserveringsdocumenten",
    async run(page) {
      const dlg = await openFullReservation(page, "Crafter", "Bakkerij Van Dijk");
      const docs = dlg.getByRole("heading", { name: "Documenten" });
      await docs.scrollIntoViewIfNeeded();
      await shot(page, "08-reserveringsdocumenten", { clip: dlg, marks: [dlg.getByRole("button", { name: /Contract \(ondertekend\)/ }), dlg.getByRole("button", { name: /Contract \(Unsigned\)|Contract \(niet ondertekend\)/ }).first()] });
    },
  },
  {
    name: "08-sjablonen",
    async run(page) {
      await goto(page, "/documents");
      await page.getByRole("tab", { name: "Contractsjablonen" }).click();
      await settle(page);
      await shot(page, "08-contractsjablonen", {
        marks: [page.getByRole("tab", { name: "Contractsjablonen" }), page.getByRole("button", { name: "Sjablooneditor openen" }), page.getByRole("button", { name: "Bewerken" }).first()],
      });
      await page.getByRole("button", { name: "Sjablooneditor openen" }).click();
      const editor = page.getByRole("dialog").last();
      await editor.waitFor();
      await settle(page);
      await page.waitForTimeout(1000);
      await shot(page, "08-sjablooneditor", { clip: editor });
      await closeDialogs(page);
      await page.getByRole("tab", { name: "Barcodelabels" }).click();
      await settle(page);
      await shot(page, "08-barcodelabels", { marks: [page.getByRole("tab", { name: "Barcodelabels" })] });
      await page.getByRole("tab", { name: "Schadecheck-sjablonen" }).click();
      await settle(page);
      await shot(page, "08-schadecheck-sjablonen", { marks: [page.getByRole("tab", { name: "Schadecheck-sjablonen" })] });
      await page.getByRole("tab", { name: "Transportrapportsjablonen" }).click();
      await settle(page);
      await shot(page, "08-transportrapportsjablonen", { marks: [page.getByRole("tab", { name: "Transportrapportsjablonen" })] });
    },
  },
  {
    name: "08-verouderd",
    async run(page) {
      // Datums van de opgehaalde Crafter-huur wijzigen: het contract wordt "Verouderd".
      const dlg = await openFullReservation(page, "Crafter", "Bakkerij Van Dijk");
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(300);
      const edit = dlg.getByRole("button", { name: "Datums wijzigen" });
      if (await edit.isVisible().catch(() => false)) {
        await edit.click();
        const dates = dialog(page, "Datums wijzigen");
        await dates.waitFor();
        const end = dates.getByRole("textbox", { name: /Einddatum/ });
        const value = await end.inputValue();
        const d = new Date(value);
        d.setDate(d.getDate() + 1);
        await end.fill(d.toISOString().slice(0, 10));
        await dates.getByRole("button", { name: "Opslaan" }).click();
        await settle(page);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await closeDialogs(page);
      await goto(page, "/documents");
      await page.getByRole("button", { name: /12-VKL-3 - Volkswagen Crafter/ }).click();
      await settle(page);
      await page.getByRole("button", { name: /^Contracten/ }).first().click();
      await settle(page);
      const badge = page.getByText("Verouderd").first();
      await badge.scrollIntoViewIfNeeded();
      await shot(page, "08-verouderd", { marks: [badge, page.getByRole("button", { name: "Opnieuw genereren" }).first()] });
    },
  },
];

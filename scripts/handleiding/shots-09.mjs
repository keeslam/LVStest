/** Hoofdstuk 9 (E-mail): documenten mailen, Communicatie, sjabloonbouwer, logboek, mailinstellingen, facturen. */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

async function openSettingsTab(page, tab) {
  await goto(page, "/");
  await page.locator("header button").filter({ hasText: /admin/i }).first().click();
  await page.getByRole("button", { name: "App-instellingen" }).click();
  const settings = dialog(page);
  await settings.waitFor();
  await settle(page);
  await settings.getByRole("tab", { name: tab }).click();
  await settle(page);
  return settings;
}

export const steps = [
  {
    name: "09-documenten-emailen",
    async run(page) {
      await goto(page, "/documents");
      await page.getByRole("button", { name: /12-VKL-3 - Volkswagen Crafter/ }).click();
      await settle(page);
      await page.getByRole("button", { name: /^Contracten/ }).first().click();
      await settle(page);
      await page.getByRole("button", { name: "E-mailen" }).first().click();
      const dlg = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: "Document e-mailen" }).first();
      await dlg.waitFor();
      await settle(page);
      await dlg.getByRole("textbox").first().fill("info@bakkerijvandijk.example");
      await shot(page, "09-document-emailen", {
        clip: dlg,
        marks: [dlg.getByRole("textbox").first(), dlg.getByRole("button", { name: "E-mail versturen" })],
      });
    },
  },
  {
    name: "09-communicatie",
    async run(page) {
      await goto(page, "/communications");
      await shot(page, "09-meldingen-versturen", {
        marks: [
          page.getByRole("tablist").first(),
          page.getByRole("tablist").nth(1),
          page.getByRole("combobox").first(),
          page.getByRole("button", { name: /Voorvertonen & versturen/ }),
        ],
      });
      await page.getByRole("tab", { name: "Sjabloonbouwer" }).click();
      await settle(page);
      await shot(page, "09-sjabloonbouwer", { marks: [page.getByRole("tab", { name: "Sjabloonbouwer" })] });
      await page.getByRole("tab", { name: "E-maillogboek" }).click();
      await settle(page);
      await shot(page, "09-emaillogboek", { marks: [page.getByRole("tab", { name: "E-maillogboek" })] });
      await page.getByRole("tab", { name: "Analyse" }).click();
      await settle(page);
      await shot(page, "09-analyse", { marks: [page.getByRole("tab", { name: "Analyse" })] });
    },
  },
  {
    name: "09-email-gps-instellingen",
    async run(page) {
      const settings = await openSettingsTab(page, "E-mail & GPS");
      await shot(page, "09-email-gps-instellingen", { clip: settings, marks: [settings.getByRole("tab", { name: "E-mail & GPS" })] });
      await closeDialogs(page);
      const docs = await openSettingsTab(page, "Doc-e-mails");
      await shot(page, "09-doc-emails", { clip: docs, marks: [docs.getByRole("tab", { name: "Doc-e-mails" })] });
    },
  },
  {
    name: "09-ontvangen-facturen",
    async run(page) {
      await goto(page, "/expenses");
      await page.getByRole("button", { name: "Ontvangen facturen" }).click();
      const dlg = dialog(page, "Ontvangen facturen");
      await dlg.waitFor();
      await settle(page);
      await shot(page, "09-ontvangen-facturen", { clip: dlg, marks: [dlg.getByRole("button", { name: "Nu ophalen" }), dlg.getByRole("button", { name: "Logboek" }), dlg.getByRole("tablist")] });
    },
  },
];

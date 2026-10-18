/** Hoofdstuk 21 (Rapporten): het scherm Rapporten, afdrukken, de rapportbouwer en de analyse van onderhoudskosten. */
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

export const steps = [
  {
    name: "21-rapporten",
    async run(page) {
      await goto(page, "/reports");
      await closeDialogs(page);
      await settle(page);
      await shot(page, "21-rapporten", {
        marks: [
          page.getByRole("button", { name: "Afdrukken: APK" }),
          { locator: page.getByText("Aangepaste rapportbouwer", { exact: true }).first(), text: "Rapportbouwer" },
          { locator: page.getByText("Analyse onderhoudskosten", { exact: true }).first(), text: "Onderhoudskosten" },
          { locator: page.getByText("Datumbereik", { exact: true }).first().locator("xpath=following::button[1]"), text: "Datumbereik" },
          page.getByRole("button", { name: "Deze maand" }),
        ],
      });
      const tabs = page.getByRole("tablist").first();
      await tabs.scrollIntoViewIfNeeded();
      await shot(page, "21-rapporten-tabbladen", { marks: [{ locator: tabs, text: "tabbladen" }] });
    },
  },
  {
    name: "21-afdrukvoorbeeld",
    async run(page) {
      await goto(page, "/reports");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Afdrukken: Kosten" }).click();
      const preview = page.locator('[role="alertdialog"]').filter({ hasText: "Documentvoorvertoning" }).last();
      await preview.waitFor();
      await settle(page);
      await page.waitForTimeout(1000);
      await shot(page, "21-afdrukvoorbeeld", { clip: preview, marks: [preview.getByRole("button", { name: "Afdrukken", exact: true }).last()] });
    },
  },
  {
    name: "21-rapportbouwer",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1100 });
      await goto(page, "/reports");
      await closeDialogs(page);
      await page.getByText("Aangepaste rapportbouwer", { exact: true }).first().click();
      const builder = dialog(page, /rapportbouwer/i);
      await builder.waitFor();
      await settle(page);
      await builder.getByRole("button", { name: "+ Kenteken" }).click();
      await builder.getByRole("button", { name: "+ Merk" }).click();
      await builder.getByRole("button", { name: "+ Model" }).click();
      await page.waitForTimeout(400);
      await shot(page, "21-rapportbouwer", {
        clip: builder,
        marks: [
          { locator: builder.getByRole("checkbox").first(), text: "Gegevensbron" },
          { locator: builder.getByRole("button", { name: /^\+ / }).first(), text: "Veld toevoegen" },
          builder.getByRole("button", { name: "Filter toevoegen" }),
          builder.getByRole("button", { name: "Rapport uitvoeren" }),
          builder.getByRole("button", { name: "Opslaan" }),
          builder.getByRole("button", { name: "Opgeslagen rapporten" }),
        ],
      });
      await builder.getByRole("button", { name: "Rapport uitvoeren" }).click();
      const result = dialog(page, /Rapportresultaten/);
      await result.waitFor({ timeout: 15_000 });
      await settle(page);
      await shot(page, "21-rapportresultaten", {
        clip: result,
        marks: [result.getByRole("button", { name: "Exporteren naar CSV" }), result.getByRole("button", { name: "Afdrukken" }).first()],
      });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "21-onderhoudskosten",
    async run(page) {
      await page.setViewportSize({ width: 1280, height: 1100 });
      await goto(page, "/reports");
      await closeDialogs(page);
      await page.getByText("Analyse onderhoudskosten", { exact: true }).first().click();
      const dlg = dialog(page);
      await dlg.waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, "21-onderhoudskosten", { clip: dlg });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
];

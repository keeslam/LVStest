/** Hoofdstuk 6 (Transport): dashboard, registreren, vervanger (TBD), bekijken, afronden, route. */
import { closeDialogs, dialog, goto, settle, shot, ymd } from "./lib.mjs";

async function pickOption(page, combobox, option) {
  await combobox.click();
  await page.getByRole("option", { name: option }).first().click();
  await page.waitForTimeout(300);
}

export const steps = [
  {
    name: "06-transportdashboard-knoppen",
    async run(page) {
      await goto(page, "/delivery");
      await shot(page, "06-transportdashboard-knoppen", {
        marks: [
          page.getByRole("button", { name: "Route-optimalisatie" }),
          page.getByRole("button", { name: "Verwijderde transporten" }),
          page.getByRole("tablist").first(),
          page.getByRole("textbox", { name: "Transporten zoeken..." }),
          page.getByRole("button", { name: "Nieuw transport" }),
        ],
      });
      const row = page.getByRole("row").filter({ hasText: "90-VVR-1" }).first();
      await shot(page, "06-transporttabel-knoppen", {
        clip: page.getByRole("table").first(),
        pad: 8,
        marks: [
          row.getByRole("button", { name: "Afdrukken / rapport genereren" }),
          row.getByRole("button", { name: "Bekijken" }),
          row.getByRole("button", { name: "Markeren als voltooid" }),
          row.getByRole("button", { name: "Bewerken" }),
          row.getByRole("button", { name: "Verwijderen" }),
        ],
      });
    },
  },
  {
    name: "06-transport-registreren",
    async run(page) {
      await goto(page, "/delivery");
      await page.getByRole("button", { name: "Nieuw transport" }).click();
      const form = dialog(page, "Transport registreren");
      await form.waitFor();
      await form.getByRole("button", { name: "Zoek en selecteer een voertuig..." }).click();
      await page.getByPlaceholder("Zoek op kenteken, merk of model...").last().fill("Master");
      await page.waitForTimeout(500);
      await page.getByText("78-MST-9").last().click();
      await page.waitForTimeout(300);
      await form.getByRole("textbox", { name: "Geplande datum" }).fill(ymd(4));
      await form.getByRole("textbox", { name: "Van (optioneel)" }).fill("Stationsweg 101");
      await form.locator('input[placeholder="Plaats"]').nth(0).fill("Barendrecht");
      await form.getByRole("textbox", { name: "Naar (optioneel)" }).fill("Industrieweg 8");
      await form.locator('input[placeholder="Plaats"]').nth(1).fill("Spijkenisse");
      await form.getByRole("textbox", { name: "Chauffeur (optioneel)" }).fill("Jan");
      await shot(page, "06-transport-registreren", {
        clip: form,
        marks: [
          form.getByRole("combobox", { name: "Type" }),
          form.getByRole("button", { name: /78-MST-9|Zoek en selecteer een voertuig/ }),
          form.getByRole("checkbox", { name: "Vervangend voertuig vereist" }),
          form.getByRole("textbox", { name: "Geplande datum" }),
        ],
      });
      const calc = form.getByRole("button", { name: "Berekenen" });
      await calc.scrollIntoViewIfNeeded();
      await shot(page, "06-transport-registreren-adres", {
        clip: form,
        marks: [form.getByRole("textbox", { name: "Van (optioneel)" }), form.getByRole("textbox", { name: "Naar (optioneel)" }), calc, form.getByRole("button", { name: "Voorstellen" })],
      });
      await form.getByRole("checkbox", { name: "Vervangend voertuig vereist" }).check();
      await page.waitForTimeout(400);
      await shot(page, "06-vervangend-voertuig-tbd", { clip: form, marks: [form.getByRole("checkbox", { name: "Vervangend voertuig vereist" })] });
      const submit = form.getByRole("button", { name: "Transport registreren" });
      await submit.scrollIntoViewIfNeeded();
      await shot(page, "06-transport-registreren-opslaan", { clip: form, marks: [form.getByRole("checkbox", { name: "Doorbelasten aan klant" }), form.getByRole("textbox", { name: "Chauffeur (optioneel)" }), submit] });
      await submit.click();
      await settle(page);
    },
  },
  {
    name: "06-transport-bekijken",
    async run(page) {
      await goto(page, "/delivery");
      const row = page.getByRole("row").filter({ hasText: "78-MST-9" }).first();
      await row.getByRole("button", { name: "Bekijken" }).click();
      const view = dialog(page);
      await view.waitFor();
      await settle(page);
      await shot(page, "06-transport-bekijken", { clip: view });
      await closeDialogs(page);
      await shot(page, "06-vervangend-voertuig-selecteren", {
        clip: page.getByRole("table").first(),
        pad: 8,
        marks: [row.getByRole("button", { name: /Selecteren/ })],
      });
    },
  },
  {
    name: "06-transport-afronden",
    async run(page) {
      await goto(page, "/delivery");
      const row = page.getByRole("row").filter({ hasText: "90-VVR-1" }).first();
      await row.getByRole("button", { name: "Markeren als voltooid" }).click();
      const done = page.locator('[role="dialog"], [role="alertdialog"]').last();
      await done.waitFor();
      await done.getByRole("textbox").last().fill("Bus afgeleverd, sleutel aan de planner gegeven.");
      await shot(page, "06-transport-afronden", { clip: done, marks: [done.getByRole("button", { name: "Afronden" })] });
    },
  },
  {
    name: "06-routeoptimalisatie",
    async run(page) {
      await goto(page, "/delivery");
      await page.getByRole("button", { name: "Route-optimalisatie" }).click();
      const route = dialog(page, "Routeoptimalisatie");
      await route.waitFor();
      await route.getByRole("textbox").first().fill(ymd(2));
      await page.waitForTimeout(400);
      await shot(page, "06-routeoptimalisatie", { clip: route, marks: [route.getByRole("textbox").first(), route.getByRole("button", { name: "Route optimaliseren" })] });
    },
  },
];

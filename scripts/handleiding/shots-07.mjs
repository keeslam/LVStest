/** Hoofdstuk 7 (Onderhoud): kalender, plannen, vervangers, dagvenster, afronden, overzicht, voertuigservice. */
import { closeDialogs, dialog, goto, settle, shot, ymd } from "./lib.mjs";
import { openFullReservation } from "./shots-05.mjs";

async function pickOption(page, combobox, option) {
  await combobox.click();
  await page.getByRole("option", { name: option }).first().click();
  await page.waitForTimeout(300);
}

async function openPlan(page) {
  await goto(page, "/maintenance");
  await closeDialogs(page);
  await page.getByRole("button", { name: "Onderhoud plannen" }).click();
  const form = dialog(page, "Onderhoud plannen");
  await form.waitFor();
  return form;
}

async function pickVehicle(page, form, text, plate) {
  await form.getByRole("button", { name: /Selecteer een voertuig/ }).click();
  await page.getByPlaceholder(/Zoek/).last().fill(text);
  await page.waitForTimeout(500);
  await page.getByText(plate).last().click();
  await page.waitForTimeout(300);
}

export const steps = [
  {
    name: "07-kalender-knoppen",
    async run(page) {
      await goto(page, "/maintenance");
      await closeDialogs(page);
      await shot(page, "07-kalender-knoppen", {
        marks: [
          page.getByRole("button", { name: "Lijstweergave" }),
          page.getByRole("button", { name: /Voltooide bekijken/ }),
          page.getByRole("button", { name: "Verwijderd onderhoud" }),
          page.getByRole("button", { name: "Onderhoud plannen" }),
          page.getByRole("button", { name: "Kleuren" }),
        ],
      });
    },
  },
  {
    name: "07-onderhoud-plannen",
    async run(page) {
      // Een APK-keuring voor de Ducato (APK verlopen), zonder klant: geen tweede stap.
      const form = await openPlan(page);
      await pickVehicle(page, form, "Ducato", "43-DCT-6");
      await pickOption(page, form.getByRole("combobox", { name: "Onderhoudstype" }), /APK-keuring/);
      await form.getByRole("textbox", { name: "Geplande datum" }).fill(ymd(2));
      await form.getByRole("spinbutton", { name: "Duur (dagen)" }).fill("1");
      await form.getByRole("textbox", { name: "Omschrijving" }).fill("APK-keuring bij Garage Visser");
      await shot(page, "07-onderhoud-plannen", {
        clip: form,
        marks: [
          form.getByRole("button", { name: /43-DCT-6|Selecteer een voertuig/ }),
          form.getByRole("combobox", { name: "Onderhoudstype" }),
          form.getByRole("textbox", { name: "Geplande datum" }),
          form.getByRole("spinbutton", { name: "Duur (dagen)" }),
          form.getByRole("textbox", { name: "Omschrijving" }),
          form.getByRole("button", { name: "Onderhoud plannen" }),
        ],
      });
      await form.getByRole("button", { name: "Onderhoud plannen" }).click();
      await settle(page);
      await closeDialogs(page);
    },
  },
  {
    name: "07-vervangende-voertuigen",
    async run(page) {
      // Onderhoud op de Crafter, die bij Bakkerij Van Dijk staat: de tweede stap met vervangers.
      const form = await openPlan(page);
      await pickVehicle(page, form, "Crafter", "12-VKL-3");
      await pickOption(page, form.getByRole("combobox", { name: "Onderhoudstype" }), /Remmenonderhoud/);
      await form.getByRole("textbox", { name: "Geplande datum" }).fill(ymd(1));
      await form.getByRole("spinbutton", { name: "Duur (dagen)" }).fill("2");
      await form.getByRole("textbox", { name: "Omschrijving" }).fill("Remblokken voor vervangen");
      await form.getByRole("button", { name: "Onderhoud plannen" }).click();
      const spare = dialog(page, "Vervangende voertuigen toewijzen");
      await spare.waitFor({ timeout: 20_000 });
      await settle(page);
      await shot(page, "07-vervangende-voertuigen-toewijzen", { clip: spare });
      await spare.getByRole("button", { name: "Annuleren" }).click();
      const abort = page.getByRole("alertdialog", { name: "Plannen afbreken?" });
      await abort.waitFor();
      await shot(page, "07-plannen-afbreken", { clip: abort, marks: [abort.getByRole("button", { name: "Plannen afbreken" }), abort.getByRole("button", { name: "Doorgaan met plannen" })] });
      await abort.getByRole("button", { name: "Doorgaan met plannen" }).click();
      await page.waitForTimeout(400);
      const later = spare.getByText(/Later vervanger toewijzen/).first();
      await later.click().catch(() => {});
      await page.waitForTimeout(300);
      await shot(page, "07-vervangende-voertuigen-keuze", { clip: spare, marks: [later, spare.getByRole("button", { name: /Vervangers toewijzen & onderhoud plannen/ })] });
      await spare.getByRole("button", { name: /Vervangers toewijzen & onderhoud plannen/ }).click();
      await settle(page);
      await closeDialogs(page);
    },
  },
  {
    name: "07-dagvenster",
    async run(page) {
      await goto(page, "/maintenance");
      await closeDialogs(page);
      await page.getByText("APK-keuring", { exact: true }).first().click();
      const day = dialog(page, /Onderhoudsevenementen/);
      await day.waitFor();
      await settle(page);
      await shot(page, "07-dagvenster", {
        clip: day,
        marks: [day.getByRole("button", { name: "Afronden" }).first(), day.getByRole("button", { name: "Bewerken" }).first(), day.getByRole("button", { name: "Onderhoud bekijken" }).first()],
      });
      await day.getByRole("button", { name: "Afronden" }).first().click();
      const done = dialog(page, "Onderhoud afronden");
      await done.waitFor();
      await settle(page);
      const dateBoxes = done.getByRole("textbox").filter({ hasNot: page.locator("textarea") });
      await dateBoxes.nth(1).fill(ymd(365));
      await done.getByRole("spinbutton").first().fill("15240");
      await done.getByPlaceholder(/Beschrijf het uitgevoerde onderhoud/).fill("APK gekeurd, geen opmerkingen.");
      await shot(page, "07-onderhoud-afronden", {
        clip: done,
        marks: [dateBoxes.nth(0), dateBoxes.nth(1), done.getByRole("button", { name: "Choose File" }), done.getByRole("spinbutton").first(), done.getByPlaceholder(/Beschrijf het uitgevoerde onderhoud/), done.getByRole("button", { name: "Afronden" }).last()],
      });
      await done.getByRole("button", { name: "Afronden" }).last().click();
      await settle(page);
      await closeDialogs(page);
      await page.getByText("Remmenonderhoud", { exact: true }).first().click();
      await day.waitFor();
      await day.getByRole("button", { name: "Bewerken" }).first().click();
      const edit = page.getByRole("dialog").last();
      await edit.waitFor();
      await settle(page);
      await shot(page, "07-onderhoud-bewerken", { clip: edit, marks: [edit.getByRole("combobox", { name: "Status" }), edit.getByRole("button", { name: "Afronden" })] });
    },
  },
  {
    name: "07-lijstweergave",
    async run(page) {
      await goto(page, "/maintenance");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Lijstweergave" }).click();
      const list = dialog(page, "Onderhoudsoverzicht");
      await list.waitFor();
      await settle(page);
      await list.getByRole("tab", { name: /Gepland/ }).click();
      await settle(page);
      await shot(page, "07-lijstweergave-gepland", {
        clip: list,
        marks: [list.getByRole("tablist").first(), list.getByRole("button", { name: "Binnen melden" }).first(), list.getByRole("button", { name: "Afronden" }).first()],
      });
      await list.getByRole("tab", { name: /Vervangers/ }).click();
      await settle(page);
      await shot(page, "07-lijstweergave-vervangers", { clip: list, marks: [list.getByRole("button", { name: "Toewijzen" }).first()] });
      await closeDialogs(page);
      await page.getByRole("button", { name: /Voltooide bekijken/ }).click();
      const hist = dialog(page, /Geschiedenis voltooid onderhoud/);
      await hist.waitFor();
      await settle(page);
      const undo = hist.getByRole("button", { name: "Terugdraaien" }).first();
      await shot(page, "07-voltooide-bekijken", { clip: hist, marks: (await undo.count()) ? [undo] : [] });
    },
  },
  {
    name: "07-voertuigservice",
    async run(page) {
      const dlg = await openFullReservation(page, "Sprinter", "Installatiebedrijf Jansen");
      const mark = dlg.getByRole("button", { name: "Voertuig markeren voor onderhoud" });
      await mark.scrollIntoViewIfNeeded();
      await shot(page, "07-voertuigservice", { clip: dlg, marks: [mark] });
      await mark.click();
      const service = page.getByRole("dialog").last();
      await service.waitFor();
      await settle(page);
      await shot(page, "07-voertuig-markeren-onderhoud", { clip: service, marks: [service.getByRole("button", { name: "Markeren voor onderhoud" })] });
    },
  },
];

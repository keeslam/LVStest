/** Hoofdstuk 5 (Reserveringen): kalender, lijst, boeken, openen, wijzigen, ophalen, innemen, annuleren, terugdraaien. */
import { api, closeDialogs, dialog, goto, settle, shot, ymd } from "./lib.mjs";

const CRAFTER = "12-VKL-3"; // vandaag geboekt voor Bakkerij Van Dijk; wordt in dit hoofdstuk opgehaald
const TRANSIT = "56-TRN-7"; // staat uit bij Pieter Bakker; wordt in dit hoofdstuk ingenomen

/** De volledige reserveringsdetails via het zoekveld bovenin. */
export async function openFullReservation(page, query, customer) {
  await goto(page, "/");
  const search = page.getByRole("textbox", { name: "Zoeken..." });
  await search.click();
  await search.fill(query);
  await page.waitForTimeout(1200);
  await settle(page);
  const result = page.locator('[role="option"], [role="button"], button, a').filter({ hasText: customer }).filter({ hasText: /\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2}|okt|nov|Geboekt|Opgehaald/ }).first();
  await result.click();
  const dlg = dialog(page, /Reserveringsdetails/);
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

async function pickOption(page, combobox, option) {
  await combobox.click();
  await page.getByRole("option", { name: option }).first().click();
  await page.waitForTimeout(300);
}

/** De keuzelijst na een veldlabel (als het label niet aan de combobox hangt). */
function comboAfterLabel(scope, label) {
  return scope.locator(`xpath=.//*[normalize-space(text())="${label}"]/following::*[@role="combobox"][1]`);
}

export const steps = [
  {
    name: "05-kalender-knoppen",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await shot(page, "05-kalender-knoppen", {
        marks: [
          page.getByRole("button", { name: "Lijstweergave" }),
          page.getByRole("button", { name: /Voltooid bekijken/ }),
          page.getByRole("button", { name: /achterstallig/ }),
          page.getByRole("button", { name: "Administratie" }),
          page.getByRole("button", { name: "Verwijderde reserveringen" }),
          page.getByRole("button", { name: "Nieuwe reservering" }),
          page.getByRole("button", { name: "Kleuren" }),
          page.getByRole("button", { name: "Vandaag" }).first(),
        ],
      });
      await page.getByRole("button", { name: "Kleuren" }).click();
      const legend = dialog(page);
      await legend.waitFor();
      await shot(page, "05-kleuren-legenda", { clip: legend });
    },
  },
  {
    name: "05-lijstweergave",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Lijstweergave" }).click();
      const list = dialog(page, "Reserveringen");
      await list.waitFor();
      await settle(page);
      await shot(page, "05-lijstweergave", {
        clip: list,
        marks: [list.getByRole("tablist"), list.getByRole("textbox").first(), list.getByRole("button", { name: "Bekijken" }).first(), list.getByRole("button", { name: "Bewerken" }).first()],
      });
    },
  },
  {
    name: "05-nieuwe-reservering",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      // De keuzelijsten van dit formulier hangen vast aan het venster en klappen niet om; op 900 px
      // hoog vallen ze buiten beeld. Hoger venster, zoals de E2E-tests ook doen.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await page.getByRole("button", { name: "Nieuwe reservering" }).click();
      const form = dialog(page, "Nieuwe reservering");
      await form.waitFor();
      // Het formulier zet de datums terug op vandaag zodra zijn gegevens binnen zijn; eerst laten
      // uitladen, dan invullen en nakijken of de datums zijn blijven staan.
      await settle(page);
      const startField = form.getByRole("textbox", { name: "Startdatum", exact: true });
      const endField = form.getByRole("textbox", { name: "Einddatum", exact: true });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await startField.fill(ymd(50));
        await endField.fill(ymd(53));
        await page.waitForTimeout(700);
        if ((await startField.inputValue()) === ymd(50) && (await endField.inputValue()) === ymd(53)) break;
      }
      await shot(page, "05-nieuwe-reservering-stap1", {
        clip: form,
        marks: [form.getByRole("textbox", { name: "Startdatum", exact: true }), form.getByRole("textbox", { name: "Einddatum", exact: true }), form.getByRole("checkbox", { name: "Huur zonder einddatum" })],
      });
      await form.getByRole("button", { name: "Zoek en selecteer een voertuig..." }).click();
      // Zolang de keuzelijst (een popover) open staat, is het formulier voor de toegankelijkheidsboom
      // verborgen; daarom hier een CSS-locator voor het bijsnijden.
      const formCss = page.locator('div[role="dialog"]').filter({ hasText: "1. Selecteer huurdata" }).first();
      await page.keyboard.type("Boxer");
      await page.waitForTimeout(600);
      await shot(page, "05-nieuwe-reservering-voertuig", { clip: formCss });
      await page.getByText("21-BXR-4", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(400);
      await form.getByRole("button", { name: "Klant" }).click();
      await page.keyboard.type("Hoveniers");
      await page.waitForTimeout(600);
      await shot(page, "05-nieuwe-reservering-klant", { clip: formCss });
      // De hele keuzeregel (role=option), niet de naam zelf: die staat ook als bedrijfslabel in de regel.
      // CSS-locator: het venster zet de keuzelijst voor de toegankelijkheidsboom op verborgen.
      await page.locator('[role="option"]').filter({ hasText: "Hoveniersbedrijf Groen" }).first().click();
      await page.waitForTimeout(600);
      await settle(page);
      const create = form.getByRole("button", { name: "Reservering aanmaken" });
      await create.scrollIntoViewIfNeeded();
      await shot(page, "05-nieuwe-reservering-details", {
        clip: form,
        marks: [form.getByRole("spinbutton", { name: /Totaalprijs/ }), form.getByRole("checkbox", { name: "Bezorgservice vereist" }), form.getByRole("checkbox", { name: "Ophaalservice bij inleveren" }), create],
      });
      await create.click();
      const now = page.locator("button", { hasText: "Nu ophalen" }).first();
      await now.waitFor({ timeout: 15_000 });
      await settle(page);
      await now.scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, "05-reservering-aangemaakt", { marks: [now] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "05-reserveringsdetails-kort",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByText(CRAFTER, { exact: true }).first().click();
      const dlg = dialog(page, /Reserveringsdetails/);
      await dlg.waitFor();
      await settle(page);
      await shot(page, "05-reserveringsdetails-kort", {
        clip: dlg,
        marks: [dlg.getByRole("button", { name: "Ophalen starten" }), dlg.getByRole("button", { name: "Bewerken" }), dlg.getByRole("button", { name: "Sluiten" }).last()],
      });
    },
  },
  {
    name: "05-reserveringsdetails-volledig",
    async run(page) {
      await goto(page, "/");
      const search = page.getByRole("textbox", { name: "Zoeken..." });
      await search.click();
      await search.fill("Sprinter");
      await page.waitForTimeout(1200);
      await settle(page);
      await shot(page, "05-zoeken-reservering", { box: { x: 240, y: 0, width: 1040, height: 560 } });
      await page.getByRole("button", { name: /Sprinter.*Installatiebedrijf Jansen/ }).first().click();
      const dlg = dialog(page, /Reserveringsdetails/);
      await dlg.waitFor();
      await settle(page);
      // De knoppenbalk van dit venster heeft twee rijen; op 800 px hoog valt de eerste rij buiten beeld.
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(400);
      await shot(page, "05-reserveringsdetails-volledig", {
        clip: dlg,
        marks: [dlg.getByRole("button", { name: "Datums wijzigen" }), dlg.getByRole("button", { name: "Klant wijzigen" }), dlg.getByRole("button", { name: "Voertuig wijzigen" }), dlg.getByRole("button", { name: "Reservering annuleren" })],
      });
      await dlg.getByRole("button", { name: "Datums wijzigen" }).click();
      const dates = dialog(page, "Datums wijzigen");
      await dates.waitFor();
      await shot(page, "05-datums-wijzigen", { clip: dates, marks: [dates.getByRole("button", { name: "Opslaan" })] });
      await dates.getByRole("button", { name: /Annuleren|Sluiten/ }).first().click();
      await page.waitForTimeout(300);
      await dlg.getByRole("button", { name: "Klant wijzigen" }).click();
      const cust = dialog(page, "Klant wijzigen");
      await cust.waitFor();
      await shot(page, "05-klant-wijzigen", { clip: cust });
      await cust.getByRole("button", { name: /Annuleren|Sluiten/ }).first().click();
      await page.waitForTimeout(300);
      await dlg.getByRole("button", { name: "Reservering annuleren" }).click();
      const cancel = dialog(page, "Reservering annuleren");
      await cancel.waitFor();
      await settle(page);
      await shot(page, "05-reservering-annuleren", { clip: cancel, marks: [cancel.getByRole("button", { name: "Reservering annuleren" }), cancel.getByRole("button", { name: "Niet annuleren" })] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "05-ophalen",
    async run(page) {
      await goto(page, "/");
      await page.getByRole("button", { name: /^Ophalen starten/ }).click();
      const scan = dialog(page, "Ophalen starten");
      await scan.waitFor();
      const input = scan.getByRole("textbox").first();
      await input.fill(CRAFTER);
      await shot(page, "05-ophalen-scanvenster", { clip: scan, marks: [input] });
      await input.press("Enter");
      const warning = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
      const pickup = dialog(page, "Ophaalproces starten");
      await Promise.race([warning.waitFor({ timeout: 15_000 }), pickup.waitFor({ timeout: 15_000 })]);
      if (await warning.isVisible().catch(() => false)) {
        await shot(page, "05-voertuigopmerkingen-ophalen", { clip: warning, marks: [warning.getByRole("button", { name: /Ik bevestig/ })] });
        await warning.getByRole("button", { name: /Ik bevestig/ }).click();
      }
      await pickup.waitFor();
      await settle(page);
      await pickup.getByRole("spinbutton", { name: /Kilometerstand bij ophalen/ }).fill("45120");
      const fuel = comboAfterLabel(pickup, "Brandstofniveau bij ophalen");
      await pickOption(page, fuel, "Vol");
      await shot(page, "05-ophaalproces", {
        clip: pickup,
        marks: [
          pickup.getByRole("textbox", { name: /Contractnummer/ }),
          pickup.getByRole("spinbutton", { name: /Kilometerstand bij ophalen/ }),
          fuel,
          pickup.getByRole("button", { name: /Ophaal-schadecheck aanmaken/ }),
          pickup.getByRole("button", { name: /Ophalen voltooien/ }),
        ],
      });
      await pickup.getByRole("button", { name: /Ophalen voltooien/ }).click();
      const warning2 = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
      if (await warning2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await shot(page, "05-voertuigopmerkingen-ophalen", { clip: warning2, marks: [warning2.getByRole("button", { name: /Ik bevestig/ })] });
        await warning2.getByRole("button", { name: /Ik bevestig/ }).click();
      }
      const ready = dialog(page, "Contract klaar");
      await ready.waitFor({ timeout: 30_000 });
      await settle(page);
      await shot(page, "05-contract-klaar", { clip: ready, marks: [ready.getByRole("button", { name: "Afdrukken" }), ready.getByRole("button", { name: "Mail naar klant" })] });
    },
  },
  {
    name: "05-contractnummer-bewerken",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByText(CRAFTER, { exact: true }).first().click();
      const dlg = dialog(page, /Reserveringsdetails/);
      await dlg.waitFor();
      await settle(page);
      const pencil = dlg.getByRole("button", { name: "Contractnummer bewerken" });
      await shot(page, "05-reserveringsdetails-opgehaald", {
        clip: dlg,
        marks: [pencil, dlg.getByRole("button", { name: "Inleveren starten" }), dlg.getByRole("button", { name: "Overdracht terugdraaien" })],
      });
      await pencil.click();
      const edit = dialog(page, "Contractnummer bewerken");
      await edit.waitFor();
      await page.waitForTimeout(800);
      await shot(page, "05-contractnummer-bewerken", { clip: edit });
    },
  },
  {
    name: "05-innemen",
    async run(page) {
      await goto(page, "/");
      await page.getByRole("button", { name: /^Innemen starten/ }).click();
      const scan = dialog(page, "Innemen starten");
      await scan.waitFor();
      const input = scan.getByRole("textbox").first();
      await input.fill(TRANSIT);
      await input.press("Enter");
      const ret = dialog(page, "Inleverproces starten");
      await ret.waitFor({ timeout: 15_000 });
      await settle(page);
      await ret.getByRole("spinbutton", { name: /Kilometerstand bij inleveren/ }).fill("61420");
      await ret.getByRole("textbox", { name: /Aanvullende notities/ }).fill("Auto schoon terug, sleutel compleet.");
      await shot(page, "05-inleverproces", {
        clip: ret,
        marks: [
          ret.getByRole("textbox", { name: /Inleverdatum/ }),
          ret.getByRole("spinbutton", { name: /Kilometerstand bij inleveren/ }),
          comboAfterLabel(ret, "Brandstofniveau bij inleveren"),
          ret.getByRole("button", { name: /Inlever-schadecheck aanmaken/ }),
          ret.getByRole("button", { name: /Inleveren voltooien/ }),
        ],
      });
      await ret.getByRole("button", { name: /Inleveren voltooien/ }).click();
      const ready = dialog(page, "Schadeformulier klaar");
      await ready.waitFor({ timeout: 30_000 });
      await settle(page);
      await shot(page, "05-schadeformulier-klaar", { clip: ready, marks: [ready.getByRole("button", { name: "Afdrukken" }), ready.getByRole("button", { name: "Mail naar klant" })] });
    },
  },
  {
    name: "05-overdracht-terugdraaien",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Lijstweergave" }).click();
      const list = dialog(page, "Reserveringen");
      await list.waitFor();
      await settle(page);
      const row = list.getByRole("button").filter({ hasText: CRAFTER }).filter({ hasText: "Opgehaald" }).first();
      await row.getByRole("button", { name: "Overdracht terugdraaien" }).click();
      const undo = dialog(page, "Overdracht terugdraaien");
      await undo.waitFor();
      await page.waitForTimeout(1500);
      await settle(page);
      await shot(page, "05-overdracht-terugdraaien", { clip: undo, marks: [undo.getByRole("button", { name: "Overdracht terugdraaien" }), undo.getByRole("button", { name: "Annuleren" })] });
    },
  },
  {
    name: "05-achterstallig",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByRole("button", { name: /achterstallig/ }).click();
      const dlg = dialog(page, "Te late verhuren");
      await dlg.waitFor();
      await settle(page);
      await shot(page, "05-achterstallig", { clip: dlg, marks: [dlg.getByRole("button", { name: "Details bekijken" }).first()] });
    },
  },
  {
    name: "05-niet-opgehaald",
    async run(page) {
      await goto(page, "/reservations");
      const dlg = dialog(page, "Niet opgehaalde reserveringen");
      if (!(await dlg.isVisible().catch(() => false))) {
        await closeDialogs(page);
        await page.getByRole("button", { name: /niet opgehaald/ }).click();
        await dlg.waitFor();
      }
      await settle(page);
      await shot(page, "05-niet-opgehaald", { clip: dlg, marks: [dlg.getByRole("button", { name: "Bekijken" }).first(), dlg.getByRole("button", { name: "Annuleren" }).first()] });
    },
  },
  {
    name: "05-voltooid-bekijken",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByRole("button", { name: /Voltooid bekijken/ }).click();
      const dlg = dialog(page, /Geschiedenis voltooide verhuur/);
      await dlg.waitFor();
      await settle(page);
      await shot(page, "05-voltooid-bekijken", { clip: dlg, marks: [dlg.getByRole("button", { name: "Overdracht terugdraaien" }).first()] });
      await closeDialogs(page);
      await page.getByRole("button", { name: "Administratie" }).click();
      const admin = dialog(page, /Administratie/);
      await admin.waitFor();
      await settle(page);
      await shot(page, "05-administratie", { clip: admin });
      await closeDialogs(page);
      // Een lege prullenbak zegt weinig: zet er een geannuleerde testboeking in.
      const bin = await api(page, "GET", "/api/deleted-records?type=reservation").catch(() => []);
      const binRows = Array.isArray(bin) ? bin : bin?.records ?? bin?.items ?? [];
      if (!binRows.length) {
        const [vehicles, customers] = await Promise.all([api(page, "GET", "/api/vehicles"), api(page, "GET", "/api/customers")]);
        const vehicle = vehicles.find((v) => v.licensePlate === "56-TRN-7");
        const customer = customers.find((c) => c.name === "Garage Visser");
        const made = await api(page, "POST", "/api/reservations", {
          vehicleId: vehicle.id, customerId: customer.id, startDate: ymd(70), endDate: ymd(72), status: "booked", type: "standard", totalPrice: "180",
        });
        await api(page, "DELETE", `/api/reservations/${made.id ?? made.reservation?.id}`);
        await page.reload();
        await settle(page);
      }
      await page.getByRole("button", { name: "Verwijderde reserveringen" }).click();
      const binDialog = dialog(page);
      await binDialog.waitFor();
      await settle(page);
      await shot(page, "05-verwijderde-reserveringen", {
        clip: binDialog,
        marks: [binDialog.getByRole("button", { name: "Terugzetten" }).first(), binDialog.getByRole("button", { name: /Definitief verwijderen/ }).first()],
      });
    },
  },
];

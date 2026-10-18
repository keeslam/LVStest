/**
 * Hoofdstuk 16 (Werkstromen): één doorlopend verhaal aan de balie (klant → reservering → ophalen →
 * contract mailen → ondertekend contract → inleveren) en een onderhoudsaanvraag met een vervanger.
 * Draai op een verse E2E-database na seed.mjs en seed-extra.mjs; de stappen bouwen op elkaar voort.
 */
import { closeDialogs, dialog, goto, settle, shot, ymd } from "./lib.mjs";

const PLATE = "21-BXR-4";
const CUSTOMER = "Bakkerij Van Dijk B.V.";

export const steps = [
  {
    name: "16-dashboard",
    async run(page) {
      await goto(page, "/");
      await closeDialogs(page);
      await settle(page);
      await shot(page, "16-dashboard", {
        marks: [
          { locator: page.getByText("Snelle acties", { exact: true }).first(), text: "Snelle acties" },
          { locator: page.getByText("Beschikbare voertuigen", { exact: true }).first(), text: "Vrije auto's" },
          { locator: page.getByText("APK verloopt binnenkort", { exact: true }).first(), text: "APK" },
          { locator: page.getByText("Achterstallige verhuringen", { exact: true }).first(), text: "Te laat" },
          { locator: page.getByText("Beheer vervangende voertuigen", { exact: true }).first(), text: "Vervangers" },
        ],
      });
    },
  },
  {
    name: "16-verhuur",
    async run(page) {
      // 1. Vanaf de klant een reservering beginnen: de klant staat dan al ingevuld.
      await goto(page, "/customers");
      await closeDialogs(page);
      await page.getByRole("textbox", { name: "Klanten zoeken" }).fill("Bakkerij");
      await page.waitForTimeout(700);
      await settle(page);
      const row = page.getByRole("row").filter({ hasText: CUSTOMER }).first();
      const start = row.getByRole("button", { name: "Nieuwe reservering" });
      await shot(page, "16-klant-nieuwe-reservering", { box: { x: 256, y: 60, width: 1024, height: 420 }, marks: [start] });

      await page.setViewportSize({ width: 1280, height: 1400 });
      await start.click();
      const form = dialog(page, "Nieuwe reservering");
      await form.waitFor();
      await settle(page);
      const startField = form.getByRole("textbox", { name: "Startdatum", exact: true });
      const endField = form.getByRole("textbox", { name: "Einddatum", exact: true });
      for (let i = 0; i < 5; i += 1) {
        await startField.fill(ymd(2));
        await endField.fill(ymd(5));
        await page.waitForTimeout(700);
        if ((await startField.inputValue()) === ymd(2)) break;
      }
      await form.getByRole("button", { name: "Zoek en selecteer een voertuig..." }).click();
      await page.keyboard.type("Boxer");
      await page.waitForTimeout(600);
      await page.getByText(PLATE, { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(600);
      await settle(page);
      const formCss = page.locator('div[role="dialog"]').filter({ hasText: "1. Selecteer huurdata" }).first();
      await shot(page, "16-reservering-vanuit-klant", {
        clip: formCss,
        marks: [
          startField, endField,
          { locator: formCss.getByRole("button", { name: new RegExp(PLATE) }).first(), text: "Voertuig" },
          { locator: formCss.getByText(CUSTOMER).first(), text: "Klant staat er al" },
        ],
      });
      const create = form.getByRole("button", { name: "Reservering aanmaken" });
      await create.scrollIntoViewIfNeeded();
      await create.click();

      // 2. Meteen ophalen met de knop in de melding.
      const now = page.locator("button", { hasText: "Nu ophalen" }).first();
      await now.waitFor({ timeout: 15_000 });
      await page.waitForTimeout(400);
      await shot(page, "16-nu-ophalen", { box: { x: 0, y: 1100, width: 700, height: 300 }, marks: [now] });
      await now.click();
      const pickup = dialog(page, "Ophaalproces starten");
      const warning = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
      await Promise.race([warning.waitFor({ timeout: 15_000 }), pickup.waitFor({ timeout: 15_000 })]);
      if (await warning.isVisible().catch(() => false)) await warning.getByRole("button", { name: /Ik bevestig/ }).click();
      await pickup.waitFor();
      await settle(page);
      const damage = pickup.getByRole("button", { name: /Ophaal-schadecheck aanmaken/ });
      const paper = pickup.getByRole("button", { name: /Papieren check uploaden/ });
      const finish = pickup.getByRole("button", { name: /Ophalen voltooien/ });
      await finish.scrollIntoViewIfNeeded();
      const marks = [pickup.getByRole("spinbutton", { name: /Kilometerstand bij ophalen/ })];
      if (await damage.count()) marks.push(damage);
      if (await paper.count()) marks.push(paper);
      marks.push(finish);
      await shot(page, "16-ophalen-schadecheck", { clip: pickup, marks });
      await finish.click();

      // 3. De huur begint eerder dan geboekt: de app vraagt of de startdatum naar vandaag mag.
      const early = page.getByRole("alertdialog").filter({ hasText: /eerder/ }).last();
      if (await early.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)) {
        const yes = early.getByRole("button", { name: /Ja, startdatum naar vandaag/ });
        // Geen foto: dit venster opent nu áchter het ophaalvenster (bekend probleem, zie hoofdstuk 16.2).
        // De knop is wel aan te klikken, omdat de rest van het scherm dan niet reageert.
        await yes.click();
      }

      // 4. Contract klaar: mailen naar de klant.
      const ready = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: "Contract klaar" }).last();
      await ready.waitFor({ timeout: 20_000 });
      await settle(page);
      await ready.getByRole("button", { name: "Mail naar klant" }).click();
      const mail = page.locator('[role="dialog"]').filter({ hasText: "Documenten e-mailen naar klant" }).last();
      await mail.waitFor();
      await settle(page);
      await page.waitForTimeout(600);
      await shot(page, "16-contract-mailen", {
        clip: mail,
        marks: [
          { locator: mail.getByText("Selecteer documenten", { exact: false }).first(), text: "Documenten" },
          { locator: mail.getByText("E-mailadres ontvanger", { exact: false }).first(), text: "Ontvanger" },
          mail.getByRole("button", { name: "E-mail versturen" }),
        ],
      });
      await closeDialogs(page);
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "16-na-ophalen",
    async run(page) {
      // 5. Het ondertekende contract uploaden en later inleveren, vanuit de lijst met reserveringen.
      await page.setViewportSize({ width: 1280, height: 1300 });
      await goto(page, "/reservations");
      await closeDialogs(page);
      await page.getByRole("button", { name: "Lijstweergave" }).click();
      const list = dialog(page, "Reserveringen");
      await list.waitFor();
      await settle(page);
      // Geen tabelrijen hier: de kleinste blok met kenteken én klant is de regel.
      const row = list.locator("div").filter({ has: page.getByText(PLATE, { exact: true }) }).filter({ hasText: "Bakkerij" }).last();
      await row.getByRole("button", { name: "Bekijken" }).first().click();
      const view = dialog(page, /Reserveringsdetails/);
      await view.waitFor();
      await settle(page);
      const signed = view.getByRole("button", { name: /Contract \(ondertekend\)/ }).first();
      await signed.scrollIntoViewIfNeeded();
      await shot(page, "16-ondertekend-uploaden", { clip: view, marks: [{ locator: signed, text: "Ondertekend contract" }, view.getByRole("button", { name: "Inleveren starten" })] });
      await view.getByRole("button", { name: "Inleveren starten" }).click();
      const ret = dialog(page, "Inleverproces starten");
      await ret.waitFor();
      await settle(page);
      const finish = ret.getByRole("button", { name: /Inleveren voltooien/ });
      await finish.scrollIntoViewIfNeeded();
      const marks = [ret.getByRole("spinbutton", { name: /Kilometerstand bij inleveren/ })];
      const damage = ret.getByRole("button", { name: /Inlever-schadecheck aanmaken/ });
      if (await damage.count()) marks.push(damage);
      marks.push(finish);
      await shot(page, "16-inleveren-schadecheck", { clip: ret, marks });
      await closeDialogs(page);
    },
  },
  {
    name: "16-werkplaats-vervanger",
    async run(page) {
      // 6. Een onderhoudsaanvraag uit het portaal inplannen; de klant wil een vervangende bus.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await goto(page, "/portal-admin");
      await closeDialogs(page);
      await settle(page);
      const open = page.getByText("Onderhoud/storing · Installatiebedrijf Jansen").first();
      // Al ingepland in een eerdere run? Dan meteen door naar het toewijzen.
      if (await open.isVisible().catch(() => false)) {
      await open.click();
      const req = dialog(page, /Aanvraag #/);
      await req.waitFor();
      await settle(page);
      await req.getByRole("button", { name: "Inplannen in de onderhoudskalender" }).click();
      await page.waitForTimeout(800);
      const confirm = req.getByRole("button", { name: "Inplannen en bevestigen" });
      await confirm.scrollIntoViewIfNeeded();
      await shot(page, "16-onderhoud-inplannen-aanvraag", { clip: req, marks: [confirm] });
      await confirm.click();
      await page.waitForTimeout(1500);
      await settle(page);
      await closeDialogs(page);
      }

      // 7. De vervanger staat nu op "Nog te bepalen" op het dashboard: daar wijs je een auto toe.
      await page.setViewportSize({ width: 1280, height: 1300 });
      await goto(page, "/");
      await closeDialogs(page);
      await settle(page);
      const title = page.getByText("Beheer vervangende voertuigen", { exact: true }).first();
      const block = title.locator("xpath=ancestor::div[.//*[@role='tablist']][1]");
      await title.scrollIntoViewIfNeeded();
      const assign = page.getByRole("button", { name: "Voertuig toewijzen" }).first();
      await assign.waitFor({ timeout: 10_000 });
      await shot(page, "16-vervanger-nog-te-bepalen", { clip: block, pad: 16, marks: [{ locator: page.getByRole("tab", { name: /Nog te bepalen/ }).first(), text: "Nog te bepalen" }, assign] });
      await assign.click();
      const pick = page.locator('[role="dialog"]').last();
      await pick.waitFor();
      await settle(page);
      await shot(page, "16-vervanger-toewijzen", { clip: pick });
      await closeDialogs(page);
    },
  },
];

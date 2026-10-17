/** Hoofdstuk 10 (Beheer) en 15 (Rollen): gebruikersmenu, gebruikers, rechten, instellingen, activiteitenlog, back-up, grijze knop. */
import { BASE_URL, PASSWORD, VIEWPORT, closeDialogs, dialog, goto, login, settle, shot } from "./lib.mjs";

const adminButton = (page) => page.locator("header button").filter({ hasText: /admin/i }).first();

async function openAdmin(page, item) {
  await goto(page, "/");
  await adminButton(page).click();
  await page.getByRole("button", { name: item }).click();
  const dlg = dialog(page);
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

export const steps = [
  {
    name: "10-gebruikersmenu-beheer",
    async run(page) {
      await goto(page, "/");
      await adminButton(page).click();
      const users = page.getByRole("button", { name: "Gebruikers" });
      const backup = page.getByRole("button", { name: "Back-upbeheer" });
      const settings = page.getByRole("button", { name: "App-instellingen" });
      await settings.waitFor();
      const top = await adminButton(page).boundingBox();
      const bottom = await page.getByRole("button", { name: "Uitloggen" }).boundingBox();
      const x = Math.max(0, top.x - 120);
      await shot(page, "10-gebruikersmenu-beheer", { box: { x, y: 0, width: 1280 - x, height: bottom.y + bottom.height + 30 }, marks: [users, backup, settings] });
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "10-gebruikersbeheer",
    async run(page) {
      const dlg = await openAdmin(page, "Gebruikers");
      await shot(page, "10-gebruikersbeheer", { clip: dlg, marks: [dlg.getByRole("button", { name: "Gebruiker toevoegen" }), dlg.getByRole("button", { name: "Bekijken" }).first()] });
      await dlg.getByRole("button", { name: "Gebruiker toevoegen" }).click();
      const form = dlg;
      await form.getByRole("heading", { name: "Nieuwe gebruiker toevoegen" }).waitFor();
      await form.getByRole("textbox", { name: "Gebruikersnaam" }).fill("balie2");
      await form.getByRole("textbox", { name: "Volledige naam" }).fill("Nieuwe baliemedewerker");
      await shot(page, "10-nieuwe-gebruiker", {
        clip: form,
        marks: [form.getByRole("textbox", { name: "Gebruikersnaam" }), form.getByRole("textbox", { name: "Wachtwoord" }), form.getByRole("combobox").first()],
      });
      const grid = form.getByText("Aanvullende rechten").first();
      await grid.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, "15-rechtenraster", { clip: form, marks: [form.getByRole("button", { name: "Benodigde rechten ook aanzetten" })] });
      const submit = form.getByRole("button", { name: "Gebruiker aanmaken" });
      await submit.scrollIntoViewIfNeeded();
      await shot(page, "10-nieuwe-gebruiker-opslaan", { clip: form, marks: [submit] });
    },
  },
  {
    name: "10-app-instellingen",
    async run(page) {
      const dlg = await openAdmin(page, "App-instellingen");
      await shot(page, "10-app-instellingen", { clip: dlg, marks: [dlg.getByRole("tablist").first()] });
      await dlg.getByRole("tab", { name: "Bedrijfsregels" }).click();
      await settle(page);
      const name = dlg.getByRole("button", { name: "Bedrijfsnaam opslaan" });
      await name.scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, "10-bedrijfsregels", { clip: dlg, marks: (await name.count()) ? [name, dlg.getByRole("button", { name: "Tijdzone opslaan" })] : [] });
      await dlg.getByRole("tab", { name: "Activiteit" }).click();
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, "10-activiteitenlog", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Activiteit" }), dlg.getByRole("combobox").first()] });
      await dlg.getByRole("tab", { name: "Documenten" }).click();
      await settle(page);
      await shot(page, "10-instellingen-documenten", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Documenten" })] });
      await dlg.getByRole("tab", { name: "Klantenportaal" }).click();
      await settle(page);
      await shot(page, "10-instellingen-klantenportaal", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Klantenportaal" })] });
    },
  },
  {
    name: "10-backup-herstel",
    async run(page) {
      const dlg = await openAdmin(page, "Back-upbeheer");
      await shot(page, "10-backup-herstel", { clip: dlg, marks: [dlg.getByRole("button", { name: "Nu back-uppen" })] });
    },
  },
  {
    name: "10-geschiedenis",
    async run(page) {
      await goto(page, "/customers");
      await page.getByRole("textbox", { name: "Klanten zoeken" }).fill("Bakkerij");
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Bekijken", exact: true }).first().click();
      const dlg = dialog(page, "Klantgegevens");
      await dlg.waitFor();
      await dlg.getByRole("tab", { name: "Geschiedenis" }).click();
      await settle(page);
      await shot(page, "10-geschiedenis", { clip: dlg, marks: [dlg.getByRole("tab", { name: "Geschiedenis" })] });
    },
  },
  {
    name: "15-grijze-knop-uitleg",
    async run(page) {
      // Een account met alleen kijkrechten (e2e-viewer): de knop staat er, maar grijs, met uitleg.
      const context = await page.context().browser().newContext({ viewport: VIEWPORT, locale: "nl-NL" });
      const viewer = await context.newPage();
      try {
        await login(viewer, { username: "e2e-viewer", password: PASSWORD });
        await viewer.goto(`${BASE_URL}/vehicles`);
        await settle(viewer);
        const add = viewer.getByRole("button", { name: "Voertuig toevoegen" });
        await add.waitFor();
        const box = await add.boundingBox();
        await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await viewer.waitForTimeout(1000);
        await shot(viewer, "15-grijze-knop-uitleg", { box: { x: 256, y: 0, width: 1024, height: 320 }, marks: [add] });
        await viewer.goto(`${BASE_URL}/`);
        await settle(viewer);
        await shot(viewer, "15-menu-kijker", { clip: viewer.locator("aside, [role=complementary]").first(), pad: 0 });
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "10-geweigerde-pogingen",
    async run(page) {
      // Een kijker probeert iets waarvoor hij geen recht heeft; de beheerder ziet dat bij de volgende inlog.
      const context = await page.context().browser().newContext({ viewport: VIEWPORT, locale: "nl-NL" });
      const viewer = await context.newPage();
      try {
        await login(viewer, { username: "e2e-cleaner", password: PASSWORD });
        for (const route of ["/expenses", "/delivery", "/documents"]) {
          await viewer.goto(`${BASE_URL}${route}`);
          await settle(viewer);
        }
      } finally {
        await context.close();
      }
      const fresh = await page.context().browser().newContext({ viewport: VIEWPORT, locale: "nl-NL" });
      const admin = await fresh.newPage();
      try {
        await login(admin, { username: "e2e-admin", password: PASSWORD });
        await admin.goto(`${BASE_URL}/`);
        await settle(admin);
        const bar = admin.getByText(/probeerde.*waarvoor/).first();
        if (await bar.isVisible({ timeout: 3000 }).catch(() => false)) {
          await shot(admin, "10-geweigerde-pogingen-balk", { box: { x: 256, y: 60, width: 1024, height: 160 }, marks: [admin.getByRole("button", { name: "Bekijken" }).first()] });
          await admin.getByRole("button", { name: "Bekijken" }).first().click();
          const dlg = dialog(admin, "Geweigerde pogingen");
          await dlg.waitFor();
          await settle(admin);
          await shot(admin, "10-geweigerde-pogingen", { clip: dlg });
        }
      } finally {
        await fresh.close();
      }
    },
  },
];

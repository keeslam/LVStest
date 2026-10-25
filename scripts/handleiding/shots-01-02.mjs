/** Hoofdstuk 1 (Snel aan de slag) en 2 (Navigatie): de schermen en de balk. */
import { BASE_URL, VIEWPORT, closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const card = (page, title) => page.locator(".rounded-lg.border", { has: page.getByText(title, { exact: true }) }).first();
const userButton = (page) => page.locator("header button").filter({ hasText: /admin/i }).first();

export const steps = [
  {
    name: "01-inlogscherm",
    async run(page) {
      const context = await page.context().browser().newContext({ viewport: VIEWPORT, locale: "nl-NL" });
      const fresh = await context.newPage();
      try {
        await fresh.goto(`${BASE_URL}/auth`);
        await settle(fresh);
        await fresh.locator('input[name="username"]').fill("jan");
        await fresh.locator('input[name="password"]').fill("wachtwoord");
        await shot(fresh, "01-inlogscherm", {
          marks: [fresh.locator('input[name="username"]'), fresh.locator('input[name="password"]'), fresh.locator('button[type="submit"]')],
        });
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "01-bovenbalk",
    async run(page) {
      await goto(page, "/");
      await shot(page, "01-bovenbalk", {
        clip: page.locator("header").first(),
        pad: 0,
        marks: [page.getByRole("textbox", { name: "Zoeken..." }), page.getByRole("button", { name: /^Meldingen/ }), userButton(page)],
      });
    },
  },
  {
    name: "01-zoekresultaten",
    async run(page) {
      await goto(page, "/");
      const search = page.getByRole("textbox", { name: "Zoeken..." });
      await search.click();
      await search.fill("van dijk");
      await page.waitForTimeout(1200);
      await settle(page);
      await shot(page, "01-zoekresultaten", { box: { x: 240, y: 0, width: 1040, height: 520 }, marks: [search] });
      await page.keyboard.press("Escape");
      await search.fill("");
    },
  },
  {
    name: "01-gebruikersmenu",
    async run(page) {
      await goto(page, "/");
      await userButton(page).click();
      const profile = page.getByRole("button", { name: "Profiel" });
      const logout = page.getByRole("button", { name: "Uitloggen" });
      await logout.waitFor();
      const top = await profile.boundingBox();
      const bottom = await logout.boundingBox();
      const x = Math.max(0, top.x - 60);
      await shot(page, "01-gebruikersmenu", {
        box: { x, y: 0, width: 1280 - x, height: bottom.y + bottom.height + 30 },
        marks: [userButton(page), profile, page.getByRole("button", { name: "Handleiding" }), logout],
      });
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "02-menu-links",
    async run(page) {
      await goto(page, "/");
      await shot(page, "02-menu-links", { clip: page.locator("aside, [role=complementary]").first(), pad: 0 });
    },
  },
  {
    name: "03-dashboard",
    async run(page) {
      await goto(page, "/");
      await shot(page, "03-dashboard", { fullPage: true });
    },
  },
  {
    name: "02-snelle-acties",
    async run(page) {
      await goto(page, "/");
      await shot(page, "02-snelle-acties", {
        clip: card(page, "Snelle acties"),
        marks: [
          page.getByRole("button", { name: /^Ophalen starten/ }),
          page.getByRole("button", { name: /^Innemen starten/ }),
          page.getByRole("button", { name: /^Scannen/ }),
          page.getByRole("button", { name: "Nieuwe reservering" }),
          page.getByRole("button", { name: "Schadecheck starten" }),
        ],
      });
    },
  },
  {
    name: "02-meldingencentrum",
    async run(page) {
      await goto(page, "/");
      await page.getByRole("button", { name: /^Meldingen/ }).click();
      const dlg = dialog(page);
      await dlg.waitFor();
      await shot(page, "02-meldingencentrum", { clip: dlg });
    },
  },
  {
    name: "02-sneltoetsen",
    async run(page) {
      await goto(page, "/");
      await page.locator("body").click({ position: { x: 640, y: 400 } });
      await page.keyboard.press("?");
      const dlg = dialog(page, "Sneltoetsen");
      await dlg.waitFor();
      await shot(page, "02-sneltoetsen", { clip: dlg });
    },
  },
  ...[
    ["05-voertuigen", "/vehicles"],
    ["10-scannen", "/scan"],
    ["06-klanten", "/customers"],
    ["12-klantenportaal-beheer", "/portal-admin"],
    ["04-reserveringskalender", "/reservations"],
    ["07-onderhoud", "/maintenance"],
    ["02-kosten-overzicht", "/expenses"],
    ["09-documenten", "/documents"],
    ["08-transporten", "/delivery"],
    ["02-communicatie", "/communications"],
  ].map(([name, route]) => ({
    name,
    async run(page) {
      await goto(page, route);
      await closeDialogs(page);
      await shot(page, name);
    },
  })),
];

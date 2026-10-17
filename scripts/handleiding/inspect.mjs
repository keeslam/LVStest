/**
 * Hulpje bij het schrijven van de stappen: print de toegankelijkheidsboom van
 * een scherm, of van de dialoog na een reeks klikken, zodat de namen van
 * knoppen en velden bekend zijn.
 *
 *   node scripts/handleiding/inspect.mjs /vehicles
 *   node scripts/handleiding/inspect.mjs /customers "button:Klant toevoegen"
 *   node scripts/handleiding/inspect.mjs /vehicles "button:Bekijken#1" "button:Bewerken"
 *
 * `role:naam#n` klikt het n-de element (vanaf 0). Met `--each` wordt na elke
 * klik de boom van de bovenste dialoog geprint; `--esc` sluit de dialoog weer
 * na het printen (zodat een volgende klik op het onderliggende scherm werkt).
 */
import { goto, launch, login, settle } from "./lib.mjs";

const args = process.argv.slice(2);
const each = args.includes("--each");
const esc = args.includes("--esc");
const [route = "/", ...clicks] = args.filter((a) => !a.startsWith("--"));

const clean = (snapshot) => snapshot.split("\n").filter((l) => !/^\s*- img$/.test(l)).join("\n");
const scopeOf = async (page) => ((await page.getByRole("dialog").count()) || (await page.getByRole("alertdialog").count())
  ? page.locator('[role="dialog"], [role="alertdialog"]').last()
  : page.locator("body"));

const { browser, page } = await launch();
try {
  await login(page, { username: process.env.HANDLEIDING_USER || "e2e-manager-b" });
  await goto(page, route);
  for (const click of clicks) {
    const [role, ...restParts] = click.split(":");
    const rest = restParts.join(":");
    if (role === "fill") {
      // fill:Veldnaam=waarde  (textbox op naam of placeholder)
      const [field, value] = rest.split("=");
      const box = page.getByRole("textbox", { name: field }).or(page.getByPlaceholder(field)).last();
      await box.click();
      await box.fill(value);
      await page.waitForTimeout(1200);
    } else if (role === "key") {
      await page.keyboard.press(rest);
    } else if (role === "text") {
      await page.getByText(rest).last().click();
    } else {
      const [name, nth = "0"] = rest.split("#");
      await page.getByRole(role, { name, exact: true }).nth(Number(nth)).click();
    }
    await settle(page);
    if (each) {
      console.log(`\n=== na klik ${click}\n${clean(await (await scopeOf(page)).ariaSnapshot())}`);
      if (esc) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    }
  }
  if (!each) console.log(clean(await (await scopeOf(page)).ariaSnapshot()));
} finally {
  await browser.close();
}

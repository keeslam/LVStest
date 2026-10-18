/**
 * Maakt de schermafbeeldingen van de handleiding.
 *
 *   node scripts/handleiding/run.mjs            alle stappen
 *   node scripts/handleiding/run.mjs 03-        alleen de stappen waarvan de naam zo begint
 *   node scripts/handleiding/run.mjs --headed   met zichtbare browser
 *
 * Elke `shots-*.mjs` exporteert `steps`: [{ name, run(page) }]. Een stap die
 * mislukt wordt gemeld; de rest loopt door. Zie lib.mjs voor de server en de
 * inlog.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIEWPORT, closeDialogs, launch, login as loginAs } from "./lib.mjs";
const login = (page) => loginAs(page, { username: process.env.HANDLEIDING_USER || "e2e-admin" });

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const headed = args.includes("--headed");
const accountArg = args.find((a) => a.startsWith("--account="));
if (accountArg) process.env.HANDLEIDING_USER = accountArg.slice("--account=".length);
const filters = args.filter((a) => !a.startsWith("--"));

const files = fs
  .readdirSync(here)
  .filter((f) => /^shots-.*\.mjs$/.test(f))
  .sort();

const { browser, page } = await launch({ headless: !headed });
const failures = [];
try {
  await login(page);
  for (const file of files) {
    const mod = await import(`./${file}`);
    for (const step of mod.steps) {
      if (filters.length && !filters.some((f) => step.name.startsWith(f) || step.name.includes(f))) continue;
      console.log(`▶ ${step.name}`);
      // Elke stap begint op de gewone schermgrootte, ook als een vorige stap halverwege misging.
      await page.setViewportSize(VIEWPORT);
      try {
        await step.run(page);
      } catch (error) {
        failures.push({ step: step.name, error });
        console.error(`  ✗ ${step.name}: ${error.message.split("\n")[0]}`);
        await page.screenshot({ path: path.join(here, `.failed-${step.name}.png`) }).catch(() => {});
      }
      await closeDialogs(page);
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} stap(pen) mislukt: ${failures.map((f) => f.step).join(", ")}`);
  process.exit(1);
}
console.log("\nAlle stappen klaar.");

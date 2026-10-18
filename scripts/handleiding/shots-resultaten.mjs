/** Wat je ziet nadat een handeling klaar is: de nieuwe klant in de lijst, de auto op Verhuurd, het onderhoudsblok in de kalender. */
import { closeDialogs, goto, settle, shot } from "./lib.mjs";

export const steps = [
  {
    name: "03-resultaat-klant-in-lijst",
    async run(page) {
      await goto(page, "/customers");
      await page.getByRole("textbox", { name: "Klanten zoeken" }).fill("Slagerij");
      await page.waitForTimeout(700);
      await settle(page);
      const row = page.getByRole("row").filter({ hasText: "Slagerij" }).first();
      await shot(page, "03-resultaat-klant-in-lijst", { box: { x: 256, y: 60, width: 1024, height: 560 }, marks: [row] });
    },
  },
  {
    name: "05-resultaat-voertuig-verhuurd",
    async run(page) {
      await goto(page, "/vehicles");
      await page.getByRole("textbox", { name: /Zoeken op kenteken/ }).fill("12-VKL-3");
      await page.waitForTimeout(700);
      await settle(page);
      // De hele rij is breder dan het venster; markeer de statuscel.
      const row = page.getByRole("row").filter({ hasText: "12-VKL-3" }).first();
      const status = row.getByText(/^Verhuurd/).first();
      await shot(page, "05-resultaat-voertuig-verhuurd", { box: { x: 256, y: 60, width: 1024, height: 560 }, marks: [{ locator: status, text: "Status" }] });
    },
  },
  {
    name: "05-resultaat-kalender-opgehaald",
    async run(page) {
      await goto(page, "/reservations");
      await closeDialogs(page);
      const entry = page.getByText("12-VKL-3", { exact: true }).first();
      await shot(page, "05-resultaat-kalender-opgehaald", { marks: [entry] });
    },
  },
  {
    name: "07-resultaat-blok-in-kalender",
    async run(page) {
      await goto(page, "/maintenance");
      await closeDialogs(page);
      const entry = page.getByText("Remmenonderhoud", { exact: true }).first();
      await shot(page, "07-resultaat-blok-in-kalender", { marks: [entry] });
    },
  },
];

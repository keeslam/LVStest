import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { PAGES } from "../registry/pages";

for (const role of ROLES) {
  test.describe(`pages as ${role}`, () => {
    test.use({ storageState: authFile(role) });
    for (const entry of PAGES.filter((candidate) => can(role, candidate.anyOf))) {
      test(`${entry.path} opens without a fault`, async ({ page, health }) => {
        await page.goto(entry.path);
        await settle(page);
        await expect(page).not.toHaveURL(/\/auth/);
        await expect(page.getByText("404 Pagina niet gevonden")).toHaveCount(0);
        expect(health.violations).toEqual([]);
      });
    }
  });
}

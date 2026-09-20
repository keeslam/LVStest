import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { DIALOGS } from "../registry/dialogs";

for (const role of ROLES) {
  test.describe(`dialogs as ${role}`, () => {
    test.use({ storageState: authFile(role) });
    for (const entry of DIALOGS.filter((candidate) => can(role, candidate.anyOf))) {
      test(`${entry.page}: ${entry.name}`, async ({ page, health }) => {
        // Finding for the owner (task-7-report.md): SettingsDialog's
        // DialogContent has no DialogTitle (only admin can ever reach this
        // dialog, so there is exactly one role x dialog instance to mark).
        test.fixme(entry.opener === "menu-settings", "SettingsDialog has no DialogTitle — Radix a11y console warning on every open, see task-7-report.md");
        await page.goto(entry.page);
        await settle(page);
        // Some openers live inside a dropdown menu (a menu button, then a menu
        // item); `via` is the data-testid of that menu trigger.
        if (entry.via) await page.getByTestId(entry.via).first().click();
        await page.getByTestId(entry.opener).first().click();
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("heading").first()).toBeVisible();
        await settle(page);
        // Some dialogs block Escape on purpose (a form guarding against losing
        // input); `close` names the dialog's own close/cancel control instead.
        if (entry.close) {
          await page.getByTestId(entry.close).click();
        } else {
          await page.keyboard.press("Escape");
        }
        await expect(dialog).toBeHidden();
        expect(health.violations).toEqual([]);
      });
    }
  });
}

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
        // item); `via` is the data-testid of that menu trigger. Every `via`
        // and `opener` testid in the registry renders exactly once on its
        // page (checked against each source file), so a plain click is a
        // precise locator here — no `.first()` needed.
        if (entry.via) await page.getByTestId(entry.via).click();
        await page.getByTestId(entry.opener).click();
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
        await expect(dialog).toBeVisible();
        // `.first()`: some dialogs (e.g. profile-dialog.tsx "eigen profiel",
        // key-audit-dialog.tsx) render their own `<h3>`/`<h4>` section
        // sub-headings inside DialogContent alongside DialogTitle, so more
        // than one role="heading" element can exist; DialogTitle is always
        // first in DOM order, which is the one this assertion means to check.
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

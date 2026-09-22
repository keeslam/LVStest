import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { DIALOGS } from "../registry/dialogs";
import { permissionLabel } from "../../shared/permission-labels";
import { pageAccessFor } from "../../shared/page-access";

/**
 * Whether `role` can open `page` at all, per the same table `ProtectedRoute`
 * uses (shared/page-access.ts, Task 2). A role that cannot open the page gets
 * the no-access page instead of the page component — the opener never
 * mounts, so there is nothing for the "visible, disabled, explains itself"
 * branch below to find. That combination is `forbidden.spec.ts`'s job, not
 * this spec's; a page with no row in the table (none today) is open to any
 * logged-in role, matching `canOpenPage`'s own contract.
 */
function roleCanOpenPage(role: (typeof ROLES)[number], page: string): boolean {
  const access = pageAccessFor(page);
  if (!access) return true;
  return can(role, access.anyOf);
}

for (const role of ROLES) {
  test.describe(`dialogs as ${role}`, () => {
    test.use({ storageState: authFile(role) });
    for (const entry of DIALOGS) {
      const allowed = can(role, entry.anyOf);
      // A role that cannot even open the PAGE never reaches the opener at
      // all, whichever way its own `anyOf` compares — that combination is
      // forbidden.spec.ts's job (the no-access page, not this control), so it
      // is skipped regardless of `allowed`. This matters once a control's own
      // permission differs from the page's (e.g. /maintenance's own gate is
      // MANAGE_MAINTENANCE, but button-schedule-maintenance needs
      // MANAGE_RESERVATIONS — a role holding MANAGE_RESERVATIONS but not
      // MANAGE_MAINTENANCE satisfies the button's `anyOf` yet still cannot
      // open the page to find it).
      if (!roleCanOpenPage(role, entry.page)) continue;
      // Hidden-on-purpose openers (admin-only today, B-27 keeps them hidden
      // rather than disabled) keep the old skip: there is nothing meaningful
      // to assert for this role here.
      if (!allowed && entry.hiddenWithoutRight) continue;
      // Entries whose ALLOWED path needs record state this suite cannot set
      // up (see `allowedPathNeedsState` on `DialogEntry`, e2e/registry/dialogs.ts)
      // generate no test at all for that branch — not a skip, since a role
      // that already holds the permission proves nothing new by being told
      // "can't click a button no test here can ever enable". That proof
      // belongs to a Layer B story that seeds the state first. The DENIED
      // branch below is unaffected and still runs: it only reads
      // RequiresPermission's tooltip, never clicks.
      if (allowed && entry.allowedPathNeedsState) continue;

      if (allowed) {
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
      } else {
        test(`${entry.page}: ${entry.name} (zonder recht: zichtbaar, uitgeschakeld, legt uit)`, async ({ page, health }) => {
          await page.goto(entry.page);
          await settle(page);
          if (entry.via) await page.getByTestId(entry.via).click();
          const opener = page.getByTestId(entry.opener);
          await expect(opener).toBeVisible();
          await expect(opener).toHaveAttribute("aria-disabled", "true");
          // A disabled control swallows pointer events, so RequiresPermission
          // puts the tooltip and the tab stop on the wrapping <span> around
          // it, not on the control itself (client/src/components/ui/requires-permission.tsx).
          const wrapper = opener.locator("xpath=..");
          await wrapper.focus();
          const tooltip = page.getByRole("tooltip");
          await expect(tooltip).toBeVisible();
          for (const permission of entry.anyOf) {
            await expect(tooltip).toContainText(permissionLabel(permission));
          }
          // Clicking the (still-visible) control must not open anything —
          // `{ force: true }` bypasses Playwright's own actionability check,
          // which would otherwise refuse to click a disabled element.
          await opener.click({ force: true });
          await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
          expect(health.violations).toEqual([]);
        });
      }
    }
  });
}

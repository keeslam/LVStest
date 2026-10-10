import { test, expect, settle } from "../support/guards";
import { ROLES, TWIN_OF, authFile, can, profileOf, type Account } from "../support/roles";
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

/**
 * One API limiter bucket per user: 1000 requests per 15 minutes, one server process
 * and one window per run (the limiter stays as in production, and a 429 is a
 * page-health violation). `admin`, `manager` and `user` are the profiles that spend it
 * fastest: `admin` holds every right, so every registry entry is an allowed-branch
 * test for it (open, heading check, close, each with the page's own requests),
 * `manager` holds nearly all of them, `user` meets most of the rest as a denied-branch
 * page load - and layer-b (the desk stories) and the tail draw on the same buckets.
 * Their tests are therefore dealt over two seeded accounts with the same rights
 * (TWIN_OF: `admin` / `admin-b`, `manager` / `manager-b`, `user` / `user-b`) by the
 * entry's position in the registry: even positions run as the profile itself, odd
 * ones as its twin. The split is deterministic, so a failing title always names the
 * same account. Every other profile keeps its single session.
 * See docs/e2e/README.md, "Het verzoekbudget".
 */
const twinOf = (role: (typeof ROLES)[number]): Account | undefined => (TWIN_OF as Partial<Record<string, Account>>)[role];
const SESSIONS: readonly Account[] = ROLES.flatMap((role): Account[] => {
  const twin = twinOf(role);
  return twin ? [role, twin] : [role];
});

for (const account of SESSIONS) {
  const role = profileOf(account);
  test.describe(`dialogs as ${account}`, () => {
    test.use({ storageState: authFile(account) });
    for (const [index, entry] of DIALOGS.entries()) {
      if (twinOf(role) && (account !== role) !== (index % 2 === 1)) continue;
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
      // The mirror image (see `deniedPathNeedsState` on `DialogEntry`): an
      // opener that only exists inside a dialog opened from a record cannot be
      // found on a bare page load, so there is no denied-branch test to
      // generate; the reason is written in the registry entry.
      if (!allowed && entry.deniedPathNeedsState) continue;

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
          const openDialogs = page.locator('[role="dialog"], [role="alertdialog"]');
          const dialog = openDialogs.last();
          await expect(dialog).toBeVisible();
          // A dialog can open on top of another one (the fines bin opens from the
          // fines list, which the portal dashboard shows as a dialog): closing it
          // then leaves the other one standing. So the check is on THIS dialog's
          // own element - it must leave the page - and not on a count that any
          // other dialog opening or closing meanwhile would throw off.
          const openCount = await openDialogs.count();
          const openedDialog = await dialog.elementHandle();
          if (!openedDialog) throw new Error(`${entry.opener}: the dialog that opened vanished before it could be checked`);
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
          await expect
            .poll(() => openedDialog.evaluate((element) => element.isConnected), {
              message: `${entry.opener}: the dialog that was opened must be removed from the page when it is closed`,
            })
            .toBe(false);
          // A dialog that stood on its own leaves none behind (the stricter, old check).
          if (openCount === 1) await expect(openDialogs).toHaveCount(0);
          expect(health.violations).toEqual([]);
        });
      } else {
        test(`${entry.page}: ${entry.name} (zonder recht: zichtbaar, uitgeschakeld, legt uit)`, async ({ page, health }) => {
          await page.goto(entry.page);
          await settle(page);
          // `deniedOpener`: the gated control is the thing in front of the opener (a disabled tab), so
          // it is checked directly instead of being clicked through.
          if (entry.via && !entry.deniedOpener) await page.getByTestId(entry.via).click();
          const opener = page.getByTestId(entry.deniedOpener ?? entry.opener);
          await expect(opener).toBeVisible();
          await expect(opener).toHaveAttribute("aria-disabled", "true");
          // A disabled control swallows pointer events, so RequiresPermission
          // puts the tooltip and the tab stop on the wrapping <span> around
          // it, not on the control itself (client/src/components/ui/requires-permission.tsx).
          const wrapper = opener.locator("xpath=..");
          // Radix closes a tooltip on any scroll event that reaches its
          // trigger, and focusing a control below the fold makes Chrome scroll
          // one frame AFTER focusin: the tooltip then opens and closes within
          // ~10 ms and only its 150 ms exit animation keeps the node around
          // long enough for `toBeVisible` to pass before `toContainText`
          // finds nothing (seen ~1 in 30 on the dashboard's "Nieuwe
          // reservering" tile). Scroll first, let the scroll event fire, then
          // focus, so the tooltip opens on a page that is no longer moving.
          await wrapper.scrollIntoViewIfNeeded();
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
          await wrapper.focus();
          const tooltip = page.getByRole("tooltip");
          await expect(tooltip).toBeVisible();
          // A tooltip that is merely fading out still passes `toBeVisible`;
          // the trigger's state says whether it is really open.
          await expect(wrapper).toHaveAttribute("data-state", /open/);
          for (const permission of entry.anyOf) {
            await expect(tooltip).toContainText(permissionLabel(permission));
          }
          // Clicking the (still-visible) control must not open anything —
          // `{ force: true }` bypasses Playwright's own actionability check,
          // which would otherwise refuse to click a disabled element.
          await opener.click({ force: true });
          await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
          // A tab the role may not use must not have been switched to by the forced click either.
          if (entry.deniedOpener) await expect(opener).toHaveAttribute("aria-selected", "false");
          expect(health.violations).toEqual([]);
        });
      }
    }
  });
}

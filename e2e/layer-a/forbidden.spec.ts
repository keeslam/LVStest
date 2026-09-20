import { test as base, expect } from "@playwright/test";
import { settle, watchPage } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { PAGES } from "../registry/pages";

for (const role of ROLES.filter((candidate) => candidate !== "admin")) {
  base.describe(`pages ${role} may not use`, () => {
    base.use({ storageState: authFile(role) });
    for (const entry of PAGES.filter((candidate) => !can(role, candidate.anyOf))) {
      base(`${entry.path}: not offered, data refused, no crash`, async ({ page, request }) => {
        // entry.api is null when no GET route this page depends on is guarded
        // consistently with its sidebar entry — see e2e/registry/pages.ts and
        // task-6-report.md, "Findings for the owner". Nothing to assert then;
        // the other two checks below still apply.
        if (entry.api !== null) {
          const refused = await request.get(entry.api);
          expect(refused.status(), `GET ${entry.api}`).toBe(403);
        }

        await page.goto("/");
        await settle(page);
        await expect(page.locator(`nav a[href="${entry.path}"]`)).toHaveCount(0);

        // A typed address: the client has no page-level refusal today
        // (ProtectedRoute only checks the login). It must at least not crash.
        const watcher = await watchPage(page, { console: false, allow: [{ url: /\/api\//, status: 403, reason: "this role may not use the page" }] });
        await page.goto(entry.path);
        await settle(page);
        await watcher.check();
        expect(watcher.violations.filter((v) => v.kind === "boundary" || v.kind === "pageerror" || v.kind === "http")).toEqual([]);
      });
    }
  });
}

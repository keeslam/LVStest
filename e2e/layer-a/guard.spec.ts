import { test as base, expect } from "@playwright/test";
import { authFile } from "../support/roles";
import { settle, watchPage, test as healthTest } from "../support/guards";

base.use({ storageState: authFile("admin") });

base("the guard reports a 500 that the page swallowed", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal server error"}' }));
  const watcher = await watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  const kinds = watcher.violations.map((v) => v.kind);
  expect(kinds).toContain("http");
  expect(kinds).toContain("toast"); // "Kon de gegevens niet laden"
});

base("the guard is silent on a healthy dashboard", async ({ page }) => {
  const watcher = await watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  expect(watcher.violations).toEqual([]);
});

base("a destructive toast is still reported after it auto-closes", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal server error"}' }));
  const watcher = await watchPage(page);
  await page.goto("/");
  await settle(page);
  // ToastProvider auto-closes after 2500 ms (client/src/components/ui/toaster.tsx).
  // Wait past that before check() so only the live capture (not a
  // [data-state="open"] read at check() time) can still find the violation.
  await expect(page.locator('li.destructive[data-state="open"]')).toHaveCount(0, { timeout: 10_000 });
  await watcher.check();
  expect(watcher.violations.map((v) => v.kind)).toContain("toast");
});

base("an allowed response suppresses its own console noise", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Forbidden"}' }));
  const watcher = await watchPage(page, {
    allow: [{ url: /\/api\/expenses\/recent/, status: 403, reason: "self-test: 403 forced on purpose" }],
  });
  await page.goto("/");
  await settle(page);
  await watcher.check();
  // A 403 also raises the app's own destructive toast (queryClient.ts only
  // skips it for 401); only http/console are in scope for this self-test.
  const kinds = watcher.violations.map((v) => v.kind);
  expect(kinds).not.toContain("http");
  expect(kinds).not.toContain("console");
});

base("the same response without an allow entry is a console violation", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Forbidden"}' }));
  const watcher = await watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  const kinds = watcher.violations.map((v) => v.kind);
  expect(kinds).not.toContain("http");
  expect(kinds).toContain("console");
});

healthTest("the health fixture fails the test when the page reports a violation", async ({ page, health }) => {
  healthTest.fail();
  void health;
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal server error"}' }));
  await page.goto("/");
  await settle(page);
});

healthTest("the health fixture passes on a healthy page", async ({ page, health }) => {
  void health;
  await page.goto("/");
  await settle(page);
});

// --- Fix round 1: regression tests for the two check()/trackRequests() fixes ---

base("check() does not lose or hang on a destructive toast that closes before it runs", async ({ page }) => {
  // Realistic shape first (as suggested in review): two different dashboard
  // queries fail on the same page load, the second well after the first (a
  // fixed delay on the fulfil, not the request) so the first is guaranteed a
  // separate React commit — and therefore a live MutationObserver capture —
  // before TOAST_LIMIT=1 (client/src/hooks/use-toast.ts) replaces it in the
  // DOM. Only that live capture, not check()'s own DOM read, can have seen
  // the one that is gone by the time check() runs.
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"toast one"}' }));
  await page.route("**/api/vehicles/apk-expiring*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"toast two"}' });
  });
  const watcher = await watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  const realToastDetails = watcher.violations.filter((v) => v.kind === "toast").map((v) => v.detail);
  expect(realToastDetails.some((d) => d.includes("toast one"))).toBe(true);
  expect(realToastDetails.some((d) => d.includes("toast two"))).toBe(true);

  // This part is what actually exercises the fixed race (the real toasts
  // above are not guaranteed to land check() mid-removal on every run — this
  // is what made the bug hard to hit reliably in practice). Measured locally
  // (see task-6-report.md, "Fix round 1"): a fresh `page.locator(...).count()`
  // takes ~15-20ms and the following `.nth(0).innerText()` a further ~5ms.
  // Pre-fix, check() read `toasts.count()` then looped `toasts.nth(index)`
  // one index at a time, each re-querying the live DOM; an element removed
  // in that gap left `.nth(0)` waiting forever for something that would
  // never reappear (Test timeout of 30000ms exceeded — reproduced by
  // temporarily reverting to the old loop). The spread of delays below
  // covers that window without hard-coding one fragile millisecond value.
  for (const delayMs of [8, 12, 16, 18, 20, 22, 24, 26, 30, 40]) {
    await page.evaluate((d) => {
      const el = document.createElement("li");
      el.className = "destructive";
      el.textContent = `synthetic toast closing after ${d}ms`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), d);
    }, delayMs);
    await watcher.check();
  }
});

base("settle() is not wedged by a request the previous document left hanging", async ({ page }) => {
  await settle(page); // installs request tracking before the first navigation
  await page.goto("/");
  await settle(page);

  // Never resolves: simulates a request Chromium does not cleanly report
  // requestfinished/requestfailed for once the navigation below supersedes
  // its document (see e2e/support/guards.ts, trackRequests()).
  await page.route("**/api/expenses/recent*", () => {});
  await page.evaluate(() => {
    fetch("/api/expenses/recent?limit=10", { credentials: "include" }).catch(() => {});
  });
  // Give the request a moment to actually start (so trackRequests sees the
  // `request` event) before navigating away without waiting for it.
  await page.waitForTimeout(100);

  await page.goto("/vehicles"); // a full navigation, not a client-side route change
  await settle(page); // must not time out on the stale /api/expenses/recent entry
});

base("settle() still detects a request left hanging across a same-document navigation", async ({ page }) => {
  await settle(page);
  await page.goto("/");
  await settle(page);

  // A request already hanging BEFORE the same-document navigation below —
  // this is the shape that matters: an over-broad reset that fires on any
  // navigation event (including pushState) would wrongly wipe out a request
  // that was already in flight, not one that starts after. /documents, not
  // /vehicles: nothing on "/" fetches it, so this is a fresh request, not
  // one already resolved from the dashboard's own load.
  await page.route(/\/api\/documents(\?.*)?$/, () => {});
  // Race the evaluate() against waitForRequest (not sequenced after it): the
  // request's "request" event can fire and be missed within the evaluate()
  // call itself, before a later waitForRequest() starts listening.
  await Promise.all([
    page.waitForRequest((request) => /\/api\/documents(\?.*)?$/.test(request.url())),
    page.evaluate(() => {
      fetch("/api/documents", { credentials: "include" }).catch(() => {});
    }),
  ]);

  // Now, while that request is still hanging, perform a same-document,
  // client-side route change (wouter's <Link>, history.pushState —
  // client/src/components/sidebar-nav.tsx), never a full reload. The fix's
  // navigation-request-based reset must NOT treat this as a new document and
  // clear the still-pending /api/documents entry out from under it.
  await page.locator('nav a[href="/vehicles"]').click();
  await expect(page).toHaveURL(/\/vehicles$/);

  await expect(settle(page, 100, 500)).rejects.toThrow(/did not settle/);
});

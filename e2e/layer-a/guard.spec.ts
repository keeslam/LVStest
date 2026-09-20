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

import { test as base, expect } from "@playwright/test";
import { authFile } from "../support/roles";
import { settle, watchPage } from "../support/guards";

base.use({ storageState: authFile("admin") });

base("the guard reports a 500 that the page swallowed", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal server error"}' }));
  const watcher = watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  const kinds = watcher.violations.map((v) => v.kind);
  expect(kinds).toContain("http");
  expect(kinds).toContain("toast"); // "Kon de gegevens niet laden"
});

base("the guard is silent on a healthy dashboard", async ({ page }) => {
  const watcher = watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  expect(watcher.violations).toEqual([]);
});

import { test as setup, expect } from "@playwright/test";
import { E2E } from "../support/env";
import { ACCOUNTS, authFile } from "../support/roles";
import { usernameOf } from "../seed/users";

// Every seeded login, twins included: each gets its own storage state, so a spec can
// pick the account whose rate-limit bucket has room (see TWINS in e2e/seed/users.ts).
for (const role of ACCOUNTS) {
  setup(`log in as ${role}`, async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[name="username"]').fill(usernameOf(role));
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/auth/);
    const me = await page.request.get("/api/user");
    expect(me.status()).toBe(200);
    expect((await me.json()).username).toBe(usernameOf(role));
    await page.context().storageState({ path: authFile(role) });
  });
}

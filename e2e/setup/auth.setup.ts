import { test as setup, expect } from "@playwright/test";
import { E2E } from "../support/env";
import { ROLES, authFile } from "../support/roles";
import { usernameOf } from "../seed/users";

for (const role of ROLES) {
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

import { defineConfig } from "@playwright/test";
import { E2E } from "./support/env";

export default defineConfig({
  testDir: ".",
  outputDir: ".tmp/results",
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { outputFolder: ".tmp/report", open: "never" }]],
  use: {
    baseURL: E2E.baseUrl,
    channel: "chrome",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx e2e/support/serve.ts",
    cwd: "..",
    url: `${E2E.baseUrl}/api/user`, // 401 when nobody is logged in: that counts as "up"
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "auth", testMatch: /setup[\\/](database|auth)\.setup\.ts/ },
    { name: "setup", testMatch: /setup[\\/]seed\.setup\.ts/, dependencies: ["auth"] },
    { name: "layer-a", testMatch: /layer-a[\\/].*\.spec\.ts/, dependencies: ["setup"], fullyParallel: true },
    { name: "layer-b", testMatch: /layer-b[\\/].*\.spec\.ts/, dependencies: ["setup"] },
  ],
});

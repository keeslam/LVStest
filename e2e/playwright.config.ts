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
  projects: [
    { name: "setup", testMatch: /setup[\\/].*\.setup\.ts/ },
    { name: "layer-a", testMatch: /layer-a[\\/].*\.spec\.ts/, dependencies: ["setup"], fullyParallel: true },
    { name: "layer-b", testMatch: /layer-b[\\/].*\.spec\.ts/, dependencies: ["setup"] },
  ],
});

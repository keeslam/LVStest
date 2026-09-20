import { defineConfig } from "@playwright/test";
import { E2E } from "./support/env";

export default defineConfig({
  testDir: ".",
  outputDir: ".tmp/results",
  retries: 0,
  forbidOnly: !!process.env.CI,
  // The app under test caps its own Postgres pool at 10 connections
  // (server/db.ts, "serverless-friendly", not configurable via env and not
  // ours to raise — see constraints.md). A single page can already fire a
  // dozen concurrent GETs on load (the dashboard's widgets); Playwright's
  // default worker count (half the CPU cores) multiplies that far past the
  // pool and connect-pg-simple's session-store queries on top of it, so
  // layer-a's ~90 fully-parallel tests reliably produced "Connection
  // terminated due to connection timeout" and stuck-request test failures
  // before this cap was added. Overridable (e.g. a weaker or stronger
  // machine) via E2E_WORKERS.
  workers: Number(process.env.E2E_WORKERS) || 4,
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

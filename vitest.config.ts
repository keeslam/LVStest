import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
  test: {
    // Named so the two projects (this one and vitest.client.config.ts, added
    // in wave 9) are distinguishable in the reporter output.
    name: "server",
    // FIX-S: the two pure client helpers (date formatting, calendar bucketing)
    // run in the same node project — they touch no DOM. The jsdom project for
    // component tests is wave 9 (plan §8).
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "scripts/**/*.test.ts", "client/src/lib/**/*.test.ts"],
    setupFiles: ["./server/__tests__/setup.ts"],
    // DB-backed tests share one Postgres; run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

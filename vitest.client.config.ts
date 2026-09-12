/**
 * Wave 9 / plan §8.8 — the jsdom project for client component tests.
 *
 * Deliberately a *second* project rather than a widening of the server one:
 * `server/__tests__/setup.ts` demands `DATABASE_URL` and the server project
 * runs with `fileParallelism: false` because its tests share one Postgres.
 * A component test needs neither, and must never be able to touch the
 * database. The split keeps both properties true.
 *
 * Scope: `client/src/**\/*.test.tsx`. The pure client helpers that existed
 * before this project (`client/src/lib/**\/*.test.ts`) stay in the node
 * project exactly where they were — they touch no DOM.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    name: "client",
    environment: "jsdom",
    include: ["client/src/**/*.test.tsx"],
    setupFiles: ["./client/src/__tests__/setup-jsdom.ts"],
    // No shared resource: these files may run side by side.
    fileParallelism: true,
    css: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});

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
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    setupFiles: ["./server/__tests__/setup.ts"],
    // DB-backed tests share one Postgres; run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

/**
 * Two projects, one `npx vitest run` (plan §8.8):
 *
 *   server — node, `server/__tests__/setup.ts`, one file at a time, needs the
 *            `lvs_fixtest` database. Unchanged from before wave 9.
 *   client — jsdom, no database, component tests only.
 */
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./vitest.config.ts",
  "./vitest.client.config.ts",
]);

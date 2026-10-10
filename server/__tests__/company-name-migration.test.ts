/**
 * Audit A-12-2 (package P2): customers saved with "" as company name become
 * NULL through a hand-written, idempotent step in startup-migration.js (marker
 * migration:p2_empty_company_name_null). Like expense-category-migration.test.ts
 * it runs the real script as a child process against lvs_fixtest.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings, customers } from "../../shared/schema";
import { createTestCustomer, cleanupPortalTestData } from "./portal-helpers";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const MARKER = "migration:p2_empty_company_name_null";
const MANAGER_MARKER = "migration:c_manager_rights";

describe("startup-migration.js: empty company names become NULL (marker migration:p2_empty_company_name_null)", () => {
  let guarded = false;
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};

  function runStartupMigration(): string {
    return execFileSync(process.execPath, [STARTUP_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
  }
  const make = async (label: string, companyName: string | null) => {
    const c = await createTestCustomer(label);
    await db.update(customers).set({ companyName }).where(eq(customers.id, c.id));
    return c.id;
  };
  const companyOf = async (id: number) => (await db.select().from(customers).where(eq(customers.id, id)))[0].companyName;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager-rights step out of this run (see expense-category-migration.test.ts).
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "p2 placeholder", granted: 0 }, category: "general",
      description: "p2 placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("turns '' and whitespace into NULL, leaves real names alone, and runs once", async () => {
    const empty = await make("MG-empty", "");
    const spaces = await make("MG-spaces", "   ");
    const real = await make("MG-real", "Echte Naam BV");
    const none = await make("MG-null", null);

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/empty company names/i);
    expect(await companyOf(empty)).toBeNull();
    expect(await companyOf(spaces)).toBeNull();
    expect(await companyOf(real)).toBe("Echte Naam BV");
    expect(await companyOf(none)).toBeNull();

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();
    expect((marker.value as any).updated).toBeGreaterThanOrEqual(2);

    // Second boot: the marker stops it; a new "" written afterwards is left alone.
    const late = await make("MG-late", "");
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already|skipping/i);
    expect(await companyOf(late)).toBe("");

    // Marker removed on purpose: the SQL itself is idempotent (picks up the late row, changes nothing else).
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    runStartupMigration();
    expect(await companyOf(late)).toBeNull();
    expect(await companyOf(real)).toBe("Echte Naam BV");
  }, 120_000);
});

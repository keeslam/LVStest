/**
 * Audit A-9-1 (package P1): existing rows written as "Fuel" are lower-cased by
 * a hand-written, idempotent step in startup-migration.js (marker
 * migration:p1_expense_category_lowercase). Like c-06-bins-per-kind.test.ts it
 * runs the real script as a child process against lvs_fixtest, the way
 * production runs it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appSettings, expenses } from "../../shared/schema";
import { createTestVehicle, cleanupPortalTestData } from "./portal-helpers";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const MARKER = "migration:p1_expense_category_lowercase";
const MANAGER_MARKER = "migration:c_manager_rights";

describe("startup-migration.js: lower-case the expense categories (marker migration:p1_expense_category_lowercase)", () => {
  let guarded = false;
  let vehicleId: number;
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};

  function runStartupMigration(): string {
    return execFileSync(process.execPath, [STARTUP_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  const insert = async (category: string) =>
    (await db.insert(expenses).values({ vehicleId, category, amount: "10.00", date: "2026-10-01", description: "p1-migratie" }).returning())[0];
  const categoryOf = async (id: number) => (await db.select().from(expenses).where(eq(expenses.id, id)))[0].category;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-MIG-01")).id;
    for (const key of [MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager-rights step out of this run (see c-06-bins-per-kind.test.ts).
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "p1 placeholder", granted: 0 }, category: "general",
      description: "p1 placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleId));
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("lower-cases capitalised rows, leaves everything else alone, and runs once", async () => {
    const upper = await insert("Fuel");
    const mixed = await insert(" Maintenance ");
    const shouting = await insert("TOLL");
    const lower = await insert("parking");
    const strange = await insert("Front Window");

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/expense categories lower-cased/i);

    expect(await categoryOf(upper.id)).toBe("fuel");
    expect(await categoryOf(mixed.id)).toBe("maintenance");
    expect(await categoryOf(shouting.id)).toBe("toll");
    expect(await categoryOf(lower.id)).toBe("parking");
    // Only the case changes; an unknown label is never rewritten to "other" here.
    expect(await categoryOf(strange.id)).toBe("front window");

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();
    expect((marker.value as any).updated).toBeGreaterThanOrEqual(4);

    // Second boot: the marker stops it, a new capitalised row is left alone.
    const late = await insert("Cleaning");
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already lower-cased|skipping/i);
    expect(await categoryOf(late.id)).toBe("Cleaning");

    // Marker removed on purpose: the SQL is idempotent too (it picks up the late
    // row and changes nothing that is already canonical).
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    runStartupMigration();
    expect(await categoryOf(late.id)).toBe("cleaning");
    expect(await categoryOf(upper.id)).toBe("fuel");
    const rows = await db.select({ id: expenses.id }).from(expenses).where(inArray(expenses.id, [upper.id, late.id]));
    expect(rows).toHaveLength(2);
  }, 120_000);
});

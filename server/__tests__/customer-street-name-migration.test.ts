/**
 * 2026-10-17: customers typed with only "Hoofdstraat 1" in the address line get
 * their street_name filled from it by a hand-written, idempotent step in
 * startup-migration.js (marker migration:customer_street_name_from_address).
 * Like expense-category-migration.test.ts it runs the real script as a child
 * process against lvs_fixtest, the way production runs it, and checks that the
 * SQL splits the line exactly as shared/address.ts splitStreetLine does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appSettings, customers } from "../../shared/schema";
import { customerStreetName } from "../../shared/address";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const MARKER = "migration:customer_street_name_from_address";
const LINE_MARKER = "migration:customer_address_line_from_street_and_number";
const MANAGER_MARKER = "migration:c_manager_rights";

describe("startup-migration.js: fill the customer street name from the address line", () => {
  let guarded = false;
  const ids: number[] = [];
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};

  function runStartupMigration(): string {
    return execFileSync(process.execPath, [STARTUP_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  const insert = async (address: string | null, streetName: string | null = null) => {
    const [row] = await db.insert(customers).values({
      name: `MIG-STREET-${ids.length + 1}`, email: `mig-street-${Date.now()}-${ids.length}@fixture-test.invalid`,
      customerType: "business", address, streetName, city: "Rotterdam", postalCode: "3011 AD",
    }).returning();
    ids.push(row.id);
    return row;
  };
  const streetOf = async (id: number) => (await db.select().from(customers).where(eq(customers.id, id)))[0].streetName;
  const addressOf = async (id: number) => (await db.select().from(customers).where(eq(customers.id, id)))[0].address;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    for (const key of [MARKER, LINE_MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager-rights step out of this run (see c-06-bins-per-kind.test.ts).
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "street placeholder", granted: 0 }, category: "general",
      description: "street placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(inArray(appSettings.key, [MARKER, LINE_MARKER]));
  });

  afterAll(async () => {
    if (!guarded) return;
    await db.delete(customers).where(inArray(customers.id, ids));
    for (const key of [MARKER, LINE_MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("splits the address line like the app does, leaves a typed street alone, and runs once", async () => {
    const cases = ["Hoofdstraat 1", "Van der Helstlaan 4A", "Dorpsstraat 12-3", "Kade", "  Lange Nieuwstraat 101 bis ", "Postbus 12"];
    const rows = await Promise.all(cases.map((address) => insert(address)));
    const typed = await insert("Hoofdstraat 9", "Coolsingel");
    // Production shape: the street in its own field, only the number in the address line.
    const split = await insert("47a", "Kerkweg");
    const splitDash = await insert("12-3", "Kerkweg");
    const numberOnly = await insert("47a", null);
    const blank = await insert("", null);
    const nothing = await insert(null, null);

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/Customer street names filled from the address line: \d+ row/);

    for (const [i, address] of cases.entries()) {
      expect(await streetOf(rows[i].id), address).toBe(customerStreetName({ streetName: "", address }));
    }
    expect(await streetOf(rows[0].id)).toBe("Hoofdstraat");
    expect(await streetOf(rows[1].id)).toBe("Van der Helstlaan");
    expect(await streetOf(rows[2].id)).toBe("Dorpsstraat");
    expect(await streetOf(rows[3].id)).toBe("Kade");
    expect(await streetOf(typed.id)).toBe("Coolsingel");
    expect(await addressOf(typed.id)).toBe("Hoofdstraat 9");
    expect(await addressOf(split.id)).toBe("Kerkweg 47a");
    expect(await addressOf(splitDash.id)).toBe("Kerkweg 12-3");
    expect(await streetOf(split.id)).toBe("Kerkweg");
    // A bare number without a street name cannot be completed: left as it is, not broken.
    expect(await addressOf(numberOnly.id)).toBe("47a");
    expect(await streetOf(numberOnly.id) ?? "").toBe("");
    expect(first).toMatch(/Customer address lines completed from street name and number: \d+ row/);
    expect(await streetOf(blank.id) ?? "").toBe("");
    expect(await streetOf(nothing.id) ?? "").toBe("");

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();
    expect((marker.value as any).updated).toBeGreaterThanOrEqual(cases.length);

    // Second boot: the marker stops it, a late row is left alone.
    const late = await insert("Kerkstraat 5");
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already filled|skipping/i);
    expect(await streetOf(late.id) ?? "").toBe("");

    // Marker removed on purpose: the SQL is idempotent too (picks up the late row, changes nothing filled).
    await db.delete(appSettings).where(inArray(appSettings.key, [MARKER, LINE_MARKER]));
    runStartupMigration();
    expect(await streetOf(late.id)).toBe("Kerkstraat");
    expect(await streetOf(typed.id)).toBe("Coolsingel");
    expect(await addressOf(split.id)).toBe("Kerkweg 47a");
  }, 180_000);
});

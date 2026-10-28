/**
 * Lease offertes, costs per variant: the eight cost fields moved from lease_quotes to each
 * lease_quote_variants row. startup-migration.js fills variants that carry no costs yet from
 * their quote, once (marker migration:lease_variant_costs_v1). Like company-name-migration.test.ts
 * it runs the real script as a child process against lvs_fixtest.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { appSettings, leaseQuoteVariants, leaseQuotes } from "../../shared/schema";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const MARKER = "migration:lease_variant_costs_v1";
const MANAGER_MARKER = "migration:c_manager_rights";
const PREFIX = "FIXT-lqmig-";

describe("startup-migration.js: variants get the quote's costs once (marker migration:lease_variant_costs_v1)", () => {
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

  async function makeQuote(label: string) {
    const [q] = await db.insert(leaseQuotes).values({
      quoteNumber: `${PREFIX}${label}-${Date.now().toString(36)}`, quoteDate: "2026-10-28", validUntil: "2026-11-27",
      prospectName: `${PREFIX}${label}`, purchasePrice: "17318",
      interestRatePercent: "9", robPerYear: "275", otherCostsPerYear: "350", insurancePerMonth: "97.8",
      roadTaxPerMonth: "34", marginPerMonth: "0", excessKmPrice: "0.0850", shortfallKmPrice: "0.0400",
    }).returning();
    return q;
  }
  const addVariant = async (quoteId: number, position: number, over: Partial<typeof leaseQuoteVariants.$inferInsert> = {}) =>
    (await db.insert(leaseQuoteVariants).values({
      quoteId, position, termMonths: 48, kmPerYear: 20000, residualValue: "10000", isChosen: position === 0, ...over,
    }).returning())[0];
  const variantOf = async (id: number) => (await db.select().from(leaseQuoteVariants).where(eq(leaseQuoteVariants.id, id)))[0];

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    for (const key of [MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager-rights step out of this run (see company-name-migration.test.ts).
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "lease placeholder", granted: 0 }, category: "general",
      description: "lease placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    await db.delete(leaseQuotes).where(like(leaseQuotes.prospectName, `${PREFIX}%`));
    for (const key of [MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("copies the quote's costs into variants without costs, leaves variants that have costs, and runs once", async () => {
    const quote = await makeQuote("a");
    const bare1 = await addVariant(quote.id, 0);
    const bare2 = await addVariant(quote.id, 1);
    const own = await addVariant(quote.id, 2, { interestRatePercent: "5" });

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/Lease variant costs backfilled/);

    for (const id of [bare1.id, bare2.id]) {
      const v = await variantOf(id);
      expect(Number(v.interestRatePercent)).toBe(9);
      expect(Number(v.robPerYear)).toBe(275);
      expect(Number(v.otherCostsPerYear)).toBe(350);
      expect(Number(v.insurancePerMonth)).toBe(97.8);
      expect(Number(v.roadTaxPerMonth)).toBe(34);
      expect(Number(v.marginPerMonth)).toBe(0);
      expect(Number(v.excessKmPrice)).toBe(0.085);
      expect(Number(v.shortfallKmPrice)).toBe(0.04);
    }
    // A variant that already has a cost of its own is not touched.
    const kept = await variantOf(own.id);
    expect(Number(kept.interestRatePercent)).toBe(5);
    expect(kept.robPerYear).toBeNull();

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();

    // Second boot: the marker stops it; a variant added afterwards without costs stays empty.
    const late = await addVariant(quote.id, 3);
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already backfilled/);
    expect((await variantOf(late.id)).interestRatePercent).toBeNull();

    // Marker removed on purpose: the SQL itself is idempotent (fills the late row, changes nothing else).
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    runStartupMigration();
    expect(Number((await variantOf(late.id)).interestRatePercent)).toBe(9);
    expect(Number((await variantOf(bare1.id)).interestRatePercent)).toBe(9);
    expect(Number((await variantOf(own.id)).interestRatePercent)).toBe(5);
  }, 180_000);
});

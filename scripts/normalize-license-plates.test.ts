/**
 * besluiten.md **B-10** (BUG-020) — the migration script.
 *
 * The owner's order is the thing under test: measure first, stop on a
 * collision, and only then normalise and add the unique index. A script that
 * merged two vehicle records by itself, or that forced the index past a
 * collision, would be exactly the failure the decision guards against.
 *
 * Runs against `lvs_fixtest` like every other server test; it writes only
 * fixture rows and drops the index again so a second run starts clean.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { vehicles } from "../shared/schema";
import {
  findPlateCollisions, normalizeLicensePlates, PLATE_UNIQUE_INDEX,
} from "./normalize-license-plates";
import { cleanupFixtures } from "../server/__tests__/helpers/fixtures";

async function dropIndex(): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS ${sql.raw(PLATE_UNIQUE_INDEX)}`);
}

async function indexExists(): Promise<boolean> {
  const result: any = await db.execute(
    sql`SELECT 1 FROM pg_indexes WHERE indexname = ${PLATE_UNIQUE_INDEX}`,
  );
  return ((result.rows ?? result) as unknown[]).length > 0;
}

/** A plate that no other fixture or real row can share. */
let plateCounter = 0;
function uniquePlate(): string {
  plateCounter += 1;
  return `FIXT${Date.now().toString(36).toUpperCase()}${plateCounter}`;
}

async function insertVehicle(licensePlate: string): Promise<number> {
  const [row] = await db.insert(vehicles).values({
    licensePlate, brand: "FIXT-Brand", model: "Model",
  }).returning({ id: vehicles.id });
  return row.id;
}

beforeEach(async () => {
  await dropIndex();
});

afterEach(async () => {
  await dropIndex();
  await cleanupFixtures();
});

describe("B-10 — measuring before touching anything", () => {
  it("a dry run writes nothing and adds no index", async () => {
    const base = uniquePlate();
    const id = await insertVehicle(`${base.slice(0, 4)}-${base.slice(4)}`);

    const result = await normalizeLicensePlates();
    expect(result.dryRun).toBe(true);
    expect(result.normalised).toBe(0);
    expect(result.indexCreated).toBe(false);
    expect(result.candidates).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    expect(row.licensePlate).toContain("-");
    expect(await indexExists()).toBe(false);
  });

  it("reports the vehicles that fall together, and refuses to pick a winner", async () => {
    const base = uniquePlate();
    const a = await insertVehicle(`${base.slice(0, 4)}-${base.slice(4)}`);
    const b = await insertVehicle(base.toLowerCase());

    const collisions = await findPlateCollisions();
    const ours = collisions.find((c) => c.normalised === base.toUpperCase());
    expect(ours).toBeDefined();
    expect(ours!.vehicles.map((v) => v.id).sort()).toEqual([a, b].sort());

    // Step 2 of the owner's order: stop, report, change nothing.
    const result = await normalizeLicensePlates({ dryRun: false });
    expect(result.collisions.length).toBeGreaterThanOrEqual(1);
    expect(result.normalised).toBe(0);
    expect(result.indexCreated).toBe(false);
    expect(await indexExists()).toBe(false);

    // Both rows are untouched — merging them is a decision nobody has taken.
    const rows = await db.select().from(vehicles).where(sql`${vehicles.id} in (${a}, ${b})`);
    expect(rows.length).toBe(2);
    expect(rows.some((r) => r.licensePlate.includes("-"))).toBe(true);
  });
});

describe("B-10 — the clean-up and the hard rule", () => {
  it("normalises the stored plates and adds the unique index", async () => {
    const base = uniquePlate();
    const id = await insertVehicle(`${base.slice(0, 4)}-${base.slice(4)}`);

    const result = await normalizeLicensePlates({ dryRun: false });
    expect(result.collisions).toEqual([]);
    expect(result.normalised).toBeGreaterThanOrEqual(1);
    expect(result.indexCreated).toBe(true);

    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    expect(row.licensePlate).toBe(base.toUpperCase());
    expect(await indexExists()).toBe(true);
  });

  it("the index is what finally stops the duplicate the audit created (BUG-020)", async () => {
    const base = uniquePlate();
    await insertVehicle(base);
    await normalizeLicensePlates({ dryRun: false });
    expect(await indexExists()).toBe(true);

    // "AU-001-X" versus "au001x" — three rows for one physical car was the bug.
    await expect(
      insertVehicle(`${base.slice(0, 4)}-${base.slice(4)}`.toLowerCase()),
    ).rejects.toThrow();
  });

  it("is safe to run twice", async () => {
    await insertVehicle(uniquePlate());
    await normalizeLicensePlates({ dryRun: false });
    const second = await normalizeLicensePlates({ dryRun: false });
    expect(second.indexCreated).toBe(true);
    expect(await indexExists()).toBe(true);
  });
});

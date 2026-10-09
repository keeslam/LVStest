/**
 * Sub-project C, task 6 (besluit B-36, approval B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §4, §7):
 * one recycle bin per kind, each screen its own.
 *
 *  - a deleted maintenance block lands in `deleted_records` as
 *    `maintenance_block` with the label "Onderhoud #id — plate start", and the
 *    restore dispatcher treats it like a reservation;
 *  - `GET /api/deleted-records?type=<kind>` filters on the server (cap 200 per
 *    kind, newest first, restored rows included, no payload); without `type` it
 *    answers as before;
 *  - a hand-written, idempotent step in startup-migration.js relabels the
 *    maintenance-block rows that were written as `reservation` before this
 *    change (marker `migration:c_bin_maintenance_label`) and never aborts.
 *
 * The startup step lives in startup-migration.js, which runs itself on import
 * and exports nothing, so the real thing is exercised the way production runs
 * it: `node startup-migration.js` as a child process against lvs_fixtest.
 * (c-01-rights.test.ts is NOT run by this task; this file keeps the manager
 * grant marker in place while the child runs, so the grant step cannot widen
 * the rights of an account another test is using.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import {
  appSettings, auditLogs, deletedRecords, reservations, DELETED_RECORD_KINDS,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PREFIX,
} from "./helpers/fixtures";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const RELABEL_MARKER = "migration:c_bin_maintenance_label";
const MANAGER_MARKER = "migration:c_manager_rights";

/** Far-future dates: never a dependency on today or on the weekday. */
const START = "2030-06-03";
const END = "2030-06-07";

/** Labels of every row this file inserts directly start with this. */
const ROW_PREFIX = `${FIXTURE_PREFIX}C06-`;

let admin: TestAgent;
let binKeeper: TestAgent;
let reservationsOnly: TestAgent;
let customerId: number;
const createdRecordIds: number[] = [];

async function binEntryFor(entityType: string, entityId: number) {
  const [record] = await db.select().from(deletedRecords)
    .where(and(eq(deletedRecords.entityType, entityType), eq(deletedRecords.entityId, entityId)));
  if (record) createdRecordIds.push(record.id);
  return record;
}

async function insertBinRow(over: Partial<typeof deletedRecords.$inferInsert> & { entityType: string }) {
  const [row] = await db.insert(deletedRecords).values({
    entityId: 990000 + createdRecordIds.length,
    label: `${ROW_PREFIX}${over.entityType}`,
    payload: {},
    relatedCounts: {},
    ...over,
  }).returning();
  createdRecordIds.push(row.id);
  return row;
}

beforeAll(async () => {
  admin = await agentFor("admin");
  binKeeper = await agentFor(["manage_recycle_bin"]);
  reservationsOnly = await agentFor(["manage_reservations", "view_reservations", "manage_vehicles", "manage_customers"]);
  customerId = (await createFixtureCustomer("C06")).id;
}, 90_000);

afterAll(async () => {
  if (createdRecordIds.length) {
    await db.delete(deletedRecords).where(inArray(deletedRecords.id, createdRecordIds));
  }
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${ROW_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("C-06 - a deleted maintenance block is its own kind in the bin", () => {
  it("lands as maintenance_block with the Onderhoud label; a rental stays a reservation", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: START, endDate: END, type: "maintenance_block",
    });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2030-07-01", endDate: "2030-07-03",
    });

    expect((await admin.delete(`/api/reservations/${block.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);

    const blockRecord = await binEntryFor("maintenance_block", block.id);
    expect(blockRecord).toBeDefined();
    expect(blockRecord.label).toBe(`Onderhoud #${block.id} — ${vehicle.licensePlate} ${START}`);
    // The snapshot is still the whole row: the restore reads it.
    expect((blockRecord.payload as any).reservation.type).toBe("maintenance_block");

    // No second row of the old kind for the same block.
    const asReservation = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "reservation"), eq(deletedRecords.entityId, block.id)));
    expect(asReservation).toHaveLength(0);

    const rentalRecord = await binEntryFor("reservation", rental.id);
    expect(rentalRecord).toBeDefined();
    expect(rentalRecord.label).toBe(`Reservering #${rental.id} — ${vehicle.licensePlate} 2030-07-01`);
  });

  it("restores through the same route as a reservation: row back, audit row maintenance_block.restore", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: START, endDate: END, type: "maintenance_block",
    });
    expect((await admin.delete(`/api/reservations/${block.id}`)).status).toBe(200);
    const record = await binEntryFor("maintenance_block", block.id);

    const restored = await binKeeper.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);

    const [back] = await db.select().from(reservations).where(eq(reservations.id, block.id));
    expect(back.deletedAt).toBeNull();
    expect(back.type).toBe("maintenance_block");
    const [after] = await db.select().from(deletedRecords).where(eq(deletedRecords.id, record.id));
    expect(after.restoredAt).not.toBeNull();

    const audit = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "maintenance_block.restore"), eq(auditLogs.resourceId, String(block.id))));
    expect(audit).toHaveLength(1);

    // Twice is a clean 409, like every other kind.
    const again = await binKeeper.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_RESTORED");
  });

  it("a block comes back even where a rental now sits: blocks may overlap rentals, that is what the workshop warning is for", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: "2030-08-05", endDate: "2030-08-09", type: "maintenance_block",
    });
    expect((await admin.delete(`/api/reservations/${block.id}`)).status).toBe(200);
    const record = await binEntryFor("maintenance_block", block.id);
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2030-08-06", endDate: "2030-08-08",
    });

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);
    const [back] = await db.select().from(reservations).where(eq(reservations.id, block.id));
    expect(back.deletedAt).toBeNull();
  });
});

describe("C-06 - GET /api/deleted-records?type=<kind>", () => {
  it("knows exactly the six kinds the spec names", () => {
    expect([...DELETED_RECORD_KINDS]).toEqual([
      "vehicle", "customer", "reservation", "maintenance_block", "transport", "fine",
    ]);
  });

  it("filters on the server: each kind answers only its own rows", async () => {
    const rows: Record<string, number> = {};
    for (const kind of DELETED_RECORD_KINDS) {
      rows[kind] = (await insertBinRow({ entityType: kind, label: `${ROW_PREFIX}only-${kind}` })).id;
    }

    for (const kind of DELETED_RECORD_KINDS) {
      const res = await binKeeper.get(`/api/deleted-records?type=${kind}`);
      expect(res.status).toBe(200);
      const types = new Set(res.body.map((r: any) => r.entityType));
      expect([...types].every((t) => t === kind)).toBe(true);
      const mine = res.body.filter((r: any) => String(r.label).startsWith(`${ROW_PREFIX}only-`));
      expect(mine.map((r: any) => r.id)).toEqual([rows[kind]]);
    }
  });

  it("keeps the payload out of the list, restored rows in it, newest first", async () => {
    const older = await insertBinRow({
      entityType: "customer", label: `${ROW_PREFIX}order-older`,
      deletedAt: new Date("2031-01-01T10:00:00Z"), payload: { big: "x".repeat(50) },
    });
    const newer = await insertBinRow({
      entityType: "customer", label: `${ROW_PREFIX}order-newer`,
      deletedAt: new Date("2031-01-02T10:00:00Z"), restoredAt: new Date("2031-01-03T10:00:00Z"), restoredBy: "kees",
    });

    const res = await binKeeper.get("/api/deleted-records?type=customer");
    expect(res.status).toBe(200);
    const ids = res.body.map((r: any) => r.id);
    expect(ids.indexOf(newer.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    const restoredEntry = res.body.find((r: any) => r.id === newer.id);
    expect(restoredEntry.restoredAt).not.toBeNull();
    expect(restoredEntry.restoredBy).toBe("kees");
    expect(res.body.every((r: any) => !("payload" in r))).toBe(true);
    const deletedAts = res.body.map((r: any) => new Date(r.deletedAt).getTime());
    expect(deletedAts).toEqual([...deletedAts].sort((a, b) => b - a));
  });

  it("caps a kind at 200 rows, newest first", async () => {
    const base = new Date("2032-01-01T00:00:00Z").getTime();
    const values = Array.from({ length: 205 }, (_, i) => ({
      entityType: "transport", entityId: 980000 + i, label: `${ROW_PREFIX}cap-${i}`,
      payload: {}, relatedCounts: {}, deletedAt: new Date(base + i * 1000),
    }));
    await db.insert(deletedRecords).values(values);

    const res = await binKeeper.get("/api/deleted-records?type=transport");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(200);
    // The 5 oldest of my 205 fall off; the newest comes first.
    expect(res.body[0].label).toBe(`${ROW_PREFIX}cap-204`);
    expect(res.body[199].label).toBe(`${ROW_PREFIX}cap-5`);
  });

  it("without type it answers as before: every kind, at most 100", async () => {
    await insertBinRow({ entityType: "vehicle", label: `${ROW_PREFIX}mixed-v`, deletedAt: new Date("2033-01-02T00:00:00Z") });
    await insertBinRow({ entityType: "fine", label: `${ROW_PREFIX}mixed-f`, deletedAt: new Date("2033-01-01T00:00:00Z") });

    const res = await binKeeper.get("/api/deleted-records");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(100);
    const labels = res.body.map((r: any) => r.label);
    expect(labels).toContain(`${ROW_PREFIX}mixed-v`);
    expect(labels).toContain(`${ROW_PREFIX}mixed-f`);
  });

  it("a kind the bin does not know is a 400 with a code, not an empty list", async () => {
    const res = await binKeeper.get("/api/deleted-records?type=document");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_BIN_KIND");
  });

  it("a manage_recycle_bin account lists every kind; manage_reservations alone gets 403", async () => {
    const allowed = await binKeeper.get("/api/deleted-records?type=maintenance_block");
    expect(allowed.status).toBe(200);
    const refused = await reservationsOnly.get("/api/deleted-records?type=maintenance_block");
    expect(refused.status).toBe(403);
    expect(refused.body.message).toContain("manage_recycle_bin");
    expect((await admin.get("/api/deleted-records?type=fine")).status).toBe(200);
  });
});

describe("C-06 - startup-migration.js: relabel old maintenance-block rows (marker migration:c_bin_maintenance_label)", () => {
  let guarded = false;
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};

  function runStartupMigration(): string {
    // The child gets this run's environment, so it can only touch the database
    // this test is allowed to touch. TIMESTAMPTZ_MIGRATION is blanked on purpose.
    return execFileSync(process.execPath, [STARTUP_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    for (const key of [RELABEL_MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager grant out of this run: the child would otherwise add the
    // three C rights to every manager row, including the accounts above.
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "c-06 placeholder", granted: 0 }, category: "general",
      description: "c-06 placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(eq(appSettings.key, RELABEL_MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    for (const key of [RELABEL_MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  const oldBlock = (id: number, extra: Record<string, unknown> = {}) => ({
    entityType: "reservation",
    entityId: id,
    label: `Reservering #${id} — ${ROW_PREFIX}PLATE 2030-09-01`,
    payload: { reservation: { id, type: "maintenance_block", startDate: "2030-09-01" } },
    ...extra,
  });

  it("relabels old block rows, leaves everything else alone, and runs once", async () => {
    const block = await insertBinRow(oldBlock(970001));
    const restoredBlock = await insertBinRow(oldBlock(970002, { restoredAt: new Date("2031-05-05T00:00:00Z"), restoredBy: "kees" }));
    const rental = await insertBinRow({
      entityType: "reservation", entityId: 970003, label: `Reservering #970003 — ${ROW_PREFIX}PLATE 2030-09-02`,
      payload: { reservation: { id: 970003, type: "standard" } },
    });
    const noType = await insertBinRow({
      entityType: "reservation", entityId: 970004, label: `${ROW_PREFIX}no-type`, payload: { reservation: { id: 970004 } },
    });
    const emptyPayload = await insertBinRow({
      entityType: "reservation", entityId: 970005, label: `${ROW_PREFIX}empty-payload`, payload: {},
    });
    const scalarPayload = await insertBinRow({
      entityType: "reservation", entityId: 970006, label: `${ROW_PREFIX}scalar-payload`, payload: [] as any,
    });
    const vehicleRow = await insertBinRow({
      entityType: "vehicle", entityId: 970007, label: `${ROW_PREFIX}vehicle`,
      payload: { reservation: { type: "maintenance_block" } },
    });
    const unusualLabel = await insertBinRow(oldBlock(970008, { label: `${ROW_PREFIX}hand-edited-label` }));

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/maintenance-block bin rows/i);

    const row = async (id: number) => (await db.select().from(deletedRecords).where(eq(deletedRecords.id, id)))[0];
    expect(await row(block.id)).toMatchObject({
      entityType: "maintenance_block", label: `Onderhoud #970001 — ${ROW_PREFIX}PLATE 2030-09-01`,
    });
    expect(await row(restoredBlock.id)).toMatchObject({
      entityType: "maintenance_block", label: `Onderhoud #970002 — ${ROW_PREFIX}PLATE 2030-09-01`, restoredBy: "kees",
    });
    expect(await row(rental.id)).toMatchObject({ entityType: "reservation", label: rental.label });
    expect(await row(noType.id)).toMatchObject({ entityType: "reservation", label: noType.label });
    expect(await row(emptyPayload.id)).toMatchObject({ entityType: "reservation", label: emptyPayload.label });
    expect(await row(scalarPayload.id)).toMatchObject({ entityType: "reservation", label: scalarPayload.label });
    expect(await row(vehicleRow.id)).toMatchObject({ entityType: "vehicle", label: vehicleRow.label });
    // A block row whose label is not the old "Reservering #…" form keeps its label.
    expect(await row(unusualLabel.id)).toMatchObject({ entityType: "maintenance_block", label: unusualLabel.label });

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, RELABEL_MARKER));
    expect(marker).toBeDefined();
    expect((marker.value as any).relabeled).toBeGreaterThanOrEqual(3);

    // Second boot: the marker stops it. A new old-style row is NOT touched.
    const late = await insertBinRow(oldBlock(970009));
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already relabeled|already done|skipping/i);
    expect(await row(late.id)).toMatchObject({ entityType: "reservation", label: late.label });
    expect((await row(block.id)).label).toBe(`Onderhoud #970001 — ${ROW_PREFIX}PLATE 2030-09-01`);

    // Marker removed on purpose: the SQL itself is idempotent too (picks up the
    // late row, never prefixes a relabeled label a second time).
    await db.delete(appSettings).where(eq(appSettings.key, RELABEL_MARKER));
    const third = runStartupMigration();
    expect(third).toContain("Database migration completed successfully");
    expect(await row(late.id)).toMatchObject({
      entityType: "maintenance_block", label: `Onderhoud #970009 — ${ROW_PREFIX}PLATE 2030-09-01`,
    });
    expect((await row(block.id)).label).toBe(`Onderhoud #970001 — ${ROW_PREFIX}PLATE 2030-09-01`);
  }, 120_000);
});

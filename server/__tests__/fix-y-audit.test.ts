/**
 * FIX-Y — audit-log correctness.
 *
 *   BUG-147 — every vehicle deletion wrote two `vehicle.delete` rows (the route
 *             logs richer details, the middleware logs again), and a restore was
 *             recorded as `vehicle.update` because the action union had no word
 *             for it.
 *   BUG-152 — every reservation sub-action was recorded as `reservation.create`,
 *             with the real operation buried in `details`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, deletedRecords, vehicles as vehiclesTable, vehicleTransports } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Audit")).id;
});

afterAll(async () => {
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PLATE_PREFIX}%`));
  const fixtureVehicles = await db.select({ id: vehiclesTable.id }).from(vehiclesTable)
    .where(like(vehiclesTable.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
  for (const v of fixtureVehicles) {
    await db.delete(vehicleTransports).where(eq(vehicleTransports.vehicleId, v.id));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

async function actionsFor(resourceType: string, resourceId: number): Promise<string[]> {
  const rows = await db.select({ action: auditLogs.action }).from(auditLogs).where(and(
    eq(auditLogs.resourceType, resourceType),
    eq(auditLogs.resourceId, String(resourceId)),
  ));
  return rows.map((r) => r.action);
}

/**
 * The middleware writes its row from the response finish event, so it lands
 * just after the response. Poll rather than sleep a fixed amount.
 */
async function waitForAction(resourceType: string, resourceId: number, action: string): Promise<string[]> {
  for (let i = 0; i < 40; i += 1) {
    const actions = await actionsFor(resourceType, resourceId);
    if (actions.includes(action)) return actions;
    await new Promise((r) => setTimeout(r, 50));
  }
  return actionsFor(resourceType, resourceId);
}

async function countAction(resourceType: string, resourceId: number, action: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(and(
    eq(auditLogs.resourceType, resourceType),
    eq(auditLogs.resourceId, String(resourceId)),
    eq(auditLogs.action, action),
  ));
  return row.n;
}

describe("FIX-Y — vehicle delete and restore (BUG-147)", () => {
  it("writes exactly one vehicle.delete row, and a restore of its own", async () => {
    const vehicle = await createFixtureVehicle();

    const deleted = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });
    expect(deleted.status).toBe(200);

    expect(await countAction("vehicle", vehicle.id, "vehicle.delete")).toBe(1);

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)));
    expect((await admin.post(`/api/deleted-records/${record.id}/restore`).send({})).status).toBe(200);

    expect(await countAction("vehicle", vehicle.id, "vehicle.restore")).toBe(1);
    // …and the restore is not filed as an ordinary edit any more.
    const actions = await actionsFor("vehicle", vehicle.id);
    expect(actions.filter((a) => a === "vehicle.update")).toHaveLength(0);
  });

  it("still logs an ordinary vehicle edit", async () => {
    const vehicle = await createFixtureVehicle();
    expect((await admin.patch(`/api/vehicles/${vehicle.id}`).send({ model: "FIXT-Gewijzigd" })).status).toBe(200);
    await waitForAction("vehicle", vehicle.id, "vehicle.update");
    expect(await countAction("vehicle", vehicle.id, "vehicle.update")).toBeGreaterThanOrEqual(1);
  });
});

describe("FIX-Y — reservation sub-actions (BUG-152)", () => {
  it("records a pickup as reservation.pickup, not reservation.create", async () => {
    const vehicle = await createFixtureVehicle();
    const reservation = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(0), endDate: day(3),
    });

    expect((await admin.post(`/api/reservations/${reservation.id}/pickup`).send({
      contractNumber: `FIXT-Y-${Date.now()}`, pickupMileage: 1000, fuelLevelPickup: "full",
    })).status).toBe(200);

    const actions = await waitForAction("reservation", reservation.id, "reservation.pickup");
    expect(actions).toContain("reservation.pickup");
    expect(actions).not.toContain("reservation.create");
  });

  it("records a status change as reservation.status", async () => {
    const vehicle = await createFixtureVehicle();
    const reservation = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(5), endDate: day(8),
    });

    expect((await admin.patch(`/api/reservations/${reservation.id}/status`).send({ status: "cancelled" })).status).toBe(200);

    expect(await waitForAction("reservation", reservation.id, "reservation.status")).toContain("reservation.status");
  });
});

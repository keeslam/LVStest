/**
 * besluiten.md **B-14** — "Voertuig verwijderen met lopende of geplande huur:
 * weigeren zolang er een huur loopt of gepland staat, met een impactlijst
 * vooraf; daarna gaat het voertuig naar de prullenbak. Dezelfde regel als voor
 * klanten (B-08)." (BUG-022)
 *
 * BUG-022 was CRITICAL-adjacent: deleting a vehicle hard-deleted the
 * reservations of *every* customer on it, without asking and without a way
 * back. The recycle bin half landed in wave 5; what was missing is the refusal.
 *
 * The shape is deliberately the customer shape of B-08:
 *   GET  /api/vehicles/:id/delete-impact  -> `blocked` + `blockingReservations`
 *   DELETE /api/vehicles/:id              -> 409 + a machine-readable `code`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable, deletedRecords } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PLATE_PREFIX, FIXTURE_PREFIX, vehicleExists,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("B14")).id;
});

afterAll(async () => {
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PLATE_PREFIX}%`));
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Fixed far-future / far-past days: never a dependency on today's weekday. */
const FUTURE_START = "2029-07-01";
const FUTURE_END = "2029-07-10";
const PAST_START = "2019-07-01";
const PAST_END = "2019-07-10";

describe("B-14 — a vehicle with a live or planned rental (BUG-022)", () => {
  it("delete-impact says it is blocked and names the reservation", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: FUTURE_START, endDate: FUTURE_END,
    });

    const impact = await admin.get(`/api/vehicles/${vehicle.id}/delete-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body.blocked).toBe(true);
    expect(impact.body.blockingReservations.map((r: any) => r.id)).toContain(rental.id);
    // The impact list staff already had must survive.
    expect(impact.body.counts.reservations).toBeGreaterThanOrEqual(1);
  });

  it("the delete is refused with a machine-readable code, and nothing is lost", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: FUTURE_START, endDate: FUTURE_END,
    });

    const res = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VEHICLE_HAS_LIVE_RESERVATIONS");
    expect(res.body.blockingReservations.map((r: any) => r.id)).toContain(rental.id);

    // The vehicle and — the point of BUG-022 — the customer's booking are both
    // still there, and no recycle-bin row was written.
    expect(await vehicleExists(vehicle.id)).toBe(true);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row).toBeDefined();
    const bin = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)));
    expect(bin.length).toBe(0);
  });

  it("a picked-up rental blocks the delete even when its dates are in the past", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: PAST_START, endDate: PAST_END,
      status: "picked_up",
    });

    const res = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VEHICLE_HAS_LIVE_RESERVATIONS");
  });

  it("an open maintenance block blocks the delete too — the car is spoken for", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: FUTURE_START, endDate: FUTURE_END,
      type: "maintenance_block",
    });

    const res = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VEHICLE_HAS_LIVE_RESERVATIONS");
  });
});

describe("B-14 — a vehicle nothing is booked on", () => {
  it("goes to the recycle bin and comes back", async () => {
    const vehicle = await createFixtureVehicle();
    // History only: finished, and long over.
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: PAST_START, endDate: PAST_END,
      status: "completed",
    });

    const impact = await admin.get(`/api/vehicles/${vehicle.id}/delete-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body.blocked).toBe(false);
    expect(impact.body.blockingReservations).toEqual([]);

    const res = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });
    expect(res.status).toBe(200);
    expect(await vehicleExists(vehicle.id)).toBe(false);

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)));
    expect(record).toBeDefined();

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);
    const [back] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));
    expect(back).toBeDefined();
  });

  it("still refuses without the typed-back license plate", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: "FOUT" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CONFIRMATION_REQUIRED");
    expect(await vehicleExists(vehicle.id)).toBe(true);
  });
});

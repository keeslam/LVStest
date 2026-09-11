/**
 * FIX-F — one bookability predicate, checked inside the write transaction.
 *
 * The audit found five disjoint answers to "is this vehicle free in this
 * period" (CQ-006). This file pins the single predicate down as a truth table
 * and then asserts that every *writer* gives the same answer as the read-only
 * check-conflicts endpoint does.
 *
 * Deterministic bugs covered here:
 *   BUG-107 — a one-day booking inside an existing rental was accepted through
 *             the same-day-turnover exception.
 *   BUG-106 — a partial PATCH (the calendar drag sends only `vehicleId`) walked
 *             past the conflict check.
 *   BUG-018 — a `not_for_rental` vehicle stayed bookable through the API
 *             (besluiten.md B-01: "beschikbaar" = free in the period AND status ok).
 *   BUG-121 — `maintenance-with-spare` never checked the assignments in one
 *             payload against each other, so one spare went to two customers.
 *
 * The races (BUG-006, BUG-159, BUG-160, BUG-173) live in
 * `fix-f-conflicts-concurrency.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { storage } from "../storage";

let staff: TestAgent;
let customerId: number;
let otherCustomerId: number;

beforeAll(async () => {
  staff = await agentFor("admin");
  customerId = (await createFixtureCustomer("Boeker")).id;
  otherCustomerId = (await createFixtureCustomer("Tweede")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 300);
}

async function rowsOn(vehicleId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reservations)
    .where(eq(reservations.vehicleId, vehicleId));
  return row.n;
}

describe("FIX-F — the predicate", () => {
  it("refuses a one-day booking that sits inside an existing rental (BUG-107)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-02-02", endDate: "2028-02-05",
    });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-02-02", endDate: "2028-02-02",
    });

    expect(verdict.bookable).toBe(false);
    expect(verdict.reason).toBe("CONFLICT");
    expect(verdict.conflicts.length).toBe(1);
  });

  it("still allows a genuine same-day turnover (BUG-107 must not over-correct)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-03-01", endDate: "2028-03-04",
    });

    // The existing rental comes back on the 4th, the next one starts that
    // afternoon: a normal handover, not a double booking.
    const turnover = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-03-04", endDate: "2028-03-07",
    });
    expect(turnover.bookable).toBe(true);

    // And the one-day version of the same handover on the last day.
    const oneDayTurnover = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-03-04", endDate: "2028-03-04",
    });
    expect(oneDayTurnover.bookable).toBe(true);
  });

  it("refuses two identical one-day ranges (BUG-107)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-04-03", endDate: "2028-04-03",
    });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-04-03", endDate: "2028-04-03",
    });
    expect(verdict.bookable).toBe(false);
    expect(verdict.reason).toBe("CONFLICT");
  });

  it("refuses a plain multi-day overlap and accepts a free period", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-05-10", endDate: "2028-05-20",
    });

    expect((await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-05-15", endDate: "2028-05-25",
    })).bookable).toBe(false);

    expect((await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-06-01", endDate: "2028-06-03",
    })).bookable).toBe(true);
  });

  it("excludes the reservation being edited from its own check", async () => {
    const vehicle = await createFixtureVehicle();
    const existing = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-07-01", endDate: "2028-07-05",
    });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-07-02", endDate: "2028-07-06",
      excludeReservationId: existing.id,
    });
    expect(verdict.bookable).toBe(true);
  });

  it("refuses a not_for_rental vehicle, and says why (BUG-018 / besluiten B-01)", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "not_for_rental" });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-08-01", endDate: "2028-08-03",
    });
    expect(verdict.bookable).toBe(false);
    expect(verdict.reason).toBe("NOT_FOR_RENTAL");
    expect(verdict.conflicts).toEqual([]);
  });

  it("still lets the workshop schedule maintenance on a not_for_rental vehicle", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "not_for_rental" });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-08-01", endDate: "2028-08-03",
      isMaintenanceBlock: true,
    });
    expect(verdict.bookable).toBe(true);
  });

  it("refuses a vehicle that is not there any more — the recycle bin (besluiten B-01)", async () => {
    const vehicle = await createFixtureVehicle();
    await db.delete(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-09-01", endDate: "2028-09-03",
    });
    expect(verdict.bookable).toBe(false);
    expect(verdict.reason).toBe("VEHICLE_NOT_FOUND");
  });

  it("reports an overlapping maintenance block without blocking the rental (BUG-013 is still open)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: "2028-10-01", endDate: "2028-10-10",
      type: "maintenance_block",
    });

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id, startDate: "2028-10-02", endDate: "2028-10-04",
    });
    // OPT-023 (hard block or soft warning) is NOT decided in besluiten.md, so
    // the rental is still accepted — but the predicate now *sees* the block and
    // hands it to the caller, which is what the availability screen needs.
    expect(verdict.bookable).toBe(true);
    expect(verdict.maintenanceBlocks.length).toBe(1);
  });

  it("checkReservationConflicts keeps its old shape and now shares the predicate", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2028-11-02", endDate: "2028-11-05",
    });

    const conflicts = await storage.checkReservationConflicts(
      vehicle.id, "2028-11-02", "2028-11-02", null,
    );
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].vehicle?.id).toBe(vehicle.id);
  });
});

describe("FIX-F — the writers give the same answer as the predicate", () => {
  it("POST /api/reservations refuses the one-day booking inside a rental (BUG-107)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2029-02-02", endDate: "2029-02-05",
    });

    const res = await staff.post("/api/reservations").send({
      vehicleId: vehicle.id, customerId: otherCustomerId,
      startDate: "2029-02-02", endDate: "2029-02-02",
      status: "booked", type: "standard",
    });

    expect(res.status, bodyText(res.body)).toBe(409);
    expect(await rowsOn(vehicle.id)).toBe(1);
  });

  it("POST /api/reservations still accepts the turnover day", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2029-03-01", endDate: "2029-03-04",
    });

    const res = await staff.post("/api/reservations").send({
      vehicleId: vehicle.id, customerId: otherCustomerId,
      startDate: "2029-03-04", endDate: "2029-03-08",
      status: "booked", type: "standard",
    });

    expect(res.status, bodyText(res.body)).toBe(201);
    expect(await rowsOn(vehicle.id)).toBe(2);
  });

  it("POST /api/reservations refuses a not_for_rental vehicle (BUG-018)", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "not_for_rental" });

    const res = await staff.post("/api/reservations").send({
      vehicleId: vehicle.id, customerId,
      startDate: "2029-04-01", endDate: "2029-04-03",
      status: "booked", type: "standard",
    });

    expect(res.status, bodyText(res.body)).toBe(409);
    expect(await rowsOn(vehicle.id)).toBe(0);
  });

  it("PATCH /api/reservations/:id with ONLY vehicleId is refused — the calendar drag (BUG-106)", async () => {
    const occupied = await createFixtureVehicle();
    const free = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: occupied.id, startDate: "2029-05-01", endDate: "2029-05-10",
    });
    const dragged = await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: free.id, startDate: "2029-05-03", endDate: "2029-05-06",
    });

    // Exactly the body client/src/pages/reservations/calendar.tsx sends.
    const res = await staff.patch(`/api/reservations/${dragged.id}`).send({ vehicleId: occupied.id });

    expect(res.status, bodyText(res.body)).toBe(409);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, dragged.id));
    expect(row.vehicleId).toBe(free.id);
  });

  it("PATCH /api/reservations/:id/basic with ONLY a new endDate is refused (BUG-106)", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2029-06-01", endDate: "2029-06-05",
    });
    await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: vehicle.id, startDate: "2029-06-10", endDate: "2029-06-13",
    });

    const res = await staff.patch(`/api/reservations/${first.id}/basic`).send({ endDate: "2029-06-11" });

    expect(res.status, bodyText(res.body)).toBe(409);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, first.id));
    expect(row.endDate).toBe("2029-06-05");
  });

  it("assign-spare refuses a spare that is already booked in that period", async () => {
    const original = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: original.id, startDate: "2029-07-01", endDate: "2029-07-10",
    });
    await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: spare.id, startDate: "2029-07-01", endDate: "2029-07-10",
    });

    const res = await staff.post(`/api/reservations/${rental.id}/assign-spare`).send({
      spareVehicleId: spare.id, startDate: "2029-07-02", endDate: "2029-07-05",
    });

    expect(res.status, bodyText(res.body)).toBe(409);
    expect(await rowsOn(spare.id)).toBe(1);
  });

  it("maintenance-with-spare refuses one spare for two customers in one payload, and writes nothing (BUG-121)", async () => {
    const underMaintenance = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rentalA = await createFixtureReservation({
      customerId, vehicleId: underMaintenance.id, startDate: "2029-08-01", endDate: "2029-08-10",
    });
    const rentalB = await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: underMaintenance.id, startDate: "2029-08-01", endDate: "2029-08-10",
      status: "booked",
    });

    const res = await staff.post("/api/reservations/maintenance-with-spare").send({
      maintenanceData: {
        vehicleId: underMaintenance.id,
        customerId: null,
        startDate: "2029-08-02",
        endDate: "2029-08-06",
        type: "maintenance_block",
        status: "booked",
      },
      conflictingReservations: [rentalA.id, rentalB.id],
      spareVehicleAssignments: [
        { reservationId: rentalA.id, spareVehicleId: spare.id, startDate: "2029-08-02", endDate: "2029-08-06" },
        { reservationId: rentalB.id, spareVehicleId: spare.id, startDate: "2029-08-02", endDate: "2029-08-06" },
      ],
    });

    expect(res.status, bodyText(res.body)).toBe(409);
    // Nothing partial: no replacement on the spare, and no maintenance block either.
    expect(await rowsOn(spare.id)).toBe(0);
    const [blocks] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(
        eq(reservations.vehicleId, underMaintenance.id),
        eq(reservations.type, "maintenance_block"),
      ));
    expect(blocks.n).toBe(0);
  });

  it("maintenance-with-spare assigns two different spares in one payload", async () => {
    const underMaintenance = await createFixtureVehicle();
    const spareA = await createFixtureVehicle();
    const spareB = await createFixtureVehicle();
    const rentalA = await createFixtureReservation({
      customerId, vehicleId: underMaintenance.id, startDate: "2029-09-01", endDate: "2029-09-10",
    });
    const rentalB = await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: underMaintenance.id, startDate: "2029-09-01", endDate: "2029-09-10",
    });

    const res = await staff.post("/api/reservations/maintenance-with-spare").send({
      maintenanceData: {
        vehicleId: underMaintenance.id,
        customerId: null,
        startDate: "2029-09-02",
        endDate: "2029-09-06",
        type: "maintenance_block",
        status: "booked",
      },
      conflictingReservations: [rentalA.id, rentalB.id],
      spareVehicleAssignments: [
        { reservationId: rentalA.id, spareVehicleId: spareA.id, startDate: "2029-09-02", endDate: "2029-09-06" },
        { reservationId: rentalB.id, spareVehicleId: spareB.id, startDate: "2029-09-02", endDate: "2029-09-06" },
      ],
    });

    expect(res.status, bodyText(res.body)).toBe(201);
    expect(await rowsOn(spareA.id)).toBe(1);
    expect(await rowsOn(spareB.id)).toBe(1);
  });
});

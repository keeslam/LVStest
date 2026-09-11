/**
 * FIX-F — the races. Every one of these is "check, then act" with the check
 * outside the write's transaction: two requests both read "free" and both
 * write. The fix is one predicate, run inside the same transaction as the
 * insert/update, behind an advisory lock on the vehicle.
 *
 *   BUG-006 — 20 parallel POST /api/reservations → 19 overlapping rows.
 *   BUG-159 — two parallel edits move two reservations onto the same vehicle.
 *   BUG-160 — one spare allocated twice across assign-spare / transports.
 *   BUG-173 — a double-clicked maintenance-with-spare creates everything twice.
 *
 * Plan §8.10: build all promises first, `Promise.allSettled` once, assert on
 * `SELECT count(*)` — not only on the status codes — and assert **zero 5xx**.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { fireParallel, statusCounts, serverErrors, rejections } from "./helpers/parallel";

let staff: TestAgent;
let customerId: number;
let otherCustomerId: number;

beforeAll(async () => {
  staff = await agentFor("admin");
  customerId = (await createFixtureCustomer("Race")).id;
  otherCustomerId = (await createFixtureCustomer("RaceTwee")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function countOn(vehicleId: number, extra?: ReturnType<typeof eq>): Promise<number> {
  const where = extra ? and(eq(reservations.vehicleId, vehicleId), extra) : eq(reservations.vehicleId, vehicleId);
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(reservations).where(where);
  return row.n;
}

describe("FIX-F — concurrency", () => {
  it("20 parallel bookings for one vehicle and period leave exactly one row (BUG-006)", async () => {
    const vehicle = await createFixtureVehicle();

    const results = await fireParallel(20, () =>
      staff.post("/api/reservations").send({
        vehicleId: vehicle.id,
        customerId,
        startDate: "2030-01-10",
        endDate: "2030-01-20",
        status: "booked",
        type: "standard",
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[201] ?? 0).toBe(1);
    expect(counts[409] ?? 0).toBe(19);
    expect(await countOn(vehicle.id)).toBe(1);
  }, 60_000);

  it("two parallel edits cannot move two reservations onto the same free vehicle (BUG-159)", async () => {
    const target = await createFixtureVehicle();
    const homeA = await createFixtureVehicle();
    const homeB = await createFixtureVehicle();
    const a = await createFixtureReservation({
      customerId, vehicleId: homeA.id, startDate: "2030-02-01", endDate: "2030-02-05",
    });
    const b = await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: homeB.id, startDate: "2030-02-01", endDate: "2030-02-05",
    });

    const results = await fireParallel(2, (i) =>
      staff.patch(`/api/reservations/${i === 0 ? a.id : b.id}`).send({ vehicleId: target.id }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect(counts[409] ?? 0).toBe(1);
    expect(await countOn(target.id)).toBe(1);
  }, 30_000);

  it("two parallel assign-spare calls allocate the spare once (BUG-160)", async () => {
    const spare = await createFixtureVehicle();
    const originalA = await createFixtureVehicle();
    const originalB = await createFixtureVehicle();
    const rentalA = await createFixtureReservation({
      customerId, vehicleId: originalA.id, startDate: "2030-03-01", endDate: "2030-03-10",
    });
    const rentalB = await createFixtureReservation({
      customerId: otherCustomerId, vehicleId: originalB.id, startDate: "2030-03-01", endDate: "2030-03-10",
    });

    const results = await fireParallel(2, (i) =>
      staff.post(`/api/reservations/${i === 0 ? rentalA.id : rentalB.id}/assign-spare`).send({
        spareVehicleId: spare.id,
        startDate: "2030-03-02",
        endDate: "2030-03-08",
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect(counts[409] ?? 0).toBe(1);
    expect(await countOn(spare.id)).toBe(1);
  }, 30_000);

  it("a double-clicked maintenance-with-spare creates one block and one replacement (BUG-173)", async () => {
    const underMaintenance = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: underMaintenance.id, startDate: "2030-04-01", endDate: "2030-04-20",
    });

    const payload = {
      maintenanceData: {
        vehicleId: underMaintenance.id,
        customerId: null,
        startDate: "2030-04-05",
        endDate: "2030-04-09",
        type: "maintenance_block",
        status: "booked",
      },
      conflictingReservations: [rental.id],
      spareVehicleAssignments: [
        { reservationId: rental.id, spareVehicleId: spare.id, startDate: "2030-04-05", endDate: "2030-04-09" },
      ],
    };

    const results = await fireParallel(2, () =>
      staff.post("/api/reservations/maintenance-with-spare").send(payload),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    expect(await countOn(spare.id)).toBe(1);
    expect(await countOn(underMaintenance.id, eq(reservations.type, "maintenance_block"))).toBe(1);
  }, 30_000);
});

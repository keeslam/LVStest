/**
 * B-21 — the ~790 old, unclosed reservations, split three ways.
 *
 * The decision, literally:
 *   - the `booked` rows past their end date that were never picked up, and the
 *     rows carrying a legacy status (`active`, `scheduled`, `in`, …), are
 *     closed/cancelled automatically;
 *   - the `picked_up` rows are **never** closed automatically — they claim the
 *     car is still outside, so someone has to walk them. They go on a worklist.
 *
 * `scripts/close-returned-reservations.ts` closed 4 of 790 before this wave.
 *
 * Every date below is relative to a *fixed* reference day that the code under
 * test is told about, so nothing here depends on the day, weekday or time zone
 * the suite runs in.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { closeStaleReservations } from "../../scripts/close-returned-reservations";
import { buildPickupWorklist } from "../services/pickup-worklist";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  cleanupFixtures,
  createFixtureVehicle,
  createFixtureReservation,
  createFixtureCustomer,
} from "./helpers/fixtures";

/** The one "today" this file reasons about. Nothing reads the real clock. */
const TODAY = "2026-06-15";
const day = (offset: number): string => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

describe("B-21 — what the bulk close touches and what it refuses to touch", () => {
  let neverPickedUp: number;
  let stillBooked: number;
  let legacyActive: number;
  let legacyScheduled: number;
  let stillOut: number;
  let customerId: number;
  let vehicleId: number;

  beforeAll(async () => {
    const customer = await createFixtureCustomer("B21");
    customerId = customer.id;
    vehicleId = (await createFixtureVehicle()).id;

    neverPickedUp = (await createFixtureReservation({
      customerId, vehicleId, startDate: day(-40), endDate: day(-30), status: "booked",
    })).id;
    stillBooked = (await createFixtureReservation({
      customerId, vehicleId, startDate: day(30), endDate: day(35), status: "booked",
    })).id;
    legacyActive = (await createFixtureReservation({
      customerId: null, vehicleId, startDate: day(-60), endDate: day(-55),
      status: "active", type: "maintenance_block",
    })).id;
    legacyScheduled = (await createFixtureReservation({
      customerId: null, vehicleId, startDate: day(-20), endDate: day(-18),
      status: "scheduled", type: "maintenance_block",
    })).id;
    stillOut = (await createFixtureReservation({
      customerId, vehicleId, startDate: day(-90), endDate: day(-80), status: "picked_up",
    })).id;
    await db.update(reservations)
      .set({ actualPickupDate: day(-90) })
      .where(eq(reservations.id, stillOut));
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures();
  });

  it("a dry run writes nothing", async () => {
    const result = await closeStaleReservations({ today: TODAY });
    expect(result.dryRun).toBe(true);
    expect(result.neverPickedUp.candidates).toBeGreaterThanOrEqual(1);
    expect(result.legacyStatus.candidates).toBeGreaterThanOrEqual(2);
    expect(result.neverPickedUp.closed).toBe(0);
    expect(result.legacyStatus.closed).toBe(0);
    expect((await rowOf(neverPickedUp)).status).toBe("booked");
    expect((await rowOf(legacyActive)).status).toBe("active");
  });

  it("the dry run counts the picked_up worklist without touching it", async () => {
    const result = await closeStaleReservations({ today: TODAY });
    expect(result.stillOutWorklist).toBeGreaterThanOrEqual(1);
  });

  it("applying cancels the bookings that were never picked up", async () => {
    const result = await closeStaleReservations({ today: TODAY, dryRun: false });
    expect(result.dryRun).toBe(false);
    expect((await rowOf(neverPickedUp)).status).toBe("cancelled");
    expect(result.neverPickedUp.closed).toBeGreaterThanOrEqual(1);
  });

  it("applying closes the rows with a legacy status", async () => {
    expect((await rowOf(legacyActive)).status).toBe("completed");
    expect((await rowOf(legacyScheduled)).status).toBe("completed");
    // Never "today" — that is BUG-019's mistake.
    expect((await rowOf(legacyActive)).completionDate).toBe(day(-55));
  });

  it("a picked_up row is NEVER closed automatically", async () => {
    const row = await rowOf(stillOut);
    expect(row.status).toBe("picked_up");
    expect(row.completionDate).toBeNull();
  });

  it("a future booking is left alone", async () => {
    expect((await rowOf(stillBooked)).status).toBe("booked");
    expect((await rowOf(stillBooked)).endDate).toBe(day(35));
  });

  it("the end date is never rewritten (BUG-019)", async () => {
    expect((await rowOf(neverPickedUp)).endDate).toBe(day(-30));
    expect((await rowOf(legacyActive)).endDate).toBe(day(-55));
  });

  it("running it twice changes nothing more", async () => {
    const again = await closeStaleReservations({ today: TODAY, dryRun: false });
    expect(again.neverPickedUp.closed).toBe(0);
    expect(again.legacyStatus.closed).toBe(0);
  });
});

describe("B-21 — the worklist an employee actually walks", () => {
  let staff: TestAgent;
  let stillOut: number;
  let plate: string;
  let customerName: string;

  beforeAll(async () => {
    staff = await agentFor(["view_reservations"]);
    const customer = await createFixtureCustomer("B21list");
    customerName = customer.companyName ?? customer.name;
    const vehicle = await createFixtureVehicle();
    plate = vehicle.licensePlate;
    stillOut = (await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id,
      startDate: day(-90), endDate: day(-80), status: "picked_up",
    })).id;
    await db.update(reservations)
      .set({ actualPickupDate: day(-90) })
      .where(eq(reservations.id, stillOut));
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("the service lists vehicle, customer, period and how long it has been open", async () => {
    const board = await buildPickupWorklist(TODAY);
    const row = board.rows.find((r) => r.reservationId === stillOut);
    expect(row, "the still-out reservation is on the worklist").toBeTruthy();
    expect(row!.licensePlate).toBe(plate);
    expect(row!.customerLabel).toBe(customerName);
    expect(row!.startDate).toBe(day(-90));
    expect(row!.endDate).toBe(day(-80));
    expect(row!.actualPickupDate).toBe(day(-90));
    // 80 days past the agreed end date, on the reference day.
    expect(row!.daysOpen).toBe(80);
  });

  it("the endpoint answers for reservation staff and takes its own reference day", async () => {
    const res = await staff.get(`/api/reservations/worklist/still-out?date=${TODAY}`);
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: any) => r.reservationId === stillOut);
    expect(row).toBeTruthy();
    expect(row.daysOpen).toBe(80);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("the endpoint refuses a nonsense date instead of guessing", async () => {
    const res = await staff.get("/api/reservations/worklist/still-out?date=not-a-date");
    expect(res.status).toBe(400);
  });

  it("the endpoint is permission-gated", async () => {
    const outsider = await agentFor(["view_vehicles"]);
    const res = await outsider.get("/api/reservations/worklist/still-out");
    expect(res.status).toBe(403);
  });
});

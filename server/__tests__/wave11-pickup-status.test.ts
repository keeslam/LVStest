/**
 * WAVE 11 — BUG-144 (the code half): a rental cannot be marked "picked up"
 * before its period starts.
 *
 * `/pickup` has asked the B-16 question since wave 10, but the three status
 * writers did not: phase 36 set `status: "picked_up"` on reservation 3318 —
 * which starts on 2026-11-11 — through both `PATCH /api/reservations/:id` and
 * `PATCH /api/reservations/:id/status`, got 200 from both, and left the row
 * claiming a pickup with an empty pickup date and an empty pickup mileage.
 *
 * The state machine now refuses a pickup status on a rental whose period has
 * not started, through the same B-16 confirmation the pickup route uses: with
 * `shiftStartDate: true` the start date moves to today, exactly as B-16 says.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { isoToday, PickupBeforeStartError, assertPickupPeriodStarted } from "../services/lifecycle";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("W11PU")).id;
}, 60_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Days relative to today — never a weekday dependency. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

async function futureRental() {
  const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
  return createFixtureReservation({
    customerId, vehicleId: vehicle.id, startDate: day(60), endDate: day(70),
  });
}

async function statusOf(id: number): Promise<{ status: string; startDate: string }> {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return { status: row.status as string, startDate: row.startDate as string };
}

describe("BUG-144 — the rule", () => {
  it("refuses a pickup status before the period starts, unless B-16 is confirmed", () => {
    expect(() => assertPickupPeriodStarted({ startDate: day(60) }, { confirmedShift: false })).toThrow(
      PickupBeforeStartError,
    );
    expect(assertPickupPeriodStarted({ startDate: day(60) }, { confirmedShift: true })).toBe(isoToday());
    // A rental that has started needs no confirmation and shifts nothing.
    expect(assertPickupPeriodStarted({ startDate: day(-1) }, { confirmedShift: false })).toBeNull();
    expect(assertPickupPeriodStarted({ startDate: isoToday() }, { confirmedShift: false })).toBeNull();
  });
});

describe("BUG-144 — every status writer asks the same question", () => {
  it("PATCH /:id/status refuses picked_up on a rental that starts later", async () => {
    const rental = await futureRental();
    const res = await admin.patch(`/api/reservations/${rental.id}/status`).send({ status: "picked_up" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKUP_BEFORE_START_DATE");
    expect((await statusOf(rental.id)).status).toBe("booked");
  });

  it("PATCH /:id refuses it too", async () => {
    const rental = await futureRental();
    const res = await admin.patch(`/api/reservations/${rental.id}`).send({ status: "picked_up" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKUP_BEFORE_START_DATE");
    expect((await statusOf(rental.id)).status).toBe("booked");
  });

  it("PATCH /:id/basic refuses it too", async () => {
    const rental = await futureRental();
    const res = await admin.patch(`/api/reservations/${rental.id}/basic`).send({ status: "picked_up" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKUP_BEFORE_START_DATE");
    expect((await statusOf(rental.id)).status).toBe("booked");
  });

  it("goes through once the employee confirms, and moves the start date to today (B-16)", async () => {
    const rental = await futureRental();
    const res = await admin
      .patch(`/api/reservations/${rental.id}/status`)
      .send({ status: "picked_up", shiftStartDate: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const after = await statusOf(rental.id);
    expect(after.status).toBe("picked_up");
    expect(after.startDate).toBe(isoToday());
  });

  it("a rental whose period has started is unaffected", async () => {
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(5),
    });
    const res = await admin.patch(`/api/reservations/${rental.id}/status`).send({ status: "picked_up" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await statusOf(rental.id);
    expect(after.status).toBe("picked_up");
    expect(after.startDate).toBe(day(-2));
  });
});

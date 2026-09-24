/**
 * B-32 aanvulling (besluiten.md, 2026-09-23) — `GET /api/reservations/not-collected`.
 *
 * A `booked` reservation nobody ever picked up, whose start date is 30 days
 * or more in the past, is shown in a popup dialog on the reservation
 * calendar so it does not sit forgotten forever. Unlike the booking gate
 * (B-32's base decision, see b-32-past-reservations.test.ts), this endpoint
 * never blocks anything — a never-collected booking stays "booked".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { day } from "./helpers/dates";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("NotCollected")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("B-32 aanvulling — never-collected bookings a month old", () => {
  it("lists a booked row that started 40 days ago and was never picked up", async () => {
    const vehicle = await createFixtureVehicle();
    const stale = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-40), endDate: day(-36), status: "booked",
    });

    const res = await admin.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).map((r) => r.id)).toContain(stale.id);
  });

  it("does not list a booked row that started only 10 days ago", async () => {
    const vehicle = await createFixtureVehicle();
    const recent = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-10), endDate: day(-6), status: "booked",
    });

    const res = await admin.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(recent.id);
  });

  it("does not list a picked-up rental even if it started 40 days ago", async () => {
    const vehicle = await createFixtureVehicle();
    const pickedUp = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-40), endDate: day(-36), status: "picked_up",
    });

    const res = await admin.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(pickedUp.id);
  });

  it("does not list a maintenance block even if it started 40 days ago", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: day(-40), endDate: day(-36), status: "booked", type: "maintenance_block",
    });

    const res = await admin.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(block.id);
  });

  it("does not list a soft-deleted row even if it started 40 days ago", async () => {
    const vehicle = await createFixtureVehicle();
    const deleted = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-40), endDate: day(-36), status: "booked",
    });
    await db.update(reservations).set({ deletedAt: new Date() }).where(eq(reservations.id, deleted.id));

    const res = await admin.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(deleted.id);
  });

  it("refuses a role with only view_vehicles (403)", async () => {
    const viewOnly = await agentFor(["view_vehicles"]);
    const res = await viewOnly.get("/api/reservations/not-collected");
    expect(res.status).toBe(403);
  });

  // task-2-review.md Minor 4 — every positive-path case above ran as `admin`
  // (the role bypass), which never actually exercises the OR grant itself.
  // A non-admin role holding only view_reservations (not manage_reservations)
  // must still get 200 — the route's hasPermission(VIEW_RESERVATIONS,
  // MANAGE_RESERVATIONS) is an OR, not a requirement for both.
  it("allows a non-admin role with only view_reservations (200)", async () => {
    const viewOnly = await agentFor(["view_reservations"]);
    const res = await viewOnly.get("/api/reservations/not-collected");
    expect(res.status).toBe(200);
  });
});

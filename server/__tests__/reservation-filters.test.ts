/**
 * BUG-205 phase B (Kees, 2026-10-19): GET /api/reservations with filters answers only the rows a screen
 * needs (type, status, vehicle, period, delivery, maintenance state), full or slim, and the customers
 * page gets one aggregate per customer instead of every reservation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData } from "./portal-helpers";
import { reservationFilterWhere, getReservationListRowsWhere, getCustomerReservationStats } from "../services/reservation-list";
import { storage } from "../storage";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("gefilterde reserveringen", () => {
  let customerId: number, vehicleId: number;
  const id: Record<string, number> = {};
  let admin: TestAgent;

  beforeAll(async () => {
    await cleanupPortalTestData();
    admin = await agentFor("admin");
    customerId = (await createTestCustomer("Filter")).id;
    vehicleId = (await createTestVehicle()).id;
    id.booked = (await createTestReservation({ customerId, vehicleId, startDate: "2031-03-10", endDate: "2031-03-12", status: "booked" })).id;
    id.out = (await createTestReservation({ customerId, vehicleId, startDate: "2031-02-01", endDate: null, status: "picked_up" })).id;
    id.done = (await createTestReservation({ customerId, vehicleId, startDate: "2031-01-01", endDate: "2031-01-05", status: "completed" })).id;
    id.cancelled = (await createTestReservation({ customerId, vehicleId, startDate: "2031-03-11", endDate: "2031-03-11", status: "cancelled" })).id;
    id.block = (await createTestReservation({ customerId, vehicleId, startDate: "2031-03-11", endDate: "2031-03-11", status: "booked", type: "maintenance_block" })).id;
    id.blockOut = (await createTestReservation({ customerId, vehicleId, startDate: "2031-01-20", endDate: "2031-01-20", status: "booked", type: "maintenance_block" })).id;
    await db.update(reservations).set({ maintenanceStatus: "out" }).where(eq(reservations.id, id.blockOut));
    await db.update(reservations).set({ maintenanceStatus: "scheduled" }).where(eq(reservations.id, id.block));
    await db.update(reservations).set({ deliveryRequired: true }).where(eq(reservations.id, id.booked));
  });
  afterAll(async () => { await cleanupPortalTestData(); await cleanupFixtureUsers(); });

  const ids = async (f: Parameters<typeof reservationFilterWhere>[0]) =>
    (await storage.getReservationsWhere(reservationFilterWhere({ ...f, vehicleId }))).map((r) => r.id).sort();

  it("filters by type, status and excluded status", async () => {
    expect(await ids({ type: ["standard"], status: ["booked", "picked_up"] })).toEqual([id.booked, id.out].sort());
    expect(await ids({ excludeStatus: ["cancelled", "completed"], type: ["standard"] })).toEqual([id.booked, id.out].sort());
  });

  it("a period includes a running rental without an end date", async () => {
    expect(await ids({ type: ["standard"], from: "2031-03-11", to: "2031-03-11" })).toEqual([id.booked, id.out, id.cancelled].sort());
  });

  it("maintenance blocks: open or done, and one day for one vehicle", async () => {
    expect(await ids({ type: ["maintenance_block"], excludeMaintenanceStatus: ["out"] })).toEqual([id.block]);
    expect(await ids({ type: ["maintenance_block"], maintenanceStatus: ["out"] })).toEqual([id.blockOut]);
    expect(await ids({ type: ["maintenance_block"], from: "2031-03-11", to: "2031-03-11" })).toEqual([id.block]);
  });

  it("delivery, full rows with vehicle and customer, or slim rows", async () => {
    const full = await storage.getReservationsWhere(reservationFilterWhere({ delivery: true, vehicleId }));
    expect(full.map((r) => r.id)).toEqual([id.booked]);
    expect((full[0] as any).vehicle?.id).toBe(vehicleId);
    const slim = await getReservationListRowsWhere(reservationFilterWhere({ delivery: true, vehicleId }));
    expect(Object.keys(slim[0].vehicle!).sort()).toEqual(["brand", "id", "licensePlate", "model", "returnMileage"]);
  });

  it("customer stats: count, latest, a car out now", async () => {
    const stats = (await getCustomerReservationStats()).find((s) => s.customerId === customerId);
    expect(stats).toMatchObject({ count: 6, hasActiveRental: true });
    expect(stats!.lastCreatedAt).toBeTruthy();
  });

  it("the route answers filters as an array, refuses bad input, and keeps the old answer without them", async () => {
    const res = await admin.get(`/api/reservations?type=maintenance_block&vehicleId=${vehicleId}&slim=1`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: number }) => r.id).sort()).toEqual([id.block, id.blockOut].sort());
    expect((await admin.get("/api/reservations?type=DROP%20TABLE")).status).toBe(400);
    expect((await admin.get("/api/reservations?from=gisteren")).status).toBe(400);
    const stats = await admin.get("/api/reservations/customer-stats");
    expect(stats.status).toBe(200);
    expect(stats.body.some((s: { customerId: number }) => s.customerId === customerId)).toBe(true);
  });
});

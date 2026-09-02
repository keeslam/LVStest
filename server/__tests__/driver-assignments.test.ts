import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { reservations, reservationDriverAssignments } from "../../shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData } from "./portal-helpers";

describe("assignDriverToReservation", () => {
  let reservationId: number, d1: number, d2: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    const c = await createTestCustomer("Drv");
    const v = await createTestVehicle();
    d1 = (await createTestDriver(c.id, "Een")).id;
    d2 = (await createTestDriver(c.id, "Twee")).id;
    reservationId = (await createTestReservation({ customerId: c.id, vehicleId: v.id })).id;
  });
  afterAll(cleanupPortalTestData);

  it("opens a row and mirrors driverId onto the reservation", async () => {
    const t1 = new Date("2026-09-01T08:00:00Z");
    const row = await assignDriverToReservation({ reservationId, driverId: d1, at: t1 });
    expect(row.assignedUntil).toBeNull();
    const [res] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    expect(res.driverId).toBe(d1);
  });

  it("closes the previous row when the driver changes", async () => {
    const t2 = new Date("2026-09-03T08:00:00Z");
    await assignDriverToReservation({ reservationId, driverId: d2, at: t2, note: "wissel" });
    const open = await db.select().from(reservationDriverAssignments)
      .where(and(eq(reservationDriverAssignments.reservationId, reservationId), isNull(reservationDriverAssignments.assignedUntil)));
    expect(open).toHaveLength(1);
    expect(open[0].driverId).toBe(d2);
    const history = await getDriverAssignments(reservationId);
    expect(history.map((h) => h.driverId)).toEqual([d1, d2]);
    expect(history[0].assignedUntil?.getTime()).toBe(t2.getTime());
    expect(history[1].driverName).toBe("Twee");
  });

  it("is a no-op when the same driver is assigned again", async () => {
    await assignDriverToReservation({ reservationId, driverId: d2 });
    expect(await getDriverAssignments(reservationId)).toHaveLength(2);
  });
});

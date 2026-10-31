/**
 * Kees (2026-10-31): the APK tab of Klantcommunicatie missed cars whose APK runs out within
 * 60 days, while the maintenance calendar showed them. GET /api/vehicles/filtered?filterType=apk
 * started from "a reservation running today whose customer has customers.email", so an
 * open-ended rental (end_date NULL), a car whose renter starts next week, a renter who only has
 * an APK address and an empty car all fell out. The list now starts from the fleet like the
 * calendar (APK date set, status not in maintenanceExcludedStatuses) and names the renter the
 * send uses (B-24: running or next reservation).
 */
import { describe, it, expect, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { customers } from "../../shared/schema";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { isoToday } from "../services/lifecycle";
import filteredVehiclesRouter from "../routes/filtered-vehicles";

// Mounted bare: server/middleware/staff-routers.ts puts it behind requireAuth + VIEW_VEHICLES,
// which is not what is tested here.
const app = express();
app.use("/filtered", filteredVehiclesRouter);

afterAll(async () => {
  await cleanupFixtures();
});

const day = (offset: number): string => {
  const d = new Date(`${isoToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const rowOf = (rows: any[], vehicleId: number) => rows.find((r) => r.vehicle?.id === vehicleId);

describe("APK reminder list shows what the maintenance calendar shows", () => {
  it("lists open-ended, upcoming, APK-address-only and empty cars; skips excluded status and APK far ahead", async () => {
    const openEnded = await createFixtureVehicle({ apkDate: day(20) });
    const openEndedCustomer = await createFixtureCustomer("ApkOpen");
    await createFixtureReservation({ customerId: openEndedCustomer.id, vehicleId: openEnded.id, startDate: day(-200), endDate: null, status: "picked_up" });

    const upcoming = await createFixtureVehicle({ apkDate: day(40) });
    const upcomingCustomer = await createFixtureCustomer("ApkNext");
    await createFixtureReservation({ customerId: upcomingCustomer.id, vehicleId: upcoming.id, startDate: day(7), endDate: day(14), status: "booked" });

    const motOnly = await createFixtureVehicle({ apkDate: day(10) });
    const motOnlyCustomer = await createFixtureCustomer("ApkMot");
    await db.update(customers).set({ email: null, emailForMOT: `apk-${motOnlyCustomer.id}@fixture-test.invalid` }).where(eq(customers.id, motOnlyCustomer.id));
    await createFixtureReservation({ customerId: motOnlyCustomer.id, vehicleId: motOnly.id, startDate: day(-3), endDate: day(3), status: "picked_up" });

    const empty = await createFixtureVehicle({ apkDate: day(-5) });
    const notForRental = await createFixtureVehicle({ apkDate: day(5), availabilityStatus: "not_for_rental" });
    const farAhead = await createFixtureVehicle({ apkDate: day(90) });

    const res = await request(app).get("/filtered?filterType=apk");
    expect(res.status).toBe(200);
    const rows = res.body as any[];

    expect(rowOf(rows, openEnded.id)?.customer?.id, "open-ended rental").toBe(openEndedCustomer.id);
    expect(rowOf(rows, upcoming.id)?.customer?.id, "next renter").toBe(upcomingCustomer.id);
    expect(rowOf(rows, motOnly.id)?.customer?.id, "renter with only an APK address").toBe(motOnlyCustomer.id);
    expect(rowOf(rows, empty.id), "empty car with overdue APK").toBeDefined();
    expect(rowOf(rows, empty.id).customer).toBeNull();
    expect(rowOf(rows, empty.id).filterInfo).toMatchObject({ daysUntilAPK: -5, urgencyLevel: "overdue" });
    expect(rowOf(rows, notForRental.id), "status excluded from the calendar").toBeUndefined();
    expect(rowOf(rows, farAhead.id), "APK more than 60 days ahead").toBeUndefined();

    // Most urgent first.
    const order = rows.map((r) => r.vehicle.id);
    expect(order.indexOf(empty.id)).toBeLessThan(order.indexOf(motOnly.id));
    expect(order.indexOf(motOnly.id)).toBeLessThan(order.indexOf(openEnded.id));
  });
});

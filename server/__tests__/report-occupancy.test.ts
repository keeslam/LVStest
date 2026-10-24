/**
 * Rapporten fase 3, Task 2 - the occupancy heatmap report: one state per vehicle-day
 * (workshop > rented > replacement > available), the active fleet per day, a late return and
 * an open rental counting on, every day adding up to the fleet, every tile equal to its list,
 * the 366-day limit, at most two statements for the summary and the two permissions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { OCCUPANCY_TILES, type OccupancyDay } from "../../shared/reports/occupancy-report";
import { occupancyReport } from "../services/reports/occupancy-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";
import { countSql } from "./helpers/sqlCounter";

describe("occupancy report", () => {
  const P = { from: "2026-03-01", to: "2026-03-10" };
  let staff: TestAgent;
  let V1: number, V2: number, V3: number, V4: number, V5: number;

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_reservations"]);
    V1 = (await createFixtureVehicle()).id;
    const late = await createFixtureReservation({ vehicleId: V1, startDate: "2026-03-02", endDate: "2026-03-04", status: "returned" });
    await db.update(reservations).set({ actualReturnDate: "2026-03-05" }).where(eq(reservations.id, late.id));
    await createFixtureReservation({ vehicleId: V1, type: "maintenance_block", startDate: "2026-03-05", endDate: "2026-03-06" });
    await createFixtureReservation({ vehicleId: V1, type: "replacement", startDate: "2026-03-08", endDate: "2026-03-09" });
    await createFixtureReservation({ vehicleId: V1, startDate: "2026-03-10", endDate: "2026-03-10", status: "cancelled" });
    const gone = await createFixtureReservation({ vehicleId: V1, startDate: "2026-03-01", endDate: "2026-03-01" });
    await db.update(reservations).set({ deletedAt: new Date() }).where(eq(reservations.id, gone.id));

    V2 = (await createFixtureVehicle({ outOfFleetDate: "2026-03-06", availabilityStatus: "not_for_rental" })).id;

    V3 = (await createFixtureVehicle({ availabilityStatus: "not_for_rental" })).id;
    await createFixtureReservation({ vehicleId: V3, startDate: "2026-03-03", endDate: "2026-03-03" });

    V4 = (await createFixtureVehicle()).id;
    await createFixtureReservation({ vehicleId: V4, startDate: "2026-03-08", endDate: null, status: "picked_up" });

    V5 = (await createFixtureVehicle()).id;
    const lateOnly = await createFixtureReservation({ vehicleId: V5, startDate: "2026-03-02", endDate: "2026-03-03", status: "returned" });
    await db.update(reservations).set({ actualReturnDate: "2026-03-04" }).where(eq(reservations.id, lateOnly.id));
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("V1: één toestand per dag, werkplaats wint, late inlevering telt door", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V1 })).body;
    expect(s.tiles).toEqual({ rented: { count: 1, amount: 3 }, replacement: { count: 1, amount: 2 }, workshop: { count: 1, amount: 2 }, available: { count: 1, amount: 3 } });
    expect(s.days).toHaveLength(10);
    expect(s.days.find((d: OccupancyDay) => d.date === "2026-03-03")).toEqual({ date: "2026-03-03", fleet: 1, rented: 1, replacement: 0, workshop: 0, available: 0, pct: 100 });
    expect(s.days.find((d: OccupancyDay) => d.date === "2026-03-05")).toMatchObject({ rented: 0, workshop: 1, pct: 0 });
    expect(s.avgPct).toBe(30);
  });

  it("V1-lijst per voertuig", async () => {
    const r = (await staff.get("/api/reports/occupancy/rows").query({ ...P, vehicleId: V1, tile: "rented" })).body;
    expect(r.rows[0]).toMatchObject({ vehicleId: V1, fleetDays: 10, rentedDays: 3, replacementDays: 2, workshopDays: 2, availableDays: 3, pct: 30, amount: 3 });
  });

  it("V2 uit de vloot vanaf 6 maart", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V2 })).body;
    expect(s.tiles.available).toEqual({ count: 1, amount: 5 });
    expect(s.days.find((d: OccupancyDay) => d.date === "2026-03-06")).toMatchObject({ fleet: 0, pct: null });
  });

  it("V3 niet te huur maar verhuurd: telt die dag mee in de vloot", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V3 })).body;
    expect(s.tiles.rented).toEqual({ count: 1, amount: 1 });
    expect(s.tiles.available).toEqual({ count: 0, amount: 0 });
  });

  it("V4 open huur loopt door tot vandaag", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V4 })).body;
    expect(s.tiles.rented).toEqual({ count: 1, amount: 3 });
  });

  it("V5 later ingeleverd dan gepland, zonder overlap: de extra dag telt als verhuurd", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query({ ...P, vehicleId: V5 })).body;
    expect(s.tiles.rented).toEqual({ count: 1, amount: 3 });
    expect(s.days.find((d: OccupancyDay) => d.date === "2026-03-04")).toMatchObject({ rented: 1, available: 0 });
  });

  it("een dag apart geeft dezelfde aantallen als die dag in de periode", async () => {
    const day = (await staff.get("/api/reports/occupancy/summary").query({ from: "2026-03-03", to: "2026-03-03" })).body;
    const period = (await staff.get("/api/reports/occupancy/summary").query(P)).body;
    const d = period.days.find((x: OccupancyDay) => x.date === "2026-03-03");
    expect([day.tiles.rented.count, day.tiles.workshop.count, day.tiles.replacement.count, day.tiles.available.count]).toEqual([d.rented, d.workshop, d.replacement, d.available]);
  });

  it("hele vloot: elke dag telt op tot de vloot en nooit boven 100 %", async () => {
    const s = (await staff.get("/api/reports/occupancy/summary").query(P)).body;
    expect(s.days).toHaveLength(10);
    for (const d of s.days as OccupancyDay[]) {
      expect(d.rented + d.replacement + d.workshop + d.available).toBe(d.fleet);
      if (d.fleet > 0) expect(d.pct).toBe(Math.round((d.rented / d.fleet) * 1000) / 10);
      if (d.pct !== null) expect(d.pct).toBeLessThanOrEqual(100);
    }
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/occupancy", { ...P, vehicleId: String(V1) }, OCCUPANCY_TILES));

  it("periode: 366 dagen mag, 367 niet", async () => {
    expect((await staff.get("/api/reports/occupancy/summary").query({ from: "2024-01-01", to: "2024-12-31", vehicleId: V1 })).status).toBe(200);
    expect((await staff.get("/api/reports/occupancy/summary").query({ from: "2025-01-01", to: "2026-01-02" })).body.code).toBe("PERIOD_TOO_LONG");
  });

  it("summary is hoogstens twee SQL-statements, ongeacht de vloot", async () => {
    const { statements } = await countSql(() => occupancyReport.summary({ from: "2026-01-01", to: "2026-12-31", vehicleId: null }));
    expect(statements.length).toBeLessThanOrEqual(2);
  });

  it("rechten: rapport + reserveringen", async () => {
    for (const perms of [["view_reports"], ["view_reservations"]]) expect((await (await agentFor(perms)).get("/api/reports/occupancy/summary").query(P)).status).toBe(403);
    expect((await (await agentFor(["view_reports", "view_reservations"])).get("/api/reports/occupancy/rows").query({ ...P, tile: "rented" })).status).toBe(200);
  });
});

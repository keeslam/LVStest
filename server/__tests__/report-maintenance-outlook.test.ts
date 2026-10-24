/**
 * Rapporten fase 3, Task 3 - the maintenance and APK outlook report: APK and service rows per
 * vehicle within the horizon, overdue items, km per day from the km history (a voided reading
 * does not count), km fields hidden from non-admins on /rows and /export, every tile equal to
 * its list, the two permissions, and the maintenance calendar on the same km source.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { vehicleMileageReadings } from "../../shared/schema";
import { MAINTENANCE_OUTLOOK_TILES } from "../../shared/reports/maintenance-outlook-report";
import { mileageHistoryReadingsByVehicle } from "../services/service-forecast";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("maintenance outlook report", () => {
  const W = { from: "2026-11-02", to: "2027-02-02" };
  let admin: TestAgent;
  let staff: TestAgent;
  let V7a: number, V7b: number, V7c: number, V7d: number, V7e: number, V7f: number, V7g: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    staff = await agentFor(["view_reports", "view_vehicles"]);
    V7a = (await createFixtureVehicle({
      apkDate: "2026-11-12",
      lastServiceDate: "2026-03-01",
      serviceIntervalMonths: 12,
      serviceIntervalKm: 30000,
      lastServiceMileage: 50000,
      currentMileage: 78000,
    })).id;
    await db.insert(vehicleMileageReadings).values([
      { vehicleId: V7a, mileage: 70000, recordedAt: new Date("2026-08-01T10:00:00Z"), source: "manual" },
      { vehicleId: V7a, mileage: 76000, recordedAt: new Date("2026-10-01T10:00:00Z"), source: "manual" },
      { vehicleId: V7a, mileage: 99999, recordedAt: new Date("2026-09-01T10:00:00Z"), source: "manual", voidedAt: new Date("2026-09-02T10:00:00Z"), voidedBy: "FIXT-test" },
    ]);
    // Same car as V7a, but a typo (760 000) sits between the readings and a correction follows it.
    V7g = (await createFixtureVehicle({
      lastServiceDate: "2026-03-01", serviceIntervalMonths: 12, serviceIntervalKm: 30000,
      lastServiceMileage: 50000, currentMileage: 78000,
    })).id;
    await db.insert(vehicleMileageReadings).values([
      { vehicleId: V7g, mileage: 70000, recordedAt: new Date("2026-08-01T10:00:00Z"), source: "manual" },
      { vehicleId: V7g, mileage: 760000, recordedAt: new Date("2026-09-01T10:00:00Z"), source: "manual" },
      { vehicleId: V7g, mileage: 76000, recordedAt: new Date("2026-10-01T10:00:00Z"), source: "manual" },
    ]);
    V7b = (await createFixtureVehicle({ apkDate: "2026-10-20" })).id;
    V7c = (await createFixtureVehicle({ apkDate: "2026-11-10", outOfFleetDate: "2026-10-01" })).id;
    V7d = (await createFixtureVehicle({ apkDate: "2027-03-01" })).id;
    // Over its km limit, no km history: the months date (2027-06-01) lies beyond the horizon.
    V7e = (await createFixtureVehicle({
      lastServiceDate: "2026-06-01", serviceIntervalMonths: 12, serviceIntervalKm: 30000,
      lastServiceMileage: 50000, currentMileage: 85000,
    })).id;
    // Too few readings: falls back to the months date inside the horizon.
    V7f = (await createFixtureVehicle({
      lastServiceDate: "2026-01-15", serviceIntervalMonths: 12, serviceIntervalKm: 30000,
      lastServiceMileage: 10000, currentMileage: 12000,
    })).id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("km-historie: alleen niet-vervallen standen, datum als kantoordag", async () => {
    const map = await mileageHistoryReadingsByVehicle([V7a]);
    expect(map.get(V7a)?.sort((a, b) => a.date.localeCompare(b.date))).toEqual([
      { date: "2026-08-01", mileage: 70000 },
      { date: "2026-10-01", mileage: 76000 },
    ]);
    expect((await mileageHistoryReadingsByVehicle([])).size).toBe(0);
  });

  it("V7a: APK en beurt op km in verschillende weken", async () => {
    const s = (await admin.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: V7a })).body;
    expect(s.tiles).toEqual({ apk: { count: 1, amount: 0 }, service: { count: 1, amount: 0 }, overdue: { count: 0, amount: 0 }, all: { count: 2, amount: 0 } });
    expect(s.byWeek.map((w: { weekStart: string; apk: number; service: number }) => [w.weekStart, w.apk, w.service])).toEqual([["2026-11-09", 1, 0], ["2026-11-23", 0, 1]]);
  });

  it("admin ziet km, niet-admin alleen datum en basis", async () => {
    const a = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
    expect(a).toMatchObject({ dueDate: "2026-11-23", basis: "km", kmUntilService: 2000, kmPerDay: 98.4, currentMileage: 78000, nextServiceMileage: 80000 });
    const exported = (await admin.get("/api/reports/maintenance-outlook/export").query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
    expect(exported).toMatchObject({ kmPerDay: 98.4, currentMileage: 78000 });
    for (const path of ["rows", "export"]) {
      const n = (await staff.get(`/api/reports/maintenance-outlook/${path}`).query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
      expect(n).toMatchObject({ dueDate: "2026-11-23", basis: "km", kmUntilService: null, kmPerDay: null, currentMileage: null, nextServiceMileage: null });
    }
  });

  it("V7b achterstallige APK", async () => {
    const s = (await staff.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: V7b })).body;
    expect(s.tiles.overdue).toEqual({ count: 1, amount: 0 });
    expect(s.byWeek).toEqual([]);
  });

  it("V7e over de km-grens zonder standen staat als achterstallig in de lijst", async () => {
    const s = (await admin.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: V7e })).body;
    expect(s.tiles).toEqual({ apk: { count: 0, amount: 0 }, service: { count: 0, amount: 0 }, overdue: { count: 1, amount: 0 }, all: { count: 1, amount: 0 } });
    expect(s.byWeek).toEqual([]);
    const rows = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7e, tile: "overdue" })).body.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "service", overdue: true, basis: "km", tooFewReadings: true, kmUntilService: -5000 });
    await expectTilesMatchRows(staff, "/api/reports/maintenance-outlook", { ...W, vehicleId: String(V7e) }, MAINTENANCE_OUTLOOK_TILES);
  });

  it("V7f te weinig standen: beurt op maanden binnen de horizon", async () => {
    const rows = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7f, tile: "service" })).body.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dueDate: "2027-01-15", weekStart: "2027-01-11", basis: "months", tooFewReadings: true, overdue: false, kmPerDay: null });
  });

  it("V7c uit de vloot en V7d buiten de horizon tellen niet", async () => {
    for (const v of [V7c, V7d]) expect((await staff.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: v })).body.tiles.all.count).toBe(0);
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/maintenance-outlook", { ...W, vehicleId: String(V7a) }, MAINTENANCE_OUTLOOK_TILES));

  it("rechten: rapport + voertuigen", async () => {
    for (const perms of [["view_reports"], ["view_vehicles"]]) expect((await (await agentFor(perms)).get("/api/reports/maintenance-outlook/summary").query(W)).status).toBe(403);
    expect((await staff.get("/api/reports/maintenance-outlook/summary").query(W)).status).toBe(200);
  });

  it("V7g tikfout met correctie: zelfde tempo en datum als zonder tikfout, in rapport en kalender", async () => {
    const a = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7a, tile: "service" })).body.rows[0];
    const g = (await admin.get("/api/reports/maintenance-outlook/rows").query({ ...W, vehicleId: V7g, tile: "service" })).body.rows;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ dueDate: a.dueDate, basis: "km", kmPerDay: 98.4, overdue: false });
    const list = (await staff.get("/api/vehicles/service-forecast")).body as Array<{ id: number; forecast: { kmPerDay: number | null; basis: string | null; expectedDate: string | null } }>;
    const calA = list.find((v) => v.id === V7a)!.forecast;
    expect(calA.expectedDate).not.toBeNull();
    expect(list.find((v) => v.id === V7g)?.forecast).toMatchObject({ kmPerDay: 98.4, basis: "km", expectedDate: calA.expectedDate });
    expect((await staff.get(`/api/vehicles/${V7g}/service-forecast`)).body.forecast).toMatchObject({ kmPerDay: 98.4, expectedDate: calA.expectedDate });
  });

  it("onderhoudskalender rekent km per dag uit dezelfde km-historie", async () => {
    const list = (await staff.get("/api/vehicles/service-forecast")).body as Array<{ id: number; forecast: { kmPerDay: number | null } }>;
    expect(list.find((v) => v.id === V7a)?.forecast.kmPerDay).toBe(98.4);
    const one = (await staff.get(`/api/vehicles/${V7a}/service-forecast`)).body;
    expect(one.forecast.kmPerDay).toBe(98.4);
  });
});

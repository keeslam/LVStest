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
  let V7a: number, V7b: number, V7c: number, V7d: number;

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
    V7b = (await createFixtureVehicle({ apkDate: "2026-10-20" })).id;
    V7c = (await createFixtureVehicle({ apkDate: "2026-11-10", outOfFleetDate: "2026-10-01" })).id;
    V7d = (await createFixtureVehicle({ apkDate: "2027-03-01" })).id;
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

  it("V7c uit de vloot en V7d buiten de horizon tellen niet", async () => {
    for (const v of [V7c, V7d]) expect((await staff.get("/api/reports/maintenance-outlook/summary").query({ ...W, vehicleId: v })).body.tiles.all.count).toBe(0);
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/maintenance-outlook", { ...W, vehicleId: String(V7a) }, MAINTENANCE_OUTLOOK_TILES));

  it("rechten: rapport + voertuigen", async () => {
    for (const perms of [["view_reports"], ["view_vehicles"]]) expect((await (await agentFor(perms)).get("/api/reports/maintenance-outlook/summary").query(W)).status).toBe(403);
    expect((await staff.get("/api/reports/maintenance-outlook/summary").query(W)).status).toBe(200);
  });

  it("onderhoudskalender rekent km per dag uit dezelfde km-historie", async () => {
    const list = (await staff.get("/api/vehicles/service-forecast")).body as Array<{ id: number; forecast: { kmPerDay: number | null } }>;
    expect(list.find((v) => v.id === V7a)?.forecast.kmPerDay).toBe(98.4);
    const one = (await staff.get(`/api/vehicles/${V7a}/service-forecast`)).body;
    expect(one.forecast.kmPerDay).toBe(98.4);
  });
});

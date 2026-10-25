/**
 * Rapporten fase 3, Task 4 - the fleet mileage report (admin only), built on analyseMileage: km per
 * vehicle per month, the warning readings themselves, vehicles with too little data, the same km as
 * the km panel of that vehicle, and every tile equal to its list.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { vehicleMileageReadings } from "../../shared/schema";
import { FLEET_MILEAGE_TILES } from "../../shared/reports/fleet-mileage-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("fleet mileage report", () => {
  const P = { from: "2026-01-01", to: "2026-03-31" };
  let admin: TestAgent;
  let V8: number, V8b: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    V8 = (await createFixtureVehicle({ freeKmPerDay: 100 })).id;
    V8b = (await createFixtureVehicle({})).id;
    const r = (vehicleId: number, mileage: number, at: string, source: string, extra: Record<string, unknown> = {}) =>
      ({ vehicleId, mileage, recordedAt: new Date(at), source, ...extra });
    await db.insert(vehicleMileageReadings).values([
      r(V8, 10000, "2025-12-22T11:00:00Z", "pickup"),
      r(V8, 10400, "2026-01-11T11:00:00Z", "return"),
      r(V8, 11000, "2026-02-10T11:00:00Z", "damage_check"),
      r(V8, 10900, "2026-02-12T11:00:00Z", "manual"),
      r(V8, 11600, "2026-03-01T11:00:00Z", "pickup"),
      r(V8, 20000, "2026-03-02T11:00:00Z", "manual"),
      r(V8, 99999, "2026-03-05T11:00:00Z", "manual", { voidedAt: new Date("2026-03-06T10:00:00Z"), voidedBy: "FIXT-test" }),
      r(V8b, 5000, "2026-02-01T11:00:00Z", "manual"),
    ] as any);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("V8: tegels, maanden en de rij per auto", async () => {
    const s = (await admin.get("/api/reports/fleet-mileage/summary").query({ ...P, vehicleId: V8 })).body;
    expect(s.tiles).toEqual({ driven: { count: 1, amount: 1400 }, warnings: { count: 2, amount: 0 }, sparse: { count: 0, amount: 0 } });
    expect(s.byMonth).toEqual([{ month: "2026-01", km: 600, vehicles: 1 }, { month: "2026-02", km: 768, vehicles: 1 }, { month: "2026-03", km: 32, vehicles: 1 }]);
    const v = (await admin.get("/api/reports/fleet-mileage/rows").query({ ...P, vehicleId: V8, tile: "driven" })).body.rows[0];
    expect(v).toMatchObject({ kind: "vehicle", drivenKm: 1400, readings: 5, warnings: 2, avgPerMonth: 474, freeKm: 9000, overFreeKm: 0, kmByMonth: { "2026-01": 600, "2026-02": 768, "2026-03": 32 }, amount: 1400 });
  });

  it("zelfde km als het km-paneel van die auto", async () => {
    const panel = (await admin.get(`/api/mileage-history/${V8}`).query(P)).body;
    expect(panel.summary.drivenKm).toBe(1400);
  });

  it("waarschuwingen: de standen zelf, nieuwste eerst", async () => {
    const w = (await admin.get("/api/reports/fleet-mileage/rows").query({ ...P, vehicleId: V8, tile: "warnings", sort: "date", dir: "desc" })).body.rows;
    expect(w.map((r: any) => [r.kind, r.warning, r.mileage])).toEqual([["warning", "jump", 20000], ["warning", "decrease", 10900]]);
  });

  it("V8b: een stand is weinig data", async () => {
    const s = (await admin.get("/api/reports/fleet-mileage/summary").query({ ...P, vehicleId: V8b })).body;
    expect(s.tiles).toEqual({ driven: { count: 0, amount: 0 }, warnings: { count: 0, amount: 0 }, sparse: { count: 1, amount: 0 } });
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(admin, "/api/reports/fleet-mileage", { ...P, vehicleId: String(V8) }, FLEET_MILEAGE_TILES));

  it("elke tegel opent precies zijn rijen, ook voor de hele vloot", () => expectTilesMatchRows(admin, "/api/reports/fleet-mileage", { ...P }, FLEET_MILEAGE_TILES));

  it("maandstaaf: km zijn over de dagen verdeeld, dus niet gelijk aan de lijst van die maand (niet klikbaar)", async () => {
    // Rapporten deel 1b: a month bar would open "driven" narrowed to the month. drivenKmByMonth spreads a
    // reading's km over the days since the previous one; the narrowed list counts per reading. They differ,
    // so the card keeps its bars unclickable.
    const q = { ...P, vehicleId: String(V8) };
    const s = (await admin.get("/api/reports/fleet-mileage/summary").query(q)).body;
    const jan = s.byMonth.find((m: { month: string }) => m.month === "2026-01").km;
    const list = (await admin.get("/api/reports/fleet-mileage/rows").query({ ...q, tile: "driven", month: "2026-01" })).body;
    const listKm = list.rows.reduce((n: number, r: { drivenKm: number }) => n + r.drivenKm, 0);
    expect(jan).toBe(600);
    expect(listKm).not.toBe(jan); // the month-narrowed list gives 200 km here
  });

  it("alleen admin, ook met alle rapport- en voertuigrechten", async () => {
    const staff = await agentFor(["manage_reports", "manage_vehicles", "manage_reservations"]);
    for (const p of ["summary", "rows?tile=driven", "export?tile=driven"]) expect((await staff.get(`/api/reports/fleet-mileage/${p}`)).status).toBe(403);
  });
});

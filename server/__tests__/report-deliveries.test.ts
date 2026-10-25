/**
 * Rapporten fase 5, Task 3 - deliveries and collections: on time / late / open / undated
 * (together exactly tile all), km as the amount, per month / type / driver, the vehicle filter
 * (external vehicles drop out), every tile equal to its list, and the report right plus a
 * vehicle or reservation right.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicleTransports } from "../../shared/schema";
import { DELIVERY_REPORT_TILES } from "../../shared/reports/delivery-report";
import { dateInZone } from "../../shared/office-timezone";
import { officeTimeZone } from "../services/office-time";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("deliveries and collections report", () => {
  let staff: TestAgent;
  let V: number;
  let K: number;
  let T2: number;
  const ids: number[] = [];
  const Q = { from: "2019-01-01", to: "2019-12-31" };
  let Q2: Record<string, string>;

  const transport = async (v: Record<string, unknown>) => {
    const [row] = await db.insert(vehicleTransports).values({ vehicleId: V, customerId: K, status: "scheduled", ...v } as any).returning();
    ids.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_vehicles"]);
    V = (await createFixtureVehicle()).id;
    K = (await createFixtureCustomer("Bezorg")).id;
    const vandaag = dateInZone(new Date(), officeTimeZone());
    Q2 = { from: vandaag, to: addDays(vandaag, 10) };
    await transport({ transportType: "delivery", status: "completed", scheduledDate: "2019-03-04", completedDate: "2019-03-04", distanceKm: "40", driverName: "Anna" });
    T2 = await transport({ transportType: "delivery", status: "completed", scheduledDate: "2019-03-05", completedDate: "2019-03-06", distanceKm: "60", driverName: "Anna" });
    await transport({ transportType: "repossession", status: "completed", scheduledDate: "2019-03-10", completedDate: "2019-03-09", distanceKm: "20", driverName: " Bram " });
    await transport({ transportType: "repossession", status: "scheduled", scheduledDate: "2019-04-01" });
    await transport({ transportType: "delivery", status: "in_progress", scheduledDate: "2019-04-02", distanceKm: "10", driverName: "" });
    await transport({ transportType: "delivery", status: "completed", scheduledDate: "2019-04-03", completedDate: null, distanceKm: "30", driverName: "Anna" });
    await transport({ transportType: "delivery", status: "cancelled", scheduledDate: "2019-03-04" });
    await transport({ transportType: "swap", status: "completed", scheduledDate: "2019-03-04", completedDate: "2019-03-04" });
    await transport({ transportType: "delivery", status: "scheduled", scheduledDate: "2020-01-01" });
    await transport({
      vehicleId: null, isExternalVehicle: true, externalLicensePlate: "XX-99-XX", transportType: "delivery", status: "completed",
      scheduledDate: "2019-05-01", completedDate: "2019-05-01", distanceKm: "15", driverName: "Bram",
    });
    await transport({ transportType: "delivery", status: "scheduled", scheduledDate: addDays(vandaag, 3), distanceKm: "25" });
  });

  afterAll(async () => {
    for (const id of ids) await db.delete(vehicleTransports).where(eq(vehicleTransports.id, id));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels: km als bedrag, samen gelijk aan alles", async () => {
    const s = (await staff.get("/api/reports/deliveries/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      all: { count: 7, amount: 175 }, onTime: { count: 3, amount: 75 }, late: { count: 3, amount: 70 },
      open: { count: 0, amount: 0 }, undated: { count: 1, amount: 30 },
    });
    expect(s.onTimePct).toBe(50);
    expect(s.avgKmPerTrip).toBe(29.2);
    expect(s.tripsWithDistance).toBe(6);
  });

  it("maanden, soorten en medewerkers", async () => {
    const s = (await staff.get("/api/reports/deliveries/summary").query(Q)).body;
    expect(s.byMonth).toEqual([
      { month: "2019-03", onTime: 2, late: 1, open: 0, undated: 0 },
      { month: "2019-04", onTime: 0, late: 2, open: 0, undated: 1 },
      { month: "2019-05", onTime: 1, late: 0, open: 0, undated: 0 },
    ]);
    expect(s.byType).toEqual([
      { type: "delivery", total: 5, onTime: 2, late: 2, open: 0, undated: 1, km: 155 },
      { type: "repossession", total: 2, onTime: 1, late: 1, open: 0, undated: 0, km: 20 },
    ]);
    expect(s.byDriver).toEqual([
      { driver: "Anna", trips: 3, onTime: 1, late: 1, km: 130 },
      { driver: "Bram", trips: 2, onTime: 2, late: 0, km: 35 },
      { driver: null, trips: 2, onTime: 0, late: 2, km: 10 },
    ]);
  });

  it("open is nog niet te laat", async () => {
    const s = (await staff.get("/api/reports/deliveries/summary").query(Q2)).body;
    expect(s.tiles.open).toEqual({ count: 1, amount: 25 });
    expect(s.tiles.late.count).toBe(0);
  });

  it("voertuigfilter laat externe ritten weg", async () => {
    const s = (await staff.get("/api/reports/deliveries/summary").query({ ...Q, vehicleId: String(V) })).body;
    expect(s.tiles.all).toEqual({ count: 6, amount: 160 });
    expect(s.tiles.onTime).toEqual({ count: 2, amount: 60 });
  });

  it("rij", async () => {
    const r = (await staff.get("/api/reports/deliveries/rows").query({ ...Q, tile: "late", sort: "scheduledDate", dir: "asc" })).body.rows[0];
    expect(r).toMatchObject({
      id: T2, transportType: "delivery", status: "completed", scheduledDate: "2019-03-05", completedDate: "2019-03-06",
      punctuality: "late", daysLate: 1, driverName: "Anna", distanceKm: 60, vehicleId: V, customerId: K, amount: 60,
    });
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/deliveries", Q, DELIVERY_REPORT_TILES));

  it("uitsplitsing: soort en medewerker (ook zonder) openen precies hun regels", async () => {
    const s = (await staff.get("/api/reports/deliveries/summary").query(Q)).body;
    await expectDrillMatchesLines(staff, "/api/reports/deliveries", Q, "all", "type",
      s.byType.map((t: { type: string; total: number }) => ({ key: t.type, count: t.total })));
    await expectDrillMatchesLines(staff, "/api/reports/deliveries", Q, "all", "driver",
      s.byDriver.map((d: { driver: string | null; trips: number }) => ({ key: d.driver, count: d.trips })));
  });

  it("rechten: rapportrecht en voertuig- of reserveringsrecht", async () => {
    const status = async (perms: string[]) => (await (await agentFor(perms)).get("/api/reports/deliveries/summary").query(Q)).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["view_vehicles"])).toBe(403);
    expect(await status(["view_reports", "view_vehicles"])).toBe(200);
    expect(await status(["view_reports", "view_reservations"])).toBe(200);
    expect(await status(["manage_reports", "manage_reservations"])).toBe(200);
  });
});

/**
 * Rapporten fase 2, Task 4 - the extra km and fuel report: same set as
 * "waarvan extra kosten" on Financieel, every tile equal to its list, and the
 * report permission alone (Kees: money reports need only the report right).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { EXTRA_COSTS_TILES } from "../../shared/reports/extra-costs-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("extra km and fuel report", () => {
  let staff: TestAgent;
  let V: number;
  let C: number;
  let customerName: string;
  let Q: Record<string, string>;

  const reservation = async (startDate: string, set: Record<string, unknown>, type?: string, status?: string) => {
    const r = await createFixtureReservation({ customerId: C, vehicleId: V, startDate, endDate: startDate, type, status });
    await db.update(reservations).set(set as any).where(eq(reservations.id, r.id));
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_reservations"]);
    const vehicle = await createFixtureVehicle();
    V = vehicle.id;
    const customer = await createFixtureCustomer("Meerkm");
    C = customer.id;
    customerName = customer.name;
    Q = { vehicleId: String(V), from: "2026-01-01", to: "2026-12-31" };
    await reservation("2026-02-01", { extraKm: 120, extraKmCost: "30.00", fuelCost: "25.50" });
    await reservation("2026-02-15", { extraKm: 0, fuelCost: "40.00" });
    await reservation("2026-02-20", { extraKmCost: "99.00" }, "standard", "cancelled");
    await reservation("2026-02-21", { extraKmCost: "77.00", deletedAt: new Date() });
    await reservation("2026-02-22", { extraKmCost: "11.00" }, "replacement");
    await reservation("2026-02-25", { extraKmCost: "-5.00", fuelCost: "10.00" });
    await reservation("2025-12-20", { extraKmCost: "50.00" });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels, totaal meer-km en maandverdeling", async () => {
    const s = (await staff.get("/api/reports/extra-costs/summary").query(Q)).body;
    expect(s.tiles).toEqual({ extraKm: { count: 2, amount: 25 }, fuel: { count: 3, amount: 75.5 }, withExtraKm: { count: 1, amount: 30 } });
    expect(s.totalExtraKm).toBe(120);
    expect(s.byMonth).toEqual([{ month: "2026-02", extraKmCost: 25, fuelCost: 75.5 }]);
    // the chart adds up the same rows as the tiles (a negative correction stays out of the extra km tile)
    // money is net: tiles = chart = breakdowns = Financieel
    const net = s.tiles.extraKm.amount + s.tiles.fuel.amount;
    expect(net).toBe(100.5);
    expect(s.byCustomer.reduce((n: number, r: { amount: number }) => n + r.amount, 0)).toBe(net);
    expect(s.byVehicle.reduce((n: number, r: { amount: number }) => n + r.amount, 0)).toBe(net);
    expect(s.byMonth.reduce((n: number, m: { extraKmCost: number }) => n + m.extraKmCost, 0)).toBe(s.tiles.extraKm.amount);
    expect(s.byMonth.reduce((n: number, m: { fuelCost: number }) => n + m.fuelCost, 0)).toBe(s.tiles.fuel.amount);
    expect(s.byCustomer).toEqual([{ key: C, label: customerName, count: 3, amount: 100.5 }]);
    expect(s.byVehicle).toHaveLength(1);
    expect(s.byVehicle[0].amount).toBe(100.5);
  });

  it("klopt met waarvan extra kosten op Financieel", async () => {
    const fin = (await staff.get("/api/reports/vehicle-financials").query({ from: "2026-01-01", to: "2026-12-31", vehicleId: V })).body;
    expect(fin.totals.extraCosts).toBe(100.5);
  });

  it("elke tegel opent precies zijn rijen", async () => {
    await expectTilesMatchRows(staff, "/api/reports/extra-costs", Q, EXTRA_COSTS_TILES);
  });

  it("rechten: alleen het rapportrecht", async () => {
    const reservationsOnly = await agentFor(["view_reservations", "manage_reservations"]);
    expect((await reservationsOnly.get("/api/reports/extra-costs/summary").query(Q)).status).toBe(403);
    const reportsOnly = await agentFor(["view_reports"]);
    expect((await reportsOnly.get("/api/reports/extra-costs/summary").query(Q)).status).toBe(200);
  });
});

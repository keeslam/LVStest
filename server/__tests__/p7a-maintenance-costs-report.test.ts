/**
 * Audit A-14-2 (package P7a): "Analyse onderhoudskosten" counted every expense
 * as maintenance, split one category over two spellings, divided by the
 * odometers of the whole fleet (EUR 0.01 per km) and reported nothing the
 * brand rating could stand on. The guard stays view_reports / manage_reports.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { registerReportRoutes } from "../routes/reports";
import { UserPermission, expenses, vehicles } from "../../shared/schema";
import { MAINTENANCE_EXPENSE_CATEGORIES } from "../../shared/expense-categories";
import { buildStaffTestApp } from "./portal-helpers";

const BRAND = "P7A-BRAND";
const BRAND_EMPTY = "P7A-EMPTY";

describe("GET /api/reports/maintenance-costs (A-14-2)", () => {
  const app = buildStaffTestApp([UserPermission.VIEW_REPORTS], registerReportRoutes);
  const outsider = buildStaffTestApp([], registerReportRoutes);
  const vehicleIds: number[] = [];
  const expenseIds: number[] = [];
  let withCosts: number;
  let withCosts2: number;
  let noExpenses: number;
  let noKm: number;

  const addVehicle = async (plate: string, brand: string, mileage: number | null) => {
    const [row] = await db.insert(vehicles).values({ licensePlate: plate, brand, model: "M", currentMileage: mileage }).returning();
    vehicleIds.push(row.id);
    return row.id;
  };
  const addExpense = async (vehicleId: number, category: string, amount: string, date = "2026-09-10") => {
    const [row] = await db.insert(expenses).values({ vehicleId, category, amount, date, description: "p7a" }).returning();
    expenseIds.push(row.id);
  };
  const report = async (query = `?brand=${BRAND}`, who = app) => request(who).get(`/api/reports/maintenance-costs${query}`);

  beforeAll(async () => {
    withCosts = await addVehicle("P7A-001", BRAND, 100000);
    withCosts2 = await addVehicle("P7A-002", BRAND, 50000);
    noExpenses = await addVehicle("P7A-003", BRAND, 900000); // a fleet vehicle with no costs: must not dilute cost per km
    noKm = await addVehicle("P7A-004", BRAND_EMPTY, null);
    await addExpense(withCosts, "maintenance", "100.00");
    await addExpense(withCosts, "Maintenance ", "50.00"); // a dump restored before the startup migration lower-cased it
    await addExpense(withCosts, "tires", "200.00");
    await addExpense(withCosts2, "brakes", "150.00");
    await addExpense(withCosts2, "fuel", "999.00");
    await addExpense(withCosts2, "toll", "888.00");
    await addExpense(withCosts2, "insurance", "777.00");
    await addExpense(noKm, "maintenance", "25.50");
  });
  afterAll(async () => {
    await db.delete(expenses).where(inArray(expenses.id, expenseIds));
    await db.delete(vehicles).where(inArray(vehicles.id, vehicleIds));
  });

  it("names the maintenance categories as one constant: maintenance, tires, brakes", () => {
    expect([...MAINTENANCE_EXPENSE_CATEGORIES]).toEqual(["maintenance", "tires", "brakes"]);
  });

  it("counts maintenance-related categories only", async () => {
    const res = await report();
    expect(res.status).toBe(200);
    // 100 + 50 + 200 + 150; the fuel, toll and insurance rows are not maintenance
    expect(res.body.totalCosts).toBeCloseTo(500, 2);
    expect(res.body.totalVehicles).toBe(2);
    expect(res.body.categories).toEqual(["maintenance", "tires", "brakes"]);
    expect(res.body.vehicleDetails.reduce((s: number, v: any) => s + v.expenseCount, 0)).toBe(4);
    expect(res.body.brandComparison).toHaveLength(1);
    expect(res.body.brandComparison[0].totalCost).toBeCloseTo(500, 2);
  });

  it("groups on lower(btrim(category)): 'Maintenance ' and 'maintenance' are one line", async () => {
    const res = await report();
    const keys = res.body.categoryBreakdown.map((c: any) => c.category).sort();
    expect(keys).toEqual(["brakes", "maintenance", "tires"]);
    const maintenance = res.body.categoryBreakdown.find((c: any) => c.category === "maintenance");
    expect(maintenance.amount).toBeCloseTo(150, 2);
    expect(maintenance.percentage).toBeCloseTo(30, 2);
  });

  it("divides by the kilometres of the vehicles that carry the costs, not by the whole fleet", async () => {
    const res = await report();
    // 500 / (100000 + 50000); the 900000 km vehicle without costs is left out
    expect(res.body.averageCostPerKm).toBeCloseTo(500 / 150000, 6);
    const v1 = res.body.vehicleDetails.find((v: any) => v.vehicleId === withCosts);
    expect(v1.costPerKm).toBeCloseTo(350 / 100000, 6);
  });

  it("has no cost per km in a period view: period costs over a lifetime odometer is not a rate (fix round 1, I-1)", async () => {
    const res = await report(`?brand=${BRAND}&timeRange=year`);
    expect(res.status).toBe(200);
    expect(res.body.totalCosts).toBeCloseTo(500, 2); // the costs themselves still follow the period
    expect(res.body.averageCostPerKm).toBeNull();
    expect(res.body.costPerKmAvailable).toBe(false);
    for (const v of res.body.vehicleDetails) expect(v.costPerKm).toBeNull();
    const all = await report(`?brand=${BRAND}&timeRange=all`);
    expect(all.body.costPerKmAvailable).toBe(true);
    expect(all.body.averageCostPerKm).toBeCloseTo(500 / 150000, 6);
  });

  it("has no cost per km (null, not 0) when the vehicles with costs have no kilometres", async () => {
    const res = await report(`?brand=${BRAND_EMPTY}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCosts).toBeCloseTo(25.5, 2);
    expect(res.body.averageCostPerKm).toBeNull();
    expect(res.body.vehicleDetails[0].costPerKm).toBeNull();
  });

  it("returns the monthly trend as yyyy-MM keys, so the client labels the month in Dutch", async () => {
    const res = await report();
    expect(res.body.monthlyTrend).toHaveLength(12);
    for (const point of res.body.monthlyTrend) expect(point.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("reports the number of cost lines per brand, for the rating threshold", async () => {
    const res = await report();
    expect(res.body.brandComparison[0].expenseCount).toBe(4);
    expect((await report(`?brand=${BRAND_EMPTY}`)).body.brandComparison[0].expenseCount).toBe(1);
  });

  it("keeps the same guard: no view_reports, no report", async () => {
    expect((await report("", outsider)).status).toBe(403);
  });
});

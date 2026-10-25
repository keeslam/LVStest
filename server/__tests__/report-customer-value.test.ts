/**
 * Rapporten fase 4, Task 1 - the customer value report: revenue and rental days per
 * customer from exactly the Financieel set, costs caused by the customer (fines, return
 * checks with damage, extra km, fuel), behaviour (late returns, cancellations, portal
 * requests), the top-10 rankings, and the report permission alone.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { fines, interactiveDamageChecks, portalRequests, reservations } from "../../shared/schema";
import { CUSTOMER_VALUE_TILES } from "../../shared/reports/customer-value-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("customer value report", () => {
  let staff: TestAgent;
  let V: number;
  let A: number;
  let B: number;
  let nameA: string;
  let nameB: string;
  let Q: Record<string, string>;
  const fineIds: number[] = [];
  const checkIds: number[] = [];
  const requestIds: number[] = [];

  const reservation = async (
    customerId: number,
    startDate: string,
    endDate: string | null,
    set: Record<string, unknown>,
    type?: string,
    status?: string,
  ): Promise<number> => {
    const r = await createFixtureReservation({ customerId, vehicleId: V, startDate, endDate, type, status });
    if (Object.keys(set).length) await db.update(reservations).set(set as any).where(eq(reservations.id, r.id));
    return r.id;
  };

  const fine = async (customerId: number | null, offenceAt: string, status: string, totalAmount: string) => {
    const [f] = await db.insert(fines).values({
      licensePlate: "FIX-CV", vehicleId: V, offenceAt: new Date(offenceAt), description: "test",
      amount: totalAmount, totalAmount, status, customerId,
    }).returning();
    fineIds.push(f.id);
  };

  const check = async (reservationId: number, checkType: string, checkDate: string, damageMarkers: string | null) => {
    const [c] = await db.insert(interactiveDamageChecks).values({
      vehicleId: V, reservationId, checkType, checkDate: new Date(checkDate), damageMarkers,
    }).returning();
    checkIds.push(c.id);
  };

  const request = async (customerId: number, reservationId: number | null, createdAt: string) => {
    const [p] = await db.insert(portalRequests).values({
      customerId, reservationId, type: "other", message: "hallo", createdAt: new Date(createdAt),
    }).returning();
    requestIds.push(p.id);
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports"]);
    V = (await createFixtureVehicle()).id;
    const a = await createFixtureCustomer("Waarde-A");
    const b = await createFixtureCustomer("Waarde-B");
    A = a.id; nameA = a.name;
    B = b.id; nameB = b.name;
    Q = { vehicleId: String(V), from: "2026-01-01", to: "2026-12-31" };

    const r1 = await reservation(A, "2026-03-01", "2026-03-05",
      { actualReturnDate: "2026-03-07", totalPrice: "500", extraKmCost: "30", fuelCost: "20" }, "standard", "returned");
    const r2 = await reservation(A, "2026-04-01", "2026-04-02", { actualReturnDate: "2026-04-02", totalPrice: "200" });
    await reservation(A, "2026-05-01", "2026-05-01", { totalPrice: "999" }, "standard", "cancelled");
    await reservation(A, "2026-05-10", "2026-05-10", { totalPrice: "777", deletedAt: new Date() });
    await reservation(A, "2026-06-01", "2026-06-01", { totalPrice: "111" }, "replacement");
    const r6 = await reservation(A, "2025-12-20", "2025-12-20", { totalPrice: "50" });
    const r7 = await reservation(B, "2026-07-01", "2026-07-10", { actualReturnDate: "2026-07-10", totalPrice: "1000" });

    await fine(A, "2026-03-03T10:00:00Z", "linked", "45");
    await fine(A, "2026-03-04T10:00:00Z", "cancelled", "60");
    await fine(B, "2026-07-05T10:00:00Z", "new", "120");
    await fine(null, "2026-08-01T10:00:00Z", "new", "15");

    await check(r1, "return", "2026-03-07T10:00:00Z", '[{"x":0.1,"y":0.2}]');
    await check(r1, "pickup", "2026-03-01T10:00:00Z", '[{"x":0.3,"y":0.4}]');
    await check(r2, "return", "2026-04-02T10:00:00Z", "[]");
    await check(r7, "return", "2026-07-10T10:00:00Z", "geen json");
    await check(r6, "return", "2026-01-02T10:00:00Z", null);

    await request(A, r1, "2026-03-02T10:00:00Z");
    await request(A, null, "2026-03-03T10:00:00Z");
  });

  afterAll(async () => {
    if (requestIds.length) await db.delete(portalRequests).where(inArray(portalRequests.id, requestIds));
    if (checkIds.length) await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.id, checkIds));
    if (fineIds.length) await db.delete(fines).where(inArray(fines.id, fineIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels", async () => {
    const s = (await staff.get("/api/reports/customer-value/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      revenue: { count: 2, amount: 1750 }, costs: { count: 3, amount: 230 },
      late: { count: 1, amount: 1 }, cancelled: { count: 1, amount: 1 }, requests: { count: 1, amount: 1 },
    });
  });

  it("rij van klant A", async () => {
    const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...Q, tile: "revenue" })).body.rows;
    expect(rows.find((r: any) => r.customerId === A)).toEqual({
      customerId: A, customerName: nameA, rentals: 2, rentalDays: 9, revenue: 750, extraKmCost: 30, fuelCost: 20,
      finesCount: 1, finesAmount: 45, damageChecks: 1, lateReturns: 1, cancellations: 1, portalRequests: 1, costs: 95, amount: 750,
    });
  });

  it("zonder voertuigfilter telt ook de aanvraag zonder reservering", async () => {
    const { vehicleId: _vehicleId, ...noVehicle } = Q;
    const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...noVehicle, tile: "requests", pageSize: "250" })).body.rows;
    expect(rows.find((r: any) => r.customerId === A).portalRequests).toBe(2);
  });

  it("top 10", async () => {
    const s = (await staff.get("/api/reports/customer-value/summary").query(Q)).body;
    expect(s.topRevenue).toEqual([{ key: B, label: nameB, count: 1, amount: 1000 }, { key: A, label: nameA, count: 2, amount: 750 }]);
    expect(s.topCosts).toEqual([
      { key: B, label: nameB, count: 1, amount: 120 },
      { key: A, label: nameA, count: 2, amount: 95 },
      { key: null, label: null, count: 0, amount: 15 },
    ]);
  });

  it("klopt met Financieel en met het bekeuringenrapport", async () => {
    const fin = (await staff.get("/api/reports/vehicle-financials").query(Q)).body;
    expect(fin.totals.revenue).toBe(1750);
    expect(fin.totals.rentalDays).toBe(19);
    const all = (await staff.get("/api/reports/customer-value/export").query({ ...Q, tile: "costs" })).body.rows;
    const finesSummary = (await staff.get("/api/reports/fines/summary").query(Q)).body;
    expect(finesSummary.tiles.total.amount).toBe(180);
    expect(all.reduce((n: number, r: any) => n + r.finesAmount, 0)).toBe(finesSummary.tiles.total.amount);
  });

  it("elke tegel opent precies zijn rijen", async () => {
    await expectTilesMatchRows(staff, "/api/reports/customer-value", Q, CUSTOMER_VALUE_TILES);
  });

  it("rechten: alleen het rapportrecht", async () => {
    const reportsOnly = await agentFor(["view_reports"]);
    expect((await reportsOnly.get("/api/reports/customer-value/summary").query(Q)).status).toBe(200);
    const customersOnly = await agentFor(["view_customers", "manage_customers"]);
    expect((await customersOnly.get("/api/reports/customer-value/summary").query(Q)).status).toBe(403);
    expect((await customersOnly.get("/api/reports/customer-value/rows").query({ ...Q, tile: "revenue" })).status).toBe(403);
    expect((await customersOnly.get("/api/reports/customer-value/export").query({ ...Q, tile: "revenue" })).status).toBe(403);
  });
});

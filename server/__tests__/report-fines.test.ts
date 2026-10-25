/**
 * Rapporten fase 2, Task 3 - the fines report: tiles per step, old statuses
 * apart, total without cancelled, every tile equal to its list, and the
 * report permission alone (Kees: money reports need only the report right).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { drivers, fines } from "../../shared/schema";
import { FINE_REPORT_TILES } from "../../shared/reports/fines-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("fines report", () => {
  let staff: TestAgent;
  let reportsOnly: TestAgent;
  let finesOnly: TestAgent;
  let V: number;
  let C: number;
  let customerName: string;
  let D: number;
  let Q: Record<string, string>;
  const ids: number[] = [];

  const fine = async (v: { offence: string; status: string; amount: string; received?: string; linkedAt?: string; customerId?: number; driverId?: number }) => {
    const [row] = await db.insert(fines).values({
      licensePlate: "FIXTFINE", vehicleId: V, offenceAt: new Date(v.offence), receivedAt: v.received ?? null,
      description: `omschrijving ${v.status} ${v.amount}`, amount: v.amount, adminFee: "0.00", totalAmount: v.amount,
      status: v.status, linkedAt: v.linkedAt ? new Date(v.linkedAt) : null, customerId: v.customerId ?? null, driverId: v.driverId ?? null,
    } as any).returning();
    ids.push(row.id);
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_fines"]);
    reportsOnly = await agentFor(["view_reports"]);
    finesOnly = await agentFor(["view_fines"]);
    const vehicle = await createFixtureVehicle();
    V = vehicle.id;
    const customer = await createFixtureCustomer("Boete");
    C = customer.id;
    customerName = customer.name;
    const [driver] = await db.insert(drivers).values({ customerId: C, displayName: "Fixture Bestuurder" } as any).returning();
    D = driver.id;
    Q = { vehicleId: String(V), from: "2026-01-01", to: "2026-12-31" };
    await fine({ offence: "2026-03-05T10:00:00Z", status: "new", amount: "100.00", received: "2026-03-10" });
    await fine({ offence: "2026-03-20T10:00:00Z", status: "linked", amount: "50.00", received: "2026-03-21", linkedAt: "2026-03-25T09:00:00Z", customerId: C, driverId: D });
    await fine({ offence: "2026-04-02T10:00:00Z", status: "cancelled", amount: "30.00" });
    await fine({ offence: "2026-04-10T10:00:00Z", status: "paid", amount: "40.00", received: "2026-04-11", linkedAt: "2026-04-13T09:00:00Z" });
    await fine({ offence: "2026-04-15T10:00:00Z", status: "charged", amount: "20.00" });
    await fine({ offence: "2025-12-31T23:30:00Z", status: "new", amount: "5.00" });
    await fine({ offence: "2026-12-31T23:30:00Z", status: "new", amount: "7.00" });
    await fine({ offence: "2026-05-05T10:00:00Z", status: "mystery", amount: "11.00" });
  });

  afterAll(async () => {
    if (ids.length) await db.delete(fines).where(inArray(fines.id, ids));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels per stap, oud apart, totaal zonder vervallen", async () => {
    const s = (await staff.get("/api/reports/fines/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      new: { count: 2, amount: 105 }, linked: { count: 1, amount: 50 }, cancelled: { count: 1, amount: 30 },
      legacy: { count: 2, amount: 60 }, total: { count: 6, amount: 226 },
    });
    expect(s.avgDaysToLink).toBe(3);
    expect(s.byMonth.map((m: { month: string }) => m.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(s.byMonth[0]).toEqual({ month: "2026-01", new: 5, linked: 0, cancelled: 0, legacy: 0 });
    expect(s.byCustomer).toContainEqual({ key: C, label: customerName, count: 1, amount: 50 });
    expect(s.byCustomer).toContainEqual({ key: null, label: null, count: 5, amount: 176 });
  });

  it("elk tegel opent precies zijn rijen", async () => {
    await expectTilesMatchRows(staff, "/api/reports/fines", Q, FINE_REPORT_TILES);
  });

  it("legacy-lijst bevat paid en charged, nieuwste eerst", async () => {
    const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "legacy" })).body;
    expect(r.rows.map((x: { status: string }) => x.status)).toEqual(["charged", "paid"]);
  });

  it("rijen dragen de bestuurder-id voor de link naar de bestuurder", async () => {
    const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "linked" })).body;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ driverId: D, driverName: "Fixture Bestuurder", customerId: C });
    const n = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "new" })).body;
    expect(n.rows.every((x: { driverId: number | null }) => x.driverId === null)).toBe(true);
  });

  it("rechten: alleen het rapportrecht", async () => {
    expect((await reportsOnly.get("/api/reports/fines/summary").query(Q)).status).toBe(200);
    expect((await finesOnly.get("/api/reports/fines/summary").query(Q)).status).toBe(403);
    const manager = await agentFor(["manage_reports"]);
    expect((await manager.get("/api/reports/fines/rows").query({ ...Q, tile: "new" })).status).toBe(200);
  });
});

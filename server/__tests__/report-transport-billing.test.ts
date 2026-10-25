/**
 * Rapporten fase 2, Task 5 - the transport billing report: not invoiced / invoiced / toll tiles,
 * the open-all-periods tile, a missing amount counting 0, external vehicles, every tile equal to
 * its list, notInvoiced only for completed transports, and the report permission alone.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicleTransports } from "../../shared/schema";
import { TRANSPORT_BILLING_TILES } from "../../shared/reports/transport-billing-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

describe("transport billing report", () => {
  let staff: TestAgent;
  let V: number;
  let C: number;
  let Q: Record<string, string>;
  let t1: number, t2: number, t4: number, tx: number, tOld: number, tSched: number, tBusy: number;
  let externalId: number;

  const transport = async (v: Record<string, unknown>) => {
    const [row] = await db.insert(vehicleTransports).values({ vehicleId: V, customerId: C, status: "scheduled", ...v } as any).returning();
    return row.id;
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_vehicles"]);
    V = (await createFixtureVehicle()).id;
    C = (await createFixtureCustomer("Transport")).id;
    Q = { vehicleId: String(V), from: "2026-05-01", to: "2026-06-30" };
    t1 = await transport({ transportType: "tow", status: "completed", scheduledDate: "2026-05-02", completedDate: "2026-05-03", billable: true, billableAmount: "150.00", tollCost: "12.40" });
    t2 = await transport({ transportType: "swap", scheduledDate: "2026-05-10", billable: true, billableAmount: "80.00", invoiced: true, invoicedDate: "2026-05-20" });
    await transport({ transportType: "delivery", status: "cancelled", scheduledDate: "2026-05-12", billable: true, billableAmount: "500.00" });
    t4 = await transport({ transportType: "other", status: "completed", scheduledDate: "2026-06-01", billable: true });
    await transport({ transportType: "repossession", scheduledDate: "2026-06-03", billable: false, tollCost: "7.60" });
    // outside the period: only the open-all-periods tile sees it
    tOld = await transport({ transportType: "tow", status: "completed", scheduledDate: "2026-01-15", billable: true, billableAmount: "40.00" });
    // billable but not done yet: cannot be invoiced, so neither notInvoiced nor openAllTime counts it
    tSched = await transport({ transportType: "delivery", status: "scheduled", scheduledDate: "2026-06-10", billable: true, billableAmount: "999.00" });
    tBusy = await transport({ transportType: "tow", status: "in_progress", scheduledDate: "2026-05-15", billable: true, billableAmount: "333.00" });
    // external vehicle, no fleet vehicle
    const [ext] = await db.insert(vehicleTransports).values({
      vehicleId: null, isExternalVehicle: true, externalLicensePlate: "FIXT-EXT1", customerId: C,
      transportType: "tow", status: "completed", scheduledDate: "2026-06-05", billable: true, billableAmount: "60.00",
    } as any).returning();
    tx = ext.id;
    externalId = ext.id;
  });

  afterAll(async () => {
    await db.delete(vehicleTransports).where(eq(vehicleTransports.id, externalId));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels, ontbrekend bedrag, soorten en maanden", async () => {
    const s = (await staff.get("/api/reports/transport-billing/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      notInvoiced: { count: 2, amount: 150 },
      invoiced: { count: 1, amount: 80 },
      toll: { count: 2, amount: 20 },
      openAllTime: { count: 3, amount: 190 },
    });
    expect(s.missingAmount).toBe(1);
    expect(s.byType).toEqual([
      { type: "swap", count: 1, billable: 80, notInvoiced: 0, toll: 0 },
      { type: "tow", count: 2, billable: 483, notInvoiced: 150, toll: 12.4 },
      { type: "repossession", count: 1, billable: 0, notInvoiced: 0, toll: 7.6 },
      { type: "delivery", count: 1, billable: 999, notInvoiced: 0, toll: 0 },
      { type: "other", count: 1, billable: 0, notInvoiced: 0, toll: 0 },
    ]);
    expect(s.byMonth.find((m: { month: string }) => m.month === "2026-05")).toEqual({ month: "2026-05", invoiced: 80, notInvoiced: 150, toll: 12.4 });
  });

  it("openAllTime negeert de periode, notInvoiced niet", async () => {
    const all = (await staff.get("/api/reports/transport-billing/rows").query({ ...Q, tile: "openAllTime" })).body;
    expect(all.rows.map((r: { id: number }) => r.id)).toContain(tOld);
    const period = (await staff.get("/api/reports/transport-billing/rows").query({ ...Q, tile: "notInvoiced" })).body;
    expect(period.rows.map((r: { id: number }) => r.id)).not.toContain(tOld);
    expect(period.rows.map((r: { id: number }) => r.id).sort()).toEqual([t1, t4].sort());
    expect(t2).toBeGreaterThan(0);
  });

  it("nog te factureren telt alleen afgeronde transporten (gepland of onderweg kan nog niet gefactureerd)", async () => {
    for (const tile of ["notInvoiced", "openAllTime"]) {
      const ids = (await staff.get("/api/reports/transport-billing/export").query({ ...Q, tile })).body.rows.map((r: { id: number }) => r.id);
      expect(ids).not.toContain(tSched);
      expect(ids).not.toContain(tBusy);
    }
  });

  it("bedrag ontbreekt: telt mee met 0 en billableAmount null", async () => {
    const r = (await staff.get("/api/reports/transport-billing/rows").query({ ...Q, tile: "notInvoiced" })).body;
    const row = r.rows.find((x: { id: number }) => x.id === t4);
    expect(row.billableAmount).toBeNull();
    expect(row.amount).toBe(0);
  });

  it("extern voertuig zonder voertuigfilter, met eigen kenteken", async () => {
    const e = (await staff.get("/api/reports/transport-billing/export").query({ from: "2026-06-05", to: "2026-06-05", tile: "notInvoiced" })).body;
    expect(e.rows.find((x: { id: number }) => x.id === tx).licensePlate).toBe("FIXT-EXT1");
  });

  it("elke tegel opent precies zijn rijen", async () => {
    await expectTilesMatchRows(staff, "/api/reports/transport-billing", Q, TRANSPORT_BILLING_TILES);
  });

  it("uitsplitsing: de soorten samen zijn precies de tegel", async () => {
    const s = (await staff.get("/api/reports/transport-billing/summary").query(Q)).body;
    for (const tile of ["notInvoiced", "invoiced", "toll"]) {
      let sum = 0;
      for (const t of s.byType as Array<{ type: string }>) {
        const r = await staff.get("/api/reports/transport-billing/rows").query({ ...Q, tile, drill: "type", key: t.type });
        expect(r.status).toBe(200);
        sum += r.body.total;
      }
      expect(sum, tile).toBe(s.tiles[tile].count);
    }
  });

  it("rechten: alleen het rapportrecht", async () => {
    const noReports = await agentFor(["view_vehicles", "view_reservations"]);
    expect((await noReports.get("/api/reports/transport-billing/summary").query(Q)).status).toBe(403);
    const reportsOnly = await agentFor(["manage_reports"]);
    expect((await reportsOnly.get("/api/reports/transport-billing/summary").query(Q)).status).toBe(200);
  });
});

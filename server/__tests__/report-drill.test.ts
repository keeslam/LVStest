/**
 * Rapporten deel 1b, Task 1 - drill-down on /rows and /export: one breakdown line
 * (drill + key, key=__null for "none") or one month (month=YYYY-MM) of a report.
 * Shown on the fines report; the other kit reports have a case in their own test file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { fines } from "../../shared/schema";
import { REPORT_DRILL_NULL_KEY } from "../../shared/report-kit";
import { FINE_REPORT_DRILLS } from "../../shared/reports/fines-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines } from "./helpers/report-kit";

describe("report drill-down (fines)", () => {
  let staff: TestAgent;
  let A: number;
  let B: number;
  let Q: Record<string, string>;
  const ids: number[] = [];

  const fine = async (offence: string, customerId: number | null) => {
    const [row] = await db.insert(fines).values({
      licensePlate: "FIXTDRIL", vehicleId: Number(Q.vehicleId), offenceAt: new Date(offence), description: "drill",
      amount: "10.00", adminFee: "0.00", totalAmount: "10.00", status: "new", customerId,
    } as any).returning();
    ids.push(row.id);
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports"]);
    const vehicle = await createFixtureVehicle();
    A = (await createFixtureCustomer("DrillA")).id;
    B = (await createFixtureCustomer("DrillB")).id;
    Q = { vehicleId: String(vehicle.id), from: "2026-01-01", to: "2026-03-31" };
    await fine("2026-01-10T10:00:00Z", A);
    await fine("2026-02-10T10:00:00Z", A);
    await fine("2026-02-20T10:00:00Z", A);
    await fine("2026-03-10T10:00:00Z", B);
    await fine("2026-03-11T10:00:00Z", null);
  });

  afterAll(async () => {
    if (ids.length) await db.delete(fines).where(inArray(fines.id, ids));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("the null key constant and the drill names are shared", () => {
    expect(REPORT_DRILL_NULL_KEY).toBe("__null");
    expect(FINE_REPORT_DRILLS).toEqual(["customer", "vehicle", "driver"]);
  });

  it("customer drill: rows equal the breakdown count, null key = none", async () => {
    const s = (await staff.get("/api/reports/fines/summary").query(Q)).body;
    expect(s.byCustomer).toContainEqual({ key: A, label: expect.any(String), count: 3, amount: 30 });
    const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", drill: "customer", key: String(A) })).body;
    expect(r.total).toBe(3);
    expect(r.rows).toHaveLength(3);
    const none = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", drill: "customer", key: "__null" })).body;
    expect(none.total).toBe(1);
    await expectDrillMatchesLines(staff, "/api/reports/fines", Q, "total", "customer", s.byCustomer);
    await expectDrillMatchesLines(staff, "/api/reports/fines", Q, "total", "vehicle", s.byVehicle);
  });

  it("a key that does not exist (or is not a number) gives an empty list, never an error", async () => {
    const r = await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", drill: "customer", key: "abc" });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });

  it("unknown drill name or a drill without key: 400 INVALID_DRILL", async () => {
    for (const q of [{ drill: "bogus", key: "1" }, { drill: "customer" }]) {
      for (const route of ["rows", "export"]) {
        const r = await staff.get(`/api/reports/fines/${route}`).query({ ...Q, tile: "total", ...q });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("INVALID_DRILL");
      }
    }
  });

  it("month narrows the period to that month", async () => {
    const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", month: "2026-02" })).body;
    expect(r.total).toBe(2);
    const both = (await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", month: "2026-03", drill: "customer", key: "__null" })).body;
    expect(both.total).toBe(1);
  });

  it("month outside the period: 200 and empty; bad month: 400 INVALID_DRILL", async () => {
    const out = await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", month: "2026-07" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ rows: [], total: 0 });
    const outExport = await staff.get("/api/reports/fines/export").query({ ...Q, tile: "total", month: "2026-07" });
    expect(outExport.body).toEqual({ rows: [], truncated: false });
    for (const month of ["2026-13", "2026-2", "feb", "2026-02-01"]) {
      const bad = await staff.get("/api/reports/fines/rows").query({ ...Q, tile: "total", month });
      expect(bad.status, month).toBe(400);
      expect(bad.body.code).toBe("INVALID_DRILL");
    }
  });

  it("a month partly in the period only shows the part inside", async () => {
    const r = (await staff.get("/api/reports/fines/rows").query({ ...Q, from: "2026-02-15", tile: "total", month: "2026-02" })).body;
    expect(r.total).toBe(1);
  });

  it("export with drill and month gives the same rows as rows", async () => {
    const q = { ...Q, tile: "total", drill: "customer", key: String(A), month: "2026-02" };
    const rows = (await staff.get("/api/reports/fines/rows").query(q)).body;
    const exported = (await staff.get("/api/reports/fines/export").query(q)).body;
    expect(rows.total).toBe(2);
    expect(exported.rows.map((x: { id: number }) => x.id).sort()).toEqual(rows.rows.map((x: { id: number }) => x.id).sort());
  });

  it("summary ignores drill and month", async () => {
    const plain = (await staff.get("/api/reports/fines/summary").query(Q)).body;
    const withDrill = (await staff.get("/api/reports/fines/summary").query({ ...Q, drill: "customer", key: String(A), month: "2026-02" })).body;
    expect(withDrill.tiles).toEqual(plain.tiles);
  });
});

describe("report drill-down on reports without breakdowns", () => {
  let admin: TestAgent;
  beforeAll(async () => { admin = await agentFor("admin"); });
  afterAll(async () => { await cleanupFixtureUsers(); });

  const cases = [
    { path: "occupancy", tile: "rented" },
    { path: "maintenance-outlook", tile: "all" },
    { path: "fleet-mileage", tile: "driven" },
    { path: "invoice-inbox-runs", tile: "runs" },
  ];

  it.each(cases)("$path: drill is a 400, month works", async ({ path, tile }) => {
    const Q = { from: "2026-01-01", to: "2026-03-31", tile };
    for (const route of ["rows", "export"]) {
      const drill = await admin.get(`/api/reports/${path}/${route}`).query({ ...Q, drill: "customer", key: "1" });
      expect(drill.status, `${path} ${route}`).toBe(400);
      expect(drill.body.code).toBe("INVALID_DRILL");
    }
    const month = await admin.get(`/api/reports/${path}/rows`).query({ ...Q, month: "2026-02" });
    expect(month.status).toBe(200);
    const outside = await admin.get(`/api/reports/${path}/rows`).query({ ...Q, month: "2027-02" });
    expect(outside.status).toBe(200);
    expect(outside.body.total).toBe(0);
  });
});

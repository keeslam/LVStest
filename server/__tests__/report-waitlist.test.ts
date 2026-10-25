/**
 * Rapporten fase 4, Task 3 - the waitlist report: tiles on the office day of created_at, months,
 * wanted type (own type, else the chosen vehicle's), average waiting days, every tile equal to its
 * list, and report right AND portal right.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { vehicleWaitlist } from "../../shared/schema";
import { WAITLIST_REPORT_TILES } from "../../shared/reports/waitlist-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

describe("waitlist report", () => {
  let staff: TestAgent;
  let V: number;
  let W2: number;
  const ids: number[] = [];
  const Q = { from: "2019-01-01", to: "2019-12-31" };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_portal"]);
    const W = (await createFixtureCustomer("Wacht")).id;
    V = (await createFixtureVehicle({ vehicleType: "bestelbus" })).id;
    const entry = async (v: Record<string, unknown>) => {
      const [row] = await db.insert(vehicleWaitlist).values({ customerId: W, preferredStartDate: "2019-06-01", ...v } as any).returning();
      ids.push(row.id);
      return row.id;
    };
    await entry({ vehicleType: "personenauto", status: "active", createdAt: new Date("2019-02-01T10:00:00Z") });
    W2 = await entry({ vehicleType: null, vehicleId: V, status: "fulfilled", createdAt: new Date("2019-02-05T10:00:00Z"), fulfilledAt: new Date("2019-02-15T10:00:00Z") });
    await entry({ vehicleType: "personenauto", status: "cancelled", createdAt: new Date("2019-03-01T10:00:00Z") });
    await entry({ vehicleType: "personenauto", status: "fulfilled", createdAt: new Date("2019-03-02T10:00:00Z"), fulfilledAt: new Date("2019-03-06T10:00:00Z") });
    await entry({ vehicleType: "  ", status: "contacted", createdAt: new Date("2019-03-03T10:00:00Z") });
    await entry({ vehicleType: "personenauto", status: "active", createdAt: new Date("2020-01-02T10:00:00Z") });
  });

  afterAll(async () => {
    if (ids.length) await db.delete(vehicleWaitlist).where(inArray(vehicleWaitlist.id, ids));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels, maanden, types en wachttijd", async () => {
    const s = (await staff.get("/api/reports/waitlist/summary").query(Q)).body;
    expect(s.tiles).toEqual({ all: { count: 5, amount: 0 }, open: { count: 2, amount: 0 }, fulfilled: { count: 2, amount: 0 }, cancelled: { count: 1, amount: 0 } });
    expect(s.byMonth).toEqual([{ month: "2019-02", open: 1, fulfilled: 1, cancelled: 0 }, { month: "2019-03", open: 1, fulfilled: 1, cancelled: 1 }]);
    expect(s.byType).toEqual([
      { vehicleType: "personenauto", total: 3, fulfilled: 1, notFulfilled: 2, avgDaysToFulfil: 4 },
      { vehicleType: null, total: 1, fulfilled: 0, notFulfilled: 1, avgDaysToFulfil: null },
      { vehicleType: "bestelbus", total: 1, fulfilled: 1, notFulfilled: 0, avgDaysToFulfil: 10 },
    ]);
    expect(s.avgDaysToFulfil).toBe(7);
  });

  it("rij met type van de gekozen auto", async () => {
    const r = (await staff.get("/api/reports/waitlist/rows").query({ ...Q, tile: "fulfilled", sort: "createdAt", dir: "asc" })).body.rows[0];
    expect(r).toMatchObject({ id: W2, vehicleType: "bestelbus", vehicleId: V, status: "fulfilled", daysToFulfil: 10, amount: 0 });
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/waitlist", Q, WAITLIST_REPORT_TILES));

  it("uitsplitsing: gewenst type (ook zonder) opent precies zijn regels", async () => {
    const s = (await staff.get("/api/reports/waitlist/summary").query(Q)).body;
    await expectDrillMatchesLines(staff, "/api/reports/waitlist", Q, "all", "type",
      s.byType.map((t: { vehicleType: string | null; total: number }) => ({ key: t.vehicleType, count: t.total })));
  });

  it("rechten: rapportrecht en portaalrecht", async () => {
    const status = async (perms: string[] | "admin") => (await (await agentFor(perms)).get("/api/reports/waitlist/summary").query(Q)).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["view_portal", "manage_portal"])).toBe(403);
    expect(await status(["view_reports", "view_portal"])).toBe(200);
    expect(await status(["manage_reports", "manage_portal"])).toBe(200);
    expect(await status("admin")).toBe(200);
  });
});

/**
 * Rapporten fase 4, Task 2 - the portal requests report: tiles on the office day of created_at,
 * the stale tile over all periods, months per status, kinds, median reaction time, handled per
 * staff member, every tile equal to its list, and report right AND portal right.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { portalRequestMessages, portalRequests } from "../../shared/schema";
import { PORTAL_REQUEST_REPORT_TILES } from "../../shared/reports/portal-requests-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

describe("portal requests report", () => {
  let staff: TestAgent;
  let P: number;
  let Q1: number, Q3: number, Q4: number, Q7: number, Q8: number, Q9: number;
  const Q = { from: "2019-01-01", to: "2019-12-31" };
  const DAY = 24 * 3600 * 1000;

  const request = async (v: Record<string, unknown>) => {
    const [row] = await db.insert(portalRequests).values({ customerId: P, message: "FIXT", ...v } as any).returning();
    return row.id;
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_portal"]);
    P = (await createFixtureCustomer("Portaal")).id;
    Q1 = await request({ type: "extension", status: "done", createdAt: new Date("2019-03-04T09:00:00Z"), repliedAt: new Date("2019-03-04T15:00:00Z"), handledBy: "anna" });
    await request({ type: "damage", status: "rejected", createdAt: new Date("2019-03-10T08:00:00Z"), repliedAt: new Date("2019-03-11T08:00:00Z"), handledBy: "anna" });
    Q3 = await request({ type: "extension", status: "in_progress", createdAt: new Date("2019-04-01T10:00:00Z"), handledBy: "bram" });
    Q4 = await request({ type: "other", status: "new", createdAt: new Date("2019-04-02T10:00:00Z") });
    Q7 = await request({ type: "other", status: "done", createdAt: new Date("2018-12-31T23:30:00Z"), repliedAt: new Date("2019-01-01T01:30:00Z"), handledBy: "bram" });
    await request({ type: "other", status: "new", createdAt: new Date("2019-12-31T23:30:00Z") });
    Q8 = await request({ type: "other", status: "new", createdAt: new Date(Date.now() - DAY) });
    Q9 = await request({ type: "other", status: "new", createdAt: new Date(Date.now() - 3 * DAY) });
    // Reaction time = created -> FIRST staff message; customer messages do not count.
    const message = (requestId: number, author: string, at: string) =>
      db.insert(portalRequestMessages).values({ requestId, author, authorName: "FIXT", body: "FIXT", createdAt: new Date(at) });
    await message(Q1, "customer", "2019-03-04T09:30:00Z");
    await message(Q1, "staff", "2019-03-04T10:00:00Z");
    await message(Q1, "staff", "2019-03-04T15:00:00Z");
    await message(Q7, "staff", "2019-01-01T00:00:00Z");
    await message(Q3, "staff", "2019-04-01T14:00:00Z");
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels, maanden, soorten, mediaan en afhandelaars", async () => {
    const s = (await staff.get("/api/reports/portal-requests/summary").query(Q)).body;
    expect({ all: s.tiles.all, open: s.tiles.open, done: s.tiles.done, rejected: s.tiles.rejected })
      .toEqual({ all: { count: 5, amount: 0 }, open: { count: 2, amount: 0 }, done: { count: 2, amount: 0 }, rejected: { count: 1, amount: 0 } });
    expect(s.byMonth).toEqual([
      { month: "2019-01", new: 0, inProgress: 0, done: 1, rejected: 0 },
      { month: "2019-02", new: 0, inProgress: 0, done: 0, rejected: 0 },
      { month: "2019-03", new: 0, inProgress: 0, done: 1, rejected: 1 },
      { month: "2019-04", new: 1, inProgress: 1, done: 0, rejected: 0 },
    ]);
    expect(s.byType).toEqual([
      { type: "extension", total: 2, open: 1, done: 1, rejected: 0 },
      { type: "other", total: 2, open: 1, done: 1, rejected: 0 },
      { type: "damage", total: 1, open: 0, done: 0, rejected: 1 },
    ]);
    // First staff reply per request: Q1 1h (not the 6h last reply), damage 24h (repliedAt), Q7 0.5h, Q3 4h.
    expect(s.medianReplyHours).toBe(2.5);
    expect(s.repliedCount).toBe(4);
    expect(s.byHandler).toEqual([{ key: "anna", label: "anna", count: 2, amount: 0 }, { key: "bram", label: "bram", count: 1, amount: 0 }]);
  });

  it("ouder dan 2 dagen: los van de periode", async () => {
    const ids = (await staff.get("/api/reports/portal-requests/export").query({ ...Q, tile: "stale" })).body.rows.map((r: any) => r.id);
    expect(ids).toEqual(expect.arrayContaining([Q3, Q4, Q9]));
    expect(ids).not.toContain(Q8);
  });

  it("rij", async () => {
    const r = (await staff.get("/api/reports/portal-requests/rows").query({ ...Q, tile: "done", sort: "createdAt", dir: "asc" })).body.rows[0];
    expect(r).toMatchObject({ id: Q7, type: "other", status: "done", customerId: P, handledBy: "bram", replyHours: 0.5, openDays: null, amount: 0 });
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/portal-requests", Q, PORTAL_REQUEST_REPORT_TILES));

  it("uitsplitsing: soort en afhandelaar openen precies hun regels", async () => {
    const s = (await staff.get("/api/reports/portal-requests/summary").query(Q)).body;
    await expectDrillMatchesLines(staff, "/api/reports/portal-requests", Q, "all", "type",
      s.byType.map((t: { type: string; total: number }) => ({ key: t.type, count: t.total })));
    await expectDrillMatchesLines(staff, "/api/reports/portal-requests", Q, "all", "handler", s.byHandler);
  });

  it("rechten: rapportrecht en portaalrecht", async () => {
    const status = async (perms: string[] | "admin") => (await (await agentFor(perms)).get("/api/reports/portal-requests/summary").query(Q)).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["view_portal", "manage_portal"])).toBe(403);
    expect(await status(["view_reports", "view_portal"])).toBe(200);
    expect(await status(["manage_reports", "manage_portal"])).toBe(200);
    expect(await status("admin")).toBe(200);
  });
});

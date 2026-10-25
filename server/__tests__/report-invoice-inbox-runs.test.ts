/**
 * Rapporten fase 5, Task 1 - the invoice inbox pickup rounds report: tiles on the office day of
 * started_at, months, retention hint, every tile equal to its list, report right AND expenses or
 * settings right, vehicle filter ignored.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { invoiceInboxRuns } from "../../shared/schema";
import { INBOX_RUN_REPORT_TILES } from "../../shared/reports/invoice-inbox-report";
import { dateInZone } from "../../shared/office-timezone";
import { officeTimeZone } from "../services/office-time";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { expectTilesMatchRows } from "./helpers/report-kit";

describe("invoice inbox runs report", () => {
  let staff: TestAgent;
  let R3: number;
  const ids: number[] = [];
  const Q = { from: "2019-01-01", to: "2019-12-31" };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "manage_expenses"]);
    const run = async (startedAt: string, v: Record<string, unknown>) => {
      const start = new Date(startedAt);
      const [row] = await db.insert(invoiceInboxRuns).values({
        startedAt: start, finishedAt: new Date(start.getTime() + 60_000), trigger: "scheduler", ...v,
      } as any).returning();
      ids.push(row.id);
      return row.id;
    };
    await run("2019-02-03T10:00:00Z", { mails: 3, attachments: 4, booked: 2, review: 1, skipped: 1, failed: 0 });
    await run("2019-02-20T10:00:00Z", { mails: 1, attachments: 0, review: 1 });
    R3 = await run("2019-04-05T10:00:00Z", { trigger: "manual", triggeredBy: "anna", mails: 2, attachments: 2, failed: 2, errors: ["Onderwerp A: timeout", "Onderwerp B: timeout"] });
    await run("2019-05-01T10:00:00Z", {});
    await run("2018-12-31T23:30:00Z", { mails: 1, attachments: 1, booked: 1 });
    await run("2019-12-31T23:30:00Z", { mails: 5 });
  });

  afterAll(async () => {
    if (ids.length) await db.delete(invoiceInboxRuns).where(inArray(invoiceInboxRuns.id, ids));
    await cleanupFixtureUsers();
  });

  it("tegels en maanden", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-runs/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      runs: { count: 5, amount: 5 }, mails: { count: 4, amount: 7 }, attachments: { count: 3, amount: 7 },
      booked: { count: 2, amount: 3 }, review: { count: 2, amount: 2 }, skipped: { count: 1, amount: 1 }, failed: { count: 1, amount: 2 },
    });
    expect(s.byMonth).toEqual([
      { month: "2019-01", runs: 1, mails: 1, attachments: 1, booked: 1, review: 0, skipped: 0, failed: 0 },
      { month: "2019-02", runs: 2, mails: 4, attachments: 4, booked: 2, review: 2, skipped: 1, failed: 0 },
      { month: "2019-03", runs: 0, mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0 },
      { month: "2019-04", runs: 1, mails: 2, attachments: 2, booked: 0, review: 0, skipped: 0, failed: 2 },
      { month: "2019-05", runs: 1, mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0 },
    ]);
    expect(s.retentionDays).toBe(90);
    const today = dateInZone(new Date(), officeTimeZone());
    expect(s.retentionCutoff).toBe(new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10));
  });

  it("rij", async () => {
    const rows = (await staff.get("/api/reports/invoice-inbox-runs/rows").query({ ...Q, tile: "failed" })).body.rows;
    expect(rows).toEqual([{ id: R3, startedAt: "2019-04-05T10:00:00.000Z", finishedAt: "2019-04-05T10:01:00.000Z", trigger: "manual", triggeredBy: "anna",
      mails: 2, attachments: 2, booked: 0, review: 0, skipped: 0, failed: 2, errors: ["Onderwerp A: timeout", "Onderwerp B: timeout"], amount: 2 }]);
  });

  it("negeert het voertuigfilter", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-runs/summary").query({ ...Q, vehicleId: "999999" })).body;
    expect(s.tiles.mails).toEqual({ count: 4, amount: 7 });
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/invoice-inbox-runs", Q, INBOX_RUN_REPORT_TILES));

  it("rechten: rapportrecht en kosten- of instellingenrecht", async () => {
    const status = async (perms: string[] | "admin", path = "summary", extra: Record<string, string> = {}) =>
      (await (await agentFor(perms)).get(`/api/reports/invoice-inbox-runs/${path}`).query({ ...Q, ...extra })).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["manage_expenses"])).toBe(403);
    expect(await status(["view_reports", "manage_expenses"])).toBe(200);
    expect(await status(["view_reports", "manage_settings"])).toBe(200);
    expect(await status("admin")).toBe(200);
    expect(await status("admin", "rows", { tile: "runs" })).toBe(200);
    expect(await status("admin", "export", { tile: "runs" })).toBe(200);
  });
});

/**
 * Rapporten fase 5, Task 2 - the invoice inbox items report: outcome per mail invoice (auto booked,
 * booked by staff, waiting, dismissed), months, most common review reasons, every tile equal to its
 * list, report right AND expenses right, and a review reason that survives booking.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { invoiceInboxItems, auditLogs } from "../../shared/schema";
import { INBOX_ITEM_REPORT_TILES } from "../../shared/reports/invoice-inbox-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

describe("invoice inbox items report", () => {
  let staff: TestAgent;
  let I2: number, I3: number;
  const ids: number[] = [];
  const Q = { from: "2019-01-01", to: "2019-12-31" };
  let n = 0;

  const item = async (receivedAt: string, v: Record<string, unknown>) => {
    n += 1;
    const [row] = await db.insert(invoiceInboxItems).values({
      attachmentHash: `fixt-inbox-${n}-${Date.now()}`, messageId: `<${n}@fixt>`, fromAddress: "lev@fixt.nl", subject: `Factuur ${n}`,
      receivedAt: new Date(receivedAt), ...v,
    } as any).returning();
    ids.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "manage_expenses"]);
    await item("2019-02-03T10:00:00Z", { status: "booked", createdBy: "scheduler", updatedBy: "scheduler" });
    I2 = await item("2019-02-04T10:00:00Z", { status: "booked", createdBy: "anna", updatedBy: "anna" });
    await db.insert(auditLogs).values({ action: "expense.inbox.book", resourceType: "invoice_inbox_item", resourceId: String(I2), username: "anna" });
    I3 = await item("2019-03-01T10:00:00Z", { status: "booked", createdBy: "scheduler", updatedBy: "bram" });
    await item("2019-03-02T10:00:00Z", { status: "review", reviewReason: "no_plate" });
    await item("2019-03-03T10:00:00Z", { status: "review", reviewReason: "no_plate" });
    await item("2019-03-04T10:00:00Z", { status: "dismissed", reviewReason: "unknown_sender", updatedBy: "bram" });
    await item("2018-12-31T23:30:00Z", { status: "review", reviewReason: "parse_failed" });
    await item("2019-02-05T10:00:00Z", { status: "booked", messageId: null, fromAddress: null, subject: null, mailDate: null, createdBy: "anna", updatedBy: "anna" });
    await item("2019-12-31T23:30:00Z", { status: "review", reviewReason: "no_plate" });
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.resourceId, String(I2)));
    if (ids.length) await db.delete(invoiceInboxItems).where(inArray(invoiceInboxItems.id, ids));
    await cleanupFixtureUsers();
  });

  it("tegels, maanden en redenen", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query(Q)).body;
    expect(s.tiles).toEqual({
      all: { count: 7, amount: 0 }, autoBooked: { count: 1, amount: 0 }, staffBooked: { count: 2, amount: 0 },
      waiting: { count: 3, amount: 0 }, dismissed: { count: 1, amount: 0 }, flagged: { count: 4, amount: 0 },
    });
    expect(s.byMonth).toEqual([
      { month: "2019-01", autoBooked: 0, staffBooked: 0, waiting: 1, dismissed: 0 },
      { month: "2019-02", autoBooked: 1, staffBooked: 1, waiting: 0, dismissed: 0 },
      { month: "2019-03", autoBooked: 0, staffBooked: 1, waiting: 2, dismissed: 1 },
    ]);
    expect(s.byReason).toEqual([{ reason: "no_plate", count: 2 }, { reason: "parse_failed", count: 1 }, { reason: "unknown_sender", count: 1 }]);
  });

  it("zelf opgehaald en zelf geboekt telt als door kantoor geboekt", async () => {
    const rows = (await staff.get("/api/reports/invoice-inbox-items/rows").query({ ...Q, tile: "staffBooked", sort: "receivedAt", dir: "asc" })).body.rows;
    expect(rows.map((r: any) => r.id)).toEqual([I2, I3]);
    expect(rows[0]).toMatchObject({ outcome: "staffBooked", status: "booked", handledBy: "anna", reviewReason: null, amount: 0 });
  });

  it("de vier uitkomsten zijn samen alle regels", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query(Q)).body;
    const { autoBooked, staffBooked, waiting, dismissed } = s.tiles;
    expect(autoBooked.count + staffBooked.count + waiting.count + dismissed.count).toBe(s.tiles.all.count);
  });

  it("negeert het voertuigfilter", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query({ ...Q, vehicleId: "999999" })).body;
    expect(s.tiles.all.count).toBe(7);
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/invoice-inbox-items", Q, INBOX_ITEM_REPORT_TILES));

  it("uitsplitsing: reden opent precies zijn regels", async () => {
    const s = (await staff.get("/api/reports/invoice-inbox-items/summary").query(Q)).body;
    await expectDrillMatchesLines(staff, "/api/reports/invoice-inbox-items", Q, "flagged", "reason",
      s.byReason.map((r: { reason: string; count: number }) => ({ key: r.reason, count: r.count })));
  });

  it("rechten: rapportrecht en kostenrecht", async () => {
    const status = async (perms: string[] | "admin", path = "summary", extra: Record<string, string> = {}) =>
      (await (await agentFor(perms)).get(`/api/reports/invoice-inbox-items/${path}`).query({ ...Q, ...extra })).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["view_reports", "manage_settings"])).toBe(403);
    expect(await status(["manage_expenses"])).toBe(403);
    expect(await status(["view_reports", "manage_expenses"])).toBe(200);
    expect(await status("admin")).toBe(200);
    expect(await status("admin", "rows", { tile: "all" })).toBe(200);
    expect(await status("admin", "export", { tile: "all" })).toBe(200);
  });
});

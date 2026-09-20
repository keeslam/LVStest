import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { registerExpenseInboxRoutes } from "../routes/expense-inbox";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { db } from "../db";
import { UserPermission, invoiceInboxRuns } from "../../shared/schema";
import type { InboxLogRow, InboxParsedInvoice, InboxRunRow } from "../../shared/invoice-inbox";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

/**
 * The log searches the whole table, and other sessions use the same database,
 * so every fixture carries this marker and every assertion is made about rows
 * that hold it.
 */
const MARK = `${TEST_PREFIX}log${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const parsed = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: `${MARK} Garage`, invoiceNumber: `${MARK}-F1`, invoiceDate: "2026-09-10",
  currency: "EUR", totalAmount: 121, lineItems: [], ...over,
});

describe("invoice inbox log routes", () => {
  const bookkeeper = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], registerExpenseInboxRoutes);
  const settingsOnly = buildStaffTestApp([UserPermission.MANAGE_SETTINGS], registerExpenseInboxRoutes);
  const outsider = buildStaffTestApp([], registerExpenseInboxRoutes);

  // The five invoice rows, newest first, and the two that are "other mail".
  let booked: number;      // every searchable field filled in
  let review: number;      // carries the error message
  let dismissed: number;   // unknown_sender: an invoice, not "other mail"
  let literal: number;     // subject with % and _ in it
  let lookalike: number;   // matches `literal`'s subject only if % and _ are wildcards
  let noAttachment: number;
  let notInvoice: number;
  const runIds: number[] = [];

  const log = (app: Express.Application, query: string) =>
    request(app).get(`/api/expenses/inbox/log?${query}`);
  const idsOf = (body: { items: InboxLogRow[] }) => body.items.map((i) => i.id);

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    const vehicleId = (await createTestVehicle("PT-LG-01")).id;

    // Fixed received times, so the order the route promises is testable.
    const at = (minutes: number) => new Date(Date.UTC(2026, 8, 20, 10, minutes, 0));
    const row = async (over: Record<string, unknown>) => (await inboxStorage.create({
      attachmentHash: `${MARK}-${Math.random().toString(36).slice(2)}`,
      status: "review", createdBy: INBOX_TEST_ACTOR, ...over,
    } as any)).id;

    booked = await row({
      receivedAt: at(50), mailDate: at(49),
      fromAddress: `afzender-${MARK}@garage-test.invalid`,
      subject: `${MARK} onderwerp`,
      attachmentName: `${MARK}-bijlage.pdf`,
      attachmentPath: "invoice-inbox/nep.pdf",
      invoiceHash: `${MARK}-invoicehash`,
      parsed: parsed(), status: "booked", reviewReason: null, vehicleId, expenseIds: [4321],
    });
    review = await row({
      receivedAt: at(40), subject: `${MARK} tweede`, errorMessage: `${MARK} foutmelding`,
      status: "review", reviewReason: "no_plate",
    });
    dismissed = await row({
      receivedAt: at(30), subject: `${MARK} derde`, status: "dismissed", reviewReason: "unknown_sender",
    });
    literal = await row({ receivedAt: at(20), subject: `${MARK} 100% korting_A` });
    lookalike = await row({ receivedAt: at(10), subject: `${MARK} 100X kortingZA` });
    noAttachment = await row({ receivedAt: at(9), subject: `${MARK} geen bijlage`, reviewReason: "no_attachment" });
    notInvoice = await row({ receivedAt: at(8), subject: `${MARK} offerte`, status: "dismissed", reviewReason: "not_invoice" });

    const runAt = (minutes: number) => new Date(Date.UTC(2026, 8, 20, 11, minutes, 0));
    const runs = await db.insert(invoiceInboxRuns).values([
      { startedAt: runAt(30), finishedAt: runAt(31), trigger: "manual", triggeredBy: `${MARK}-kees`, mails: 2, attachments: 2, booked: 1, review: 1 },
      { startedAt: runAt(20), finishedAt: runAt(21), trigger: "scheduler", triggeredBy: null, errors: [`${MARK} connect ECONNREFUSED`] },
      { startedAt: runAt(10), finishedAt: runAt(11), trigger: "scheduler", triggeredBy: `${MARK}-quiet` },
    ]).returning({ id: invoiceInboxRuns.id });
    runIds.push(...runs.map((r) => r.id));
  });

  afterAll(async () => {
    if (runIds.length) await db.delete(invoiceInboxRuns).where(inArray(invoiceInboxRuns.id, runIds));
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });

  it("keeps the log to whoever manages expenses or settings", async () => {
    expect((await log(outsider, `q=${MARK}`)).status).toBe(403);
    expect((await request(outsider).get("/api/expenses/inbox/runs")).status).toBe(403);

    // The button sits on a settings card, so managing settings is enough.
    expect((await log(settingsOnly, `q=${MARK}`)).status).toBe(200);
    expect((await request(settingsOnly).get("/api/expenses/inbox/runs")).status).toBe(200);
    expect((await log(bookkeeper, `q=${MARK}`)).status).toBe(200);
  });

  it("finds a mail by every field the search covers, whatever the case", async () => {
    const found = async (q: string) => idsOf((await log(bookkeeper, `q=${encodeURIComponent(q)}`)).body);

    expect(await found(`AFZENDER-${MARK}`), "sender").toEqual([booked]);
    expect(await found(`${MARK} onderwerp`), "subject").toEqual([booked]);
    expect(await found(`${MARK}-BIJLAGE.pdf`), "attachment name").toEqual([booked]);
    expect(await found(`${MARK} garage`), "vendor").toEqual([booked]);
    expect(await found(`${MARK}-f1`), "invoice number").toEqual([booked]);
    expect(await found(`${MARK} FOUTMELDING`), "error message").toEqual([review]);
  });

  it("finds a mail by licence plate, however the plate is written", async () => {
    const found = async (q: string) => idsOf((await log(bookkeeper, `kind=invoices&q=${encodeURIComponent(q)}`)).body);
    expect(await found("ptlg01"), "without dashes").toEqual([booked]);
    expect(await found("PT-LG-01"), "with dashes").toEqual([booked]);
    expect(await found("pt lg 01"), "with spaces").toEqual([booked]);

    // Only dashes and spaces: the plate condition would become "%%", which puts
    // every mail that has a vehicle in the answer — `booked` is the one here.
    const dashesOnly = (await log(bookkeeper, "kind=invoices&q=-%20-&limit=200")).body;
    expect(idsOf(dashesOnly)).not.toContain(booked);
  });

  it("takes % and _ in the search text literally", async () => {
    const res = await log(bookkeeper, `q=${encodeURIComponent(`${MARK} 100% korting_A`)}`);
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([literal]);
    expect(idsOf(res.body)).not.toContain(lookalike);
  });

  it("splits invoices from other mail by review reason alone", async () => {
    const invoices = await log(bookkeeper, `kind=invoices&q=${MARK}&limit=200`);
    expect(idsOf(invoices.body)).toEqual([booked, review, dismissed, literal, lookalike]);
    expect(idsOf(invoices.body)).not.toContain(noAttachment);
    expect(idsOf(invoices.body)).not.toContain(notInvoice);

    const other = await log(bookkeeper, `kind=other&q=${MARK}&limit=200`);
    expect(idsOf(other.body)).toEqual([noAttachment, notInvoice]);
    // "unknown sender" is a real invoice that needs a decision, not other mail.
    expect(idsOf(other.body)).not.toContain(dismissed);

    // Invoices is the default.
    expect(idsOf((await log(bookkeeper, `q=${MARK}&limit=200`)).body)).toEqual(idsOf(invoices.body));
  });

  it("filters invoices by status", async () => {
    expect(idsOf((await log(bookkeeper, `kind=invoices&q=${MARK}&status=booked`)).body)).toEqual([booked]);
    expect(idsOf((await log(bookkeeper, `kind=invoices&q=${MARK}&status=dismissed`)).body)).toEqual([dismissed]);
    expect(idsOf((await log(bookkeeper, `kind=invoices&q=${MARK}&status=review&limit=200`)).body)).toEqual([review, literal, lookalike]);
  });

  it("counts every match while it hands out one page", async () => {
    const first = await log(bookkeeper, `kind=invoices&q=${MARK}&limit=2&offset=0`);
    expect(first.body.total).toBe(5);
    expect(idsOf(first.body)).toEqual([booked, review]);

    const second = await log(bookkeeper, `kind=invoices&q=${MARK}&limit=2&offset=2`);
    expect(second.body.total).toBe(5);
    expect(idsOf(second.body)).toEqual([dismissed, literal]);

    const last = await log(bookkeeper, `kind=invoices&q=${MARK}&limit=2&offset=4`);
    expect(idsOf(last.body)).toEqual([lookalike]);
  });

  it("refuses an unknown kind or status", async () => {
    expect((await log(bookkeeper, "kind=alles")).status).toBe(400);
    expect((await log(bookkeeper, "kind=invoices&status=geboekt")).status).toBe(400);
    expect((await request(bookkeeper).get("/api/expenses/inbox/runs?limit=abc")).status).toBe(200);
  });

  it("hands out exactly the fields the log shows, and never the stored file, the hashes or the scan", async () => {
    const res = await log(bookkeeper, `kind=invoices&q=${MARK}-F1`);
    const [item] = res.body.items as InboxLogRow[];
    expect(item).toEqual({
      id: booked,
      receivedAt: new Date(Date.UTC(2026, 8, 20, 10, 50, 0)).toISOString(),
      mailDate: new Date(Date.UTC(2026, 8, 20, 10, 49, 0)).toISOString(),
      fromAddress: `afzender-${MARK}@garage-test.invalid`,
      subject: `${MARK} onderwerp`,
      attachmentName: `${MARK}-bijlage.pdf`,
      status: "booked",
      reviewReason: null,
      errorMessage: null,
      vehiclePlate: "PT-LG-01",
      vendor: `${MARK} Garage`,
      invoiceNumber: `${MARK}-F1`,
      totalAmount: 121,
      hasFile: true,
      expenseIds: [4321],
    });

    const body = JSON.stringify(res.body);
    for (const leak of ["attachmentPath", "attachmentHash", "invoiceHash", "parsed", "invoice-inbox/nep.pdf", `${MARK}-invoicehash`]) {
      expect(body, leak).not.toContain(leak);
    }
  });

  it("says a mail has no file when its attachment was never stored", async () => {
    const res = await log(bookkeeper, `kind=other&q=${MARK} geen bijlage`);
    const [item] = res.body.items as InboxLogRow[];
    expect(item).toMatchObject({ id: noAttachment, hasFile: false, reviewReason: "no_attachment", vehiclePlate: null });
    expect(item.vendor).toBeNull();
    expect(item.totalAmount).toBeNull();
  });

  it("lists the fetch runs newest first and leaves the quiet ones out by default", async () => {
    const [withMail, withError, quiet] = runIds;

    const active = await request(bookkeeper).get("/api/expenses/inbox/runs?limit=200");
    expect(active.status).toBe(200);
    const activeIds = (active.body.runs as InboxRunRow[]).map((r) => r.id).filter((id) => runIds.includes(id));
    expect(activeIds).toEqual([withMail, withError]);
    expect(typeof active.body.total).toBe("number");

    const all = await request(bookkeeper).get("/api/expenses/inbox/runs?activeOnly=false&limit=200");
    const allIds = (all.body.runs as InboxRunRow[]).map((r) => r.id).filter((id) => runIds.includes(id));
    expect(allIds).toEqual([withMail, withError, quiet]);
    expect(all.body.total).toBeGreaterThan(active.body.total);

    // Anything that is not "false" keeps the filter on.
    const still = await request(bookkeeper).get("/api/expenses/inbox/runs?activeOnly=ja&limit=200");
    expect((still.body.runs as InboxRunRow[]).map((r) => r.id).filter((id) => runIds.includes(id))).toEqual(activeIds);

    const run = (all.body.runs as InboxRunRow[]).find((r) => r.id === withMail);
    expect(run).toEqual({
      id: withMail,
      startedAt: new Date(Date.UTC(2026, 8, 20, 11, 30, 0)).toISOString(),
      finishedAt: new Date(Date.UTC(2026, 8, 20, 11, 31, 0)).toISOString(),
      trigger: "manual", triggeredBy: `${MARK}-kees`,
      mails: 2, attachments: 2, booked: 1, review: 1, skipped: 0, failed: 0, errors: [],
    });
  });

  it("pages the fetch runs", async () => {
    const all = await request(bookkeeper).get("/api/expenses/inbox/runs?activeOnly=false&limit=200");
    const at = (all.body.runs as InboxRunRow[]).findIndex((r) => r.id === runIds[0]);
    const page = await request(bookkeeper).get(`/api/expenses/inbox/runs?activeOnly=false&limit=2&offset=${at}`);
    expect((page.body.runs as InboxRunRow[]).map((r) => r.id)).toEqual([runIds[0], runIds[1]]);
    expect(page.body.total).toBe(all.body.total);
  });
});

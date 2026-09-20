import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { invoiceInboxRuns } from "../../shared/schema";
import { inboxRunLog, RUN_LOG_RETENTION_DAYS } from "../services/invoice-inbox/run-log";
import type { InvoiceInboxRunSummary } from "../../shared/invoice-inbox";
import { TEST_PREFIX } from "./portal-helpers";

/** `triggered_by` of every run this file records, so cleanup can find them back. */
const RUN_LOG_TEST_ACTOR = `${TEST_PREFIX}runlog`;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Other sessions use the same database, so every assertion is made about the
 * rows this file wrote — found back by their `started_at`, which is unique per
 * row because each test picks its own offset from this fixed base.
 */
const BASE = Date.now();
const startedSecondsAgo = (seconds: number) => new Date(BASE - seconds * 1000);
const createdIds: number[] = [];

const summaryAt = (startedAt: Date, over: Partial<InvoiceInboxRunSummary> = {}): InvoiceInboxRunSummary => ({
  startedAt: startedAt.toISOString(),
  finishedAt: new Date(startedAt.getTime() + 1500).toISOString(),
  trigger: "scheduler",
  mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0, errors: [],
  ...over,
});

/** Records a run and remembers its row, which is found back by its unique start. */
async function recordAndTrack(summary: InvoiceInboxRunSummary, triggeredBy: string | null): Promise<number> {
  await inboxRunLog.record(summary, triggeredBy);
  const [row] = await db.select({ id: invoiceInboxRuns.id }).from(invoiceInboxRuns)
    .where(eq(invoiceInboxRuns.startedAt, new Date(summary.startedAt)));
  expect(row, `run started at ${summary.startedAt} was not stored`).toBeDefined();
  createdIds.push(row.id);
  return row.id;
}

async function cleanupRunLogTestData(): Promise<void> {
  await db.delete(invoiceInboxRuns).where(like(invoiceInboxRuns.triggeredBy, `${RUN_LOG_TEST_ACTOR}%`));
  if (createdIds.length) await db.delete(invoiceInboxRuns).where(inArray(invoiceInboxRuns.id, createdIds));
  createdIds.length = 0;
}

describe("invoice inbox run log", () => {
  beforeAll(cleanupRunLogTestData);
  afterAll(cleanupRunLogTestData);

  it("stores what the summary says about a finished run", async () => {
    const startedAt = startedSecondsAgo(10);
    const summary = summaryAt(startedAt, {
      trigger: "manual", mails: 4, attachments: 6, booked: 2, review: 3, skipped: 1, failed: 1,
      errors: ["Factuur 2: database weg"],
    });
    const id = await recordAndTrack(summary, `${RUN_LOG_TEST_ACTOR}-kees`);

    const [row] = await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.id, id));
    expect(row).toMatchObject({
      trigger: "manual", triggeredBy: `${RUN_LOG_TEST_ACTOR}-kees`,
      mails: 4, attachments: 6, booked: 2, review: 3, skipped: 1, failed: 1,
      errors: ["Factuur 2: database weg"],
    });
    expect(row.startedAt.toISOString()).toBe(summary.startedAt);
    expect(row.finishedAt.toISOString()).toBe(summary.finishedAt);
  });

  it("stores a scheduler run without a username", async () => {
    const id = await recordAndTrack(summaryAt(startedSecondsAgo(11), { mails: 1 }), null);
    const [row] = await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.id, id));
    expect(row.trigger).toBe("scheduler");
    expect(row.triggeredBy).toBeNull();
  });

  /** The errors come from mail subjects and driver messages: neither is bounded. */
  it("caps the stored errors at 20 entries of 500 characters", async () => {
    const errors = Array.from({ length: 25 }, (_, i) => `${i}`.padEnd(600, "x"));
    const id = await recordAndTrack(summaryAt(startedSecondsAgo(12), { failed: 25, errors }), `${RUN_LOG_TEST_ACTOR}-cap`);

    const [row] = await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.id, id));
    expect(row.errors).toHaveLength(20);
    expect(row.errors.every((e) => e.length === 500)).toBe(true);
    expect(row.errors[0]).toBe(errors[0].slice(0, 500));
  });

  it("never throws when the database refuses the row, and says so in the log", async () => {
    const insert = vi.spyOn(db, "insert").mockImplementation(() => { throw new Error("database weg"); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(inboxRunLog.record(summaryAt(startedSecondsAgo(13)), `${RUN_LOG_TEST_ACTOR}-fail`)).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
      expect(String(logged.mock.calls[0])).toContain("database weg");
    } finally {
      insert.mockRestore();
      logged.mockRestore();
    }
    // Nothing was stored, so nothing has to be cleaned up either.
    const rows = await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.startedAt, startedSecondsAgo(13)));
    expect(rows).toHaveLength(0);
  });

  it("prunes runs older than the retention when the next one is recorded", async () => {
    const tooOld = new Date(BASE - (RUN_LOG_RETENTION_DAYS + 1) * DAY_MS);
    const justYoungEnough = new Date(BASE - (RUN_LOG_RETENTION_DAYS - 1) * DAY_MS);
    // Written straight to the table: recording them would prune the old one on the spot.
    const [old] = await db.insert(invoiceInboxRuns).values({
      startedAt: tooOld, finishedAt: tooOld, trigger: "scheduler", triggeredBy: `${RUN_LOG_TEST_ACTOR}-old`,
    }).returning();
    const [young] = await db.insert(invoiceInboxRuns).values({
      startedAt: justYoungEnough, finishedAt: justYoungEnough, trigger: "scheduler", triggeredBy: `${RUN_LOG_TEST_ACTOR}-young`,
    }).returning();
    createdIds.push(old.id, young.id);

    await recordAndTrack(summaryAt(startedSecondsAgo(14)), `${RUN_LOG_TEST_ACTOR}-prune`);

    expect(await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.id, old.id))).toHaveLength(0);
    expect(await db.select().from(invoiceInboxRuns).where(eq(invoiceInboxRuns.id, young.id))).toHaveLength(1);
  });

  it("lists the runs newest first, pages them and counts every match", async () => {
    const before = (await inboxRunLog.list({ activeOnly: false, limit: 1 })).total;
    const newest = await recordAndTrack(summaryAt(startedSecondsAgo(20), { mails: 3 }), `${RUN_LOG_TEST_ACTOR}-a`);
    const middle = await recordAndTrack(summaryAt(startedSecondsAgo(21), { mails: 2 }), `${RUN_LOG_TEST_ACTOR}-b`);
    const oldest = await recordAndTrack(summaryAt(startedSecondsAgo(22), { mails: 1 }), `${RUN_LOG_TEST_ACTOR}-c`);

    const all = await inboxRunLog.list({ activeOnly: false, limit: 200 });
    expect(all.total).toBe(before + 3);
    expect(all.runs.filter((r) => [newest, middle, oldest].includes(r.id)).map((r) => r.id)).toEqual([newest, middle, oldest]);

    // Paged from the position the full list gives them, so other rows cannot disturb it.
    const at = all.runs.findIndex((r) => r.id === newest);
    const page = await inboxRunLog.list({ activeOnly: false, limit: 2, offset: at });
    expect(page.runs.map((r) => r.id)).toEqual([newest, middle]);
    expect(page.total).toBe(all.total);
    expect(await inboxRunLog.list({ activeOnly: false, limit: 1, offset: at + 2 }).then((r) => r.runs.map((x) => x.id))).toEqual([oldest]);
  });

  it("returns a run the way the client reads it", async () => {
    const startedAt = startedSecondsAgo(30);
    const summary = summaryAt(startedAt, { trigger: "manual", mails: 2, attachments: 2, booked: 1, review: 1, errors: ["stuk"] });
    const id = await recordAndTrack(summary, `${RUN_LOG_TEST_ACTOR}-shape`);

    const run = (await inboxRunLog.list({ activeOnly: false, limit: 200 })).runs.find((r) => r.id === id);
    expect(run).toEqual({
      id, startedAt: summary.startedAt, finishedAt: summary.finishedAt,
      trigger: "manual", triggeredBy: `${RUN_LOG_TEST_ACTOR}-shape`,
      mails: 2, attachments: 2, booked: 1, review: 1, skipped: 0, failed: 0, errors: ["stuk"],
    });
  });

  /** The default view: a quarter of an hour in which nothing arrived is noise. */
  it("keeps only the runs that saw mail, failed or reported an error when activeOnly is on", async () => {
    const withMail = await recordAndTrack(summaryAt(startedSecondsAgo(40), { mails: 1 }), `${RUN_LOG_TEST_ACTOR}-mail`);
    const withFailure = await recordAndTrack(summaryAt(startedSecondsAgo(41), { failed: 1 }), `${RUN_LOG_TEST_ACTOR}-failed`);
    const withError = await recordAndTrack(summaryAt(startedSecondsAgo(42), { errors: ["connect ECONNREFUSED"] }), `${RUN_LOG_TEST_ACTOR}-error`);
    const empty = await recordAndTrack(summaryAt(startedSecondsAgo(43)), `${RUN_LOG_TEST_ACTOR}-empty`);

    const active = await inboxRunLog.list({ activeOnly: true, limit: 200 });
    const mine = active.runs.map((r) => r.id).filter((id) => [withMail, withFailure, withError, empty].includes(id));
    expect(mine).toEqual([withMail, withFailure, withError]);

    // The count follows the same filter, and the quiet run is still there without it.
    expect(active.total).toBeLessThan((await inboxRunLog.list({ activeOnly: false, limit: 1 })).total);
    const everything = await inboxRunLog.list({ activeOnly: false, limit: 200 });
    expect(everything.runs.some((r) => r.id === empty)).toBe(true);
  });
});

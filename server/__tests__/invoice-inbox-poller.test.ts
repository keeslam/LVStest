import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { importInvoiceMail, notifyInvoiceInbox, recordOversizeMail, recordFailedMail, recordRun } = vi.hoisted(() => ({
  importInvoiceMail: vi.fn(),
  notifyInvoiceInbox: vi.fn(async () => {}),
  recordOversizeMail: vi.fn(),
  recordFailedMail: vi.fn(),
  recordRun: vi.fn(async () => {}),
}));
vi.mock("../services/invoice-inbox/importer", () => ({
  importInvoiceMail, recordOversizeMail, recordFailedMail, MAX_MAIL_BYTES: 30 * 1024 * 1024,
}));
vi.mock("../services/invoice-inbox/notify", () => ({ notifyInvoiceInbox }));
// What the log does with a run is invoice-inbox-run-log.test.ts's business,
// against the real database; here it is only about which runs reach it.
vi.mock("../services/invoice-inbox/run-log", () => ({ inboxRunLog: { record: recordRun, list: vi.fn() } }));

import { DEFAULT_INVOICE_INBOX_CONFIG, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import type { InvoiceImapClient } from "../services/invoice-inbox/imap-client";
import {
  runInvoiceInboxImport, setInvoiceImapClient, getInvoiceInboxRunState, cronExpressionFor,
  resetInvoiceInboxPollerForTests, MAX_MAILS_PER_RUN, MAX_SCANS_PER_RUN,
} from "../services/invoice-inbox/poller";

const config: InvoiceInboxConfig = {
  ...DEFAULT_INVOICE_INBOX_CONFIG, enabled: true, host: "imap.example.test", username: "u", password: "p",
  allowedSenders: ["@garage-test.invalid"],
};

function fakeMailbox(uids: number[], options: { failConnect?: boolean; sizes?: Record<number, number>; from?: string } = {}) {
  const processed: number[] = [];
  const fetched: number[] = [];
  let sessions = 0;
  const client: InvoiceImapClient = {
    async withSession(_config, fn) {
      if (options.failConnect) throw new Error("connect ECONNREFUSED");
      sessions += 1;
      return fn({
        async folderOverview() { return []; },
        async diagnostics() { return { server: null, exists: 0, searchUnseen: null }; },
        async listUnseen() {
          return uids.filter((uid) => !processed.includes(uid)).map((uid) => ({
            uid, messageId: `<${uid}@test>`, from: options.from ?? "a@b.nl", subject: `Factuur ${uid}`,
            size: options.sizes?.[uid] ?? 1000,
          }));
        },
        async fetchRaw(uid) { fetched.push(uid); return Buffer.from(`raw-${uid}`); },
        async markProcessed(uid) { processed.push(uid); },
      });
    },
  };
  return { client, processed, fetched, sessions: () => sessions };
}

describe("invoice inbox poller", () => {
  beforeEach(() => {
    importInvoiceMail.mockReset();
    notifyInvoiceInbox.mockClear();
    recordOversizeMail.mockReset();
    recordFailedMail.mockReset();
    recordRun.mockClear();
    resetInvoiceInboxPollerForTests();
  });
  afterAll(() => setInvoiceImapClient(null));

  it("imports every unseen mail and adds up what the importer reports", async () => {
    const mailbox = fakeMailbox([1, 2]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail
      .mockResolvedValueOnce({ attachments: 1, booked: 1, review: 0, skipped: 0 })
      .mockResolvedValueOnce({ attachments: 2, booked: 0, review: 1, skipped: 1 });
    const summary = await runInvoiceInboxImport("manual", "kees", config);
    expect(summary).toMatchObject({ trigger: "manual", mails: 2, attachments: 3, booked: 1, review: 1, skipped: 1, failed: 0, errors: [] });
    expect(importInvoiceMail.mock.calls[0][0]).toMatchObject({ createdBy: "kees", config });
    expect(importInvoiceMail.mock.calls[0][0].raw.toString()).toBe("raw-1");
    expect(mailbox.processed).toEqual([1, 2]);
    expect(getInvoiceInboxRunState().lastRun).toEqual(summary);
  });

  it("leaves a mail whose import threw in the inbox for the next run, and carries on with the rest", async () => {
    const mailbox = fakeMailbox([1, 2, 3]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail
      .mockResolvedValueOnce({ attachments: 1, booked: 1, review: 0, skipped: 0 })
      .mockRejectedValueOnce(new Error("database weg"))
      .mockResolvedValueOnce({ attachments: 1, booked: 0, review: 1, skipped: 0 });
    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(summary).toMatchObject({ mails: 3, booked: 1, review: 1, failed: 1 });
    expect(summary.errors).toEqual(["Factuur 2: database weg"]);
    expect(mailbox.processed).toEqual([1, 3]);
  });

  /**
   * I1: one crafted mail (a NUL in the subject) failed on every write, stayed
   * unseen and was fetched and rescanned every run — blocking the queue and
   * re-billing Gemini for ever. It is retried twice and then recorded.
   */
  it("gives up on a mail that keeps failing: two retries, then one item and the mail is processed", async () => {
    const mailbox = fakeMailbox([1]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockRejectedValue(new Error("invalid byte sequence 0x00"));
    recordFailedMail.mockResolvedValue("review");

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
      expect(summary.failed, `attempt ${attempt}`).toBe(1);
      expect(recordFailedMail, `attempt ${attempt}`).not.toHaveBeenCalled();
      expect(mailbox.processed, `attempt ${attempt}`).toEqual([]);
    }

    const third = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(recordFailedMail).toHaveBeenCalledTimes(1);
    expect(recordFailedMail.mock.calls[0][0]).toMatchObject({ uid: 1, messageId: "<1@test>" });
    expect(recordFailedMail.mock.calls[0][1]).toContain("invalid byte sequence 0x00");
    expect(recordFailedMail.mock.calls[0][2]).toBe("scheduler");
    // The sender is not on the allowlist, so it is recorded without a notification.
    expect(recordFailedMail.mock.calls[0][3]).toBe(false);
    expect(mailbox.processed).toEqual([1]);
    expect(third).toMatchObject({ failed: 1, review: 1 });

    // Counted per mail, and only once: a fourth run has nothing left to do.
    const fourth = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(fourth.mails).toBe(0);
    expect(recordFailedMail).toHaveBeenCalledTimes(1);
  });

  it("marks a mail processed even when recording the failure itself throws", async () => {
    const mailbox = fakeMailbox([1]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockRejectedValue(new Error("stuk"));
    recordFailedMail.mockRejectedValue(new Error("database weg"));
    for (let i = 0; i < 3; i += 1) await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(mailbox.processed).toEqual([1]);
  });

  it("forgets the failure count of a mail that imports successfully later on", async () => {
    const mailbox = fakeMailbox([1]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockRejectedValueOnce(new Error("even niet"));
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    importInvoiceMail.mockResolvedValue({ attachments: 1, booked: 1, review: 0, skipped: 0 });
    await runInvoiceInboxImport("scheduler", "scheduler", config);

    // The counter is back to zero: two fresh failures are not enough to give up.
    const mailboxAgain = fakeMailbox([1]);
    setInvoiceImapClient(mailboxAgain.client);
    importInvoiceMail.mockRejectedValue(new Error("weer stuk"));
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(recordFailedMail).not.toHaveBeenCalled();
  });

  it("shares one run between overlapping calls", async () => {
    const mailbox = fakeMailbox([1]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return { attachments: 1, booked: 1, review: 0, skipped: 0 }; });
    const [a, b] = await Promise.all([runInvoiceInboxImport("manual", "a", config), runInvoiceInboxImport("manual", "b", config)]);
    expect(a).toBe(b);
    expect(mailbox.sessions()).toBe(1);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    expect(getInvoiceInboxRunState().running).toBe(false);
  });

  it("handles at most MAX_MAILS_PER_RUN mails in one run", async () => {
    const mailbox = fakeMailbox(Array.from({ length: MAX_MAILS_PER_RUN + 5 }, (_, i) => i + 1));
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockResolvedValue({ attachments: 1, booked: 1, review: 0, skipped: 0 });
    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(summary.mails).toBe(MAX_MAILS_PER_RUN);
    expect(mailbox.processed).toHaveLength(MAX_MAILS_PER_RUN);
  });

  /**
   * I6: the mail cap alone bounds nothing — one mail may carry ten attachments,
   * and every attachment is a Gemini call. The scans of a run are capped too.
   */
  it("stops taking mails once the run has spent its scan budget", async () => {
    const mailbox = fakeMailbox(Array.from({ length: 20 }, (_, i) => i + 1));
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockResolvedValue({ attachments: 4, booked: 4, review: 0, skipped: 0, scans: 4 });

    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    const expected = Math.ceil(MAX_SCANS_PER_RUN / 4);
    expect(summary.mails).toBe(expected);
    expect(importInvoiceMail).toHaveBeenCalledTimes(expected);
    expect(mailbox.processed).toHaveLength(expected);

    // The rest simply waits for the next run.
    const next = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(next.mails).toBe(expected);
  });

  it("does not stop early for mails that cost no scan at all", async () => {
    const mailbox = fakeMailbox([1, 2, 3]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockResolvedValue({ attachments: 1, booked: 0, review: 0, skipped: 1, scans: 0 });
    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(summary.mails).toBe(3);
  });

  it("reports a connection error in the summary and warns staff once, after three failures in a row", async () => {
    setInvoiceImapClient(fakeMailbox([], { failConnect: true }).client);
    for (let i = 0; i < 2; i += 1) {
      const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
      expect(summary.errors).toEqual(["connect ECONNREFUSED"]);
    }
    expect(notifyInvoiceInbox).not.toHaveBeenCalled();
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(notifyInvoiceInbox).toHaveBeenCalledTimes(1);
    expect(notifyInvoiceInbox.mock.calls[0][0].title).toBe("Postvak facturen onbereikbaar");

    // A good run resets the count: three new failures warn again.
    setInvoiceImapClient(fakeMailbox([]).client);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    setInvoiceImapClient(fakeMailbox([], { failConnect: true }).client);
    for (let i = 0; i < 3; i += 1) await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(notifyInvoiceInbox).toHaveBeenCalledTimes(2);
  });

  it("refuses to run without a host", async () => {
    setInvoiceImapClient(fakeMailbox([1]).client);
    const summary = await runInvoiceInboxImport("manual", "kees", { ...config, host: "" });
    expect(summary.errors).toEqual(["IMAP-host is niet ingesteld"]);
    expect(importInvoiceMail).not.toHaveBeenCalled();
  });

  it("does not download a mail above the size cap: records it, marks it processed", async () => {
    const mailbox = fakeMailbox([1, 2], { sizes: { 2: 40 * 1024 * 1024 } });
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockResolvedValueOnce({ attachments: 1, booked: 1, review: 0, skipped: 0 });
    recordOversizeMail.mockResolvedValueOnce("review");
    const summary = await runInvoiceInboxImport("manual", "kees", config);
    expect(summary).toMatchObject({ mails: 2, booked: 1, review: 1 });
    expect(mailbox.fetched).toEqual([1]);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    expect(mailbox.processed).toEqual([1, 2]);
    expect(recordOversizeMail.mock.calls[0][2]).toBe(false);
  });

  /** Whether the mail is announced follows the same allowlist as everything else. */
  it("tells the recorders whether the sender is one the app trusts", async () => {
    const mailbox = fakeMailbox([1], { sizes: { 1: 40 * 1024 * 1024 }, from: "facturen@garage-test.invalid" });
    setInvoiceImapClient(mailbox.client);
    recordOversizeMail.mockResolvedValueOnce("review");
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(recordOversizeMail.mock.calls[0][2]).toBe(true);
  });

  it("logs a finished run with its numbers and the person who started it", async () => {
    setInvoiceImapClient(fakeMailbox([1]).client);
    importInvoiceMail.mockResolvedValue({ attachments: 1, booked: 1, review: 0, skipped: 0 });

    const summary = await runInvoiceInboxImport("manual", "kees", config);
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][0]).toEqual(summary);
    expect(recordRun.mock.calls[0][1]).toBe("kees");
  });

  /** "scheduler" is the default caller, not a person: the run has no username. */
  it("logs a scheduled run without a username", async () => {
    setInvoiceImapClient(fakeMailbox([]).client);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][1]).toBeNull();
  });

  it("logs a run that could not reach the mailbox, with the reason", async () => {
    setInvoiceImapClient(fakeMailbox([], { failConnect: true }).client);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][0]).toMatchObject({ mails: 0, errors: ["connect ECONNREFUSED"] });
    expect(recordRun.mock.calls[0][0].finishedAt).not.toBe("");
  });

  it("logs nothing for a run that never started, and once for a run that is shared", async () => {
    setInvoiceImapClient(fakeMailbox([1]).client);
    await runInvoiceInboxImport("manual", "kees", { ...config, host: "" });
    expect(recordRun).not.toHaveBeenCalled();

    importInvoiceMail.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return { attachments: 1, booked: 1, review: 0, skipped: 0 }; });
    await Promise.all([runInvoiceInboxImport("manual", "a", config), runInvoiceInboxImport("manual", "b", config)]);
    expect(recordRun).toHaveBeenCalledTimes(1);
  });

  it("turns the interval into a cron expression, clamped to 5..1440 minutes", () => {
    expect(cronExpressionFor(15)).toBe("*/15 * * * *");
    expect(cronExpressionFor(1)).toBe("*/5 * * * *");
    expect(cronExpressionFor(60)).toBe("0 */1 * * *");
    expect(cronExpressionFor(180)).toBe("0 */3 * * *");
    expect(cronExpressionFor(1440)).toBe("0 0 * * *");
    expect(cronExpressionFor(99999)).toBe("0 0 * * *");
  });
});

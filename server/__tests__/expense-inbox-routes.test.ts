import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import MailComposer from "nodemailer/lib/mail-composer";
import { eq } from "drizzle-orm";
import { registerExpenseInboxRoutes } from "../routes/expense-inbox";
import { saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { setInvoiceImapClient, resetInvoiceInboxPollerForTests } from "../services/invoice-inbox/poller";
import { setInvoiceScanner } from "../services/invoice-inbox/importer";
import type { InvoiceImapClient } from "../services/invoice-inbox/imap-client";
import { OutboundBlockedError, OUTBOUND_BLOCKED_MESSAGE } from "../utils/security/outboundGuard";
import { AuditLogger } from "../utils/security/auditLogger";
import { storage } from "../storage";
import { db } from "../db";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission, expenses } from "../../shared/schema";
import { DEFAULT_INVOICE_INBOX_CONFIG, INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, type InboxParsedInvoice } from "../../shared/invoice-inbox";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const VENDOR = `${TEST_PREFIX}Garage`;

const parsedInvoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: VENDOR, invoiceNumber: `R-${unique()}`, invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 121,
  lineItems: [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }],
  ...over,
});

function mailboxWith(raws: Buffer[], error?: Error): InvoiceImapClient {
  const processed: number[] = [];
  return {
    async withSession(_config, fn) {
      if (error) throw error;
      return fn({
        async listUnseen() { return raws.map((_, i) => i + 1).filter((uid) => !processed.includes(uid)).map((uid) => ({ uid, messageId: null, from: null, subject: `Factuur ${uid}`, size: null })); },
        async fetchRaw(uid) { return raws[uid - 1]; },
        async markProcessed(uid) { processed.push(uid); },
      });
    },
  };
}

describe("expense inbox routes", () => {
  const admin = buildStaffTestApp([UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS], registerExpenseInboxRoutes);
  const bookkeeper = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], registerExpenseInboxRoutes);
  const outsider = buildStaffTestApp([], registerExpenseInboxRoutes);
  const inboxDir = path.join(getUploadsDir(), "invoice-inbox");
  let previousConfig: unknown;
  let vehicleId: number;
  // Tracked separately from the DB row: a couple of tests below give the item
  // an `attachmentPath` override that no longer matches the file actually
  // written here, so cleanupInboxTestData()'s DB-driven cleanup cannot find
  // it. Removed directly in afterAll so no test file lingers under uploads/.
  const writtenFiles: string[] = [];

  const reviewItem = async (over: Record<string, unknown> = {}) => {
    fs.mkdirSync(inboxDir, { recursive: true });
    const abs = path.join(inboxDir, `${TEST_PREFIX}${unique()}.pdf`);
    fs.writeFileSync(abs, `%PDF-1.4\n% ${unique()}\n%%EOF`);
    writtenFiles.push(abs);
    return inboxStorage.create({
      attachmentHash: `hash-${unique()}`, attachmentName: "factuur.pdf", attachmentContentType: "application/pdf",
      attachmentPath: path.relative(getUploadsDir(), abs).split(path.sep).join("/"),
      fromAddress: "facturen@garage-test.invalid", subject: `${TEST_PREFIX}Factuur`, parsed: parsedInvoice(),
      status: "review", reviewReason: "no_plate", createdBy: INBOX_TEST_ACTOR, ...over,
    });
  };

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    previousConfig = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
    vehicleId = (await createTestVehicle("PT-RT-01")).id;
  });
  afterAll(async () => {
    setInvoiceImapClient(null);
    setInvoiceScanner(null);
    await saveInvoiceInboxConfig(previousConfig ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    for (const f of writtenFiles) fs.rmSync(f, { force: true });
  });
  beforeEach(() => resetInvoiceInboxPollerForTests());

  it("keeps the mailbox settings to people who manage settings", async () => {
    expect((await request(bookkeeper).get("/api/expenses/inbox/config")).status).toBe(403);
    expect((await request(bookkeeper).put("/api/expenses/inbox/config").send({})).status).toBe(403);
    expect((await request(bookkeeper).post("/api/expenses/inbox/config/test").send({})).status).toBe(403);
    expect((await request(outsider).get("/api/expenses/inbox/items")).status).toBe(403);
    expect((await request(outsider).post("/api/expenses/inbox/run")).status).toBe(403);
  });

  it("stores the config with a masked password and keeps it on re-save", async () => {
    const put = await request(admin).put("/api/expenses/inbox/config").send({ enabled: false, host: "imap.example.test", port: 993, secure: true, username: "fakturenapp@lamgroep.nl", password: "geheim", allowedSenders: ["@garage-test.invalid"], pollMinutes: 30 });
    expect(put.status).toBe(200);
    expect(put.body.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    const again = await request(admin).put("/api/expenses/inbox/config").send({ ...put.body, pollMinutes: 45 });
    expect(again.status).toBe(200);
    const get = await request(admin).get("/api/expenses/inbox/config");
    expect(get.body).toMatchObject({ host: "imap.example.test", pollMinutes: 45, password: INVOICE_INBOX_PASSWORD_MASK, allowedSenders: ["@garage-test.invalid"] });
    expect(JSON.stringify(get.body)).not.toContain("geheim");
    const bad = await request(admin).put("/api/expenses/inbox/config").send({ port: 25 });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/993/);
  });

  it("tests the connection with the stored password behind the mask, and gives one answer for a blocked host", async () => {
    await saveInvoiceInboxConfig({ enabled: false, host: "imap.example.test", username: "u", password: "geheim", allowedSenders: ["@garage-test.invalid"] }, "test");
    let seenPassword = "";
    setInvoiceImapClient({ async withSession(config, fn) { seenPassword = config.password; return mailboxWith([Buffer.from("a"), Buffer.from("b")]).withSession(config, fn); } });
    const ok = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "imap.example.test", username: "u", password: INVOICE_INBOX_PASSWORD_MASK });
    expect(ok.body).toEqual({ ok: true, unseen: 2 });
    expect(seenPassword).toBe("geheim");

    setInvoiceImapClient(mailboxWith([], new OutboundBlockedError()));
    const blocked = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "10.0.0.5", username: "u", password: "x" });
    expect(blocked.status).toBe(400);
    expect(blocked.body).toEqual({ ok: false, message: OUTBOUND_BLOCKED_MESSAGE });

    setInvoiceImapClient(mailboxWith([], new Error("Invalid credentials")));
    const refused = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "imap.example.test", username: "u", password: "x" });
    expect(refused.status).toBe(502);
    expect(refused.body).toEqual({ ok: false, message: "Invalid credentials" });
  });

  it("runs the import on request and reports it in the status", async () => {
    await saveInvoiceInboxConfig({ enabled: false, host: "imap.example.test", username: "u", password: "geheim", allowedSenders: ["@garage-test.invalid"] }, "test");
    const attachment = Buffer.from(`%PDF-1.4\n% run ${unique()}\n%%EOF`);
    const raw = await new MailComposer({ from: "facturen@garage-test.invalid", to: "fakturenapp@lamgroep.nl", subject: `${TEST_PREFIX}Factuur`, text: "bijlage", attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }).compile().build();
    setInvoiceImapClient(mailboxWith([raw]));
    setInvoiceScanner(async () => parsedInvoice({ subtotalAmount: 100, vatAmount: 21, vehicleInfo: { licensePlate: "PT-RT-01" } }));

    const run = await request(bookkeeper).post("/api/expenses/inbox/run");
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ trigger: "manual", mails: 1, booked: 1, review: 0, errors: [] });

    const status = await request(bookkeeper).get("/api/expenses/inbox/status");
    expect(status.status).toBe(200);
    expect(status.body.lastRun).toMatchObject({ mails: 1, booked: 1 });
    expect(typeof status.body.reviewCount).toBe("number");
    expect(typeof status.body.geminiConfigured).toBe("boolean");
    expect(status.body.enabled).toBe(false);

    const booked = await request(bookkeeper).get("/api/expenses/inbox/items?status=booked&limit=200");
    expect(booked.body.some((i: any) => i.vehiclePlate === "PT-RT-01" && i.createdBy === "staff-test")).toBe(true);
  });

  it("lists items per status and refuses an unknown status", async () => {
    const item = await reviewItem();
    const list = await request(bookkeeper).get("/api/expenses/inbox/items?status=review&limit=200");
    expect(list.status).toBe(200);
    expect(list.body.find((i: any) => i.id === item.id)).toMatchObject({ reviewReason: "no_plate", vehiclePlate: null });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${item.id}`)).body.parsed.vendor).toBe(VENDOR);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items?status=alles")).status).toBe(400);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items/abc")).status).toBe(400);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items/99999999")).status).toBe(404);
  });

  it("serves the attachment inline, and nothing that sits outside the invoice folders", async () => {
    const item = await reviewItem();
    const file = await request(bookkeeper).get(`/api/expenses/inbox/items/${item.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");

    const escaped = await reviewItem({ attachmentPath: "../.env" });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${escaped.id}/file`)).status).toBe(404);
    const none = await reviewItem({ attachmentPath: null });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${none.id}/file`)).status).toBe(404);
  });

  it("books a reviewed invoice once: grouped by default, header corrections saved", async () => {
    const item = await reviewItem();
    const body = {
      vehicleId, invoice: { vendor: VENDOR, invoiceNumber: "GECORRIGEERD-1", invoiceDate: "2026-09-11" },
      lineItems: [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }],
    };
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(1);
    expect(res.body.expenses[0]).toMatchObject({ vehicleId, amount: "100", category: "Maintenance", date: "2026-09-11", inboxItemId: item.id, receiptFilePath: item.attachmentPath });
    expect(res.body.expenses[0].description).toBe(`Beurt • Olie (Factuur GECORRIGEERD-1, ${VENDOR})`);
    expect(res.body.item).toMatchObject({ status: "booked", reviewReason: null, vehicleId, updatedBy: "staff-test", expenseIds: [res.body.expenses[0].id] });
    expect(res.body.item.parsed.invoiceNumber).toBe("GECORRIGEERD-1");

    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send(body)).status).toBe(409);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/dismiss`).send({})).status).toBe(409);
  });

  it("finishes an earlier interrupted booking instead of booking the invoice a second time", async () => {
    const item = await reviewItem();
    const [existingExpense] = await db.insert(expenses).values({
      vehicleId, category: "Maintenance", amount: "100", date: "2026-09-10", inboxItemId: item.id,
    }).returning();

    const audit = vi.spyOn(AuditLogger, "logFromRequest");
    const body = {
      vehicleId, invoice: { vendor: VENDOR, invoiceNumber: "L-2", invoiceDate: "2026-09-10" },
      lineItems: [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }],
    };
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Deze factuur was al geboekt; de boeking is nu afgerond.");
    expect(res.body.item).toMatchObject({ status: "booked", expenseIds: [existingExpense.id] });
    expect(audit).toHaveBeenCalledWith(expect.anything(), "expense.inbox.book.healed", "invoice_inbox_item", item.id, { expenseIds: [existingExpense.id] });
    audit.mockRestore();

    const rows = await db.select().from(expenses).where(eq(expenses.inboxItemId, item.id));
    expect(rows).toHaveLength(1);
  });

  it("books line by line when grouping is switched off, and validates the body", async () => {
    const item = await reviewItem();
    const lines = [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }];
    const invoice = { vendor: VENDOR, invoiceNumber: "L-1", invoiceDate: "2026-09-10" };
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: [] })).status).toBe(400);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: [{ description: "x", amount: 1, category: "Snoep" }] })).status).toBe(400);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId: 99999999, invoice, lineItems: lines })).status).toBe(404);
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: lines, groupByCategory: false });
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(2);
  });

  it("dismisses an invoice with a note and creates nothing", async () => {
    const item = await reviewItem();
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/dismiss`).send({ note: "Niet van ons" });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ status: "dismissed", note: "Niet van ons", expenseIds: [], updatedBy: "staff-test" });
    expect(res.body.item.processedAt).not.toBeNull();
  });
});

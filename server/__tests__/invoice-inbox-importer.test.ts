import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import MailComposer from "nodemailer/lib/mail-composer";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { DEFAULT_INVOICE_INBOX_CONFIG, type InboxParsedInvoice, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import { importInvoiceMail, setInvoiceScanner, recordOversizeMail, recordFailedMail } from "../services/invoice-inbox/importer";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { sha256 } from "../services/invoice-inbox/hash";
import { resolveDocumentFilePath } from "../services/document-paths";
import { storage } from "../storage";
import { createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label} ${unique()}\n%%EOF`);
const VENDOR = `${TEST_PREFIX}Garage`;

const config: InvoiceInboxConfig = { ...DEFAULT_INVOICE_INBOX_CONFIG, allowedSenders: ["@garage-test.invalid"], totalTolerance: 1 };

interface MailOptions {
  from?: string;
  messageId?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  headers?: Record<string, string>;
}
const buildMail = (o: MailOptions = {}): Promise<Buffer> => new MailComposer({
  from: o.from ?? "Garage Test <facturen@garage-test.invalid>", to: "fakturenapp@lamgroep.nl",
  subject: `${TEST_PREFIX}Factuur`, text: "Zie bijlage", messageId: o.messageId ?? `<${unique()}@garage-test.invalid>`,
  attachments: o.attachments, headers: o.headers,
}).compile().build();

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: VENDOR, invoiceNumber: `F-${unique()}`, invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 181.5, subtotalAmount: 150, vatAmount: 31.5,
  lineItems: [
    { description: "Grote beurt", amount: 80, category: "Maintenance" },
    { description: "Olie", amount: 20, category: "Maintenance" },
    { description: "Remblokken", amount: 50, category: "Brakes" },
  ],
  vehicleInfo: { licensePlate: "PT-IM-01" }, ...over,
});

describe("invoice inbox importer", () => {
  let vehicleId: number;
  let scanned: InboxParsedInvoice;
  let scannerCalls: Array<{ filePath: string; mimeType: string }>;
  const notifications = async () => (await storage.getCustomNotificationsByType("invoice_inbox")).filter((n) => n.title.includes(TEST_PREFIX));

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-IM-01")).id;
    await createTestVehicle("PT-IM-02");
  });
  afterAll(async () => {
    setInvoiceScanner(null);
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });
  beforeEach(() => {
    scanned = invoice();
    scannerCalls = [];
    setInvoiceScanner(async (filePath, mimeType) => { scannerCalls.push({ filePath, mimeType }); return scanned; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("books a trusted invoice with one fleet plate: grouped expenses, stored attachment, notification", async () => {
    const before = (await notifications()).length;
    const attachment = pdf("boek");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "Factuur 2026.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toEqual({ attachments: 1, booked: 1, review: 0, skipped: 0 });

    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item).toMatchObject({ status: "booked", reviewReason: null, vehicleId, fromAddress: "facturen@garage-test.invalid", attachmentContentType: "application/pdf" });
    expect(item.attachmentName).toBe("Factuur_2026.pdf");
    expect(item.parsed?.plates).toEqual(["PTIM01"]);
    expect(item.expenseIds).toHaveLength(2);
    expect(resolveDocumentFilePath(item.attachmentPath!)).not.toBeNull();
    expect(scannerCalls[0].mimeType).toBe("application/pdf");

    const booked = await db.select().from(expenses).where(eq(expenses.inboxItemId, item.id));
    expect(booked.map((e) => [e.category, e.amount]).sort()).toEqual([["Brakes", "50"], ["Maintenance", "100"]]);
    expect(booked[0].receiptFilePath).toBe(item.attachmentPath);
    expect(booked[0].description).toContain(`(Factuur ${scanned.invoiceNumber}, ${VENDOR})`);

    const after = await notifications();
    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.title.includes("geboekt op PT-IM-01"))).toBe(true);
  });

  it("skips an attachment it has seen before, without scanning or booking again", async () => {
    const attachment = pdf("tweemaal");
    const raw = await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] });
    await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR });
    const calls = scannerCalls.length;
    const again = await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR });
    expect(again).toEqual({ attachments: 1, booked: 0, review: 0, skipped: 1 });
    expect(scannerCalls.length).toBe(calls);
  });

  it("queues the same invoice arriving in a different file as a possible duplicate", async () => {
    scanned = invoice({ invoiceNumber: `DUP-${unique()}` });
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "a.pdf", content: pdf("origineel"), contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const copy = pdf("kopie");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "b.pdf", content: copy, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    expect(await inboxStorage.getByAttachmentHash(sha256(copy))).toMatchObject({ status: "review", reviewReason: "duplicate", expenseIds: [] });
  });

  it("never books for a sender outside the list, but keeps the invoice with the vehicle pre-filled", async () => {
    const attachment = pdf("vreemd");
    const result = await importInvoiceMail({ raw: await buildMail({ from: "iemand@elders.invalid", attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    expect(await inboxStorage.getByAttachmentHash(sha256(attachment))).toMatchObject({ status: "review", reviewReason: "unknown_sender", vehicleId, expenseIds: [] });
  });

  it("does not trust an allowed sender whose mail failed DMARC or SPF", async () => {
    for (const verdict of ["dmarc=fail", "spf=fail"]) {
      const attachment = pdf(verdict);
      await importInvoiceMail({ raw: await buildMail({ headers: { "Authentication-Results": `mx.lamgroep.nl; ${verdict} header.from=garage-test.invalid` }, attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
      expect((await inboxStorage.getByAttachmentHash(sha256(attachment)))?.reviewReason).toBe("unknown_sender");
    }
  });

  /**
   * I2: with the name of our own mail server filled in, only that server's
   * verdict counts — a "dmarc=pass" the sender wrote himself is worth nothing.
   */
  it("in strict mode books only when our own mail server stamped a pass", async () => {
    const strict = { ...config, authservId: "mx.lamgroep.nl" };
    const attach = (content: Buffer) => [{ filename: "f.pdf", content, contentType: "application/pdf" }];

    const silent = pdf("strikt-geen-header");
    await importInvoiceMail({ raw: await buildMail({ attachments: attach(silent) }), config: strict, createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.getByAttachmentHash(sha256(silent)))?.reviewReason).toBe("unknown_sender");

    const forged = pdf("strikt-vervalst");
    await importInvoiceMail({
      raw: await buildMail({ headers: { "Authentication-Results": "evil.example; dmarc=pass header.from=garage-test.invalid" }, attachments: attach(forged) }),
      config: strict, createdBy: INBOX_TEST_ACTOR,
    });
    expect((await inboxStorage.getByAttachmentHash(sha256(forged)))?.reviewReason).toBe("unknown_sender");

    const trusted = pdf("strikt-pass");
    scanned = invoice({ invoiceNumber: `STRIKT-${unique()}` });
    await importInvoiceMail({
      raw: await buildMail({ headers: { "Authentication-Results": "mx.lamgroep.nl; dmarc=pass header.from=garage-test.invalid" }, attachments: attach(trusted) }),
      config: strict, createdBy: INBOX_TEST_ACTOR,
    });
    expect((await inboxStorage.getByAttachmentHash(sha256(trusted)))?.status).toBe("booked");
  });

  it("in lenient mode a softfail is already enough to distrust an allowed sender", async () => {
    const attachment = pdf("softfail");
    await importInvoiceMail({
      raw: await buildMail({ headers: { "Authentication-Results": "mx.lamgroep.nl; spf=softfail smtp.mailfrom=garage-test.invalid" }, attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }),
      config, createdBy: INBOX_TEST_ACTOR,
    });
    expect((await inboxStorage.getByAttachmentHash(sha256(attachment)))?.reviewReason).toBe("unknown_sender");
  });

  it("queues the plate and amount problems with their own reasons", async () => {
    const cases: Array<[Partial<InboxParsedInvoice>, string]> = [
      [{ vehicleInfo: undefined }, "no_plate"],
      [{ vehicleInfo: { licensePlate: "PT-IM-01", licensePlates: ["PT-IM-01", "PT-IM-02"] } }, "multiple_plates"],
      [{ vehicleInfo: { licensePlate: "ZZ-999-Z" } }, "plate_unknown"],
      [{ totalAmount: 500, subtotalAmount: undefined, vatAmount: undefined }, "total_mismatch"],
    ];
    for (const [over, reason] of cases) {
      scanned = invoice(over);
      const attachment = pdf(reason);
      await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
      expect((await inboxStorage.getByAttachmentHash(sha256(attachment)))?.reviewReason).toBe(reason);
    }
  });

  /** I7: same number and total, another spelling of the vendor — still the same invoice. */
  it("queues an invoice whose number and total were already seen, whatever the vendor was called", async () => {
    const number = `DUP-${unique()}`;
    scanned = invoice({ vendor: `${VENDOR} B.V.`, invoiceNumber: number });
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "a.pdf", content: pdf("bv"), contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });

    scanned = invoice({ vendor: VENDOR, invoiceNumber: ` ${number.toLowerCase()} ` });
    const copy = pdf("zonder-bv");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "b.pdf", content: copy, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.getByAttachmentHash(sha256(copy)))?.reviewReason).toBe("duplicate");

    // A different total is a different invoice.
    scanned = invoice({ vendor: VENDOR, invoiceNumber: number, totalAmount: 200, subtotalAmount: undefined, vatAmount: undefined, lineItems: [{ description: "Beurt", amount: 200, category: "Maintenance" }] });
    const other = pdf("ander-bedrag");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "c.pdf", content: other, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.getByAttachmentHash(sha256(other)))?.reviewReason).not.toBe("duplicate");
  });

  /** I4: only a real invoice, with lines and a date that were really read, is booked. */
  it("queues a quote, a made-up line and a missing date instead of booking them", async () => {
    const cases: Array<[Partial<InboxParsedInvoice>, string]> = [
      [{ documentType: "quote" }, "not_invoice"],
      [{ lineItemsFromTotal: true }, "total_mismatch"],
      [{ invoiceDate: "" }, "total_mismatch"],
      [{ invoiceDate: "2026-02-31" }, "total_mismatch"],
    ];
    for (const [over, reason] of cases) {
      scanned = invoice({ invoiceNumber: `IV-${unique()}`, ...over });
      const attachment = pdf(`i4-${reason}-${unique()}`);
      await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
      const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
      expect(item.reviewReason, JSON.stringify(over)).toBe(reason);
      // An invoice without a readable date is still kept with what was read.
      expect(item.parsed?.vendor, JSON.stringify(over)).toBe(VENDOR);
    }
  });

  it("books a category the scanner invented as Other, never as itself", async () => {
    scanned = invoice({
      invoiceNumber: `CAT-${unique()}`,
      lineItems: [{ description: "Koffie", amount: 150, category: "Snoep" }],
      totalAmount: 150, subtotalAmount: undefined, vatAmount: undefined,
    });
    const attachment = pdf("categorie");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item.status).toBe("booked");
    const booked = await db.select().from(expenses).where(eq(expenses.inboxItemId, item.id));
    expect(booked.map((e) => e.category)).toEqual(["Other"]);
  });

  it("records a scanner failure instead of throwing, and keeps the file for manual entry", async () => {
    setInvoiceScanner(async () => { throw new Error("Failed to process invoice with all available AI models."); });
    const attachment = pdf("kapot");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item).toMatchObject({ status: "review", reviewReason: "parse_failed", parsed: null });
    expect(item.errorMessage).toContain("AI models");
    expect(resolveDocumentFilePath(item.attachmentPath!)).not.toBeNull();
  });

  it("queues a scan that read nothing usable as parse_failed, keeping what it did read", async () => {
    scanned = invoice({ totalAmount: 0, lineItems: [] });
    const attachment = pdf("leeg");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item.reviewReason).toBe("parse_failed");
    expect(item.parsed?.vendor).toBe(VENDOR);
  });

  it("queues a mail without a usable attachment once, whatever is attached", async () => {
    const messageId = `<${unique()}@garage-test.invalid>`;
    const raw = await buildMail({ messageId, attachments: [
      { filename: "nep.pdf", content: Buffer.from("geen pdf"), contentType: "application/pdf" },
      { filename: "logo.png", content: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]), contentType: "image/png" },
      { filename: "offerte.docx", content: Buffer.from("PK"), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ] });
    expect(await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR })).toEqual({ attachments: 0, booked: 0, review: 1, skipped: 0 });
    expect(await inboxStorage.getByAttachmentHash(sha256(`mail:${messageId}`))).toMatchObject({ status: "review", reviewReason: "no_attachment", attachmentPath: null });
    expect(await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR })).toEqual({ attachments: 0, booked: 0, review: 0, skipped: 1 });
    expect(scannerCalls).toHaveLength(0);
  });

  it("gives the stored file the extension of the type it really is, not the one the sender typed", async () => {
    const attachment = pdf("html-naam");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "factuur.html", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item.attachmentName).toBe("factuur.pdf");
    expect(item.attachmentPath).toMatch(/\/\d+_[0-9a-f]{8}_factuur\.pdf$/);
  });

  it("refuses a file that only carries %PDF- somewhere inside it", async () => {
    const messageId = `<${unique()}@garage-test.invalid>`;
    const smuggled = Buffer.from(`<html><!-- %PDF-1.4 ${unique()} --><script>alert(1)</script></html>`);
    const result = await importInvoiceMail({ raw: await buildMail({ messageId, attachments: [{ filename: "factuur.pdf", content: smuggled, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ attachments: 0, booked: 0, review: 1, skipped: 0 });
    expect(await inboxStorage.getByAttachmentHash(sha256(smuggled))).toBeUndefined();
    expect((await inboxStorage.getByAttachmentHash(sha256(`mail:${messageId}`)))?.reviewReason).toBe("no_attachment");
    expect(scannerCalls).toHaveLength(0);
  });

  it("scans a photo of an invoice with its own mime type, also when it is sent as octet-stream", async () => {
    const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(unique()), Buffer.alloc(25 * 1024)]);
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "bon.JPG", content: photo, contentType: "application/octet-stream" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(scannerCalls[0].mimeType).toBe("image/jpeg");
    expect((await inboxStorage.getByAttachmentHash(sha256(photo)))?.attachmentContentType).toBe("image/jpeg");
  });

  it("finishes a booking whose final status update failed, when the mail is retried", async () => {
    const attachment = pdf("onderbroken");
    const raw = await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] });
    const hash = sha256(attachment);

    vi.spyOn(inboxStorage, "update").mockRejectedValueOnce(new Error("database weg"));
    await expect(importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR })).rejects.toThrow("database weg");

    const stuck = (await inboxStorage.getByAttachmentHash(hash))!;
    expect(stuck).toMatchObject({ status: "review", reviewReason: null, expenseIds: [] });
    const boekt = await db.select().from(expenses).where(eq(expenses.inboxItemId, stuck.id));
    expect(boekt).toHaveLength(2);

    const callsAfterFirst = scannerCalls.length;
    const result = await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toEqual({ attachments: 1, booked: 1, review: 0, skipped: 0 });
    expect(scannerCalls.length).toBe(callsAfterFirst);

    const healed = await inboxStorage.getByAttachmentHash(hash);
    expect(healed).toMatchObject({ status: "booked" });
    expect(healed!.expenseIds.slice().sort((a, b) => a - b)).toEqual(boekt.map((e) => e.id).sort((a, b) => a - b));
    const after = await db.select().from(expenses).where(eq(expenses.inboxItemId, stuck.id));
    expect(after).toHaveLength(2);
  });

  it("gives an interrupted item without expenses a reason", async () => {
    const attachment = pdf("gestrand");
    await inboxStorage.create({ attachmentHash: sha256(attachment), status: "review", reviewReason: null, createdBy: INBOX_TEST_ACTOR });
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toEqual({ attachments: 1, booked: 0, review: 1, skipped: 0 });
    const item = await inboxStorage.getByAttachmentHash(sha256(attachment));
    expect(item?.reviewReason).toBe("parse_failed");
    expect(item?.errorMessage).toContain("onderbroken");
  });

  it("removes the stored file when the item cannot be written", async () => {
    const dir = path.join(getUploadsDir(), "invoice-inbox");
    const before = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    vi.spyOn(inboxStorage, "create").mockRejectedValueOnce(new Error("database weg"));
    const attachment = pdf("weggegooid");
    await expect(importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR })).rejects.toThrow("database weg");
    const after = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    expect(after).toBe(before);
  });

  it("records an oversize mail once, with a reason and a message", async () => {
    const ref = {
      uid: 1, messageId: `<${unique()}@garage-test.invalid>`,
      from: "Garage <facturen@garage-test.invalid>", subject: `${TEST_PREFIX}Groot`, size: 40 * 1024 * 1024,
    };
    const outcome = await recordOversizeMail(ref, INBOX_TEST_ACTOR);
    expect(outcome).toBe("review");
    const item = (await inboxStorage.getByAttachmentHash(sha256(`mail:${ref.messageId}`)))!;
    expect(item).toMatchObject({ reviewReason: "no_attachment", fromAddress: "facturen@garage-test.invalid", attachmentPath: null });
    expect(item.errorMessage).toContain("30 MB");

    expect(await recordOversizeMail(ref, INBOX_TEST_ACTOR)).toBe("skipped");
  });

  it("records a mail the poller gave up on once, with the reason and the error", async () => {
    const ref = {
      uid: 4, messageId: `<${unique()}@garage-test.invalid>`,
      from: "Garage <facturen@garage-test.invalid>", subject: `${TEST_PREFIX}Kapot`, size: 1000,
    };
    expect(await recordFailedMail(ref, "invalid byte sequence for encoding UTF8: 0x00", INBOX_TEST_ACTOR)).toBe("review");
    const item = (await inboxStorage.getByAttachmentHash(sha256(`mail:${ref.messageId}`)))!;
    expect(item).toMatchObject({ status: "review", reviewReason: "parse_failed", fromAddress: "facturen@garage-test.invalid", attachmentPath: null });
    expect(item.errorMessage).toContain("drie keer");
    expect(item.errorMessage).toContain("0x00");

    expect(await recordFailedMail(ref, "nog steeds stuk", INBOX_TEST_ACTOR)).toBe("skipped");
  });
});

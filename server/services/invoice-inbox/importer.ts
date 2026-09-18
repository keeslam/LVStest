import fs from "fs";
import path from "path";
import { simpleParser, type ParsedMail } from "mailparser";
import { getUploadsDir } from "../../../shared/paths";
import type { InvoiceInboxItem } from "../../../shared/schema";
import {
  INTERRUPTED_BOOKING_MESSAGE, REVIEW_REASON_LABELS_NL, isAllowedSender, normalizeSender, senderAuthVerdict,
  type InboxParsedInvoice, type InvoiceInboxConfig, type ReviewReason,
} from "../../../shared/invoice-inbox";
import { processInvoiceWithAI, validateParsedInvoice } from "../../utils/invoice-scanner";
import { getRelativePath } from "../document-paths";
import { bookInvoiceAsExpenses, groupLinesByCategory } from "../expenses/book-invoice";
import { inboxStorage } from "./inbox-storage";
import { computeInvoiceHash, sha256 } from "./hash";
import { extractPlates } from "./plates";
import { decideInvoiceBooking } from "./decide";
import { notifyInvoiceInbox } from "./notify";
import type { InboxMessageRef } from "./imap-client";

export type InvoiceScanner = (filePath: string, mimeType: string) => Promise<InboxParsedInvoice>;

let scanner: InvoiceScanner = processInvoiceWithAI;
/** Tests swap the Gemini scanner for a fake; null restores the real one. */
export function setInvoiceScanner(replacement: InvoiceScanner | null): void {
  scanner = replacement ?? processInvoiceWithAI;
}

export interface ImportMailInput { raw: Buffer; config: InvoiceInboxConfig; createdBy: string }
export interface ImportMailResult { attachments: number; booked: number; review: number; skipped: number }

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MAIL = 10;
/** The mail parser buffers a whole mail in memory before any attachment cap applies. */
export const MAX_MAIL_BYTES = 30 * 1024 * 1024;
/** Smaller images are signatures and logos, not invoices. */
const MIN_IMAGE_BYTES = 20 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_SIGNATURE = Buffer.from("%PDF-", "latin1");
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * C2: `%PDF-` has to be at offset 0 (a UTF-8 BOM in front of it is the only
 * thing allowed). It used to be enough for the bytes to appear anywhere in the
 * first kilobyte, so an HTML page or a JavaScript file with `<!-- %PDF- -->`
 * near the top passed as a PDF.
 */
const startsWithPdf = (b: Buffer): boolean =>
  b.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  || (b.subarray(0, 3).equals(UTF8_BOM) && b.subarray(3, 3 + PDF_SIGNATURE.length).equals(PDF_SIGNATURE));

const ACCEPTED: Record<string, { extension: string; matches: (b: Buffer) => boolean }> = {
  "application/pdf": { extension: "pdf", matches: startsWithPdf },
  "image/jpeg": { extension: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extension: "png", matches: (b) => b.subarray(0, 8).equals(PNG_SIGNATURE) },
};

interface UsableAttachment { name: string; content: Buffer; contentType: string }
interface MailMeta { messageId: string | null; fromAddress: string | null; subject: string | null; mailDate: Date | null }

/**
 * C2: the sender no longer chooses the extension. Only the base name survives,
 * without its extension and without any dot, and the server appends the
 * extension of the type the bytes actually are. `factuur.html` declared as a
 * PDF is stored — and named — `factuur.pdf`, so the routes that serve stored
 * files by name cannot be talked into serving HTML from the app's own origin.
 */
function safeAttachmentName(rawName: string, contentType: string): string {
  const base = path.basename(String(rawName ?? ""))
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 100)
    .replace(/^_+$/, "");
  return `${base || "factuur"}.${ACCEPTED[contentType].extension}`;
}

/** The declared type, or the file extension for octet-stream — and in both cases the bytes have to agree. */
function detectType(declared: string, fileName: string, content: Buffer): string | null {
  const type = declared.toLowerCase().trim();
  const name = fileName.toLowerCase();
  let candidate: string | null = type === "image/jpg" ? "image/jpeg" : ACCEPTED[type] ? type : null;
  if (!candidate && (type === "application/octet-stream" || type === "")) {
    if (name.endsWith(".pdf")) candidate = "application/pdf";
    else if (/\.jpe?g$/.test(name)) candidate = "image/jpeg";
    else if (name.endsWith(".png")) candidate = "image/png";
  }
  return candidate && ACCEPTED[candidate].matches(content) ? candidate : null;
}

function usableAttachments(mail: ParsedMail): UsableAttachment[] {
  const usable: UsableAttachment[] = [];
  for (const attachment of mail.attachments ?? []) {
    if (usable.length >= MAX_ATTACHMENTS_PER_MAIL) break;
    if (!Buffer.isBuffer(attachment.content)) continue;
    const content = attachment.content;
    if (content.length > MAX_ATTACHMENT_BYTES) continue;
    const contentType = detectType(attachment.contentType ?? "", attachment.filename ?? "", content);
    if (!contentType) continue;
    if (contentType !== "application/pdf" && content.length < MIN_IMAGE_BYTES) continue;
    usable.push({ name: safeAttachmentName(attachment.filename || "factuur", contentType), content, contentType });
  }
  return usable;
}

/**
 * I2 — is this mail really from the address it says it is?
 *
 * With the name of our own mail server configured (`authservId`) the mail has
 * to carry that server's pass; without it — a host that stamps nothing would
 * otherwise make the feature useless — everything that is not a hard fail or an
 * SPF softfail is let through. Either way a forged "pass" gains nothing: in
 * strict mode it is stamped under the wrong authserv-id, in lenient mode a pass
 * is not what grants trust.
 */
function senderIsTrusted(mail: ParsedMail, fromAddress: string, config: InvoiceInboxConfig): boolean {
  if (!isAllowedSender(fromAddress, config.allowedSenders)) return false;
  const lines = (mail.headerLines ?? []).filter((h) => h.key === "authentication-results").map((h) => h.line);
  const verdict = senderAuthVerdict(lines, fromAddress, config.authservId);
  return config.authservId.trim() ? verdict === "pass" : verdict !== "fail";
}

function storeAttachment(attachment: UsableAttachment, hash: string): { absolutePath: string; relativePath: string } {
  const dir = path.join(getUploadsDir(), "invoice-inbox");
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, `${Date.now()}_${hash.slice(0, 8)}_${attachment.name}`);
  fs.writeFileSync(absolutePath, attachment.content);
  return { absolutePath, relativePath: getRelativePath(absolutePath) };
}

/**
 * The file is already on disk by the time this is called. If the row cannot
 * be written, the file must not linger as an orphan — remove it and rethrow
 * so the mail is retried.
 */
async function createItemOrDiscardFile(
  data: Parameters<typeof inboxStorage.create>[0], absolutePath: string,
): Promise<InvoiceInboxItem> {
  try {
    return await inboxStorage.create(data);
  } catch (error) {
    fs.rmSync(absolutePath, { force: true });
    throw error;
  }
}

const amsterdamToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
const euro = (amount: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

async function notifyReview(reason: ReviewReason, vendor: string | undefined, meta: MailMeta): Promise<void> {
  const who = vendor?.trim() || meta.fromAddress || "onbekende afzender";
  await notifyInvoiceInbox({
    title: `Factuur van ${who} wacht op controle`,
    description: `Reden: ${REVIEW_REASON_LABELS_NL[reason]}. Onderwerp: ${meta.subject ?? "(geen onderwerp)"}`,
  });
}

/**
 * A mail whose declared size exceeds MAX_MAIL_BYTES is never downloaded — the
 * poller calls this instead of fetching and importing it. Recorded once, by
 * the same "mail:<message id>" hash scheme as a mail without a usable
 * attachment, so a mail that keeps coming back oversize is not queued twice.
 */
export async function recordOversizeMail(ref: InboxMessageRef, createdBy: string): Promise<"review" | "skipped"> {
  return recordUnprocessableMail(ref, createdBy, "no_attachment",
    "De mail is groter dan 30 MB en is niet opgehaald. Vraag de factuur opnieuw op of boek hem met de hand.");
}

/**
 * I1 — a mail whose import throws on every attempt used to stay unseen for
 * ever: the queue stopped moving and every run paid for a fresh scan. The
 * poller counts the attempts and, on the third, hands the mail here: one review
 * item so staff still see it, then the mail is marked processed.
 */
export async function recordFailedMail(ref: InboxMessageRef, errorMessage: string, createdBy: string): Promise<"review" | "skipped"> {
  return recordUnprocessableMail(ref, createdBy, "parse_failed",
    `De mail kon drie keer niet worden verwerkt: ${errorMessage}`);
}

/** One review item for a mail that was never opened, keyed by the same "mail:<id>" hash. */
async function recordUnprocessableMail(
  ref: InboxMessageRef, createdBy: string, reason: ReviewReason, errorMessage: string,
): Promise<"review" | "skipped"> {
  const attachmentHash = sha256(`mail:${ref.messageId ?? `uid:${ref.uid}`}`);
  if (await inboxStorage.getByAttachmentHash(attachmentHash)) return "skipped";

  const meta: MailMeta = {
    messageId: ref.messageId, fromAddress: normalizeSender(ref.from ?? "") || null,
    subject: (ref.subject ?? "").slice(0, 500) || null, mailDate: null,
  };
  await inboxStorage.create({
    ...meta, attachmentHash, status: "review", reviewReason: reason,
    errorMessage: errorMessage.slice(0, 2000), createdBy,
  });
  await notifyReview(reason, undefined, meta);
  return "review";
}

/**
 * Both writers of `invoice_inbox_items` — this importer, and the manual scan
 * route's `/api/expenses/from-invoice` — create the item as "review" with no
 * reason and only upgrade it to "booked" afterwards. Whichever of the two was
 * interrupted between those two steps, a later mail with the same attachment
 * bytes lands here and finishes the bookkeeping: an item deliberately queued
 * for review always carries a reason, so "review" with none is unambiguous.
 */
async function finishInterruptedBooking(item: InvoiceInboxItem): Promise<"booked" | "review" | null> {
  if (item.status !== "review" || item.reviewReason !== null) return null;

  const expenseIds = await inboxStorage.expenseIdsFor(item.id);
  if (expenseIds.length === 0) {
    await inboxStorage.update(item.id, {
      reviewReason: "parse_failed",
      errorMessage: INTERRUPTED_BOOKING_MESSAGE,
    });
    return "review";
  }

  await inboxStorage.update(item.id, {
    status: "booked", expenseIds, processedAt: new Date(), updatedBy: item.createdBy,
  });
  await notifyInvoiceInbox({
    title: `Factuur van ${item.parsed?.vendor?.trim() || item.fromAddress || "onbekende afzender"} geboekt`,
    description: `${expenseIds.length} kostenregel(s) (factuur ${item.parsed?.invoiceNumber || "zonder nummer"})`,
  });
  return "booked";
}

async function importAttachment(
  attachment: UsableAttachment, meta: MailMeta, senderAllowed: boolean, config: InvoiceInboxConfig, createdBy: string,
): Promise<"booked" | "review" | "skipped"> {
  const attachmentHash = sha256(attachment.content);
  const existing = await inboxStorage.getByAttachmentHash(attachmentHash);
  if (existing) return (await finishInterruptedBooking(existing)) ?? "skipped";

  const stored = storeAttachment(attachment, attachmentHash);
  const base = {
    ...meta, attachmentName: attachment.name, attachmentPath: stored.relativePath, attachmentHash,
    attachmentContentType: attachment.contentType, createdBy,
  };

  let parsed: InboxParsedInvoice | null = null;
  let scanError: string | null = null;
  try {
    parsed = await scanner(stored.absolutePath, attachment.contentType);
    const validation = validateParsedInvoice(parsed);
    if (!validation.valid) scanError = validation.errors.join("; ");
  } catch (error) {
    scanError = (error as Error).message;
  }
  if (scanError || !parsed) {
    await createItemOrDiscardFile({ ...base, parsed, status: "review", reviewReason: "parse_failed", errorMessage: (scanError ?? "Uitlezen mislukt").slice(0, 2000) }, stored.absolutePath);
    await notifyReview("parse_failed", parsed?.vendor, meta);
    return "review";
  }

  const plates = extractPlates(parsed);
  parsed = { ...parsed, plates };
  const invoiceHash = computeInvoiceHash(parsed);
  const duplicate = invoiceHash ? Boolean(await inboxStorage.findActiveByInvoiceHash(invoiceHash)) : false;
  const fleetMatches = await inboxStorage.findVehiclesByPlates(plates);
  const decision = decideInvoiceBooking({
    senderAllowed, duplicate, plates, fleetMatches, invoice: parsed, tolerance: config.totalTolerance, today: amsterdamToday(),
  });

  // Written as "review" first: the expenses need the item id, and an item that
  // is never upgraded to "booked" is still visible to staff.
  const item = await createItemOrDiscardFile({
    ...base, invoiceHash, parsed, status: "review",
    reviewReason: decision.action === "review" ? decision.reason : null,
    vehicleId: fleetMatches.length === 1 ? fleetMatches[0].id : null,
  }, stored.absolutePath);
  if (decision.action === "review") {
    await notifyReview(decision.reason, parsed.vendor, meta);
    return "review";
  }

  const booked = await bookInvoiceAsExpenses({
    invoice: parsed, vehicleId: decision.vehicleId, lineItems: groupLinesByCategory(parsed.lineItems),
    receipt: { relativePath: stored.relativePath, fileName: attachment.name, size: attachment.content.length, contentType: attachment.contentType },
    inboxItemId: item.id, createdBy,
  });
  if (booked.expenses.length === 0) {
    await inboxStorage.update(item.id, { reviewReason: "parse_failed", errorMessage: (booked.errors.join("; ") || "Boeken mislukt").slice(0, 2000) });
    await notifyReview("parse_failed", parsed.vendor, meta);
    return "review";
  }

  await inboxStorage.update(item.id, {
    status: "booked", reviewReason: null, vehicleId: decision.vehicleId, expenseIds: booked.expenses.map((e) => e.id),
    errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null, processedAt: new Date(), updatedBy: createdBy,
  });
  const total = booked.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  await notifyInvoiceInbox({
    title: `Factuur van ${parsed.vendor} geboekt op ${fleetMatches[0].licensePlate}`,
    description: `${booked.expenses.length} kostenregel(s), samen ${euro(total)} (factuur ${parsed.invoiceNumber || "zonder nummer"})`,
  });
  return "booked";
}

/**
 * One mail end to end. Every usable attachment becomes exactly one inbox item
 * (or is skipped when its bytes were seen before); a mail without one becomes a
 * single "no_attachment" item. A bad attachment never stops the others; an
 * error thrown from here means the whole mail should be retried next run.
 */
export async function importInvoiceMail(input: ImportMailInput): Promise<ImportMailResult> {
  const mail = await simpleParser(input.raw);
  const fromAddress = normalizeSender(mail.from?.value?.[0]?.address ?? mail.from?.text ?? "");
  const senderAllowed = senderIsTrusted(mail, fromAddress, input.config);
  const meta: MailMeta = {
    messageId: mail.messageId ?? null,
    fromAddress: fromAddress || null,
    subject: (mail.subject ?? "").slice(0, 500) || null,
    mailDate: mail.date ?? null,
  };
  const result: ImportMailResult = { attachments: 0, booked: 0, review: 0, skipped: 0 };

  const attachments = usableAttachments(mail);
  if (attachments.length === 0) {
    const attachmentHash = sha256(`mail:${mail.messageId ?? sha256(input.raw)}`);
    if (await inboxStorage.getByAttachmentHash(attachmentHash)) { result.skipped += 1; return result; }
    await inboxStorage.create({ ...meta, attachmentHash, status: "review", reviewReason: "no_attachment", createdBy: input.createdBy });
    await notifyReview("no_attachment", undefined, meta);
    result.review += 1;
    return result;
  }

  for (const attachment of attachments) {
    const outcome = await importAttachment(attachment, meta, senderAllowed, input.config, input.createdBy);
    result.attachments += 1;
    result[outcome] += 1;
  }
  return result;
}

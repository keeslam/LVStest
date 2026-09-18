import fs from "fs";
import path from "path";
import { simpleParser, type ParsedMail } from "mailparser";
import { getUploadsDir } from "../../../shared/paths";
import {
  REVIEW_REASON_LABELS_NL, isAllowedSender, normalizeSender,
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
/** Smaller images are signatures and logos, not invoices. */
const MIN_IMAGE_BYTES = 20 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ACCEPTED: Record<string, { extension: string; matches: (b: Buffer) => boolean }> = {
  "application/pdf": { extension: "pdf", matches: (b) => b.subarray(0, 1024).includes("%PDF-") },
  "image/jpeg": { extension: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extension: "png", matches: (b) => b.subarray(0, 8).equals(PNG_SIGNATURE) },
};

interface UsableAttachment { name: string; content: Buffer; contentType: string }
interface MailMeta { messageId: string | null; fromAddress: string | null; subject: string | null; mailDate: Date | null }

/** Same rule as the CJIB importer: base name only, conservative character set. */
const safeName = (name: string) => path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);

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
    usable.push({ name: safeName(attachment.filename || `factuur.${ACCEPTED[contentType].extension}`), content, contentType });
  }
  return usable;
}

/**
 * The receiving mail server's verdict. Only a hard fail counts, and only
 * against the sender: a forged "pass" line gains an attacker nothing here.
 */
function senderAuthFailed(mail: ParsedMail): boolean {
  const results = (mail.headerLines ?? [])
    .filter((h) => h.key === "authentication-results").map((h) => h.line).join(" ").toLowerCase();
  return /\bdmarc=fail\b/.test(results) || /\bspf=fail\b/.test(results);
}

function storeAttachment(attachment: UsableAttachment, hash: string): { absolutePath: string; relativePath: string } {
  const dir = path.join(getUploadsDir(), "invoice-inbox");
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, `${Date.now()}_${hash.slice(0, 8)}_${attachment.name}`);
  fs.writeFileSync(absolutePath, attachment.content);
  return { absolutePath, relativePath: getRelativePath(absolutePath) };
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

async function importAttachment(
  attachment: UsableAttachment, meta: MailMeta, senderAllowed: boolean, config: InvoiceInboxConfig, createdBy: string,
): Promise<"booked" | "review" | "skipped"> {
  const attachmentHash = sha256(attachment.content);
  if (await inboxStorage.getByAttachmentHash(attachmentHash)) return "skipped";

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
    await inboxStorage.create({ ...base, parsed, status: "review", reviewReason: "parse_failed", errorMessage: (scanError ?? "Uitlezen mislukt").slice(0, 2000) });
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
  const item = await inboxStorage.create({
    ...base, invoiceHash, parsed, status: "review",
    reviewReason: decision.action === "review" ? decision.reason : null,
    vehicleId: fleetMatches.length === 1 ? fleetMatches[0].id : null,
  });
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
  const senderAllowed = isAllowedSender(fromAddress, input.config.allowedSenders) && !senderAuthFailed(mail);
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

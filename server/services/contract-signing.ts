/**
 * Signing a contract or a damage form in the customer portal (Kees, 2026-10-18).
 *
 * The customer draws a signature, types a name and agrees; the server then makes a new PDF: the
 * document exactly as it was shown, plus one page with the signature, the name, the time, the IP
 * address and the SHA-256 of the original. That PDF is registered on the reservation as
 * "Contract (Signed)" or "Damage Check (Signed)", so the office finds it where a scanned signed copy
 * always was, and the Klantenportaal dashboard lists it until somebody has seen it.
 *
 * What makes it trustworthy:
 *  - the signer sends the hash of the file they were shown; a different file on disk is refused,
 *    so nobody signs a document that changed while the page was open;
 *  - only the current version can be signed (not stale, no newer unsigned document of that kind);
 *  - one signature per document, enforced by a unique index before any file is written;
 *  - the audit row keeps both hashes, so staff and portal can show that the files did not change.
 */
import { fitInBox, tenantSignatureBoxFrom } from "../../shared/contract-signature-box";
import crypto from "crypto";
import fs from "fs";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "../db";
import { customers, documents, portalUsers, reservations, vehicles, portalContractSignatures, type Document, type PortalContractSignature } from "../../shared/schema";
import {
  CONSENT_STATEMENT_NL, CONSENT_VERSION, MIN_SIGNATURE_BYTES, MAX_SIGNATURE_BYTES, SIGNABLE_LABEL_NL,
  SIGNABLE_DOCUMENT_TYPES, signableSeriesOf, signedKindOf, signedTypeFor, unsignedKindOf,
  type AwaitingSignatureRow, type ContractSignatureDto, type ContractSigningStatus, type SignableKind, type SignatureIntegrity,
  type SignContractInput, type SignedDocumentRow,
} from "../../shared/contract-signing";
import { resolveDocumentFilePath } from "./document-paths";
import { registerGeneratedDocument } from "./document-registry";
import { sanitizeForWinAnsi, wrapTextToWidth } from "../utils/pdf-text";
import { formatDateTimeForLanguage } from "../utils/locale-format";
import { officeTimeZone } from "./office-time";
import { portalCompanyName } from "./company-name";
import { customerDisplayName } from "./customer-display-name";

export function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 of a stored document's file; null when the row has no readable file inside uploads/. */
export async function sha256OfDocument(doc: Pick<Document, "filePath"> | null | undefined): Promise<string | null> {
  const file = doc?.filePath ? resolveDocumentFilePath(doc.filePath) : null;
  if (!file) return null;
  try {
    return sha256(await fs.promises.readFile(file));
  } catch {
    return null;
  }
}

export interface SigningState {
  status: ContractSigningStatus;
  signedBy?: string;
  signedAt?: string;
  signedDocumentId?: number | null;
}

type DocumentRef = Pick<Document, "id" | "reservationId" | "documentType" | "isStale" | "version" | "uploadDate">;

/** The newest current unsigned document per reservation and type: the only one that can be signed. */
function currentUnsignedIds(rows: DocumentRef[]): Set<number> {
  const best = new Map<string, DocumentRef>();
  for (const d of rows) {
    const series = signableSeriesOf(d.documentType);
    if (d.reservationId == null || d.isStale || !series) continue;
    const key = `${d.reservationId}:${series}`;
    const prev = best.get(key);
    const newer = !prev || (d.version ?? 1) > (prev.version ?? 1)
      || ((d.version ?? 1) === (prev.version ?? 1) && new Date(d.uploadDate).getTime() > new Date(prev.uploadDate).getTime());
    if (newer) best.set(key, d);
  }
  return new Set([...best.values()].map((d) => d.id));
}

const NOT_SIGNABLE_RESERVATION = ["cancelled"];

/**
 * Where each contract and damage form of a customer stands. `docs` are the customer's own documents
 * (already scoped by the caller); any other document gets no entry.
 */
export async function signingStates(docs: Document[]): Promise<Map<number, SigningState>> {
  const out = new Map<number, SigningState>();
  const signable = docs.filter((d) => unsignedKindOf(d.documentType) || signedKindOf(d.documentType));
  if (signable.length === 0) return out;
  const ids = signable.map((d) => d.id);
  const signatures = await db.select().from(portalContractSignatures)
    .where(or(inArray(portalContractSignatures.documentId, ids), inArray(portalContractSignatures.signedDocumentId, ids)));
  const byOriginal = new Map(signatures.filter((s) => s.documentId != null).map((s) => [s.documentId!, s]));
  const reservationIds = [...new Set(signable.map((d) => d.reservationId).filter((id): id is number => id != null))];
  const statuses = reservationIds.length
    ? new Map((await db.select({ id: reservations.id, status: reservations.status, deletedAt: reservations.deletedAt }).from(reservations).where(inArray(reservations.id, reservationIds)))
      .map((r) => [r.id, r]))
    : new Map();
  const current = currentUnsignedIds(signable);

  for (const d of signable) {
    if (signedKindOf(d.documentType)) { out.set(d.id, { status: "signed_copy" }); continue; }
    const signature = byOriginal.get(d.id);
    if (signature) {
      out.set(d.id, { status: "signed", signedBy: signature.signerName, signedAt: signature.signedAt.toISOString(), signedDocumentId: signature.signedDocumentId });
      continue;
    }
    const reservation = d.reservationId != null ? statuses.get(d.reservationId) : undefined;
    const open = reservation && !reservation.deletedAt && !NOT_SIGNABLE_RESERVATION.includes(reservation.status);
    out.set(d.id, { status: open && current.has(d.id) ? "to_sign" : "superseded" });
  }
  return out;
}

export type SignRefusal = { ok: false; status: number; code: "ALREADY_SIGNED" | "NOT_SIGNABLE" | "DOCUMENT_CHANGED" | "INVALID_SIGNATURE" | "FILE_MISSING"; message: string };
export type SignResult = { ok: true; signature: PortalContractSignature; signedDocument: Document; kind: SignableKind } | SignRefusal;

/** The PNG bytes of a drawn signature, or null when it is not a usable PNG of a sane size. */
export function signaturePngBytes(dataUrl: string): Buffer | null {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < MIN_SIGNATURE_BYTES || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return bytes;
}

export interface SignaturePageInfo {
  kind: SignableKind;
  signerName: string;
  signerEmail: string;
  companyName: string | null;
  reservationId: number;
  contractNumber: string | null;
  originalFileName: string;
  originalVersion: number | null;
  originalSha256: string;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  portalOwner: string;
}

/** The document as it was, plus one page that records the signature. */
export async function buildSignedPdf(original: Buffer, signaturePng: Buffer, info: SignaturePageInfo): Promise<Buffer> {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = await pdf.embedPng(signaturePng);
  // Kees 2026-10-21: the customer's signature also goes into the template's "Handtekening
  // huurder" box, recorded in the contract's keywords when it was made (older contracts have none).
  const tenantBox = info.kind === "contract" ? tenantSignatureBoxFrom(pdf.getKeywords()) : null;
  if (tenantBox && pdf.getPageCount() > 0) {
    pdf.getPage(0).drawImage(image, fitInBox(image.width, image.height, tenantBox));
  }
  const page = pdf.addPage([595.28, 841.89]);
  const left = 56;
  const width = 595.28 - left * 2;
  let y = 780;
  const text = (value: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    for (const line of wrapTextToWidth(sanitizeForWinAnsi(value, "signature page"), f, size, width, 6)) {
      page.drawText(line, { x: left, y, size, font: f, color: rgb(...(opts.color ?? [0.1, 0.1, 0.15])) });
      y -= size + 4;
    }
  };
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    page.drawText(sanitizeForWinAnsi(label, "signature label"), { x: left, y, size: 9, font: bold, color: rgb(0.35, 0.35, 0.45) });
    const lines = wrapTextToWidth(sanitizeForWinAnsi(value, "signature value"), font, 10, width - 150, 4);
    for (const line of lines) {
      page.drawText(line, { x: left + 150, y, size: 10, font, color: rgb(0.1, 0.1, 0.15) });
      y -= 14;
    }
    y -= 2;
  };
  const label = SIGNABLE_LABEL_NL[info.kind];

  text("Digitale ondertekening", { size: 18, bold: true });
  text("Digital signature", { size: 10, color: [0.4, 0.4, 0.5] });
  y -= 10;
  text(CONSENT_STATEMENT_NL[info.kind]);
  y -= 10;

  const when = formatDateTimeForLanguage(info.signedAt, "nl", officeTimeZone());
  row("Ondertekend door", info.signerName);
  row("E-mailadres", info.signerEmail);
  row("Namens", info.companyName);
  row("Datum en tijd", `${when} (${officeTimeZone()})`);
  row("Reservering", `#${info.reservationId}${info.contractNumber ? `, contract ${info.contractNumber}` : ""}`);
  row(label, `${info.originalFileName}${info.originalVersion ? ` (versie ${info.originalVersion})` : ""}`);
  row("IP-adres", info.ip);
  row("Browser", info.userAgent ? info.userAgent.slice(0, 300) : null);
  row("SHA-256 origineel", info.originalSha256);
  y -= 8;

  page.drawText("Handtekening", { x: left, y, size: 9, font: bold, color: rgb(0.35, 0.35, 0.45) });
  y -= 8;
  const scale = Math.min(260 / image.width, 110 / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawRectangle({ x: left, y: y - h - 12, width: w + 24, height: h + 12, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 1 });
  page.drawImage(image, { x: left + 12, y: y - h - 6, width: w, height: h });
  y -= h + 30;

  text(`Ondertekend via het klantenportaal van ${info.portalOwner}. Deze pagina hoort bij het document hiervoor; `
    + "de SHA-256-code hierboven is de digitale vingerafdruk van dat document op het moment van ondertekenen.", { size: 8, color: [0.4, 0.4, 0.5] });

  pdf.setSubject(`Digitaal ondertekend: ${label.toLowerCase()}, reservering #${info.reservationId}`);
  pdf.setKeywords(["signed", `sha256:${info.originalSha256}`]);
  pdf.setModificationDate(info.signedAt);
  return Buffer.from(await pdf.save());
}

/**
 * Signs `doc` (already scoped to the customer by the caller) for the signing portal user.
 * Nothing is written unless every check passes; the unique index decides a race.
 */
export async function signContract(args: {
  doc: Document;
  customerId: number;
  companyName: string | null;
  signer: { id: number; email: string };
  input: SignContractInput;
  ip: string | null;
  userAgent: string | null;
  language: string | null;
}): Promise<SignResult> {
  const { doc, input } = args;
  const kind = unsignedKindOf(doc.documentType);
  if (!kind || doc.reservationId == null) {
    return { ok: false, status: 409, code: "NOT_SIGNABLE", message: "This document cannot be signed." };
  }
  const state = (await signingStates([doc, ...(await siblingDocuments(doc))])).get(doc.id);
  if (state?.status === "signed") return { ok: false, status: 409, code: "ALREADY_SIGNED", message: "This document has already been signed." };
  if (state?.status !== "to_sign") return { ok: false, status: 409, code: "NOT_SIGNABLE", message: "A newer version of this document exists, or the reservation is closed." };

  const file = resolveDocumentFilePath(doc.filePath);
  if (!file) return { ok: false, status: 404, code: "FILE_MISSING", message: "The document file is not available." };
  const original = await fs.promises.readFile(file);
  const originalSha256 = sha256(original);
  if (originalSha256 !== input.documentSha256) {
    return { ok: false, status: 409, code: "DOCUMENT_CHANGED", message: "The document changed after it was opened. Open it again before signing." };
  }
  const png = signaturePngBytes(input.signature);
  if (!png) return { ok: false, status: 400, code: "INVALID_SIGNATURE", message: "The signature is empty or not a valid image." };

  const [reservation] = await db.select({ contractNumber: reservations.contractNumber, vehicleId: reservations.vehicleId }).from(reservations).where(eq(reservations.id, doc.reservationId));
  const signedAt = new Date();
  let signedBytes: Buffer;
  try {
    signedBytes = await buildSignedPdf(original, png, {
      kind, signerName: input.name, signerEmail: args.signer.email, companyName: args.companyName,
      reservationId: doc.reservationId, contractNumber: reservation?.contractNumber ?? null,
      originalFileName: doc.fileName, originalVersion: doc.version ?? null, originalSha256,
      signedAt, ip: args.ip, userAgent: args.userAgent, portalOwner: portalCompanyName(),
    });
  } catch (e) {
    console.error("signed PDF could not be built:", (e as Error).message);
    return { ok: false, status: 400, code: "INVALID_SIGNATURE", message: "The signature could not be placed on the document." };
  }
  const signedSha256 = sha256(signedBytes);

  // The audit row first: the unique index on document_id makes a second signer stop here, before any file exists.
  const [signature] = await db.insert(portalContractSignatures).values({
    documentKind: kind, documentId: doc.id, reservationId: doc.reservationId, customerId: args.customerId, portalUserId: args.signer.id,
    signerName: input.name, signerEmail: args.signer.email, signedAt, ip: args.ip, userAgent: args.userAgent?.slice(0, 500) ?? null,
    language: args.language, consentVersion: CONSENT_VERSION,
    originalFileName: doc.fileName, originalVersion: doc.version ?? null, originalSha256, signedSha256,
  }).onConflictDoNothing().returning();
  if (!signature) return { ok: false, status: 409, code: "ALREADY_SIGNED", message: "This document has already been signed." };

  let signedDocument: Document;
  try {
    signedDocument = await registerGeneratedDocument({
      documentType: signedTypeFor(kind), bytes: signedBytes,
      vehicleId: doc.vehicleId ?? reservation?.vehicleId ?? null, reservationId: doc.reservationId,
      createdBy: `portaal: ${input.name}`,
      notes: `Digitaal ondertekend in het klantenportaal door ${input.name} (document #${doc.id}, SHA-256 ${originalSha256})`,
      // A second signed version must not hide the first: both stay current in the dossier.
      supersedePrevious: false,
    });
  } catch (e) {
    await db.delete(portalContractSignatures).where(eq(portalContractSignatures.id, signature.id));
    throw e;
  }
  const [linked] = await db.update(portalContractSignatures).set({ signedDocumentId: signedDocument.id })
    .where(eq(portalContractSignatures.id, signature.id)).returning();
  return { ok: true, signature: linked ?? signature, signedDocument, kind };
}

/** The other signable documents of the same reservation, so "is this the current version" can be answered. */
async function siblingDocuments(doc: Document): Promise<Document[]> {
  if (doc.reservationId == null) return [];
  const rows = await db.select().from(documents).where(eq(documents.reservationId, doc.reservationId));
  return rows.filter((d) => d.id !== doc.id && (unsignedKindOf(d.documentType) || signedKindOf(d.documentType)));
}

/** True when a document is the original or the result of a portal signature: it must not be changed or deleted. */
export async function isDocumentLockedBySignature(documentId: number): Promise<boolean> {
  const [row] = await db.select({ id: portalContractSignatures.id }).from(portalContractSignatures)
    .where(or(eq(portalContractSignatures.documentId, documentId), eq(portalContractSignatures.signedDocumentId, documentId))).limit(1);
  return Boolean(row);
}

async function integrityOf(documentId: number | null, expected: string): Promise<SignatureIntegrity> {
  if (documentId == null) return "missing";
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  const actual = await sha256OfDocument(doc);
  if (!actual) return "missing";
  return actual === expected ? "intact" : "changed";
}

/** The integrity of the signed PDF alone (the portal download refuses a changed one). */
export async function signedCopyIntegrity(documentId: number): Promise<SignatureIntegrity | null> {
  const [row] = await db.select().from(portalContractSignatures).where(eq(portalContractSignatures.signedDocumentId, documentId)).limit(1);
  if (!row) return null;
  return integrityOf(documentId, row.signedSha256);
}

const kindOf = (value: string | null | undefined): SignableKind => (value === "damage_check" ? "damage_check" : "contract");

export function toSignatureDto(row: PortalContractSignature, integrity: ContractSignatureDto["integrity"]): ContractSignatureDto {
  return {
    id: row.id, documentKind: kindOf(row.documentKind), documentId: row.documentId, signedDocumentId: row.signedDocumentId, reservationId: row.reservationId,
    signerName: row.signerName, signerEmail: row.signerEmail, signedAt: row.signedAt.toISOString(),
    ip: row.ip, userAgent: row.userAgent, consentVersion: row.consentVersion,
    originalFileName: row.originalFileName, originalVersion: row.originalVersion,
    originalSha256: row.originalSha256, signedSha256: row.signedSha256, integrity,
  };
}

/** Every portal signature of a reservation, newest first, with a fresh check of both files. */
export async function listSignaturesForReservation(reservationId: number): Promise<ContractSignatureDto[]> {
  const rows = await db.select().from(portalContractSignatures)
    .where(eq(portalContractSignatures.reservationId, reservationId));
  rows.sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
  return Promise.all(rows.map(async (row) => toSignatureDto(row, {
    original: await integrityOf(row.documentId, row.originalSha256),
    signed: await integrityOf(row.signedDocumentId, row.signedSha256),
  })));
}

// ---- the Klantenportaal dashboard (Kees, 2026-10-18) ------------------------------------------

/** Documents that came back signed, newest first; `onlyUnseen` = what the office has not looked at yet. */
export async function listSignedDocuments(opts: { onlyUnseen?: boolean; limit?: number } = {}): Promise<SignedDocumentRow[]> {
  const rows = await db.select({
    s: portalContractSignatures, customerName: customerDisplayName(), licensePlate: vehicles.licensePlate,
  }).from(portalContractSignatures)
    .innerJoin(customers, eq(portalContractSignatures.customerId, customers.id))
    .leftJoin(reservations, eq(portalContractSignatures.reservationId, reservations.id))
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(opts.onlyUnseen ? isNull(portalContractSignatures.seenAt) : undefined)
    .orderBy(desc(portalContractSignatures.signedAt), desc(portalContractSignatures.id))
    .limit(opts.limit ?? 200);
  return rows.map(({ s, customerName, licensePlate }) => ({
    id: s.id, documentKind: kindOf(s.documentKind), reservationId: s.reservationId, customerId: s.customerId,
    customerName, licensePlate: licensePlate ?? null, signerName: s.signerName, signedAt: s.signedAt.toISOString(),
    signedDocumentId: s.signedDocumentId, seenAt: s.seenAt ? s.seenAt.toISOString() : null, seenBy: s.seenBy,
  }));
}

/** Notes that the office has seen a signed document; the first one counts. False when there is no such row. */
export async function markSignatureSeen(id: number, username: string): Promise<boolean> {
  const [exists] = await db.select({ id: portalContractSignatures.id }).from(portalContractSignatures).where(eq(portalContractSignatures.id, id));
  if (!exists) return false;
  await db.update(portalContractSignatures).set({ seenAt: new Date(), seenBy: username })
    .where(and(eq(portalContractSignatures.id, id), isNull(portalContractSignatures.seenAt)));
  return true;
}

/**
 * Current unsigned contracts and damage forms of portal customers that nobody has signed yet: what the
 * portal shows as "Tekenen". Only running or booked rentals; the newest version per reservation and kind.
 */
export async function listAwaitingSignature(limit = 200): Promise<AwaitingSignatureRow[]> {
  const rows = await db.select({
    id: documents.id, documentType: documents.documentType, reservationId: documents.reservationId, isStale: documents.isStale,
    version: documents.version, uploadDate: documents.uploadDate,
    customerId: reservations.customerId, customerName: customerDisplayName(), licensePlate: vehicles.licensePlate,
  }).from(documents)
    .innerJoin(reservations, eq(documents.reservationId, reservations.id))
    .innerJoin(customers, eq(reservations.customerId, customers.id))
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(and(
      inArray(documents.documentType, [...SIGNABLE_DOCUMENT_TYPES]),
      inArray(reservations.status, ["booked", "picked_up"]),
      isNull(reservations.deletedAt),
      sql`exists (select 1 from ${portalUsers} pu where pu.customer_id = ${customers.id})`,
    ));
  const current = currentUnsignedIds(rows);
  const candidates = rows.filter((r) => current.has(r.id));
  if (candidates.length === 0) return [];
  const signed = new Set((await db.select({ id: portalContractSignatures.documentId }).from(portalContractSignatures)
    .where(inArray(portalContractSignatures.documentId, candidates.map((r) => r.id)))).map((r) => r.id));
  return candidates
    .filter((r) => !signed.has(r.id))
    .sort((a, b) => new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime())
    .slice(0, limit)
    .map((r) => ({
      documentId: r.id, documentKind: unsignedKindOf(r.documentType) ?? "contract", reservationId: r.reservationId!,
      customerId: r.customerId!, customerName: r.customerName, licensePlate: r.licensePlate ?? null, since: new Date(r.uploadDate).toISOString(),
    }));
}

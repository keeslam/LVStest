/**
 * The one place a generated document becomes a file on disk **and** a row in
 * `documents`.
 *
 * FIX-O (CQ-008, BUG-027, BUG-165, BUG-190) plus decision B-05.
 *
 * Before this module there were fifteen `createDocument` call sites with two
 * folder conventions and four different filename shapes, and every one of them
 * had the registration wrapped in a catch that swallowed the error around
 * the file write:
 *
 *  - `generate-default` and `damage-checks/generate` passed
 *    `uploadDate: new Date().toISOString()` — a **string** into a `timestamp`
 *    column — so the insert threw every single time. The file was written, the
 *    catch swallowed the error, the caller got its PDF, and the document never
 *    appeared in the dossier, so staff regenerated it again and again
 *    (BUG-165).
 *  - the contract branch built its filename from plate + date only, so a second
 *    contract for the same plate on the same day overwrote the first file while
 *    still creating a second row: N rows, one file, deleting either broke the
 *    other (BUG-027).
 *  - the version number was read outside any transaction and appended to
 *    `document_type` as text, so two parallel generations both read "1" and both
 *    wrote "1" (BUG-190).
 *
 * Now: one folder convention keyed on the **vehicle id** (a plate can be
 * re-issued to another car, and a plate change used to merge two vehicles'
 * folders — BUG-150), one filename with a millisecond timestamp, the version
 * number in its own column computed under an advisory lock, and an insert that
 * is allowed to fail loudly.
 */
import fs from "fs";
import path from "path";
import { sql, and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { documents, type Document } from "../../shared/schema";
import { resolveUploadsPath } from "../../shared/paths";
import { getRelativePath, resolveDocumentFilePath } from "./document-paths";

/** Document types this app generates, as stored in `documents.document_type`. */
export const DOCUMENT_TYPE_CONTRACT_UNSIGNED = "Contract (Unsigned)";
export const DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED = "Damage Check (Unsigned)";
export const DOCUMENT_TYPE_TRANSPORT_REPORT = "transport_report";

export interface RegisterGeneratedDocumentInput {
  /** Stored verbatim. Never carries a version suffix any more (B-05). */
  documentType: string;
  bytes: Buffer;
  vehicleId?: number | null;
  /** Only used to make the filename readable; the folder is keyed on the id. */
  vehiclePlate?: string | null;
  reservationId?: number | null;
  createdBy?: string | null;
  notes?: string | null;
  contentType?: string;
  extension?: string;
  /**
   * Whether older, non-stale documents of the same type for the same
   * reservation are marked "verouderd" by this generation (B-05). Defaults to
   * true whenever there is a reservation to group by.
   */
  supersedePrevious?: boolean;
}

/** `Contract (Unsigned)` -> `contract_unsigned`. */
function slugForType(documentType: string): string {
  const slug = documentType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "document";
}

function plateForFilename(plate: string | null | undefined): string {
  const cleaned = (plate || "").replace(/[^a-zA-Z0-9]/g, "");
  return cleaned || "vehicle";
}

/** `2026-09-12T10-11-12-345Z` — sortable, filesystem-safe, millisecond-unique. */
function fileStamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/**
 * The directory a generated document belongs in.
 *
 * BUG-150: the old layout was `uploads/<plate>/<type>/` and
 * `uploads/contracts/<plate>/`, so renaming a plate orphaned every document
 * and re-issuing a plate merged two vehicles' folders. New writes go to
 * `uploads/documents/<vehicleId>/<type>/`; historical rows are untouched and
 * still resolve, because `resolveDocumentFilePath()` reads the path stored on
 * the row rather than rebuilding it from the plate.
 */
export function generatedDocumentDir(vehicleId: number | null | undefined, documentType: string): string {
  const owner = vehicleId ? String(vehicleId) : "general";
  return resolveUploadsPath("documents", owner, slugForType(documentType));
}

/**
 * Writes the file and registers the row. Throws when either fails — the
 * caller must not pretend the document exists.
 */
export async function registerGeneratedDocument(
  input: RegisterGeneratedDocumentInput,
): Promise<Document> {
  const {
    documentType,
    bytes,
    vehicleId = null,
    vehiclePlate = null,
    reservationId = null,
    createdBy = null,
    notes = null,
    contentType = "application/pdf",
    extension = ".pdf",
  } = input;

  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error(`Refusing to register an empty ${documentType} document`);
  }

  const dir = generatedDocumentDir(vehicleId, documentType);
  await fs.promises.mkdir(dir, { recursive: true });

  const fileName = [
    plateForFilename(vehiclePlate),
    slugForType(documentType),
    fileStamp(),
    Math.random().toString(36).slice(2, 6),
  ].join("_") + extension;
  const absolutePath = path.join(dir, fileName);

  await fs.promises.writeFile(absolutePath, bytes);

  const supersedePrevious = input.supersedePrevious ?? reservationId !== null;

  try {
    return await db.transaction(async (tx) => {
      // Serialise version numbering per (reservation, type). Without this two
      // parallel generations both read max(version)=1 and both write 2.
      if (reservationId !== null) {
        const lockKey = `document-version:${reservationId}:${documentType}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      }

      let version = 1;
      if (reservationId !== null) {
        const rows = await tx
          .select({ version: documents.version })
          .from(documents)
          .where(and(eq(documents.reservationId, reservationId), eq(documents.documentType, documentType)));
        for (const row of rows) {
          const current = row.version ?? 1;
          if (current >= version) version = current + 1;
        }
      }

      if (supersedePrevious && reservationId !== null) {
        await tx
          .update(documents)
          .set({
            isStale: true,
            staleReason: "superseded by a newer version",
            staleSince: new Date(),
          })
          .where(
            and(
              eq(documents.reservationId, reservationId),
              eq(documents.documentType, documentType),
              or(isNull(documents.isStale), eq(documents.isStale, false)),
            ),
          );
      }

      const [row] = await tx
        .insert(documents)
        .values({
          vehicleId,
          reservationId,
          documentType,
          fileName,
          filePath: getRelativePath(absolutePath),
          fileSize: bytes.length,
          contentType,
          notes,
          createdBy,
          version,
          isStale: false,
        })
        .returning();
      return row;
    });
  } catch (error) {
    // The row is the point; a file with no row is the defect this module
    // exists to remove, so do not leave one behind.
    try {
      await fs.promises.unlink(absolutePath);
    } catch {
      /* nothing more we can do */
    }
    throw error;
  }
}

/**
 * B-05: mark the documents of a reservation as "verouderd" after a change that
 * invalidates them. The file and the row are kept; the employee decides when a
 * new version is generated.
 */
export async function markReservationDocumentsStale(
  reservationId: number,
  documentTypes: string[],
  reason: string,
): Promise<number> {
  if (!Number.isInteger(reservationId) || documentTypes.length === 0) return 0;
  let marked = 0;
  for (const documentType of documentTypes) {
    const rows = await db
      .update(documents)
      .set({ isStale: true, staleReason: reason, staleSince: new Date() })
      .where(
        and(
          eq(documents.reservationId, reservationId),
          eq(documents.documentType, documentType),
          or(isNull(documents.isStale), eq(documents.isStale, false)),
        ),
      )
      .returning({ id: documents.id });
    marked += rows.length;
  }
  return marked;
}

export interface DocumentWithFileState extends Document {
  /**
   * BUG-195: a document whose file has disappeared used to be listed as a
   * perfectly normal document — the failure only showed when somebody clicked
   * download and got a 404. The row is still listed (nothing is hidden or
   * deleted without a decision), but it now says so.
   */
  fileMissing: boolean;
}

/** Adds `fileMissing` to one document. Never throws. */
export function annotateDocumentFileState<T extends { filePath?: string | null }>(
  document: T,
): T & { fileMissing: boolean } {
  let fileMissing = true;
  try {
    fileMissing = resolveDocumentFilePath(document.filePath) === null;
  } catch {
    fileMissing = true;
  }
  return { ...document, fileMissing };
}

/** Adds `fileMissing` to a list of documents. */
export function annotateDocumentsFileState<T extends { filePath?: string | null }>(
  rows: T[],
): Array<T & { fileMissing: boolean }> {
  return rows.map(annotateDocumentFileState);
}

export interface ContractSubject {
  id?: number;
  type?: string | null;
  placeholderSpare?: boolean | null;
  vehicleId?: number | null;
  customerId?: number | null;
  vehicle?: unknown;
  customer?: unknown;
}

/**
 * BUG-119: the contract endpoints happily rendered a contract for things that
 * are not a rental. A `maintenance_block` has no customer, and a placeholder
 * spare has no vehicle yet, so every field resolved to an empty string and the
 * endpoint answered 200 with a blank A4 sheet — which was then archived as
 * this reservation's contract. Returns the reason to refuse, or null when the
 * reservation really is a rental that can be printed.
 */
export function contractGenerationRefusal(reservation: ContractSubject | null | undefined): string | null {
  if (!reservation) return "Reservation not found";
  if (reservation.type === "maintenance_block") {
    return "A maintenance block is not a rental: there is no contract to generate for it.";
  }
  if (reservation.placeholderSpare === true || reservation.vehicleId == null) {
    return "This reservation has no vehicle assigned yet (placeholder). Assign a vehicle before generating a contract.";
  }
  if (!reservation.vehicle) {
    return "The vehicle for this reservation could not be loaded, so the contract would be missing its vehicle details.";
  }
  if (reservation.customerId == null || !reservation.customer) {
    return "This reservation has no customer, so the contract would be missing the tenant's details.";
  }
  return null;
}

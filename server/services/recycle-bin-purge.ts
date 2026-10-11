/**
 * Sub-project C, task 7 (besluit B-38, approval B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §5) -
 * emptying a recycle bin.
 *
 * `purgeDeletedRecords(ids)` and `purgeAllOfKind(kind)` remove bin rows for good,
 * ONE TRANSACTION PER RECORD, so a record that cannot be purged never takes the
 * rest of a selection down with it and never leaves a half-removed record behind.
 *
 *   already restored         only the bin row goes: the data is live again and
 *                            nothing in it is ours to remove
 *   reservation / block      the soft-deleted `reservations` row goes after its
 *                            dependants: damage checks (NO ACTION FK) and the
 *                            reservation's OWN documents (contracts, damage checks,
 *                            transport reports); every other document that names the
 *                            reservation (an APK certificate, a receipt, ...) is
 *                            DETACHED, file and row kept. Scan events keep their row
 *                            with a null reservation, the self-links on other
 *                            reservations are nulled; the CASCADE / SET NULL foreign
 *                            keys do the rest. A row that is no longer soft-deleted
 *                            (it is live again) is never deleted: only the stale bin
 *                            row goes. A reservation with fiscal evidence (a fiscal
 *                            assessment or review case of its usage period, or an
 *                            assessment that names it) is REFUSED, `FISCAL_DATA_PRESENT`:
 *                            those records are immutable and the cascade would erase
 *                            them for good
 *   vehicle, customer,       the rows are already gone; the bin row goes, and the
 *   fine, transport          files named in the snapshot
 *
 * FILES. A file is removed only AFTER the commit (a rolled-back purge must not cost
 * a file), only when its stored path resolves to a regular file under the uploads
 * directory (`shared/paths.ts`: a path outside it, a symlink that leaves it, a
 * directory, the uploads root itself and an empty path are never touched, whatever the
 * snapshot says), and only when no live row in any file-bearing table still points
 * at the same file. Paths are stored in several shapes (relative to the uploads
 * directory, absolute, cwd-relative, with a leading "uploads/", with either slash),
 * so two paths are "the same file" when they RESOLVE to the same absolute path, not
 * when the strings are equal. Removing a file is best effort: a failure is logged and
 * reported as `FILE_REMOVAL_FAILED` and does not undo the purge of the row.
 *
 * Two deliberate differences from the spec's list of tables, both on the safe side:
 * `invoice_inbox_items.attachment_path` is checked as a live reference (a booked
 * invoice's expense receipt IS the inbox attachment: one file, two rows), and so are
 * `fine_import_files.raw_path` and the dead column `vehicles.damage_check_attachment`.
 */
import fs from "fs";
import path from "path";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  backupSettings, damageCheckTemplateBackgrounds, damageCheckTemplates, deletedRecords, deliveryTasks, documents, drivers,
  expenses, fineImportFiles, fines, fiscalAssessments, fiscalReviewCases, interactiveDamageChecks, invoiceInboxItems,
  pdfTemplates, portalDocumentAcks, portalRequestAttachments, reservationDriverAssignments, reservations, scanEvents,
  templateBackgrounds, transportReportTemplateBackgrounds, transportReportTemplates, vehicleDiagramTemplates,
  vehicleUsagePeriods, vehicles,
  type DeletedRecord,
} from "../../shared/schema";
import { getUploadsDir, getUploadsRoot, isInsideUploads } from "../../shared/paths";
import { isContractDocument, isDamageCheckDocument, isTransportReportDocument } from "../../shared/document-types";

/* ------------------------------------------------------------------ *
 * Public shapes
 * ------------------------------------------------------------------ */

export interface PurgeActor {
  username: string | null;
  userId: number | null;
}

/** Stable codes the client translates; the messages stay English. */
export type PurgeFailureCode = "NOT_FOUND" | "PURGE_FAILED" | "FILE_REMOVAL_FAILED" | "FISCAL_DATA_PRESENT";

export interface PurgeFailure {
  id: number;
  code: PurgeFailureCode;
  message: string;
}

export type PurgeFileOutcome =
  | "removed"
  /** A live row still points at the same file. */
  | "kept_referenced"
  /** Outside the uploads directory, or a symlink leaving it: never touched. */
  | "kept_outside_uploads"
  /** A directory, the uploads root, or an empty path: never touched. */
  | "kept_not_a_file"
  /** Already gone. */
  | "missing"
  | "failed";

export interface PurgeFileReport {
  path: string;
  outcome: PurgeFileOutcome;
}

/** A document row a reservation purge deleted or detached; goes into the audit row. */
export interface PurgedDocument {
  id: number;
  documentType: string;
  fileName: string;
}

/** What one purged bin row cost; goes into the audit row. */
export interface PurgedRecord {
  id: number;
  entityType: string;
  entityId: number;
  label: string;
  restored: boolean;
  /** Rows deleted per table, besides the bin row itself (`documents_detached` counts rows that stayed). */
  removed: Record<string, number>;
  /** The reservation's own documents that were deleted, and the ones that were only detached. */
  documents: PurgedDocument[];
  documentsDetached: PurgedDocument[];
  files: PurgeFileReport[];
}

export interface PurgeResult {
  purged: number;
  /** What the API answers: one entry per record that was not found or not purged, and per record whose files could not all be removed. */
  failed: PurgeFailure[];
}

/** One audit row, handed to the caller as soon as a record is done (see `PurgeHooks`). */
export interface PurgeAuditEntry {
  action: string; // `<entityType>.purge`
  entityType: string;
  entityId: number;
  status: "success" | "failure";
  details: Record<string, unknown>;
}

export interface PurgeHooks {
  /**
   * Called per record, right after it is done, so a long purge that the client stops
   * waiting for still leaves a complete trail. Must not throw; if it does it is ignored.
   */
  audit?: (entry: PurgeAuditEntry) => Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Which columns hold a path under the uploads directory
 * ------------------------------------------------------------------ */

interface FileColumn {
  /** The drizzle column: gives the live query its table and column. */
  column: any;
  /** The property name in a snapshot written from drizzle rows (camelCase). */
  key: string;
}

/**
 * Columns a bin snapshot can carry a file path in. The camelCase `key` is what the
 * hand-built payloads use (`payload.documents[].filePath`); the cascade snapshot is read
 * with raw SQL and carries the snake_case column name (`file_path`).
 */
const SNAPSHOT_FILE_COLUMNS: FileColumn[] = [
  { column: documents.filePath, key: "filePath" },
  { column: expenses.receiptFilePath, key: "receiptFilePath" },
  { column: reservations.damageCheckPath, key: "damageCheckPath" },
  { column: deliveryTasks.deliveryPhotoPath, key: "deliveryPhotoPath" },
  { column: deliveryTasks.deliverySignaturePath, key: "deliverySignaturePath" },
  { column: deliveryTasks.pickupPhotoPath, key: "pickupPhotoPath" },
  { column: deliveryTasks.pickupSignaturePath, key: "pickupSignaturePath" },
  { column: drivers.licenseFilePath, key: "licenseFilePath" },
  { column: portalRequestAttachments.filePath, key: "filePath" },
  { column: fines.letterFilePath, key: "letterFilePath" },
  // Not written by any code today (the form sends ""), but a file column nonetheless.
  { column: vehicles.damageCheckAttachment, key: "damageCheckAttachment" },
];

/**
 * Live rows that can point at a file without ever appearing in a snapshot. Defence in
 * depth: none of these shares a path with a snapshot today, but a column that names a
 * file under the uploads directory is never one a purge may unlink. A column that cannot
 * be read keeps every file of the record (see `liveReferences`), so a wrong entry here
 * costs a file at worst, never loses one.
 */
const EXTRA_LIVE_COLUMNS: any[] = [
  invoiceInboxItems.attachmentPath, // a booked invoice's receipt is the inbox attachment
  fineImportFiles.rawPath,
  // Template backgrounds and previews (rental contract / damage check / transport report).
  pdfTemplates.backgroundPath, pdfTemplates.backgroundPreviewPath, pdfTemplates.templatePreviewPath,
  templateBackgrounds.backgroundPath, templateBackgrounds.previewPath,
  transportReportTemplates.backgroundPath, transportReportTemplates.backgroundPreviewPath, transportReportTemplates.templatePreviewPath,
  transportReportTemplateBackgrounds.backgroundPath, transportReportTemplateBackgrounds.previewPath,
  damageCheckTemplates.backgroundPath, damageCheckTemplates.backgroundPreviewPath, damageCheckTemplates.templatePreviewPath,
  damageCheckTemplateBackgrounds.backgroundPath, damageCheckTemplateBackgrounds.previewPath,
  vehicleDiagramTemplates.diagramPath, // the legacy local path of a vehicle diagram
  // An expense can carry a file name or a path in these two besides `receipt_file_path`.
  expenses.receiptFile, expenses.receiptUrl,
  // Besluit B-41 D1: the fuel receipt is both the vehicle's `fuel_refill_receipt` and the receipt of the
  // expense the same request booked. Binning and emptying that expense must not unlink a file the
  // vehicle still shows.
  vehicles.fuelRefillReceipt,
  backupSettings.localPath, // where local backups are written
];

const LIVE_REFERENCE_COLUMNS: any[] = [...SNAPSHOT_FILE_COLUMNS.map((c) => c.column), ...EXTRA_LIVE_COLUMNS];

const SNAPSHOT_KEYS = new Set<string>(
  SNAPSHOT_FILE_COLUMNS.flatMap((c) => [c.key, (c.column as { name: string }).name]),
);

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/**
 * Every absolute path a stored value can mean, kept only when it lies strictly inside
 * the uploads directory (lexically). The order and the shapes follow
 * `resolveDocumentFilePath`: uploads-relative first, then the legacy cwd-relative rows,
 * then a leading "uploads/". The uploads root itself and an empty value give nothing.
 */
export function uploadsCandidates(stored: string | null | undefined): string[] {
  if (typeof stored !== "string" || stored.trim() === "") return [];
  const root = getUploadsRoot();
  const forms = new Set<string>([stored]);
  if (stored.includes("\\")) forms.add(stored.replace(/\\/g, "/"));

  const out: string[] = [];
  for (const form of forms) {
    const raw: string[] = path.isAbsolute(form)
      ? [form]
      : [path.join(getUploadsDir(), form), path.join(process.cwd(), form)];
    if (!path.isAbsolute(form) && /^uploads[\\/]/i.test(form)) raw.push(path.join(getUploadsDir(), form.slice("uploads/".length)));
    for (const candidate of raw) {
      const abs = path.resolve(candidate);
      if (abs !== root && isInsideUploads(abs) && !out.includes(abs)) out.push(abs);
    }
  }
  return out;
}

type Located =
  | { kind: "file"; abs: string }
  | { kind: "outside" }
  | { kind: "not_a_file" }
  | { kind: "missing" };

/** Finds the one regular file under the uploads directory a stored path means, or says why there is none. */
async function locate(stored: string): Promise<Located> {
  const candidates = uploadsCandidates(stored);
  if (candidates.length === 0) {
    // An empty value or the uploads root (nothing to remove) is a different thing from a
    // path that points elsewhere, but neither is ever touched.
    return stored.trim() === "" || path.resolve(getUploadsDir(), stored) === getUploadsRoot()
      ? { kind: "not_a_file" }
      : { kind: "outside" };
  }
  for (const abs of candidates) {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(abs);
    } catch {
      continue; // not there under this reading; try the next
    }
    if (!stat.isFile() && !stat.isSymbolicLink()) return { kind: "not_a_file" };
    try {
      // A link (or a parent directory that is one) that leaves the tree is not ours to
      // follow. Both sides are realised: the root itself may sit behind a link or a short
      // 8.3 name (a Windows temp directory, /tmp on macOS), and then only the realised
      // file path is comparable to the realised root.
      const [realFile, realRoot] = await Promise.all([fs.promises.realpath(abs), fs.promises.realpath(getUploadsRoot())]);
      if (realFile === realRoot || !realFile.startsWith(realRoot + path.sep)) return { kind: "outside" };
    } catch {
      continue;
    }
    return { kind: "file", abs };
  }
  return { kind: "missing" };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Which of `files` (absolute paths) some live row still points at. A row is found by its
 * file name (one query per table for all candidates), then its stored value is resolved
 * like any other and compared with the candidate: shape-agnostic and case-insensitive,
 * which errs on the side of keeping a file.
 */
async function liveReferences(files: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (files.length === 0) return referenced;
  const patterns = [...new Set(files.map((abs) => `%${escapeLike(path.basename(abs).toLowerCase())}`))];
  const list = sql.join(patterns.map((p) => sql`${p}`), sql`, `);
  const wanted = new Set(files.map((abs) => abs.toLowerCase()));

  for (const column of LIVE_REFERENCE_COLUMNS) {
    const table = (column as { table: any }).table;
    const rows: Array<{ value: string | null }> = await db
      .select({ value: column })
      .from(table)
      .where(sql`lower(${column}) like any (array[${list}])`);
    for (const { value } of rows) {
      for (const abs of uploadsCandidates(value)) {
        const key = abs.toLowerCase();
        if (wanted.has(key)) referenced.add(key);
      }
    }
  }
  return referenced;
}

/** Walks a snapshot for values under a file-column key. `cascade.nulled` holds links, never files. */
function collectSnapshotPaths(value: unknown, out: Set<string>, depth = 0): void {
  if (value === null || typeof value !== "object" || depth > 10) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSnapshotPaths(item, out, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "nulled") continue;
    if (typeof child === "string") {
      if (SNAPSHOT_KEYS.has(key) && child.trim() !== "") out.add(child);
    } else {
      collectSnapshotPaths(child, out, depth + 1);
    }
  }
}

/** After the commit: removes what may be removed and says what happened to each stored path. */
async function removeFiles(stored: Iterable<string>): Promise<PurgeFileReport[]> {
  const reports: PurgeFileReport[] = [];
  const toCheck = new Map<string, string[]>(); // abs -> stored values that mean it

  for (const value of new Set(stored)) {
    const found = await locate(value);
    if (found.kind === "file") {
      toCheck.set(found.abs, [...(toCheck.get(found.abs) ?? []), value]);
    } else {
      reports.push({ path: value, outcome: found.kind === "outside" ? "kept_outside_uploads" : found.kind === "not_a_file" ? "kept_not_a_file" : "missing" });
    }
  }
  if (toCheck.size === 0) return reports;

  const live = await liveReferences([...toCheck.keys()]);
  for (const [abs, values] of toCheck) {
    const label = values[0];
    if (live.has(abs.toLowerCase())) {
      reports.push({ path: label, outcome: "kept_referenced" });
      continue;
    }
    try {
      await fs.promises.unlink(abs);
      reports.push({ path: label, outcome: "removed" });
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        reports.push({ path: label, outcome: "missing" });
      } else {
        console.error(`[recycle-bin-purge] could not remove ${abs}:`, error?.message ?? error);
        reports.push({ path: label, outcome: "failed" });
      }
    }
  }
  return reports;
}

/* ------------------------------------------------------------------ *
 * One record
 * ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const bump = (counts: Record<string, number>, table: string, by: number) => {
  if (by > 0) counts[table] = (counts[table] ?? 0) + by;
};

/** Thrown inside the transaction, before anything is written, when fiscal evidence stands in the way. */
class FiscalDataPresentError extends Error {
  constructor(readonly assessments: number, readonly reviewCases: number) {
    super("This reservation has fiscal assessments or review cases; they are kept, so it cannot be purged.");
    this.name = "FiscalDataPresentError";
  }
}

/**
 * A document that belongs to the RESERVATION itself, as opposed to a vehicle document that
 * merely names it: the contract (generated "Contract (Unsigned)", an uploaded "Contract
 * (Signed)", a plain "Contract"), a damage check ("Damage Check", "(Pickup)", "(Return)",
 * "(Unsigned)", "(Signed)", the "- Edited (Previous Version ...)" labels, the legacy slug
 * "damage_check") and a transport report. Matched on the shape of the type like the rest of
 * the app does (`shared/document-types.ts`). An APK certificate, an insurance paper, a
 * receipt, a photo ... that carries the reservation id (a maintenance block owns the
 * vehicle's APK document) is the vehicle's: it is detached, never deleted.
 */
function isReservationOwnedDocument(documentType: string | null | undefined): boolean {
  return isContractDocument(documentType) || isDamageCheckDocument(documentType) || isTransportReportDocument(documentType);
}

/** What the audit row lists per document; at most this many per list (counts stay exact). */
const AUDIT_DOCUMENT_CAP = 25;

interface ReservationPurgeDocuments {
  removed: PurgedDocument[];
  detached: PurgedDocument[];
}

/**
 * Hard-deletes the soft-deleted reservation behind a bin row, dependants first. Returns
 * false (touching nothing) when the row is gone or live again; throws
 * `FiscalDataPresentError` (also touching nothing) when fiscal evidence exists.
 */
async function purgeReservationRows(
  tx: Tx, reservationId: number, paths: Set<string>, removed: Record<string, number>, docs: ReservationPurgeDocuments,
): Promise<boolean> {
  const [row] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
  // Live again (restored by hand): the reservation is not ours to delete.
  if (!row || row.deletedAt == null) return false;

  // Fiscal evidence first, before ANYTHING is written. The usage period cascades to its
  // assessments and review cases, which are immutable records the fiscal rules rest on: a
  // purge must never erase them. The period rows are locked, so an assessment being written
  // right now either shows in the count or waits for this transaction.
  const periods = await tx.select({ id: vehicleUsagePeriods.id }).from(vehicleUsagePeriods)
    .where(eq(vehicleUsagePeriods.reservationId, reservationId)).for("update");
  const periodIds = periods.map((p) => p.id);
  const count = sql<number>`count(*)::int`;
  const [assessmentCount] = await tx.select({ n: count }).from(fiscalAssessments).where(
    periodIds.length > 0
      ? or(inArray(fiscalAssessments.usagePeriodId, periodIds), eq(fiscalAssessments.reservationId, reservationId))
      : eq(fiscalAssessments.reservationId, reservationId),
  );
  const [reviewCaseCount] = periodIds.length > 0
    ? await tx.select({ n: count }).from(fiscalReviewCases).where(inArray(fiscalReviewCases.usagePeriodId, periodIds))
    : [{ n: 0 }];
  if (assessmentCount.n > 0 || reviewCaseCount.n > 0) throw new FiscalDataPresentError(assessmentCount.n, reviewCaseCount.n);

  if (row.damageCheckPath) paths.add(row.damageCheckPath);

  // Counted before they cascade away, so the audit row says what the purge took with it.
  const tasks = await tx.select().from(deliveryTasks).where(eq(deliveryTasks.reservationId, reservationId));
  for (const task of tasks) {
    for (const value of [task.deliveryPhotoPath, task.deliverySignaturePath, task.pickupPhotoPath, task.pickupSignaturePath]) {
      if (value) paths.add(value);
    }
  }
  bump(removed, "delivery_tasks", tasks.length);
  const assignments = await tx.select({ id: reservationDriverAssignments.id }).from(reservationDriverAssignments)
    .where(eq(reservationDriverAssignments.reservationId, reservationId));
  bump(removed, "reservation_driver_assignments", assignments.length);
  // The period itself goes with the reservation (CASCADE); it has no assessments or cases, or we would have stopped above.
  bump(removed, "vehicle_usage_periods", periods.length);

  // NO ACTION foreign key: it would block the delete.
  const checks = await tx.delete(interactiveDamageChecks).where(eq(interactiveDamageChecks.reservationId, reservationId)).returning({ id: interactiveDamageChecks.id });
  bump(removed, "interactive_damage_checks", checks.length);

  // Documents have no foreign key, so they would dangle. The reservation's own (contracts,
  // damage checks, transport reports) are deleted and their files collected, removed after
  // the commit; every other document that names it is detached: the row and the file stay.
  const named = await tx.select({ id: documents.id, documentType: documents.documentType, fileName: documents.fileName, filePath: documents.filePath })
    .from(documents).where(eq(documents.reservationId, reservationId)).orderBy(documents.id);
  const own = named.filter((d) => isReservationOwnedDocument(d.documentType));
  const others = named.filter((d) => !isReservationOwnedDocument(d.documentType));
  if (own.length > 0) {
    const ownIds = own.map((d) => d.id);
    // The customers' "gezien en akkoord" on those contracts cascades with them (documents FK).
    const acks = await tx.select({ id: portalDocumentAcks.id }).from(portalDocumentAcks).where(inArray(portalDocumentAcks.documentId, ownIds));
    bump(removed, "portal_document_acks", acks.length);
    await tx.delete(documents).where(inArray(documents.id, ownIds));
    for (const d of own) if (d.filePath) paths.add(d.filePath);
    bump(removed, "documents", own.length);
    docs.removed.push(...own.map(({ id, documentType, fileName }) => ({ id, documentType, fileName })));
  }
  if (others.length > 0) {
    await tx.update(documents).set({ reservationId: null }).where(inArray(documents.id, others.map((d) => d.id)));
    bump(removed, "documents_detached", others.length);
    docs.detached.push(...others.map(({ id, documentType, fileName }) => ({ id, documentType, fileName })));
  }

  // No foreign key, and the row they describe stays: the link is cleared, nothing else.
  await tx.update(scanEvents).set({ reservationId: null }).where(eq(scanEvents.reservationId, reservationId));

  // Self-links on other reservations (no foreign keys either).
  const selfLinks =
    (await tx.update(reservations).set({ replacementForReservationId: null }).where(eq(reservations.replacementForReservationId, reservationId)).returning({ id: reservations.id })).length +
    (await tx.update(reservations).set({ maintenanceBlockId: null }).where(eq(reservations.maintenanceBlockId, reservationId)).returning({ id: reservations.id })).length +
    (await tx.update(reservations).set({ affectedRentalId: null }).where(eq(reservations.affectedRentalId, reservationId)).returning({ id: reservations.id })).length +
    (await tx.update(reservations).set({ recurringParentId: null }).where(eq(reservations.recurringParentId, reservationId)).returning({ id: reservations.id })).length;
  bump(removed, "reservations_unlinked", selfLinks);

  // The CASCADE (assignments, delivery tasks, the empty usage period) and SET NULL (fines,
  // portal requests, transports) foreign keys do the rest.
  await tx.delete(reservations).where(eq(reservations.id, reservationId));
  bump(removed, "reservations", 1);
  return true;
}

type OneResult =
  | { ok: true; record: PurgedRecord; paths: Set<string> }
  | {
      ok: false;
      failure: PurgeFailure;
      known?: { entityType: string; entityId: number; label: string };
      /** Extra audit details for a refusal that is worth a trail (the fiscal one). */
      auditDetails?: Record<string, unknown>;
    };

async function purgeOne(id: number): Promise<OneResult> {
  let known = undefined as { entityType: string; entityId: number; label: string } | undefined;
  try {
    const outcome = await db.transaction(async (tx) => {
      // The lock serialises this with a restore (which claims the same row): whichever
      // comes second sees the other's result, so a record is never purged half-restored.
      const [bin] = await tx.select().from(deletedRecords).where(eq(deletedRecords.id, id)).for("update") as DeletedRecord[];
      if (!bin) return null;
      known = { entityType: bin.entityType, entityId: bin.entityId, label: bin.label };

      const removed: Record<string, number> = {};
      const paths = new Set<string>();
      const docs: ReservationPurgeDocuments = { removed: [], detached: [] };
      const restored = bin.restoredAt != null;
      if (!restored) {
        if (bin.entityType === "reservation" || bin.entityType === "maintenance_block") {
          await purgeReservationRows(tx, bin.entityId, paths, removed, docs);
        } else {
          collectSnapshotPaths(bin.payload, paths);
        }
      }
      await tx.delete(deletedRecords).where(eq(deletedRecords.id, id));
      return { bin, removed, paths, restored, docs };
    });

    if (!outcome) {
      return { ok: false, failure: { id, code: "NOT_FOUND", message: "That deleted record no longer exists." } };
    }
    return {
      ok: true,
      paths: outcome.paths,
      record: {
        id, entityType: outcome.bin.entityType, entityId: outcome.bin.entityId, label: outcome.bin.label,
        restored: outcome.restored, removed: outcome.removed,
        documents: outcome.docs.removed, documentsDetached: outcome.docs.detached, files: [],
      },
    };
  } catch (error) {
    if (error instanceof FiscalDataPresentError) {
      // A refusal, not a fault: the transaction rolled back before it wrote anything, the bin row is still there.
      return {
        ok: false,
        failure: { id, code: "FISCAL_DATA_PRESENT", message: "This reservation has fiscal assessments or review cases, which are kept; it cannot be purged." },
        known,
        auditDetails: { fiscal: { assessments: error.assessments, reviewCases: error.reviewCases } },
      };
    }
    console.error(`[recycle-bin-purge] could not purge deleted record ${id}:`, error);
    return { ok: false, failure: { id, code: "PURGE_FAILED", message: "This record could not be removed." }, known };
  }
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

const FILE_OUTCOMES_KEPT: PurgeFileOutcome[] = ["kept_referenced", "kept_outside_uploads", "kept_not_a_file"];

/** What the audit row says about the files; paths only for the ones that were not simply removed. */
function describeFiles(files: PurgeFileReport[]) {
  const count = (outcome: PurgeFileOutcome) => files.filter((f) => f.outcome === outcome).length;
  return {
    removed: count("removed"),
    kept: files.filter((f) => FILE_OUTCOMES_KEPT.includes(f.outcome)).length,
    missing: count("missing"),
    failed: count("failed"),
    notRemoved: files.filter((f) => f.outcome !== "removed" && f.outcome !== "missing").slice(0, 25),
  };
}

async function audit(hooks: PurgeHooks | undefined, entry: PurgeAuditEntry): Promise<void> {
  try {
    await hooks?.audit?.(entry);
  } catch (error) {
    console.error("[recycle-bin-purge] audit hook failed:", error);
  }
}

/**
 * Purges the given bin rows, one transaction each, in the order given (a repeated id
 * counts once). Never throws for one record's sake: a record that is gone or that could
 * not be purged is listed under `failed` and the rest carry on.
 */
export async function purgeDeletedRecords(ids: number[], actor?: PurgeActor, hooks?: PurgeHooks): Promise<PurgeResult> {
  const result: PurgeResult = { purged: 0, failed: [] };
  // Who did it, in the details of every audit row (the row's own username comes from the request;
  // this keeps the details complete for a caller that is not one, and when the trail is read on its own).
  const purgedBy = actor?.username ? { purgedBy: actor.username } : {};

  for (const id of [...new Set(ids)]) {
    const one = await purgeOne(id);
    if (!one.ok) {
      result.failed.push(one.failure);
      if ((one.failure.code === "PURGE_FAILED" || one.failure.code === "FISCAL_DATA_PRESENT") && one.known) {
        await audit(hooks, {
          action: `${one.known.entityType}.purge`, entityType: one.known.entityType, entityId: one.known.entityId, status: "failure",
          details: { label: one.known.label, deletedRecordId: id, code: one.failure.code, ...purgedBy, ...one.auditDetails },
        });
      }
      continue;
    }

    // After the commit: a rolled-back purge costs no file.
    let files: PurgeFileReport[];
    try {
      files = await removeFiles(one.paths);
    } catch (error) {
      console.error(`[recycle-bin-purge] file clean-up after purging deleted record ${id} failed:`, error);
      files = [...one.paths].map((p) => ({ path: p, outcome: "failed" as const }));
    }
    const { record } = one;
    record.files = files;
    result.purged += 1;
    if (files.some((f) => f.outcome === "failed")) {
      result.failed.push({ id, code: "FILE_REMOVAL_FAILED", message: "The record was removed, but one or more of its files could not be." });
    }
    await audit(hooks, {
      action: `${record.entityType}.purge`, entityType: record.entityType, entityId: record.entityId, status: "success",
      details: {
        label: record.label, deletedRecordId: id, ...purgedBy, restored: record.restored, removed: record.removed,
        // Which documents went and which were only detached (not just how many), capped like `notRemoved`.
        ...(record.documents.length > 0 && { documents: record.documents.slice(0, AUDIT_DOCUMENT_CAP) }),
        ...(record.documentsDetached.length > 0 && { documentsDetached: record.documentsDetached.slice(0, AUDIT_DOCUMENT_CAP) }),
        files: describeFiles(files),
      },
    });
  }
  return result;
}

/** Everything of one kind, restored rows included. */
export async function purgeAllOfKind(entityType: string, actor?: PurgeActor, hooks?: PurgeHooks): Promise<PurgeResult> {
  const rows = await db.select({ id: deletedRecords.id }).from(deletedRecords)
    .where(eq(deletedRecords.entityType, entityType)).orderBy(deletedRecords.id);
  return purgeDeletedRecords(rows.map((r) => r.id), actor, hooks);
}

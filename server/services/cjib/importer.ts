import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getUploadsDir } from "../../../shared/paths";
import { getRelativePath } from "../document-paths";
import type { FineImportDetail, FineImportFile } from "../../../shared/schema";
import type { CjibRecord } from "../../../shared/fines";
import { parseCjibFile } from "./parser";
import { importStorage } from "./import-storage";
import { finesStorage } from "../fines-storage";
import { createFineWithAttribution } from "../fine-create";
import { notifyStaffOfPortalEvent } from "../portal-notifications";

export interface ImportFileInput {
  buffer: Buffer;
  fileName: string;
  source: "cjib_ftps" | "cjib_upload";
  createdBy: string;
}

export interface ImportFileResult {
  file: FineImportFile;
  /** True when this exact file was processed before; nothing was created now. */
  skipped: boolean;
}

const safeName = (name: string) => path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);

function storeRaw(buffer: Buffer, fileName: string): string {
  const dir = path.join(getUploadsDir(), "cjib");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${Date.now()}_${safeName(fileName)}`);
  fs.writeFileSync(target, buffer);
  return getRelativePath(target);
}

async function importRecord(record: CjibRecord, importFileId: number, createdBy: string): Promise<FineImportDetail> {
  const base = { reference: record.reference, licensePlate: record.licensePlate };
  const existing = await finesStorage.findByReference(record.reference);
  if (existing) return { ...base, fineId: existing.id, outcome: "duplicate" };
  try {
    const { fine } = await createFineWithAttribution({
      licensePlate: record.licensePlate, offenceAt: record.offenceAt,
      receivedAt: record.letterDate ?? new Date().toISOString().slice(0, 10),
      reference: record.reference, description: record.description, amount: record.amount,
      internalNotes: [record.offenceCode ? `Feitcode ${record.offenceCode}` : null, record.dueDate ? `Vervaldatum ${record.dueDate}` : null].filter(Boolean).join(" · ") || null,
      source: "cjib", importFileId,
    }, createdBy);
    return { ...base, fineId: fine.id, outcome: fine.status === "linked" ? "linked" : "created" };
  } catch (e) {
    return { ...base, outcome: "failed", error: (e as Error).message };
  }
}

/**
 * One CJIB file end to end: dedupe on content hash, keep the raw file, parse,
 * create every beschikking as a fine (auto-attributed), record what happened
 * and tell staff. A bad record never stops the rest of the file.
 */
export async function importCjibFile(input: ImportFileInput): Promise<ImportFileResult> {
  const fileHash = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const seen = await importStorage.getByHash(fileHash);
  if (seen) return { file: seen, skipped: true };

  const rawPath = storeRaw(input.buffer, input.fileName);
  const file = await importStorage.create({ source: input.source, fileName: input.fileName, fileHash, rawPath, status: "processed", createdBy: input.createdBy });

  let parsed: ReturnType<typeof parseCjibFile>;
  try {
    parsed = parseCjibFile(input.buffer, input.fileName);
  } catch (e) {
    const failed = await importStorage.update(file.id, { status: "failed", errorMessage: (e as Error).message, processedAt: new Date() });
    await notifyImport(failed!);
    return { file: failed!, skipped: false };
  }

  const details: FineImportDetail[] = parsed.rejected.map((r) => ({ reference: r.raw.beschikkingsnummer ?? null, licensePlate: null, outcome: "failed" as const, error: r.error }));
  for (const record of parsed.records) details.push(await importRecord(record, file.id, input.createdBy));
  const records = parsed.records.length + parsed.rejected.length;
  const count = (o: FineImportDetail["outcome"]) => details.filter((d) => d.outcome === o).length;
  const done = await importStorage.update(file.id, {
    recordsTotal: records,
    recordsCreated: count("created") + count("linked"),
    recordsLinked: count("linked"),
    recordsDuplicate: count("duplicate"),
    recordsFailed: count("failed"),
    details, processedAt: new Date(),
  });
  await notifyImport(done!);
  return { file: done!, skipped: false };
}

async function notifyImport(file: FineImportFile): Promise<void> {
  const failed = file.status === "failed";
  await notifyStaffOfPortalEvent({
    kind: "portal_fine_import",
    title: failed ? `CJIB-bestand ${file.fileName} kon niet gelezen worden` : `CJIB: ${file.recordsCreated} beschikking(en) geïmporteerd`,
    description: failed
      ? file.errorMessage ?? "Onbekende fout"
      : `${file.recordsLinked} automatisch gekoppeld, ${file.recordsCreated - file.recordsLinked} niet gekoppeld, ${file.recordsDuplicate} dubbel, ${file.recordsFailed} mislukt (${file.fileName})`,
    link: "/portal-admin?tab=fines",
  });
}

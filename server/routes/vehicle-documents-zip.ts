import { Router } from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { z } from "zod";
import { storage } from "../storage";
import { resolveDocumentFilePath } from "../services/document-paths";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";

/**
 * B-65: the documents of one vehicle as one ZIP (Kees, 2026-10-22: every document ticked,
 * the user may untick some). Only documents of this vehicle go in; a file that is missing
 * on disk is skipped and named in "ontbrekend.txt" inside the ZIP, so the download never
 * fails over one lost file. Mounted by mountStaffRouters() behind the document permissions.
 */
const router = Router();

const bodySchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }).strict();

/** "contract.pdf", "contract.pdf" -> "contract.pdf", "contract (2).pdf" */
export function uniqueZipName(name: string, taken: Set<string>): string {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length) || "document";
  let candidate = `${base}${ext}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

router.post("/:vehicleId/zip", async (req, res) => {
  const vehicleId = Number.parseInt(req.params.vehicleId, 10);
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) return res.status(400).json({ message: "Invalid vehicle ID" });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Send { ids: number[] (1-500) }", code: "INVALID_ZIP_REQUEST" });

  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
  const wanted = new Set(parsed.data.ids);
  const docs = (await storage.getDocumentsByVehicle(vehicleId)).filter((d) => wanted.has(d.id));
  if (docs.length === 0) return res.status(404).json({ message: "No documents found", code: "NO_DOCUMENTS" });

  const plate = (vehicle.licensePlate ?? `voertuig-${vehicleId}`).replace(/[^A-Za-z0-9-]/g, "");
  const zipName = `documenten-${plate}-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (error) => {
    console.error(`vehicle ${vehicleId} documents zip failed:`, error);
    res.destroy(error);
  });
  archive.pipe(res);

  const taken = new Set<string>();
  const missing: string[] = [];
  for (const doc of docs) {
    const file = resolveDocumentFilePath(doc.filePath);
    const name = sanitizeFilename(doc.fileName || path.basename(doc.filePath)) || `document-${doc.id}`;
    if (!file || !fs.existsSync(file)) { missing.push(`${name} (#${doc.id})`); continue; }
    archive.file(file, { name: uniqueZipName(name, taken) });
  }
  if (missing.length > 0) archive.append(`Deze documenten staan niet meer op de server:\r\n${missing.join("\r\n")}\r\n`, { name: "ontbrekend.txt" });
  await archive.finalize();
});

export default router;

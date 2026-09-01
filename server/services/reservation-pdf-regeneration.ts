import path from "path";
import fs from "fs";
import { format } from "date-fns";
import { storage } from "../storage";
import { realtimeEvents } from "../realtime-events";
import { getUploadsDir } from "../../shared/paths";
import { getRelativePath, resolveDocumentFilePath } from "./document-paths";

// Fields on a reservation that, when changed, invalidate any previously
// generated "Contract (Unsigned)" PDFs (because they appear on the contract).
export const CONTRACT_RELEVANT_FIELDS = [
  "contractNumber",
  "vehicleId",
  "customerId",
  "driverId",
  "startDate",
  "endDate",
  "totalPrice",
  "pickupMileage",
  "returnMileage",
  "fuelLevelPickup",
  "fuelLevelReturn",
  "fuelCardNumber",
  "actualPickupDate",
  "actualReturnDate",
  "deliveryRequired",
  "deliveryAddress",
  "deliveryCity",
  "deliveryPostalCode",
  "pickupLocation",
  "returnLocation",
  "notes",
] as const;

// Single-flight queue: ensures regeneration for a given reservation runs
// sequentially even when multiple edits arrive concurrently. Each new request
// chains onto the previous promise so we never have two regen jobs racing on
// the same reservation's documents.
const regenQueues = new Map<number, Promise<void>>();

export type ReservationPdfKinds = {
  contract?: boolean;
  damageCheck?: boolean;
};

/**
 * Schedule regeneration of unsigned PDFs (contract and/or pickup damage check)
 * for a reservation. Runs sequentially per reservation via single-flight queue.
 * Each kind is independent and silently no-ops if no existing unsigned doc of
 * that kind exists.
 */
export function scheduleReservationPdfRegeneration(
  reservationId: number,
  username: string | null,
  kinds: ReservationPdfKinds = { contract: true, damageCheck: true },
): void {
  const previous = regenQueues.get(reservationId) || Promise.resolve();
  const next = previous
    .catch(() => undefined) // don't let a failed prior job poison the chain
    .then(async () => {
      if (kinds.contract) {
        await regenerateUnsignedContractsForReservation(reservationId, username);
      }
      if (kinds.damageCheck) {
        await regenerateUnsignedDamageChecksForReservation(reservationId, username);
      }
    });
  regenQueues.set(reservationId, next);
  // Clean up the map once this job (and any later chained ones) settle.
  next.finally(() => {
    if (regenQueues.get(reservationId) === next) {
      regenQueues.delete(reservationId);
    }
  });
}

// Backwards-compatible alias used in existing code paths.
export function scheduleContractRegeneration(reservationId: number, username: string | null): void {
  scheduleReservationPdfRegeneration(reservationId, username, { contract: true, damageCheck: true });
}

/**
 * Regenerates the "Contract (Unsigned)" PDF documents for a reservation by
 * deleting the existing unsigned contract(s) (file + DB row) and creating one
 * new PDF using the default template. Signed contracts and other document
 * types are NEVER touched.
 *
 * Only runs if at least one unsigned contract already exists — we never
 * auto-create a contract that wasn't there before.
 *
 * Must be invoked through `scheduleContractRegeneration` to ensure per-
 * reservation serialization. Errors are logged and swallowed.
 */
async function regenerateUnsignedContractsForReservation(
  reservationId: number,
  username: string | null,
): Promise<void> {
  try {
    const reservation = await storage.getReservation(reservationId);
    if (!reservation || !reservation.vehicle) {
      return;
    }

    const allDocs = await storage.getDocumentsByReservation(reservationId);
    const unsignedContracts = allDocs.filter((d) =>
      (d.documentType || "").startsWith("Contract (Unsigned)"),
    );

    if (unsignedContracts.length === 0) {
      // Nothing to regenerate — don't auto-create a contract that never existed.
      return;
    }

    // Pick the template: default if available, else any.
    const allTemplates = await storage.getAllPdfTemplates();
    const template =
      allTemplates.find((t) => t.isDefault) || allTemplates[0];
    if (!template) {
      console.warn(
        `[contract-regen] No PDF template available for reservation #${reservationId}; skipping.`,
      );
      return;
    }

    // Generate the new PDF FIRST so we don't delete the old one if generation fails.
    const { generateRentalContractFromTemplate } = await import(
      "../utils/pdf-generator"
    );
    const newPdf = await generateRentalContractFromTemplate(
      reservation,
      template,
    );

    // Write the new file to disk.
    const sanitizedPlate = reservation.vehicle.licensePlate.replace(
      /[^a-zA-Z0-9]/g,
      "",
    );
    const uploadsDir = getUploadsDir();
    const contractsDir = path.join(
      uploadsDir,
      "contracts",
      sanitizedPlate,
    );
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }
    const today = new Date();
    const dateString =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");
    const fileName = `${sanitizedPlate}_contract_regen_${dateString}_${Date.now()}.pdf`;
    const absolutePath = path.join(contractsDir, fileName);
    fs.writeFileSync(absolutePath, newPdf);
    const relativePath = getRelativePath(absolutePath);

    // Re-read the unsigned contracts list right before deletion in case any
    // were added/removed while the PDF was being generated. This narrows the
    // window for losing newly created (e.g. signed) docs.
    const docsToReplace = (await storage.getDocumentsByReservation(reservationId))
      .filter((d) => (d.documentType || "").startsWith("Contract (Unsigned)"));

    // Delete the old unsigned contracts (file + DB row).
    for (const doc of docsToReplace) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[contract-regen] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
      } catch (dbErr) {
        console.warn(
          `[contract-regen] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }

    // Register the new unsigned contract document.
    await storage.createDocument({
      vehicleId: reservation.vehicleId,
      reservationId: reservation.id,
      documentType: "Contract (Unsigned)",
      fileName,
      filePath: relativePath,
      fileSize: newPdf.length,
      contentType: "application/pdf",
      createdBy: username || "System",
      notes: `Auto-regenerated after reservation data changed (replaced ${docsToReplace.length} older version${docsToReplace.length === 1 ? "" : "s"}).`,
    } as any);

    console.log(
      `[contract-regen] Regenerated unsigned contract for reservation #${reservationId} (replaced ${docsToReplace.length}).`,
    );
  } catch (err) {
    console.error(
      `[contract-regen] Failed to regenerate unsigned contracts for reservation #${reservationId}:`,
      err,
    );
  }
}

/**
 * Deletes any "superseded" pickup/return damage check PDFs (rows whose
 * documentType has been marked with " - Edited", " - Previous", or " - Old")
 * for a given reservation + checkType. Removes both the DB row and the file
 * on disk. The current active document (without those markers) is preserved.
 *
 * Called whenever a brand-new pickup or return damage check PDF is generated
 * so accumulated "previous version" entries don't pile up on the server.
 */
export async function cleanupSupersededDamageCheckVersions(
  reservationId: number,
  checkType: "pickup" | "return",
): Promise<number> {
  let removed = 0;
  try {
    const prefix = `Damage Check (${checkType === "pickup" ? "Pickup" : "Return"})`;
    const docs = await storage.getDocumentsByReservation(reservationId);
    const superseded = docs.filter((d) => {
      const t = d.documentType || "";
      if (!t.startsWith(prefix)) return false;
      return (
        t.includes("Edited") ||
        t.includes("Previous") ||
        t.includes("Old")
      );
    });
    for (const doc of superseded) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved && fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[damage-check-cleanup] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
        removed++;
      } catch (dbErr) {
        console.warn(
          `[damage-check-cleanup] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }
    if (removed > 0) {
      console.log(
        `[damage-check-cleanup] Removed ${removed} superseded ${checkType} damage check version(s) for reservation #${reservationId}.`,
      );
    }
  } catch (err) {
    console.error(
      `[damage-check-cleanup] Error cleaning up superseded ${checkType} damage checks for reservation #${reservationId}:`,
      err,
    );
  }
  return removed;
}

/**
 * Regenerates the "Damage Check (Unsigned)" PDF documents for a reservation by
 * deleting existing unsigned damage check(s) (file + DB row) and creating one
 * new PDF using the matching damage check template. Signed/Pickup/Return
 * damage checks and all other document types are NEVER touched.
 *
 * Only runs if at least one unsigned damage check already exists — we never
 * auto-create one that wasn't there before.
 *
 * Must be invoked through `scheduleReservationPdfRegeneration` to ensure
 * per-reservation serialization. Errors are logged and swallowed.
 */
/**
 * Pick the best damage check template from a list returned by
 * `getDamageCheckTemplatesByVehicle`. The storage method returns templates
 * whose vehicle attributes match OR are NULL (generic), sorted by name —
 * which means an empty unfinished template can shadow the real default.
 *
 * Preference order:
 *   1. Templates with non-empty canvasFields (i.e. an actual drawn layout)
 *      that exactly match brand+model+type.
 *   2. The default template, if it has canvasFields.
 *   3. Any template with canvasFields.
 *   4. The first matching template (legacy behaviour).
 *   5. The default template as a hard fallback.
 */
export async function pickBestDamageCheckTemplate(
  matching: any[] | undefined,
  vehicle: { brand?: string | null; model?: string | null; vehicleType?: string | null },
): Promise<any | undefined> {
  const list = Array.isArray(matching) ? matching : [];
  const hasContent = (t: any) =>
    Array.isArray(t?.canvasFields) && t.canvasFields.length > 0;
  const exact = list.find(
    (t) =>
      hasContent(t) &&
      t.vehicleMake === vehicle.brand &&
      t.vehicleModel === vehicle.model &&
      (vehicle.vehicleType ? t.vehicleType === vehicle.vehicleType : true),
  );
  if (exact) return exact;
  const defaultWithContent = list.find((t) => t.isDefault && hasContent(t));
  if (defaultWithContent) return defaultWithContent;
  const anyWithContent = list.find(hasContent);
  if (anyWithContent) return anyWithContent;
  if (list.length > 0) return list[0];
  return await storage.getDefaultDamageCheckTemplate();
}

async function regenerateUnsignedDamageChecksForReservation(
  reservationId: number,
  username: string | null,
): Promise<void> {
  try {
    const reservation = await storage.getReservation(reservationId);
    if (!reservation || !reservation.vehicle) {
      return;
    }

    const allDocs = await storage.getDocumentsByReservation(reservationId);
    const unsignedDamageChecks = allDocs.filter((d) =>
      (d.documentType || "").startsWith("Damage Check (Unsigned)"),
    );

    if (unsignedDamageChecks.length === 0) {
      return; // Don't auto-create one that didn't exist.
    }

    // Find matching damage check template (by vehicle), fallback to default.
    const vehicle = reservation.vehicle;
    const matchingTemplates = await storage.getDamageCheckTemplatesByVehicle(
      vehicle.brand,
      vehicle.model,
      vehicle.vehicleType || undefined,
    );
    const damageTemplate = await pickBestDamageCheckTemplate(matchingTemplates, vehicle);

    if (!damageTemplate) {
      console.warn(
        `[damage-check-regen] No damage check template available for reservation #${reservationId}; skipping.`,
      );
      return;
    }

    // Prepare data exactly like the standalone generation endpoint.
    const vehicleData = {
      brand: vehicle.brand,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
      buildYear: vehicle.productionDate || undefined,
      fuel: (reservation as any).fuelLevelPickup || vehicle.fuel || undefined,
      mileage:
        (reservation as any).pickupMileage ??
        (vehicle as any).currentMileage ??
        undefined,
    };

    let reservationData: any = undefined;
    if (reservation.customer) {
      const startDate = new Date(reservation.startDate);
      const endDate = reservation.endDate
        ? new Date(reservation.endDate)
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const rentalDays = Math.max(
        1,
        Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      reservationData = {
        contractNumber:
          (reservation as any).contractNumber ||
          `C-${reservationId}-${format(new Date(), "yyyyMMdd")}`,
        customerName:
          `${(reservation.customer as any).firstName || ""} ${(reservation.customer as any).lastName || ""}`.trim() ||
          (reservation.customer as any).name ||
          "",
        startDate: format(startDate, "dd-MM-yyyy"),
        endDate: format(endDate, "dd-MM-yyyy"),
        rentalDays,
      };
    }

    // Pick up the latest interactive damage check for this reservation so
    // all ticked checkboxes and recorded answers carry through to the PDF.
    let latestInteractiveCheck: any = undefined;
    try {
      const checks = await storage.getInteractiveDamageChecksByReservation(reservationId);
      if (checks && checks.length > 0) {
        latestInteractiveCheck = checks[0]; // storage returns desc(checkDate), so [0] is newest
      }
    } catch (e) {
      console.warn('[damage-check-regen] Could not load interactive check:', (e as Error).message);
    }

    // Generate the new PDF FIRST so failures don't lose the old one.
    const { generateDamageCheckPDFWithTemplate } = await import(
      "../pdf-damage-check-generator"
    );
    const pdfBuffer = await generateDamageCheckPDFWithTemplate(
      vehicleData,
      damageTemplate as any,
      reservationData,
      latestInteractiveCheck,
    );

    // Write the new file to disk in the same convention as the existing endpoint.
    const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, "");
    const uploadsDir = getUploadsDir();
    const vehicleDir = path.join(uploadsDir, sanitizedPlate, "damage-checks");
    if (!fs.existsSync(vehicleDir)) {
      fs.mkdirSync(vehicleDir, { recursive: true });
    }
    const timestamp = Date.now();
    const dateString = format(new Date(), "yyyy-MM-dd");
    const fileName = `${sanitizedPlate}_DamageCheck_Unsigned_${dateString}_regen_${timestamp}.pdf`;
    const absolutePath = path.join(vehicleDir, fileName);
    fs.writeFileSync(absolutePath, pdfBuffer);
    const relativePath = `uploads/${sanitizedPlate}/damage-checks/${fileName}`;

    // Re-read to narrow the deletion window.
    const docsToReplace = (await storage.getDocumentsByReservation(reservationId))
      .filter((d) => (d.documentType || "").startsWith("Damage Check (Unsigned)"));

    for (const doc of docsToReplace) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[damage-check-regen] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
      } catch (dbErr) {
        console.warn(
          `[damage-check-regen] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }

    const savedDoc = await storage.createDocument({
      vehicleId: reservation.vehicleId,
      reservationId: reservation.id,
      documentType: "Damage Check (Unsigned)",
      fileName,
      filePath: relativePath,
      fileSize: pdfBuffer.length,
      contentType: "application/pdf",
      createdBy: username || "System",
      notes: `Auto-regenerated after reservation data changed (replaced ${docsToReplace.length} older version${docsToReplace.length === 1 ? "" : "s"}).`,
    } as any);

    try {
      realtimeEvents.documents.created(savedDoc);
    } catch {
      // realtime broadcast is best-effort
    }

    console.log(
      `[damage-check-regen] Regenerated unsigned damage check for reservation #${reservationId} (replaced ${docsToReplace.length}).`,
    );
  } catch (err) {
    console.error(
      `[damage-check-regen] Failed to regenerate unsigned damage checks for reservation #${reservationId}:`,
      err,
    );
  }
}


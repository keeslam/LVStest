import fs from "fs";
import { storage } from "../storage";
import { resolveDocumentFilePath } from "./document-paths";
import {
  DOCUMENT_TYPE_CONTRACT_UNSIGNED,
  DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED,
  markReservationDocumentsStale,
} from "./document-registry";

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

/**
 * B-05 (owner decision, 2026-09-11): "markeren als verouderd plus een knop
 * 'opnieuw genereren'".
 *
 * This used to silently regenerate: on every contract-relevant edit it deleted
 * the existing unsigned contract and damage-check PDFs — file and row — and
 * wrote new ones in the background. Three consequences the audit recorded:
 * the employee never saw that the document had changed underneath them, two
 * edits in quick succession raced each other into duplicate version labels
 * (BUG-190), and a failed regeneration left the reservation with no document
 * at all because the delete had already happened.
 *
 * The decision is the opposite: keep the old document, mark it "verouderd",
 * and let the employee generate a new version deliberately
 * (`POST /api/documents/:id/regenerate`, or the generate endpoints).
 */
export type ReservationPdfKinds = {
  contract?: boolean;
  damageCheck?: boolean;
};

export function documentTypesForKinds(kinds: ReservationPdfKinds): string[] {
  const types: string[] = [];
  if (kinds.contract !== false) types.push(DOCUMENT_TYPE_CONTRACT_UNSIGNED);
  if (kinds.damageCheck !== false) types.push(DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED);
  return types;
}

/**
 * Marks the generated PDFs of a reservation as out of date. Fire-and-forget,
 * like the regeneration it replaces: a failure to mark must never fail the
 * edit that triggered it, but it is logged loudly rather than swallowed.
 */
export function scheduleReservationPdfRegeneration(
  reservationId: number,
  username: string | null,
  kinds: ReservationPdfKinds = { contract: true, damageCheck: true },
  reason = "the reservation changed after this document was generated",
): void {
  const types = documentTypesForKinds(kinds);
  if (types.length === 0) return;
  void markReservationDocumentsStale(reservationId, types, reason)
    .then((marked) => {
      if (marked > 0) {
        console.log(
          `[documents] marked ${marked} document(s) of reservation #${reservationId} as out of date` +
            `${username ? ` after an edit by ${username}` : ""}.`,
        );
      }
    })
    .catch((err) => {
      console.error(
        `[documents] could not mark the documents of reservation #${reservationId} as out of date:`,
        err,
      );
    });
}

// Backwards-compatible alias used in existing code paths.
export function scheduleContractRegeneration(reservationId: number, username: string | null): void {
  scheduleReservationPdfRegeneration(reservationId, username, { contract: true, damageCheck: true });
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

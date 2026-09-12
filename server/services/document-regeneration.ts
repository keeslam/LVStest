/**
 * The deliberate "opnieuw genereren" action from decision B-05.
 *
 * B-05: a document that no longer matches its reservation is kept and marked
 * "verouderd"; the employee decides when a new version is produced. This is
 * that action — one endpoint, one code path, for both document kinds the app
 * generates, so the button in the dossier does exactly what the generate
 * endpoints do and files the result with the next version number.
 */
import { storage } from "../storage";
import {
  registerGeneratedDocument,
  contractGenerationRefusal,
  DOCUMENT_TYPE_CONTRACT_UNSIGNED,
  DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED,
} from "./document-registry";
import { selectContractTemplate } from "./pdf-template-selection";
import { buildDamageCheckReservationData } from "./damage-check-data";
import { pickBestDamageCheckTemplate } from "./reservation-pdf-regeneration";
import type { Document } from "../../shared/schema";

export type RegenerateResult =
  | { ok: true; document: Document }
  | { ok: false; status: number; message: string };

/** Document types this action knows how to produce again. */
export const REGENERATABLE_DOCUMENT_TYPES = [
  DOCUMENT_TYPE_CONTRACT_UNSIGNED,
  DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED,
];

export async function regenerateDocument(
  documentId: number,
  username: string | null,
): Promise<RegenerateResult> {
  const existing = await storage.getDocument(documentId);
  if (!existing) {
    return { ok: false, status: 404, message: "Document not found" };
  }
  const documentType = existing.documentType || "";
  if (!REGENERATABLE_DOCUMENT_TYPES.includes(documentType)) {
    return {
      ok: false,
      status: 400,
      message:
        `Only generated documents can be regenerated. "${documentType}" was uploaded or produced elsewhere, ` +
        `so there is nothing to reproduce it from.`,
    };
  }
  if (!existing.reservationId) {
    return {
      ok: false,
      status: 400,
      message: "This document is not linked to a reservation, so it cannot be regenerated.",
    };
  }

  const reservation = await storage.getReservation(existing.reservationId);
  if (!reservation) {
    return { ok: false, status: 404, message: "The reservation of this document no longer exists." };
  }
  if (reservation.vehicleId) {
    reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
  }
  if (reservation.customerId) {
    reservation.customer = await storage.getCustomer(reservation.customerId);
  }

  if (documentType === DOCUMENT_TYPE_CONTRACT_UNSIGNED) {
    const refusal = contractGenerationRefusal(reservation as any);
    if (refusal) return { ok: false, status: 400, message: refusal };

    const selection = await selectContractTemplate();
    if (!selection.ok) return selection;

    const { generateRentalContractFromTemplate } = await import("../utils/pdf-generator");
    const bytes = await generateRentalContractFromTemplate(reservation, selection.template);
    const document = await registerGeneratedDocument({
      documentType,
      bytes,
      vehicleId: reservation.vehicleId ?? null,
      vehiclePlate: reservation.vehicle?.licensePlate ?? null,
      reservationId: reservation.id,
      createdBy: username || "System",
      notes: `Regenerated on request; replaces version ${existing.version ?? 1}.`,
    });
    return { ok: true, document };
  }

  // Damage check.
  const vehicle = reservation.vehicle;
  if (!vehicle) {
    return { ok: false, status: 400, message: "This reservation has no vehicle, so there is no damage check to draw." };
  }
  const matching = await storage.getDamageCheckTemplatesByVehicle(
    vehicle.brand,
    vehicle.model,
    vehicle.vehicleType || undefined,
  );
  const template = await pickBestDamageCheckTemplate(matching, vehicle);
  if (!template) {
    return {
      ok: false,
      status: 409,
      message: "No damage check template found. Create a default template first.",
    };
  }

  let latestInteractiveCheck: any = undefined;
  try {
    const checks = await storage.getInteractiveDamageChecksByReservation(reservation.id);
    if (checks && checks.length > 0) latestInteractiveCheck = checks[0];
  } catch {
    /* best effort — the form still renders without the recorded answers */
  }

  const { generateDamageCheckPDFWithTemplate } = await import("../pdf-damage-check-generator");
  const bytes = await generateDamageCheckPDFWithTemplate(
    {
      brand: vehicle.brand,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
      buildYear: vehicle.productionDate ?? undefined,
      fuel: vehicle.fuel || undefined,
      mileage: vehicle.currentMileage || undefined,
    },
    template as any,
    reservation.customer
      ? buildDamageCheckReservationData(reservation as any, reservation.customer as any)
      : undefined,
    latestInteractiveCheck,
  );
  const document = await registerGeneratedDocument({
    documentType,
    bytes,
    vehicleId: reservation.vehicleId ?? null,
    vehiclePlate: vehicle.licensePlate,
    reservationId: reservation.id,
    createdBy: username || "System",
    notes: `Regenerated on request; replaces version ${existing.version ?? 1}.`,
  });
  return { ok: true, document };
}

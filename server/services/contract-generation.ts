/**
 * OPT-005 — one code path that produces the rental contract for a reservation.
 *
 * The pickup route generated the contract inline inside a `catch` that only
 * logged, and answered 200 either way: the dialog reported "Contract is
 * gegenereerd" whether or not anything had been written. The employee then had
 * no way to tell a failure from a success, and no way to try again without
 * redoing the whole pickup.
 *
 * The generation itself is unchanged (same template picker, same renderer, same
 * registry as every other contract endpoint — FIX-N/FIX-O). What is new is that
 * the result is a value: the caller can say "Contract klaar" or "Contract kon
 * niet gemaakt worden" truthfully, and `POST /api/reservations/:id/contract`
 * can run exactly this again.
 */
import { storage } from "../storage";
import {
  registerGeneratedDocument,
  contractGenerationRefusal,
  DOCUMENT_TYPE_CONTRACT_UNSIGNED,
} from "./document-registry";
import { selectContractTemplate } from "./pdf-template-selection";
import type { Document, Reservation } from "../../shared/schema";

export type ContractGenerationResult =
  | { ok: true; document: Document }
  | { ok: false; status: number; message: string };

/**
 * Produces and registers the unsigned contract for `reservation`.
 *
 * `reservation` must already carry `vehicle` (and, where the template needs it,
 * `customer`) — the pickup route has just loaded them.
 */
export async function generateContractForReservation(
  reservation: Reservation,
  options: { username?: string | null; templateId?: number; notes?: string } = {},
): Promise<ContractGenerationResult> {
  if (!reservation.vehicle) {
    return {
      ok: false,
      status: 400,
      message: "This reservation has no vehicle, so there is no contract to draw.",
    };
  }

  const refusal = contractGenerationRefusal(reservation as any);
  if (refusal) return { ok: false, status: 400, message: refusal };

  const selection = await selectContractTemplate(
    Number.isInteger(options.templateId as number) && (options.templateId as number) > 0
      ? options.templateId
      : undefined,
  );
  if (!selection.ok) return selection;

  const { generateRentalContractFromTemplate } = await import("../utils/pdf-generator");
  const bytes = await generateRentalContractFromTemplate(reservation, selection.template);
  const document = await registerGeneratedDocument({
    documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
    bytes,
    vehicleId: reservation.vehicleId ?? null,
    vehiclePlate: reservation.vehicle.licensePlate,
    reservationId: reservation.id,
    createdBy: options.username || "system",
    notes: options.notes ?? `Contract generated for reservation #${reservation.id}`,
  });
  return { ok: true, document };
}

/** The same, starting from an id — used by the "Opnieuw proberen" route. */
export async function generateContractById(
  reservationId: number,
  options: { username?: string | null; templateId?: number } = {},
): Promise<ContractGenerationResult> {
  const reservation = await storage.getReservation(reservationId);
  if (!reservation) {
    return { ok: false, status: 404, message: "Reservation not found" };
  }
  if (reservation.vehicleId) {
    reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
  }
  if (reservation.customerId) {
    reservation.customer = await storage.getCustomer(reservation.customerId);
  }
  return generateContractForReservation(reservation, {
    ...options,
    notes: `Contract generated again on request for reservation #${reservationId}`,
  });
}

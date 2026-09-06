import { finesStorage } from "./fines-storage";
import { attributeFine } from "./fine-attribution";
import { sendFineLinkedMail } from "./portal-mail";
import { normalizeLicensePlate, type FineSource } from "../../shared/fines";
import type { Fine } from "../../shared/schema";
import type { CandidateReservation } from "./fine-attribution";

const money = (n: number) => n.toFixed(2);

export interface NewFineInput {
  licensePlate: string;
  offenceAt: Date;
  receivedAt?: string | null;
  reference?: string | null;
  description: string;
  amount: number;
  /** Omitted = the default admin fee from the portal settings. */
  adminFee?: number;
  letterFilePath?: string | null;
  internalNotes?: string | null;
  customerNote?: string | null;
  source: FineSource;
  importFileId?: number | null;
}

export interface CreatedFine {
  fine: Fine;
  candidates: { covering: CandidateReservation[]; near: CandidateReservation[] };
}

/**
 * The one way a fine comes into existence: manual form, letter scan and CJIB
 * import all end up here. Creates the row, runs attribution and mails the
 * customer when it linked. The mail never fails the creation.
 */
export async function createFineWithAttribution(input: NewFineInput, actor: string): Promise<CreatedFine> {
  const plate = normalizeLicensePlate(input.licensePlate);
  const vehicle = await finesStorage.getVehicleByPlate(plate);
  // Recharging is done outside the app, so no administration fee is added here.
  const adminFee = input.adminFee ?? 0;
  const fine = await finesStorage.createFine({
    licensePlate: plate, vehicleId: vehicle?.id ?? null, offenceAt: input.offenceAt,
    receivedAt: input.receivedAt ?? null, reference: input.reference ?? null, description: input.description,
    amount: money(input.amount), adminFee: money(adminFee), totalAmount: money(input.amount + adminFee),
    letterFilePath: input.letterFilePath ?? null, internalNotes: input.internalNotes ?? null, customerNote: input.customerNote ?? null,
    source: input.source, importFileId: input.importFileId ?? null,
    createdBy: actor, updatedBy: actor,
  });
  const result = await attributeFine(fine.id);
  if (result.fine.status === "linked") {
    try { await sendFineLinkedMail(fine.id); } catch (e) { console.error("fine linked mail failed:", e); }
  }
  return result;
}

/**
 * Sub-project C, task 3 (besluiten B-30, B-39) - the reversal engine.
 *
 * Undoes a pickup, a return or a cancellation:
 *
 *   picked_up            -> booked
 *   returned / completed -> picked_up   (booked / picked_up when it was closed by hand)
 *   cancelled            -> picked_up when the rental had been picked up, else booked
 *
 * Two halves:
 *   - `planRevert` is PURE: the reservation, the vehicle and three looked-up
 *     facts go in, a `RevertPlan` comes out (spec 2026-10-09 section 2.2/2.3).
 *     `GET /api/reservations/:id/revert-preview` returns it.
 *   - `applyRevert` loads those facts again INSIDE one transaction (the
 *     reservation and the vehicle FOR UPDATE), plans again, refuses when the plan
 *     is not the one the client confirmed, and only then writes.
 *
 * How the "plan the client saw" is compared: every plan carries `planHash`
 * (sha256 over the rest of the plan). The client sends it back as `planHash` in
 * the POST body; a missing or different hash answers 409 `REVERT_PLAN_CHANGED`
 * with the new plan. A whole-plan hash was chosen over comparing fromStatus/toStatus/restoreTo
 * because it also covers what the dialog lists besides those (the odometer the
 * decrease is measured against, the documents, the warnings), and the client has
 * nothing to canonicalise. The hash is MANDATORY (ratified 2026-10-09): a missing,
 * non-string or different `planHash` answers 409 `REVERT_PLAN_CHANGED` with the
 * current plan. The client never chooses the target, so without the hash a stale
 * confirmation would silently perform another undo than the one the user saw
 * (previewed "undo the pickup", meanwhile somebody returned the rental: the
 * confirm would undo that return).
 *
 * Documents are never deleted: they are marked stale through the registry's
 * existing `isStale` / `staleReason` / `staleSince` columns (B-05).
 */
import { createHash } from "crypto";
import { and, eq, gt, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import {
  documents, reservations, vehicles,
  type Document, type Reservation, type Vehicle,
} from "../../shared/schema";
import {
  REVERT_CODES, type RevertDocumentKind, type RevertPlan, type RevertReading, type RevertTargetStatus,
  type RevertVehicleReason,
} from "../../shared/revert-codes";
import { storage } from "../storage";
import { isoToday, normalizeReservationStatus } from "./lifecycle";
import { vehicleLockSql, type BookabilityReason, type BookabilityVerdict } from "./bookability";
import { syncUsagePeriodSafely } from "./fiscal/usage-periods";
import { isContractDocument, isDamageCheckDocument } from "../../shared/document-types";

/** `documents.stale_reason` written by a reversal. */
export const REVERT_STALE_REASON = "handover reverted";

/* ------------------------------------------------------------------ *
 * What each step of the rules table does
 * ------------------------------------------------------------------ */

/** Columns that hold the pickup (and the reading from before it). */
const PICKUP_COLUMNS = [
  "actualPickupDate", "pickupMileage", "fuelLevelPickup", "contractNumber",
  "vehicleMileageBeforePickup", "vehicleFuelBeforePickup",
] as const;

/** Columns that hold the return (and the reading from before it). */
const RETURN_COLUMNS = [
  "actualReturnDate", "returnMileage", "fuelLevelReturn", "fuelCost", "fuelCardNumber", "fuelNotes",
  "completionDate", "vehicleMileageBeforeReturn", "vehicleFuelBeforeReturn",
] as const;

type ReservationColumn = (typeof PICKUP_COLUMNS)[number] | (typeof RETURN_COLUMNS)[number];
type DocumentKind = "unsigned_contract" | "return_damage_check";

interface RevertStep {
  to: RevertTargetStatus;
  /** Every column set back to null (the plan lists the ones that hold a value). */
  reset: readonly ReservationColumn[];
  /** Which handover is being undone, i.e. whose before-readings go back to the vehicle. */
  undoes: "pickup" | "return" | null;
  /** New `spareVehicleStatus`, replacement rows only. */
  spare: "assigned" | "picked_up" | null;
  documents: readonly DocumentKind[];
  /** Undoing a cancellation re-occupies the vehicle, so the period must be free. */
  needsFreeVehicle: boolean;
}

const present = (value: unknown) => value !== null && value !== undefined;

/** Pickup data on the row, in any form (a hand-closed row may carry only some). */
const hasPickupData = (r: Reservation) =>
  present(r.actualPickupDate) || present(r.pickupMileage) || present(r.fuelLevelPickup);
const hasReturnData = (r: Reservation) =>
  present(r.actualReturnDate) || present(r.returnMileage) || present(r.fuelLevelReturn);

/** The spec's rules table (2.3). `null` = nothing to undo from this status. */
function stepFor(reservation: Reservation): RevertStep | null {
  const from = normalizeReservationStatus(reservation.status);
  switch (from) {
    case "picked_up":
      return { to: "booked", reset: PICKUP_COLUMNS, undoes: "pickup", spare: "assigned", documents: ["unsigned_contract"], needsFreeVehicle: false };
    case "returned":
    case "completed":
      if (hasReturnData(reservation)) {
        return { to: "picked_up", reset: RETURN_COLUMNS, undoes: "return", spare: "picked_up", documents: ["return_damage_check"], needsFreeVehicle: false };
      }
      // Closed by hand: no return happened, so there is no return to undo. It goes
      // back to where the row actually was.
      if (hasPickupData(reservation)) {
        return { to: "picked_up", reset: ["completionDate"], undoes: null, spare: null, documents: [], needsFreeVehicle: false };
      }
      return {
        to: "booked", reset: ["completionDate", ...PICKUP_COLUMNS], undoes: null, spare: "assigned",
        documents: ["unsigned_contract"], needsFreeVehicle: false,
      };
    case "cancelled":
      return {
        to: present(reservation.actualPickupDate) ? "picked_up" : "booked",
        reset: [], undoes: null, spare: null, documents: [], needsFreeVehicle: true,
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Which documents a reversal invalidates
 * ------------------------------------------------------------------ */

const normaliseType = (documentType?: string | null) => (documentType ?? "").toLowerCase().replace(/[\s_-]+/g, "");

/** "Contract (Unsigned)" (a legacy "Contract (Unsigned) 3" included); never a signed one. */
function isUnsignedContract(documentType?: string | null): boolean {
  const t = normaliseType(documentType);
  return t.startsWith("contract") && t.includes("unsigned");
}

/**
 * The damage check written at the return: "Damage Check" (the return route's own
 * registration) and "Damage Check (Return)" (the interactive check's PDF). Not
 * the on-demand "(Unsigned)" one and not the pickup one.
 */
function isReturnDamageCheck(documentType?: string | null): boolean {
  const t = normaliseType(documentType);
  if (!t.startsWith("damagecheck") || t.includes("unsigned") || t.includes("pickup")) return false;
  return t === "damagecheck" || t.includes("return");
}

/** What the dialog calls a stale document; it never reads `documentType` itself. */
function documentKindOf(documentType?: string | null): RevertDocumentKind {
  if (isDamageCheckDocument(documentType)) return "damage_check";
  if (isContractDocument(documentType)) return "contract";
  return "other";
}

const DOCUMENT_MATCHERS: Record<DocumentKind, (documentType?: string | null) => boolean> = {
  unsigned_contract: isUnsignedContract,
  return_damage_check: isReturnDamageCheck,
};

/* ------------------------------------------------------------------ *
 * The plan hash
 * ------------------------------------------------------------------ */

/** JSON with sorted keys and no `undefined`, so equal plans hash equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** sha256 of the plan without its own `planHash`. */
export function revertPlanHash(plan: Omit<RevertPlan, "planHash"> | RevertPlan): string {
  const { planHash: _ignored, ...rest } = plan as RevertPlan;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

/* ------------------------------------------------------------------ *
 * planRevert - pure
 * ------------------------------------------------------------------ */

export interface PlanRevertInput {
  reservation: Reservation;
  vehicle: Vehicle | null;
  /** Another reservation on this vehicle handed over after the handover being undone. */
  laterHandoverExists: boolean;
  documents: Array<Pick<Document, "id" | "documentType" | "isStale">>;
  /**
   * What `isVehicleBookable` said for the period, excluding this reservation: a
   * refusal carries its reason, so the plan can say why. Only read for a cancelled row.
   */
  vehicleVerdict: Pick<BookabilityVerdict, "bookable" | "reason">;
}

/**
 * Undoing a cancellation is refused when the vehicle cannot be booked for the
 * period. The code and the sentence follow the verdict's reason: "no longer free"
 * is only true for a clashing booking, not for a vehicle taken out of rental or
 * one that is gone.
 */
const NOT_BOOKABLE_BLOCKS: Record<BookabilityReason, { code: string; message: string }> = {
  CONFLICT: {
    code: REVERT_CODES.VEHICLE_NOT_FREE,
    message: "The vehicle is no longer free for this period, so the cancellation cannot be undone.",
  },
  NOT_FOR_RENTAL: {
    code: REVERT_CODES.VEHICLE_NOT_FOR_RENTAL,
    message: 'The vehicle is marked as "not for rental", so the cancellation cannot be undone.',
  },
  VEHICLE_NOT_FOUND: {
    code: REVERT_CODES.VEHICLE_NOT_FOUND,
    message: "The vehicle of this reservation can no longer be found (it may be in the recycle bin), so the cancellation cannot be undone.",
  },
};

function withHash(plan: Omit<RevertPlan, "planHash">): RevertPlan {
  return { ...plan, planHash: revertPlanHash(plan) };
}

export function planRevert(input: PlanRevertInput): RevertPlan {
  const { reservation, vehicle, laterHandoverExists, documents: docs, vehicleVerdict } = input;
  const from = normalizeReservationStatus(reservation.status);
  const fromStatus = from ?? String(reservation.status);
  const current: RevertReading = {
    mileage: vehicle?.currentMileage ?? null,
    fuel: vehicle?.currentFuelLevel || null,
  };

  // A maintenance block has no handover to undo: its own status table (completed -> booked)
  // would leave `maintenanceStatus` on 'out', a mix no rule describes. The client never offers
  // it; this keeps a hand-made request out too.
  const step = from && reservation.type !== "maintenance_block" ? stepFor(reservation) : null;
  if (!step) {
    return withHash({
      fromStatus,
      toStatus: null,
      clears: [],
      vehicle: { current, restoreTo: null },
      documentsToMarkStale: [],
      requiresMileageConfirmation: false,
      warnings: [],
      blocked: {
        code: REVERT_CODES.INVALID_STATUS_TRANSITION,
        message: `Nothing to undo: a reservation with status '${fromStatus}' has no handover or cancellation to revert.`,
      },
    });
  }

  const row = reservation as unknown as Record<string, unknown>;
  const clears: string[] = step.reset.filter((column) => present(row[column]));
  if (reservation.type === "replacement" && step.spare && reservation.spareVehicleStatus !== step.spare) {
    clears.push("spareVehicleStatus");
  }

  // The vehicle: put back the reading from before the handover being undone, but
  // only when that handover is still the vehicle's latest mileage write.
  let restoreTo: RevertReading | null = null;
  let reason: RevertVehicleReason | undefined;
  if (step.undoes && vehicle) {
    const before: RevertReading = step.undoes === "pickup"
      ? { mileage: reservation.vehicleMileageBeforePickup ?? null, fuel: reservation.vehicleFuelBeforePickup || null }
      : { mileage: reservation.vehicleMileageBeforeReturn ?? null, fuel: reservation.vehicleFuelBeforeReturn || null };
    if (before.mileage === null && before.fuel === null) reason = "no_reading_stored";
    else if (laterHandoverExists) reason = "later_handover";
    else restoreTo = before;
  }
  const requiresMileageConfirmation =
    restoreTo !== null && restoreTo.mileage !== null && current.mileage !== null && restoreTo.mileage < current.mileage;

  const documentsToMarkStale = docs
    .filter((d) => !d.isStale && step.documents.some((kind) => DOCUMENT_MATCHERS[kind](d.documentType)))
    .map((d) => ({ id: d.id, documentType: d.documentType, kind: documentKindOf(d.documentType) }))
    .sort((a, b) => a.id - b.id);

  const warnings: string[] = [];
  if (reason) warnings.push(reason);
  if (from === "cancelled") warnings.push("cascade_not_reopened");

  // A refusal without a reason cannot happen (the predicate always names one);
  // if it ever does, "not free" is the safe reading.
  const blocked = step.needsFreeVehicle && !vehicleVerdict.bookable
    ? NOT_BOOKABLE_BLOCKS[vehicleVerdict.reason ?? "CONFLICT"]
    : undefined;

  return withHash({
    fromStatus,
    toStatus: step.to,
    clears,
    vehicle: { current, restoreTo, ...(reason ? { reason } : {}) },
    documentsToMarkStale,
    requiresMileageConfirmation,
    warnings,
    ...(blocked ? { blocked } : {}),
  });
}

/* ------------------------------------------------------------------ *
 * Looking up the facts planRevert needs
 * ------------------------------------------------------------------ */

/** A query executor: `db` or an open transaction (drizzle's two types do not unify). */
type Executor = any;

/**
 * Has another reservation on this vehicle handed over after the one being undone?
 *
 * "After" is by the recorded day. On the SAME day the physical order decides: a car
 * is returned before the next customer takes it, so for an undone RETURN a pickup
 * on that day is later, and for an undone PICKUP a return on that day is earlier.
 * Rows in the recycle bin count too: their handover wrote the odometer all the same.
 * A row without the day to compare cannot be placed, so the vehicle is left alone.
 */
async function laterHandoverExists(executor: Executor, row: Reservation, step: RevertStep): Promise<boolean> {
  if (!step.undoes || row.vehicleId == null) return false;
  const day = step.undoes === "pickup" ? row.actualPickupDate : row.actualReturnDate;
  if (!day) return true;
  const pickupIsLater = step.undoes === "return"
    ? gte(reservations.actualPickupDate, day)
    : gt(reservations.actualPickupDate, day);
  const [hit] = await executor
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(
      eq(reservations.vehicleId, row.vehicleId),
      ne(reservations.id, row.id),
      or(pickupIsLater, gt(reservations.actualReturnDate, day)),
    ))
    .limit(1);
  return Boolean(hit);
}

async function loadFacts(executor: Executor, row: Reservation, vehicle: Vehicle | null) {
  const step = stepFor(row);
  const docs = await executor
    .select({ id: documents.id, documentType: documents.documentType, isStale: documents.isStale })
    .from(documents)
    .where(eq(documents.reservationId, row.id));

  let vehicleVerdict: PlanRevertInput["vehicleVerdict"] = { bookable: true, reason: null };
  if (step?.needsFreeVehicle && row.vehicleId != null) {
    const verdict = await storage.isVehicleBookable({
      vehicleId: row.vehicleId,
      startDate: row.startDate,
      endDate: row.endDate ?? null,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
      excludeReservationId: row.id,
      isMaintenanceBlock: row.type === "maintenance_block",
    }, executor);
    vehicleVerdict = { bookable: verdict.bookable, reason: verdict.reason };
  }

  return {
    documents: docs as PlanRevertInput["documents"],
    laterHandoverExists: step ? await laterHandoverExists(executor, row, step) : false,
    vehicleVerdict,
    vehicle,
  };
}

/* ------------------------------------------------------------------ *
 * previewRevert / applyRevert
 * ------------------------------------------------------------------ */

export interface RevertFailure {
  ok: false;
  status: 400 | 403 | 404 | 409;
  /** Absent on a plain 404. */
  code?: string;
  message: string;
  /** Extra body fields of the refusal (e.g. both odometer readings). */
  details?: Record<string, unknown>;
  /** The plan as it stands now, when the refusal is about the plan. */
  plan?: RevertPlan;
}

export type RevertPreviewResult = { ok: true; plan: RevertPlan } | RevertFailure;

export type RevertApplyResult =
  | { ok: true; plan: RevertPlan; reservation: Reservation; before: Reservation; vehicleRestored: boolean }
  | RevertFailure;

const notFound = (): RevertFailure => ({ ok: false, status: 404, message: "Reservation not found" });

/** The status a blocked plan answers with. */
function blockedStatus(code: string): 400 | 409 {
  return code === REVERT_CODES.INVALID_STATUS_TRANSITION ? 400 : 409;
}

/** `GET /api/reservations/:id/revert-preview`: the plan, nothing written, nothing locked. */
export async function previewRevert(reservationId: number): Promise<RevertPreviewResult> {
  const [row] = await db.select().from(reservations)
    .where(and(eq(reservations.id, reservationId), isNull(reservations.deletedAt)));
  if (!row) return notFound();
  const [vehicle] = row.vehicleId != null
    ? await db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId))
    : [];
  const facts = await loadFacts(db, row, vehicle ?? null);
  return { ok: true, plan: planRevert({ reservation: row, ...facts }) };
}

export interface RevertActor {
  username: string;
  userId?: number | null;
}

export interface RevertOptions {
  /** Explicit confirmation that the odometer may go down. A boolean, not a password flow. */
  confirmMileageDecrease: boolean;
  /**
   * `planHash` of the preview the client showed. Mandatory: `undefined` (the
   * client sent none, or not a string) is refused like a different hash.
   */
  expectedPlanHash: string | undefined;
}

/**
 * `POST /api/reservations/:id/revert`. One transaction: reservation and vehicle
 * FOR UPDATE, plan again, refuse when it differs from what the client confirmed,
 * then write. Nothing is written before every refusal has been decided.
 *
 * Lock order: the booking advisory lock of the vehicle (the order every booking
 * write uses), then the reservation row, then the vehicle row (the order the
 * return uses).
 */
export async function applyRevert(
  reservationId: number,
  actor: RevertActor,
  options: RevertOptions,
): Promise<RevertApplyResult> {
  type Committed = { ok: true; plan: RevertPlan; before: Reservation; vehicleRestored: boolean };
  const result = await db.transaction(async (tx): Promise<Committed | RevertFailure> => {
    const [peek] = await tx.select({ vehicleId: reservations.vehicleId }).from(reservations)
      .where(and(eq(reservations.id, reservationId), isNull(reservations.deletedAt)));
    if (!peek) return notFound();
    if (peek.vehicleId != null) await tx.execute(vehicleLockSql(peek.vehicleId));

    const [row] = await tx.select().from(reservations)
      .where(and(eq(reservations.id, reservationId), isNull(reservations.deletedAt)))
      .for("update");
    if (!row) return notFound();

    const [vehicle] = row.vehicleId != null
      ? await tx.select().from(vehicles).where(eq(vehicles.id, row.vehicleId)).for("update")
      : [];
    const facts = await loadFacts(tx, row, vehicle ?? null);
    const plan = planRevert({ reservation: row, ...facts });

    // The client must confirm the plan it was shown: a missing hash counts as a
    // different one. (Also: the vehicle was swapped between the peek and the lock,
    // so the advisory lock we hold is for the wrong car and the client has not
    // seen this plan.)
    const planChanged = options.expectedPlanHash !== plan.planHash || row.vehicleId !== peek.vehicleId;
    if (planChanged) {
      return {
        ok: false, status: 409, code: REVERT_CODES.REVERT_PLAN_CHANGED, plan,
        message: options.expectedPlanHash === undefined
          ? "The confirmation must carry the planHash of the preview it confirms. Review the plan and confirm again."
          : "The reservation changed since the preview was made. Review the new plan and confirm again.",
      };
    }
    if (plan.blocked) {
      return {
        ok: false, status: blockedStatus(plan.blocked.code), code: plan.blocked.code, plan,
        message: plan.blocked.message,
      };
    }
    if (plan.requiresMileageConfirmation && !options.confirmMileageDecrease) {
      return {
        ok: false, status: 409, code: REVERT_CODES.MILEAGE_DECREASE_CONFIRMATION_REQUIRED, plan,
        message: "The vehicle's odometer would go down. Confirm the decrease and try again.",
        details: {
          currentMileage: plan.vehicle.current.mileage,
          restoreToMileage: plan.vehicle.restoreTo?.mileage ?? null,
        },
      };
    }

    const step = stepFor(row)!; // a plan without `blocked` always has a step
    const note = `[TERUGGEDRAAID ${isoToday()} ${actor.username}] ${plan.fromStatus} → ${plan.toStatus}`;
    const cleared = Object.fromEntries(step.reset.map((column) => [column, null]));
    await tx.update(reservations).set({
      ...cleared,
      status: plan.toStatus!,
      ...(row.type === "replacement" && step.spare ? { spareVehicleStatus: step.spare } : {}),
      notes: row.notes ? `${row.notes}\n${note}` : note,
      updatedBy: actor.username,
      updatedAt: new Date(),
    }).where(eq(reservations.id, row.id));

    let vehicleRestored = false;
    const restoreTo = plan.vehicle.restoreTo;
    if (restoreTo && vehicle) {
      const patch: Record<string, unknown> = {};
      if (restoreTo.mileage !== null) patch.currentMileage = restoreTo.mileage;
      if (restoreTo.fuel !== null) patch.currentFuelLevel = restoreTo.fuel;
      if (Object.keys(patch).length > 0) {
        await tx.update(vehicles).set({ ...patch, updatedAt: new Date() }).where(eq(vehicles.id, vehicle.id));
        vehicleRestored = true;
      }
    }

    if (plan.documentsToMarkStale.length > 0) {
      await tx.update(documents)
        .set({ isStale: true, staleReason: REVERT_STALE_REASON, staleSince: new Date() })
        .where(inArray(documents.id, plan.documentsToMarkStale.map((d) => d.id)));
    }

    // Same transaction as the status change, as the pickup and the return do it:
    // the vehicle's availability can never disagree with the row that was written.
    await storage.recomputeVehicleAvailability(row.vehicleId, { executor: tx });

    return { ok: true, plan, before: row, vehicleRestored };
  });

  if (!result.ok) return result;

  await syncUsagePeriodSafely(reservationId);
  const reservation = await storage.getReservation(reservationId);
  return { ...result, reservation: reservation as Reservation };
}

/**
 * Sub-project D, D4 (besluiten B-41/B-42) - when may "Plannen afbreken" remove a
 * maintenance block for good?
 *
 * The spare-vehicle dialog opens after the block was already saved. Cancelling
 * it undoes the whole planning, but only a block that has not lived yet: still
 * planned, nothing hanging on it, made a moment ago by the person who now
 * regrets it. Anything else goes through the normal delete (recycle bin).
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { normalizeReservationStatus } from "./lifecycle";

/** A block younger than this, made by the same user, may be aborted. */
export const ABORT_PLANNING_WINDOW_MS = 60 * 60 * 1000;

export type AbortPlanningRefusalReason =
  | "NOT_A_MAINTENANCE_BLOCK"
  | "NOT_PLANNED"
  | "HAS_REPLACEMENTS"
  | "TOO_OLD"
  | "OTHER_USER";

export interface AbortableBlockRow {
  id: number;
  type?: string | null;
  status?: string | null;
  maintenanceStatus?: string | null;
  createdAt?: Date | string | null;
  createdBy?: string | null;
  deletedAt?: Date | string | null;
  vehicleId?: number | null;
  startDate: string;
  endDate?: string | null;
}

export interface ReplacementRow {
  id: number;
  type?: string | null;
  deletedAt?: Date | string | null;
  maintenanceBlockId?: number | null;
  replacementForReservationId?: number | null;
  createdAt?: Date | string | null;
  startDate: string;
  endDate?: string | null;
}

/**
 * Replacements and placeholders that belong to the block: the ones stamped with
 * its id, and (legacy / the dialog's "later" placeholders carry no link) the ones
 * made for a customer rental the block overlaps, after the block was made.
 */
export function replacementsHangingOn(
  block: AbortableBlockRow,
  candidates: readonly ReplacementRow[],
  rentalIdsOnTheVehicle: ReadonlySet<number>,
): ReplacementRow[] {
  const blockCreated = toMillis(block.createdAt);
  const blockEnd = block.endDate && block.endDate !== "undefined" ? block.endDate : "9999-12-31";
  return candidates.filter((r) => {
    if (r.type !== "replacement" || r.deletedAt) return false;
    if (r.maintenanceBlockId != null) return r.maintenanceBlockId === block.id;
    if (r.replacementForReservationId == null || !rentalIdsOnTheVehicle.has(r.replacementForReservationId)) return false;
    if (blockCreated != null && (toMillis(r.createdAt) ?? 0) < blockCreated) return false;
    return r.startDate <= blockEnd && (r.endDate || "9999-12-31") >= block.startDate;
  });
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** The reason the block may not be aborted, or `null` when it may. */
export function abortPlanningRefusal(
  block: AbortableBlockRow,
  context: { username: string | null; replacements: readonly ReplacementRow[]; now?: Date },
): AbortPlanningRefusalReason | null {
  if (block.type !== "maintenance_block" || block.deletedAt) return "NOT_A_MAINTENANCE_BLOCK";

  const maintenance = block.maintenanceStatus == null ? "scheduled" : String(block.maintenanceStatus).trim().toLowerCase();
  if (normalizeReservationStatus(block.status) !== "booked" || maintenance !== "scheduled") return "NOT_PLANNED";

  if (context.replacements.length > 0) return "HAS_REPLACEMENTS";

  const created = toMillis(block.createdAt);
  const now = (context.now ?? new Date()).getTime();
  if (created == null || now - created >= ABORT_PLANNING_WINDOW_MS) return "TOO_OLD";

  if (!context.username || block.createdBy !== context.username) return "OTHER_USER";
  return null;
}

/** Loads the replacements and placeholders that hang on this block (see `replacementsHangingOn`). */
export async function loadReplacementsHangingOn(block: AbortableBlockRow): Promise<ReplacementRow[]> {
  const rentals = block.vehicleId == null
    ? []
    : await db.select({ id: reservations.id }).from(reservations).where(and(
        eq(reservations.vehicleId, block.vehicleId),
        eq(reservations.type, "standard"),
        isNull(reservations.deletedAt),
      ));
  const rentalIds = new Set(rentals.map((r) => r.id));
  const rows = await db.select().from(reservations).where(and(
    eq(reservations.type, "replacement"),
    isNull(reservations.deletedAt),
    or(
      eq(reservations.maintenanceBlockId, block.id),
      rentalIds.size > 0 ? inArray(reservations.replacementForReservationId, Array.from(rentalIds)) : undefined,
    ),
  ));
  return replacementsHangingOn(block, rows, rentalIds);
}

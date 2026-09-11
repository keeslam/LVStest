/**
 * FIX-F — the one bookability predicate (CQ-006, remediation plan §3).
 *
 * Before this module the question "is this vehicle free in this period" had
 * five different answers in five places, and the conflict check always ran on
 * its own connection *before* the write, so two requests could both read "free"
 * and both write (BUG-006, BUG-159, BUG-160, BUG-173).
 *
 * What lives here:
 *   - `overlapWhere()` — the single overlap + status SQL, with the turnover
 *     exception narrowed to what it was always documented to mean (BUG-107);
 *   - the verdict shape every caller reads;
 *   - `BookingConflictError`, so a refused write is a clean 409 instead of a
 *     raw 500 or a 400 carrying a database sentence.
 *
 * Definition of "available", per besluiten.md **B-01**: free in the requested
 * period AND status ok — no overlapping reservation, not `not_for_rental`, not
 * in the recycle bin. One definition for the dashboard, the booking form and
 * the availability check.
 *
 * Deliberately NOT enforced here: an overlapping *maintenance block* does not
 * make a rental illegal. B-01 names it, but BUG-013/BUG-037 (hard block or soft
 * warning, may two blocks overlap) are the still-open OPT-023 decision, so the
 * predicate *reports* the overlapping blocks in `maintenanceBlocks` and leaves
 * the policy to the caller. Today no writer blocks on it, which is the
 * behaviour the app already had.
 */
import { and, eq, ne, isNull, sql, type SQL } from "drizzle-orm";
import { reservations, type Reservation, type Vehicle } from "../../shared/schema";

/**
 * First key of `pg_advisory_xact_lock(int4, int4)`; the second is the vehicle
 * id. Transaction-scoped, so it is released by COMMIT/ROLLBACK and can never
 * be leaked by a crashing request. Rule for every caller (plan §3 FIX-F risk):
 * **take the locks in ascending vehicle id order** and keep the transaction to
 * a single logical operation.
 */
export const BOOKING_LOCK_CLASS = 51729;

export type BookabilityReason = "CONFLICT" | "NOT_FOR_RENTAL" | "VEHICLE_NOT_FOUND";

export interface BookingRequest {
  vehicleId: number;
  startDate: string;
  endDate: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** The reservation being edited never conflicts with itself. */
  excludeReservationId?: number | null;
  /**
   * A maintenance block is judged against other maintenance blocks, a rental
   * against other rentals — the rule the app has always had (a rental runs on
   * during maintenance, with a spare).
   */
  isMaintenanceBlock?: boolean;
}

export interface BookabilityVerdict {
  bookable: boolean;
  reason: BookabilityReason | null;
  message: string | null;
  /** The rows that make it unbookable (empty for a status refusal). */
  conflicts: Reservation[];
  /** Overlapping maintenance blocks — informational, see the header. */
  maintenanceBlocks: Reservation[];
  vehicle: Vehicle | null;
}

export const CONFLICT_MESSAGE = "Reservation conflicts with existing bookings";

export function messageFor(reason: BookabilityReason): string {
  switch (reason) {
    case "CONFLICT":
      return CONFLICT_MESSAGE;
    case "NOT_FOR_RENTAL":
      return 'This vehicle is marked as "not for rental" and cannot be booked.';
    case "VEHICLE_NOT_FOUND":
      return "Vehicle not found";
  }
}

export function bookableVerdict(vehicle: Vehicle | null, maintenanceBlocks: Reservation[] = []): BookabilityVerdict {
  return { bookable: true, reason: null, message: null, conflicts: [], maintenanceBlocks, vehicle };
}

export function refusedVerdict(
  reason: BookabilityReason,
  vehicle: Vehicle | null,
  conflicts: Reservation[] = [],
  maintenanceBlocks: Reservation[] = [],
): BookabilityVerdict {
  return { bookable: false, reason, message: messageFor(reason), conflicts, maintenanceBlocks, vehicle };
}

/**
 * A write refused by the predicate. `status` is 409 for everything the caller
 * can resolve by picking another vehicle or period, and 404 when the vehicle
 * disappeared underneath the request (deleted between the form and the save).
 */
export class BookingConflictError extends Error {
  readonly verdict: BookabilityVerdict;
  readonly status: number;
  readonly code: BookabilityReason;

  constructor(verdict: BookabilityVerdict, message?: string) {
    super(message ?? verdict.message ?? CONFLICT_MESSAGE);
    this.name = "BookingConflictError";
    this.verdict = verdict;
    this.code = verdict.reason ?? "CONFLICT";
    this.status = verdict.reason === "VEHICLE_NOT_FOUND" ? 404 : 409;
  }

  /** The response body. `conflicts` is the shape the client already reads. */
  toBody(): Record<string, unknown> {
    return { message: this.message, code: this.code, conflicts: this.verdict.conflicts };
  }
}

/**
 * Every live row on this vehicle that overlaps the requested period.
 *
 * The turnover exception — a rental that ends on the day another begins is a
 * normal handover, not a double booking — is kept, but it may now only fire
 * when the two ranges **start on different days** (BUG-107). Without that
 * guard a one-day request sitting on either edge of an existing multi-day
 * rental matched one of the two equalities and was waved through, and two
 * identical one-day ranges matched both: a deterministic double booking from
 * the ordinary booking form, and from every transport with a spare.
 *
 * The result is deliberately NOT filtered by `type` here: the caller
 * partitions it, so one query answers both "does this conflict" and "is there
 * maintenance in the way".
 */
export function overlapWhere(request: BookingRequest): SQL {
  const effectiveEndDate = request.endDate || "9999-12-31";
  const newStartTime = request.startTime ?? null;
  const newEndTime = request.endTime ?? null;

  const conditions: SQL[] = [
    eq(reservations.vehicleId, request.vehicleId),
    sql`${reservations.status} != 'cancelled'`,
    sql`${reservations.status} != 'completed'`,
    sql`${reservations.status} != 'returned'`,
    isNull(reservations.deletedAt),
    sql`(
      (
        (${reservations.startDate} <= ${effectiveEndDate} AND ${reservations.endDate} >= ${request.startDate})
        OR (${reservations.startDate} <= ${effectiveEndDate} AND (${reservations.endDate} IS NULL OR ${reservations.endDate} = 'undefined'))
      )
      AND NOT (
        -- BUG-107: never a turnover when both ranges start on the same day.
        ${reservations.startDate} <> ${request.startDate}
        AND (
          (
            ${reservations.endDate} IS NOT NULL AND ${reservations.endDate} = ${request.startDate}
            AND (
              ${reservations.endTime} IS NULL OR ${newStartTime}::text IS NULL
              OR ${reservations.endTime} <= ${newStartTime}
            )
          )
          OR (
            ${effectiveEndDate} = ${reservations.startDate}
            AND (
              ${newEndTime}::text IS NULL OR ${reservations.startTime} IS NULL
              OR ${newEndTime} <= ${reservations.startTime}
            )
          )
        )
      )
    )`,
  ];

  if (request.excludeReservationId != null) {
    conditions.push(ne(reservations.id, request.excludeReservationId));
  }

  return and(...conditions)!;
}

/** Splits an overlap result into the two lists the verdict carries. */
export function partitionOverlaps(rows: Reservation[], isMaintenanceBlock: boolean): {
  conflicts: Reservation[];
  maintenanceBlocks: Reservation[];
} {
  const blocks = rows.filter((r) => r.type === "maintenance_block");
  return {
    conflicts: isMaintenanceBlock ? blocks : rows.filter((r) => r.type !== "maintenance_block"),
    maintenanceBlocks: blocks,
  };
}

/**
 * The advisory-lock statement for one vehicle. Callers must sort the ids
 * ascending before taking more than one (deadlock rule, plan §9.1).
 */
export function vehicleLockSql(vehicleId: number): SQL {
  return sql`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_CLASS}, ${vehicleId})`;
}

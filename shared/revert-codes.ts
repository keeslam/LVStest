/**
 * Sub-project C (besluiten B-30, B-39) - the stable codes and the plan shape of
 * the reversal engine (`server/services/reservation-revert.ts`).
 *
 * The client branches on these codes, never on the English `message`; the
 * `RevertPlan` below is what `GET /api/reservations/:id/revert-preview` answers
 * and what `POST /api/reservations/:id/revert` echoes back.
 *
 * Nothing in this file may import from `server/` (the client bundle imports it).
 */

/** `code` of a refused revert / refused `PATCH /:id/status` reversion. */
export const REVERT_CODES = {
  /** Odometer would go down; resend with `confirmMileageDecrease: true`. 409. */
  MILEAGE_DECREASE_CONFIRMATION_REQUIRED: "MILEAGE_DECREASE_CONFIRMATION_REQUIRED",
  /** Undoing a cancellation, but another booking has taken the vehicle for the period. 409. */
  VEHICLE_NOT_FREE: "VEHICLE_NOT_FREE",
  /** Undoing a cancellation, but the vehicle has since been marked "not for rental". 409. */
  VEHICLE_NOT_FOR_RENTAL: "VEHICLE_NOT_FOR_RENTAL",
  /** Undoing a cancellation, but the reservation's vehicle no longer exists (recycle bin). 409, not a 404. */
  VEHICLE_NOT_FOUND: "VEHICLE_NOT_FOUND",
  /**
   * The plan the client confirmed is not the plan the server computes now, or the
   * POST carried no `planHash` at all (it is mandatory). 409, with the current plan.
   */
  REVERT_PLAN_CHANGED: "REVERT_PLAN_CHANGED",
  /** `PATCH /api/reservations/:id/status` was asked for a reversion. 400. */
  USE_REVERT_ROUTE: "USE_REVERT_ROUTE",
  /** The row is in a status that has nothing to undo (e.g. `booked`). 400. */
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
} as const;
export type RevertCode = (typeof REVERT_CODES)[keyof typeof REVERT_CODES];

/** Why the vehicle's odometer and fuel level are NOT put back (`plan.vehicle.reason`). */
export const REVERT_VEHICLE_REASONS = ["no_reading_stored", "later_handover"] as const;
export type RevertVehicleReason = (typeof REVERT_VEHICLE_REASONS)[number];

/** Entries of `plan.warnings`: the two vehicle reasons plus the cascade note. */
export const REVERT_WARNING_CODES = ["cascade_not_reopened", "no_reading_stored", "later_handover"] as const;
export type RevertWarningCode = (typeof REVERT_WARNING_CODES)[number];

/** The status a reversal can end in. */
export type RevertTargetStatus = "booked" | "picked_up";

/** The vehicle's odometer and fuel gauge. `null` = no reading / not touched. */
export interface RevertReading {
  mileage: number | null;
  fuel: string | null;
}

export interface RevertPlan {
  /** The row's status, normalised (legacy aliases mapped). */
  fromStatus: string;
  /** `null` only when `blocked.code` is `INVALID_STATUS_TRANSITION` (nothing to undo). */
  toStatus: RevertTargetStatus | null;
  /**
   * Reservation columns (camelCase) that will be emptied, limited to the ones
   * that hold a value now. `spareVehicleStatus` appears for a replacement row
   * whose spare status is set back (to `assigned` / `picked_up`).
   */
  clears: string[];
  vehicle: {
    /** What the vehicle shows now. */
    current: RevertReading;
    /**
     * What the vehicle goes back to. A `null` member is left as it is; the whole
     * value is `null` when nothing is restored (then `reason` says why, unless
     * this reversal has no handover to undo).
     */
    restoreTo: RevertReading | null;
    reason?: RevertVehicleReason;
  };
  documentsToMarkStale: { id: number; documentType: string }[];
  /** `restoreTo.mileage` is lower than `current.mileage`. */
  requiresMileageConfirmation: boolean;
  /** Stable codes, see `REVERT_WARNING_CODES`. */
  warnings: string[];
  blocked?: { code: string; message: string };
  /**
   * sha256 of the rest of the plan. The client MUST send it back as `planHash` in
   * the POST body; a missing or different hash answers 409 `REVERT_PLAN_CHANGED`
   * (with the current plan, so the client can show it and ask again).
   */
  planHash: string;
}

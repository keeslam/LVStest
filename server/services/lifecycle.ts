/**
 * FIX-H — one owner for the reservation and vehicle state machines
 * (remediation plan §3 FIX-H, CQ-005/CQ-011).
 *
 * Before this module:
 *   - `VALID_RESERVATION_TRANSITIONS` existed but was enforced by **1 of 5**
 *     writers, so `PATCH /:id` and `/basic` persisted `status:"garbage"`
 *     (BUG-016) and jumped `booked → completed` in one step;
 *   - `availability_status` had **three unrelated writers** — the read-path
 *     sync (BUG-217), `markVehicleForService`, and pickup/return — so a
 *     deliberate `not_for_rental`/`needs_fixing` disappeared after a workshop
 *     visit or a rental cycle (BUG-109), and a completed rental left the car
 *     on `rented` forever (BUG-130);
 *   - six of the twelve exports of `vehicle-status-helper.ts` were dead,
 *     including `getStatusOnReturn`, which was imported and never called.
 *
 * Everything about "what may a status become" now lives here. Storage and the
 * routes call into it; nothing re-implements it.
 *
 * Business rules implemented (docs/audit/besluiten.md):
 *   - **B-02** — taking a vehicle back closes the rental: a return writes
 *     `completed`, not `returned`, so the car is immediately bookable again.
 *     `returned` stays a *recognised legacy value* for the rows already in the
 *     database and is treated as closed everywhere.
 *   - **B-03** — a vehicle in the workshop (`needs_fixing`, or
 *     `maintenance_status` `needs_service`/`in_service`) is refused at
 *     handover; an administrator may force it with a reason; the workshop flag
 *     survives a return and a completed transport.
 *
 * Deliberately NOT decided here: whether a rental may run over an active
 * maintenance block, and whether two blocks may overlap (BUG-013/BUG-037 —
 * still OPT-023, an open owner decision). The derivation below *reports* an
 * active block as `needs_fixing`, which is what the app already did; it does
 * not refuse anything new because of one.
 */

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** A refused status write. 400 — the caller sent a value or a jump we reject. */
export class StateTransitionError extends Error {
  readonly status = 400;
  readonly code: string;
  readonly field: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, opts: { code: string; field: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = "StateTransitionError";
    this.code = opts.code;
    this.field = opts.field;
    this.details = opts.details;
  }

  toBody(): Record<string, unknown> {
    return { message: this.message, code: this.code, field: this.field, ...(this.details ? { details: this.details } : {}) };
  }
}

/**
 * besluiten.md **B-03** — the handover is refused while the vehicle is in the
 * workshop. 409, because the caller can resolve it (close the workshop job, or
 * force it as an administrator with a reason).
 */
export class WorkshopBlockedError extends Error {
  readonly status = 409;
  readonly code = "VEHICLE_IN_WORKSHOP";
  readonly reasonCode: string;

  constructor(message: string, reasonCode: string) {
    super(message);
    this.name = "WorkshopBlockedError";
    this.reasonCode = reasonCode;
  }

  toBody(): Record<string, unknown> {
    return {
      message: this.message,
      code: this.code,
      reason: this.reasonCode,
      // What the dialog needs to offer the administrator override.
      overridable: true,
      overrideFields: ["forceWorkshopOverride", "forceWorkshopReason"],
    };
  }
}

/* ------------------------------------------------------------------ *
 * Reservation status
 * ------------------------------------------------------------------ */

export const RESERVATION_STATUSES = ["booked", "picked_up", "returned", "completed", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that mean "this row no longer occupies the vehicle". */
export const CLOSED_RESERVATION_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled", "returned"]);

/**
 * BUG-129 — 278 live rows carry a status the state machine never knew, written
 * by `createMaintenanceBlock` (`active`), `createReplacementReservation`
 * (`pending`) and a pre-enum era (`confirmed`, `scheduled`, `in`). Those rows
 * could not be closed or cancelled through any UI action, so they kept their
 * vehicles on `rented` forever.
 *
 * The writers are fixed (they write `booked` now); this map is what lets the
 * *existing* rows move again. It is a read-side alias, not a new enum value:
 * nothing writes these strings any more.
 */
export const LEGACY_RESERVATION_STATUS_ALIASES: Readonly<Record<string, ReservationStatus>> = Object.freeze({
  active: "picked_up",
  confirmed: "booked",
  pending: "booked",
  scheduled: "booked",
  in: "picked_up",
  out: "completed",
});

/** The canonical status for a stored value, or `null` if it is not one we know. */
export function normalizeReservationStatus(raw: unknown): ReservationStatus | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if ((RESERVATION_STATUSES as readonly string[]).includes(value)) return value as ReservationStatus;
  return LEGACY_RESERVATION_STATUS_ALIASES[value] ?? null;
}

/**
 * The enum gate every writer passes. BUG-016: `PATCH /:id` and `/basic` wrote
 * `status` straight through, so `"garbage"` reached the column and `GET`
 * served it back.
 */
export function assertReservationStatusValue(raw: unknown): ReservationStatus {
  const status = normalizeReservationStatus(raw);
  if (!status) {
    throw new StateTransitionError("Invalid status value", {
      code: "INVALID_STATUS_VALUE",
      field: "status",
      details: { received: typeof raw === "string" ? raw : null, allowed: [...RESERVATION_STATUSES] },
    });
  }
  return status;
}

/**
 * The transition table. `returned` is legacy (B-02 makes a return write
 * `completed` directly) and may still be closed off or reopened, so the rows
 * that already carry it are not stuck.
 */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = Object.freeze({
  booked: ["picked_up", "cancelled"],
  picked_up: ["completed", "returned", "cancelled"],
  returned: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
});

/**
 * The reversions `PATCH /:id/status` has always allowed so staff can undo a
 * mis-click. They are deliberately kept — removing them would strand a wrongly
 * picked-up rental — but they are now *named* in one place instead of being an
 * inline `||` chain in the route, and every writer honours the same list.
 */
export const RESERVATION_REVERSIONS: Readonly<Record<string, readonly ReservationStatus[]>> = Object.freeze({
  picked_up: ["booked"],
  returned: ["picked_up"],
  completed: ["picked_up", "booked"],
});

export interface TransitionOptions {
  /** Allow the documented undo steps (the status endpoint's old behaviour). */
  allowReversion?: boolean;
}

export function isReservationTransitionAllowed(
  from: unknown,
  to: ReservationStatus,
  opts: TransitionOptions = {},
): boolean {
  const current = normalizeReservationStatus(from);
  if (!current) return to === "booked"; // a brand-new row starts as booked
  if (current === to) return true; // idempotent
  if ((RESERVATION_TRANSITIONS[current] ?? []).includes(to)) return true;
  if (opts.allowReversion && (RESERVATION_REVERSIONS[current] ?? []).includes(to)) return true;
  return false;
}

/** Throws `StateTransitionError` (400) for an illegal jump. */
export function assertReservationTransition(
  from: unknown,
  to: unknown,
  opts: TransitionOptions = {},
): ReservationStatus {
  const target = assertReservationStatusValue(to);
  if (!isReservationTransitionAllowed(from, target, opts)) {
    const current = typeof from === "string" ? from : String(from);
    throw new StateTransitionError(`Invalid status transition from '${current}' to '${target}'`, {
      code: "INVALID_STATUS_TRANSITION",
      field: "status",
      details: {
        currentStatus: current,
        requestedStatus: target,
        hint: "Check valid transitions: booked → picked_up → completed",
      },
    });
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Maintenance status — on the block and on the vehicle
 * ------------------------------------------------------------------ */

/** `reservations.maintenance_status` for a `maintenance_block` row. */
export const BLOCK_MAINTENANCE_STATUSES = ["scheduled", "in", "out"] as const;
export type BlockMaintenanceStatus = (typeof BLOCK_MAINTENANCE_STATUSES)[number];

/** `vehicles.maintenance_status`. */
export const VEHICLE_MAINTENANCE_STATUSES = ["ok", "needs_service", "in_service"] as const;
export type VehicleMaintenanceStatus = (typeof VEHICLE_MAINTENANCE_STATUSES)[number];

/** The vehicle-side workshop values the block-side ones map onto (BUG-154). */
export const BLOCK_TO_VEHICLE_MAINTENANCE: Readonly<Record<VehicleMaintenanceStatus, BlockMaintenanceStatus>> =
  Object.freeze({ ok: "out", needs_service: "scheduled", in_service: "in" });

export function assertBlockMaintenanceStatus(raw: unknown): BlockMaintenanceStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  // 'in_service' has been written onto blocks by older code paths; accept it as 'in'.
  const normalised = value === "in_service" ? "in" : value;
  if (!(BLOCK_MAINTENANCE_STATUSES as readonly string[]).includes(normalised)) {
    throw new StateTransitionError("Invalid maintenance status", {
      code: "INVALID_MAINTENANCE_STATUS",
      field: "maintenanceStatus",
      details: { received: typeof raw === "string" ? raw : null, allowed: [...BLOCK_MAINTENANCE_STATUSES] },
    });
  }
  return normalised as BlockMaintenanceStatus;
}

export function assertVehicleMaintenanceStatus(raw: unknown): VehicleMaintenanceStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!(VEHICLE_MAINTENANCE_STATUSES as readonly string[]).includes(value)) {
    throw new StateTransitionError("Invalid status. Must be 'ok', 'needs_service', or 'in_service'", {
      code: "INVALID_MAINTENANCE_STATUS",
      field: "status",
      details: { received: typeof raw === "string" ? raw : null, allowed: [...VEHICLE_MAINTENANCE_STATUSES] },
    });
  }
  return value as VehicleMaintenanceStatus;
}

/** A block is "open" while it is scheduled or the car is in. */
export function isOpenBlockMaintenanceStatus(raw: unknown): boolean {
  if (raw == null) return true; // an older block without the field counts as scheduled
  const value = String(raw).trim().toLowerCase();
  return value === "scheduled" || value === "in" || value === "in_service";
}

/* ------------------------------------------------------------------ *
 * Transport status  (used by FIX-W; the table lives here so there is
 * exactly one place that knows what a status may become)
 * ------------------------------------------------------------------ */

export const TRANSPORT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export const TRANSPORT_TRANSITIONS: Readonly<Record<TransportStatus, readonly TransportStatus[]>> = Object.freeze({
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
});

export function assertTransportStatusValue(raw: unknown): TransportStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!(TRANSPORT_STATUSES as readonly string[]).includes(value)) {
    throw new StateTransitionError("Invalid transport status", {
      code: "INVALID_TRANSPORT_STATUS",
      field: "status",
      details: { received: typeof raw === "string" ? raw : null, allowed: [...TRANSPORT_STATUSES] },
    });
  }
  return value as TransportStatus;
}

export function assertTransportTransition(from: unknown, to: unknown): TransportStatus {
  const target = assertTransportStatusValue(to);
  const currentRaw = typeof from === "string" ? from.trim().toLowerCase() : "";
  // An unknown stored value (BUG-136 wrote free text) may always be corrected.
  const current = (TRANSPORT_STATUSES as readonly string[]).includes(currentRaw)
    ? (currentRaw as TransportStatus)
    : null;
  if (current === null || current === target) return target;
  if (!TRANSPORT_TRANSITIONS[current].includes(target)) {
    throw new StateTransitionError(`Invalid transport status transition from '${current}' to '${target}'`, {
      code: "INVALID_TRANSPORT_TRANSITION",
      field: "status",
      details: { currentStatus: current, requestedStatus: target },
    });
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Vehicle availability — one derived value, one writer
 * ------------------------------------------------------------------ */

export const VEHICLE_AVAILABILITY_STATUSES = [
  "available",
  "rented",
  "scheduled",
  "needs_fixing",
  "not_for_rental",
] as const;
export type VehicleAvailability = (typeof VEHICLE_AVAILABILITY_STATUSES)[number];

/**
 * BUG-021 — `validateManualStatusChange` had no allowlist on `newStatus`, so
 * `"banana_not_real"` fell through its from/to branches to `{allowed:true}`
 * and was persisted; the vehicle then vanished from every status-driven
 * screen.
 */
export function assertVehicleAvailabilityStatus(raw: unknown): VehicleAvailability {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!(VEHICLE_AVAILABILITY_STATUSES as readonly string[]).includes(value)) {
    throw new StateTransitionError("Invalid availability status", {
      code: "INVALID_AVAILABILITY_STATUS",
      field: "availabilityStatus",
      details: { received: typeof raw === "string" ? raw : null, allowed: [...VEHICLE_AVAILABILITY_STATUSES] },
    });
  }
  return value as VehicleAvailability;
}

/** The bare minimum of a reservation row the derivation reads. */
export interface AvailabilityReservation {
  status: string | null;
  type: string | null;
  startDate: string;
  endDate: string | null;
  deletedAt?: Date | null;
  maintenanceStatus?: string | null;
}

export interface AvailabilityInput {
  /** `vehicles.availability_status` as stored — carries the manual intent. */
  currentStatus: string | null;
  /** `vehicles.maintenance_status` — the workshop flag (B-03). */
  maintenanceStatus: string | null;
  /** Every reservation of this vehicle (closed ones are filtered here). */
  reservations: AvailabilityReservation[];
  /** `yyyy-MM-dd`; injectable so the tests do not depend on the clock. */
  today?: string;
  /**
   * Set by the one caller that deliberately clears a manual `needs_fixing`
   * (`markVehicleForService(…, 'ok')`). Without it the manual flag is sticky —
   * which is the whole point of B-03.
   */
  clearWorkshopFlag?: boolean;
}

export function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ *
 * Picking up before the start date — besluiten B-16, BUG-144
 * ------------------------------------------------------------------ */

/**
 * besluiten **B-16** — "de medewerker krijgt de vraag of de huur eerder ingaat;
 * na bevestiging schuift de startdatum naar vandaag". 409, because the caller
 * can resolve it by answering the question.
 */
export class PickupBeforeStartError extends Error {
  readonly status = 409;
  readonly code = "PICKUP_BEFORE_START_DATE";

  constructor(
    readonly startDate: string,
    readonly endDate: string | null,
    readonly today: string,
  ) {
    super(`Deze huur begint pas op ${startDate}. Gaat de huur vandaag in?`);
    this.name = "PickupBeforeStartError";
  }

  toBody(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      startDate: this.startDate,
      endDate: this.endDate,
      today: this.today,
    };
  }
}

/**
 * BUG-144 — the code half. `/pickup` has asked the B-16 question since wave 10,
 * but the three status writers did not: phase 36 set `status: "picked_up"` on a
 * reservation starting 2026-11-11 through both `PATCH /:id` and
 * `PATCH /:id/status`, got 200 from both, and left a row claiming a pickup with
 * an empty pickup date and an empty pickup mileage. That is where the 123
 * `picked_up` rows with a future start date came from.
 *
 * Returns the date the rental should start (today) when the employee has
 * confirmed the shift, and null when the period has already started and there
 * is nothing to move. Throws `PickupBeforeStartError` when the question has not
 * been answered.
 */
export function assertPickupPeriodStarted(
  reservation: { startDate?: string | null; endDate?: string | null },
  opts: { confirmedShift?: boolean; today?: string } = {},
): string | null {
  const today = opts.today ?? isoToday();
  const startDate = reservation.startDate ?? null;
  if (!startDate || startDate <= today) return null;
  if (!opts.confirmedShift) {
    throw new PickupBeforeStartError(startDate, reservation.endDate ?? null, today);
  }
  return today;
}

function plusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Treats `''`/`'undefined'` the way the rest of the codebase does: as null. */
function endOf(r: AvailabilityReservation): string | null {
  const e = r.endDate;
  if (e === null || e === undefined || e === "" || e === "undefined") return null;
  return e;
}

/**
 * **The** rule for what a vehicle's availability is. One function, one writer
 * (`DatabaseStorage.recomputeVehicleAvailability`), used by the nightly sync,
 * by every reservation mutation, by pickup/return and by the workshop toggle.
 *
 * Order of precedence, and why:
 *  1. `not_for_rental` — a deliberate decision by staff; nothing derived may
 *     overwrite it (BUG-109). Only staff clear it.
 *  2. `needs_fixing` — the workshop flag, i.e. `maintenance_status` is
 *     `needs_service`/`in_service`, an open maintenance block covers today, or
 *     staff set `needs_fixing` by hand. B-03: it survives a return and a
 *     completed transport.
 *  3. `rented` — someone has the car. BUG-211: a `picked_up` rental counts
 *     **whatever its dates say**; the old rule only looked at "today is inside
 *     the period", so a rental picked up early left the car advertised as free.
 *  4. `scheduled` — a booking starts within 30 days. BUG-130: this is now
 *     reachable *from* `rented`, which the old set-based sync never allowed —
 *     so a completed rental left the car "out" forever.
 *  5. `available`.
 */
export function deriveVehicleAvailability(input: AvailabilityInput): VehicleAvailability {
  const today = input.today ?? isoToday();
  const horizon = plusDays(today, 30);

  const live = input.reservations.filter(
    (r) => !r.deletedAt && !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(r.status) ?? ""),
  );
  const rentals = live.filter((r) => r.type !== "maintenance_block");

  const hasPickedUp = rentals.some((r) => normalizeReservationStatus(r.status) === "picked_up");
  const hasCurrent = rentals.some((r) => {
    const end = endOf(r);
    return r.startDate <= today && (end === null || end >= today);
  });
  const hasUpcoming = rentals.some((r) => r.startDate > today && r.startDate <= horizon);
  const hasOpenBlock = live.some(
    (r) =>
      r.type === "maintenance_block" &&
      r.startDate <= today &&
      (endOf(r) === null || endOf(r)! >= today) &&
      isOpenBlockMaintenanceStatus(r.maintenanceStatus),
  );

  const current = typeof input.currentStatus === "string" ? input.currentStatus.trim().toLowerCase() : "";
  if (current === "not_for_rental") return "not_for_rental";

  const workshopFlag = input.maintenanceStatus === "needs_service" || input.maintenanceStatus === "in_service";
  const stickyNeedsFixing = current === "needs_fixing" && !input.clearWorkshopFlag;
  if (workshopFlag || hasOpenBlock || stickyNeedsFixing) return "needs_fixing";

  if (hasPickedUp || hasCurrent) return "rented";
  if (hasUpcoming) return "scheduled";
  return "available";
}

/* ------------------------------------------------------------------ *
 * B-03 — the handover gate
 * ------------------------------------------------------------------ */

export interface HandoverVehicleState {
  id?: number;
  availabilityStatus?: string | null;
  maintenanceStatus?: string | null;
  licensePlate?: string | null;
}

export interface HandoverRefusal {
  reasonCode: "NOT_FOR_RENTAL" | "NEEDS_FIXING" | "IN_WORKSHOP";
  message: string;
}

/**
 * besluiten.md **B-03** — "blokkeren, alleen een beheerder kan forceren".
 *
 * Returns the refusal, or `null` when the handover may proceed. `not_for_rental`
 * was the only case the old `getStatusOnPickup` caught, and only on `/pickup`:
 * `PATCH /:id/status {picked_up}` walked straight past it (BUG-109 step 5), and
 * a car whose `maintenance_status` said `in_service` went out to a customer
 * without a word (BUG-109 step 2).
 */
export function handoverRefusal(vehicle: HandoverVehicleState | null | undefined): HandoverRefusal | null {
  if (!vehicle) return null;
  const availability = typeof vehicle.availabilityStatus === "string" ? vehicle.availabilityStatus : "available";
  const maintenance = typeof vehicle.maintenanceStatus === "string" ? vehicle.maintenanceStatus : "ok";

  if (availability === "not_for_rental") {
    return {
      reasonCode: "NOT_FOR_RENTAL",
      message: 'Cannot pickup vehicle that is marked as "not for rental".',
    };
  }
  if (maintenance === "in_service" || maintenance === "needs_service") {
    return {
      reasonCode: "IN_WORKSHOP",
      message:
        maintenance === "in_service"
          ? "This vehicle is in the workshop and cannot be handed over. Close the workshop job first, or have an administrator force the handover with a reason."
          : "This vehicle is marked as needing service and cannot be handed over. Close the workshop job first, or have an administrator force the handover with a reason.",
    };
  }
  if (availability === "needs_fixing") {
    return {
      reasonCode: "NEEDS_FIXING",
      message:
        'This vehicle is marked as "needs fixing" and cannot be handed over. Resolve it first, or have an administrator force the handover with a reason.',
    };
  }
  return null;
}

export interface HandoverOverride {
  /** The caller asked to force it. */
  force?: boolean;
  /** Who asked — only an administrator may (B-03). */
  isAdmin?: boolean;
  /** Free text; B-03 requires a reason with the override. */
  reason?: string | null;
  username?: string | null;
}

export interface HandoverDecision {
  allowed: boolean;
  refusal: HandoverRefusal | null;
  /** Filled when an administrator forced it — goes into the reservation note. */
  overrideNote: string | null;
}

/**
 * Applies B-03 to one handover. Throws `WorkshopBlockedError` (409) when the
 * vehicle is blocked and the request carries no valid administrator override;
 * throws `StateTransitionError` (400) when a non-administrator tries to force,
 * or when an administrator forces without a reason.
 */
export function decideHandover(
  vehicle: HandoverVehicleState | null | undefined,
  override: HandoverOverride = {},
): HandoverDecision {
  const refusal = handoverRefusal(vehicle);
  if (!refusal) return { allowed: true, refusal: null, overrideNote: null };

  if (!override.force) {
    throw new WorkshopBlockedError(refusal.message, refusal.reasonCode);
  }
  if (!override.isAdmin) {
    throw new StateTransitionError(
      "Only an administrator may hand over a vehicle that is in the workshop or not for rental.",
      { code: "WORKSHOP_OVERRIDE_FORBIDDEN", field: "forceWorkshopOverride" },
    );
  }
  const reason = typeof override.reason === "string" ? override.reason.trim() : "";
  if (reason.length < 3) {
    throw new StateTransitionError("A reason is required to force a handover of a blocked vehicle.", {
      code: "WORKSHOP_OVERRIDE_REASON_REQUIRED",
      field: "forceWorkshopReason",
    });
  }

  return {
    allowed: true,
    refusal,
    overrideNote: `[WORKSHOP OVERRIDE ${isoToday()}] ${refusal.reasonCode} forced by ${override.username ?? "administrator"}: ${reason}`,
  };
}

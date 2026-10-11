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

// The status vocabulary (the enum, the legacy aliases, the normaliser) lives in
// shared/ so the client reads a stored status exactly as the server does. It is
// re-exported here because every server caller has always imported it from this
// module.
import {
  RESERVATION_STATUSES,
  LEGACY_RESERVATION_STATUS_ALIASES,
  normalizeReservationStatus,
  type ReservationStatus,
} from "../../shared/reservation-status";
export { RESERVATION_STATUSES, LEGACY_RESERVATION_STATUS_ALIASES, normalizeReservationStatus };
export type { ReservationStatus };
import { dateInZone } from "../../shared/office-timezone";
import { officeTimeZone } from "./office-time";

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

/** Statuses that mean "this row no longer occupies the vehicle". */
export const CLOSED_RESERVATION_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled", "returned"]);

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
 * The undo steps `allowReversion` honours: they are *named* in one place instead
 * of being an inline `||` chain, and every writer that passes the flag honours
 * the same list. `PATCH /:id/status` no longer passes it (sub-project C: a
 * reversal has its own route, `POST /api/reservations/:id/revert`); the
 * spare-status flow still does.
 */
export const RESERVATION_REVERSIONS: Readonly<Record<string, readonly ReservationStatus[]>> = Object.freeze({
  picked_up: ["booked"],
  returned: ["picked_up"],
  completed: ["picked_up", "booked"],
});

/**
 * Sub-project C (besluiten B-30, B-39) - every step the reversal engine
 * (`services/reservation-revert.ts`, `POST /api/reservations/:id/revert`) can
 * take: the three documented reversions plus undoing a cancellation.
 *
 * Deliberately a separate table: `RESERVATION_REVERSIONS` is what
 * `allowReversion` honours, and the spare-status flow still passes that flag, so
 * adding `cancelled` there would let a spare-vehicle button reopen a cancelled
 * replacement. `PATCH /:id/status` answers every step of THIS table with
 * 400 `USE_REVERT_ROUTE`.
 */
export const RESERVATION_REVERT_TARGETS: Readonly<Record<string, readonly ReservationStatus[]>> = Object.freeze({
  ...RESERVATION_REVERSIONS,
  cancelled: ["booked", "picked_up"],
});

/** True when moving `from` -> `to` is a reversal (and so belongs to the revert route). */
export function isReservationRevert(from: unknown, to: unknown): boolean {
  const current = normalizeReservationStatus(from);
  const target = normalizeReservationStatus(to);
  if (!current || !target || current === target) return false;
  return (RESERVATION_REVERT_TARGETS[current] ?? []).includes(target);
}

export interface TransitionOptions {
  /** Allow the documented undo steps (`RESERVATION_REVERSIONS`); only the spare-status flow passes it now. */
  allowReversion?: boolean;
  /**
   * The row is a maintenance block, not a rental. A block is "done" when the
   * car comes back from the workshop; it is never picked up by a customer, so a
   * block that was planned (`booked`) may be closed straight to `completed`
   * (the edit dialogs' "Uit" on a block that never got a "Binnen" save), which
   * the rental table does not allow. `completeMaintenance` has always written
   * `completed` from any status for the same reason.
   */
  maintenanceBlock?: boolean;
  /**
   * Only with `maintenanceBlock`: the same save puts the car back "Binnen"
   * (`maintenanceStatus: 'in'`, see `isCheckedInBlockMaintenanceStatus`). That is the history dialog's "Terugdraaien" and
   * the edit dialog of a block that was reverted before: a finished block
   * (`completed`) may become `picked_up` again, so the list, the calendar and
   * Afronden agree on it. A customer rental never comes back from `completed`.
   */
  reopenBlock?: boolean;
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
  if (opts.maintenanceBlock && current === "booked" && to === "completed") return true;
  if (opts.maintenanceBlock && opts.reopenBlock && current === "completed" && to === "picked_up") return true;
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

/**
 * True while the car is "Binnen" for this block (`in`, or the legacy
 * `in_service`); false for `scheduled`, an older row without the field, and
 * a finished block. Only `deriveVehicleAvailability` splits on this (D5);
 * every other caller keeps `isOpenBlockMaintenanceStatus`.
 */
export function isCheckedInBlockMaintenanceStatus(raw: unknown): boolean {
  if (raw == null) return false;
  const value = String(raw).trim().toLowerCase();
  return value === "in" || value === "in_service";
}

/**
 * The maintenance block Afronden finishes for a car: Binnen (`in` / `in_service`), covering `today`,
 * not closed, not deleted. One rule for the 409 USE_COMPLETE_ROUTE of the vehicle maintenance-status
 * route and for the `binnenBlockId` of the barcode lookup, so the scan card and the server agree.
 */
export function findBinnenBlockCoveringToday<
  T extends BlockCloseCheckRow & { startDate: string; endDate?: string | null },
>(rows: readonly T[], today: string): T | undefined {
  return rows.find((r) =>
    r.type === "maintenance_block" && !r.deletedAt &&
    !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(r.status) ?? "") &&
    isCheckedInBlockMaintenanceStatus(r.maintenanceStatus) &&
    r.startDate <= today && (!r.endDate || r.endDate === "undefined" || r.endDate >= today));
}

/** The columns `maintenanceBlockJustClosed` reads. */
export interface BlockCloseCheckRow {
  type?: string | null;
  status?: string | null;
  maintenanceStatus?: string | null;
  deletedAt?: Date | string | null;
}

/**
 * True when a write moved a maintenance block from open to finished, i.e. the
 * car is back from the workshop: `maintenanceStatus` went to `out`, or the
 * status went to `completed`/`returned`.
 *
 * Every writer that finishes a block has to ask the one owner to free the car
 * (`markVehicleForService(id, 'ok')`), because the fleet sweep keeps a stored
 * `needs_fixing` as a manual flag (`deriveVehicleAvailability`, sticky unless
 * `clearWorkshopFlag`). `PATCH /api/reservations/:id` and `/basic` forgot.
 *
 * A cancellation is deliberately NOT a finish: whether cancelling or deleting
 * a block should clear a flag that may be a hand-set damage flag is an open
 * owner question, so this keeps today's behaviour for it.
 */
export function maintenanceBlockJustClosed(
  before: BlockCloseCheckRow | null | undefined,
  after: BlockCloseCheckRow | null | undefined,
): boolean {
  if (!before || !after) return false;
  if (before.type !== "maintenance_block" || after.type !== "maintenance_block") return false;
  if (before.deletedAt || after.deletedAt) return false;

  const wasOpen =
    isOpenBlockMaintenanceStatus(before.maintenanceStatus) &&
    !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(before.status) ?? "");
  if (!wasOpen) return false;

  const afterStatus = normalizeReservationStatus(after.status);
  if (afterStatus === "cancelled") return false;
  return afterStatus === "completed" || afterStatus === "returned" || !isOpenBlockMaintenanceStatus(after.maintenanceStatus);
}

/**
 * D7 (besluiten B-41/B-42): "Uit (onderhoud voltooid)" is gone from the edit
 * dialogs. A maintenance block is finished with Afronden
 * (`POST /api/reservations/:id/complete-maintenance`), which also takes the APK
 * date, the odometer reading and the spare vehicle; a status save through
 * `PATCH /:id` or `/:id/basic` is refused for `out` / `completed` (400
 * USE_COMPLETE_ROUTE). A save that repeats the status the block already has is
 * not a change and passes (editing the notes of a finished block).
 */
export function assertBlockNotFinishedByPatch(
  existing: BlockCloseCheckRow | null | undefined,
  patch: { status?: unknown; maintenanceStatus?: unknown },
): void {
  if (!existing || existing.type !== "maintenance_block") return;

  const asksStatus = patch.status !== undefined && patch.status !== null && patch.status !== "";
  const asksMaintenance = patch.maintenanceStatus !== undefined && patch.maintenanceStatus !== null && patch.maintenanceStatus !== "";
  const closesViaStatus = asksStatus && normalizeReservationStatus(patch.status) === "completed" &&
    normalizeReservationStatus(existing.status) !== "completed";
  const closesViaMaintenance = asksMaintenance && String(patch.maintenanceStatus).trim().toLowerCase() === "out" &&
    String(existing.maintenanceStatus ?? "").trim().toLowerCase() !== "out";
  if (!closesViaStatus && !closesViaMaintenance) return;

  throw new StateTransitionError("A maintenance block is finished with the completion route, not with a status save.", {
    code: "USE_COMPLETE_ROUTE",
    field: closesViaStatus ? "status" : "maintenanceStatus",
    details: { route: "POST /api/reservations/:id/complete-maintenance" },
  });
}

/**
 * D3 (besluiten B-41/B-42): the status of a rental changes only through Ophalen,
 * Inleveren, Annuleren and Terugdraaien (`/pickup`, `/return`, `/status`,
 * `/revert`), never through a generic edit. `PATCH /:id` and `/:id/basic`
 * refuse a `status` that differs from the stored one (400 USE_STATUS_ROUTE); a
 * save that repeats the current status is not a change and passes (a client that
 * sends the whole row back). Legacy spellings count as the same status.
 *
 * A maintenance block is not a rental: its status follows the maintenance dialogs
 * and D7's completion route (`assertBlockNotFinishedByPatch`), so it is exempt.
 */
export function assertStatusNotSetByPatch(
  existing: BlockCloseCheckRow | null | undefined,
  patch: { status?: unknown },
): void {
  if (!existing || existing.type === "maintenance_block") return;

  const asksStatus = patch.status !== undefined && patch.status !== null && patch.status !== "";
  if (!asksStatus) return;

  const requested = normalizeReservationStatus(patch.status);
  if (requested !== null && requested === normalizeReservationStatus(existing.status)) return;

  throw new StateTransitionError("A reservation's status changes with the pickup, return, cancel and revert actions, not with an edit.", {
    code: "USE_STATUS_ROUTE",
    field: "status",
    details: { route: "PATCH /api/reservations/:id/status", currentStatus: existing.status ?? null, requestedStatus: patch.status },
  });
}

/**
 * D6 (besluiten B-41): true when a write cancelled a live maintenance block.
 * A cancelled block no longer keeps the car in the workshop; whether the car is
 * freed depends on `vehicles.maintenance_status_block_id` (see
 * `DatabaseStorage.releaseVehicleFromRemovedBlock`).
 */
export function maintenanceBlockJustCancelled(
  before: BlockCloseCheckRow | null | undefined,
  after: BlockCloseCheckRow | null | undefined,
): boolean {
  if (!before || !after) return false;
  if (before.type !== "maintenance_block" || after.type !== "maintenance_block") return false;
  if (before.deletedAt) return false;
  return (
    normalizeReservationStatus(before.status) !== "cancelled" &&
    normalizeReservationStatus(after.status) === "cancelled"
  );
}

/** The shape both "terug uit onderhoud" paths hand to `selectMaintenanceBlocksToClose`. */
export interface ClosableMaintenanceBlock {
  id: number;
  type?: string | null;
  status?: string | null;
  startDate: string;
  endDate?: string | null;
  maintenanceStatus?: string | null;
  deletedAt?: Date | string | null;
}

/**
 * PHASE 57 / WAVE 13 items 4 and 5 — **the** rule for which maintenance block
 * "terug uit onderhoud" closes.
 *
 * The scan screen's `PATCH /api/vehicles/:id/maintenance-status` used to close
 * every open block whose end date had not passed. On a car with a repair
 * running today *and* one planned for October that closed both: the October
 * block went to `out`, vanished from the maintenance calendar, and nobody was
 * told. A block that has not started is not finished by handing today's car
 * back.
 *
 * So: only the block that actually covers `onDate` (or, when the caller names
 * one, exactly that block). An open-ended block counts as covering every day
 * from its start. Everything else is left alone.
 */
export function selectMaintenanceBlocksToClose(
  blocks: readonly ClosableMaintenanceBlock[],
  onDate: string,
  explicitBlockId?: number | null,
): ClosableMaintenanceBlock[] {
  const open = blocks.filter(
    (block) =>
      (block.type ?? "maintenance_block") === "maintenance_block" &&
      !block.deletedAt &&
      !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(block.status) ?? "") &&
      isOpenBlockMaintenanceStatus(block.maintenanceStatus),
  );

  if (explicitBlockId != null) {
    return open.filter((block) => block.id === explicitBlockId);
  }

  return open.filter((block) => {
    const end = block.endDate === null || block.endDate === undefined || block.endDate === "" ? null : block.endDate;
    return block.startDate <= onDate && (end === null || end >= onDate);
  });
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

/**
 * Today's date on the office calendar (the `office_timezone` setting, Europe/Amsterdam unless changed).
 *
 * This used to be `new Date().toISOString().split("T")[0]`, which is the date
 * in UTC. The office runs on Amsterdam time and the container runs on UTC, so
 * between midnight and 01:00 or 02:00 the application believed it was still
 * yesterday: a rental starting today was refused at handover with "de huur
 * start later", and every other "is it today" question answered for the wrong
 * day. Reading the date in the office's own zone removes that hour-of-day
 * dependency wherever the server asks what day it is.
 */
export function isoToday(): string {
  return officeDate(new Date());
}

/** The office-zone calendar date of an instant, as `yyyy-MM-dd` (D11: the zone is a setting). */
export function officeDate(instant: Date): string {
  return dateInZone(instant, officeTimeZone());
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
 *     `needs_service`/`in_service`, a maintenance block covering today has the
 *     car "Binnen" (D5: a merely planned block does not count), or staff set
 *     `needs_fixing` by hand. B-03: it survives a return and a
 *     completed transport.
 *  3. `rented` — someone has the car. BUG-211: a `picked_up` rental counts
 *     **whatever its dates say**; the old rule only looked at "today is inside
 *     the period", so a rental picked up early left the car advertised as free.
 *  4. `scheduled` — a booking starts within 30 days, or a planned maintenance
 *     block covers today (D5). BUG-130: this is now
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
  // D5 (besluiten B-41): a block covering today only puts the car in the workshop
  // once the car is "Binnen" (in / in_service). A block that is merely planned
  // (scheduled, or an older row without the field) makes the car 'scheduled':
  // not available (B-01), but not "Reparatie nodig" either.
  const blocksCoveringToday = live.filter(
    (r) =>
      r.type === "maintenance_block" &&
      r.startDate <= today &&
      (endOf(r) === null || endOf(r)! >= today) &&
      isOpenBlockMaintenanceStatus(r.maintenanceStatus),
  );
  const hasOpenBlock = blocksCoveringToday.some((r) => isCheckedInBlockMaintenanceStatus(r.maintenanceStatus));
  const hasPlannedBlock = blocksCoveringToday.length > 0 && !hasOpenBlock;

  const current = typeof input.currentStatus === "string" ? input.currentStatus.trim().toLowerCase() : "";
  if (current === "not_for_rental") return "not_for_rental";

  const workshopFlag = input.maintenanceStatus === "needs_service" || input.maintenanceStatus === "in_service";
  const stickyNeedsFixing = current === "needs_fixing" && !input.clearWorkshopFlag;
  if (workshopFlag || hasOpenBlock || stickyNeedsFixing) return "needs_fixing";

  if (hasPickedUp || hasCurrent) return "rented";
  if (hasUpcoming || hasPlannedBlock) return "scheduled";
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

/** D5: a hint on a handover that is allowed. Never a reason to refuse. */
export const HANDOVER_WARNING_MAINTENANCE_SCHEDULED = "MAINTENANCE_SCHEDULED" as const;
export type HandoverWarningCode = typeof HANDOVER_WARNING_MAINTENANCE_SCHEDULED;

export interface HandoverDecision {
  allowed: boolean;
  refusal: HandoverRefusal | null;
  /** Filled when an administrator forced it — goes into the reservation note. */
  overrideNote: string | null;
  /** D5: hints for the desk, e.g. a planned maintenance block covers the pickup day. */
  warnings: HandoverWarningCode[];
}

/** What `decideHandover` needs to look for a planned maintenance block. */
export interface HandoverContext {
  /** The pickup day (yyyy-MM-dd); defaults to today. */
  day?: string;
  /** The vehicle's reservations, blocks included (closed and deleted rows are ignored). */
  reservations?: AvailabilityReservation[];
}

/**
 * D5 (besluiten B-41): the live maintenance blocks that cover `day` while the
 * car is not "Binnen" yet, i.e. status scheduled (or an older row without the
 * field). Such a block makes the car 'scheduled', and the pickup dialog warns
 * about it; a block the car is in is refused by `handoverRefusal` instead.
 */
export function scheduledMaintenanceOnDay<T extends AvailabilityReservation>(reservations: readonly T[], day: string): T[] {
  return reservations.filter(
    (r) =>
      r.type === "maintenance_block" &&
      !r.deletedAt &&
      !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(r.status) ?? "") &&
      isOpenBlockMaintenanceStatus(r.maintenanceStatus) &&
      !isCheckedInBlockMaintenanceStatus(r.maintenanceStatus) &&
      r.startDate <= day &&
      (endOf(r) === null || endOf(r)! >= day),
  );
}

/** The hints for a handover that may proceed (D5); empty without a context. Never throws. */
export function handoverWarnings(context: HandoverContext = {}): HandoverWarningCode[] {
  return context.reservations && scheduledMaintenanceOnDay(context.reservations, context.day ?? isoToday()).length > 0
    ? [HANDOVER_WARNING_MAINTENANCE_SCHEDULED]
    : [];
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
  context: HandoverContext = {},
): HandoverDecision {
  const warnings = handoverWarnings(context);
  const refusal = handoverRefusal(vehicle);
  if (!refusal) return { allowed: true, refusal: null, overrideNote: null, warnings };

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
    warnings,
    overrideNote: `[WORKSHOP OVERRIDE ${isoToday()}] ${refusal.reasonCode} forced by ${override.username ?? "administrator"}: ${reason}`,
  };
}

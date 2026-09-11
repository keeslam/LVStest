/**
 * FIX-H — what is left of this module after `server/services/lifecycle.ts`
 * took ownership of the two state machines.
 *
 * Six of the twelve exports were dead code (`calculateCorrectStatus`,
 * `getStatusOnPickup`, `getStatusOnReturn`, `getStatusOnMaintenanceStart`,
 * `getStatusOnMaintenanceEnd`, `getStatusOnReservationCancel`,
 * `VEHICLE_STATUS_LABELS`, `VEHICLE_STATUS_COLORS`) — `getStatusOnReturn` was
 * even imported and never called, which is how the audit found the module in
 * the first place. Each of them carried its *own* answer to "what is this
 * vehicle's status now", and those answers disagreed.
 *
 * What remains is the manual-change gate the vehicle edit form needs, and the
 * reservation context it reads. The derivation itself lives in
 * `deriveVehicleAvailability()`; nothing here computes a status.
 */
import { Vehicle, Reservation } from "@shared/schema";
import {
  assertVehicleAvailabilityStatus,
  normalizeReservationStatus,
  CLOSED_RESERVATION_STATUSES,
  isOpenBlockMaintenanceStatus,
  isoToday,
  StateTransitionError,
  type VehicleAvailability,
} from "./services/lifecycle";

/** Kept under its old name: six modules import this type. */
export type VehicleAvailabilityStatus = VehicleAvailability;

export interface StatusTransitionResult {
  allowed: boolean;
  newStatus?: VehicleAvailabilityStatus;
  warning?: string;
  error?: string;
}

export interface VehicleStatusContext {
  vehicle: Vehicle;
  activeReservations: Reservation[];
  hasPickedUpReservation: boolean;
  hasBookedReservation: boolean;
  hasMaintenanceBlock: boolean;
  overdueReservations: Reservation[];
}

export function getVehicleStatusContext(
  vehicle: Vehicle,
  allReservations: Reservation[]
): VehicleStatusContext {
  const today = isoToday();

  const vehicleReservations = allReservations.filter(r =>
    r.vehicleId === vehicle.id &&
    !r.deletedAt &&
    // FIX-H: one definition of "closed", shared with the derivation. This list
    // used to be spelled out here by hand and drifted from the other four.
    !CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(r.status) ?? '')
  );

  // Overdue: picked_up but past end date (the customer still has the car).
  const overdueReservations = vehicleReservations.filter(r => {
    if (r.type === 'maintenance_block') return false;
    return normalizeReservationStatus(r.status) === 'picked_up' && r.endDate && r.endDate < today;
  });

  const activeReservations = vehicleReservations.filter(r => {
    if (r.type === 'maintenance_block') return false;
    const status = normalizeReservationStatus(r.status);
    // BUG-211: a picked-up rental counts whatever its dates say. The old rule
    // only looked at "today is inside the period", so a rental picked up weeks
    // early left the vehicle advertised as free.
    if (status === 'picked_up') return true;
    const started = r.startDate <= today;
    const notEnded = !r.endDate || r.endDate >= today;
    return started && notEnded;
  });

  const hasPickedUpReservation = activeReservations.some(
    r => normalizeReservationStatus(r.status) === 'picked_up'
  );
  // BUG-146: the warning this feeds says "upcoming booked reservations", but it
  // was computed from *active* ones only — a booking three days out therefore
  // produced no warning at all, on top of the warning being discarded by the
  // route. A live booking that has not ended yet counts, whether it has started
  // or not.
  const hasBookedReservation = vehicleReservations.some(r => {
    if (r.type === 'maintenance_block') return false;
    if (normalizeReservationStatus(r.status) !== 'booked') return false;
    return !r.endDate || r.endDate >= today;
  });

  const hasMaintenanceBlock = vehicleReservations.some(r => {
    if (r.type !== 'maintenance_block') return false;
    const started = r.startDate <= today;
    const notEnded = !r.endDate || r.endDate >= today;
    return started && notEnded && isOpenBlockMaintenanceStatus(r.maintenanceStatus);
  });

  return {
    vehicle,
    activeReservations,
    hasPickedUpReservation,
    hasBookedReservation,
    hasMaintenanceBlock,
    overdueReservations
  };
}

/**
 * The gate on a **manual** status change from the vehicle form.
 *
 * BUG-021: there was no allowlist on `newStatus`, so anything that matched
 * none of the from/to branches — `"banana_not_real"` — fell through to
 * `{allowed:true}` on the last line and was persisted. The vehicle then
 * disappeared from every status-driven screen.
 *
 * Throws `StateTransitionError` (400) for a value outside the enum; returns a
 * verdict for everything else, exactly as before.
 */
export function validateManualStatusChange(
  currentStatus: VehicleAvailabilityStatus,
  newStatus: VehicleAvailabilityStatus,
  context: VehicleStatusContext
): StatusTransitionResult {
  // The allowlist the audit found missing. Deliberately a throw and not
  // `{allowed:false}`: every caller already maps this to a 400 with a field.
  const target = assertVehicleAvailabilityStatus(newStatus);
  const current = assertVehicleAvailabilityStatus(currentStatus || 'available');

  if (current === target) {
    return { allowed: true, newStatus: target };
  }

  if (context.hasPickedUpReservation) {
    if (target === 'available') {
      return {
        allowed: false,
        error: `Cannot set vehicle to "available" while it has an active picked-up rental. Please return the vehicle first.`
      };
    }
    if (target === 'needs_fixing') {
      return {
        allowed: true,
        newStatus: target,
        warning: `Vehicle has an active rental. Setting to "needs fixing" will not affect the current rental, but the vehicle will need attention after return.`
      };
    }
    if (target === 'not_for_rental') {
      return {
        allowed: true,
        newStatus: target,
        warning: `Vehicle has an active rental. It will be marked as "not for rental" after the current rental ends.`
      };
    }
  }

  if (context.hasMaintenanceBlock) {
    if (target === 'available') {
      return {
        allowed: false,
        error: `Cannot set vehicle to "available" while it has an active maintenance block. Please close the maintenance first.`
      };
    }
    if (target === 'not_for_rental') {
      return {
        allowed: true,
        newStatus: target,
        warning: `Vehicle has active maintenance. It will be marked as "not for rental" after maintenance is complete.`
      };
    }
  }

  if (context.hasBookedReservation && (target === 'needs_fixing' || target === 'not_for_rental')) {
    return {
      allowed: true,
      newStatus: target,
      warning: `Vehicle has upcoming booked reservations. Changing status may require rescheduling those bookings.`
    };
  }

  if (target === 'rented' && !context.hasPickedUpReservation) {
    return {
      allowed: false,
      error: `Cannot manually set vehicle to "rented". This status is set automatically when a reservation is picked up.`
    };
  }

  if (target === 'scheduled' && !context.hasBookedReservation) {
    return {
      allowed: false,
      error: `Cannot manually set vehicle to "scheduled". This status is set automatically when there are upcoming reservations.`
    };
  }

  return { allowed: true, newStatus: target };
}

export { StateTransitionError };

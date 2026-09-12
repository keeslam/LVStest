// Single source of truth for a transport's spare/replacement-vehicle display state.
// Derived (never stored) from spareRequired/relatedVehicleId plus the REAL spare
// reservation's own status (booked -> picked_up -> returned, the same lifecycle
// every rental goes through via PickupDialog/ReturnDialog) — not a parallel
// transport-level flag, which is exactly the kind of state that was found to drift
// from reservations.status elsewhere in this codebase (reservations.spareVehicleStatus).
export type TransportSpareStatus = 'not_required' | 'tbd' | 'assigned' | 'picked_up' | 'returned';

export interface TransportSpareStatusInput {
  spareRequired: boolean;
  relatedVehicleId: number | null;
  spareReservation?: { status: string } | null;
}

export function getTransportSpareStatus(transport: TransportSpareStatusInput): TransportSpareStatus {
  if (!transport.spareRequired) return 'not_required';
  if (!transport.relatedVehicleId) return 'tbd';
  const resStatus = transport.spareReservation?.status;
  if (resStatus === 'returned' || resStatus === 'completed') return 'returned';
  if (resStatus === 'picked_up') return 'picked_up';
  return 'assigned';
}

/**
 * OPT-008 — "Vervanger krijgt de status die hij fysiek heeft".
 *
 * The buttons in the spare-vehicle widget ("Markeer als opgehaald") wrote only
 * `spare_vehicle_status`. The underlying replacement reservation stayed on
 * `pending`, so the vehicle stayed `available` — while it was physically with
 * the customer. That is a direct double-booking path (phase 20, chain 3 step
 * 5; DE-6).
 *
 * Phase 20 named this module "the model, not the problem"; this is the missing
 * consumer side of it: what the replacement *reservation's* own status must be
 * for a given spare status, so the one bookability predicate sees the truth.
 *
 * `assigned` and `ready` deliberately map to `booked`: the car has been picked
 * out and prepared, but it is still on the yard.
 *
 * `returned` maps to `completed`, not `returned`, for the same reason
 * `returnReservation()` does (besluiten B-02): the car is free again the same
 * second.
 */
export type SpareVehicleStatus = 'assigned' | 'ready' | 'picked_up' | 'returned';

export function reservationStatusForSpareStatus(
  spareStatus: SpareVehicleStatus,
): 'booked' | 'picked_up' | 'completed' {
  switch (spareStatus) {
    case 'picked_up':
      return 'picked_up';
    case 'returned':
      return 'completed';
    case 'assigned':
    case 'ready':
    default:
      return 'booked';
  }
}

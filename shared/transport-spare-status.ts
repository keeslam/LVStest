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

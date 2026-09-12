/**
 * B-21 — the shape of the "Nog buiten" worklist, shared by the endpoint that
 * builds it (server/services/pickup-worklist.ts) and the screen that walks it
 * (client/src/pages/reservations/still-out.tsx).
 *
 * Flat rows on purpose: the four things an employee needs to decide what to do
 * — which car, which customer, which period, how long it has been open — and
 * nothing else. Never a nested vehicle/customer object; that is what made the
 * reservation list 8 MB (BUG-203/BUG-204).
 */

/** Never hand a screen an unbounded list; 363 rows today, and it only shrinks. */
export const STILL_OUT_LIMIT = 500;

export interface StillOutRow {
  reservationId: number;
  vehicleId: number | null;
  licensePlate: string | null;
  vehicleLabel: string | null;
  customerId: number | null;
  customerLabel: string | null;
  startDate: string;
  endDate: string | null;
  actualPickupDate: string | null;
  contractNumber: string | null;
  /** Whole days between the agreed end date and the reference day. */
  daysOpen: number;
}

export interface StillOutWorklist {
  /** The reference day the counts were taken against, `YYYY-MM-DD`. */
  today: string;
  /** How many rows match in total, even when `rows` is capped. */
  total: number;
  rows: StillOutRow[];
}

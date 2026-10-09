/**
 * Reservation status vocabulary, shared by the server (`server/services/lifecycle.ts`
 * re-exports everything here) and the client, which must read a stored status the
 * same way the server does.
 *
 * Nothing in this file may import from `server/` (the client bundle imports it).
 */

export const RESERVATION_STATUSES = ["booked", "picked_up", "returned", "completed", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

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

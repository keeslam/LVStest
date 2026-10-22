/**
 * OPT-002 — "ophalen of innemen?" as one function.
 *
 * The scan panel already answers the counter's most frequent question with a
 * single physical action: scan the key tag, and the panel decides whether this
 * car is going out ("Ophalen starten") or coming back ("Innemen starten").
 * That decision lived inline in three sibling JSX conditions, which is why it
 * could not be reused by the dashboard and could not be tested.
 *
 * The rules are the panel's own, unchanged:
 *   - a reservation on this vehicle that is already `picked_up` → the car is
 *     out, so the next handover is a return;
 *   - any other open reservation on this vehicle → a pickup;
 *   - nothing open but something upcoming → a pickup;
 *   - otherwise there is no handover to start.
 */
export type HandoverKind = "pickup" | "return";

export interface HandoverReservationLike {
  id: number;
  status: string;
}

export interface HandoverChoice {
  kind: HandoverKind;
  reservationId: number;
}

export function chooseHandover(input: {
  activeReservation?: HandoverReservationLike | null;
  upcomingReservation?: HandoverReservationLike | null;
}): HandoverChoice | null {
  const active = input.activeReservation ?? null;
  if (active) {
    return {
      kind: active.status === "picked_up" ? "return" : "pickup",
      reservationId: active.id,
    };
  }
  const upcoming = input.upcomingReservation ?? null;
  if (upcoming) {
    return { kind: "pickup", reservationId: upcoming.id };
  }
  return null;
}

/**
 * The dashboard tiles open the scan panel with an intent. A scan that resolves
 * to the *other* handover must not silently do the other thing, so the panel
 * only starts by itself when the vehicle's own state agrees with the tile the
 * employee pressed.
 */
export function matchesIntent(choice: HandoverChoice | null, intent: HandoverKind | null | undefined): boolean {
  if (!choice || !intent) return false;
  return choice.kind === intent;
}

/**
 * Kees 2026-10-22: a scanned contract or reservation barcode. A rental or spare that is out
 * comes back (return); one that is booked goes out (pickup); anything else (returned,
 * cancelled, a maintenance block, no car yet) offers no handover.
 */
export function handoverForReservation(
  reservation: (HandoverReservationLike & { type?: string | null }) | null | undefined,
  hasVehicle: boolean,
): HandoverChoice | null {
  if (!reservation || !hasVehicle) return null;
  if (reservation.type && reservation.type !== "standard" && reservation.type !== "replacement") return null;
  if (reservation.status === "picked_up") return { kind: "return", reservationId: reservation.id };
  if (["booked", "confirmed", "pending"].includes(reservation.status)) return { kind: "pickup", reservationId: reservation.id };
  return null;
}

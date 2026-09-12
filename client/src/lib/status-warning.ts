/**
 * BUG-146 — "Waarschuwingen bij een handmatige statuswijziging bereiken de
 * client nooit."
 *
 * `validateManualStatusChange` has always produced sentences like "Vehicle has
 * upcoming booked reservations. Changing status may require rescheduling those
 * bookings." — the state machine was designed to warn staff before they take a
 * booked or rented car out of service. The route threw the warning away
 * (`if (validation.warning) console.log(...)`). Wave 4 made the response carry
 * it; this is the other half: the screen that reads it.
 *
 * Kept as a plain function so the "which responses carry a warning" rule is
 * testable without mounting the 4 000-line vehicle dialog.
 */
export function statusChangeWarning(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const warning = (payload as { warning?: unknown }).warning;
  if (typeof warning !== "string") return null;
  const trimmed = warning.trim();
  return trimmed === "" ? null : trimmed;
}

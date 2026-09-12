/**
 * besluiten.md **B-09** — "Verhuring op een auto met een onderhoudsblok:
 * waarschuwen, de medewerker mag doorgaan." (BUG-013, BUG-037)
 *
 * The bookability predicate already *reports* every overlapping maintenance
 * block (`verdict.maintenanceBlocks`, see `server/services/bookability.ts`).
 * What was missing is the other half of the decision: the writer has to hand
 * the desk a **machine-readable** warning, with the maintenance period in it,
 * and the form has to show it before the save — while still allowing the save.
 *
 * This module is shared so the server that produces the warning and the client
 * that renders it cannot drift on the code or on the wording.
 *
 * Deliberately NOT the same thing as "available": per **B-01** a vehicle in
 * maintenance still does not count as available in the dashboard counts or in
 * the suggestion lists. B-09 only says that a deliberate booking is allowed.
 */

export const BOOKING_WARNING_MAINTENANCE_OVERLAP = "MAINTENANCE_OVERLAP" as const;

export type BookingWarningCode = typeof BOOKING_WARNING_MAINTENANCE_OVERLAP;

/** The part of a maintenance block the warning carries. */
export interface MaintenanceBlockPeriod {
  id: number;
  startDate: string;
  /** `null` for an open-ended block. */
  endDate: string | null;
  /** 'scheduled' | 'in' | 'out' — informational. */
  maintenanceStatus?: string | null;
}

export interface BookingWarning {
  code: BookingWarningCode;
  /** Dutch, ready to show; the period is part of the sentence (B-09). */
  message: string;
  maintenanceBlocks: MaintenanceBlockPeriod[];
}

/** `2026-09-18` → `18-09-2026`; anything else is passed through unchanged. */
export function formatDutchDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** "18-09-2026 t/m 20-09-2026", "18-09-2026" for one day, "vanaf …" when open-ended. */
export function formatMaintenancePeriod(block: MaintenanceBlockPeriod): string {
  const start = formatDutchDate(block.startDate);
  if (!block.endDate) return `vanaf ${start}`;
  const end = formatDutchDate(block.endDate);
  return end === start ? start : `${start} t/m ${end}`;
}

/**
 * The warning for a set of overlapping maintenance blocks, or `null` when
 * there are none. Used by the reservation writers and by the pre-save check
 * the booking form runs.
 */
export function maintenanceOverlapWarning(
  blocks: Array<MaintenanceBlockPeriod | null | undefined>,
): BookingWarning | null {
  const periods = blocks
    .filter((b): b is MaintenanceBlockPeriod => !!b && typeof b.id === "number")
    .map((b) => ({
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate ?? null,
      maintenanceStatus: b.maintenanceStatus ?? null,
    }));
  if (periods.length === 0) return null;

  const periodText = periods.map(formatMaintenancePeriod).join(", ");
  const message = periods.length === 1
    ? `Let op: dit voertuig staat in deze periode ingepland voor onderhoud (${periodText}). Opslaan mag; het onderhoudsblok blijft staan.`
    : `Let op: dit voertuig heeft ${periods.length} onderhoudsblokken in deze periode (${periodText}). Opslaan mag; de blokken blijven staan.`;

  return { code: BOOKING_WARNING_MAINTENANCE_OVERLAP, message, maintenanceBlocks: periods };
}

/** Convenience for a response body: `warnings` is omitted when there is nothing to say. */
export function bookingWarningsFor(
  blocks: Array<MaintenanceBlockPeriod | null | undefined>,
): BookingWarning[] {
  const warning = maintenanceOverlapWarning(blocks);
  return warning ? [warning] : [];
}

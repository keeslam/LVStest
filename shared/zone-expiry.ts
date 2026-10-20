/**
 * Kees, 2026-10-20 (round 2, punt 9) — the end dates of the low-emission-zone
 * classification (`vehicles.euroZoneEndDate`) and the Move IZI registration
 * (`vehicles.moveIziExpirationDate`). Both were only typed in and shown; they now
 * feed a dashboard tile, the notification centre and a warning at booking and
 * pickup. The number of days ahead is `settings.zoneReminderDays` (default 30).
 */

export type ZoneKind = "euroZone" | "moveIzi";
export const ZONE_KINDS: ZoneKind[] = ["euroZone", "moveIzi"];

export const ZONE_DATE_FIELD: Record<ZoneKind, "euroZoneEndDate" | "moveIziExpirationDate"> = {
  euroZone: "euroZoneEndDate",
  moveIzi: "moveIziExpirationDate",
};

export type ZoneVehicleLike = { euroZoneEndDate?: string | null; moveIziExpirationDate?: string | null };

/** The stored date as yyyy-MM-dd, or null when empty or not a date. */
export function zoneDay(value: string | null | undefined): string | null {
  const day = (value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export interface ZoneRentalWarning {
  kind: ZoneKind;
  date: string;
  /** "expired": ended before the rental starts; "during": ends while the car is out. */
  state: "expired" | "during";
}

/**
 * What a rental from `startDate` to `endDate` runs into. Without an end date only an
 * end before the start counts. Saving and handing over stay allowed (a warning).
 */
export function zoneRentalWarnings(
  vehicle: ZoneVehicleLike | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): ZoneRentalWarning[] {
  const start = zoneDay(startDate);
  if (!vehicle || !start) return [];
  const end = zoneDay(endDate);
  const warnings: ZoneRentalWarning[] = [];
  for (const kind of ZONE_KINDS) {
    const date = zoneDay(vehicle[ZONE_DATE_FIELD[kind]]);
    if (!date) continue;
    if (date < start) warnings.push({ kind, date, state: "expired" });
    else if (end && date <= end) warnings.push({ kind, date, state: "during" });
  }
  return warnings;
}

export interface ZoneExpiringRow {
  id: number;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  kind: ZoneKind;
  date: string;
}

/** One row per end date between `fromDay` and `toDay` (inclusive), soonest first. */
export function zoneExpiringRows(
  vehicles: Array<ZoneVehicleLike & { id: number; licensePlate: string; brand?: string | null; model?: string | null }>,
  fromDay: string,
  toDay: string,
): ZoneExpiringRow[] {
  const rows: ZoneExpiringRow[] = [];
  for (const v of vehicles) {
    for (const kind of ZONE_KINDS) {
      const date = zoneDay(v[ZONE_DATE_FIELD[kind]]);
      if (date && date >= fromDay && date <= toDay) {
        rows.push({ id: v.id, licensePlate: v.licensePlate, brand: v.brand ?? null, model: v.model ?? null, kind, date });
      }
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.licensePlate.localeCompare(b.licensePlate));
}

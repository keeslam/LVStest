/**
 * FIX-S (BUG-228) — bucket the reservations once per data change instead of
 * filtering the whole set per calendar cell.
 *
 * `calendar.tsx` ran `getReservationsForDay(vehicleId, day)` as a full `.filter`
 * over every reservation, per vehicle cell, on every render; the dashboard
 * calendar did the same per day cell. With 461 visible reservations and roughly
 * 35 vehicles × 30 days of cells that is around half a million predicate
 * evaluations per render.
 *
 * **The bug is explicitly LOW and unmeasured** — phase 19 had no browser, so
 * those evaluations were counted, not clocked. This module is therefore the
 * conservative half of the fix: a pure, tested bucketing function the callers
 * can use instead of the per-cell filter. It changes which rows a cell sees for
 * exactly nobody; the day/vehicle predicate is the same one the calendar has
 * always applied.
 */

/** The shape the bucketing needs; anything wider is fine. */
export interface BucketableReservation {
  id: number;
  vehicleId: number | null;
  startDate: string | null;
  endDate: string | null;
  [key: string]: unknown;
}

/** `yyyy-MM-dd` for a Date, in local time — the key the calendar cells use. */
export function dayKey(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The `yyyy-MM-dd` prefix of whatever the API returned (date or timestamp). */
function dateKeyOf(value: string | null | undefined): string | null {
  if (!value || value === "undefined") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

function eachDayKey(startKey: string, endKey: string, maxDays = 400): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return keys;
  let guard = 0;
  while (cursor <= end && guard < maxDays) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys;
}

/**
 * `Map<"yyyy-MM-dd", reservations[]>` — every reservation appears under each
 * day its period covers. An open-ended reservation (no end date) is bucketed on
 * its start day only, which is what the calendar's own predicate did.
 *
 * `windowStart`/`windowEnd` bound the work for very long rentals; days outside
 * the visible window are not bucketed at all.
 */
export function bucketByDay<T extends BucketableReservation>(
  reservations: readonly T[] | null | undefined,
  window?: { start: Date; end: Date },
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  if (!reservations) return buckets;

  const windowStartKey = window ? dayKey(window.start) : null;
  const windowEndKey = window ? dayKey(window.end) : null;

  for (const reservation of reservations) {
    const startKey = dateKeyOf(reservation.startDate);
    if (!startKey) continue;
    const endKey = dateKeyOf(reservation.endDate) ?? startKey;

    const from = windowStartKey && windowStartKey > startKey ? windowStartKey : startKey;
    const to = windowEndKey && windowEndKey < endKey ? windowEndKey : endKey;
    if (from > to) continue;

    for (const key of eachDayKey(from, to)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(reservation);
      else buckets.set(key, [reservation]);
    }
  }

  return buckets;
}

/**
 * `Map<"vehicleId|yyyy-MM-dd", reservations[]>` — the key the vehicle × day
 * grid looks up, so a cell is a `Map.get` instead of a full scan.
 */
export function bucketByVehicleAndDay<T extends BucketableReservation>(
  reservations: readonly T[] | null | undefined,
  window?: { start: Date; end: Date },
): Map<string, T[]> {
  const byDay = bucketByDay(reservations, window);
  const buckets = new Map<string, T[]>();
  for (const [key, rows] of Array.from(byDay.entries())) {
    for (const row of rows) {
      if (row.vehicleId == null) continue;
      const cellKey = `${row.vehicleId}|${key}`;
      const bucket = buckets.get(cellKey);
      if (bucket) bucket.push(row);
      else buckets.set(cellKey, [row]);
    }
  }
  return buckets;
}

/** The cell lookup, so callers do not build the key string by hand. */
export function cellKey(vehicleId: number, day: Date): string {
  return `${vehicleId}|${dayKey(day)}`;
}

/**
 * Punt 14 (Kees, 2026-10-20) — the availability window: which cars are free
 * for a period, and when a busy car is free again.
 *
 * "Free" is the booking rule itself (DatabaseStorage.getAvailableVehiclesInRange):
 * no live rental overlapping the period, both ends included, and not in the
 * workshop, not for rental or out of the fleet. A planned maintenance block does
 * not make a car busy (B-09: booking over it is allowed); the window marks it.
 */

export interface BusyPeriod {
  startDate: string;
  /** null = open-ended rental. */
  endDate: string | null;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The first day on or after `from` that no busy period covers. A period ends
 * on its end day, so the car is free the day after. Null when an open-ended
 * rental is in the way: nobody knows when it comes back.
 */
export function freeFromDate(periods: BusyPeriod[], from: string): string | null {
  let day = from;
  // Each pass moves `day` past one covering period; at most one pass per period.
  for (let i = 0; i <= periods.length; i++) {
    const covering = periods.filter((p) => p.startDate <= day && (p.endDate === null || p.endDate === "" || p.endDate >= day));
    if (covering.length === 0) return day;
    if (covering.some((p) => !p.endDate)) return null;
    const latestEnd = covering.reduce((max, p) => (p.endDate! > max ? p.endDate! : max), covering[0].endDate!);
    day = nextDay(latestEnd);
  }
  return day;
}

function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * What to say about a car that is not free for the whole period:
 *  - free at the start but rented later on: "vrij t/m" the day before that rental;
 *  - rented at the start: "vrij vanaf" the first free day (null = open-ended rental).
 */
export function busyHint(periods: BusyPeriod[], startDate: string, endDate: string):
  { freeUntil: string } | { freeFrom: string | null } {
  const firstFree = freeFromDate(periods, startDate);
  if (firstFree === startDate) {
    const next = periods
      .map((p) => p.startDate)
      .filter((d) => d > startDate && d <= endDate)
      .sort()[0];
    if (next) return { freeUntil: previousDay(next) };
  }
  return { freeFrom: firstFree };
}

/** True when a maintenance block overlaps the period, both ends included. */
export function overlapsPeriod(p: BusyPeriod, startDate: string, endDate: string): boolean {
  return p.startDate <= endDate && (p.endDate === null || p.endDate === "" || p.endDate >= startDate);
}

/** True when the APK date falls before the end of the period (already expired included). */
export function apkExpiresBy(apkDate: string | null | undefined, endDate: string): boolean {
  if (!apkDate || !/^\d{4}-\d{2}-\d{2}/.test(apkDate)) return false;
  return apkDate.slice(0, 10) <= endDate;
}

/** Date helpers for rental requests. Dates are YYYY-MM-DD strings; a null end means open-ended. */

const FAR = "9999-12-31";

/** True when the two periods share at least one calendar day (a one-day period counts). */
export function overlaps(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  return aStart <= (bEnd ?? FAR) && (aEnd ?? FAR) >= bStart;
}

export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** How many whole days between two ISO dates (at least 1). */
export function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

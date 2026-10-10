/**
 * Pure helpers of /reports (package P7a). Kept out of the page component so the
 * display rules can be tested without rendering a 2,700-line screen.
 */

export type MonthChange = { kind: "none" } | { kind: "new" } | { kind: "pct"; value: number };

/**
 * Month-over-month change (A-14-8). From nothing to something is not "+100%"
 * (the old code), it is new; nothing to nothing is no change worth showing.
 */
export function monthChange(previous: number, current: number): MonthChange {
  if (!(previous > 0)) return current > 0 ? { kind: "new" } : { kind: "none" };
  return { kind: "pct", value: ((current - previous) / previous) * 100 };
}

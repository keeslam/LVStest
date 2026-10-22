/**
 * Pure helpers of /reports (package P7a). Kept out of the page component so the
 * display rules can be tested without rendering a 2,700-line screen.
 */
import { EXPENSE_CATEGORIES } from "@shared/expense-categories";

export type MonthChange = { kind: "none" } | { kind: "new" } | { kind: "pct"; value: number };

/**
 * Month-over-month change (A-14-8). From nothing to something is not "+100%"
 * (the old code), it is new; nothing to nothing is no change worth showing.
 */
export function monthChange(previous: number, current: number): MonthChange {
  if (!(previous > 0)) return current > 0 ? { kind: "new" } : { kind: "none" };
  return { kind: "pct", value: ((current - previous) / previous) * 100 };
}

/**
 * The key a stored category is grouped and filtered on: lower-cased and trimmed,
 * the client twin of `lower(btrim(category))` on the server (A-14-4). A dump
 * restored before the startup migration may still hold "Fuel" next to "fuel";
 * both are one category here.
 */
export function categoryKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase() || "other";
}

/**
 * The categories that occur in the data, in the order of the owner's list and
 * then any unknown ones alphabetically (A-14-4: the filter used to offer a fixed
 * list, so Tol, Brandstof and Parkeren could not be picked while Voorruit could).
 */
export function presentCategories(rows: ReadonlyArray<{ category: string | null | undefined }>): string[] {
  const present = new Set(rows.map((r) => categoryKey(r.category)));
  const known = (EXPENSE_CATEGORIES as readonly string[]).filter((c) => present.has(c));
  const unknown = [...present].filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c)).sort();
  return [...known, ...unknown];
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * B-65: the expenses the report page asks the server for. The chosen period, widened to
 * cover the three calendar months of the trend card, which does not follow the period
 * (A-14-4). The page used to fetch every expense ever booked.
 */
export function expenseFetchWindow(reportFrom: string | undefined, reportTo: string | undefined, now: Date = new Date()): { from: string; to: string } {
  const trendFrom = isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const trendTo = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return {
    from: reportFrom && reportFrom < trendFrom ? reportFrom : trendFrom,
    to: reportTo && reportTo > trendTo ? reportTo : trendTo,
  };
}

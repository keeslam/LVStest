/**
 * Kosten (2026-10-16): the quick period choices above the Kostenoverzicht.
 * Counted on the office calendar (`officeToday`), as yyyy-MM-dd bounds that
 * go straight into the `from`/`to` filters. Pure, so a test can hand in a day.
 */
import { officeToday } from "./office-date";

export const EXPENSE_PERIODS = ["thisMonth", "lastMonth", "thisYear"] as const;
export type ExpensePeriod = typeof EXPENSE_PERIODS[number];

export interface DateRange { from: string; to: string }

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0, 12)).getUTCDate();

/** Both bounds inclusive, from a `yyyy-MM-dd` "today". */
export function expensePeriodRange(period: ExpensePeriod, today: string = officeToday()): DateRange {
  const [year, month] = today.split("-").map(Number);
  switch (period) {
    case "thisMonth":
      return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDayOf(year, month))}` };
    case "lastMonth": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOf(y, m))}` };
    }
    case "thisYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

/** The quick choice that matches the typed bounds exactly, or null for a hand-picked period. */
export function matchingExpensePeriod(from: string, to: string, today: string = officeToday()): ExpensePeriod | null {
  if (!from || !to) return null;
  return EXPENSE_PERIODS.find((period) => {
    const range = expensePeriodRange(period, today);
    return range.from === from && range.to === to;
  }) ?? null;
}

/**
 * Rapporten fase 2 — what the money reports (fines, extra km, transport) share
 * between server and client: page sizes, limits, the shapes of a summary
 * tile, a page of rows, an export and a breakdown row, and a helper that fills
 * the gaps in a per-month series so a chart shows empty months too.
 */

export const REPORT_PAGE_SIZES = [25, 50, 100, 250] as const;
export const REPORT_EXPORT_LIMIT = 20000;
export const REPORT_BREAKDOWN_LIMIT = 10;
/** `key=__null` on /rows and /export means "the line without a value" (a breakdown row whose key is null). */
export const REPORT_DRILL_NULL_KEY = "__null";

export interface ReportTileTotal {
  count: number;
  amount: number;
}

export interface ReportPage<Row> {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportExport<Row> {
  rows: Row[];
  truncated: boolean;
}

export interface ReportBreakdownRow {
  key: number | string | null;
  label: string | null;
  count: number;
  amount: number;
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * The rows sorted on `month` (`yyyy-MM`), with `empty(month)` added for every
 * month between the first and the last that has no row. Empty input stays empty.
 */
export function fillMonths<T extends { month: string }>(rows: T[], empty: (month: string) => T): T[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const last = sorted[sorted.length - 1].month;
  const out: T[] = [];
  let i = 0;
  for (let month = sorted[0].month; month <= last; month = nextMonth(month)) {
    if (i < sorted.length && sorted[i].month === month) {
      while (i < sorted.length && sorted[i].month === month) out.push(sorted[i++]);
    } else {
      out.push(empty(month));
    }
  }
  return out;
}

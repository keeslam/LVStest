import type { ReportTableColumn, ReportTableView } from "@/components/reports/kit/report-table";
import type { PrintSection } from "@/components/reports/kit/report-print";

/** The text of every row, column by column (the same text as search and CSV). */
export function tableText<R>(columns: ReportTableColumn<R>[], rows: R[]): string[][] {
  return rows.map((r) => columns.map((c) => c.text(r)));
}

/**
 * The table of a report for the print: every row of the filter (in the order and with the
 * search of the table on screen once it has reported its view), the page on screen and,
 * when the report has checkboxes, the ticked rows.
 */
export function tablePrintSection<R>(opts: {
  id: string;
  title?: string;
  columns: ReportTableColumn<R>[];
  rows: R[];
  view: ReportTableView<R> | null;
  selected?: R[];
  totals?: Record<string, string>;
}): PrintSection {
  const { id, title, columns, rows, view, selected, totals } = opts;
  return {
    kind: "table",
    id,
    title,
    header: columns.map((c) => c.label),
    allRows: () => ({ rows: tableText(columns, view?.all ?? rows), truncated: false }),
    pageRows: view ? tableText(columns, view.page) : undefined,
    selectedRows: selected ? tableText(columns, selected) : undefined,
    totals: totals ? columns.map((c) => totals[c.id] ?? "") : undefined,
  };
}

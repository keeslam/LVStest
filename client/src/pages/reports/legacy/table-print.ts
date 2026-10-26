import type { ReportTableColumn, ReportTableView } from "@/components/reports/kit/report-table";
import type { PrintSection } from "@/components/reports/kit/report-print";
import { printRowKeys } from "@/lib/report-document-print";

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
  /** Totals over the page on screen / the ticked rows, printed when those rows are chosen. */
  pageTotals?: Record<string, string>;
  selectedTotals?: Record<string, string>;
  /** A stable key per row for picking rows in the print dialog; defaults to the row's `id`. */
  rowKey?: (r: R) => string | number;
}): PrintSection {
  const { id, title, columns, rows, view, selected, totals, pageTotals, selectedTotals, rowKey } = opts;
  const cells = (t?: Record<string, string>) => (t ? columns.map((c) => t[c.id] ?? "") : undefined);
  const all = view?.all ?? rows;
  return {
    kind: "table",
    id,
    title,
    header: columns.map((c) => c.label),
    columnIds: columns.map((c) => c.id),
    allRows: () => ({ rows: tableText(columns, all), truncated: false, rowKeys: printRowKeys(all, rowKey) }),
    pageRows: view ? tableText(columns, view.page) : undefined,
    selectedRows: selected ? tableText(columns, selected) : undefined,
    selectedRowKeys: selected ? printRowKeys(selected, rowKey) : undefined,
    totals: cells(totals),
    pageTotals: cells(pageTotals),
    selectedTotals: cells(selectedTotals),
  };
}

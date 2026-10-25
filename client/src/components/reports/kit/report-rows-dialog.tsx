/**
 * Rapporten herontwerp deel 1b, Task 2: the rows behind a number of a report that the browser
 * computes itself (the reports in pages/reports/legacy). The report already holds the rows, so
 * this dialog only shows them: a ReportTable (search, sort, pages), CSV of the rows as shown
 * (search and sort applied) and Afdrukken through the print kit.
 *
 * A number can stand for two kinds of rows (a customer's reservations and costs): `more` adds
 * a table under the first one, with its own CSV; the print has every table.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { ReportTable, reportTableCsv, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { ReportPrintDialog, ReportPrintProvider, useReportPrint, type PrintSection } from "@/components/reports/kit/report-print";
import { useReportColumns } from "./use-report-columns";
import { useReportExtraColumns, type ReportLinks } from "./report-extra-columns";

/** One table of the dialog. */
export interface ReportRowsPart<R> {
  title?: string;
  rows: R[];
  columns: ReportTableColumn<R>[];
  rowKey?: (r: R) => string | number;
  /** File name subject of the CSV ("kosten-brandstof"). */
  csvName: string;
  /** Key of the user's Kolommen choice for this table; defaults to the table's test id. */
  columnsId?: string;
  /** The car and customer of a row, for the extra fields of the Kolommen button (keep it stable). */
  links?: ReportLinks<R>;
}

/** A part of any row type, for `more` (keeps the row type checked where the part is made). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyReportRowsPart = ReportRowsPart<any>;
export const rowsPart = <R,>(part: ReportRowsPart<R>): AnyReportRowsPart => part;

/** A file-name subject from a title: "Kosten per categorie · Brandstof" -> "kosten-per-categorie-brandstof". */
export const csvSlug = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "regels";

const idKey = (r: unknown) => (r as { id: string | number }).id;

export function ReportRowsDialog<R>({ open, onOpenChange, title, description, rowsTitle, rows, columns, rowKey, csvName, columnsId, links, more, testId = "report-rows" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Heading of the first table (useful with `more`). */
  rowsTitle?: string;
  rows: R[];
  columns: ReportTableColumn<R>[];
  /** Defaults to the row's `id`. */
  rowKey?: (r: R) => string | number;
  csvName: string;
  /** Kolommen choice key and links of the first table (see ReportRowsPart). */
  columnsId?: string;
  links?: ReportLinks<R>;
  /** More tables under the first one. */
  more?: AnyReportRowsPart[];
  testId?: string;
}) {
  const parts = useMemo<AnyReportRowsPart[]>(
    () => [{ title: rowsTitle, rows, columns, rowKey, csvName, columnsId, links }, ...(more ?? [])],
    [rowsTitle, rows, columns, rowKey, csvName, columnsId, links, more],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col" data-testid={`dialog-${testId}`} {...(description ? {} : { "aria-describedby": undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <ReportPrintProvider>
            <RowsBody title={title} parts={parts} testId={testId} />
          </ReportPrintProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RowsBody({ title, parts, testId }: { title: string; parts: AnyReportRowsPart[]; testId: string }) {
  const { t } = useTranslation("reports");
  const [views, setViews] = useState<Record<number, ReportTableView<unknown>>>({});
  // The columns each table shows after the user's Kolommen choice (print follows them).
  const [chosen, setChosen] = useState<Record<number, ReportTableColumn<unknown>[]>>({});
  const [printOpen, setPrintOpen] = useState(false);
  const setView = useCallback((i: number, view: ReportTableView<unknown>) => setViews((cur) => ({ ...cur, [i]: view })), []);
  const viewSetters = useMemo(() => parts.map((_, i) => (view: ReportTableView<unknown>) => setView(i, view)), [parts, setView]);
  const columnSetters = useMemo(
    () => parts.map((_, i) => (columns: ReportTableColumn<unknown>[]) => setChosen((cur) => (cur[i] === columns ? cur : { ...cur, [i]: columns }))),
    [parts],
  );

  const sections = useMemo<PrintSection[]>(() => parts.map((part, i) => {
    const columns: ReportTableColumn<unknown>[] = chosen[i] ?? part.columns;
    const text = (list: unknown[]) => list.map((r) => columns.map((c) => c.text(r)));
    const view = views[i];
    return {
      kind: "table",
      id: `${testId}${suffix(i)}`,
      title: part.title,
      header: columns.map((c) => c.label),
      allRows: () => ({ rows: text(view?.all ?? part.rows), truncated: false }),
      pageRows: view ? text(view.page) : undefined,
    };
  }), [parts, views, chosen, testId]);
  useReportPrint(sections);

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)} data-testid={`button-${testId}-print`}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />{t("reportKit.print")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-auto">
        {parts.map((part, i) => (
          <RowsPartTable
            key={i}
            part={part}
            index={i}
            testId={testId}
            view={views[i]}
            onView={viewSetters[i]}
            onColumns={columnSetters[i]}
          />
        ))}
      </div>
      <ReportPrintDialog open={printOpen} onOpenChange={setPrintOpen} title={title} />
    </>
  );
}

const suffix = (i: number) => (i === 0 ? "" : `-${i}`);

/** One table of the dialog, with its own Kolommen button and CSV of the chosen columns. */
function RowsPartTable({ part, index, testId, view, onView, onColumns }: {
  part: AnyReportRowsPart;
  index: number;
  testId: string;
  view: ReportTableView<unknown> | undefined;
  onView: (view: ReportTableView<unknown>) => void;
  onColumns: (columns: ReportTableColumn<unknown>[]) => void;
}) {
  const { t } = useTranslation("reports");
  const tableTestId = `${testId}-table${suffix(index)}`;
  const columnsKey = part.columnsId ?? tableTestId;
  const extras = useReportExtraColumns<unknown>(columnsKey, part.links ?? NO_LINKS);
  const { columns, menu } = useReportColumns<ReportTableColumn<unknown>>(columnsKey, part.columns, extras);
  useEffect(() => { onColumns(columns); }, [columns, onColumns]);

  const exportCsv = () => {
    const [header, ...lines] = reportTableCsv(columns, view?.all ?? part.rows);
    downloadCsv(part.csvName, header, lines);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {part.title && <h4 className="text-sm font-medium">{part.title}</h4>}
        <span className="text-sm text-muted-foreground" data-testid={`${testId}-count${suffix(index)}`}>
          {t("reportKit.rowsCount", { count: part.rows.length })}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportCsv}
          disabled={part.rows.length === 0}
          data-testid={`button-${testId}-csv${suffix(index)}`}
        >
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />{t("reportKit.csv")}
        </Button>
      </div>
      <ReportTable
        rows={part.rows}
        columns={columns}
        rowKey={part.rowKey ?? idKey}
        testId={tableTestId}
        onView={onView}
        toolbar={menu}
      />
    </div>
  );
}

const NO_LINKS: ReportLinks<unknown> = {};

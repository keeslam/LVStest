/**
 * Rapporten fase 2: the detail list behind one tile of a money report. The
 * server does the work (mountReport in server/services/report-kit.ts): this
 * dialog asks `<endpoint>/rows` for one sorted page at a time, and CSV and print
 * both fetch every row (up to the export limit) from `<endpoint>/export` with
 * the same filters and sort. Changing the sort or the page size goes back to
 * page 1.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import type { ReportExport, ReportPage } from "@shared/report-kit";
import { REPORT_EXPORT_LIMIT } from "@shared/report-kit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePager } from "@/components/ui/table-pager";
import { SortableHead, nextSort, type SortState } from "@/components/ui/sortable-head";
import { HtmlPreviewDialog } from "@/components/documents/html-preview-dialog";
import { downloadCsv, type Cell } from "@/lib/csv";
import { formatDateNl } from "@/lib/format-date-nl";
import { reportTableHtml } from "@/lib/report-table-print";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface ReportColumn<Row, S extends string> {
  id: string;
  label: string;
  sortKey?: S;
  align?: "right";
  cell: (row: Row) => ReactNode;
  csv: (row: Row) => Cell;
  /** The text in the print; defaults to the CSV value. */
  print?: (row: Row) => string;
}

const printValue = <Row, S extends string>(column: ReportColumn<Row, S>, row: Row): string =>
  column.print ? column.print(row) : String(column.csv(row) ?? "");

export function ReportDetailDialog<Row, S extends string>({
  open, onOpenChange, title, description, endpoint, params, tile, columns, defaultSort, rowKey, csvSubject, reportName, testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  endpoint: string;
  params: Record<string, string>;
  tile: string;
  columns: Array<ReportColumn<Row, S>>;
  defaultSort: SortState<S>;
  rowKey: (row: Row) => string | number;
  csvSubject: string;
  /** Named in the activity log row when printed (`report.print`). */
  reportName: string;
  testId: string;
}) {
  const { t } = useTranslation("reports");
  const { toast } = useToast();
  const [sort, setSort] = useState<SortState<S>>(defaultSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [busy, setBusy] = useState<"csv" | "print" | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  // A parent may keep this dialog mounted and reuse it for another tile: on a
  // new tile, or on opening again, start over with the default sort on page 1.
  // Adjusted during render (not in an effect) so no request goes out with the
  // previous tile's page or sort first.
  const [shownFor, setShownFor] = useState({ tile, open });
  if (shownFor.tile !== tile || shownFor.open !== open) {
    setShownFor({ tile, open });
    if (open) {
      setSort(defaultSort);
      setPage(1);
      setPageSize(50);
    }
  }

  // Keep the previous page on screen only while paging or sorting the same list.
  // For another tile or other filters the old rows and count would sit under the
  // new tile's title (a tile that does not match its list), so show loading instead.
  const listKey = JSON.stringify({ endpoint, params, tile });
  const { data, isLoading, isError, isFetching } = useQuery<ReportPage<Row>>({
    queryKey: [`${endpoint}/rows`, { ...params, tile, sort: sort.key, dir: sort.dir, page, pageSize }],
    meta: { listKey },
    placeholderData: (previous, previousQuery) => (previousQuery?.meta?.listKey === listKey ? previous : undefined),
    enabled: open,
    staleTime: 0,
  });
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const onSort = (key: S) => { setSort(nextSort(sort, key)); setPage(1); };
  const onPageSize = (n: number) => { setPageSize(n); setPage(1); };

  const fetchExport = async (): Promise<ReportExport<Row>> => {
    // The app's request path: timeout, and a 401 logs out like every other query.
    const query = new URLSearchParams({ ...params, tile, sort: sort.key, dir: sort.dir });
    const response = await apiRequest("GET", `${endpoint}/export?${query}`);
    return response.json();
  };

  const truncatedText = () => t("reportKit.exportTruncated", { limit: REPORT_EXPORT_LIMIT.toLocaleString("nl-NL") });

  const exportCsv = async () => {
    setBusy("csv");
    try {
      const result = await fetchExport();
      downloadCsv(csvSubject, columns.map((c) => c.label), result.rows.map((r) => columns.map((c) => c.csv(r))));
      if (result.truncated) toast({ title: truncatedText() });
    } catch {
      toast({ title: t("reportKit.exportFailed"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    setBusy("print");
    try {
      const result = await fetchExport();
      const period = params.from && params.to
        ? t("reportKit.period", { from: formatDateNl(params.from, "medium"), to: formatDateNl(params.to, "medium") })
        : "";
      setPrintHtml(reportTableHtml({
        title,
        subtitle: [description, period].filter(Boolean).join(" · "),
        header: columns.map((c) => c.label),
        rows: result.rows.map((r) => columns.map((c) => printValue(c, r))),
        truncatedNote: result.truncated ? truncatedText() : undefined,
      }));
    } catch {
      toast({ title: t("reportKit.exportFailed"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col" data-testid={`dialog-${testId}`} {...(description ? {} : { "aria-describedby": undefined })}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground" data-testid={`${testId}-count`}>
              {data ? t("reportKit.rowsCount", { count: total }) : ""}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy !== null || total === 0} data-testid={`button-${testId}-csv`}>
                <Download className="mr-1 h-4 w-4" />{t("reportKit.csv")}
              </Button>
              <Button variant="outline" size="sm" onClick={print} disabled={busy !== null || total === 0} data-testid={`button-${testId}-print`}>
                <Printer className="mr-1 h-4 w-4" />{t("reportKit.print")}
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground" data-testid={`${testId}-loading`}>{t("reportKit.loading")}</p>
            ) : isError ? (
              <p className="py-6 text-sm text-destructive" data-testid={`${testId}-error`}>{t("reportKit.loadFailed")}</p>
            ) : total === 0 ? (
              <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.empty")}</p>
            ) : (
              <div className={cn("rounded-md border", isFetching && "opacity-70")}>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      {columns.map((c) => c.sortKey ? (
                        <SortableHead
                          key={c.id}
                          label={c.label}
                          sortKey={c.sortKey}
                          sort={sort}
                          onSort={onSort}
                          testId={`sort-${testId}-${c.sortKey}`}
                          className={c.align === "right" ? "text-right" : undefined}
                        />
                      ) : (
                        <TableHead key={c.id} className={c.align === "right" ? "text-right" : undefined}>{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.rows ?? []).map((row) => (
                      <TableRow key={rowKey(row)} data-testid={`${testId}-row`}>
                        {columns.map((c) => (
                          <TableCell key={c.id} className={c.align === "right" ? "text-right tabular-nums" : undefined}>{c.cell(row)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <TablePager page={page} pageCount={pageCount} pageSize={pageSize} total={total} setPage={setPage} setPageSize={onPageSize} testId={`pager-${testId}`} />
        </DialogContent>
      </Dialog>
      <HtmlPreviewDialog
        open={printHtml !== null}
        onOpenChange={(o) => { if (!o) setPrintHtml(null); }}
        html={printHtml}
        title={title}
        reportName={reportName}
      />
    </>
  );
}

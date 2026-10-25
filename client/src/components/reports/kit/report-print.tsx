/**
 * Rapporten herontwerp deel 1, Task 4: print with an exact preview for every report.
 *
 * A report registers what it can print with `useReportPrint(sections)`; the surrounding
 * ReportPrintProvider (in ReportPane) keeps it. The Afdrukken button opens ReportPrintDialog:
 * options on the left, on the right a preview of the exact HTML document that is printed.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { releaseIframeFocus } from "@/lib/release-iframe-focus";
import { reportClientAction } from "@/lib/audit-events";
import { COMPANY_NAME_KEY, companyNameFromSetting } from "@shared/company-name";
import { isAllDataRange, useReportFilters } from "@/pages/reports/report-filters";
import { reportDocumentHtml, type PrintSection, type ResolvedPrintSection } from "@/lib/report-document-print";

export type { PrintSection } from "@/lib/report-document-print";

interface PrintRegistry {
  register(sections: PrintSection[] | null): void;
  getSections(): PrintSection[] | null;
  available: boolean;
}

const PrintContext = createContext<PrintRegistry | null>(null);

/**
 * Keeps what the report in the pane registered. The sections live in a ref, so a report may pass a
 * new array on every render without causing a render; only "has something to print" is state.
 */
export function ReportPrintProvider({ children }: { children?: ReactNode }) {
  const ref = useRef<PrintSection[] | null>(null);
  const [available, setAvailable] = useState(false);
  const register = useCallback((sections: PrintSection[] | null) => {
    ref.current = sections;
    setAvailable(sections !== null && sections.length > 0);
  }, []);
  const getSections = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ register, getSections, available }), [register, getSections, available]);
  return <PrintContext.Provider value={value}>{children}</PrintContext.Provider>;
}

/** A report says what can be printed; `null` means nothing. Safe with a fresh array on every render. */
export function useReportPrint(sections: PrintSection[] | null): void {
  const ctx = useContext(PrintContext);
  const register = ctx?.register;
  // Every render: the table page and the ticked rows change without the report's data changing.
  useEffect(() => {
    register?.(sections);
  });
  useEffect(() => () => register?.(null), [register]);
}

/** True when the report in the surrounding provider has something to print. */
export function useReportPrintAvailable(): boolean {
  return useContext(PrintContext)?.available ?? false;
}

const dutchDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}-${m}-${y}`;
};

type TableData = { rows: string[][]; truncated: boolean };
type Prepared =
  | { kind: "plain"; part: "tiles" | "note" | "chart"; resolved: ResolvedPrintSection }
  | { kind: "table"; title?: string; header: string[]; all: TableData; page?: string[][]; selected?: string[][]; totals?: string[] };
type RowsChoice = "all" | "page" | "selected";

function PrintBody({ title }: { title: string }) {
  const { t } = useTranslation("reports");
  const ctx = useContext(PrintContext);
  const filters = useReportFilters();
  const queryClient = useQueryClient();
  const frameRef = useRef<HTMLIFrameElement>(null);

  const { data: companySetting } = useQuery<{ value?: unknown } | null>({ queryKey: [`/api/app-settings/key/${COMPANY_NAME_KEY}`] });
  const company = companyNameFromSetting(companySetting?.value);

  const [sections] = useState(() => ctx?.getSections() ?? []);
  const [printedAt] = useState(() => new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }));
  const [prepared, setPrepared] = useState<Prepared[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showTiles, setShowTiles] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [rowsChoice, setRowsChoice] = useState<RowsChoice>("all");
  const [landscape, setLandscape] = useState(false);

  // Resolve what is fetched (a table's rows may come from an export) once, when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      sections.map(async (s): Promise<Prepared | null> => {
        switch (s.kind) {
          case "tiles": return { kind: "plain", part: "tiles", resolved: s };
          case "note": return { kind: "plain", part: "note", resolved: s };
          case "chart": {
            const svg = s.getSvg();
            return svg ? { kind: "plain", part: "chart", resolved: { kind: "chart", title: s.title, svg } } : null;
          }
          case "table": {
            const all = await s.allRows();
            return { kind: "table", title: s.title, header: s.header, all, page: s.pageRows, selected: s.selectedRows, totals: s.totals };
          }
        }
      }),
    ).then(
      (list) => { if (!cancelled) setPrepared(list.filter((x): x is Prepared => x !== null)); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [sections]);

  const hasTiles = sections.some((s) => s.kind === "tiles");
  const hasChart = prepared ? prepared.some((p) => p.kind === "plain" && p.part === "chart") : sections.some((s) => s.kind === "chart");
  const hasTable = sections.some((s) => s.kind === "table");
  const hasPage = sections.some((s) => s.kind === "table" && s.pageRows);
  const hasSelected = sections.some((s) => s.kind === "table" && s.selectedRows && s.selectedRows.length > 0);

  const filterLines = useMemo(() => {
    const lines: string[] = [];
    if (filters.vehicleId !== "all") {
      const vehicles = queryClient.getQueryData<Array<{ id: number; licensePlate?: string }>>(["/api/vehicles"]);
      const plate = vehicles?.find((v) => String(v.id) === filters.vehicleId)?.licensePlate;
      lines.push(t("print.vehicleLine", { vehicle: plate ?? filters.vehicleId }));
    }
    if (filters.category !== "all") lines.push(t("print.categoryLine", { category: filters.category }));
    return lines;
  }, [filters.vehicleId, filters.category, queryClient, t]);

  const html = useMemo(() => {
    if (!prepared) return null;
    const resolved: ResolvedPrintSection[] = [];
    for (const p of prepared) {
      if (p.kind === "plain") {
        if (p.part === "note" || (p.part === "tiles" ? showTiles : showChart)) resolved.push(p.resolved);
      } else if (showTable) {
        const pick = rowsChoice === "page" && p.page ? p.page : rowsChoice === "selected" && p.selected?.length ? p.selected : null;
        resolved.push({
          kind: "table",
          title: p.title,
          header: p.header,
          rows: pick ?? p.all.rows,
          truncated: pick ? false : p.all.truncated,
          totals: p.totals,
        });
      }
    }
    return reportDocumentHtml({
      company,
      title,
      period: isAllDataRange(filters.from, filters.to)
        ? t("reportsPage.common.allData")
        : t("reportsPage.shell.periodLabel", { from: dutchDate(filters.from), to: dutchDate(filters.to) }),
      filters: filterLines,
      sections: resolved,
      landscape,
      printedAt,
      labels: { truncated: t("print.truncated"), printedOn: t("print.printedOn") },
    });
  }, [prepared, showTiles, showChart, showTable, rowsChoice, landscape, company, title, filters.from, filters.to, filterLines, printedAt, t]);

  const handlePrint = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    reportClientAction("report.print", { details: { report: title } });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const check = (id: string, label: string, checked: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} data-testid={id} />
      {label}
    </label>
  );

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("print.options")}</p>
          {hasTiles && check("print-option-tiles", t("print.tiles"), showTiles, setShowTiles)}
          {hasChart && check("print-option-chart", t("print.chart"), showChart, setShowChart)}
          {hasTable && check("print-option-table", t("print.table"), showTable, setShowTable)}
          {hasTable && (
            <select
              className="w-full rounded-md border bg-background p-1.5 text-sm"
              value={rowsChoice}
              onChange={(e) => setRowsChoice(e.target.value as RowsChoice)}
              aria-label={t("print.rows")}
              data-testid="print-option-rows"
            >
              <option value="all">{t("print.rowsAll")}</option>
              {hasPage && <option value="page">{t("print.rowsPage")}</option>}
              {hasSelected && <option value="selected">{t("print.rowsSelected")}</option>}
            </select>
          )}
          {check("print-option-landscape", t("print.landscape"), landscape, setLandscape)}
        </div>
        <div className="min-h-[50vh] overflow-hidden rounded border bg-white">
          {html ? (
            <iframe
              ref={frameRef}
              srcDoc={html}
              sandbox="allow-same-origin allow-modals"
              className="h-full w-full border-0"
              title={title}
              onLoad={(event) => releaseIframeFocus(event.currentTarget)}
              data-testid="print-preview-frame"
            />
          ) : failed ? (
            <p className="p-4 text-sm text-destructive" data-testid="print-failed">{t("print.loadFailed")}</p>
          ) : (
            <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground" data-testid="print-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("print.loading")}
            </div>
          )}
        </div>
      </div>
      <DialogFooter className="flex-shrink-0">
        <Button onClick={handlePrint} disabled={!html} data-testid="button-print-confirm">
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("reportsPage.shell.print")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ReportPrintDialog({ open, onOpenChange, title }: { open: boolean; onOpenChange: (open: boolean) => void; title: string }) {
  const { t } = useTranslation("reports");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[90vw] max-w-6xl flex-col" data-testid="dialog-report-print">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("print.description")}</DialogDescription>
        </DialogHeader>
        {open && <PrintBody title={title} />}
      </DialogContent>
    </Dialog>
  );
}

/** Afdrukken for a spot outside the report pane: brings its own provider and registers `sections`. */
export function ReportPrintButton({ title, sections }: { title: string; sections: PrintSection[] | null }) {
  return (
    <ReportPrintProvider>
      <Registrar sections={sections} />
      <PrintButtonInner title={title} />
    </ReportPrintProvider>
  );
}

function Registrar({ sections }: { sections: PrintSection[] | null }) {
  useReportPrint(sections);
  return null;
}

/** The Afdrukken button of the surrounding provider: shows when the report has something to print. */
export function PrintButtonInner({ title }: { title: string }) {
  const { t } = useTranslation("reports");
  const available = useReportPrintAvailable();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-report-print">
        <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
        {t("reportsPage.shell.print")}
      </Button>
      <ReportPrintDialog open={open} onOpenChange={setOpen} title={title} />
    </>
  );
}

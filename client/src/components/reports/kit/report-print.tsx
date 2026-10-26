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
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { releaseIframeFocus } from "@/lib/release-iframe-focus";
import { reportClientAction } from "@/lib/audit-events";
import { COMPANY_NAME_KEY, companyNameFromSetting } from "@shared/company-name";
import { comparisonRange, isAllDataRange, useReportFilters } from "@/pages/reports/report-filters";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import {
  defaultPrintOptions, mergePrintOptions, prepareTableSection, reportDocumentHtml, resolvePrintSections, rowMatchesSearch,
  type PreparedPrintSection, type PreparedPrintTable, type PrintFontSize, type PrintOptions, type PrintRowsChoice,
  type PrintSection, type PrintTableChoice,
} from "@/lib/report-document-print";

export type { PrintSection } from "@/lib/report-document-print";

/** Filters of the filter bar that do not apply to the report; the print header leaves them out. */
export interface PrintIgnored {
  period?: boolean;
  vehicle?: boolean;
  /** Printed under the title instead of the period when the period does not apply. */
  periodNote?: string;
}

interface PrintRegistry {
  register(sections: PrintSection[] | null): void;
  getSections(): PrintSection[] | null;
  available: boolean;
  ignored?: PrintIgnored;
  /** The print choices per report title, kept while the provider (the report window) lives. */
  remembered: Map<string, PrintOptions>;
}

/** Wait this long after the last change of a choice before the preview is built again. */
const PREVIEW_DELAY_MS = 250;

const PrintContext = createContext<PrintRegistry | null>(null);

/**
 * Keeps what the report in the pane registered. The sections live in a ref, so a report may pass a
 * new array on every render without causing a render; only "has something to print" is state.
 */
export function ReportPrintProvider({ children, ignored, remembered: outerMemory }: { children?: ReactNode; ignored?: PrintIgnored; remembered?: Map<string, PrintOptions> }) {
  const ref = useRef<PrintSection[] | null>(null);
  const [available, setAvailable] = useState(false);
  const register = useCallback((sections: PrintSection[] | null) => {
    ref.current = sections;
    setAvailable(sections !== null && sections.length > 0);
  }, []);
  const getSections = useCallback(() => ref.current, []);
  const [ownMemory] = useState(() => new Map<string, PrintOptions>());
  // A window with tabs gives its own memory, so the choices outlive the provider of a tab that was left.
  const remembered = outerMemory ?? ownMemory;
  const ignoredPeriod = ignored?.period;
  const ignoredVehicle = ignored?.vehicle;
  const periodNote = ignored?.periodNote;
  const value = useMemo(
    () => ({ register, getSections, available, ignored: { period: ignoredPeriod, vehicle: ignoredVehicle, periodNote }, remembered }),
    [register, getSections, available, ignoredPeriod, ignoredVehicle, periodNote, remembered],
  );
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

/** A key per section that stays the same while the report stays the same: a table by its id, the rest by place. */
function sectionKeys(sections: PrintSection[]): string[] {
  const seen = new Set<string>();
  return sections.map((s, i) => {
    let key = s.kind === "table" ? `table-${s.id}` : `${s.kind}-${i}`;
    while (seen.has(key)) key = `${key}-${i}`;
    seen.add(key);
    return key;
  });
}

/** Most rows shown at once in the Zelf kiezen list; the search finds the others. */
const PICK_LIST_LIMIT = 300;

function PrintBody({ title }: { title: string }) {
  const { t } = useTranslation("reports");
  const ctx = useContext(PrintContext);
  const ignored = ctx?.ignored;
  const remembered = ctx?.remembered;
  const filters = useReportFilters();
  const queryClient = useQueryClient();
  const frameRef = useRef<HTMLIFrameElement>(null);

  const { data: companySetting } = useQuery<{ value?: unknown } | null>({ queryKey: [`/api/app-settings/key/${COMPANY_NAME_KEY}`] });
  const company = companyNameFromSetting(companySetting?.value);

  const [sections] = useState(() => ctx?.getSections() ?? []);
  const [printedAt] = useState(() => new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }));
  const [prepared, setPrepared] = useState<PreparedPrintSection[] | null>(null);
  const [options, setOptions] = useState<PrintOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  // The preview is built from the choices as they were a moment ago, so a series of clicks builds it once.
  const [shown, setShown] = useState<PrintOptions | null>(null);
  useEffect(() => {
    if (!options) return;
    if (shown === null) { setShown(options); return; }
    const id = setTimeout(() => setShown(options), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Resolve what is fetched (a table's rows may come from an export) once, when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    const keys = sectionKeys(sections);
    Promise.all(
      sections.map(async (s, i): Promise<PreparedPrintSection | null> => {
        const key = keys[i];
        switch (s.kind) {
          case "tiles": return { key, kind: "tiles", resolved: s };
          case "note": return { key, kind: "note", resolved: s };
          case "chart": {
            const svg = s.getSvg();
            return svg ? { key, kind: "chart", resolved: { kind: "chart", title: s.title, svg } } : null;
          }
          case "table":
            return prepareTableSection(key, s, await s.allRows());
        }
      }),
    ).then(
      (list) => {
        if (cancelled) return;
        const ready = list.filter((x): x is PreparedPrintSection => x !== null);
        setPrepared(ready);
        setOptions(mergePrintOptions(defaultPrintOptions(ready), remembered?.get(title), ready));
      },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [sections, remembered, title]);

  // Keep the choices for this report while the report window is open.
  useEffect(() => {
    if (options) remembered?.set(title, options);
  }, [options, remembered, title]);

  // Only a report whose tiles carry an old number names the comparison period in the header.
  const compared = sections.some((s) => s.kind === "tiles" && s.tiles.some((tile) => tile.previous !== undefined));
  const tables = useMemo(() => (prepared ?? []).filter((p): p is PreparedPrintTable => p.kind === "table"), [prepared]);

  const filterLines = useMemo(() => {
    const lines: string[] = [];
    const range = compared && !ignored?.period ? comparisonRange(filters.from, filters.to, filters.compare) : null;
    if (range) lines.push(t("print.comparedWith", { period: t("reportsPage.shell.periodLabel", { from: dutchDate(range.from), to: dutchDate(range.to) }) }));
    if (filters.vehicleId !== "all" && !ignored?.vehicle) {
      const vehicles = queryClient.getQueryData<Array<{ id: number; licensePlate?: string }>>(["/api/vehicles"]);
      const plate = vehicles?.find((v) => String(v.id) === filters.vehicleId)?.licensePlate;
      lines.push(t("print.vehicleLine", { vehicle: plate ? formatLicensePlate(plate) : filters.vehicleId }));
    }
    if (filters.category !== "all") lines.push(t("print.categoryLine", { category: formatExpenseCategory(filters.category) }));
    return lines;
  }, [compared, filters.from, filters.to, filters.compare, filters.vehicleId, filters.category, ignored?.vehicle, ignored?.period, queryClient, t]);

  const html = useMemo(() => {
    if (!prepared || !shown) return null;
    const options = shown;
    return reportDocumentHtml({
      company,
      title: options.title?.trim() || title,
      period: ignored?.period
        ? (ignored.periodNote ?? "")
        : isAllDataRange(filters.from, filters.to)
          ? t("reportsPage.common.allData")
          : t("reportsPage.shell.periodLabel", { from: dutchDate(filters.from), to: dutchDate(filters.to) }),
      filters: options.showFilters ? filterLines : [],
      sections: resolvePrintSections(prepared, options, { pickedTotal: t("print.pickedTotal") }),
      landscape: options.landscape,
      printedAt,
      note: options.note,
      fontSize: options.fontSize,
      pageBreakEach: options.pageBreakEach,
      labels: { truncated: t("print.truncated"), printedOn: t("print.printedOn") },
    });
  }, [prepared, shown, company, title, filters.from, filters.to, filterLines, ignored?.period, ignored?.periodNote, printedAt, t]);

  const handlePrint = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    reportClientAction("report.print", { details: { report: title } });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const update = (change: (o: PrintOptions) => PrintOptions) => setOptions((o) => (o ? change(o) : o));
  const setTable = (key: string, change: Partial<PrintTableChoice>) =>
    update((o) => ({ ...o, perTable: { ...o.perTable, [key]: { ...o.perTable[key], ...change } } }));
  const move = (key: string, by: -1 | 1) => update((o) => {
    const order = [...o.order];
    const i = order.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return o;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...o, order };
  });

  const check = (id: string, label: string, checked: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} data-testid={id} />
      {label}
    </label>
  );

  // The rows choice for every table at once (the first select, as before); "mixed" when the tables differ.
  const hasPage = tables.some((p) => p.page);
  const hasSelected = tables.some((p) => (p.selected?.length ?? 0) > 0);
  const tableRows = options ? tables.map((p) => options.perTable[p.key]?.rows ?? "all") : [];
  const commonRows = tableRows.length > 0 && tableRows.every((r) => r === tableRows[0]) ? tableRows[0] : "mixed";
  const setAllRows = (rows: PrintRowsChoice) => update((o) => {
    const perTable = { ...o.perTable };
    for (const p of tables) {
      const fits = rows === "page" ? !!p.page : rows === "selected" ? (p.selected?.length ?? 0) > 0 : true;
      perTable[p.key] = { ...perTable[p.key], rows: fits ? rows : "all" };
    }
    return { ...o, perTable };
  });

  // Section check boxes keep their old test ids for the first of a kind (print-option-table, ...).
  const kindCount: Record<string, number> = {};
  const sectionTestId = (kind: string) => {
    kindCount[kind] = (kindCount[kind] ?? 0) + 1;
    return kindCount[kind] === 1 ? `print-option-${kind}` : `print-option-${kind}-${kindCount[kind]}`;
  };
  const sectionLabel = (p: PreparedPrintSection) => {
    switch (p.kind) {
      case "tiles": return t("print.tiles");
      case "chart": return (p.resolved.kind === "chart" && p.resolved.title) || t("print.chart");
      case "note": return t("print.note");
      case "table": return p.title || t("print.table");
    }
  };
  const byKey = new Map((prepared ?? []).map((p) => [p.key, p]));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="print-dialog-body">
      <div className="grid grid-cols-1 gap-4 md:h-full md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3 md:min-h-0 md:overflow-y-auto md:pr-1" data-testid="print-options">
          <p className="text-sm font-medium">{t("print.options")}</p>
          {options && prepared && (
            <>
              <div className="space-y-1" data-testid="print-sections">
                <p className="text-xs font-medium text-muted-foreground">{t("print.sections")}</p>
                {options.order.map((key, index) => {
                  const p = byKey.get(key);
                  if (!p) return null;
                  return (
                    <div key={key} className="rounded border p-1.5">
                      <div className="flex items-center gap-1">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={options.sectionOn[key] !== false}
                            onChange={(e) => update((o) => ({ ...o, sectionOn: { ...o.sectionOn, [key]: e.target.checked } }))}
                            data-testid={sectionTestId(p.kind)}
                          />
                          <span className="truncate">{sectionLabel(p)}</span>
                        </label>
                        <Button
                          type="button" variant="ghost" size="icon" className="h-7 w-7"
                          disabled={index === 0} onClick={() => move(key, -1)}
                          aria-label={t("print.moveUp")} title={t("print.moveUp")} data-testid={`print-move-up-${key}`}
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon" className="h-7 w-7"
                          disabled={index === options.order.length - 1} onClick={() => move(key, 1)}
                          aria-label={t("print.moveDown")} title={t("print.moveDown")} data-testid={`print-move-down-${key}`}
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      {p.kind === "table" && options.perTable[key] && (
                        <TableChoices table={p} choice={options.perTable[key]} onChange={(change) => setTable(key, change)} />
                      )}
                    </div>
                  );
                })}
              </div>
              {tables.length > 0 && (
                <label className="block space-y-1 text-sm">
                  <span>{t("print.rows")}</span>
                  <select
                    className="w-full rounded-md border bg-background p-1.5 text-sm"
                    value={commonRows}
                    onChange={(e) => setAllRows(e.target.value as PrintRowsChoice)}
                    data-testid="print-option-rows"
                  >
                    {commonRows === "mixed" && <option value="mixed" disabled>{t("print.rowsMixed")}</option>}
                    <option value="all">{t("print.rowsAll")}</option>
                    {hasPage && <option value="page">{t("print.rowsPage")}</option>}
                    {hasSelected && <option value="selected">{t("print.rowsSelected")}</option>}
                    <option value="pick">{t("print.rowsPick")}</option>
                  </select>
                </label>
              )}
              {check("print-option-landscape", t("print.landscape"), options.landscape, (v) => update((o) => ({ ...o, landscape: v })))}
              {check("print-option-pagebreak", t("print.pageBreak"), options.pageBreakEach, (v) => update((o) => ({ ...o, pageBreakEach: v })))}
              <div className="rounded border p-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-left text-sm"
                  aria-expanded={layoutOpen}
                  onClick={() => setLayoutOpen((v) => !v)}
                  data-testid="print-layout-toggle"
                >
                  {layoutOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  {t("print.layout")}
                </button>
                {layoutOpen && (
                  <div className="mt-2 space-y-2">
                    <label className="block space-y-1 text-sm">
                      <span>{t("print.customTitle")}</span>
                      <Input value={options.title ?? ""} placeholder={title} onChange={(e) => update((o) => ({ ...o, title: e.target.value }))} data-testid="print-option-title" />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span>{t("print.noteTop")}</span>
                      <Textarea rows={2} value={options.note ?? ""} onChange={(e) => update((o) => ({ ...o, note: e.target.value }))} data-testid="print-option-note" />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span>{t("print.fontSize")}</span>
                      <select
                        className="w-full rounded-md border bg-background p-1.5 text-sm"
                        value={options.fontSize}
                        onChange={(e) => update((o) => ({ ...o, fontSize: e.target.value as PrintFontSize }))}
                        data-testid="print-option-fontsize"
                      >
                        <option value="small">{t("print.fontSmall")}</option>
                        <option value="normal">{t("print.fontNormal")}</option>
                        <option value="large">{t("print.fontLarge")}</option>
                      </select>
                    </label>
                    {check("print-option-filters", t("print.showFilters"), options.showFilters, (v) => update((o) => ({ ...o, showFilters: v })))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div
          className={`w-full overflow-hidden rounded border bg-white md:aspect-auto md:h-full md:min-h-[50vh] ${options?.landscape ? "aspect-[297/210]" : "aspect-[210/297]"}`}
          data-testid="print-preview-box"
        >
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
      </div>
      <DialogFooter className="sticky bottom-0 flex-shrink-0 border-t bg-background pt-3" data-testid="print-dialog-footer">
        <Button onClick={handlePrint} disabled={!html || shown !== options} data-testid="button-print-confirm">
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("reportsPage.shell.print")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The folded "Meer keuzes" block of one table: which rows, which columns and a sort. */
function TableChoices({ table, choice, onChange }: { table: PreparedPrintTable; choice: PrintTableChoice; onChange: (change: Partial<PrintTableChoice>) => void }) {
  const { t } = useTranslation("reports");
  const [open, setOpen] = useState(false);
  // "Zelf kiezen" (also from the select above all tables) shows the pick list right away.
  useEffect(() => { if (choice.rows === "pick") setOpen(true); }, [choice.rows]);
  const key = table.key;
  const chosen = new Set(choice.columns);
  const toggleColumn = (id: string, on: boolean) => onChange({ columns: table.columnIds.filter((c) => (c === id ? on : chosen.has(c))) });
  return (
    <div className="mt-1 pl-5">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`print-more-${key}`}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {t("print.more")}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <label className="block space-y-1 text-sm">
            <span>{t("print.rows")}</span>
            <select
              className="w-full rounded-md border bg-background p-1.5 text-sm"
              value={choice.rows}
              onChange={(e) => onChange({ rows: e.target.value as PrintRowsChoice })}
              data-testid={`print-rows-${key}`}
            >
              <option value="all">{t("print.rowsAll")}</option>
              {table.page && <option value="page">{t("print.rowsPage")}</option>}
              {(table.selected?.length ?? 0) > 0 && <option value="selected">{t("print.rowsSelected")}</option>}
              <option value="pick">{t("print.rowsPick")}</option>
            </select>
          </label>
          {choice.rows === "pick" && <PickList table={table} picked={choice.picked} onPicked={(picked) => onChange({ picked })} />}
          <fieldset className="space-y-1">
            <legend className="text-sm">{t("print.columns")}</legend>
            {table.columnIds.map((id, i) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(id)}
                  disabled={chosen.has(id) && chosen.size === 1}
                  onChange={(e) => toggleColumn(id, e.target.checked)}
                  data-testid={`print-column-${key}-${id}`}
                />
                <span className="truncate">{table.header[i] || "-"}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <span className="text-sm">{t("print.sort")}</span>
            <div className="flex gap-1">
              <select
                className="min-w-0 flex-1 rounded-md border bg-background p-1.5 text-sm"
                value={choice.sort?.col ?? ""}
                onChange={(e) => onChange({ sort: e.target.value ? { col: e.target.value, dir: choice.sort?.dir ?? "asc" } : undefined })}
                aria-label={t("print.sort")}
                data-testid={`print-sort-${key}`}
              >
                <option value="">{t("print.sortNone")}</option>
                {table.columnIds.map((id, i) => <option key={id} value={id}>{table.header[i] || "-"}</option>)}
              </select>
              <select
                className="rounded-md border bg-background p-1.5 text-sm"
                value={choice.sort?.dir ?? "asc"}
                disabled={!choice.sort}
                onChange={(e) => choice.sort && onChange({ sort: { col: choice.sort.col, dir: e.target.value as "asc" | "desc" } })}
                aria-label={t("print.sort")}
                data-testid={`print-sort-dir-${key}`}
              >
                <option value="asc">{t("print.sortAsc")}</option>
                <option value="desc">{t("print.sortDesc")}</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Zelf kiezen: a tick per row (the first columns as its name), a search, Alles aan / Alles uit and a counter. */
function PickList({ table, picked, onPicked }: { table: PreparedPrintTable; picked: string[]; onPicked: (picked: string[]) => void }) {
  const { t } = useTranslation("reports");
  const [query, setQuery] = useState("");
  const key = table.key;
  const set = useMemo(() => new Set(picked), [picked]);
  const matches = useMemo(
    () => table.rows.map((row, i) => ({ row, rowKey: table.rowKeys[i] })).filter(({ row }) => rowMatchesSearch(row, query)),
    [table, query],
  );
  const shown = matches.slice(0, PICK_LIST_LIMIT);
  // Keep the order of the table, whatever the order of ticking.
  const ordered = (next: Set<string>) => table.rowKeys.filter((k) => next.has(k));
  const setMany = (on: boolean) => {
    const next = new Set(set);
    for (const m of matches) { if (on) next.add(m.rowKey); else next.delete(m.rowKey); }
    onPicked(ordered(next));
  };
  const toggle = (rowKey: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(rowKey); else next.delete(rowKey);
    onPicked(ordered(next));
  };
  const nameOf = (row: string[]) => row.slice(0, 3).filter((c) => c && c.trim() !== "").join(" · ") || "-";
  return (
    <div className="space-y-1.5 rounded border p-1.5">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("print.pickSearch")} aria-label={t("print.pickSearch")} className="h-8" data-testid={`print-pick-search-${key}`} />
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setMany(true)} data-testid={`print-pick-all-${key}`}>{t("print.pickAll")}</Button>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setMany(false)} data-testid={`print-pick-none-${key}`}>{t("print.pickNone")}</Button>
        <span className="ml-auto text-xs text-muted-foreground" data-testid={`print-pick-count-${key}`}>
          {t("print.pickCount", { picked: picked.length, total: table.rows.length })}
        </span>
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {shown.map(({ row, rowKey }) => (
          <label key={rowKey} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={set.has(rowKey)} onChange={(e) => toggle(rowKey, e.target.checked)} data-testid={`print-pick-${key}-${rowKey}`} />
            <span className="truncate">{nameOf(row)}</span>
          </label>
        ))}
        {matches.length > shown.length && (
          <p className="text-xs text-muted-foreground">{t("print.pickMore", { count: matches.length - shown.length })}</p>
        )}
      </div>
    </div>
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

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, nextSort, stableSort, type SortState } from "@/components/ui/sortable-head";
import { TablePager } from "@/components/ui/table-pager";

/**
 * De tabel van een rapport: pagina's van 10, zoeken in alle kolommen en sorteren
 * op de kolomkop. `onView` geeft de gefilterde en gesorteerde regels (`all`) en de
 * zichtbare pagina (`page`) door, voor "Alle regels" / "Alleen deze pagina".
 */
export interface ReportTableColumn<R> {
  id: string;
  label: string;
  cell(r: R): ReactNode;
  /** Tekst voor zoeken, CSV en afdruk. */
  text(r: R): string;
  sortValue?(r: R): string | number | null;
  align?: "left" | "right";
}

export interface ReportTableView<R> { all: R[]; page: R[] }

export const REPORT_TABLE_SIZES = [10, 25, 50];

function compareValues(a: string | number | null, b: string | number | null): number {
  if (typeof a === "number" && Number.isNaN(a)) a = null;
  if (typeof b === "number" && Number.isNaN(b)) b = null;
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "nl", { numeric: true, sensitivity: "base" });
}

const NO_SORT: SortState<string> = { key: "", dir: "asc" };

export function ReportTable<R>({ rows, columns, rowKey, searchPlaceholder, defaultSort, totals, testId, resetKey, onView, onRowClick }: {
  rows: R[];
  columns: ReportTableColumn<R>[];
  rowKey: (r: R) => string | number;
  searchPlaceholder?: string;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  /** Totaalregel: tekst per kolom-id. */
  totals?: Record<string, string>;
  testId: string;
  /** Verandert dit (bv. de periode), dan gaat de tabel terug naar pagina 1; de zoekterm blijft. */
  resetKey?: string;
  onView?: (view: ReportTableView<R>) => void;
  /** Makes every row clickable (mouse, Enter or space): opens the rows behind it. */
  onRowClick?: (r: R) => void;
}) {
  const { t } = useTranslation("reports");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<string>>(defaultSort ? { key: defaultSort.id, dir: defaultSort.dir } : NO_SORT);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A plate typed without dashes still matches ("ab123c" finds "AB-123-C"): compare the
    // letters and digits alone as well.
    const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const qBare = bare(q);
    const matches = (text: string) => text.toLowerCase().includes(q) || (qBare !== "" && bare(text).includes(qBare));
    const filtered = q ? rows.filter((r) => columns.some((c) => matches(c.text(r)))) : rows;
    const value = columns.find((c) => c.id === sort.key)?.sortValue;
    if (!value) return filtered;
    return stableSort(filtered, (a, b) => compareValues(value(a), value(b)), sort.dir);
  }, [rows, columns, search, sort]);

  // Own paging: the page only resets on real changes (never on array identity).
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => view.slice((safePage - 1) * pageSize, safePage * pageSize), [view, safePage, pageSize]);
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return; }
    setPage(1);
  }, [resetKey, search, sort.key, sort.dir, pageSize]);

  // Report the view only when its content changed, so a parent may setState in onView.
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const lastSent = useRef<ReportTableView<R> | null>(null);
  useEffect(() => {
    const same = (a: R[], b: R[]) => a.length === b.length && a.every((x, k) => x === b[k]);
    const last = lastSent.current;
    if (last && same(last.all, view) && same(last.page, pageRows)) return;
    lastSent.current = { all: view, page: pageRows };
    onViewRef.current?.(lastSent.current);
  }, [view, pageRows]);

  const alignClass = (c: ReportTableColumn<R>) => (c.align === "right" ? "text-right" : undefined);
  const placeholder = searchPlaceholder ?? t("reportKit.tableSearch");

  return (
    <div className="space-y-2" data-testid={testId}>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 max-w-xs"
        data-testid={`${testId}-search`}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.tableEmpty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => c.sortValue ? (
                  <SortableHead key={c.id} label={c.label} sortKey={c.id} sort={sort} onSort={(k) => setSort((cur) => nextSort(cur, k))} testId={`${testId}-sort-${c.id}`} className={alignClass(c)} />
                ) : (
                  <TableHead key={c.id} className={alignClass(c)}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} className="text-muted-foreground" data-testid={`${testId}-no-match`}>{t("reportTable.noMatches")}</TableCell></TableRow>
              ) : pageRows.map((r) => (
                <TableRow
                  key={rowKey(r)}
                  data-testid={`${testId}-row-${rowKey(r)}`}
                  {...(onRowClick ? {
                    role: "button",
                    tabIndex: 0,
                    className: "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    onClick: () => onRowClick(r),
                    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); }
                    },
                  } : {})}
                >
                  {columns.map((c) => <TableCell key={c.id} className={alignClass(c)}>{c.cell(r)}</TableCell>)}
                </TableRow>
              ))}
              {totals && (
                <TableRow className="font-medium" data-testid={`${testId}-totals`}>
                  {columns.map((c) => <TableCell key={c.id} className={alignClass(c)}>{totals[c.id] ?? ""}</TableCell>)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <TablePager page={safePage} pageCount={pageCount} pageSize={pageSize} total={view.length} setPage={setPage} setPageSize={setPageSize} sizes={REPORT_TABLE_SIZES} testId={testId} />
    </div>
  );
}

/** Kop plus de tekst van elke regel, voor CSV. */
export function reportTableCsv<R>(columns: ReportTableColumn<R>[], rows: R[], totals?: Record<string, string>): string[][] {
  const out = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.text(r)))];
  if (totals) out.push(columns.map((c) => totals[c.id] ?? ""));
  return out;
}

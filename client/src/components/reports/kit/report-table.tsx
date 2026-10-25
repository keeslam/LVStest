import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, nextSort, stableSort, type SortState } from "@/components/ui/sortable-head";
import { TablePager, usePager } from "@/components/ui/table-pager";

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
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "nl", { numeric: true, sensitivity: "base" });
}

const NO_SORT: SortState<string> = { key: "", dir: "asc" };

export function ReportTable<R>({ rows, columns, rowKey, searchPlaceholder, defaultSort, totals, testId, resetKey, onView }: {
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
}) {
  const { t } = useTranslation("reports");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<string>>(defaultSort ? { key: defaultSort.id, dir: defaultSort.dir } : NO_SORT);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => columns.some((c) => c.text(r).toLowerCase().includes(q))) : rows;
    const value = columns.find((c) => c.id === sort.key)?.sortValue;
    if (!value) return filtered;
    return stableSort(filtered, (a, b) => compareValues(value(a), value(b)), sort.dir);
  }, [rows, columns, search, sort]);

  const pager = usePager(view, 10);
  const { setPage } = pager;
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return; }
    setPage(1);
  }, [resetKey, setPage]);

  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  useEffect(() => { onViewRef.current?.({ all: view, page: pager.rows }); }, [view, pager.rows]);

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
              {pager.rows.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} className="text-muted-foreground" data-testid={`${testId}-no-match`}>{t("reportKit.tableEmpty")}</TableCell></TableRow>
              ) : pager.rows.map((r) => (
                <TableRow key={rowKey(r)} data-testid={`${testId}-row-${rowKey(r)}`}>
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
      <TablePager {...pager} sizes={REPORT_TABLE_SIZES} testId={testId} />
    </div>
  );
}

/** Kop plus de tekst van elke regel, voor CSV. */
export function reportTableCsv<R>(columns: ReportTableColumn<R>[], rows: R[]): string[][] {
  return [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.text(r)))];
}

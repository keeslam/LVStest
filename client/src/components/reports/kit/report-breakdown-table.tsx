/**
 * Rapporten fase 2: a short "top N" breakdown of a money report (per customer,
 * per vehicle, ...) with name, count and amount. A row without a label (no
 * customer, no vehicle) shows `nullLabel`. `hideAmount` drops the amount column
 * for a breakdown that has no money (the count is then the only figure).
 */
import { useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ReportBreakdownRow } from "@shared/report-kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format-utils";
import type { PrintSection } from "@/lib/report-document-print";
import { ReportTable, type ReportTableColumn } from "@/components/reports/kit/report-table";
import { cn } from "@/lib/utils";

/** Above this many rows the breakdown is a ReportTable (pages, search, sorting). */
export const BREAKDOWN_TABLE_LIMIT = 10;

/** A breakdown as a print table: every row, no pager. */
export function breakdownPrintSection(opts: {
  id: string;
  title: string;
  rows: ReportBreakdownRow[];
  nullLabel: string;
  money?: boolean;
  hideAmount?: boolean;
  header: { name: string; count: string; amount: string };
}): PrintSection | null {
  const { id, title, rows, nullLabel, money, hideAmount, header } = opts;
  if (rows.length === 0) return null;
  const amount = (n: number) => (money ? formatCurrency(n) : n.toLocaleString("nl-NL"));
  return {
    kind: "table",
    id,
    title,
    header: hideAmount ? [header.name, header.count] : [header.name, header.count, header.amount],
    allRows: () => ({
      rows: rows.map((r) => (hideAmount
        ? [r.label ?? nullLabel, r.count.toLocaleString("nl-NL")]
        : [r.label ?? nullLabel, r.count.toLocaleString("nl-NL"), amount(r.amount)])),
      truncated: false,
    }),
  };
}

/** The column labels of a breakdown print table. */
export function useBreakdownHeader(): { name: string; count: string; amount: string } {
  const { t } = useTranslation("reports");
  return { name: t("reportKit.name"), count: t("reportKit.count"), amount: t("reportKit.amount") };
}

/** A fixed table (already formatted text) as a print table. */
export function textTablePrintSection(id: string, title: string | undefined, header: string[], rows: string[][]): PrintSection | null {
  if (rows.length === 0) return null;
  return { kind: "table", id, title, header, allRows: () => ({ rows, truncated: false }) };
}

/** The print sections of a kit card; null parts (no data) are left out. */
export function compactSections(list: Array<PrintSection | null | false | undefined>): PrintSection[] {
  return list.filter((s): s is PrintSection => !!s);
}

/**
 * A clickable name in a breakdown line: a real button (keyboard, screen reader) with the test id
 * `<testId>-row-<key>` ("null" for the line without a key). Kit cards with their own tables use
 * it too, so every line that opens its rows looks and behaves the same.
 */
export function DrillLineButton({ children, onClick, testId, className }: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** The test id of a breakdown line's button. */
export const drillLineTestId = (testId: string, key: string | number | null) => `${testId}-row-${key ?? "null"}`;

export function ReportBreakdownTable({ title, rows, nullLabel, money, hideAmount, testId, onOpen }: {
  title: string;
  rows: ReportBreakdownRow[];
  nullLabel: string;
  money?: boolean;
  hideAmount?: boolean;
  testId: string;
  /** Makes every line a button that opens the rows behind it. */
  onOpen?: (row: ReportBreakdownRow) => void;
}) {
  const { t } = useTranslation("reports");
  const amount = (n: number) => (money ? formatCurrency(n) : n.toLocaleString("nl-NL"));
  const indexed = useMemo(() => rows.map((row, i) => ({ row, i })), [rows]);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const clickable = !!onOpen;
  const nameOf = (row: ReportBreakdownRow): ReactNode => {
    const name = row.label === null ? <span className="italic text-muted-foreground">{nullLabel}</span> : row.label;
    if (!clickable) return name;
    return <DrillLineButton onClick={() => onOpenRef.current?.(row)} testId={drillLineTestId(testId, row.key)}>{name}</DrillLineButton>;
  };
  const columns = useMemo<ReportTableColumn<{ row: ReportBreakdownRow; i: number }>[]>(() => {
    const cols: ReportTableColumn<{ row: ReportBreakdownRow; i: number }>[] = [
      {
        id: "name", label: t("reportKit.name"),
        cell: ({ row }) => nameOf(row),
        text: ({ row }) => row.label ?? nullLabel,
        sortValue: ({ row }) => row.label ?? nullLabel,
      },
      { id: "count", label: t("reportKit.count"), align: "right", cell: ({ row }) => row.count.toLocaleString("nl-NL"), text: ({ row }) => row.count.toLocaleString("nl-NL"), sortValue: ({ row }) => row.count },
    ];
    if (!hideAmount) {
      cols.push({ id: "amount", label: t("reportKit.amount"), align: "right", cell: ({ row }) => amount(row.amount), text: ({ row }) => amount(row.amount), sortValue: ({ row }) => row.amount });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, nullLabel, money, hideAmount, clickable, testId]);
  if (rows.length > BREAKDOWN_TABLE_LIMIT) {
    return (
      <div className="space-y-2" data-testid={testId}>
        <h4 className="text-sm font-medium">{title}</h4>
        <ReportTable rows={indexed} columns={columns} rowKey={({ row, i }) => `${row.key ?? "null"}-${i}`} testId={`${testId}-table`} />
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid={testId}>
      <h4 className="text-sm font-medium">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reportKit.name")}</TableHead>
                <TableHead className="text-right">{t("reportKit.count")}</TableHead>
                {!hideAmount && <TableHead className="text-right">{t("reportKit.amount")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={`${row.key ?? "null"}-${i}`}
                  data-testid={`${testId}-row`}
                  className={clickable ? "cursor-pointer" : undefined}
                  onClick={clickable ? () => onOpenRef.current?.(row) : undefined}
                >
                  <TableCell className={row.label === null ? "italic text-muted-foreground" : undefined}>{clickable ? nameOf(row) : row.label ?? nullLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count.toLocaleString("nl-NL")}</TableCell>
                  {!hideAmount && <TableCell className="text-right tabular-nums">{amount(row.amount)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

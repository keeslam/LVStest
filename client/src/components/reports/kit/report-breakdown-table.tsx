/**
 * Rapporten fase 2: a short "top N" breakdown of a money report (per customer,
 * per vehicle, ...) with name, count and amount. A row without a label (no
 * customer, no vehicle) shows `nullLabel`. `hideAmount` drops the amount column
 * for a breakdown that has no money (the count is then the only figure).
 */
import { useTranslation } from "react-i18next";
import type { ReportBreakdownRow } from "@shared/report-kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format-utils";

export function ReportBreakdownTable({ title, rows, nullLabel, money, hideAmount, testId }: {
  title: string;
  rows: ReportBreakdownRow[];
  nullLabel: string;
  money?: boolean;
  hideAmount?: boolean;
  testId: string;
}) {
  const { t } = useTranslation("reports");
  const amount = (n: number) => (money ? formatCurrency(n) : n.toLocaleString("nl-NL"));
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
                <TableRow key={`${row.key ?? "null"}-${i}`} data-testid={`${testId}-row`}>
                  <TableCell className={row.label === null ? "italic text-muted-foreground" : undefined}>{row.label ?? nullLabel}</TableCell>
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

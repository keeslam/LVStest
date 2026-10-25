/**
 * Rapporten fase 4: a horizontal bar chart of a top-N list (best customers, most expensive
 * customers, ...). Takes the same rows as ReportBreakdownTable; a row without a label shows
 * `nullLabel`. Bars follow the order of the rows.
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportBreakdownRow } from "@shared/report-kit";
import { formatCurrency } from "@/lib/format-utils";

export interface TopChartPoint {
  name: string;
  amount: number;
  count: number;
}

/** Chart points in the order of the rows; a missing label becomes `nullLabel`. */
export function topChartData(rows: ReportBreakdownRow[], nullLabel: string): TopChartPoint[] {
  return rows.map((row) => ({ name: row.label ?? nullLabel, amount: row.amount, count: row.count }));
}

export function ReportTopChart({ rows, nullLabel, money, color, testId }: {
  rows: ReportBreakdownRow[];
  nullLabel: string;
  money?: boolean;
  color: string;
  testId: string;
}) {
  const { t } = useTranslation("reports");
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>;
  }
  const value = (n: number) => (money ? formatCurrency(n) : Number(n).toLocaleString("nl-NL"));
  const data = topChartData(rows, nullLabel);
  return (
    <div className="w-full" style={{ height: Math.max(160, 32 * data.length) }} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(n: number) => value(n)} allowDecimals={money} />
          <YAxis type="category" dataKey="name" width={120} interval={0} />
          <Tooltip formatter={(n: number) => [value(n), t("reportKit.amount")]} />
          <Bar dataKey="amount" fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

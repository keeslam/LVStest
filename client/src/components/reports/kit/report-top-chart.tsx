/**
 * Rapporten fase 4: a horizontal bar chart of a top-N list (best customers, most expensive
 * customers, ...). Takes the same rows as ReportBreakdownTable; a row without a label shows
 * `nullLabel`. Bars follow the order of the rows. Long names are cut short on the axis (the
 * tooltip shows the full name), the value axis uses compact numbers, and `valueLabel` names
 * the value in the tooltip (default "Bedrag").
 */
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportBreakdownRow } from "@shared/report-kit";
import { formatCurrency } from "@/lib/format-utils";

export interface TopChartPoint {
  name: string;
  amount: number;
  count: number;
}

/** Longest name on the name axis, the "…" included. */
export const TOP_CHART_NAME_MAX = 18;

/** Chart points in the order of the rows; a missing label becomes `nullLabel`. */
export function topChartData(rows: ReportBreakdownRow[], nullLabel: string): TopChartPoint[] {
  return rows.map((row) => ({ name: row.label ?? nullLabel, amount: row.amount, count: row.count }));
}

/** A name for the axis: longer than TOP_CHART_NAME_MAX is cut short with "…". */
export function topChartName(name: string): string {
  return name.length <= TOP_CHART_NAME_MAX ? name : `${name.slice(0, TOP_CHART_NAME_MAX - 1)}…`;
}

const compactMoney = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
const compactCount = new Intl.NumberFormat("nl-NL", { notation: "compact", maximumFractionDigits: 1 });

/** A value-axis tick: short ("€ 12,5K") so ticks do not crowd on a narrow card. */
export function topChartTick(n: number, money: boolean): string {
  return (money ? compactMoney : compactCount).format(n);
}

/** The tooltip line: the full value and its label. */
export function topChartTooltip(n: number, money: boolean, label: string): [string, string] {
  return [money ? formatCurrency(n) : Number(n).toLocaleString("nl-NL"), label];
}

export function ReportTopChart({ rows, nullLabel, money, valueLabel, color, testId, chartRef }: {
  rows: ReportBreakdownRow[];
  nullLabel: string;
  money?: boolean;
  /** What the value is called in the tooltip ("Kosten", "Omzet"); default "Bedrag". */
  valueLabel?: string;
  color: string;
  testId: string;
  /** Wrapper of the drawn chart; a report reads its svg for the print (chartSvgFromRef). */
  chartRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation("reports");
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>;
  }
  const label = valueLabel ?? t("reportKit.amount");
  const data = topChartData(rows, nullLabel);
  return (
    <div ref={chartRef} className="w-full" style={{ height: Math.max(160, 32 * data.length) }} data-testid={testId} data-value-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(n: number) => topChartTick(n, !!money)} allowDecimals={money} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={130} interval={0} tickFormatter={topChartName} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(n: number) => topChartTooltip(n, !!money, label)} />
          <Bar dataKey="amount" fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

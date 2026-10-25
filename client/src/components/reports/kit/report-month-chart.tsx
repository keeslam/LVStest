/**
 * Rapporten fase 2: a bar chart per month (`yyyy-MM`) for a money report, one
 * bar per series, side by side or stacked. Fill empty months first with
 * `fillMonths` from @shared/report-kit so the axis has no gaps.
 */
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";

export interface ReportMonthSeries<K extends string = string> {
  key: K;
  label: string;
  color: string;
}

const monthLabel = (month: string) => formatDateNl(`${month}-01T12:00:00`, "MMM yyyy");

/** A clicked bar: its month (`yyyy-MM`) and the series it belongs to. */
export interface ReportMonthPoint<K extends string = string> {
  month: string;
  series: K;
}

/** recharts calls a Bar onClick with the drawn rectangle; its payload is the month row. */
export function monthPointFromBar<K extends string>(entry: unknown, series: K): ReportMonthPoint<K> | null {
  const month = (entry as { payload?: { month?: unknown } } | null)?.payload?.month;
  return typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? { month, series } : null;
}

const monthNumber = (month: string) => { const [y, m] = month.split("-").map(Number); return y * 12 + (m - 1); };
const monthText = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

/** The key of the lighter comparison bar of a series. */
export const previousKey = (key: string) => `prev_${key}`;

/**
 * Puts the comparison period's months next to the months of the period: a comparison month moves
 * by the months between the two end dates (12 for last year, the period length in months for the
 * previous period), and only months inside the period stay. Missing values are 0.
 */
export function mergePreviousMonths<T extends { month: string }>(
  data: T[], previousData: T[], keys: string[], period: { from: string; to: string }, compareRange: { from: string; to: string },
): Array<Record<string, number | string>> {
  const shift = monthNumber(period.to.slice(0, 7)) - monthNumber(compareRange.to.slice(0, 7));
  const first = monthNumber(period.from.slice(0, 7));
  const last = monthNumber(period.to.slice(0, 7));
  const rows = new Map<string, Record<string, number | string>>();
  const row = (month: string) => {
    let r = rows.get(month);
    if (!r) {
      r = { month };
      for (const key of keys) { r[key] = 0; r[previousKey(key)] = 0; }
      rows.set(month, r);
    }
    return r;
  };
  for (const d of data) Object.assign(row(d.month), d);
  for (const d of previousData) {
    const n = monthNumber(d.month) + shift;
    if (n < first || n > last) continue;
    const r = row(monthText(n));
    for (const key of keys) r[previousKey(key)] = Number((d as Record<string, unknown>)[key] ?? 0);
  }
  return [...rows.values()].sort((a, b) => (String(a.month) < String(b.month) ? -1 : 1));
}

/** Generic over the month row, so a series key must be one of its fields (no cast in the cards). */
export function ReportMonthChart<T extends { month: string }>({ data, series, money, stacked, testId, chartRef, onPointClick, previousData, period, compareRange }: {
  data: T[];
  series: Array<ReportMonthSeries<Exclude<Extract<keyof T, string>, "month">>>;
  money?: boolean;
  stacked?: boolean;
  testId: string;
  /** Wrapper of the drawn chart; a report reads its svg for the print (chartSvgFromRef). */
  chartRef?: Ref<HTMLDivElement>;
  /** Makes every bar clickable: the rows of that month (and series). */
  onPointClick?: (point: ReportMonthPoint<Exclude<Extract<keyof T, string>, "month">>) => void;
  /** The months of the comparison period, drawn as a lighter series (needs period and compareRange). */
  previousData?: T[];
  period?: { from?: string; to?: string };
  compareRange?: { from: string; to: string } | null;
}) {
  const { t } = useTranslation("reports");
  const compared = previousData && period?.from && period.to && compareRange
    ? mergePreviousMonths(data, previousData, series.map((s) => s.key), { from: period.from, to: period.to }, compareRange)
    : null;
  const rows: unknown[] = compared ?? data;
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>;
  }
  const value = (n: number) => (money ? formatCurrency(n) : Number(n).toLocaleString("nl-NL"));
  return (
    <div ref={chartRef} className={onPointClick ? "h-72 w-full [&_.recharts-bar-rectangle]:cursor-pointer" : "h-72 w-full"} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={monthLabel} />
          <YAxis tickFormatter={(n: number) => value(n)} allowDecimals={money} width={money ? 90 : 50} />
          <Tooltip labelFormatter={(m) => monthLabel(String(m))} formatter={(n: number, name: string) => [value(n), name]} />
          <Legend />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "stack" : undefined}
              onClick={onPointClick ? (entry: unknown) => { const point = monthPointFromBar(entry, s.key); if (point) onPointClick(point); } : undefined}
            />
          ))}
          {compared && series.map((s) => (
            <Bar
              key={previousKey(s.key)}
              dataKey={previousKey(s.key)}
              name={t("reportKit.compare.previousSeries", { label: s.label })}
              fill={s.color}
              fillOpacity={0.35}
              stackId={stacked ? "previous" : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

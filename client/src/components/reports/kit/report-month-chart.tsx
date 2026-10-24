/**
 * Rapporten fase 2: a bar chart per month (`yyyy-MM`) for a money report, one
 * bar per series, side by side or stacked. Fill empty months first with
 * `fillMonths` from @shared/report-kit so the axis has no gaps.
 */
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

/** Generic over the month row, so a series key must be one of its fields (no cast in the cards). */
export function ReportMonthChart<T extends { month: string }>({ data, series, money, stacked, testId }: {
  data: T[];
  series: Array<ReportMonthSeries<Exclude<Extract<keyof T, string>, "month">>>;
  money?: boolean;
  stacked?: boolean;
  testId: string;
}) {
  const { t } = useTranslation("reports");
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>;
  }
  const value = (n: number) => (money ? formatCurrency(n) : Number(n).toLocaleString("nl-NL"));
  return (
    <div className="h-72 w-full" data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={monthLabel} />
          <YAxis tickFormatter={(n: number) => value(n)} allowDecimals={money} width={money ? 90 : 50} />
          <Tooltip labelFormatter={(m) => monthLabel(String(m))} formatter={(n: number, name: string) => [value(n), name]} />
          <Legend />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "stack" : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

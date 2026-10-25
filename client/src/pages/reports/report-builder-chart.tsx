/**
 * Report builder (phase 6): a chart above the results table of a grouped report.
 * One bar or line per column with a calculation; a pie shows the first one.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportColumn, ReportGrouping } from "@shared/report-builder-config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aggregationLabel, calcDisplayNumber, columnLabel, displayCell, isPercentColumn, resultKey } from "@/pages/reports/report-builder-output";

export type BuilderChartType = "bar" | "line" | "pie";

export const BUILDER_CHART_MAX_GROUPS = 50;
export const BUILDER_PIE_MAX_SLICES = 10;
export const BUILDER_CHART_COLORS = ["#3b82f6", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0ea5e9", "#9ca3af"];

export interface BuilderChartData {
  points: Array<{ __cat: string } & Record<string, number | string>>;
  series: Array<{ key: string; label: string }>;
  truncated: boolean;
}

/** The category lives under a reserved key: a series may sit on a field that is itself called name. */
const CATEGORY = "__cat";

/** The chart data of a grouped result; null when the result was not grouped. */
export function builderChartData(
  t: TFunction,
  rows: Record<string, unknown>[],
  columns: ReportColumn[],
  groupBy: ReportGrouping[],
): BuilderChartData | null {
  if (groupBy.length === 0) return null;
  const groupColumns = groupBy.map((g) => columns.find((c) => c.table === g.table && c.field === g.field && (c.via ?? "") === (g.via ?? "") && (c.calc ?? "") === (g.calc ?? "") && !c.aggregation)
    ?? { table: g.table, field: g.field, via: g.via, calc: g.calc, label: g.field });
  const calcColumns = columns.filter((c) => !!c.aggregation);
  // A linked column is "vehicle.x" in the rows, a calculated one "calc.x"; the chart key has no dot (a dot reads as a path).
  const series = calcColumns
    .map((c) => ({
      key: resultKey(c).replace(/\./g, "__"),
      label: `${columnLabel(t, c)} (${aggregationLabel(t, c.aggregation!)})${isPercentColumn(c) ? " (%)" : ""}`,
    }));
  const points = rows.slice(0, BUILDER_CHART_MAX_GROUPS).map((row) => {
    const point: { __cat: string } & Record<string, number | string> = {
      [CATEGORY]: groupColumns.map((c) => displayCell(t, c, row[resultKey(c)])).join(" · "),
    };
    for (const [i, s] of series.entries()) {
      const col = calcColumns[i];
      const n = Number(row[resultKey(col)]);
      // A percent is drawn as the percentage (0.25 -> 25), like its cell shows it.
      point[s.key] = Number.isFinite(n) ? (isPercentColumn(col) ? calcDisplayNumber("percent", n) : n) : 0;
    }
    return point;
  });
  return { points, series, truncated: rows.length > BUILDER_CHART_MAX_GROUPS };
}

/** Pie slices: only positive values, the ten largest, the rest as one "other" slice. */
export function pieSlices(points: BuilderChartData["points"], key: string, otherLabel: string): Array<{ name: string; value: number }> {
  const positive = points
    .map((p) => ({ name: p.__cat, value: Number(p[key]) }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = positive.slice(0, BUILDER_PIE_MAX_SLICES);
  const rest = positive.slice(BUILDER_PIE_MAX_SLICES).reduce((sum, p) => sum + p.value, 0);
  return rest > 0 ? [...top, { name: otherLabel, value: rest }] : top;
}

const color = (i: number) => BUILDER_CHART_COLORS[i % BUILDER_CHART_COLORS.length];
const valueText = (n: number) => Number(n).toLocaleString("nl-NL");

export function ReportBuilderChart({ rows, columns, groupBy }: {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  groupBy: ReportGrouping[];
}) {
  const { t } = useTranslation("reports");
  const [type, setType] = useState<BuilderChartType>("bar");
  const data = useMemo(() => builderChartData(t as TFunction, rows, columns, groupBy), [t, rows, columns, groupBy]);
  if (!data) return null;

  if (data.series.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground" data-testid="report-builder-chart-needs-aggregate">
        {t("reportBuilderPage.chart.needsAggregate")}
      </p>
    );
  }

  const first = data.series[0];
  const slices = type === "pie" ? pieSlices(data.points, first.key, t("reportBuilderPage.chart.other")) : [];
  return (
    <div className="space-y-2" data-testid="report-builder-chart" data-chart-type={type}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("reportBuilderPage.chart.title")}</h3>
        <Select value={type} onValueChange={(v) => setType(v as BuilderChartType)}>
          <SelectTrigger className="w-36" aria-label={t("reportBuilderPage.chart.type")} data-testid="select-report-chart-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bar">{t("reportBuilderPage.chart.bar")}</SelectItem>
            <SelectItem value="line">{t("reportBuilderPage.chart.line")}</SelectItem>
            <SelectItem value="pie">{t("reportBuilderPage.chart.pie")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.truncated && (
        <p className="text-xs text-muted-foreground" data-testid="report-builder-chart-truncated">
          {t("reportBuilderPage.chart.firstGroups", { count: BUILDER_CHART_MAX_GROUPS })}
        </p>
      )}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" ? (
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" outerRadius="75%" label>
                {slices.map((_, i) => <Cell key={i} fill={color(i)} />)}
              </Pie>
              <Tooltip formatter={(n: number) => valueText(n)} />
              <Legend />
            </PieChart>
          ) : type === "line" ? (
            <LineChart data={data.points} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={CATEGORY} />
              <YAxis tickFormatter={valueText} width={60} />
              <Tooltip formatter={(n: number, name: string) => [valueText(n), name]} />
              <Legend />
              {data.series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(i)} />)}
            </LineChart>
          ) : (
            <BarChart data={data.points} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={CATEGORY} />
              <YAxis tickFormatter={valueText} width={60} />
              <Tooltip formatter={(n: number, name: string) => [valueText(n), name]} />
              <Legend />
              {data.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

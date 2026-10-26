/**
 * Onderhoudsanalyse: one chart with two small choices above it — "Wat" (Bedrag, Per auto per maand,
 * Per km for an admin, Aantal: only the measures the data has) and "Hoe" (Staaf, Lijn, Taart).
 * A pie labels every slice with its name and share; a click on a bar, point or slice opens the
 * cost lines behind it (`onPointClick` gets the point's key).
 */
import { useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countText, useMoneyText } from "./analysis-context";

export type AnalysisMetric = "amount" | "perVehicleMonth" | "perKm" | "count";
export type AnalysisChartKind = "bar" | "line" | "pie";

export interface AnalysisChartPoint {
  key: string;
  label: string;
  values: Partial<Record<AnalysisMetric, number | null>>;
}

export const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/** The text on a pie slice: "Onderhoud 60%". */
export function pieLabel(label: string, percent: number | undefined): string {
  return `${label} ${Math.round((percent ?? 0) * 100)}%`;
}

/** Under a bar chart every name is shown (interval 0), slanted and shortened; the tooltip has the full name. */
export const LABEL_AXIS = { interval: 0, angle: -35, textAnchor: "end" as const, height: 70, tick: { fontSize: 12 } };
export function shortLabel(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

/** A metric sums up to a whole only for amount and count: a pie of averages says nothing. */
const PIE_METRICS: AnalysisMetric[] = ["amount", "count"];

export function AnalysisChart({ points, metrics, kinds, defaultKind, testId, chartRef, onPointClick }: {
  points: AnalysisChartPoint[];
  metrics: AnalysisMetric[];
  kinds: AnalysisChartKind[];
  defaultKind: AnalysisChartKind;
  testId: string;
  chartRef?: Ref<HTMLDivElement>;
  onPointClick?: (key: string) => void;
}) {
  const { t } = useTranslation("reports");
  const money = useMoneyText();
  const [metric, setMetric] = useState<AnalysisMetric>(metrics[0]);
  const [chosenKind, setKind] = useState<AnalysisChartKind>(defaultKind);
  const shownMetric = metrics.includes(metric) ? metric : metrics[0];
  // A pie only for a measure that adds up; otherwise the chart falls back to bars.
  const kindOptions = kinds.filter((k) => k !== "pie" || PIE_METRICS.includes(shownMetric));
  const kind = kindOptions.includes(chosenKind) ? chosenKind : kindOptions[0];

  const format = (n: number) => (shownMetric === "count" ? countText(n) : money(n, shownMetric === "perKm"));
  const data = points
    .map((p) => ({ key: p.key, label: p.label, value: p.values[shownMetric] ?? null }))
    .filter((p) => kind !== "pie" || (p.value ?? 0) > 0)
    .map((p) => ({ ...p, value: p.value ?? 0 }));
  const click = (index: number | undefined) => {
    if (index === undefined || !onPointClick) return;
    const point = data[index];
    if (point) onPointClick(point.key);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {metrics.length > 1 && (
          <Select value={shownMetric} onValueChange={(v) => setMetric(v as AnalysisMetric)}>
            <SelectTrigger className="h-8 w-48" aria-label={t("maintenanceAnalysis.chart.metric")} data-testid={`${testId}-metric`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((m) => <SelectItem key={m} value={m}>{t(`maintenanceAnalysis.chart.metrics.${m}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {kindOptions.length > 1 && (
          <Select value={kind} onValueChange={(v) => setKind(v as AnalysisChartKind)}>
            <SelectTrigger className="h-8 w-32" aria-label={t("maintenanceAnalysis.chart.kind")} data-testid={`${testId}-kind`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindOptions.map((k) => <SelectItem key={k} value={k}>{t(`maintenanceAnalysis.chart.kinds.${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t("reportKit.noData")}</p>
      ) : (
        <div ref={chartRef} className={onPointClick ? "h-72 w-full [&_.recharts-bar-rectangle]:cursor-pointer [&_.recharts-pie-sector]:cursor-pointer" : "h-72 w-full"} data-testid={testId} data-chart-kind={kind} data-chart-metric={shownMetric}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === "pie" ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(p: { payload?: { label?: string }; percent?: number }) => pieLabel(p.payload?.label ?? "", p.percent)}
                  onClick={(_entry: unknown, index: number) => click(index)}
                  isAnimationActive={false}
                >
                  {data.map((d, i) => <Cell key={d.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(n: number) => format(n)} />
              </PieChart>
            ) : kind === "line" ? (
              <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} onClick={(s: { activeTooltipIndex?: number } | null) => click(s?.activeTooltipIndex)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" {...LABEL_AXIS} tickFormatter={(l: string) => shortLabel(String(l))} />
                <YAxis tickFormatter={(n: number) => format(n)} width={90} />
                <Tooltip formatter={(n: number) => [format(n), t(`maintenanceAnalysis.chart.metrics.${shownMetric}`)]} />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" {...LABEL_AXIS} tickFormatter={(l: string) => shortLabel(String(l))} />
                <YAxis tickFormatter={(n: number) => format(n)} width={90} />
                <Tooltip formatter={(n: number) => [format(n), t(`maintenanceAnalysis.chart.metrics.${shownMetric}`)]} />
                <Bar dataKey="value" fill={CHART_COLORS[0]} onClick={(_entry: unknown, index: number) => click(index)} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

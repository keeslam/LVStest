/**
 * Onderhoudsanalyse, tab Trends: costs per month as a line, with Vergelijk met a second (lighter)
 * line for the comparison period, and for an admin the forecast of the next three months as a
 * dashed line plus the forecast per car (3 months × km per day × cost per km of type + km band).
 * A month opens its cost lines.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FORECAST_MONTHS, type MaintenanceTrends } from "@shared/maintenance-analysis";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { EntityLink } from "@/components/reports/entity-link";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, noRows, typeText, useAnalysis, useComparedAnalysisParams, useMoneyText } from "./analysis-context";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";
import { CHART_COLORS } from "./analysis-chart";

export interface MonthRow { month: string; amount?: number; previous?: number; forecast?: number }
type ForecastMonth = NonNullable<MaintenanceTrends["forecast"]>[number];
type ForecastVehicle = NonNullable<MaintenanceTrends["forecastVehicles"]>[number];

export const monthLabel = (month: string) => formatDateNl(`${month}-01T12:00:00`, "MMM yyyy");
/** The forecast line's dashes. */
export const FORECAST_DASH = "6 4";

/**
 * The chart's own rows: the dashed forecast starts on the last real month (at its amount), so the two
 * lines join. The table keeps the plain rows, where that month has no forecast.
 */
export function chartRowsOf(rows: MonthRow[]): MonthRow[] {
  const lastActual = rows.reduce((at, r, i) => (r.amount !== undefined ? i : at), -1);
  if (lastActual < 0 || !rows.some((r) => r.forecast !== undefined)) return rows;
  return rows.map((r, i) => (i === lastActual ? { ...r, forecast: r.amount } : r));
}

export function TrendsTab() {
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.${key}`, opts);
  const { params } = useComparedAnalysisParams();
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<MonthRow> | null>(null);
  const [forecastView, setForecastView] = useState<ReportTableView<ForecastVehicle> | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceTrends>({ queryKey: [`${ANALYSIS_ENDPOINT}/trends`, params] });

  const hasPrevious = !!data?.months.some((m) => m.previous !== undefined);
  // Never a fresh [] per render: rows depends on it, and a new rows array loops through onView.
  const forecast = useMemo(() => (isAdmin && data?.forecast ? data.forecast : noRows<ForecastMonth>()), [isAdmin, data]);
  const rows = useMemo<MonthRow[]>(() => {
    const out: MonthRow[] = (data?.months ?? noRows<MaintenanceTrends["months"][number]>()).map((m) => ({ month: m.month, amount: m.amount, ...(m.previous !== undefined ? { previous: m.previous } : {}) }));
    for (const f of forecast) {
      const existing = out.find((r) => r.month === f.month);
      if (existing) existing.forecast = f.amount;
      else out.push({ month: f.month, forecast: f.amount });
    }
    return out.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }, [data, forecast]);
  const chartRows = useMemo(() => chartRowsOf(rows), [rows]);
  const forecastVehicles = useMemo(() => (isAdmin && data?.forecastVehicles ? data.forecastVehicles : noRows<ForecastVehicle>()), [isAdmin, data]);

  const columns = useMemo<ReportTableColumn<MonthRow>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const amount = (n: number | undefined) => (n === undefined ? "" : money(n));
    const list: ReportTableColumn<MonthRow>[] = [
      { id: "month", label: c("month"), cell: (r) => monthLabel(r.month), text: (r) => monthLabel(r.month), sortValue: (r) => r.month },
      { id: "amount", label: c("amount"), cell: (r) => amount(r.amount), text: (r) => amount(r.amount), sortValue: (r) => r.amount ?? null, align: "right" },
    ];
    if (hasPrevious) list.push({ id: "previous", label: t("maintenanceAnalysis.trends.previous"), cell: (r) => amount(r.previous), text: (r) => amount(r.previous), sortValue: (r) => r.previous ?? null, align: "right" });
    if (forecast.length > 0) list.push({ id: "forecast", label: t("maintenanceAnalysis.trends.forecast"), cell: (r) => amount(r.forecast), text: (r) => amount(r.forecast), sortValue: (r) => r.forecast ?? null, align: "right" });
    return list;
  }, [t, money, hasPrevious, forecast.length]);

  const forecastColumns = useMemo<ReportTableColumn<ForecastVehicle>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: ForecastVehicle) => formatLicensePlate(r.licensePlate);
    const type = (r: ForecastVehicle) => typeText(t, r.brand, r.model);
    const kmDay = (r: ForecastVehicle) => r.kmPerDay.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
    return [
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.licensePlate },
      { id: "brand", label: c("brand"), cell: (r) => brandText(t, r.brand), text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "kmBand", label: c("kmBand"), cell: (r) => r.band, text: (r) => r.band, sortValue: (r) => r.band },
      { id: "kmPerDay", label: c("kmPerDay"), cell: kmDay, text: kmDay, sortValue: (r) => r.kmPerDay, align: "right" },
      { id: "perKm", label: c("perKm"), cell: (r) => money(r.perKm, true), text: (r) => money(r.perKm, true), sortValue: (r) => r.perKm, align: "right" },
      { id: "forecast", label: t("maintenanceAnalysis.trends.forecastAmount", { months: FORECAST_MONTHS }), cell: (r) => money(r.amount), text: (r) => money(r.amount), sortValue: (r) => r.amount, align: "right" },
    ];
  }, [t, money]);

  useReportPrint(data ? compactSections([
    { kind: "chart", title: k("trends.chartTitle"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "ma-trends", title: k("trends.chartTitle"), columns, rows, view }),
    forecastVehicles.length > 0 ? tablePrintSection({ id: "ma-forecast", title: k("trends.forecastTitle"), columns: forecastColumns, rows: forecastVehicles, view: forecastView }) : null,
  ]) : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  const openMonth = (row: MonthRow | undefined) => {
    if (!row || row.amount === undefined) return;
    drill({ title: `${k("rows.title")} · ${monthLabel(row.month)}`, drill: "month", key: row.month });
  };

  return (
    <div className="space-y-4">
      <AnalysisPanel title={k("trends.chartTitle")} description={forecast.length > 0 ? k("trends.forecastHint") : k("overview.clickHint")}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("reportKit.noData")}</p>
        ) : (
          <div ref={chartRef} className="h-72 w-full" data-testid="ma-trends-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                onClick={(s: { activeTooltipIndex?: number } | null) => openMonth(s?.activeTooltipIndex === undefined ? undefined : rows[s.activeTooltipIndex])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(n: number) => money(n)} width={90} />
                <Tooltip labelFormatter={(m) => monthLabel(String(m))} formatter={(n: number, name: string) => [money(n), name]} />
                <Legend />
                <Line type="monotone" dataKey="amount" name={t("maintenanceAnalysis.columns.amount")} stroke={CHART_COLORS[0]} strokeWidth={2} isAnimationActive={false} />
                {hasPrevious && (
                  <Line type="monotone" dataKey="previous" name={t("maintenanceAnalysis.trends.previous")} stroke={CHART_COLORS[0]} strokeOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
                )}
                {forecast.length > 0 && (
                  <Line type="monotone" dataKey="forecast" name={t("maintenanceAnalysis.trends.forecast")} stroke={CHART_COLORS[2]} strokeWidth={2} strokeDasharray={FORECAST_DASH} isAnimationActive={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <ReportTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.month}
          defaultSort={{ id: "month", dir: "asc" }}
          testId="ma-trends-table"
          onView={setView}
          toolbar={<AnalysisCsvButton columns={columns} rows={rows} view={view} name="onderhoud-trends" testId="button-ma-trends-csv" />}
          onRowClick={(r) => openMonth(r)}
        />
      </AnalysisPanel>
      {forecastVehicles.length > 0 && (
        <AnalysisPanel title={k("trends.forecastTitle")} description={k("trends.forecastDesc", { months: FORECAST_MONTHS })}>
          <ReportTable
            rows={forecastVehicles}
            columns={forecastColumns}
            rowKey={(r) => r.vehicleId}
            defaultSort={{ id: "forecast", dir: "desc" }}
            testId="ma-forecast-table"
            onView={setForecastView}
            toolbar={<AnalysisCsvButton columns={forecastColumns} rows={forecastVehicles} view={forecastView} name="onderhoud-verwachting" testId="button-ma-forecast-csv" />}
          />
        </AnalysisPanel>
      )}
    </div>
  );
}

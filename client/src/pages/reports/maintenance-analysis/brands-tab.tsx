/**
 * Onderhoudsanalyse, tab Merken en typen: a chart per brand (Wat/Hoe), the brands table with the
 * rating (only with enough lines and cars, as before), a click on a brand shows its types, and for
 * an admin the cost per km per km band (brands, or the types of the chosen brand). A bar, a type or
 * a km-band cell opens the cost lines behind it.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  KM_BAND_KEYS, RATING_GOOD_FACTOR,
  type KmBand, type MaintenanceBrands, type MaintenanceGroupLine, type MaintenanceKmBandLine, type MaintenanceOverview,
} from "@shared/maintenance-analysis";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { compactSections, DrillLineButton } from "@/components/reports/kit/report-breakdown-table";
import { useReportPrint, type PrintSection } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, countText, useAnalysis, useAnalysisParams, useComparedAnalysisParams, useMoneyText } from "./analysis-context";
import { AnalysisChart, type AnalysisMetric } from "./analysis-chart";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

type BrandLine = MaintenanceBrands["brands"][number];
type ModelLine = MaintenanceBrands["models"][number];
type Rating = "excellent" | "good" | "average" | "insufficient";

/** The rating of a group against the average per car per month of the whole selection. */
export function ratingOf(line: MaintenanceGroupLine, overall: number | null | undefined): Rating {
  if (!line.rated || line.perVehicleMonth == null || overall == null || overall <= 0) return "insufficient";
  if (line.perVehicleMonth < overall) return "excellent";
  if (line.perVehicleMonth < overall * RATING_GOOD_FACTOR) return "good";
  return "average";
}

const RATING_CLASS: Record<Rating, string> = {
  excellent: "text-green-600",
  good: "text-blue-600",
  average: "text-orange-600",
  insufficient: "text-muted-foreground",
};

export function BrandsTab() {
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.${key}`, opts);
  const params = useAnalysisParams();
  const { params: overviewParams } = useComparedAnalysisParams();
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const chartRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [brandView, setBrandView] = useState<ReportTableView<BrandLine> | null>(null);
  const [modelView, setModelView] = useState<ReportTableView<ModelLine> | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceBrands>({ queryKey: [`${ANALYSIS_ENDPOINT}/brands`, params] });
  // The average of the whole selection, the yardstick of the rating (same request as Overzicht).
  const { data: overview } = useQuery<MaintenanceOverview>({ queryKey: [`${ANALYSIS_ENDPOINT}/overview`, overviewParams] });
  const overall = overview?.tiles?.perVehicleMonth ?? null;

  const brands = data?.brands ?? [];
  const brand = selected && brands.some((b) => b.brand === selected) ? selected : null;
  const models = useMemo(() => (data?.models ?? []).filter((m) => m.brand === brand), [data, brand]);
  const rowsTitle = k("rows.title");

  const metrics: AnalysisMetric[] = isAdmin ? ["amount", "perVehicleMonth", "perKm", "count"] : ["amount", "perVehicleMonth", "count"];
  const points = useMemo(() => brands.map((b) => ({
    key: b.brand,
    label: b.brand,
    values: { amount: b.total, perVehicleMonth: b.perVehicleMonth, perKm: b.perKm ?? null, count: b.count },
  })), [brands]);

  const groupColumns = useMemo(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const rating = (r: MaintenanceGroupLine) => t(`maintenanceAnalysis.rating.${ratingOf(r, overall)}`);
    const list: ReportTableColumn<MaintenanceGroupLine>[] = [
      { id: "vehicles", label: c("vehicles"), cell: (r) => countText(r.vehicles), text: (r) => countText(r.vehicles), sortValue: (r) => r.vehicles, align: "right" },
      { id: "vehiclesWithCosts", label: c("vehiclesWithCosts"), cell: (r) => countText(r.vehiclesWithCosts), text: (r) => countText(r.vehiclesWithCosts), sortValue: (r) => r.vehiclesWithCosts, align: "right" },
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
      { id: "perVehicleMonth", label: c("perVehicleMonth"), cell: (r) => money(r.perVehicleMonth), text: (r) => money(r.perVehicleMonth), sortValue: (r) => r.perVehicleMonth, align: "right" },
    ];
    if (isAdmin) {
      list.push({ id: "perKm", label: c("perKm"), cell: (r) => money(r.perKm, true), text: (r) => money(r.perKm, true), sortValue: (r) => r.perKm ?? null, align: "right" });
    }
    list.push({
      id: "rating", label: c("rating"),
      cell: (r) => <span className={`font-medium ${RATING_CLASS[ratingOf(r, overall)]}`}>{rating(r)}</span>,
      text: rating,
    });
    return list;
  }, [t, money, isAdmin, overall]);

  const brandColumns = useMemo<ReportTableColumn<BrandLine>[]>(() => [
    {
      id: "brand", label: t("maintenanceAnalysis.columns.brand"),
      cell: (r) => (
        <DrillLineButton testId={`ma-brands-row-${r.brand}`} onClick={() => setSelected((cur) => (cur === r.brand ? null : r.brand))}
          className={r.brand === brand ? "font-semibold text-primary" : "text-primary"}>
          {r.brand}
        </DrillLineButton>
      ),
      text: (r) => r.brand, sortValue: (r) => r.brand,
    },
    ...(groupColumns as ReportTableColumn<BrandLine>[]),
  ], [t, groupColumns, brand]);

  const modelColumns = useMemo<ReportTableColumn<ModelLine>[]>(() => [
    { id: "model", label: t("maintenanceAnalysis.columns.model"), cell: (r) => r.model, text: (r) => r.model, sortValue: (r) => r.model },
    ...(groupColumns as ReportTableColumn<ModelLine>[]),
  ], [t, groupColumns]);

  // The km-band matrix: the brands, or the types of the chosen brand.
  const kmRows = useMemo(() => {
    const lines = (data?.kmBands ?? []).filter((l) => (brand ? l.brand === brand && l.model !== null : l.model === null));
    const byRow = new Map<string, { brand: string; model: string | null; cells: Partial<Record<KmBand, MaintenanceKmBandLine>> }>();
    for (const l of lines) {
      const id = `${l.brand}|${l.model ?? ""}`;
      const row = byRow.get(id) ?? { brand: l.brand, model: l.model, cells: {} };
      row.cells[l.band] = l;
      byRow.set(id, row);
    }
    return [...byRow.values()].sort((a, b) => (a.model ?? a.brand).localeCompare(b.model ?? b.brand, "nl"));
  }, [data, brand]);
  const showKm = isAdmin && Array.isArray(data?.kmBands);

  const kmSection: PrintSection | null = showKm ? {
    kind: "table",
    id: "ma-kmbands",
    title: k("brands.kmBandsTitle"),
    header: [brand ? t("maintenanceAnalysis.columns.model") : t("maintenanceAnalysis.columns.brand"), ...KM_BAND_KEYS],
    allRows: () => ({ rows: kmRows.map((r) => [r.model ?? r.brand, ...KM_BAND_KEYS.map((b) => (r.cells[b] ? money(r.cells[b]!.perKm, true) : ""))]), truncated: false }),
  } : null;
  useReportPrint(data ? compactSections([
    { kind: "chart", title: k("brands.chartTitle"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "ma-brands", title: k("brands.brandsTitle"), columns: brandColumns, rows: brands, view: brandView }),
    brand ? tablePrintSection({ id: "ma-models", title: k("brands.modelsTitle", { brand }), columns: modelColumns, rows: models, view: modelView }) : null,
    kmSection,
  ]) : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  return (
    <div className="space-y-4">
      <AnalysisPanel title={k("brands.chartTitle")} description={k("overview.clickHint")}>
        <AnalysisChart
          points={points}
          metrics={metrics}
          kinds={["bar", "line", "pie"]}
          defaultKind="bar"
          testId="ma-brand-chart"
          chartRef={chartRef}
          onPointClick={(key) => drill({ title: `${rowsTitle} · ${key}`, drill: "brand", key })}
        />
      </AnalysisPanel>

      <AnalysisPanel title={k("brands.brandsTitle")} description={k("brands.brandsDesc")}>
        <ReportTable
          rows={brands}
          columns={brandColumns}
          rowKey={(r) => r.brand}
          defaultSort={{ id: "total", dir: "desc" }}
          testId="ma-brands-table"
          onView={setBrandView}
          toolbar={<AnalysisCsvButton columns={brandColumns} rows={brands} view={brandView} name="onderhoud-merken" testId="button-ma-brands-csv" />}
        />
      </AnalysisPanel>

      {brand && (
        <AnalysisPanel title={k("brands.modelsTitle", { brand })} description={k("brands.modelsDesc")} testId="ma-models">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-ma-models-close">
              <X className="mr-1 h-4 w-4" aria-hidden="true" />{k("brands.closeModels")}
            </Button>
          </div>
          <ReportTable
            rows={models}
            columns={modelColumns}
            rowKey={(r) => r.key}
            defaultSort={{ id: "total", dir: "desc" }}
            testId="ma-models-table"
            onView={setModelView}
            toolbar={<AnalysisCsvButton columns={modelColumns} rows={models} view={modelView} name="onderhoud-typen" testId="button-ma-models-csv" />}
            onRowClick={(r) => drill({ title: `${rowsTitle} · ${r.brand} ${r.model}`, drill: "model", key: r.key })}
          />
        </AnalysisPanel>
      )}

      {showKm && (
        <AnalysisPanel title={k("brands.kmBandsTitle")} description={k("brands.kmBandsDesc")} testId="ma-kmbands">
          {kmRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reportKit.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">{brand ? t("maintenanceAnalysis.columns.model") : t("maintenanceAnalysis.columns.brand")}</th>
                    {KM_BAND_KEYS.map((band) => <th key={band} className="p-2 text-right">{band}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {kmRows.map((row) => (
                    <tr key={`${row.brand}|${row.model ?? ""}`} className="border-b">
                      <td className="p-2 font-medium">{row.model ?? row.brand}</td>
                      {KM_BAND_KEYS.map((band) => {
                        const cell = row.cells[band];
                        if (!cell) return <td key={band} className="p-2 text-right text-muted-foreground">–</td>;
                        const name = row.model ? `${row.brand} ${row.model}` : row.brand;
                        return (
                          <td key={band} className="p-2 text-right">
                            <button
                              type="button"
                              className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={k("brands.kmCellTitle", { amount: money(cell.amount), km: countText(cell.km), vehicles: countText(cell.vehicles) })}
                              onClick={() => drill({
                                title: `${rowsTitle} · ${name} · ${band}`,
                                drill: "kmBand",
                                key: band,
                                extra: { brand: row.brand, ...(row.model ? { model: row.model } : {}) },
                              })}
                              data-testid={`ma-kmband-${row.model ? `${row.brand}-${row.model}` : row.brand}-${band}`}
                            >
                              {money(cell.perKm, true)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalysisPanel>
      )}
    </div>
  );
}

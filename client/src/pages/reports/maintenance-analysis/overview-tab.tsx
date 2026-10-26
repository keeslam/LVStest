/**
 * Onderhoudsanalyse, tab Overzicht: the tiles (total, per car per month, cost lines and, for an
 * admin, per km) with Vergelijk met, the costs per category (pie with a label per category by
 * default) and the most expensive cars. Every number opens the cost lines behind it.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceOverview } from "@shared/maintenance-analysis";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTiles, tilesPrintSection, useCompareTile, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { EntityLink } from "@/components/reports/entity-link";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, countText, noRows, typeText, useAnalysis, useComparedAnalysisParams, useMoneyText } from "./analysis-context";
import { AnalysisChart } from "./analysis-chart";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

type TileId = "total" | "perVehicleMonth" | "count" | "perKm";
type TopVehicle = MaintenanceOverview["topVehicles"][number];

export function OverviewTab() {
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.${key}`, opts);
  const { params, compareRange } = useComparedAnalysisParams();
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const compareTile = useCompareTile();
  const drill = useAnalysisDrill();
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<TopVehicle> | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceOverview>({ queryKey: [`${ANALYSIS_ENDPOINT}/overview`, params] });

  const comparing = compareRange !== null;
  const previous = data?.previous;
  const tileIds: TileId[] = isAdmin ? ["total", "perVehicleMonth", "count", "perKm"] : ["total", "perVehicleMonth", "count"];
  const tiles: Array<ReportTile<TileId>> = tileIds.map((id) => {
    const value = data?.tiles?.[id] ?? null;
    const text = id === "count" ? countText(value) : money(value, id === "perKm");
    const old = previous ? previous[id] ?? null : comparing ? null : undefined;
    return compareTile(
      { id, label: k(`tiles.${id}`), value: text },
      {
        current: value ?? 0,
        previous: old,
        format: id === "count" ? countText : (n) => money(n, id === "perKm"),
        better: "down",
      },
    );
  });

  const categoryPoints = useMemo(() => (data?.byCategory ?? noRows<MaintenanceOverview["byCategory"][number]>()).map((c) => ({
    key: c.key,
    label: formatExpenseCategory(c.key) || c.label,
    values: { amount: c.amount, count: c.count },
  })), [data]);

  const columns = useMemo<ReportTableColumn<TopVehicle>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: TopVehicle) => formatLicensePlate(r.licensePlate);
    const type = (r: TopVehicle) => typeText(t, r.brand, r.model);
    return [
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.licensePlate },
      { id: "brand", label: c("brand"), cell: (r) => brandText(t, r.brand), text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
    ];
  }, [t, money]);
  const topVehicles = data?.topVehicles ?? noRows<TopVehicle>();

  useReportPrint(data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "chart", title: k("overview.byCategory"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "ma-top-vehicles", title: k("overview.topVehicles"), columns, rows: topVehicles, view }),
  ]) : null);

  if (isLoading) return <p className="text-sm text-muted-foreground" data-testid="ma-overview-loading">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  const allRows = k("rows.all");
  const openTile = (id: TileId) => drill({ title: `${allRows} · ${k(`tiles.${id}`)}` });

  return (
    <div className="space-y-4">
      <ReportTiles tiles={tiles} testIdPrefix="ma" onOpen={openTile} />
      {data.tiles.count === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="ma-overview-empty">{k("overview.empty")}</p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalysisPanel title={k("overview.byCategory")} description={k("overview.clickHint")}>
          <AnalysisChart
            points={categoryPoints}
            metrics={["amount", "count"]}
            kinds={["pie", "bar", "line"]}
            defaultKind="pie"
            testId="ma-category-chart"
            chartRef={chartRef}
            onPointClick={(key) => drill({
              title: `${k("rows.title")} · ${formatExpenseCategory(key)}`,
              drill: "category",
              key,
            })}
          />
        </AnalysisPanel>
        <AnalysisPanel title={k("overview.topVehicles")} description={k("overview.clickHint")}>
          <div data-testid="ma-top-vehicles">
            <ReportTable
              rows={topVehicles}
              columns={columns}
              rowKey={(r) => r.vehicleId}
              defaultSort={{ id: "total", dir: "desc" }}
              testId="ma-top-vehicles-table"
              onView={setView}
              toolbar={<AnalysisCsvButton columns={columns} rows={topVehicles} view={view} name="onderhoud-duurste-autos" testId="button-ma-top-vehicles-csv" />}
              onRowClick={(r) => drill({
                title: `${k("rows.title")} · ${formatLicensePlate(r.licensePlate)}`,
                drill: "vehicle",
                key: String(r.vehicleId),
              })}
            />
          </div>
        </AnalysisPanel>
      </div>
    </div>
  );
}

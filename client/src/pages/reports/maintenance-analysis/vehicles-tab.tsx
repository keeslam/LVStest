/**
 * Onderhoudsanalyse, tab Voertuigen: every car of the selection with its maintenance costs of the
 * period, per month owned and (admin) per km and km band. Search (also a plate without dashes),
 * sort, Kolommen, CSV and Afdrukken; a row opens the car's cost lines.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceVehicleLine } from "@shared/maintenance-analysis";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { useReportColumns } from "@/components/reports/kit/use-report-columns";
import { useReportExtraColumns, type ReportLinks } from "@/components/reports/kit/report-extra-columns";
import { EntityLink } from "@/components/reports/entity-link";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, countText, noRows, typeText, useAnalysis, useAnalysisParams, useMoneyText } from "./analysis-context";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

const COLUMNS_ID = "maintenance-analysis-vehicles";
const LINKS: ReportLinks<MaintenanceVehicleLine> = { vehicleId: (r) => r.vehicleId };

export function VehiclesTab() {
  const { t } = useTranslation("reports");
  const k = (key: string) => t(`maintenanceAnalysis.${key}`);
  const params = useAnalysisParams();
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const [view, setView] = useState<ReportTableView<MaintenanceVehicleLine> | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery<{ from: string; to: string; vehicles: MaintenanceVehicleLine[] }>({
    queryKey: [`${ANALYSIS_ENDPOINT}/vehicles`, params],
  });
  const rows = data?.vehicles ?? noRows<MaintenanceVehicleLine>();

  const baseColumns = useMemo<ReportTableColumn<MaintenanceVehicleLine>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: MaintenanceVehicleLine) => formatLicensePlate(r.licensePlate);
    const type = (r: MaintenanceVehicleLine) => typeText(t, r.brand, r.model);
    const year = (r: MaintenanceVehicleLine) => (r.year == null ? "" : String(r.year));
    const last = (r: MaintenanceVehicleLine) => (r.lastDate ? formatDateNl(`${r.lastDate}T12:00:00`, "dd-MM-yyyy") : "");
    const list: ReportTableColumn<MaintenanceVehicleLine>[] = [
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.licensePlate },
      { id: "brand", label: c("brand"), cell: (r) => brandText(t, r.brand), text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "year", label: c("year"), cell: year, text: year, sortValue: (r) => r.year ?? null, align: "right" },
    ];
    if (isAdmin) list.push({ id: "kmBand", label: c("kmBand"), cell: (r) => r.kmBand ?? "", text: (r) => r.kmBand ?? "", sortValue: (r) => r.kmBand ?? null });
    list.push(
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
      { id: "perMonth", label: c("perMonth"), cell: (r) => money(r.perMonth), text: (r) => money(r.perMonth), sortValue: (r) => r.perMonth, align: "right" },
    );
    if (isAdmin) list.push({ id: "perKm", label: c("perKm"), cell: (r) => money(r.perKm, true), text: (r) => money(r.perKm, true), sortValue: (r) => r.perKm ?? null, align: "right" });
    list.push({ id: "lastDate", label: c("lastDate"), cell: last, text: last, sortValue: (r) => r.lastDate });
    return list;
  }, [t, isAdmin, money]);
  const extras = useReportExtraColumns(COLUMNS_ID, LINKS);
  const { columns, menu } = useReportColumns(COLUMNS_ID, baseColumns, extras);

  useReportPrint(data ? [tablePrintSection({ id: "ma-vehicles", title: k("vehicles.title"), columns, rows, view, rowKey: (r) => r.vehicleId })] : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  return (
    <AnalysisPanel title={k("vehicles.title")} description={k("vehicles.description")}>
      <ReportTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.vehicleId}
        defaultSort={{ id: "total", dir: "desc" }}
        testId="ma-vehicles-table"
        onView={setView}
        toolbar={<>{menu}<AnalysisCsvButton columns={columns} rows={rows} view={view} name="onderhoud-voertuigen" testId="button-ma-vehicles-csv" /></>}
        onRowClick={(r) => drill({
          title: `${k("rows.title")} · ${formatLicensePlate(r.licensePlate)}`,
          drill: "vehicle",
          key: String(r.vehicleId),
        })}
      />
    </AnalysisPanel>
  );
}

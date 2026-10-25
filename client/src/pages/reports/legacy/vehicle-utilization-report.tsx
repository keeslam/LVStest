/**
 * Voertuigbenutting (merged: the operations tile and top-10 chart with the vehicles table).
 * Rights: report right + vehicles + reservations; it reads the fleet and the reservations.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UtilizationChart } from "@/components/reports/utilization-chart";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData, type UtilizationRow } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function VehicleUtilizationReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId } = useReportFilters();
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<UtilizationRow> | null>(null);
  const rows = base.vehicleUtilizationData;

  const average = rows.length > 0 ? Math.round(rows.reduce((sum, v) => sum + v.utilizationPercentage, 0) / rows.length) : 0;
  const subtitle = base.isAllDataRange
    ? t("reportsPage.operations.vehicleUtilizationSubtitleYearly", { count: base.fleetVehicleCount, rented: base.rentedVehicleCount })
    : t("reportsPage.operations.vehicleUtilizationSubtitle", { count: base.fleetVehicleCount, rented: base.rentedVehicleCount });
  const chartTitle = base.isAllDataRange ? t("reportsPage.operations.top10YearlyDesc") : t("reportsPage.operations.top10PeriodDesc");

  const columns = useMemo<ReportTableColumn<UtilizationRow>[]>(() => [
    { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (r) => `${r.brand} ${r.model}`, text: (r) => `${r.brand} ${r.model}`, sortValue: (r) => `${r.brand} ${r.model}` },
    { id: "plate", label: t("reportsPage.common.licensePlate"), cell: (r) => formatLicensePlate(r.licensePlate), text: (r) => formatLicensePlate(r.licensePlate), sortValue: (r) => r.licensePlate },
    { id: "days", label: t("reportsPage.vehiclesTab.daysReserved"), cell: (r) => `${r.daysReserved} ${t("common:units.days")}`, text: (r) => String(r.daysReserved), sortValue: (r) => r.daysReserved, align: "right" },
    { id: "reservations", label: t("reportsPage.common.reservations"), cell: (r) => r.reservationCount, text: (r) => String(r.reservationCount), sortValue: (r) => r.reservationCount, align: "right" },
    {
      id: "utilization", label: t("utilizationChart.utilization"),
      cell: (r) => (
        <div className="flex items-center justify-end space-x-2">
          <Progress value={r.utilizationPercentage} className="h-2 w-20" />
          <span>{r.utilizationPercentage}%</span>
        </div>
      ),
      text: (r) => `${r.utilizationPercentage}%`, sortValue: (r) => r.utilizationPercentage, align: "right",
    },
  ], [t]);

  useReportPrint([
    { kind: "tiles", tiles: [{ label: t("reportsPage.reports.avgUtilization"), value: `${average}%` }] },
    { kind: "chart", title: chartTitle, getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "vehicle-utilization", columns, rows, view }),
  ]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} basis />
      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("reportsPage.reports.avgUtilization")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="vehicle-utilization-average">{average}%</div>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.vehiclesTab.utilizationVisualizationTitle")}</CardTitle>
          <CardDescription>{chartTitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="h-80">
            <UtilizationChart data={base.utilizationChartData} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.common.vehicleUtilization")}</CardTitle>
          <CardDescription>{t("reportsPage.vehiclesTab.utilizationDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            testId="vehicle-utilization-table"
            resetKey={`${from}|${to}|${vehicleId}`}
            onView={setView}
          />
        </CardContent>
      </Card>
    </div>
  );
}

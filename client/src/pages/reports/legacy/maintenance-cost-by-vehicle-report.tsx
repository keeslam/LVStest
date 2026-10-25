/**
 * Onderhoudskosten per voertuig: the maintenance costs (maintenance, tires, brakes) of the
 * period per vehicle, every vehicle with costs (no longer only the first 10). Follows the
 * category filter.
 * Rights: report right + vehicles + MANAGE_EXPENSES; it reads the fleet and /api/expenses.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData, type MaintenanceCostRow } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function MaintenanceCostByVehicleReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const [view, setView] = useState<ReportTableView<MaintenanceCostRow> | null>(null);
  const rows = useMemo(() => base.maintenanceCostByVehicle.filter((v) => v.maintenanceCost > 0), [base.maintenanceCostByVehicle]);

  const columns = useMemo<ReportTableColumn<MaintenanceCostRow>[]>(() => [
    { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (r) => `${r.brand} ${r.model}`, text: (r) => `${r.brand} ${r.model}`, sortValue: (r) => `${r.brand} ${r.model}` },
    { id: "plate", label: t("reportsPage.common.licensePlate"), cell: (r) => formatLicensePlate(r.licensePlate), text: (r) => formatLicensePlate(r.licensePlate), sortValue: (r) => r.licensePlate },
    { id: "count", label: t("reportsPage.vehiclesTab.expenseCount"), cell: (r) => t("reportsPage.vehiclesTab.entriesSuffix", { count: r.expenseCount }), text: (r) => String(r.expenseCount), sortValue: (r) => r.expenseCount, align: "right" },
    { id: "cost", label: t("reportsPage.vehiclesTab.totalCost"), cell: (r) => <Price value={Number(r.maintenanceCost)} />, text: (r) => formatCurrency(Number(r.maintenanceCost)), sortValue: (r) => r.maintenanceCost, align: "right" },
  ], [t]);

  useReportPrint([tablePrintSection({ id: "maintenance-cost-by-vehicle", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.vehiclesTab.maintenanceCostsTitle")}</CardTitle>
          <CardDescription>{t("reportsPage.vehiclesTab.maintenanceCostsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            testId="maintenance-cost-by-vehicle-table"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
          />
        </CardContent>
      </Card>
    </div>
  );
}

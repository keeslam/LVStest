/**
 * Onderhoudskosten per voertuig: the maintenance costs (maintenance, tires, brakes) of the
 * period per vehicle, every vehicle with costs (no longer only the first 10). Follows the
 * category filter.
 * Rights: report right + vehicles + MANAGE_EXPENSES; it reads the fleet and /api/expenses.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Price } from "@/components/ui/price";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData, type MaintenanceCostRow } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";
import { isMaintenanceExpenseCategory } from "@shared/expense-categories";
import { LegacyRowsDialog, drillTitleOf, useLegacyDrill } from "./drill-rows";
import { useReportColumns } from "@/components/reports/kit/use-report-columns";

export function MaintenanceCostByVehicleReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const [view, setView] = useState<ReportTableView<MaintenanceCostRow> | null>(null);
  const rows = useMemo(() => base.maintenanceCostByVehicle.filter((v) => v.maintenanceCost > 0), [base.maintenanceCostByVehicle]);
  const drill = useLegacyDrill();
  // The same costs as the line: the vehicle's maintenance costs of the period.
  const openVehicle = (r: MaintenanceCostRow) => drill.open({
    title: drillTitleOf(t("reportsPage.vehiclesTab.maintenanceCostsTitle"), formatLicensePlate(r.licensePlate)),
    expenses: base.filteredExpenses.filter((e) => e.vehicleId === r.id && isMaintenanceExpenseCategory(e.category)),
  });

  const baseColumns = useMemo<ReportTableColumn<MaintenanceCostRow>[]>(() => [
    { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (r) => `${r.brand} ${r.model}`, text: (r) => `${r.brand} ${r.model}`, sortValue: (r) => `${r.brand} ${r.model}` },
    { id: "plate", label: t("reportsPage.common.licensePlate"), cell: (r) => <EntityLink kind="vehicle" id={r.id} label={formatLicensePlate(r.licensePlate)} />, text: (r) => formatLicensePlate(r.licensePlate), sortValue: (r) => r.licensePlate },
    { id: "count", label: t("reportsPage.vehiclesTab.expenseCount"), cell: (r) => t("reportsPage.vehiclesTab.entriesSuffix", { count: r.expenseCount }), text: (r) => String(r.expenseCount), sortValue: (r) => r.expenseCount, align: "right" },
    { id: "cost", label: t("reportsPage.vehiclesTab.totalCost"), cell: (r) => <Price value={Number(r.maintenanceCost)} />, text: (r) => formatCurrency(Number(r.maintenanceCost)), sortValue: (r) => r.maintenanceCost, align: "right" },
  ], [t]);
  // Kolommen: hide/show columns (per user). The rows are the records themselves: no extra fields.
  const { columns, menu } = useReportColumns("maintenance-cost-by-vehicle", baseColumns);

  useReportPrint([tablePrintSection({ id: "maintenance-cost-by-vehicle", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection testId="card-maintenance-cost-by-vehicle-report" title={t("reportsPage.vehiclesTab.maintenanceCostsTitle")} description={t("reportsPage.vehiclesTab.maintenanceCostsDesc")}>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            testId="maintenance-cost-by-vehicle-table"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
            toolbar={menu}
            onRowClick={openVehicle}
          />
        </ReportSection>
      <LegacyRowsDialog drill={drill.drill} onClose={drill.close} vehicles={base.vehicles} customers={base.customers} />
    </div>
  );
}

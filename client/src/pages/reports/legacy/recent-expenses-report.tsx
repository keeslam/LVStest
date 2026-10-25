/**
 * Kosten in deze periode: every expense of the period and filters (no longer only the
 * newest 10), newest first.
 * Rights: report right + MANAGE_EXPENSES (it reads /api/expenses). The vehicle column
 * names the vehicle when the user may read the fleet, otherwise "Onbekend voertuig" (as before).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Expense } from "@shared/schema";
import { Price } from "@/components/ui/price";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatDate, formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function RecentExpensesReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const [view, setView] = useState<ReportTableView<Expense> | null>(null);
  const { vehicles } = base;

  const columns = useMemo<ReportTableColumn<Expense>[]>(() => {
    const vehicleName = (e: Expense) => {
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      return vehicle
        ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})`
        : t("reportsPage.common.unknownVehicle");
    };
    return [
      { id: "date", label: t("common:fields.date"), cell: (e) => formatDate(e.date), text: (e) => formatDate(e.date), sortValue: (e) => new Date(e.date).getTime() },
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (e) => <EntityLink kind="vehicle" id={e.vehicleId} label={vehicleName(e)} />, text: vehicleName, sortValue: vehicleName },
      { id: "category", label: t("reportsPage.common.category"), cell: (e) => formatExpenseCategory(e.category), text: (e) => formatExpenseCategory(e.category), sortValue: (e) => formatExpenseCategory(e.category) },
      { id: "description", label: t("common:fields.description"), cell: (e) => e.description, text: (e) => e.description ?? "" },
      { id: "amount", label: t("common:fields.amount"), cell: (e) => <Price value={Number(e.amount)} />, text: (e) => formatCurrency(Number(e.amount)), sortValue: (e) => Number(e.amount), align: "right" },
    ];
  }, [t, vehicles]);

  const rows = base.filteredExpenses;
  useReportPrint([tablePrintSection({ id: "expenses-in-period", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection testId="card-expenses-in-period-report" title={t("reportsPage.reports.expensesInPeriod")} description={t("reportsPage.expensesTab.recentExpensesDesc")}>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(e) => e.id}
            defaultSort={{ id: "date", dir: "desc" }}
            testId="expenses-in-period-table"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
          />
        </ReportSection>
    </div>
  );
}

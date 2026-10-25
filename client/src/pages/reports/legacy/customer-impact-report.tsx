/**
 * Klantimpactanalyse: per customer with a reservation in the period, the days, vehicles and
 * the costs booked on those vehicles during the rental or up to 7 days after it.
 * Rights: report right + customers + reservations (the rows are the customers' reservations).
 * The costs come from /api/expenses and stay 0 without MANAGE_EXPENSES, as before.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Price } from "@/components/ui/price";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency } from "@/lib/format-utils";
import { useReportBaseData, type CustomerStatsRow } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function CustomerImpactReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const [view, setView] = useState<ReportTableView<CustomerStatsRow> | null>(null);
  const rows = useMemo(() => base.customerReservationStats.filter((c) => c.reservationCount > 0), [base.customerReservationStats]);
  const avg = base.avgExpensePerVehicle;

  const columns = useMemo<ReportTableColumn<CustomerStatsRow>[]>(() => {
    const impact = (c: CustomerStatsRow): { text: string; className: string } | null => {
      if (!(c.expensePerDay > 0)) return null;
      if (c.expensePerDay > (avg / 30) * 2) return { text: t("reportsPage.customersTab.impactHigh"), className: "bg-red-100 text-red-800" };
      if (c.expensePerDay > avg / 30) return { text: t("reportsPage.customersTab.impactMedium"), className: "bg-yellow-100 text-yellow-800" };
      return { text: t("reportsPage.customersTab.impactLow"), className: "bg-green-100 text-green-800" };
    };
    return [
      { id: "customer", label: t("reportsPage.common.customer"), cell: (c) => c.name, text: (c) => c.name, sortValue: (c) => c.name },
      { id: "reservations", label: t("reportsPage.common.reservations"), cell: (c) => c.reservationCount, text: (c) => String(c.reservationCount), sortValue: (c) => c.reservationCount, align: "right" },
      { id: "days", label: t("reportsPage.common.totalDays"), cell: (c) => `${c.totalReservationDays} ${t("common:units.days")}`, text: (c) => String(c.totalReservationDays), sortValue: (c) => c.totalReservationDays, align: "right" },
      { id: "vehicles", label: t("reportsPage.customersTab.totalVehicles"), cell: (c) => c.vehicleCount, text: (c) => String(c.vehicleCount), sortValue: (c) => c.vehicleCount, align: "right" },
      { id: "expenses", label: t("reportsPage.customersTab.relatedExpenses"), cell: (c) => <Price value={Number(c.totalExpenses)} />, text: (c) => formatCurrency(Number(c.totalExpenses)), sortValue: (c) => c.totalExpenses, align: "right" },
      {
        id: "perDay", label: t("reportsPage.customersTab.costPerDay"), align: "right", sortValue: (c) => c.expensePerDay,
        cell: (c) => {
          const label = impact(c);
          return (
            <span className="font-medium">
              <Price value={Number(c.expensePerDay)} />
              {label && " "}
              {label && <span className={`ml-2 rounded-full px-2 py-1 text-xs ${label.className}`}>{label.text}</span>}
            </span>
          );
        },
        text: (c) => { const label = impact(c); return `${formatCurrency(Number(c.expensePerDay))}${label ? ` ${label.text}` : ""}`; },
      },
    ];
  }, [t, avg]);

  useReportPrint([tablePrintSection({ id: "customer-impact", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection testId="card-customer-impact-report" title={t("reportsPage.customersTab.impactTitle")} description={t("reportsPage.customersTab.impactDesc")}>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(c) => c.id}
            testId="customer-impact-table"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
          />
        </ReportSection>
    </div>
  );
}

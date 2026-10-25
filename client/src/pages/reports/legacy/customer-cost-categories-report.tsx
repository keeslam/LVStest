/**
 * Kostencategorieen per klant: the 10 customers with the most related costs, a column for
 * every category in the data (A-14-5); the highest amount of a customer is bold.
 * Rights: report right + customers + reservations + MANAGE_EXPENSES; every row is built from
 * the customers' reservations and the costs on their vehicles, so without one of them it is empty.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import { useReportBaseData, type CustomerStatsRow } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";
import { LegacyRowsDialog, drillTitleOf, useLegacyDrill } from "./drill-rows";

export function CustomerCostCategoriesReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const [view, setView] = useState<ReportTableView<CustomerStatsRow> | null>(null);
  const { customerCostRows: rows, customerCostCategories: categories } = base;
  const drill = useLegacyDrill();
  // The costs the amounts of the line add up (relatedExpenses of the customer).
  const openCustomer = (c: CustomerStatsRow) => drill.open({
    title: drillTitleOf(t("reportsPage.customersTab.expenseCategoriesTitle"), c.name),
    expenses: c.relatedExpenses,
  });

  const columns = useMemo<ReportTableColumn<CustomerStatsRow>[]>(() => {
    const highest = (c: CustomerStatsRow) => categories.reduce(
      (prev, key) => ((c.expensesByCategory[key] || 0) > prev.amount ? { category: key, amount: c.expensesByCategory[key] } : prev),
      { category: "", amount: 0 },
    ).category;
    const amountText = (c: CustomerStatsRow, key: string) => {
      const amount = c.expensesByCategory[key] || 0;
      return amount > 0 ? formatCurrency(Number(amount)) : "—";
    };
    return [
      { id: "customer", label: t("reportsPage.common.customer"), cell: (c) => c.name, text: (c) => c.name, sortValue: (c) => c.name },
      ...categories.map((key): ReportTableColumn<CustomerStatsRow> => ({
        id: `category-${key}`,
        label: formatExpenseCategory(key),
        cell: (c) => <span className={highest(c) === key ? "font-bold" : ""}>{amountText(c, key)}</span>,
        text: (c) => amountText(c, key),
        sortValue: (c) => c.expensesByCategory[key] || 0,
      })),
    ];
  }, [t, categories]);

  useReportPrint([tablePrintSection({ id: "customer-cost-categories", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection testId="card-customer-cost-categories-report" title={t("reportsPage.customersTab.expenseCategoriesTitle")} description={t("reportsPage.customersTab.expenseCategoriesDesc")}>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(c) => c.id}
            testId="customer-category-costs"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
            onRowClick={openCustomer}
          />
        </ReportSection>
      <LegacyRowsDialog drill={drill.drill} onClose={drill.close} vehicles={base.vehicles} customers={base.customers} />
    </div>
  );
}

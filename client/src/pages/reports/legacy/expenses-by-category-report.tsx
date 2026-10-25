/**
 * Kosten per categorie (merged: the operations chart and the expenses breakdown, now a table
 * with a total). Follows the category filter.
 * Rights: report right + MANAGE_EXPENSES (it reads /api/expenses). The average per vehicle
 * divides by the whole fleet, so that tile and the basis line need the vehicles right too.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPermission } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { ExpenseChart } from "@/components/reports/expense-chart";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useReportBaseData } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { categoryKey } from "../report-helpers";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

interface CategoryRow { category: string; count: number; amount: number }

export function ExpensesByCategoryReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId, category } = useReportFilters();
  const canViewVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<CategoryRow> | null>(null);

  const rows = useMemo<CategoryRow[]>(() => Object.entries(base.expensesByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([key, amount]) => ({ category: key, amount, count: base.filteredExpenses.filter((e) => categoryKey(e.category) === key).length })),
  [base.expensesByCategory, base.filteredExpenses]);

  const columns = useMemo<ReportTableColumn<CategoryRow>[]>(() => [
    { id: "category", label: t("reportsPage.common.category"), cell: (r) => formatExpenseCategory(r.category), text: (r) => formatExpenseCategory(r.category), sortValue: (r) => formatExpenseCategory(r.category) },
    { id: "count", label: t("reportsPage.vehiclesTab.expenseCount"), cell: (r) => r.count, text: (r) => String(r.count), sortValue: (r) => r.count, align: "right" },
    { id: "amount", label: t("common:fields.amount"), cell: (r) => <Price value={r.amount} />, text: (r) => formatCurrency(r.amount), sortValue: (r) => r.amount, align: "right" },
  ], [t]);
  const totals = {
    category: t("reportsPage.reports.total"),
    count: String(base.filteredExpenses.length),
    amount: formatCurrency(Number(base.totalExpenses)),
  };

  const tiles = [
    { label: t("reportsPage.common.totalExpenses"), value: formatCurrency(Number(base.totalExpenses)) },
    ...(canViewVehicles ? [{ label: t("reportsPage.operations.avgCostPerVehicleCardTitle"), value: formatCurrency(Number(base.avgExpensePerVehicle)) }] : []),
  ];
  useReportPrint([
    { kind: "tiles", tiles },
    { kind: "chart", title: t("reportsPage.operations.expensesByCategoryTitle"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "expenses-by-category", columns, rows, view, totals: rows.length > 0 ? totals : undefined }),
  ]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} basis={canViewVehicles} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPage.common.totalExpenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><Price value={Number(base.totalExpenses)} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{t("reportsPage.operations.acrossExpenseEntries", { count: base.filteredExpenses.length })}</p>
          </CardContent>
        </Card>
        {canViewVehicles && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("reportsPage.operations.avgCostPerVehicleCardTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold"><Price value={Number(base.avgExpensePerVehicle)} /></div>
              <p className="mt-1 text-xs text-muted-foreground" data-testid="reports-avg-basis">
                {t("reportsPage.operations.avgBasis", { count: base.fleetVehicleCount })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.operations.expensesByCategoryTitle")}</CardTitle>
          <CardDescription>{t("reportsPage.operations.expensesByCategoryDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="h-80">
            <ExpenseChart data={base.expenseChartData} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.expensesTab.breakdownTitle")}</CardTitle>
          <CardDescription>{t("reportsPage.expensesTab.breakdownDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.category}
            totals={rows.length > 0 ? totals : undefined}
            testId="expenses-by-category-table"
            resetKey={`${from}|${to}|${vehicleId}|${category}`}
            onView={setView}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Kostentrends: the costs of the last three calendar months side by side. Follows the
 * category and vehicle filters; known gap kept as it is: it ignores the period (the pane
 * says "Altijd de laatste 3 maanden.").
 * Rights: report right + MANAGE_EXPENSES (it reads /api/expenses).
 */
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ReportSection } from "@/components/reports/kit/report-section";
import { Progress } from "@/components/ui/progress";
import { Price } from "@/components/ui/price";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import type { MonthChange } from "../report-helpers";
import { useReportBaseData } from "../report-base-data";
import { ReportBaseStatus } from "./report-base-status";
import { LegacyRowsDialog, drillTitleOf, useLegacyDrill } from "./drill-rows";

export function ExpenseTrendReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { expenseTrend, selectedCategory } = base;

  const changeLabel = (change: MonthChange): string => {
    if (change.kind === "new") return t("reportsPage.operations.trendNew");
    if (change.kind === "none") return "–";
    return `${change.value > 0 ? "+" : ""}${Math.round(change.value)}%`;
  };
  const changeClass = (change: MonthChange): string =>
    change.kind === "none" ? "bg-slate-100 text-slate-700"
      : change.kind === "new" || change.value > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800";

  useReportPrint([
    {
      kind: "tiles",
      tiles: [
        { label: expenseTrend.currentMonth.name, value: `${formatCurrency(Number(expenseTrend.currentMonth.total))} (${changeLabel(expenseTrend.currentMonth.changePercentage)})` },
        { label: expenseTrend.previousMonth.name, value: `${formatCurrency(Number(expenseTrend.previousMonth.total))} (${changeLabel(expenseTrend.previousMonth.changePercentage)})` },
        { label: expenseTrend.twoMonthsAgo.name, value: formatCurrency(Number(expenseTrend.twoMonthsAgo.total)) },
      ],
    },
  ]);

  const drill = useLegacyDrill();
  // A month opens the costs of that month (with the category and vehicle filters, like its total).
  const monthProps = (key: "currentMonth" | "previousMonth" | "twoMonthsAgo") => {
    const month = expenseTrend[key];
    const openMonth = () => drill.open({ title: drillTitleOf(t("reportsPage.operations.expenseTrendsTitle"), month.name), expenses: month.expenses });
    return {
      role: "button" as const,
      tabIndex: 0,
      onClick: openMonth,
      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMonth(); } },
      "data-testid": `button-expense-trend-${key}`,
    };
  };

  const share = (total: number) => (expenseTrend.currentMonth.total === 0 ? 0 : (total / expenseTrend.currentMonth.total) * 100);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection
        testId="reports-expense-trend"
        title={t("reportsPage.operations.expenseTrendsTitle")}
        description={`${t("reportsPage.operations.expenseTrendsDesc")}${selectedCategory !== "all" ? ` · ${formatExpenseCategory(selectedCategory)}` : ""}`}
      >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2 cursor-pointer rounded-md p-1 transition hover:bg-muted/50" {...monthProps("currentMonth")}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">{expenseTrend.currentMonth.name}</h4>
                  <p className="text-2xl font-bold"><Price value={Number(expenseTrend.currentMonth.total)} /></p>
                </div>
                <div className={`rounded-md px-2 py-1 text-sm ${changeClass(expenseTrend.currentMonth.changePercentage)}`} data-testid="trend-change-current">
                  {changeLabel(expenseTrend.currentMonth.changePercentage)}
                </div>
              </div>
              <Progress value={100} className="h-2" />
            </div>

            <div className="space-y-2 cursor-pointer rounded-md p-1 transition hover:bg-muted/50" {...monthProps("previousMonth")}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">{expenseTrend.previousMonth.name}</h4>
                  <p className="text-2xl font-bold"><Price value={Number(expenseTrend.previousMonth.total)} /></p>
                </div>
                <div className={`rounded-md px-2 py-1 text-sm ${changeClass(expenseTrend.previousMonth.changePercentage)}`} data-testid="trend-change-previous">
                  {changeLabel(expenseTrend.previousMonth.changePercentage)}
                </div>
              </div>
              <Progress value={share(expenseTrend.previousMonth.total)} className="h-2" />
            </div>

            <div className="space-y-2 cursor-pointer rounded-md p-1 transition hover:bg-muted/50" {...monthProps("twoMonthsAgo")}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">{expenseTrend.twoMonthsAgo.name}</h4>
                  <p className="text-2xl font-bold"><Price value={Number(expenseTrend.twoMonthsAgo.total)} /></p>
                </div>
              </div>
              <Progress value={share(expenseTrend.twoMonthsAgo.total)} className="h-2" />
            </div>
          </div>
      </ReportSection>
      <LegacyRowsDialog drill={drill.drill} onClose={drill.close} vehicles={base.vehicles} customers={base.customers} />
    </div>
  );
}

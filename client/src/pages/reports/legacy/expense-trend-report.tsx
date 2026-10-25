/**
 * Kostentrends: the costs of the last three calendar months side by side. Follows the
 * category and vehicle filters; known gap kept as it is: it ignores the period (the pane
 * says "Altijd de laatste 3 maanden.").
 * Rights: report right + MANAGE_EXPENSES (it reads /api/expenses).
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Price } from "@/components/ui/price";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import type { MonthChange } from "../report-helpers";
import { useReportBaseData } from "../report-base-data";
import { ReportBaseStatus } from "./report-base-status";

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

  const share = (total: number) => (expenseTrend.currentMonth.total === 0 ? 0 : (total / expenseTrend.currentMonth.total) * 100);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.operations.expenseTrendsTitle")}</CardTitle>
          <CardDescription>
            {t("reportsPage.operations.expenseTrendsDesc")}
            {selectedCategory !== "all" && ` · ${formatExpenseCategory(selectedCategory)}`}
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="reports-expense-trend">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2">
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

            <div className="space-y-2">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">{expenseTrend.twoMonthsAgo.name}</h4>
                  <p className="text-2xl font-bold"><Price value={Number(expenseTrend.twoMonthsAgo.total)} /></p>
                </div>
              </div>
              <Progress value={share(expenseTrend.twoMonthsAgo.total)} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

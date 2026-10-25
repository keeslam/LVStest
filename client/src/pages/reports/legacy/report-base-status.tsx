import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { formatDate, formatExpenseCategory } from "@/lib/format-utils";
import type { ReportBaseData } from "../report-base-data";

/**
 * A-14-10: a visible status line while the numbers load. With `basis`, also the one period
 * and fleet base the averages of the report use (A-14-8).
 */
export function ReportBaseStatus({ base, basis = false }: { base: ReportBaseData; basis?: boolean }) {
  const { t } = useTranslation("reports");
  if (!base.dataBusy && !basis) return null;
  const { dateRange, isAllDataRange } = base;
  return (
    <div className="space-y-1">
      {base.dataBusy && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="reports-loading">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("reportsPage.filters.loading")}
        </div>
      )}
      {basis && (
        <p className="text-sm text-muted-foreground" data-testid="reports-basis-caption">
          {t("reportsPage.filters.basisCaption", {
            count: base.fleetVehicleCount,
            period: isAllDataRange
              ? t("reportsPage.common.allData")
              : `${formatDate(dateRange.from)} ${t("reportsPage.printReport.dateRangeSeparator")} ${formatDate(dateRange.to)}`,
          })}
        </p>
      )}
    </div>
  );
}

/** M-2: a report that does not read the expense category says so once a category is chosen. */
export function CategoryIgnoredNote({ category, scope }: { category: string; scope: string }) {
  const { t } = useTranslation("reports");
  if (category === "all") return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="category-filter-note">
      {t("reportsPage.filters.categoryNotApplicable", { category: formatExpenseCategory(category), scope })}
    </p>
  );
}

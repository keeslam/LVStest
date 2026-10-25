import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Database, LineChart } from "lucide-react";
import { UserPermission, type Expense, type Vehicle } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { expenseFetchWindow, presentCategories } from "./report-helpers";
import { useReportFilters, type ReportPreset } from "./report-filters";

const PRESETS: ReportPreset[] = ["thisMonth", "lastMonth", "thisQuarter", "thisYear", "custom"];

/** "2026-10-01" -> "1-10-2026" */
function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return y && m && d ? `${d}-${m}-${y}` : ymd;
}

interface ReportFilterBarProps {
  /** The active report uses the category filter: only then the category select is shown. */
  showCategory: boolean;
  onOpenReportBuilder(): void;
  onOpenMaintenanceCosts(): void;
}

/** The filter bar above every report; it stays in view while scrolling (the page scrolls the window). */
export function ReportFilterBar({ showCategory, onOpenReportBuilder, onOpenMaintenanceCosts }: ReportFilterBarProps) {
  const { t } = useTranslation("reports");
  const filters = useReportFilters();
  const canViewVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const canViewExpenses = useHasPermission(UserPermission.MANAGE_EXPENSES);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], enabled: canViewVehicles });
  // The category filter offers every category in use (A-14-4); without the facets it falls back
  // to the expenses of the period (same query as the expense reports, so no extra request).
  const { data: expenseFacets } = useQuery<{ categories: string[] }>({
    queryKey: ["/api/expenses/facets"],
    enabled: canViewExpenses && showCategory,
  });
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", expenseFetchWindow(filters.from, filters.to)],
    enabled: canViewExpenses && showCategory,
  });
  const categoryOptions = presentCategories(
    Array.isArray(expenseFacets?.categories) ? expenseFacets.categories.map((category) => ({ category })) : expenses,
  );
  // A chosen category stays listed even when a refresh no longer returns it.
  if (filters.category !== "all" && !categoryOptions.includes(filters.category)) categoryOptions.push(filters.category);

  // Searchable by plate, also typed without dashes (A-14-11).
  const vehicleOptions: ComboboxOption[] = [
    { value: "all", label: t("reportsPage.filters.allVehiclesPlaceholder") },
    ...[...vehicles]
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate))
      .map((v) => ({
        value: String(v.id),
        label: formatLicensePlate(v.licensePlate),
        description: `${v.brand} ${v.model}`,
        tags: [v.licensePlate],
      })),
  ];

  const changePreset = (value: string) => {
    if (value === "custom") filters.setRange(filters.from, filters.to);
    else filters.setPreset(value as Exclude<ReportPreset, "custom">);
  };

  return (
    <div
      data-testid="report-filter-bar"
      className="sticky top-0 z-20 rounded-md border-b bg-gray-50/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reportsPage.shell.presetLabel")}</label>
          <Select value={filters.preset} onValueChange={changePreset}>
            <SelectTrigger className="w-40 bg-white" data-testid="select-report-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>{t(`reportsPage.shell.presets.${preset}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filters.preset === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-from">{t("reportsPage.shell.from")}</label>
              <Input
                id="report-from"
                type="date"
                className="w-40 bg-white"
                value={filters.from}
                max={filters.to}
                onChange={(e) => { if (e.target.value) filters.setRange(e.target.value, filters.to); }}
                data-testid="input-report-from"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-to">{t("reportsPage.shell.to")}</label>
              <Input
                id="report-to"
                type="date"
                className="w-40 bg-white"
                value={filters.to}
                min={filters.from}
                onChange={(e) => { if (e.target.value) filters.setRange(filters.from, e.target.value); }}
                data-testid="input-report-to"
              />
            </div>
          </>
        )}

        <p className="pb-2 text-sm text-muted-foreground" data-testid="report-period-label">
          {t("reportsPage.shell.periodLabel", { from: shortDate(filters.from), to: shortDate(filters.to) })}
        </p>

        <div className="w-56 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reportsPage.common.vehicle")}</label>
          <SearchableCombobox
            options={vehicleOptions}
            value={filters.vehicleId}
            onChange={filters.setVehicle}
            placeholder={t("reportsPage.filters.allVehiclesPlaceholder")}
            searchPlaceholder={t("reportsPage.filters.vehicleSearchPlaceholder")}
            emptyMessage={t("reportsPage.filters.noVehicleFound")}
            data-testid="select-report-vehicle"
          />
        </div>

        {/* Also shown while a category is chosen, so it can be cleared on a report that ignores it. */}
        {(showCategory || filters.category !== "all") && (
          <div className="w-48 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("reportsPage.filters.expenseCategoryLabel")}</label>
            <Select value={filters.category} onValueChange={filters.setCategory}>
              <SelectTrigger className="bg-white" data-testid="select-report-category">
                <SelectValue placeholder={t("reportsPage.filters.allCategoriesPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsPage.filters.allCategoriesPlaceholder")}</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>{formatExpenseCategory(category)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="bg-white" onClick={onOpenReportBuilder} data-testid="button-open-report-builder">
            <Database className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("reportsPage.shell.reportBuilder")}
          </Button>
          <Button variant="outline" size="sm" className="bg-white" onClick={onOpenMaintenanceCosts} data-testid="button-open-maintenance-costs">
            <LineChart className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("reportsPage.shell.maintenanceAnalysis")}
          </Button>
        </div>
      </div>
    </div>
  );
}

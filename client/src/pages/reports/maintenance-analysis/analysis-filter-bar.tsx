/**
 * Onderhoudsanalyse: the filter bar of the window. Period presets and Vergelijk met as on the
 * reports page, then category, brand, type, build year, km band (admin only) and supplier.
 * Brand, type and supplier offer what the period has (the brands and suppliers of the period,
 * without the window's other filters, so a choice can always be changed back).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MAINTENANCE_EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { REPORT_DRILL_NULL_KEY } from "@shared/report-kit";
import { KM_BAND_KEYS, type MaintenanceBrands, type MaintenanceSuppliers } from "@shared/maintenance-analysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatExpenseCategory } from "@/lib/format-utils";
import { isAllDataRange, useReportFilters, type ReportCompare, type ReportPreset } from "../report-filters";
import { ANALYSIS_ENDPOINT, NO_EXTRA_FILTERS, brandText, nameKey, typeText, useAnalysis } from "./analysis-context";

const PRESETS: ReportPreset[] = ["thisMonth", "lastMonth", "thisQuarter", "thisYear", "all", "custom"];
const COMPARES: ReportCompare[] = ["none", "previous", "lastYear"];
/** The "no filter" value of a select (Radix does not allow an empty value). */
const ALL = "__all";

/** "2026-10-01" -> "1-10-2026" */
function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return y && m && d ? `${d}-${m}-${y}` : ymd;
}

export function AnalysisFilterBar() {
  const { t } = useTranslation("reports");
  const k = (key: string) => t(`maintenanceAnalysis.filters.${key}`);
  const filters = useReportFilters();
  const { extra, setExtra, clearExtra, isAdmin } = useAnalysis();
  const period = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);

  // The choices: what the period has, independent of the other filters of the window.
  const { data: brandData } = useQuery<MaintenanceBrands>({ queryKey: [`${ANALYSIS_ENDPOINT}/brands`, period] });
  const { data: supplierData } = useQuery<MaintenanceSuppliers>({ queryKey: [`${ANALYSIS_ENDPOINT}/suppliers`, period] });
  // A brand or type without a name (null) is "Onbekend" with value "__null"; never an empty value.
  const brandOptions = useMemo(() => {
    const list = (Array.isArray(brandData?.brands) ? brandData.brands : []).map((b) => nameKey(b.brand));
    if (extra.brand && !list.includes(extra.brand)) list.push(extra.brand);
    return [...new Set(list)]
      .map((value) => ({ value, label: value === REPORT_DRILL_NULL_KEY ? brandText(t, null) : value }))
      .sort((a, b) => a.label.localeCompare(b.label, "nl"));
  }, [brandData, extra.brand, t]);
  const modelOptions = useMemo(() => {
    const models = Array.isArray(brandData?.models) ? brandData.models : [];
    const list = models.filter((m) => !extra.brand || nameKey(m.brand) === extra.brand).map((m) => nameKey(m.model));
    if (extra.model && !list.includes(extra.model)) list.push(extra.model);
    return [...new Set(list)]
      .map((value) => ({ value, label: value === REPORT_DRILL_NULL_KEY ? typeText(t, null, null) : value }))
      .sort((a, b) => a.label.localeCompare(b.label, "nl"));
  }, [brandData, extra.brand, extra.model, t]);
  const supplierOptions = useMemo(() => {
    const list = (Array.isArray(supplierData?.suppliers) ? supplierData.suppliers : [])
      .map((s) => ({ value: s.key ?? REPORT_DRILL_NULL_KEY, label: s.key === null ? t("maintenanceAnalysis.unknownSupplier") : s.supplier }));
    if (extra.supplier && !list.some((s) => s.value === extra.supplier)) {
      list.push({ value: extra.supplier, label: extra.supplier === REPORT_DRILL_NULL_KEY ? t("maintenanceAnalysis.unknownSupplier") : extra.supplier });
    }
    return list;
  }, [supplierData, extra.supplier, t]);

  const allData = isAllDataRange(filters.from, filters.to);
  const changePreset = (value: string) => {
    if (value === "custom") filters.setRange(filters.from, filters.to);
    else filters.setPreset(value as Exclude<ReportPreset, "custom">);
  };
  const pick = (v: string) => (v === ALL ? "" : v);
  const anyFilter = filters.category !== "all" || (Object.keys(NO_EXTRA_FILTERS) as Array<keyof typeof extra>).some((key) => extra[key] !== "");

  return (
    <div className="rounded-md border bg-gray-50/95 p-3" data-testid="ma-filter-bar">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reportsPage.shell.presetLabel")}</label>
          <Select value={filters.preset} onValueChange={changePreset}>
            <SelectTrigger className="w-40 bg-white" data-testid="select-ma-preset"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => <SelectItem key={preset} value={preset}>{t(`reportsPage.shell.presets.${preset}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filters.preset === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ma-from">{t("reportsPage.shell.from")}</label>
              <Input id="ma-from" type="date" className="w-40 bg-white" value={filters.from} max={filters.to}
                onChange={(e) => { if (e.target.value) filters.setRange(e.target.value, filters.to); }} data-testid="input-ma-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ma-to">{t("reportsPage.shell.to")}</label>
              <Input id="ma-to" type="date" className="w-40 bg-white" value={filters.to} min={filters.from}
                onChange={(e) => { if (e.target.value) filters.setRange(filters.from, e.target.value); }} data-testid="input-ma-to" />
            </div>
          </>
        )}

        <p className="pb-2 text-sm text-muted-foreground" data-testid="ma-period-label">
          {allData ? t("reportsPage.common.allData") : t("reportsPage.shell.periodLabel", { from: shortDate(filters.from), to: shortDate(filters.to) })}
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" id="ma-compare-label">{t("reportsPage.shell.compare.label")}</label>
          <Select value={allData ? "none" : filters.compare} onValueChange={(v) => filters.setCompare(v as ReportCompare)} disabled={allData}>
            <SelectTrigger className="w-52 bg-white" aria-labelledby="ma-compare-label" data-testid="select-ma-compare"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPARES.map((mode) => <SelectItem key={mode} value={mode}>{t(`reportsPage.shell.compare.${mode}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <FilterSelect label={k("category")} testId="select-ma-category" value={filters.category === "all" ? ALL : filters.category}
          onChange={(v) => filters.setCategory(v === ALL ? "all" : v)} allLabel={k("allCategories")}
          options={MAINTENANCE_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: formatExpenseCategory(c) }))} />

        <FilterSelect label={k("brand")} testId="select-ma-brand" value={extra.brand || ALL}
          onChange={(v) => setExtra({ brand: pick(v), model: "" })} allLabel={k("allBrands")}
          options={brandOptions} />

        <FilterSelect label={k("model")} testId="select-ma-model" value={extra.model || ALL}
          onChange={(v) => setExtra({ model: pick(v) })} allLabel={k("allModels")}
          options={modelOptions} />

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{k("year")}</label>
          <div className="flex items-center gap-1">
            <Input className="w-20 bg-white" inputMode="numeric" maxLength={4} placeholder={k("yearFrom")} aria-label={k("yearFrom")}
              value={extra.yearFrom} onChange={(e) => setExtra({ yearFrom: e.target.value.replace(/\D/g, "") })} data-testid="input-ma-year-from" />
            <span className="text-muted-foreground">–</span>
            <Input className="w-20 bg-white" inputMode="numeric" maxLength={4} placeholder={k("yearTo")} aria-label={k("yearTo")}
              value={extra.yearTo} onChange={(e) => setExtra({ yearTo: e.target.value.replace(/\D/g, "") })} data-testid="input-ma-year-to" />
          </div>
        </div>

        {isAdmin && (
          <FilterSelect label={k("kmBand")} testId="select-ma-kmband" value={extra.kmBand || ALL}
            onChange={(v) => setExtra({ kmBand: pick(v) })} allLabel={k("allKmBands")}
            options={KM_BAND_KEYS.map((b) => ({ value: b, label: b }))} />
        )}

        <FilterSelect label={k("supplier")} testId="select-ma-supplier" value={extra.supplier || ALL}
          onChange={(v) => setExtra({ supplier: pick(v) })} allLabel={k("allSuppliers")}
          options={supplierOptions} />

        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={() => { clearExtra(); filters.setCategory("all"); }} data-testid="button-ma-clear-filters">
            {k("clear")}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, testId, value, onChange, allLabel, options }: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44 bg-white" aria-label={label} data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {/* Radix throws on an empty value: such an option is left out, never rendered. */}
          {options.filter((o) => o.value !== "").map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Onderhoudsanalyse (Kees, 2026-10-26): the filter of the window and what every tab shares.
 *
 * The period and Vergelijk met come from the window's own ReportFiltersProvider (the presets of
 * the reports page); category, brand, type, build year, km band (admin) and supplier live here.
 * `useAnalysisParams` gives the query string every /api/reports/maintenance-analysis/* request
 * sends, so the tabs, the drill-down and the print all read the same filter.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { UserRole } from "@shared/schema";
import { MAINTENANCE_NULL_KEY, modelWithoutBrand } from "@shared/maintenance-analysis";
import { useAuth } from "@/hooks/use-auth";
import { useHidePrices } from "@/components/ui/price";
import { formatCurrency } from "@/lib/format-utils";
import { useComparisonRange, useReportFilters } from "../report-filters";

export const ANALYSIS_ENDPOINT = "/api/reports/maintenance-analysis";

/** The filters of the window besides the period; "" = not filtered. */
export interface AnalysisExtraFilters {
  brand: string;
  /** Brand-free type ("DUCATO"). */
  model: string;
  yearFrom: string;
  yearTo: string;
  /** Admin only. */
  kmBand: string;
  /** Supplier key, REPORT_DRILL_NULL_KEY for "Onbekend". */
  supplier: string;
}

export const NO_EXTRA_FILTERS: AnalysisExtraFilters = { brand: "", model: "", yearFrom: "", yearTo: "", kmBand: "", supplier: "" };

interface AnalysisContextValue {
  extra: AnalysisExtraFilters;
  setExtra(patch: Partial<AnalysisExtraFilters>): void;
  clearExtra(): void;
  isAdmin: boolean;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const [extra, setState] = useState<AnalysisExtraFilters>(NO_EXTRA_FILTERS);
  const setExtra = useCallback((patch: Partial<AnalysisExtraFilters>) => setState((prev) => ({ ...prev, ...patch })), []);
  const clearExtra = useCallback(() => setState(NO_EXTRA_FILTERS), []);
  const value = useMemo(() => ({ extra, setExtra, clearExtra, isAdmin }), [extra, setExtra, clearExtra, isAdmin]);
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return ctx;
}

const YEAR = /^\d{4}$/;

/** The query string of every analysis request: period, category and the filters that are set. */
export function useAnalysisParams(): Record<string, string> {
  const { from, to, category } = useReportFilters();
  const { extra, isAdmin } = useAnalysis();
  return useMemo(() => {
    const p: Record<string, string> = { from, to };
    if (category !== "all") p.category = category;
    if (extra.brand) p.brand = extra.brand;
    if (extra.model) p.model = extra.model;
    if (YEAR.test(extra.yearFrom)) p.yearFrom = extra.yearFrom;
    if (YEAR.test(extra.yearTo)) p.yearTo = extra.yearTo;
    // Van after tot (2022 – 2019) means 2019 – 2022: swapped, so the server never answers 400.
    if (p.yearFrom && p.yearTo && Number(p.yearFrom) > Number(p.yearTo)) [p.yearFrom, p.yearTo] = [p.yearTo, p.yearFrom];
    if (isAdmin && extra.kmBand) p.kmBand = extra.kmBand;
    if (extra.supplier) p.supplier = extra.supplier;
    return p;
  }, [from, to, category, extra, isAdmin]);
}

/** The params plus the comparison period when Vergelijk met is set (for the overview tiles). */
export function useComparedAnalysisParams(): { params: Record<string, string>; compareRange: { from: string; to: string } | null } {
  const params = useAnalysisParams();
  const compareRange = useComparisonRange(params.from, params.to);
  const withCompare = useMemo(
    () => (compareRange ? { ...params, compareFrom: compareRange.from, compareTo: compareRange.to } : params),
    [params, compareRange],
  );
  return { params: withCompare, compareRange };
}

/** Money as text, masked for a user with "Prijzen verbergen". Per km gets three decimals. */
export function useMoneyText(): (n: number | null | undefined, perKm?: boolean) => string {
  const hide = useHidePrices();
  return useCallback((n: number | null | undefined, perKm?: boolean) => {
    if (hide) return "•••";
    if (n === null || n === undefined || !Number.isFinite(n)) return "–";
    if (!perKm) return formatCurrency(n);
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n);
  }, [hide]);
}

export const countText = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toLocaleString("nl-NL"));

/** A brand as text: null or empty (a car without a brand, or removed without snapshot) is "Onbekend". */
export const brandText = (t: TFunction, brand: string | null | undefined): string => brand || t("maintenanceAnalysis.unknownBrand");

/** The type without the brand in front; null or empty is "Onbekend". */
export const typeText = (t: TFunction, brand: string | null | undefined, model: string | null | undefined): string =>
  modelWithoutBrand(brand, model) || t("maintenanceAnalysis.unknownModel");

/** The filter / drill value of a brand or type: null or empty is MAINTENANCE_NULL_KEY ("__null"). */
export const nameKey = (name: string | null | undefined): string => name || MAINTENANCE_NULL_KEY;

const SHARED_EMPTY: unknown[] = [];
/**
 * One shared empty list for "no data yet": `data?.x ?? []` makes a new array on every render,
 * which reruns every memo that depends on it and can loop through a table's onView (setState).
 * Never mutate the result.
 */
export function noRows<T>(): T[] {
  return SHARED_EMPTY as T[];
}

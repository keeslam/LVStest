import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { officeToday } from "@/lib/office-date";

export type ReportPreset = "thisMonth" | "lastMonth" | "nextMonth" | "thisQuarter" | "thisYear" | "all" | "custom";

/** "Alle gegevens": the old wide range, past and future. */
export const ALL_DATA_RANGE = { from: "2000-01-01", to: "2050-12-31" } as const;

/** True for the "Alle gegevens" range; the period is then named, not written as 2000 - 2050. */
export function isAllDataRange(from: string, to: string): boolean {
  return from <= ALL_DATA_RANGE.from && to >= ALL_DATA_RANGE.to;
}

export interface ReportFilters {
  from: string;
  to: string;
  preset: ReportPreset;
  /** "all" or a vehicle id. */
  vehicleId: string;
  /** "all" or a category. */
  category: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Range of a preset on the office calendar. `today` is "yyyy-MM-dd"; a quarter is a calendar quarter. */
export function presetRange(preset: Exclude<ReportPreset, "custom">, today: string): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  switch (preset) {
    case "thisMonth":
      return { from: iso(year, month, 1), to: iso(year, month, lastDay(year, month)) };
    case "lastMonth": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    }
    case "nextMonth": {
      const y = month === 12 ? year + 1 : year;
      const m = month === 12 ? 1 : month + 1;
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    }
    case "thisQuarter": {
      const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const endMonth = startMonth + 2;
      return { from: iso(year, startMonth, 1), to: iso(year, endMonth, lastDay(year, endMonth)) };
    }
    case "thisYear":
      return { from: iso(year, 1, 1), to: iso(year, 12, 31) };
    case "all":
      return { ...ALL_DATA_RANGE };
  }
}

type ReportFiltersApi = ReportFilters & {
  setPreset(preset: Exclude<ReportPreset, "custom">): void;
  setRange(from: string, to: string): void;
  setVehicle(id: string): void;
  setCategory(category: string): void;
};

const ReportFiltersContext = createContext<ReportFiltersApi | null>(null);

export function ReportFiltersProvider({ children, initial }: { children?: ReactNode; initial?: Partial<ReportFilters> }) {
  const [state, setState] = useState<ReportFilters>(() => ({
    ...presetRange("thisMonth", officeToday()),
    preset: "thisMonth",
    vehicleId: "all",
    category: "all",
    ...initial,
  }));

  const setPreset = useCallback((preset: Exclude<ReportPreset, "custom">) => {
    setState((prev) => ({ ...prev, ...presetRange(preset, officeToday()), preset }));
  }, []);
  const setRange = useCallback((from: string, to: string) => {
    // A range typed the wrong way round is turned around ("yyyy-MM-dd" compares as text).
    const [start, end] = from <= to ? [from, to] : [to, from];
    setState((prev) => ({ ...prev, from: start, to: end, preset: "custom" }));
  }, []);
  const setVehicle = useCallback((vehicleId: string) => setState((prev) => ({ ...prev, vehicleId })), []);
  const setCategory = useCallback((category: string) => setState((prev) => ({ ...prev, category })), []);

  const value = useMemo(
    () => ({ ...state, setPreset, setRange, setVehicle, setCategory }),
    [state, setPreset, setRange, setVehicle, setCategory],
  );
  return <ReportFiltersContext.Provider value={value}>{children}</ReportFiltersContext.Provider>;
}

export function useReportFilters(): ReportFiltersApi {
  const ctx = useContext(ReportFiltersContext);
  if (!ctx) throw new Error("useReportFilters must be used inside ReportFiltersProvider");
  return ctx;
}

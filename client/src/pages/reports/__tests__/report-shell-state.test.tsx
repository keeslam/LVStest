/**
 * Reports redesign part 1, task 1: filter context, report registry, remembered selection.
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiRequest = vi.fn(async (..._a: unknown[]) => new Response("{}"));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...a: unknown[]) => apiRequest(...a),
  invalidateByPrefix: vi.fn(),
}));

import { presetRange, ReportFiltersProvider, useReportFilters } from "@/pages/reports/report-filters";
import { visibleTabs, visibleReports, REPORT_TABS, type ReportAccess, type ReportDef } from "@/pages/reports/report-registry";
import { useReportSelection } from "@/pages/reports/use-report-selection";

const Dummy = () => null;
const access: ReportAccess = { isAdmin: false, has: () => true, canViewFiscal: false };
const def = (id: string, tab: ReportDef["tab"], visible = true): ReportDef => ({
  id, tab, titleKey: id, visible: () => visible, Component: Dummy,
});

describe("presetRange", () => {
  it("computes the presets on the office calendar", () => {
    expect(presetRange("thisMonth", "2026-10-25")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("lastMonth", "2026-10-25")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("thisQuarter", "2026-10-25")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("thisYear", "2026-10-25")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("useReportFilters", () => {
  it("setRange switches the preset to custom", () => {
    const { result } = renderHook(() => useReportFilters(), { wrapper: ReportFiltersProvider });
    expect(result.current.preset).toBe("thisMonth");
    act(() => result.current.setRange("2026-02-01", "2026-02-10"));
    expect(result.current.preset).toBe("custom");
    expect(result.current.from).toBe("2026-02-01");
    expect(result.current.to).toBe("2026-02-10");
  });
});

describe("visibleTabs", () => {
  it("lists only tabs with at least one visible report, in tab order", () => {
    const reports = [def("a", "vehicles"), def("b", "portal", false)];
    expect(visibleTabs(access, reports)).toEqual(["vehicles"]);
    expect(visibleReports(access, reports).map((r) => r.id)).toEqual(["a"]);
    expect(REPORT_TABS).toEqual(["overview", "expenses", "vehicles", "customers", "transports", "financial", "fiscal", "portal", "office"]);
  });
});

describe("useReportSelection", () => {
  const reports = [def("a", "vehicles"), def("b", "vehicles"), def("c", "customers")];
  let saved: unknown = null;

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, queryFn: async () => saved } },
    });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    apiRequest.mockClear();
    saved = null;
    window.history.replaceState(null, "", "/reports");
  });

  it("falls back to the first visible report for a forbidden id", () => {
    window.history.replaceState(null, "", "/reports?tab=vehicles&report=verboden");
    const { result } = renderHook(() => useReportSelection(access, reports), { wrapper });
    expect(result.current.tab).toBe("vehicles");
    expect(result.current.reportId).toBe("a");
  });

  it("uses the remembered report of a tab and writes a changed choice", async () => {
    saved = { value: { vehicles: "b" } };
    const { result } = renderHook(() => useReportSelection(access, reports), { wrapper });
    expect(result.current.tab).toBe("vehicles");
    await waitFor(() => expect(result.current.reportId).toBe("b"));
    act(() => result.current.select("customers"));
    expect(result.current.tab).toBe("customers");
    act(() => result.current.select("vehicles"));
    expect(result.current.reportId).toBe("b");
    apiRequest.mockClear();
    act(() => result.current.select("vehicles", "a"));
    expect(result.current.reportId).toBe("a");
    expect(apiRequest).toHaveBeenCalledWith("PUT", "/api/user-settings/reports_last_selected", { value: { vehicles: "a" } });
  });
});

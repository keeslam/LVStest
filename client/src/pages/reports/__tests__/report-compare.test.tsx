/**
 * Rapporten herontwerp deel 1b, Task 4: compare every period number with the previous period
 * or the same period last year. Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

import { comparisonRange, ReportFiltersProvider, type ReportFilters } from "@/pages/reports/report-filters";
import { deltaLabel } from "@/components/reports/kit/report-tiles";
import { ReportPrintProvider, PrintButtonInner } from "@/components/reports/kit/report-print";
import { FinesReportCard } from "@/pages/reports/fines-report-card";
import { OccupancyReportCard } from "@/pages/reports/occupancy-report-card";
import { ReportFilterBar } from "@/pages/reports/report-filter-bar";
import { OverviewReport } from "@/pages/reports/overview-report";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let calls: string[] = [];
function install(answer: (path: string) => Response | null) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    calls.push(path);
    return answer(path) ?? json([]);
  }));
}

function renderIn(node: ReactNode, initial: Partial<ReportFilters>) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider initial={initial}>
        <ReportPrintProvider>
          {node}
          <PrintButtonInner title="Rapport" />
        </ReportPrintProvider>
      </ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => { role = UserRole.ADMIN; });
afterEach(() => { vi.unstubAllGlobals(); });

const zero = { count: 0, amount: 0 };
const fines = (total: { count: number; amount: number }) => ({
  tiles: { new: zero, linked: zero, cancelled: zero, legacy: zero, total },
  avgDaysToLink: null, byMonth: [], byCustomer: [], byVehicle: [], byDriver: [],
});

describe("comparisonRange", () => {
  it("previous: as many days right before from", () => {
    expect(comparisonRange("2026-10-01", "2026-10-31", "previous")).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(comparisonRange("2026-10-01", "2026-10-01", "previous")).toEqual({ from: "2026-09-30", to: "2026-09-30" });
  });
  it("lastYear: the same dates a year earlier, 29-2 becomes 28-2", () => {
    expect(comparisonRange("2026-10-01", "2026-10-31", "lastYear")).toEqual({ from: "2025-10-01", to: "2025-10-31" });
    expect(comparisonRange("2028-02-29", "2028-02-29", "lastYear")).toEqual({ from: "2027-02-28", to: "2027-02-28" });
  });
  it("none: null", () => {
    expect(comparisonRange("2026-10-01", "2026-10-31", "none")).toBeNull();
  });
});

describe("deltaLabel", () => {
  it("shows the change in percent with an arrow, and 'nieuw' when the old number is 0", () => {
    expect(deltaLabel(112, 100)).toEqual({ text: "↑ 12%", dir: "up" });
    expect(deltaLabel(80, 100)).toEqual({ text: "↓ 20%", dir: "down" });
    expect(deltaLabel(100, 100)).toEqual({ text: "0%", dir: "flat" });
    expect(deltaLabel(5, 0).text).toBe("nieuw");
    expect(deltaLabel(0, 0)).toEqual({ text: "0%", dir: "flat" });
    // A negative old number (a margin): the direction follows the difference.
    expect(deltaLabel(-50, -100)).toEqual({ text: "↑ 50%", dir: "up" });
  });
});

describe("fines card compared with last year", () => {
  it("asks a second summary with last year's dates and shows the old number and the change", async () => {
    install((path) => {
      if (path.startsWith("/api/reports/fines/summary") && path.includes("2025-10-01")) return json(fines({ count: 4, amount: 100 }));
      if (path.startsWith("/api/reports/fines/summary")) return json(fines({ count: 5, amount: 80 }));
      return null;
    });
    renderIn(<FinesReportCard />, { from: "2026-10-01", to: "2026-10-31", preset: "custom", compare: "lastYear" });
    expect(await screen.findByTestId("fines-tile-total-value")).toHaveTextContent("80");
    const previous = await screen.findByTestId("fines-tile-total-previous");
    await waitFor(() => expect(previous).toHaveTextContent("100"));
    // Fines: fewer is better, so 80 against 100 is a fall shown green.
    const delta = screen.getByTestId("fines-tile-total-delta");
    expect(delta).toHaveTextContent("↓ 20%");
    expect(delta.className).toContain("text-green");
    const summaries = calls.filter((p) => p.startsWith("/api/reports/fines/summary"));
    expect(summaries.some((p) => p.includes("from=2025-10-01") && p.includes("to=2025-10-31"))).toBe(true);
    expect(summaries.some((p) => p.includes("from=2026-10-01") && p.includes("to=2026-10-31"))).toBe(true);
  });

  it("without comparing: one summary and no old number", async () => {
    install((path) => (path.startsWith("/api/reports/fines/summary") ? json(fines({ count: 5, amount: 80 })) : null));
    renderIn(<FinesReportCard />, { from: "2026-10-01", to: "2026-10-31", preset: "custom" });
    await screen.findByTestId("fines-tile-total-value");
    expect(screen.queryByTestId("fines-tile-total-previous")).toBeNull();
    expect(calls.filter((p) => p.startsWith("/api/reports/fines/summary"))).toHaveLength(1);
  });

  it("'Alle gegevens' never compares", async () => {
    install((path) => (path.startsWith("/api/reports/fines/summary") ? json(fines({ count: 5, amount: 80 })) : null));
    renderIn(<FinesReportCard />, { from: "2000-01-01", to: "2050-12-31", preset: "all", compare: "previous" });
    await screen.findByTestId("fines-tile-total-value");
    expect(screen.queryByTestId("fines-tile-total-previous")).toBeNull();
    expect(calls.filter((p) => p.startsWith("/api/reports/fines/summary"))).toHaveLength(1);
  });

  it("the print shows the old number and names the comparison period", async () => {
    install((path) => {
      if (path.startsWith("/api/reports/fines/summary") && path.includes("2025-10-01")) return json(fines({ count: 4, amount: 100 }));
      if (path.startsWith("/api/reports/fines/summary")) return json(fines({ count: 5, amount: 80 }));
      return null;
    });
    const user = userEvent.setup();
    renderIn(<FinesReportCard />, { from: "2026-10-01", to: "2026-10-31", preset: "custom", compare: "lastYear" });
    await waitFor(() => expect(screen.getByTestId("fines-tile-total-previous")).toHaveTextContent("100"));
    await user.click(await screen.findByTestId("button-report-print"));
    const frame = await screen.findByTestId("print-preview-frame", undefined, { timeout: 4000 });
    const html = frame.getAttribute("srcdoc") ?? "";
    expect(html).toContain("Vergeleken met 1-10-2025 t/m 31-10-2025");
    expect(html).toContain("↓ 20%");
  });
});

describe("occupancy compared with a period the server refuses", () => {
  it("shows a dash for the old number and does not crash", async () => {
    const summary = {
      tiles: { rented: { count: 3, amount: 30 }, replacement: zero, workshop: zero, available: zero },
      avgPct: 50, days: [],
    };
    install((path) => {
      if (path.startsWith("/api/reports/occupancy/summary") && path.includes("2025-")) {
        return json({ message: "Periode te lang", code: "PERIOD_TOO_LONG" }, 400);
      }
      if (path.startsWith("/api/reports/occupancy/summary")) return json(summary);
      return null;
    });
    role = UserRole.ADMIN;
    renderIn(<OccupancyReportCard />, { from: "2026-10-01", to: "2026-10-31", preset: "custom", compare: "lastYear" });
    expect(await screen.findByTestId("occupancy-tile-rented-value")).toHaveTextContent("3");
    await waitFor(() => expect(screen.getByTestId("occupancy-tile-rented-previous")).toHaveTextContent("–"));
    expect(screen.queryByTestId("occupancy-tile-rented-delta")).toBeNull();
  });
});

describe("overview compared with the previous period", () => {
  it("compares margin and late deliveries, never the to-do counts", async () => {
    install((path) => {
      if (path.startsWith("/api/reports/vehicle-financials") && path.includes("from=2026-08-31")) return json({ rows: [], totals: { margin: 1000 } });
      if (path.startsWith("/api/reports/vehicle-financials")) return json({ rows: [], totals: { margin: 1200 } });
      if (path.startsWith("/api/reports/deliveries/summary") && path.includes("from=2026-08-31")) return json({ tiles: { late: { count: 2, amount: 0 } } });
      if (path.startsWith("/api/reports/deliveries/summary")) return json({ tiles: { late: { count: 3, amount: 0 } } });
      if (path.startsWith("/api/reports/fines/summary")) return json(fines({ count: 1, amount: 1 }));
      return null;
    });
    renderIn(
      <OverviewReport shown={new Set(["vehicle-financials", "deliveries", "fines"])} tabOf={() => undefined} onOpen={() => {}} />,
      { from: "2026-10-01", to: "2026-10-31", preset: "custom", compare: "previous" },
    );
    await waitFor(() => expect(screen.getByTestId("overview-tile-margin-delta")).toHaveTextContent("↑ 20%"));
    expect(screen.getByTestId("overview-tile-margin-delta").className).toContain("text-green");
    await waitFor(() => expect(screen.getByTestId("overview-tile-deliveriesLate-delta")).toHaveTextContent("↑ 50%"));
    expect(screen.getByTestId("overview-tile-deliveriesLate-delta").className).toContain("text-red");
    expect(screen.queryByTestId("overview-tile-finesOpen-previous")).toBeNull();
    // The open fines are asked once, over all periods.
    expect(calls.filter((p) => p.startsWith("/api/reports/fines/summary"))).toHaveLength(1);
  });
});

describe("filter bar", () => {
  it("offers Vergelijk met, and disables it for Alle gegevens with a hint", async () => {
    install(() => null);
    renderIn(<ReportFilterBar showCategory={false} onOpenReportBuilder={() => {}} onOpenMaintenanceCosts={() => {}} />,
      { from: "2000-01-01", to: "2050-12-31", preset: "all" });
    expect(screen.getByText("Vergelijk met")).toBeInTheDocument();
    expect(screen.getByTestId("select-report-compare")).toBeDisabled();
    expect(screen.getByTestId("report-compare-all-hint")).toBeInTheDocument();
  });
});

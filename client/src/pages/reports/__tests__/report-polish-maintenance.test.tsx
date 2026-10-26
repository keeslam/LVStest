/**
 * Rapport-polish (Kees, 2026-10-26), onderhoudsanalyse:
 * 2. Merken: Per km shows "–" for a brand without cost per km, never "€ 0,000".
 * 4. Trends: the table lists only real months (counts "van 2"), forecast months have their own table.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: ["view_reports", "view_vehicles"], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, ComposedChart: Passthrough,
    Pie: () => null, Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, LabelList: () => null,
  };
});

import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const period = { from: "2026-01-01", to: "2026-12-31" };
const line = { perVehicleMonth: 20, vehicles: 3, vehiclesWithCosts: 3, count: 5, rated: true };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const path = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (path.endsWith("/maintenance-analysis/overview")) return json({ ...period, tiles: { total: 500, perVehicleMonth: 20, count: 6 }, byCategory: [], topVehicles: [] });
    if (path.endsWith("/maintenance-analysis/brands")) {
      return json({
        ...period,
        brands: [{ ...line, brand: "FIAT", total: 400, perKm: 0 }, { ...line, brand: "OPEL", total: 300, perKm: 0.031 }],
        models: [], kmBands: [],
      });
    }
    if (path.endsWith("/maintenance-analysis/trends")) {
      return json({
        ...period,
        months: [{ month: "2026-01", amount: 100 }, { month: "2026-02", amount: 400 }],
        forecast: [{ month: "2026-03", amount: 30 }, { month: "2026-04", amount: 30 }, { month: "2026-05", amount: 30 }],
        forecastVehicles: [{ vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "DUCATO", band: "50–100.000", kmPerDay: 50, perKm: 0.02, amount: 90 }],
      });
    }
    return json(null);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderWindow() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);
}

describe("2. Merken, Per km", () => {
  it("shows – for no cost per km and the amount when there is one", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    const table = await screen.findByTestId("ma-brands-table");
    const fiat = within(table).getByTestId("ma-brands-row-FIAT").closest("tr")!;
    expect(fiat.textContent).not.toContain("0,000");
    expect(fiat.textContent).toContain("–");
    expect(within(table).getByTestId("ma-brands-row-OPEL").closest("tr")!.textContent).toContain("0,031");
  });
});

describe("4. Trends, forecast table", () => {
  it("counts only the real months and lists the forecast months apart", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-trends"));
    const table = await screen.findByTestId("ma-trends-table");
    expect(within(table).getAllByTestId(/^ma-trends-table-row-/)).toHaveLength(2);
    expect(table.textContent).not.toMatch(/van 5/);
    const fc = await screen.findByTestId("ma-forecast-months-table");
    expect(within(fc).getAllByTestId(/^ma-forecast-months-table-row-/)).toHaveLength(3);
  });
});

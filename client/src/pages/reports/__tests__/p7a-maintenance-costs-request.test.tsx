/**
 * Fix round 2 (package P7a): the period and the brand of "Analyse onderhoudskosten"
 * must reach the server. The query key used to carry them as plain strings at
 * index 1, which the default query function ignores, so every selection fetched
 * the bare URL and showed all-time totals. This test uses the real query function
 * and reads the URLs that were requested.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough,
    Pie: Passthrough, Cell: () => null, Bar: () => null, Line: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

const payload = {
  totalCosts: 500, averageCostPerVehicle: 250, averageCostPerKm: 0.5, costPerKmAvailable: true, totalVehicles: 2,
  categories: ["maintenance", "tires", "brakes"],
  categoryBreakdown: [{ category: "maintenance", amount: 500, percentage: 100 }],
  brandComparison: [{ brand: "TOYOTA", totalCost: 500, avgCost: 250, vehicleCount: 2, expenseCount: 6 }],
  vehicleDetails: [], monthlyTrend: [],
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("maintenance costs request URL", () => {
  it("asks the server for the chosen period and brand, and omits the brand when it is 'all'", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      urls.push((typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, ""));
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);

    await screen.findByTestId("text-total-costs");
    expect(urls).toEqual(["/api/reports/maintenance-costs?timeRange=all"]);

    await user.click(screen.getByTestId("select-time-range"));
    await user.click(await screen.findByRole("option", { name: "Afgelopen jaar" }));
    await waitFor(() => expect(urls).toContain("/api/reports/maintenance-costs?timeRange=year"));

    await user.click(await screen.findByTestId("select-brand"));
    await user.click(await screen.findByRole("option", { name: "TOYOTA" }));
    await waitFor(() => expect(urls).toContain("/api/reports/maintenance-costs?timeRange=year&brand=TOYOTA"));
  });
});

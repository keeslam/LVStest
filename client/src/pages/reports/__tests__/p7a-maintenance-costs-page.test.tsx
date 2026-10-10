/**
 * Audit A-14-2 / A-14-8 (package P7a): the display rules of "Analyse onderhoudskosten".
 * - category keys go through formatExpenseCategory (no raw "tires", "fuel");
 * - cost per km is an en dash when there are no kilometres, never "EUR 0,00";
 * - a brand is rated only when there are enough cost lines under it;
 * - the monthly trend is labelled in Dutch ("mei 2026"), not "May 2026".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", hidePrices: false }, isLoading: false }),
}));
// recharts needs a measured container; the data is what these tests look at.
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough,
    Pie: Passthrough, Cell: () => null, Bar: () => null, Line: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

const report = {
  totalCosts: 500,
  averageCostPerVehicle: 250,
  averageCostPerKm: null,
  totalVehicles: 2,
  categories: ["maintenance", "tires", "brakes"],
  categoryBreakdown: [
    { category: "maintenance", amount: 300, percentage: 60 },
    { category: "tires", amount: 200, percentage: 40 },
  ],
  brandComparison: [
    { brand: "TOYOTA", totalCost: 475, avgCost: 237.5, vehicleCount: 2, expenseCount: 6 },
    { brand: "AUDIT", totalCost: 25.5, avgCost: 25.5, vehicleCount: 1, expenseCount: 1 },
  ],
  vehicleDetails: [
    { vehicleId: 1, licensePlate: "AB123C", brand: "TOYOTA", model: "Yaris", totalCost: 475, costPerKm: null, currentMileage: 0, expenseCount: 6 },
  ],
  monthlyTrend: [{ month: "2026-05", amount: 10 }, { month: "2026-06", amount: 20 }],
};

function renderPage(payload: unknown = report) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => payload, retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);
}

describe("Analyse onderhoudskosten display rules", () => {
  it("shows a Dutch label for each category, never the stored key", async () => {
    renderPage();
    await screen.findByTestId("text-total-costs");
    expect(screen.getAllByText("Onderhoud").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Banden").length).toBeGreaterThan(0);
    expect(screen.queryByText("tires")).toBeNull();
    expect(screen.queryByText("maintenance")).toBeNull();
  });

  it("names what it counts and the base of the cost per km", async () => {
    renderPage();
    const note = await screen.findByTestId("maintenance-costs-scope-note");
    expect(note).toHaveTextContent("Onderhoud, Banden, Remmen");
  });

  it("shows an en dash for cost per km when there are no kilometres", async () => {
    renderPage();
    expect(await screen.findByTestId("text-cost-per-km")).toHaveTextContent("–");
    expect(screen.getByTestId("text-cost-per-km")).not.toHaveTextContent("0,00");
  });

  it("rates a brand only with enough cost lines, otherwise says there is too little data", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-brands"));
    const rows = await screen.findAllByRole("row");
    const audit = rows.find((r) => within(r).queryByText("AUDIT"))!;
    expect(audit).toHaveTextContent("Onvoldoende gegevens");
    expect(audit).not.toHaveTextContent("Uitstekend");
    const toyota = rows.find((r) => within(r).queryByText("TOYOTA"))!;
    expect(toyota).not.toHaveTextContent("Onvoldoende gegevens");
  });

  it("labels the months of the trend in Dutch", async () => {
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tab-trends"));
    // The chart is mocked away; the labels are also offered as a table for screen readers.
    const table = await screen.findByTestId("maintenance-trend-table");
    expect(within(table).getByText("mei 2026")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/May 2026/);
  });
});

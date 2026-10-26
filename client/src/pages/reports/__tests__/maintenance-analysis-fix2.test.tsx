/**
 * Onderhoudsanalyse (Kees, 2026-10-26), fix round 2 (client):
 * 1. The forecast line starts on the last real month, so the two lines join.
 * 2. The Alle kosten table with Leverancier fits at 1280px: wide enough, amount never cut.
 * 3. The Kostendetails window shows the Leverancier.
 * 4. Duurste auto's: the panel may shrink in its grid cell and the table scrolls inside it.
 * 5. Chart labels: every name under the bars (interval 0, angled, shortened).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: ["view_reports", "view_vehicles"], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({ openVehicleDialog: () => {}, openExpenseVehicleDialog: () => {}, openExpenseDialog: () => {} }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const h = React.createElement;
  const Passthrough = ({ children }: any) => h("div", null, children);
  const chart = (kind: string) => ({ children }: any) => h("div", { "data-testid": `chart-${kind}` }, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: chart("bar"), LineChart: chart("line"), PieChart: chart("pie"), ComposedChart: chart("composed"),
    Pie: () => null, Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, LabelList: () => null,
  };
});

import { chartRowsOf } from "@/pages/reports/maintenance-analysis/trends-tab";
import { LABEL_AXIS, shortLabel } from "@/pages/reports/maintenance-analysis/analysis-chart";
import { ExpenseListTable } from "@/components/expenses/expense-list-table";
import { ExpenseDetailDialog } from "@/components/expenses/expense-detail-dialog";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const newClient = () => new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });

const expense = {
  id: 7, vehicleId: 3, category: "maintenance", amount: "45.50", date: "2026-10-01", description: "Grote beurt met een heel lange omschrijving die niet past",
  supplier: "Garage Jansen Autoservice", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z",
  vehicle: { licensePlate: "AB123C", brand: "VW", model: "Golf" },
};
const period = { from: "2026-01-01", to: "2026-12-31" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "");
    const path = url.split("?")[0];
    if (path === "/api/expenses") return json({ rows: [expense], total: 1, totalAmount: 45.5 });
    if (path === "/api/expenses/7") return json(expense);
    if (path === "/api/vehicles/3") return json({ id: 3, licensePlate: "AB-123-C", brand: "VW", model: "Golf" });
    if (path.endsWith("/maintenance-analysis/overview")) {
      return json({ ...period, tiles: { total: 500, perVehicleMonth: 20, count: 6 }, byCategory: [],
        topVehicles: [{ vehicleId: 7, licensePlate: "AB123C", brand: "VW", model: "Golf", total: 400, count: 5, perMonth: 30 }] });
    }
    return json(null);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("1. Trends chart rows", () => {
  it("the forecast starts on the last real month; the table rows stay as they are", () => {
    const rows = [{ month: "2026-09", amount: 100 }, { month: "2026-10", amount: 300 }, { month: "2026-11", forecast: 250 }, { month: "2026-12", forecast: 250 }];
    const chart = chartRowsOf(rows);
    expect(chart.map((r) => r.forecast)).toEqual([undefined, 300, 250, 250]);
    expect(rows[1]).toEqual({ month: "2026-10", amount: 300 });
  });
  it("without a forecast nothing changes", () => {
    const rows = [{ month: "2026-09", amount: 100 }];
    expect(chartRowsOf(rows)).toBe(rows);
  });
});

describe("2. Alle kosten table with Leverancier", () => {
  it("is wide enough for six columns, truncates text cells and never cuts the amount", async () => {
    render(<QueryClientProvider client={newClient()}><ExpenseListTable filters={{}} /></QueryClientProvider>);
    const row = await screen.findByTestId("row-expense-7");
    const table = row.closest("table")!;
    const minRem = Number(/min-w-\[(\d+)rem\]/.exec(table.className)?.[1] ?? 0);
    expect(minRem).toBeGreaterThanOrEqual(64);
    const supplier = screen.getByTestId("cell-supplier-7");
    expect(supplier.querySelector("span")).toHaveClass("truncate");
    expect(supplier.querySelector("span")).toHaveAttribute("title", "Garage Jansen Autoservice");
    const desc = screen.getByTitle(expense.description);
    expect(desc).toHaveClass("truncate");
    const amountCell = [...row.querySelectorAll("td")].find((td) => td.textContent?.includes("45,50"));
    expect(amountCell).toHaveClass("whitespace-nowrap");
    // The table scrolls sideways inside its card instead of overlapping.
    expect(table.parentElement).toHaveClass("overflow-auto");
  });
});

describe("3. Kostendetails", () => {
  it("shows the Leverancier", async () => {
    render(<QueryClientProvider client={newClient()}><ExpenseDetailDialog expenseId={7} open onOpenChange={() => {}} /></QueryClientProvider>);
    const field = await screen.findByTestId("detail-supplier");
    expect(field).toHaveTextContent("Garage Jansen Autoservice");
    expect(screen.getByText("Leverancier")).toBeInTheDocument();
  });
});

describe("4. Duurste auto's", () => {
  it("lets the panel shrink in the half-width grid cell and scroll inside", async () => {
    render(<QueryClientProvider client={newClient()}><MaintenanceCostsPage /></QueryClientProvider>);
    const wrapper = await screen.findByTestId("ma-top-vehicles");
    expect(wrapper).toHaveClass("overflow-x-auto");
    expect(wrapper.closest("[class*='min-w-0']")).not.toBeNull();
    expect(wrapper.closest(".rounded-lg")).toHaveClass("min-w-0");
  });
});

describe("5. Chart labels", () => {
  it("shows every label: interval 0, angled, long names shortened", () => {
    expect(LABEL_AXIS.interval).toBe(0);
    expect(LABEL_AXIS.angle).toBeLessThan(0);
    expect(shortLabel("Garage Jansen Autoservice Eindhoven")).toMatch(/…$/);
    expect(shortLabel("Garage Jansen Autoservice Eindhoven").length).toBeLessThanOrEqual(18);
    expect(shortLabel("Jansen")).toBe("Jansen");
  });
});

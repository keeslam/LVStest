/**
 * Audit A-14-4, A-14-10, A-14-11 (package P7a): the filters of /reports.
 * - the category filter offers the categories that occur in the data, not a fixed list;
 * - the cost trend honours the category filter;
 * - the vehicle filter is searchable by plate, typed with or without dashes;
 * - something visible (role=status) tells that numbers are loading.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, vehicle, daysFromNow } from "./p7a-harness";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, Pie: Passthrough,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

import ReportsPage from "@/pages/reports/index";

afterEach(() => { vi.unstubAllGlobals(); });

const fleet = [vehicle(1, "AB123C"), vehicle(2, "CD456E", "Audi", "A3")];
const expenses = [
  { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "tanken" },
  { id: 2, vehicleId: 1, category: "Fuel", amount: "10.00", date: daysFromNow(0), description: "tanken" }, // old capitalised row
  { id: 3, vehicleId: 2, category: "toll", amount: "5.00", date: daysFromNow(0), description: "tol" },
  { id: 4, vehicleId: 2, category: "maintenance", amount: "100.00", date: daysFromNow(0), description: "beurt" },
];

async function openCategories(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId("select-report-category"));
  return screen.findAllByRole("option");
}

describe("category filter (A-14-4)", () => {
  it("offers only the categories that occur in the data, 'Fuel' and 'fuel' as one", async () => {
    installFetch({ vehicles: fleet, expenses });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    // wait for the data, otherwise the list is still empty
    await waitFor(() => expect(screen.getAllByText(/€ 155,00/).length).toBeGreaterThan(0));
    const options = (await openCategories(user)).map((o) => o.textContent);
    expect(options).toEqual(["Alle categorieën", "Onderhoud", "Brandstof", "Tol"]);
    expect(options).not.toContain("Voorruit");
    expect(options).not.toContain("Reparatie");
  });

  it("narrows the cost trend to the chosen category", async () => {
    installFetch({ vehicles: fleet, expenses });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    const trend = await screen.findByTestId("reports-expense-trend");
    await waitFor(() => expect(within(trend).getAllByText("€ 155,00").length).toBeGreaterThan(0));
    await openCategories(user);
    await user.click(screen.getByRole("option", { name: "Onderhoud" }));
    await waitFor(() => expect(within(screen.getByTestId("reports-expense-trend")).getAllByText("€ 100,00").length).toBeGreaterThan(0));
    expect(within(screen.getByTestId("reports-expense-trend")).queryByText("€ 155,00")).toBeNull();
  });
});

describe("vehicle filter (A-14-11)", () => {
  it("finds a vehicle by plate, with or without dashes, without a type tab in between", async () => {
    installFetch({ vehicles: fleet, expenses });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("select-report-vehicle"));
    const search = await screen.findByPlaceholderText(/kenteken/i);
    await user.type(search, "cd456e");
    await waitFor(() => expect(screen.queryByText("Toyota Yaris")).toBeNull());
    expect(screen.getByText("Audi A3")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sedan" })).toBeNull();
  });
});

describe("loading state (A-14-10)", () => {
  it("shows a status line while the data loads and removes it when the numbers are there", async () => {
    installFetch({ vehicles: fleet, expenses, delayExpenses: 300 });
    renderWithClient(<ReportsPage />);
    const status = await screen.findByTestId("reports-loading");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent(/laden|bijgewerkt/i);
    await waitFor(() => expect(screen.queryByTestId("reports-loading")).toBeNull(), { timeout: 3000 });
  });
});

describe("tabs that ignore the category filter say so (fix round 1, M-2)", () => {
  it("shows a one-line note on Fiscaal, Transporten and Voertuigen once a category is chosen, and not before", async () => {
    installFetch({
      vehicles: fleet, expenses,
      extra: { "/api/fiscal/reports/monthly": { year: 2026, notStarted: false, totals: { amount: 0, settled: 0, provisional: 0, chargedMonths: 0, periods: 0, unassessedPeriods: 0 }, byCustomer: [], rows: [], columns: [] } },
    });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await waitFor(() => expect(screen.getAllByText(/€ 155,00/).length).toBeGreaterThan(0));
    // before a category is chosen no tab shows the note
    for (const tab of ["tab-report-transports", "tab-report-fiscal"]) {
      await user.click(await screen.findByTestId(tab));
      expect(screen.queryByTestId("category-filter-note")).toBeNull();
    }
    await user.click(screen.getByRole("tab", { name: /Voertuigen/ }));
    expect(screen.queryByTestId("category-filter-note")).toBeNull();
    await openCategories(user);
    await user.click(screen.getByRole("option", { name: "Onderhoud" }));
    for (const tab of ["tab-report-transports", "tab-report-fiscal"]) {
      await user.click(await screen.findByTestId(tab));
      expect(await screen.findByTestId("category-filter-note"), tab).toHaveTextContent("Onderhoud");
    }
    await user.click(screen.getByRole("tab", { name: /Voertuigen/ }));
    expect(await screen.findByTestId("category-filter-note")).toHaveTextContent(/APK en garantie/);
    await user.click(screen.getByRole("tab", { name: /Kosten/ }));
    expect(screen.queryByTestId("category-filter-note")).toBeNull();
  });
});

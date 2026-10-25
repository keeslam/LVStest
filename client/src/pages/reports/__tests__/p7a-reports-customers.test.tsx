/**
 * Audit A-14-5 (package P7a): the Klanten tab of /reports.
 * - "Kostencategorieen per klant" has a column for each category in the data,
 *   so a customer with EUR 732 of costs is not a row of dashes;
 * - reservation statuses are Dutch ("Voltooid", not "Completed");
 * - "recent" reservations never lie in the future;
 * - the impact label stands apart from the amount ("EUR 28,19 Laag").
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, vehicle, daysFromNow, chooseRange, openReport } from "./p7a-harness";

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

const fixture = {
  vehicles: [vehicle(1, "AB123C"), vehicle(2, "CD456E", "Audi", "A3")],
  customers: [{ id: 1, name: "Klant Een" }],
  reservations: [
    { id: 1, customerId: 1, vehicleId: 1, startDate: daysFromNow(-10), endDate: daysFromNow(-5), status: "completed" },
    { id: 2, customerId: 1, vehicleId: 2, startDate: daysFromNow(-3), endDate: daysFromNow(-1), status: "picked_up" },
    { id: 3, customerId: 1, vehicleId: 1, startDate: daysFromNow(20), endDate: daysFromNow(25), status: "booked" },
  ],
  expenses: [
    { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(-8), description: "tanken" },
    { id: 2, vehicleId: 2, category: "toll", amount: "12.50", date: daysFromNow(-2), description: "tol" },
  ],
};

async function openCustomersTab() {
  const user = userEvent.setup();
  renderWithClient(<ReportsPage />);
  // Task 2: the default period is this month now; take the last 30 days like the old default,
  // and open the old customers report (the tab opens on Klantwaarde).
  await chooseRange(user, daysFromNow(-30), daysFromNow(0));
  await openReport(user, "customers", "legacy-customers");
  return user;
}

describe("Klanten tab (A-14-5)", () => {
  it("has a cost column per category in the data and fills it", async () => {
    installFetch(fixture);
    await openCustomersTab();
    const table = await screen.findByTestId("customer-category-costs");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Brandstof", "Tol"]));
    expect(headers).not.toContain("Reparatie");
    const row = within(table).getByText("Klant Een").closest("tr")!;
    expect(row).toHaveTextContent("€ 40,00");
    expect(row).toHaveTextContent("€ 12,50");
  });

  it("writes reservation statuses in Dutch", async () => {
    installFetch(fixture);
    await openCustomersTab();
    const list = await screen.findByTestId("customer-recent-reservations");
    expect(within(list).getByText("Voltooid")).toBeInTheDocument();
    expect(within(list).getByText("Opgehaald")).toBeInTheDocument();
    expect(list).not.toHaveTextContent(/Completed|Picked Up|Booked/);
  });

  it("does not list a reservation that starts in the future as recent", async () => {
    installFetch(fixture);
    const user = await openCustomersTab();
    // the period filter must cover the future, otherwise the row is gone for another reason
    await chooseRange(user, daysFromNow(-30), daysFromNow(30));
    // the reservations of the new period arrive after the change
    await waitFor(() => {
      const rows = within(screen.getByTestId("customer-recent-reservations")).getAllByRole("row").slice(1); // minus header
      expect(rows).toHaveLength(2);
    });
    const list = screen.getByTestId("customer-recent-reservations");
    expect(list).not.toHaveTextContent("Geboekt");
  });

  it("puts a space between the cost per day and the impact label", async () => {
    installFetch(fixture);
    await openCustomersTab();
    const impact = await screen.findByTestId("customer-impact-table");
    const cell = within(impact).getByText("Klant Een").closest("tr")!.lastElementChild!;
    expect(cell.textContent).toMatch(/€\s?\d+,\d{2}\s+(Laag|Gemiddeld|Hoog)/);
  });
});

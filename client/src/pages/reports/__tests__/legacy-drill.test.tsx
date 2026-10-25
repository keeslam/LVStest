/**
 * Rapporten herontwerp deel 1b, Task 2: the reports the browser computes itself open the rows
 * behind a number in ReportRowsDialog: a line of "Kosten per categorie" shows exactly the costs
 * of that category, with CSV and Afdrukken; a vehicle line of "Voertuigbenutting" shows its
 * reservations; a customer of "Klantimpactanalyse" shows reservations and costs.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, vehicle, daysFromNow, openReport } from "./p7a-harness";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, Pie: Passthrough,
    ComposedChart: Passthrough, AreaChart: Passthrough, Area: () => null,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});
const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));

import ReportsPage from "@/pages/reports/index";

afterEach(() => {
  vi.unstubAllGlobals();
  role = UserRole.ADMIN;
  downloadCsv.mockClear();
});

const fleet = [vehicle(1, "AA01BB", "Toyota", "Yaris"), vehicle(2, "AA02BB", "Ford", "Focus")];
const expenses = [
  { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "tanken" },
  { id: 2, vehicleId: 2, category: "fuel", amount: "25.00", date: daysFromNow(0), description: "tanken 2" },
  { id: 3, vehicleId: 2, category: "toll", amount: "5.00", date: daysFromNow(0), description: "tol" },
  { id: 4, vehicleId: 1, category: "maintenance", amount: "100.00", date: daysFromNow(0), description: "beurt" },
];
const customers = [{ id: 7, name: "Klant A" }, { id: 8, name: "Klant B" }];
const reservations = [
  { id: 11, vehicleId: 1, customerId: 7, startDate: daysFromNow(-1), endDate: daysFromNow(1), status: "confirmed" },
  { id: 12, vehicleId: 2, customerId: 8, startDate: daysFromNow(-1), endDate: daysFromNow(1), status: "confirmed" },
];
const setup = () => installFetch({ vehicles: fleet, expenses, customers, reservations } as any);

describe("Kosten per categorie: een regel opent de kosten erachter", () => {
  it("klik op Brandstof toont precies de brandstofkosten; CSV levert die regels", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-by-category");
    const table = await screen.findByTestId("expenses-by-category-table");
    await user.click(await within(table).findByTestId("expenses-by-category-table-row-fuel"));

    const dialog = await screen.findByTestId("dialog-legacy-rows");
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent("Brandstof");
    expect(within(dialog).getByTestId("legacy-rows-count")).toHaveTextContent("2 regels");
    const rows = within(dialog).getAllByTestId(/^legacy-rows-table-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid")).sort()).toEqual(["legacy-rows-table-row-1", "legacy-rows-table-row-2"]);

    await user.click(within(dialog).getByTestId("button-legacy-rows-csv"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [subject, header, lines] = downloadCsv.mock.calls[0] as any[];
    expect(subject).toMatch(/brandstof$/);
    expect(header).toContain("Omschrijving");
    expect((lines as string[][]).map((l) => l[header.indexOf("Omschrijving")]).sort()).toEqual(["tanken", "tanken 2"]);

    await user.click(within(dialog).getByTestId("button-legacy-rows-print"));
    expect(await screen.findByTestId("dialog-report-print")).toBeInTheDocument();
  });

  it("de tegel Totale kosten toont alle kosten van de periode", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-by-category");
    await user.click(await screen.findByTestId("button-expenses-by-category-tile-total"));
    const dialog = await screen.findByTestId("dialog-legacy-rows");
    await waitFor(() => expect(within(dialog).getByTestId("legacy-rows-count")).toHaveTextContent("4 regels"));
  });
});

describe("Voertuigbenutting en klantimpact", () => {
  it("een voertuig opent zijn reserveringen", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "vehicle-utilization");
    const table = await screen.findByTestId("vehicle-utilization-table");
    await user.click(await within(table).findByTestId("vehicle-utilization-table-row-2"));
    const dialog = await screen.findByTestId("dialog-legacy-rows");
    expect(within(dialog).getAllByTestId(/^legacy-rows-table-row-/).map((r) => r.getAttribute("data-testid"))).toEqual(["legacy-rows-table-row-12"]);
    expect(within(dialog).getByText("Klant B")).toBeInTheDocument();
  });

  it("een klant opent zijn reserveringen en de kosten die meetellen", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-customers"));
    await user.click(await screen.findByTestId("report-nav-item-customer-impact"));
    const table = await screen.findByTestId("customer-impact-table");
    await user.click(await within(table).findByTestId("customer-impact-table-row-7"));
    const dialog = await screen.findByTestId("dialog-legacy-rows");
    expect(within(dialog).getAllByTestId(/^legacy-rows-table-row-/).map((r) => r.getAttribute("data-testid"))).toEqual(["legacy-rows-table-row-11"]);
    // Vehicle 1's costs during the rental: fuel 40 and maintenance 100.
    const costs = within(dialog).getByTestId("legacy-rows-table-1");
    expect(within(costs).getAllByTestId(/^legacy-rows-table-1-row-/).map((r) => r.getAttribute("data-testid")).sort())
      .toEqual(["legacy-rows-table-1-row-1", "legacy-rows-table-1-row-4"]);
  });
  it("klantimpact: een kost die onder twee reserveringen van dezelfde auto valt staat maar één keer in de lijst", async () => {
    installFetch({
      vehicles: fleet, expenses, customers,
      reservations: [...reservations, { id: 13, vehicleId: 1, customerId: 7, startDate: daysFromNow(-1), endDate: daysFromNow(1), status: "confirmed" }],
    } as any);
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-customers"));
    await user.click(await screen.findByTestId("report-nav-item-customer-impact"));
    const table = await screen.findByTestId("customer-impact-table");
    await user.click(await within(table).findByTestId("customer-impact-table-row-7"));
    const dialog = await screen.findByTestId("dialog-legacy-rows");
    const costs = within(dialog).getByTestId("legacy-rows-table-1");
    expect(within(costs).getAllByTestId(/^legacy-rows-table-1-row-/).map((r) => r.getAttribute("data-testid")))
      .toEqual(["legacy-rows-table-1-row-1", "legacy-rows-table-1-row-4"]);
  });
});

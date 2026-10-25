/**
 * Rapporten herontwerp deel 1, Task 5: the old inline reports are reports of their own,
 * three of them merged (Voertuigbenutting, Kosten per categorie, Kosten en opbrengst per
 * voertuig). Every report registers its print content and uses the report table.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPermission, UserRole } from "@shared/schema";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import type { PrintSection } from "@/components/reports/kit/report-print";
import { installFetch, renderWithClient, vehicle, daysFromNow, openReport } from "./p7a-harness";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
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
// What the report in the pane registers for printing, last call first.
const captured = vi.hoisted(() => ({ sections: null as PrintSection[] | null }));
vi.mock("@/components/reports/kit/report-print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/kit/report-print")>();
  return {
    ...actual,
    useReportPrint: (sections: PrintSection[] | null) => {
      captured.sections = sections;
      actual.useReportPrint(sections);
    },
  };
});

import ReportsPage from "@/pages/reports/index";

afterEach(() => {
  vi.unstubAllGlobals();
  role = UserRole.ADMIN;
  permissions = [];
});

// 23 vehicles: AA-01-BB ... AA-23-BB, no APK or warranty date.
const fleet = Array.from({ length: 23 }, (_, i) => vehicle(i + 1, `AA${String(i + 1).padStart(2, "0")}BB`, "Toyota", `Model ${i + 1}`));
const expenses = [
  { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "tanken" },
  { id: 2, vehicleId: 2, category: "toll", amount: "5.00", date: daysFromNow(0), description: "tol" },
  { id: 3, vehicleId: 3, category: "maintenance", amount: "100.00", date: daysFromNow(0), description: "beurt" },
];
const transports = [
  { id: 1, vehicleId: 1, transportType: "swap", status: "completed", originCity: "Zuidland", destinationCity: "Spijkenisse", scheduledDate: daysFromNow(-2), tollCost: null, billable: false, billableAmount: null, invoiced: false },
  { id: 2, vehicleId: 2, transportType: "tow", status: "scheduled", originCity: "Rotterdam", destinationCity: "Delft", scheduledDate: daysFromNow(-1), tollCost: "4.50", billable: true, billableAmount: "80.00", invoiced: false },
  { id: 3, vehicleId: 3, transportType: "delivery", status: "completed", originCity: "Breda", destinationCity: "Tilburg", scheduledDate: daysFromNow(0), tollCost: null, billable: false, billableAmount: null, invoiced: false },
];
// 12 vehicles with revenue: more than one page of the table.
const financialRows = Array.from({ length: 12 }, (_, i) => ({
  vehicleId: i + 1, licensePlate: `AA${String(i + 1).padStart(2, "0")}BB`, brand: "Toyota", model: `Model ${i + 1}`, dailyPrice: 50,
  rentals: 1, rentalDays: 2, revenue: 100 * (i + 1), extraCosts: 0, expenses: 10, expensesByCategory: {}, margin: 100 * (i + 1) - 10,
}));
const sum = (key: "revenue" | "expenses" | "margin" | "rentals" | "rentalDays") => financialRows.reduce((s, r) => s + r[key], 0);
const financials = {
  rows: financialRows,
  totals: { rentals: sum("rentals"), rentalDays: sum("rentalDays"), revenue: sum("revenue"), extraCosts: 0, expenses: sum("expenses"), margin: sum("margin") },
};

const setup = () => installFetch({ vehicles: fleet, expenses, transports, extra: { "/api/reports/vehicle-financials": financials } });

describe("Voertuigbenutting (merged)", () => {
  it("shows 10 of the 23 vehicles, finds one by plate and prints tiles, chart and all 23 rows", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "vehicle-utilization");
    const table = await screen.findByTestId("vehicle-utilization-table");
    await waitFor(() => expect(within(table).getAllByTestId(/^vehicle-utilization-table-row-/)).toHaveLength(10));
    expect(screen.getByTestId("vehicle-utilization-average")).toHaveTextContent("0%");

    await user.type(within(table).getByTestId("vehicle-utilization-table-search"), formatLicensePlate("AA17BB"));
    await waitFor(() => expect(within(table).getAllByTestId(/^vehicle-utilization-table-row-/)).toHaveLength(1));
    expect(within(table).getByTestId("vehicle-utilization-table-row-17")).toBeInTheDocument();
    await user.clear(within(table).getByTestId("vehicle-utilization-table-search"));

    await waitFor(async () => {
      const kinds = captured.sections?.map((s) => s.kind);
      expect(kinds).toEqual(["tiles", "chart", "table"]);
      const tableSection = captured.sections!.find((s) => s.kind === "table") as Extract<PrintSection, { kind: "table" }>;
      expect((await tableSection.allRows()).rows).toHaveLength(23);
      expect(tableSection.pageRows).toHaveLength(10);
    });
  });
});

describe("Kosten", () => {
  it("lists Kosten per categorie, Kostentrends and Kosten in deze periode; the trend keeps its testid and says it ignores the period", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-expenses"));
    const nav = await screen.findByTestId("report-nav");
    expect(within(nav).getByTestId("report-nav-item-expenses-by-category")).toBeInTheDocument();
    expect(within(nav).getByTestId("report-nav-item-expenses-in-period")).toBeInTheDocument();
    await user.click(within(nav).getByTestId("report-nav-item-expense-trend"));
    expect(await screen.findByTestId("reports-expense-trend")).toBeInTheDocument();
    expect(screen.getByTestId("report-pane-note")).toHaveTextContent("Altijd de laatste 3 maanden.");
  });

  it("Kosten per categorie: a table per category with a total row", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-by-category");
    const totals = await screen.findByTestId("expenses-by-category-table-totals");
    await waitFor(() => expect(totals).toHaveTextContent(formatCurrency(145).replace(/\s/g, " ")));
    expect(within(screen.getByTestId("expenses-by-category-table")).getAllByTestId(/^expenses-by-category-table-row-/)).toHaveLength(3);
  });

  it("is not there for a user without manage_expenses: no Kosten tab and no expense reports", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_VEHICLES];
    setup();
    renderWithClient(<ReportsPage />);
    expect(await screen.findByTestId("tab-report-vehicles")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-expenses")).toBeNull();
    for (const id of ["expenses-by-category", "expense-trend", "expenses-in-period", "maintenance-cost-by-vehicle"]) {
      expect(screen.queryByTestId(`report-nav-item-${id}`)).toBeNull();
    }
    // Vehicles alone: APK and warranty are there, utilization (needs reservations too) is not.
    expect(screen.getByTestId("report-nav-item-apk-overview")).toBeInTheDocument();
    expect(screen.getByTestId("report-nav-item-warranty")).toBeInTheDocument();
    expect(screen.queryByTestId("report-nav-item-vehicle-utilization")).toBeNull();
  });
});

describe("Kosten en opbrengst per voertuig (merged)", () => {
  it("has a total row that is the sum of the rows and a CSV with every row, not only the page", async () => {
    setup();
    downloadCsv.mockClear();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "financial", "vehicle-financials");
    const table = await screen.findByTestId("vehicle-financials-table");
    await waitFor(() => expect(within(table).getAllByTestId(/^vehicle-financials-table-row-/)).toHaveLength(10));
    const totals = within(table).getByTestId("vehicle-financials-table-totals");
    const text = (totals.textContent ?? "").replace(/\s/g, " ");
    expect(text).toContain(formatCurrency(7800).replace(/\s/g, " "));
    expect(text).toContain(formatCurrency(120).replace(/\s/g, " "));
    expect(text).toContain(formatCurrency(7680).replace(/\s/g, " "));

    await user.click(screen.getByTestId("button-financial-csv"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [, , rows] = downloadCsv.mock.calls[0] as any[];
    expect(rows).toHaveLength(13); // 12 vehicles + total
    expect(rows[12][0]).toBe("Totaal");
    expect(rows[12][5]).toBe("7800,00");
  });
});

describe("Transporten", () => {
  it("prints exactly the two ticked rows with 'Alleen aangevinkte', and says period and vehicle do not apply", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "transports", "transports");
    expect(await screen.findByTestId("report-pane-note")).toHaveTextContent("Periode en voertuig gelden niet voor dit rapport.");
    await screen.findByTestId("transports-table-row-3");
    await user.click(screen.getByTestId("checkbox-select-transport-report-1"));
    await user.click(screen.getByTestId("checkbox-select-transport-report-3"));

    await user.click(screen.getByTestId("button-report-print"));
    const dialog = await screen.findByTestId("dialog-report-print");
    const rowsSelect = within(dialog).getByTestId("print-option-rows") as HTMLSelectElement;
    expect([...rowsSelect.options].map((o) => o.textContent)).toContain("Alleen aangevinkte");
    fireEvent.change(rowsSelect, { target: { value: "selected" } });
    await waitFor(() => {
      const html = within(dialog).getByTestId("print-preview-frame").getAttribute("srcdoc") ?? "";
      expect(html).toContain("Zuidland");
      expect(html).toContain("Breda");
      expect(html).not.toContain("Rotterdam");
    });
  });
});

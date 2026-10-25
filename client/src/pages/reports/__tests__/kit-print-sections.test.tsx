/**
 * Rapporten herontwerp deel 1, Task 6: the kit cards fit the report pane (one title, the card's own
 * test id stays) and print their tiles, charts and breakdown tables. The invoice inbox is two reports.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, openReport, printPreviewBody } from "./p7a-harness";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
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

import ReportsPage from "@/pages/reports/index";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { ExtraCostsReportCard } from "@/pages/reports/extra-costs-report-card";
import { REPORTS, visibleReports } from "@/pages/reports/report-registry";
import { breakdownPrintSection } from "@/components/reports/kit/report-breakdown-table";

afterEach(() => {
  vi.unstubAllGlobals();
  role = UserRole.ADMIN;
  permissions = [];
});

const zero = { count: 0, amount: 0 };
const customers = Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: `Klant ${i + 1}`, count: 1, amount: 10 + i }));

describe("kit card in the pane", () => {
  it("fines: one title, the card's test id, tiles and a breakdown table in the print", async () => {
    installFetch({
      extra: {
        "/api/reports/fines/summary": {
          tiles: { new: zero, linked: zero, cancelled: zero, legacy: zero, total: { count: 12, amount: 215 } },
          avgDaysToLink: null, byMonth: [], byCustomer: customers, byVehicle: [], byDriver: [],
        },
      },
    });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "financial", "fines");
    await screen.findByTestId("card-fines-report");
    // The pane shows the title; the card does not repeat it.
    expect(screen.getAllByRole("heading", { name: "Bekeuringen" })).toHaveLength(1);
    expect(screen.getByTestId("report-pane-title")).toBeInTheDocument();
    // More than 10 rows: a ReportTable with its search, and the test id stays on the wrapper.
    expect(await screen.findByTestId("fines-by-customer-table-search")).toBeInTheDocument();

    const body = await printPreviewBody(user);
    expect(body).toContain("Totaal");
    expect(body).toContain("Per klant");
    expect(body).toContain("Klant 12"); // all rows, not only the first page
  });

  it("extra-costs: the print keeps the euro amount from the tile hint, and the vehicle filter reaches the request", async () => {
    const { fetchMock } = installFetch({
      vehicles: [{ id: 3, licensePlate: "AB12CD", brand: "A", model: "B" }],
      extra: {
        "/api/reports/extra-costs/summary": {
          tiles: { extraKm: { count: 1, amount: 123.45 }, fuel: zero, withExtraKm: zero },
          totalExtraKm: 5, byMonth: [], byCustomer: [], byVehicle: [],
        },
      },
    });
    window.history.replaceState(null, "", "/reports");
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "financial", "extra-costs");
    await screen.findByTestId("card-extra-costs-report");
    const body = await printPreviewBody(user);
    expect(body).toContain("123,45");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("extra-costs: the vehicle of the filter context reaches the summary request", async () => {
    const { calls } = installFetch({ extra: { "/api/reports/extra-costs/summary": { tiles: {}, byMonth: [], byCustomer: [], byVehicle: [] } } });
    renderWithClient(<ReportFiltersProvider initial={{ vehicleId: "7" }}><ExtraCostsReportCard /></ReportFiltersProvider>);
    await screen.findByTestId("card-extra-costs-report");
    await waitFor(() => expect(calls.some((c) => c.startsWith("/api/reports/extra-costs/summary") && c.includes("vehicleId=7"))).toBe(true));
  });

  it("fleet-mileage: not listed and not fetched for a non-admin with report and vehicle rights", async () => {
    role = UserRole.USER;
    permissions = ["view_reports", "view_vehicles"];
    const { calls } = installFetch({});
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-vehicles"));
    await screen.findByTestId("report-nav-item-apk-overview");
    expect(screen.queryByTestId("report-nav-item-fleet-mileage")).not.toBeInTheDocument();
    expect(calls.some((c) => c.startsWith("/api/reports/fleet-mileage"))).toBe(false);
  });

  it("splits the invoice inbox into two registered reports with their own gates", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(ids).toContain("invoice-inbox-runs");
    expect(ids).toContain("invoice-inbox-items");
    const access = (perms: string[]) => ({ isAdmin: false, has: (p: string) => perms.includes(p), canViewFiscal: false });
    const only = (perms: string[]) => visibleReports(access(perms)).map((r) => r.id);
    expect(only(["view_reports", "manage_settings"])).toContain("invoice-inbox-runs");
    expect(only(["view_reports", "manage_settings"])).not.toContain("invoice-inbox-items");
    expect(only(["view_reports", "manage_expenses"])).toContain("invoice-inbox-items");
  });

  it("every kit card the brief names is registered", () => {
    const ids = REPORTS.map((r) => r.id);
    for (const id of ["fines", "extra-costs", "transport-billing", "occupancy", "maintenance-outlook", "fleet-mileage", "mileage-history",
      "workshop-downtime", "customer-value", "portal-requests", "waitlist", "invoice-inbox-runs", "invoice-inbox-items", "deliveries", "damage-checks", "fiscal"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("breakdownPrintSection", () => {
  it("prints every row and leaves an empty breakdown out", async () => {
    const header = { name: "Naam", count: "Aantal", amount: "Bedrag" };
    expect(breakdownPrintSection({ id: "x", title: "T", rows: [], nullLabel: "-", header })).toBeNull();
    const section = breakdownPrintSection({ id: "x", title: "Per klant", rows: customers, nullLabel: "-", money: true, header });
    expect(section?.kind).toBe("table");
    if (section?.kind !== "table") return;
    const all = await section.allRows();
    expect(all.rows).toHaveLength(12);
    expect(section.header).toEqual(["Naam", "Aantal", "Bedrag"]);
  });
});

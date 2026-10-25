/**
 * Rapporten herontwerp deel 1b, final fix: a click inside the quick view (closing it, "Openen in
 * nieuw tabblad") must not bubble through the React portal to the table row's onRowClick.
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, vehicle, openReport } from "./p7a-harness";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
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

import ReportsPage from "@/pages/reports/index";

afterEach(() => vi.unstubAllGlobals());

const fleet = [vehicle(1, "AA01BB", "Toyota", "Yaris")];

describe("quick view clicks do not reach the table row", () => {
  it("closing the vehicle quick view does not open the drill list", async () => {
    installFetch({ vehicles: fleet, expenses: [], customers: [], reservations: [] } as any);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "vehicle-utilization");
    const table = await screen.findByTestId("vehicle-utilization-table");
    await user.click(await within(table).findByTestId("link-entity-vehicle-1"));
    const quick = await screen.findByTestId("dialog-entity-vehicle");
    await user.click(within(quick).getByRole("button", { name: "Sluiten" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-entity-vehicle")).not.toBeInTheDocument());
    expect(screen.queryByTestId("dialog-legacy-rows")).not.toBeInTheDocument();
    expect(quick).toBeDefined();
  });

  it("Openen in nieuw tabblad does not open the drill list", async () => {
    installFetch({ vehicles: fleet, expenses: [], customers: [], reservations: [] } as any);
    vi.stubGlobal("open", vi.fn());
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "vehicle-utilization");
    const table = await screen.findByTestId("vehicle-utilization-table");
    await user.click(await within(table).findByTestId("link-entity-vehicle-1"));
    const quick = await screen.findByTestId("dialog-entity-vehicle");
    await user.click(await within(quick).findByTestId("button-entity-open"));
    expect(screen.queryByTestId("dialog-legacy-rows")).not.toBeInTheDocument();
  });
});

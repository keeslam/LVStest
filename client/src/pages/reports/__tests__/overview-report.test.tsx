/**
 * Rapporten herontwerp deel 1, Task 7: the Overzicht tab (eight key numbers, each opens its report)
 * and the counts in the report list. Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-10-25",
}));
vi.mock("@/pages/reports/report-builder", () => ({ default: () => <div data-testid="stub-report-builder" /> }));
vi.mock("@/pages/reports/maintenance-costs", () => ({ default: () => <div data-testid="stub-maintenance-costs" /> }));
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tile = (count: number) => ({ count, amount: 0 });
let newFines = 3;
let requested: string[] = [];

function respond(url: string): Response {
  requested.push(url);
  if (url.startsWith("/api/user-settings/")) return json(null);
  if (url.startsWith("/api/reports/vehicle-financials")) return json({ rows: [], totals: { rentals: 0, rentalDays: 0, revenue: 5000, expenses: 1500, margin: 3500 } });
  if (url.startsWith("/api/reports/occupancy/summary")) return json({ tiles: {}, days: [], avgPct: 62.5 });
  if (url.startsWith("/api/reports/fines/summary")) return json({ tiles: { new: tile(newFines) }, byMonth: [], byCustomer: [], byVehicle: [], byDriver: [], avgDaysToLink: null });
  if (url.startsWith("/api/reports/maintenance-outlook/summary")) return json({ tiles: { overdue: tile(2) }, items: [] });
  if (url.startsWith("/api/reports/invoice-inbox-items/summary")) return json({ tiles: { waiting: tile(4) } });
  if (url.startsWith("/api/reports/deliveries/summary")) return json({ tiles: { late: tile(5) } });
  if (url.startsWith("/api/reports/portal-requests/summary")) return json({ tiles: { open: tile(6) } });
  if (url.startsWith("/api/vehicles")) return json([
    { id: 1, licensePlate: "AA11BB", brand: "A", model: "B", apkDate: "2020-01-01" },
    { id: 2, licensePlate: "CC22DD", brand: "A", model: "B", apkDate: "2099-01-01" },
    { id: 3, licensePlate: "EE33FF", brand: "A", model: "B", apkDate: null },
  ]);
  return json([]);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/reports");
  newFines = 3;
  requested = [];
  role = UserRole.ADMIN;
  permissions = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => respond(String(input))));
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}><ReportsPage /></QueryClientProvider>);
}

const IDS = ["margin", "occupancy", "finesOpen", "apkOverdue", "maintenanceOverdue", "invoicesWaiting", "deliveriesLate", "portalOpen"];

describe("Overzicht tab", () => {
  it("shows eight tiles with their numbers for an admin", async () => {
    renderPage();
    for (const id of IDS) expect(await screen.findByTestId(`overview-tile-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Overzicht");
    await waitFor(() => expect(screen.getByTestId("overview-tile-finesOpen-value")).toHaveTextContent("3"));
    expect(screen.getByTestId("overview-tile-occupancy-value")).toHaveTextContent("62,5%");
    expect(screen.getByTestId("overview-tile-apkOverdue-value")).toHaveTextContent("1");
    expect(screen.getByTestId("overview-tile-maintenanceOverdue-value")).toHaveTextContent("2");
    expect(screen.getByTestId("overview-tile-invoicesWaiting-value")).toHaveTextContent("4");
    expect(screen.getByTestId("overview-tile-deliveriesLate-value")).toHaveTextContent("5");
    expect(screen.getByTestId("overview-tile-portalOpen-value")).toHaveTextContent("6");
    expect(screen.getByTestId("overview-tile-margin-value").textContent).toMatch(/3\.500/);
  });

  it("a tile opens its report on the right tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("overview-tile-finesOpen"));
    await waitFor(() => expect(screen.getByTestId("tab-report-financial")).toHaveAttribute("data-state", "active"));
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Bekeuringen"));
    expect(window.location.search).toContain("tab=financial&report=fines");
  });

  it("a user with report + fines rights sees the fines and margin tiles, not the invoice tile, and nothing is asked for hidden ones", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    renderPage();
    expect(await screen.findByTestId("overview-tile-finesOpen")).toBeInTheDocument();
    expect(screen.getByTestId("overview-tile-margin")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-tile-invoicesWaiting")).toBeNull();
    expect(screen.queryByTestId("overview-tile-portalOpen")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("overview-tile-finesOpen-value")).toHaveTextContent("3"));
    expect(requested.some((u) => u.startsWith("/api/reports/invoice-inbox-items"))).toBe(false);
    expect(requested.some((u) => u.startsWith("/api/reports/portal-requests"))).toBe(false);
    expect(requested.some((u) => u.startsWith("/api/reports/deliveries"))).toBe(false);
  });
});

describe("counts in the report list", () => {
  it("shows the number of new fines as a badge", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-report-financial"));
    const nav = await screen.findByTestId("report-nav");
    expect(await within(nav).findByTestId("report-nav-badge-fines")).toHaveTextContent("3");
  });

  it("shows no badge when the count is 0", async () => {
    newFines = 0;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-report-financial"));
    const nav = await screen.findByTestId("report-nav");
    await waitFor(() => expect(requested.some((u) => u.startsWith("/api/reports/fines/summary"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(within(nav).queryByTestId("report-nav-badge-fines")).toBeNull();
  });
});

/**
 * Rapporten herontwerp deel 2, Task 3: a saved builder report with a tab shows on that tab like
 * any report. It runs within the period and vehicle of the filter bar, has a table, a chart when
 * grouped, CSV and Afdrukken, and Bewerken opens the report builder on it.
 *
 * Runs in the jsdom project. Renders with the app's own query client: the report builder
 * refreshes the saved list through invalidateByPrefix, which works on that client.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-10-25",
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  // A chart draws an svg.recharts-surface, which the print copies.
  const Surface = ({ children }: any) => React.createElement("div", null,
    React.createElement("svg", { className: "recharts-surface", width: 100, height: 50 }), children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Surface, LineChart: Surface, PieChart: Surface, Pie: Passthrough,
    ComposedChart: Surface, AreaChart: Surface, Area: () => null,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

import ReportsPage from "@/pages/reports/index";

const finesReport = {
  id: 7, name: "Bekeuringen per maand", description: "", createdBy: "x", createdAt: "2026-10-01",
  configuration: {
    name: "Bekeuringen per maand", dataSources: ["fines"], filters: [],
    columns: [
      { field: "offenceAt", table: "fines", label: "Offence Date" },
      { field: "amount", table: "fines", label: "Amount", aggregation: "SUM" },
    ],
    groupBy: [{ field: "offenceAt", table: "fines", period: "month" }],
    tab: "financial", periodField: "offenceAt",
  },
};
const customersReport = {
  id: 8, name: "Alle klanten", description: "", createdBy: "x", createdAt: "2026-10-01",
  configuration: {
    name: "Alle klanten", dataSources: ["customers"], filters: [], groupBy: [],
    columns: [{ field: "name", table: "customers", label: "Name" }],
    tab: "customers",
  },
};
const untabbedReport = {
  id: 9, name: "Zonder tabblad", description: "", createdBy: "x", createdAt: "2026-10-01",
  configuration: {
    name: "Zonder tabblad", dataSources: ["vehicles"], filters: [], groupBy: [],
    columns: [{ field: "brand", table: "vehicles", label: "Brand" }],
  },
};

let saved: any[] = [];
let savedDelay = 0;
let calls: { method: string; path: string; body: any }[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ method, path, body });
    const bare = path.split("?")[0];
    if (method === "DELETE" && bare.startsWith("/api/reports/saved/")) {
      const id = Number(bare.split("/").pop());
      saved = saved.filter((r) => r.id !== id);
      return new Response(null, { status: 204 });
    }
    if (method === "PUT" && bare.startsWith("/api/reports/saved/")) {
      const id = Number(bare.split("/").pop());
      saved = saved.map((r) => (r.id === id ? { ...r, name: body.name, configuration: body } : r));
      return json(saved.find((r) => r.id === id));
    }
    if (method === "POST" && bare === "/api/reports/execute") {
      if (body?.dataSources?.[0] === "fines") return json([{ offenceAt: "2026-10", amount: "215.5" }]);
      return json([{ name: "Jansen" }]);
    }
    if (bare === "/api/reports/saved") {
      if (savedDelay) await new Promise((r) => setTimeout(r, savedDelay));
      return json(saved);
    }
    if (bare === "/api/vehicles") return json([{ id: 3, licensePlate: "AB12CD", brand: "Audi", model: "A3" }]);
    return json([]);
  }));
}

const executeCalls = () => calls.filter((c) => c.method === "POST" && c.path === "/api/reports/execute");

function renderPage(url: string) {
  window.history.replaceState(null, "", url);
  return render(<QueryClientProvider client={queryClient}><ReportsPage /></QueryClientProvider>);
}

beforeEach(() => {
  role = UserRole.ADMIN;
  permissions = [];
  saved = [finesReport, customersReport, untabbedReport];
  savedDelay = 0;
  calls = [];
  installFetch();
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("saved builder reports on their tab", () => {
  it("shows on Financieel with the own-report mark, runs within the period, with table, chart and print", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial");
    const nav = await screen.findByTestId("report-nav");
    const item = await within(nav).findByTestId("report-nav-item-saved-7");
    expect(item).toHaveTextContent("Bekeuringen per maand");
    expect(within(item).getByTestId("report-nav-saved-icon")).toBeInTheDocument();
    // Only on its own tab; a report without a tab is not on any tab.
    expect(within(nav).queryByTestId("report-nav-item-saved-8")).toBeNull();
    expect(screen.queryByTestId("report-nav-item-saved-9")).toBeNull();

    await user.click(item);
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Bekeuringen per maand"));
    expect(window.location.search).toContain("report=saved-7");
    await waitFor(() => expect(executeCalls().length).toBeGreaterThan(0));
    const sent = executeCalls().at(-1)!.body;
    expect(sent.scope).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(sent.dataSources).toEqual(["fines"]);
    expect(sent.periodField).toBe("offenceAt");

    expect(await screen.findByTestId("saved-report-table")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-chart")).toBeInTheDocument();
    expect(screen.getByTestId("button-saved-report-csv")).toHaveTextContent("CSV");
    expect(screen.queryByTestId("saved-report-period-note")).toBeNull();
    expect(screen.queryByTestId("saved-report-vehicle-note")).toBeNull();

    await user.click(screen.getByTestId("button-report-print"));
    expect(await screen.findByTestId("print-option-table")).toBeInTheDocument();
    expect(await screen.findByTestId("print-option-chart")).toBeInTheDocument();
  });

  it("a vehicle in the filter bar goes along as scope.vehicleId", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial&report=saved-7");
    await waitFor(() => expect(executeCalls().length).toBeGreaterThan(0));
    await user.click(await screen.findByTestId("select-report-vehicle"));
    await user.click(await screen.findByText("Audi A3"));
    await waitFor(() => expect(executeCalls().at(-1)!.body.scope).toEqual({ from: "2026-10-01", to: "2026-10-31", vehicleId: 3 }));
  });

  it("without a period field or a vehicle column the report says so", async () => {
    renderPage("/reports?tab=customers&report=saved-8");
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Alle klanten"));
    expect(await screen.findByTestId("saved-report-period-note")).toHaveTextContent("Periode geldt niet voor dit rapport.");
    expect(screen.getByTestId("saved-report-vehicle-note")).toHaveTextContent("Voertuig geldt niet voor dit rapport.");
    // No vehicle column on the source: the vehicle is not sent.
    await waitFor(() => expect(executeCalls().length).toBeGreaterThan(0));
    expect(executeCalls().at(-1)!.body.scope).toEqual({});
  });

  it("Alle gegevens sends no period, so rows with an empty date are kept", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial&report=saved-7");
    await waitFor(() => expect(executeCalls().length).toBeGreaterThan(0));
    expect(executeCalls().at(-1)!.body.scope).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    await user.click(await screen.findByTestId("select-report-preset"));
    await user.click(await screen.findByRole("option", { name: "Alle gegevens" }));
    await waitFor(() => expect(executeCalls().at(-1)!.body.scope).toEqual({}));
  });

  it("someone without the fines right does not get it; the URL falls back", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    renderPage("/reports?tab=financial&report=saved-7");
    const nav = await screen.findByTestId("report-nav");
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toBeInTheDocument());
    expect(within(nav).queryByTestId("report-nav-item-saved-7")).toBeNull();
    expect(screen.queryByTestId("report-pane-saved-7")).toBeNull();
    expect(executeCalls()).toHaveLength(0);
  });

  it("waits for the saved list instead of flashing the first report of the tab", async () => {
    savedDelay = 150;
    renderPage("/reports?tab=financial&report=saved-7");
    expect(await screen.findByTestId("report-pane-saved-7", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith("/api/reports/vehicle-financials"))).toBe(false);
  });

  it("Bewerken opens the report builder on this report; only with Rapporten beheren", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial&report=saved-7");
    await user.click(await screen.findByTestId("button-edit-saved-report"));
    expect(await screen.findByText("Bewerken: Bekeuringen per maand")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-save-report"));
    expect(screen.getByTestId("input-report-name")).toHaveValue("Bekeuringen per maand");
  });

  it("no Bewerken without Rapporten beheren", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    renderPage("/reports?tab=financial&report=saved-7");
    expect(await screen.findByTestId("report-pane-saved-7")).toBeInTheDocument();
    expect(screen.queryByTestId("button-edit-saved-report")).toBeNull();
  });

  it("after moving a report to another tab, closing the builder selects it there", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial&report=saved-7");
    await user.click(await screen.findByTestId("button-edit-saved-report"));
    await user.click(await screen.findByTestId("button-save-report"));
    await user.click(screen.getByTestId("select-saved-report-tab"));
    await user.click(await screen.findByRole("option", { name: "Kantoor" }));
    await user.click(screen.getByTestId("button-confirm-save"));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    await user.click(screen.getByTestId("button-close-report-builder"));
    await waitFor(() => expect(window.location.search).toContain("tab=office"));
    expect(window.location.search).toContain("report=saved-7");
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Bekeuringen per maand"));
  });

  it("a deleted report leaves the list", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=financial&report=saved-7");
    await user.click(await screen.findByTestId("button-edit-saved-report"));
    await user.click(await screen.findByTestId("button-saved-tab"));
    await user.click(await screen.findByTestId("button-delete-report-7"));
    await user.click(await screen.findByTestId("confirm-delete-saved-report"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    await user.click(screen.getByTestId("button-close-report-builder"));
    await waitFor(() => expect(screen.queryByTestId("report-nav-item-saved-7")).toBeNull());
    await waitFor(() => expect(screen.queryByTestId("report-pane-saved-7")).toBeNull());
  });
});

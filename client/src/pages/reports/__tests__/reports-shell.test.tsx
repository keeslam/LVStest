/**
 * Rapporten herontwerp deel 1, Task 2: the new shell of /reports.
 * - a sticky filter bar with presets, period text, vehicle picker and the two dialog buttons;
 * - tabs (Overzicht first), a list of reports on the left and one report at a time on the right;
 * - the tab and report go into the URL;
 * - tabs without a visible report are not shown;
 * - on a narrow screen the list is a select.
 *
 * Runs in the jsdom project.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.history.replaceState(null, "", "/reports");
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}><ReportsPage /></QueryClientProvider>);
}

describe("reports shell - admin", () => {
  beforeEach(() => { role = UserRole.ADMIN; permissions = []; });

  it("has the filter bar, the tabs in order and opens one report from the list", async () => {
    const user = userEvent.setup();
    renderPage();
    const bar = await screen.findByTestId("report-filter-bar");
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("top-0");
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent?.trim());
    expect(tabs).toEqual(["Overzicht", "Kosten", "Voertuigen", "Klanten", "Transporten", "Financieel", "Fiscaal", "Portaal", "Kantoor"]);

    await user.click(screen.getByTestId("tab-report-vehicles"));
    const nav = await screen.findByTestId("report-nav");
    await user.click(within(nav).getByTestId("report-nav-item-occupancy"));
    await waitFor(() => expect(screen.getByTestId("report-pane-title")).toHaveTextContent("Bezetting per dag"));
    expect(within(nav).getByTestId("report-nav-item-occupancy")).toHaveAttribute("aria-current", "page");
    expect(await screen.findByTestId("card-occupancy-report")).toBeInTheDocument();
    expect(window.location.search).toContain("tab=vehicles&report=occupancy");
  });

  it("Vorige maand shows the previous calendar month as the period", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByTestId("report-period-label")).toHaveTextContent("1-10-2026 t/m 31-10-2026");
    await user.click(screen.getByTestId("select-report-preset"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Deze maand", "Vorige maand", "Dit kwartaal", "Dit jaar", "Zelf kiezen"]);
    await user.click(screen.getByRole("option", { name: "Vorige maand" }));
    await waitFor(() => expect(screen.getByTestId("report-period-label")).toHaveTextContent("1-9-2026 t/m 30-9-2026"));
  });

  it("Zelf kiezen shows two date fields", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByTestId("input-report-from")).toBeNull();
    await user.click(await screen.findByTestId("select-report-preset"));
    await user.click(await screen.findByRole("option", { name: "Zelf kiezen" }));
    expect(await screen.findByTestId("input-report-from")).toHaveValue("2026-10-01");
    expect(screen.getByTestId("input-report-to")).toHaveValue("2026-10-31");
  });

  it("has no old print buttons or quick-nav cards; Rapportbouwer and Onderhoudsanalyse open their dialogs", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("report-filter-bar");
    expect(screen.queryByTestId("print-report-apk")).toBeNull();
    expect(screen.queryByTestId("card-report-builder")).toBeNull();
    expect(screen.queryByTestId("card-maintenance-costs")).toBeNull();
    await user.click(screen.getByTestId("button-open-report-builder"));
    expect(await screen.findByTestId("stub-report-builder")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-close-report-builder"));
    await user.click(screen.getByTestId("button-open-maintenance-costs"));
    expect(await screen.findByTestId("stub-maintenance-costs")).toBeInTheDocument();
  });

  it("shows the category filter only for a report that uses it", async () => {
    const user = userEvent.setup();
    renderPage();
    // Overzicht (the old operations numbers) uses the category.
    expect(await screen.findByTestId("select-report-category")).toBeInTheDocument();
    await user.click(screen.getByTestId("tab-report-portal"));
    await waitFor(() => expect(screen.queryByTestId("select-report-category")).toBeNull());
  });
});

describe("reports shell - rights", () => {
  it("shows only the tabs that have a visible report", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    renderPage();
    expect(await screen.findByTestId("tab-report-financial")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-portal")).toBeNull();
    expect(screen.queryByTestId("tab-report-office")).toBeNull();
    expect(screen.queryByTestId("tab-report-overview")).toBeNull();
    expect(screen.queryByTestId("tab-report-vehicles")).toBeNull();
    expect(screen.queryByTestId("tab-report-expenses")).toBeNull();
  });
});

describe("reports shell - narrow screen", () => {
  it("shows a select instead of the list", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    renderPage();
    expect(await screen.findByTestId("select-report-nav")).toBeVisible();
    expect(screen.queryByTestId("report-nav")).toBeNull();
  });
});

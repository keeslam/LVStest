/**
 * Rapporten fase 4 - Klanten and Portaal report cards. Customer value is a money report:
 * only the report permission, no customer permission needed.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";

let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "user", permissions, hidePrices: false }, isLoading: false }),
}));

const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));

import { CustomerValueReportCard } from "@/pages/reports/customer-value-report-card";
import { PortalRequestsReportCard } from "@/pages/reports/portal-requests-report-card";
import { WaitlistReportCard } from "@/pages/reports/waitlist-report-card";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
const fetchedPaths = () => fetchMock.mock.calls.map(([input]) => pathOf(input));

const VALUE_ROW = (customerId: number | null, customerName: string | null, costs: number) => ({
  customerId, customerName, rentals: 2, rentalDays: 10, revenue: 1000, extraKmCost: 30, fuelCost: 20,
  finesCount: 1, finesAmount: costs - 50, damageChecks: 0, lateReturns: 1, cancellations: 0, portalRequests: 3, costs, amount: costs,
});

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/customer-value/summary")) {
      return json({
        tiles: {
          revenue: { count: 2, amount: 1750 }, costs: { count: 2, amount: 300 }, late: { count: 1, amount: 1 },
          cancelled: { count: 0, amount: 0 }, requests: { count: 1, amount: 3 },
        },
        topRevenue: [{ key: 1, label: "Jansen", count: 2, amount: 1000 }],
        topCosts: [{ key: null, label: null, count: 1, amount: 250 }],
      });
    }
    if (path.startsWith("/api/reports/customer-value/rows")) {
      return json({ rows: [VALUE_ROW(null, null, 250), VALUE_ROW(1, "Jansen", 50)], total: 2, page: 1, pageSize: 50 });
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderNode(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("Klanten - klantwaarde", () => {
  it("klantwaarde met alleen rapportrecht", async () => {
    permissions = ["view_reports"];
    renderNode(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    expect((await screen.findByTestId("customer-value-tile-revenue-value")).textContent).toBe(formatCurrency(1750));
    expect(fetchedPaths()).toContain("/api/reports/customer-value/summary?from=2026-01-01&to=2026-12-31");
    expect(screen.getByTestId("customer-value-tile-late-value").textContent).toBe("1");
    expect(screen.getByTestId("customer-value-top-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("customer-value-top-costs")).toBeInTheDocument();
    expect(screen.getByTestId("customer-value-top-costs")).toHaveAttribute("data-value-label", "Kosten");
    expect(screen.getByTestId("customer-value-top-revenue")).toHaveAttribute("data-value-label", "Omzet");
  });

  it("zonder rapportrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_customers"];
    renderNode(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-customer-value-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/customer-value"))).toBe(false);
  });

  it("een voertuigfilter gaat mee, 'all' niet", async () => {
    permissions = ["manage_reports"];
    renderNode(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" vehicleId="7" />);
    await screen.findByTestId("customer-value-tile-revenue-value");
    expect(fetchedPaths()).toContain("/api/reports/customer-value/summary?from=2026-01-01&to=2026-12-31&vehicleId=7");
  });

  it("een summary zonder tegels breekt de kaart niet", async () => {
    permissions = ["view_reports"];
    fetchMock.mockImplementation(async () => json({}));
    renderNode(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    expect((await screen.findByTestId("customer-value-tile-revenue-value")).textContent).toBe(formatCurrency(0));
  });

  it("tegel Kosten opent de lijst, rij zonder klant heet 'Zonder klant'", async () => {
    permissions = ["view_reports"];
    const user = userEvent.setup();
    renderNode(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    await user.click(await screen.findByTestId("button-customer-value-tile-costs"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/customer-value/rows?from=2026-01-01&to=2026-12-31&tile=costs&sort=amount&dir=desc&page=1&pageSize=50",
    ));
    const dialog = await screen.findByTestId("dialog-customer-value-report");
    expect(await within(dialog).findByText("Zonder klant")).toBeInTheDocument();
    expect(within(dialog).getByText("Jansen")).toBeInTheDocument();
  });
});

const PORTAL_TILE = (count: number) => ({ count, amount: 0 });
const portalSummary = (medianReplyHours: number | null) => ({
  tiles: { all: PORTAL_TILE(9), open: PORTAL_TILE(4), done: PORTAL_TILE(3), rejected: PORTAL_TILE(2), stale: PORTAL_TILE(1) },
  byMonth: [{ month: "2019-03", new: 1, inProgress: 2, done: 3, rejected: 2 }],
  byType: [{ type: "extension", total: 5, open: 2, done: 2, rejected: 1 }],
  byHandler: [{ key: "piet", label: "piet", count: 4, amount: 4 }],
  medianReplyHours,
  repliedCount: medianReplyHours === null ? 0 : 3,
});

describe("Portaal - portaalaanvragen", () => {
  const stub = (median: number | null) => fetchMock.mockImplementation(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/portal-requests/summary")) return json(portalSummary(median));
    if (path.startsWith("/api/reports/portal-requests/rows")) return json({ rows: [], total: 0, page: 1, pageSize: 50 });
    return json([]);
  });

  it("negeert het voertuigfilter en zegt dat", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(6);
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" vehicleId="12" />);
    expect(await screen.findByTestId("portal-vehicle-filter-ignored")).toBeInTheDocument();
    expect(fetchedPaths()).toContain("/api/reports/portal-requests/summary?from=2019-01-01&to=2019-12-31");
    expect((await screen.findByTestId("portal-requests-tile-all-value")).textContent).toBe("9");
  });

  it("zonder voertuigkeuze geen opmerking", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(6);
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" vehicleId="all" />);
    await screen.findByTestId("portal-requests-tile-all-value");
    expect(screen.queryByTestId("portal-vehicle-filter-ignored")).not.toBeInTheDocument();
  });

  it("mediane reactietijd in uren, dagen of streepje", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(6);
    const first = renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("portal-requests-median")).textContent).toContain("6 uur");
    first.unmount();
    stub(72);
    const second = renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("portal-requests-median")).textContent).toContain("3 dagen");
    second.unmount();
    stub(null);
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("portal-requests-median")).textContent).toContain("\u2013");
  });

  it("tabel soort x status toont het label uit het portaal", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(6);
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    const table = await screen.findByTestId("portal-requests-by-type");
    expect(within(table).getByText("Verlenging")).toBeInTheDocument();
  });

  it("een summary zonder tegels breekt de kaart niet", async () => {
    permissions = ["view_reports", "view_portal"];
    fetchMock.mockImplementation(async () => json({}));
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("portal-requests-tile-all-value")).textContent).toBe("0");
  });

  it("zonder portaalrecht of zonder rapportrecht geen kaart en geen verzoek", async () => {
    for (const perms of [["view_reports"], ["view_portal"]]) {
      permissions = perms;
      stub(6);
      fetchMock.mockClear();
      const view = renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByTestId("card-portal-requests-report")).not.toBeInTheDocument();
      expect(fetchedPaths().some((p) => p.startsWith("/api/reports/portal-requests"))).toBe(false);
      view.unmount();
    }
  });

  it("tegel Open, ouder dan 2 dagen opent de lijst oudste eerst", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(6);
    const user = userEvent.setup();
    renderNode(<PortalRequestsReportCard from="2019-01-01" to="2019-12-31" />);
    await user.click(await screen.findByTestId("button-portal-requests-tile-stale"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/portal-requests/rows?from=2019-01-01&to=2019-12-31&tile=stale&sort=createdAt&dir=asc&page=1&pageSize=50",
    ));
  });
});

const WL_TILE = (count: number) => ({ count, amount: 0 });
const waitlistSummary = (empty: boolean, avgDaysToFulfil: number | null) => ({
  tiles: empty
    ? { all: WL_TILE(0), open: WL_TILE(0), fulfilled: WL_TILE(0), cancelled: WL_TILE(0) }
    : { all: WL_TILE(5), open: WL_TILE(2), fulfilled: WL_TILE(2), cancelled: WL_TILE(1) },
  byMonth: empty ? [] : [{ month: "2019-03", open: 2, fulfilled: 2, cancelled: 1 }],
  byType: empty ? [] : [
    { vehicleType: null, total: 2, fulfilled: 1, notFulfilled: 1, avgDaysToFulfil: null },
    { vehicleType: "Bus", total: 3, fulfilled: 1, notFulfilled: 2, avgDaysToFulfil: 4 },
  ],
  avgDaysToFulfil,
});

describe("Portaal - wachtlijst", () => {
  const stub = (empty: boolean, avg: number | null) => fetchMock.mockImplementation(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/waitlist/summary")) return json(waitlistSummary(empty, avg));
    if (path.startsWith("/api/reports/waitlist/rows")) return json({ rows: [], total: 0, page: 1, pageSize: 50 });
    return json([]);
  });

  it("type zonder waarde heet Onbekend en de gemiddelde wachttijd staat erbij", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(false, 7);
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
    const table = await screen.findByTestId("waitlist-by-type");
    expect(within(table).getByText("Onbekend")).toBeInTheDocument();
    expect(within(table).getByText("Bus")).toBeInTheDocument();
    expect((await screen.findByTestId("waitlist-avg-days")).textContent).toContain("7");
    expect(fetchedPaths()).toContain("/api/reports/waitlist/summary?from=2019-01-01&to=2019-12-31");
  });

  it("zonder afgeronde vermeldingen een streepje", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(false, null);
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("waitlist-avg-days")).textContent).toContain("–");
  });

  it("alle tegels 0 toont de lege melding in plaats van grafiek en tabel", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(true, null);
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
    expect(await screen.findByTestId("waitlist-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("waitlist-by-type")).not.toBeInTheDocument();
    expect(screen.queryByTestId("waitlist-month-chart")).not.toBeInTheDocument();
  });

  it("negeert het voertuigfilter en zegt dat", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(false, 7);
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" vehicleId="12" />);
    expect(await screen.findByTestId("waitlist-vehicle-filter-ignored")).toBeInTheDocument();
    expect(fetchedPaths()).toContain("/api/reports/waitlist/summary?from=2019-01-01&to=2019-12-31");
  });

  it("een summary zonder tegels breekt de kaart niet", async () => {
    permissions = ["view_reports", "view_portal"];
    fetchMock.mockImplementation(async () => json({}));
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("waitlist-tile-all-value")).textContent).toBe("0");
  });

  it("zonder portaalrecht of zonder rapportrecht geen kaart en geen verzoek", async () => {
    for (const perms of [["view_reports"], ["view_portal"]]) {
      permissions = perms;
      stub(false, 7);
      fetchMock.mockClear();
      const view = renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByTestId("card-waitlist-report")).not.toBeInTheDocument();
      expect(fetchedPaths().some((p) => p.startsWith("/api/reports/waitlist"))).toBe(false);
      view.unmount();
    }
  });

  it("tegel Open opent de lijst", async () => {
    permissions = ["view_reports", "view_portal"];
    stub(false, 7);
    const user = userEvent.setup();
    renderNode(<WaitlistReportCard from="2019-01-01" to="2019-12-31" />);
    await user.click(await screen.findByTestId("button-waitlist-tile-open"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/waitlist/rows?from=2019-01-01&to=2019-12-31&tile=open&sort=createdAt&dir=desc&page=1&pageSize=50",
    ));
  });
});

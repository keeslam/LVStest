/**
 * Rapporten herontwerp deel 1b, Task 2 fix round 1: one breakdown line per kit card opens the
 * list that matches its number: the right tile plus `drill=<name>&key=<value>` (the tiles the
 * server tests check with expectDrillMatchesLines). Also the portal month bar of an open status
 * and the row button of ReportTable.
 *
 * Runs in the jsdom project (real recharts drawn by the global 800x400 stub).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueryFn } from "@/lib/queryClient";
import { DAMAGE_CHECK_REPORT_TILES } from "@shared/reports/damage-checks-report";
import { DELIVERY_REPORT_TILES } from "@shared/reports/delivery-report";
import { WAITLIST_REPORT_TILES } from "@shared/reports/waitlist-report";
import { PORTAL_REQUEST_REPORT_TILES } from "@shared/reports/portal-requests-report";
import { INBOX_ITEM_REPORT_TILES } from "@shared/reports/invoice-inbox-report";
import { EXTRA_COSTS_TILES } from "@shared/reports/extra-costs-report";
import { TRANSPORT_BILLING_TILES } from "@shared/reports/transport-billing-report";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { DamageChecksReportCard } from "@/pages/reports/damage-checks-report-card";
import { DeliveryReportCard } from "@/pages/reports/delivery-report-card";
import { WaitlistReportCard } from "@/pages/reports/waitlist-report-card";
import { PortalRequestsReportCard } from "@/pages/reports/portal-requests-report-card";
import { InvoiceInboxItemsReport } from "@/pages/reports/invoice-inbox-report-card";
import { ExtraCostsReportCard } from "@/pages/reports/extra-costs-report-card";
import { TransportBillingReportCard } from "@/pages/reports/transport-billing-report-card";
import { ReportTable } from "@/components/reports/kit/report-table";

const tiles = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, { count: 2, amount: 10 }]));
const line = (key: string | number | null, label: string | null) => ({ key, label, count: 2, amount: 10 });

const SUMMARIES: Record<string, unknown> = {
  "/api/reports/damage-checks/summary": {
    tiles: tiles(DAMAGE_CHECK_REPORT_TILES), byMonth: [],
    byVehicle: [line(3, "AB12CD")], byCustomer: [line(null, null)],
  },
  "/api/reports/deliveries/summary": {
    tiles: tiles(DELIVERY_REPORT_TILES), byMonth: [], onTimePct: null, avgKmPerTrip: null, tripsWithDistance: 0,
    byType: [{ type: "swap", total: 2, onTime: 1, late: 1, open: 0, km: 0 }],
    byDriver: [{ driver: null, trips: 2, onTime: 1, late: 1, km: 0 }],
  },
  "/api/reports/waitlist/summary": {
    tiles: tiles(WAITLIST_REPORT_TILES), byMonth: [], avgDaysToFulfil: null,
    byType: [{ vehicleType: "Bus", total: 2, fulfilled: 1, notFulfilled: 1, avgDaysToFulfil: null }],
  },
  "/api/reports/portal-requests/summary": {
    tiles: tiles(PORTAL_REQUEST_REPORT_TILES), medianReplyHours: null, repliedCount: 0,
    byMonth: [{ month: "2026-04", new: 3, inProgress: 0, done: 0, rejected: 0 }],
    byType: [{ type: "extension", total: 2, open: 1, done: 1, rejected: 0 }],
    byHandler: [line("anna", "anna")],
  },
  "/api/reports/invoice-inbox-items/summary": {
    tiles: tiles(INBOX_ITEM_REPORT_TILES), byMonth: [], byReason: [{ reason: "no_vehicle", count: 2 }],
  },
  "/api/reports/extra-costs/summary": {
    tiles: tiles(EXTRA_COSTS_TILES), totalExtraKm: 0, byMonth: [], byCustomer: [line(7, "Klant A")], byVehicle: [line(3, "AB12CD")],
  },
  "/api/reports/transport-billing/summary": {
    tiles: tiles(TRANSPORT_BILLING_TILES), missingAmount: 0, byMonth: [],
    byType: [{ type: "tow", count: 2, billable: 10, notInvoiced: 10, toll: 0 }],
  },
};

const pathOf = (input: unknown) => (typeof input === "string" ? input : (input as Request)?.url ?? "").replace(/^https?:\/\/[^/]+/, "");
let fetchMock: ReturnType<typeof vi.fn>;
const rowsPaths = () => fetchMock.mock.calls.map(([i]) => pathOf(i)).filter((p) => p.includes("/rows?"));

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    const body = SUMMARIES[path.split("?")[0]] ?? (path.includes("/rows?") ? { rows: [], total: 0, page: 1, pageSize: 50 } : []);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const range = { from: "2026-01-01", to: "2026-12-31", vehicleId: "all" };
function renderNode(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider initial={{ from: range.from, to: range.to }}>{node}</ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

const CASES: Array<{ name: string; node: ReactNode; testId: string; expect: string }> = [
  { name: "schadechecks per voertuig", node: <DamageChecksReportCard {...range} />, testId: "damage-checks-by-vehicle-row-3", expect: "/api/reports/damage-checks/rows?from=2026-01-01&to=2026-12-31&tile=withDamage&drill=vehicle&key=3&" },
  { name: "schadechecks zonder klant", node: <DamageChecksReportCard {...range} />, testId: "damage-checks-by-customer-row-null", expect: "tile=withDamage&drill=customer&key=__null&" },
  { name: "bezorgingen per soort", node: <DeliveryReportCard {...range} />, testId: "delivery-by-type-row-swap", expect: "/api/reports/deliveries/rows?from=2026-01-01&to=2026-12-31&tile=all&drill=type&key=swap&" },
  { name: "bezorgingen zonder medewerker", node: <DeliveryReportCard {...range} />, testId: "delivery-by-driver-row-null", expect: "tile=all&drill=driver&key=__null&" },
  { name: "wachtlijst per type", node: <WaitlistReportCard {...range} />, testId: "waitlist-by-type-row-Bus", expect: "/api/reports/waitlist/rows?from=2026-01-01&to=2026-12-31&tile=all&drill=type&key=Bus&" },
  { name: "portaal per soort", node: <PortalRequestsReportCard {...range} />, testId: "portal-requests-by-type-row-extension", expect: "tile=all&drill=type&key=extension&" },
  { name: "portaal per afhandelaar", node: <PortalRequestsReportCard {...range} />, testId: "portal-requests-by-handler-row-anna", expect: "tile=all&drill=handler&key=anna&" },
  { name: "factuurpostvak per reden", node: <InvoiceInboxItemsReport {...range} />, testId: "invoice-inbox-reasons-row-no_vehicle", expect: "/api/reports/invoice-inbox-items/rows?from=2026-01-01&to=2026-12-31&tile=flagged&drill=reason&key=no_vehicle&" },
  { name: "meer-km per klant", node: <ExtraCostsReportCard {...range} />, testId: "extra-costs-by-customer-row-7", expect: "/api/reports/extra-costs/rows?from=2026-01-01&to=2026-12-31&tile=withCosts&drill=customer&key=7&" },
  { name: "meer-km per voertuig", node: <ExtraCostsReportCard {...range} />, testId: "extra-costs-by-vehicle-row-3", expect: "tile=withCosts&drill=vehicle&key=3&" },
  { name: "transport per soort", node: <TransportBillingReportCard {...range} />, testId: "transport-billing-by-type-row-tow", expect: "/api/reports/transport-billing/rows?from=2026-01-01&to=2026-12-31&tile=all&drill=type&key=tow&" },
  { name: "transport: nog te factureren van een soort", node: <TransportBillingReportCard {...range} />, testId: "transport-billing-by-type-row-tow-notInvoiced", expect: "tile=notInvoiced&drill=type&key=tow&" },
];

describe("elke uitsplitsingsregel opent de lijst die bij zijn getal hoort", () => {
  it.each(CASES)("$name", async ({ node, testId, expect: wanted }) => {
    const user = userEvent.setup();
    renderNode(node);
    await user.click(await screen.findByTestId(testId));
    await waitFor(() => expect(rowsPaths().some((p) => p.includes(wanted)), rowsPaths().join("\n")).toBe(true));
  });

  it("de extra tegels withCosts en all zijn geen kaart", async () => {
    renderNode(<><ExtraCostsReportCard {...range} /><TransportBillingReportCard {...range} /></>);
    expect(await screen.findByTestId("button-extra-costs-tile-fuel")).toBeInTheDocument();
    expect(await screen.findByTestId("button-transport-billing-tile-notInvoiced")).toBeInTheDocument();
    expect(screen.queryByTestId("button-extra-costs-tile-withCosts")).toBeNull();
    expect(screen.queryByTestId("button-transport-billing-tile-all")).toBeNull();
  });

  it("portaal: de maandstaaf 'nieuw' opent alle aanvragen met status new in die maand", async () => {
    renderNode(<PortalRequestsReportCard {...range} />);
    const chart = await screen.findByTestId("portal-requests-month-chart");
    await waitFor(() => expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0));
    // one group per series and month; series "new" is drawn first
    fireEvent.click(chart.querySelectorAll(".recharts-bar-rectangle")[0]);
    await waitFor(() => expect(rowsPaths().some((p) => p.includes("tile=all&drill=status&key=new&month=2026-04&")), rowsPaths().join("\n")).toBe(true));
  });
});

describe("ReportTable onRowClick", () => {
  it("is a real button in the first cell, not a role on the row", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderNode(
      <ReportTable
        rows={[{ id: 1, name: "Brandstof" }]}
        columns={[{ id: "name", label: "Naam", cell: (r) => r.name, text: (r) => r.name }]}
        rowKey={(r) => r.id}
        testId="t"
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByTestId("t-row-1");
    expect(row).not.toHaveAttribute("role");
    const button = within(row).getByRole("button", { name: "Brandstof" });
    expect(button).toHaveAttribute("data-testid", "t-open-1");
    await user.click(button);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

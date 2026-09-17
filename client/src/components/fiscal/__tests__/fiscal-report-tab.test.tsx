/**
 * The "Fiscaal" tab of the reports page: the year's period-months with their
 * state, the totals, and a CSV link that carries the chosen filters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FiscalReportTab } from "@/components/fiscal/fiscal-report-tab";

const report = {
  year: 2027,
  withAmounts: true,
  rows: [
    { customerId: 1, customerName: "Klant BV", vehicleId: 3, licensePlate: "AB-123-C", vehicle: "Volkswagen Golf", usagePeriodId: 5, reservationId: 10, periodStart: "2027-02-10", periodEnd: null, assessmentId: 40, status: "APPLICABLE", statusLabel: "Van toepassing", month: "2027-02", days: 19, charged: true, reason: "charged", reasonLabel: "geheven", amount: "360.00", state: "settled", ruleVersionTitle: "Belastingplan 2026", assessedAt: "2027-03-15T02:00:00.000Z" },
    { customerId: 1, customerName: "Klant BV", vehicleId: 3, licensePlate: "AB-123-C", vehicle: "Volkswagen Golf", usagePeriodId: 5, reservationId: 10, periodStart: "2027-02-10", periodEnd: null, assessmentId: 40, status: "APPLICABLE", statusLabel: "Van toepassing", month: "2027-03", days: 31, charged: true, reason: "charged", reasonLabel: "geheven", amount: "360.00", state: "provisional", ruleVersionTitle: "Belastingplan 2026", assessedAt: "2027-03-15T02:00:00.000Z" },
  ],
  totals: { amount: "720.00", settled: "360.00", provisional: "360.00", chargedMonths: 2, periods: 2, unassessedPeriods: 1 },
  byCustomer: [{ customerId: 1, customerName: "Klant BV", periods: 1, chargedMonths: 2, amount: "720.00", settled: "360.00", provisional: "360.00" }],
  byMonth: [],
};

const calls: string[] = [];
function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <FiscalReportTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const body = String(url).includes("/api/customers") ? [{ id: 1, name: "Klant BV" }] : report;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("rapporttab fiscaal", () => {
  it("shows the period-months with their state, the totals, and a CSV link for the same year", async () => {
    renderTab();
    expect(await screen.findByTestId("fiscal-report-row-5-2027-02")).toHaveTextContent("februari 2027");
    expect(screen.getByTestId("fiscal-report-row-5-2027-02")).toHaveTextContent("Vastgelegd");
    expect(screen.getByTestId("fiscal-report-row-5-2027-03")).toHaveTextContent("Voorlopig");
    expect(screen.getByTestId("fiscal-report-total")).toHaveTextContent("€ 720,00");
    expect(screen.getByTestId("fiscal-report-unassessed")).toHaveTextContent("1");
    const year = new Date().getFullYear() >= 2027 ? new Date().getFullYear() : 2027;
    expect(screen.getByTestId("fiscal-report-csv")).toHaveAttribute("href", `/api/fiscal/reports/monthly.csv?year=${year}`);
    expect(calls.some((u) => u.includes(`/api/fiscal/reports/monthly?year=${year}`))).toBe(true);
    expect(screen.getAllByText(/geen fiscaal advies/i).length).toBeGreaterThanOrEqual(1);
  });
});

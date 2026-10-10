/**
 * The "Fiscaal" report tab before the law applies (audit 2026-10-09, A-16-8):
 * it opens on 2027, the first year with periods, and says why 2026 has none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FiscalReportTab } from "@/components/fiscal/fiscal-report-tab";

const emptyReport = {
  year: 2027, withAmounts: true, rows: [],
  totals: { amount: "0.00", settled: "0.00", provisional: "0.00", chargedMonths: 0, periods: 0, unassessedPeriods: 0 },
  byCustomer: [], byMonth: [],
};

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><FiscalReportTab /></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).includes("/api/customers") ? [] : emptyReport;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("rapporttab fiscaal vóór de ingangsdatum", () => {
  it("explains that nothing is assessed yet in the current year", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-10T10:00:00Z") });
    renderTab();
    expect(await screen.findByTestId("fiscal-report-not-started")).toHaveTextContent("In 2026 worden nog geen fiscale perioden beoordeeld");
    expect(screen.getByTestId("fiscal-report-not-started")).toHaveTextContent("1 januari 2027");
    expect(await screen.findByText(/de fiscale check rekent pas vanaf 1 januari 2027/)).toBeInTheDocument();
  });

  it("says nothing of the kind once the law applies", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-03-10T10:00:00Z") });
    renderTab();
    await screen.findByText("Geen beoordeelde perioden in dit jaar.");
    expect(screen.queryByTestId("fiscal-report-not-started")).not.toBeInTheDocument();
  });
});

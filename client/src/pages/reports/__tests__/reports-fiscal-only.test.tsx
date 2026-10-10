/**
 * A-R-1: someone who holds "Fiscale check bekijken" but no report right can open
 * Rapporten and sees the fiscal check, and nothing else. None of the report
 * queries (vehicles, reservations, customers, transports ...) fire for that user,
 * so no screen shows a "Kon de gegevens niet laden" toast. The fiscal overview
 * dialog opens from the tab (the portal screen is not needed for it).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.VIEW_FISCAL];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/components/fiscal/fiscal-overview-dialog", () => ({
  FiscalOverviewDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" data-testid="dialog-fiscal-overview" /> : null),
}));

import ReportsPage from "@/pages/reports/index";

const requested: string[] = [];
beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requested.push((typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, ""));
      return new Response(
        JSON.stringify({ year: 2027, withAmounts: true, rows: [], totals: { amount: "0.00", settled: "0.00", provisional: "0.00", chargedMonths: 0, periods: 0, unassessedPeriods: 0 }, byCustomer: [], byMonth: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

describe("Rapporten for someone with only Fiscale check bekijken", () => {
  it("shows the fiscal check and no other report tab, and fires none of the report queries", async () => {
    permissions = [UserPermission.VIEW_FISCAL];
    renderPage();
    expect(await screen.findByTestId("fiscal-report-tab")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    for (const url of ["/api/vehicles", "/api/reservations", "/api/customers", "/api/transports", "/api/expenses"]) {
      expect(requested.some((r) => r === url || r.startsWith(`${url}?`) || r.startsWith(`${url}/`)), url).toBe(false);
    }
  });

  it("opens the fiscal overview from the tab", async () => {
    permissions = [UserPermission.VIEW_FISCAL];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-fiscal-overview"));
    expect(await screen.findByTestId("dialog-fiscal-overview")).toBeInTheDocument();
  });

  it("someone with report rights as well keeps the full page with all its tabs", async () => {
    permissions = [UserPermission.VIEW_FISCAL, UserPermission.VIEW_REPORTS];
    renderPage();
    expect(await screen.findByTestId("tab-report-fiscal")).toBeInTheDocument();
    expect(screen.getByTestId("tab-report-financial")).toBeInTheDocument();
  });
});

/**
 * Rapporten fase 2 - the money report cards on Rapporten > Financieel. The fines
 * card needs the fines permission next to the report permission: without it the
 * card is not there and /api/reports/fines is never asked; with it the tiles show
 * count and amount, and a tile opens its rows from the server.
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

import { FinancialTab } from "@/pages/reports/financial-tab";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
const fetchedPaths = () => fetchMock.mock.calls.map(([input]) => pathOf(input));

const FINE_ROW = {
  id: 9, offenceAt: "2026-04-15T10:00:00.000Z", receivedAt: "2026-04-16", licensePlate: "AB12CD", vehicleId: 3,
  description: "Te hard gereden op de A2", reference: "CJ-1", status: "charged", amount: 20,
  customerId: null, customerName: null, driverName: null, linkedAt: null,
};
const zero = { count: 0, amount: 0 };

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/vehicle-financials")) {
      return json({ rows: [], totals: { rentals: 0, rentalDays: 0, revenue: 0, expenses: 0, margin: 0 } });
    }
    if (path.startsWith("/api/reports/fines/summary")) {
      return json({
        tiles: { new: zero, linked: zero, cancelled: zero, legacy: { count: 2, amount: 60 }, total: { count: 5, amount: 215 } },
        avgDaysToLink: 3, byMonth: [], byCustomer: [], byVehicle: [], byDriver: [],
      });
    }
    if (path.startsWith("/api/reports/fines/rows")) return json({ rows: [FINE_ROW], total: 1, page: 1, pageSize: 50 });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const range = { from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) };
  return render(<QueryClientProvider client={client}><FinancialTab dateRange={range} selectedVehicle="all" /></QueryClientProvider>);
}

describe("Financieel - bekeuringenrapport", () => {
  it("zonder bekeuringenrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reports"];
    renderTab();
    expect(await screen.findByTestId("financial-tab")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-fines-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/fines"))).toBe(false);
  });

  it("met bekeuringenrecht: tegel met aantal en bedrag, klik opent de rijen van de server", async () => {
    permissions = ["view_reports", "view_fines"];
    const user = userEvent.setup();
    renderTab();
    const tile = await screen.findByTestId("button-fines-tile-legacy");
    await waitFor(() => expect(within(tile).getByTestId("fines-tile-legacy-value")).toHaveTextContent("2"));
    expect((tile.textContent ?? "").replace(/\s/g, " ")).toContain(formatCurrency(60).replace(/\s/g, " "));
    await user.click(tile);
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/fines/rows?from=2026-01-01&to=2026-12-31&tile=legacy&sort=offenceAt&dir=desc&page=1&pageSize=50",
    ));
    const dialog = await screen.findByTestId("dialog-fines-report");
    expect(await within(dialog).findByText("Te hard gereden op de A2")).toBeInTheDocument();
  });
});

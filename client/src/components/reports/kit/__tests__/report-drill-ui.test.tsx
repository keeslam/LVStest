/**
 * Rapporten herontwerp deel 1b, Task 2: a breakdown line or a month bar of a kit card opens
 * the rows behind it. The dialog asks the server for the tile's rows narrowed with
 * `drill=<name>&key=<value|__null>` or `month=yyyy-MM`.
 *
 * Runs in the jsdom project. The global recharts stub draws the real chart at 800x400; the
 * month test clicks the drawn bar (`.recharts-bar-rectangle`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

let permissions: string[] = ["view_reports"];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "user", permissions, hidePrices: false }, isLoading: false }),
}));

import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { FinesReportCard } from "@/pages/reports/fines-report-card";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const pathOf = (input: unknown) => (typeof input === "string" ? input : (input as Request)?.url ?? "").replace(/^https?:\/\/[^/]+/, "");

let fetchMock: ReturnType<typeof vi.fn>;
const rowsPaths = () => fetchMock.mock.calls.map(([i]) => pathOf(i)).filter((p) => p.startsWith("/api/reports/fines/rows"));
const zero = { count: 0, amount: 0 };
const FINE_ROW = {
  id: 9, offenceAt: "2026-02-15T10:00:00.000Z", receivedAt: "2026-02-16", licensePlate: "AB12CD", vehicleId: 3,
  description: "Te hard gereden", reference: "CJ-1", status: "new", amount: 20,
  customerId: 7, customerName: "Klant A", driverName: null, linkedAt: null,
};

beforeEach(() => {
  permissions = ["view_reports"];
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/fines/summary")) {
      return json({
        tiles: { new: { count: 1, amount: 20 }, linked: zero, cancelled: zero, legacy: zero, total: { count: 3, amount: 70 } },
        avgDaysToLink: null,
        byMonth: [
          { month: "2026-01", new: 0, linked: 0, legacy: 0, cancelled: 0 },
          { month: "2026-02", new: 20, linked: 0, legacy: 0, cancelled: 0 },
        ],
        byCustomer: [{ key: 7, label: "Klant A", count: 2, amount: 50 }, { key: null, label: null, count: 1, amount: 20 }],
        byVehicle: [{ key: "AB12CD", label: "AB12CD", count: 3, amount: 70 }],
        byDriver: [],
      });
    }
    if (path.startsWith("/api/reports/fines/rows")) return json({ rows: [FINE_ROW], total: 1, page: 1, pageSize: 50 });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider initial={{ from: "2026-01-01", to: "2026-12-31" }}>
        <FinesReportCard from="2026-01-01" to="2026-12-31" vehicleId="all" />
      </ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

describe("bekeuringen: klikken opent de regels erachter", () => {
  it("een klant in de uitsplitsing vraagt de regels van die klant onder de totaaltegel", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("fines-by-customer-row-7"));
    await waitFor(() => expect(rowsPaths()).toContain(
      "/api/reports/fines/rows?from=2026-01-01&to=2026-12-31&tile=total&drill=customer&key=7&sort=offenceAt&dir=desc&page=1&pageSize=50",
    ));
    const dialog = await screen.findByTestId("dialog-fines-report");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Totaal (zonder vervallen) · Klant A");
    expect(await within(dialog).findByText("Te hard gereden")).toBeInTheDocument();
  });

  it("'Zonder klant' vraagt key=__null", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("fines-by-customer-row-null"));
    await waitFor(() => expect(rowsPaths().some((p) => p.includes("tile=total&drill=customer&key=__null&"))).toBe(true));
  });

  it("een kenteken in de uitsplitsing vraagt drill=vehicle met het kenteken", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("fines-by-vehicle-row-AB12CD"));
    await waitFor(() => expect(rowsPaths().some((p) => p.includes("tile=total&drill=vehicle&key=AB12CD&"))).toBe(true));
  });

  it("een maandstaaf vraagt de regels van die maand", async () => {
    renderCard();
    const chart = await screen.findByTestId("fines-month-chart");
    await waitFor(() => expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0));
    // recharts draws one rectangle group per series and month: series "new" first, so [0] = jan, [1] = feb.
    fireEvent.click(chart.querySelectorAll(".recharts-bar-rectangle")[1]);
    await waitFor(() => expect(rowsPaths().some((p) => p.includes("tile=new&month=2026-02&"))).toBe(true));
    const dialog = await screen.findByTestId("dialog-fines-report");
    expect(within(dialog).getByRole("heading").textContent).toMatch(/^Nieuw · /);
  });
});

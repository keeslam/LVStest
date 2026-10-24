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
import { csvDate } from "@/lib/csv";

let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "user", permissions, hidePrices: false }, isLoading: false }),
}));

const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
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
const TRANSPORT_ROW = {
  id: 4, date: "2026-06-01", transportType: "other", status: "scheduled", vehicleId: 3, licensePlate: "AB12CD", isExternalVehicle: false,
  customerId: 1, customerName: "Klant BV", billable: true, billableAmount: null, tollCost: null, invoiced: false, invoicedDate: null,
  distanceKm: null, amount: 0,
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
    if (path.startsWith("/api/reports/extra-costs/summary")) {
      return json({
        tiles: { extraKm: { count: 1, amount: 30 }, fuel: { count: 2, amount: 65.5 }, withExtraKm: { count: 1, amount: 30 } },
        totalExtraKm: 120, byMonth: [], byCustomer: [], byVehicle: [],
      });
    }
    if (path.startsWith("/api/reports/transport-billing/summary")) {
      return json({
        tiles: { notInvoiced: { count: 2, amount: 150 }, invoiced: { count: 1, amount: 80 }, toll: { count: 2, amount: 20 }, openAllTime: { count: 3, amount: 190 } },
        missingAmount: 1, byMonth: [], byType: [{ type: "tow", count: 1, billable: 150, notInvoiced: 150, toll: 12.4 }],
      });
    }
    if (path.startsWith("/api/reports/transport-billing/rows")) return json({ rows: [TRANSPORT_ROW], total: 1, page: 1, pageSize: 50 });
    if (path.startsWith("/api/reports/transport-billing/export")) return json({ rows: [TRANSPORT_ROW], truncated: false });
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

describe("Financieel - meer-km en brandstof", () => {
  it("zonder reserveringenrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reports"];
    renderTab();
    expect(await screen.findByTestId("financial-tab")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-extra-costs-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/extra-costs"))).toBe(false);
  });

  it("met reserveringenrecht: brandstoftegel toont aantal en bedrag", async () => {
    permissions = ["view_reports", "view_reservations"];
    renderTab();
    const tile = await screen.findByTestId("button-extra-costs-tile-fuel");
    await waitFor(() => expect(within(tile).getByTestId("extra-costs-tile-fuel-value")).toHaveTextContent("2"));
    expect((tile.textContent ?? "").replace(/\s/g, " ")).toContain(formatCurrency(65.5).replace(/\s/g, " "));
  });
});

describe("Financieel - transport en facturatie", () => {
  it("zonder voertuigen- of reserveringenrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reports"];
    renderTab();
    expect(await screen.findByTestId("financial-tab")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-transport-billing-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/transport-billing"))).toBe(false);
  });

  it("met recht: tegel toont aantal, bedrag en hoeveel zonder bedrag", async () => {
    permissions = ["view_reports", "view_vehicles"];
    renderTab();
    const tile = await screen.findByTestId("button-transport-billing-tile-notInvoiced");
    await waitFor(() => expect(within(tile).getByTestId("transport-billing-tile-notInvoiced-value")).toHaveTextContent("2"));
    const text = (tile.textContent ?? "").replace(/s/g, " ");
    expect(text).toContain(formatCurrency(150).replace(/s/g, " "));
    expect(text).toContain("1 zonder bedrag");
  });

  it("rij zonder bedrag: 'bedrag ontbreekt' in de lijst en een lege CSV-cel", async () => {
    permissions = ["view_reports", "view_vehicles"];
    downloadCsv.mockClear();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("button-transport-billing-tile-notInvoiced"));
    const dialog = await screen.findByTestId("dialog-transport-billing-report");
    expect(await within(dialog).findByText("bedrag ontbreekt")).toBeInTheDocument();
    await user.click(within(dialog).getByTestId("button-transport-billing-report-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const [subject, header, cells] = downloadCsv.mock.calls[0] as any[];
    expect(subject).toBe("transport-facturatie");
    const amountColumn = (header as string[]).indexOf("Te factureren");
    expect(amountColumn).toBeGreaterThan(-1);
    expect(cells[0][amountColumn]).toBe("");
    expect(cells[0][0]).toBe(csvDate("2026-06-01"));
  });

  it("de tegel voor alle perioden vraagt de lijst zonder periode", async () => {
    permissions = ["view_reports", "view_reservations"];
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("button-transport-billing-tile-openAllTime"));
    await waitFor(() => expect(fetchedPaths().some((p) => p.startsWith("/api/reports/transport-billing/rows") && p.includes("tile=openAllTime"))).toBe(true));
    const rowsPath = fetchedPaths().find((p) => p.startsWith("/api/reports/transport-billing/rows"))!;
    expect(rowsPath).not.toContain("from=");
    expect(rowsPath).not.toContain("to=");
  });
});

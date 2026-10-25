/**
 * Rapporten fase 5 - Kantoor: the invoice inbox card (pickup rounds + invoices).
 * The rounds need MANAGE_EXPENSES or MANAGE_SETTINGS, the invoice list MANAGE_EXPENSES only.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "user", permissions, hidePrices: false }, isLoading: false }),
}));

const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));

import { InvoiceInboxReportCard } from "@/pages/reports/invoice-inbox-report-card";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
const fetchedPaths = () => fetchMock.mock.calls.map(([input]) => pathOf(input));

const T = (count: number, amount = 0) => ({ count, amount });
const runsSummary = (retentionCutoff = "2026-07-27") => ({
  tiles: {
    runs: T(5, 5), mails: T(4, 7), attachments: T(3, 9), booked: T(2, 6), review: T(1, 2), skipped: T(1, 1), failed: T(1, 1),
  },
  byMonth: [{ month: "2019-03", runs: 5, mails: 7, attachments: 9, booked: 6, review: 2, skipped: 1, failed: 1 }],
  retentionDays: 90,
  retentionCutoff,
});
const itemsSummary = () => ({
  tiles: { all: T(8), autoBooked: T(3), staffBooked: T(2), waiting: T(2), dismissed: T(1), flagged: T(3) },
  byMonth: [{ month: "2019-03", autoBooked: 3, staffBooked: 2, waiting: 2, dismissed: 1 }],
  byReason: [{ reason: "no_plate", count: 2 }, { reason: "iets_nieuws", count: 1 }],
});

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/invoice-inbox-runs/summary")) return json(runsSummary());
    if (path.startsWith("/api/reports/invoice-inbox-items/summary")) return json(itemsSummary());
    if (path.includes("/rows")) return json({ rows: [], total: 0, page: 1, pageSize: 50 });
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

describe("Kantoor - factuurpostvak", () => {
  it("vraagt rondes en facturen zonder voertuigfilter en meldt dat het filter niet geldt", async () => {
    permissions = ["view_reports", "manage_expenses"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" vehicleId="12" />);
    await screen.findByTestId("invoice-inbox-runs-tile-mails-value");
    await screen.findByTestId("invoice-inbox-items-tile-all-value");
    expect(fetchedPaths()).toContain("/api/reports/invoice-inbox-runs/summary?from=2019-01-01&to=2019-12-31");
    expect(fetchedPaths()).toContain("/api/reports/invoice-inbox-items/summary?from=2019-01-01&to=2019-12-31");
    expect(screen.getByTestId("invoice-inbox-vehicle-filter-ignored")).toBeInTheDocument();
  });

  it("geen melding bij 'all'", async () => {
    permissions = ["view_reports", "manage_expenses"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" vehicleId="all" />);
    await screen.findByTestId("invoice-inbox-runs-tile-mails-value");
    expect(screen.queryByTestId("invoice-inbox-vehicle-filter-ignored")).not.toBeInTheDocument();
  });

  it("rondetegel toont het bedrag (7 mails) en het aantal rondes als hint", async () => {
    permissions = ["view_reports", "manage_expenses"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("invoice-inbox-runs-tile-mails-value")).textContent).toBe("7");
    expect(screen.getByTestId("button-invoice-inbox-runs-tile-mails").textContent).toContain("4 rondes");
  });

  it("meldt dat het logboek 90 dagen bewaard wordt als de periode eerder begint", async () => {
    permissions = ["view_reports", "manage_expenses"];
    const first = renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    expect(await screen.findByTestId("invoice-inbox-retention")).toBeInTheDocument();
    first.unmount();
    renderNode(<InvoiceInboxReportCard from="2026-08-01" to="2026-12-31" />);
    await screen.findByTestId("invoice-inbox-runs-tile-mails-value");
    expect(screen.queryByTestId("invoice-inbox-retention")).not.toBeInTheDocument();
  });

  it("redenenlijst toont het label en de ruwe tekst van een onbekende reden", async () => {
    permissions = ["view_reports", "manage_expenses"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    const table = await screen.findByTestId("invoice-inbox-reasons");
    expect(table.textContent).toContain("Geen kenteken gevonden");
    expect(table.textContent).toContain("iets_nieuws");
  });

  it("tegel 'door kantoor geboekt' opent de lijst", async () => {
    permissions = ["view_reports", "manage_expenses"];
    const user = userEvent.setup();
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    await user.click(await screen.findByTestId("button-invoice-inbox-items-tile-staffBooked"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/invoice-inbox-items/rows?from=2019-01-01&to=2019-12-31&tile=staffBooked&sort=receivedAt&dir=desc&page=1&pageSize=50",
    ));
  });

  it("tegel ophaalrondes opent de rondelijst", async () => {
    permissions = ["view_reports", "manage_settings"];
    const user = userEvent.setup();
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    await user.click(await screen.findByTestId("button-invoice-inbox-runs-tile-failed"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/invoice-inbox-runs/rows?from=2019-01-01&to=2019-12-31&tile=failed&sort=startedAt&dir=desc&page=1&pageSize=50",
    ));
  });

  it("alleen manage_settings: rondes wel, facturen niet", async () => {
    permissions = ["view_reports", "manage_settings"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    expect(await screen.findByTestId("card-invoice-inbox-report")).toBeInTheDocument();
    await screen.findByTestId("invoice-inbox-runs-tile-mails-value");
    expect(screen.queryByTestId("invoice-inbox-items-tile-all-value")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/invoice-inbox-items"))).toBe(false);
  });

  it("alleen rapportrecht: geen kaart en geen verzoek", async () => {
    permissions = ["view_reports"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-invoice-inbox-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/invoice-inbox"))).toBe(false);
  });

  it("bronrecht zonder rapportrecht: geen kaart", async () => {
    permissions = ["manage_expenses"];
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-invoice-inbox-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/invoice-inbox"))).toBe(false);
  });

  it("een summary zonder tegels breekt de kaart niet", async () => {
    permissions = ["view_reports", "manage_expenses"];
    fetchMock.mockImplementation(async () => json({}));
    renderNode(<InvoiceInboxReportCard from="2019-01-01" to="2019-12-31" />);
    expect((await screen.findByTestId("invoice-inbox-runs-tile-mails-value")).textContent).toBe("0");
    expect((await screen.findByTestId("invoice-inbox-items-tile-all-value")).textContent).toBe("0");
  });
});

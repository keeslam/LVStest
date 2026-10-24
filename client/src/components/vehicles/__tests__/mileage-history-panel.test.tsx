/**
 * Task 7 (rapporten fase 1): the kilometre history of one vehicle, in the
 * vehicle screen (tab "Km-historie") and in Rapporten > Voertuigen.
 * GET /api/mileage-history/:vehicleId is admin only, so a non-admin sees no tab
 * and never asks for it; the financial tab's km-per-month card follows the same rule.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: [] }, isLoading: false }),
}));

const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) };
});

import { VehicleDetails } from "@/components/vehicles/vehicle-details";
import { MileageHistoryPanel } from "@/components/vehicles/mileage-history-panel";
import { FinancialTab } from "@/pages/reports/financial-tab";
import { mileageHistoryHtml } from "@/lib/mileage-history-print";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const vehicle = {
  id: 1,
  licensePlate: "AB-123-C",
  brand: "Volkswagen",
  model: "Golf",
  vehicleType: "car",
  status: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const HISTORY = {
  vehicle: { id: 1, licensePlate: "AB123C", brand: "Volkswagen", model: "Golf", freeKmPerDay: 100 },
  rows: [
    { id: 11, mileage: 10000, recordedAt: "2026-03-01T09:00:00.000Z", source: "pickup", actorName: "Piet", voided: false, drivenSincePrevious: null, warning: null },
    { id: 12, mileage: 12500, recordedAt: "2026-03-10T09:00:00.000Z", source: "return", actorName: "Klaas", voided: false, drivenSincePrevious: 2500, warning: null },
    { id: 13, mileage: 11000, recordedAt: "2026-03-20T09:00:00.000Z", source: "manual", actorName: "Kees", voided: false, drivenSincePrevious: -1500, warning: "decrease" },
    { id: 14, mileage: 99999, recordedAt: "2026-03-21T09:00:00.000Z", source: "damage_check", actorName: null, voided: true, drivenSincePrevious: null, warning: null },
  ],
  summary: { drivenKm: 2500, avgPerMonth: 1200, freeKm: 6300, overFreeKm: 0, readings: 3, warnings: 1, periodFrom: "2026-03-01", periodTo: "2026-03-20" },
};

let fetchMock: ReturnType<typeof vi.fn>;
let history: unknown;

function calledWith(part: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return url.includes(part);
  });
}

beforeEach(() => {
  role = UserRole.ADMIN;
  history = HISTORY;
  downloadCsv.mockReset();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (path === `/api/vehicles/${vehicle.id}`) return json(vehicle);
    if (path === `/api/vehicles/${vehicle.id}/spare-assignment`) return json(null, 404);
    if (path === `/api/vehicles/${vehicle.id}/acting-as-spare`) return json(null, 404);
    if (path.startsWith("/api/mileage-history/")) return json(history);
    if (path === "/api/reports/vehicle-financials") return json({ rows: [], totals: { rentals: 0, rentalDays: 0, revenue: 0, expenses: 0, margin: 0 } });
    if (path === "/api/reports/mileage-per-month") return json({ months: [], rows: [], totalKm: 0 });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function client() {
  return new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
}

function renderDetails() {
  return render(
    <QueryClientProvider client={client()}>
      <GlobalDialogProvider>
        <VehicleDetails vehicleId={vehicle.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

function renderPanel() {
  return render(
    <QueryClientProvider client={client()}>
      <MileageHistoryPanel vehicleId={1} defaultFrom="2026-03-01" defaultTo="2026-03-31" />
    </QueryClientProvider>,
  );
}

describe("Km-historie in the vehicle screen", () => {
  it("an admin sees the tab; the panel lists the readings with a translated source and a decrease badge", async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(await screen.findByRole("tab", { name: "Km-historie" }));

    const decreaseRow = await screen.findByTestId("mileage-row-13");
    expect(within(decreaseRow).getByText("Handmatig")).toBeInTheDocument();
    expect(within(decreaseRow).getByTestId("mileage-warning-decrease")).toBeInTheDocument();
    expect(within(screen.getByTestId("mileage-row-12")).getByText("Inleveren")).toBeInTheDocument();
    expect(calledWith("/api/mileage-history/1")).toBe(true);
  });

  it("a non-admin sees no tab and never asks for the history", async () => {
    role = UserRole.USER;
    renderDetails();
    await screen.findByRole("tab", { name: "Algemeen" });
    expect(screen.queryByRole("tab", { name: "Km-historie" })).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(calledWith("/api/mileage-history")).toBe(false);
  });
});

describe("MileageHistoryPanel", () => {
  it("shows a voided reading greyed out with the word 'vervallen'", async () => {
    renderPanel();
    const voided = await screen.findByTestId("mileage-row-14");
    expect(within(voided).getByText("vervallen")).toBeInTheDocument();
    expect(voided.className).toMatch(/text-gray-400|opacity/);
  });

  it("the warnings tile filters the list to warnings only", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByTestId("mileage-row-11");
    await user.click(screen.getByTestId("mileage-tile-warnings"));
    expect(screen.queryByTestId("mileage-row-11")).not.toBeInTheDocument();
    expect(screen.getByTestId("mileage-row-13")).toBeInTheDocument();
    await user.click(screen.getByTestId("mileage-tile-driven"));
    expect(screen.getByTestId("mileage-row-11")).toBeInTheDocument();
  });

  it("CSV hands the rows to downloadCsv", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByTestId("mileage-row-11");
    await user.click(screen.getByTestId("button-mileage-csv"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [subject, header, rows] = downloadCsv.mock.calls[0] as [string, string[], unknown[][]];
    expect(subject).toContain("km-historie");
    expect(header).toEqual(["Datum", "Km-stand", "Gereden sinds vorige", "Bron", "Door wie", "Waarschuwing"]);
    expect(rows).toHaveLength(4);
    expect(rows[2]).toEqual([expect.stringMatching(/^20-03-2026 /), "11000", "-1500", "Handmatig", "Kees", "Km-stand lager dan vorige"]);
    expect(rows[3][5]).toBe("vervallen");
  });

  it("an empty period says so", async () => {
    history = { ...HISTORY, rows: [], summary: { drivenKm: 0, avgPerMonth: null, freeKm: 3100, overFreeKm: 0, readings: 0, warnings: 0, periodFrom: null, periodTo: null } };
    renderPanel();
    expect(await screen.findByText("Nog geen km-standen in deze periode")).toBeInTheDocument();
    expect(screen.queryByTestId("mileage-effective-period")).not.toBeInTheDocument();
  });

  it("names the effective period the numbers are computed over", async () => {
    renderPanel();
    const line = await screen.findByTestId("mileage-effective-period");
    expect(line.textContent).toMatch(/1 mrt\.? 2026 – 20 mrt\.? 2026/);
  });

  it("a vehicle with exactly one reading: one row, no driven km, no NaN", async () => {
    history = ONE_READING;
    renderPanel();
    const only = await screen.findByTestId("mileage-row-21");
    expect(within(only).getByText("Ophalen")).toBeInTheDocument();
    expect(within(only).getByText("–")).toBeInTheDocument();
    expect(screen.getByTestId("mileage-tile-driven").textContent).toContain("0 km");
    expect(screen.getByTestId("mileage-tile-average").textContent).toContain("0 km");
    expect(screen.getByTestId("mileage-tile-warnings").textContent).toContain("0");
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});

const ONE_READING = {
  vehicle: HISTORY.vehicle,
  rows: [{ id: 21, mileage: 54321, recordedAt: "2026-03-15T09:00:00.000Z", source: "pickup", actorName: "Piet", voided: false, drivenSincePrevious: null, warning: null }],
  summary: { drivenKm: 0, avgPerMonth: 0, freeKm: 1700, overFreeKm: 0, readings: 1, warnings: 0, periodFrom: "2026-03-15", periodTo: "2026-03-31" },
};

const LABELS = {
  title: "Km-historie", period: "Periode", drivenKm: "Gereden km", avgPerMonth: "Gemiddeld per maand",
  freeKm: "Vrije km", overFreeKm: "Boven vrije km", warnings: "Waarschuwingen", chart: "Km-stand",
  date: "Datum", mileage: "Km-stand", driven: "Gereden sinds vorige", source: "Bron", actor: "Door wie",
  warning: "Waarschuwing", voided: "vervallen", empty: "Leeg",
  sources: { pickup: "Ophalen", return: "Inleveren", damage_check: "Schadecheck", manual: "Handmatig", portal: "Klantportaal", service: "Onderhoud", import: "Import" },
  warningTypes: { decrease: "Km-stand lager dan vorige", jump: "Onlogische sprong" },
};
type PrintData = Parameters<typeof mileageHistoryHtml>[0];
const ASKED = { from: "2000-01-01", to: "2050-12-31" };

describe("mileageHistoryHtml", () => {
  it("the header shows the effective period, not the asked one", () => {
    const html = mileageHistoryHtml(HISTORY as PrintData, LABELS, ASKED);
    expect(html).toMatch(/1 mrt\.? 2026 – 20 mrt\.? 2026/);
    expect(html).not.toContain("2050");
  });

  it("zero rows: the empty text, no chart, no table, the asked period", () => {
    const data = { ...HISTORY, rows: [], summary: { drivenKm: 0, avgPerMonth: null, freeKm: null, overFreeKm: null, readings: 0, warnings: 0, periodFrom: null, periodTo: null } } as PrintData;
    const html = mileageHistoryHtml(data, LABELS, { from: "2026-03-01", to: "2026-03-31" });
    expect(html).toContain("<p>Leeg</p>");
    expect(html).not.toContain("<polyline");
    expect(html).not.toContain("<table");
    expect(html).toMatch(/1 mrt\.? 2026 – 31 mrt\.? 2026/);
    expect(html).not.toMatch(/NaN|undefined|null/);
  });

  it("all rows voided: no chart line, every row listed as vervallen", () => {
    const rows = HISTORY.rows.map((r) => ({ ...r, voided: true, drivenSincePrevious: null, warning: null }));
    const data = { ...HISTORY, rows, summary: { drivenKm: 0, avgPerMonth: null, freeKm: 3100, overFreeKm: 0, readings: 0, warnings: 0, periodFrom: null, periodTo: null } } as PrintData;
    const html = mileageHistoryHtml(data, LABELS, { from: "2026-03-01", to: "2026-03-31" });
    expect(html).not.toContain("<polyline");
    expect(html.match(/<tr class="voided">/g)).toHaveLength(4);
    expect(html.match(/<td>vervallen<\/td>/g)).toHaveLength(4);
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it("exactly one reading: one point, finite coordinates, no NaN", () => {
    const html = mileageHistoryHtml(ONE_READING as PrintData, LABELS, { from: "2026-03-01", to: "2026-03-31" });
    const points = /<polyline points="([^"]*)"/.exec(html)?.[1];
    expect(points).toBe("350.0,100.0");
    expect(html.match(/<circle /g)).toHaveLength(1);
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(1);
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it("escapes every value and draws the chart as an SVG polyline", () => {
    const data = {
      ...HISTORY,
      vehicle: { ...HISTORY.vehicle, brand: "<script>x</script>" },
      rows: HISTORY.rows.map((r) => (r.id === 12 ? { ...r, actorName: "<b>Klaas</b>" } : r)),
    } as PrintData;
    const html = mileageHistoryHtml(data, LABELS, { from: "2026-03-01", to: "2026-03-31" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>Klaas</b>");
    expect(html).toContain("<polyline");
    expect(html).toContain("Km-stand lager dan vorige");
  });
});

describe("Financial tab: km per month is admin only", () => {
  const range = { from: new Date("2026-03-01T12:00:00Z"), to: new Date("2026-03-31T12:00:00Z") };

  it("a non-admin does not request /api/reports/mileage-per-month and sees no card", async () => {
    role = UserRole.USER;
    render(<QueryClientProvider client={client()}><FinancialTab dateRange={range} selectedVehicle="all" /></QueryClientProvider>);
    await waitFor(() => expect(calledWith("/api/reports/vehicle-financials")).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(calledWith("/api/reports/mileage-per-month")).toBe(false);
    expect(screen.queryByTestId("card-mileage-per-month")).not.toBeInTheDocument();
  });

  it("an admin does request it and sees the card", async () => {
    render(<QueryClientProvider client={client()}><FinancialTab dateRange={range} selectedVehicle="all" /></QueryClientProvider>);
    await waitFor(() => expect(calledWith("/api/reports/mileage-per-month")).toBe(true));
    expect(screen.getByTestId("card-mileage-per-month")).toBeInTheDocument();
  });
});

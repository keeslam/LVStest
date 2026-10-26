/**
 * Onderhoudsanalyse (Kees, 2026-10-26), final fix wave:
 * 1. Trends for a non-admin does not loop (no "Maximum update depth").
 * 2. An empty brand or model (null from the server) shows as "Onbekend", filters and drills with "__null".
 * 3. The km-band matrix has an "Onbekende km" column.
 * 5. A plate link inside a clickable row is never a button inside a button.
 * 6. A rising or repeated signal opens the months / dates it looked at.
 * 7. Bouwjaar van > tot is swapped, so no request is ever a 400.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: ["view_reports", "view_vehicles"], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const h = React.createElement;
  const Passthrough = ({ children }: any) => h("div", null, children);
  const chart = (kind: string) => ({ children }: any) => h("div", { "data-testid": `chart-${kind}` }, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: chart("bar"), LineChart: chart("line"), PieChart: chart("pie"), ComposedChart: chart("composed"),
    Pie: () => null, Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, LabelList: () => null,
  };
});

import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const period = { from: "2026-01-01", to: "2026-12-31" };
const line = { perVehicleMonth: 20, vehicles: 3, vehiclesWithCosts: 3, count: 5, rated: true };
const overview = { ...period, tiles: { total: 500, perVehicleMonth: 20.5, count: 6 }, byCategory: [], topVehicles: [] };
const brands = (admin: boolean) => ({
  ...period,
  brands: [{ ...line, brand: "FIAT", total: 400 }, { ...line, brand: null, total: 100 }],
  models: [
    { ...line, brand: "FIAT", model: "DUCATO", key: "FIAT | DUCATO", total: 300 },
    { ...line, brand: "FIAT", model: null, key: "FIAT | __null", total: 100 },
    { ...line, brand: null, model: null, key: "__null | __null", total: 100 },
  ],
  ...(admin ? {
    kmBands: [
      { level: "brand", brand: "FIAT", model: null, band: "50–100.000", amount: 300, km: 10000, perKm: 0.03, vehicles: 1, count: 2 },
      { level: "brand", brand: "FIAT", model: null, band: null, amount: 100, km: 0, perKm: null, vehicles: 1, count: 1 },
      { level: "brand", brand: null, model: null, band: null, amount: 100, km: 0, perKm: null, vehicles: 1, count: 1 },
      { level: "model", brand: "FIAT", model: null, band: null, amount: 100, km: 0, perKm: null, vehicles: 1, count: 1 },
    ],
  } : {}),
});
const vehicles = {
  ...period,
  vehicles: [
    { vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "DUCATO", year: 2019, total: 400, perMonth: 33.33, count: 5, lastDate: "2026-03-02" },
    { vehicleId: 9, licensePlate: "#9", brand: null, model: null, year: null, total: 100, perMonth: 8.33, count: 1, lastDate: "2026-02-01" },
  ],
};
const suppliers = { ...period, suppliers: [], downtime: [], topRepairs: [] };
const trends = { ...period, months: [{ month: "2026-01", amount: 100 }, { month: "2026-02", amount: 400 }] };
const signals = {
  ...period,
  signals: [
    { kind: "rising", vehicleId: 8, licensePlate: "XY999Z", brand: "OPEL", model: "VIVARO", months: [{ month: "2025-12", amount: 10 }, { month: "2026-01", amount: 20 }, { month: "2026-02", amount: 30 }, { month: "2026-03", amount: 40 }], drillFrom: "2025-12-01", drillTo: "2026-03-31" },
    { kind: "repeated", vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "DUCATO", category: "tires", categoryLabel: "Banden", firstDate: "2026-02-01", secondDate: "2026-03-13", days: 40, expenseIds: [1, 2], drillFrom: "2026-02-01", drillTo: "2026-03-13" },
  ],
};
const rows = { ...period, total: 0, amount: 0, rows: [] };

let urls: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const errorSpy = vi.spyOn(console, "error");

beforeEach(() => {
  urls = [];
  role = UserRole.ADMIN;
  errorSpy.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "");
    urls.push(url);
    const admin = role === UserRole.ADMIN;
    const path = url.split("?")[0];
    const p = new URL(url, "http://x").searchParams;
    // The server refuses yearFrom > yearTo.
    if (p.has("yearFrom") && p.has("yearTo") && Number(p.get("yearFrom")) > Number(p.get("yearTo"))) {
      return new Response(JSON.stringify({ message: "Year from is after year to", code: "INVALID_FILTER" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (path.endsWith("/maintenance-analysis/overview")) return json(overview);
    if (path.endsWith("/maintenance-analysis/brands")) return json(brands(admin));
    if (path.endsWith("/maintenance-analysis/vehicles")) return json(vehicles);
    if (path.endsWith("/maintenance-analysis/suppliers")) return json(suppliers);
    if (path.endsWith("/maintenance-analysis/trends")) return json(trends);
    if (path.endsWith("/maintenance-analysis/signals")) return json(signals);
    if (path.endsWith("/maintenance-analysis/rows")) return json(rows);
    return json(null);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderWindow() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);
}

type User = ReturnType<typeof userEvent.setup>;
const params = (url: string) => new URL(url, "http://x").searchParams;
const requested = (part: string, check: (p: URLSearchParams) => boolean) =>
  urls.some((u) => u.split("?")[0].endsWith(`/maintenance-analysis/${part}`) && check(params(u)));
const errorsMatching = (re: RegExp) => errorSpy.mock.calls.filter((args) => re.test(args.map(String).join(" ")));

async function openTab(user: User, tab: string) {
  await user.click(await screen.findByTestId(`tab-ma-${tab}`));
}
async function choose(user: User, testId: string, option: string) {
  await user.click(await screen.findByTestId(testId));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("1. Trends without forecast", () => {
  it("renders for a non-admin without an update loop", async () => {
    role = UserRole.MANAGER ?? "manager";
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "trends");
    await screen.findByTestId("ma-trends-table");
    await new Promise((r) => setTimeout(r, 300));
    expect(errorsMatching(/Maximum update depth/)).toEqual([]);
    expect(urls.filter((u) => u.includes("/maintenance-analysis/trends")).length).toBeLessThan(5);
  });
});

describe("2. Unknown brand and model", () => {
  it("the window renders and the brand filter offers Onbekend, sent as __null", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-brand", "Onbekend");
    await waitFor(() => expect(requested("overview", (p) => p.get("brand") === "__null")).toBe(true));
  });

  it("the type filter offers Onbekend for a type without a name", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-brand", "FIAT");
    await choose(user, "select-ma-model", "Onbekend");
    await waitFor(() => expect(requested("overview", (p) => p.get("brand") === "FIAT" && p.get("model") === "__null")).toBe(true));
  });

  it("brands table shows Onbekend; its types open with key __null", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "brands");
    const table = await screen.findByTestId("ma-brands-table");
    await user.click(within(table).getByTestId("ma-brands-row-__null"));
    expect(within(table).getByTestId("ma-brands-row-__null")).toHaveTextContent("Onbekend");
    const models = await screen.findByTestId("ma-models-table");
    await user.click(within(models).getByTestId("ma-models-table-open-__null | __null"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "model" && p.get("key") === "__null | __null")).toBe(true));
  });

  it("the vehicles table shows Onbekend for a car without brand or model", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    const row = await screen.findByTestId("ma-vehicles-table-row-9");
    expect(within(row).getAllByText("Onbekend").length).toBe(2);
  });
});

describe("3. Km-band matrix", () => {
  it("has an Onbekende km column; its cell opens kmBand __null for that brand", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "brands");
    const matrix = await screen.findByTestId("ma-kmbands");
    expect(within(matrix).getByText("Onbekende km")).toBeInTheDocument();
    const cell = within(matrix).getByTestId("ma-kmband-FIAT-__null");
    // Task 6: no km means no rate, so "–" (never the amount); the cell still opens its lines.
    expect(cell).toHaveTextContent(/^–$/);
    await user.click(cell);
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "kmBand" && p.get("key") === "__null" && p.get("brand") === "FIAT")).toBe(true));
    expect(within(matrix).getByTestId("ma-kmband-__null-__null")).toBeInTheDocument();
  });
});

describe("5. Links inside clickable rows", () => {
  it("no button inside a button in the vehicles table", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    const row = await screen.findByTestId("ma-vehicles-table-row-7");
    expect(row.querySelector("button button")).toBeNull();
    expect(errorsMatching(/validateDOMNesting|cannot be a descendant|cannot contain a nested/)).toEqual([]);
    await user.click(within(row).getByTestId("ma-vehicles-table-open-7"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "vehicle" && p.get("key") === "7")).toBe(true));
  });
});

describe("6. Signal drills", () => {
  it("rising opens the four months it looked at, repeated the two dates with the category", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "signals");
    await user.click(await screen.findByTestId("ma-signals-table-open-rising-8"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "vehicle" && p.get("key") === "8"
      && p.get("from") === "2025-12-01" && p.get("to") === "2026-03-31")).toBe(true));
    await user.keyboard("{Escape}");
    await user.click(await screen.findByTestId("ma-signals-table-open-repeated-7-tires"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "vehicle" && p.get("key") === "7"
      && p.get("from") === "2026-02-01" && p.get("to") === "2026-03-13" && p.get("category") === "tires")).toBe(true));
  });
});

describe("7. Build year", () => {
  it("van after tot is swapped, so no request carries yearFrom > yearTo", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await user.type(screen.getByTestId("input-ma-year-from"), "2022");
    await user.type(screen.getByTestId("input-ma-year-to"), "2019");
    await waitFor(() => expect(requested("overview", (p) => p.get("yearFrom") === "2019" && p.get("yearTo") === "2022")).toBe(true));
    expect(requested("overview", (p) => Number(p.get("yearFrom")) > Number(p.get("yearTo") ?? "9999"))).toBe(false);
  });
});

/**
 * Onderhoudsanalyse (Kees, 2026-10-26), Task 4: the tabs Voertuigen, Leveranciers, Trends and
 * Signalen, and Afdrukken (preview with tiles, chart and table) plus CSV on every tab.
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

// The mock draws every line as an element with its data key and dash pattern.
vi.mock("recharts", async () => {
  const React = await import("react");
  const h = React.createElement;
  const Passthrough = ({ children }: any) => h("div", null, children);
  const chart = (kind: string) => ({ children }: any) => h("div", { "data-testid": `chart-${kind}` }, children);
  const Line = ({ dataKey, strokeDasharray, name }: any) => h("span", { "data-testid": `line-${dataKey}`, "data-dash": strokeDasharray ?? "", "data-name": name ?? "" });
  return {
    ResponsiveContainer: Passthrough, BarChart: chart("bar"), LineChart: chart("line"), PieChart: chart("pie"), ComposedChart: chart("composed"),
    Pie: () => null, Cell: () => null, Bar: () => null, Line, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, LabelList: () => null,
  };
});
const downloadCsv = vi.fn((..._args: unknown[]) => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: unknown[]) => downloadCsv(...a),
}));

import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const period = { from: "2026-01-01", to: "2026-12-31" };
const overview = (admin: boolean) => ({
  ...period,
  tiles: { total: 500, perVehicleMonth: 20.5, count: 6, ...(admin ? { perKm: 0.05 } : {}) },
  byCategory: [{ key: "maintenance", label: "Onderhoud", amount: 500, count: 6 }],
  topVehicles: [{ vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", total: 400, count: 5 }],
});
const line = { perVehicleMonth: 20, vehicles: 3, vehiclesWithCosts: 3, count: 5, rated: true };
const brands = { ...period, brands: [{ ...line, brand: "FIAT", total: 400 }], models: [{ ...line, brand: "FIAT", model: "DUCATO", key: "FIAT | DUCATO", total: 400 }] };
const vehicles = (admin: boolean) => ({
  ...period,
  vehicles: [
    { vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", year: 2019, total: 400, perMonth: 33.33, count: 5, lastDate: "2026-03-02", ...(admin ? { kmBand: "50–100.000", perKm: 0.04 } : {}) },
    { vehicleId: 8, licensePlate: "XY999Z", brand: "OPEL", model: "VIVARO", year: 2020, total: 100, perMonth: 8.33, count: 1, lastDate: "2026-02-01", ...(admin ? { kmBand: null, perKm: null } : {}) },
  ],
});
const costRow = { id: 91, date: "2026-03-02", vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", category: "tires", categoryLabel: "Banden", supplier: "Garage Jansen", supplierKey: "garage jansen", amount: 200, description: "Winterbanden" };
const suppliers = {
  ...period,
  suppliers: [{ key: "garage jansen", supplier: "Garage Jansen", total: 400, count: 5, avg: 80 }, { key: null, supplier: "Onbekend", total: 100, count: 1, avg: 100 }],
  downtime: [{ vehicleId: 7, plate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", visits: 2, days: 6 }],
  topRepairs: [costRow],
};
const trends = (admin: boolean, compare: boolean) => ({
  ...period,
  months: [{ month: "2026-01", amount: 100 }, { month: "2026-02", amount: 400 }].map((m) => (compare ? { ...m, previous: 50 } : m)),
  ...(admin ? {
    forecast: [{ month: "2026-11", amount: 30 }, { month: "2026-12", amount: 30 }, { month: "2027-01", amount: 30 }],
    forecastVehicles: [{ vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", band: "50–100.000", kmPerDay: 50, perKm: 0.02, amount: 90 }],
  } : {}),
});
const signals = {
  ...period,
  signals: [
    { kind: "aboveGroup", vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", basis: "month", value: 32, average: 20, percent: 60, comparables: 3 },
    { kind: "rising", vehicleId: 8, licensePlate: "XY999Z", brand: "OPEL", model: "VIVARO", months: [{ month: "2026-06", amount: 10 }, { month: "2026-07", amount: 20 }, { month: "2026-08", amount: 30 }, { month: "2026-09", amount: 40 }] },
    { kind: "repeated", vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", category: "tires", categoryLabel: "Banden", firstDate: "2026-02-01", secondDate: "2026-03-13", days: 40, expenseIds: [1, 2] },
  ],
};
const rows = { ...period, total: 1, amount: 200, rows: [costRow] };

let urls: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  urls = [];
  role = UserRole.ADMIN;
  downloadCsv.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "");
    urls.push(url);
    const admin = role === UserRole.ADMIN;
    const path = url.split("?")[0];
    const compare = new URL(url, "http://x").searchParams.has("compareFrom");
    if (path.endsWith("/maintenance-analysis/overview")) return json(overview(admin));
    if (path.endsWith("/maintenance-analysis/brands")) return json(brands);
    if (path.endsWith("/maintenance-analysis/vehicles")) return json(vehicles(admin));
    if (path.endsWith("/maintenance-analysis/suppliers")) return json(suppliers);
    if (path.endsWith("/maintenance-analysis/trends")) return json(trends(admin, compare));
    if (path.endsWith("/maintenance-analysis/signals")) return json(signals);
    if (path.endsWith("/maintenance-analysis/rows")) return json(rows);
    if (path.startsWith("/api/user-settings")) return json(null);
    if (path.startsWith("/api/app-settings")) return json(null);
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderWindow() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);
}

type User = ReturnType<typeof userEvent.setup>;
const params = (url: string) => new URL(url, "http://x").searchParams;
const rowsRequested = (check: (p: URLSearchParams) => boolean) => urls.some((u) => u.split("?")[0].endsWith("/maintenance-analysis/rows") && check(params(u)));

async function openTab(user: User, tab: string) {
  await user.click(await screen.findByTestId(`tab-ma-${tab}`));
}

async function printPreview(user: User): Promise<string> {
  await user.click(await screen.findByTestId("button-report-print"));
  const frame = await screen.findByTestId("print-preview-frame", undefined, { timeout: 4000 });
  await waitFor(() => expect(frame.getAttribute("srcdoc") ?? "").toContain("<body"));
  const html = frame.getAttribute("srcdoc") ?? "";
  return /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
}

describe("Voertuigen", () => {
  it("lists the cars with dashed plates and the type without the brand, searchable without dashes", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    const table = await screen.findByTestId("ma-vehicles-table");
    expect(await within(table).findByText("AB-123-C")).toBeInTheDocument();
    expect(within(table).getByText("DUCATO")).toBeInTheDocument();
    await user.type(screen.getByTestId("ma-vehicles-table-search"), "xy999z");
    await waitFor(() => expect(within(table).queryByText("AB-123-C")).toBeNull());
    expect(within(table).getByText("XY-999-Z")).toBeInTheDocument();
  });

  it("sorts on a column header", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    const table = await screen.findByTestId("ma-vehicles-table");
    await within(table).findByText("AB-123-C");
    const order = () => within(table).getAllByRole("row").slice(1).map((r) => r.getAttribute("data-testid"));
    expect(order()).toEqual(["ma-vehicles-table-row-7", "ma-vehicles-table-row-8"]);
    await user.click(screen.getByTestId("ma-vehicles-table-sort-total"));
    await waitFor(() => expect(order()).toEqual(["ma-vehicles-table-row-8", "ma-vehicles-table-row-7"]));
  });

  it("has a Kolommen button that hides a column", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    const table = await screen.findByTestId("ma-vehicles-table");
    expect(await within(table).findByText("Bouwjaar")).toBeInTheDocument();
    await user.click(within(table).getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-toggle-year"));
    await waitFor(() => expect(within(table).queryByText("Bouwjaar")).toBeNull());
  });

  it("opens the cost lines of a car from its row", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "vehicles");
    await user.click(await screen.findByTestId("ma-vehicles-table-row-7"));
    await waitFor(() => expect(rowsRequested((p) => p.get("drill") === "vehicle" && p.get("key") === "7")).toBe(true));
  });

  it("shows km band and per km only to an admin", async () => {
    const user = userEvent.setup();
    role = UserRole.USER;
    renderWindow();
    await openTab(user, "vehicles");
    const table = await screen.findByTestId("ma-vehicles-table");
    await within(table).findByText("AB-123-C");
    expect(within(table).queryByText("Km-klasse")).toBeNull();
    expect(within(table).queryByText("Per km")).toBeNull();
  });
});

describe("Leveranciers", () => {
  it("shows the costs without a supplier as Onbekend and opens them with the null key", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "suppliers");
    const table = await screen.findByTestId("ma-suppliers-table");
    expect(await within(table).findByText("Onbekend")).toBeInTheDocument();
    expect(within(table).getByText("Garage Jansen")).toBeInTheDocument();
    await user.click(within(table).getByTestId("ma-suppliers-table-row-__null"));
    await waitFor(() => expect(rowsRequested((p) => p.get("drill") === "supplier" && p.get("key") === "__null")).toBe(true));
  });

  it("shows the workshop downtime and the largest repairs", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "suppliers");
    const downtime = await screen.findByTestId("ma-downtime-table");
    expect(await within(downtime).findByText("AB-123-C")).toBeInTheDocument();
    const repairs = await screen.findByTestId("ma-top-repairs-table");
    expect(within(repairs).getByText("Winterbanden")).toBeInTheDocument();
  });
});

describe("Trends", () => {
  it("draws the comparison series and, for an admin, the forecast as a dashed line", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await user.click(screen.getByTestId("select-ma-compare"));
    await user.click(await screen.findByRole("option", { name: "Vorige periode" }));
    await openTab(user, "trends");
    expect(await screen.findByTestId("line-previous")).toBeInTheDocument();
    expect(screen.getByTestId("line-amount").getAttribute("data-dash")).toBe("");
    expect(screen.getByTestId("line-forecast").getAttribute("data-dash")).not.toBe("");
    expect(await screen.findByTestId("ma-forecast-table")).toBeInTheDocument();
  });

  it("has no comparison series without Vergelijk met and no forecast for a non-admin", async () => {
    const user = userEvent.setup();
    role = UserRole.USER;
    renderWindow();
    await openTab(user, "trends");
    expect(await screen.findByTestId("line-amount")).toBeInTheDocument();
    expect(screen.queryByTestId("line-previous")).toBeNull();
    expect(screen.queryByTestId("line-forecast")).toBeNull();
    expect(screen.queryByTestId("ma-forecast-table")).toBeNull();
  });
});

describe("Signalen", () => {
  it("gives every signal a reason in plain Dutch", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "signals");
    const table = await screen.findByTestId("ma-signals-table");
    expect(await within(table).findByText(/60% duurder per maand dan het gemiddelde van 3 andere FIAT DUCATO/)).toBeInTheDocument();
    expect(within(table).getByText(/3 maanden op rij hoger/)).toBeInTheDocument();
    expect(within(table).getByText(/Banden 2 keer binnen 40 dagen/)).toBeInTheDocument();
  });

  it("opens the cost lines behind a signal", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "signals");
    const table = await screen.findByTestId("ma-signals-table");
    await within(table).findByText(/Banden 2 keer/);
    await user.click(within(table).getByTestId("ma-signals-table-row-repeated-7-tires"));
    await waitFor(() => expect(rowsRequested((p) => p.get("drill") === "vehicle" && p.get("key") === "7" && p.get("category") === "tires")).toBe(true));
  });
});

describe("Afdrukken and CSV on every tab", () => {
  const cases: Array<{ tab: string; csv: string; print: string[] }> = [
    { tab: "overview", csv: "button-ma-top-vehicles-csv", print: ["Totale kosten", "AB-123-C"] },
    { tab: "brands", csv: "button-ma-brands-csv", print: ["Merken", "FIAT"] },
    { tab: "vehicles", csv: "button-ma-vehicles-csv", print: ["XY-999-Z", "Bouwjaar"] },
    { tab: "suppliers", csv: "button-ma-suppliers-csv", print: ["Garage Jansen", "Onbekend"] },
    { tab: "trends", csv: "button-ma-trends-csv", print: ["Maand", "400,00"] },
    { tab: "signals", csv: "button-ma-signals-csv", print: ["3 maanden op rij hoger"] },
  ];
  for (const c of cases) {
    it(`${c.tab}: CSV of the table and a print preview with its content`, async () => {
      const user = userEvent.setup();
      renderWindow();
      await openTab(user, c.tab);
      const csv = await screen.findByTestId(c.csv);
      await waitFor(() => expect(csv).not.toBeDisabled());
      await user.click(csv);
      expect(downloadCsv).toHaveBeenCalledTimes(1);
      const [name, header, lines] = downloadCsv.mock.calls[0] as [string, string[], string[][]];
      expect(name).toMatch(/^onderhoud/);
      expect(header.length).toBeGreaterThan(1);
      expect(lines.length).toBeGreaterThan(0);
      const body = await printPreview(user);
      for (const text of c.print) expect(body).toContain(text);
    });
  }
});

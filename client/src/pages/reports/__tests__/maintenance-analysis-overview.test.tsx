/**
 * Onderhoudsanalyse (Kees, 2026-10-26), Task 3: the rebuilt window — filter bar, Overzicht and
 * Merken en typen. Replaces the tests of the old page (p7a-maintenance-costs-page/-request):
 * the window now reads /api/reports/maintenance-analysis/* with the shared filter.
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

// recharts needs a measured container. The mock shows which chart is drawn, and a pie draws its
// slices as buttons with the label the real chart would draw, so the click and the label are testable.
vi.mock("recharts", async () => {
  const React = await import("react");
  const h = React.createElement;
  const Passthrough = ({ children }: any) => h("div", null, children);
  const chart = (kind: string) => ({ children }: any) => h("div", { "data-testid": `chart-${kind}` }, children);
  const Pie = ({ data, label, onClick }: any) => {
    const sum = data.reduce((s: number, d: any) => s + d.value, 0);
    return h("div", null, data.map((d: any, i: number) => h("button", {
      key: i,
      type: "button",
      "data-testid": `pie-slice-${i}`,
      onClick: () => onClick?.(d, i),
    }, typeof label === "function" ? label({ payload: d, percent: sum ? d.value / sum : 0, name: d.label, value: d.value }) : d.label)));
  };
  return {
    ResponsiveContainer: Passthrough, BarChart: chart("bar"), LineChart: chart("line"), PieChart: chart("pie"), Pie,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, LabelList: () => null,
  };
});

import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const tiles = { total: 500, perVehicleMonth: 20.5, count: 6 };
const overview = (admin: boolean) => ({
  from: "2026-01-01", to: "2026-12-31",
  tiles: admin ? { ...tiles, perKm: 0.05 } : tiles,
  byCategory: [
    { key: "maintenance", label: "Onderhoud", amount: 300, count: 4 },
    { key: "tires", label: "Banden", amount: 200, count: 2 },
  ],
  topVehicles: [{ vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", total: 400, count: 5 }],
});
const line = { perVehicleMonth: 20, vehicles: 3, vehiclesWithCosts: 3, count: 5, rated: true };
const brands = (admin: boolean) => ({
  from: "2026-01-01", to: "2026-12-31",
  brands: [{ ...line, brand: "FIAT", total: 400, ...(admin ? { perKm: 0.04 } : {}) }, { ...line, brand: "OPEL", total: 100, count: 1, rated: false }],
  models: [
    { ...line, brand: "FIAT", model: "DUCATO", key: "FIAT | DUCATO", total: 400 },
    { ...line, brand: "OPEL", model: "VIVARO", key: "OPEL | VIVARO", total: 100 },
  ],
  ...(admin ? {
    kmBands: [
      { level: "brand", brand: "FIAT", model: null, band: "50–100.000", amount: 400, km: 10_000, perKm: 0.04, vehicles: 3, count: 5 },
      { level: "model", brand: "FIAT", model: "DUCATO", band: "50–100.000", amount: 400, km: 10_000, perKm: 0.04, vehicles: 3, count: 5 },
    ],
  } : {}),
});
const suppliers = {
  from: "2026-01-01", to: "2026-12-31",
  suppliers: [{ key: "garage jansen", supplier: "Garage Jansen", total: 400, count: 5, avg: 80 }, { key: null, supplier: "Onbekend", total: 100, count: 1, avg: 100 }],
  downtime: [], topRepairs: [],
};
const rows = {
  from: "2026-01-01", to: "2026-12-31", total: 1, amount: 200,
  rows: [{ id: 91, date: "2026-03-02", vehicleId: 7, licensePlate: "AB123C", brand: "FIAT", model: "FIAT DUCATO", category: "tires", categoryLabel: "Banden", supplier: "Garage Jansen", supplierKey: "garage jansen", amount: 200, description: "Winterbanden" }],
};

let urls: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  urls = [];
  role = UserRole.ADMIN;
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "");
    urls.push(url);
    const admin = role === UserRole.ADMIN;
    const path = url.split("?")[0];
    if (path.endsWith("/maintenance-analysis/overview")) return json(overview(admin));
    if (path.endsWith("/maintenance-analysis/brands")) return json(brands(admin));
    if (path.endsWith("/maintenance-analysis/suppliers")) return json(suppliers);
    if (path.endsWith("/maintenance-analysis/rows")) return json(rows);
    if (path.startsWith("/api/app-settings")) return json(null);
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderWindow() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MaintenanceCostsPage /></QueryClientProvider>);
}

const params = (url: string) => new URL(url, "http://x").searchParams;
const requests = (part: string) => urls.filter((u) => u.split("?")[0].endsWith(`/maintenance-analysis/${part}`));

async function choose(user: ReturnType<typeof userEvent.setup>, testId: string, option: string) {
  await user.click(await screen.findByTestId(testId));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Onderhoudsanalyse window: filter bar", () => {
  it("shows all six tabs", async () => {
    renderWindow();
    for (const id of ["overview", "brands", "vehicles", "suppliers", "trends", "signals"]) {
      expect(await screen.findByTestId(`tab-ma-${id}`)).toBeInTheDocument();
    }
  });

  it("sends brand, type and supplier with every request", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");

    await choose(user, "select-ma-brand", "FIAT");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("brand") === "FIAT")).toBe(true));

    await choose(user, "select-ma-model", "DUCATO");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("model") === "DUCATO" && params(u).get("brand") === "FIAT")).toBe(true));

    await choose(user, "select-ma-supplier", "Garage Jansen");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("supplier") === "garage jansen")).toBe(true));

    await choose(user, "select-ma-supplier", "Onbekend");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("supplier") === "__null")).toBe(true));
  });

  it("sends the comparison period when Vergelijk met is chosen", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-compare", "Zelfde periode vorig jaar");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("compareFrom") && params(u).get("compareTo"))).toBe(true));
    expect(await screen.findByTestId("ma-tile-total-previous")).toBeInTheDocument();
  });

  it("gives an admin the km-band filter and the per-km tile", async () => {
    const user = userEvent.setup();
    renderWindow();
    expect(await screen.findByTestId("ma-tile-perKm-value")).toHaveTextContent("0,05");
    await choose(user, "select-ma-kmband", "50–100.000");
    await waitFor(() => expect(requests("overview").some((u) => params(u).get("kmBand") === "50–100.000")).toBe(true));
  });

  it("gives a non-admin no km-band filter and no per-km tile", async () => {
    role = UserRole.USER;
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    expect(screen.queryByTestId("select-ma-kmband")).toBeNull();
    expect(screen.queryByTestId("ma-tile-perKm-value")).toBeNull();
    expect(urls.every((u) => !params(u).has("kmBand"))).toBe(true);
  });
});

describe("Onderhoudsanalyse window: Overzicht", () => {
  it("labels every pie slice with its category name and share", async () => {
    renderWindow();
    expect(await screen.findByTestId("pie-slice-0")).toHaveTextContent("Onderhoud 60%");
    expect(screen.getByTestId("pie-slice-1")).toHaveTextContent("Banden 40%");
    expect(screen.queryByText("tires")).toBeNull();
  });

  it("opens the cost lines of a category from its slice", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("pie-slice-1"));
    await waitFor(() => expect(requests("rows").some((u) => params(u).get("drill") === "category" && params(u).get("key") === "tires")).toBe(true));
    const dialog = await screen.findByTestId("dialog-ma-rows");
    expect(await within(dialog).findByText("AB-123-C")).toBeInTheDocument();
    expect(within(dialog).getByText("Winterbanden")).toBeInTheDocument();
  });

  it("switches the category chart between pie, bar and line", async () => {
    const user = userEvent.setup();
    renderWindow();
    expect(await screen.findByTestId("chart-pie")).toBeInTheDocument();
    await choose(user, "ma-category-chart-kind", "Staaf");
    expect(await screen.findByTestId("chart-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-pie")).toBeNull();
    await choose(user, "ma-category-chart-kind", "Lijn");
    expect(await screen.findByTestId("chart-line")).toBeInTheDocument();
  });

  it("shows plates with dashes and the type without the brand twice", async () => {
    renderWindow();
    const table = await screen.findByTestId("ma-top-vehicles");
    expect(await within(table).findByText("AB-123-C")).toBeInTheDocument();
    expect(within(table).getByText("DUCATO")).toBeInTheDocument();
    expect(within(table).queryByText("FIAT DUCATO")).toBeNull();
  });
});

describe("Onderhoudsanalyse window: Merken en typen", () => {
  it("shows the types of a brand after a click on the brand", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    expect(screen.queryByTestId("ma-models")).toBeNull();
    await user.click(await screen.findByTestId("ma-brands-row-FIAT"));
    const models = await screen.findByTestId("ma-models");
    expect(within(models).getByText("DUCATO")).toBeInTheDocument();
    expect(within(models).queryByText("VIVARO")).toBeNull();
  });

  it("rates a brand only with enough data", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    const opel = await screen.findByTestId("ma-brands-row-OPEL");
    expect(opel.closest("tr")).toHaveTextContent("Onvoldoende gegevens");
  });

  it("switches the brand chart between bar, line and pie", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    expect(await screen.findByTestId("chart-bar")).toBeInTheDocument();
    await choose(user, "ma-brand-chart-kind", "Taart");
    expect(await screen.findByTestId("chart-pie")).toBeInTheDocument();
    await choose(user, "ma-brand-chart-kind", "Lijn");
    expect(await screen.findByTestId("chart-line")).toBeInTheDocument();
  });

  it("opens the lines of a km band cell for an admin", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    await user.click(await screen.findByTestId("ma-kmband-FIAT-50–100.000"));
    await waitFor(() => expect(requests("rows").some((u) => {
      const p = params(u);
      return p.get("drill") === "kmBand" && p.get("key") === "50–100.000" && p.get("brand") === "FIAT";
    })).toBe(true));
  });

  it("has no km band table and no per-km metric for a non-admin", async () => {
    role = UserRole.USER;
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByTestId("tab-ma-brands"));
    await screen.findByTestId("ma-brands-row-FIAT");
    expect(screen.queryByTestId("ma-kmbands")).toBeNull();
    await user.click(screen.getByTestId("ma-brand-chart-metric"));
    expect(screen.queryByRole("option", { name: "Per km" })).toBeNull();
  });
});

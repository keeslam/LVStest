/**
 * Onderhoudsanalyse, Task 6 (Kees, 2026-10-26): brand and type profile.
 * - Merk = FIAT in the filter: Merken en typen shows the types of FIAT, not one brand bar and row.
 * - The rating compares with the whole fleet (fleetPerVehicleMonth), not with the filtered selection.
 * - Km table: "–" where there is no rate (0 km, a rate of 0,000, Onbekende km), never an amount.
 * - A click on a type sets the type filter; brand + type shows the profile card with the hint.
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
const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));

import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

const period = { from: "2026-01-01", to: "2026-12-31" };
const line = { vehicles: 3, vehiclesWithCosts: 3, count: 5, rated: true };
// Overview of the (filtered) selection: 20.5. The whole fleet: 25. FIAT at 22 is "Goed" against 20.5
// but "Uitstekend" against the fleet.
const overview = { ...period, tiles: { total: 500, perVehicleMonth: 20.5, count: 6 }, byCategory: [], topVehicles: [] };
const brands = {
  ...period,
  fleetPerVehicleMonth: 25,
  brands: [{ ...line, brand: "FIAT", total: 400, perVehicleMonth: 22 }, { ...line, brand: "FORD", total: 100, perVehicleMonth: 10 }],
  models: [
    { ...line, brand: "FIAT", model: "DUCATO", key: "FIAT | DUCATO", total: 300, perVehicleMonth: 30 },
    { ...line, brand: "FIAT", model: "DOBLO", key: "FIAT | DOBLO", total: 100, perVehicleMonth: 12 },
    { ...line, brand: "FORD", model: "TRANSIT", key: "FORD | TRANSIT", total: 100, perVehicleMonth: 10 },
  ],
  kmBands: [
    { level: "brand", brand: "FIAT", model: null, band: "0–50.000", amount: 5, km: 40000, perKm: 0.0001, vehicles: 1, count: 1 },
    { level: "brand", brand: "FIAT", model: null, band: "50–100.000", amount: 300, km: 10000, perKm: 0.03, vehicles: 1, count: 2 },
    { level: "brand", brand: "FIAT", model: null, band: "100–150.000", amount: 80, km: 0, perKm: null, vehicles: 1, count: 1 },
    { level: "brand", brand: "FIAT", model: null, band: null, amount: 1369.44, km: 0, perKm: null, vehicles: 1, count: 3 },
    { level: "model", brand: "FIAT", model: "DUCATO", band: "50–100.000", amount: 300, km: 10000, perKm: 0.03, vehicles: 1, count: 2 },
    { level: "model", brand: "FIAT", model: "DOBLO", band: null, amount: 100, km: 0, perKm: null, vehicles: 1, count: 1 },
    { level: "brand", brand: "FORD", model: null, band: "50–100.000", amount: 100, km: 10000, perKm: 0.01, vehicles: 1, count: 1 },
  ],
};
const profile = {
  ...period,
  brand: "FIAT",
  model: "DUCATO",
  vehicles: 4,
  avgAgeYears: 6.5,
  avgKm: 123456,
  perVehicleMonth: 30,
  fleetPerVehicleMonth: 25,
  byCategory: [
    { key: "maintenance", label: "Onderhoud", amount: 250, count: 3 },
    { key: "tires", label: "Banden", amount: 0, count: 0 },
    { key: "brakes", label: "Remmen", amount: 50, count: 1 },
  ],
  topRepairs: [
    { key: "maintenance|grote beurt", label: "Grote beurt", category: "maintenance", description: "Grote beurt", count: 2, amount: 200 },
    { key: "brakes|__null", label: "Remmen", category: "brakes", description: null, count: 1, amount: 50 },
  ],
  byYear: [{ year: 2019, perVehicleMonth: 28, vehicles: 3 }, { year: null, perVehicleMonth: 0, vehicles: 1 }],
  kmBands: [{ level: "model", brand: "FIAT", model: "DUCATO", band: "50–100.000", amount: 300, km: 10000, perKm: 0.03, vehicles: 1, count: 2 }],
  best: [{ vehicleId: 11, plate: "AB-123-C", perMonth: 0, total: 0, count: 0 }],
  worst: [{ vehicleId: 12, plate: "XY-999-Z", perMonth: 80, total: 700, count: 4 }],
  suppliers: [{ key: "garage a", supplier: "Garage A", total: 300, count: 4, avg: 75 }],
  interval: { months: 4.5, km: 15000, vehicles: 3, outliers: [{ vehicleId: 12, plate: "XY-999-Z", months: 2, km: 5000 }] },
  replaceHints: [{ vehicleId: 12, plate: "XY-999-Z", ratio12: 3.2, ratio6: 2.5 }],
};
const empty = { ...period, total: 0, amount: 0, rows: [] };

let urls: string[] = [];
let profileBody: unknown = profile;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  urls = [];
  profileBody = profile;
  role = UserRole.ADMIN;
  downloadCsv.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).replace(/^https?:\/\/[^/]+/, "");
    urls.push(url);
    const path = url.split("?")[0];
    if (path.endsWith("/maintenance-analysis/overview")) return json(overview);
    if (path.endsWith("/maintenance-analysis/brands")) return json(brands);
    if (path.endsWith("/maintenance-analysis/profile")) return json(profileBody);
    if (path.endsWith("/maintenance-analysis/vehicles")) return json({ ...period, vehicles: [] });
    if (path.endsWith("/maintenance-analysis/suppliers")) return json({ ...period, suppliers: [], downtime: [], topRepairs: [] });
    if (path.endsWith("/maintenance-analysis/trends")) return json({ ...period, months: [] });
    if (path.endsWith("/maintenance-analysis/signals")) return json({ ...period, signals: [] });
    if (path.endsWith("/maintenance-analysis/rows")) return json(empty);
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

async function openTab(user: User, tab: string) {
  await user.click(await screen.findByTestId(`tab-ma-${tab}`));
}
async function choose(user: User, testId: string, option: string) {
  await user.click(await screen.findByTestId(testId));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Merken en typen with a brand filter", () => {
  it("Merk = FIAT shows the types of FIAT instead of one brand row", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-brand", "FIAT");
    await openTab(user, "brands");
    const models = await screen.findByTestId("ma-models-table");
    expect(within(models).getByText("DUCATO")).toBeInTheDocument();
    expect(within(models).getByText("DOBLO")).toBeInTheDocument();
    expect(within(models).queryByText("TRANSIT")).toBeNull();
    expect(screen.queryByTestId("ma-brands-table")).toBeNull();
    // The km table lists the types of FIAT too.
    const matrix = screen.getByTestId("ma-kmbands");
    expect(within(matrix).getByText("DUCATO")).toBeInTheDocument();
  });

  it("a click on a type sets the type filter and shows its profile", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-brand", "FIAT");
    await openTab(user, "brands");
    await user.click(await screen.findByTestId("ma-models-type-FIAT | DUCATO"));
    await waitFor(() => expect(requested("profile", (p) => p.get("brand") === "FIAT" && p.get("model") === "DUCATO")).toBe(true));
    expect(await screen.findByTestId("ma-profile")).toBeInTheDocument();
    expect(screen.getByTestId("select-ma-model")).toHaveTextContent("DUCATO");
  });
});

describe("rating", () => {
  it("compares with the whole fleet, not with the filtered selection", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "brands");
    const table = await screen.findByTestId("ma-brands-table");
    const fiat = within(table).getByTestId("ma-brands-row-FIAT").closest("tr")!;
    expect(within(fiat).getByText("Uitstekend")).toBeInTheDocument();
  });
});

describe("km table", () => {
  it("shows – where there is no rate: a rate that rounds to 0,000, no km, and Onbekende km", async () => {
    const user = userEvent.setup();
    renderWindow();
    await openTab(user, "brands");
    const matrix = await screen.findByTestId("ma-kmbands");
    expect(within(matrix).getByTestId("ma-kmband-FIAT-0–50.000")).toHaveTextContent(/^–$/);
    expect(within(matrix).getByTestId("ma-kmband-FIAT-100–150.000")).toHaveTextContent(/^–$/);
    expect(within(matrix).getByTestId("ma-kmband-FIAT-__null")).toHaveTextContent(/^–$/);
    expect(matrix.textContent).not.toMatch(/0,000/);
    expect(matrix.textContent).not.toMatch(/1\.369,44/);
    expect(within(matrix).getByTestId("ma-kmband-FIAT-50–100.000")).toHaveTextContent("0,030");
    // A cell without a rate still opens its cost lines.
    await user.click(within(matrix).getByTestId("ma-kmband-FIAT-__null"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "kmBand" && p.get("key") === "__null" && p.get("brand") === "FIAT")).toBe(true));
  });
});

describe("profile card", () => {
  async function openProfile(user: User) {
    renderWindow();
    await screen.findByTestId("ma-tile-total-value");
    await choose(user, "select-ma-brand", "FIAT");
    await choose(user, "select-ma-model", "DUCATO");
    await openTab(user, "brands");
    return screen.findByTestId("ma-profile");
  }

  it("shows the figures, the interval, the outliers and the replacement hint", async () => {
    const user = userEvent.setup();
    const card = await openProfile(user);
    expect(within(card).getByTestId("ma-profile-vehicles")).toHaveTextContent("4");
    expect(within(card).getByTestId("ma-profile-age")).toHaveTextContent("6,5 jaar");
    expect(within(card).getByTestId("ma-profile-km")).toHaveTextContent("123.456");
    expect(within(card).getByTestId("ma-profile-fleet")).toHaveTextContent("25,00");
    expect(within(card).getByTestId("ma-profile-interval")).toHaveTextContent("4,5 maanden");
    expect(within(card).getByTestId("ma-profile-interval")).toHaveTextContent("15.000 km");
    expect(within(card).getByTestId("ma-profile-outliers-table")).toHaveTextContent("XY-999-Z");
    const hint = within(card).getByTestId("ma-profile-hint-12");
    expect(hint).toHaveTextContent("Deze auto is al een jaar duidelijk duurder dan andere DUCATO's. Misschien tijd om vervanging te overwegen.");
    // The plate opens the vehicle window (a link button), not the cost lines.
    expect(within(hint).getByRole("button", { name: "XY-999-Z" })).toBeInTheDocument();
    expect(within(card).getByTestId("ma-profile-repairs-table")).toHaveTextContent("Grote beurt");
  });

  it("says the interval is over the last 24 months", async () => {
    const user = userEvent.setup();
    const card = await openProfile(user);
    expect(within(card).getByTestId("ma-profile-interval")).toHaveTextContent("over de laatste 24 maanden");
  });

  it("the hint panel has its own text colour and a dark-mode variant", async () => {
    const user = userEvent.setup();
    const card = await openProfile(user);
    const cls = within(card).getByTestId("ma-profile-hints").className;
    expect(cls).toMatch(/text-amber-950/);
    expect(cls).toMatch(/dark:bg-/);
    expect(cls).toMatch(/dark:text-/);
  });

  it("does not say \"andere Onbekend's\" when the type is unknown", async () => {
    profileBody = { ...profile, model: null };
    const user = userEvent.setup();
    const card = await openProfile(user);
    const hint = within(card).getByTestId("ma-profile-hint-12");
    expect(hint).toHaveTextContent("andere auto's van dit type");
    expect(hint.textContent).not.toMatch(/Onbekend/);
  });

  it("prints a profile table in the order it has on screen", async () => {
    const user = userEvent.setup();
    const card = await openProfile(user);
    await user.click(within(card).getByTestId("ma-profile-categories-table-sort-amount"));
    await user.click(screen.getByTestId("button-report-print"));
    const frame = await screen.findByTestId("print-preview-frame", undefined, { timeout: 4000 });
    await waitFor(() => {
      const html = frame.getAttribute("srcdoc") ?? "";
      const part = html.slice(html.indexOf("Kosten per categorie"));
      expect(part.indexOf("Banden")).toBeGreaterThan(-1);
      expect(part.indexOf("Banden")).toBeLessThan(part.indexOf("Remmen"));
      expect(part.indexOf("Remmen")).toBeLessThan(part.indexOf("Onderhoud"));
    });
  });

  it("a repair opens its cost lines; CSV exports a table", async () => {
    const user = userEvent.setup();
    const card = await openProfile(user);
    await user.click(within(card).getByTestId("ma-profile-repairs-table-open-maintenance|grote beurt"));
    await waitFor(() => expect(requested("rows", (p) => p.get("drill") === "repair" && p.get("key") === "maintenance|grote beurt"
      && p.get("brand") === "FIAT" && p.get("model") === "DUCATO")).toBe(true));
    await user.keyboard("{Escape}");
    await user.click(within(card).getByTestId("button-ma-profile-repairs-csv"));
    expect(downloadCsv).toHaveBeenCalled();
  });

  it("a non-admin sees no km figures", async () => {
    role = UserRole.MANAGER ?? "manager";
    const user = userEvent.setup();
    const card = await openProfile(user);
    expect(within(card).queryByTestId("ma-profile-km")).toBeNull();
    expect(within(card).queryByTestId("ma-profile-kmbands-table")).toBeNull();
    expect(within(card).getByTestId("ma-profile-interval")).not.toHaveTextContent("km");
  });
});

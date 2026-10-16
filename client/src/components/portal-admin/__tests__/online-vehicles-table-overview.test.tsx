/**
 * "Voertuigen online" voor een grote vloot: filters (online/offline, status,
 * merk, zoekterm), sorteerbare kolomkoppen, pagina's van 50 en een
 * selectiebalk met "alles op deze pagina". De omschrijving voor klanten is
 * alleen een invoerveld bij auto's die online staan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => ({ openPortalListDialog: vi.fn() }) }));

import { OnlineVehiclesTable, filterVehicles, sortVehicles, type OnlineVehicleRow } from "@/components/portal-admin/online-vehicles-table";

const base = { vehicleType: null, onlineDescription: null, dailyPrice: null, monthlyPrice: null, blockedCustomers: 0, offeredOnline: false };
const BRANDS = ["Opel", "Volkswagen", "Ford", "Renault"];
const STATUSES = ["available", "rented", "needs_fixing", "not_for_rental"];
/** 120 auto's: drie pagina's van 50, met variatie in merk, status en online. */
const fleet: OnlineVehicleRow[] = Array.from({ length: 120 }, (_, i) => ({
  ...base,
  id: i + 1,
  licensePlate: `AA-${String(i + 1).padStart(3, "0")}-B`,
  brand: BRANDS[i % BRANDS.length],
  model: `Model ${String.fromCharCode(65 + (i % 26))}`,
  availabilityStatus: STATUSES[i % STATUSES.length],
  offeredOnline: i % 3 === 0,
  onlineDescription: i % 3 === 0 ? `Omschrijving ${i + 1}` : null,
  blockedCustomers: i === 7 ? 2 : 0,
}));

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><OnlineVehiclesTable /></QueryClientProvider>);
}
const visiblePlates = () => screen.getAllByTestId(/^row-vehicle-/).map((row) => within(row).getAllByRole("cell")[1].textContent);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
    new Response(JSON.stringify((init?.method ?? "GET") === "GET" ? fleet : { updated: 1 }), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("voertuigen online — overzicht voor een grote vloot", () => {
  it("shows 50 per page with a counter, and pages through", async () => {
    renderTable();
    await screen.findByTestId("row-vehicle-1");
    expect(screen.getAllByTestId(/^row-vehicle-/)).toHaveLength(50);
    expect(screen.getByTestId("vehicles-online-summary")).toHaveTextContent("40 van 120 voertuigen online");
    expect(screen.getByTestId("vehicles-page-indicator")).toHaveTextContent("1 / 3");
    await userEvent.click(screen.getByTestId("vehicles-next-page"));
    expect(screen.getByTestId("vehicles-page-indicator")).toHaveTextContent("2 / 3");
    expect(screen.getByTestId("vehicles-pagination")).toHaveTextContent("51–100 van 120");
  });

  it("filters on online, status and brand, and says how many are left", async () => {
    renderTable();
    await screen.findByTestId("row-vehicle-1");
    await userEvent.click(screen.getByTestId("filter-online-online"));
    expect(screen.getByTestId("vehicles-count")).toHaveTextContent("40 van 120 voertuigen");
    await userEvent.selectOptions(screen.getByTestId("filter-vehicle-brand"), "Opel");
    const left = filterVehicles(fleet, { search: "", status: "", brand: "Opel", online: "online" }).length;
    expect(screen.getByTestId("vehicles-count")).toHaveTextContent(`${left} van 120 voertuigen`);
    expect(screen.getAllByTestId(/^row-vehicle-/)).toHaveLength(left);
    await userEvent.click(screen.getByTestId("vehicles-clear-filters"));
    expect(screen.getByTestId("vehicles-count")).toHaveTextContent("120 voertuigen");
  });

  it("sorts on a column head and keeps the sort while paging", async () => {
    renderTable();
    await screen.findByTestId("row-vehicle-1");
    await userEvent.click(screen.getByTestId("sort-vehicle-plate"));
    expect(visiblePlates()[0]).toBe("AA-001-B");
    await userEvent.click(screen.getByTestId("sort-vehicle-plate"));
    expect(visiblePlates()[0]).toBe("AA-120-B");
    expect(screen.getByTestId("sort-vehicle-plate").closest("th")).toHaveAttribute("aria-sort", "descending");
  });

  it("only offers the description field for cars that are online", async () => {
    renderTable();
    await screen.findByTestId("row-vehicle-1");
    await userEvent.click(screen.getByTestId("sort-vehicle-plate"));
    expect(within(screen.getByTestId("row-vehicle-1")).getByRole("textbox")).toHaveValue("Omschrijving 1");
    expect(within(screen.getByTestId("row-vehicle-2")).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("row-vehicle-2")).getAllByRole("cell")[5]).toHaveTextContent("—");
  });

  it("selects the whole page from the head checkbox and offers the rest of the selection", async () => {
    renderTable();
    await screen.findByTestId("row-vehicle-1");
    await userEvent.click(screen.getByTestId("filter-online-offline"));
    await userEvent.click(screen.getByTestId("vehicles-select-page"));
    expect(screen.getByTestId("vehicles-selection-bar")).toHaveTextContent("50 geselecteerd");
    await userEvent.click(screen.getByTestId("vehicles-select-all-filtered"));
    expect(screen.getByTestId("vehicles-selection-bar")).toHaveTextContent("80 geselecteerd");
    await userEvent.click(screen.getByRole("button", { name: "Selectie wissen" }));
    expect(screen.queryByTestId("vehicles-selection-bar")).not.toBeInTheDocument();
  });
});

describe("sortVehicles", () => {
  it("puts the statuses in work order and online cars first", () => {
    const byStatus = sortVehicles(fleet, { key: "status", dir: "asc" }).map((v) => v.availabilityStatus);
    expect(byStatus.indexOf("rented")).toBeGreaterThan(byStatus.lastIndexOf("available"));
    expect(byStatus.indexOf("not_for_rental")).toBeGreaterThan(byStatus.lastIndexOf("needs_fixing"));
    const byOnline = sortVehicles(fleet, { key: "online", dir: "asc" }).map((v) => v.offeredOnline);
    expect(byOnline.indexOf(false)).toBe(40);
  });
});

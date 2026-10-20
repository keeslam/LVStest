/**
 * Punt 14 (Kees, 2026-10-20) — the availability window: free cars per type,
 * busy cars with "vrij t/m" / "vrij vanaf", and the type filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { AvailabilityDialog } from "@/components/dashboard/availability-dialog";

const row = (over: Record<string, unknown>) => ({
  id: 1, licensePlate: "AB123C", brand: "Volkswagen", model: "Polo", vehicleType: "Hatchback",
  currentMileage: 12000, currentFuelLevel: "Full", apkDate: "2027-05-01", apkExpiresInPeriod: false,
  freeKmPerDay: 200, maintenancePlanned: false, ...over,
});

let board: any;
const baseBoard = () => ({
  startDate: "2026-10-21", endDate: "2026-10-24",
  free: [
    row({ id: 1 }),
    row({ id: 2, licensePlate: "VN456B", brand: "Ford", model: "Transit", vehicleType: "Van", apkExpiresInPeriod: true, apkDate: "2026-10-22", maintenancePlanned: true }),
  ],
  busy: [
    row({ id: 3, licensePlate: "XY999Z", freeUntil: "2026-10-22" }),
    row({ id: 4, licensePlate: "QQ111A", freeFrom: "2026-10-26" }),
    row({ id: 5, licensePlate: "ZZ222B", freeFrom: null }),
  ],
});

let requested: string[];
beforeEach(() => {
  requested = [];
  board = baseBoard();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const body = url.includes("/api/vehicles/availability-board") ? board : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } },
  });
  return render(<QueryClientProvider client={client}><AvailabilityDialog open onOpenChange={() => {}} /></QueryClientProvider>);
}

describe("AvailabilityDialog", () => {
  it("shows the free cars in a compact table, with their labels", async () => {
    renderDialog();
    const table = await screen.findByTestId("table-availability-free");
    expect(screen.getByTestId("tab-availability-free").textContent).toBe("Vrij (2)");
    expect(screen.getByTestId("tab-availability-busy").textContent).toBe("Bezet (3)");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(screen.getByTestId("badge-apk-2").textContent).toContain("22-10-2026");
    expect(screen.getByTestId("badge-maintenance-2")).toBeInTheDocument();
    expect(requested.some((u) => /availability-board\?startDate=\d{4}-\d{2}-\d{2}&endDate=/.test(u))).toBe(true);
  });

  it("shows when busy cars are free on the Bezet tab", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("table-availability-free");
    await user.click(screen.getByTestId("tab-availability-busy"));
    expect(await screen.findByTestId("availability-busy-when-3")).toHaveTextContent("vrij t/m 22-10-2026");
    expect(screen.getByTestId("availability-busy-when-4").textContent).toBe("vrij vanaf 26-10-2026");
    expect(screen.getByTestId("availability-busy-when-5").textContent).toBe("terugkomst onbekend");
  });

  it("searches on plate (with or without dashes), brand or model", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("table-availability-free");
    await user.type(screen.getByTestId("input-availability-search"), "vn-456");
    await waitFor(() => expect(screen.queryByTestId("availability-free-1")).toBeNull());
    expect(screen.getByTestId("availability-free-2")).toBeInTheDocument();
    await user.clear(screen.getByTestId("input-availability-search"));
    await user.type(screen.getByTestId("input-availability-search"), "polo");
    await waitFor(() => expect(screen.queryByTestId("availability-free-2")).toBeNull());
  });

  it("filters on vehicle type", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("table-availability-free");
    await user.click(screen.getByTestId("select-availability-type"));
    await user.click(await screen.findByRole("option", { name: "Van" }));
    await waitFor(() => expect(screen.queryByTestId("availability-free-1")).toBeNull());
    expect(screen.getByTestId("availability-free-2")).toBeInTheDocument();
  });

  it("pages 15 cars at a time", async () => {
    board.free = Array.from({ length: 20 }, (_, i) => row({ id: 100 + i, licensePlate: `AA${String(i).padStart(3, "0")}B` }));
    const user = userEvent.setup();
    renderDialog();
    const table = await screen.findByTestId("table-availability-free");
    expect(within(table).getAllByRole("row")).toHaveLength(16);
    expect(screen.getByTestId("availability-pager").textContent).toContain("Pagina 1 van 2");
    await user.click(screen.getByTestId("availability-next-page"));
    await waitFor(() => expect(within(screen.getByTestId("table-availability-free")).getAllByRole("row")).toHaveLength(6));
  });
});

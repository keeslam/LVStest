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

const board = {
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
};

let requested: string[];
beforeEach(() => {
  requested = [];
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
  it("lists free cars with their badges and the busy cars with when they are free", async () => {
    renderDialog();
    const free = await screen.findByTestId("availability-free");
    expect(within(free).getByText(/Vrij van .*: 2/)).toBeInTheDocument();
    expect(screen.getByTestId("badge-apk-2").textContent).toContain("22-10-2026");
    expect(screen.getByTestId("badge-maintenance-2")).toBeInTheDocument();
    expect(screen.getByTestId("availability-busy-when-3").textContent).toBe("vrij t/m 22-10-2026");
    expect(screen.getByTestId("availability-busy-when-4").textContent).toBe("vrij vanaf 26-10-2026");
    expect(screen.getByTestId("availability-busy-when-5").textContent).toBe("terugkomst onbekend");
    expect(requested.some((u) => /availability-board\?startDate=\d{4}-\d{2}-\d{2}&endDate=/.test(u))).toBe(true);
  });

  it("filters on vehicle type", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("availability-free");
    await user.click(screen.getByTestId("select-availability-type"));
    await user.click(await screen.findByRole("option", { name: "Van" }));
    await waitFor(() => expect(screen.queryByTestId("availability-free-1")).toBeNull());
    expect(screen.getByTestId("availability-free-2")).toBeInTheDocument();
  });
});

/**
 * Besluit B-41 D1 (package DC): "laatste tankbedrag" stays on the vehicle and is
 * finally visible - amount plus the day - on the fuel card of the vehicle screen.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

import { VehicleDetails } from "@/components/vehicles/vehicle-details";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const base = {
  id: 1,
  licensePlate: "AB-123-C",
  brand: "Volkswagen",
  model: "Golf",
  vehicleType: "car",
  status: "available",
  currentFuelLevel: "3/4",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderDetails(vehicle: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (path === `/api/vehicles/${base.id}`) return json(vehicle);
    if (path === `/api/vehicles/${base.id}/spare-assignment`) return json(null, 404);
    if (path === `/api/vehicles/${base.id}/acting-as-spare`) return json(null, 404);
    return json([]);
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <VehicleDetails vehicleId={base.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("VehicleDetails - laatste tankbedrag on the fuel card", () => {
  it("shows the amount and the date of the last refill", async () => {
    renderDetails({ ...base, fuelRefillCost: "45.50", fuelRefillDate: "2026-10-09T10:00:00.000Z" });
    const line = await screen.findByTestId("text-last-fuel-refill");
    expect(line.textContent!.replace(/\u00a0/g, " ")).toBe("Laatste tankbedrag: € 45,50 (9 okt. 2026)");
  });

  it("shows nothing when no amount was ever entered", async () => {
    renderDetails({ ...base, fuelRefillCost: null, fuelRefillDate: null });
    await screen.findByTestId("text-current-fuel-level");
    expect(screen.queryByTestId("text-last-fuel-refill")).not.toBeInTheDocument();
  });
});

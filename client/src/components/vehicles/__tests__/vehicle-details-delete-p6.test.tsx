/**
 * Audit A-3-4 / A-3-6 — the vehicle detail screen.
 *
 * A-3-4: deleting from the detail screen made the still-mounted detail query refetch the vehicle
 * that was just deleted (GET -> 404) and the app's global QueryCache.onError showed the red toast
 * "Kon de gegevens niet laden: Vehicle not found". From the list this never happened.
 * A-3-6: the Onderhoud tab showed "Dagen resterend: 0" for a vehicle without a warranty date.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

// The global error handler of the app calls this toast function for every failed GET.
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastSpy,
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}));

import { VehicleDetails } from "@/components/vehicles/vehicle-details";

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
  warrantyEndDate: null as string | null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let deleted = false;

function renderDetails(onClose = vi.fn()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      const method = init?.method ?? "GET";
      if (path === `/api/vehicles/${vehicle.id}` && method === "DELETE") {
        deleted = true;
        return json({ message: "ok" });
      }
      if (path === `/api/vehicles/${vehicle.id}`) {
        return deleted ? json({ message: "Vehicle not found", code: "VEHICLE_NOT_FOUND" }, 404) : json(vehicle);
      }
      if (path === `/api/vehicles/${vehicle.id}/delete-impact`) {
        return json({ licensePlate: vehicle.licensePlate, counts: {}, blocked: false });
      }
      if (path === `/api/vehicles/${vehicle.id}/spare-assignment`) return json(null, 404);
      if (path === `/api/vehicles/${vehicle.id}/acting-as-spare`) return json(null, 404);
      return json([]);
    }),
  );
  render(
    <QueryClientProvider client={appQueryClient}>
      <GlobalDialogProvider>
        <VehicleDetails vehicleId={vehicle.id} inDialogContext onClose={onClose} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  deleted = false;
  vehicle.warrantyEndDate = null;
  toastSpy.mockClear();
  appQueryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("A-3-4 — deleting from the detail screen", () => {
  it("closes the screen and never asks for the deleted vehicle again (no red toast)", async () => {
    const user = userEvent.setup();
    const onClose = renderDetails();

    await user.click(await screen.findByRole("button", { name: /Verwijderen/ }));
    await user.type(await screen.findByTestId(`input-confirm-delete-${vehicle.id}`), "AB-123-C");
    await user.click(screen.getByTestId(`button-confirm-delete-${vehicle.id}`));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // Give the batched invalidation (50 ms) and any refetch time to run.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const destructive = toastSpy.mock.calls.filter(([arg]) => arg?.variant === "destructive");
    expect(destructive).toEqual([]);
    const vehicleGets = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([u, i]) => String(u).endsWith(`/api/vehicles/${vehicle.id}`) && (i?.method ?? "GET") === "GET",
    );
    // One GET to show the screen; none after the delete.
    expect(vehicleGets.length).toBe(1);
  });
});

describe("A-3-6 — warranty block on the Onderhoud tab", () => {
  it("says there is no warranty date instead of 'Dagen resterend: 0'", async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(await screen.findByRole("tab", { name: "Onderhoud" }));
    expect(await screen.findByTestId("warranty-days-remaining")).toHaveTextContent("Geen garantiedatum");
    expect(screen.getByTestId("warranty-days-remaining")).not.toHaveTextContent(/^0$/);
  });

  it("still shows the day count when a warranty date exists", async () => {
    const user = userEvent.setup();
    const future = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10);
    vehicle.warrantyEndDate = future;
    renderDetails();
    await user.click(await screen.findByRole("tab", { name: "Onderhoud" }));
    const cell = await screen.findByTestId("warranty-days-remaining");
    expect(cell).toHaveTextContent(/9\d|100|101/);
  });
});

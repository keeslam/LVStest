/**
 * besluiten.md **B-14** (BUG-022) — "weigeren zolang er een huur loopt of
 * gepland staat, **met een impactlijst vooraf**".
 *
 * The server answers 409 `VEHICLE_HAS_LIVE_RESERVATIONS`, but the employee must
 * not first have to type a license plate back only to be refused. The dialog
 * reads `delete-impact` and, when it says `blocked`, names the rentals that are
 * in the way and keeps the delete button out of reach.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VehicleDeleteDialog } from "@/components/vehicles/vehicle-delete-dialog";

const PLATE = "AB-123-C";

function renderDialog(impact: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => impact, retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <VehicleDeleteDialog
        vehicleId={7}
        vehicleBrand="Volkswagen"
        vehicleModel="Crafter"
        vehicleLicensePlate={PLATE}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("B-14 — deleting a vehicle with a live or planned rental", () => {
  it("names the blocking rentals and refuses to enable the delete button", async () => {
    const user = userEvent.setup();
    renderDialog({
      licensePlate: PLATE,
      counts: { reservations: 1 },
      blocked: true,
      blockingReservations: [
        { id: 3344, startDate: "2029-07-01", endDate: "2029-07-10", status: "booked", type: "standard" },
      ],
      restorable: true,
    });

    const blocked = await screen.findByTestId("vehicle-delete-blocked");
    expect(blocked).toHaveTextContent("3344");
    // WAVE 13 item 7 — the period and the status are read by the desk, so they
    // are in Dutch now instead of the stored `2029-07-01` / `booked`.
    expect(blocked).toHaveTextContent("01-07-2029");
    expect(blocked).toHaveTextContent("10-07-2029");
    expect(blocked).toHaveTextContent("Geboekt");
    expect(blocked).not.toHaveTextContent("2029-07-01");
    expect(blocked).not.toHaveTextContent("booked");

    // Even with the plate typed back exactly right, the delete stays out of reach.
    await user.type(screen.getByTestId("input-confirm-delete-7"), PLATE);
    await waitFor(() => {
      expect(screen.getByTestId("button-confirm-delete-7")).toBeDisabled();
    });
  });

  it("leaves the ordinary delete alone when nothing is booked", async () => {
    const user = userEvent.setup();
    renderDialog({
      licensePlate: PLATE,
      counts: { documents: 2 },
      blocked: false,
      blockingReservations: [],
      restorable: true,
    });

    await waitFor(() => expect(screen.queryByTestId("vehicle-delete-blocked")).toBeNull());

    // The typed-back plate still governs, exactly as before B-14.
    expect(screen.getByTestId("button-confirm-delete-7")).toBeDisabled();
    await user.type(screen.getByTestId("input-confirm-delete-7"), "ab123c");
    await waitFor(() => {
      expect(screen.getByTestId("button-confirm-delete-7")).toBeEnabled();
    });
  });
});

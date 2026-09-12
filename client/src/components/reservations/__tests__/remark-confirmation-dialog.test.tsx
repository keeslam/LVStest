/**
 * OPT-011 — the dialog half: the confirmation is asked per remark, not per
 * pickup.
 *
 * The shared rule is tested in `shared/remark-confirmation.test.ts`. What this
 * pins is that the pickup dialog actually uses it: a vehicle whose remark was
 * already confirmed at its last pickup opens without the blocking dialog, and
 * an edited remark brings it straight back.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";

function reservationWith(remarks: string | null, confirmed: string | null) {
  return {
    id: 3600,
    vehicleId: 1866,
    customerId: 12,
    startDate: "2026-10-20",
    endDate: "2026-10-30",
    status: "booked",
    type: "standard",
    placeholderSpare: false,
    contractNumber: null,
    vehicle: {
      id: 1866,
      licensePlate: "AB-123-C",
      brand: "Volkswagen",
      model: "Crafter",
      currentMileage: 45000,
      currentFuelLevel: "Full",
      remarks,
      remarksConfirmedText: confirmed,
    },
    customer: { id: 12, name: "Klant" },
  } as any;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPickup(reservation: any) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PickupDialog open onOpenChange={() => {}} reservation={reservation} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-011 — de bevestiging hoort bij de opmerking", () => {
  it("asks for a remark that has never been confirmed", async () => {
    renderPickup(reservationWith("Deuk linksachter", null));
    expect(await screen.findByTestId("button-acknowledge-remarks")).toBeInTheDocument();
  });

  it("does not ask again for the very same remark", async () => {
    renderPickup(reservationWith("Deuk linksachter", "Deuk linksachter"));
    // The banner is still there — the note is not hidden, only the click is
    // gone — and it reads as already confirmed.
    expect(await screen.findByText("Voertuigopmerkingen bevestigd")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("button-acknowledge-remarks")).toBeNull();
    });
  });

  it("asks again as soon as the remark is edited", async () => {
    renderPickup(reservationWith("Deuk linksachter EN ruit gebarsten", "Deuk linksachter"));
    expect(await screen.findByTestId("button-acknowledge-remarks")).toBeInTheDocument();
  });

  it("never asks for a vehicle without a remark", async () => {
    renderPickup(reservationWith(null, null));
    await screen.findByTestId("button-confirm-pickup");
    expect(screen.queryByTestId("button-acknowledge-remarks")).toBeNull();
  });
});

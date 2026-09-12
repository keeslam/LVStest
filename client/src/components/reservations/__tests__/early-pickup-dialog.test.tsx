/**
 * besluiten.md **B-16** (BUG-211) — the dialog step.
 *
 * The server refuses a pickup before the start date with
 * `PICKUP_BEFORE_START_DATE` and writes nothing. That is a question, not a
 * failure: the desk must be asked "de huur start eerder, datum aanpassen?" and,
 * on yes, the *same* pickup is sent again with the confirmation — never a form
 * the employee has to fill in twice.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";

const reservation = {
  id: 3544,
  vehicleId: 1866,
  customerId: 12,
  startDate: "2026-10-20",
  endDate: "2026-10-30",
  status: "booked",
  type: "standard",
  placeholderSpare: false,
  contractNumber: null,
  vehicle: {
    id: 1866, licensePlate: "AB-123-C", brand: "Volkswagen", model: "Crafter",
    currentMileage: 45000, currentFuelLevel: "Full", remarks: null,
  },
  customer: { id: 12, name: "Klant" },
} as any;

let pickupCalls: Array<Record<string, unknown>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  pickupCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/pickup") && (init?.method ?? "GET") === "POST") {
      const body = init?.body ? JSON.parse(init.body) : {};
      pickupCalls.push(body);
      // besluiten B-16: the first attempt is the question, the confirmed one
      // goes through.
      if (body.shiftStartDate === true) {
        return jsonResponse({ id: reservation.id, status: "picked_up" });
      }
      return jsonResponse({
        code: "PICKUP_BEFORE_START_DATE",
        message: "Deze huur begint pas op 2026-10-20. Gaat de huur vandaag in?",
        startDate: "2026-10-20",
        endDate: "2026-10-30",
        today: "2026-09-12",
      }, 409);
    }
    return jsonResponse([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPickup() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PickupDialog open onOpenChange={() => {}} reservation={reservation} />
    </QueryClientProvider>,
  );
}

describe("B-16 — picking up before the start date asks first", () => {
  it("turns the 409 into the question, with both dates in Dutch", async () => {
    const user = userEvent.setup();
    renderPickup();

    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));

    // The question, not a red toast.
    const question = await screen.findByText(/De huur start eerder/i);
    expect(question).toBeInTheDocument();
    expect(await screen.findByText(/20-10-2026/)).toBeInTheDocument();
    expect(screen.getByText(/12-09-2026/)).toBeInTheDocument();

    // Exactly one attempt so far, and it carried no confirmation.
    expect(pickupCalls).toHaveLength(1);
    expect(pickupCalls[0].shiftStartDate).toBeUndefined();
  });

  it("sends the same pickup again with the confirmation when the answer is yes", async () => {
    const user = userEvent.setup();
    renderPickup();

    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));
    await screen.findByText(/De huur start eerder/i);

    await user.click(screen.getByRole("button", { name: /startdatum naar vandaag/i }));

    await waitFor(() => expect(pickupCalls).toHaveLength(2));
    expect(pickupCalls[1].shiftStartDate).toBe(true);
    // The same pickup, not a second form: everything the employee typed is on it.
    expect(pickupCalls[1].contractNumber).toBe("1000001");
    expect(pickupCalls[1].pickupMileage).toBe(45000);
  });

  it("sends nothing more when the answer is no", async () => {
    const user = userEvent.setup();
    renderPickup();

    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));
    await screen.findByText(/De huur start eerder/i);

    await user.click(screen.getByRole("button", { name: /Nee, niet ophalen/i }));

    await waitFor(() => expect(screen.queryByText(/De huur start eerder/i)).toBeNull());
    expect(pickupCalls).toHaveLength(1);
  });
});

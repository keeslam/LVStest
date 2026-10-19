/**
 * Punt 1 (Kees, 2026-10-19) — extra costs at return: the km amount is
 * proposed from the vehicle type default, fuel is typed by hand, and both go
 * with the return.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { officeToday } from "@/lib/office-date";

const today = officeToday();
const reservation = {
  id: 3544,
  vehicleId: 1866,
  customerId: 12,
  startDate: today,
  endDate: today,
  actualPickupDate: today,
  status: "picked_up",
  type: "standard",
  placeholderSpare: false,
  contractNumber: "1000001",
  pickupMileage: 10_000,
  fuelLevelPickup: "Full",
  vehicle: {
    id: 1866, licensePlate: "AB-123-C", brand: "Volkswagen", model: "Crafter", vehicleType: "Van",
    currentMileage: 10_000, currentFuelLevel: "Full", remarks: null, freeKmPerDay: null, extraKmPrice: null,
  },
  customer: { id: 12, name: "Klant" },
} as any;

let returnCalls: Array<Record<string, unknown>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  returnCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/return") && (init?.method ?? "GET") === "POST") {
      returnCalls.push(init?.body ? JSON.parse(init.body) : {});
      return jsonResponse({ id: reservation.id, status: "completed" });
    }
    if (url.includes("/api/app-settings/key/km_allowance")) {
      return jsonResponse({ key: "km_allowance", value: { byType: { van: { freeKmPerDay: 100, pricePerKm: 0.5 } } } });
    }
    return jsonResponse([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderReturn() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(String(queryKey[0]), { credentials: "include" });
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReturnDialog open onOpenChange={() => {}} reservation={reservation} />
    </QueryClientProvider>,
  );
}

describe("punt 1 — extra kosten bij inleveren", () => {
  it("proposes the km amount from the vehicle type and sends it with the fuel amount", async () => {
    const user = userEvent.setup();
    renderReturn();

    const mileage = screen.getByTestId("input-return-mileage");
    await user.clear(mileage);
    await user.type(mileage, "10300");

    // 1 day x 100 km free; 300 driven -> 200 extra x 0,50 = 100,00
    await waitFor(() => expect((screen.getByTestId("input-extra-km-cost") as HTMLInputElement).value).toBe("100,00"));
    expect(screen.getByTestId("text-extra-km-explanation").textContent).toContain("200");

    await user.type(screen.getByTestId("input-fuel-cost"), "25,50");
    await user.click(screen.getByTestId("button-confirm-return"));

    await waitFor(() => expect(returnCalls).toHaveLength(1));
    expect(returnCalls[0]).toMatchObject({ extraKm: 200, extraKmCost: "100,00", fuelCost: "25,50" });
  });

  it("keeps an amount the employee changed", async () => {
    const user = userEvent.setup();
    renderReturn();
    const mileage = screen.getByTestId("input-return-mileage");
    await user.clear(mileage);
    await user.type(mileage, "10300");
    const cost = screen.getByTestId("input-extra-km-cost") as HTMLInputElement;
    await waitFor(() => expect(cost.value).toBe("100,00"));
    await user.clear(cost);
    await user.type(cost, "0");
    await user.type(mileage, "0"); // 103000 km now; the proposal would change, the typed amount stays
    expect(cost.value).toBe("0");
  });

  it("sends nothing extra when nothing is charged", async () => {
    const user = userEvent.setup();
    renderReturn();
    await user.click(screen.getByTestId("button-confirm-return"));
    await waitFor(() => expect(returnCalls).toHaveLength(1));
    expect(returnCalls[0]).toMatchObject({ fuelCost: null, extraKmCost: null, extraKm: null });
  });
});

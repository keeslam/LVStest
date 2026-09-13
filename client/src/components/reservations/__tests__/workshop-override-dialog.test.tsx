/**
 * besluiten.md **B-03** (OPT-007, OPT-023, BUG-109, BUG-211) — "blokkeren,
 * alleen een beheerder kan forceren".
 *
 * The server has enforced this since FIX-H: a handover of a vehicle that is
 * `in_service` / `needs_service` / `needs_fixing` / `not_for_rental` comes back
 * 409 `VEHICLE_IN_WORKSHOP`, and `decideHandover()` lets an administrator
 * through with `forceWorkshopOverride` + `forceWorkshopReason`. PHASE 57 found
 * the refusal itself *says* an administrator may force it — and there was no
 * force control and no reason field anywhere in the app, so the sentence was a
 * lie and the only way out was to clear the workshop flag by hand.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";

const reservation = {
  id: 3544,
  vehicleId: 1866,
  customerId: 12,
  startDate: "2020-01-01",
  endDate: "2035-12-31",
  status: "booked",
  type: "standard",
  placeholderSpare: false,
  contractNumber: null,
  vehicle: {
    id: 1866, licensePlate: "HL-02-HL", brand: "Volkswagen", model: "Crafter",
    currentMileage: 45000, currentFuelLevel: "Full", remarks: null,
    maintenanceStatus: "in_service", availabilityStatus: "needs_fixing",
  },
  customer: { id: 12, name: "Klant" },
} as any;

let pickupCalls: Array<Record<string, any>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(role: "admin" | "user") {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/api/user")) {
      return jsonResponse({ id: 1, username: role, role, permissions: [] });
    }
    if (url.includes("/pickup") && method === "POST") {
      const body = init?.body ? JSON.parse(init.body) : {};
      pickupCalls.push(body);
      // The server's B-03 gate: forced by an administrator with a reason goes
      // through, everything else is the 409.
      if (body.forceWorkshopOverride === true) {
        if (role !== "admin") {
          return jsonResponse({
            message: "Only an administrator may hand over a vehicle that is in the workshop or not for rental.",
            code: "WORKSHOP_OVERRIDE_FORBIDDEN",
          }, 400);
        }
        return jsonResponse({ id: reservation.id, status: "picked_up" });
      }
      return jsonResponse({
        message:
          "This vehicle is in the workshop and cannot be handed over. Close the workshop job first, " +
          "or have an administrator force the handover with a reason.",
        code: "VEHICLE_IN_WORKSHOP",
        reason: "IN_WORKSHOP",
        overridable: true,
        overrideFields: ["forceWorkshopOverride", "forceWorkshopReason"],
      }, 409);
    }
    return jsonResponse([]);
  }));
}

beforeEach(() => {
  pickupCalls = [];
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
      <AuthProvider>
        <PickupDialog open onOpenChange={() => {}} reservation={reservation} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function attemptPickup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("input-contract-number"), "1000001");
  await user.click(screen.getByTestId("button-confirm-pickup"));
}

describe("B-03 — forceren van een geblokkeerde uitgifte", () => {
  it("shows a non-administrator only the refusal, with no way to force it", async () => {
    stubFetch("user");
    const user = userEvent.setup();
    renderPickup();

    await attemptPickup(user);

    const blocked = await screen.findByTestId("workshop-blocked");
    // In Dutch: the desk should not be reading server English (B-18).
    expect(blocked).toHaveTextContent(/werkplaats/i);
    // No force path at all.
    expect(screen.queryByTestId("input-workshop-reason")).toBeNull();
    expect(screen.queryByTestId("button-force-handover")).toBeNull();
    expect(pickupCalls).toHaveLength(1);
    expect(pickupCalls[0].forceWorkshopOverride).toBeUndefined();
  });

  it("gives an administrator the force path and sends the reason to the server", async () => {
    stubFetch("admin");
    const user = userEvent.setup();
    renderPickup();

    await attemptPickup(user);
    await screen.findByTestId("workshop-blocked");

    const force = await screen.findByTestId("button-force-handover");
    // A reason is required: B-03 records why the block was overruled.
    expect(force).toBeDisabled();

    await user.type(
      screen.getByTestId("input-workshop-reason"),
      "Klant staat aan de balie, APK is morgen",
    );
    await waitFor(() => expect(screen.getByTestId("button-force-handover")).toBeEnabled());
    await user.click(screen.getByTestId("button-force-handover"));

    await waitFor(() => expect(pickupCalls).toHaveLength(2));
    expect(pickupCalls[1].forceWorkshopOverride).toBe(true);
    expect(pickupCalls[1].forceWorkshopReason).toBe("Klant staat aan de balie, APK is morgen");
    // The same handover, not a second form: what the employee typed travels on.
    expect(pickupCalls[1].contractNumber).toBe("1000001");
    expect(pickupCalls[1].pickupMileage).toBe(45000);
  });
});

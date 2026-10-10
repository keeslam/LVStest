/**
 * Audit remediation P5 (A-6-1, A-6-6) - what the handover dialogs tell the
 * employee.
 *
 * A-6-1: the pickup toast said "Contract is gegenereerd" before anybody knew
 * whether the contract existed; the 409 that followed contradicted it.
 * A-6-6: the return form always started on "Vol", even for a car that left at
 * 3/4, so a forgotten tick recorded a fuel level nobody had looked at.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/use-toast");
  return { ...actual, useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }) };
});

import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { defaultReturnFuelLevel } from "@/lib/handover-fuel";

const reservation = {
  id: 3200,
  vehicleId: 1667,
  customerId: 12,
  startDate: "2026-10-09",
  endDate: "2026-10-12",
  status: "booked",
  type: "standard",
  placeholderSpare: false,
  contractNumber: null,
  pickupMileage: null,
  vehicle: {
    id: 1667, licensePlate: "AB-123-C", brand: "Mitsubishi", model: "Spacestar",
    currentMileage: 5000, currentFuelLevel: "Full", remarks: null,
  },
  customer: { id: 12, name: "Klant" },
} as any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let pickupAnswer: Record<string, unknown>;

beforeEach(() => {
  toastSpy.mockClear();
  pickupAnswer = {};
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("/api/settings/next-contract-number")) return json({ contractNumber: "1012" });
    if (u.includes("/find-by-contract/")) return json(null, 404);
    if (u.endsWith("/pickup") && init?.method === "POST") return json({ ...reservation, status: "picked_up", ...pickupAnswer });
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderInClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("A-6-1 - the pickup toast only claims what happened", () => {
  async function completePickup() {
    const user = userEvent.setup();
    renderInClient(<PickupDialog open onOpenChange={() => {}} reservation={reservation} />);
    const number = (await screen.findByTestId("input-contract-number")) as HTMLInputElement;
    await waitFor(() => expect(number.value).toBe("1012"));
    await user.click(screen.getByTestId("button-confirm-pickup"));
  }

  it("does not mention a contract when the answer carries none", async () => {
    pickupAnswer = {
      contractDocument: null,
      contractError: "The contract template 'gffg' has no fields.",
      contractErrorCode: "TEMPLATE_WITHOUT_FIELDS",
    };
    await completePickup();
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const pickupToast = toastSpy.mock.calls.map((c) => c[0]).find((c) => c.title === "Ophalen voltooid");
    expect(pickupToast).toBeTruthy();
    expect(pickupToast.description).toBe("Voertuig succesvol opgehaald.");
    expect(String(pickupToast.description)).not.toMatch(/contract/i);
  });

  it("still says the contract exists when the answer carries the document", async () => {
    pickupAnswer = { contractDocument: { id: 9, fileName: "c.pdf", reservationId: 3200 }, contractError: null };
    await completePickup();
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const pickupToast = toastSpy.mock.calls.map((c) => c[0]).find((c) => c.title === "Ophalen voltooid");
    expect(pickupToast.description).toBe("Voertuig succesvol opgehaald. Contract is gegenereerd.");
  });
});

describe("A-6-6 - the return form starts on the fuel level of the pickup", () => {
  it("maps the stored pickup level onto the select's values", () => {
    expect(defaultReturnFuelLevel("3/4")).toBe("3/4");
    expect(defaultReturnFuelLevel("1/2")).toBe("1/2");
    expect(defaultReturnFuelLevel("full")).toBe("Full");
    expect(defaultReturnFuelLevel("empty")).toBe("Empty");
    expect(defaultReturnFuelLevel(null)).toBe("Full");
    expect(defaultReturnFuelLevel("something else")).toBe("Full");
  });

  it("shows 3/4 for a car picked up at 3/4", async () => {
    renderInClient(
      <ReturnDialog open onOpenChange={() => {}} reservation={{ ...reservation, status: "picked_up", fuelLevelPickup: "3/4", pickupMileage: 5100 }} />,
    );
    const trigger = await screen.findByTestId("select-fuel-level-return");
    await waitFor(() => expect(trigger).toHaveTextContent("3/4"));
  });

  it("falls back to Vol when the pickup level was never recorded", async () => {
    renderInClient(
      <ReturnDialog open onOpenChange={() => {}} reservation={{ ...reservation, status: "picked_up", fuelLevelPickup: null }} />,
    );
    const trigger = await screen.findByTestId("select-fuel-level-return");
    await waitFor(() => expect(trigger).toHaveTextContent("Vol"));
  });
});

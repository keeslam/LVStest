/**
 * Punt 9 (Kees, 2026-10-19) — pickup with an expired licence of the main
 * driver: a warning plus the "Rijbewijs gecontroleerd" tick; without the tick
 * the pickup is not sent. An unknown date is a quiet note only.
 *
 * Runs in the jsdom project.
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
  driverId: 7,
  startDate: "2026-09-01",
  endDate: "2026-12-30",
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

let driverLicense: unknown;
let pickupCalls: Array<Record<string, unknown>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  pickupCalls = [];
  driverLicense = { driverId: 7, driverName: "Jan de Vries", licenseExpiry: "2026-10-01", expiryDay: "2026-10-01", state: "expired" };
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/pickup") && (init?.method ?? "GET") === "POST") {
      pickupCalls.push(init?.body ? JSON.parse(init.body) : {});
      return jsonResponse({ id: reservation.id, status: "picked_up" });
    }
    if (url.includes("/handover-check")) {
      return jsonResponse({ canHandOver: true, refusal: null, warnings: [], maintenanceBlocks: [], driverLicense });
    }
    return jsonResponse([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPickup() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PickupDialog open onOpenChange={() => {}} reservation={reservation} />
    </QueryClientProvider>,
  );
}

describe("punt 9 — rijbewijs verlopen bij ophalen", () => {
  it("shows the warning with the name and the Dutch date", async () => {
    renderPickup();
    const warning = await screen.findByTestId("warning-pickup-license-expired");
    expect(warning.textContent).toContain("Jan de Vries");
    expect(warning.textContent).toContain("01-10-2026");
    expect(screen.getByText("Rijbewijs gecontroleerd")).toBeInTheDocument();
  });

  it("sends nothing without the tick", async () => {
    const user = userEvent.setup();
    renderPickup();
    await screen.findByTestId("warning-pickup-license-expired");
    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));
    await new Promise((r) => setTimeout(r, 50));
    expect(pickupCalls).toHaveLength(0);
  });

  it("sends the pickup with licenseChecked after the tick", async () => {
    const user = userEvent.setup();
    renderPickup();
    await screen.findByTestId("warning-pickup-license-expired");
    await user.click(screen.getByTestId("checkbox-license-checked"));
    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));
    await waitFor(() => expect(pickupCalls).toHaveLength(1));
    expect(pickupCalls[0].licenseChecked).toBe(true);
  });

  it("only notes an unknown date and sends the pickup without asking", async () => {
    driverLicense = { driverId: 7, driverName: "Jan de Vries", licenseExpiry: null, expiryDay: null, state: "unknown" };
    const user = userEvent.setup();
    renderPickup();
    const note = await screen.findByTestId("note-pickup-license-unknown");
    expect(note.textContent).toMatch(/onbekend/);
    expect(screen.queryByTestId("warning-pickup-license-expired")).toBeNull();
    await user.type(screen.getByTestId("input-contract-number"), "1000001");
    await user.click(screen.getByTestId("button-confirm-pickup"));
    await waitFor(() => expect(pickupCalls).toHaveLength(1));
    expect(pickupCalls[0].licenseChecked).toBeUndefined();
  });
});

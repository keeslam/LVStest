/**
 * Sub-project D, D5 (besluiten B-41/B-42): a planned maintenance block that
 * covers the pickup day makes the car 'scheduled'. The pickup dialog shows a
 * WARNING (never a block): the server's handover check says
 * `warnings: ["MAINTENANCE_SCHEDULED"]` and the dialog words it, nl and en.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";
import i18n from "@/i18n";

const reservation = {
  id: 3544,
  vehicleId: 1866,
  customerId: 12,
  startDate: "2026-09-21",
  endDate: "2026-09-30",
  status: "booked",
  type: "standard",
  placeholderSpare: false,
  contractNumber: null,
  pickupMileage: 45000,
  vehicle: {
    id: 1866, licensePlate: "AB-123-C", brand: "Volkswagen", model: "Crafter",
    currentMileage: 45000, currentFuelLevel: "Full", remarks: null,
  },
  customer: { id: 12, name: "Klant" },
} as any;

let handoverCheck: unknown;
const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  handoverCheck = { canHandOver: true, refusal: null, warnings: [], maintenanceBlocks: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    // next-contract-number answers an object: an array made the contract field uncontrolled.
    const body = url.includes("/handover-check") ? handoverCheck : url.includes("next-contract-number") ? { contractNumber: "FIXT-1" } : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await i18n.changeLanguage("nl");
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  return render(
    <QueryClientProvider client={client}>
      <PickupDialog open onOpenChange={() => {}} reservation={reservation} />
    </QueryClientProvider>,
  );
}

describe("pickup dialog - planned maintenance warning (D5)", () => {
  it("shows a warning with the period when the server says MAINTENANCE_SCHEDULED, and does not disable the submit", async () => {
    handoverCheck = {
      canHandOver: true, refusal: null, warnings: ["MAINTENANCE_SCHEDULED"],
      maintenanceBlocks: [{ id: 9, startDate: "2026-09-21", endDate: "2026-09-23" }],
    };
    renderDialog();

    const warning = await screen.findByTestId("warning-pickup-maintenance-scheduled");
    expect(warning.textContent).toMatch(/onderhoud/i);
    expect(warning.textContent).toContain("21-09-2026 t/m 23-09-2026");
    expect(requested.some((u) => u.includes("/api/reservations/3544/handover-check"))).toBe(true);
    // A warning, not a block: nothing in the dialog is disabled because of it.
    const submit = screen.getByTestId("button-confirm-pickup") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("words the warning in English too", async () => {
    await i18n.changeLanguage("en");
    handoverCheck = {
      canHandOver: true, refusal: null, warnings: ["MAINTENANCE_SCHEDULED"],
      maintenanceBlocks: [{ id: 9, startDate: "2026-09-21", endDate: null }],
    };
    renderDialog();

    const warning = await screen.findByTestId("warning-pickup-maintenance-scheduled");
    expect(warning.textContent).toMatch(/maintenance/i);
    expect(warning.textContent).toMatch(/hand it over|pick(ed)? up/i);
  });

  it("shows nothing without the warning code", async () => {
    renderDialog();
    await screen.findByLabelText(/ophaaldatum/i);
    await vi.waitFor(() => expect(requested.some((u) => u.includes("/handover-check"))).toBe(true));
    expect(screen.queryByTestId("warning-pickup-maintenance-scheduled")).toBeNull();
  });
});

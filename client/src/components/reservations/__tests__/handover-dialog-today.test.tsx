/**
 * The pickup and return dialogs pre-fill the handover date with "today". They
 * read it in UTC, so just after midnight in the office the field showed
 * yesterday. The server has asked "what day is it" in Europe/Amsterdam since
 * `isoToday()` in server/services/lifecycle.ts; the dialogs now do the same.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";

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

beforeEach(() => {
  // 00:30 in Amsterdam on 21 September; still 20 September in UTC.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderInClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("handover dialogs just after midnight", () => {
  it("pre-fills the pickup date with the office's today", async () => {
    renderInClient(<PickupDialog open onOpenChange={() => {}} reservation={reservation} />);
    const input = await screen.findByLabelText(/ophaaldatum/i);
    expect((input as HTMLInputElement).value).toBe("2026-09-21");
  });

  it("pre-fills the return date with the office's today", async () => {
    renderInClient(<ReturnDialog open onOpenChange={() => {}} reservation={{ ...reservation, status: "picked_up" }} />);
    const input = await screen.findByLabelText(/inleverdatum|retourdatum/i);
    expect((input as HTMLInputElement).value).toBe("2026-09-21");
  });
});

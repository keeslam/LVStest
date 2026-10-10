/**
 * A-2-13 (fysieke E2E-audit 2026-10-09, module 2) — the submit button of
 * "Vervangende voertuigen toewijzen" read "1 voertuig toewijzen" while nothing
 * was chosen, and could be clicked. It now counts the vehicles actually picked
 * and stays disabled until at least one is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { SpareVehicleAssignmentDialog } from "@/components/reservations/spare-vehicle-assignment-dialog";

const placeholder = {
  id: 501,
  vehicleId: null,
  customerId: null,
  startDate: "2026-10-12",
  endDate: "2026-10-14",
  status: "booked",
  type: "replacement",
  placeholderSpare: true,
  replacementForReservationId: null,
} as any;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SpareVehicleAssignmentDialog open onOpenChange={() => {}} placeholderReservations={[placeholder]} />
    </QueryClientProvider>,
  );
}

describe("SpareVehicleAssignmentDialog submit button", () => {
  it("is disabled and does not claim a vehicle while none is chosen", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-assign-vehicles");
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent(/1 voertuig toewijzen/);
    expect(button).toHaveTextContent("Kies eerst een voertuig");
  });
});

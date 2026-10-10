/**
 * Audit remediation P5, A-6-4 - after "Overdracht terugdraaien" the return
 * damage check is marked stale ("vervallen") on the server, but the document
 * list in the reservation's detail view showed it like any other file. The
 * list now carries the same "verouderd" marker as the Documents screen.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
  AuthContext: {},
}));

import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const rental = {
  id: 3200, vehicleId: 1, customerId: 5, driverId: null, type: "standard", status: "picked_up",
  startDate: "2026-10-09", endDate: "2026-10-12", actualPickupDate: "2026-10-09", contractNumber: "1012",
  pickupMileage: 5100, notes: null, portalRequestId: null,
};
const vehicle = { id: 1, brand: "Mitsubishi", model: "Spacestar", licensePlate: "AB-123-C" };
const documents = [
  {
    id: 10, vehicleId: 1, reservationId: 3200, documentType: "Contract (Unsigned)", fileName: "contract.pdf",
    contentType: "application/pdf", isStale: false, staleReason: null, version: 1,
  },
  {
    id: 11, vehicleId: 1, reservationId: 3200, documentType: "Damage Check (Unsigned)", fileName: "schadecheck.pdf",
    contentType: "application/pdf", isStale: true, staleReason: "handover reverted", version: 1,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/documents/reservation")) return json(documents);
      if (url.includes(`/api/reservations/${rental.id}`)) return json(rental);
      if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
      return json([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationViewDialog open onOpenChange={() => {}} reservationId={rental.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("A-6-4 - a stale document is marked in the reservation's document list", () => {
  it("marks the stale damage check and leaves the current contract alone", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    const badges = await within(dialog).findAllByTestId("document-stale-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("button")).toHaveTextContent("Damage Check (Unsigned)");
  });
});

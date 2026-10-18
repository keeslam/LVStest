/**
 * Kees, 2026-10-18: a booked reservation can be cancelled from the portal until 48 hours before the
 * start; the button opens a cancellation request. Past the deadline the customer is told to call, and
 * an open request is shown instead of a second button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalCancellationDto } from "@shared/portal-types";

vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canSubmitRequests: true, canViewFines: false, canReturn: false, canManageDrivers: false } } }),
}));
const openNewRequest = vi.fn();
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openNewRequest, openReservation: () => {}, openList: () => {}, openFine: () => {} }) }));

import { ReservationDialog } from "@/components/portal/reservation-dialog";

function renderWith(cancellation: PortalCancellationDto) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/reservations/7"], {
    id: 7, status: "booked", type: "standard", startDate: "2099-03-10", endDate: "2099-03-12", startTime: null, endTime: null,
    actualPickupDate: null, actualReturnDate: null, pickupMileage: null, returnMileage: null, contractNumber: null, handover: null,
    vehicle: { id: 1, licensePlate: "12ABC3", brand: "FIAT", model: "DUCATO", apkDate: null }, driver: null, replacementForReservationId: null,
    driverHistory: [], cancellation,
  });
  return render(<QueryClientProvider client={qc}><ReservationDialog id={7} onClose={() => {}} /></QueryClientProvider>);
}

describe("reservering annuleren", () => {
  it("opens a cancellation request while it is still allowed", async () => {
    renderWith({ allowed: true, reason: null, deadline: "2099-03-08T07:00:00.000Z", openRequestId: null });
    await userEvent.click(await screen.findByTestId("button-request-cancellation"));
    expect(openNewRequest).toHaveBeenCalledWith({ type: "cancellation", reservationId: 7 });
  });

  it("explains the 48 hours once they have passed", async () => {
    renderWith({ allowed: false, reason: "too_late", deadline: "2099-03-08T07:00:00.000Z", openRequestId: null });
    expect(await screen.findByTestId("cancel-too-late")).toHaveTextContent("48 uur");
    expect(screen.queryByTestId("button-request-cancellation")).not.toBeInTheDocument();
  });

  it("shows the open request instead of a second button", async () => {
    renderWith({ allowed: true, reason: null, deadline: "2099-03-08T07:00:00.000Z", openRequestId: 31 });
    expect(await screen.findByTestId("cancel-pending")).toHaveTextContent("#31");
    expect(screen.queryByTestId("button-request-cancellation")).not.toBeInTheDocument();
  });
});

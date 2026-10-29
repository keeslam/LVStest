/**
 * In a rental that is on the road, the APK warning carries the button "APK inplannen" when the APK runs out (or has run out)
 * before the rental ends. "Onderhoud melden" first opens the choice between a report and the garage's agenda.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canSubmitRequests: true, canViewFines: false, canReturn: false, canManageDrivers: false }, info: { phone: "", apkPlannerUrl: "" } } }),
}));
const openNewRequest = vi.fn();
const openApk = vi.fn();
const openMaintenance = vi.fn();
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openNewRequest, openApk, openMaintenance, openReservation: () => {}, openList: () => {}, openFine: () => {}, openRequest: () => {} }) }));

import { ReservationDialog } from "@/components/portal/reservation-dialog";

/** A date `days` from today, as YYYY-MM-DD. */
function inDays(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
  openNewRequest.mockClear(); openApk.mockClear(); openMaintenance.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderWith(apkDate: string | null, endDate: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/reservations/7"], {
    id: 7, status: "picked_up", type: "standard", startDate: inDays(-10), endDate, startTime: null, endTime: null,
    actualPickupDate: null, actualReturnDate: null, pickupMileage: null, returnMileage: null, contractNumber: null, handover: { pickup: { method: "shop", location: null }, return: { method: "shop", location: null } },
    vehicle: { id: 1, licensePlate: "12ABC3", brand: "FIAT", model: "DUCATO", apkDate }, driver: null, replacementForReservationId: null,
    driverHistory: [], cancellation: null,
  });
  return render(<QueryClientProvider client={qc}><ReservationDialog id={7} onClose={() => {}} /></QueryClientProvider>);
}

describe("APK inplannen in de reservering", () => {
  it("offers to plan the APK when it runs out during the rental", async () => {
    renderWith(inDays(20), inDays(60));
    await userEvent.click(await screen.findByTestId("button-apk-plan"));
    expect(openApk).toHaveBeenCalledWith(7);
  });

  it("offers it too when the APK has already expired", async () => {
    renderWith(inDays(-3), null);
    expect(await screen.findByTestId("button-apk-plan")).toBeInTheDocument();
  });

  it("shows the warning but no button when the APK only runs out after the rental", async () => {
    renderWith(inDays(20), inDays(10));
    expect(await screen.findByTestId("apk-alert")).toBeInTheDocument();
    expect(screen.queryByTestId("button-apk-plan")).not.toBeInTheDocument();
  });

  it("shows nothing when the APK is far away", async () => {
    renderWith(inDays(200), null);
    await screen.findByTestId("button-request-maintenance");
    expect(screen.queryByTestId("apk-alert")).not.toBeInTheDocument();
  });

  it("Onderhoud melden opens the choice for this rental", async () => {
    renderWith(inDays(200), null);
    await userEvent.click(await screen.findByTestId("button-request-maintenance"));
    expect(openMaintenance).toHaveBeenCalledWith(7);
    expect(openNewRequest).not.toHaveBeenCalled();
  });
});

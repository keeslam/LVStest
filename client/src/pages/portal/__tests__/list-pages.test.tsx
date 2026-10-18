/**
 * Kees, 2026-10-18: customers with 80-100 cars. Reservations, vehicles, fines and requests show quick
 * filters (where they help) and the list a page at a time; a search looks through everything.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canViewFines: true, canSubmitRequests: true, canBook: false, showPrices: false } } }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openReservation: () => {}, openFine: () => {}, openRequest: () => {}, openNewRequest: () => {}, openList: () => {}, openDocument: () => {} }) }));
vi.mock("wouter", async (importOriginal) => ({ ...(await importOriginal<typeof import("wouter")>()), useSearch: () => "" }));

import PortalFinesPage from "@/pages/portal/fines";
import PortalRequestsPage from "@/pages/portal/requests";
import PortalReservationsPage from "@/pages/portal/reservations";
import PortalVehiclesPage from "@/pages/portal/vehicles";

function renderWith(ui: React.ReactNode, data: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [url, value] of Object.entries(data)) qc.setQueryData(["portal", url], value);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fines = Array.from({ length: 55 }, (_, i) => ({
  id: i + 1, licensePlate: `${String(i).padStart(2, "0")}AB12`, offenceAt: "2026-09-01T10:00:00.000Z", description: `Snelheid ${i + 1}`, reference: null,
  amount: "100", adminFee: "0", totalAmount: "100", status: i < 45 ? "new" : "paid", customerNote: null, driver: null, reservationId: null, hasLetter: false, createdAt: "2026-09-02T10:00:00.000Z",
}));
const requests = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1, type: "other", status: i < 25 ? "new" : "done", message: `Vraag ${i + 1}`, payload: {}, staffReply: null, createdAt: "2026-09-02T10:00:00.000Z", reservationId: null, fineId: null,
}));
const reservations = Array.from({ length: 85 }, (_, i) => ({
  id: 1000 + i, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null, contractNumber: null,
  vehicle: { id: i, licensePlate: `${String(i).padStart(2, "0")}XY99`, brand: "FIAT", model: "DUCATO", apkDate: null }, driver: null, handover: null,
}));

describe("lange lijsten in het portaal", () => {
  it("bekeuringen: open first, a page of 20, filter to the closed ones", async () => {
    renderWith(<PortalFinesPage />, { "/api/portal/fines": fines });
    expect(screen.getAllByTestId(/^portal-fine-\d+$/)).toHaveLength(20);
    expect(screen.getByTestId("fines-pager")).toHaveTextContent("Pagina 1 van 3");
    await userEvent.click(screen.getByTestId("fines-filter-closed"));
    expect(screen.getAllByTestId(/^portal-fine-\d+$/)).toHaveLength(10);
    expect(screen.queryByTestId("fines-pager")).not.toBeInTheDocument();
  });

  it("bekeuringen: a search finds a closed one while the open filter is on", async () => {
    renderWith(<PortalFinesPage />, { "/api/portal/fines": fines });
    await userEvent.type(screen.getByTestId("portal-search"), "Snelheid 51");
    expect(screen.getAllByTestId(/^portal-fine-\d+$/)).toHaveLength(1);
  });

  it("aanvragen: open ones a page at a time", async () => {
    renderWith(<PortalRequestsPage />, { "/api/portal/requests": requests });
    expect(screen.getByTestId("requests-filter-open")).toHaveTextContent("25");
    expect(screen.getByTestId("requests-pager")).toHaveTextContent("Pagina 1 van 2");
    await userEvent.click(screen.getByTestId("pager-next"));
    expect(screen.getByTestId("requests-pager")).toHaveTextContent("Pagina 2 van 2");
  });

  it("reserveringen: 85 running rentals in pages of 20", async () => {
    renderWith(<PortalReservationsPage />, { "/api/portal/reservations": reservations, "/api/portal/fines": [] });
    expect(screen.getAllByTestId(/^portal-reservation-\d+$/)).toHaveLength(20);
    expect(screen.getByTestId("reservations-pager")).toHaveTextContent("Pagina 1 van 5");
  });

  it("voertuigen: a filter on the MOT due soon", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    const mine = Array.from({ length: 40 }, (_, i) => ({
      reservationId: 2000 + i, vehicle: { id: i, licensePlate: `${String(i).padStart(2, "0")}VV11`, brand: "FIAT", model: "DUCATO", apkDate: i < 3 ? soon : later, currentMileage: null },
      driver: null, startDate: "2026-09-01", endDate: null, lastReportedMileage: null, serviceDue: null, maintenance: null, openMaintenanceRequestId: null,
    }));
    renderWith(<PortalVehiclesPage />, { "/api/portal/vehicles/mine": mine });
    expect(screen.getByTestId("vehicles-pager")).toHaveTextContent("Pagina 1 van 2");
    await userEvent.click(screen.getByTestId("vehicles-filter-apk"));
    expect(screen.getByTestId("vehicles-filter-apk")).toHaveTextContent("3");
    expect(screen.queryByTestId("vehicles-pager")).not.toBeInTheDocument();
  });
});

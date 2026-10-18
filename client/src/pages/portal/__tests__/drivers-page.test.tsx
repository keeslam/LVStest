/**
 * Kees, 2026-10-18: some customers have 80-100 cars, so the drivers page is one compact list with quick
 * filters, search (through every driver) and pages of 20.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";

vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canManageDrivers: true, canViewFines: false } } }),
}));
const openReservation = vi.fn();
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openReservation, openList: () => {}, openDocument: () => {}, openFine: () => {} }) }));

import PortalDriversPage from "@/pages/portal/drivers";
import { PORTAL_PAGE_SIZE } from "@/components/portal/ui";

const name = (i: number) => `Bestuurder ${String(i).padStart(3, "0")}`;
// 90 active drivers, the first 60 driving a car; 5 deactivated.
const drivers: PortalDriverDto[] = [
  ...Array.from({ length: 90 }, (_, i) => ({ id: i + 1, displayName: name(i + 1), status: "active" })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: 200 + i, displayName: `Oud ${i}`, status: "inactive" })),
].map((d) => ({ firstName: null, lastName: null, email: `${d.id}@example.test`, phone: null, driverLicenseNumber: "1234567890", licenseExpiry: "2030-01-01", licenseOrigin: null, preferredLanguage: null, notes: null, hasLicenseFile: false, ...d } as PortalDriverDto));
const reservations = Array.from({ length: 60 }, (_, i) => ({
  id: 5000 + i, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null,
  vehicle: { id: i, licensePlate: `${String(i).padStart(2, "0")}XYZ9`, brand: "FIAT", model: "DUCATO", apkDate: null },
  driver: { id: i + 1, displayName: name(i + 1) },
})) as unknown as PortalReservationDto[];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/drivers"], drivers);
  qc.setQueryData(["portal", "/api/portal/reservations"], reservations);
  return render(<QueryClientProvider client={qc}><PortalDriversPage /></QueryClientProvider>);
}
const rows = () => within(screen.getByTestId("drivers-list")).getAllByTestId(/^portal-driver-\d+$/);

describe("bestuurders bij een klant met veel auto's", () => {
  it("shows the active drivers a page at a time, with counts on the filters", async () => {
    renderPage();
    expect(rows()).toHaveLength(PORTAL_PAGE_SIZE);
    expect(screen.getByTestId("drivers-pager")).toHaveTextContent("Pagina 1 van 5");
    expect(screen.getByTestId("driver-filter-active")).toHaveTextContent("90");
    expect(screen.getByTestId("driver-filter-driving")).toHaveTextContent("60");
    expect(screen.getByTestId("driver-filter-noCar")).toHaveTextContent("30");
    expect(screen.getByTestId("driver-filter-inactive")).toHaveTextContent("5");
    await userEvent.click(screen.getByTestId("pager-next"));
    expect(screen.getByTestId("drivers-pager")).toHaveTextContent("Pagina 2 van 5");
  });

  it("filters on drivers without a car, who can be put on one from the row", async () => {
    renderPage();
    await userEvent.click(screen.getByTestId("driver-filter-noCar"));
    expect(screen.getByTestId("drivers-pager")).toHaveTextContent("Pagina 1 van 2");
    expect(within(rows()[0]).getByTestId(/^button-assign-car-/)).toBeInTheDocument();
  });

  it("searches every driver, also a deactivated one, by name or plate", async () => {
    renderPage();
    await userEvent.type(screen.getByTestId("portal-search"), "Oud 3");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("Oud 3");
    await userEvent.clear(screen.getByTestId("portal-search"));
    await userEvent.type(screen.getByTestId("portal-search"), "07-xyz-9");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent(name(8));
    await userEvent.click(within(rows()[0]).getByText("07-XYZ-9"));
    expect(openReservation).toHaveBeenCalledWith(5007);
  });

  it("shows the licence masked", () => {
    renderPage();
    expect(rows()[0]).toHaveTextContent("•••• 7890");
    expect(rows()[0]).not.toHaveTextContent("1234567890");
  });
});

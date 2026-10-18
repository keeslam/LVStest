/**
 * Kees, 2026-10-18: "Exporteren (CSV)" on the portal's vehicles, drivers and reservations. The file
 * holds the whole filtered list (every page, not just the 20 on screen), the licence number stays
 * masked, prices only when the customer sees them, and the export is reported to the portal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalDriverDto } from "@shared/portal-types";

const { saveCsvFile, portalFetch, settings } = vi.hoisted(() => ({
  saveCsvFile: vi.fn(() => "file.csv"),
  portalFetch: vi.fn(async () => ({ ok: true })),
  settings: { showPrices: false },
}));
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), saveCsvFile }));
vi.mock("@/lib/portal-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-api")>()), portalFetch }));
vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canManageDrivers: true, canViewFines: false, ...settings } } }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openReservation: () => {}, openList: () => {}, openDocument: () => {}, openFine: () => {} }) }));
vi.mock("wouter", async (importOriginal) => ({ ...(await importOriginal<typeof import("wouter")>()), useSearch: () => "" }));

import PortalReservationsPage from "@/pages/portal/reservations";
import PortalDriversPage from "@/pages/portal/drivers";
import PortalVehiclesPage from "@/pages/portal/vehicles";

function renderWith(ui: React.ReactNode, data: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [url, value] of Object.entries(data)) qc.setQueryData(["portal", url], value);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const lastFile = () => { const [subject, header, rows] = saveCsvFile.mock.calls.at(-1) as unknown as [string, string[], unknown[][]]; return { subject, header, rows }; };

const reservations = Array.from({ length: 85 }, (_, i) => ({
  id: 1000 + i, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null, contractNumber: `C-${i}`, totalPrice: "250.5",
  vehicle: { id: i, licensePlate: `${String(i).padStart(2, "0")}XY99`, brand: "FIAT", model: "DUCATO", apkDate: null }, driver: { id: 1, displayName: "Jan" }, handover: null,
}));

describe("exporteren in het portaal", () => {
  beforeEach(() => { saveCsvFile.mockClear(); portalFetch.mockClear(); settings.showPrices = false; });

  it("reserveringen: all 85 running rentals, not just the page on screen, and the export is logged", async () => {
    renderWith(<PortalReservationsPage />, { "/api/portal/reservations": reservations });
    await userEvent.click(screen.getByTestId("button-export-reservations"));
    const { subject, header, rows } = lastFile();
    expect(subject).toBe("reserveringen");
    expect(rows).toHaveLength(85);
    expect(header).not.toContain("Prijs");
    expect(rows[0]).toEqual([1000, "C-0", "In gebruik", "00-XY-99", expect.any(String), "Jan", "01-09-2026", ""]);
    expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/exports", { list: "reservations", rows: 85 });
  });

  it("reserveringen: the price only when the customer sees prices", async () => {
    settings.showPrices = true;
    renderWith(<PortalReservationsPage />, { "/api/portal/reservations": reservations });
    await userEvent.click(screen.getByTestId("button-export-reservations"));
    const { header, rows } = lastFile();
    expect(header.at(-1)).toBe("Prijs");
    expect(rows[0].at(-1)).toBe("250,50");
  });

  it("bestuurders: the licence number stays masked, as on screen", async () => {
    const drivers = [{ id: 1, displayName: "Jan", firstName: null, lastName: null, email: "jan@example.test", phone: "0612345678", driverLicenseNumber: "1234567890", licenseExpiry: "2030-01-01", licenseOrigin: null, preferredLanguage: null, notes: null, status: "active", hasLicenseFile: false }] as PortalDriverDto[];
    renderWith(<PortalDriversPage />, { "/api/portal/drivers": drivers, "/api/portal/reservations": reservations.slice(0, 1) });
    await userEvent.click(screen.getByTestId("button-export-drivers"));
    const { rows } = lastFile();
    expect(rows[0]).toEqual(["Jan", "jan@example.test", "0612345678", "•••• 7890", "01-01-2030", "Actief", "00-XY-99"]);
    expect(JSON.stringify(rows)).not.toContain("1234567890");
  });

  it("voertuigen: the export follows the filter", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const mine = Array.from({ length: 30 }, (_, i) => ({
      reservationId: 2000 + i, vehicle: { id: i, licensePlate: `${String(i).padStart(2, "0")}VV11`, brand: "FIAT", model: "DUCATO", apkDate: i < 3 ? soon : null, currentMileage: 1000 },
      driver: null, startDate: "2026-09-01", endDate: null, lastReportedMileage: i === 0 ? { value: 1500, at: "2026-10-01" } : null, serviceDue: null, maintenance: null, openMaintenanceRequestId: null,
    }));
    renderWith(<PortalVehiclesPage />, { "/api/portal/vehicles/mine": mine });
    await userEvent.click(screen.getByTestId("vehicles-filter-apk"));
    await userEvent.click(screen.getByTestId("button-export-vehicles"));
    const { subject, rows } = lastFile();
    expect(subject).toBe("voertuigen");
    expect(rows).toHaveLength(3);
    expect(rows[0][5]).toBe(1500);
  });
});

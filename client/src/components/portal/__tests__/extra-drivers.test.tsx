/**
 * Kees, 2026-10-18: a shared car. The admin adds and removes extra drivers (a driver already on another
 * car cannot be chosen), and says who drove when a fine came in while several drivers shared the car.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalReservationDto } from "@shared/portal-types";

const { portalFetch } = vi.hoisted(() => ({ portalFetch: vi.fn(async (..._a: unknown[]) => ({}) as unknown) }));
vi.mock("@/lib/portal-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-api")>()), portalFetch }));
vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role: "admin", fullName: "Beheerder", settings: { canSubmitRequests: true, canViewFines: true, canManageDrivers: true } } }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openNewRequest: () => {}, openReservation: () => {}, openList: () => {}, openFine: () => {} }) }));

import { ExtraDrivers, busyCar } from "@/components/portal/extra-drivers";
import { FineDialog } from "@/components/portal/fine-dialog";

const reservation = (id: number, driver: number, extras: number[] = []) => ({
  id, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null,
  vehicle: { id, licensePlate: `${id}AB12`, brand: "FIAT", model: "DUCATO", apkDate: null },
  driver: { id: driver, displayName: `D${driver}` }, extraDrivers: extras.map((e) => ({ id: e, displayName: `D${e}` })),
}) as unknown as PortalReservationDto;
const reservations = [reservation(1, 10, [11]), reservation(2, 12)];
const drivers = [10, 11, 12, 13].map((id) => ({ id, displayName: `D${id}`, status: "active" }));

function renderWith(ui: React.ReactNode, data: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/drivers"], drivers);
  qc.setQueryData(["portal", "/api/portal/reservations"], reservations);
  for (const [url, value] of Object.entries(data)) qc.setQueryData(["portal", url], value);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("meerdere bestuurders per auto", () => {
  beforeEach(() => portalFetch.mockClear());

  it("a driver is busy when main or extra driver on another car", () => {
    expect(busyCar(reservations, 11, 2)?.id).toBe(1);
    expect(busyCar(reservations, 12, 1)?.id).toBe(2);
    expect(busyCar(reservations, 13, 1)).toBeUndefined();
  });

  it("adds an extra driver; drivers on another car are listed but cannot be chosen", async () => {
    renderWith(<ExtraDrivers reservation={reservations[0]} canEdit />);
    const user = userEvent.setup();
    expect(screen.getByTestId("extra-driver-11")).toHaveTextContent("D11");
    await user.click(screen.getByTestId("button-add-extra-driver"));
    const select = screen.getByTestId("select-extra-driver");
    expect((within(select).getByRole("option", { name: /D12/ }) as HTMLOptionElement).disabled).toBe(true);
    expect(within(select).queryByRole("option", { name: /^D10/ })).not.toBeInTheDocument();
    await user.selectOptions(select, "13");
    await user.click(screen.getByTestId("button-save-extra-driver"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/reservations/1/drivers", { driverId: 13 }));
  });

  it("removes an extra driver; without rights only the names show", async () => {
    const { unmount } = renderWith(<ExtraDrivers reservation={reservations[0]} canEdit />);
    await userEvent.click(screen.getByTestId("button-remove-extra-11"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("DELETE", "/api/portal/reservations/1/drivers/11"));
    unmount();
    renderWith(<ExtraDrivers reservation={reservations[0]} canEdit={false} />);
    expect(screen.getByTestId("extra-driver-11")).toBeInTheDocument();
    expect(screen.queryByTestId("button-add-extra-driver")).not.toBeInTheDocument();
  });

  it("asks who drove on a fine from a shared car", async () => {
    const fine = { id: 5, licensePlate: "1AB12", offenceAt: "2026-10-01T10:00:00.000Z", description: "Snelheid", reference: null, amount: "100", adminFee: "0", totalAmount: "100", status: "linked", customerNote: null, driver: null, driverOptions: [{ id: 10, displayName: "D10" }, { id: 11, displayName: "D11" }], reservationId: 1, hasLetter: false, createdAt: "2026-10-02T10:00:00.000Z" };
    renderWith(<FineDialog id={5} onClose={() => {}} />, { "/api/portal/fines/5": fine });
    const user = userEvent.setup();
    expect(await screen.findByTestId("fine-who-drove")).toHaveTextContent("meerdere bestuurders");
    await user.selectOptions(screen.getByTestId("select-fine-driver"), "11");
    await user.click(screen.getByTestId("button-save-fine-driver"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/fines/5/driver", { driverId: 11 }));
  });
});

/**
 * Audit remediation P5 - the scan card.
 *
 * A-11-4: the card called a vehicle "Verhuurd" as soon as a booking covered
 *         today. The vehicle's derived availability does say "rented" then (the
 *         server's rule, unchanged), but nothing has been handed over yet: only a
 *         picked-up rental is "Verhuurd" on the card.
 * A-6-5:  after a scan the card, the pickup form and the remarks warning lay on
 *         top of each other, and the card stayed open after the handover was done.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
// The handover dialogs expose how they were closed, so the test can finish them.
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  // The real dialogs keep the "Contract klaar" window after a success, so they stay
  // mounted with open=false; the stub does the same and offers a button for it.
  PickupDialog: ({ open, onOpenChange, onSuccess, onResultClosed }: any) => (
    <div>
      {open && (
        <div data-testid="pickup-dialog-open">
          <button type="button" data-testid="stub-pickup-cancel" onClick={() => onOpenChange(false)} />
          <button type="button" data-testid="stub-pickup-done" onClick={() => onSuccess?.()} />
        </div>
      )}
      <button type="button" data-testid="stub-pickup-result-closed" onClick={() => onResultClosed?.()} />
    </div>
  ),
  ReturnDialog: ({ open, onOpenChange, onSuccess, onResultClosed }: any) => (
    <div>
      {open && (
        <div data-testid="return-dialog-open">
          <button type="button" data-testid="stub-return-cancel" onClick={() => onOpenChange(false)} />
          <button type="button" data-testid="stub-return-done" onClick={() => onSuccess?.()} />
        </div>
      )}
      <button type="button" data-testid="stub-return-result-closed" onClick={() => onResultClosed?.()} />
    </div>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";
import { ScanDialog } from "@/components/barcodes/scan-dialog";

const vehicle = {
  id: 1667,
  licensePlate: "AB123C",
  brand: "Mitsubishi",
  model: "Spacestar",
  barcode: "VH-1667-R1",
  maintenanceStatus: "ok",
  availabilityStatus: "rented",
  currentFuelLevel: "Full",
  currentMileage: 1000,
};

function payload(reservationStatus: string | null) {
  return {
    type: "vehicle",
    vehicle,
    activeReservation: reservationStatus
      ? { id: 3200, status: reservationStatus, startDate: "2026-10-09", endDate: "2026-10-12", customer: { name: "Klant" } }
      : null,
    upcomingReservation: null,
    activeTransport: null,
    activeMaintenance: null,
  };
}

let current = payload("booked");
let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  current = payload("booked");
  fetchMock = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith("/api/barcodes/")) return json(current);
    if (/^\/api\/reservations\/\d+$/.test(u)) return json({ id: 3200, status: "booked", vehicleId: vehicle.id, vehicle });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{node}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

async function scan(user: ReturnType<typeof userEvent.setup>, code = "VH-1667-R1") {
  await user.type(document.querySelector("input") as HTMLInputElement, `${code}{Enter}`);
}

const barcodeCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/barcodes/"));

describe("A-11-4 - 'Verhuurd' only for a rental that has been picked up", () => {
  it("shows a booked-for-today vehicle as booked, not as rented", async () => {
    current = payload("booked");
    const user = userEvent.setup();
    withProviders(<ScanPanel active />);
    await scan(user);
    const card = await screen.findByTestId("scan-result-vehicle");
    expect(card).not.toHaveTextContent("Verhuurd");
    expect(screen.getByTestId("scan-vehicle-status")).toHaveTextContent("Geboekt");
  });

  it("shows a vehicle whose rental was picked up as rented", async () => {
    current = payload("picked_up");
    const user = userEvent.setup();
    withProviders(<ScanPanel active />);
    await scan(user);
    await screen.findByTestId("scan-result-vehicle");
    expect(screen.getByTestId("scan-vehicle-status")).toHaveTextContent("Verhuurd");
  });

  it("leaves every other status as it was", async () => {
    current = { ...payload(null), vehicle: { ...vehicle, availabilityStatus: "available" } } as any;
    const user = userEvent.setup();
    withProviders(<ScanPanel active />);
    await scan(user);
    await screen.findByTestId("scan-result-vehicle");
    expect(screen.getByTestId("scan-vehicle-status")).toHaveTextContent("Beschikbaar");
  });
});

describe("A-6-5 - one dialog at a time after a scan", () => {
  it("takes the card away while the pickup form is open, and brings it back when the form is cancelled", async () => {
    const user = userEvent.setup();
    withProviders(<ScanPanel active intent="pickup" />);
    await scan(user);
    await screen.findByTestId("pickup-dialog-open");
    expect(screen.queryByTestId("scan-result-vehicle")).toBeNull();

    await user.click(screen.getByTestId("stub-pickup-cancel"));
    expect(await screen.findByTestId("scan-result-vehicle")).toBeInTheDocument();
  });

  it("reports that the pickup form is open, so a hosting dialog can step aside", async () => {
    const onHandoverActiveChange = vi.fn();
    const user = userEvent.setup();
    withProviders(<ScanPanel active intent="pickup" onHandoverActiveChange={onHandoverActiveChange} />);
    await scan(user);
    await screen.findByTestId("pickup-dialog-open");
    expect(onHandoverActiveChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByTestId("stub-pickup-cancel"));
    await waitFor(() => expect(onHandoverActiveChange).toHaveBeenLastCalledWith(false));
  });
});

describe("A-6-5 - the scan card does not stay open after the handover", () => {
  it("tells the host it is finished once the contract window is closed, not before", async () => {
    const onHandoverFinished = vi.fn();
    const user = userEvent.setup();
    withProviders(<ScanPanel active intent="pickup" onHandoverFinished={onHandoverFinished} />);
    await scan(user);
    await user.click(await screen.findByTestId("stub-pickup-done"));
    // The window that follows a pickup ("Contract klaar" / "Contract kon niet gemaakt
    // worden") lives inside the pickup dialog: closing the host now would throw it away.
    expect(onHandoverFinished).not.toHaveBeenCalled();
    // ...and no card is rebuilt behind it.
    expect(barcodeCalls()).toHaveLength(1);
    await user.click(screen.getByTestId("stub-pickup-result-closed"));
    expect(onHandoverFinished).toHaveBeenCalledTimes(1);
  });

  it("keeps scanning mode (looks the vehicle up again) when no tile started it", async () => {
    const onHandoverFinished = vi.fn();
    const user = userEvent.setup();
    withProviders(<ScanPanel active onHandoverFinished={onHandoverFinished} />);
    await scan(user);
    await user.click(await screen.findByTestId("button-scan-pickup"));
    const before = barcodeCalls().length;
    await user.click(await screen.findByTestId("stub-pickup-done"));
    await waitFor(() => expect(barcodeCalls().length).toBe(before + 1));
    expect(onHandoverFinished).not.toHaveBeenCalled();
  });

  it("closes the scan dialog after a handover started from a dashboard tile", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    withProviders(<ScanDialog open onOpenChange={onOpenChange} intent="pickup" />);
    await scan(user);
    await user.click(await screen.findByTestId("stub-pickup-done"));
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("stub-pickup-result-closed"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides the scan dialog's own window while the handover form is on top", async () => {
    const user = userEvent.setup();
    withProviders(<ScanDialog open onOpenChange={() => {}} intent="pickup" />);
    await scan(user);
    await screen.findByTestId("pickup-dialog-open");
    expect(screen.getByTestId("dialog-scan")).toHaveAttribute("data-handover-active", "true");
    await user.click(screen.getByTestId("stub-pickup-cancel"));
    await waitFor(() => expect(screen.getByTestId("dialog-scan")).toHaveAttribute("data-handover-active", "false"));
  });
});

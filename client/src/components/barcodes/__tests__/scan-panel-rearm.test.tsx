/**
 * OPT-002 — the scan panel keeps its scan mode, and the dashboard tiles reach
 * the handover they mean.
 *
 * Two of the four claims in the proposal:
 *   (a) five of the fourteen actions dropped out of scan mode because their
 *       dialogs had no `onSuccess -> lookup(barcode)`. After a successful
 *       action the panel must look the same vehicle up again by itself.
 *   (b) a tile that says "Ophalen starten" starts a pickup when the scanned
 *       vehicle agrees — and does **not** quietly do the other handover when
 *       it disagrees.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Captured `onSuccess` callbacks of the dialogs the panel wraps. */
const captured: Record<string, (() => void) | undefined> = {};

function stubDialog(name: string) {
  return ({ children, onSuccess }: any) => {
    captured[name] = onSuccess;
    return <div data-testid={`stub-${name}`}>{children}</div>;
  };
}

vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: stubDialog("reservation-add"),
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: stubDialog("expense-add"),
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: stubDialog("document-upload"),
}));
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: ({ open }: any) => (open ? <div data-testid="pickup-dialog-open" /> : null),
  ReturnDialog: ({ open }: any) => (open ? <div data-testid="return-dialog-open" /> : null),
}));
// ScanPanel renders ScheduleMaintenanceDialog (not stubbed above), which now
// reads useHasPermission() -> useAuth() to gate its customers query
// (task-7-report.md); this test predates that and never wrapped its render
// in an AuthProvider.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";

const vehicle = {
  id: 1866,
  licensePlate: "AB123C",
  brand: "Volkswagen",
  model: "Crafter",
  barcode: "VH-1866-R1",
  maintenanceStatus: "ok",
  currentFuelLevel: "Full",
  currentMileage: 1000,
};

function lookupPayload(reservationStatus: string | null) {
  return {
    type: "vehicle",
    vehicle,
    activeReservation: reservationStatus
      ? { id: 4242, status: reservationStatus, startDate: "2026-10-01", endDate: "2026-10-05", customer: { name: "Klant" } }
      : null,
    upcomingReservation: null,
    activeTransport: null,
    activeMaintenance: null,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let payload = lookupPayload("booked");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPanel(intent: "pickup" | "return" | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ScanPanel active intent={intent} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

/** Types a code into the scan field and presses Enter, like the scanner does. */
async function scan(user: ReturnType<typeof userEvent.setup>, code = "VH-1866-R1") {
  const input = document.querySelector("input") as HTMLInputElement;
  await user.type(input, `${code}{Enter}`);
}

const barcodeCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/barcodes/"));

beforeEach(() => {
  for (const key of Object.keys(captured)) delete captured[key];
  payload = lookupPayload("booked");
  fetchMock = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith("/api/barcodes/")) return json(payload);
    if (/^\/api\/reservations\/\d+$/.test(u)) return json({ id: 4242, status: "booked", vehicleId: vehicle.id, vehicle });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-002 — de scanmodus blijft staan", () => {
  it("re-arms the scan after each dialog that used to drop out of scan mode", async () => {
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    await screen.findByTestId("button-scan-again");
    expect(barcodeCalls()).toHaveLength(1);

    // Two of the three dialogs that had no callback now have one ("Reservering
    // maken" only renders for a vehicle with nothing booked - see the next
    // test).
    for (const name of ["expense-add", "document-upload"]) {
      expect(captured[name], `${name} has no onSuccess`).toBeTypeOf("function");
    }

    const before = barcodeCalls().length;
    captured["expense-add"]!();
    await waitFor(() => expect(barcodeCalls().length).toBe(before + 1));
    expect(String(barcodeCalls().at(-1)![0])).toContain(encodeURIComponent(vehicle.barcode));
  });

  it("re-arms the scan after a reservation is made from the scan card", async () => {
    payload = lookupPayload(null);
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    await screen.findByTestId("button-scan-again");

    expect(captured["reservation-add"]).toBeTypeOf("function");
    const before = barcodeCalls().length;
    captured["reservation-add"]!();
    await waitFor(() => expect(barcodeCalls().length).toBe(before + 1));
  });

  it('puts "Opnieuw scannen" first in the tile grid', async () => {
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    const again = await screen.findByTestId("button-scan-again");
    const grid = again.parentElement!;
    expect(grid.firstElementChild).toBe(again);
  });

  it("starts the pickup by itself when the tile and the vehicle agree", async () => {
    const user = userEvent.setup();
    renderPanel("pickup");
    await scan(user);
    expect(await screen.findByTestId("pickup-dialog-open")).toBeInTheDocument();
  });

  it("does not do the other handover when they disagree", async () => {
    const user = userEvent.setup();
    renderPanel("return");
    await scan(user);
    // The action grid is there, so the lookup happened...
    await screen.findByTestId("button-scan-again");
    // ...but nothing was started on the employee's behalf.
    expect(screen.queryByTestId("return-dialog-open")).toBeNull();
    expect(screen.queryByTestId("pickup-dialog-open")).toBeNull();
  });

  it("starts the return by itself for a vehicle that is out", async () => {
    payload = lookupPayload("picked_up");
    const user = userEvent.setup();
    renderPanel("return");
    await scan(user);
    expect(await screen.findByTestId("return-dialog-open")).toBeInTheDocument();
  });

  it("a plain scan with no intent never starts a handover on its own", async () => {
    payload = lookupPayload("picked_up");
    const user = userEvent.setup();
    renderPanel(null);
    await scan(user);
    await screen.findByTestId("button-scan-again");
    expect(screen.queryByTestId("return-dialog-open")).toBeNull();
  });
});

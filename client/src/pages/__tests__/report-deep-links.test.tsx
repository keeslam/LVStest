/**
 * Rapporten herontwerp deel 1b, Task 3: "Openen in nieuw tabblad" in a report's quick view opens
 * the full record at its own address. Each page opens its existing dialog and takes the parameter
 * off the address, so closing the dialog, going back or reloading does not open it again.
 * (/customers?customer= and /fines?bekeuring= already existed and keep their own tests.)
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider, useGlobalDialog } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/components/vehicles/vehicle-view-dialog", () => ({
  VehicleViewDialog: ({ open, vehicleId }: { open: boolean; vehicleId: number | null }) =>
    (open ? <div data-testid="vehicle-view-dialog">{vehicleId}</div> : null),
}));
vi.mock("@/components/expenses/invoice-review-dialog", () => ({
  InvoiceReviewDialog: ({ item }: { item: { id: number } | null }) => (item ? <div data-testid="invoice-review-dialog">{item.id}</div> : null),
}));

import VehiclesIndex from "@/pages/vehicles/index";
import ReservationCalendarPage from "@/pages/reservations/calendar";
import { InvoiceInboxButton } from "@/components/expenses/invoice-inbox-dialog";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pathOf = (input: unknown) => (typeof input === "string" ? input : (input as Request)?.url ?? "").replace(/^https?:\/\/[^/]+/, "");

const FLEET = [7, 8].map((id) => ({
  id, licensePlate: `AB-0${id}-CD`, brand: "Ford", model: "Transit", vehicleType: "Bus", availabilityStatus: "available",
  apkDate: "2027-03-01", remarks: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
}));

beforeEach(() => {
  sessionStorage.setItem("notCollectedDialogShown", "1");
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const path = pathOf(input).split("?")[0];
    if (path === "/api/vehicles") return json(FLEET);
    if (path === "/api/expenses/inbox/items/9") return json({ id: 9, status: "review", parsed: null, receivedAt: "2026-09-10T08:05:00.000Z", processedAt: null, mailDate: null });
    if (path === "/api/expenses/inbox/status") return json({ enabled: true, running: false, lastRun: null, reviewCount: 0 });
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
}

let reservationDialog: { open: boolean; id: number | null } | null = null;
function ReservationDialogProbe() {
  reservationDialog = useGlobalDialog().dialogState.reservation;
  return null;
}

function renderAt(path: string, node: React.ReactNode) {
  window.history.replaceState(null, "", path);
  const { hook } = memoryLocation({ path: path.split("?")[0], static: true });
  return render(
    <QueryClientProvider client={client()}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
        <ReservationDialogProbe />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("deep links from a report quick view", () => {
  it("/vehicles?vehicle=7 opens the vehicle dialog of car 7 and cleans the address", async () => {
    renderAt("/vehicles?vehicle=7", <VehiclesIndex />);
    expect(await screen.findByTestId("vehicle-view-dialog")).toHaveTextContent("7");
    expect(window.location.search).toBe("");
  });

  it("/vehicles without the parameter opens nothing", async () => {
    renderAt("/vehicles", <VehiclesIndex />);
    await screen.findAllByText("AB-07-CD");
    expect(screen.queryByTestId("vehicle-view-dialog")).toBeNull();
  });

  it("/reservations?reservation=12 opens the reservation dialog of 12 and cleans the address", async () => {
    renderAt("/reservations?reservation=12", <ReservationCalendarPage />);
    await waitFor(() => expect(reservationDialog).toEqual({ open: true, id: 12 }));
    expect(window.location.search).toBe("");
  });

  it("/expenses?invoice=9 opens the invoice check dialog of item 9 and cleans the address", async () => {
    renderAt("/expenses?invoice=9", <InvoiceInboxButton />);
    expect(await screen.findByTestId("invoice-review-dialog")).toHaveTextContent("9");
    expect(window.location.search).toBe("");
  });
});

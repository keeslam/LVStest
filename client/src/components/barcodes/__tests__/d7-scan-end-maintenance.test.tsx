/**
 * Sub-project D, D7 (besluiten B-41/B-42): "Terug uit onderhoud" on the scan card for a
 * car that is Binnen for a block is the completion of that block. The server answers
 * 409 USE_COMPLETE_ROUTE with the block id; the card opens the Afronden dialog for it
 * instead of showing an error.
 *
 * Runs in the jsdom project.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));
vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";

const vehicle = {
  id: 1667, licensePlate: "AB123C", brand: "Mitsubishi", model: "Spacestar", barcode: "VH-1667-R1",
  maintenanceStatus: "in_service", availabilityStatus: "needs_fixing", currentFuelLevel: "Full",
  currentMileage: 45000, apkDate: "2027-03-01",
};
const block = {
  id: 901, vehicleId: vehicle.id, type: "maintenance_block", status: "booked", maintenanceStatus: "in",
  startDate: "2026-10-09", endDate: "2026-10-12", notes: "regular_maintenance: beurt", vehicle,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Call = { method: string; url: string };
let calls: Call[];
let endMaintenanceResponse: () => Response;

beforeEach(() => {
  calls = [];
  toastSpy.mockClear();
  endMaintenanceResponse = () => json({
    message: "finish with the completion route", code: "USE_COMPLETE_ROUTE", blockId: block.id,
  }, 409);
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (url.startsWith("/api/barcodes/")) {
      return json({ type: "vehicle", vehicle, activeReservation: null, upcomingReservation: null, activeTransport: null, activeMaintenance: { id: block.id, startDate: block.startDate } });
    }
    if (method === "PATCH" && url === `/api/vehicles/${vehicle.id}/maintenance-status`) return endMaintenanceResponse();
    if (method === "GET" && url === `/api/reservations/${block.id}`) return json(block);
    if (method === "POST" && url === `/api/reservations/${block.id}/complete-maintenance`) return json({ block: { ...block, status: "completed" }, vehicle });
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider><ScanPanel active /></GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

async function scanAndPressEnd(user: ReturnType<typeof userEvent.setup>) {
  renderPanel();
  await user.type(document.querySelector("input") as HTMLInputElement, "VH-1667-R1{Enter}");
  await user.click(await screen.findByTestId("button-scan-maintenance-end"));
}

describe("scan card: 'Terug uit onderhoud' for a car that is Binnen (D7)", () => {
  it("opens the Afronden dialog for the block the server names, with no error toast", async () => {
    const user = userEvent.setup();
    await scanAndPressEnd(user);

    expect(await screen.findByTestId("dialog-complete-maintenance")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.url === `/api/reservations/${block.id}`)).toBe(true);
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("completing it there sends the completion request and refreshes the card", async () => {
    const user = userEvent.setup();
    await scanAndPressEnd(user);

    await user.click(await screen.findByTestId("button-complete-maintenance"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === `/api/reservations/${block.id}/complete-maintenance`)).toBe(true));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/barcodes/")).length).toBeGreaterThanOrEqual(2));
  });

  it("any other refusal is still the ordinary error toast", async () => {
    endMaintenanceResponse = () => json({ message: "boom" }, 500);
    const user = userEvent.setup();
    await scanAndPressEnd(user);

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.queryByTestId("dialog-complete-maintenance")).toBeNull();
  });
});

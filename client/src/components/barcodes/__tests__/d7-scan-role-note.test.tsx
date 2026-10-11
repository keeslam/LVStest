/**
 * Sub-project D, final wave (da-review Minor 8): "Terug uit onderhoud" on the scan card
 * for a car that is Binnen for a block IS the completion of that block (Afronden), which
 * needs 'Onderhoud beheren' or 'Reserveringen beheren'. An account with only
 * 'Voertuigen beheren' used to get the Afronden dialog with a hidden submit button; the
 * button itself now says why it is off (RequiresPermission). A MANAGE_MAINTENANCE-only
 * account no longer needs 'Voertuigen beheren' for it: Afronden opens straight away.
 *
 * Runs in the jsdom project.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ role: "user" as string, permissions: [] as string[] }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
  toast: vi.fn(),
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
  useAuth: () => ({ user: { id: 1, username: "tester", role: auth.role, permissions: auth.permissions, hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";

const vehicle = {
  id: 1667, licensePlate: "AB123C", brand: "Mitsubishi", model: "Spacestar", barcode: "VH-1667-R1",
  maintenanceStatus: "in_service", availabilityStatus: "needs_fixing", currentFuelLevel: "Full",
  currentMileage: 45000, apkDate: "2027-03-01",
};
const block = {
  id: 901, vehicleId: vehicle.id, type: "maintenance_block", status: "picked_up", maintenanceStatus: "in",
  startDate: "2026-10-09", endDate: "2026-10-12", notes: "regular_maintenance: beurt", vehicle,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let calls: Array<{ method: string; url: string }>;
let activeMaintenance: Record<string, unknown> | null;

beforeEach(() => {
  calls = [];
  activeMaintenance = { id: block.id, startDate: block.startDate, endDate: block.endDate, maintenanceStatus: "in" };
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (url.startsWith("/api/barcodes/")) {
      return json({ type: "vehicle", vehicle, activeReservation: null, upcomingReservation: null, activeTransport: null, activeMaintenance });
    }
    if (method === "PATCH" && url === `/api/vehicles/${vehicle.id}/maintenance-status`) return json({ ...vehicle, maintenanceStatus: "ok" });
    if (method === "GET" && url === `/api/reservations/${block.id}`) return json(block);
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function scan(user: ReturnType<typeof userEvent.setup>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider><ScanPanel active /></GlobalDialogProvider>
    </QueryClientProvider>,
  );
  await user.type(document.querySelector("input") as HTMLInputElement, "VH-1667-R1{Enter}");
  return screen.findByTestId("button-scan-maintenance-end");
}

describe("scan card: 'Terug uit onderhoud' for a car that is Binnen for a block - who may press it", () => {
  it("'Voertuigen beheren' alone: the button is off and says which right it needs; pressing it opens nothing", async () => {
    auth.role = "user";
    auth.permissions = ["manage_vehicles"];
    const user = userEvent.setup();

    const button = await scan(user);

    expect(button).toBeDisabled();
    await user.click(button.parentElement as HTMLElement);
    expect((await screen.findAllByText(/Onderhoud beheren/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reserveringen beheren/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("dialog-complete-maintenance")).toBeNull();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("'Onderhoud beheren' alone: Afronden opens straight away, without the vehicle status call that needs 'Voertuigen beheren'", async () => {
    auth.role = "user";
    auth.permissions = ["manage_maintenance"];
    const user = userEvent.setup();

    const button = await scan(user);
    expect(button).toBeEnabled();
    await user.click(button);

    expect(await screen.findByTestId("dialog-complete-maintenance")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("a car in the workshop without a Binnen block keeps the old rule: 'Voertuigen beheren' is enough", async () => {
    auth.role = "user";
    auth.permissions = ["manage_vehicles"];
    activeMaintenance = null;
    const user = userEvent.setup();

    const button = await scan(user);
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url === `/api/vehicles/${vehicle.id}/maintenance-status`)).toBe(true));
  });
});

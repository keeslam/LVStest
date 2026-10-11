/**
 * Sub-project D, D4 (besluiten B-41/B-42): "Annuleren" in "Vervangende voertuigen
 * toewijzen" undoes the whole planning. Annuleren, Escape, the cross and a click
 * outside all ask first ("Plannen afbreken?"), then call
 * `POST /api/reservations/:id/abort-planning`; on 409 PLANNING_NOT_ABORTABLE the
 * dialog falls back to the normal delete (recycle bin).
 *
 * Runs in the jsdom project.
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false },
    isLoading: false,
  }),
}));

import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";

const START = "2026-11-03";
const VEHICLES = [
  { id: 1, licensePlate: "11-AAA-1", brand: "Audi", model: "A4", vehicleType: "Personenauto" },
  { id: 2, licensePlate: "22-BBB-2", brand: "Fiat", model: "Doblo", vehicleType: "Bestelwagen" },
];
const CUSTOMERS = [{ id: 10, name: "Jansen Transport", city: "Zwolle" }];
const CONFLICT = {
  id: 900, customerId: 10, vehicleId: 1, type: "standard", status: "booked",
  startDate: START, endDate: START, customer: CUSTOMERS[0], vehicle: VEHICLES[0],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Call = { method: string; url: string };
let calls: Call[];
let abortResponse: () => Response;

beforeEach(() => {
  calls = [];
  toastSpy.mockClear();
  abortResponse = () => json({ aborted: true, id: 777 });
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (method === "POST" && url === "/api/reservations") {
      return json({
        needsSpareVehicle: true, conflictingReservations: [CONFLICT],
        maintenanceData: { vehicleId: 1, startDate: START, endDate: START }, maintenanceReservationId: 777,
      });
    }
    if (method === "POST" && url === "/api/reservations/777/abort-planning") return abortResponse();
    if (method === "DELETE" && url === "/api/reservations/777") return json({ message: "Reservation deleted successfully" });
    if (url.startsWith("/api/vehicles")) return json(VEHICLES);
    if (url.startsWith("/api/customers")) return json(CUSTOMERS);
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, gcTime: 0, staleTime: Infinity,
        queryFn: async ({ queryKey }) => {
          const key = String(queryKey[0]);
          if (key.startsWith("/api/vehicles")) return VEHICLES;
          if (key.startsWith("/api/customers")) return CUSTOMERS;
          return [];
        },
      },
    },
  });
  function Host() {
    const [open, setOpen] = useState(true);
    return <ScheduleMaintenanceDialog open={open} onOpenChange={setOpen} initialVehicleId={1} initialDate={START} />;
  }
  return render(<QueryClientProvider client={client}><Host /></QueryClientProvider>);
}

async function openSpareDialog(user: ReturnType<typeof userEvent.setup>) {
  renderDialog();
  await user.click(await screen.findByTestId("button-schedule"));
  await screen.findByTestId("button-assign-spare-vehicles", undefined, { timeout: 3000 });
}

const abortCalls = () => calls.filter((c) => c.url === "/api/reservations/777/abort-planning");
const deleteCalls = () => calls.filter((c) => c.method === "DELETE" && c.url === "/api/reservations/777");

describe("D4: Annuleren in the spare vehicle dialog", () => {
  it("Annuleren asks first, then aborts the planning and says so", async () => {
    const user = userEvent.setup();
    await openSpareDialog(user);

    await user.click(screen.getByTestId("button-cancel-spare-dialog"));

    expect(await screen.findByText("Plannen afbreken?")).toBeInTheDocument();
    expect(screen.getByText(/Het onderhoud wordt weer weggehaald/)).toBeInTheDocument();
    expect(abortCalls()).toHaveLength(0);

    await user.click(screen.getByTestId("button-confirm-abort-planning"));

    await waitFor(() => expect(abortCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("button-assign-spare-vehicles")).toBeNull());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Plannen afgebroken" }));
    expect(deleteCalls()).toHaveLength(0);
  });

  it("Escape does the same", async () => {
    const user = userEvent.setup();
    await openSpareDialog(user);

    await user.keyboard("{Escape}");

    expect(await screen.findByText("Plannen afbreken?")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-confirm-abort-planning"));
    await waitFor(() => expect(abortCalls()).toHaveLength(1));
  });

  it("declining the question keeps the spare dialog and the planning", async () => {
    const user = userEvent.setup();
    await openSpareDialog(user);

    await user.click(screen.getByTestId("button-cancel-spare-dialog"));
    await user.click(await screen.findByRole("button", { name: "Doorgaan met plannen" }));

    await waitFor(() => expect(screen.queryByText("Plannen afbreken?")).toBeNull());
    expect(screen.getByTestId("button-assign-spare-vehicles")).toBeInTheDocument();
    expect(abortCalls()).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
  });

  it("falls back to the normal delete when the server says the planning is not abortable", async () => {
    abortResponse = () => json({ message: "no", code: "PLANNING_NOT_ABORTABLE", reason: "TOO_OLD" }, 409);
    const user = userEvent.setup();
    await openSpareDialog(user);

    await user.click(screen.getByTestId("button-cancel-spare-dialog"));
    await user.click(await screen.findByTestId("button-confirm-abort-planning"));

    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("button-assign-spare-vehicles")).toBeNull());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Onderhoud verwijderd" }));
  });
});

/**
 * Audit 2026-10-09, module 7 (package P4): the "Onderhoud plannen" dialog.
 *
 *  - A-7-1: after planning with only a cancelled overlap no (empty) spare
 *    dialog may remain; an empty conflict list never shows a dialog.
 *  - A-7-6: the customer is picked from a searchable list, not a flat select.
 *  - A-7-8: one click on "Vervangers toewijzen & onderhoud plannen" acts.
 *  - A-7-9: no status field when creating a block (it stays when editing).
 *
 * Runs in the jsdom project.
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";

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
const CUSTOMERS = [
  { id: 10, name: "Jansen Transport", city: "Zwolle" },
  { id: 11, name: "Bakker Logistiek", city: "Ede" },
  { id: 12, name: "Visser Bouw", city: "Delft" },
];
const CONFLICT = {
  id: 900, customerId: 10, vehicleId: 1, type: "standard", status: "booked",
  startDate: START, endDate: START, customer: CUSTOMERS[0], vehicle: VEHICLES[0],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Call = { method: string; url: string; body: any };
let calls: Call[];
let postResponse: () => Response;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (method === "POST" && url === "/api/reservations") return postResponse();
    if (method === "POST" && url === "/api/reservations/maintenance-with-spare") return json({ success: true });
    if (url.startsWith("/api/vehicles")) return json(VEHICLES);
    if (url.startsWith("/api/customers")) return json(CUSTOMERS);
    return json([]);
  }));
}

function renderDialog(props: Partial<React.ComponentProps<typeof ScheduleMaintenanceDialog>> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
        queryFn: async ({ queryKey }) => {
          const key = String(queryKey[0]);
          if (key.startsWith("/api/vehicles")) return VEHICLES;
          if (key.startsWith("/api/customers")) return CUSTOMERS;
          return [];
        },
      },
    },
  });
  // Controlled like every real caller: closing really closes.
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <ScheduleMaintenanceDialog open={open} onOpenChange={setOpen} initialVehicleId={1} initialDate={START} {...props} />
    );
  }
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
}

function reservationPosts() {
  return calls.filter((c) => c.method === "POST" && c.url === "/api/reservations");
}

beforeEach(() => {
  postResponse = () => json({ id: 1 }, 201);
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("A-7-9: no status field when creating a block", () => {
  it("create mode does not offer Gepland/Binnen/Uit", async () => {
    renderDialog();
    await screen.findByTestId("button-schedule");
    expect(screen.queryByTestId("select-maintenance-status")).toBeNull();
  });

  it("edit mode keeps the status field", async () => {
    renderDialog({
      editingReservation: {
        id: 501, vehicleId: 1, startDate: START, endDate: START, maintenanceStatus: "scheduled",
        notes: "breakdown: test", maintenanceDuration: 1,
      } as any,
    });
    expect(await screen.findByTestId("select-maintenance-status")).toBeInTheDocument();
  });

  it("a created block is still sent as planned", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("button-schedule"));
    await waitFor(() => expect(reservationPosts()).toHaveLength(1));
    expect(reservationPosts()[0].body.maintenanceStatus).toBe("scheduled");
  });
});

describe("A-7-6: the customer is picked from a searchable list", () => {
  it("typing narrows the list", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("select-customer"));
    expect(await screen.findByText("Bakker Logistiek")).toBeInTheDocument();
    expect(screen.getByText("Jansen Transport")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/zoek/i), "bakk");

    await waitFor(() => expect(screen.queryByText("Jansen Transport")).toBeNull());
    expect(screen.getByText("Bakker Logistiek")).toBeInTheDocument();
  });

  it("the chosen customer is sent with the block", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("select-customer"));
    await user.click(await screen.findByText("Visser Bouw"));
    await user.click(screen.getByTestId("button-schedule"));
    await waitFor(() => expect(reservationPosts()).toHaveLength(1));
    expect(reservationPosts()[0].body.customerId).toBe(12);
  });

  it("the no-customer choice stays available and sends null", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("select-customer"));
    await user.click(await screen.findByText("Visser Bouw"));
    await user.click(screen.getByTestId("select-customer"));
    await user.click(await screen.findByText(/Geen \(geen klant\)/));
    await user.click(screen.getByTestId("button-schedule"));
    await waitFor(() => expect(reservationPosts()).toHaveLength(1));
    expect(reservationPosts()[0].body.customerId).toBeNull();
  });
});

describe("A-7-1 and A-7-8: the spare vehicle dialog", () => {
  async function planWithConflict(user: ReturnType<typeof userEvent.setup>) {
    postResponse = () => json({
      needsSpareVehicle: true,
      conflictingReservations: [CONFLICT],
      maintenanceData: { vehicleId: 1, startDate: START, endDate: START },
      maintenanceReservationId: 777,
    });
    await user.click(await screen.findByTestId("button-schedule"));
    return screen.findByTestId("button-assign-spare-vehicles", undefined, { timeout: 3000 });
  }

  it("one click on the confirm button acts after a spare vehicle was picked", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = await planWithConflict(user);

    await user.click(screen.getByLabelText(/Nu vervangend voertuig toewijzen/));
    const picker = within(await screen.findByTestId("select-spare-vehicle-900")).getByRole("button");
    await user.click(picker);
    await user.click(await screen.findByText("Fiat Doblo"));
    await user.click(await screen.findByTestId("button-save-duration"));
    await waitFor(() => expect(screen.queryByTestId("button-save-duration")).toBeNull());

    await user.click(confirm);

    await waitFor(() =>
      expect(calls.filter((c) => c.url === "/api/reservations/maintenance-with-spare")).toHaveLength(1),
    );
  });

  it("one click acts even while the vehicle list is still open (it must not just close the list)", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = await planWithConflict(user);

    await user.click(screen.getByLabelText(/Nu vervangend voertuig toewijzen/));
    const picker = within(await screen.findByTestId("select-spare-vehicle-900")).getByRole("button");
    await user.click(picker);
    await user.click(await screen.findByText("Fiat Doblo"));
    await user.click(await screen.findByTestId("button-save-duration"));
    await waitFor(() => expect(screen.queryByTestId("button-save-duration")).toBeNull());
    // The desk reopens the list, then goes straight for the confirm button.
    await user.click(picker);
    expect(await screen.findByPlaceholderText(/zoek op kenteken/i)).toBeInTheDocument();

    await user.click(confirm);

    await waitFor(() =>
      expect(calls.filter((c) => c.url === "/api/reservations/maintenance-with-spare")).toHaveLength(1),
    );
  });

  it("a reply without any real conflict never opens an empty spare dialog", async () => {
    const user = userEvent.setup();
    renderDialog();
    postResponse = () => json({
      needsSpareVehicle: true,
      conflictingReservations: [],
      maintenanceData: { vehicleId: 1, startDate: START, endDate: START },
      maintenanceReservationId: 777,
    });

    await user.click(await screen.findByTestId("button-schedule"));

    await waitFor(() => expect(reservationPosts()).toHaveLength(1));
    // The spare dialog is delayed by 100 ms: wait it out before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText("Vervangende voertuigen toewijzen")).toBeNull();
    expect(screen.queryByTestId("button-assign-spare-vehicles")).toBeNull();
    // Planned like any other block: the main dialog is closed again.
    await waitFor(() => expect(screen.queryByTestId("dialog-schedule-maintenance")).toBeNull());
  });

  it("choosing 'klant regelt eigen vervoer' and confirming leaves no dialog behind", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = await planWithConflict(user);

    await user.click(screen.getByLabelText(/Klant regelt eigen vervoer/));
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Vervangende voertuigen toewijzen")).toBeNull();
  });
});

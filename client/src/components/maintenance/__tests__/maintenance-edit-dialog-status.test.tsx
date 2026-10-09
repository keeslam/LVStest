/**
 * Audit module 7, finding 2 (controller's ruling, sub-project C Task 8): the
 * maintenance edit dialog's Status select has to show what is stored.
 *
 * The reset effect that runs when the dialog opens fell back to "in" for every
 * stored value except in/out, so a block that was merely planned opened as
 * "Binnen (voertuig is in onderhoud)"; saving it unchanged then sent
 * status "in" and moved the block - and through the server, the car - into the
 * workshop.
 *
 * The earlier toegang task gave up on rendering this dialog (an effect whose
 * dependency list holds query results defaulted to `[]`, a new array on every
 * render, so an empty cache loops). Seeding the two query keys that default to
 * `[]` - the customers list and the vehicle's overlapping rentals - with
 * `staleTime: Infinity` hands the effect stable arrays and the dialog renders.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false },
    isLoading: false,
  }),
}));

import { MaintenanceEditDialog } from "@/components/maintenance/maintenance-edit-dialog";

const START = "2026-10-19";
const VEHICLE_ID = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const block = (maintenanceStatus: string | null) => ({
  id: 501,
  vehicleId: VEHICLE_ID,
  type: "maintenance_block",
  status: "booked",
  startDate: START,
  endDate: START,
  maintenanceStatus,
  notes: "breakdown: onderhoud test",
  maintenanceDuration: 1,
  customerId: null,
}) as any;

function renderDialog(maintenanceStatus: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  client.setQueryData(["/api/customers"], []);
  client.setQueryData(["/api/vehicles", VEHICLE_ID, "overlaps", START, START], []);
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceEditDialog open onOpenChange={() => {}} reservation={block(maintenanceStatus)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function shownStatus(): Promise<string> {
  const trigger = await screen.findByTestId("select-maintenance-status");
  await waitFor(() => expect(trigger.textContent).toBeTruthy());
  return trigger.textContent ?? "";
}

describe("MaintenanceEditDialog - the Status select shows the stored status", () => {
  it("a planned block opens as Gepland, not Binnen", async () => {
    renderDialog("scheduled");
    expect(await shownStatus()).toBe("Gepland (voertuig nog niet gearriveerd)");
  });

  it("a legacy block without a status is read as planned too", async () => {
    renderDialog(null);
    expect(await shownStatus()).toBe("Gepland (voertuig nog niet gearriveerd)");
  });

  it("a block whose car is in the workshop opens as Binnen", async () => {
    renderDialog("in");
    expect(await shownStatus()).toBe("Binnen (voertuig is in onderhoud)");
  });

  it("a finished block opens as Uit", async () => {
    renderDialog("out");
    expect(await shownStatus()).toBe("Uit (onderhoud voltooid)");
  });
});

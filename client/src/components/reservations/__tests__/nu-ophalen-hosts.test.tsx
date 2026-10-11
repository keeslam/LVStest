/**
 * D3 fix round 1 - "Nu ophalen" after saving a new reservation has to work from every host of the
 * form, also those that close or even UNMOUNT the form's dialog on success (customers list,
 * vehicles list, scan panel) and the ones that never hosted a PickupDialog (dashboard quick
 * action). The PickupDialog therefore lives in the global dialog layer (`startPickupFlow`), not in
 * the add dialog.
 *
 * ReservationAddDialog is NOT mocked here: the point is that it can disappear.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";
import { UserRole } from "@shared/schema";

// The global layer's other dialogs are heavy and irrelevant here.
const nothing = vi.hoisted(() => () => null);
vi.mock("@/components/reservations/reservation-view-dialog", () => ({ ReservationViewDialog: nothing }));
vi.mock("@/components/reservations/reservation-edit-dialog", () => ({ ReservationEditDialog: nothing }));
vi.mock("@/components/reservations/spare-vehicle-dialog", () => ({ SpareVehicleDialog: nothing }));
vi.mock("@/components/vehicles/apk-inspection-dialog", () => ({ ApkInspectionDialog: nothing }));
vi.mock("@/components/vehicles/vehicle-view-dialog", () => ({ VehicleViewDialog: nothing }));
vi.mock("@/components/customers/customer-view-dialog", () => ({ CustomerViewDialog: nothing }));
vi.mock("@/components/expenses/expense-view-dialog", () => ({ ExpenseViewDialog: nothing }));
vi.mock("@/components/expenses/expense-detail-dialog", () => ({ ExpenseDetailDialog: nothing }));
vi.mock("@/components/fines/fine-dialog", () => ({ FineDialog: nothing }));
vi.mock("@/components/fines/new-fine-dialog", () => ({ NewFineDialog: nothing }));
vi.mock("@/components/fines/fine-import-dialog", () => ({ FineImportDialog: nothing }));
vi.mock("@/components/fines/fine-imports-dialog", () => ({ FineImportsDialog: nothing }));
vi.mock("@/components/portal-admin/portal-request-dialog", () => ({ PortalRequestDialog: nothing }));
vi.mock("@/components/portal-admin/portal-list-dialog", () => ({ PortalListDialog: nothing }));
vi.mock("@/components/barcodes/scan-dialog", () => ({ ScanDialog: nothing }));
vi.mock("@/components/expenses/expense-add-dialog", () => ({ ExpenseAddDialog: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/documents/inline-document-upload", () => ({ InlineDocumentUpload: ({ children }: any) => <div>{children}</div> }));
// The real PickupDialog is covered by the pickup tests: here only "which reservation, open or not".
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: ({ open, reservation }: any) =>
    open ? <div data-testid="pickup-dialog-stub">{`pickup #${reservation.id}`}</div> : null,
  ReturnDialog: () => null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogs } from "@/components/global-dialogs";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { QuickActions } from "@/components/dashboard/quick-actions";

const vehicle = { id: 1821, licensePlate: "HL-02-HL", brand: "Volkswagen", model: "Crafter", company: "false", currentMileage: 25600 };
const customer = { id: 55, name: "Testklant Bv" };
const created = { id: 999, status: "booked", vehicleId: vehicle.id, customerId: customer.id, vehicle, customer };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  window.history.replaceState(null, "", `/?vehicleId=${vehicle.id}&customerId=${customer.id}`);
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/vehicles" && method === "GET") return json([vehicle]);
    if (url === `/api/vehicles/${vehicle.id}` && method === "GET") return json(vehicle);
    if (url === "/api/customers" && method === "GET") return json([customer]);
    if (url === "/api/reservations" && method === "POST") return json(created);
    if (url === "/api/reservations/999" && method === "GET") return json(created);
    return json([]);
  }));
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHost(host: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        {host}
        <GlobalDialogs />
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

async function saveAndPickUpNow(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Volkswagen Crafter");
  const submit = await screen.findByTestId("button-submit-reservation");
  await waitFor(() => expect(submit).not.toBeDisabled());
  await user.click(submit);
  const action = await screen.findByTestId("button-pickup-now");
  await user.click(action);
  expect((await screen.findByTestId("pickup-dialog-stub")).textContent).toBe("pickup #999");
}

/** What the customers list and the vehicles list do: drop the dialog from the tree on success. */
function UnmountingHost() {
  const [show, setShow] = useState(true);
  return show ? (
    <ReservationAddDialog
      open
      onOpenChange={() => {}}
      initialVehicleId={String(vehicle.id)}
      initialCustomerId={String(customer.id)}
      onSuccess={() => setShow(false)}
    />
  ) : (
    <div data-testid="host-gone" />
  );
}

describe("D3 fix round 1 - Nu ophalen from every host", () => {
  it("a host that unmounts the add dialog on success (customers list, vehicles list, scan panel)", async () => {
    const user = userEvent.setup();
    renderHost(<UnmountingHost />);
    await screen.findByTestId("button-submit-reservation");
    await screen.findByText("Volkswagen Crafter");
    const submit = screen.getByTestId("button-submit-reservation");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await screen.findByTestId("host-gone");
    expect(screen.queryByTestId("button-submit-reservation")).toBeNull();
    const action = await screen.findByTestId("button-pickup-now");
    await user.click(action);
    expect((await screen.findByTestId("pickup-dialog-stub")).textContent).toBe("pickup #999");
  });

  it("the dashboard quick action's own New reservation dialog", async () => {
    const user = userEvent.setup();
    renderHost(<QuickActions />);
    await user.click(await screen.findByTestId("button-quick-new-reservation"));
    await saveAndPickUpNow(user);
  });
});

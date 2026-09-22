/**
 * `MaintenanceViewDialog` — fix round 2 (reviewer), item 3: a real-site proof
 * that a denied user clicking `button-upload-photos` (inside
 * `InlineDocumentUpload`, which wraps its children in its own
 * `<div onClick={() => setIsOpen(true)}>`) does NOT open the upload dialog.
 * Unlike `MaintenanceEditDialog` (task-4-report.md §9 — a pre-existing
 * infinite-render bug in its own `useEffect`), this file has no `useEffect`
 * of its own (grepped) and renders fine in jsdom.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { MaintenanceViewDialog } from "@/components/maintenance/maintenance-view-dialog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

const reservation = {
  id: 77,
  vehicleId: 1,
  customerId: null,
  driverId: null,
  type: "maintenance_block",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  maintenanceStatus: "in",
  maintenanceDuration: 2,
  notes: "regular_maintenance: test",
  portalRequestId: null,
};

const vehicle = { id: 1, brand: "Volkswagen", model: "Golf", licensePlate: "AB-123-C" };

function renderDialog() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes(`/api/reservations/${reservation.id}`)) return json(reservation);
      if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
      if (url.includes("/api/vehicles")) return json([vehicle]);
      if (url.includes("/api/documents/reservation")) return json([]);
      if (url.includes("/api/reservations")) return json([reservation]);
      return json([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <MaintenanceViewDialog open onOpenChange={() => {}} reservationId={reservation.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setUser(UserRole.USER, []); // no MANAGE_DOCUMENTS, no MANAGE_RESERVATIONS
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MaintenanceViewDialog — fix round 2, real-site proof", () => {
  it("a denied user clicking button-upload-photos does not open the upload dialog", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-upload-photos");
    expect(button).toHaveAttribute("aria-disabled", "true");

    // Same as a real click: the disabled button's pointer-events:none sends
    // the click to the wrapping span, which InlineDocumentUpload's own
    // ancestor <div onClick={() => setIsOpen(true)}> used to still receive.
    await userEvent.click(button, { pointerEventsCheck: 0 });

    // The upload dialog's own heading/file input must never appear.
    expect(screen.queryByLabelText(/Bestand/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /document uploaden/i })).not.toBeInTheDocument();
  });

  it("an allowed user (manage_documents) can still open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_DOCUMENTS]);
    renderDialog();
    const button = await screen.findByTestId("button-upload-photos");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

/**
 * 2026-09-21 review, item 2: `InvoiceScanner` sat ungated in this same
 * four-tile grid, the other three tiles already wrapped in
 * `RequiresPermission` — its action is `POST /api/expenses/scan`
 * (server/routes/expenses.ts, `hasPermission(UserPermission.MANAGE_EXPENSES)`),
 * so it now takes a gated `children` trigger the same way `InlineDocumentUpload`
 * already does. Same "real-site proof" shape as the upload-photos pair above.
 */
describe("MaintenanceViewDialog — button-scan-invoice follows manage_expenses (2026-09-21 review, item 2)", () => {
  it("a denied user clicking button-scan-invoice does not open the invoice scanner", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-scan-invoice");
    expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(button, { pointerEventsCheck: 0 });

    expect(screen.queryByTestId("input-invoice-file")).not.toBeInTheDocument();
  });

  it("an allowed user (manage_expenses) can still open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_EXPENSES]);
    renderDialog();
    const button = await screen.findByTestId("button-scan-invoice");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByTestId("input-invoice-file")).toBeInTheDocument();
    });
  });
});

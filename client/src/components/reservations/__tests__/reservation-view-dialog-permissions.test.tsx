/**
 * 2026-09-21 review, follow-up (found by the re-reviewer): the maintenance-block
 * "Kosten toevoegen" button wrapped `ExpenseAddDialog` in a plain `Button`
 * with no `RequiresPermission`, unlike its sibling in `scan-panel.tsx`
 * (`button-scan-expense`). `POST /api/expenses` (server/routes/expenses.ts)
 * guards on MANAGE_EXPENSES, so the trigger is now
 * `RequiresPermission anyOf={[MANAGE_EXPENSES]}`.
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
  // WorkshopBlockedDialog (rendered for a maintenance-block reservation) reads
  // this context directly, deliberately not the hook above (it must never
  // throw when no AuthProvider is mounted, see its own comment) — an empty
  // object makes `useContext(AuthContext)?.user` resolve to `undefined`,
  // same as "no provider", which is exactly what that component already
  // treats as "fail closed, not an administrator".
  AuthContext: {},
}));

import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";

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
  status: "booked",
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
      if (url.includes("/api/reservations/vehicle")) return json([]);
      if (url.includes("/api/documents/reservation")) return json([]);
      return json([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationViewDialog open onOpenChange={() => {}} reservationId={reservation.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setUser(UserRole.USER, []); // no MANAGE_EXPENSES
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReservationViewDialog — the maintenance-block add-expense button follows manage_expenses", () => {
  it("a denied user sees the button disabled and clicking it does not open the form", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-add-expense-maintenance-block");
    expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(button, { pointerEventsCheck: 0 });
    // The reservation-view dialog itself is `role="dialog"` and already open,
    // so "no dialog opened" means no SECOND dialog (the expense form) exists.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("an allowed user (manage_expenses) can still open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_EXPENSES]);
    renderDialog();
    const button = await screen.findByTestId("button-add-expense-maintenance-block");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

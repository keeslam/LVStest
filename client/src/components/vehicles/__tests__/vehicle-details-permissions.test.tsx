/**
 * 2026-09-21 review, follow-up (found by the re-reviewer): the "Add Expense"
 * tile on the vehicle detail screen's Expenses tab rendered `ExpenseAddDialog`
 * with no custom trigger, so its default button showed for every role that
 * can view a vehicle — same class of bug as the InvoiceScanner tile in
 * MaintenanceViewDialog. `POST /api/expenses` (server/routes/expenses.ts)
 * guards on MANAGE_EXPENSES, so the trigger is now
 * `RequiresPermission anyOf={[MANAGE_EXPENSES]}`, matching the sibling
 * pattern already used in `scan-panel.tsx` (`button-scan-expense`).
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

import { VehicleDetails } from "@/components/vehicles/vehicle-details";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

const vehicle = {
  id: 1,
  licensePlate: "AB-123-C",
  brand: "Volkswagen",
  model: "Golf",
  vehicleType: "car",
  status: "available",
  // Rendered unconditionally via `vehicle.createdAt.toString()` /
  // `vehicle.updatedAt.toString()` in the history card further down the
  // General tab (which Radix mounts alongside the active tab) — every other
  // date field on Vehicle tolerates undefined (formatDateNl never throws).
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderDetails() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      // Exact match only: `/api/vehicles/:id/blacklist` and other sub-routes
      // must fall through to the array default below, not this single object.
      if (path === `/api/vehicles/${vehicle.id}`) return json(vehicle);
      // These two queries use a raw `fetch` (not getQueryFn) and treat a 404
      // as "none" — an unmatched-but-200 `[]` leaves them holding a truthy
      // array with no `replacementReservation`, crashing the "acting as
      // spare" / "spare assigned" info cards.
      if (path === `/api/vehicles/${vehicle.id}/spare-assignment`) return json(null, 404);
      if (path === `/api/vehicles/${vehicle.id}/acting-as-spare`) return json(null, 404);
      return json([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <VehicleDetails vehicleId={vehicle.id} />
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

describe("VehicleDetails — the Expenses tab's add-expense tile follows manage_expenses", () => {
  it("a denied user sees the tile disabled and clicking it does not open the form", async () => {
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByRole("tab", { name: "Kosten" }));
    const button = await screen.findByTestId(`button-add-expense-${vehicle.id}`);
    expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(button, { pointerEventsCheck: 0 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an allowed user (manage_expenses) can open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_EXPENSES]);
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByRole("tab", { name: "Kosten" }));
    const button = await screen.findByTestId(`button-add-expense-${vehicle.id}`);
    expect(button).not.toBeDisabled();
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

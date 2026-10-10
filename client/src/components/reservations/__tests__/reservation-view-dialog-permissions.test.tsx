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

/**
 * Sub-project C, Task 5 (besluiten B-33, B-39): the cancel and delete openers of
 * this dialog follow the row. A rental that has been picked up needs the new
 * right `cancel_picked_up_rental` (the routes want it on top of
 * manage_reservations); every other row needs manage_reservations as before. The
 * delete confirmation then carries the warning and its tick, and the DELETE the
 * query flag the server insists on.
 */
describe("ReservationViewDialog - cancelling or deleting a picked-up rental (B-33)", () => {
  const rental = {
    id: 88, vehicleId: 1, customerId: 5, driverId: null, type: "standard", status: "picked_up",
    startDate: "2026-10-01", endDate: "2026-10-09", actualPickupDate: "2026-10-02", contractNumber: "9300001",
    pickupMileage: 61000, notes: null, portalRequestId: null,
  };
  let current: Record<string, unknown>;
  let deleteUrls: string[];
  let deleteResponse: (callIndex: number) => Response;

  function renderRental() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "DELETE" && url.includes(`/api/reservations/${rental.id}`)) {
          deleteUrls.push(url);
          return deleteResponse(deleteUrls.length - 1);
        }
        if (url.endsWith(`/api/reservations/${rental.id}`)) return json(current);
        if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
        if (url.includes("/cancel-impact")) return json({ transports: [], spares: [], placeholders: [], drivers: [] });
        return json([]);
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <ReservationViewDialog open onOpenChange={() => {}} reservationId={rental.id} />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    current = { ...rental };
    deleteUrls = [];
    deleteResponse = () => json({ message: "Reservation deleted successfully" });
  });

  it("without the new right both openers of a picked-up rental are switched off", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderRental();
    const cancel = await screen.findByTestId("button-cancel-reservation");
    const remove = screen.getByTestId("button-delete-reservation");
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(remove, { pointerEventsCheck: 0 });
    await userEvent.click(cancel, { pointerEventsCheck: 0 });
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(screen.queryByTestId("dialog-cancel-reservation")).toBeNull();
    expect(deleteUrls).toHaveLength(0);
  });

  it("the new right alone is not enough: the routes want manage_reservations too, so both openers are switched off with the reason instead of a generic 403", async () => {
    setUser(UserRole.USER, [UserPermission.CANCEL_PICKED_UP_RENTAL]);
    renderRental();
    const cancel = await screen.findByTestId("button-cancel-reservation");
    const remove = screen.getByTestId("button-delete-reservation");
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(remove, { pointerEventsCheck: 0 });
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(deleteUrls).toHaveLength(0);
  });

  it("with the right the delete asks first: the warning, a disabled confirm button, then DELETE with the flag", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS, UserPermission.CANCEL_PICKED_UP_RENTAL]);
    renderRental();
    const remove = await screen.findByTestId("button-delete-reservation");
    expect(remove).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("button-cancel-reservation")).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(remove);
    const warning = await screen.findByTestId("warning-picked-up");
    expect(warning).toHaveTextContent("Deze huur is al opgehaald op 02-10-2026 met contract 9300001.");
    // The recycle-bin wording replaces "permanent / kan niet ongedaan worden gemaakt".
    expect(screen.getByTestId("confirm-dialog-description")).toHaveTextContent("naar de prullenbak verplaatst");
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByTestId("checkbox-confirm-picked-up"));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(deleteUrls).toHaveLength(1));
    expect(deleteUrls[0]).toMatch(/\/api\/reservations\/88\?confirmPickedUp=true$/);
  });

  it("a booked rental needs only manage_reservations, shows no warning and sends no flag", async () => {
    current = { ...rental, status: "booked", actualPickupDate: null, contractNumber: null };
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderRental();
    const remove = await screen.findByTestId("button-delete-reservation");
    expect(remove).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("button-cancel-reservation")).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(remove);
    await screen.findByTestId("confirm-dialog");
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();
    await userEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(deleteUrls).toHaveLength(1));
    expect(deleteUrls[0]).toMatch(/\/api\/reservations\/88$/);
  });

  it("a stale row (read as booked, picked up meanwhile): the 409 reopens the question with the server's facts", async () => {
    current = { ...rental, status: "booked", actualPickupDate: null, contractNumber: null };
    deleteResponse = (callIndex) => callIndex === 0
      ? json({
          message: "This rental has already been picked up. Resend with confirmPickedUp: true to cancel or delete it.",
          code: "PICKED_UP_CONFIRMATION_REQUIRED", actualPickupDate: "2026-10-03", contractNumber: "9300777",
        }, 409)
      : json({ message: "Reservation deleted successfully" });
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS, UserPermission.CANCEL_PICKED_UP_RENTAL]);
    renderRental();

    await userEvent.click(await screen.findByTestId("button-delete-reservation"));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    const warning = await screen.findByTestId("warning-picked-up");
    expect(warning).toHaveTextContent("opgehaald op 03-10-2026 met contract 9300777");
    expect(screen.queryByText(/Resend with confirmPickedUp/)).toBeNull();

    await userEvent.click(screen.getByTestId("checkbox-confirm-picked-up"));
    await userEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(deleteUrls).toHaveLength(2));
    expect(deleteUrls[0]).toMatch(/\/api\/reservations\/88$/);
    expect(deleteUrls[1]).toMatch(/\/api\/reservations\/88\?confirmPickedUp=true$/);
  });
});

/**
 * Sub-project C, Task 5 fix round 1: the fiscal usage block of this dialog asks
 * GET /api/reservations/:id/usage-period, which needs view_fiscal and answers 404
 * for what is not a rental. Either answer reaches the global handler as the red
 * "Kon de gegevens niet laden" toast, so the dialog does not ask for a maintenance
 * block (never a rental) and the card does not ask without the right.
 */
describe("ReservationViewDialog - the fiscal usage block asks only where an answer is possible", () => {
  const usageRental = {
    id: 91, vehicleId: 1, customerId: 5, driverId: null, type: "standard", status: "booked",
    startDate: "2027-03-01", endDate: "2027-03-05", actualPickupDate: null, contractNumber: null, notes: null, portalRequestId: null,
  };
  const block = { ...reservation, id: 92, startDate: "2027-03-01", endDate: "2027-03-02", status: "booked" };
  let requested: string[];

  function renderRow(row: { id: number } & Record<string, unknown>) {
    requested = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if ((init?.method ?? "GET").toUpperCase() === "GET") requested.push(url);
        if (url.endsWith("/usage-period")) return json({ message: "No usage period" }, 404);
        if (url.endsWith(`/api/reservations/${row.id}`)) return json(row);
        if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
        return json([]);
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <ReservationViewDialog open onOpenChange={() => {}} reservationId={row.id} />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
  }

  it("does not mount the card, and so asks nothing, for a maintenance block", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_FISCAL]);
    renderRow(block);
    await screen.findByTestId("button-add-expense-maintenance-block");
    expect(requested.some((url) => url.includes("usage-period"))).toBe(false);
    expect(screen.queryByTestId("usage-no-period")).toBeNull();
    expect(screen.queryByTestId("usage-period-card")).toBeNull();
  });

  it("asks for a rental of 2027 when the account holds view_fiscal", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_FISCAL]);
    renderRow(usageRental);
    expect(await screen.findByTestId("usage-no-period")).toBeInTheDocument();
    expect(requested.some((url) => url.endsWith("/api/reservations/91/usage-period"))).toBe(true);
  });

  it("asks nothing and names the missing right when the account lacks view_fiscal", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS]);
    renderRow(usageRental);
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Fiscaal bekijken");
    expect(requested.some((url) => url.includes("usage-period"))).toBe(false);
  });

  it("names view_fiscal, not another fiscal right, for an account that only reviews", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_FISCAL_REVIEW]);
    renderRow(usageRental);
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Fiscaal bekijken");
    expect(requested.some((url) => url.includes("usage-period"))).toBe(false);
  });

  it("shows no no-access line on an old reservation (before 2027) for an account without view_fiscal", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS]);
    renderRow({ ...usageRental, id: 93, startDate: "2026-10-01", endDate: "2026-10-05" });
    // The dialog is loaded once its delete opener is there.
    await screen.findByTestId("button-delete-reservation");
    expect(screen.queryByTestId("no-data-access")).toBeNull();
    expect(screen.queryByTestId("usage-no-period")).toBeNull();
    expect(requested.some((url) => url.includes("usage-period"))).toBe(false);
  });
});

/**
 * besluiten.md B-32 aanvulling (2026-09-23) — the popup listing never-collected
 * bookings a month old. Covers the dialog's own behaviour in isolation; the
 * calendar's auto-open-once-per-session logic (sessionStorage) is covered in
 * `client/src/pages/reservations/__tests__/not-collected-auto-open.test.tsx`,
 * which renders the whole page the way `calendar-query-permissions.test.tsx`
 * already does.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole, type Reservation } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { NotCollectedDialog } from "@/components/reservations/not-collected-dialog";

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ROW = {
  id: 501,
  status: "booked",
  type: "standard",
  startDate: "2026-01-01",
  endDate: "2026-01-05",
  vehicle: { id: 1, brand: "Fiat", model: "Ducato", licensePlate: "E2E07G" },
  customer: { id: 1, name: "E2E Klant" },
} as unknown as Reservation;

let fetchMock: ReturnType<typeof vi.fn>;

function urlOf(input: unknown): string {
  return typeof input === "string" ? input : (input as Request)?.url ?? "";
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: any) => {
    if (urlOf(input).includes("/api/reservations/not-collected")) return json([ROW]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(onViewReservation: (reservation: Reservation) => void = () => {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotCollectedDialog open onOpenChange={() => {}} onViewReservation={onViewReservation} />
    </QueryClientProvider>,
  );
}

describe("NotCollectedDialog — B-32 aanvulling", () => {
  it("never fetches the list without view_reservations/manage_reservations", async () => {
    setUser(UserRole.USER, []);
    renderDialog();
    await screen.findByTestId("dialog-not-collected");
    // Give a disabled query a moment it would need to fire, if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock.mock.calls.some(([input]) => urlOf(input).includes("/api/reservations/not-collected"))).toBe(false);
  });

  it("renders each row with its plate and days since start", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS]);
    renderDialog();
    const row = await screen.findByTestId("not-collected-reservation-501");
    expect(row).toHaveTextContent("E2E07G");
    expect(row).toHaveTextContent(/dag(en)? geleden gestart/);
  });

  it("shows the empty state when the list has no rows", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS]);
    fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await screen.findByTestId("not-collected-empty");
    expect(screen.queryByTestId(/not-collected-reservation-/)).not.toBeInTheDocument();
  });

  it("disables the cancel button, with a reason, for a role without manage_reservations", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS]);
    renderDialog();
    const button = await screen.findByTestId("button-cancel-not-collected-501");
    expect(button).toHaveAttribute("aria-disabled", "true");
    const wrapper = button.parentElement as HTMLElement;
    wrapper.focus();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Reserveringen beheren");
    });
  });

  it("enables the cancel button for a role holding manage_reservations", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS]);
    renderDialog();
    const button = await screen.findByTestId("button-cancel-not-collected-501");
    expect(button).not.toBeDisabled();
  });

  it("calls onViewReservation with the row when its open button is clicked", async () => {
    setUser(UserRole.USER, [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS]);
    const onViewReservation = vi.fn();
    renderDialog(onViewReservation);
    const button = await screen.findByTestId("button-open-not-collected-501");
    await userEvent.click(button);
    expect(onViewReservation).toHaveBeenCalledWith(expect.objectContaining({ id: 501 }));
  });
});

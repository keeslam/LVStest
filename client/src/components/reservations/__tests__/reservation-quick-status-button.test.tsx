/**
 * `ReservationQuickStatusButton` — Task 4 (docs/superpowers/specs/2026-09-21-toegang-design.md,
 * §4), one of the "four dashboard controls Task 3 left" (task-3-report.md §8).
 * Reused on the dashboard (reservation-calendar.tsx) and on `/reservations`
 * (pages/reservations/calendar.tsx); its click ends in `PATCH
 * /api/reservations/:id/status`, guarded server-side by MANAGE_RESERVATIONS
 * alone (server/routes.ts:3846) — verified directly, not copied from the
 * fact sheet.
 *
 * Small enough to render standalone (a QueryClientProvider is only needed
 * because StatusChangeDialog declares its mutation unconditionally, even
 * while closed), so this is a real component test, not just an E2E proof.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole, type Reservation } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { ReservationQuickStatusButton } from "@/components/reservations/reservation-quick-status-button";

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

const pickedUpReservation = {
  id: 42,
  status: "picked_up",
  vehicle: { id: 1, brand: "Volkswagen", model: "Golf", licensePlate: "AB-123-C" },
  customer: { id: 1, name: "Jan Jansen" },
} as unknown as Reservation;

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReservationQuickStatusButton reservation={pickedUpReservation} />
    </QueryClientProvider>,
  );
}

describe("ReservationQuickStatusButton", () => {
  it("renders nothing for a reservation that is not picked_up, regardless of permission", () => {
    setUser(UserRole.ADMIN, []);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ReservationQuickStatusButton reservation={{ ...pickedUpReservation, status: "booked" } as unknown as Reservation} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is enabled for a user holding manage_reservations and opens the revert dialog", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    const user = userEvent.setup();
    renderButton();
    const button = screen.getByTestId("button-quick-status-42");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(await screen.findByRole("dialog")).toBeVisible();
  });

  it("is visible but disabled, and explains itself, for a user without manage_reservations", async () => {
    setUser(UserRole.USER, []);
    renderButton();
    const button = screen.getByTestId("button-quick-status-42");
    expect(button).toBeVisible();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Reserveringen beheren");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is allowed for role admin regardless of permissions", () => {
    setUser(UserRole.ADMIN, []);
    renderButton();
    expect(screen.getByTestId("button-quick-status-42")).not.toBeDisabled();
  });
});

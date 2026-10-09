/**
 * `ReservationQuickStatusButton` - the dashboard opener of the reversal dialog.
 *
 * Toegang Task 4 (docs/superpowers/specs/2026-09-21-toegang-design.md, §4) made
 * it a visible-but-disabled control; sub-project C, Task 4 (besluiten B-30, B-39)
 * moved its right from `manage_reservations` to the new `revert_handover` and
 * made it open the ONE `RevertHandoverDialog` (preview, then confirm) instead of
 * the old StatusChangeDialog, which is gone.
 *
 * Reused on the dashboard (reservation-calendar.tsx, upcoming-reservations.tsx).
 * A real component test, not just an E2E proof.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

let requestedUrls: string[];

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      requestedUrls.push(url);
      return new Response(
        JSON.stringify({
          fromStatus: "picked_up",
          toStatus: "booked",
          clears: ["contractNumber"],
          vehicle: { current: { mileage: 1000, fuel: null }, restoreTo: null, reason: "no_reading_stored" },
          documentsToMarkStale: [],
          requiresMileageConfirmation: false,
          warnings: ["no_reading_stored"],
          planHash: "h",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderButton(reservation: Reservation = pickedUpReservation) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReservationQuickStatusButton reservation={reservation} />
    </QueryClientProvider>,
  );
}

describe("ReservationQuickStatusButton", () => {
  it("renders nothing for a reservation that is not picked_up, regardless of permission", () => {
    setUser(UserRole.ADMIN, []);
    const { container } = renderButton({ ...pickedUpReservation, status: "booked" } as unknown as Reservation);
    expect(container).toBeEmptyDOMElement();
  });

  it("is enabled for a user holding revert_handover and opens the preview dialog, not a one-click revert", async () => {
    setUser(UserRole.USER, [UserPermission.REVERT_HANDOVER]);
    const user = userEvent.setup();
    renderButton();
    const button = screen.getByTestId("button-revert-handover-42");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(await screen.findByTestId("dialog-revert-handover")).toBeVisible();
    // The click only asked for the PREVIEW; nothing was written.
    await waitFor(() => expect(requestedUrls.some((url) => url.endsWith("/api/reservations/42/revert-preview"))).toBe(true));
    expect(requestedUrls.some((url) => url.endsWith("/api/reservations/42/revert"))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith("/api/reservations/42/status"))).toBe(false);
  });

  it("is visible but disabled, and names the right, for a user with manage_reservations but without revert_handover", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderButton();
    const button = screen.getByTestId("button-revert-handover-42");
    expect(button).toBeVisible();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Overdracht terugdraaien");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is allowed for role admin regardless of permissions", () => {
    setUser(UserRole.ADMIN, []);
    renderButton();
    expect(screen.getByTestId("button-revert-handover-42")).not.toBeDisabled();
  });
});

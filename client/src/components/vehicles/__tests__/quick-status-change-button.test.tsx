/**
 * The vehicle details opener of the reversal dialog (sub-project C, Task 4).
 *
 * It used to be an English, ungated "Revert Pickup to Booked" button that ran
 * its own dialog. It is now one Dutch control, wrapped in `revert_handover`,
 * that opens the ONE `RevertHandoverDialog` for the vehicle's picked-up rental.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { QuickStatusChangeButton } from "@/components/vehicles/quick-status-change-button";

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

let reservationsForVehicle: Array<Record<string, unknown>>;
let requestedUrls: string[];

beforeEach(() => {
  requestedUrls = [];
  reservationsForVehicle = [
    { id: 900, status: "picked_up", startDate: "2026-10-01", vehicle: { id: 7 }, customer: { id: 1 } },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      requestedUrls.push(url);
      if (url.endsWith("/api/reservations/vehicle/7")) {
        return new Response(JSON.stringify(reservationsForVehicle), { status: 200, headers: { "Content-Type": "application/json" } });
      }
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

function renderButton() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async ({ queryKey }) => (await fetch(queryKey[0] as string)).json(),
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickStatusChangeButton vehicleId={7} />
    </QueryClientProvider>,
  );
}

describe("QuickStatusChangeButton (voertuigdetails)", () => {
  it("is Dutch and opens the preview dialog for a user holding revert_handover", async () => {
    setUser(UserRole.USER, [UserPermission.REVERT_HANDOVER]);
    const user = userEvent.setup();
    renderButton();
    const button = await screen.findByTestId("button-revert-handover");
    expect(button).toHaveTextContent("Overdracht terugdraaien");
    expect(screen.queryByText(/Revert Pickup/)).not.toBeInTheDocument();
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(await screen.findByTestId("dialog-revert-handover")).toBeVisible();
    await waitFor(() => expect(requestedUrls.some((url) => url.endsWith("/api/reservations/900/revert-preview"))).toBe(true));
  });

  it("is visible but disabled, naming the right, without revert_handover", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_VEHICLES]);
    renderButton();
    const button = await screen.findByTestId("button-revert-handover");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Overdracht terugdraaien");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing when the vehicle has no picked-up rental", async () => {
    setUser(UserRole.ADMIN, []);
    reservationsForVehicle = [{ id: 901, status: "booked", startDate: "2026-10-01" }];
    const { container } = renderButton();
    await waitFor(() => expect(requestedUrls.some((url) => url.endsWith("/api/reservations/vehicle/7"))).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});

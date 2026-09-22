/**
 * Task 6b, finding 2 (task-6-report.md, "Findings for the owner") —
 * `SpareVehicleAssignmentsWidget` fired `["/api/customers"]` unconditionally;
 * the server guards that route with `VIEW_CUSTOMERS`/`MANAGE_CUSTOMERS`.
 * `cleaner` and `maintenance` (the E2E profiles without either) got a
 * "Kon de gegevens niet laden" toast on the dashboard.
 *
 * Unlike `RecentExpenses` (finding 2a), this widget is not useless without
 * customer data — it still lists TBD/upcoming/active spare vehicles, just
 * without the customer name next to each one (same as today when the request
 * fails: `allCustomers` stays undefined and the lookup map is empty). So only
 * the one query is gated; the widget itself keeps rendering.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { SpareVehicleAssignmentsWidget } from "@/components/dashboard/spare-vehicle-assignments-widget";

const CUSTOMERS_URL = "/api/customers";

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return requestUrl.includes(url);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finding 2b — /api/customers follows VIEW_CUSTOMERS/MANAGE_CUSTOMERS", () => {
  it("never asks for customers without VIEW_CUSTOMERS or MANAGE_CUSTOMERS, but keeps the widget", async () => {
    role = UserRole.CLEANER;
    permissions = [];
    withClient(<SpareVehicleAssignmentsWidget />);

    // The widget's other, always-allowed queries still settle.
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    expect(calledWith(CUSTOMERS_URL)).toBe(false);
    // The card itself is still there - only the customer lookup was refused.
    expect(await screen.findByText("Beheer vervangende voertuigen")).toBeInTheDocument();
  });

  it("asks for customers when the user holds VIEW_CUSTOMERS", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS];
    withClient(<SpareVehicleAssignmentsWidget />);

    await waitFor(() => expect(calledWith(CUSTOMERS_URL)).toBe(true));
  });

  it("admin gets the customers query too, permission list or not", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<SpareVehicleAssignmentsWidget />);

    await waitFor(() => expect(calledWith(CUSTOMERS_URL)).toBe(true));
  });
});

/**
 * Task 4 (docs/superpowers/specs/2026-09-21-toegang-design.md, §4) — one of
 * the "four dashboard controls Task 3 left" (task-3-report.md §8): every
 * action button in this widget ends in a mutation guarded server-side by
 * MANAGE_RESERVATIONS alone (`PATCH /api/reservations/:id/spare-status`,
 * server/routes.ts:4797 — the "assign vehicle" trigger only opens
 * SpareVehicleAssignmentDialog, but that dialog exists solely to reach the
 * same MANAGE_RESERVATIONS-guarded flow, so gating the trigger is the
 * B-27-equivalent of gating the dialog's own submit).
 */
describe("Task 4 — spare widget action buttons require manage_reservations", () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/placeholder-reservations/needing-assignment")) {
        return json([{ id: 1, startDate: "2026-09-25", endDate: "2026-09-27", placeholderSpare: true }]);
      }
      if (url.includes("/api/reservations")) {
        return json([
          { id: 2, type: "replacement", vehicleId: 10, status: "booked", spareVehicleStatus: "assigned", startDate: "2026-09-20" },
          { id: 3, type: "replacement", vehicleId: 11, status: "picked_up", spareVehicleStatus: "picked_up", startDate: "2026-09-18" },
        ]);
      }
      if (url.includes("/api/vehicles")) {
        return json([{ id: 10, brand: "Volkswagen", model: "Golf" }, { id: 11, brand: "Opel", model: "Corsa" }]);
      }
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows every action button visible-but-disabled for a role without manage_reservations", async () => {
    role = UserRole.USER;
    permissions = [];
    withClient(<SpareVehicleAssignmentsWidget />);

    const pendingAssign = await screen.findByTestId("button-assign-vehicle-spare");
    expect(pendingAssign).toBeVisible();
    expect(pendingAssign).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByText("Aankomend"));
    const startPickup = await screen.findByTestId("button-start-pickup-spare");
    expect(startPickup).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByText("Actief"));
    const markReturned = await screen.findByTestId("button-mark-returned-spare");
    expect(markReturned).toHaveAttribute("aria-disabled", "true");

    // Clicking through the (still visible) disabled controls opens nothing.
    await userEvent.click(pendingAssign);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enables the action buttons for a role holding manage_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_RESERVATIONS];
    withClient(<SpareVehicleAssignmentsWidget />);

    const pendingAssign = await screen.findByTestId("button-assign-vehicle-spare");
    expect(pendingAssign).not.toBeDisabled();

    await userEvent.click(screen.getByText("Aankomend"));
    expect(await screen.findByTestId("button-start-pickup-spare")).not.toBeDisabled();

    await userEvent.click(screen.getByText("Actief"));
    expect(await screen.findByTestId("button-mark-returned-spare")).not.toBeDisabled();
  });
});

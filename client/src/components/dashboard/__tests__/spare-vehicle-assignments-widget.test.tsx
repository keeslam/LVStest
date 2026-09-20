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
import { render, waitFor, screen } from "@testing-library/react";
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

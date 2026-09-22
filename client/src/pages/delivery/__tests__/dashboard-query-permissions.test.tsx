/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 11) — B-29 widened this page's own gate
 * to VIEW_RESERVATIONS/MANAGE_RESERVATIONS OR VIEW_VEHICLES/MANAGE_VEHICLES
 * (shared/page-access.ts), so a user can reach /delivery via vehicle rights
 * alone. `/api/reservations` (routes.ts:2829) still needs the reservation
 * family specifically - a real hole (the delivery-stats card is entirely
 * reservation-derived), so denied renders NoDataAccess there.
 * `/api/vehicles` (routes.ts:646) needs the vehicle family; only enriches
 * (`getVehicleInfo` falls back to "unknown", a name next to an id, same
 * pattern as the already-gated `/api/customers`) - left out silently.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.VIEW_RESERVATIONS];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import DeliveryDashboard from "@/pages/delivery/dashboard";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    const path = requestUrl.replace(/^https?:\/\/[^/]+/, "");
    return path === url || path.startsWith(`${url}?`);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/delivery", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("/delivery — reached via vehicle rights alone (B-29 widened gate)", () => {
  it("fires /api/vehicles and /api/transports, never /api/reservations, and shows NoDataAccess in the stats card", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_VEHICLES];
    withProviders(<DeliveryDashboard />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/transports")).toBe(true));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Reserveringen bekijken");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/reservations")).toBe(false);
  });
});

describe("/delivery — reached via reservation rights alone", () => {
  it("fires /api/reservations and /api/transports, never /api/vehicles, no NoDataAccess in the stats card", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    withProviders(<DeliveryDashboard />);

    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    await waitFor(() => expect(calledWith("/api/transports")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
  });
});

describe("/delivery — admin", () => {
  it("gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<DeliveryDashboard />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    await waitFor(() => expect(calledWith("/api/transports")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

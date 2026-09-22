/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 6) — the page's own permission is
 * VIEW_RESERVATIONS/MANAGE_RESERVATIONS; its `/api/vehicles` query (the
 * vehicle search/type/availability filter above the calendar) needs the
 * vehicle family instead (GET /api/vehicles, routes.ts:646). With no filter
 * applied (the default) the calendar's own day cells still show every
 * reservation regardless of this data - enrichment only, so denied is
 * silent, no NoDataAccess.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

import ReservationCalendarPage from "@/pages/reservations/calendar";

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
  const { hook } = memoryLocation({ path: "/reservations", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("/reservations — /api/vehicles follows view_vehicles/manage_vehicles, not the page's own gate", () => {
  it("fires /api/reservations/range but never /api/vehicles without either vehicle permission", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    withProviders(<ReservationCalendarPage />);

    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
  });

  it("fires /api/vehicles with view_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS, UserPermission.VIEW_VEHICLES];
    withProviders(<ReservationCalendarPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
  });

  it("admin gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<ReservationCalendarPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
  });
});

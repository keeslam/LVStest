/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 7) — the page's own permission is
 * MANAGE_MAINTENANCE, but NONE of its GETs accept it: four need
 * VIEW_VEHICLES/MANAGE_VEHICLES (/api/vehicles, /api/vehicles/apk-expiring,
 * /api/vehicles/warranty-expiring, /api/vehicles/service-due), three need
 * VIEW_RESERVATIONS/MANAGE_RESERVATIONS (/api/reservations/range twice via
 * select, /api/reservations for completed blocks). Per the task brief, a
 * manage_maintenance-only account (no vehicle/reservation view rights) is
 * meant to see NoDataAccess here - the honest outcome, not a server change.
 * /api/app-settings/key/calendar_settings and /api/system-settings are
 * requireAuth only and stay unconditional.
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
let permissions: string[] = [UserPermission.MANAGE_MAINTENANCE];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import MaintenanceCalendarPage from "@/pages/maintenance/calendar";

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
  const { hook } = memoryLocation({ path: "/maintenance", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const VEHICLE_URLS = ["/api/vehicles", "/api/vehicles/apk-expiring", "/api/vehicles/warranty-expiring", "/api/vehicles/service-due"];

describe("/maintenance — a manage_maintenance-only account sees NoDataAccess (honest outcome, spec §3)", () => {
  it("fires neither vehicle nor reservation queries, and shows two NoDataAccess lines, with manage_maintenance alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_MAINTENANCE];
    withProviders(<MaintenanceCalendarPage />);

    // requireAuth-only settings queries still fire (page-agnostic).
    await waitFor(() => expect(calledWith("/api/system-settings")).toBe(true));

    const holes = await screen.findAllByTestId("no-data-access");
    expect(holes).toHaveLength(2);
    expect(holes.some((el) => el.textContent?.includes("Voertuigen bekijken"))).toBe(true);
    expect(holes.some((el) => el.textContent?.includes("Reserveringen bekijken"))).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const url of VEHICLE_URLS) expect(calledWith(url)).toBe(false);
    expect(calledWith("/api/reservations")).toBe(false);
    expect(calledWith("/api/reservations/range")).toBe(false);
  });

  it("shows only the reservations NoDataAccess line with manage_maintenance + view_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES];
    withProviders(<MaintenanceCalendarPage />);

    for (const url of VEHICLE_URLS) {
      await waitFor(() => expect(calledWith(url)).toBe(true));
    }
    const holes = await screen.findAllByTestId("no-data-access");
    expect(holes).toHaveLength(1);
    expect(holes[0].textContent).toContain("Reserveringen bekijken");
  });

  it("shows only the vehicles NoDataAccess line with manage_maintenance + view_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_RESERVATIONS];
    withProviders(<MaintenanceCalendarPage />);

    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    const holes = await screen.findAllByTestId("no-data-access");
    expect(holes).toHaveLength(1);
    expect(holes[0].textContent).toContain("Voertuigen bekijken");
  });

  it("shows no NoDataAccess and renders the calendar grid with both families held", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS];
    withProviders(<MaintenanceCalendarPage />);

    for (const url of VEHICLE_URLS) {
      await waitFor(() => expect(calledWith(url)).toBe(true));
    }
    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });

  it("admin gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<MaintenanceCalendarPage />);

    for (const url of VEHICLE_URLS) {
      await waitFor(() => expect(calledWith(url)).toBe(true));
    }
    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

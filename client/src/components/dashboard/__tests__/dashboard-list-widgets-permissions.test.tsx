/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3) — the
 * dashboard's own permission is VIEW_DASHBOARD; none of these four cards'
 * own queries accept it (fact sheet, PAGE x PERMISSION TABLE, row 1). Each
 * card IS its own visible hole (the whole list), so a denied user sees
 * NoDataAccess instead of the list/table, never a spinner or a toast.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { VehicleAvailabilityWidget } from "@/components/dashboard/vehicle-availability-widget";
import { ApkExpirationWidget } from "@/components/dashboard/apk-expiration-widget";
import { OverdueReservationsWidget } from "@/components/dashboard/overdue-reservations-widget";
import { WarrantyExpirationWidget } from "@/components/dashboard/warranty-expiration-widget";
import { UpcomingReservations } from "@/components/dashboard/upcoming-reservations";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
let requestedUrls: string[];

beforeEach(() => {
  requestedUrls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    requestedUrls.push(url);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  // WarrantyExpirationWidget reads useGlobalDialog (to open the vehicle
  // details dialog); the other four widgets in this file do not need it but
  // tolerate the extra provider fine.
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{node}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

function calledWith(url: string): boolean {
  return requestedUrls.some((requested) => requested.includes(url));
}

describe.each([
  { name: "VehicleAvailabilityWidget", Component: VehicleAvailabilityWidget, url: "/api/vehicles/available", permission: UserPermission.VIEW_VEHICLES, other: UserPermission.VIEW_RESERVATIONS },
  { name: "ApkExpirationWidget", Component: ApkExpirationWidget, url: "/api/vehicles/apk-expiring", permission: UserPermission.VIEW_VEHICLES, other: UserPermission.VIEW_RESERVATIONS },
  { name: "WarrantyExpirationWidget", Component: WarrantyExpirationWidget, url: "/api/vehicles/warranty-expiring", permission: UserPermission.VIEW_VEHICLES, other: UserPermission.VIEW_RESERVATIONS },
  { name: "OverdueReservationsWidget", Component: OverdueReservationsWidget, url: "/api/reservations/overdue", permission: UserPermission.VIEW_RESERVATIONS, other: UserPermission.VIEW_VEHICLES },
  { name: "UpcomingReservations", Component: UpcomingReservations, url: "/api/reservations/upcoming", permission: UserPermission.VIEW_RESERVATIONS, other: UserPermission.VIEW_VEHICLES },
])("$name — its own data needs a permission other than VIEW_DASHBOARD", ({ Component, url, permission, other }) => {
  it("fires no request and shows NoDataAccess for a user with only an unrelated permission", async () => {
    role = UserRole.USER;
    permissions = [other];
    withClient(<Component />);

    expect(await screen.findByTestId("no-data-access")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith(url)).toBe(false);
  });

  it("fires the request and does not show NoDataAccess once the right permission is held", async () => {
    role = UserRole.USER;
    permissions = [permission];
    withClient(<Component />);

    await waitFor(() => expect(calledWith(url)).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });

  it("admin gets the query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<Component />);

    await waitFor(() => expect(calledWith(url)).toBe(true));
  });
});

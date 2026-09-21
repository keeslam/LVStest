/**
 * Additional fault surfaced by removing the `test.fixme()` in
 * `e2e/layer-a/pages.spec.ts` (task-6b): `NotificationCenterDialog` is always
 * mounted by `NotificationCenter` (only its own `<Dialog open={open}>`
 * decides visibility - the component function, and every one of its
 * `useQuery` calls, still runs on every page). Two of those queries repeat
 * finding 1's and finding 2b's class of bug (task-6-report.md):
 *
 *  - `["/api/custom-notifications"]` is guarded server-side by
 *    MANAGE_NOTIFICATIONS alone (server/routes/custom-notifications.ts:14),
 *    same as finding 1's `/unread` variant, but was still fired
 *    unconditionally from here even after `NotificationCenter` itself was
 *    fixed.
 *  - `["/api/customers"]` is guarded by VIEW_CUSTOMERS/MANAGE_CUSTOMERS,
 *    same permission pair as finding 2b, and `cleaner`/`maintenance` (E2E
 *    profiles) hold neither.
 *
 * Both fired on every single page (this dialog is rendered by MainLayout's
 * header on every authenticated screen), so this reproduces finding 1's
 * "every page" symptom for a second, independent query.
 *
 * Task 2 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2) found the
 * remaining six queries in this same file still unconditional (the task-6b
 * fix above only covered two of eight) - including the one this file used as
 * its own "always allowed" sentinel (`/api/vehicles`). This is the identical
 * bug class the task brief names for `notification-center.tsx`, just an
 * overlooked sibling: this dialog is part of the same always-mounted header
 * widget (MainLayout -> NotificationCenter -> NotificationCenterDialog), so
 * it gets the same gating, verified against the same server routes.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";

const NOTIFICATIONS_URL = "/api/custom-notifications";
const CUSTOMERS_URL = "/api/customers";
const VEHICLES_URL = "/api/vehicles";
const APK_URL = "/api/vehicles/apk-expiring";
const WARRANTY_URL = "/api/vehicles/warranty-expiring";
const UPCOMING_URL = "/api/reservations/upcoming";
const UPCOMING_MAINTENANCE_URL = "/api/reservations/upcoming-maintenance";
const NEEDING_ASSIGNMENT_URL = "/api/placeholder-reservations/needing-assignment";
const ALL_GATED_URLS = [
  NOTIFICATIONS_URL, CUSTOMERS_URL, VEHICLES_URL, APK_URL, WARRANTY_URL, UPCOMING_URL, UPCOMING_MAINTENANCE_URL, NEEDING_ASSIGNMENT_URL,
];

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{node}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    // Exact-prefix match: "/api/vehicles" must not match
    // "/api/vehicles/apk-expiring" or vice versa.
    return requestUrl === url || requestUrl.startsWith(`${url}?`);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationCenterDialog always mounts - its own queries need their own gates", () => {
  it("never asks for custom notifications or customers without the matching permission", async () => {
    role = UserRole.CLEANER;
    // VIEW_VEHICLES here only proves the component is not starved - the
    // point of this test is the MANAGE_NOTIFICATIONS/VIEW_CUSTOMERS gates.
    permissions = [UserPermission.VIEW_VEHICLES];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(VEHICLES_URL)).toBe(true));
    expect(calledWith(NOTIFICATIONS_URL)).toBe(false);
    expect(calledWith(CUSTOMERS_URL)).toBe(false);
  });

  it("asks for custom notifications when the user holds MANAGE_NOTIFICATIONS", async () => {
    role = UserRole.MANAGER;
    permissions = [UserPermission.MANAGE_NOTIFICATIONS];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(NOTIFICATIONS_URL)).toBe(true));
  });

  it("asks for customers when the user holds VIEW_CUSTOMERS", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(CUSTOMERS_URL)).toBe(true));
  });

  it("admin gets both queries, permission list or not", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(NOTIFICATIONS_URL)).toBe(true));
    expect(calledWith(CUSTOMERS_URL)).toBe(true);
  });
});

describe("Task 2 — the remaining six queries in this dialog also follow their own route's permission", () => {
  it("a user with no permissions at all triggers none of the eight gated queries", async () => {
    role = UserRole.USER;
    permissions = [];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    // Proof the dialog function still ran (not just "nothing fired because
    // it crashed"): render a page and re-query the DOM for something this
    // component always puts there regardless of permissions is not available
    // here (it renders no visible chrome while closed) - give pending
    // effects/microtasks a tick instead, matching notification-center.test.tsx.
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const url of ALL_GATED_URLS) expect(calledWith(url)).toBe(false);
  });

  it("VIEW_VEHICLES asks for /api/vehicles and apk/warranty data, not reservation data", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_VEHICLES];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(VEHICLES_URL)).toBe(true));
    await waitFor(() => expect(calledWith(APK_URL)).toBe(true));
    await waitFor(() => expect(calledWith(WARRANTY_URL)).toBe(true));
    expect(calledWith(UPCOMING_URL)).toBe(false);
    expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(false);
    expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(false);
  });

  it("VIEW_RESERVATIONS asks for reservation data, not vehicle data", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(UPCOMING_URL)).toBe(true));
    await waitFor(() => expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(true));
    await waitFor(() => expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(true));
    expect(calledWith(VEHICLES_URL)).toBe(false);
    expect(calledWith(APK_URL)).toBe(false);
    expect(calledWith(WARRANTY_URL)).toBe(false);
  });

  it("upcoming-maintenance also opens for MANAGE_MAINTENANCE alone (3-way OR, routes.ts:2659)", async () => {
    role = UserRole.MAINTENANCE;
    permissions = [UserPermission.MANAGE_MAINTENANCE];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(true));
    expect(calledWith(UPCOMING_URL)).toBe(false);
    expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(false);
  });

  it("admin gets every gated query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    for (const url of ALL_GATED_URLS) {
      await waitFor(() => expect(calledWith(url)).toBe(true));
    }
  });
});

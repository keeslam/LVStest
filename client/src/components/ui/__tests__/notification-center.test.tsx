/**
 * Task 6b, finding 1 (task-6-report.md, "Findings for the owner") —
 * `NotificationCenter` is rendered by `MainLayout` on every authenticated
 * page and fired `useQuery({ queryKey: ["/api/custom-notifications/unread"] })`
 * unconditionally. The server guards that route with `MANAGE_NOTIFICATIONS`
 * alone (server/routes/custom-notifications.ts:27); five of the seven E2E
 * roles lack it, so every page produced a "Kon de gegevens niet laden" toast
 * for them. The fix mirrors `PortalAlertChip`'s `enabled: canView` gate.
 *
 * Task 2 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2; fact
 * sheet, "Global (every page, via MainLayout)") does the same for the
 * component's other five unconditional queries — each gated with exactly
 * the permission(s) its own server route accepts (verified against
 * server/routes.ts directly, not just the fact sheet, since its line
 * numbers may have drifted):
 *   - /api/vehicles/apk-expiring       -> VIEW_VEHICLES, MANAGE_VEHICLES (routes.ts:486)
 *   - /api/vehicles/warranty-expiring  -> VIEW_VEHICLES, MANAGE_VEHICLES (routes.ts:505)
 *   - /api/reservations/upcoming       -> VIEW_RESERVATIONS, MANAGE_RESERVATIONS (routes.ts:2649)
 *   - /api/reservations/upcoming-maintenance -> VIEW_RESERVATIONS, MANAGE_RESERVATIONS, MANAGE_MAINTENANCE (routes.ts:2659)
 *   - /api/placeholder-reservations/needing-assignment -> VIEW_RESERVATIONS, MANAGE_RESERVATIONS (routes.ts:5406)
 * After this change every one of the component's six queries is permission-
 * gated, so there is no longer a single URL "every role is allowed to make" -
 * the button itself (data-testid="button-notification-center") is the mount
 * proof used instead where a test needs one.
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

import { NotificationCenter } from "@/components/ui/notification-center";

const UNREAD_URL = "/api/custom-notifications/unread";
const APK_URL = "/api/vehicles/apk-expiring";
const WARRANTY_URL = "/api/vehicles/warranty-expiring";
const UPCOMING_URL = "/api/reservations/upcoming";
const UPCOMING_MAINTENANCE_URL = "/api/reservations/upcoming-maintenance";
const NEEDING_ASSIGNMENT_URL = "/api/placeholder-reservations/needing-assignment";
const ALL_GATED_URLS = [UNREAD_URL, APK_URL, WARRANTY_URL, UPCOMING_URL, UPCOMING_MAINTENANCE_URL, NEEDING_ASSIGNMENT_URL];

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
    // Exact-prefix match, not a bare substring: "/api/reservations/upcoming"
    // must not match "/api/reservations/upcoming-maintenance" (a real
    // conflict between two of this component's own query keys).
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

describe("finding 1 — /api/custom-notifications/unread follows MANAGE_NOTIFICATIONS", () => {
  it("never asks for unread notifications without MANAGE_NOTIFICATIONS", async () => {
    role = UserRole.USER;
    // VIEW_VEHICLES here only proves the component is not starved (its own
    // apk-expiring query still fires) — the point of the test is the
    // MANAGE_NOTIFICATIONS gate specifically.
    permissions = [UserPermission.VIEW_VEHICLES];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(APK_URL)).toBe(true));
    expect(calledWith(UNREAD_URL)).toBe(false);
  });

  it("asks for unread notifications when the user holds MANAGE_NOTIFICATIONS", async () => {
    role = UserRole.MANAGER;
    permissions = [UserPermission.MANAGE_NOTIFICATIONS];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(UNREAD_URL)).toBe(true));
  });

  it("admin gets the notifications query too, permission list or not", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(UNREAD_URL)).toBe(true));
  });
});

describe("Task 2 — the other five header queries follow their own route's permission", () => {
  it("a user with no permissions at all triggers none of the six gated queries", async () => {
    role = UserRole.USER;
    permissions = [];
    withClient(<NotificationCenter />);

    // Proof the component still mounted correctly (not just "nothing fired
    // because it crashed"): the bell button is there.
    expect(await screen.findByTestId("button-notification-center")).toBeInTheDocument();

    // No positive signal to wait on here by design (every query is gated) -
    // give pending effects/microtasks a tick, then check nothing fired.
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const url of ALL_GATED_URLS) expect(calledWith(url)).toBe(false);
  });

  it("VIEW_VEHICLES asks for apk/warranty data, not reservation data", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_VEHICLES];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(APK_URL)).toBe(true));
    await waitFor(() => expect(calledWith(WARRANTY_URL)).toBe(true));
    expect(calledWith(UPCOMING_URL)).toBe(false);
    expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(false);
    expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(false);
  });

  it("MANAGE_VEHICLES (not just VIEW_VEHICLES) also opens apk/warranty data", async () => {
    role = UserRole.MANAGER;
    permissions = [UserPermission.MANAGE_VEHICLES];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(APK_URL)).toBe(true));
    await waitFor(() => expect(calledWith(WARRANTY_URL)).toBe(true));
  });

  it("VIEW_RESERVATIONS asks for reservation data, not vehicle data", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(UPCOMING_URL)).toBe(true));
    await waitFor(() => expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(true));
    await waitFor(() => expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(true));
    expect(calledWith(APK_URL)).toBe(false);
    expect(calledWith(WARRANTY_URL)).toBe(false);
  });

  it("upcoming-maintenance also opens for MANAGE_MAINTENANCE alone (3-way OR, routes.ts:2659), unlike upcoming/needing-assignment", async () => {
    role = UserRole.MAINTENANCE;
    permissions = [UserPermission.MANAGE_MAINTENANCE];
    withClient(<NotificationCenter />);

    await waitFor(() => expect(calledWith(UPCOMING_MAINTENANCE_URL)).toBe(true));
    expect(calledWith(UPCOMING_URL)).toBe(false);
    expect(calledWith(NEEDING_ASSIGNMENT_URL)).toBe(false);
  });

  it("admin gets every header query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<NotificationCenter />);

    for (const url of ALL_GATED_URLS) {
      await waitFor(() => expect(calledWith(url)).toBe(true));
    }
  });
});

/**
 * Task 6b, finding 1 (task-6-report.md, "Findings for the owner") —
 * `NotificationCenter` is rendered by `MainLayout` on every authenticated
 * page and fired `useQuery({ queryKey: ["/api/custom-notifications/unread"] })`
 * unconditionally. The server guards that route with `MANAGE_NOTIFICATIONS`
 * alone (server/routes/custom-notifications.ts:27); five of the seven E2E
 * roles lack it, so every page produced a "Kon de gegevens niet laden" toast
 * for them. The fix mirrors `PortalAlertChip`'s `enabled: canView` gate.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
const ALWAYS_ALLOWED_URL = "/api/vehicles/apk-expiring";

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

describe("finding 1 — /api/custom-notifications/unread follows MANAGE_NOTIFICATIONS", () => {
  it("never asks for unread notifications without MANAGE_NOTIFICATIONS", async () => {
    role = UserRole.USER;
    permissions = [];
    withClient(<NotificationCenter />);

    // Wait for a query every role is allowed to make, so a gate that
    // accidentally blocks everything would not pass this test by starving.
    await waitFor(() => expect(calledWith(ALWAYS_ALLOWED_URL)).toBe(true));
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

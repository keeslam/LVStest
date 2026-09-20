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

import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";

const NOTIFICATIONS_URL = "/api/custom-notifications";
const CUSTOMERS_URL = "/api/customers";
const ALWAYS_ALLOWED_URL = "/api/vehicles";

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
    // Exact-prefix match: "/api/custom-notifications" must not match
    // "/api/custom-notifications/unread" or vice versa.
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
    permissions = [];
    withClient(<NotificationCenterDialog open={false} onOpenChange={() => {}} />);

    await waitFor(() => expect(calledWith(ALWAYS_ALLOWED_URL)).toBe(true));
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

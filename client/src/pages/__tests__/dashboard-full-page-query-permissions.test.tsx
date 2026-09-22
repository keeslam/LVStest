/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3) — an
 * extra, whole-page safety net on top of the individual widget tests
 * (client/src/components/dashboard/__tests__/*): renders the actual
 * dashboard page (client/src/pages/dashboard.tsx, all nine widgets
 * together, same composition MainLayout mounts at "/") for a user holding
 * only VIEW_DASHBOARD (the new e2e `reports-only` profile's own shape) and
 * proves NOT ONE unexpected /api/ request fires - this is exactly the class
 * of bug this task's RED e2e run caught (every dashboard widget 403ing for
 * `reports-only`), and exactly the class of bug found and fixed along the
 * way in maintenance-edit-dialog.tsx (an unconditionally-mounted dialog
 * with one query that had no `enabled` gate at all).
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
let permissions: string[] = [UserPermission.VIEW_DASHBOARD];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import Dashboard from "@/pages/dashboard";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let requestedUrls: string[];

function calledWith(url: string): boolean {
  return requestedUrls.some((requested) => {
    const path = requested.replace(/^https?:\/\/[^/]+/, "");
    return path === url || path.startsWith(`${url}?`);
  });
}

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    requestedUrls.push(url);
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

// Every route any dashboard widget is allowed to call with VIEW_DASHBOARD
// alone - none, since no widget's own query accepts VIEW_DASHBOARD (fact
// sheet, PAGE x PERMISSION TABLE row 1). /api/app-settings/key/calendar_settings
// and /api/system-settings are requireAuth only and stay unconditional.
const ALWAYS_ALLOWED = ["/api/app-settings/key/calendar_settings", "/api/system-settings"];

describe("Dashboard (full page) — a view_dashboard-only user (the reports-only shape) triggers no other family's query", () => {
  it("fires nothing but requireAuth-only settings routes, and every widget shows NoDataAccess where it has a list to show", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_DASHBOARD];
    withProviders(<Dashboard />);

    // Proof the page actually mounted its widgets (not just an early return).
    const holes = await screen.findAllByTestId("no-data-access");
    expect(holes.length).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const unexpected = requestedUrls.filter((url) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      return !ALWAYS_ALLOWED.includes(path);
    });
    expect(unexpected, `unexpected requests: ${JSON.stringify(unexpected)}`).toEqual([]);
  });

  it("admin fires every widget's query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<Dashboard />);

    await waitFor(() => expect(calledWith("/api/vehicles/available")).toBe(true));
    await waitFor(() => expect(calledWith("/api/vehicles/apk-expiring")).toBe(true));
    await waitFor(() => expect(calledWith("/api/vehicles/warranty-expiring")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations/overdue")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations/upcoming")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations/range")).toBe(true));
    await waitFor(() => expect(calledWith("/api/placeholder-reservations/needing-assignment")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

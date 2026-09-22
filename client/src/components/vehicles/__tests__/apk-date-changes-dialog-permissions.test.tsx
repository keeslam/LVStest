/**
 * Task 2 finding, fixed here (Task 5, docs/superpowers/specs/
 * 2026-09-21-toegang-design.md, §3) — `ApkDateChangesDialog` is mounted in
 * `client/src/App.tsx` for every logged-in user (`{user && <ApkDateChangesDialog
 * />}`, alongside `ProtectedRoute`, not nested inside `MainLayout`), so its
 * `/api/apk-date-changes` query used to fire regardless of which page or
 * permission-gate was showing — including the no-access page. The whole
 * router mounts behind VIEW_VEHICLES/MANAGE_VEHICLES (server/index.ts:419).
 *
 * The RED e2e run for the new `reports-only` profile
 * (view_dashboard/view_reports only) caught this directly: every page it
 * visited fired `GET /api/apk-date-changes -> 403`.
 *
 * This dialog is an opt-in "review pending changes" notification, not a
 * visible list on any screen - denied is simply silent (no NoDataAccess).
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
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { ApkDateChangesDialog } from "@/components/vehicles/apk-date-changes-dialog";

const URL = "/api/apk-date-changes";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return requestUrl.includes(url);
  });
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("ApkDateChangesDialog — its query follows view_vehicles/manage_vehicles, not just being logged in", () => {
  it("never asks for pending APK-date changes without view_vehicles or manage_vehicles", async () => {
    role = UserRole.USER;
    permissions = [];
    withClient(<ApkDateChangesDialog />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith(URL)).toBe(false);
  });

  it("asks for pending changes with view_vehicles alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_VEHICLES];
    withClient(<ApkDateChangesDialog />);

    await waitFor(() => expect(calledWith(URL)).toBe(true));
  });

  it("asks for pending changes with manage_vehicles alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_VEHICLES];
    withClient(<ApkDateChangesDialog />);

    await waitFor(() => expect(calledWith(URL)).toBe(true));
  });

  it("admin gets the query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<ApkDateChangesDialog />);

    await waitFor(() => expect(calledWith(URL)).toBe(true));
  });
});

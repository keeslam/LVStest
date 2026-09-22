/**
 * Task 6b, finding 2 (task-6-report.md, "Findings for the owner") —
 * `RecentExpenses` fired `["/api/expenses/recent", { limit: 10 }]`
 * unconditionally; the server guards that route with `MANAGE_EXPENSES` alone.
 * `user`, `cleaner`, `viewer` and `maintenance` (the E2E profiles without it)
 * got a "Kon de gegevens niet laden" toast on the dashboard for a card they
 * cannot see data on anyway.
 *
 * Brought into line with the spec's §3 pattern
 * (docs/superpowers/specs/2026-09-21-toegang-design.md) and its sibling tabs
 * in reports/index.tsx: the card stays, its header stays, and the body shows
 * `NoDataAccess` instead of an empty or broken state (an empty "no recent
 * expenses" card would misrepresent "not allowed" as "there are none").
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

import { RecentExpenses } from "@/components/dashboard/recent-expenses";

const EXPENSES_URL = "/api/expenses/recent";

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

describe("finding 2a — /api/expenses/recent follows MANAGE_EXPENSES", () => {
  it("never asks for recent expenses without MANAGE_EXPENSES, and shows NoDataAccess instead", async () => {
    role = UserRole.CLEANER;
    permissions = [];
    const { getByTestId } = withClient(<RecentExpenses />);

    // Give the disabled query a tick to (not) settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith(EXPENSES_URL)).toBe(false);
    expect(getByTestId("no-data-access")).toBeTruthy();
  });

  it("asks for recent expenses when the user holds MANAGE_EXPENSES", async () => {
    role = UserRole.ACCOUNTANT;
    permissions = [UserPermission.MANAGE_EXPENSES];
    const { queryByTestId } = withClient(<RecentExpenses />);

    await waitFor(() => expect(calledWith(EXPENSES_URL)).toBe(true));
    expect(queryByTestId("no-data-access")).toBeNull();
  });

  it("admin gets the card too, permission list or not", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<RecentExpenses />);

    await waitFor(() => expect(calledWith(EXPENSES_URL)).toBe(true));
  });
});

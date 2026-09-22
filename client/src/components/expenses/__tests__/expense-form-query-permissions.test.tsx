/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 9 / §1 "/expenses/add") — this form is
 * only reachable by a user who already holds MANAGE_EXPENSES (the
 * /expenses/add page's own gate, and every dialog embedding this form is
 * gated the same way), but its `/api/vehicles` query needs the vehicle
 * family instead (GET /api/vehicles, routes.ts:646). The vehicle picker is a
 * REQUIRED field (you cannot log an expense without choosing a vehicle) -
 * a real visible hole, so denied renders NoDataAccess in its place.
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
let permissions: string[] = [UserPermission.MANAGE_EXPENSES];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { ExpenseForm } from "@/components/expenses/expense-form";

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
  const { hook } = memoryLocation({ path: "/expenses/add", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("ExpenseForm — /api/vehicles follows view_vehicles/manage_vehicles, not manage_expenses", () => {
  it("shows NoDataAccess in the vehicle field and fires no /api/vehicles request without either vehicle permission", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EXPENSES];
    withProviders(<ExpenseForm />);

    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Voertuigen bekijken");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
  });

  it("renders the vehicle selector and fires /api/vehicles with view_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EXPENSES, UserPermission.VIEW_VEHICLES];
    withProviders(<ExpenseForm />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });

  it("admin gets the query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<ExpenseForm />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
  });
});

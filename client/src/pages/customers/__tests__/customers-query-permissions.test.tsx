/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 4) — the page's own permission is
 * VIEW_CUSTOMERS/MANAGE_CUSTOMERS; its `/api/reservations` query
 * (rental-count/last-rental stats per row) needs the reservation family
 * instead (GET /api/reservations, routes.ts:2829). Enrichment only - the
 * customer list itself comes from `/api/customers`, unaffected - so denied
 * is silent, no NoDataAccess.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.VIEW_CUSTOMERS];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import CustomersIndex from "@/pages/customers/index";

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
  const { hook } = memoryLocation({ path: "/customers", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>,
  );
}

describe("/customers — /api/reservations follows view_reservations/manage_reservations, not the page's own gate", () => {
  it("fires /api/customers and /api/drivers but never /api/reservations without either reservation permission", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS];
    withProviders(<CustomersIndex />);

    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
    await waitFor(() => expect(calledWith("/api/drivers")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/reservations")).toBe(false);
  });

  it("fires /api/reservations with view_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.VIEW_RESERVATIONS];
    withProviders(<CustomersIndex />);

    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
  });

  it("admin gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<CustomersIndex />);

    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
  });
});

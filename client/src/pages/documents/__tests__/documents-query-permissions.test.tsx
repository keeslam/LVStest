/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 10) — the page's own permission is
 * VIEW_DOCUMENTS/MANAGE_DOCUMENTS; its `/api/vehicles` query (filter
 * dropdown, upload-dialog selector, per-group vehicle name) needs the
 * vehicle family instead (GET /api/vehicles, routes.ts:646). Enrichment
 * only - the document list itself comes from `/api/documents`, unaffected -
 * so denied is silent, no NoDataAccess.
 *
 * Not touched here (reported, not fixed): `/api/barcode-label-templates`
 * (documents/index.tsx) has NO permission guard server-side at all
 * (requireAuth only, server/routes/report-and-label-templates.ts) - there is
 * no "other family" to gate against, and it never 403s, so it is a server
 * audit finding (Task 6), not a Task 5 client gate.
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
let permissions: string[] = [UserPermission.VIEW_DOCUMENTS];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import DocumentsIndex from "@/pages/documents/index";

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
  const { hook } = memoryLocation({ path: "/documents", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>,
  );
}

describe("/documents — /api/vehicles follows view_vehicles/manage_vehicles, not the page's own gate", () => {
  it("fires /api/documents but never /api/vehicles without either vehicle permission", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_DOCUMENTS];
    withProviders(<DocumentsIndex />);

    await waitFor(() => expect(calledWith("/api/documents")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
  });

  it("fires /api/vehicles with view_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_DOCUMENTS, UserPermission.VIEW_VEHICLES];
    withProviders(<DocumentsIndex />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
  });

  it("admin gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withProviders(<DocumentsIndex />);

    await waitFor(() => expect(calledWith("/api/documents")).toBe(true));
    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
  });
});

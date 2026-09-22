/**
 * B-28 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2) —
 * `ProtectedRoute` gains the permission check: logged in but `canOpenPage`
 * false renders `NoAccessPage` instead of the page component, and the page
 * component is never mounted (so none of its queries fire). This is the
 * wiring test; `no-access-page.test.tsx` covers the message/button content
 * in isolation.
 *
 * Runs in the jsdom project (plan §8.8). Real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let authUser: { id: number; username: string; role: string; permissions: string[] } | null = null;
let authLoading = false;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authUser, isLoading: authLoading }),
}));

import { ProtectedRoute } from "@/components/protected-route";

const PAGE_URL = "/api/maintenance-marker";

/** Stands in for a real page component: fires one query and renders a marker. */
function PageStub() {
  useQuery({ queryKey: [PAGE_URL] });
  return <div data-testid="page-stub">page content</div>;
}

function renderAt(path: string) {
  const { hook, history } = memoryLocation({ path, record: true });
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const buildUi = () => (
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <ProtectedRoute path={path} component={PageStub} />
      </Router>
    </QueryClientProvider>
  );
  const utils = render(buildUi());
  // Rebuilds and re-renders the same tree (same client/hook, fresh elements),
  // which re-invokes every function component's hooks (including the mocked
  // useAuth()) against whatever authUser/authLoading now hold — used to
  // simulate a loading state resolving without remounting the tree.
  return { ...utils, history, rerenderSame: () => utils.rerender(buildUi()) };
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
  authUser = null;
  authLoading = false;
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProtectedRoute — permission check (B-28)", () => {
  it("a user without the page's permission gets no-access-page, and the page component never mounts", async () => {
    authUser = { id: 1, username: "cleaner", role: UserRole.CLEANER, permissions: [UserPermission.VIEW_VEHICLES] };
    renderAt("/maintenance");

    await waitFor(() => expect(screen.getByTestId("no-access-page")).toBeInTheDocument());
    expect(screen.queryByTestId("page-stub")).not.toBeInTheDocument();
    // Give any accidental query a tick to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith(PAGE_URL)).toBe(false);
  });

  it("while isLoading is true, a user without the right sees the spinner, not the no-access page, and the page never mounts", async () => {
    authUser = { id: 5, username: "cleaner", role: UserRole.CLEANER, permissions: [UserPermission.VIEW_VEHICLES] };
    authLoading = true;
    const { container } = renderAt("/maintenance");

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-stub")).not.toBeInTheDocument();
    // Give any accidental query a tick to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith(PAGE_URL)).toBe(false);
  });

  it("once loading resolves to a user with the right permission, the page mounts", async () => {
    authUser = { id: 6, username: "maint", role: UserRole.MAINTENANCE, permissions: [UserPermission.MANAGE_MAINTENANCE] };
    authLoading = true;
    const { rerenderSame } = renderAt("/maintenance");

    expect(screen.queryByTestId("page-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();

    authLoading = false;
    rerenderSame();

    await waitFor(() => expect(screen.getByTestId("page-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
    await waitFor(() => expect(calledWith(PAGE_URL)).toBe(true));
  });

  it("with the right permission, the page mounts as before and fires its own query", async () => {
    authUser = { id: 2, username: "maint", role: UserRole.MAINTENANCE, permissions: [UserPermission.MANAGE_MAINTENANCE] };
    renderAt("/maintenance");

    await waitFor(() => expect(screen.getByTestId("page-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
    await waitFor(() => expect(calledWith(PAGE_URL)).toBe(true));
  });

  it("admin bypasses the check regardless of the permissions array", async () => {
    authUser = { id: 3, username: "root", role: UserRole.ADMIN, permissions: [] };
    renderAt("/maintenance");

    await waitFor(() => expect(screen.getByTestId("page-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
  });

  it("not logged in still redirects to /auth", async () => {
    authUser = null;
    const { history } = renderAt("/maintenance");

    await waitFor(() => expect(history).toContain("/auth"));
    expect(screen.queryByTestId("page-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
  });

  it("a path with no shared/page-access.ts row is left open (unknown-address fail-open, the existing not-found page keeps handling genuinely unmatched addresses)", async () => {
    authUser = { id: 4, username: "cleaner", role: UserRole.CLEANER, permissions: [] };
    renderAt("/this-path-has-no-page-access-row");

    // canOpenPage()'s documented default: no row -> open. ProtectedRoute must
    // not invent a new blocked state for a route this table was never meant
    // to cover; App.tsx's own catch-all <Route component={NotFound} /> is
    // what actually renders "404 Pagina niet gevonden" for a truly unknown
    // address (ProtectedRoute is never even reached for that case, since
    // its own `path` prop then does not match the location either).
    await waitFor(() => expect(screen.getByTestId("page-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("no-access-page")).not.toBeInTheDocument();
  });
});

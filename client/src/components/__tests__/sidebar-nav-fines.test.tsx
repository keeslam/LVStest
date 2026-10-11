/**
 * A-R-1 introduced a menu item "Bekeuringen"; B-44 (11-10-2026) took it out
 * again: the list is reached from a button on the Klantenportaal page, so the
 * menu must not show it, whatever the fines rights are.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const authState = vi.hoisted(() => ({
  user: { id: 1, username: "u", role: "user", permissions: [] as string[] },
  isLoading: false,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => authState }));

import { SidebarNav } from "@/components/sidebar-nav";

function renderNav(role: string, permissions: string[]) {
  authState.user = { id: 1, username: "u", role, permissions };
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={hook}>
        <SidebarNav />
      </Router>
    </QueryClientProvider>,
  );
}

describe("sidebar - Bekeuringen (B-44)", () => {
  it("has no Bekeuringen item, also not with Boetes bekijken", () => {
    renderNav("user", ["view_fines"]);
    expect(screen.queryByRole("link", { name: /Bekeuringen/ })).toBeNull();
    expect(document.querySelector('a[href="/fines"]')).toBeNull();
  });

  it("has no Bekeuringen item for an admin either", () => {
    renderNav("admin", ["view_fines", "manage_fines"]);
    expect(screen.queryByRole("link", { name: /Bekeuringen/ })).toBeNull();
  });
});

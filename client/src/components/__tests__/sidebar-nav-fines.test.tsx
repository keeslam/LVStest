/**
 * A-R-1: the menu has an item "Bekeuringen" for Boetes bekijken / Boetes beheren.
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

describe("sidebar - Bekeuringen (A-R-1)", () => {
  it("is shown with Boetes bekijken and links to /fines", () => {
    renderNav("user", ["view_fines"]);
    expect(screen.getByRole("link", { name: /Bekeuringen/ })).toHaveAttribute("href", "/fines");
  });

  it("is hidden without a fines right", () => {
    renderNav("user", ["view_vehicles"]);
    expect(screen.queryByRole("link", { name: /Bekeuringen/ })).toBeNull();
  });
});

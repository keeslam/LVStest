/**
 * A-18-2: "Alles bekijken" under Recente kosten linked to /expenses for someone
 * without Kosten beheren, who then landed on the "geen toegang" screen. The link
 * is only there for those who may open the page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { RecentExpenses } from "@/components/dashboard/recent-expenses";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <RecentExpenses />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("RecentExpenses - the 'Alles bekijken' link", () => {
  it("is not offered without manage_expenses", () => {
    role = UserRole.USER;
    permissions = ["view_vehicles"];
    renderCard();
    expect(screen.queryByRole("link", { name: /Alles bekijken/ })).toBeNull();
    expect(screen.queryByText("Alles bekijken")).toBeNull();
  });

  it("is a link to /expenses with manage_expenses", () => {
    role = UserRole.USER;
    permissions = ["manage_expenses"];
    renderCard();
    expect(screen.getByRole("link", { name: /Alles bekijken/ })).toHaveAttribute("href", "/expenses");
  });
});

/**
 * A-R-1: the fines list is a screen of its own ("Bekeuringen"), not only a dialog on
 * the Klantenportaal page. Same table; it asks the server for /api/fines only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "user", permissions: ["view_fines"], hidePrices: false }, isLoading: false }),
}));

import FinesPage from "@/pages/fines/index";

const requested: string[] = [];
beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requested.push((typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, ""));
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Bekeuringen page", () => {
  it("shows its title and the fines table, and asks for fines only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <FinesPage />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Bekeuringen" })).toBeInTheDocument();
    await vi.waitFor(() => expect(requested.some((r) => r.startsWith("/api/fines"))).toBe(true));
    expect(requested.some((r) => r.startsWith("/api/portal-admin"))).toBe(false);
  });
});

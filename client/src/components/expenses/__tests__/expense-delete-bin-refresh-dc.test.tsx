/**
 * Package DC fix round 1 (review minor 2): an expense that goes to the recycle bin
 * must make a cached "Verwijderde kostenposten" list stale at once, otherwise a bin
 * that was opened within the last 30 seconds still shows the old list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const { invalidateByPrefix } = vi.hoisted(() => ({ invalidateByPrefix: vi.fn(async () => {}) }));
vi.mock("@/lib/queryClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queryClient")>()),
  invalidateByPrefix,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({ openVehicleDialog: () => {}, openExpenseVehicleDialog: () => {} }),
}));

import { ExpenseDetailDialog } from "@/components/expenses/expense-detail-dialog";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const expense = {
  id: 7, vehicleId: 3, category: "fuel", amount: "45.50", date: "2026-10-01", description: "Tankbeurt",
  createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z",
};

beforeEach(() => {
  invalidateByPrefix.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (init?.method === "DELETE") return json({ message: "ok" });
    if (path === "/api/expenses/7") return json(expense);
    if (path === "/api/vehicles/3") return json({ id: 3, licensePlate: "AB-123-C", brand: "VW", model: "Golf" });
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("deleting an expense refreshes the recycle bin list", () => {
  it("invalidates /api/deleted-records after the delete", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <ExpenseDetailDialog expenseId={7} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByTestId("button-delete-from-dialog"));
    const confirm = (await screen.findAllByRole("button", { name: /verwijderen/i })).pop()!;
    await user.click(confirm);
    await waitFor(() => expect(invalidateByPrefix).toHaveBeenCalledWith("/api/deleted-records"));
  });
});

/**
 * Kees, 2026-10-19: tick fines in the list and tell their customers, or cancel them, in one go, after a
 * confirmation. Someone without the manage right sees no ticks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

const { auth } = vi.hoisted(() => ({ auth: { role: "admin", permissions: [] as string[] } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: auth.role, permissions: auth.permissions, hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";

const row = (id: number, status: string) => ({ id, licensePlate: `AB12${id}C`, offenceAt: "2026-10-01T10:00:30Z", description: "Te hard", amount: "100.00", adminFee: "0.00", totalAmount: "100.00", status, customerId: 3, customerName: "Jansen BV", driverName: null, reservationId: 9 });
const posts: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  queryClient.clear();
  posts.length = 0;
  auth.role = "admin"; auth.permissions = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ action: "notify", done: [1], skipped: [{ id: 2, reason: "FINE_NOT_LINKED" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([row(1, "linked"), row(2, "new")]), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

const renderTable = () => render(<QueryClientProvider client={queryClient}><GlobalDialogProvider><FinesTable /></GlobalDialogProvider></QueryClientProvider>);

describe("bekeuringen in bulk", () => {
  it("ticks fines, confirms and sends them in one request", async () => {
    renderTable();
    const user = userEvent.setup();
    await screen.findByTestId("row-fine-1");
    expect(screen.queryByTestId("fines-bulk-bar")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("checkbox-fines-all"));
    expect(screen.getByTestId("fines-bulk-bar")).toHaveTextContent("2 bekeuringen gekozen");
    await user.click(screen.getByTestId("button-bulk-notify"));
    // The confirmation says only linked fines get a mail.
    expect(await screen.findByText(/1 van de gekozen/)).toBeInTheDocument();
    await user.click(screen.getByTestId("button-bulk-confirm"));
    await waitFor(() => expect(posts).toEqual([{ url: "/api/fines/bulk", body: { action: "notify", ids: [1, 2] } }]));
    await waitFor(() => expect(screen.queryByTestId("fines-bulk-bar")).not.toBeInTheDocument());
  });

  it("ticking a box does not open the fine", async () => {
    renderTable();
    const user = userEvent.setup();
    await screen.findByTestId("row-fine-1");
    await user.click(screen.getByTestId("checkbox-fine-1"));
    expect(screen.getByTestId("fines-bulk-bar")).toHaveTextContent("1 bekeuring gekozen");
    expect(screen.queryByTestId("fine-dialog")).not.toBeInTheDocument();
  });

  it("no ticks without the manage right", async () => {
    auth.role = "user"; auth.permissions = ["view_fines"];
    renderTable();
    await screen.findByTestId("row-fine-1");
    expect(screen.queryByTestId("checkbox-fine-1")).not.toBeInTheDocument();
  });
});

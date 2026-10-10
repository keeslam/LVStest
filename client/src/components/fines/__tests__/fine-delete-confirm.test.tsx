/**
 * A-19-6 / A-12-6 (audit 2026-10-09): "Verwijderen" on a fine used
 * window.confirm, which the built-in browser ignores, and never named the fine.
 * Our own dialog names plate and amount; cancel deletes nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { FineDialog } from "@/components/fines/fine-dialog";

const ROW = { id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:00Z", description: "Te hard", amount: "95.00", adminFee: "0.00", totalAmount: "95.00", status: "new", customerId: null, customerName: null, driverName: null, reservationId: null };
const DETAIL = { ...ROW, reference: null, receivedAt: null, letterFilePath: null, internalNotes: null, customerNote: null, invoiceReference: null, linkedBy: null, linkedAt: null, driverId: null, candidates: { covering: [], near: [] } };

const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url}`);
    if (url === "/api/fines/7" && method === "GET") return new Response(JSON.stringify(DETAIL), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/fines/7" && method === "DELETE") return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/fines")) return new Response(JSON.stringify([ROW]), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

function renderIt() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalDialogProvider>
        <FinesTable />
        <FineDialog />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("FineDialog delete", () => {
  it("asks in our own dialog that names plate and amount, and Annuleren deletes nothing", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.click(await screen.findByTestId("button-delete-fine"));

    const description = await screen.findByTestId("confirm-dialog-description");
    expect(description.textContent).toMatch(/AB-123-C/);
    expect(description.textContent).toMatch(/95,00/);
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(calls.filter((c) => c.startsWith("DELETE"))).toEqual([]);
  });

  it("deletes after the explicit confirm", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.click(await screen.findByTestId("button-delete-fine"));
    await user.click(await screen.findByTestId("button-confirm-delete-fine"));
    await vi.waitFor(() => expect(calls).toContain("DELETE /api/fines/7"));
  });
});

/**
 * Audit 2026-10-09, module 12 (A-12-1, A-12-5, A-12-8, A-12-11): the fine detail
 * must keep the admin fee on save, show fee and total, keep "close the dialog"
 * apart from "cancel the fine" (which asks first), and say what each action did.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { FineDialog } from "@/components/fines/fine-dialog";

let status = "linked";
const row = () => ({ id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:00Z", description: "Te hard", amount: "100.00", adminFee: "12.50", totalAmount: "112.50", status, customerId: 3, customerName: "Jansen BV", driverName: null, reservationId: 9 });
const detail = () => ({ ...row(), reference: null, receivedAt: null, letterFilePath: null, internalNotes: null, customerNote: null, invoiceReference: null, linkedBy: "t", linkedAt: null, driverId: null, candidates: { covering: [], near: [] } });

const calls: Array<{ call: string; body: unknown }> = [];
beforeEach(() => {
  status = "linked";
  calls.length = 0;
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ call: `${method} ${url}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/fines/7" && method === "GET") return json(detail());
    if (url.startsWith("/api/fines/7/")) return json({});
    if (url === "/api/fines/7") return json({});
    if (url.startsWith("/api/fines")) return json([row()]);
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

function renderIt() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalDialogProvider>
        <FinesTable />
        <FineDialog />
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}
const writes = () => calls.filter((c) => c.call.startsWith("PATCH") || c.call.startsWith("POST") || c.call.startsWith("DELETE"));

describe("FineDialog actions", () => {
  it("A-12-1: saving keeps the admin fee that the fine already has", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.type(await screen.findByLabelText(/interne notitie|internal note/i), "x");
    await user.click(await screen.findByTestId("button-save-fine-detail"));
    await vi.waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].call).toBe("PATCH /api/fines/7");
    expect((writes()[0].body as { adminFee: number }).adminFee).toBe(12.5);
  });

  it("A-12-11: the detail shows the admin fee and the total", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    expect((await screen.findByTestId("fine-admin-fee")).textContent).toMatch(/12,50/);
    expect(screen.getByTestId("fine-total").textContent).toMatch(/112,50/);
  });

  it("A-12-5: plain close touches nothing; cancelling the fine asks first and names plate and amount", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.click(await screen.findByTestId("button-cancel-fine"));
    const description = await screen.findByTestId("confirm-dialog-description");
    expect(description.textContent).toMatch(/AB-123-C/);
    expect(description.textContent).toMatch(/112,50/);
    expect(writes()).toEqual([]);
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(writes()).toEqual([]);
    await user.click(await screen.findByTestId("button-close-fine"));
    expect(writes()).toEqual([]);
    expect(screen.queryByTestId("button-close-fine")).toBeNull();
  });

  it("A-12-5: confirming the cancel posts the status change, with its own toast (A-12-8)", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.click(await screen.findByTestId("button-cancel-fine"));
    await user.click(await screen.findByTestId("button-confirm-cancel-fine"));
    await vi.waitFor(() => expect(writes().map((w) => w.call)).toEqual(["POST /api/fines/7/status"]));
    expect(writes()[0].body).toEqual({ status: "cancelled" });
    expect(await screen.findByText("Bekeuring geannuleerd.")).toBeTruthy();
    expect(screen.queryByText("Bekeuring opgeslagen.")).toBeNull();
  });

  it("A-12-8: unlinking says so instead of 'opgeslagen'", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.click(await screen.findByTestId("button-unlink-fine"));
    expect(await screen.findByText("Bekeuring ontkoppeld.")).toBeTruthy();
    expect(screen.queryByText("Bekeuring opgeslagen.")).toBeNull();
  });

  it("closing with typed-but-unsaved changes asks first and writes nothing", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await user.type(await screen.findByLabelText(/interne notitie|internal note/i), "x");
    await user.click(await screen.findByTestId("button-close-fine"));
    expect(await screen.findByTestId("button-discard-changes")).toBeTruthy();
    expect(writes()).toEqual([]);
  });
});

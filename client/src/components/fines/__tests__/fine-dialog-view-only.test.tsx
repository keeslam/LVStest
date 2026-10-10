/**
 * Fix round 1 (A-R-1): the new Bekeuringen screen is reachable with view_fines alone.
 * Opening a "new" fine there used to request /api/customers (view_customers), got a 403
 * and the global red toast "Kon de gegevens niet laden". Without the right to manage fines
 * or to list customers, that request is not made at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";

let permissions: string[] = ["view_fines"];
let role = "user";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { FineDialog } from "@/components/fines/fine-dialog";

const ROW = { id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:00Z", description: "Te hard", amount: "95.00", adminFee: "0.00", totalAmount: "95.00", status: "new", customerId: null, customerName: null, driverName: null, reservationId: null };
const DETAIL = { ...ROW, reference: null, receivedAt: null, letterFilePath: null, internalNotes: null, customerNote: null, invoiceReference: null, linkedBy: null, linkedAt: null, driverId: null, candidates: { covering: [], near: [] } };

const requested: string[] = [];
beforeEach(() => {
  requested.length = 0;
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    requested.push(url);
    if (url.startsWith("/api/customers")) return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    if (url === "/api/fines/7") return new Response(JSON.stringify(DETAIL), { status: 200, headers: { "Content-Type": "application/json" } });
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
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("FineDialog for a view-only profile", () => {
  it("opening a new fine makes no /api/customers request and shows no toast", async () => {
    permissions = ["view_fines"];
    role = "user";
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await screen.findByText("Te hard", { selector: "input" }).catch(() => null);
    await vi.waitFor(() => expect(requested).toContain("/api/fines/7"));
    expect(requested.some((u) => u.startsWith("/api/customers"))).toBe(false);
    expect(screen.queryByTestId("fine-link-panel")).toBeNull();
    expect(screen.queryByText(/Kon de gegevens niet laden/)).toBeNull();
  });

  it("manage_fines without a customer right still makes no customer request and explains it", async () => {
    permissions = ["view_fines", "manage_fines"];
    role = "user";
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    const panel = await screen.findByTestId("fine-link-panel");
    expect(within(panel).getByTestId("fine-no-customer-right")).toBeInTheDocument();
    expect(requested.some((u) => u.startsWith("/api/customers"))).toBe(false);
    expect(screen.queryByText(/Kon de gegevens niet laden/)).toBeNull();
  });

  it("an administrator still gets the customer list", async () => {
    permissions = [];
    role = "admin";
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("row-fine-7"));
    await screen.findByTestId("fine-link-panel");
    await vi.waitFor(() => expect(requested.some((u) => u.startsWith("/api/customers"))).toBe(true));
  });
});

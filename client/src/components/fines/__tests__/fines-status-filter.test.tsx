/**
 * B-41 D9 ("alleen registreren"): the status filter offers only the statuses a
 * fine can still get (new, linked, cancelled). Doorbelast / Betaald / Betwist
 * appear only when the list response reports rows that already have them, and
 * the badge keeps its legacy labels either way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { FineStatusBadge } from "@/components/fines/fine-status-badge";

const ROW = { id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:30Z", description: "Te hard", amount: "100.00", adminFee: "0.00", totalAmount: "100.00", status: "disputed", customerId: 3, customerName: "Jansen BV", driverName: null, reservationId: 9 };

let legacyHeader: string | null = null;
beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([ROW]), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(legacyHeader ? { "X-Legacy-Fine-Status-Counts": legacyHeader } : {}) },
  })));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); legacyHeader = null; });

const renderTable = () => render(<QueryClientProvider client={queryClient}><GlobalDialogProvider><FinesTable /></GlobalDialogProvider></QueryClientProvider>);
const optionValues = () => Array.from((screen.getByTestId("select-fine-status") as HTMLSelectElement).options).map((o) => o.value);

describe("fines status filter (D9)", () => {
  it("offers only new, linked and cancelled when there are no legacy rows", async () => {
    renderTable();
    await screen.findByTestId("row-fine-7");
    expect(optionValues()).toEqual(["", "new", "linked", "cancelled"]);
  });

  it("adds the legacy statuses that the list response reports, and only those", async () => {
    legacyHeader = JSON.stringify({ disputed: 1 });
    renderTable();
    await screen.findByTestId("row-fine-7");
    await vi.waitFor(() => expect(optionValues()).toEqual(["", "new", "linked", "cancelled", "disputed"]));
  });

  it("the badge keeps the legacy labels", () => {
    render(<><FineStatusBadge status="charged" /><FineStatusBadge status="paid" /><FineStatusBadge status="disputed" /></>);
    expect(screen.getByText("Doorbelast")).toBeTruthy();
    expect(screen.getByText("Betaald")).toBeTruthy();
    expect(screen.getByText("Betwist")).toBeTruthy();
  });
});

/**
 * Kees, 2026-10-18: the Klantenportaal dashboard shows what customers signed and sent back (contracts
 * and damage forms): a tile, the "Aandacht nodig" rows and the list behind the tile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const dialogs = { openPortalRequestDialog: vi.fn(), openFineDialog: vi.fn(), openReservationDialog: vi.fn(), openCustomerDialog: vi.fn(), openVehicleDialog: vi.fn(), openPortalListDialog: vi.fn(), closePortalListDialog: vi.fn() };
vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => dialogs }));
const apiRequest = vi.fn(async () => new Response("{}"));
vi.mock("@/lib/queryClient", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/queryClient")>()), apiRequest: (...args: unknown[]) => apiRequest(...(args as [])) }));

import { DashboardTiles, AttentionPanel } from "@/components/portal-admin/dashboard-panels";
import { SignaturesTable, SIGNATURES_KEY } from "@/components/portal-admin/signatures-table";
import type { PortalDashboard } from "@shared/portal-types";
import type { SignedDocumentRow } from "@shared/contract-signing";

const counts: PortalDashboard["counts"] = {
  newRequests: 0, inProgressRequests: 0, unlinkedFines: 0, onlineNow: 0, pendingInvites: 0, expiredInvites: 0,
  vehiclesOnline: 0, blacklistEntries: 0, unreadNotifications: 0, maintenance: 0, signedNew: 2, awaitingSignature: 3,
  uploadsNew: 0, cancellations: 0, finesAwaitingDriver: 0,
};
const signedRow = (over: Partial<SignedDocumentRow> = {}): SignedDocumentRow => ({
  id: 11, documentKind: "damage_check", reservationId: 2049, customerId: 179, customerName: "Klant 179 B.V.", licensePlate: "11ZSZ3",
  signerName: "Portaal Tester", signedAt: new Date().toISOString(), signedDocumentId: 259, seenAt: null, seenBy: null, ...over,
});
const wrap = (ui: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => { apiRequest.mockClear(); Object.values(dialogs).forEach((f) => f.mockClear()); });

describe("de tegel 'Getekend'", () => {
  it("counts what came back signed, says how much still waits, and opens the list", async () => {
    wrap(<DashboardTiles counts={counts} canViewFines />);
    const tile = screen.getByTestId("tile-signatures");
    expect(tile).toHaveTextContent("Getekend");
    expect(tile).toHaveTextContent("2");
    expect(tile).toHaveTextContent("3 wachten op handtekening");
    await userEvent.click(tile);
    expect(dialogs.openPortalListDialog).toHaveBeenCalledWith("signatures");
  });
});

describe("'Aandacht nodig'", () => {
  it("lists a signed damage form first; opening it marks it seen and opens the reservation", async () => {
    const attention = { requests: [], fines: [], signatures: [signedRow()] } as PortalDashboard["attention"];
    wrap(<AttentionPanel attention={attention} canViewFines />);
    const row = screen.getByTestId("attention-signed-11");
    expect(row).toHaveTextContent("Schadecheck getekend · Klant 179 B.V.");
    expect(row).toHaveTextContent("11-ZSZ-3");
    await userEvent.click(row);
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/portal-admin/signatures/11/seen");
    expect(dialogs.openReservationDialog).toHaveBeenCalledWith(2049);
  });
});

describe("de lijst achter de tegel", () => {
  it("shows signed and waiting documents; 'Gezien' marks one", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(SIGNATURES_KEY, {
      signed: [signedRow(), signedRow({ id: 12, documentKind: "contract", seenAt: new Date().toISOString(), seenBy: "kees" })],
      awaiting: [{ documentId: 147, documentKind: "contract", reservationId: 1619, customerId: 179, customerName: "Klant 179 B.V.", licensePlate: null, since: new Date().toISOString() }],
    });
    wrap(<SignaturesTable />, qc);
    expect(screen.getByTestId("signed-row-11")).toHaveTextContent("Nieuw");
    expect(screen.getByTestId("signed-row-12")).toHaveTextContent("Gezien door kees");
    expect(screen.queryByTestId("button-signature-seen-12")).not.toBeInTheDocument();
    expect(screen.getByTestId("awaiting-row-147")).toHaveTextContent("#1619");
    await userEvent.click(screen.getByTestId("button-signature-seen-11"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/portal-admin/signatures/11/seen"));
    await userEvent.click(screen.getByTestId("button-awaiting-open-147"));
    expect(dialogs.openReservationDialog).toHaveBeenCalledWith(1619);
    expect(dialogs.closePortalListDialog).toHaveBeenCalled();
  });
});

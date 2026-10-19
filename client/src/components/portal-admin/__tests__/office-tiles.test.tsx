/**
 * Kees, 2026-10-19: tiles for customer uploads, cancellations and "who drove", and the uploads list
 * where viewing a document marks it as seen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalDashboard, CustomerUploadRow } from "@shared/portal-types";

const { openPortalListDialog, apiRequest } = vi.hoisted(() => ({ openPortalListDialog: vi.fn(), apiRequest: vi.fn(async () => new Response("{}")) }));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({ openPortalListDialog, openReservationDialog: vi.fn(), closePortalListDialog: vi.fn(), openFineDialog: vi.fn() }),
}));
vi.mock("@/lib/queryClient", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/queryClient")>()), apiRequest }));

import { DashboardTiles } from "@/components/portal-admin/dashboard-panels";
import { UploadsTable } from "@/components/portal-admin/uploads-table";

const counts: PortalDashboard["counts"] = {
  newRequests: 0, inProgressRequests: 0, unlinkedFines: 0, onlineNow: 0, pendingInvites: 0, expiredInvites: 0,
  vehiclesOnline: 0, blacklistEntries: 0, unreadNotifications: 0, maintenance: 0, signedNew: 0, awaitingSignature: 0,
  uploadsNew: 2, cancellations: 1, finesAwaitingDriver: 3,
};

function withClient(ui: React.ReactNode, data: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, value] of Object.entries(data)) qc.setQueryData([key], value);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Klantenportaal-tegels voor kantoor", () => {
  beforeEach(() => { openPortalListDialog.mockClear(); apiRequest.mockClear(); });

  it("shows the three counts and opens the right list", async () => {
    withClient(<DashboardTiles counts={counts} canViewFines />);
    expect(screen.getByTestId("tile-uploads")).toHaveTextContent("2");
    expect(screen.getByTestId("tile-cancellations")).toHaveTextContent("1");
    expect(screen.getByTestId("tile-whoDrove")).toHaveTextContent("3");
    await userEvent.click(screen.getByTestId("tile-uploads"));
    expect(openPortalListDialog).toHaveBeenLastCalledWith("uploads");
    await userEvent.click(screen.getByTestId("tile-cancellations"));
    expect(openPortalListDialog).toHaveBeenLastCalledWith("requests", { types: ["cancellation"] });
    await userEvent.click(screen.getByTestId("tile-whoDrove"));
    expect(openPortalListDialog).toHaveBeenLastCalledWith("whoDrove");
  });

  it("hides 'who drove' without a fines right", () => {
    withClient(<DashboardTiles counts={counts} canViewFines={false} />);
    expect(screen.queryByTestId("tile-whoDrove")).not.toBeInTheDocument();
  });

  it("viewing an upload marks it as seen", async () => {
    const row: CustomerUploadRow = { id: 9, reservationId: 4, customerId: 1, customerName: "Klant BV", licensePlate: "12ABC3", description: "Tankbon", fileName: "bon.pdf", contentType: "application/pdf", uploadedAt: "2026-10-19T08:00:00.000Z", uploadedBy: "jan@klant.test", seenAt: null, seenBy: null };
    withClient(<UploadsTable />, { "/api/portal-admin/uploads": [row] });
    expect(screen.getByTestId("upload-row-9")).toHaveTextContent("Tankbon");
    await userEvent.click(screen.getByTestId("button-view-upload-9"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/portal-admin/uploads/9/seen"));
  });
});

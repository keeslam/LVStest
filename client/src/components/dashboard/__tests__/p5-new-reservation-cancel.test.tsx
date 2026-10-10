/**
 * Audit remediation P5, A-2-1 - "Annuleren" in the dashboard's "Nieuwe
 * reservering" dialog closed nothing: the form had no onCancel there and fell
 * back to its page behaviour, navigate("/reservations"). In a dialog Annuleren
 * must close the dialog and leave the employee where they were.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

vi.mock("@/contexts/GlobalDialogContext", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/contexts/GlobalDialogContext");
  return {
    ...actual,
    useGlobalDialog: () => ({
      openScanDialog: vi.fn(),
      openRdwApkChangesDialog: vi.fn(),
      openVehicleDialog: vi.fn(),
      openReservationDialog: vi.fn(),
      dialogState: {},
    }),
  };
});
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

import { QuickActions } from "@/components/dashboard/quick-actions";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("A-2-1 - Annuleren in Nieuwe reservering", () => {
  it("closes the dialog and stays on the page", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <QuickActions />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("button-quick-new-reservation"));
    const cancel = await screen.findByRole("button", { name: "Annuleren" });
    await user.click(cancel);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Annuleren" })).toBeNull());
    expect(window.location.pathname).toBe("/");
  });
});

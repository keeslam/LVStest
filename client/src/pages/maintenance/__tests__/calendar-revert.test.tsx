/**
 * Sub-project D, final wave (D7 follow-up) - the maintenance history's
 * "Terugdraaien" puts a finished block back as an OPEN one in a single PATCH:
 * status `picked_up` AND maintenance status `in`. Sending the maintenance status
 * alone left `status = completed`, so the edit dialog could not save the block
 * (400 INVALID_STATUS_TRANSITION) and the list hid what the calendar showed.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

import MaintenanceCalendarPage from "@/pages/maintenance/calendar";

const FINISHED_BLOCK = {
  id: 7001, vehicleId: 11, customerId: null, startDate: "2026-10-05", endDate: "2026-10-06",
  status: "completed", type: "maintenance_block", maintenanceStatus: "out", maintenanceCategory: "repair",
  notes: "repair: FIXT remmen", totalPrice: "0", deletedAt: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const path = pathOf(input);
    if (init?.method === "PATCH") return json({ ...FINISHED_BLOCK, status: "picked_up", maintenanceStatus: "in" });
    // BUG-205 phase B: the finished blocks come from /api/reservations?type=maintenance_block&maintenanceStatus=out.
    if (path.split("?")[0] === "/api/reservations") return json([FINISHED_BLOCK]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("history dialog - Terugdraaien", () => {
  it("sends status picked_up together with maintenanceStatus in, so the block is open for the list, the calendar and the edit dialog", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    const { hook } = memoryLocation({ path: "/maintenance", static: true });
    render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <Router hook={hook}>
            <MaintenanceCalendarPage />
          </Router>
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("button-view-completed").textContent).toContain("1"));
    await user.click(screen.getByTestId("button-view-completed"));
    await user.click(await screen.findByTestId(`button-revert-${FINISHED_BLOCK.id}`));

    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
      expect(patches).toHaveLength(1);
      const [input, init] = patches[0];
      expect(pathOf(input)).toBe(`/api/reservations/${FINISHED_BLOCK.id}`);
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({ status: "picked_up", maintenanceStatus: "in" });
    });
  });
});

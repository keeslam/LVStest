/**
 * `ScheduleMaintenanceDialog`'s own submit button (`button-schedule`) — Task 4
 * (docs/superpowers/specs/2026-09-21-toegang-design.md, §4/§5).
 *
 * Create mode submits `POST /api/reservations` (server/routes.ts:2966),
 * `hasPermission(MANAGE_RESERVATIONS)` only — not maintenance-exclusive (the
 * same route serves every reservation-creation flow in the app), so it is
 * reported, not widened; the button needs MANAGE_RESERVATIONS.
 *
 * Edit mode (`editingReservation` set — only ever reached from
 * `pages/maintenance/calendar.tsx`'s and `components/barcodes/scan-panel.tsx`'s
 * "edit an existing maintenance block" actions) submits `PATCH
 * /api/reservations/:id/basic`, which this task widened to additionally
 * accept MANAGE_MAINTENANCE (server/__tests__/toegang-basic-manage-maintenance.test.ts
 * proves the server side) — the button needs MANAGE_RESERVATIONS OR
 * MANAGE_MAINTENANCE.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

function renderDialog(props: Partial<React.ComponentProps<typeof ScheduleMaintenanceDialog>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ScheduleMaintenanceDialog open onOpenChange={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScheduleMaintenanceDialog — create mode requires manage_reservations", () => {
  it("is disabled without manage_reservations, even with manage_maintenance", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_MAINTENANCE]);
    renderDialog();
    const button = await screen.findByTestId("button-schedule");
    expect(button).toBeVisible();
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("is enabled with manage_reservations", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderDialog();
    const button = await screen.findByTestId("button-schedule");
    expect(button).not.toBeDisabled();
  });
});

describe("ScheduleMaintenanceDialog — edit mode accepts manage_maintenance too", () => {
  const editingReservation = {
    id: 501, vehicleId: 1, startDate: "2026-10-01", endDate: "2026-10-02",
    maintenanceStatus: "in", notes: "regular_maintenance: test", maintenanceDuration: 2,
  } as any;

  it("is enabled with only manage_maintenance (the widened /basic route)", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_MAINTENANCE]);
    renderDialog({ editingReservation });
    const button = await screen.findByTestId("button-schedule");
    expect(button).not.toBeDisabled();
  });

  it("is enabled with only manage_reservations", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderDialog({ editingReservation });
    const button = await screen.findByTestId("button-schedule");
    expect(button).not.toBeDisabled();
  });

  it("is disabled with neither permission, and explains itself", async () => {
    setUser(UserRole.USER, []);
    renderDialog({ editingReservation });
    const button = await screen.findByTestId("button-schedule");
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
  });
});

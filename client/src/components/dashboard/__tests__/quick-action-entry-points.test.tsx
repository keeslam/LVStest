/**
 * OPT-002 — "Ophalen", "Innemen" en "Scannen" als primaire ingang.
 *
 * The workflow report measured the counter's two most frequent actions
 * (50x/day between them) having no dashboard entry at all, while "RDW
 * APK-datums scannen" — a nightly batch job — held one of the five primary
 * tiles. This pins the tiles and what they open.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

const openScanDialog = vi.fn();

vi.mock("@/contexts/GlobalDialogContext", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/contexts/GlobalDialogContext");
  return {
    ...actual,
    useGlobalDialog: () => ({
      openScanDialog,
      openRdwApkChangesDialog: vi.fn(),
      openVehicleDialog: vi.fn(),
      openReservationDialog: vi.fn(),
      dialogState: {},
    }),
  };
});

// Task 3 (docs/superpowers/specs/2026-09-21-toegang-design.md, §4) wrapped
// every tile in RequiresPermission, which reads the signed-in user via
// useAuth() — this test is about tile order/labels/click wiring, not
// permissions, so it defaults to admin (bypasses every check) to keep every
// tile enabled, same as before RequiresPermission existed. `mockRole`/
// `mockPermissions` are mutable (read at call time, not at mock-definition
// time) so the one test below that cares about a non-admin role can override
// them for just that test — same pattern as use-has-permission.test.tsx.
let mockRole: string = UserRole.ADMIN;
let mockPermissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: mockRole, permissions: mockPermissions }, isLoading: false }),
}));

import { QuickActions } from "@/components/dashboard/quick-actions";

function renderQuickActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickActions />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRole = UserRole.ADMIN;
  mockPermissions = [];
  openScanDialog.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-002 — de balie-ingangen op het dashboard", () => {
  it("offers Ophalen, Innemen and Scannen as tiles, in Dutch", () => {
    renderQuickActions();
    expect(screen.getByTestId("button-quick-start-pickup")).toHaveTextContent("Ophalen starten");
    expect(screen.getByTestId("button-quick-start-return")).toHaveTextContent("Innemen starten");
    expect(screen.getByTestId("button-quick-scan")).toHaveTextContent("Scannen");
  });

  it("each tile opens the scan panel with the handover it means", async () => {
    const user = userEvent.setup();
    renderQuickActions();

    await user.click(screen.getByTestId("button-quick-start-pickup"));
    expect(openScanDialog).toHaveBeenLastCalledWith("pickup");

    await user.click(screen.getByTestId("button-quick-start-return"));
    expect(openScanDialog).toHaveBeenLastCalledWith("return");

    // The plain scan tile carries no intent: it must never start a handover
    // on its own.
    await user.click(screen.getByTestId("button-quick-scan"));
    expect(openScanDialog).toHaveBeenLastCalledWith(null);
  });

  it("the nightly RDW batch job no longer holds a primary tile", () => {
    renderQuickActions();
    const primaryRow = screen.queryByTestId("quick-actions-primary");
    expect(primaryRow).not.toBeNull();
    expect(primaryRow!.textContent).not.toContain("RDW APK-datums scannen");
    // ...but it is still reachable, one row down.
    expect(screen.getByText("RDW APK-datums scannen")).toBeInTheDocument();
  });

  it("the primary row holds exactly the five most-used actions", () => {
    renderQuickActions();
    const primaryRow = screen.getByTestId("quick-actions-primary");
    expect(primaryRow.textContent).toContain("Ophalen starten");
    expect(primaryRow.textContent).toContain("Innemen starten");
    expect(primaryRow.textContent).toContain("Scannen");
    expect(primaryRow.textContent).toContain("Nieuwe reservering");
    expect(primaryRow.textContent).toContain("Schadecheck starten");
  });

  // OPT-002 moved these three to the second row but left them styled as
  // full-width tiles, so on desktop they stacked as three wide bars.
  it("the actions moved to the second row are compact buttons, not full-width tiles", () => {
    renderQuickActions();
    const secondaryRow = screen.getByTestId("quick-actions-secondary");
    for (const label of ["Voertuig toevoegen", "Klant toevoegen", "RDW APK-datums scannen"]) {
      const button = Array.from(secondaryRow.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
      expect(button, label).toBeDefined();
      expect(button!.className, label).not.toContain("w-full");
    }
  });
});

/**
 * Fix round 1 (task-3-report.md, Critical finding) — the generic "Scan" tile
 * must stay usable for a role that holds none of MANAGE_RESERVATIONS (e.g.
 * the E2E `maintenance` profile: `MANAGE_VEHICLES`/`MANAGE_MAINTENANCE`, no
 * `MANAGE_RESERVATIONS`), because `ScanPanel` itself offers actions from
 * those other permission families and has no gates of its own yet. Gating
 * this opener on `MANAGE_RESERVATIONS` alone took the whole panel away from
 * that role — a real loss, not just a cosmetic one. "Start Pickup"/"Start
 * Return" are unaffected: both always lead straight to a
 * `MANAGE_RESERVATIONS`-only route, so they stay gated.
 */
describe("OPT-002 — de scantegel blijft open voor wie geen reserveringsrecht heeft", () => {
  it("a user with only manage_maintenance can still open the generic Scan tile", async () => {
    mockRole = UserRole.MAINTENANCE;
    mockPermissions = [UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES];
    const user = userEvent.setup();
    renderQuickActions();

    const scanButton = screen.getByTestId("button-quick-scan");
    expect(scanButton).not.toBeDisabled();
    await user.click(scanButton);
    expect(openScanDialog).toHaveBeenLastCalledWith(null);

    // "Start Pickup"/"Start Return" stay gated on MANAGE_RESERVATIONS, which
    // this role does not hold — visible but disabled, per B-27.
    expect(screen.getByTestId("button-quick-start-pickup")).toBeDisabled();
    expect(screen.getByTestId("button-quick-start-return")).toBeDisabled();
  });
});

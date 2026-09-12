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
});

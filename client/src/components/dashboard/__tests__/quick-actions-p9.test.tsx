/**
 * Fysieke E2E-audit 2026-10-09, module 2:
 *  - A-2-2: "RDW APK-datums scannen" started a fleet-wide scan on one click;
 *    it now asks first and only starts after the confirmation.
 *  - A-2-8: Ophalen starten / Innemen starten / Scannen open nearly the same
 *    scan panel; each tile now says in one line what it is for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

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
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { QuickActions } from "@/components/dashboard/quick-actions";

let fetchMock: ReturnType<typeof vi.fn>;

function scanStarts(): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return url.includes("/api/apk-date-changes/scan-now") && ((init as RequestInit | undefined)?.method ?? "GET") === "POST";
  }).length;
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const body = url.includes("scan-now") ? { started: true, alreadyRunning: false } : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderQuickActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickActions />
    </QueryClientProvider>,
  );
}

describe("A-2-2 — the RDW fleet scan asks before it starts", () => {
  it("one click only opens the question; confirming starts the scan", async () => {
    const user = userEvent.setup();
    renderQuickActions();

    await user.click(screen.getByTestId("button-scan-rdw-apk-dates"));
    expect(await screen.findByTestId("dialog-rdw-scan-confirm")).toBeInTheDocument();
    expect(scanStarts()).toBe(0);

    await user.click(screen.getByTestId("button-confirm-rdw-scan"));
    await waitFor(() => expect(scanStarts()).toBe(1));
  });

  it("cancelling starts nothing", async () => {
    const user = userEvent.setup();
    renderQuickActions();

    await user.click(screen.getByTestId("button-scan-rdw-apk-dates"));
    await user.click(await screen.findByTestId("button-cancel-rdw-scan"));
    await waitFor(() => expect(screen.queryByTestId("dialog-rdw-scan-confirm")).not.toBeInTheDocument());
    expect(scanStarts()).toBe(0);
  });
});

describe("A-2-8 — the three scan tiles say what they are for", () => {
  it("shows a one-line hint under Ophalen, Innemen and Scannen", () => {
    renderQuickActions();
    expect(screen.getByTestId("button-quick-start-pickup")).toHaveTextContent("Auto meegeven aan de klant");
    expect(screen.getByTestId("button-quick-start-return")).toHaveTextContent("Auto terugnemen van de klant");
    expect(screen.getByTestId("button-quick-scan")).toHaveTextContent("Alleen opzoeken, niets starten");
  });
});

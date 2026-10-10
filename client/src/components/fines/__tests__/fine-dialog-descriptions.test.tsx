/**
 * Final wave A, item 9: the fine dialog, the CJIB imports dialog and the portal's fine dialog had a
 * title but no description, so Radix warned "Missing `Description` or `aria-describedby`" on every open
 * (and a screen reader got no summary). Each now carries a DialogDescription.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider, useGlobalDialog } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/hooks/use-portal-auth", () => ({
  usePortalAuth: () => ({ me: { id: 1, settings: { canSubmitRequests: false } }, isLoading: false, refresh: async () => {}, logout: async () => {} }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openFine: () => {}, openNewRequest: () => {} }) }));

import { FineDialog } from "@/components/fines/fine-dialog";
import { FineImportsDialog } from "@/components/fines/fine-imports-dialog";
import { FineDialog as PortalFineDialog } from "@/components/portal/fine-dialog";

const FINE = { id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:00Z", description: "Te hard", amount: "95.00", adminFee: "0.00", totalAmount: "95.00", status: "new", customerId: null, customerName: null, driverName: null, reservationId: null, reference: null, receivedAt: null, letterFilePath: null, internalNotes: null, customerNote: null, invoiceReference: null, linkedBy: null, linkedAt: null, driverId: null, candidates: { covering: [], near: [] }, hasLetter: false, driver: null };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const body = /\/api\/(portal\/)?fines\/7$/.test(url) ? FINE : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); warn.mockRestore(); });

const missingDescription = () => warn.mock.calls.filter(([message]) => /Missing `Description`|aria-describedby=\{undefined\}/.test(String(message)));

function Opener({ what }: { what: "fine" | "imports" }) {
  const dialogs = useGlobalDialog();
  useEffect(() => {
    if (what === "fine") dialogs.openFineDialog(7);
    else dialogs.openFineImportsDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><GlobalDialogProvider>{ui}</GlobalDialogProvider></QueryClientProvider>);
}

describe("dialogs have a description", () => {
  it("the staff fine dialog", async () => {
    renderWith(<><Opener what="fine" /><FineDialog /></>);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(/Bekijk en behandel deze bekeuring/);
    expect(missingDescription()).toEqual([]);
  });

  it("the CJIB imports dialog", async () => {
    renderWith(<><Opener what="imports" /><FineImportsDialog /></>);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(/bestanden die het CJIB/);
    expect(missingDescription()).toEqual([]);
  });

  it("the portal's fine dialog", async () => {
    renderWith(<PortalFineDialog id={7} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(/gegevens van deze bekeuring/);
    expect(missingDescription()).toEqual([]);
  });
});

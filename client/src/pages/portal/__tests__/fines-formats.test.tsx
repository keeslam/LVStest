/**
 * A-12-7 (audit 2026-10-09): the customer portal showed fines as "€ 95.00", with
 * seconds in the time and, in the summary, a point instead of a decimal comma.
 * One house style: "€ 95,00", "1 okt. 2026 12:00", plates with dashes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-portal-auth", () => ({
  usePortalAuth: () => ({ me: { id: 1, settings: { canSubmitRequests: false } }, isLoading: false, refresh: async () => {}, logout: async () => {} }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openFine: () => {}, openNewRequest: () => {} }) }));

import PortalFinesPage from "@/pages/portal/fines";
import { FineDialog } from "@/components/portal/fine-dialog";

const FINE = {
  id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:30.000Z", description: "Te hard", reference: "K-1",
  amount: "95.00", adminFee: "0.00", totalAmount: "95.00", status: "linked", driver: null, customerNote: null, hasLetter: false,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).endsWith("/7") ? FINE : [FINE];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{ui}</QueryClientProvider>);

describe("portal fines: formats", () => {
  it("the list shows € 95,00, a time without seconds and a plate with dashes", async () => {
    wrap(<PortalFinesPage />);
    const row = await screen.findByTestId("portal-fine-7");
    expect(row.textContent).toMatch(/€\s95,00/);
    expect(row.textContent).not.toMatch(/95\.00/);
    expect(row.textContent).toMatch(/\d{1,2} \w{3,4}\.? 2026 \d{2}:\d{2}(?!:)/);
    expect(row.textContent).toContain("AB-123-C");
    // the summary line above the list
    expect(document.body.textContent).toMatch(/1 bekeuring, €\s95,00/);
  });

  it("the detail shows € 95,00 and a time without seconds", async () => {
    wrap(<FineDialog id={7} onClose={() => {}} />);
    await screen.findByText("Te hard");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/€\s95,00/);
    expect(text).not.toMatch(/95\.00/);
    expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(text).toContain("AB-123-C");
  });
});

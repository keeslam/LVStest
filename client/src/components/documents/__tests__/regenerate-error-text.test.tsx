/**
 * P11: a refused "Opnieuw genereren" shows the sentence for the server's stable code, in Dutch,
 * and never the server's English message with its status prefix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

import { RegenerateDocumentButton, StaleDocumentBadge } from "@/components/documents/stale-document";

const document = { id: 7, vehicleId: 1, reservationId: 9, documentType: "Contract (Unsigned)" } as any;

beforeEach(() => {
  toastSpy.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ message: "This reservation has no vehicle, so there is no damage check to draw.", code: "NO_VEHICLE" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RegenerateDocumentButton - refused", () => {
  it("shows the Dutch sentence for the code", async () => {
    const user = userEvent.setup();
    withClient(<RegenerateDocumentButton document={document} />);
    await user.click(screen.getByTestId("button-regenerate-document-7"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const call = toastSpy.mock.calls[0][0];
    expect(call.variant).toBe("destructive");
    expect(call.description).toBe("Aan deze reservering is geen voertuig gekoppeld, dus het document kan niet worden gemaakt.");
    expect(call.description).not.toMatch(/no vehicle|^400/);
  });
});

describe("StaleDocumentBadge - the reason", () => {
  it("shows the reasons the server writes in Dutch", () => {
    withClient(<StaleDocumentBadge document={{ isStale: true, staleReason: "handover reverted", version: 1 }} />);
    expect(screen.getByTestId("document-stale-badge").getAttribute("title")).toMatch(/de overdracht is teruggedraaid/);
  });
});

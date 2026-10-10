/**
 * Audit A-3-12 / A-3-13 — the key cabinet.
 *
 * A-3-12: the audit only said "1 van 19 verwachte sleutels gescand"; which key had just been
 * scanned, and which were still missing, could not be seen until the audit was finished.
 * A-3-13: the key label print closed without a word. What it really does is open the browser's
 * print window, so the toast says exactly that (not "label verstuurd naar de printer").
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastSpy,
}));
vi.mock("jsbarcode", () => ({ default: vi.fn() }));

import { KeyAuditDialog } from "@/components/barcodes/key-audit-dialog";
import { printKeyLabels } from "@/components/barcodes/key-label-print";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const vehicles = [
  { id: 1, licensePlate: "AB123C", brand: "Volkswagen", model: "Golf", availabilityStatus: "available", barcode: "VEH-000001" },
  { id: 2, licensePlate: "12XYZ3", brand: "Audi", model: "A3", availabilityStatus: "available", barcode: "VEH-000002" },
  { id: 3, licensePlate: "99ZZ99", brand: "Seat", model: "Ibiza", availabilityStatus: "rented", barcode: "VEH-000003" },
];

beforeEach(() => {
  toastSpy.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (path === "/api/vehicles") return json(vehicles);
      if (path.startsWith("/api/barcodes/")) {
        const code = decodeURIComponent(path.slice("/api/barcodes/".length));
        const vehicle = vehicles.find((v) => v.barcode === code);
        return vehicle ? json({ type: "vehicle", vehicle }) : json({}, 404);
      }
      return json([]);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderAudit() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KeyAuditDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("A-3-12 — the key audit shows which keys are scanned and which are missing", () => {
  it("after one scan: the scanned plate (dashed) is listed, the other expected key is still missing, the rented one is not expected", async () => {
    const user = userEvent.setup();
    renderAudit();
    await waitFor(() => expect(screen.getByTestId("text-key-audit-count")).toHaveTextContent("0 van 2"));

    await user.type(screen.getByTestId("input-key-audit-scan"), "VEH-000001{Enter}");

    await waitFor(() => expect(screen.getByTestId("text-key-audit-count")).toHaveTextContent("1 van 2"));
    expect(screen.getByTestId("text-key-audit-last-scanned")).toHaveTextContent("AB-123-C");
    expect(within(screen.getByTestId("list-key-audit-scanned")).getByText(/AB-123-C/)).toBeInTheDocument();
    const missing = screen.getByTestId("list-key-audit-pending");
    expect(within(missing).getByText(/12-XYZ-3/)).toBeInTheDocument();
    expect(within(missing).queryByText(/AB-123-C/)).toBeNull();
    expect(within(missing).queryByText(/99-ZZ-99/)).toBeNull();
  });
});

describe("A-3-13 — printing a key label says what happened", () => {
  // jsdom does not implement focus()/print() on the hidden iframe's window and logs an error for
  // each; give that window no-ops so the output stays clean.
  beforeEach(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!.get!;
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
      const win = original.call(this) as Window | null;
      if (win) {
        win.focus = vi.fn();
        win.print = vi.fn();
      }
      return win;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("toasts that the browser's print window is opened for the label of that plate", async () => {
    vi.useFakeTimers();
    try {
      printKeyLabels([{ id: 1, barcode: "VEH-000001", licensePlate: "AB123C", brand: "Volkswagen", model: "Golf" }]);
      expect(toastSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(toastSpy).toHaveBeenCalledTimes(1);
      const arg = toastSpy.mock.calls[0][0];
      expect(arg.title).toBe("Afdrukvenster geopend");
      expect(arg.description).toContain("AB-123-C");
      expect(arg.description).not.toMatch(/verstuurd naar de printer/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says how many labels when there are several", () => {
    vi.useFakeTimers();
    try {
      const v = (id: number) => ({ id, barcode: `VEH-00000${id}`, licensePlate: "AB123C", brand: "X", model: "Y" });
      printKeyLabels([v(1), v(2), v(3)]);
      vi.advanceTimersByTime(300);
      expect(toastSpy.mock.calls[0][0].description).toContain("3 labels");
    } finally {
      vi.useRealTimers();
    }
  });
});

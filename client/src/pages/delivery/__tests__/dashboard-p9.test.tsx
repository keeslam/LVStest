/**
 * Fysieke E2E-audit 2026-10-09, module 8 (Transporten):
 *  - A-8-1: "Afronden" was one click with no question and no outcome;
 *  - A-8-3: "Print" in a row gave no visible result;
 *  - A-8-4: an incomplete route showed "? → laan";
 *  - A-8-7: the action icons had no name (screen readers, tooltips).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));

import DeliveryDashboard from "@/pages/delivery/dashboard";

const transport = {
  id: 7,
  vehicleId: 1,
  vehicle: { id: 1, brand: "VW", model: "Crafter", licensePlate: "AB123C" },
  transportType: "swap",
  status: "scheduled",
  scheduledDate: "2026-10-10",
  originCity: "Eindhoven",
  destinationCity: null,
  spareRequired: false,
  notes: "Eerdere notitie",
  billable: false,
};

let calls: Array<{ url: string; method: string; body: any }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  toast.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = (typeof input === "string" ? input : input?.url ?? "").replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any;
    try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { body = init?.body; }
    calls.push({ url, method, body });
    if (method === "GET" && url.startsWith("/api/transports")) return json([transport]);
    if (method === "PATCH") return json({ ...transport, status: "completed" });
    if (method === "POST" && url.includes("generate-report")) return json({ id: 99, fileName: "Transport_Report.pdf" });
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/delivery", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider><Router hook={hook}>{<DeliveryDashboard />}</Router></GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const patches = () => calls.filter((c) => c.method === "PATCH");

describe("A-8-1 — Afronden asks first and takes the outcome", () => {
  it("one click only opens the question; confirming completes with the date and the outcome", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-complete-transport-7"));
    const dialog = await screen.findByTestId("dialog-complete-transport");
    expect(patches()).toHaveLength(0);

    await user.type(within(dialog).getByTestId("input-complete-outcome"), "Auto is afgeleverd");
    await user.click(within(dialog).getByTestId("button-confirm-complete-transport"));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const patch = patches()[0];
    expect(patch.url).toBe("/api/transports/7");
    expect(patch.body.status).toBe("completed");
    expect(patch.body.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(patch.body.notes).toBe("Eerdere notitie\nUitkomst: Auto is afgeleverd");
  });

  it("cancelling completes nothing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-complete-transport-7"));
    await user.click(await screen.findByTestId("button-cancel-complete-transport"));
    await waitFor(() => expect(screen.queryByTestId("dialog-complete-transport")).not.toBeInTheDocument());
    expect(patches()).toHaveLength(0);
  });
});

describe("A-8-3 — Print says what happened", () => {
  it("tells the user the report was made and saved in Documents", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-print-transport-7"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Rapport gemaakt" })));
  });
});

describe("A-8-4 — an incomplete route is readable", () => {
  it("shows 'onbekend' for the missing end, never a bare question mark", async () => {
    renderPage();
    const row = await screen.findByTestId("transport-row-7");
    expect(row.textContent).toContain("Eindhoven → onbekend");
    expect(row.textContent).not.toContain("?");
  });
});

describe("A-8-7 — the action icons have a name", () => {
  it("names every icon button in the row, delete included", async () => {
    renderPage();
    const row = await screen.findByTestId("transport-row-7");
    const buttons = within(row).getAllByRole("button");
    for (const button of buttons) {
      expect(button.getAttribute("aria-label") || button.textContent, button.outerHTML).toBeTruthy();
    }
    expect(within(row).getByTestId("button-delete-transport-7")).toHaveAttribute("aria-label", "Verwijderen");
  });
});

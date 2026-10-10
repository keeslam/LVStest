/**
 * Audit A-9-1, A-9-2, A-3-7 (package P1): one canonical list of expense
 * categories, and every screen that shows one reads the label through the one
 * shared helper, in Dutch and in English (no raw "fuel" / "maintenance" in the
 * vehicle Kosten and Geschiedenis tabs, the expense detail dialog or the
 * per-vehicle cost dialog).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { EXPENSE_CATEGORIES as INBOX_CATEGORIES } from "@shared/invoice-inbox";
import nlExpenses from "@/locales/nl/expenses.json";
import enExpenses from "@/locales/en/expenses.json";
import { formatExpenseCategory } from "@/lib/format-utils";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { VehicleDetails } from "@/components/vehicles/vehicle-details";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const vehicle = { id: 1, licensePlate: "AB-123-C", brand: "Volkswagen", model: "Golf", vehicleType: "car", status: "available", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const expenses = [
  { id: 11, vehicleId: 1, category: "fuel", amount: "50.00", date: "2026-09-01", description: "Volgetankt", createdAt: "2026-09-01T10:00:00.000Z" },
  { id: 12, vehicleId: 1, category: "toll", amount: "12.50", date: "2026-09-02", description: "Tunnel", createdAt: "2026-09-02T10:00:00.000Z" },
];

describe("expense categories: one list, labelled in nl and en", () => {
  it("the invoice inbox uses the same list as the expense form", () => {
    expect([...INBOX_CATEGORIES]).toEqual([...EXPENSE_CATEGORIES]);
  });

  it("every canonical key has a Dutch and an English label", () => {
    for (const key of EXPENSE_CATEGORIES) {
      expect((nlExpenses as any).form.categories[key], `nl ${key}`).toBeTruthy();
      expect((enExpenses as any).form.categories[key], `en ${key}`).toBeTruthy();
    }
    expect(formatExpenseCategory("toll")).toBe("Tol");
    expect(formatExpenseCategory("parking")).toBe("Parkeren");
    expect(formatExpenseCategory("fuel")).toBe("Brandstof");
  });
});

describe("expense categories: no screen prints the raw key", () => {
  beforeEach(() => {
    appQueryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (path === "/api/vehicles/1") return json(vehicle);
      if (path === "/api/expenses/vehicle/1") return json(expenses);
      if (path === "/api/vehicles/1/spare-assignment" || path === "/api/vehicles/1/acting-as-spare") return json(null, 404);
      return json([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderDetails() {
    return render(
      <QueryClientProvider client={appQueryClient}>
        <GlobalDialogProvider>
          <VehicleDetails vehicleId={1} inDialogContext onClose={() => {}} />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
  }

  it("the vehicle Kosten tab names each category with its label, in the group header and the summary", async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(await screen.findByRole("tab", { name: "Kosten" }));
    const panel = await screen.findByRole("tabpanel");
    await waitFor(() => expect(within(panel).getAllByText("Brandstof").length).toBeGreaterThanOrEqual(2));
    expect(within(panel).getAllByText("Tol").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).queryByText(/^(fuel|toll)$/i)).toBeNull();
    expect(panel.textContent).not.toMatch(/\b(fuel|toll)\b/);
  });

  it("the Geschiedenis tab names the category of an added expense with its label", async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(await screen.findByRole("tab", { name: "Geschiedenis" }));
    const panel = await screen.findByRole("tabpanel");
    await waitFor(() => expect(panel.textContent).toContain("Brandstof"));
    expect(panel.textContent).not.toMatch(/\b(fuel|toll)\b/);
  });
});

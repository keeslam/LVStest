/**
 * Fix round 1, item 2b (review of the merged office-date sweep, commit
 * 982f20a1) — `reservation-form.tsx`'s BV -> Opnaam conversion (around line
 * 917) reads "today" with `officeToday()` (Europe/Amsterdam), not
 * `new Date().toISOString().split("T")[0]` (UTC). Submitting a new
 * reservation for a BV-registered vehicle silently converts it to Opnaam
 * first (required for rental insurance/tax) — no confirmation dialog sits in
 * the way, so there is nothing extra to drive here beyond the form itself.
 *
 * `dutch-ui-leaks.test.tsx` already renders the real `<ReservationForm />`
 * for an unrelated reason (the "Huur zonder einddatum" default) but never
 * submits it; this is a new, narrow file next to it rather than adding an
 * unrelated concern there.
 *
 * The clock stands at 00:30 in Amsterdam on 21 September 2026, which is
 * still 20 September in UTC — the exact window the old helper got wrong.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ReservationForm } from "@/components/reservations/reservation-form";

// Same mocks dutch-ui-leaks.test.tsx uses to render ReservationForm in
// isolation — none of these dialogs are opened by this test, but
// ReservationForm imports them unconditionally.
vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: () => null,
  ReturnDialog: () => null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

const OFFICE_TODAY = "2026-09-21";

// BV-registered (company: "true") — selecting it and submitting is what
// triggers the BV -> Opnaam conversion PATCH.
const vehicle = {
  id: 1821,
  licensePlate: "HL-02-HL",
  brand: "Volkswagen",
  model: "Crafter",
  company: "true",
  registeredTo: "false",
  currentMileage: 25600,
};

const customer = { id: 55, name: "Testklant Bv" };

let requests: Array<{ url: string; method: string; body: any }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  requests = [];
  // Only `Date` is faked: user-event keeps its own real timers, same
  // approach as office-today-prefill.test.tsx.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
    requests.push({ url, method, body });
    if (url === "/api/vehicles" && method === "GET") return json([vehicle]);
    if (url === `/api/vehicles/${vehicle.id}` && method === "GET") return json(vehicle);
    if (url === "/api/customers" && method === "GET") return json([customer]);
    if (url === "/api/reservations" && method === "POST") return json({ id: 999, status: "booked" });
    return json([]);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationForm initialVehicleId={String(vehicle.id)} initialCustomerId={String(customer.id)} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("Kantoordatum bij BV -> Opnaam omzetting (fix round 1)", () => {
  it("stamps the vehicle's registeredToDate with the office day, not the UTC day", async () => {
    const user = userEvent.setup();
    renderForm();

    // Wait for the pre-selected vehicle's own data to arrive (rendered by
    // ReadonlyVehicleDisplay) before submitting — the mutation's BV check
    // reads `selectedVehicle`, which resolves from the (separately fetched)
    // vehicles list; submitting before either has loaded would silently skip
    // the BV -> Opnaam conversion instead of failing loudly.
    await screen.findByText("Volkswagen Crafter");

    const submit = await screen.findByTestId("button-submit-reservation");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => {
      const patch = requests.find((r) => r.url === `/api/vehicles/${vehicle.id}` && r.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch!.body.registeredToDate).toBe(OFFICE_TODAY);
    });
  });
});

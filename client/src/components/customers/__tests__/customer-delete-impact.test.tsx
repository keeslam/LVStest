/**
 * besluiten.md **B-08** (OPT-033, BUG-007) — "prullenbak plus blokkade bij een
 * lopende of toekomstige huur, **vooraf een duidelijke impactlijst**".
 *
 * The server half exists: `GET /api/customers/:id/delete-impact` names the
 * counts and the rentals that stand in the way, and `DELETE` answers 409
 * `CUSTOMER_HAS_LIVE_RESERVATIONS`. PHASE 57 found that the dialog read none of
 * it: it asked "Weet je zeker?" and deleted on one click. The vehicle dialog
 * has done this properly since wave 11; this is the same pattern for customers.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerDeleteDialog } from "@/components/customers/customer-delete-dialog";

const CUSTOMER_ID = 1272;
const CUSTOMER_NAME = "Handleiding-klant Bv";

let deleteCalls: number;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impact: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/delete-impact")) return jsonResponse(impact);
    if (method === "DELETE") {
      deleteCalls += 1;
      return new Response(null, { status: 204 });
    }
    return jsonResponse([]);
  }));
}

beforeEach(() => {
  deleteCalls = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async ({ queryKey }) => (await fetch(queryKey[0] as string)).json(),
        retry: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <CustomerDeleteDialog
        customerId={CUSTOMER_ID}
        customerName={CUSTOMER_NAME}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("B-08 — de klant verwijderen begint met de impactlijst", () => {
  it("shows what goes with the customer and keeps delete out of reach until the name is typed back", async () => {
    stubFetch({
      customer: { id: CUSTOMER_ID, name: CUSTOMER_NAME, companyName: "" },
      counts: { reservations: 6, drivers: 1 },
      blocked: false,
      blockingReservations: [],
      restorable: true,
    });
    const user = userEvent.setup();
    renderDialog();

    const impact = await screen.findByTestId("customer-delete-impact");
    await waitFor(() => expect(impact).toHaveTextContent(/6\s+reserveringen/i));
    expect(impact).toHaveTextContent(/1\s+chauffeurs/i);

    const confirm = screen.getByTestId(`button-confirm-delete-${CUSTOMER_ID}`);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(deleteCalls).toBe(0);

    await user.type(screen.getByTestId(`input-confirm-delete-${CUSTOMER_ID}`), CUSTOMER_NAME);
    await waitFor(() => expect(screen.getByTestId(`button-confirm-delete-${CUSTOMER_ID}`)).toBeEnabled());
    await user.click(screen.getByTestId(`button-confirm-delete-${CUSTOMER_ID}`));
    await waitFor(() => expect(deleteCalls).toBe(1));
  });

  it("names the rentals that block the delete and never enables the button", async () => {
    stubFetch({
      customer: { id: CUSTOMER_ID, name: CUSTOMER_NAME, companyName: "" },
      counts: { reservations: 6 },
      blocked: true,
      blockingReservations: [
        { id: 3370, vehicleId: 1821, startDate: "2026-09-13", endDate: "2026-09-16", status: "booked" },
      ],
      restorable: true,
    });
    const user = userEvent.setup();
    renderDialog();

    const blocked = await screen.findByTestId("customer-delete-blocked");
    expect(blocked).toHaveTextContent("3370");
    expect(blocked).toHaveTextContent("13-09-2026");

    // Even with the name typed back exactly right, the delete stays out of reach.
    await user.type(screen.getByTestId(`input-confirm-delete-${CUSTOMER_ID}`), CUSTOMER_NAME);
    await waitFor(() => {
      expect(screen.getByTestId(`button-confirm-delete-${CUSTOMER_ID}`)).toBeDisabled();
    });
    expect(deleteCalls).toBe(0);
  });
});

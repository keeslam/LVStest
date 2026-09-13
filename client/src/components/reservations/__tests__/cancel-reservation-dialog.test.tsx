/**
 * besluiten.md **B-04** (OPT-028, BUG-112) — "vragen wat er mee moet, daarna
 * uitvoeren".
 *
 * The server half has existed since phase 34: `GET /:id/cancel-impact` says
 * what hangs off the rental, and `PATCH /:id/status {status:'cancelled',
 * cascade:{…}}` closes exactly what the caller asked for. PHASE 57 found that
 * nothing in the app ever called either of them — the desk set the status to
 * *Geannuleerd* in the edit form and the transport, the spare, the placeholder
 * and the driver assignment all stayed open, silently.
 *
 * This is the missing half: the dialog names every linked record and passes
 * the answers on as the cascade flags.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CancelReservationDialog } from "@/components/reservations/cancel-reservation-dialog";

const RESERVATION_ID = 3364;

const impact = {
  transports: [
    { id: 811, scheduledDate: "2026-10-05", status: "scheduled", transportType: "delivery" },
  ],
  spares: [
    { id: 3366, vehicleId: 1821, startDate: "2026-10-05", endDate: "2026-10-12", status: "booked" },
  ],
  placeholders: [
    { id: 3370, startDate: "2026-10-06", endDate: null, status: "booked" },
  ],
  drivers: [
    { id: 44, driverId: 9, assignedFrom: "2026-10-05" },
  ],
};

let statusCalls: Array<Record<string, any>>;
let impactRequested: number;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  statusCalls = [];
  impactRequested = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/cancel-impact")) {
        impactRequested += 1;
        return jsonResponse(impact);
      }
      if (url.endsWith(`/api/reservations/${RESERVATION_ID}/status`) && method === "PATCH") {
        statusCalls.push(init?.body ? JSON.parse(init.body) : {});
        return jsonResponse({ id: RESERVATION_ID, status: "cancelled" });
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // The same convention the app's queryClient uses: the key is the URL.
        queryFn: async ({ queryKey }) => (await fetch(queryKey[0] as string)).json(),
        retry: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <CancelReservationDialog
        open
        onOpenChange={() => {}}
        reservationId={RESERVATION_ID}
      />
    </QueryClientProvider>,
  );
}

describe("B-04 — annuleren vraagt wat er met het gekoppelde mee moet", () => {
  it("names every linked record before anything is cancelled", async () => {
    renderDialog();

    const list = await screen.findByTestId("cancel-impact-list");
    await waitFor(() => expect(impactRequested).toBeGreaterThan(0));

    // One line per kind, each naming the record the employee has to decide about.
    expect(screen.getByTestId("cancel-impact-transports")).toHaveTextContent("811");
    expect(screen.getByTestId("cancel-impact-spares")).toHaveTextContent("3366");
    expect(screen.getByTestId("cancel-impact-placeholders")).toHaveTextContent("3370");
    expect(screen.getByTestId("cancel-impact-drivers")).toBeInTheDocument();
    expect(list).toBeInTheDocument();

    // Nothing has been written yet: this is the question, not the action.
    expect(statusCalls).toHaveLength(0);
  });

  it("passes the chosen cascade flags, per linked record, to the existing endpoint", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("cancel-impact-transports");

    // Let the transport and the driver assignment go with it; keep the spare
    // and the placeholder standing.
    await user.click(screen.getByTestId("cancel-cascade-transports"));
    await user.click(screen.getByTestId("cancel-cascade-drivers"));

    await user.click(screen.getByTestId("button-confirm-cancel-reservation"));

    await waitFor(() => expect(statusCalls).toHaveLength(1));
    expect(statusCalls[0].status).toBe("cancelled");
    expect(statusCalls[0].cascade).toEqual({
      transports: true,
      spares: false,
      placeholders: false,
      drivers: true,
    });
  });

  it("still cancels the rental itself when nothing linked goes with it", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("cancel-impact-transports");

    await user.click(screen.getByTestId("button-confirm-cancel-reservation"));

    await waitFor(() => expect(statusCalls).toHaveLength(1));
    expect(statusCalls[0].status).toBe("cancelled");
    expect(statusCalls[0].cascade).toEqual({
      transports: false,
      spares: false,
      placeholders: false,
      drivers: false,
    });
  });
});

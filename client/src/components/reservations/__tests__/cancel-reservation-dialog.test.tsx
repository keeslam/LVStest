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

// The real toast hook, observed: B-33 needs to read what a refusal says.
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: toastSpy,
}));

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
/** What GET /api/reservations/:id answers - the dialog reads the row to know whether it was picked up. */
let reservationRow: Record<string, unknown>;
/** What PATCH .../status answers; the default is a plain success. */
let statusResponse: (callIndex: number) => Response;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  statusCalls = [];
  impactRequested = 0;
  toastSpy.mockClear();
  reservationRow = { id: RESERVATION_ID, status: "booked", type: "standard", actualPickupDate: null, contractNumber: null };
  statusResponse = () => jsonResponse({ id: RESERVATION_ID, status: "cancelled" });
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
        return statusResponse(statusCalls.length - 1);
      }
      if (url.endsWith(`/api/reservations/${RESERVATION_ID}`) && method === "GET") {
        return jsonResponse(reservationRow);
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
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
        onOpenChange={onOpenChange}
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

describe("B-33 — a rental that has been picked up", () => {
  const pickedUpRow = {
    id: RESERVATION_ID, status: "picked_up", type: "standard", actualPickupDate: "2026-10-02", contractNumber: "9300001",
  };

  it("warns with the pickup date and the contract, and holds the confirm button until the box is ticked", async () => {
    const user = userEvent.setup();
    reservationRow = pickedUpRow;
    renderDialog();

    const warning = await screen.findByTestId("warning-picked-up");
    expect(warning).toHaveTextContent("Deze huur is al opgehaald op 02-10-2026 met contract 9300001.");
    // Spec §3: cancelling does not revert the vehicle, and the dialog says so.
    expect(warning).toHaveTextContent("kilometerstand blijft de stand van het ophalen");

    const confirm = screen.getByTestId("button-confirm-cancel-reservation");
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(statusCalls).toHaveLength(0);

    await user.click(screen.getByTestId("checkbox-confirm-picked-up"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(statusCalls).toHaveLength(1));
    expect(statusCalls[0].status).toBe("cancelled");
    expect(statusCalls[0].confirmPickedUp).toBe(true);
    // The B-04 cascade answers travel along unchanged.
    expect(statusCalls[0].cascade).toEqual({ transports: false, spares: false, placeholders: false, drivers: false });
  });

  it("a legacy 'active' row is a picked-up rental too", async () => {
    reservationRow = { ...pickedUpRow, status: "active" };
    renderDialog();
    expect(await screen.findByTestId("warning-picked-up")).toBeInTheDocument();
    expect(screen.getByTestId("button-confirm-cancel-reservation")).toBeDisabled();
  });

  it("a booked rental has no warning and sends no flag", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("cancel-impact-transports");
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();

    await user.click(screen.getByTestId("button-confirm-cancel-reservation"));
    await waitFor(() => expect(statusCalls).toHaveLength(1));
    expect(statusCalls[0]).not.toHaveProperty("confirmPickedUp");
  });

  it("when the screen was stale, a 409 PICKED_UP_CONFIRMATION_REQUIRED brings the warning up with the server's date and contract", async () => {
    const user = userEvent.setup();
    // The row was read as booked; somebody picked it up in the meantime.
    statusResponse = (callIndex) => callIndex === 0
      ? jsonResponse({
          message: "This rental has already been picked up. Resend with confirmPickedUp: true to cancel or delete it.",
          code: "PICKED_UP_CONFIRMATION_REQUIRED", actualPickupDate: "2026-10-03", contractNumber: "9300777",
        }, 409)
      : jsonResponse({ id: RESERVATION_ID, status: "cancelled" });
    renderDialog();
    await screen.findByTestId("cancel-impact-transports");
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();

    await user.click(screen.getByTestId("button-confirm-cancel-reservation"));
    const warning = await screen.findByTestId("warning-picked-up");
    expect(warning).toHaveTextContent("opgehaald op 03-10-2026 met contract 9300777");
    // Not the failure toast: the 409 is a question, not an error. And never the English message.
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(screen.queryByText(/Resend with confirmPickedUp/)).toBeNull();

    const confirm = screen.getByTestId("button-confirm-cancel-reservation");
    expect(confirm).toBeDisabled();
    await user.click(screen.getByTestId("checkbox-confirm-picked-up"));
    await user.click(confirm);

    await waitFor(() => expect(statusCalls).toHaveLength(2));
    expect(statusCalls[0]).not.toHaveProperty("confirmPickedUp");
    expect(statusCalls[1].confirmPickedUp).toBe(true);
    // Let the success path finish (its toast) so it cannot leak into the next test.
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Reservering geannuleerd" })));
  });

  it("a 403 PICKED_UP_RIGHT_REQUIRED is told in Dutch, by code, and the dialog stays open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    reservationRow = pickedUpRow;
    statusResponse = () => jsonResponse({
      message: "Not authorized. One of these permissions required: cancel_picked_up_rental",
      code: "PICKED_UP_RIGHT_REQUIRED", requiredPermission: "cancel_picked_up_rental",
    }, 403);
    renderDialog(onOpenChange);

    await screen.findByTestId("warning-picked-up");
    await user.click(screen.getByTestId("checkbox-confirm-picked-up"));
    await user.click(screen.getByTestId("button-confirm-cancel-reservation"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    const toast = toastSpy.mock.calls.map(([call]) => call).find((call) => call.variant === "destructive")!;
    expect(toast.description).toContain("Opgehaalde huur annuleren of verwijderen");
    expect(JSON.stringify(toast)).not.toContain("Not authorized");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

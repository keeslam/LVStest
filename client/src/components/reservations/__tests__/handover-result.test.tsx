/**
 * OPT-005 — the dialog half.
 *
 * "Contract klaar" with Afdrukken / Mail naar klant, or "Contract kon niet
 * gemaakt worden" with Opnieuw proberen — instead of an unconditional
 * "Contract is gegenereerd" and a close-reopen-scroll-expand-preview cycle to
 * get the paper to the customer.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HandoverResultDialog } from "@/components/reservations/handover-result-dialog";

const reservation = {
  id: 3563,
  vehicleId: 1866,
  customerId: 12,
  startDate: "2026-10-20",
  endDate: "2026-10-30",
  status: "picked_up",
  vehicle: { id: 1866, licensePlate: "AB123C", brand: "VW", model: "Crafter" },
  customer: { id: 12, name: "Klant", email: "klant@example.invalid" },
} as any;

const contract = {
  id: 501,
  reservationId: 3563,
  vehicleId: 1866,
  documentType: "Contract (Unsigned)",
  fileName: "contract-3563-v1.pdf",
  version: 1,
} as any;

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;
let openMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ contractDocument: { ...contract, id: 502, version: 2 } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  openMock = vi.fn(() => null);
  vi.stubGlobal("open", openMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-005 — het contract vanuit de ophaaldialoog", () => {
  it("says the contract is ready and offers to print or mail it", () => {
    withClient(
      <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={contract} kind="contract" />,
    );
    expect(screen.getByText("Contract klaar")).toBeInTheDocument();
    expect(screen.getByTestId("button-handover-print")).toHaveTextContent("Afdrukken");
    expect(screen.getByTestId("button-handover-email")).toHaveTextContent("Mail naar klant");
    // Nothing to retry when it worked.
    expect(screen.queryByTestId("button-handover-retry")).toBeNull();
  });

  it("prints the document itself, in its own window", async () => {
    const user = userEvent.setup();
    withClient(
      <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={contract} kind="contract" />,
    );
    await user.click(screen.getByTestId("button-handover-print"));
    expect(openMock).toHaveBeenCalledWith(
      "/api/documents/view/501",
      "documentPrintWindow",
      expect.any(String),
    );
  });

  it("says so when the contract could not be made, and offers a retry", () => {
    withClient(
      <HandoverResultDialog
        open
        onOpenChange={() => {}}
        reservation={reservation}
        document={null}
        errorMessage="Geen bruikbaar contractsjabloon gevonden"
        kind="contract"
      />,
    );
    expect(screen.getByText("Contract kon niet gemaakt worden")).toBeInTheDocument();
    // The server's own reason, not a generic sentence.
    expect(screen.getByText("Geen bruikbaar contractsjabloon gevonden")).toBeInTheDocument();
    expect(screen.getByTestId("button-handover-retry")).toHaveTextContent("Opnieuw proberen");
    expect(screen.queryByTestId("button-handover-print")).toBeNull();
  });

  it("the retry produces the contract and the dialog flips to the ready state", async () => {
    const user = userEvent.setup();
    withClient(
      <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="contract" />,
    );
    await user.click(screen.getByTestId("button-handover-retry"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/reservations/3563/contract");
    expect(await screen.findByText("Contract klaar")).toBeInTheDocument();
    expect(screen.getByTestId("button-handover-print")).toBeInTheDocument();
  });

  it("the return dialog's damage check has no retry, only print and mail", () => {
    withClient(
      <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="damageCheck" />,
    );
    expect(screen.getByText("Schadeformulier kon niet gemaakt worden")).toBeInTheDocument();
    expect(screen.queryByTestId("button-handover-retry")).toBeNull();
  });
});

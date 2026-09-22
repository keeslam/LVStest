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
import { UserPermission, UserRole } from "@shared/schema";

// Fix round 1, item 3: RequiresPermission (wrapped around button-handover-retry)
// reads the signed-in user via useAuth() — this file's existing tests are
// about the dialog's own states, not permissions, so it defaults to admin
// (bypasses every check) to keep every existing assertion unaffected. Mutable
// so the two new permission-focused tests below can override it.
let mockRole: string = UserRole.ADMIN;
let mockPermissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: mockRole, permissions: mockPermissions }, isLoading: false }),
}));

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
  mockRole = UserRole.ADMIN;
  mockPermissions = [];
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

  describe("fix round 1, item 3 — button-handover-retry needs BOTH permissions the server chains", () => {
    it("is visible but disabled, and explains itself, holding only one of the two rights", async () => {
      mockRole = UserRole.USER;
      mockPermissions = [UserPermission.MANAGE_RESERVATIONS]; // missing MANAGE_DOCUMENTS
      withClient(
        <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="contract" />,
      );
      const button = screen.getByTestId("button-handover-retry");
      expect(button).toBeVisible();
      expect(button).toHaveAttribute("aria-disabled", "true");
      // Focus the wrapping <span> directly rather than via Tab traversal —
      // the real, already-open Radix Dialog around this control runs its own
      // focus management on mount, which would otherwise race Tab's landing
      // spot (unlike requires-permission.test.tsx's bare, dialog-free render).
      (button.parentElement as HTMLElement).focus();
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent("Documenten bewerken en genereren");
      });
      await userEvent.click(button, { pointerEventsCheck: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is enabled holding both MANAGE_RESERVATIONS and MANAGE_DOCUMENTS", async () => {
      mockRole = UserRole.USER;
      mockPermissions = [UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_DOCUMENTS];
      const user = userEvent.setup();
      withClient(
        <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="contract" />,
      );
      const button = screen.getByTestId("button-handover-retry");
      expect(button).not.toBeDisabled();
      await user.click(button);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    });
  });
});

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

// B-34 — the retry toast's *content* (translated by code, never the raw
// "409: ..." text) cannot be observed through the real hook: it only updates
// an in-memory store, and no <Toaster/> is mounted in these tests. Captured
// the same way client/src/components/vehicles/__tests__/bulk-row-results.test.tsx
// does it.
const toasts: any[] = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
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
  toasts.length = 0;
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

  describe("B-34 — a Dutch reason per contract error code, translated by `code` and never by matching the English message", () => {
    it.each([
      ["NO_TEMPLATE", "Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen en klik dan op Opnieuw proberen."],
      ["NO_DEFAULT_TEMPLATE", "Er zijn meerdere sjablonen maar geen standaard. Kies een standaardsjabloon onder Documenten → Contractsjablonen."],
      ["TEMPLATE_WITHOUT_FIELDS", "Het contractsjabloon heeft geen velden. Vul het sjabloon onder Documenten → Contractsjablonen."],
      ["TEMPLATE_BACKGROUND_MISSING", "De achtergrond van het contractsjabloon kon niet worden gelezen. Upload de achtergrond opnieuw onder Documenten → Contractsjablonen."],
      ["NO_VEHICLE", "Het voertuig van deze reservering kon niet worden gevonden. Controleer het voertuig en probeer het opnieuw."],
      ["PLACEHOLDER_RESERVATION", "Aan deze reservering is nog geen voertuig gekoppeld. Ken een voertuig toe en genereer het contract daarna opnieuw."],
      ["NO_CUSTOMER", "Aan deze reservering is geen klant gekoppeld, dus het contract kan niet worden gemaakt. Voeg een klant toe aan de reservering."],
      ["MAINTENANCE_BLOCK", "Dit is een onderhoudsblok, geen verhuur — hier hoort geen contract bij."],
    ])("%s shows its own Dutch sentence, not the raw server message", (code, dutch) => {
      withClient(
        <HandoverResultDialog
          open
          onOpenChange={() => {}}
          reservation={reservation}
          document={null}
          errorMessage="raw english server text that must not be shown"
          errorCode={code as any}
          kind="contract"
        />,
      );
      expect(screen.getByText(dutch)).toBeInTheDocument();
      expect(screen.queryByText("raw english server text that must not be shown")).toBeNull();
    });

    it("RENDER_FAILED is the one code that also shows the server's own text, as a technical detail", () => {
      withClient(
        <HandoverResultDialog
          open
          onOpenChange={() => {}}
          reservation={reservation}
          document={null}
          errorMessage="pdf-lib threw while embedding the background"
          errorCode={"RENDER_FAILED" as any}
          kind="contract"
        />,
      );
      expect(
        screen.getByText(
          "Het contract kon niet worden gemaakt door een technische fout. Probeer het opnieuw; blijft het misgaan, meld dan deze tekst: pdf-lib threw while embedding the background",
        ),
      ).toBeInTheDocument();
    });

    it("a code this dialog does not translate (e.g. TEMPLATE_NOT_FOUND) falls back to the server's own text, as today", () => {
      withClient(
        <HandoverResultDialog
          open
          onOpenChange={() => {}}
          reservation={reservation}
          document={null}
          errorMessage="Template not found"
          errorCode={"TEMPLATE_NOT_FOUND" as any}
          kind="contract"
        />,
      );
      expect(screen.getByText("Template not found")).toBeInTheDocument();
    });

    it("a missing code falls back to the server's own text, as today", () => {
      withClient(
        <HandoverResultDialog
          open
          onOpenChange={() => {}}
          reservation={reservation}
          document={null}
          errorMessage="Some server text with no code at all"
          kind="contract"
        />,
      );
      expect(screen.getByText("Some server text with no code at all")).toBeInTheDocument();
    });
  });

  describe("B-34 — the retry toast", () => {
    it("shows the translated sentence for a known code, never a '409: ' prefix", async () => {
      fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "No contract template has been configured. Create one under Settings → PDF templates before generating a contract.",
            code: "NO_TEMPLATE",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      withClient(
        <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="contract" />,
      );
      await user.click(screen.getByTestId("button-handover-retry"));
      await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
      const last = toasts[toasts.length - 1];
      expect(last.title).toBe("Contract kon nog steeds niet gemaakt worden");
      expect(last.description).toBe(
        "Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen en klik dan op Opnieuw proberen.",
      );
      expect(String(last.description)).not.toMatch(/\b\d{3}:\s/);
    });

    it("falls back to the server's own text for a code it does not translate", async () => {
      fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ message: "Template not found", code: "TEMPLATE_NOT_FOUND" }), {
          status: 404, headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      withClient(
        <HandoverResultDialog open onOpenChange={() => {}} reservation={reservation} document={null} kind="contract" />,
      );
      await user.click(screen.getByTestId("button-handover-retry"));
      await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
      const last = toasts[toasts.length - 1];
      expect(last.description).toBe("Template not found");
    });
  });
});

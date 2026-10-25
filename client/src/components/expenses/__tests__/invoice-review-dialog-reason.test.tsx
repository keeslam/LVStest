/**
 * Final review (reports phase 5): a booked invoice keeps its review reason as history. The
 * read-only dialog must show it as "Stond ter controle: ...", not as the instruction to check
 * the invoice; an invoice that really is in review keeps the instruction text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import { InvoiceReviewDialog } from "@/components/expenses/invoice-review-dialog";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const item = (status: string) => ({
  id: 12, messageId: "<a@b>", fromAddress: "facturen@garage.nl", subject: "Factuur", mailDate: null,
  attachmentName: "factuur.pdf", attachmentPath: null, attachmentHash: "h", attachmentContentType: "application/pdf",
  invoiceHash: "i", status, reviewReason: "no_plate", vehicleId: 1, expenseIds: [5], errorMessage: null, note: null,
  receivedAt: "2026-09-20T22:00:00.000Z", processedAt: null, createdBy: "scheduler", updatedBy: null, vehiclePlate: null,
  parsed: { vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-20", currency: "EUR", totalAmount: 100, plates: [], lineItems: [] },
}) as any;

function renderDialog(status: string) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <InvoiceReviewDialog item={item(status)} vehicles={[]} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("InvoiceReviewDialog: controlereden", () => {
  it("geboekte factuur met bewaarde reden: toont 'Stond ter controle' en niet de opdracht", async () => {
    renderDialog("booked");
    expect(await screen.findByText("Stond ter controle: Geen kenteken gevonden")).toBeInTheDocument();
    expect(screen.queryByText(/Controleer wat de app heeft uitgelezen/)).not.toBeInTheDocument();
  });

  it("factuur in controle: ongewijzigde tekst met reden en opdracht", async () => {
    renderDialog("review");
    expect(await screen.findByText("Geen kenteken gevonden. Controleer wat de app heeft uitgelezen, kies het voertuig en boek de kosten.")).toBeInTheDocument();
    expect(screen.queryByText(/Stond ter controle/)).not.toBeInTheDocument();
  });
});

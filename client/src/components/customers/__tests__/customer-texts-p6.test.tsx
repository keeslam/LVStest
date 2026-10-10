/**
 * Audit A-4-3 / A-4-5 / A-4-6 — Dutch texts on the customer screens.
 *
 * A-4-3: the confirm button of "Chauffeur verwijderen" said "Delete" (and the paging said
 * "Page 1 of 2 (11 drivers)", "Previous", "Next").
 * A-4-5: US sample values (John Doe, Main Street), "1 driver(s)", "New Reservation".
 * A-4-6: the form says which fields a reservation and an invoice need.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { CustomerDetails } from "@/components/customers/customer-details";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomerDeleteDialog } from "@/components/customers/customer-delete-dialog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const customer = {
  id: 7,
  name: "Voorbeeld B.V.",
  email: "info@voorbeeld.nl",
  phone: "0201234567",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const drivers = Array.from({ length: 11 }, (_, i) => ({
  id: 100 + i,
  customerId: 7,
  displayName: `Chauffeur ${i + 1}`,
  firstName: "Jan",
  lastName: `Nummer${i + 1}`,
  status: "active",
  isPrimaryDriver: false,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (path === "/api/customers/7") return json(customer);
      if (path === "/api/customers/7/drivers") return json(drivers);
      if (path.endsWith("/delete-impact")) return json({ counts: { drivers: 1, reservations: 2, portal_customer_settings: 1 }, blocked: false, blockingReservations: [] });
      return json([]);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/customers/7", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("A-4-3 / A-4-5 — the Chauffeurs tab", () => {
  it("confirms a delete with 'Verwijderen', pages in Dutch and counts '11 chauffeurs'", async () => {
    const user = userEvent.setup();
    withProviders(<CustomerDetails customerId={7} initialTab="drivers" />);

    await user.click(await screen.findByTestId("button-delete-driver-100"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Verwijderen" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Annuleren" }));

    expect(screen.getByText(/Pagina 1 van 2 \(11 chauffeurs\)/)).toBeInTheDocument();
    expect(screen.getByTestId("button-driver-prev-page")).toHaveTextContent("Vorige");
    expect(screen.getByTestId("button-driver-next-page")).toHaveTextContent("Volgende");
  });
});

describe("A-4-5 — the Actieve verhuringen tab", () => {
  it("the new-reservation button says 'Nieuwe reservering'", async () => {
    const user = userEvent.setup();
    withProviders(<CustomerDetails customerId={7} initialTab="active" />);
    const button = await screen.findByTestId("button-new-reservation-active-rentals");
    expect(button).toHaveTextContent("Nieuwe reservering");
    expect(user).toBeTruthy();
  });
});

describe("A-4-5 — the delete impact counts in the singular", () => {
  it("says '1 chauffeur' and '2 reserveringen'", async () => {
    withProviders(<CustomerDeleteDialog customerId={7} customerName="Voorbeeld B.V." open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/2\s+reserveringen/)).toBeInTheDocument());
    expect(screen.getByText(/1\s+chauffeur(?!s)/)).toBeInTheDocument();
    expect(screen.getByText(/1\s+portaalinstelling(?!en)/)).toBeInTheDocument();
  });
});

describe("A-4-5 / A-4-6 — the customer form", () => {
  it("uses Dutch sample values, not John Doe", async () => {
    withProviders(<CustomerForm redirectToList={false} />);
    const name = await screen.findByLabelText("Volledige naam");
    expect(name).toHaveAttribute("placeholder", "Jan Jansen");
    expect(screen.getByTestId("input-debtor-number")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/John Doe|Main Street|Main St/);
  });

  it("says which fields a reservation and an invoice need", async () => {
    withProviders(<CustomerForm redirectToList={false} />);
    const hint = await screen.findByTestId("text-customer-required-hint");
    expect(hint).toHaveTextContent("Voor een reservering");
    expect(hint).toHaveTextContent("Voor het contract");
    expect(hint).toHaveTextContent("rijbewijsnummer");
    expect(hint).not.toHaveTextContent(/btw/i);
  });
});

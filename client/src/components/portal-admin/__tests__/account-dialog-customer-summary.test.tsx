/**
 * Owner feedback 11-10-2026: after choosing a customer in "Portaalaccount" the name is prefilled
 * like the e-mail address (contact person, else company name; never over a typed name), a compact
 * summary card shows who the customer is (Bedrijf / Contactpersoon / ...), and the combobox option
 * reads "Bedrijf — contactpersoon" when both exist.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDialog } from "@/components/portal-admin/account-dialog";
import { getQueryFn } from "@/lib/queryClient";

const customers = [
  {
    id: 3, name: "Bouw B.V.", companyName: "Bouw B.V.", contactPerson: "Piet Jansen", driverName: null, debtorNumber: "D-0003",
    email: "info@bouw.example", phone: "010-1234567", postalCode: "3011 AB", city: "Rotterdam",
  },
  {
    id: 4, name: "Vervoer Smit B.V.", companyName: "Vervoer Smit B.V.", contactPerson: null, driverName: null, debtorNumber: "D-0004",
    email: "smit@example.com", phone: null, postalCode: null, city: null,
  },
];
const drivers = [{ id: 1, displayName: "Chauffeur A" }, { id: 2, displayName: "Chauffeur B" }];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByTestId("select-portal-customer"));
  await user.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url);
    const one = customers.find((c) => path.endsWith(`/api/customers/${c.id}`));
    const body = path.endsWith("/api/customers") ? customers : path.endsWith("/drivers") ? drivers : one ?? [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("portaalaccount - klant gekozen", () => {
  it("shows 'Bedrijf — contactpersoon' in the option when both exist, only the company otherwise", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("select-portal-customer"));
    expect(await screen.findByRole("option", { name: /Bouw B\.V\. — Piet Jansen/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Vervoer Smit B\.V\./ })).not.toHaveTextContent("—");
  });

  it("prefills the name with the contact person and says where it came from", async () => {
    const user = userEvent.setup();
    renderDialog();
    await choose(user, /Bouw B\.V\./);
    await waitFor(() => expect(screen.getByTestId("input-account-name")).toHaveValue("Piet Jansen"));
    expect(screen.getAllByText("Vooraf ingevuld vanuit de klantgegevens; aanpassen mag.")).toHaveLength(2); // e-mail and name
  });

  it("falls back to the company name when there is no contact person", async () => {
    const user = userEvent.setup();
    renderDialog();
    await choose(user, /Vervoer Smit B\.V\./);
    await waitFor(() => expect(screen.getByTestId("input-account-name")).toHaveValue("Vervoer Smit B.V."));
  });

  it("does not overwrite a name that was typed before the customer was chosen", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(await screen.findByTestId("input-account-name"), "Karin de Vries");
    await choose(user, /Bouw B\.V\./);
    await waitFor(() => expect(screen.getByTestId("input-account-email")).toHaveValue("info@bouw.example"));
    expect(screen.getByTestId("input-account-name")).toHaveValue("Karin de Vries");
  });

  it("shows a summary card with company, contact person, debtor number, phone, e-mail, address and driver count", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByTestId("portal-customer-summary")).toBeNull();
    await choose(user, /Bouw B\.V\./);
    const card = await screen.findByTestId("portal-customer-summary");
    const text = card.textContent ?? "";
    expect(text).toContain("Bedrijf: Bouw B.V.");
    expect(text).toContain("Contactpersoon: Piet Jansen");
    expect(text).toContain("Debiteurnr.: D-0003");
    expect(text).toContain("Telefoon: 010-1234567");
    expect(text).toContain("E-mail: info@bouw.example");
    expect(text).toContain("Adres: 3011 AB Rotterdam");
    await waitFor(() => expect(within(card).getByTestId("summary-drivers")).toHaveTextContent("2"));
  });

  it("leaves out what the customer does not have", async () => {
    const user = userEvent.setup();
    renderDialog();
    await choose(user, /Vervoer Smit B\.V\./);
    const card = await screen.findByTestId("portal-customer-summary");
    expect(within(card).queryByTestId("summary-contact")).toBeNull();
    expect(within(card).queryByTestId("summary-phone")).toBeNull();
    expect(within(card).queryByTestId("summary-address")).toBeNull();
  });
});

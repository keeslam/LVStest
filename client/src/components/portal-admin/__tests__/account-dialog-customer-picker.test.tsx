/**
 * Inviting a portal account from the Klantenportaal page: picking the customer.
 *
 * Reported on 16 September: choosing a customer did nothing. The picker is a
 * listbox bound to `customerId`, which starts as null (rendered as value "").
 * No option had that value, so React fell back to marking the first customer
 * as selected. The list then showed "Klant 1 B.V." highlighted while the form
 * still held no customer, and clicking that customer fired no change event —
 * nothing was filled in, and saving said a customer was required. Searching
 * down to a single result hit the same wall.
 *
 * The same dialog also never settled: the drivers query, disabled until a
 * customer is chosen, defaulted to a new empty array on every render, which
 * re-ran the prefill effect, which set state, which rendered again. In the
 * browser the page drew one frame in two seconds and ignored clicks; here the
 * test run never finished.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDialog } from "@/components/portal-admin/account-dialog";
import { getQueryFn } from "@/lib/queryClient";

const customers = [
  { id: 1, name: "Klant 1 B.V.", companyName: "Klant 1 B.V.", debtorNumber: null, email: "klant1@example.com" },
  { id: 2, name: "Klant 2 B.V.", companyName: "Klant 2 B.V.", debtorNumber: null, email: "klant2@example.com" },
];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url);
    const one = customers.find((c) => path.endsWith(`/api/customers/${c.id}`));
    const body = path.endsWith("/api/customers") ? customers : one ?? [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portaalaccount uitnodigen — klant kiezen", () => {
  it("shows no customer as chosen before one is picked", async () => {
    renderDialog();
    const picker = await screen.findByTestId("select-portal-customer") as HTMLSelectElement;
    await waitFor(() => expect(picker.querySelectorAll("option[value='1']").length).toBe(1));

    const shownAsChosen = Array.from(picker.options).filter((o) => o.selected && o.value !== "");
    expect(shownAsChosen.map((o) => o.textContent)).toEqual([]);
  });

  it("picking the first customer fills in its e-mail address", async () => {
    const user = userEvent.setup();
    renderDialog();
    const picker = await screen.findByTestId("select-portal-customer") as HTMLSelectElement;
    await waitFor(() => expect(picker.querySelectorAll("option[value='1']").length).toBe(1));

    await user.selectOptions(picker, "1");

    await waitFor(() => expect(screen.getByTestId("input-account-email")).toHaveValue("klant1@example.com"));
  });
});

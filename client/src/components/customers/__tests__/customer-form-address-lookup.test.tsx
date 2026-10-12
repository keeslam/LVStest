/**
 * The staff customer form: postcode + house number fill the street, address line and city, the fields stay
 * editable, and nothing is looked up when the form opens or for a foreign country.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { CustomerForm } from "@/components/customers/customer-form";

let lookups: string[];
let lookupAnswer: Record<string, unknown>;
let lookupStatus: number;

beforeEach(() => {
  lookups = [];
  lookupStatus = 200;
  lookupAnswer = { found: true, exact: true, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" };
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.startsWith("/api/address-lookup")) {
      lookups.push(url);
      return new Response(JSON.stringify(lookupAnswer), { status: lookupStatus, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function renderForm(initialData?: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <CustomerForm redirectToList={false} editMode={Boolean(initialData)} initialData={initialData as any} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}
const retype = async (el: HTMLElement, text: string) => { await userEvent.clear(el); await userEvent.type(el, text); };

describe("customer form — postcode lookup", () => {
  it("fills street name, address line and city, and writes the postcode with a space", async () => {
    renderForm();
    await retype(screen.getByTestId("customer-address-postcode"), "3011ad");
    await retype(screen.getByTestId("customer-address-number"), "4");
    await retype(screen.getByTestId("customer-address-addition"), "A");
    await waitFor(() => expect((document.querySelector("input[name=streetName]") as HTMLInputElement).value).toBe("Coolsingel"));
    expect((document.querySelector("input[name=address]") as HTMLInputElement).value).toBe("Coolsingel 4A");
    expect((document.querySelector("input[name=city]") as HTMLInputElement).value).toBe("Rotterdam");
    expect(screen.getByTestId("customer-address-postcode")).toHaveValue("3011 AD");
    expect(lookups.at(-1)).toContain("postcode=3011AD&number=4&addition=A");
  });

  it("does not ask anything when an existing customer is opened, and shows the stored number", async () => {
    renderForm({ id: 1, name: "Bestaand", address: "Dorpsstraat 12B", postalCode: "1234 AB", city: "Utrecht", country: "Nederland", customerType: "business", preferredLanguage: "nl" });
    await new Promise((r) => setTimeout(r, 600));
    expect(lookups).toHaveLength(0);
    expect(screen.getByTestId("customer-address-number")).toHaveValue("12");
    expect(screen.getByTestId("customer-address-addition")).toHaveValue("B");
  });

  it("keeps street and city editable and tells when the address is unknown", async () => {
    lookupAnswer = { found: false, exact: false };
    renderForm();
    await retype(screen.getByTestId("customer-address-postcode"), "3011ad");
    await retype(screen.getByTestId("customer-address-number"), "999");
    await waitFor(() => expect(screen.getByTestId("address-lookup-status")).toHaveAttribute("data-status", "notfound"));
    const city = document.querySelector("input[name=city]") as HTMLInputElement;
    await retype(city, "Eigen Plaats");
    expect(city.value).toBe("Eigen Plaats");
  });

  it("does not look anything up for a foreign country", async () => {
    renderForm();
    await retype(document.querySelector("input[name=country]") as HTMLInputElement, "België");
    await retype(screen.getByTestId("customer-address-postcode"), "3011ad");
    await retype(screen.getByTestId("customer-address-number"), "4");
    await new Promise((r) => setTimeout(r, 600));
    expect(lookups).toHaveLength(0);
  });

  it("copes with the lookup service being down", async () => {
    lookupStatus = 502;
    lookupAnswer = { message: "down", code: "ADDRESS_LOOKUP_UNAVAILABLE" };
    renderForm();
    await retype(screen.getByTestId("customer-address-postcode"), "3011ad");
    await retype(screen.getByTestId("customer-address-number"), "4");
    await waitFor(() => expect(screen.getByTestId("address-lookup-status")).toHaveAttribute("data-status", "unavailable"));
  });
});

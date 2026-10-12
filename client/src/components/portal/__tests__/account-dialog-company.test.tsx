/**
 * "Mijn account" › Bedrijf: contact and address are edited directly, the company name is only
 * shown and changed through a request, and the chamber of commerce and VAT numbers are not there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let pending: { requestId: number; newName: string } | null = null;
const refresh = vi.fn(async () => {});
let addressLine = "Dorpsstraat 1";
let lookupAnswer: Record<string, unknown> = { found: true, exact: true, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" };
const portalFetch = vi.fn(async (_method: string, url: string) => (url.includes("address-lookup") ? lookupAnswer : {}));
let current: Record<string, unknown>;
const buildMe = () => ({
  id: 1, email: "klant@example.com", fullName: "Klant", role: "admin", customerId: 2, customerName: "Klant BV", language: "nl", languageOverride: null,
  mailPreferences: { newDevice: true, requestReply: true }, pendingEmail: null, settings: {},
  company: { email: "info@klant.nl", emailForMOT: null, emailForInvoices: null, emailGeneral: null },
  companyDetails: {
    companyName: "Klant BV", contactPerson: "Petra", phone: "0612345678", address: addressLine, postalCode: "1234 AB", city: "Utrecht", country: "Nederland",
    billingAddress: null, billingPostalCode: null, billingCity: null, pendingNameChange: pending,
  },
});
vi.mock("@/hooks/use-portal-auth", () => ({ usePortalAuth: () => ({ me: current, isLoading: false, refresh, logout: async () => {} }) }));
vi.mock("@/lib/portal-api", () => ({
  portalFetch: (...args: unknown[]) => (portalFetch as (...a: unknown[]) => unknown)(...args),
  PortalApiError: class extends Error { code = "X"; },
}));

import { PortalAccountDialog } from "@/components/portal/account-dialog";

async function mount() {
  current = buildMe();
  render(<PortalAccountDialog open onClose={() => {}} />);
  await userEvent.click(screen.getByTestId("tab-account-company"));
}

describe("account dialog — company tab", () => {
  beforeEach(() => { pending = null; addressLine = "Dorpsstraat 1"; portalFetch.mockClear(); refresh.mockClear(); });

  it("shows the name read-only and the contact and address fields filled in", async () => {
    await mount();
    expect(screen.getByLabelText("Bedrijfsnaam")).toBeDisabled();
    expect(screen.getByLabelText("Bedrijfsnaam")).toHaveValue("Klant BV");
    expect(screen.getByTestId("input-detail-contactPerson")).toHaveValue("Petra");
    expect(screen.getByTestId("input-detail-city")).toHaveValue("Utrecht");
    expect(screen.getByTestId("input-company-email")).toHaveValue("info@klant.nl");
  });

  it("has no chamber of commerce or VAT field", async () => {
    await mount();
    expect(screen.queryByText(/KvK|Kamer van Koophandel|BTW|btw/i)).toBeNull();
  });

  it("saves only the part that changed", async () => {
    await mount();
    const phone = screen.getByTestId("input-detail-phone");
    await userEvent.clear(phone);
    await userEvent.type(phone, "0201234567");
    await userEvent.click(screen.getByTestId("button-save-company"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledTimes(1));
    expect(portalFetch.mock.calls[0]).toEqual(expect.arrayContaining(["PATCH", "/api/portal/me/company-details"]));
    expect((portalFetch.mock.calls[0] as unknown[])[2]).toMatchObject({ phone: "0201234567", city: "Utrecht" });
  });

  it("sends a name change as a request, not as a direct edit", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("button-request-name-change"));
    await userEvent.type(screen.getByTestId("input-new-company-name"), "Nieuwe Naam BV");
    await userEvent.click(screen.getByTestId("button-send-name-request"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/me/company-name", { newName: "Nieuwe Naam BV" }));
    expect(portalFetch).not.toHaveBeenCalledWith("PATCH", "/api/portal/me/company-details", expect.anything());
  });

  it("says a request is waiting and hides the request button", async () => {
    pending = { requestId: 9, newName: "Wachtende Naam BV" };
    await mount();
    expect(screen.getByTestId("pending-name-change")).toHaveTextContent("Wachtende Naam BV");
    expect(screen.queryByTestId("button-request-name-change")).toBeNull();
  });

  describe("postcode lookup", () => {
    const lookups = () => portalFetch.mock.calls.filter((c) => String(c[1]).includes("address-lookup"));
    const retype = async (id: string, text: string) => { const el = screen.getByTestId(id); await userEvent.clear(el); await userEvent.type(el, text); };

    it("splits the stored address line into street, number and addition", async () => {
      addressLine = "Coolsingel 4A";
      await mount();
      expect(screen.getByTestId("input-detail-address-street")).toHaveValue("Coolsingel");
      expect(screen.getByTestId("acc-address-number")).toHaveValue("4");
      expect(screen.getByTestId("acc-address-addition")).toHaveValue("A");
    });

    it("does not ask anything when the dialog opens", async () => {
      await mount();
      await new Promise((r) => setTimeout(r, 600));
      expect(lookups()).toHaveLength(0);
    });

    it("fills street and city from a postcode and number, and saves the composed address line", async () => {
      await mount();
      await retype("acc-address-postcode", "3011ad");
      await retype("acc-address-number", "4");
      await waitFor(() => expect(screen.getByTestId("input-detail-address-street")).toHaveValue("Coolsingel"));
      expect(screen.getByTestId("input-detail-city")).toHaveValue("Rotterdam");
      expect(screen.getByTestId("acc-address-postcode")).toHaveValue("3011 AD");
      expect(String(lookups()[0][1])).toContain("postcode=3011AD&number=4");
      await userEvent.click(screen.getByTestId("button-save-company"));
      await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("PATCH", "/api/portal/me/company-details", expect.objectContaining({ address: "Coolsingel 4", postalCode: "3011 AD", city: "Rotterdam" })));
    });

    it("lets the user correct the street after a lookup", async () => {
      await mount();
      await retype("acc-address-postcode", "3011ad");
      await retype("acc-address-number", "4");
      await waitFor(() => expect(screen.getByTestId("input-detail-address-street")).toHaveValue("Coolsingel"));
      await retype("input-detail-address-street", "Coolsingel-Noord");
      expect(screen.getByTestId("input-detail-address-street")).toHaveValue("Coolsingel-Noord");
    });

    it("leaves an unusual stored line untouched when only the city changes", async () => {
      addressLine = "Dorpsstraat 12 bis";
      await mount();
      await retype("input-detail-city", "Zwolle");
      await userEvent.click(screen.getByTestId("button-save-company"));
      await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("PATCH", "/api/portal/me/company-details", expect.objectContaining({ address: "Dorpsstraat 12 bis", city: "Zwolle" })));
    });

    it("does not look anything up for a foreign country", async () => {
      await mount();
      await retype("input-detail-country", "België");
      await retype("acc-address-postcode", "3011ad");
      await retype("acc-address-number", "4");
      await new Promise((r) => setTimeout(r, 600));
      expect(lookups()).toHaveLength(0);
    });

    it("looks up the billing address too, into the billing fields", async () => {
      await mount();
      await retype("acc-billing-postcode", "3011ad");
      await retype("acc-billing-number", "4");
      await waitFor(() => expect(screen.getByTestId("input-detail-billingCity")).toHaveValue("Rotterdam"));
      expect(screen.getByTestId("input-detail-billing-street")).toHaveValue("Coolsingel");
      // The visit address is not touched by the billing lookup.
      expect(screen.getByTestId("input-detail-city")).toHaveValue("Utrecht");
    });
  });
});

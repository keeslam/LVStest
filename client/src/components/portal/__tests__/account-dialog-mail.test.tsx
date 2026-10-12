/**
 * "Mijn account" › E-mailmeldingen: every account sees its own two switches, only an admin
 * sees the company ones, and a switch saves the moment it is flipped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let role: "admin" | "driver" = "admin";
let prefs = { newDevice: true, requestReply: true };
const refresh = vi.fn(async () => {});
const portalFetch = vi.fn(async () => ({}));

// One object per test: the dialog resets its form in an effect on `me`, so a new object on every render would loop.
let current: Record<string, unknown>;
const buildMe = () => ({
  id: 1, email: "klant@example.com", fullName: "Klant", role, customerId: 2, customerName: "Klant BV", language: "nl", languageOverride: null,
  mailPreferences: prefs,
  companyMail: role === "admin" ? { mailReservationChanges: true, mailMaintenance: false, mailDocuments: true } : undefined,
  company: role === "admin" ? { email: null, emailForMOT: null, emailForInvoices: null, emailGeneral: null } : undefined, pendingEmail: null, settings: {},
});
vi.mock("@/hooks/use-portal-auth", () => ({
  usePortalAuth: () => ({ me: current, isLoading: false, refresh, logout: async () => {} }),
}));
vi.mock("@/lib/portal-api", () => ({
  portalFetch: (...args: unknown[]) => portalFetch(...(args as [])),
  PortalApiError: class extends Error { code = "X"; },
}));

import { PortalAccountDialog } from "@/components/portal/account-dialog";

// The mail switches live on their own tab; open it like a customer would.
async function mount() { current = buildMe(); render(<PortalAccountDialog open onClose={() => {}} />); await userEvent.click(screen.getByTestId("tab-account-mail")); }

describe("account dialog — e-mail notifications", () => {
  beforeEach(() => { role = "admin"; prefs = { newDevice: true, requestReply: true }; portalFetch.mockClear(); refresh.mockClear(); });

  it("gives an admin four tabs and a driver three (no company tab)", async () => {
    await mount();
    expect(screen.getByTestId("tab-account-company")).toBeInTheDocument();
    cleanup();
    role = "driver";
    await mount();
    expect(screen.queryByTestId("tab-account-company")).toBeNull();
    expect(screen.getByTestId("tab-account-profile")).toBeInTheDocument();
  });

  it("shows the account switches to a driver, without the company ones", async () => {
    role = "driver";
    await mount();
    expect(screen.getByTestId("mail-new-device")).toBeChecked();
    expect(screen.getByTestId("mail-request-reply")).toBeChecked();
    expect(screen.queryByTestId("mail-maintenance")).toBeNull();
  });

  it("shows the company switches with their current state to an admin", async () => {
    await mount();
    expect(screen.getByTestId("mail-reservation-changes")).toBeChecked();
    expect(screen.getByTestId("mail-maintenance")).not.toBeChecked();
    expect(screen.getByTestId("mail-documents")).toBeChecked();
  });

  it("saves an account switch at once and refreshes", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("mail-request-reply"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("PATCH", "/api/portal/me/mail-preferences", { requestReply: false }));
    expect(refresh).toHaveBeenCalled();
  });

  it("saves a company switch to the company route", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("mail-maintenance"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("PATCH", "/api/portal/me/company-mail", { mailMaintenance: true }));
  });

  it("warns that switching off the new-device mail removes a security alert", async () => {
    prefs = { newDevice: false, requestReply: true };
    await mount();
    expect(screen.getByTestId("mail-new-device-warning")).toBeInTheDocument();
  });

  it("shows no warning while the new-device mail is on", async () => {
    await mount();
    expect(screen.queryByTestId("mail-new-device-warning")).toBeNull();
  });
});

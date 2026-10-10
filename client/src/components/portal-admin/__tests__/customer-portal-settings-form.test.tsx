/**
 * Portal switches of one customer (audit 2026-10-09, A-4-7, A-16-5, A-16-7):
 * a line of help per switch, visible feedback after every save, and the fiscal
 * switches that depend on "Fiscale check actief" are off-limits while it is off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { CustomerPortalSettingsForm } from "@/components/portal-admin/customer-portal-settings-form";

const settings = {
  customerId: 7, portalEnabled: true, canBook: true, canManageDrivers: true, canSubmitRequests: true, canReturn: true,
  canViewFines: true, canViewContracts: true, showPrices: true, internalNotes: null,
  fiscalMobilityEnabled: false, pseudoEindheffingEnabled: false, fiscalDashboardEnabled: false,
  fiscalWarningsEnabled: false, fiscalReportsEnabled: false, driverFiscalVisibilityEnabled: false,
};
let current: Record<string, unknown>;
const calls: Array<{ method: string; body?: string }> = [];

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><CustomerPortalSettingsForm customerId={7} /><Toaster /></QueryClientProvider>);
}

beforeEach(() => {
  calls.length = 0;
  current = { ...settings };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, body: init?.body as string | undefined });
    if (method === "PATCH") current = { ...current, ...JSON.parse(init!.body as string) };
    return new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("portaalschakelaars per klant", () => {
  it("explains every switch in a line", async () => {
    renderForm();
    expect(await screen.findByText("De klant kan een huuraanvraag indienen; Lam Groep bevestigt die altijd zelf.")).toBeInTheDocument();
    expect(screen.getByText("Uit: de klant ziet geen bedragen in het portaal.")).toBeInTheDocument();
    expect(screen.getByText(/Hoofdschakelaar: zonder deze/)).toBeInTheDocument();
  });

  it("leaves the dependent fiscal switches off-limits while 'Fiscale check actief' is off", async () => {
    renderForm();
    await screen.findByTestId("switch-fiscalMobilityEnabled");
    for (const flag of ["pseudoEindheffingEnabled", "fiscalDashboardEnabled", "fiscalWarningsEnabled", "fiscalReportsEnabled", "driverFiscalVisibilityEnabled"]) {
      expect(screen.getByTestId(`switch-${flag}`)).toBeDisabled();
    }
    expect(screen.getByTestId("switch-fiscalMobilityEnabled")).toBeEnabled();
    expect(screen.getByText(/Zet eerst "Fiscale check actief" aan/)).toBeInTheDocument();
  });

  it("opens the dependants once the main switch is on", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("switch-fiscalMobilityEnabled"));
    await waitFor(() => expect(screen.getByTestId("switch-fiscalReportsEnabled")).toBeEnabled());
    expect(screen.queryByText(/Zet eerst "Fiscale check actief" aan/)).not.toBeInTheDocument();
  });

  it("still lets staff turn off a dependent that was left on while the main switch is off", async () => {
    current = { ...settings, fiscalReportsEnabled: true };
    renderForm();
    expect(await screen.findByTestId("switch-fiscalReportsEnabled")).toBeEnabled();
  });

  it("names the switch in the toast and keeps a visible 'saved' line", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("switch-fiscalMobilityEnabled"));
    expect(await screen.findByText("Fiscale check actief: aan.")).toBeInTheDocument();
    expect(screen.getByTestId("settings-saved")).toHaveTextContent(/Opgeslagen om \d{2}:\d{2}/);
  });
});

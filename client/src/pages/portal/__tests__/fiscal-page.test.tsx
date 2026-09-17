/**
 * The customer's fiscal page: periods per vehicle with a Dutch status, the
 * questions only the customer can answer (saved by the administrator only),
 * amounts only when the customer's dashboard switch is on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let role: "admin" | "driver" = "admin";
let dashboard = false;
vi.mock("@/hooks/use-portal-auth", () => ({
  usePortalAuth: () => ({
    me: { id: 1, email: "klant@example.com", fullName: "Klant", role, customerId: 2, customerName: "Klant BV", language: "nl", settings: { canViewFiscal: true, fiscalDashboardEnabled: dashboard, driverFiscalVisibilityEnabled: true, showPrices: false } },
    isLoading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openList: () => {} }) }));

import PortalFiscalPage from "@/pages/portal/fiscal";

function period(overrides: Record<string, unknown>) {
  return {
    reservationId: 10,
    usagePeriodId: 5,
    vehicleId: 3,
    licensePlate: "AB-123-C",
    startDate: "2027-03-01",
    endDate: "2027-03-31",
    isReplacement: false,
    replacementReason: "unknown",
    replacedVehicleText: null,
    usageType: "unknown",
    privateUse: "unknown",
    commuting: "unknown",
    providedBeforeCutoff: "unknown",
    providedBeforeCutoffHint: false,
    isPool: false,
    confirmedByKind: "none",
    confirmedAt: null,
    reconfirmRequired: false,
    status: "POSSIBLY_APPLICABLE",
    statusLabel: "Mogelijk van toepassing",
    explanation: "Status: Mogelijk van toepassing",
    missingData: ["private_use_unknown"],
    reviewReasons: [],
    ruleVersionTitle: "Belastingplan 2026",
    assessedAt: "2027-03-15T02:00:00.000Z",
    needsInput: true,
    ...overrides,
  };
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalFiscalPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(period({ ...body, confirmedByKind: "portal", confirmedAt: "2027-03-16T09:00:00.000Z", status: "APPLICABLE", statusLabel: "Van toepassing", needsInput: false })), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const vehicles = [{ vehicleId: 3, licensePlate: "AB-123-C", brand: "Volkswagen", model: "Golf", periods: [period(dashboard ? { amount: "360.00" } : {})] }];
    return new Response(JSON.stringify(vehicles), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("portaalpagina fiscale check", () => {
  it("shows the period with its status, what is missing, and no amount while the dashboard switch is off", async () => {
    role = "admin";
    dashboard = false;
    renderPage();
    expect(await screen.findByTestId("fiscal-status-10")).toHaveTextContent("Mogelijk van toepassing");
    expect(screen.getByText("Privégebruik niet bevestigd")).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-amount-10")).toBeNull();
    // Intro and footer both say it: the page never claims legal certainty.
    expect(screen.getAllByText(/geen fiscaal advies/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the amount when the dashboard switch is on", async () => {
    role = "admin";
    dashboard = true;
    renderPage();
    expect(await screen.findByTestId("fiscal-amount-10")).toHaveTextContent("€ 360,00");
  });

  it("the administrator answers the questions and the answers are sent", async () => {
    role = "admin";
    dashboard = false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("usage-form-10");
    await user.click(screen.getByLabelText("Ja", { selector: "#usage-10-privateUse-yes" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-10-commuting-no" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-10-providedBeforeCutoff-no" }));
    await user.click(screen.getByTestId("button-usage-save-10"));
    await waitFor(() => expect(screen.getByTestId("usage-confirmed-10")).toHaveTextContent("Antwoorden opgeslagen"));
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.url).toMatch(/\/api\/portal\/fiscal\/reservations\/10\/usage$/);
    expect(JSON.parse(String(patch.init?.body))).toMatchObject({ privateUse: "yes", commuting: "no", providedBeforeCutoff: "no" });
  });

  it("a driver can read but not answer", async () => {
    role = "driver";
    dashboard = false;
    renderPage();
    await screen.findByTestId("usage-form-10");
    expect(screen.queryByTestId("button-usage-save-10")).toBeNull();
    expect(screen.getByText(/Alleen de beheerder/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ja", { selector: "#usage-10-privateUse-yes" })).toBeDisabled();
  });
});

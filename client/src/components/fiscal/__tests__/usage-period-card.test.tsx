/**
 * The usage block of a reservation: what the system derived, what a person
 * must confirm, and the latest assessment in plain Dutch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn, queryClient as appQueryClient } from "@/lib/queryClient";

let permissions: string[] = ["view_fiscal", "manage_fiscal_review"];
let role = "manager";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

// The app's own QueryCache.onError (lib/queryClient.ts) turns every failed GET into the red
// "Kon de gegevens niet laden" toast through this function; a test that wants to know whether the
// card lets a failure reach it uses the real app client below and watches this spy.
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), toast: toastSpy }));

import { UsagePeriodCard } from "@/components/fiscal/usage-period-card";

const period = {
  id: 5,
  reservationId: 99,
  vehicleId: 3,
  customerId: 2,
  startDate: "2027-03-01",
  endDate: "2027-03-10",
  dateBasis: "planned",
  usageType: "unknown",
  privateUse: "unknown",
  commuting: "unknown",
  isPool: false,
  driverCount: 1,
  isReplacement: true,
  replacementReason: "unknown",
  providedBeforeCutoff: "unknown",
  providedBeforeCutoffHint: true,
  confirmedByKind: "none",
  confirmedByName: null,
  confirmedAt: null,
  reconfirmRequired: false,
  closedAt: null,
  closedReason: null,
  latestAssessment: { id: 40, status: "DATA_INSUFFICIENT", amount: null, explanation: "Fiscale beoordeling\n\nStatus: Gegevens ontbreken", missingData: ["catalog_value_missing"], reviewReasons: [] },
};

const calls: Array<{ url: string; init?: RequestInit }> = [];
// The mock keeps state like the server: a successful PATCH changes what the next GET returns.
let stored = { ...period };
function renderCard(startDate?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <UsagePeriodCard reservationId={99} startDate={startDate} />
    </QueryClientProvider>,
  );
}

// The real client of the app, with its real global error handler.
function renderCardInApp(startDate?: string | null) {
  return render(
    <QueryClientProvider client={appQueryClient}>
      <UsagePeriodCard reservationId={99} startDate={startDate} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  toastSpy.mockClear();
  appQueryClient.clear();
  role = "manager";
  permissions = ["view_fiscal", "manage_fiscal_review"];
  stored = { ...period };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      if (body.replacementReason === undefined) {
        // What the server sends: the FISCAL_VALIDATION code with the field and a reason code.
        return new Response(JSON.stringify({
          message: "Ongeldige invoer: de reden van vervanging is verplicht",
          code: "FISCAL_VALIDATION", field: "replacementReason", reason: "replacementReasonRequired",
          errors: [{ field: "replacementReason", reason: "replacementReasonRequired", message: "de reden van vervanging is verplicht" }],
        }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      stored = { ...stored, ...body, confirmedByKind: "staff", confirmedByName: "tester", confirmedAt: "2026-09-17T09:00:00.000Z" };
      return new Response(JSON.stringify(stored), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(stored), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("gebruiksblok van een reservering", () => {
  it("shows the derived facts, the transition hint and the latest assessment", async () => {
    renderCard();
    expect(await screen.findByText("1 maart 2027 t/m 10 maart 2027")).toBeInTheDocument();
    expect(screen.getByTestId("usage-replacement-badge")).toHaveTextContent("Vervangend voertuig");
    expect(screen.getByText(/aaneengesloten eerdere huur/i)).toBeInTheDocument();
    expect(screen.getByTestId("usage-assessment-status")).toHaveTextContent("Gegevens ontbreken");
    expect(screen.getByText("Catalogusprijs ontbreekt")).toBeInTheDocument();
  });

  it("sends the confirmation and shows the specific Dutch sentence (worded by code and reason, not the server text) when a reason is missing", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("1 maart 2027 t/m 10 maart 2027");
    await user.click(screen.getByLabelText("Ja", { selector: "#usage-privateUse-yes" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-commuting-no" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-providedBeforeCutoff-no" }));
    await user.click(screen.getByTestId("button-usage-confirm"));
    expect(await screen.findByText("De reden van vervanging is verplicht.")).toBeInTheDocument();
    expect(screen.queryByText(/Ongeldige invoer/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("select-usage-replacementReason"), "accident");
    await user.click(screen.getByTestId("button-usage-confirm"));
    await waitFor(() => expect(screen.getByText(/Bevestigd door tester/)).toBeInTheDocument());
    const patch = calls.filter((c) => c.init?.method === "PATCH").pop();
    expect(patch?.url).toMatch(/\/api\/reservations\/99\/usage-period$/);
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", replacementReason: "accident" });
  });

  // Sub-project C, Task 5: the reservation view dialog mounts this card for EVERY
  // reservation, and a reservation that starts before 2027-01-01 (besluit F-10) never
  // has a period. Asking the server anyway answered 404, which the browser logs and
  // the app's global query handler turns into the red "Kon de gegevens niet laden"
  // toast on every opening of the dialog.
  it("does not ask the server for a reservation that starts before the derivation date, and says why", async () => {
    renderCard("2026-10-02");
    expect(await screen.findByText(/Geen gebruiksperiode: deze reservering begint vóór 1 januari 2027/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("still asks for a reservation that starts on the derivation date", async () => {
    renderCard("2027-01-01");
    expect(await screen.findByText("1 maart 2027 t/m 10 maart 2027")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(0);
  });

// Sub-project C, Task 5 fix round 1: the reservation view dialog mounts this card for every
  // account that may open a reservation. GET /api/reservations/:id/usage-period needs view_fiscal
  // (fiscalGuard), so an account without it was answered 403, which the global handler turned into
  // the red toast - and the server wrote an unauthorized_attempt fiscal audit event per opening.
  it("asks nothing and names the missing right for an account without view_fiscal", async () => {
    permissions = ["view_reservations"];
    renderCardInApp("2027-03-01");
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Fiscaal bekijken");
    expect(screen.queryByTestId("usage-period-card")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  // Fix round 2: useFiscalPermissions().canView is true for ANY of the six fiscal rights, but this route
  // is guarded by view_fiscal alone - so a review-only account still got the 403 and the red toast.
  it.each(["manage_fiscal_review", "manage_fiscal_configuration", "approve_fiscal_configuration", "publish_fiscal_configuration", "view_fiscal_audit_log"])(
    "asks nothing and names view_fiscal for an account that holds only %s",
    async (otherFiscalRight) => {
      permissions = [otherFiscalRight];
      renderCardInApp("2027-03-01");
      expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Fiscaal bekijken");
      expect(screen.queryByTestId("usage-period-card")).toBeNull();
      expect(calls).toHaveLength(0);
      expect(toastSpy).not.toHaveBeenCalled();
    },
  );

  // Fix round 2: a reservation before the derivation date has no period for anybody, so an account that
  // may not look gets no no-access line on every old reservation - nothing at all.
  it("renders nothing and asks nothing for a reservation before the derivation date when the right is missing", async () => {
    permissions = ["view_reservations"];
    const { container } = renderCardInApp("2026-10-02");
    // Let any (wrongly) started query and render settle before looking.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("no-data-access")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("an administrator needs no ticked right", async () => {
    role = "admin";
    permissions = [];
    renderCardInApp("2027-03-01");
    expect(await screen.findByText("1 maart 2027 t/m 10 maart 2027")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("says there is no usage period when the server answers 404, without the red toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ message: "No usage period for this reservation" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }));
    renderCardInApp("2027-03-01");
    expect(await screen.findByTestId("usage-no-period")).toHaveTextContent(/Geen gebruiksperiode/);
    expect(calls.length).toBeGreaterThan(0);
    expect(toastSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it("still lets a real failure (500) reach the global handler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500, headers: { "Content-Type": "application/json" } })));
    renderCardInApp("2027-03-01");
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("usage-no-period")).toBeNull();
  });

  it("is read-only without the review right", async () => {
    permissions = ["view_fiscal"];
    renderCard();
    await screen.findByText("1 maart 2027 t/m 10 maart 2027");
    expect(screen.queryByTestId("button-usage-confirm")).toBeNull();
    permissions = ["view_fiscal", "manage_fiscal_review"];
  });
});

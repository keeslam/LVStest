/**
 * The usage block of a reservation: what the system derived, what a person
 * must confirm, and the latest assessment in plain Dutch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

let permissions: string[] = ["view_fiscal", "manage_fiscal_review"];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "manager", permissions, hidePrices: false }, isLoading: false }),
}));

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
function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <UsagePeriodCard reservationId={99} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  stored = { ...period };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      if (body.replacementReason === undefined) {
        return new Response(JSON.stringify({ message: "Ongeldige invoer: de reden van vervanging is verplicht" }), { status: 400, headers: { "Content-Type": "application/json" } });
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

  it("sends the confirmation and shows the server's objection when a reason is missing", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("1 maart 2027 t/m 10 maart 2027");
    await user.click(screen.getByLabelText("Ja", { selector: "#usage-privateUse-yes" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-commuting-no" }));
    await user.click(screen.getByLabelText("Nee", { selector: "#usage-providedBeforeCutoff-no" }));
    await user.click(screen.getByTestId("button-usage-confirm"));
    expect(await screen.findByText(/reden van vervanging is verplicht/)).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("select-usage-replacementReason"), "accident");
    await user.click(screen.getByTestId("button-usage-confirm"));
    await waitFor(() => expect(screen.getByText(/Bevestigd door tester/)).toBeInTheDocument());
    const patch = calls.filter((c) => c.init?.method === "PATCH").pop();
    expect(patch?.url).toMatch(/\/api\/reservations\/99\/usage-period$/);
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", replacementReason: "accident" });
  });

  it("is read-only without the review right", async () => {
    permissions = ["view_fiscal"];
    renderCard();
    await screen.findByText("1 maart 2027 t/m 10 maart 2027");
    expect(screen.queryByTestId("button-usage-confirm")).toBeNull();
    permissions = ["view_fiscal", "manage_fiscal_review"];
  });
});

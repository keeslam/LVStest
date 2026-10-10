/**
 * A failed RDW lookup on the "Fiscaal" tab of a vehicle (audit 2026-10-09, A-16-4):
 * Dutch words that tell an unknown plate from a slow or unreachable service,
 * chosen by the stable code, never by the English message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { VehicleFiscalTab } from "@/components/fiscal/vehicle-fiscal-tab";

const profile = {
  id: 1, vehicleId: 3, catalogValue: null, catalogValueSource: "unknown", marketValue: null, firstAdmissionDate: null, firstAdmissionSource: "unknown",
  fuelCategory: "unknown", co2GKm: null, europeanCategory: null, vehicleKind: null, isDrivingSchoolManual: false, rdwRetrievedAt: null,
  rdwError: null as string | null, manualOverride: {}, latestAssessments: [],
};
let stored: typeof profile;
let refreshAnswer: Record<string, unknown>;

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><VehicleFiscalTab vehicleId={3} /><Toaster /></QueryClientProvider>);
}

beforeEach(() => {
  stored = { ...profile };
  refreshAnswer = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.method === "POST" ? refreshAnswer : stored;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("RDW-fout op het voertuigprofiel", () => {
  it("explains a stored timeout in Dutch, saying it is not the plate's fault", async () => {
    stored = { ...profile, rdwError: "TIMEOUT: RDW API request timed out" };
    renderTab();
    expect(await screen.findByText(/De RDW reageerde niet op tijd/)).toBeInTheDocument();
    expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
  });

  it("explains an unknown plate differently from an outage", async () => {
    stored = { ...profile, rdwError: "NOT_FOUND: No vehicle data found for license plate: AB123C" };
    renderTab();
    expect(await screen.findByText(/niet gevonden bij de RDW/)).toBeInTheDocument();
    expect(screen.queryByText(/No vehicle data/)).not.toBeInTheDocument();
  });

  it("shows a neutral Dutch sentence for an older row that holds only the English message", async () => {
    stored = { ...profile, rdwError: "RDW API request timed out" };
    renderTab();
    expect(await screen.findByText(/De RDW-gegevens konden niet worden opgehaald/)).toBeInTheDocument();
    expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
  });

  it("toasts the same Dutch reason after pressing 'RDW opnieuw ophalen'", async () => {
    refreshAnswer = { ...profile, rdwError: "UNREACHABLE: fetch failed", refresh: { ok: false, error: "UNREACHABLE: fetch failed", code: "UNREACHABLE", changed: [] } };
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("button-profile-refresh"));
    expect(await screen.findByText(/RDW-ophaling mislukt: De RDW is nu niet bereikbaar/)).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument();
  });
});

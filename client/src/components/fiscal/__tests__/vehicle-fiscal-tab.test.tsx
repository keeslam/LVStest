/**
 * The "Fiscaal" tab of a vehicle: the profile with the provenance of each
 * fact, a way to correct one with a reason, and the latest assessments.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { VehicleFiscalTab } from "@/components/fiscal/vehicle-fiscal-tab";

const profile = {
  id: 1,
  vehicleId: 3,
  catalogValue: "36000.00",
  catalogValueSource: "manual",
  catalogValueVerifiedByName: "kees",
  marketValue: null,
  firstAdmissionDate: "2024-05-01",
  firstAdmissionSource: "vehicle_record",
  fuelCategory: "fossil",
  co2GKm: null,
  europeanCategory: null,
  vehicleKind: null,
  isDrivingSchoolManual: false,
  rdwRetrievedAt: null,
  rdwError: null,
  manualOverride: { catalogValue: { value: "36000.00", byName: "kees", at: "2026-09-16T10:00:00.000Z", reason: "factuur" } },
  latestAssessments: [
    { id: 40, usagePeriodId: 5, reservationId: 99, periodStart: "2027-03-01", periodEnd: "2027-03-31", status: "APPLICABLE", amount: "360.00", monthsCharged: 1, explanation: "Status: Van toepassing", createdAt: "2026-09-16T10:00:00.000Z" },
  ],
};

const calls: Array<{ url: string; init?: RequestInit }> = [];
function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <VehicleFiscalTab vehicleId={3} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ...profile, europeanCategory: body.value, latestAssessments: undefined }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(profile), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("voertuigtab Fiscaal", () => {
  it("shows each fact with its source and the latest assessment", async () => {
    renderTab();
    const catalog = await screen.findByTestId("profile-catalogValue");
    expect(catalog).toHaveTextContent("€ 36.000,00");
    expect(catalog).toHaveTextContent("handmatig");
    expect(screen.getByTestId("profile-fuelCategory")).toHaveTextContent("Fossiel");
    expect(screen.getByTestId("profile-europeanCategory")).toHaveTextContent("onbekend");
    expect(screen.getByTestId("profile-firstAdmissionDate")).toHaveTextContent("1 mei 2024");
    expect(screen.getByTestId("profile-firstAdmissionDate")).toHaveTextContent("voertuigrecord");
    const row = screen.getByTestId("assessment-row-40");
    expect(row).toHaveTextContent("Van toepassing");
    expect(row).toHaveTextContent("€ 360,00");
  });

  it("corrects a fact with a reason through the profile route", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("profile-catalogValue");
    await user.click(screen.getByTestId("button-edit-europeanCategory"));
    await user.selectOptions(screen.getByTestId("input-override-value"), "M1");
    await user.type(screen.getByTestId("input-override-reason"), "kentekenbewijs");
    await user.click(screen.getByTestId("button-override-save"));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.url).toMatch(/\/api\/vehicles\/3\/fiscal-profile$/);
    expect(JSON.parse(String(patch.init?.body))).toEqual({ field: "europeanCategory", value: "M1", reason: "kentekenbewijs" });
  });
});

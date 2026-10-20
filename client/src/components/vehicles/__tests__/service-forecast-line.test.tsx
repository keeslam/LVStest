/**
 * Punt 6 (Kees, 2026-10-20) — the expected service date on the vehicle card.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceForecastLine } from "@/components/vehicles/service-forecast-line";

function renderWith(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } },
  });
  return render(<QueryClientProvider client={client}><ServiceForecastLine vehicleId={7} /></QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ServiceForecastLine", () => {
  it("shows the expected date, the pace and what is reached first", async () => {
    renderWith({ forecast: { expectedDate: "2026-12-12", basis: "km", kmDate: "2026-12-12", kmPerDay: 85, tooFewReadings: false } });
    const line = await screen.findByTestId("text-service-forecast");
    expect(line.textContent).toContain("12-12-2026");
    expect(line.textContent).toContain("85 km per dag");
    expect(line.textContent).toContain("km-grens");
  });

  it("says the service is overdue when the expected date has passed", async () => {
    renderWith({ forecast: { expectedDate: "2020-08-02", basis: "months", kmDate: "2027-01-05", kmPerDay: 71.8, tooFewReadings: false } });
    const line = await screen.findByTestId("text-service-forecast");
    expect(line.textContent).toContain("al te laat (sinds 02-08-2020)");
    expect(line.textContent).not.toContain("Verwachte beurt rond");
  });

  it("says when there are too few readings", async () => {
    renderWith({ forecast: { expectedDate: "2027-01-01", basis: "months", kmDate: null, kmPerDay: null, tooFewReadings: true } });
    expect((await screen.findByTestId("text-service-forecast")).textContent).toMatch(/te weinig km-standen/);
  });
});

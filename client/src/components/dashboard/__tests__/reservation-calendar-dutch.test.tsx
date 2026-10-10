/**
 * A-2-5 (fysieke E2E-audit 2026-10-09, module 2) — the dashboard's reservation
 * calendar still wrote "Today", "Mon Tue Wed ..." and "out"/"in" on a Dutch
 * screen.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { ReservationCalendar } from "@/components/dashboard/reservation-calendar";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function renderCalendar() {
  const today = new Date();
  const later = new Date(today.getTime() + 2 * 86400000);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/reservations/range")) {
      return json([{
        id: 5, status: "booked", startDate: iso(today), endDate: iso(later),
        vehicle: { licensePlate: "AB12CD" }, customer: { name: "Klant" },
      }]);
    }
    return json(null);
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}><ReservationCalendar /></QueryClientProvider>);
}

describe("dashboard reservation calendar speaks Dutch", () => {
  it("writes Vandaag, Dutch weekday abbreviations and uit/in tags", async () => {
    const { container } = renderCalendar();
    expect(await screen.findByRole("button", { name: "Vandaag" })).toBeInTheDocument();
    for (const day of ["ma", "di", "wo", "do", "vr", "za", "zo"]) {
      expect(screen.getAllByText(day).length).toBeGreaterThan(0);
    }
    expect(await screen.findAllByText("uit")).not.toHaveLength(0);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bToday\b|\bMon\b|\bTue\b|\bWed\b|\bThu\b|\bFri\b|\bSat\b|\bSun\b/);
  });
});

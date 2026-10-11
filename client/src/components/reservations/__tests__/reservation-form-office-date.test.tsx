/**
 * D11 follow-up (final-wave review, Minor 7): a new reservation starts "today" on the OFFICE clock,
 * not the browser's. The form's default start date (and the end date derived from it) came from
 * date-fns `format(new Date())`, i.e. the browser zone.
 *
 * Runs in the jsdom project. The browser zone of the test machine is not the office zone below, so the
 * two disagree for part of every day.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { setOfficeTimeZone } from "@/lib/office-timezone";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { ReservationForm } from "@/components/reservations/reservation-form";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
  // 02:00 UTC on 12 Oct: still the evening of 11 Oct in Curacao (UTC-4), already 12 Oct in Europe.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-12T02:00:00Z") });
  setOfficeTimeZone("America/Curacao");
});
afterEach(() => {
  setOfficeTimeZone(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReservationForm - default dates", () => {
  it("starts today on the office clock, and the end date follows from it", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider><ReservationForm /></GlobalDialogProvider>
      </QueryClientProvider>,
    );

    const start = await screen.findByLabelText("Startdatum", { exact: true });
    await waitFor(() => expect(start).toHaveValue("2026-10-11"));
    expect(await screen.findByLabelText("Einddatum", { exact: true })).toHaveValue("2026-10-14");
  });
});

/**
 * BUG-040 (Kees, 2026-10-19): a new reservation may start in the past, but the form says so.
 * BUG-056: the recurring fields can no longer be set through a request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { insertReservationSchemaBase } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { ReservationForm } from "@/components/reservations/reservation-form";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T10:00:00Z") });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startdatum in het verleden", () => {
  it("warns when a new reservation starts before today, not for today", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><GlobalDialogProvider><ReservationForm /></GlobalDialogProvider></QueryClientProvider>);
    const start = await screen.findByLabelText("Startdatum", { exact: true });
    await waitFor(() => expect(start).toHaveValue("2026-10-19"));
    expect(screen.queryByTestId("warning-start-in-past")).not.toBeInTheDocument();
    fireEvent.change(start, { target: { value: "2026-10-01" } });
    expect(await screen.findByTestId("warning-start-in-past")).toHaveTextContent("in het verleden");
  });
});

describe("terugkerende reserveringen", () => {
  it("a request can no longer set the recurring fields", () => {
    const parsed = insertReservationSchemaBase.parse({
      startDate: "2026-11-01", status: "booked", type: "standard",
      isRecurring: true, recurringFrequency: "weekly", recurringEndDate: "2027-01-01",
    }) as Record<string, unknown>;
    expect(parsed.isRecurring).toBeUndefined();
    expect(parsed.recurringFrequency).toBeUndefined();
    expect(parsed.recurringEndDate).toBeUndefined();
  });
});

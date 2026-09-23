/**
 * besluiten.md B-32 aanvulling (2026-09-23) — the reservation calendar opens
 * `NotCollectedDialog` by itself the first time a browser session sees a
 * non-empty never-collected list, and never again automatically afterwards
 * (`sessionStorage`, calendar.tsx). Renders the whole page the way
 * `calendar-query-permissions.test.tsx` already does; `NotCollectedDialog`'s
 * own rendering/permission behaviour is covered separately in
 * `client/src/components/reservations/__tests__/not-collected-dialog.test.tsx`.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import ReservationCalendarPage from "@/pages/reservations/calendar";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const NOT_COLLECTED_ROW = {
  id: 501,
  status: "booked",
  type: "standard",
  startDate: "2026-01-01",
  endDate: "2026-01-05",
  vehicle: { id: 1, brand: "Fiat", model: "Ducato", licensePlate: "E2E07G" },
  customer: { id: 1, name: "E2E Klant" },
};

let fetchMock: ReturnType<typeof vi.fn>;

function urlOf(input: unknown): string {
  const raw = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return raw.replace(/^https?:\/\/[^/]+/, "");
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async (input: any) => {
    if (urlOf(input).startsWith("/api/reservations/not-collected")) return json([NOT_COLLECTED_ROW]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/reservations", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("/reservations — the not-collected popup auto-opens once per browser session", () => {
  it("opens itself the first time this session sees a non-empty list, and marks sessionStorage", async () => {
    withProviders(<ReservationCalendarPage />);

    await screen.findByTestId("dialog-not-collected");
    expect(sessionStorage.getItem("notCollectedDialogShown")).toBe("1");
  });

  it("does not reopen automatically once this session already showed it, but the toolbar button still opens it", async () => {
    sessionStorage.setItem("notCollectedDialogShown", "1");
    withProviders(<ReservationCalendarPage />);

    const button = await screen.findByTestId("button-view-not-collected");
    // The flag was already set before this render, so the popup must not
    // have opened itself even though the list is non-empty.
    expect(screen.queryByTestId("dialog-not-collected")).not.toBeInTheDocument();

    await userEvent.click(button);
    await screen.findByTestId("dialog-not-collected");

    await userEvent.click(screen.getByTestId("button-close-not-collected"));
    await waitFor(() => expect(screen.queryByTestId("dialog-not-collected")).not.toBeInTheDocument());
  });

  it("never opens, and shows no toolbar button, while the list is empty", async () => {
    fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);
    withProviders(<ReservationCalendarPage />);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => urlOf(input).startsWith("/api/reservations/not-collected"))).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("dialog-not-collected")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-view-not-collected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("notCollectedDialogShown")).toBeNull();
  });
});

/**
 * Audit remediation P5, A-5-5 - the list view lives in a dialog; it now has an
 * address: /reservations?list=current|overdue|history opens it on that tab,
 * and opening it by hand writes the address, so it can be copied or reloaded.
 *
 * Runs in the jsdom project.
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

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: 1, username: "tester", role: UserRole.USER,
      permissions: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS],
    },
    isLoading: false,
  }),
}));

import ReservationCalendarPage from "@/pages/reservations/calendar";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  sessionStorage.setItem("notCollectedDialogShown", "1");
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/reservations", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>
          <ReservationCalendarPage />
        </Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("A-5-5 - /reservations?list=... opens the list view", () => {
  it("opens on the requested tab", async () => {
    window.history.replaceState(null, "", "/reservations?list=history");
    renderPage();
    await screen.findByTestId("dialog-reservation-list");
    expect(await screen.findByTestId("input-history-search")).toBeInTheDocument();
  });

  it("stays closed without the parameter, and writes it when the list is opened by hand", async () => {
    window.history.replaceState(null, "", "/reservations");
    renderPage();
    const button = await screen.findByTestId("button-list-view");
    expect(screen.queryByTestId("dialog-reservation-list")).toBeNull();
    expect(window.location.search).toBe("");

    await userEvent.click(button);
    await screen.findByTestId("dialog-reservation-list");
    await waitFor(() => expect(window.location.search).toBe("?list=current"));

    await userEvent.click(screen.getByRole("tab", { name: /Achterstallig/ }));
    await waitFor(() => expect(window.location.search).toBe("?list=overdue"));
  });

  it("takes the parameter off again when the list is closed", async () => {
    window.history.replaceState(null, "", "/reservations?list=current");
    renderPage();
    await screen.findByTestId("dialog-reservation-list");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("dialog-reservation-list")).toBeNull());
    expect(window.location.search).toBe("");
  });
});

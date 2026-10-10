/**
 * A-2-3 / A-2-5 (fysieke E2E-audit 2026-10-09, module 2):
 *  - upcoming maintenance on a vehicle that is not in /api/vehicles rendered as
 *    "undefined undefined -"; it now says the vehicle is unknown;
 *  - stored notification texts show no "[service:<id>]" matching key.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";

const today = new Date().toISOString().slice(0, 10);
const answers: Record<string, unknown> = {
  "/api/reservations/upcoming-maintenance": [
    { id: 9, vehicleId: 999999, type: "maintenance_block", maintenanceCategory: "repair", startDate: today, status: "booked" },
  ],
  "/api/custom-notifications": [
    { id: 1, type: "service_due", title: "Onderhoudsbeurt nodig: AB-12-CD", description: "Beurt: 3 dag(en) verstreken [service:155]", date: today, isRead: false, priority: "high", icon: "Wrench", link: null },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = (typeof input === "string" ? input : input.url).split("?")[0];
    return new Response(JSON.stringify(answers[url] ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <NotificationCenterDialog open onOpenChange={() => {}} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("notification centre texts", () => {
  it("names a maintenance block's missing vehicle instead of printing 'undefined'", async () => {
    renderDialog();
    expect((await screen.findAllByText("Onbekend voertuig")).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("hides the [service:id] matching key", async () => {
    renderDialog();
    expect(await screen.findByText("Beurt: 3 dag(en) verstreken")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[service:");
  });
});

/**
 * A-2-11 — "Instellingen & overzicht" used to open a second dialog on top of
 * the notification centre, so Escape had to be pressed twice. The centre now
 * steps aside while the overview is open and comes back when it is closed.
 */
describe("opening the settings overview from the notification centre", () => {
  it("shows one dialog at a time and returns to the centre on Escape", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = React.useState(true);
      return <NotificationCenterDialog open={open} onOpenChange={setOpen} />;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider><Host /></GlobalDialogProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByTestId("button-notification-settings"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByTestId("button-notification-settings")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(await screen.findByTestId("button-notification-settings")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

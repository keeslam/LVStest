/**
 * I5 — a notification about an invoice that arrived by e-mail carries a link to
 * `/expenses?inbox=1`, but the bell rendered no way to follow it: the manual
 * told staff to click something that was not there. A custom notification with
 * a same-origin relative link now gets a "Bekijken" button.
 *
 * The link comes out of a database row, and rows are written by the server, so
 * anything that is not a plain `/path` — a scheme, or the protocol-relative
 * `//host` that a browser reads as "another site" — gets no button at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

// Task 6b: NotificationCenterDialog now gates its /api/custom-notifications
// and /api/customers queries by permission (task-6b-report.md). Not what
// this test is about - role admin keeps both enabled, same as before.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";

const notification = (id: number, link: string | null) => ({
  id, title: `Melding ${id}`, description: "Factuur van Garage Jansen wacht op controle",
  date: "2026-09-18", type: "invoice_inbox", link, icon: "Receipt", priority: "normal", isRead: false,
});

const rows = [
  notification(1, "/expenses?inbox=1"),
  notification(2, "https://evil.example/steal"),
  notification(3, "//evil.example/steal"),
  notification(4, null),
];

describe("NotificationCenterDialog custom notification links", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;

  const mount = () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => (String(queryKey[0]) === "/api/custom-notifications" ? rows : []),
        },
      },
    });
    return render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <NotificationCenterDialog open onOpenChange={onOpenChange} />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    onOpenChange = vi.fn();
    window.history.pushState({}, "", "/dashboard");
  });
  afterEach(() => {
    window.history.pushState({}, "", "/dashboard");
  });

  it("offers the button only for a same-origin relative link", async () => {
    mount();
    expect(await screen.findByTestId("button-view-notification-1")).toBeInTheDocument();
    expect(screen.queryByTestId("button-view-notification-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-view-notification-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-view-notification-4")).not.toBeInTheDocument();
  });

  it("follows the link and closes the bell", async () => {
    mount();
    await userEvent.click(await screen.findByTestId("button-view-notification-1"));
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe("/expenses?inbox=1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

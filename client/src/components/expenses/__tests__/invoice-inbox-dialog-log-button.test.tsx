/**
 * Audit A-9-4 (package P1): the Logboek button was only in Instellingen >
 * E-mail. It is in the header of the Ontvangen facturen dialog now, for a
 * profile that may read the log (the log routes accept manage_expenses or
 * manage_settings) and not for one that may not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission } from "@shared/schema";

const { authUser } = vi.hoisted(() => ({
  authUser: { current: { id: 1, username: "kees", role: "user", permissions: [] as string[] } },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: authUser.current }) }));

import { InvoiceInboxButton } from "@/components/expenses/invoice-inbox-dialog";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("Ontvangen facturen: Logboek button", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/expenses/inbox/status")) {
        return json({ enabled: false, running: false, lastRun: null, scheduledMinutes: null, reviewCount: 0, geminiConfigured: false });
      }
      if (url.includes("/api/expenses/inbox/log")) return json({ items: [], total: 0 });
      return json([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const openInbox = async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <InvoiceInboxButton />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByTestId("button-invoice-inbox"));
    return (await screen.findByRole("dialog")) as HTMLElement;
  };

  it("shows the Logboek button in the dialog header for a profile with manage_expenses, and it opens the log", async () => {
    authUser.current = { id: 1, username: "kees", role: "user", permissions: [UserPermission.MANAGE_EXPENSES] };
    const inbox = await openInbox();
    const button = within(inbox).getByTestId("button-invoice-inbox-log");
    expect(button).toHaveTextContent("Logboek");

    await userEvent.click(button);
    const dialogs = await screen.findAllByRole("dialog");
    expect(dialogs.some((d) => d.textContent?.includes("Overige mail"))).toBe(true);
  });

  it("also shows it for a profile that has manage_settings only (the log routes accept either right)", async () => {
    authUser.current = { id: 1, username: "kees", role: "user", permissions: [UserPermission.MANAGE_SETTINGS] };
    const inbox = await openInbox();
    expect(within(inbox).getByTestId("button-invoice-inbox-log")).toBeInTheDocument();
  });

  it("does not show it without either right", async () => {
    authUser.current = { id: 1, username: "kees", role: "user", permissions: [UserPermission.VIEW_DASHBOARD] };
    const inbox = await openInbox();
    expect(within(inbox).getByTestId("button-invoice-inbox-run")).toBeInTheDocument();
    expect(within(inbox).queryByTestId("button-invoice-inbox-log")).not.toBeInTheDocument();
  });
});

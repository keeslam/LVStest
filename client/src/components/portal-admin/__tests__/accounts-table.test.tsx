/**
 * Portal accounts table (audit 2026-10-09, A-15-1 and A-15-4):
 * "Uitnodiging opnieuw sturen" must report what really happened, a blocked
 * account is not offered a new invitation, and blocking or deleting asks first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));

import { AccountsTable } from "@/components/portal-admin/accounts-table";

const base = { customerId: 1, email: "a@example.com", role: "admin", driverId: null, lastLoginAt: null, lastSeenAt: null, customerName: "Klant BV", permissions: {} };
const accounts = [
  { ...base, id: 11, fullName: "Open Uitnodiging", active: true, activated: false, invitePending: true },
  { ...base, id: 12, fullName: "Geblokkeerd Account", active: false, activated: false, invitePending: false },
  { ...base, id: 13, fullName: "Actief Account", active: true, activated: true, invitePending: false },
];

let inviteAnswer: { sent: boolean };
const calls: Array<{ method: string; url: string; body?: string }> = [];

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountsTable />
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  inviteAnswer = { sent: true };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string | undefined });
    let body: unknown = {};
    if (method === "GET") body = accounts;
    else if (String(url).endsWith("/invite")) body = inviteAnswer;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function openMenu(id: number) {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId(`button-account-actions-${id}`));
  return user;
}

describe("portaalaccounts — acties", () => {
  it("names the row menu so a screen reader can tell the accounts apart", async () => {
    renderTable();
    expect(await screen.findByRole("button", { name: "Acties voor Actief Account" })).toBeInTheDocument();
  });

  it("says so when the invitation mail did not leave", async () => {
    inviteAnswer = { sent: false };
    renderTable();
    const user = await openMenu(11);
    await user.click(await screen.findByTestId("menu-resend-account-11"));
    expect(await screen.findByText(/De e-mail is niet verstuurd/)).toBeInTheDocument();
    expect(screen.queryByText("E-mail verstuurd.")).not.toBeInTheDocument();
  });

  it("confirms with 'E-mail verstuurd.' only when the mail left", async () => {
    renderTable();
    const user = await openMenu(11);
    await user.click(await screen.findByTestId("menu-resend-account-11"));
    expect(await screen.findByText("E-mail verstuurd.")).toBeInTheDocument();
  });

  it("offers no new invitation on a blocked account", async () => {
    renderTable();
    await openMenu(12);
    expect(await screen.findByTestId("menu-block-account-12")).toHaveTextContent("Deblokkeren");
    expect(screen.queryByTestId("menu-resend-account-12")).not.toBeInTheDocument();
  });

  it("asks before blocking and does nothing when cancelled", async () => {
    renderTable();
    const user = await openMenu(13);
    await user.click(await screen.findByTestId("menu-block-account-13"));
    expect(await screen.findByTestId("confirm-dialog-title")).toHaveTextContent("Account blokkeren?");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("blocks after confirmation and shows a toast", async () => {
    renderTable();
    const user = await openMenu(13);
    await user.click(await screen.findByTestId("menu-block-account-13"));
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toBe(JSON.stringify({ active: false })));
    expect(await screen.findByText("Account geblokkeerd.")).toBeInTheDocument();
  });

  it("uses its own dialog, not the browser's, for deleting an account that was never activated", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderTable();
    const user = await openMenu(11);
    await user.click(await screen.findByTestId("menu-delete-account-11"));
    expect(await screen.findByTestId("confirm-dialog-title")).toHaveTextContent("Account verwijderen?");
    await user.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/accounts/11"))).toBe(true));
    expect(await screen.findByText("Account verwijderd.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

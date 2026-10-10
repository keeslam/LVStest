/**
 * A-19-6 (audit 2026-10-09): "Standaardwaarden herstellen" and the header reset
 * used window.confirm (ignored by the built-in browser). Own dialog now;
 * cancelling changes nothing and sends nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_DAMAGE_CHECK_FIELDS } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));

import DamageCheckFieldsPage from "@/pages/settings/damage-check-fields";

const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    if (url === "/api/damage-check-fields") return new Response(JSON.stringify(DEFAULT_DAMAGE_CHECK_FIELDS), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <DamageCheckFieldsPage embedded />
    </QueryClientProvider>,
  );
}

describe("damage check fields: resets ask in our own dialog", () => {
  it("'Standaardwaarden herstellen' shows the dialog and cancel changes nothing", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-reset-defaults"));
    expect(await screen.findByTestId("confirm-dialog")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
    expect(calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
  });

  it("the header reset asks first, and cancel sends no DELETE", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-header-reset"));
    expect(await screen.findByTestId("confirm-dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("the header reset sends the DELETE only after the confirm button", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-header-reset"));
    await user.click(await screen.findByTestId("button-confirm-reset"));
    await waitFor(() => expect(calls).toContain("DELETE /api/damage-check-fields/header"));
  });
});

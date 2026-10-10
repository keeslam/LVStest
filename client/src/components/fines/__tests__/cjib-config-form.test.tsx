/**
 * CJIB connection form (audit 2026-10-09, A-15-7): automatic fetching cannot be
 * switched on or saved without a host, and the disabled buttons say why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { CjibConfigForm } from "@/components/fines/cjib-config-form";

const emptyHost = { enabled: false, host: "", port: 990, secure: "implicit", username: "", password: "", inboxDir: "/", processedDir: "", pollMinutes: 60, filePattern: "\.(xml|csv)$" };
let stored: Record<string, unknown>;
const calls: Array<{ method: string; body?: string }> = [];

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><CjibConfigForm /><Toaster /></QueryClientProvider>);
}

beforeEach(() => {
  calls.length = 0;
  stored = { ...emptyHost };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, body: init?.body as string | undefined });
    return new Response(JSON.stringify(stored), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("CJIB-koppeling", () => {
  it("does not let automatic fetching go on without a host", async () => {
    renderForm();
    const toggle = await screen.findByTestId("switch-cjib-enabled");
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId("cjib-needs-host")).toHaveTextContent("Vul een server (host) in om de verbinding te testen of nu op te halen.");
    expect(screen.getByTestId("button-test-cjib")).toBeDisabled();
  });

  it("enables the switch and the buttons once a host is typed", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId("input-cjib-host"), "ftps.cjib.nl");
    expect(screen.getByTestId("switch-cjib-enabled")).toBeEnabled();
    expect(screen.getByTestId("button-test-cjib")).toBeEnabled();
    expect(screen.queryByTestId("cjib-needs-host")).not.toBeInTheDocument();
  });

  it("refuses to save 'automatic fetching on' when the host is empty and says why", async () => {
    stored = { ...emptyHost, enabled: true };
    renderForm();
    const user = userEvent.setup();
    expect(await screen.findByTestId("cjib-enabled-needs-host")).toBeInTheDocument();
    // An already-enabled switch stays reachable so it can be turned off.
    expect(screen.getByTestId("switch-cjib-enabled")).toBeEnabled();
    await user.click(screen.getByTestId("button-save-cjib"));
    expect(await screen.findByText(/Automatisch ophalen kan niet aan staan zonder server/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

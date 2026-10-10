/**
 * A-17-9: App-instellingen has eight tabs in one dialog, each with its own Save
 * button. The fields of the panel itself live in the panel and survive a tab
 * switch, but the forms that are components of their own (Klantenportaal,
 * fiscaal, CJIB, the activity log with its filters) were unmounted on a switch
 * and lost what was typed. A tab that has been opened now stays mounted (hidden)
 * while another one is shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "kees", role: "admin", permissions: [] }, isLoading: false }),
}));

// Components of their own, with a field that keeps its own state like the real forms do.
vi.mock("@/components/portal-admin/portal-config-form", async () => {
  const React = await import("react");
  return {
    PortalConfigForm: () => {
      const [text, setText] = React.useState("");
      return <input aria-label="portal-instructions" value={text} onChange={(e) => setText(e.target.value)} />;
    },
  };
});
vi.mock("@/components/fiscal/fiscal-settings-section", () => ({ FiscalSettingsSection: () => null }));
vi.mock("@/components/fines/cjib-config-form", () => ({ CjibConfigForm: () => null }));
vi.mock("@/components/expenses/invoice-inbox-config-form", () => ({ InvoiceInboxConfigForm: () => null }));
vi.mock("@/components/settings/activity-log-panel", () => ({ ActivityLogPanel: () => <div>activity</div> }));

import { SettingsPanel } from "@/components/settings/settings-panel";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPanel />
    </QueryClientProvider>,
  );
}

describe("SettingsPanel - switching tabs", () => {
  it("keeps what was typed in the Klantenportaal tab when you look at another tab and come back", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId("tab-portal"));
    await user.type(await screen.findByLabelText("portal-instructions"), "Ophalen bij de poort");

    await user.click(screen.getByRole("tab", { name: /Bedrijfsregels/ }));
    await user.click(screen.getByTestId("tab-portal"));

    expect(await screen.findByLabelText("portal-instructions")).toHaveValue("Ophalen bij de poort");
  });

  it("hides the tab you left instead of showing both", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByTestId("tab-portal"));
    await screen.findByLabelText("portal-instructions");
    await user.click(screen.getByRole("tab", { name: /Bedrijfsregels/ }));

    // Still in the DOM, but not visible to the user or to assistive technology.
    expect(screen.queryByRole("textbox", { name: "portal-instructions" })).toBeNull();
    expect(document.querySelector('input[aria-label="portal-instructions"]')).not.toBeNull();
  });
});

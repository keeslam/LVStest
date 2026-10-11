/**
 * B-44 (11-10-2026): the menu item "Bekeuringen" is gone; the list is reached from
 * the Klantenportaal page, from a button in the page header that takes the user to
 * /fines. The button is only there for Boetes bekijken / Boetes beheren (a user
 * with only a portal right, but no fines right, does not get it).
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const auth = vi.hoisted(() => ({ role: "user" as string, permissions: [] as string[] }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: auth.role, permissions: auth.permissions }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({
    openFineDialog: vi.fn(),
    openPortalRequestDialog: vi.fn(),
    openPortalListDialog: vi.fn(),
    openFineImportDialog: vi.fn(),
  }),
}));
vi.mock("@/components/portal-admin/dashboard-panels", () => ({
  DASHBOARD_KEY: ["/api/portal-admin/dashboard"],
  DashboardTiles: () => <div data-testid="tiles" />,
  AttentionPanel: () => null,
  NotificationsPanel: () => null,
  UpcomingPanel: () => null,
  CustomersPanel: () => null,
}));
vi.mock("@/components/portal-admin/account-dialog", () => ({ AccountDialog: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/fiscal/fiscal-overview-dialog", () => ({ FiscalOverviewDialog: () => null }));

import PortalAdminPage from "@/pages/portal-admin";

function renderPage() {
  const loc = memoryLocation({ path: "/portal-admin", record: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ counts: {}, attention: {}, notifications: [], upcoming: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={loc.hook}>
        <PortalAdminPage />
      </Router>
    </QueryClientProvider>,
  );
  return loc;
}

beforeEach(() => {
  auth.role = "user";
  auth.permissions = [];
});

describe("Klantenportaal - knop Bekeuringen (B-44)", () => {
  it("is shown with Boetes bekijken and opens /fines", async () => {
    auth.permissions = ["view_portal", "view_fines"];
    const loc = renderPage();
    const button = await screen.findByTestId("button-open-fines");
    expect(button).toHaveTextContent("Bekeuringen");
    await userEvent.click(button);
    expect(loc.history).toContain("/fines");
  });

  it("is shown with Boetes beheren only", async () => {
    auth.permissions = ["view_portal", "manage_fines"];
    renderPage();
    expect(await screen.findByTestId("button-open-fines")).toBeInTheDocument();
  });

  it("is greyed out with the missing right named when the user has no fines right", async () => {
    auth.permissions = ["view_portal"];
    renderPage();
    const button = await screen.findByTestId("button-open-fines");
    expect(button).toBeDisabled();
  });
});

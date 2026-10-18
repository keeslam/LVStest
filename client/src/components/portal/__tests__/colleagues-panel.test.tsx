/**
 * Kees, 2026-10-18: Mijn account > Collega's. An admin invites a driver (tied to a driver without an
 * account) or an admin, and blocks a colleague; without driver management only admins can be invited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { portalFetch, settings } = vi.hoisted(() => ({
  portalFetch: vi.fn(async (..._a: unknown[]) => ({ colleagues: [], inviteSent: true }) as unknown),
  settings: { canManageDrivers: true, canInviteColleagues: true },
}));
vi.mock("@/lib/portal-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-api")>()), portalFetch }));
vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { id: 1, role: "admin", fullName: "Beheerder", settings } }),
}));

import { ColleaguesPanel } from "@/components/portal/colleagues-panel";

const colleagues = [
  { id: 1, fullName: "Beheerder", email: "b@x.test", role: "admin", driver: null, active: true, activated: true, invitePending: false, lastSeenAt: null, isSelf: true },
  { id: 2, fullName: "Jan", email: "jan@x.test", role: "driver", driver: { id: 10, displayName: "Jan" }, active: true, activated: true, invitePending: false, lastSeenAt: null, isSelf: false },
  { id: 3, fullName: "Kim", email: "kim@x.test", role: "admin", driver: null, active: true, activated: false, invitePending: true, lastSeenAt: null, isSelf: false },
];
const drivers = [
  { id: 10, displayName: "Jan", status: "active" },
  { id: 11, displayName: "Piet", status: "active" },
];
function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/colleagues"], colleagues);
  qc.setQueryData(["portal", "/api/portal/drivers"], drivers);
  return render(<QueryClientProvider client={qc}><ColleaguesPanel /></QueryClientProvider>);
}

describe("collega's uitnodigen", () => {
  beforeEach(() => {
    portalFetch.mockClear();
    settings.canManageDrivers = true;
    // PATCH answers with the new list, like the server.
    portalFetch.mockImplementation(async (method: unknown) => (method === "PATCH" ? colleagues : { colleagues, inviteSent: true }));
  });

  it("invites a driver, offering only drivers without an account", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-invite-colleague"));
    await user.type(screen.getByTestId("input-colleague-name"), "Piet");
    await user.type(screen.getByTestId("input-colleague-email"), "piet@x.test");
    const driverSelect = screen.getByTestId("select-colleague-driver");
    expect(within(driverSelect).queryByText("Jan")).not.toBeInTheDocument();
    await user.selectOptions(driverSelect, "11");
    await user.click(screen.getByTestId("button-send-invite"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/colleagues", { fullName: "Piet", email: "piet@x.test", role: "driver", driverId: 11 }));
  });

  it("without driver management only an admin can be invited", async () => {
    settings.canManageDrivers = false;
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-invite-colleague"));
    expect(within(screen.getByTestId("select-colleague-role")).getAllByRole("option")).toHaveLength(1);
    await user.type(screen.getByTestId("input-colleague-name"), "Kees");
    await user.type(screen.getByTestId("input-colleague-email"), "kees@x.test");
    await user.click(screen.getByTestId("button-send-invite"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/colleagues", { fullName: "Kees", email: "kees@x.test", role: "admin" }));
  });

  it("blocks a colleague, resends an open invitation, and never offers to block yourself", async () => {
    renderPanel();
    const user = userEvent.setup();
    expect(screen.queryByTestId("button-toggle-colleague-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("colleague-3")).toHaveTextContent("uitnodiging open");
    await user.click(screen.getByTestId("button-toggle-colleague-2"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("PATCH", "/api/portal/colleagues/2", { active: false }));
    await user.click(screen.getByTestId("button-resend-3"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/colleagues/3/invite"));
  });
});

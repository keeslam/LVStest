/**
 * D13 (spec section 9): the users dialog says, per right, which other rights it
 * needs ("Heeft nodig: ..."; grey when they are ticked, a warning when not),
 * has one button "Benodigde rechten ook aanzetten" that ticks the missing
 * required rights (nothing happens by itself on save), labels the rights only
 * an administrator can use and disables them for a non-admin account, and shows
 * the same hint in the read-only view.
 *
 * Runs in the jsdom project, real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "kees", role: "admin", permissions: [] },
    isLoading: false,
  }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
  toast: (...args: unknown[]) => toast(...args),
}));

import { UsersDialog } from "@/components/dialogs/users-dialog";

const USERS = [
  { id: 1, username: "kees", role: "admin", active: true, fullName: "Kees", email: null, permissions: [], isLastAdmin: false },
  { id: 2, username: "ike", role: "admin", active: true, fullName: "Ike", email: null, permissions: [], isLastAdmin: false },
  { id: 6, username: "balie", role: "user", active: true, fullName: "Balie", email: null, permissions: ["view_dashboard"], hidePrices: false, isLastAdmin: false },
  { id: 7, username: "compleet", role: "user", active: true, fullName: "Compleet", email: null, permissions: ["view_dashboard", "view_vehicles", "manage_reservations", "view_customers"], hidePrices: false, isLastAdmin: false },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (u.endsWith("/api/users")) return json(USERS);
  const m = u.match(/\/api\/users\/(\d+)$/);
  if (m) return init?.method === "PATCH" ? json(USERS.find((x) => x.id === Number(m[1]))) : json(USERS.find((x) => x.id === Number(m[1])));
  return json({});
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toast.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function openEdit(id: number) {
  const user = userEvent.setup();
  renderDialog();
  await user.click(await screen.findByTestId(`dialog-edit-user-${id}`));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: "Gebruiker bijwerken" });
  return { user, dialog };
}

describe("users dialog - rights that need other rights (D13)", () => {
  it("shows per right what it needs, with a warning for what is not ticked", async () => {
    const { dialog } = await openEdit(6);
    const hint = within(dialog).getByTestId("permission-needs-view_dashboard");
    expect(hint.textContent).toContain("Heeft nodig: Voertuigen bekijken, Reserveringen bekijken");
    expect(hint).toHaveAttribute("data-satisfied", "false");
    // A right that needs nothing has no line.
    expect(within(dialog).queryByTestId("permission-needs-view_vehicles")).toBeNull();
  });

  it("the line is grey (satisfied) when the needed rights are ticked, also through the manage right", async () => {
    const { dialog } = await openEdit(7);
    const hint = within(dialog).getByTestId("permission-needs-manage_reservations");
    expect(hint.textContent).toContain("Heeft nodig: Klanten bekijken");
    expect(hint).toHaveAttribute("data-satisfied", "true");
  });

  it("the button ticks the missing required rights, and only those", async () => {
    const { user, dialog } = await openEdit(6);
    expect(within(dialog).getByRole("checkbox", { name: "Voertuigen bekijken" })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Reserveringen bekijken" })).not.toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Benodigde rechten ook aanzetten" }));

    expect(within(dialog).getByRole("checkbox", { name: "Voertuigen bekijken" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Reserveringen bekijken" })).toBeChecked();
    // Optional rights of the dashboard stay off.
    expect(within(dialog).getByRole("checkbox", { name: "Klanten bekijken" })).not.toBeChecked();
    expect(within(dialog).getByTestId("permission-needs-view_dashboard")).toHaveAttribute("data-satisfied", "true");
    // Nothing was saved by pressing it.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("the button is off when nothing is missing", async () => {
    const { dialog } = await openEdit(7);
    expect(within(dialog).getByRole("button", { name: "Benodigde rechten ook aanzetten" })).toBeDisabled();
  });

  it("ticking a right does not tick what it needs, and saving sends exactly what is ticked", async () => {
    const { user, dialog } = await openEdit(6);
    await user.click(within(dialog).getByRole("checkbox", { name: "Onderhoud beheren" }));
    expect(within(dialog).getByRole("checkbox", { name: "Voertuigen bekijken" })).not.toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Gebruiker bijwerken" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]?.body)).permissions.sort()).toEqual(["manage_maintenance", "view_dashboard"]);
  });

  it("rights only an administrator can use are labelled and disabled for a non-admin account", async () => {
    const { dialog } = await openEdit(6);
    const manageUsers = within(dialog).getByRole("checkbox", { name: "Gebruikers beheren" });
    expect(manageUsers).toBeDisabled();
    expect(within(dialog).getByTestId("permission-admin-only-manage_users").textContent).toBe("alleen voor beheerders");
    expect(within(dialog).getByRole("checkbox", { name: "Instellingen beheren" })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: "Back-ups beheren" })).toBeDisabled();
    // Every other right stays available.
    expect(within(dialog).getByRole("checkbox", { name: "Onderhoud beheren" })).toBeEnabled();
  });

  it("an administrator account can tick them", async () => {
    const { dialog } = await openEdit(2);
    expect(within(dialog).getByRole("checkbox", { name: "Gebruikers beheren" })).toBeEnabled();
  });

  it("the read-only view shows the same hint", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-view-user-6"));
    const dialog = await screen.findByRole("dialog");
    const hint = await within(dialog).findByTestId("permission-needs-view_dashboard");
    expect(hint.textContent).toContain("Heeft nodig: Voertuigen bekijken, Reserveringen bekijken");
    expect(hint).toHaveAttribute("data-satisfied", "false");
  });
});

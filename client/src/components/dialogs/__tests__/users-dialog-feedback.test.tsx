/**
 * Audit 2026-10-09, module 17: A-17-2 / A-17-7 (a toast after saving or
 * creating a user), A-17-6 (the new-user form speaks Dutch, shows every
 * missing field at once, and maps the server's USERNAME_EXISTS code), and
 * A-17-8 (no delete button for your own account or an administrator account).
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
  { id: 6, username: "e2e-user", role: "user", active: true, fullName: "E2E", email: null, permissions: [], hidePrices: false, isLastAdmin: false },
];

type Handler = (url: string, init?: RequestInit) => Response | undefined;
let extra: Handler = () => undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  const custom = extra(u, init);
  if (custom) return custom;
  if (u.endsWith("/api/users")) return json(USERS);
  const m = u.match(/\/api\/users\/(\d+)$/);
  if (m) return json(USERS.find((x) => x.id === Number(m[1])));
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
  extra = () => undefined;
  toast.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("users dialog - the new-user form (A-17-6)", () => {
  it("shows the username AND the password error at once, in Dutch", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-add-user-button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    expect(await within(dialog).findByText("De gebruikersnaam moet minstens 3 tekens hebben")).toBeInTheDocument();
    expect(within(dialog).getByText("Een wachtwoord is verplicht")).toBeInTheDocument();
    expect(within(dialog).queryByText(/must be at least/i)).toBeNull();
  });

  it("an invalid e-mail address is reported in Dutch", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-add-user-button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Voer gebruikersnaam in"), "nieuwe-collega");
    await user.type(within(dialog).getByPlaceholderText("Voer wachtwoord in"), "Een-echt-wachtwoord1");
    await user.type(within(dialog).getByPlaceholderText("Voer e-mailadres in"), "geen-adres");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));
    expect(await within(dialog).findByText("Vul een geldig e-mailadres in")).toBeInTheDocument();
  });

  it("maps the server code USERNAME_EXISTS to a Dutch toast", async () => {
    extra = (u, init) =>
      u.endsWith("/api/users") && init?.method === "POST"
        ? json({ message: "Username already exists", code: "USERNAME_EXISTS", field: "username" }, 400)
        : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-add-user-button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Voer gebruikersnaam in"), "e2e-user");
    await user.type(within(dialog).getByPlaceholderText("Voer wachtwoord in"), "Een-echt-wachtwoord1");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({
      variant: "destructive",
      description: "Deze gebruikersnaam is al in gebruik",
    });
  });
});

describe("users dialog - password rule codes (D12)", () => {
  it.each([
    ["PASSWORD_TOO_WEAK", "Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer"],
    ["USE_CHANGE_PASSWORD", "Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen"],
  ])("maps the server code %s to a Dutch toast", async (code, description) => {
    extra = (u, init) =>
      /\/api\/users\/6$/.test(u) && init?.method === "PATCH"
        ? json({ message: "x", code, field: "password" }, 400)
        : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-edit-user-6"));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "Gebruiker bijwerken" }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({ variant: "destructive", description });
  });

  it("an edit with a new password that breaks the rule is refused before it posts", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-edit-user-6"));
    const dialog = await screen.findByRole("dialog");
    await user.type(await within(dialog).findByPlaceholderText("Voer wachtwoord in"), "kort");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker bijwerken" }));

    expect(
      await within(dialog).findByText(
        "Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("an edit with the password left empty still saves", async () => {
    extra = (u, init) =>
      /\/api\/users\/6$/.test(u) && init?.method === "PATCH" ? json({ ...USERS[2] }) : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-edit-user-6"));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "Gebruiker bijwerken" }));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].variant).toBeUndefined();
  });
});

describe("users dialog - feedback after saving (A-17-2, A-17-7)", () => {
  it("creating a user gives a success toast", async () => {
    extra = (u, init) =>
      u.endsWith("/api/users") && init?.method === "POST" ? json({ id: 9, username: "nieuwe-collega" }, 201) : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-add-user-button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Voer gebruikersnaam in"), "nieuwe-collega");
    await user.type(within(dialog).getByPlaceholderText("Voer wachtwoord in"), "Een-echt-wachtwoord1");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({
      title: "Gelukt",
      description: 'Gebruiker "nieuwe-collega" is aangemaakt',
    });
    expect(toast.mock.calls[0][0].variant).toBeUndefined();
  });

  it("saving an edited user gives a success toast", async () => {
    extra = (u, init) =>
      /\/api\/users\/6$/.test(u) && init?.method === "PATCH" ? json({ ...USERS[2] }) : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-edit-user-6"));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "Gebruiker bijwerken" }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({
      title: "Gelukt",
      description: 'Gebruiker "e2e-user" is opgeslagen',
    });
  });
});

describe("users dialog - who can be deleted (A-17-8, D19)", () => {
  it("your own row has a disabled delete button that says why", async () => {
    renderDialog();
    const own = await screen.findByTestId("dialog-delete-user-1");
    expect(own).toBeDisabled();
    expect(own).toHaveAttribute("title", "Je kunt je eigen account niet verwijderen");
  });

  it("another administrator can be deleted while there are two active administrators", async () => {
    renderDialog();
    const other = await screen.findByTestId("dialog-delete-user-2");
    expect(other).toBeEnabled();
    expect(other).not.toHaveAttribute("title");
  });

  it("the last active administrator has a disabled delete button that says why", async () => {
    const lastAdminUsers = USERS.map((u) => (u.id === 2 ? { ...u, isLastAdmin: true } : u));
    extra = (u) => (u.endsWith("/api/users") ? json(lastAdminUsers) : undefined);
    renderDialog();
    const last = await screen.findByTestId("dialog-delete-user-2");
    expect(last).toBeDisabled();
    expect(last).toHaveAttribute(
      "title",
      "Dit is de laatste actieve beheerder; die kan niet worden verwijderd",
    );
  });

  it("an ordinary user can be deleted", async () => {
    renderDialog();
    expect(await screen.findByTestId("dialog-delete-user-6")).toBeEnabled();
  });

  it("maps the server code LAST_ADMIN on delete to a Dutch toast", async () => {
    extra = (u, init) =>
      /\/api\/users\/2$/.test(u) && init?.method === "DELETE"
        ? json({ message: "x", code: "LAST_ADMIN" }, 409)
        : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-delete-user-2"));
    await user.click(await screen.findByTestId("dialog-confirm-delete-user"));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({
      variant: "destructive",
      description: "De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen",
    });
  });

  it("maps the server code LAST_ADMIN on save to the same toast", async () => {
    extra = (u, init) =>
      /\/api\/users\/6$/.test(u) && init?.method === "PATCH"
        ? json({ message: "x", code: "LAST_ADMIN" }, 409)
        : undefined;
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-edit-user-6"));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "Gebruiker bijwerken" }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].description).toBe(
      "De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen",
    );
  });
});

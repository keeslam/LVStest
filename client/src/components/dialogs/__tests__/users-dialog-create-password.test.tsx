/**
 * Final wave of sub-project C, item 4 - the add-user form must not post a blank
 * password. POST /api/users now answers 400 PASSWORD_REQUIRED for an empty or
 * whitespace-only password; the form says so itself, in the user's language,
 * before it posts (the edit form keeps treating a blank password as "no change").
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

import { UsersDialog } from "@/components/dialogs/users-dialog";

const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
  new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
);

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

const posts = () => fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/api/users") && init?.method === "POST");

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openAddForm() {
  const user = userEvent.setup();
  renderDialog();
  await user.click(await screen.findByTestId("dialog-add-user-button"));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByPlaceholderText("Voer gebruikersnaam in"), "nieuwe-collega");
  return { user, dialog };
}

describe("users dialog - adding a user needs a real password", () => {
  it("an empty password shows a Dutch message and posts nothing", async () => {
    const { user, dialog } = await openAddForm();

    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    expect(await within(dialog).findByText("Een wachtwoord is verplicht")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("a whitespace-only password is refused the same way", async () => {
    const { user, dialog } = await openAddForm();

    await user.type(within(dialog).getByPlaceholderText("Voer wachtwoord in"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    expect(await within(dialog).findByText("Een wachtwoord is verplicht")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("a real password is posted", async () => {
    const { user, dialog } = await openAddForm();

    await user.type(within(dialog).getByPlaceholderText("Voer wachtwoord in"), "een-echt-wachtwoord");
    await user.click(within(dialog).getByRole("button", { name: "Gebruiker aanmaken" }));

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String(posts()[0][1]?.body)).password).toBe("een-echt-wachtwoord");
  });
});

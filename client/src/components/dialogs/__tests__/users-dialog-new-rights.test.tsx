/**
 * Sub-project C, task 1 (besluiten B-30, B-33, B-38) - the users dialog lists
 * every value of UserPermission as a checkbox, so the three new rights must
 * show up there with their Dutch labels without any change to the dialog.
 *
 * Runs in the jsdom project (plan section 8.8), real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission } from "@shared/schema";

// Only an admin can open this dialog (user-menu.tsx), and its user query is
// enabled for an admin only.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "kees", role: "admin", permissions: [] },
    isLoading: false,
  }),
}));

import { UsersDialog } from "@/components/dialogs/users-dialog";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NEW_RIGHT_LABELS = {
  [UserPermission.REVERT_HANDOVER]: "Overdracht terugdraaien",
  [UserPermission.CANCEL_PICKED_UP_RENTAL]: "Opgehaalde huur annuleren of verwijderen",
  [UserPermission.MANAGE_RECYCLE_BIN]: "Prullenbak beheren",
};

describe("users dialog - the three rights of sub-project C", () => {
  it("renders an unticked checkbox for each new right, with its Dutch label, on the add-user form", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("dialog-add-user-button"));

    const dialog = await screen.findByRole("dialog");
    for (const [permission, label] of Object.entries(NEW_RIGHT_LABELS)) {
      const checkbox = await within(dialog).findByRole("checkbox", { name: label });
      expect(checkbox, `${permission} must start unticked`).not.toBeChecked();
    }
  });

  it("ticks and unticks a new right like any other", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("dialog-add-user-button"));
    const dialog = await screen.findByRole("dialog");
    const checkbox = await within(dialog).findByRole("checkbox", { name: "Prullenbak beheren" });

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("renders the three new rights on the edit form too, ticked only where the account holds them", async () => {
    // The edit form reads the stored list, so a right the account already has
    // must come up ticked and the others unticked.
    const account = {
      id: 7,
      username: "manager-demo",
      role: "manager",
      permissions: [UserPermission.REVERT_HANDOVER],
      active: true,
    };
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return json(url.endsWith("/api/users/7") ? account : url.endsWith("/api/users") ? [account] : []);
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("dialog-edit-user-7"));

    const dialog = await screen.findByRole("dialog");
    for (const [permission, label] of Object.entries(NEW_RIGHT_LABELS)) {
      const checkbox = await within(dialog).findByRole("checkbox", { name: label });
      if (permission === UserPermission.REVERT_HANDOVER) {
        expect(checkbox, `${permission} is held by the account`).toBeChecked();
      } else {
        expect(checkbox, `${permission} is not held by the account`).not.toBeChecked();
      }
    }
  });
});

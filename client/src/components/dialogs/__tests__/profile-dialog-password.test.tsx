/**
 * A-1-4 - the confirm field of the profile's password tab. After a failed
 * submit its message depends on the new password; changing the new password
 * must re-check it instead of leaving a stale message on screen.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// A stable object: the dialog resets its forms whenever `user` changes identity.
const { currentUser } = vi.hoisted(() => ({
  currentUser: { id: 4, username: "kees", fullName: "Kees", email: "k@example.nl", role: "user", permissions: [] as string[], active: true, createdAt: "2026-01-01" },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));

import { ProfileDialog } from "@/components/dialogs/profile-dialog";

describe("profile dialog - password tab", () => {
  it("clears a stale confirm message when the new password changes after a failed submit", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProfileDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: "Wachtwoord" }));
    await user.type(await screen.findByTestId("input-current-password"), "oud");
    await user.type(screen.getByTestId("input-new-password"), "Abcdefghi1");
    await user.type(screen.getByTestId("input-confirm-password"), "abc");
    await user.click(screen.getByTestId("button-change-password"));

    expect(await screen.findByText("De wachtwoorden komen niet overeen.")).toBeInTheDocument();
    expect(screen.queryByText("Bevestig je nieuwe wachtwoord.")).not.toBeInTheDocument();

    // Make the new password equal to the confirmation: the message must go away
    // without another submit. (Too short for the server rule, so the new-password
    // field complains instead - but the confirm field must be clean.)
    await user.clear(screen.getByTestId("input-new-password"));
    await user.type(screen.getByTestId("input-new-password"), "abc");
    await waitFor(() => expect(screen.queryByText("De wachtwoorden komen niet overeen.")).not.toBeInTheDocument());
  });
});

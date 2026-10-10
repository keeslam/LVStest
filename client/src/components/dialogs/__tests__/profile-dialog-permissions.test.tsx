/**
 * A-1-6 / A-18-3: the Profiel tab listed the raw permission keys
 * ("manage_users", "view_vehicles"). It shows the same Dutch names as the
 * users dialog now.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// One stable object: the dialog resets its form in an effect keyed on `user`.
const authState = vi.hoisted(() => ({
  user: {
    id: 6,
    username: "e2e-user",
    role: "user",
    fullName: "E2E",
    email: null,
    createdAt: "2026-01-01T00:00:00Z",
    permissions: ["manage_users", "view_vehicles", "some_future_right"],
  },
  isLoading: false,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authState,
}));

import { ProfileDialog } from "@/components/dialogs/profile-dialog";

describe("profile dialog - permissions", () => {
  it("lists Dutch names, not the raw keys", async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ProfileDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Gebruikers beheren")).toBeInTheDocument();
    expect(screen.getByText("Voertuigen bekijken")).toBeInTheDocument();
    expect(screen.queryByText("manage_users")).toBeNull();
    expect(screen.queryByText("view_vehicles")).toBeNull();
    // A right without a label still shows (as its key) instead of vanishing.
    expect(screen.getByText("some_future_right")).toBeInTheDocument();
  });
});

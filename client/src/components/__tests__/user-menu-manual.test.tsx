/**
 * Het gebruikersmenu rechtsboven heeft een menupunt "Handleiding" dat de
 * handleiding als dialoog opent, met de hoofdstukkenlijst en het eerste
 * hoofdstuk gerenderd. Het staat buiten het blok "Beheer": ook een gewone
 * medewerker zonder beheerdersrol ziet het.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 2, username: "balie", fullName: "Balie Medewerker", role: "user", permissions: [], hidePrices: false },
    isLoading: false,
    logoutMutation: { mutate: vi.fn() },
  }),
}));

import { UserMenu } from "@/components/user-menu";

const chapters = [
  { slug: "00-wat-is-nieuw", title: "Wat is nieuw" },
  { slug: "06-transport", title: "6. Transport" },
];
const markdown = "# 6. Transport\n\nEen **transport** is elke verplaatsing.\n\n![Transporten](afbeeldingen/08-transporten.png)";

function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = String(queryKey[0]);
          if (url === "/api/manual") return chapters;
          if (url.startsWith("/api/manual/")) return { slug: url.slice("/api/manual/".length), title: "6. Transport", markdown };
          return [];
        },
      },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <UserMenu />
    </QueryClientProvider>,
  );
}

describe("UserMenu — Handleiding", () => {
  it("shows the item to a non-admin user and opens the manual dialog", async () => {
    mount();
    await userEvent.click(screen.getByTestId("user-menu-button"));
    const item = await screen.findByTestId("menu-manual");
    expect(item).toHaveTextContent("Handleiding");
    // Not inside the admin block: no admin entries for this role.
    expect(screen.queryByTestId("menu-users")).not.toBeInTheDocument();

    await userEvent.click(item);
    const dialog = await screen.findByTestId("manual-dialog");
    expect(dialog).toHaveTextContent("Gebruikershandleiding");
    expect(await screen.findByTestId("manual-chapter-06-transport")).toHaveTextContent("6. Transport");

    await userEvent.click(screen.getByTestId("manual-chapter-06-transport"));
    const content = await screen.findByTestId("manual-content");
    expect(await screen.findByRole("heading", { name: "6. Transport" })).toBeInTheDocument();
    expect(content.querySelector("strong")?.textContent).toBe("transport");
    // Relative image paths from the markdown point at the manual API.
    expect(content.querySelector("img")?.getAttribute("src")).toBe("/api/manual/afbeeldingen/08-transporten.png");
  });
});

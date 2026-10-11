/**
 * D14 (spec section 10): the administrator's dashboard banner "Sinds je vorige
 * inlog (<datum>) probeerden <n> medewerkers iets waarvoor ze geen recht
 * hebben", with a "Bekijken" button that opens the list (wie, wat, wanneer).
 * No banner when nothing was refused, for anybody who is not an administrator,
 * and for a first login (no previous login to compare with).
 *
 * Runs in the jsdom project, real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  user: { id: 1, username: "kees", role: "admin", permissions: [] as string[], previousLoginAt: "2026-10-09T08:00:00.000Z" } as Record<string, unknown> | null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: auth.user, isLoading: false }),
}));

import { AccessDeniedBanner } from "@/components/security/access-denied-banner";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SUMMARY = {
  since: "2026-10-09T08:00:00.000Z",
  count: 3,
  users: 2,
  entries: [
    { id: 3, userId: 7, username: "jan", createdAt: "2026-10-10T09:30:00.000Z", method: "GET", path: "/maintenance", required: ["manage_maintenance"], page: "/maintenance" },
    { id: 2, userId: 7, username: "jan", createdAt: "2026-10-10T09:29:00.000Z", method: "GET", path: "/api/vehicles", required: ["view_vehicles", "manage_vehicles"], page: null },
    { id: 1, userId: 8, username: "pieter", createdAt: "2026-10-09T12:00:00.000Z", method: "POST", path: "/api/expenses", required: ["manage_expenses"], page: null },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderBanner(answer: unknown = SUMMARY, status = 200) {
  fetchMock = vi.fn(async () => json(answer, status));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AccessDeniedBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.user = { id: 1, username: "kees", role: "admin", permissions: [], previousLoginAt: "2026-10-09T08:00:00.000Z" };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("access denied banner (D14)", () => {
  it("tells the administrator how many colleagues were refused since the previous login", async () => {
    renderBanner();
    const banner = await screen.findByTestId("banner-access-denied");
    expect(banner.textContent).toMatch(/Sinds je vorige inlog \(9 okt\. 2026/);
    expect(banner.textContent).toContain("probeerden 2 medewerkers iets waarvoor ze geen recht hebben");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/access-denied?since=2026-10-09T08%3A00%3A00.000Z");
  });

  it("uses the singular for one colleague", async () => {
    renderBanner({ ...SUMMARY, users: 1, count: 1, entries: [SUMMARY.entries[0]] });
    const banner = await screen.findByTestId("banner-access-denied");
    expect(banner.textContent).toContain("probeerde 1 medewerker iets waarvoor die geen recht heeft");
  });

  it("shows nothing when nothing was refused", async () => {
    renderBanner({ since: SUMMARY.since, count: 0, users: 0, entries: [] });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("banner-access-denied")).toBeNull();
  });

  it("shows nothing, and asks nothing, for a user who is not an administrator", async () => {
    auth.user = { id: 2, username: "jan", role: "manager", permissions: ["manage_users"], previousLoginAt: "2026-10-09T08:00:00.000Z" };
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("banner-access-denied")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows nothing, and asks nothing, at a first login (no previous login)", async () => {
    auth.user = { id: 1, username: "kees", role: "admin", permissions: [], previousLoginAt: null };
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("banner-access-denied")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failing request shows no banner and no error", async () => {
    renderBanner({ message: "boom" }, 500);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("banner-access-denied")).toBeNull();
  });

  it("Bekijken opens the list: who, what, when", async () => {
    const user = userEvent.setup();
    renderBanner();
    await screen.findByTestId("banner-access-denied");
    await user.click(screen.getByRole("button", { name: "Bekijken" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Geweigerde pogingen")).toBeInTheDocument();
    const rows = within(dialog).getAllByTestId("access-denied-row");
    expect(rows).toHaveLength(3);
    // Wie
    expect(rows[0].textContent).toContain("jan");
    expect(rows[2].textContent).toContain("pieter");
    // Wat: a screen, a read, a write; with the right that was missing, in words.
    expect(rows[0].textContent).toContain("Scherm /maintenance");
    expect(rows[0].textContent).toContain("Onderhoud beheren");
    expect(rows[1].textContent).toContain("Gegevens ophalen /api/vehicles");
    expect(rows[2].textContent).toContain("Wijzigen /api/expenses");
    // Wanneer
    expect(rows[0].textContent).toMatch(/10 okt\. 2026/);
  });
});

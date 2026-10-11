/**
 * B-28 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2) —
 * `NoAccessPage` is the full-page "U heeft geen toegang tot dit scherm"
 * message `ProtectedRoute` renders instead of a page component the signed-in
 * user may not open. This file tests the component in isolation: its
 * heading, the sentence naming the missing right(s) in words (reusing the
 * same labels `users-dialog.tsx` shows, via `shared/permission-labels.ts`),
 * and the way-out button to `firstOpenablePage(user)`.
 *
 * Runs in the jsdom project (plan §8.8). Real i18n (setup-jsdom.ts) so a
 * missing/renamed translation key fails this test instead of silently
 * rendering the raw key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { UserPermission } from "@shared/schema";
import { NoAccessPage } from "@/components/no-access-page";

function withRouter(node: React.ReactNode) {
  const { hook } = memoryLocation({ path: "/maintenance", static: true });
  return render(<Router hook={hook}>{node}</Router>);
}

const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
  new Response(JSON.stringify({ recorded: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NoAccessPage", () => {
  it("tells the server which screen was refused (D14), once", async () => {
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut={null} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/access-denied");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ page: "/maintenance" });
  });

  it("shows the page even when the report cannot be sent", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut={null} />);
    expect(screen.getByTestId("no-access-page")).toBeInTheDocument();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("no-access-page")).toBeInTheDocument();
  });

  it("shows the data-testid and the fixed heading", () => {
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut={null} />);
    const root = screen.getByTestId("no-access-page");
    expect(root).toBeInTheDocument();
    expect(screen.getByText("U heeft geen toegang tot dit scherm")).toBeInTheDocument();
  });

  it("names the single missing right in words, reusing the users-dialog label", () => {
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut={null} />);
    // "Onderhoud beheren" is PERMISSION_LABELS[MANAGE_MAINTENANCE] in
    // shared/permission-labels.ts — the same label users-dialog.tsx renders
    // for this permission's checkbox.
    expect(screen.getByTestId("no-access-page").textContent).toContain("'Onderhoud beheren'");
  });

  it("joins several missing rights with \"of\"", () => {
    withRouter(
      <NoAccessPage
        anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES, UserPermission.MANAGE_NOTIFICATIONS]}
        wayOut={null}
      />,
    );
    const text = screen.getByTestId("no-access-page").textContent ?? "";
    expect(text).toContain("'E-mailsjablonen beheren' of 'Meldingen beheren'");
  });

  it("renders a way-out button pointing at firstOpenablePage(user) when there is one", () => {
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut="/vehicles" />);
    const link = screen.getByTestId("button-no-access-way-out");
    expect(link).toHaveAttribute("href", "/vehicles");
  });

  it("renders no button when the user may open nothing", () => {
    withRouter(<NoAccessPage anyOf={[UserPermission.MANAGE_MAINTENANCE]} wayOut={null} />);
    expect(screen.queryByTestId("button-no-access-way-out")).not.toBeInTheDocument();
  });
});

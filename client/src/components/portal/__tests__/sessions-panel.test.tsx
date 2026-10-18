/**
 * Kees, 2026-10-18: Mijn account > Inloggen shows where the account is logged in and signs out one other
 * browser or all others; this browser has no sign-out button of its own.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalSessionDto } from "@shared/portal-types";

const sessions: PortalSessionDto[] = [
  { id: "a".repeat(24), current: true, browser: "Chrome", os: "Windows", ip: "10.0.0.1", signedInAt: "2026-10-18T08:00:00.000Z", lastActiveAt: "2026-10-18T09:00:00.000Z" },
  { id: "b".repeat(24), current: false, browser: "Safari", os: "iOS", ip: "10.0.0.2", signedInAt: null, lastActiveAt: "2026-10-17T09:00:00.000Z" },
];
const { portalFetch } = vi.hoisted(() => ({ portalFetch: vi.fn(async (..._a: unknown[]) => ({ count: 1, sessions: [] }) as unknown) }));
vi.mock("@/lib/portal-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-api")>()), portalFetch }));

import { SessionsPanel } from "@/components/portal/sessions-panel";

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/me/sessions"], sessions);
  return render(<QueryClientProvider client={qc}><SessionsPanel /></QueryClientProvider>);
}

describe("ingelogde apparaten", () => {
  it("names the devices and marks this one", () => {
    renderPanel();
    expect(screen.getByTestId(`session-${"a".repeat(24)}`)).toHaveTextContent("Chrome · Windows");
    expect(screen.getByTestId(`session-${"a".repeat(24)}`)).toHaveTextContent("Dit apparaat");
    expect(screen.queryByTestId(`button-sign-out-${"a".repeat(24)}`)).not.toBeInTheDocument();
  });

  it("signs out one other device, or all others", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`button-sign-out-${"b".repeat(24)}`));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("DELETE", `/api/portal/me/sessions/${"b".repeat(24)}`));
    portalFetch.mockClear();
    renderPanel();
    await user.click(screen.getAllByTestId("button-sign-out-others")[0]);
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/me/sessions/sign-out-others"));
  });
});

/**
 * Rapporten fase 1 - the km-history card on Rapporten > Voertuigen is admin only,
 * like GET /api/mileage-history. A non-admin with every permission sees no card
 * and never asks for the history; an admin sees the card and, after picking a
 * vehicle, the history is requested.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import ReportsPage from "@/pages/reports/index";

const VEHICLE = { id: 7, licensePlate: "ABC12D", brand: "Volkswagen", model: "Golf", freeKmPerDay: null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
function calledWithPrefix(prefix: string): boolean {
  return fetchMock.mock.calls.some(([input]) => pathOf(input).startsWith(prefix));
}

beforeEach(() => {
  // The reports shell keeps the tab and report in the URL; start without them.
  window.history.replaceState(null, "", "/reports");
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path === "/api/vehicles" || path.startsWith("/api/vehicles?")) return json([VEHICLE]);
    if (path.startsWith("/api/mileage-history")) {
      return json({
        vehicle: VEHICLE, rows: [],
        summary: { drivenKm: 0, avgPerMonth: null, freeKm: null, overFreeKm: null, readings: 0, warnings: 0, periodFrom: null, periodTo: null },
      });
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("/reports > Voertuigen - km-historie card", () => {
  it("is not rendered and /api/mileage-history is not requested for a non-admin with every permission", async () => {
    role = UserRole.USER;
    permissions = Object.values(UserPermission) as string[];
    const user = userEvent.setup();
    withClient(<ReportsPage />);

    await user.click(screen.getByRole("tab", { name: /Voertuigen/i }));
    // The tab itself is open (its list shows the downtime report), so the absence below is real.
    expect(await screen.findByTestId("report-nav-item-workshop-downtime")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("report-nav-item-mileage-history")).not.toBeInTheDocument();
    expect(screen.queryByTestId("card-report-mileage-history")).not.toBeInTheDocument();
    expect(calledWithPrefix("/api/mileage-history")).toBe(false);
  });

  it("is rendered for an admin and requests the history once a vehicle is picked", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    const user = userEvent.setup();
    withClient(<ReportsPage />);

    await user.click(screen.getByRole("tab", { name: /Voertuigen/i }));
    await user.click(await screen.findByTestId("report-nav-item-mileage-history"));
    const card = await screen.findByTestId("card-report-mileage-history");
    expect(calledWithPrefix("/api/mileage-history")).toBe(false);

    await user.click(within(card).getByTestId("select-report-mileage-vehicle"));
    await user.click(await screen.findByRole("option", { name: /Volkswagen Golf/i }));
    await waitFor(() => expect(calledWithPrefix(`/api/mileage-history/${VEHICLE.id}`) || calledWithPrefix(`/api/mileage-history?`)).toBe(true));
  });
});

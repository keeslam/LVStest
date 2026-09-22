/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 13) — the page's own permission is
 * VIEW_REPORTS/MANAGE_REPORTS; none of these four queries accept it
 * ("server narrower than menu, completely"). Each is the core data of its
 * own report tab, so denied renders NoDataAccess in that tab instead of an
 * empty/misleading report. `/api/expenses` was already gated (Task 6b,
 * canViewExpenses) - unaffected here.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.VIEW_REPORTS];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import ReportsPage from "@/pages/reports/index";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    const path = requestUrl.replace(/^https?:\/\/[^/]+/, "");
    return path === url || path.startsWith(`${url}?`);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => json([]));
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

describe("/reports — the default operations tab needs view_vehicles and view_reservations, not view_reports", () => {
  it("fires no /api/vehicles or /api/reservations and shows two NoDataAccess lines with view_reports alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);

    const holes = await screen.findAllByTestId("no-data-access");
    expect(holes.some((el) => el.textContent?.includes("Voertuigen bekijken"))).toBe(true);
    expect(holes.some((el) => el.textContent?.includes("Reserveringen bekijken"))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
    expect(calledWith("/api/reservations")).toBe(false);
  });

  it("fires both queries and shows no NoDataAccess with view_vehicles and view_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS];
    withClient(<ReportsPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

describe("/reports — the vehicles/customers/transports tabs follow their own families", () => {
  it("shows NoDataAccess in the vehicles tab without view_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    const user = userEvent.setup();
    withClient(<ReportsPage />);

    await user.click(screen.getByRole("tab", { name: /Voertuigen/i }));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Voertuigen bekijken");
  });

  it("shows NoDataAccess in the customers tab without view_customers, and fires /api/customers with it", async () => {
    role = UserRole.USER;
    const user = userEvent.setup();

    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);
    await user.click(screen.getByRole("tab", { name: /Klanten/i }));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Klanten bekijken");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/customers")).toBe(false);
  });

  it("shows no NoDataAccess in the transports tab and fires /api/transports with either family", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_VEHICLES];
    const user = userEvent.setup();
    withClient(<ReportsPage />);

    await user.click(screen.getByTestId("tab-report-transports"));
    await waitFor(() => expect(calledWith("/api/transports")).toBe(true));
  });
});

describe("/reports — admin", () => {
  it("gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<ReportsPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

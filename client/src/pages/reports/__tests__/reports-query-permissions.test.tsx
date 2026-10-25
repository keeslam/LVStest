/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 13) — the page's own permission is
 * VIEW_REPORTS/MANAGE_REPORTS; none of these four queries accept it
 * ("server narrower than menu, completely"). Each is the core data of its
 * own report tab, so denied renders NoDataAccess in that tab instead of an
 * empty/misleading report. `/api/expenses` was already gated (Task 6b,
 * canViewExpenses); the expenses tab itself rendered its ordinary "no
 * expenses" empty state on denial instead of NoDataAccess until the final
 * fix wave (2026-09-21 review, item 1) closed that hole.
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
  // The reports shell keeps the tab and report in the URL; start without them.
  window.history.replaceState(null, "", "/reports");
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

// Reports redesign Task 2: a report the user may not see is not in the list, and a tab
// without a visible report is not shown. Where the old tab showed NoDataAccess, the tab
// (or the report in its list) is now absent; the queries still do not fire.
// Task 5: the old operations numbers are Voertuigbenutting (vehicles + reservations) and the
// Kosten reports; there is no Overzicht report until Task 7.
describe("/reports — vehicle utilization needs view_vehicles and view_reservations, not view_reports", () => {
  it("fires no /api/vehicles or /api/reservations and offers no utilization with view_reports alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);

    expect(await screen.findByTestId("tab-report-financial")).toBeInTheDocument();
    // Overzicht is there (margin and fines tiles) but has no vehicle tiles.
    expect(screen.getByTestId("tab-report-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-tile-occupancy")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-vehicles")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-nav-item-vehicle-utilization")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
    expect(calledWith("/api/reservations")).toBe(false);
  });

  it("fires both queries and shows no NoDataAccess with view_vehicles and view_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS];
    window.history.replaceState(null, "", "/reports?tab=vehicles");
    withClient(<ReportsPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

describe("/reports — the expenses tab needs manage_expenses", () => {
  it("offers no expenses tab and fires no /api/expenses without manage_expenses", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);

    expect(await screen.findByTestId("tab-report-financial")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-expenses")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/expenses")).toBe(false);
  });

  it("shows no NoDataAccess in the expenses tab and fires /api/expenses with manage_expenses", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.MANAGE_EXPENSES];
    const user = userEvent.setup();
    withClient(<ReportsPage />);

    await user.click(screen.getByRole("tab", { name: /Kosten/i }));
    await waitFor(() => expect(calledWith("/api/expenses")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

describe("/reports — the vehicles/customers/transports tabs follow their own families", () => {
  it("offers no vehicles tab without view_vehicles and fires no /api/vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);

    expect(await screen.findByTestId("tab-report-financial")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-vehicles")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles")).toBe(false);
  });

  it("leaves the customer reports out of the list without view_customers, and fires no /api/customers", async () => {
    role = UserRole.USER;
    const user = userEvent.setup();

    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);
    await user.click(screen.getByRole("tab", { name: /Klanten/i }));
    expect(await screen.findByTestId("report-nav")).toBeInTheDocument();
    for (const id of ["customer-impact", "customer-cost-categories", "customer-reservations"]) {
      expect(screen.queryByTestId(`report-nav-item-${id}`)).not.toBeInTheDocument();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/customers")).toBe(false);
  });

  it("klantwaarde staat op Klanten ook zonder view_customers", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    const user = userEvent.setup();
    withClient(<ReportsPage />);
    await user.click(screen.getByRole("tab", { name: /Klanten/i }));
    expect(await screen.findByTestId("card-customer-value-report")).toBeInTheDocument();
    expect(screen.queryByTestId("report-nav-item-customer-impact")).not.toBeInTheDocument();
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
    window.history.replaceState(null, "", "/reports?tab=expenses");
    withClient(<ReportsPage />);

    await waitFor(() => expect(calledWith("/api/vehicles")).toBe(true));
    await waitFor(() => expect(calledWith("/api/reservations")).toBe(true));
    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

describe("/reports - tabblad Portaal", () => {
  it("zonder portaalrecht geen tabblad en geen verzoek", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("tab-report-portal")).not.toBeInTheDocument();
    expect(calledWith("/api/reports/portal-requests/summary")).toBe(false);
    expect(calledWith("/api/reports/waitlist/summary")).toBe(false);
  });

  it("met portaalrecht staat het tabblad er en opent de kaart", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_PORTAL];
    const user = userEvent.setup();
    withClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-portal"));
    expect(await screen.findByTestId("card-portal-requests-report")).toBeInTheDocument();
  });
});

describe("/reports - tabblad Kantoor", () => {
  const calledPrefix = (prefix: string) => fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return requestUrl.replace(/^https?:\/\/[^/]+/, "").startsWith(prefix);
  });

  it("zonder bronrecht geen tabblad en geen verzoek", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    withClient(<ReportsPage />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("tab-report-office")).not.toBeInTheDocument();
    expect(calledPrefix("/api/reports/invoice-inbox")).toBe(false);
    expect(calledPrefix("/api/reports/deliveries")).toBe(false);
    expect(calledPrefix("/api/reports/damage-checks")).toBe(false);
  });

  it("met alleen manage_settings: tabblad, rondes, geen factuurlijst", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.MANAGE_SETTINGS];
    const user = userEvent.setup();
    withClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-office"));
    expect(await screen.findByTestId("card-invoice-inbox-report")).toBeInTheDocument();
    await waitFor(() => expect(calledWith("/api/reports/invoice-inbox-runs/summary")).toBe(true));
    expect(calledPrefix("/api/reports/invoice-inbox-items")).toBe(false);
  });

  it("met alleen het transportrecht (view_reservations) staat het tabblad er en opent de bezorgkaart", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_RESERVATIONS];
    const user = userEvent.setup();
    withClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-office"));
    expect(await screen.findByTestId("card-delivery-report")).toBeInTheDocument();
    expect(screen.queryByTestId("card-invoice-inbox-report")).not.toBeInTheDocument();
    await waitFor(() => expect(calledWith("/api/reports/deliveries/summary")).toBe(true));
    expect(calledPrefix("/api/reports/invoice-inbox")).toBe(false);
  });

  it("met alleen het schadecheckrecht staat het tabblad er en opent de schadecheckkaart", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_DAMAGE_CHECKS];
    const user = userEvent.setup();
    withClient(<ReportsPage />);
    await user.click(await screen.findByTestId("tab-report-office"));
    expect(await screen.findByTestId("card-damage-checks-report")).toBeInTheDocument();
    expect(screen.queryByTestId("card-invoice-inbox-report")).not.toBeInTheDocument();
    expect(screen.queryByTestId("card-delivery-report")).not.toBeInTheDocument();
    await waitFor(() => expect(calledWith("/api/reports/damage-checks/summary")).toBe(true));
    expect(calledPrefix("/api/reports/invoice-inbox")).toBe(false);
    expect(calledPrefix("/api/reports/deliveries")).toBe(false);
  });
});

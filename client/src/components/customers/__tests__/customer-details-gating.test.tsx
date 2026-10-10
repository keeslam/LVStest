/**
 * Final wave A, item 8 (P8 carry): "Klant openen" from the fine dialog opens CustomerDetails, whose
 * queries had no `enabled` gates, so a profile with view_fines only got red "Kon de gegevens niet laden"
 * toasts. Each query now waits for the right its server route needs; a part the profile may not read
 * says which right is missing instead.
 *
 *   GET /api/customers/:id, /drivers, /blacklist  -> view_customers or manage_customers
 *   GET /api/reservations/customer/:id            -> view_reservations or manage_reservations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
  AuthContext: {},
}));

import { CustomerDetails } from "@/components/customers/customer-details";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const customer = { id: 7, name: "Voorbeeld B.V.", email: "info@voorbeeld.nl", phone: "0201234567", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
let requested: string[];
const holds = (...anyOf: string[]) => role === UserRole.ADMIN || anyOf.some((p) => permissions.includes(p));

beforeEach(() => {
  requested = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    requested.push(url);
    // What the server would do for a profile without the right.
    if (url.includes("/api/reservations/customer/") && !holds(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS)) return json({ message: "Not authorized" }, 403);
    if (/\/api\/customers\/7/.test(url) && !holds(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS)) return json({ message: "Not authorized" }, 403);
    if (/\/api\/customers\/7$/.test(url)) return json(customer);
    if (url.includes("/api/audit-logs/resource/customer/7")) {
      return holds(UserPermission.MANAGE_USERS, UserPermission.MANAGE_CUSTOMERS) ? json({ logs: [], total: 0 }) : json({ message: "no" }, 403);
    }
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderDetails(initialTab?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <CustomerDetails customerId={7} inDialog initialTab={initialTab} />
      </GlobalDialogProvider>
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("CustomerDetails for a profile that may not read customers", () => {
  it("asks the server for nothing, shows which right is missing and no red toast (view_fines only)", async () => {
    permissions = [UserPermission.VIEW_FINES];
    renderDetails();
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Klanten bekijken");
    expect(requested.filter((url) => /\/api\/(customers|reservations)/.test(url))).toEqual([]);
    expect(screen.queryByText("Kon de gegevens niet laden")).toBeNull();
    expect(screen.queryByText(/Er is iets misgegaan|Not authorized/)).toBeNull();
  });
});

describe("CustomerDetails for a profile that reads customers but not reservations", () => {
  it("loads the customer, never asks for reservations and says which right the rental parts need", async () => {
    permissions = [UserPermission.VIEW_CUSTOMERS];
    renderDetails("active");
    expect(await screen.findByRole("heading", { name: "Voorbeeld B.V." })).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/api/customers/7"))).toBe(true);
    expect(requested.some((url) => url.includes("/api/reservations/customer/"))).toBe(false);
    expect((await screen.findAllByTestId("no-data-access")).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("no-data-access")[0]).toHaveTextContent("Reserveringen bekijken");
    expect(screen.queryByText("Kon de gegevens niet laden")).toBeNull();
  });
});

describe("CustomerDetails for a profile with both rights", () => {
  it("asks for everything and shows no missing-right line", async () => {
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.VIEW_RESERVATIONS];
    renderDetails("active");
    expect(await screen.findByRole("heading", { name: "Voorbeeld B.V." })).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/api/reservations/customer/7"))).toBe(true);
    expect(screen.queryByTestId("no-data-access")).toBeNull();
  });

  it("admin passes by role", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    renderDetails();
    expect(await screen.findByRole("heading", { name: "Voorbeeld B.V." })).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/api/reservations/customer/7"))).toBe(true);
    role = UserRole.USER;
  });
});

describe("the history tab asks for the right the history route needs (final wave A, fix round 1)", () => {
  it("view_customers + view_reservations: no request and the explanation line, no red toast", async () => {
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.VIEW_RESERVATIONS];
    renderDetails("history");
    expect(await screen.findByTestId("record-history-forbidden")).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/api/audit-logs"))).toBe(false);
    expect(screen.queryByText("Kon de gegevens niet laden")).toBeNull();
  });

  it("manage_customers loads the history", async () => {
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS];
    renderDetails("history");
    expect(await screen.findByTestId("record-history-empty")).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/api/audit-logs/resource/customer/7"))).toBe(true);
    expect(screen.queryByTestId("record-history-forbidden")).toBeNull();
  });
});

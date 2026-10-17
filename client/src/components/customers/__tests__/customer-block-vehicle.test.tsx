/**
 * Blocking a vehicle from the customer screen: the mirror image of the vehicle
 * screen's blacklist form. The customer is fixed, the vehicle is chosen, and the
 * save goes through the existing POST /api/vehicles/:vehicleId/blacklist with
 * this customer's id. Lifting a block asks first, then DELETE /api/blacklist/:id.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const vehicles = [
  { id: 3, brand: "Volkswagen", model: "Golf", licensePlate: "AB12CD" },
  { id: 4, brand: "Toyota", model: "Yaris", licensePlate: "XY98ZZ" },
];
let blocked: any[];
let calls: Array<{ method: string; url: string; body: any }>;

beforeEach(() => {
  blocked = [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "POST" && /\/api\/vehicles\/\d+\/blacklist$/.test(url)) return json({ id: 42 }, 201);
    if (method === "DELETE" && /\/api\/blacklist\/\d+$/.test(url)) return json({ success: true });
    if (/\/api\/customers\/7\/blacklist$/.test(url)) return json(blocked);
    if (/\/api\/customers\/7$/.test(url)) return json(customer);
    if (/\/api\/vehicles$/.test(url)) return json(vehicles);
    if (url.includes("/api/audit-logs/")) return json({ logs: [], total: 0 });
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderDetails() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <CustomerDetails customerId={7} inDialog />
      </GlobalDialogProvider>
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("Voertuig blokkeren vanuit het klantscherm", () => {
  it("opens the form and saves a block for this customer via POST /api/vehicles/:id/blacklist", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS, UserPermission.VIEW_VEHICLES];
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByTestId("button-block-vehicle"));
    expect(await screen.findByRole("heading", { name: "Voertuig blokkeren voor deze klant" })).toBeInTheDocument();

    await user.click(await screen.findByTestId("select-block-vehicle"));
    await user.type(await screen.findByRole("combobox", { name: /Zoek op kenteken/ }), "XY98");
    await user.click(await screen.findByRole("option", { name: /Toyota Yaris/ }));
    await user.type(screen.getByTestId("input-block-reason"), "Schade niet betaald");
    await user.click(screen.getByTestId("button-confirm-block-vehicle"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/api\/vehicles\/4\/blacklist$/);
    expect(post.body).toEqual({ customerId: 7, reason: "Schade niet betaald" });
    expect(await screen.findByText("Voertuig geblokkeerd")).toBeInTheDocument();
  });

  // B-27: a control the user may not use stays visible but switched off (RequiresPermission).
  it("block and lift buttons are switched off without manage_customers or manage_vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.VIEW_VEHICLES];
    blocked = [{ id: 5, vehicleId: 3, customerId: 7, reason: null, vehicle: vehicles[0] }];
    const user = userEvent.setup();
    renderDetails();

    expect(await screen.findByTestId("blocked-vehicle-entry-5")).toBeInTheDocument();
    const blockButton = screen.getByTestId("button-block-vehicle");
    expect(blockButton).toBeDisabled();
    expect(screen.getByTestId("button-remove-blocked-vehicle-5")).toBeDisabled();

    // A click on the switched-off button opens nothing.
    await user.click(blockButton);
    expect(screen.queryByRole("heading", { name: "Voertuig blokkeren voor deze klant" })).toBeNull();
    expect(calls.some((c) => /\/api\/vehicles$/.test(c.url))).toBe(false);
  });

  it("manage_vehicles alone also gets the button", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_VEHICLES];
    renderDetails();
    expect(await screen.findByTestId("button-block-vehicle")).toBeInTheDocument();
  });

  it("lifting a block asks first, then calls DELETE /api/blacklist/:id", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    blocked = [{ id: 5, vehicleId: 3, customerId: 7, reason: "Rookt in de auto", vehicle: vehicles[0] }];
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByTestId("button-remove-blocked-vehicle-5"));
    expect(await screen.findByText("Blokkade opheffen?")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await user.click(screen.getByTestId("confirm-remove-blocked-vehicle"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && /\/api\/blacklist\/5$/.test(c.url))).toBe(true));
    expect(await screen.findByText("Blokkade opgeheven")).toBeInTheDocument();
  });
});

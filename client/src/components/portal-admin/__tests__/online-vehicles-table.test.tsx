/**
 * "Voertuigen online" (audit 2026-10-09, A-15-3): statuses in words, a toast
 * on every change, and a warning before a car that cannot be rented goes online.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => ({ openPortalListDialog: vi.fn() }) }));

import { OnlineVehiclesTable } from "@/components/portal-admin/online-vehicles-table";

const row = { vehicleType: null, onlineDescription: null, dailyPrice: null, monthlyPrice: null, blockedCustomers: 0, offeredOnline: false, brand: "Opel", model: "Vivaro" };
const vehicles = [
  { ...row, id: 1, licensePlate: "AB-123-C", availabilityStatus: "available" },
  { ...row, id: 2, licensePlate: "DE-456-F", availabilityStatus: "needs_fixing" },
  { ...row, id: 3, licensePlate: "GH-789-J", availabilityStatus: "rented" },
];
const calls: Array<{ method: string; url: string; body?: string }> = [];

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <OnlineVehiclesTable />
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string | undefined });
    const body = method === "GET" ? vehicles : { updated: 1 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("voertuigen online", () => {
  it("shows the status in words, not the internal value", async () => {
    renderTable();
    // Scoped to the rows: the status filter above the table names the same statuses.
    expect(within(await screen.findByTestId("row-vehicle-2")).getByText("Reparatie nodig")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-vehicle-3")).getByText("Verhuurd")).toBeInTheDocument();
    expect(screen.queryByText("needs_fixing")).not.toBeInTheDocument();
    expect(screen.queryByText("rented")).not.toBeInTheDocument();
  });

  it("puts a rentable car online straight away and says so", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "Online aanbieden: AB-123-C" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toBe(JSON.stringify({ offeredOnline: true })));
    expect(await screen.findByText("AB-123-C staat nu online.")).toBeInTheDocument();
  });

  it("warns before a car that cannot be rented goes online, and keeps it offline on cancel", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "Online aanbieden: DE-456-F" }));
    expect(await screen.findByTestId("confirm-dialog-description")).toHaveTextContent(/DE-456-F.*Reparatie nodig.*kan niet worden verhuurd/);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("puts the car online after the warning is confirmed", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "Online aanbieden: DE-456-F" }));
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/vehicles-online/2"))).toBe(true));
    expect(await screen.findByText("DE-456-F staat nu online.")).toBeInTheDocument();
  });

  it("warns once for a selection that holds a car that cannot be rented", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Selecteer AB-123-C" }));
    await user.click(screen.getByRole("checkbox", { name: "Selecteer DE-456-F" }));
    await user.click(screen.getByRole("button", { name: /Selectie online/ }));
    expect(await screen.findByTestId("confirm-dialog-description")).toHaveTextContent(/1 van de gekozen voertuigen is niet verhuurbaar \(DE-456-F\)/);
    await user.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/vehicles-online/bulk"))).toBe(true));
    expect(await screen.findByText("2 voertuig(en) online gezet.")).toBeInTheDocument();
  });
});

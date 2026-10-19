/**
 * Audit 2026-10-09, module 7, finding A-7-11 (package P4, the part that needs
 * no owner decision): the maintenance overview ("Onderhoudsoverzicht") had no
 * "Afronden" and no "Binnen melden" - everything went through the edit form.
 * Both buttons now sit on every open row; "Afronden" opens the existing
 * CompleteMaintenanceDialog (the calendar's one), "Binnen melden" runs the
 * action that puts block and vehicle in the workshop together.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { MaintenanceListDialog } from "@/components/maintenance/maintenance-list-dialog";

const vehicle = (id: number, plate: string) => ({
  id, brand: "Audi", model: "A4", licensePlate: plate, apkDate: "2026-12-01", currentMileage: 41000,
});
const block = (id: number, vehicleId: number, status: string, maintenanceStatus: string) => ({
  id, type: "maintenance_block", status, maintenanceStatus, vehicleId,
  startDate: "2026-11-03", endDate: "2026-11-03", maintenanceDuration: 1,
  notes: "breakdown: lekke band", createdBy: "kees", vehicle: vehicle(vehicleId, `11AAA${vehicleId}`),
});
const BLOCKS = [
  block(7, 1, "booked", "scheduled"),
  block(9, 2, "picked_up", "in"),
  block(10, 3, "completed", "out"),
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Call = { method: string; url: string; body: any };
let calls: Call[];

beforeEach(() => {
  role = UserRole.ADMIN;
  permissions = [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method === "PATCH" && url.endsWith("/maintenance-status")) return json({ id: 1 });
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity, queryFn: async () => [] } },
  });
  client.setQueryData(["/api/vehicles/apk-expiring"], []);
  client.setQueryData(["/api/vehicles/warranty-expiring"], []);
  // BUG-205 phase B: the list asks for the maintenance blocks only.
  client.setQueryData(["/api/reservations", { type: "maintenance_block" }], BLOCKS);
  client.setQueryData(["/api/placeholder-reservations/needing-assignment"], []);
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <MaintenanceListDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("tab", { name: /^Gepland/ }));
  await screen.findByTestId("row-maintenance-7");
  return user;
}

describe("the overview offers Afronden and Binnen melden on open rows", () => {
  it("a planned block has both, a block that is already in only Afronden, a finished one neither", async () => {
    await renderOverview();
    expect(within(screen.getByTestId("row-maintenance-7")).getByTestId("button-list-complete-7")).toBeVisible();
    expect(within(screen.getByTestId("row-maintenance-7")).getByTestId("button-list-checkin-7")).toBeVisible();
    expect(within(screen.getByTestId("row-maintenance-9")).getByTestId("button-list-complete-9")).toBeVisible();
    expect(screen.queryByTestId("button-list-checkin-9")).toBeNull();
    expect(screen.queryByTestId("button-list-complete-10")).toBeNull();
    expect(screen.queryByTestId("button-list-checkin-10")).toBeNull();
  });

  it("Afronden opens the completion dialog for that block, prefilled with the vehicle's APK date and reading", async () => {
    const user = await renderOverview();
    await user.click(screen.getByTestId("button-list-complete-7"));

    const dialog = await screen.findByTestId("dialog-complete-maintenance");
    expect(within(dialog).getByTestId("input-apk-date")).toHaveValue("2026-12-01");
    expect(within(dialog).getByTestId("input-current-mileage")).toHaveValue(41000);
  });

  it("Binnen melden puts block and vehicle in the workshop with one request", async () => {
    const user = await renderOverview();
    await user.click(screen.getByTestId("button-list-checkin-7"));

    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/vehicles/1/maintenance-status");
    expect(patch.body).toEqual({ status: "in_service", blockId: 7 });
  });
});

describe("the new buttons are gated like their screens", () => {
  it("without any maintenance right both buttons are visible but disabled", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    await renderOverview();
    expect(screen.getByTestId("button-list-complete-7")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("button-list-checkin-7")).toHaveAttribute("aria-disabled", "true");
  });

  it("manage_maintenance alone completes but cannot check a vehicle in (that route needs manage_vehicles)", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_MAINTENANCE];
    await renderOverview();
    expect(screen.getByTestId("button-list-complete-7")).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("button-list-checkin-7")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("the search matches what the row says (final wave A, item 9)", () => {
  it("'pech' finds a breakdown block, whose stored notes say 'breakdown: ...'", async () => {
    const user = await renderOverview();
    const search = screen.getByTestId("input-maintenance-search");
    await user.type(search, "pech");
    expect(screen.getByTestId("row-maintenance-7")).toBeInTheDocument();
    expect(screen.getByTestId("row-maintenance-9")).toBeInTheDocument();
    // The stored word still works, and so does the description.
    await user.clear(search);
    await user.type(search, "breakdown");
    expect(screen.getByTestId("row-maintenance-7")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "lekke");
    expect(screen.getByTestId("row-maintenance-7")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zzzzzz");
    expect(screen.queryByTestId("row-maintenance-7")).toBeNull();
  });
});

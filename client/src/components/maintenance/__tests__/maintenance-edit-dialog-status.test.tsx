/**
 * Audit module 7, finding 2 (controller's ruling, sub-project C Task 8): the
 * maintenance edit dialog's Status select has to show what is stored.
 *
 * The reset effect that runs when the dialog opens fell back to "in" for every
 * stored value except in/out, so a block that was merely planned opened as
 * "Binnen (voertuig is in onderhoud)"; saving it unchanged then sent
 * status "in" and moved the block - and through the server, the car - into the
 * workshop.
 *
 * The earlier toegang task gave up on rendering this dialog (an effect whose
 * dependency list holds query results defaulted to `[]`, a new array on every
 * render, so an empty cache loops). Seeding the two query keys that default to
 * `[]` - the customers list and the vehicle's overlapping rentals - with
 * `staleTime: Infinity` hands the effect stable arrays and the dialog renders.
 *
 * Sub-project D, D7 (besluiten B-41/B-42): "Uit (onderhoud voltooid)" is gone. The
 * select offers Gepland and Binnen only; a finished block shows "Afgerond op <datum>"
 * as text; a new button "Afronden" opens the completion dialog and, once that is
 * done, closes this dialog too.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false },
    isLoading: false,
  }),
}));

import { MaintenanceEditDialog } from "@/components/maintenance/maintenance-edit-dialog";

const START = "2026-10-19";
const VEHICLE_ID = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const VEHICLE = { id: VEHICLE_ID, licensePlate: "11-AAA-1", brand: "Audi", model: "A4", currentMileage: 45000, apkDate: "2027-01-01" };

const block = (maintenanceStatus: string | null, status?: string) => ({
  id: 501,
  vehicleId: VEHICLE_ID,
  type: "maintenance_block",
  status: status ?? (maintenanceStatus === "out" ? "completed" : "booked"),
  startDate: START,
  endDate: START,
  maintenanceStatus,
  notes: "breakdown: onderhoud test",
  maintenanceDuration: 1,
  customerId: null,
}) as any;

function renderDialog(maintenanceStatus: string | null, onOpenChange: (open: boolean) => void = () => {}, status?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  client.setQueryData(["/api/customers"], []);
  client.setQueryData(["/api/vehicles"], [VEHICLE]);
  client.setQueryData(["/api/vehicles", VEHICLE_ID, "overlaps", START, START], []);
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceEditDialog open onOpenChange={onOpenChange} reservation={block(maintenanceStatus, status)} />
    </QueryClientProvider>,
  );
}

let calls: Array<{ method: string; url: string; body?: any }>;
let patchAnswer: () => Response;
beforeEach(() => {
  calls = [];
  toastSpy.mockClear();
  patchAnswer = () => json({ id: 501 });
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url: String(typeof input === "string" ? input : input.url), body: init?.body ? JSON.parse(init.body) : undefined });
    if (String(input).includes("/complete-maintenance")) return json({ block: { id: 501 }, vehicle: VEHICLE });
    if (method === "PATCH") return patchAnswer();
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function shownStatus(): Promise<string> {
  const trigger = await screen.findByTestId("select-maintenance-status");
  await waitFor(() => expect(trigger.textContent).toBeTruthy());
  return trigger.textContent ?? "";
}

describe("MaintenanceEditDialog - the Status select shows the stored status", () => {
  it("a planned block opens as Gepland, not Binnen", async () => {
    renderDialog("scheduled");
    expect(await shownStatus()).toBe("Gepland (voertuig nog niet gearriveerd)");
  });

  it("a legacy block without a status is read as planned too", async () => {
    renderDialog(null);
    expect(await shownStatus()).toBe("Gepland (voertuig nog niet gearriveerd)");
  });

  it("a block whose car is in the workshop opens as Binnen", async () => {
    renderDialog("in");
    expect(await shownStatus()).toBe("Binnen (voertuig is in onderhoud)");
  });

  it("offers Gepland and Binnen only: 'Uit (onderhoud voltooid)' is gone", async () => {
    const user = userEvent.setup();
    renderDialog("in");
    await user.click(await screen.findByTestId("select-maintenance-status"));

    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["Gepland (voertuig nog niet gearriveerd)", "Binnen (voertuig is in onderhoud)"]);
    expect(screen.queryByText("Uit (onderhoud voltooid)")).toBeNull();
  });
});

describe("MaintenanceEditDialog - a finished block (D7)", () => {
  it("shows 'Afgerond op <datum>' as text instead of a select, and offers no Afronden", async () => {
    renderDialog("out");

    const text = await screen.findByTestId("text-maintenance-completed");
    expect(text.textContent).toContain("Afgerond op");
    expect(text.textContent).toContain("19 oktober 2026");
    expect(screen.queryByTestId("select-maintenance-status")).toBeNull();
    expect(screen.queryByTestId("button-edit-complete-maintenance")).toBeNull();
  });
});

describe("MaintenanceEditDialog - saving (D7)", () => {
  it("a finished block is saved without a status, so the server's USE_COMPLETE_ROUTE refusal cannot trip", async () => {
    const user = userEvent.setup();
    renderDialog("out");

    await user.click(await screen.findByTestId("button-update-maintenance"));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/reservations/501");
    expect(patch.body).not.toHaveProperty("status");
    expect(patch.body).not.toHaveProperty("maintenanceStatus");
  });

  it("an open block is saved with the chosen status", async () => {
    const user = userEvent.setup();
    renderDialog("in");

    await user.click(await screen.findByTestId("button-update-maintenance"));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ status: "in", maintenanceStatus: "in" });
  });

  it.each([
    ["reverted from the history (picked_up / in)", "picked_up"],
    ["reverted by the old history button (completed / in)", "completed"],
  ])("a block %s is an open block: Afronden is offered and the save sends status in + maintenance in", async (_label, status) => {
    const user = userEvent.setup();
    renderDialog("in", () => {}, status);

    expect(await screen.findByTestId("button-edit-complete-maintenance")).toBeInTheDocument();
    await user.click(await screen.findByTestId("button-update-maintenance"));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ status: "in", maintenanceStatus: "in" });
  });

  it("USE_COMPLETE_ROUTE is worded by code and points at Afronden", async () => {
    const user = userEvent.setup();
    patchAnswer = () => json({ message: "finish with the completion route", code: "USE_COMPLETE_ROUTE" }, 400);
    renderDialog("in");

    await user.click(await screen.findByTestId("button-update-maintenance"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0].description).toBe("Een onderhoud rond je af met de knop Afronden, niet met de status.");
  });
});

describe("MaintenanceEditDialog - the Afronden button (D7)", () => {
  it("opens the completion dialog, and closes this dialog once the block is completed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog("in", onOpenChange);

    await user.click(await screen.findByTestId("button-edit-complete-maintenance"));
    const completion = await screen.findByTestId("dialog-complete-maintenance");
    expect(completion).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(await screen.findByTestId("button-complete-maintenance"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/reservations/501/complete-maintenance")).toBe(true));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("is there for a planned block too", async () => {
    renderDialog("scheduled");
    expect(await screen.findByTestId("button-edit-complete-maintenance")).toBeInTheDocument();
  });
});

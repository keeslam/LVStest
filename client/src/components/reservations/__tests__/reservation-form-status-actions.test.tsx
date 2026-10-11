/**
 * D3 (besluiten B-41/B-42) - the reservation status is changed only by Ophalen, Inleveren,
 * Annuleren and Terugdraaien, never by the edit form.
 *
 * - The form has no status field and none of the fields that only showed up for a completed
 *   rental (kilometerstand bij inleveren, brandstofniveau retour, brandstofkosten).
 * - The form never sends a `status`: a new reservation is Geboekt (the server forces it), an
 *   existing one keeps what it has.
 * - After saving a NEW reservation "Nu ophalen" (button-pickup-now) opens the existing PickupDialog
 *   for that reservation: in the success box where the form stays open, and as the action of the
 *   success toast where a parent dialog hosts its own PickupDialog and closes on success.
 * - In the edit form, Annuleren opens the cascade-aware cancel dialog (PATCH /:id/status).
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";
import { ReservationForm } from "@/components/reservations/reservation-form";

vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
// The real dialog is tested in pickup-return tests; here only "which reservation, opened or not".
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: ({ open, reservation }: any) =>
    open ? <div data-testid="pickup-dialog-stub">{`pickup #${reservation.id}`}</div> : null,
  ReturnDialog: () => null,
}));
vi.mock("@/components/reservations/cancel-reservation-dialog", () => ({
  CancelReservationDialog: ({ open, reservationId }: any) =>
    open ? <div data-testid="cancel-dialog-stub">{`cancel #${reservationId}`}</div> : null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

const vehicle = { id: 1821, licensePlate: "HL-02-HL", brand: "Volkswagen", model: "Crafter", company: "false", currentMileage: 25600 };
const customer = { id: 55, name: "Testklant Bv" };

let sent: Array<{ url: string; method: string; form: FormData | null }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    sent.push({ url, method, form: init?.body instanceof FormData ? init.body : null });
    if (url === "/api/vehicles" && method === "GET") return json([vehicle]);
    if (url === `/api/vehicles/${vehicle.id}` && method === "GET") return json(vehicle);
    if (url === "/api/customers" && method === "GET") return json([customer]);
    if (url === "/api/reservations" && method === "POST") return json({ id: 999, status: "booked", vehicleId: vehicle.id, customerId: customer.id });
    if (url === "/api/reservations/77" && method === "PATCH") return json({ id: 77, status: "picked_up" });
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderForm(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationForm initialVehicleId={String(vehicle.id)} initialCustomerId={String(customer.id)} {...props} />
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const rental = {
  id: 77, vehicleId: vehicle.id, customerId: customer.id, type: "standard", status: "picked_up",
  startDate: "2026-10-01", endDate: "2026-10-10", contractNumber: "C-1", pickupMileage: 100, fuelCost: "12.50",
  vehicle, customer,
};

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Volkswagen Crafter");
  const button = await screen.findByTestId("button-submit-reservation");
  await waitFor(() => expect(button).not.toBeDisabled());
  await user.click(button);
}

describe("D3 - the reservation form has no status field", () => {
  it("a new reservation offers no status select and no return-only fields", async () => {
    renderForm();
    await screen.findByTestId("button-submit-reservation");

    expect(screen.queryByText("Reserveringsstatus")).toBeNull();
    expect(screen.queryByText("Werk de reserveringsstatus bij indien nodig")).toBeNull();
    expect(screen.queryByTestId("select-fuel-level-return")).toBeNull();
    expect(screen.queryByTestId("input-fuel-cost")).toBeNull();
    expect(screen.queryByLabelText("Kilometerstand bij inleveren")).toBeNull();
  });

  it("a completed rental in the edit form shows no status field and none of the return-only fields either", async () => {
    renderForm({ editMode: true, initialData: { ...rental, status: "completed", returnMileage: 500, fuelLevelReturn: "Full" } });
    await screen.findByTestId("button-submit-reservation");

    expect(screen.queryByText("Reserveringsstatus")).toBeNull();
    expect(screen.queryByTestId("select-fuel-level-return")).toBeNull();
    expect(screen.queryByTestId("input-fuel-cost")).toBeNull();
    expect(screen.queryByLabelText("Kilometerstand bij inleveren")).toBeNull();
    // A completed rental cannot be cancelled either.
    expect(screen.queryByTestId("button-cancel-reservation-form")).toBeNull();
  });

  it("saving a new reservation sends no status", async () => {
    const user = userEvent.setup();
    renderForm();
    await submit(user);

    await waitFor(() => expect(sent.some((r) => r.url === "/api/reservations" && r.method === "POST")).toBe(true));
    const post = sent.find((r) => r.url === "/api/reservations" && r.method === "POST")!;
    expect(post.form!.has("status")).toBe(false);
  });

  it("saving an edit sends no status, even for a picked-up rental", async () => {
    const user = userEvent.setup();
    renderForm({ editMode: true, initialData: rental });
    await submit(user);

    await waitFor(() => expect(sent.some((r) => r.url === "/api/reservations/77" && r.method === "PATCH")).toBe(true));
    const patch = sent.find((r) => r.url === "/api/reservations/77" && r.method === "PATCH")!;
    expect(patch.form!.has("status")).toBe(false);
    // The contract number of a picked-up rental stays editable here, as before.
    expect(patch.form!.get("contractNumber")).toBe("C-1");
  });
});

describe("D3 - Nu ophalen after saving a new reservation", () => {
  it("the success box offers the button and it opens the pickup dialog for the saved reservation", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByTestId("button-pickup-now")).toBeNull();
    await submit(user);

    const pickupNow = await screen.findByTestId("button-pickup-now");
    expect(screen.queryByTestId("pickup-dialog-stub")).toBeNull();
    await user.click(pickupNow);

    expect((await screen.findByTestId("pickup-dialog-stub")).textContent).toBe("pickup #999");
  });

  it("a parent that hosts the pickup dialog gets the reservation from the toast action", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onTriggerPickupDialog = vi.fn();
    renderForm({ onSuccess, onTriggerPickupDialog });
    await submit(user);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    // The dialog closes on success, so the toast carries the one extra click.
    // (The test keeps the form mounted, so the success box shows its own button too.)
    const action = (await screen.findAllByTestId("button-pickup-now")).find((el) => el.closest("[data-radix-toast-announce-exclude]"));
    expect(action).toBeTruthy();
    await user.click(action!);

    expect(onTriggerPickupDialog).toHaveBeenCalledTimes(1);
    expect(onTriggerPickupDialog.mock.calls[0][0]).toMatchObject({ id: 999, status: "booked" });
  });

  it("editing an existing reservation never offers it", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderForm({ editMode: true, initialData: { ...rental, status: "booked" }, onSuccess, onTriggerPickupDialog: vi.fn() });
    await submit(user);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(screen.queryByTestId("button-pickup-now")).toBeNull();
  });
});

describe("D3 - Annuleren from the edit form", () => {
  it("opens the cancel dialog of the reservation (the status route, with the picked-up warning)", async () => {
    const user = userEvent.setup();
    renderForm({ editMode: true, initialData: rental });

    const cancel = await screen.findByTestId("button-cancel-reservation-form");
    expect(screen.queryByTestId("cancel-dialog-stub")).toBeNull();
    await user.click(cancel);

    expect((await screen.findByTestId("cancel-dialog-stub")).textContent).toBe("cancel #77");
    // Opening the dialog saves nothing and never writes a status through the edit route.
    expect(sent.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("a new reservation has no cancel button", async () => {
    renderForm();
    await screen.findByTestId("button-submit-reservation");
    expect(screen.queryByTestId("button-cancel-reservation-form")).toBeNull();
  });
});

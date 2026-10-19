/**
 * `MaintenanceViewDialog` — fix round 2 (reviewer), item 3: a real-site proof
 * that a denied user clicking `button-upload-photos` (inside
 * `InlineDocumentUpload`, which wraps its children in its own
 * `<div onClick={() => setIsOpen(true)}>`) does NOT open the upload dialog.
 * Unlike `MaintenanceEditDialog` (task-4-report.md §9 — a pre-existing
 * infinite-render bug in its own `useEffect`), this file has no `useEffect`
 * of its own (grepped) and renders fine in jsdom.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: () => {} }),
}));

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { MaintenanceViewDialog } from "@/components/maintenance/maintenance-view-dialog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

const reservation = {
  id: 77,
  vehicleId: 1,
  customerId: null,
  driverId: null,
  type: "maintenance_block",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  maintenanceStatus: "in",
  maintenanceDuration: 2,
  notes: "regular_maintenance: test",
  portalRequestId: null,
};

const vehicle = { id: 1, brand: "Volkswagen", model: "Golf", licensePlate: "AB-123-C" };

function renderDialog() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes(`/api/reservations/${reservation.id}`)) return json(reservation);
      if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
      if (url.includes("/api/vehicles")) return json([vehicle]);
      if (url.includes("/api/documents/reservation")) return json([]);
      if (url.includes("/api/reservations")) return json([reservation]);
      return json([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <MaintenanceViewDialog open onOpenChange={() => {}} reservationId={reservation.id} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setUser(UserRole.USER, []); // no MANAGE_DOCUMENTS, no MANAGE_RESERVATIONS
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MaintenanceViewDialog — fix round 2, real-site proof", () => {
  it("a denied user clicking button-upload-photos does not open the upload dialog", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-upload-photos");
    expect(button).toHaveAttribute("aria-disabled", "true");

    // Same as a real click: the disabled button's pointer-events:none sends
    // the click to the wrapping span, which InlineDocumentUpload's own
    // ancestor <div onClick={() => setIsOpen(true)}> used to still receive.
    await userEvent.click(button, { pointerEventsCheck: 0 });

    // The upload dialog's own heading/file input must never appear.
    expect(screen.queryByLabelText(/Bestand/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /document uploaden/i })).not.toBeInTheDocument();
  });

  it("an allowed user (manage_documents) can still open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_DOCUMENTS]);
    renderDialog();
    const button = await screen.findByTestId("button-upload-photos");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

/**
 * 2026-09-21 review, item 2: `InvoiceScanner` sat ungated in this same
 * four-tile grid, the other three tiles already wrapped in
 * `RequiresPermission` — its action is `POST /api/expenses/scan`
 * (server/routes/expenses.ts, `hasPermission(UserPermission.MANAGE_EXPENSES)`),
 * so it now takes a gated `children` trigger the same way `InlineDocumentUpload`
 * already does. Same "real-site proof" shape as the upload-photos pair above.
 */
describe("MaintenanceViewDialog — button-scan-invoice follows manage_expenses (2026-09-21 review, item 2)", () => {
  it("a denied user clicking button-scan-invoice does not open the invoice scanner", async () => {
    renderDialog();
    const button = await screen.findByTestId("button-scan-invoice");
    expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(button, { pointerEventsCheck: 0 });

    expect(screen.queryByTestId("input-invoice-file")).not.toBeInTheDocument();
  });

  it("an allowed user (manage_expenses) can still open it", async () => {
    setUser(UserRole.USER, [UserPermission.MANAGE_EXPENSES]);
    renderDialog();
    const button = await screen.findByTestId("button-scan-invoice");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByTestId("input-invoice-file")).toBeInTheDocument();
    });
  });
});

/**
 * Sub-project C, Task 5 fix round 1: removing the spare of a rental deletes the spare's
 * reservation (DELETE /api/reservations/:id). Since Task 5 the server refuses that for a spare
 * that has been picked up - 409 PICKED_UP_CONFIRMATION_REQUIRED, or 403 PICKED_UP_RIGHT_REQUIRED
 * without the right - and this screen printed the English `message` raw. It now says in Dutch
 * what happened and where to go (Reserveringen has the warning and the right check); the client
 * branches on the stable `code`, never on the English words.
 */
describe("MaintenanceViewDialog - removing a spare that has been picked up", () => {
  const rental = {
    id: 40, vehicleId: 1, customerId: 5, driverId: null, type: "standard", status: "booked",
    startDate: "2026-10-01", endDate: "2026-10-09", spareAssignmentDecision: null, customer: { id: 5, name: "Jansen BV", phone: null },
  };
  const spare = {
    id: 41, vehicleId: 2, customerId: 5, driverId: null, type: "replacement", status: "picked_up",
    replacementForReservationId: 40, placeholderSpare: false, startDate: "2026-10-01", endDate: "2026-10-09",
  };
  let deleteResponse: Response;
  let deleteUrls: string[];

  function renderWithSpare() {
    deleteUrls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "DELETE") {
          deleteUrls.push(url);
          return deleteResponse;
        }
        if (url.endsWith(`/api/reservations/${reservation.id}`)) return json(reservation);
        // BUG-205 phase B: the dialog asks for this vehicle's rentals with filters (?type=...&vehicleId=...).
        if (url.endsWith("/api/reservations") || url.includes("/api/reservations?")) return json([reservation, rental, spare]);
        if (url.endsWith("/api/vehicles")) return json([vehicle, { id: 2, brand: "Opel", model: "Corsa", licensePlate: "ZZ-999-Z" }]);
        if (url.includes(`/api/vehicles/${vehicle.id}`)) return json(vehicle);
        return json([]);
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <MaintenanceViewDialog open onOpenChange={() => {}} reservationId={reservation.id} />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
  }

  async function removeTheSpare() {
    setUser(UserRole.USER, [UserPermission.MANAGE_RESERVATIONS]);
    renderWithSpare();
    await userEvent.click(await screen.findByTestId(`button-edit-spare-${rental.id}`));
    await userEvent.click(await screen.findByTestId(`button-spare-own-transport-${rental.id}`));
    await waitFor(() => expect(deleteUrls).toHaveLength(1));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    return toastSpy.mock.calls[0][0] as { title: string; description: string; variant?: string };
  }

  beforeEach(() => toastSpy.mockClear());

  it("a 409 PICKED_UP_CONFIRMATION_REQUIRED tells in Dutch to cancel or delete it via Reserveringen", async () => {
    deleteResponse = json({
      message: "This rental has already been picked up. Resend with confirmPickedUp: true to cancel or delete it.",
      code: "PICKED_UP_CONFIRMATION_REQUIRED", actualPickupDate: "2026-10-02", contractNumber: "9300002",
    }, 409);
    const toast = await removeTheSpare();
    expect(deleteUrls[0]).toMatch(/\/api\/reservations\/41$/);
    expect(toast.variant).toBe("destructive");
    expect(toast.description).toMatch(/al opgehaald/);
    expect(toast.description).toMatch(/Reserveringen/);
    expect(toast.description).not.toMatch(/confirmPickedUp|Resend|\d{3}:/);
  });

  // Fix round 2: the 409 sentence promises "the warning, and you confirm it in Reserveringen" - true only
  // for an account that HOLDS the right. Without it (403) Reserveringen would refuse too, so this account
  // is told which right is missing, with the sentence the cancel dialogs use.
  it("a 403 PICKED_UP_RIGHT_REQUIRED names the missing right in Dutch instead of sending the account to Reserveringen", async () => {
    deleteResponse = json({
      message: "Not authorized. One of these permissions required: cancel_picked_up_rental",
      code: "PICKED_UP_RIGHT_REQUIRED", requiredPermission: "cancel_picked_up_rental",
    }, 403);
    const toast = await removeTheSpare();
    expect(toast.variant).toBe("destructive");
    expect(toast.description).toBe("Voor een opgehaalde huur is het recht 'Opgehaalde huur annuleren of verwijderen' nodig.");
    expect(toast.description).not.toMatch(/Not authorized|Reserveringen/);
  });

  it("the same English words under another code are not mistaken for it: a 409 gets the Dutch conflict sentence", async () => {
    deleteResponse = json({ message: "This rental has already been picked up. Resend with confirmPickedUp: true", code: "SOMETHING_ELSE" }, 409);
    const toast = await removeTheSpare();
    expect(toast.description).toBe("Het vervangende voertuig is intussen gewijzigd of niet meer beschikbaar. Vernieuw het scherm en probeer het opnieuw.");
    expect(toast.description).not.toMatch(/confirmPickedUp|Resend/);
  });

  // Final wave, item 15: a failure that is none of the picked-up refusals is told by its HTTP status in
  // Dutch - the server's own sentence is English and technical, and the client never matches on it.
  it.each([
    [403, "Not authorized. One of these permissions required: manage_reservations", "Je hebt geen toestemming om het vervangende voertuig te wijzigen."],
    [404, "Reservation not found", "Deze reservering bestaat niet meer. Vernieuw het scherm en probeer het opnieuw."],
    [409, "The reservation was changed by someone else", "Het vervangende voertuig is intussen gewijzigd of niet meer beschikbaar. Vernieuw het scherm en probeer het opnieuw."],
    [500, "Failed to delete reservation", "De server meldt een fout. Probeer het over een moment opnieuw."],
  ])("%s without a picked-up code: the toast says the Dutch sentence, not the server's text", async (status, english, dutch) => {
    deleteResponse = json({ message: english }, status);
    const toast = await removeTheSpare();
    expect(toast.variant).toBe("destructive");
    expect(toast.description).toBe(dutch);
    expect(toast.description).not.toContain(english);
  });

  it("any other status (here 400) gets the generic 'bijwerken mislukt' sentence, never the raw message", async () => {
    deleteResponse = json({ message: "Invalid reservation ID" }, 400);
    const toast = await removeTheSpare();
    expect(toast.description).toBe("Vervangend voertuig bijwerken mislukt");
  });

  it("has the four status sentences in both languages", async () => {
    const nl = (await import("@/locales/nl/maintenance.json")).default as any;
    const en = (await import("@/locales/en/maintenance.json")).default as any;
    for (const key of ["spareForbidden", "spareNotFound", "spareConflict", "spareServerError"]) {
      expect(nl.viewDialog[key], `nl ${key}`).toEqual(expect.any(String));
      expect(en.viewDialog[key], `en ${key}`).toEqual(expect.any(String));
    }
  });
});

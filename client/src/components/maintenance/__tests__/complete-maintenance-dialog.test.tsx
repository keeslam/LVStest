/**
 * B-37 - the completion dialog sends ONE request.
 *
 * It used to upload the APK form to `POST /api/documents` (needs
 * manage_documents), patch the vehicle with `PATCH /api/vehicles/:id` (needs
 * manage_vehicles) and only then call the completion, so a failure halfway left
 * the upload and the vehicle changes behind. Now everything goes to
 * `POST /api/reservations/:id/complete-maintenance` - multipart when a file is
 * chosen, JSON otherwise - and the server writes it in one transaction.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: () => {} }),
}));

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { CompleteMaintenanceDialog } from "@/components/maintenance/complete-maintenance-dialog";

const block = {
  id: 501,
  vehicleId: 7,
  type: "maintenance_block",
  status: "booked",
  startDate: "2026-11-02",
  endDate: null,
  maintenanceStatus: "in",
  notes: "regular_maintenance: jaarlijkse beurt",
  customerId: null,
} as any;

const vehicle = {
  id: 7, brand: "Volkswagen", model: "Crafter", licensePlate: "AB-123-C", currentMileage: 40000, apkDate: "2026-12-01",
} as any;

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }
let calls: Call[];
let answer: () => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  toastSpy.mockClear();
  role = UserRole.USER;
  permissions = [UserPermission.MANAGE_MAINTENANCE];
  answer = () => json({ block: { id: 501 }, vehicle: { id: 7 }, spareReservation: null, documentId: null });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return answer();
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof CompleteMaintenanceDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onCompleted = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompleteMaintenanceDialog
        open
        onOpenChange={onOpenChange}
        block={block}
        vehicle={vehicle}
        initialApkDate="2027-11-02"
        initialMileage="40000"
        onCompleted={onCompleted}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onCompleted };
}

const completionCalls = () => calls.filter((c) => c.url.includes("/complete-maintenance"));

describe("CompleteMaintenanceDialog - one request", () => {
  it("with a file: ONE multipart request, no upload to /api/documents and no patch of the vehicle", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onCompleted } = renderDialog();

    await user.clear(screen.getByTestId("input-current-mileage"));
    await user.type(screen.getByTestId("input-current-mileage"), "41250");
    const file = new File(["%PDF-1.4 test"], "apk-keuring.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("input-apk-form"), file);
    await user.click(screen.getByTestId("button-complete-maintenance"));

    await waitFor(() => expect(onCompleted).toHaveBeenCalled());

    // One request in total - not three.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/api/reservations/501/complete-maintenance");
    expect(calls.some((c) => c.url.includes("/api/documents"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/api/vehicles"))).toBe(false);

    const form = calls[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("completionDate")).toBe("2026-11-02");
    expect(form.get("apkDate")).toBe("2027-11-02");
    expect(form.get("currentMileage")).toBe("41250");
    expect(form.get("maintenanceCategory")).toBe("scheduled_maintenance");
    expect(form.get("notes")).toBe("regular_maintenance: jaarlijkse beurt");
    const sent = form.get("apkFile") as File;
    expect(sent.name).toBe("apk-keuring.pdf");
    // The browser sets the multipart boundary itself.
    expect(Object.keys(calls[0].headers).map((h) => h.toLowerCase())).not.toContain("content-type");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Onderhoud afgerond" }));
  });

  it("without a file: ONE JSON request with the same fields", async () => {
    const user = userEvent.setup();
    const { onCompleted } = renderDialog();

    await user.type(screen.getByTestId("textarea-maintenance-details"), "Olie ververst");
    await user.click(screen.getByTestId("button-complete-maintenance"));

    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/reservations/501/complete-maintenance");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      completionDate: "2026-11-02",
      maintenanceCategory: "scheduled_maintenance",
      notes: "regular_maintenance:\nOlie ververst",
      apkDate: "2027-11-02",
      currentMileage: 40000,
    });
  });

  it("leaves the APK date and the mileage out of the request when their fields are empty", async () => {
    const user = userEvent.setup();
    const { onCompleted } = renderDialog({ initialApkDate: "", initialMileage: "" });

    await user.click(screen.getByTestId("button-complete-maintenance"));

    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    const body = JSON.parse(calls[0].body as string);
    expect(body).not.toHaveProperty("apkDate");
    expect(body).not.toHaveProperty("currentMileage");
  });

  it("a mileage lower than the vehicle's says so, keeps the dialog open and sent just that one request", async () => {
    const user = userEvent.setup();
    answer = () => json({
      message: "The mileage is lower than the vehicle's current reading.",
      code: "MILEAGE_LOWER_THAN_CURRENT", current: 40000, given: 39000,
    }, 400);
    const { onOpenChange, onCompleted } = renderDialog();

    await user.clear(screen.getByTestId("input-current-mileage"));
    await user.type(screen.getByTestId("input-current-mileage"), "39000");
    await user.click(screen.getByTestId("button-complete-maintenance"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls[0][0];
    expect(toast.variant).toBe("destructive");
    // The numbers the server compared, in the user's own language.
    expect(toast.description).toContain("39.000");
    expect(toast.description).toContain("40.000");

    expect(calls).toHaveLength(1);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("any other failure is the one generic message; nothing else was called", async () => {
    const user = userEvent.setup();
    answer = () => json({ message: "Failed to finish the maintenance" }, 500);
    const { onCompleted } = renderDialog();

    await user.click(screen.getByTestId("button-complete-maintenance"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0].description).toBe("Onderhoud afronden mislukt. Probeer het opnieuw.");
    expect(calls).toHaveLength(1);
    expect(onCompleted).not.toHaveBeenCalled();
  });
});

describe("CompleteMaintenanceDialog - rights", () => {
  it("manage_reservations alone is enough, like the endpoint", async () => {
    permissions = [UserPermission.MANAGE_RESERVATIONS];
    renderDialog();
    expect(screen.getByTestId("button-complete-maintenance")).toBeEnabled();
  });

  it("an account with neither right sees the button switched off and cannot send anything", async () => {
    const user = userEvent.setup();
    permissions = [UserPermission.VIEW_RESERVATIONS];
    renderDialog();

    const button = screen.getByTestId("button-complete-maintenance");
    expect(button).toBeDisabled();
    await user.click(button);
    expect(calls).toHaveLength(0);
  });

  it("role admin always passes", () => {
    role = UserRole.ADMIN;
    permissions = [];
    renderDialog();
    expect(screen.getByTestId("button-complete-maintenance")).toBeEnabled();
  });
});

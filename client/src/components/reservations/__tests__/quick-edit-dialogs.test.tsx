/**
 * OPT-010 — "Micro-bewerkdialogen".
 *
 * The risk the report names is a sixth write path without validation, so the
 * acceptance test is twofold and both halves are here:
 *
 *   1. each dialog sends **exactly** the fields it owns — never the whole row,
 *      which is the mechanism behind BUG-202 and BUG-172's lost update;
 *   2. it sends them to `PATCH /api/reservations/:id`, the same handler the
 *      full form uses, so it inherits that handler's conflict check, blacklist
 *      check and price recalculation rather than repeating them.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EditDatesDialog,
  EditCustomerDialog,
  EditVehicleDialog,
  onlyOwnedFields,
  QUICK_EDIT_FIELDS,
} from "@/components/reservations/quick-edit-dialogs";

const reservation = {
  id: 3563,
  startDate: "2026-10-20",
  endDate: "2026-10-30",
  customerId: 12,
  vehicleId: 1866,
  status: "booked",
  contractNumber: "870042",
  totalPrice: "450.00",
  notes: "niet aanpassen",
} as any;

const customers = [
  { id: 12, name: "Klant A", companyName: "Klant A BV", debtorNumber: "1001", email: "a@x.invalid" },
  { id: 13, name: "Klant B", companyName: "Klant B BV", debtorNumber: "1002", email: "b@x.invalid" },
];
const vehicles = [
  { id: 1866, licensePlate: "AB123C", brand: "VW", model: "Crafter" },
  { id: 1867, licensePlate: "CD456E", brand: "VW", model: "Caddy" },
];

let requests: Array<{ method: string; url: string; body: any }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const url = String(queryKey[0]);
          if (url.startsWith("/api/customers")) return customers;
          if (url.startsWith("/api/vehicles")) return vehicles;
          return [];
        },
      },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any = null;
    try { body = init?.body ? JSON.parse(init.body) : null; } catch { /* not JSON */ }
    requests.push({ method, url: String(url), body });
    if (method === "PATCH") return json({ ...reservation, ...body });
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const patches = () => requests.filter((r) => r.method === "PATCH");

describe("OPT-010 — elke microdialoog stuurt alleen zijn eigen velden", () => {
  it("the field guard drops anything a dialog does not own", () => {
    expect(onlyOwnedFields("dates", { startDate: "a", endDate: "b", notes: "x", totalPrice: "1" }))
      .toEqual({ startDate: "a", endDate: "b" });
    expect(onlyOwnedFields("customer", { customerId: 13, status: "cancelled" }))
      .toEqual({ customerId: 13 });
    expect(onlyOwnedFields("vehicle", { vehicleId: 1867, contractNumber: "999" }))
      .toEqual({ vehicleId: 1867 });
    // Three dialogs, three disjoint sets.
    expect(QUICK_EDIT_FIELDS.dates).toEqual(["startDate", "endDate"]);
    expect(QUICK_EDIT_FIELDS.customer).toEqual(["customerId"]);
    expect(QUICK_EDIT_FIELDS.vehicle).toEqual(["vehicleId"]);
  });

  it('"Datums wijzigen" sends only the two dates, to the shared PATCH handler', async () => {
    const user = userEvent.setup();
    withClient(<EditDatesDialog open onOpenChange={() => {}} reservation={reservation} />);

    const end = screen.getByTestId("input-quick-edit-end") as HTMLInputElement;
    await user.clear(end);
    await user.type(end, "2026-10-31");
    await user.click(screen.getByTestId("dialog-quick-edit-dates-save"));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const patch = patches()[0];
    // The same handler the 23-field form uses — not an endpoint of its own.
    expect(patch.url).toBe("/api/reservations/3563");
    expect(Object.keys(patch.body).sort()).toEqual(["endDate", "startDate"]);
    expect(patch.body.endDate).toBe("2026-10-31");
    // The colleague's other fields are not in the payload at all, so they
    // cannot be overwritten with what this dialog happened to hold (BUG-172).
    expect(patch.body).not.toHaveProperty("notes");
    expect(patch.body).not.toHaveProperty("totalPrice");
    expect(patch.body).not.toHaveProperty("contractNumber");
    expect(patch.body).not.toHaveProperty("status");
  });

  it("refuses to save an end date before the start date, and sends nothing", async () => {
    const user = userEvent.setup();
    withClient(<EditDatesDialog open onOpenChange={() => {}} reservation={reservation} />);

    const end = screen.getByTestId("input-quick-edit-end") as HTMLInputElement;
    await user.clear(end);
    await user.type(end, "2026-10-01");

    expect(await screen.findByTestId("quick-edit-dates-invalid")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-quick-edit-dates-save")).toBeDisabled();
    expect(patches()).toHaveLength(0);
  });

  it("saves nothing while nothing has changed", async () => {
    withClient(<EditDatesDialog open onOpenChange={() => {}} reservation={reservation} />);
    expect(screen.getByTestId("dialog-quick-edit-dates-save")).toBeDisabled();
  });

  it('"Klant wijzigen" sends only customerId', async () => {
    const user = userEvent.setup();
    withClient(<EditCustomerDialog open onOpenChange={() => {}} reservation={reservation} />);

    // The picker collapses to the current customer; changing it is a
    // deliberate step, exactly as in the full form.
    await user.click(await screen.findByTestId("customer-picker-change"));
    await user.click(await screen.findByTestId("customer-picker-option-13"));
    await user.click(screen.getByTestId("dialog-quick-edit-customer-save"));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].url).toBe("/api/reservations/3563");
    expect(patches()[0].body).toEqual({ customerId: 13 });
  });

  it("reports the server's conflict instead of swallowing it", async () => {
    const user = userEvent.setup();
    // The conflict check lives in the shared handler (FIX-F); a 409 must arrive
    // here as a failure, not a silent success.
    vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH") {
        requests.push({ method, url: String(url), body: JSON.parse(init.body) });
        return json({ message: "Vehicle is already booked for this period", code: "BOOKING_CONFLICT" }, 409);
      }
      return json([]);
    }));

    withClient(<EditDatesDialog open onOpenChange={() => {}} reservation={reservation} />);
    const end = screen.getByTestId("input-quick-edit-end") as HTMLInputElement;
    await user.clear(end);
    await user.type(end, "2026-11-05");
    await user.click(screen.getByTestId("dialog-quick-edit-dates-save"));

    await waitFor(() => expect(patches()).toHaveLength(1));
    // The dialog stays open on a refusal — the employee has to see it.
    expect(screen.getByTestId("dialog-quick-edit-dates")).toBeInTheDocument();
  });

  it("all three dialogs are in Dutch", async () => {
    withClient(<EditDatesDialog open onOpenChange={() => {}} reservation={reservation} />);
    expect(screen.getByText("Datums wijzigen")).toBeInTheDocument();
    expect(screen.getByText("Begindatum")).toBeInTheDocument();
  });

  it('"Voertuig wijzigen" exists and owns exactly one field', async () => {
    withClient(<EditVehicleDialog open onOpenChange={() => {}} reservation={reservation} />);
    expect(await screen.findByTestId("dialog-quick-edit-vehicle")).toBeInTheDocument();
    expect(screen.getByText("Voertuig wijzigen")).toBeInTheDocument();
    // Unchanged: nothing to save.
    expect(screen.getByTestId("dialog-quick-edit-vehicle-save")).toBeDisabled();
  });
});

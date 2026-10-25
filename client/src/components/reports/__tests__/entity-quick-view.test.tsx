/**
 * Rapporten herontwerp deel 1b, Task 3: a plate, customer, reservation, fine or invoice in a report
 * list opens a quick view with the main facts, with "Openen in nieuw tabblad" to the full record.
 * Without the right for that kind of record the name stays plain text. Km only for the admin.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission } from "@shared/schema";

const auth = vi.hoisted(() => ({ user: { id: 1, username: "kees", role: "admin", permissions: [] as string[], hidePrices: false } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user, isLoading: false }) }));

import { EntityLink, entityUrl } from "@/components/reports/entity-link";
import { CustomerValueReportCard } from "@/pages/reports/customer-value-report-card";
import { FinesReportCard } from "@/pages/reports/fines-report-card";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pathOf = (input: unknown) => (typeof input === "string" ? input : (input as Request)?.url ?? "").replace(/^https?:\/\/[^/]+/, "");

const VEHICLE = { id: 7, licensePlate: "AB12CD", brand: "Ford", model: "Transit", apkDate: "2027-03-01", currentMileage: 123456 };
const CUSTOMER = { id: 4, name: "Bakkerij Jansen", email: "info@jansen.nl", phone: "0612345678", address: "Dorpsstraat 1", city: "Zuidland" };

let routes: Record<string, () => Response>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  auth.user = { id: 1, username: "kees", role: "admin", permissions: [], hidePrices: false };
  routes = {
    "/api/vehicles/7": () => json(VEHICLE),
    "/api/reservations/vehicle/7": () => json([
      { id: 30, status: "returned", type: "rental", customer: { id: 2, name: "Oud BV" } },
      { id: 31, status: "picked_up", type: "rental", customer: { id: 4, name: "Bakkerij Jansen" } },
    ]),
    "/api/customers/4": () => json(CUSTOMER),
    "/api/reservations/customer/4": () => json([{ id: 1 }, { id: 2 }, { id: 3 }]),
    "/api/vehicles/8": () => json({ message: "Vehicle not found" }, 404),
  };
  fetchMock = vi.fn(async (input: unknown) => {
    const route = routes[pathOf(input).split("?")[0]];
    return route ? route() : json({ message: "nope" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("open", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("EntityLink and the quick view", () => {
  it("for the admin: a button that opens the vehicle quick view with plate, make and km", async () => {
    mount(<EntityLink kind="vehicle" id={7} label="AB-12-CD" />);
    await userEvent.click(screen.getByRole("button", { name: "AB-12-CD" }));
    const dialog = await screen.findByTestId("dialog-entity-vehicle");
    expect(await within(dialog).findByText("Ford Transit")).toBeInTheDocument();
    expect(within(dialog).getByTestId("entity-field-licensePlate")).toHaveTextContent("AB-12-CD");
    expect(within(dialog).getByTestId("entity-field-mileage")).toHaveTextContent("123.456");
    expect(await within(dialog).findByText("Bakkerij Jansen")).toBeInTheDocument();
  });

  it("on a phone a field is one column (label above value); two columns from sm", async () => {
    mount(<EntityLink kind="vehicle" id={7} label="AB-12-CD" />);
    await userEvent.click(screen.getByRole("button", { name: "AB-12-CD" }));
    const dialog = await screen.findByTestId("dialog-entity-vehicle");
    const field = await within(dialog).findByTestId("entity-field-licensePlate");
    const classes = field.className.split(" ");
    expect(classes).toContain("grid-cols-1");
    expect(classes).toContain("sm:grid-cols-[10rem_1fr]");
    expect(classes).not.toContain("grid-cols-[10rem_1fr]");
  });

  it("Openen in nieuw tabblad opens the full record in a new tab", async () => {
    mount(<EntityLink kind="vehicle" id={7} label="AB-12-CD" />);
    await userEvent.click(screen.getByRole("button", { name: "AB-12-CD" }));
    const dialog = await screen.findByTestId("dialog-entity-vehicle");
    await within(dialog).findByText("Ford Transit");
    const open = within(dialog).getByTestId("button-entity-open");
    expect(open).toHaveTextContent("Openen in nieuw tabblad");
    await userEvent.click(open);
    expect(window.open).toHaveBeenCalledWith("/vehicles?vehicle=7", "_blank", "noopener");
  });

  it("without the vehicle right: plain text, no button, no request", () => {
    auth.user = { id: 2, username: "anna", role: "user", permissions: [UserPermission.VIEW_REPORTS], hidePrices: false };
    mount(<EntityLink kind="vehicle" id={7} label="AB-12-CD" />);
    expect(screen.getByText("AB-12-CD")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without an id: plain text", () => {
    mount(<EntityLink kind="customer" id={null} label="Onbekend" />);
    expect(screen.getByText("Onbekend")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("km reading is not shown to someone who is not admin", async () => {
    auth.user = { id: 2, username: "anna", role: "user", permissions: [UserPermission.VIEW_VEHICLES], hidePrices: false };
    mount(<EntityLink kind="vehicle" id={7} label="AB-12-CD" />);
    await userEvent.click(screen.getByRole("button", { name: "AB-12-CD" }));
    const dialog = await screen.findByTestId("dialog-entity-vehicle");
    await within(dialog).findByText("Ford Transit");
    expect(within(dialog).queryByTestId("entity-field-mileage")).toBeNull();
    expect(within(dialog).queryByText(/123\.456/)).toBeNull();
    // No reservation right: the current renter is not asked for.
    expect(fetchMock.mock.calls.map(([i]) => pathOf(i))).not.toContain("/api/reservations/vehicle/7");
  });

  it("a record that is gone says so", async () => {
    mount(<EntityLink kind="vehicle" id={8} label="ZZ-99-ZZ" />);
    await userEvent.click(screen.getByRole("button", { name: "ZZ-99-ZZ" }));
    const dialog = await screen.findByTestId("dialog-entity-vehicle");
    expect(await within(dialog).findByText("Niet gevonden of verwijderd.")).toBeInTheDocument();
  });

  it("the customer quick view shows contact details and the number of reservations", async () => {
    mount(<EntityLink kind="customer" id={4} label="Bakkerij Jansen" />);
    await userEvent.click(screen.getByRole("button", { name: "Bakkerij Jansen" }));
    const dialog = await screen.findByTestId("dialog-entity-customer");
    expect(await within(dialog).findByText("info@jansen.nl")).toBeInTheDocument();
    expect(await within(dialog).findByTestId("entity-field-reservations")).toHaveTextContent("3");
    await userEvent.click(within(dialog).getByTestId("button-entity-open"));
    expect(window.open).toHaveBeenCalledWith("/customers?customer=4", "_blank", "noopener");
  });

  it("a top-10 bar of customer value opens that customer's quick view (with the customer right only)", async () => {
    routes["/api/reports/customer-value/summary"] = () => json({
      tiles: Object.fromEntries(["revenue", "costs", "late", "cancelled", "requests"].map((k) => [k, { count: 1, amount: 1 }])),
      topRevenue: [{ key: 4, label: "Bakkerij Jansen", count: 2, amount: 1000 }],
      topCosts: [],
    });
    const { unmount } = mount(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    const chart = await screen.findByTestId("customer-value-top-revenue");
    await waitFor(() => expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0));
    fireEvent.click(chart.querySelectorAll(".recharts-bar-rectangle")[0]);
    const dialog = await screen.findByTestId("dialog-entity-customer");
    expect(await within(dialog).findByText("info@jansen.nl")).toBeInTheDocument();
    unmount();

    auth.user = { id: 2, username: "anna", role: "user", permissions: [UserPermission.VIEW_REPORTS], hidePrices: false };
    mount(<CustomerValueReportCard from="2026-01-01" to="2026-12-31" />);
    const plain = await screen.findByTestId("customer-value-top-revenue");
    await waitFor(() => expect(plain.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0));
    fireEvent.click(plain.querySelectorAll(".recharts-bar-rectangle")[0]);
    expect(screen.queryByTestId("dialog-entity-customer")).toBeNull();
  });

  it("a report list links its plate, fine and customer", async () => {
    routes["/api/reports/fines/summary"] = () => json({
      tiles: Object.fromEntries(["new", "linked", "cancelled", "legacy", "total"].map((k) => [k, { count: 1, amount: 90 }])),
      avgDaysToLink: null, byMonth: [], byCustomer: [], byVehicle: [], byDriver: [],
    });
    routes["/api/reports/fines/rows"] = () => json({
      rows: [{
        id: 5, offenceAt: "2026-04-02T10:00:00.000Z", receivedAt: null, licensePlate: "AB12CD", vehicleId: 7, description: "Te hard",
        reference: null, status: "linked", amount: 90, customerId: 4, customerName: "Bakkerij Jansen", driverId: 9, driverName: "Piet Bestuurder", linkedAt: null,
      }],
      total: 1, page: 1, pageSize: 50,
    });
    mount(<FinesReportCard from="2026-01-01" to="2026-12-31" />);
    await userEvent.click(await screen.findByTestId("button-fines-tile-total"));
    const dialog = await screen.findByTestId("dialog-fines-report");
    expect(await within(dialog).findByTestId("link-entity-vehicle-7")).toHaveTextContent("AB-12-CD");
    expect(within(dialog).getByTestId("link-entity-fine-5")).toHaveTextContent("Te hard");
    expect(within(dialog).getByTestId("link-entity-customer-4")).toHaveTextContent("Bakkerij Jansen");
    expect(within(dialog).getByTestId("link-entity-driver-9")).toHaveTextContent("Piet Bestuurder");

    await userEvent.click(within(dialog).getByTestId("link-entity-fine-5"));
    expect(await screen.findByTestId("dialog-entity-fine")).toBeInTheDocument();
  });

  it("the driver quick view opens the customer on that driver", async () => {
    routes["/api/drivers/9"] = () => json({ id: 9, customerId: 4, displayName: "Piet Bestuurder", email: "piet@jansen.nl", phone: null });
    mount(<EntityLink kind="driver" id={9} label="Piet Bestuurder" />);
    await userEvent.click(screen.getByRole("button", { name: "Piet Bestuurder" }));
    const dialog = await screen.findByTestId("dialog-entity-driver");
    expect(await within(dialog).findByText("piet@jansen.nl")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByTestId("button-entity-open"));
    expect(window.open).toHaveBeenCalledWith("/customers?customer=4&tab=drivers&driver=9", "_blank", "noopener");
  });

  it("every kind has its own address", () => {
    expect(entityUrl("vehicle", 7)).toBe("/vehicles?vehicle=7");
    expect(entityUrl("customer", 4)).toBe("/customers?customer=4");
    expect(entityUrl("reservation", 12)).toBe("/reservations?reservation=12");
    expect(entityUrl("fine", 5)).toBe("/fines?bekeuring=5");
    expect(entityUrl("invoice", 9)).toBe("/expenses?invoice=9");
    expect(entityUrl("driver", 9, 4)).toBe("/customers?customer=4&tab=drivers&driver=9");
    expect(entityUrl("driver", 9)).toBeNull();
  });
});

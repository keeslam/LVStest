/**
 * Onderhoudsanalyse taak 1: the cost form has a Leverancier field with suggestions from
 * GET /api/expenses/suppliers and sends the typed name as `supplier`.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [UserPermission.MANAGE_EXPENSES, UserPermission.VIEW_VEHICLES] },
    isLoading: false,
  }),
}));

import { ExpenseForm } from "@/components/expenses/expense-form";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
const VEHICLES = [{ id: 7, licensePlate: "AB12CD", brand: "Ford", model: "Transit", vehicleType: "Van" }];

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (init?.method === "POST") return json({ id: 99, vehicleId: 7, category: "maintenance" }, 201);
    if (url.includes("/api/expenses/suppliers")) return json(["Aalbers BV", "Garage Jansen"]);
    return json(url.includes("/api/vehicles") ? VEHICLES : []);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderForm(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/expenses", record: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const postedBodies = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("expense form: Leverancier", () => {
  it("offers the known suppliers as suggestions and sends the typed name", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(<ExpenseForm preselectedVehicleId={7} />);

    const field = await screen.findByLabelText("Leverancier");
    await waitFor(() => expect(container.querySelectorAll("datalist option")).toHaveLength(2));
    const listId = field.getAttribute("list");
    expect(listId).toBeTruthy();
    expect(container.querySelector(`datalist#${listId}`)).not.toBeNull();
    expect(Array.from(container.querySelectorAll("datalist option")).map((o) => o.getAttribute("value"))).toEqual(["Aalbers BV", "Garage Jansen"]);

    await user.click(await screen.findByRole("combobox", { name: /categorie/i }));
    await user.click(await screen.findByRole("option", { name: "Onderhoud" }));
    await user.clear(screen.getByLabelText(/bedrag/i));
    await user.type(screen.getByLabelText(/bedrag/i), "40");
    await user.type(field, "Garage Jansen");
    await user.click(screen.getByRole("button", { name: "Kosten registreren" }));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0]).toMatchObject({ vehicleId: 7, category: "maintenance", amount: 40, supplier: "Garage Jansen" });
  });

  it("after saving, the supplier list is fetched again so a new name is suggested next time", async () => {
    const user = userEvent.setup();
    queryClient.clear();
    const { hook } = memoryLocation({ path: "/expenses", record: true });
    render(
      <QueryClientProvider client={queryClient}>
        <GlobalDialogProvider>
          <Router hook={hook}><ExpenseForm preselectedVehicleId={7} onSuccess={() => {}} /></Router>
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );
    const supplierCalls = () => fetchMock.mock.calls.filter(([input]) => String(typeof input === "string" ? input : (input as Request).url).includes("/api/expenses/suppliers")).length;
    const field = await screen.findByLabelText("Leverancier");
    await waitFor(() => expect(supplierCalls()).toBe(1));
    await user.click(await screen.findByRole("combobox", { name: /categorie/i }));
    await user.click(await screen.findByRole("option", { name: "Onderhoud" }));
    await user.clear(screen.getByLabelText(/bedrag/i));
    await user.type(screen.getByLabelText(/bedrag/i), "40");
    await user.type(field, "Nieuwe Garage");
    await user.click(screen.getByRole("button", { name: "Kosten registreren" }));
    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    await waitFor(() => expect(supplierCalls()).toBe(2));
    queryClient.clear();
  });
});

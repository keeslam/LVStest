/**
 * Audit package P1 (Kosten): A-9-2 (toll and parking can be chosen, as the
 * canonical lower-case key), A-9-5 (the form says the vehicle is required, in
 * Dutch, and refuses to submit without one) and A-9-7 (the dashboard, the
 * Kosten page and the old /expenses/add route all open the same dialog).
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [UserPermission.MANAGE_EXPENSES, UserPermission.VIEW_VEHICLES] },
    isLoading: false,
  }),
}));

import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import ExpenseAddPage from "@/pages/expenses/add";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
const VEHICLES = [{ id: 7, licensePlate: "AB12CD", brand: "Ford", model: "Transit", vehicleType: "Van" }];

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (init?.method === "POST") return json({ id: 99, vehicleId: 7, category: "toll" }, 201);
    return json(url.includes("/api/vehicles") ? VEHICLES : []);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string, node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook, history } = memoryLocation({ path, record: true });
  const utils = render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>{node}</Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
  return { ...utils, history };
}

const postedBodies = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("expense form: categories (A-9-2)", () => {
  it("offers Tol and Parkeren next to the old categories, and sends the lower-case key", async () => {
    const user = userEvent.setup();
    renderAt("/expenses", <ExpenseForm preselectedVehicleId={7} />);

    await user.click(await screen.findByRole("combobox", { name: /categorie/i }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["Tol", "Parkeren", "Brandstof", "Onderhoud", "Overig"]));
    await user.click(screen.getByRole("option", { name: "Tol" }));

    await user.clear(screen.getByLabelText(/bedrag/i));
    await user.type(screen.getByLabelText(/bedrag/i), "12.5");
    await user.click(screen.getByRole("button", { name: "Kosten registreren" }));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0]).toMatchObject({ vehicleId: 7, category: "toll", amount: 12.5 });
  });
});

describe("expense form: the vehicle is required (A-9-5)", () => {
  it("says so up front and refuses to submit without one, in Dutch", async () => {
    const user = userEvent.setup();
    renderAt("/expenses", <ExpenseForm />);

    expect(await screen.findByText(/een voertuig is verplicht/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kosten registreren" }));

    expect(await screen.findByText("Kies een voertuig")).toBeInTheDocument();
    expect(screen.getByText("Kies een categorie")).toBeInTheDocument();
    expect(postedBodies()).toHaveLength(0);
  });
});

describe("one expense dialog (A-9-7)", () => {
  it("ExpenseAddDialog opens the same form the dashboard and the Kosten page use", async () => {
    const user = userEvent.setup();
    renderAt("/expenses", <ExpenseAddDialog><button data-testid="opener">Kosten registreren</button></ExpenseAddDialog>);
    await user.click(screen.getByTestId("opener"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Nieuwe kosten toevoegen");
    expect(dialog.querySelector("form")).not.toBeNull();
    expect(dialog).toHaveTextContent(/een voertuig is verplicht/i);
  });

  it("the old /expenses/add route still renders, as the same dialog, and a preselected category and vehicle survive the link", async () => {
    window.history.replaceState({}, "", "/expenses/add?vehicleId=7&category=Fuel");
    renderAt("/expenses/add", <ExpenseAddPage />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Nieuwe kosten toevoegen");
    expect(dialog.querySelector("form")).not.toBeNull();
    await waitFor(() => expect(dialog).toHaveTextContent("Brandstof"));
    window.history.replaceState({}, "", "/");
  });

  it("closing the dialog on the old route goes back to the Kosten list", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/expenses/add");
    const { history } = renderAt("/expenses/add", <ExpenseAddPage />);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(history[history.length - 1]).toBe("/expenses"));
  });
});

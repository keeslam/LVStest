/**
 * Audit A-9-8 (package P1): the Kosten page is one list of every expense with
 * filters for vehicle (by plate), period and category, a total for the shown
 * set, and a CSV export of that set. Also A-9-1/A-3-7: one row and one label
 * per category, in Dutch.
 *
 * The fetch mock answers GET /api/expenses the way the server does: it applies
 * vehicleId, from, to and category from the query string.
 *
 * 2026-10-19: since the rebuild of 74f066eb the page asks /api/expenses/facets
 * (picker choices), /api/expenses/summary (count, sum and the categories) and
 * pages /api/expenses; the stub answers all three like the server
 * (shared/expense-list.ts), and the rows are read from the table view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

const { authUser, downloadCsv } = vi.hoisted(() => ({
  authUser: { current: { id: 1, username: "kees", role: "user", permissions: [] as string[], hidePrices: false } },
  downloadCsv: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: authUser.current, isLoading: false }) }));
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), downloadCsv }));

import ExpensesIndex from "@/pages/expenses/index";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const VAN = { id: 1, licensePlate: "AB12CD", brand: "Ford", model: "Transit" };
const CAR = { id: 2, licensePlate: "XY99ZZ", brand: "Opel", model: "Corsa" };
const EXPENSES = [
  { id: 10, vehicleId: 1, vehicle: VAN, category: "fuel", amount: "50.00", date: "2026-09-02", description: "Tanken Rotterdam" },
  { id: 11, vehicleId: 1, vehicle: VAN, category: "toll", amount: "12.50", date: "2026-09-20", description: "Tol Kiltunnel" },
  { id: 12, vehicleId: 2, vehicle: CAR, category: "fuel", amount: "40.00", date: "2026-10-03", description: "Tanken Utrecht" },
  { id: 13, vehicleId: 2, vehicle: CAR, category: "parking", amount: "7.25", date: "2026-10-08", description: "Parkeren Schiphol" },
];

let calls: string[];

function serverAnswer(url: string) {
  const params = new URL(url, "http://localhost").searchParams;
  return EXPENSES.filter((e) =>
    (!params.get("vehicleId") || e.vehicleId === Number(params.get("vehicleId")))
    && (!params.get("category") || e.category === params.get("category"))
    && (!params.get("from") || e.date >= params.get("from")!)
    && (!params.get("to") || e.date <= params.get("to")!))
    // The server answers newest first by default (sort=date, dir=desc).
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
const cents = (rows: typeof EXPENSES) => rows.reduce((sum, e) => sum + Math.round(Number(e.amount) * 100), 0);

/** GET /api/expenses/summary: the selection's count and sum, and per category its count, sum and newest rows. */
function summaryAnswer(url: string) {
  const rows = serverAnswer(url);
  const groups = new Map<string, typeof EXPENSES>();
  for (const e of rows) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
  const byCategory = Array.from(groups.entries())
    .map(([category, items]) => ({ category, count: items.length, amount: cents(items) / 100, recent: items.slice(0, 5) }))
    .sort((a, b) => b.amount - a.amount);
  return { total: rows.length, totalAmount: cents(rows) / 100, byCategory };
}

/** GET /api/expenses: a page with page/pageSize, the whole selection without (as the CSV export asks). */
function listAnswer(url: string) {
  const params = new URL(url, "http://localhost").searchParams;
  const rows = serverAnswer(url);
  if (!params.has("page") && !params.has("pageSize")) return rows;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "50");
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, totalAmount: cents(rows) / 100, page, pageSize };
}

beforeEach(() => {
  calls = [];
  downloadCsv.mockReset();
  authUser.current = { id: 1, username: "kees", role: "user", permissions: [UserPermission.MANAGE_EXPENSES], hidePrices: false };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push(url);
    if (url.includes("/api/expenses/inbox/status")) return json({ enabled: false, running: false, lastRun: null, scheduledMinutes: null, reviewCount: 0, geminiConfigured: false });
    if (url.includes("/api/expenses/facets")) return json({ vehicles: [VAN, CAR], categories: ["fuel", "parking", "toll"] });
    if (url.includes("/api/expenses/summary")) return json(summaryAnswer(url));
    if (/\/api\/expenses(\?|$)/.test(url)) return json(listAnswer(url));
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** Mounts the page and switches to the table view, where every row of the selection is listed. */
async function mountTable() {
  const view = mount();
  await userEvent.click(await screen.findByTestId("button-view-table"));
  return view;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/expenses", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>
          <ExpensesIndex />
        </Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const rowIds = () => screen.queryAllByTestId(/^row-expense-\d+$/).map((r) => r.getAttribute("data-testid"));
const total = () => screen.getByTestId("expense-total").textContent;

describe("Kosten page (A-9-8)", () => {
  it("lists every expense, newest first, with Dutch category labels and one total", async () => {
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(rowIds()).toEqual(["row-expense-13", "row-expense-12", "row-expense-11", "row-expense-10"]);
    const first = screen.getByTestId("row-expense-13");
    expect(first).toHaveTextContent("Parkeren");
    expect(first).toHaveTextContent("XY-99-ZZ");
    // The table (rebuilt 2026-10-16) writes the short date on one line.
    expect(first).toHaveTextContent("08-10-2026");
    expect(first).toHaveTextContent("€ 7,25");
    expect(total()).toMatch(/109,75/);
    // One summary row per category key: fuel is one row, not two.
    expect(screen.getAllByTestId(/^summary-category-/)).toHaveLength(3);
    expect(screen.getByTestId("summary-category-fuel")).toHaveTextContent("Brandstof");
    expect(screen.getByTestId("summary-category-fuel")).toHaveTextContent("€ 90,00");
  });

  it("narrows the rows and the total by category", async () => {
    const user = userEvent.setup();
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));

    await user.click(screen.getByRole("combobox", { name: "Categorie" }));
    await user.click(await screen.findByRole("option", { name: "Tol" }));

    await waitFor(() => expect(rowIds()).toEqual(["row-expense-11"]));
    expect(total()).toMatch(/12,50/);
    expect(calls.some((u) => u.includes("category=toll"))).toBe(true);
  });

  it("narrows by period (from and to, inclusive)", async () => {
    const user = userEvent.setup();
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));

    await user.type(screen.getByLabelText("Van"), "2026-09-20");
    await user.type(screen.getByLabelText("Tot en met"), "2026-10-03");

    await waitFor(() => expect(rowIds()).toEqual(["row-expense-12", "row-expense-11"]));
    expect(total()).toMatch(/52,50/);
  });

  it("narrows by vehicle, found by its plate with or without dashes", async () => {
    const user = userEvent.setup();
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));

    await user.click(screen.getByRole("button", { name: "Alle voertuigen" }));
    await user.type(await screen.findByPlaceholderText("Zoek op kenteken..."), "xy99");
    // The picker is a popover: search and choose inside it (the table rows show the plate too).
    const picker = await screen.findByRole("dialog");
    await user.click(await within(picker).findByText("XY-99-ZZ", {}, { timeout: 2000 }));

    await waitFor(() => expect(rowIds()).toEqual(["row-expense-13", "row-expense-12"]));
    expect(total()).toMatch(/47,25/);
    expect(calls.some((u) => u.includes("vehicleId=2"))).toBe(true);
  });

  it("clears every filter again", async () => {
    const user = userEvent.setup();
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    await user.type(screen.getByLabelText("Van"), "2026-10-01");
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    await user.click(screen.getByTestId("button-clear-expense-filters"));
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(screen.queryByTestId("button-clear-expense-filters")).not.toBeInTheDocument();
  });

  it("exports exactly the shown selection with the shared CSV writer, in Dutch formats", async () => {
    const user = userEvent.setup();
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    await user.type(screen.getByLabelText("Van"), "2026-10-01");
    await waitFor(() => expect(rowIds()).toHaveLength(2));

    await user.click(screen.getByTestId("button-export-expenses"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [subject, header, rows] = downloadCsv.mock.calls[0];
    expect(subject).toBe("kosten");
    expect(header).toEqual(["Datum", "Kenteken", "Categorie", "Omschrijving", "Bedrag (excl. btw)"]);
    expect(rows).toEqual([
      ["08-10-2026", "XY-99-ZZ", "Parkeren", "Parkeren Schiphol", "7,25"],
      ["03-10-2026", "XY-99-ZZ", "Brandstof", "Tanken Utrecht", "40,00"],
    ]);
  });

  it("asks for no vehicle list: a profile with manage_expenses only gets no request it would be refused", async () => {
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(calls.some((u) => u.includes("/api/vehicles"))).toBe(false);
  });

  it("hides the CSV export for a profile that may not see prices", async () => {
    authUser.current = { ...authUser.current, hidePrices: true };
    await mountTable();
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(screen.queryByTestId("button-export-expenses")).not.toBeInTheDocument();
  });

  it("opens the one expense dialog from its button", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByTestId("button-record-expense"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Nieuwe kosten toevoegen")).toBeInTheDocument();
  });
});
